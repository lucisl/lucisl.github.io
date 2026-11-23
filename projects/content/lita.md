## 这份文档怎么用

这不是官方文档，而是一份<strong>个人可检索的项目手册</strong>：把散落在 40 多个仓库 README、 `docs` 仓库、包结构和表字典里的信息，重新按「查得到、找得回」的方式组织。

| 你的目的 | 直接看 |
| --- | --- |
| 第一次了解这个系统是什么 | 产品与规模 → 架构总览 → 业务域地图 |
| 找某个业务在哪个仓库 | 业务域地图 → 服务速查表 |
| 接手某个服务 | 服务目录里对应的折叠块（定位/模块/数据/状态） |
| 查数据口径或表 | 数据体系；再进 `docs/data/` |
| 理解为什么代码长这样 | 架构演进 |
| 准备面试/对外介绍 | 产品与规模 → 架构总览 → 架构演进 |

> 口径说明：代码量、提交数、最近提交时间均来自本地工作区（不含 target/ 与 node_modules）。服务状态按最近提交时间粗分：活跃（2026-10 之后）、维护（2026-06~09）、 低频（2026-01~05）、停滞（2025 及以前）。这是个人视角的整理，细节以仓库为准。

## 业务专题

活动、语音房/直播、送礼、陪玩交易是 Lita 的四个核心域：前三个决定「体验与消费」，陪玩交易决定「服务履约与结算」。这也是海外语音社交/陪玩业务最常被追问的部分，所以单独拆成子手册。

<div class="ws-topic-grid">
  <a class="ws-topic-card" href="./lita-activities.html">
    <span class="ws-topic-index">01 / ACTIVITIES</span>
    <b>活动运营</b>
    <small>签到、任务、PK、榜单、抽奖、召回与节日活动</small>
  </a>
  <a class="ws-topic-card" href="./lita-voice-room.html">
    <span class="ws-topic-index">02 / VOICE ROOM</span>
    <b>语音房与直播</b>
    <small>建房、麦位、连麦、PK、KTV、榜单与转推</small>
  </a>
  <a class="ws-topic-card" href="./lita-gifting.html">
    <span class="ws-topic-index">03 / GIFTING</span>
    <b>送礼与虚拟礼物</b>
    <small>礼物配置、特效广播、宝箱盲盒、榜单与分成</small>
  </a>
  <a class="ws-topic-card" href="./lita-companion.html">
    <span class="ws-topic-index">04 / COMPANION</span>
    <b>陪玩与交易</b>
    <small>陪玩师技能、下单接单、充值支付与结算</small>
  </a>
</div>

## 一、产品与规模

### 产品定位

Lita 是面向海外市场的<strong>语音社交 + 陪玩交易 + 游戏化消费</strong>平台。用户充值获得虚拟货币， 在语音房/直播间里送礼、连麦、玩互动游戏，或购买陪玩服务；平台通过活动、家族、榜单和推送做增长与留存。

| 产品线 | 编码 | 说明 |
| --- | --- | --- |
| Lita | 1001 | 主产品线，绝大多数 `lita-*` / `funbit-*` 仓库服务于它 |
| Cinta | 1002 | 第二条产品线，有独立的用户服务与促活服务，后台共用 |

大区共 5 个：`in` 印尼、`ph` 菲律宾、`vi` 越南、`ko` 韩国、`zh` 中文区。多区域直接决定了系统要处理多语言、多时区、多支付渠道、多推送通道和多云部署。

### 规模数据

| 维度 | 数值 | 说明 |
| --- | --- | --- |
| Git 仓库 | 42 个 | 独立仓库，不是 monorepo；含文档、脚本、新平台 |
| Java 文件 | 22,873 | 不含 `target/` |
| Java 代码 | 约 179 万行 | 含空行与注释 |
| 数据库表 | 约 2,451 份表文档 | 5 个业务库 + ODPS 数仓 |
| API 契约 | 188 份 | Swagger 自动生成，`active-main` 占 177 |
| 提交最多的仓库 | `funbit-api` 19,652 | 老单体，最后提交 2026-11-20 |
| Java 行数最多的仓库 | `funbit-api` 约 34.4 万行 | 其次是 `lita-active` 约 28.8 万行 |

## 二、架构总览

```diagram
┌──────────────────────── 客户端（App / H5 / 后台）────────────────────────┐
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ 接入层：网关（鉴权、路由、Session 注入、trace id 透传）                     │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ 业务服务层                                                                │
│  场景：litalive（直播/在线）  litaroom（房间/玩法）  lita-msg（IM）         │
│  交易：lita-basic（礼物/订单） lita-payment（充值/交易/风控） lita-earth    │
│  增长：active-main / v2 / v3  lita-active  game-main  basic-promotion      │
│  互动：lita-push（推送）  lita-recommend（推荐）  lita-score（质量分）      │
│  管控：admin-main / admin-ai  basic-monitor-main（风控）                   │
├──────────────────────────────────────────────────────────────────────────┤
│ 基础服务层：user-data-center（用户中心） basic-main  basic-common          │
│             basic-public（父 POM/核心库） basic-scanner  lita-public        │
├──────────────────────────────────────────────────────────────────────────┤
│ 框架与工具层：lita-framework  funbit-framework  lita-command-server        │
│               docs（规范/契约/数据）  scripts（自动化脚本）  skills（AI）    │
├──────────────────────────────────────────────────────────────────────────┤
│ 存储与中间件：MySQL（5 库） Redis（多实例） Kafka  ClickHouse  ODPS          │
│               Elasticsearch（AWS/阿里云双云） MongoDB  S3/OSS  Nacos        │
└──────────────────────────────────────────────────────────────────────────┘
        外部依赖：Agora 声网 · Firebase · AWS · 腾讯云 · 字节 · GrowthBook
                  Google 登录 · Twilio · Kakao · GeoIP2 · 飞书告警
```

三条横向的「骨架线」决定了这套系统的形态：

