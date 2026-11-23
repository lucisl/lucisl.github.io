## 这个域解决什么问题

活动是平台拉收、拉活、拉留存的主要手段：把签到、任务、PK、榜单、抽奖、召回、节日主题这些玩法，组织成有目标、有奖励、有周期的运营动作。

Lita 的活动分三类（来自 <code>active-main/README.md</code>）：

- <strong>运营活动</strong>：周年庆、节日、用户召回、邀请等
- <strong>产品活动</strong>：礼物活动、荣耀等级、游戏排行榜等
- <strong>游戏活动</strong>：游戏任务、游戏成就、游戏段位等

## 服务地图

| 服务 | 定位 | 规模 | 状态 |
| --- | --- | --- | --- |
| `active-main` | 第一代活动单体，业务主力 | 1,287 个 Java 文件 / 41 个 Controller / 2,870 次提交 | 活跃 |
| `active-v3` | 第三代模块化活动服务 | 553 个文件 / 13 个 Controller / 1,402 次提交 | 活跃 |
| `active-v2` | 第二代模块化尝试 | 255 个文件 / 21 次提交 | 已停止 |
| `lita-active` | 老一代活动服务 | 2,898 个文件 / 12,521 次提交 | 活跃 |
| `game-main` | 由 `active-v2` 复制的游戏服务 | 210 个文件 / 1 次提交 | 低频 |

补充规模：<code>docs/specs/api/active-main/</code> 下有 <strong>177 份接口文档</strong>，是整个文档仓库最大的接口族；活动库 <code>lita_active</code> 约 <strong>213 张表</strong>。

## 代码怎么组织

### active-main：一活动一目录

```text
business/
  dailycheck/       # 每日签到
  invite/           # 邀请
  userrecall202508/ # 用户召回
  pk/               # PK
  roomrank2026/     # 房间榜
  monopoly/         # 大富翁
  ...
dispatch/           # 活动分发器
component/          # 数据源、Redis、安全等全局配置
```

README 里有一份明确的「已废弃包」清单：全局的 <code>controller</code>、<code>consumer</code>、<code>cron</code>、<code>dispatch/bizdispatcher</code> 正在迁入各个活动自己的目录。理解这条改造方向，就能理解 v3 为什么是现在这样。

### active-v3：五层结构

```text
business/     # 业务编排
active/       # 每个活动一个子包（home / pk / halloween / room / giftRank / magicbox …）
module/       # 可复用模块
coordinator/  # 协调器
core/         # 基础设施
```

活动内部自带接口、消费者、定时任务，避免不同活动互相干扰；支持 GraalVM Native Image，适合活动期弹性扩容。

## 代表活动（按目录代号）

| 目录 | 玩法方向 |
| --- | --- |
| `dailycheck` | 每日签到 |
| `invite` | 邀请拉新 |
| `userrecall202508` | 用户召回 |
| `pk` | 双阵营 / 家族 PK |
| `roomrank2026` | 房间排行榜 |
| `monopoly` | 大富翁 |
| `dragonslayer` | 屠龙 |
| `goldenfishery` | 黄金渔场 |
| `magic` | 魔法 / 抽奖 |
| `constellation` | 星座主题 |
| `lovecontest` | 情侣 / 爱心榜 |
| `karaoke` | K 歌 |
| `fest2025` | 年度盛典 / 节日 |
| `halloween` | 万圣节 |
| `familygold202509` | 家族金币 |
| `risingstars` | 新星 / 新人榜 |
| `secretaction` | 神秘活动 |
| `gamebox` / `gameroom` / `gamegrade` | 游戏活动 / 游戏房间 / 游戏段位 |

> 目录名是代码里的活动代号，具体玩法以活动配置和产品文档为准。

## 一次活动的生命周期

配置活动 → 入口 / 报名 → 任务 / 签到 / 抽奖 → 榜单累计 → 结算 → 发奖 / 补发 → 数据回流。

几个关键点：

- <strong>配置与代码分离</strong>：运营改配置即可调整档位、奖励、时间，不用发版
- <strong>榜单</strong>：通常用 Redis ZSet 实时累计，结算落库并补发
- <strong>补发与对账</strong>：活动结束必须有补发机制，避免漏奖
- <strong>数据</strong>：活动数据进 <code>lita_active</code>，分析走数仓

## 技术点与坑

- <strong>活动即模块</strong>：新活动复制一个目录，自带接口 / 消费者 / 定时任务
- <strong>Redis 纪律</strong>：<code>active-main</code> README 要求统一使用全局 Redis 配置，禁止单独配置
- <strong>接口收敛</strong>：v3 的 Controller 从 41 降到 13，统一入口分发
- <strong>Native Image</strong>：v3 支持，冷启动更快，适合活动峰值
- <strong>新老并存</strong>：<code>lita-active</code> 仍在跑，定位一个活动要三处搜

## 阅读路径

1. <code>active-main/README.md</code>：三类活动、目录规范、技术债清单
2. <code>active-v3/src/main/java/gg/lita/active/v3/active</code>：挑一个活动看完整分层
3. <code>docs/specs/api/active-main/</code>：看接口契约
4. <code>docs/data/knowledge/</code>：活动相关表与指标口径
