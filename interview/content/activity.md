## 0. 这份题库怎么用

活动专项和 AI 专项分开准备：AI 专项讲 WorkHub 的 Agent / RAG / MCP / Eval；活动专项讲 Lita 的活动引擎、组件化、奖励一致性和高并发。

用法：

- 先看「市场要求 ↔ 活动经历」对齐，知道自己能讲什么。
- 再看「术语速查」，把活动域的专业词和代码对上。
- 按模块刷题，每题先自己答，再看答案要点。
- 面试前重点背每节最后的「30 秒表达模板」。

> 口径提醒：57%、41→13 是平台 / 团队结果；讲个人贡献时，要落到「我负责 / 参与的具体模块」，不要全说成个人从 0 到 1。

---

## 1. 市场要求 ↔ 活动经历

| 市场高频要求 | 简历 / 代码里的对应 | 面试怎么讲 |
|---|---|---|
| 活动 / 游戏化系统 | 配置驱动活动引擎、60+ 组件、Rank / PK / Task / Lottery / Monopoly | 不是「写活动」，是把活动做成运行时 |
| 高并发活动 / 房间 | Pipeline 并行、64/128 线程池、Redis 多实例、Caffeine、降级 | 聚合接口并行 + 故障隔离 + 缓存分层 |
| 奖励 / 支付一致性 | 唯一键 / 流水号 / 条件更新 / 回收队列 / 余额锁 | 先流水后发奖，失败可补偿，能对账 |
| 海外多区域 | 5 大区、多时区时间策略、locale 配置 | 同一套活动，按大区解析时间和配置 |
| 0-1 / 架构演进 | active-main → active-v3、57%、41→13 | 单体活动 → 模块化运行时 |
| 快速上线 | Nacos YAML、标准活动零代码、alias / 灰度 | 标准活动配置上线，复杂活动组件化 |

---

## 2. 术语速查（活动域）

| 术语 | 一句话解释 | 代码 / 项目对应 |
|---|---|---|
| **活动引擎（Activity Engine）** | 用配置 + 模块 + Pipeline 驱动活动，而不是每个活动写一套代码 | active-main `DispatcherV2`、active-v3 `BaseActive` |
| **配置驱动（Configuration-driven）** | 活动逻辑由 YAML / 配置决定，代码只提供组件 | Nacos `main.yaml` / `biz.yaml` |
| **组件编排（Component Orchestration）** | 把 Rank / PK / Task / Lottery 等组件按 Pipeline 组合成一个活动 | `pk-v202608.yaml` 35 个模块实例 |
| **管道（Pipeline）** | 一次请求按顺序 / 并行执行多个模块事件 | `DispatchPipeline` / `ActivePipeline` |
| **模块注册表（Module Registry）** | module → event → method 的映射，框架自动发现 | `DispatchModuleProvider`、`ModuleProvider` |
| **零代码 / 低代码（Zero-code / Low-code）** | 标准活动只配 YAML；复杂活动写组件 | `business/zeroCode/README.md` |
| **时间策略（Time Strategy）** | 固定 / 周期刷新 / 多阶段 / 指定时间四种活动时间窗口 | `TimeStrategyFactory` |
| **多阶段（Multi-stage）** | 海选 → 资格 → 晋级 → 决赛，每阶段独立榜单 / 结算 | PK YAML 的 stage |
| **榜单（Ranking）** | Redis ZSet 存分数和排名，支持分页 / 同分 / 结算 | RankModule / `rank` |
| **结算（Settlement）** | 按阶段 / 大区 / 榜单区间发奖，状态置为已结算 | `settle` 事件 |
| **幂等（Idempotency）** | 同一请求 / 消息重复执行，结果不变 | trans_no / orderNo 唯一键 |
| **唯一键（Unique Key）** | 数据库唯一索引兜底防重 | `trans_no`、`order_no` |
| **条件更新（Conditional Update）** | `UPDATE ... WHERE status=...`，用影响行数抢处理权 | 捕鱼扣血 / 捕捞 |
| **分布式锁（Distributed Lock）** | 多实例互斥，Redisson RLock | 余额变更单写者锁 |
| **状态机（State Machine）** | 奖励 / 任务 / 结算有明确状态流转 | PENDING / SUCCESS / FAILED |
| **补偿（Compensation）** | 失败后重试 / 回滚 / 人工补发 | 奖励回收队列、失败删标记 |
| **对账（Reconciliation）** | 配置 / 榜单 / 发奖记录三方核对 | PK 巡检脚本 |
| **回收（Reversal）** | 已发奖励按规则收回 | `gift_award_revert_queue` |
| **热点 Key（Hot Key）** | 单个 Key 访问过于集中 | 房间榜 / 活动榜 |
| **缓存击穿 / 雪崩（Cache Breakdown / Avalanche）** | 热点失效 / 大量同时失效打穿 DB | 本地缓存 + 随机过期 + 降级 |
| **降级（Degradation）** | 非核心功能关闭 / 返回兜底 | 活动峰值 / 异常 |
| **限流（Rate Limiting）** | 限制单位时间请求量 | 活动入口 / 接口 |
| **灰度（Canary）** | 小流量 / 小区域先上 | alias / 大区 / 白名单 |
| **多区域（Multi-region）** | 不同大区独立时间 / 配置 / 数据 | in / ph / vi / ko / zh |
| **事件驱动（Event-driven）** | 状态变更发事件，异步做缓存 / 消息 / 结算 | PK start/end、庆典 worker |
| **消费幂等（Consumer Idempotency）** | Kafka 重复消费不重复处理 | 消息 id / 业务键去重 |
| **死信队列（DLQ）** | 多次失败的消息进死信，人工处理 | Kafka 重试 |
| **最终一致（Eventual Consistency）** | 不追求强事务，靠重试 / 补偿达到一致 | 奖励 / 订单 |
| **资损（Financial Loss）** | 重复发 / 漏发造成资金损失 | 奖励一致性 |
| **压测（Load Test）** | 模拟峰值流量验证容量 | 活动前压测 |
| **容量评估（Capacity Planning）** | 按 QPS / 线程池 / 连接数 / DB 估算容量 | 活动峰值 |
| **链路追踪（Tracing）** | 一次请求串起所有服务 / 模块 | traceId / MDC |