- <strong>Nacos 是中枢</strong>：服务发现 + 配置中心，`local/test/prod` 三个 namespace 隔离环境，数据源、Redis、第三方凭证都通过共享配置下发，代码仓库不存凭证。
- <strong>lita-public 是依赖枢纽</strong>：`lita-interface`（接口定义）、`lita-public-sdk`（对外 SDK）、`lita-feign`（服务间调用）、`lita-share-service`（共享业务），15 个左右模块依赖它。
- <strong>basic-public-parent 是技术基线</strong>：统一父 POM 管理依赖版本和插件，新服务继承它即可获得统一构建与基础设施能力。

## 三、业务域地图

把 40+ 个仓库横向归纳，得到 18 个业务域。★ 是承载核心收入或核心体验的域。

| # | 业务域 | 一句话 | 主要载体 |
| --- | --- | --- | --- |
| 1 | 用户与账号 ★ | 注册登录、第三方绑定、VIP、余额、封禁 | `user-data-center`、`cinta-user-main` |
| 2 | 语音房与直播 ★ | 建房、上下麦、RTC、榜单、停留时长 | `litalive`、`litaroom` |
| 3 | 陪玩下单 ★ | 陪玩师技能、下单、接单、结算 | `lita-basic`、`lita-earth`、`lita-payment` |
| 4 | 送礼与消费 ★ | 礼物配置、送礼、特效、宝箱、广播 | `lita-basic`、`litaroom` |
| 5 | 充值支付 ★ | 应用内购买、多渠道充值、订单、风控 | `lita-payment`、`lita-basic` |
| 6 | 家族与公会 | 家族创建、成员、等级、积分、任务 | `litaroom`、`lita-basic` |
| 7 | 游戏化玩法 | 房内互动游戏、独立游戏、下注与赔付 | `game-main`、`litaroom`、`lita-earth` |
| 8 | 活动运营 ★ | 年度盛典、周年庆、排行榜、签到、召回 | `active-main` / `v2` / `v3`、`lita-active` |
| 9 | IM 与消息 | 私聊、房间消息、系统通知、消息校验 | `lita-msg`、`litalive` |
| 10 | 推送 | FCM / AWS / Kakao 多通道下发 | `lita-push` |
| 11 | 推荐 | 房间、用户、内容推荐 | `lita-recommend` |
| 12 | 风控与内容安全 | 骚扰检测、敏感词、封禁、直播快照、反作弊 | `basic-monitor-main`、`lita-basic-timer` |
| 13 | 数据平台 | 埋点采集、实时/离线数仓、报表 | `data-event`、`data-event-collect`、`data-transfer` |
| 14 | 资源与配置 | 动态资源、敏感词、TTS、房间号、灰度 | `lita-resource-center`、`lita-resource` |
| 15 | 管理后台 | 运营/客服操作台、内部 AI 接口 | `admin-main`、`admin-ai` |
| 16 | 短信与验证 | 短信下发、验证码、多供应商 | `sms-platform` |
| 17 | 质量分 | 用户/房间质量评分 | `lita-score` |
| 18 | 基础框架与共享能力 | Web 框架、父 POM、公共 SDK、公共库 | `lita-framework`、`lita-public`、`basic-public`、`basic-common` |

## 四、四条关键链路

### 1\. 语音房 / 直播

创建房间 → 主播上麦 → 用户进房 → 连麦互动 → 送礼 → 房间榜更新 → 退出并记录停留时长。 大房间通过声网混流转推 CDN，让非 RTC 观众也能观看。

- `litalive`：在线状态、音视频、榜单。关键模块 `agoramixcdn`（混流转推）、`miclink`（连麦）、`liverank`、`livewatchcount`、`livetimestats`、`livepk`、`livestreamconverter`。
- `litaroom`：房内玩法平台，84 个 Controller、52 个模块：`createroom`、`giftpack`、`luckybag`、`ktv`、`pkv1`、`guild`、`dress`、`gamecenter`。
- 状态与签名使用多个独立 Redis 实例（在线、签名、房间状态），避免一个大 Key 拖垮全部。

### 2\. 送礼与消费

购买礼物 → 房间内送出 → 全屏特效与广播 → 计入房间/家族榜单 → 宝箱开出额外奖励 → 主播/陪玩师收益。

- `lita-basic`：`appgiftcache`（礼物缓存）、`giftbroadcast`、`giftevent`、`blindpack`（盲盒）、`effect`（特效）、`equip`（装扮）。
- `litaroom`：`giftpack`、`luckybag`、`luckycoin`、`welcome`。
- 这是「高频写 + 高价值」场景：库存扣减、幂等、事务一致性、实时榜单都要准。

### 3\. 充值 / 订单 / 结算

应用内购买或第三方渠道支付 → 服务端校验收据 → 入账虚拟货币 → 下单/接单 → 服务完成 → 平台结算分成。

- `lita-payment`：只有 5 个包（`recharge`、`trans`、`risk`、`start`），偏编排与资金流转。
- `lita-basic`：`apple`（内购校验）、`chargequery`、`coupon`、`flashorder`（闪单/速配）、`diamond`。
- `lita-earth`：`playercourse`（陪玩课程）、`recharge`、`users`。
- 海外场景还要处理多币种、多支付厂商、支付回调幂等与对账。

### 4\. 活动运营

运营配置活动 → 用户参与（签到、任务、PK、排行榜、抽奖）→ 发奖/扣费 → 榜单结算 → 数据回流。

- 三代并存：`active-main`（单体、一活动一目录）、`active-v2`（模块化尝试、已停止）、`active-v3`（分层 + Native Image，活跃）。
- 另有老一代 `lita-active`（约 28.8 万行 Java，工作区第二）。
- 活动库 `lita_active` 独立，约 213 张表；`active-main` 的 177 份 API 文档是最大的接口族。

## 五、服务目录 · 交易与基础

点开每个服务看细节。「状态」按最近提交时间粗分，用于判断是活跃维护还是历史遗留。

<details class="ws-svc">
<summary><span class="ws-svc-name">lita-basic</span><span class="ws-svc-role">基础业务主服务 · 礼物/订单/充值入口</span><span class="ws-badge ws-badge-live">活跃</span></summary>

Lita 时代最核心的基础业务服务，86 个业务模块，覆盖礼物、钻石、订单、优惠券、活动广场、苹果内购、抽奖、限流等。

