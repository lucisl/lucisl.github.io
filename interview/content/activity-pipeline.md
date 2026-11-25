## 一句话

活动不是"一个活动写一套 Controller"，而是 **配置（模块 + Pipeline + 时间 + 大区 + 奖励）+ 组件**；标准活动只配 YAML，复杂玩法才写组件。

---

## 1. 活动 = 配置 + 组件 + Pipeline

以 active-v3 为例：

```
业务入口 → Business → Active → Module → Coordinator → 基础设施层
```

| 层 | 职责 | 约束 |
|---|---|---|
| Business | 一个业务/活动一个子目录，放配置、Controller、Service | 可调用 Active，不能反向 |
| Active | 活动层，配置文件 + 入口文件驱动 | 可调用 Module，不能反向 |
| Module | 功能模块，自成闭环 | 可调用 Coordinator，不能反向 |
| Coordinator | 跨模块公共能力：用户、奖励、消息、打点 | 不反向依赖 Module/Active |
| 基础设施 | Service / Mapper / DB | 所有层可调用 |

**核心思想**

- 活动 = 积木组合，不是复制粘贴。
- 模块只依赖配置类和上下文，不直接依赖别的模块；跨模块走 Coordinator。

---

## 2. 配置模型：main.yaml + biz.yaml

### main.yaml

决定"加载哪些活动"：

- `businesses`：活动列表
- `aliases`：别名路由
- 加载后校验别名时间不重叠

### biz.yaml

一个活动的完整配置：

```yaml
biz: pk-v202608
active: PkActive
enableLocales: [in, vi, ph, ko]
langSheet: 'Activity$pk-260817'
startTime: 2026-08-12T14:00:00+08:00
finishTime: 2026-09-01T23:59:59+08:00

modules:
  player_in_n_200:
    module: RankModule
    configuration:
      topic: player_in_n_200
      playerType: USER
      startTime: '...'
      finishTime: '...'
      mainRound:
        settles:
          - strategy: PLAYER_LIST
            topN: 200
          - strategy: AWARD
            topN: 10
            settleAward:
              awardName: player_in_n_200

pipelines:
  room-settle:
    modules:
      - module: room_in_n_200
        event: settle
      - module: room_in_200_100
        event: settle
```

**技术点**

- 配置从代码下沉到 Nacos；改活动不改代码。
- `modules` 定义"有哪些组件实例"；`pipelines` 定义"一次请求按什么顺序/组合执行"。
- 支持 `sameParameter` / `sameResponse` / `responseException`，控制 Pipeline 的参数和异常语义。
- `debug` 支持时间偏移，做活动时间旅行。

---

## 3. 模块注册：注解 + Provider

**active-main**

- `@DispatchModule(config = XxxConfig.class)` 标模块类。
- `@DispatchModuleEvent("event")` 标事件方法。
- `DispatchModuleProcessor` 是 `BeanPostProcessor`：扫描注解、校验方法参数、注册到 `DispatchModuleProvider`。
- `DispatchModuleProvider` 维护 `module → event → method`。

**active-v3**

- `@Module` / `@ModuleEvent`，`ModuleProcessor` + `ModuleProvider`，同一套思路。
- `@ActiveRequest` / `@ActiveConsumer` / `@ActiveCron` 分别注册 HTTP 请求、Kafka 消费、定时任务。

**为什么用注解**

- 组件作者只写"配置类 + 事件方法"，不关心注册表。
- 新增组件不需要改引擎；Provider 自动发现。
- 活动 YAML 只引用模块名/事件名，解耦。

---

## 4. Pipeline 执行：并行 + 故障隔离

`DispatcherV2` / `BaseActive.executePipeline()`：

- 每个 `module+event` 一个 `Callable`，提交到线程池。
- 线程池：64/128，`ArrayBlockingQueue(128)`。
- 每个任务执行前 `MDC.put(user/trace/locale)`、`Session.set(session)`，finally 清理。
- `Future.get()` 聚合结果；单模块异常只写该模块的 error response，不影响其它模块。
- `responseException` 可配置：是否让整体失败。

**为什么并行**

- 活动聚合接口通常要同时查榜单、任务、奖励、配置；串行 RT 叠加。
- 并行后 RT 取决于最慢模块，而不是所有模块之和。

**难点**

- 上下文透传：Session 是 ThreadLocal，线程池里要手动 set/clear。
- 故障隔离：一个模块超时/异常不能拖垮整页。
- 线程池隔离：活动之间最好分开，避免互相抢线程。

---

## 5. 零代码 / 低代码的边界

**零代码**

- 标准活动：YAML 配模块、Pipeline、时间、大区、奖励，不写业务代码。
- `business/zeroCode/README.md`：只需要在 Nacos 配 `biz.yaml`（`dataId=biz.yaml, group=active-v3, namespace=lita-active`），请求就生效。

**低代码**

- 新玩法 / 新组件：还是要写 Module / Action。
- 活动层只做组合，不重复写业务。

**不要夸大**

- 不说"所有活动零代码"；说"标准活动零代码，复杂活动组件化"。

---

## 6. 迁移与取舍

**active-main → active-v3**

- active-main：一个活动一个目录，Controller / Consumer / Cron 堆在全局包，互相干扰。
- active-v3：五层分层，Controller / Consumer / 定时任务下沉到活动内部；57%、41→13。
- 支持 GraalVM Native Image，活动峰值弹性伸缩。

**代价**

- 双版本并行，线上到底跑哪个要确认。
- 迁移成本高：配置、组件、数据都要迁。
- 分层约束靠规范 + Review，不是框架强制。

---

## 7. 面试怎么讲

**"活动系统怎么做的？"**

> 我们把活动做成配置驱动 + 组件编排的运行时：Nacos YAML 定义模块、Pipeline、时间、大区、奖励；模块用注解自动注册；活动按 Pipeline 并行执行，单模块故障隔离。标准活动零代码，复杂玩法写组件。

**"组件怎么注册？"**

> `@DispatchModule` / `@ModuleEvent` 标在模块和事件方法上，`BeanPostProcessor` 扫描后注册到 Provider，维护 module → event → method；活动 YAML 只引用模块名和事件名。

**"Pipeline 怎么并行？"**

> 每个 module+event 一个 Callable，64/128 线程池，Future 聚合；MDC/Session 透传，单模块异常只影响自己；`responseException` 控制是否整体失败。

**"这个设计有什么问题？"**

> 分层靠规范约束、双版本并行、配置和代码边界要守；活动多了以后配置治理和可观测性是重点。