---

## 3. 活动专项题库

### A. 活动引擎与组件化

**Q1. 你们活动系统的整体架构？**

- 入口 → Business / Active → Module → Coordinator → 基础设施。
- 活动 = 配置（模块 / Pipeline / 时间 / 大区 / 奖励）+ 组件。
- active-main 是「按活动分目录 + Dispatch 引擎」，active-v3 是「五层模块化运行时」。

**Q2. 为什么不用工作流引擎 / 规则引擎？**

- 活动需要低延迟、强一致、可回滚，和业务对象（用户 / 房间 / 家族 / CP）深度耦合。
- 工作流引擎适合长流程审批，不适合高频活动请求；规则引擎适合规则判断，不适合奖励 / 榜单 / 结算。
- 所以自研轻量活动引擎：Pipeline + 模块注册 + 配置。

**Q3. 配置驱动怎么落地？配置模型长什么样？**

- Nacos `main.yaml` 决定加载哪些活动；`biz.yaml` 定义 `biz / active / locales / start / finish / modules / pipelines / awards / resources / actions / debug`。
- 配置热更新：监听 Nacos，清本地缓存；alias 解析 + 时间重叠校验。
- 标准活动只配 YAML，复杂玩法写组件。

**Q4. 组件怎么注册 / 发现？怎么避免耦合？**

- `@DispatchModule` / `@DispatchModuleEvent`、`@Module` / `@ModuleEvent`。
- `BeanPostProcessor` 扫描，`Provider` 维护 module → event → method。
- 模块只依赖配置类和上下文，不直接依赖别的模块；跨模块走 Coordinator。

**Q5. Pipeline 并行怎么做的？线程池怎么定？**

- 每个 module 一个 `Callable`，`Future.get` 聚合。
- 64/128 线程池、`ArrayBlockingQueue(128)`；按活动峰值和下游容量压测。
- 关键：MDC / Session 透传、finally 清理。

**Q6. 单模块故障怎么隔离？**

- 每个 module 独立 try/catch，失败只写该 module 的 error response。
- `responseException` 可配置：是否需要整体失败。
- 非核心模块失败不影响主流程。

**Q7. 活动怎么做到零代码 / 低代码？边界在哪？**

- 标准活动：YAML 配模块 / Pipeline / 时间 / 奖励，零代码。
- 新玩法 / 新组件：还是要写代码。
- 不要说「所有活动零代码」，说「标准活动零代码，复杂活动组件化」。

**Q8. active-main → active-v3 为什么重构？**

- active-main：一个活动一个目录，Controller / Consumer / Cron 堆在全局包，互相干扰。
- v3：五层分层，Controller / Consumer / 定时任务下沉到活动内部；57%、41→13。
- 代价：迁移成本、双版本并行、团队熟悉度。

### B. 时间 / 多区域 / 榜单

**Q9. 多时区怎么处理？**