- <strong>规模</strong>：2,553 个 Java 文件 / 约 18.3 万行；6,234 次提交
- <strong>模块</strong>：`appgiftcache`、`giftbroadcast`、`giftevent`、`blindpack`、`effect`、`diamond`、`coupon`、`flashorder`、`apple`、`chargequery`、`activity`、`activesquare`、`chatlottery`、`collectbox`、`billionareclub`、`celebrity`、`apilimit`
- <strong>数据</strong>：业务主库 `funbit` 与 `lita_basic`；礼物配置、订单、余额相关表
- <strong>入口</strong>：`lita-basic-api`，应用名 `lita-basic-api`，包名 `com.mashup.funbit.modules`
- <strong>备注</strong>：很多「基础能力」的历史归属地，看新需求时先确认是否已迁到 `lita-public` 或独立服务

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-payment</span><span class="ws-svc-role">充值 / 交易 / 风控</span><span class="ws-badge ws-badge-live">活跃</span></summary>

资金链路的服务端入口，体量不大（34 个 Java 文件），更像编排层：充值、交易、风控、启动配置。

- <strong>规模</strong>：34 个 Java 文件 / 约 2.5 千行；75 次提交
- <strong>模块</strong>：`recharge`、`trans`、`risk`、`start`
- <strong>依赖</strong>：`lita-basic` 的 Apple 内购与订单能力、`user-data-center` 的账户余额
- <strong>备注</strong>：看资金链路时不要只看这个仓库，实际逻辑大量落在 `lita-basic` 与数仓对账

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-earth</span><span class="ws-svc-role">互动玩法 / 陪玩</span><span class="ws-badge ws-badge-live">活跃</span></summary>

承担独立小游戏与陪玩相关能力：Bingo、消消乐、抽奖、爬梯、UNO、互动玩法、陪玩课程、众筹、分享等。

- <strong>规模</strong>：689 个 Java 文件 / 约 5.6 万行；1,459 次提交
- <strong>模块</strong>：`bingo`、`eliminate`、`draw`、`stairs`、`uno`、`interactive`、`playercourse`、`crowdfunding`、`users`、`recharge`、`adslink`、`h5share`
- <strong>数据</strong>：游戏下注/赔付相关表；数仓有 `dwd_game_diamond_user_wager` 等
- <strong>备注</strong>：房间内玩法在 `litaroom`，独立入口玩法更多在这个仓库，两边容易混淆

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-public</span><span class="ws-svc-role">共享能力中心 · 依赖枢纽</span><span class="ws-badge ws-badge-live">活跃</span></summary>

整个体系的「契约层 + 调用层 + 共享服务」，四个 Maven 子模块可独立发布。

- <strong>子模块</strong>：`lita-interface`（接口定义）、`lita-public-sdk`（对外 SDK）、`lita-feign`（服务间 Feign 客户端）、`lita-share-service`（共享业务服务）
- <strong>规模</strong>：3,761 个 Java 文件 / 约 17.6 万行；14,933 次提交
- <strong>发布</strong>：`deploy-all.sh`、`deploy-interface.sh`、`deploy-share-services.sh`、`deploy-datacache.sh`
- <strong>备注</strong>：15 个左右模块依赖它；改这里要评估影响面，属于「牵一发动全身」的仓库

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-basic-timer</span><span class="ws-svc-role">定时任务 / 结算 / 反作弊</span><span class="ws-badge ws-badge-maint">维护</span></summary>

承接周期性任务：榜单结算、补偿、清理、反作弊（`countercheat`）等。体量大但业务入口少，适合按任务名检索。

- <strong>规模</strong>：991 个 Java 文件 / 约 8.6 万行；3,277 次提交；最近提交 2026-07-31
- <strong>调度</strong>：XXL-JOB 为主，配合各业务服务的消费者
- <strong>备注</strong>：排查「数据为什么没结算/没发奖」时优先看这里

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">user-data-center</span><span class="ws-svc-role">用户中心（UDC）</span><span class="ws-badge ws-badge-low">低频</span></summary>

统一用户中心，应用名 `udc`。登录、用户资料、在线状态、签名、临时码、AWS 相关能力。

- <strong>规模</strong>：116 个 Java 文件 / 约 7.5 千行；199 次提交；最近提交 2026-04-01
- <strong>模块</strong>：`auth`（含 `loginauth`）、`usercenter`、`sign`、`onlines`、`tmpcode`、`aws`
- <strong>接入</strong>：其它服务通过 Nacos 的 `service-udc.yaml` 获取地址，经 Feign 调用

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">basic-main / basic-common / basic-public</span><span class="ws-svc-role">基础服务与父 POM</span><span class="ws-badge ws-badge-maint">维护</span></summary>

三个容易混淆的仓库：

- <strong>basic-main</strong>：历史上的基础主服务（用户/账户、礼物/特效、消息/通知），现在只有 28 个文件，基本是壳或遗留入口，最近提交 2026-01-15
- <strong>basic-common</strong>：基础公共库（92 个文件），被多个服务引用
- <strong>basic-public</strong>：`basic-public-parent` 统一父 POM（12 个模块继承）+ `basic-public-core`；另有 `prompts/` 存 AI 提示词

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">basic-scanner / basic-monitor-main / basic-promotion-main</span><span class="ws-svc-role">扫表 / 风控监控 / 促活</span><span class="ws-badge ws-badge-maint">维护</span></summary>

- <strong>basic-scanner</strong>：独立扫表服务，README 写明目的：减少各服务对基础资源的依赖、降低启动时间；支持 Kafka 发送；2025-11 后未更新
- <strong>basic-monitor-main</strong>：风控与内容安全：大 R 骚扰检测、敏感词/白名单、用户封禁、直播快照、声网事件日志扫描；同时连 live / funbit / udc / stats / basic 五个数据源
- <strong>basic-promotion-main</strong>：促活/增长基础服务，包名 `gg.lita.basic.promotionmain`，含 job / consumer / action / client 分层

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">cinta-user-main / cinta-user-promotion</span><span class="ws-svc-role">Cinta 产品线用户与促活</span><span class="ws-badge ws-badge-stale">停滞</span></summary>

