## 一句话

`basic-scanner` 不是"定时 select 一下"，而是一条**配置驱动的准 CDC 管道**：一行配置定义一个表/场景的扫描任务，游标 checkpoint 保进度，正扫做增量、倒扫做回填，Kafka 做事件总线，`@ScannerMessage` 做消费路由。

---

## 1. 为什么把扫表器独立出来

`basic-scanner/README.md` 写得很直接：

> 原：扫表的服务，独立出来服务，减少各个服务对于基础资源的依赖，降低服务的启动时间。

**解决什么问题**

- 业务服务不需要为了"监听某张表"而连一堆库、加一堆定时任务。
- 扫表器用独立只读数据源，和业务库隔离，避免业务服务启动变重。
- 多种扫描策略、同表不同场景的扫描优化，集中在一个服务里维护。
- 扫表失败/延迟不影响业务主链路；业务只消费事件。

**代价**

- 多一个服务要部署 / 监控。
- 消息是 **at-least-once（至少一次）**，消费方必须幂等。
- 扫表有延迟，不适合强实时场景。
- 不是 binlog，拿不到 update/delete 的 before/after，只能按行快照扫。

---

## 2. 配置模型：一行 ScannerSetting = 一条扫描管道

`scanner_setting` 一行就是一个扫描任务：

| 字段 | 作用 | 设计点 |
|---|---|---|
| `name` | 唯一键 / 消息 action 名 | 消费方按 action 路由 |
| `database` | 数据库白名单 | `basic` / `funbit` / `stats` / `live` / `family` |
| `table` | 要扫的表 | 只允许白名单库 |
| `column` | 监听主键 | 当前实现按 `id` 扫，字段保留 |
| `current` | 扫描进度 | 上次扫到的 id，`-1` 表示未开始 |
| `partition_key` | Kafka 消息 key | 决定分区 / 同实体顺序 |
| `direction` | 1 正序 / 2 倒序 | 增量 vs 回填 |
| `batch_size` | 每批条数 | 控制 DB 压力和消息批量 |
| `status` | 启用 / 停用 | 停用不参与调度 |

**设计亮点**

- 配置即管道：新增一张表/场景，不用写新的扫表代码，只加一行配置。
- `name` 同时是 action：消费方按业务语义订阅，不关心物理表。
- `current` 是 checkpoint：扫到哪存到哪，不依赖 Kafka offset。
- `partition_key` 把"同一实体"的消息送进同一分区，保证分区内有序。

---

## 3. 扫描执行：XXL-Job + 游标

### 正扫

```sql
SELECT * FROM `table`
WHERE id > {current}
ORDER BY id ASC
LIMIT {batchSize};
```

1. `getCurrentMaxID()` 先查当前最大 id，用于延迟告警。
2. 按 `id > current` 取一批。
3. 逐条 `producer.async(session, name, partitionKey, row)` 发 Kafka。
4. `current = 最后一条的 id`，更新 `scanner_setting.current`。
5. 如果 `maxid - current > batchSize * 10`，打 `tooManyDelay` 日志。

### 倒扫

```sql
SELECT * FROM `table`
WHERE id < {current}
ORDER BY id DESC
LIMIT {batchSize};
```

用于历史回填 / 反向补偿；和正扫共用 `scanner_setting`，靠 `direction` 区分。

**设计亮点**

- 批处理 + 游标：不是全表 select，每批只取 `batchSize`。
- 延迟可观测：`maxid - current` 直接反映扫表落后多少。
- 正反扫复用同一配置：回填不用另建任务模型。

**关键语义**

- 先发消息，再更新 checkpoint；如果发完消息、更新 checkpoint 前进程挂了，下一次会重复扫这一批 → **at-least-once**。
- 消费方必须按业务唯一键（order_no / trans_no / id）做幂等。
- `current` 是单游标；正扫/倒扫切换时要小心，不能同时跑同一张表。

---

## 4. 消息：Kafka + headers

`BasicScannerMessageProducer`：

- topic：`basic-scanner`；倒扫：`basic-reverse-scanner`。
- key：`partition_key` 的值，保证同一业务实体进同一分区。
- headers：`action` / `timestamp` / `trace` / `app` / `userID` / `locale`。
- `async()`：发送失败只记日志，不抛异常，内部重试 5 次，间隔 300ms。
- `sync()`：发送失败抛 `RException`，用于不能丢的场景。
- `timeout` 默认 300ms。

**设计亮点**

- 消息里带 `trace` / `app` / `locale`，消费方可以还原 **Session（会话上下文）**，日志和业务逻辑都能按用户 / 大区处理。
- `action` 是路由键：消费方按 action 找方法，不是按 topic 盲目消费。
- sync/async 两档：关键链路同步，普通链路异步。

**坑**

- async 重试 5 次仍失败只记日志，消息可能丢；关键链路要用 sync 或消费方对账。
- 重试可能产生重复消息；消费方幂等是前提。

---

## 5. 消费：@ScannerMessage 注解

```java
@ScannerMessage(
  action = "funbit.user_deal_account_log",
  messageType = UserDealAccountChangeParameter.class
)
public void handleUserDealAccountLog(Session session, UserDealAccountChangeParameter message) {
    // 业务处理
}
```

**注册机制**

- `ScannerMessageProcessor` 是 `BeanPostProcessor`：扫描方法上的 `@ScannerMessage`，校验参数（第一个必须是 `Session`，第二个必须是 `messageType`），注册到 `ScannerMessageConsumer`。
- `ScannerMessageConsumer` 维护 `action → List<ClassMethod>`；一个 action 可以有多个消费者。
- `@KafkaListener(topics = {"basic-scanner", "basic-reverse-scanner"})` 消费；从 headers 还原 Session，写 MDC，`RuntimeHandler.execute` 执行，finally 清理 ThreadLocal。

