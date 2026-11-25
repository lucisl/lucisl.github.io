## 一句话

活动不是"一个活动写一套 Controller"，而是 **配置（模块 + Pipeline + 时间 + 大区 + 奖励）+ 组件**；标准活动只配 YAML，复杂玩法才写组件。

这套东西的本质是一个**轻量活动 DSL + 运行时**：YAML 是 DSL，Module 是积木，Pipeline 是编排，Engine 是执行器。

---

## 1. 分层：为什么不是"一个大 Service"

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

**为什么这样分**

- 活动之间隔离：一个活动的 Controller/Consumer/Cron 在自己的目录里，不互相干扰。
- 模块可复用：Rank/PK/Task/Lottery 不绑死某个活动。
- 依赖单向：Business → Active → Module → Coordinator，避免循环依赖。
- 基础设施下沉：DB/Redis/Mapper 不散落在业务层。

**代价**

- 分层靠规范 + Review，不是框架强制；写错也能编译。
- 活动多了以后，目录和配置治理是重点。

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
- `alias` 支持同一套活动配置按时间路由到不同 `biz`。

**设计亮点**

- 活动 = YAML 里的模块实例 + Pipeline，不是代码里的 if/else。
- 标准活动零代码；复杂玩法只写组件，不写整条链路。
- 配置可以热更新、灰度、回滚。

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
- `ActiveRequestProcessor` 校验第一个参数必须是 `ActiveContext`，并处理 CGLIB 代理。

**为什么用注解**

- 组件作者只写"配置类 + 事件方法"，不关心注册表。
- 新增组件不需要改引擎；Provider 自动发现。
- 活动 YAML 只引用模块名/事件名，解耦。
- 注解还能做签名校验：参数不对启动就报错，避免运行期才发现。

**代价**

- 注解是隐式契约：新人要理解 `@Module`/`@ModuleEvent` 的语义。
- 反射注册启动有成本；模块多了要关注启动时间。
- 模块名/事件名是字符串，YAML 写错只能运行期发现。

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
- 超时：单个 module 没有独立超时，靠 Future/上层超时；慢模块会拖住整条 Pipeline。
- 返回合并：`sameResponse` 时同 key 可能冲突；`responseException` 要按活动配置。

**设计取舍**

- 并行 vs 顺序：并行降 RT，但增加线程池和上下文管理复杂度。
- 故障隔离 vs 一致性：单模块失败不整体失败，适合聚合查询；写链路要谨慎。
- 线程池共享 vs 隔离：共享简单，隔离更稳；活动峰值要评估。

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
- 零代码的代价是配置治理：YAML 写错、模块名写错、事件名写错，只有运行期才发现。

---

## 6. 配置治理：热更新、灰度、回滚

**热更新**

- `BusinessDispatcher` 监听 Nacos：`main.yaml` 变更清空所有缓存；`biz.yaml` 变更清空对应 biz 缓存。
- 配置缓存 `businessConfigCache` / `cronMethodCache`；变更后重新加载。
- `alias` 解析：按 main.yaml 声明，通过 Nacos 前缀搜索候选，按时间过滤唯一 biz；多个活动同时有效会抛错。

**灰度 / 回滚**

- `alias` + 大区 / 白名单灰度。
- 配置版本 / Nacos 历史版本回滚。
- 开关关闭非核心模块。
- 上线前脚本化检查，上线后定时巡检。

**难点**

- 配置热更新要保证线程安全：`volatile mainConfig` + `ConcurrentHashMap` 缓存。
- 别名时间重叠校验：防止同一别名命中多个活动。
- 配置变更不能影响正在执行的活动；缓存失效后重新加载。

---

## 7. 迁移与取舍：active-main → active-v3

**active-main**

- 一个活动一个目录，Controller / Consumer / Cron 堆在全局包，互相干扰。
- README 明确标注哪些包废弃，准备下沉到活动内部。
- 1,000+ Java 文件、41 个 Controller。

**active-v3**

- 五层分层，Controller / Consumer / 定时任务下沉到活动内部。
- 57%、41→13；支持 GraalVM Native Image。
- 配置驱动 + 组件编排，标准活动零代码。

**代价**

- 双版本并行，线上到底跑哪个要确认。
- 迁移成本高：配置、组件、数据都要迁。
- 分层约束靠规范 + Review，不是框架强制。

---

## 8. 设计亮点总结

1. **活动 DSL**：YAML 定义模块、Pipeline、时间、大区、奖励，活动是配置不是代码。
2. **组件化**：`@Module` / `@ModuleEvent` 自动注册，模块 = 配置类 + 事件方法。
3. **Pipeline 编排**：并行执行、单模块故障隔离、参数/返回值/异常策略可配。
4. **分层约束**：Business → Active → Module → Coordinator，单向依赖。
5. **配置治理**：Nacos 热更新、alias 路由、时间重叠校验、灰度/回滚。
6. **零代码 / 低代码**：标准活动零代码，复杂活动组件化。
7. **可演进**：active-main → active-v3，57%、41→13、GraalVM。

---

## 9. 边界 / 坑

- 分层靠规范，不是框架强制；写错也能编译。
- YAML 没有编译期校验；模块名/事件名写错运行期才发现。
- Pipeline 并行有线程池和上下文成本；慢模块会拖住整条链路。
- 活动多了配置会膨胀；需要配置规范、模板、检查工具。
- 双版本并行，线上流量归属要确认。
- 零代码只覆盖标准活动；复杂玩法仍要写组件。

---

## 10. 面试怎么讲

**30 秒版**

> 我们把活动做成配置驱动 + 组件编排的运行时：Nacos YAML 定义模块、Pipeline、时间、大区、奖励；模块用注解自动注册；活动按 Pipeline 并行执行，单模块故障隔离。标准活动零代码，复杂玩法写组件。

**2 分钟版**

> 分层是 Business → Active → Module → Coordinator → 基础设施，依赖单向。配置在 Nacos：main.yaml 决定加载哪些活动，biz.yaml 定义模块实例和 Pipeline。模块用 `@Module` / `@ModuleEvent` 注册到 Provider，Pipeline 把 module+event 并行提交到线程池，MDC/Session 透传，单模块异常只影响自己。配置热更新、alias 路由、时间重叠校验都做了。active-main 到 v3 把 Controller/Consumer/Cron 下沉到活动内部，代码量降 57%、Controller 41→13。

**追问：为什么不用工作流引擎？**

> 活动需要低延迟、强一致、和用户/房间/家族/CP 深度耦合；工作流适合长流程审批，规则引擎适合规则判断，都不适合高频活动请求。我们做的是轻量活动 DSL + 运行时。

**追问：这个设计有什么问题？**

> YAML 没有编译期校验、分层靠规范、Pipeline 线程池共享、活动多了配置膨胀、双版本并行；这些是治理重点。