Cinta 独立于 Lita 的用户服务与促活服务，体量都很小，最后提交停在 2025-10/11，适合作为「第二条产品线如何复用主体系」的参考。

- <strong>cinta-user-main</strong>：33 个文件 / 1.2 千行，用户服务
- <strong>cinta-user-promotion</strong>：47 个文件 / 2.2 千行，包名 `gg.lita.cinta.cintauserpromotion`

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">sms-platform / lita-score</span><span class="ws-svc-role">短信平台 / 质量分</span><span class="ws-badge ws-badge-stale">停滞</span></summary>

- <strong>sms-platform</strong>：短信与验证码，多供应商（Twilio / AWS SES / 腾讯云）互备；主类在 `world.holla.uaa`，包名与主线不同，属于历史整合代码；最近提交 2026-06-27
- <strong>lita-score</strong>：「质量分」服务，模块 `ping` / `score` / `scoreapi`（指标、定时、执行器）；README 信息极少，最近提交 2025-12-16，使用前建议确认现状

</details>

## 六、服务目录 · 场景与互动

<details class="ws-svc">
<summary><span class="ws-svc-name">litalive</span><span class="ws-svc-role">直播 / 语音房在线</span><span class="ws-badge ws-badge-live">活跃</span></summary>

房间的「在线侧」：在线状态、音视频、榜单、观看计数、停留时长、连麦、PK、混流转推。

- <strong>规模</strong>：623 个 Java 文件 / 约 3.5 万行；890 次提交
- <strong>模块</strong>：`agoramixcdn`、`miclink`、`liverank`、`livewatchcount`、`livetimestats`、`quickchat`、`livepk`、`livestreamconverter`、`liveonline`、`liveauth`、`livebaner`
- <strong>依赖</strong>：声网 Agora（`thd-agora.yaml`）、多个独立 Redis、Kafka 房间事件

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">litaroom</span><span class="ws-svc-role">房间玩法平台（funbit-room）</span><span class="ws-badge ws-badge-live">活跃</span></summary>

名字叫 room，实际是「房间里的玩法平台」：建房、礼物包、福袋、KTV、PK、家族、抽奖、转盘、屠龙、装扮、游戏中心都在这里。

- <strong>规模</strong>：2,119 个 Java 文件 / 约 15.4 万行；6,352 次提交；84 个 Controller
- <strong>模块</strong>：`createroom`、`giftpack`、`luckybag`、`luckycoin`、`ktv`、`pkv1`、`guild`、`lottery`、`spindraw`、`dragonslayer`、`dress`、`gamecenter`、`gameroom`、`shop`、`hostlevel`
- <strong>数据</strong>：家族库 `lita_family`（42 张表）；房间状态 Redis；ES 双云（AWS/阿里云 + 开关）
- <strong>备注</strong>：工作区里最「重」的服务之一；看房内玩法基本都从这里进

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-msg</span><span class="ws-svc-role">IM / 消息</span><span class="ws-badge ws-badge-live">活跃</span></summary>

私聊、房间消息、系统通知、消息校验、自动回复、关注/粉丝、主播认证等。

- <strong>规模</strong>：171 个 Java 文件 / 约 1.3 万行；960 次提交
- <strong>模块</strong>：`fastmsg`、`chatcard`、`autoresponder`、`family`、`follow`、`push`、`roomproxy`、`msgverify`、`hostcheck`、`userforbid`
- <strong>入口</strong>：应用名 `litamsg`，包名 `com.mashup.funbit.litamsg.modules`

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-push / lita-recommend / lita-command-server</span><span class="ws-svc-role">推送 / 推荐 / 长连接命令</span><span class="ws-badge ws-badge-low">低频</span></summary>

- <strong>lita-push</strong>：推送中心，含 AWS 通道、用户中心、临时码；多通道 FCM / AWS SNS / Kakao；最近提交 2026-03-16
- <strong>lita-recommend</strong>：推荐服务，模块 `recommend` + `timer`；最近提交 2025-10-23
- <strong>lita-command-server</strong>：基于 Netty 的命令/订阅服务（`com.lita.server.CommandServer`、`CommandRequestHandler`、`CommandSubscribe`），不是 Spring 体系；最近提交 2025-11-08

</details>

## 七、服务目录 · 增长与活动

<details class="ws-svc">
<summary><span class="ws-svc-name">active-main</span><span class="ws-svc-role">第一代活动单体</span><span class="ws-badge ws-badge-live">活跃</span></summary>

承载运营活动、产品活动、游戏活动。组织方式是「一个活动一个子目录」，配 `dispatch` 分发器和全局组件。

- <strong>规模</strong>：1,287 个 Java 文件 / 约 10.7 万行；2,870 次提交；41 个 Controller
- <strong>结构</strong>：`business/&lt;活动&gt;`、`dispatch/`、`component/`、`plugin/`、`consumer/`、`cron/`
- <strong>文档</strong>：`docs/specs/api/active-main/` 下 177 份接口文档
- <strong>备注</strong>：README 里有一份「已废弃包」清单：全局 controller/consumer/cron 正在迁入各活动自己的目录

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">active-v2</span><span class="ws-svc-role">第二代模块化尝试（已停止）</span><span class="ws-badge ws-badge-low">低频</span></summary>

基于 Spring Boot 3.3 + Java 21 的模块化版本，分层为 Business → Active → Module → Coordinator → 基础设施。只有 21 次提交（最后 2026-04-27），是未走通的中间版本。

- <strong>规模</strong>：255 个 Java 文件 / 约 2 万行
- <strong>关联</strong>：`game-main` 的 README 与它几乎相同，是从 v2 复制改造而来

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">active-v3</span><span class="ws-svc-role">第三代活动服务（当前方向）</span><span class="ws-badge ws-badge-live">活跃</span></summary>

当前主力演进方向：分层清晰、活动自包含、支持 GraalVM Native Image（活动期弹性扩容/冷启动优化）。

