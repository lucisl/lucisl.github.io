## 一句话

`basic-scanner` 把数据库表的变更**扫出来变成 Kafka 事件**：独立服务、只读库、游标 checkpoint、正扫 / 倒扫、注解消费。

---

## 1. 为什么把扫表器独立出来

`basic-scanner/README.md` 写得很直接：

> 原：扫表的服务，独立出来服务，减少各个服务对于基础资源的依赖，降低服务的启动时间。

**解决什么问题**

- 业务服务不需要为了"监听某张表"而连一堆库、加一堆定时任务。
- 扫表器用独立只读数据源，和业务库隔离，避免业务服务启动变重。
- 多种扫描策略、同表不同场景的扫描优化，集中在一个服务里维护。

**代价**

- 多一个服务要部署 / 监控。
- 消息是 **at-least-once（至少一次）**，消费方必须幂等。
- 扫表有延迟，不适合强实时场景。

---

## 2. 配置模型：ScannerSetting

`scanner_setting` 一行就是一个扫描任务：

| 字段 | 作用 |
|---|---|
| `name` | 唯一键 / 消息 action 名 |
| `database` | 数据库白名单：`basic` / `funbit` / `stats` / `live` / `family` |
| `table` | 要扫的表 |
| `column` | 监听主键（当前实现按 `id` 扫，`column` 字段保留） |
| `current` | 扫描进度：上次扫到的 id，`-1` 表示未开始 |
| `partition_key` | 发 Kafka 时的消息 key，决定分区 |
| `direction` | 1 正序（小→大）/ 2 倒序（大→小） |
| `batch_size` | 每批条数 |
| `status` | 启用 / 停用 |

**技术点**

- 每个库一个 `JdbcTemplate`，`getJdbcTemplate()` 用 switch 做白名单，不支持的库直接报错。
- `current` 是 checkpoint（游标），不是 offset；扫到哪存到哪。

---

## 3. 扫描执行：XXL-Job + 游标

### 正扫 `ScannerExecutorHandler`

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

### 倒扫 `ReverseScannerExecutorHandler`

```sql
SELECT * FROM `table`
WHERE id < {current}
ORDER BY id DESC
LIMIT {batchSize};
```

用于历史回填 / 反向补偿；和正扫共用 `scanner_setting`，靠 `direction` 区分。

**关键点**

- 扫表是**批处理 + 游标**，不是全表 select；每批只取 `batchSize`。
- 先发消息，再更新 checkpoint；如果发完消息、更新 checkpoint 前进程挂了，下一次会重复扫这一批 → **at-least-once**。
- 消费方必须按业务唯一键（order_no / trans_no / id）做幂等。

---

## 4. 消息：Kafka + headers

`BasicScannerMessageProducer`：

- topic：`basic-scanner`；倒扫：`basic-reverse-scanner`。
- key：`partition_key` 的值，保证同一业务实体进同一分区。
- headers：`action` / `timestamp` / `trace` / `app` / `userID` / `locale`。
- `async()`：发送失败只记日志，不抛异常，内部重试 5 次，间隔 300ms。
- `sync()`：发送失败抛 `RException`，用于不能丢的场景。

**设计意图**

- 消息里带 `trace` / `app` / `locale`，消费方可以还原 **Session（会话上下文）**，日志和业务逻辑都能按用户 / 大区处理。
- `action` 是路由键：消费方按 action 找方法，不是按 topic 盲目消费。

---

## 5. 消费：@ScannerMessage 注解

`lita-framework` 提供：

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

**技术点**

- 注解驱动：业务方只写"action + 消息体 + 处理方法"，不关心 Kafka 配置。
- 一个 action 多消费者：新增消费方不用改扫表器。
- 消费异常只记日志、不阻断其它消费者；失败重试 / 死信要业务侧兜底。

---

## 6. 一致性与坑

**at-least-once**

- checkpoint 在发送之后更新，崩溃会重复扫一批；消费方必须幂等。
- 重复消息用业务唯一键去重（order_no / trans_no / 表 id）。

**顺序**

- 同一 `partition_key` 进同一分区，分区内有序；不同 key 不保证顺序。
- 如果业务要求严格顺序，要把相关实体放进同一 key。

**延迟**

- 扫表是定时任务，有延迟；不适合"支付成功立刻发奖"这种强实时场景。
- 延迟监控：`tooManyDelay` 日志 + 扫表进度。

**当前实现的债**

- `ScannerSetting.column` 字段保留，但 `getListOfSetting()` 里 SQL 固定用 `id`；要支持其它主键需要改代码。
- 正扫和倒扫共用 `current`，方向切换要小心。
- 消息发送是 async + 重试，极端情况下可能重复 / 丢失；关键链路用 sync 或消费方对账。

---

## 7. 面试怎么讲

**"扫表器怎么设计的？"**

> 独立服务 + 只读库 + `scanner_setting` 配置：每张表一个游标 `current`，XXL-Job 定时按 `id > current` 批量扫，发 Kafka；消息带 action / trace / locale，消费方用 `@ScannerMessage` 注解按 action 注册。正扫做增量，倒扫做回填。

**"怎么保证不丢 / 不重？"**

> 不丢靠 checkpoint + 至少一次；不重靠消费方幂等——业务唯一键 / 表 id 去重。扫表器本身不保证 exactly-once，它保证 at-least-once，重复是消费方要处理的。

**"为什么不用 binlog / Canal？"**

> 扫表器更轻、对 DB 权限要求低、可以按表/场景配游标和批量；binlog 更实时但运维和权限成本高。我们选的是"够用 + 可控"，不是追求最强实时。

**"这个设计有什么问题？"**

> 有延迟、会重复、`column` 字段没真正用起来、正反扫共用游标；关键链路要配合对账和幂等。