**设计亮点**

- 注解驱动：业务方只写"action + 消息体 + 处理方法"，不关心 Kafka 配置。
- 一个 action 多消费者：新增消费方不用改扫表器。
- 上下文透传：消息头 → Session → MDC，日志能串 trace。

**坑**

- 消费异常只记日志、不阻断其它消费者；没有内建 DLQ / 重试，失败要靠业务侧补偿。
- 一个 action 多消费者是顺序执行还是并行？看 `handleAction` 实现；消费者多了要评估耗时。
- `messageType` 用 `Json.mustDecode` 反序列化，字段兼容性要小心。

---

## 6. 一致性与失败模式

**at-least-once**

- checkpoint 在发送之后更新，崩溃会重复扫一批；消费方必须幂等。
- 重复消息用业务唯一键去重（order_no / trans_no / 表 id）。

**顺序**

- 同一 `partition_key` 进同一分区，分区内有序；不同 key 不保证顺序。
- 如果业务要求严格顺序，要把相关实体放进同一 key。

**延迟**

- 扫表是定时任务，有延迟；不适合"支付成功立刻发奖"这种强实时场景。
- 延迟监控：`tooManyDelay` 日志 + 扫表进度。

**失败模式**

| 失败点 | 后果 | 兜底 |
|---|---|---|
| 发消息失败（async） | 消息可能丢 | 重试 5 次 + 业务对账 |
| 发完消息、checkpoint 未更新 | 重复扫一批 | 消费方幂等 |
| 消费异常 | 只记日志，不自动重试 | 业务重试 / 补偿 |
| 扫表任务停摆 | 数据延迟 | 进度监控 + 告警 |
| 同一表正反扫同时跑 | 游标互相覆盖 | 配置隔离 / 互斥 |

---

## 7. 与其他方案的对比

| 方案 | 实时性 | 侵入性 | 能力 | 适合 |
|---|---|---|---|---|
| `basic-scanner` | 分钟级 | 低（只读库） | 按表/游标扫，正反扫 | 业务事件、回填、补偿 |
| binlog / Canal | 秒级 | 高（binlog 权限/运维） | 全量变更、before/after | 强实时 CDC |
| 业务双写 | 实时 | 高（改业务代码） | 精确事件 | 核心交易 |
| 定时全量对账 | 小时/天级 | 低 | 发现差异 | 兜底对账 |

**选型逻辑**

- 扫表器是"够用 + 可控"：权限低、配置简单、能回填；牺牲实时性。
- 强实时/强一致场景不要靠扫表，要靠业务事件或 binlog。

---

## 8. 设计亮点总结

1. **配置驱动**：一行 `ScannerSetting` = 一条扫描管道，新增表/场景只加配置。
2. **游标 checkpoint**：`current` 保进度，不依赖 Kafka offset；正扫增量、倒扫回填。
3. **正反扫复用**：同一模型支持增量和历史回填。
4. **Kafka 事件总线**：headers 带 action/trace/app/locale，消费方可还原上下文。
5. **注解消费**：`@ScannerMessage` + BeanPostProcessor，action → method 自动注册。
6. **at-least-once + 消费幂等**：明确语义，不假装 exactly-once。
7. **独立服务**：只读库、低侵入、不拖慢业务服务启动。

---

## 9. 边界 / 坑

- `ScannerSetting.column` 字段保留，但 `getListOfSetting()` 里 SQL 固定用 `id`；要支持其它主键需要改代码。
- 正扫和倒扫共用 `current`，方向切换要小心。
- 消息发送是 async + 重试，极端情况下可能重复 / 丢失；关键链路用 sync 或消费方对账。
- 消费异常只记日志，没有内建 DLQ；业务侧要能重试/补偿。
- 单游标、单实例扫描：多实例部署要加分布式锁/分片，否则同一张表会被重复扫。
- 没有 schema 变更捕获：只按行扫，拿不到 update/delete 的 before/after。

---

## 10. 面试怎么讲

**30 秒版**

> `basic-scanner` 是配置驱动的准 CDC：一行 `scanner_setting` 定义一个表/场景，`current` 游标保进度，XXL-Job 定时按 `id > current` 批量扫，发 Kafka；消息带 action/trace/locale，消费方用 `@ScannerMessage` 按 action 注册。正扫做增量，倒扫做回填，语义是 at-least-once，消费方幂等。

**2 分钟版**

> 我们把扫表独立成服务，用独立只读库降低业务服务依赖。配置模型是 `database/table/current/direction/batch_size/partition_key`，扫表器按游标批量取数，发 `basic-scanner` topic；消息头带 action/trace/app/locale，消费方通过 `@ScannerMessage` 注解注册 action → method，框架自动还原 Session。 checkpoint 在发送后更新，所以是 at-least-once，重复靠消费方业务键去重；正扫增量、倒扫回填。它适合业务事件、回填和补偿，不适合强实时 CDC。

**追问：为什么不用 binlog/Canal？**

> 扫表器权限低、配置简单、能回填、对业务库侵入小；binlog 更实时但运维和权限成本高。我们选"够用 + 可控"，强实时场景另走业务事件。

**追问：这个设计有什么问题？**

> `column` 没真正用起来、正反扫共用游标、没有内建 DLQ、async 重试可能丢/重、单游标多实例要加锁；关键链路要 sync + 对账。