- <strong>规模</strong>：553 个 Java 文件 / 约 6.7 万行；1,402 次提交；13 个 Controller
- <strong>结构</strong>：`business/`、`active/`、`module/`、`coordinator/`、`core/`、`plugin/`；活动子包如 `home`、`pk`、`halloween`、`room`、`giftRank`、`magicbox`、`floral`、`anniversary`、`rankSettle`、`ticket`、`crazy`
- <strong>工具</strong>：仓库内自带 `.opencode/`（rules/skills/commands/standards）与按月的 `doc/` 设计文档

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-active</span><span class="ws-svc-role">老一代活动服务</span><span class="ws-badge ws-badge-live">活跃</span></summary>

Lita 的早期活动项目，体量最大：约 28.8 万行 Java、12,521 次提交。与 active 系列功能有重叠，属于历史主力。

- <strong>规模</strong>：2,898 个 Java 文件 / 约 28.8 万行
- <strong>数据</strong>：活动库 `lita_active`，约 213 张表
- <strong>备注</strong>：判断一个活动在哪：先看配置和入口服务，再按活动名在 active-main / active-v3 / lita-active 三处搜

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">game-main</span><span class="ws-svc-role">游戏服务（由 active-v2 复制）</span><span class="ws-badge ws-badge-low">低频</span></summary>

210 个 Java 文件，只有 1 次提交（2026-04-28），README 仍是 Active V2 的内容。更像初始化导入的副本，使用前先确认线上部署情况。

</details>

## 八、服务目录 · 管理与数据

<details class="ws-svc">
<summary><span class="ws-svc-name">admin-main</span><span class="ws-svc-role">Lita / Cinta 管理后台</span><span class="ws-badge ws-badge-live">活跃</span></summary>

运营、客服使用的后台服务端：配置活动、查询用户、审核内容、处理工单。

- <strong>规模</strong>：441 个 Java 文件 / 约 3 万行；617 次提交
- <strong>结构</strong>：`controller` / `service` / `business` / `consumer` / `action` / `client` / `cache` / `filter` / `interceptor`，包名 `gg.lita.admin.main`

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">admin-ai</span><span class="ws-svc-role">内部 AI 调用的接口服务</span><span class="ws-badge ws-badge-maint">维护</span></summary>

给内部 AI 系统提供结构化接口，README 明确写着「本项目完全使用 AI 开发完成，使用 OpenCode + MiniMax 2.7」。

- <strong>规模</strong>：91 个 Java 文件 / 约 9.5 千行；158 次提交
- <strong>模块</strong>：`business` 下：`taskQueue`、`file`、`feishu`、`auth`、`exchangeRate`、`fileTaskQueue`、`userAccount`
- <strong>备注</strong>：看 AI 如何参与生产代码的样本；也说明平台化 AI 接口是有意投入的方向

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">data-event / data-event-collect / data-transfer</span><span class="ws-svc-role">埋点与数据搬运</span><span class="ws-badge ws-badge-low">低频</span></summary>

- <strong>data-event</strong>：埋点服务（artifactId `event-service`），部署在阿里云；`AppEnum` 定义 Lita=1001 / Cinta=1002；最近提交 2025-11-12
- <strong>data-event-collect</strong>：从 Kafka 收集打点数据写入 ClickHouse；最近提交 2026-09-14
- <strong>data-transfer</strong>：数据搬运/同步，包名 `gg.lita.data.datatransfer`，含 fetcher / business / plugin / admin；最近提交 2026-01-08
- <strong>dwh-api</strong>：Go 版数仓 API（26 个 Go 文件），只有 1 次提交（2024-06-14），属于试验/归档

</details>

## 九、服务目录 · 资源与框架

<details class="ws-svc">
<summary><span class="ws-svc-name">lita-resource-center</span><span class="ws-svc-role">资源与配置中心</span><span class="ws-badge ws-badge-maint">维护</span></summary>

向客户端下发动态资源与配置，包含文件上传、KV、房间号、敏感词、灰度词、多语言资源、资源检查、TTS、签名等。

- <strong>规模</strong>：176 个 Java 文件 / 约 9.1 千行；203 次提交
- <strong>模块</strong>：`fileupload`、`kv`、`roomidcenter`、`graywords`、`locale_resource`、`sensitivewords`、`resourcecheck`、`texttospeech`、`sign`
- <strong>关联</strong>：另一个 Python 服务 `lita-resource` 负责压缩并上传 S3

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-resource</span><span class="ws-svc-role">资源压缩上传（Python）</span><span class="ws-badge ws-badge-maint">维护</span></summary>

工作区里少数非 Java 服务：`main.py`、`compressor.py`、`s3_client.py`、`schemas.py`，负责资源压缩与上传 S3。只有 7 次提交，最后 2026-07-08。

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">lita-framework</span><span class="ws-svc-role">Lita Web 基础框架</span><span class="ws-badge ws-badge-maint">维护</span></summary>

新体系的微服务基础设施标准：网关过滤器与 Session 注入、trace id 与 user id 日志、Nacos 配置、Feign 调用透传、Prometheus 监控、Swagger 文档。

- <strong>规模</strong>：116 个 Java 文件 / 约 9.7 千行
- <strong>结构</strong>：`web`（框架本体）、`web-parent-pom`（父 POM）、`web-example`（示例）
- <strong>备注</strong>：想知道「一个新服务默认该有哪些能力」，读 README 的能力清单即可

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">funbit-framework / funbit-api</span><span class="ws-svc-role">老一代框架与单体</span><span class="ws-badge ws-badge-live">活跃</span></summary>

- <strong>funbit-framework</strong>：老框架，父 POM 名 `mashup-parent`；1,136 个文件 / 约 9 万行
- <strong>funbit-api</strong>：老一代业务单体：`funbit`（服务端）、`funbit-mgr`、`funbit-score`、`funbit-service`，另有 `data-graph` 与 `docs`；3,301 个文件 / 约 34.4 万行，19,652 次提交，仍在更新
- <strong>备注</strong>：老代码包名 `com.mashup.funbit.*`；新代码 `gg.lita.*`。这是判断代码年龄最快的方法

</details>
<details class="ws-svc">
<summary><span class="ws-svc-name">docs / scripts / skills</span><span class="ws-svc-role">团队知识、脚本与 AI 技能</span><span class="ws-badge ws-badge-live">活跃</span></summary>