- `TimeStrategy`：fixed / time / flush / multi。
- `zoneId` + locale；`transformTimestamp` 换算大区时间。
- 配置里按大区写时间表达式，如 `2026-08-17T14:00:00+08:00A|...ar`。

**Q10. 活动跨天 / 轮次怎么算？**

- 按大区自然日切分；`getTimeRoundStartTime` 生成所有轮次。
- 跨天任务要幂等：`user + activity + day + stage` 唯一键。
- 补签 / 补做要判断活动时间和轮次。

**Q11. 榜单怎么设计？**

- Redis ZSet：member = 用户 / 房间 / 家族，score = 分数。
- 同分排序：score + 时间 / ID 兜底。
- 分页用 ZREVRANGE；结算时快照，不边结算边读。
- 防刷：黑名单、频率、幂等。

**Q12. 结算怎么保证不重不漏？**

- 轮次状态 `status=200` 才结算。
- 结算前加标记（Redis / DB），失败删标记可重试。
- 结算后对账：配置 vs 榜单 vs 发奖记录。

**Q13. 多区域配置怎么隔离？**

- `enableLocales` 控制活动可见大区。
- 每个大区独立时间 / 奖励 / 文案。
- 数据按 locale 分区 / 分表；避免跨区串数据。

**Q14. 灰度 / 回滚怎么做？**

- 配置版本 + alias 路由 + 大区 / 白名单灰度。
- 开关关闭非核心模块；回滚配置 / 代码。
- 上线前脚本化检查，上线后定时巡检。

### C. 奖励 / 一致性

**Q15. 奖励发放怎么防重？**

- 先插流水，`trans_no` / `order_no` 唯一键。
- `DuplicateKeyException` = 已发放，直接返回。
- 再发奖；失败更新状态 / 进重试。

**Q16. GET / USE 双流水为什么？**

- GET：发放流水；USE：核销流水。
- 发放和核销分开，能查「发了多少、用了多少、剩多少」。
- 核销用 `UPDATE ... WHERE status='ACTIVE'` 单行原子，防并发双消。

**Q17. 奖励回收 / 补偿怎么做？**

- 发放记录带 `canRevert`。
- 回收走独立 `gift_award_revert_queue`。
- 失败重试 / 告警 / 人工补偿；不要让回收阻塞正常发奖。

**Q18. 捕鱼并发捕捞怎么处理？**

- 扣血：`UPDATE ... WHERE id=? AND status='ALIVE'`，影响行数=0 放弃。
- 捕捞成功：再用 `WHERE status='ALIVE'` 抢「捕捞处理权」。
- 刷鱼：唯一索引保证一房间一活鱼；DuplicateKey / Deadlock 重查。
- 溢出伤害：`orderNo` 加 `_depth` 后缀，保证多条鱼流水都幂等。

**Q19. 宝箱多级结算怎么防重？**

- 奖励记录先 insert，唯一键冲突 = 已处理。
- 状态 `PENDING → SUCCESS / FAILED`。
- 榜单累计用 `orderNo + "_" + level`，一笔流水跨多级也幂等。
- 日榜 / 总榜结算用 Redis 标记防重；失败删标记可补偿。

**Q20. 余额变更怎么保证单写者？**

- `@UserBalanceLock` + Redisson `RLock`。
- `tryLock(waitMs, leaseMs)`；lease<=0 用看门狗续期。
- 获取失败：fail-fast 或降级 DB；释放判断当前线程。
- 按 biz + userId 判断是否在锁范围，不是所有交易都加锁。

**Q21. 分布式事务怎么处理？**

- 尽量避免跨服务强事务。
- 本地事务 + 消息表 / 补偿；最终一致。
- 关键：幂等、重试、对账、人工兜底。

**Q22. 幂等键怎么选？**

- 业务唯一：orderNo、trans_no、user + activity + stage + day。
- 不要用纯 UUID；要能重放。
- 数据库唯一索引兜底，缓存 / 状态机辅助。

**Q23. 奖励失败怎么重试？**

- 进重试队列，退避重试；超过次数进死信。
- 状态机记录失败原因；告警。
- 人工补偿 / 对账脚本。

**Q24. 怎么定位资损？**

- 三方对账：配置 / 榜单 / 发奖记录。
- 链路追踪 + 流水 + 日志。
- 先止血（关活动 / 关发奖），再修复 / 补偿。

### D. 高并发 / 稳定性

**Q25. 活动峰值怎么扛？**

- 容量评估 + 压测；线程池 / 连接池 / Redis / DB 分段压。
- 并行 Pipeline、缓存、异步化、限流、降级。
- 活动前演练，活动后复盘。