- <strong>docs</strong>：团队知识中枢：`standards/`（规范）、`specs/api/`（188 份接口）、`data/`（2,451 份表文档 + 12 篇业务知识）、`skills/`（AI 技能）、VitePress 站点
- <strong>scripts</strong>：Node/TypeScript 自动化脚本仓库，接入平台执行，脚本按输出协议上报；含 `.test.ts` 测试用例
- <strong>skills</strong>：AI 可调用技能定义（`public/` 下 6 个 Python 文件）

</details>

## 十、新平台 WorkHub

`work` 是与 Lita 主体系并行演进的新平台：以 AI 为中心的项目管理平台，后端 NestJS + PostgreSQL， 前端 React 19，另有 `executor-bridge` 与 `appium-agent` 两个工作区成员。 它不在 Lita 微服务体系内，但同属这个工作区，代表团队从「Java 微服务」向「AI 原生平台」的另一条线。

| 维度 | 数据 |
| --- | --- |
| 后端 | NestJS（strict TS），581 个文件 / 约 12.8 万行 |
| 前端 | React 19 + 组件库，148 个文件 / 约 5 万行 |
| 数据 | PostgreSQL（69 个实体、93 个迁移），pgvector 知识库 |
| 核心能力 | 机器人体系、任务状态机、工单工作流、MCP 开放层、知识库、飞书集成 |

[→ 展开看 WorkHub 的完整手册](./lita-work.html)

## 十一、数据体系

### 业务库与数仓

| 库 / 层 | 定位 | 表数 |
| --- | --- | --- |
| `funbit` | 业务主库：用户、订单、交易、礼物、充值 | 732 |
| `lita_basic` | 基础服务：基础功能、游戏、抽奖 | 815 |
| `lita_stats` | 统计报表、监控、日志 | 604 |
| `lita_active` | 活动数据 | 213 |
| `lita_family` | 家族、成员、等级、积分 | 42 |
| ODPS | 离线数仓（ODS/DWD/DWS/ADS） | 38 |

`docs/data/tables/` 为每张表建了文档（2,451 份），按库分目录。看业务最直接的方式： 先看表名与字段，再回到对应服务找写入点。

### 两条事件链路

| 维度 | `data-event` | `basic-user-event` |
| --- | --- | --- |
| 定位 | 分析用打点服务 | 业务用用户行为事件 |
| 部署 | 阿里云 | AWS（与业务同云） |
| 时效 | 有延迟 | 实时 |
| 可靠性 | 可能丢消息 | 业务级可靠 |
| 用途 | 报表、数仓 | 发奖、实时决策 |

> 为什么拆两条：分析能容忍最终一致，业务发奖不能。同一个「事件」在两个场景下要求的时延与可靠性不同， 硬用一个系统通常两头都做不好。

### 数仓分层与查询纪律

- <strong>ODS</strong> 原始层 → <strong>DWD</strong> 明细层 → <strong>DWS</strong> 汇总层 → <strong>DIM</strong> 维度层 → <strong>ADS</strong> 应用层。
- 典型明细表：`dwd_gift_send`、`dwd_play_order`、`dwd_game_diamond_user_wager`。
- 典型汇总表：`dws_gift_send_sender`、`dws_play_order_player`、`dws_voice_room_stay_time`。
- 关键维度表：`dim_user_first_last_action`（首次/末次进房、送礼、下单、充值）。

`docs/data/knowledge/` 的 `KNOWLEDGE.md` 用 `must_follow` 写死了查询规则： 先查分层速查表、禁止直接查 DWD/ODS、月度/周度/日度必须用 DWS、DAU 必须用 `fact_dau_snapshot_a`、 DWD/DWS 必须带 `dt` 分区、用户查询必须过滤 `is_fake = FALSE`。 这是把数仓经验固化成可执行检查清单的典型案例。

## 十二、工程机制

### docs 仓库：规范、契约与数据

| 目录 | 内容 |
| --- | --- |
| `standards/` | 命名、后端风格、前端风格、Git 工作流、API 规范、Java 规范、Markdown 规范；要求带 Good/Bad 示例 |
| `specs/api/` | 188 份接口文档（Swagger 自动生成），`active-main` 占 177 |
| `data/` | 2,451 份表文档、12 篇业务知识、报表脚本 |
| `skills/` | AI 可调用技能：`api-lita`、`mysql-lita` 等 |
| `command/` | 可复现的操作指令（更新 API 目录、按 Swagger 更新文档） |

docs 的 README 第一句是「AI 助手提示：…请务必先索引并遵循本项目中的 Markdown 指南」——文档的第一读者被设定为 AI，这直接影响了文档写法：必须结构化、带示例、可检索。

### 代码与发布

- <strong>多仓库</strong>：每个服务独立 Git 仓库，独立发布、独立权限；跨服务改动要提多个 MR。
- <strong>统一父 POM</strong>：新服务继承 `basic-public-parent`（12 个模块引用），老服务用 `mashup-parent` / `web-parent-pom`。
- <strong>容器化</strong>：几乎每个服务都有 `Dockerfile`，镜像推 AWS ECR（新加坡），部分老服务用 `Procfile`。
- <strong>发布脚本随仓库走</strong>：`deploy.sh`、`publish/` 目录；环境用 Spring Profile + Nacos namespace 区分。
- <strong>提交规范</strong>：Conventional Commits（`feat:` / `fix:` / `docs:` …）。

### AI 辅助研发

- 多个仓库有 `AGENTS.md` / `CLAUDE.md` / `.opencode/` / `.clinerules`，为 AI 工具提供项目级约束。
- `admin-ai` 是「100% AI 开发」的样本（OpenCode + MiniMax 2.7）。
- `docs/skills/` 把「调 API」「查 MySQL」封装成 AI 可调用的原子技能，并要求数据查询必须走受控工具。
- 活动 v3 仓库内自带 `.opencode/rules`、`skills`、`commands`、`standards`，把 AI 工作流纳入仓库。

### 测试与质量

单测覆盖不普遍（`spring-boot-starter-test` 仅约 9 个模块引用），部分测试还依赖 Nacos（surefire 注入 `NACOS_GROUP=local`）。质量保障更依赖规范约束、代码评审和线上监控告警，而不是自动化测试。

## 十三、架构演进

### 主线：funbit 单体 → lita 服务群

| 世代 | 代表 | 包名 | 特征 |
| --- | --- | --- | --- |
| funbit 时代 | `funbit-api`、`funbit-framework`、`litaroom/funbit-room` | `com.mashup.funbit.*` | 单体 + 老框架；从单体拆出的服务保留老包名 |
| lita 时代 | `lita-public`、`lita-basic`、`litalive`、`active-*` | `gg.lita.*`（新）/ `com.mashup.funbit.*`（沿旧） | Spring Boot 3.3 + Java 21、统一父 POM、共享层 |

演进是渐进的：老单体仍在更新（`funbit-api` 最后提交 2026-11-20），新服务逐个迁移。所以代码里会同时看到两套框架、两套包名、两套命名。

### 活动系统三代

| 代 | 文件数 | Controller | 提交 | 状态 |
| --- | --- | --- | --- | --- |
| `active-main` | 1,287 | 41 | 2,870 | 维护中，业务仍在跑 |
| `active-v2` | 255 | — | 21 | 已停止，未走通 |
| `active-v3` | 553 | 13 | 1,402 | 活跃，当前方向 |

演进逻辑：从「全局 controller/consumer/cron + 一活动一目录」转向「活动自包含 + 统一分层 + Native Image」。v3 用更少的代码和更少的 Controller 支撑同类业务，说明抽象层级提高了。

### 基础服务拆分与共享层

- `basic-scanner`：把扫表能力独立，减少各服务对基础资源的依赖、降低启动时间。
- `basic-monitor-main`：把监控/风控从基础服务里拆出，独立演进。
- `basic-user-event`：为了业务发奖的实时性与可靠性，专门做一个事件服务，而不是复用分析打点。
- `lita-public`：把接口定义、SDK、Feign 客户端、共享服务分层，解决「每个服务各自定义 DTO」的问题。
- `basic-public`：统一父 POM，让新服务开箱即得统一依赖与插件。

### 数据库演进

从「`funbit` 什么都有」到按域拆库：`lita_basic`（表数已超过主库）、 `lita_stats`（统计剥离）、`lita_active`（活动独立）、`lita_family`（家族独立）。 新业务基本落在新库，老库处于维护状态。

## 十四、阅读路线

### 第一次系统了解（建议 5–7 天）

1.  <strong>第 1 天：全局</strong>——本文 + `docs/README.md` + `docs/standards/`，先知道规范与文档在哪。
2.  <strong>第 2 天：用户与基础</strong>——`user-data-center` + `lita-basic`，理解账户、余额、礼物、订单的基础模型。
3.  <strong>第 3 天：主场景</strong>——`litalive` + `litaroom`，跟一遍「建房 → 上麦 → 送礼 → 榜单」。
4.  <strong>第 4 天：交易</strong>——`lita-payment` + `lita-basic` 的充值/订单模块 + 数仓充值表。
5.  <strong>第 5 天：增长</strong>——`active-v3` 的目录结构 + `active-main` 的 README 技术债清单，理解活动怎么组织。
6.  <strong>第 6 天：数据</strong>——`docs/data/knowledge/` 的 12 篇业务知识 + 分层速查表。
7.  <strong>第 7 天：工程</strong>——`lita-framework` + `basic-public` + 一个服务的 `bootstrap.yml`，搞清楚配置、注册、发布。

### 按问题定位

- <strong>房间怎么建、怎么上麦</strong>`litaroom/funbit-room` 的 `createroom`；`litalive` 的 `miclink`、`liveonline`
- <strong>礼物怎么配、怎么送</strong>`lita-basic` 的 `appgiftcache` / `giftbroadcast` / `giftevent`
- <strong>订单怎么走</strong>`lita-payment` 的 `trans` / `recharge`；`lita-basic` 的 `flashorder`
- <strong>活动怎么配</strong>`active-v3` 的 `business/` 与 `active/`；`docs/specs/api/active-main/`
- <strong>数据从哪来</strong>`data-event` → Kafka → `data-event-collect` → ClickHouse / ODPS
- <strong>用户为什么被封</strong>`basic-monitor-main` 的 `UserRemoveService` / 敏感词模块
- <strong>推送没收到</strong>`lita-push` 的通道模块；`lita-basic` 的 `kakaopush`
- <strong>客户端配置在哪改</strong>`lita-resource-center` 的 `kv` / `graywords` / `locale_resource`
- <strong>新服务怎么接</strong>继承 `basic-public-parent`，引入 `lita-framework` 与 `lita-public`，按 `bootstrap.yml` 接 Nacos 共享配置

## 十五、术语与常见问题

### 术语

| 术语 | 含义 |
| --- | --- |
| locale | 大区：`in` / `ph` / `vi` / `ko` / `zh` |
| 大 R | 高价值付费用户，业务上以 VIP 等级分层（阈值见数据知识文档） |
| 陪玩 | 付费购买陪玩师服务（按小时/按局），下单 → 接单 → 服务 → 结算 |
| 家族 / Guild | 社交留存结构：成员、等级、积分、任务、家族 PK |
| 宝箱 / 盲盒 | 送礼后开出额外奖励的玩法 |
| 闪单 | 快速匹配/速配订单（`flashorder`） |
| 混流转推 | 把 RTC 房间音频转推到 CDN，供非 RTC 观众收听（`agoramixcdn`） |
| trace id | 贯穿网关与各服务的请求标识，日志与 HTTP 调用自动透传 |
| Nacos namespace | 环境隔离：`lita-local` / `lita-test` / `lita-prod` |
| ODS/DWD/DWS/DIM/ADS | 数仓分层：原始 → 明细 → 汇总 → 维度 → 应用 |
| Feign | 声明式 HTTP 客户端，服务间调用统一走 `lita-feign` |

### 常见问题

### 为什么有两套包名？