**Q26. 热点 Key / 大 Key 怎么处理？**

- 本地缓存（Caffeine）+ Redis；热点 Key 拆分 / 多副本。
- 大 Key 拆分、压缩、异步删。
- 限流 / 降级，避免打穿 DB。

**Q27. 缓存一致性怎么保证？**

- Cache-Aside：更新 DB 后删缓存。
- 延迟双删 / 版本号 / 订阅 binlog。
- 接受最终一致；关键读走 DB 兜底。

**Q28. Kafka 重复 / 顺序 / 积压怎么处理？**

- 消费幂等（消息 id / 业务键）。
- 分区 key 保证同一业务有序。
- 重试 + 死信队列；监控 lag。

**Q29. 房间玩法怎么解耦？**

- 领域事件：PK start/end、送礼、上麦。
- `@Async @EventListener` 做缓存清理 / 消息推送。
- Redis pub/sub 清本地缓存；游标 worker 做增量结算。

**Q30. 线程池怎么定？拒绝策略？**

- CPU 密集 vs IO 密集；核心 / 最大 / 队列。
- 按活动隔离线程池，避免互相拖垮。
- 拒绝策略：阻塞 / 丢弃 / 降级，不能默认 Abort。

**Q31. 活动降级怎么做？**

- 关闭非核心模块（动画 / 广播 / 非关键榜单）。
- 缓存兜底 / 默认值；限流。
- 配置开关，随时开合。

**Q32. 线上问题怎么排查？**

- traceId 串链路；看入口 RT、线程池、Redis、DB、Kafka。
- 看流水 / 状态机 / 对账。
- 先止血，再定位，再复盘。

### E. 测试 / 上线 / 行为

**Q33. 活动怎么测试？**

- 配置 debug 时间偏移（时间旅行）。
- 多区域 locale / 时区。
- 脚本化检查（`.check.ts`）跑结算 / 榜单 / 发奖。
- 回放 / 影子流量。

**Q34. 活动上线 / 回滚流程？**

- 配置版本 + 灰度 + 开关。
- 上线前检查清单；上线后巡检。
- 回滚配置 / 代码；数据补偿。

**Q35. 你负责哪块？怎么证明？**

- 活动引擎 / 组件 / 活动方向；具体模块 + 提交记录。
- 不要泛泛说「我负责整个平台」。
- 用 57% / 41→13 讲平台结果，用具体模块讲个人贡献。

**Q36. 如果重做，会改什么？**

- 配置 schema / 版本化 / 校验。
- 组件契约 / SPI。
- 可观测 / 对账 / 巡检。
- 测试夹具 / 时间旅行。

---

## 4. 不要夸大的边界

1. **零代码不是所有活动**：标准活动零代码，复杂玩法要写组件；说「标准活动零代码，复杂活动组件化」。
2. **57%、41→13 是平台 / 团队结果**：可以说「我参与 / 负责其中活动引擎与组件」，不要全说成个人从 0 到 1。
3. **不要提 2,450 张表**：没意义；讲 5 大区、30+ 活动、170+ 接口、60+ 组件。
4. **没做过交易系统**：不要为了匹配 JD 硬说交易；讲活动 / 房间 / 奖励 / 支付余额锁可以。
5. **不要说你设计了整个 active-v3**：如果你只是核心开发，说「参与 / 负责活动方向的核心模块」。
6. **AI / Eval 不要混进活动题**：面试官问活动就讲活动；AI 单独一轮再讲 WorkHub。

---

## 5. 30 秒表达模板

**「你们活动系统怎么做的？」**

> 我们把活动做成配置驱动（Configuration-driven）+ 组件编排（Component Orchestration）的运行时：Nacos YAML 定义模块、Pipeline、时间、大区、奖励；模块用注解注册，活动按 Pipeline 并行执行；奖励用唯一键 / 流水 / 条件更新 / 回收队列保证一致性。

**「你怎么保证奖励不重复？」**

> 先插流水，`trans_no` 唯一键（Unique Key）做幂等（Idempotency）闸门；`DuplicateKey` 就是已发放。核销用 `UPDATE ... WHERE status='ACTIVE'` 的条件更新（Conditional Update），并发不会双消；失败走回收 / 补偿队列，定时对账（Reconciliation）。

**「活动峰值怎么扛？」**

> 先做容量评估（Capacity Planning）和压测（Load Test），再分层扛：聚合接口 Pipeline 并行 + 单模块故障隔离，热点数据本地缓存 + Redis 多实例，非核心功能降级（Degradation）、入口限流（Rate Limiting），活动前演练、活动后复盘。