老代码来自 funbit 单体，包名 `com.mashup.funbit.*`；新服务用 `gg.lita.*`。另外还有 `com.mashup.udc`（用户中心）、`com.mashup.resource`（资源中心）、`com.lita`（命令服务），是各服务独立演进的结果。

### 为什么活动有三四个服务？

历史演进：`lita-active`（早期主力）→ `active-main`（单体化统一）→ `active-v2`（模块化尝试，停止）→ `active-v3`（当前方向）。活动是收入核心，迭代最频繁，所以留下了最明显的演进痕迹。

### 为什么 `lita-payment` 这么小？

它更像资金链路的编排层，实际能力分散在 `lita-basic`（Apple 内购、订单、优惠券）和 `user-data-center`（账户余额）。排查资金问题要跨这三个仓库看。

### 为什么数据有两条链路？

分析场景（`data-event`，阿里云，允许延迟与丢失）与业务场景（`basic-user-event`，AWS，实时可靠）目标不同。拆开比硬塞进一个系统更可靠。

### 新服务从哪里开始看？

先看 `lita-framework` 的能力清单和 `basic-public-parent` 的依赖管理，再看目标服务的 `bootstrap.yml`（共享配置）、`pom.xml`（依赖）、`modules` 包（业务）。

### 文档在哪？

团队文档在 `docs` 仓库（VitePress）：规范在 `standards/`，接口在 `specs/api/`，数据在 `data/`，操作指令在 `command/`。

## 十六、服务速查表

| 仓库 | 分组 | 应用 / 入口 | 规模（Java 文件） | 最近提交 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `lita-basic` | 交易基础 | `lita-basic-api` | 2,553 | 2026-11-13 | 活跃 |
| `lita-payment` | 交易基础 | `lita-payment-api` | 34 | 2026-11-12 | 活跃 |
| `lita-earth` | 交易基础 | `lita-earth-api` | 689 | 2026-10-29 | 活跃 |
| `lita-public` | 交易基础 | 4 个子模块 | 3,761 | 2026-11-20 | 活跃 |
| `lita-basic-timer` | 交易基础 | `lita-basic-timer` | 991 | 2026-07-31 | 维护 |
| `user-data-center` | 交易基础 | `udc` | 116 | 2026-04-01 | 低频 |
| `basic-main` | 交易基础 | — | 28 | 2026-01-15 | 低频 |
| `basic-common` | 交易基础 | — | 92 | 2026-10-16 | 活跃 |
| `basic-public` | 交易基础 | 父 POM + core | 207 | 2026-09-21 | 维护 |
| `basic-scanner` | 交易基础 | — | 22 | 2025-11-12 | 停滞 |
| `basic-monitor-main` | 交易基础 | — | 89 | 2026-10-12 | 活跃 |
| `basic-promotion-main` | 交易基础 | — | 143 | 2026-10-19 | 活跃 |
| `cinta-user-main` | 交易基础 | — | 33 | 2025-10-31 | 停滞 |
| `cinta-user-promotion` | 交易基础 | — | 47 | 2025-11-06 | 停滞 |
| `sms-platform` | 交易基础 | `funbit-sms` | 133 | 2026-06-27 | 维护 |
| `lita-score` | 交易基础 | `lita-score-api` | 66 | 2025-12-16 | 停滞 |
| `litalive` | 场景互动 | `litalive-api` | 623 | 2026-10-31 | 活跃 |
| `litaroom` | 场景互动 | `funbit-room` | 2,119 | 2026-11-19 | 活跃 |
| `lita-msg` | 场景互动 | `litamsg` | 171 | 2026-10-26 | 活跃 |
| `lita-push` | 场景互动 | `lita-push-api` | 151 | 2026-03-16 | 低频 |
| `lita-recommend` | 场景互动 | `lita-recommend-api` | 72 | 2025-10-23 | 停滞 |
| `lita-command-server` | 场景互动 | `lita-command` | 58 | 2025-11-08 | 停滞 |
| `active-main` | 增长活动 | — | 1,287 | 2026-11-18 | 活跃 |
| `active-v2` | 增长活动 | — | 255 | 2026-04-27 | 低频 |
| `active-v3` | 增长活动 | — | 553 | 2026-10-28 | 活跃 |
| `lita-active` | 增长活动 | `lita-active-api` | 2,898 | 2026-11-19 | 活跃 |
| `game-main` | 增长活动 | — | 210 | 2026-04-28 | 低频 |
| `admin-main` | 管理数据 | `admin-main` | 441 | 2026-10-19 | 活跃 |
| `admin-ai` | 管理数据 | — | 91 | 2026-09-18 | 维护 |
| `data-event` | 管理数据 | `event-service` | 26 | 2025-11-12 | 停滞 |
| `data-event-collect` | 管理数据 | — | 45 | 2026-09-14 | 维护 |
| `data-transfer` | 管理数据 | — | 136 | 2026-01-08 | 低频 |
| `dwh-api` | 管理数据 | Go 服务 | 0（Go 26 文件） | 2024-06-14 | 归档 |
| `lita-resource-center` | 资源框架 | `lita-resource-api` | 176 | 2026-06-25 | 维护 |
| `lita-resource` | 资源框架 | Python 服务 | 0（Python 8 文件） | 2026-07-08 | 维护 |
| `lita-framework` | 资源框架 | `web` | 116 | 2026-09-28 | 维护 |
| `funbit-framework` | 资源框架 | `mashup-parent` | 1,136 | 2026-09-17 | 维护 |
| `funbit-api` | 资源框架 | `funbit`/`mgr`/`score`/`service` | 3,301 | 2026-11-20 | 活跃 |
| `docs` | 资源框架 | VitePress | — | 2026-08-24 | 维护 |
| `scripts` | 资源框架 | Node/TS | — | 2026-10-22 | 活跃 |
| `skills` | 资源框架 | Python | — | — | — |
| `work` | 新平台 | NestJS + React | —（TS 约 17.7 万行） | 2026-11-20 | 活跃 |

本文为个人整理的项目手册，非公司官方文档。仓库、代码量、提交时间来自本地工作区统计（2026-11-23）， 会随代码更新而变化；具体接口、表结构与业务规则以仓库和 `docs` 仓库为准。

[← 返回项目档案](./index.html)
