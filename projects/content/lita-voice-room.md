## 这个域解决什么问题

语音房是 Lita 的主场景：用户建房、进房、上麦、连麦、送礼、打榜、退出；大房间通过混流转推成「直播」，让非 RTC 观众也能收听。

这个域同时决定三件事：<strong>实时体验</strong>（音视频、麦位、延迟）、<strong>消费场景</strong>（送礼、游戏、PK）、<strong>数据口径</strong>（停留、上麦、观看）。

## 角色与状态

- <strong>房间角色</strong>：房主 <code>owner</code>、主持 <code>host</code>、管理 <code>manage</code>、麦上用户、观众
- <strong>业务上的「主播」</strong> = host + manage + owner（数据统计也按这个口径）
- <strong>房间状态</strong>：在线、麦位、锁麦、密码房、PK 中、直播中

## 一次进房链路

创建房间 → 主播上麦 → 用户进房 → 连麦 / 互动 → 送礼 → 房间榜更新 → 退出并记录停留。

## 服务与模块

### litalive：在线侧

| 模块 | 职责 |
| --- | --- |
| `agoramixcdn` | 声网混流转推 CDN |
| `miclink` | 连麦 |
| `liveonline` / `liveonlinelist` | 在线状态 / 在线列表 |
| `liverank` / `livestreamrank` | 房间榜 / 直播榜 |
| `livewatchcount` | 观看计数 |
| `livetimestats` | 停留 / 时长统计 |
| `livepk` | 直播 PK |
| `livestreamconverter` | 流转码 |
| `liveauth` / `livebaner` / `livecategory` | 鉴权 / 横幅 / 分类 |
| `quickchat` | 快速匹配聊天 |
| `messages` | 房间消息 |
| `roominfo` | 房间信息 |

### litaroom：玩法侧

| 模块 | 职责 |
| --- | --- |
| `createroom` | 建房 |
| `pkv1` | 房间 PK |
| `ktv` | K 歌 |
| `gamecenter` / `gameroom` | 游戏中心 / 房内游戏 |
| `guild` | 家族 |
| `giftpack` / `luckybag` / `luckycoin` | 礼物包 / 福袋 / 幸运币 |
| `dress` / `themestyle` / `topcard` | 装扮 / 主题 / 头卡 |
| `onlineduration` | 在线时长 |
| `roompush` / `roomquery` | 房间推送 / 查询 |
| `hostlevel` | 主持等级 |
| `roomad` / `popup` / `welcome` | 房间广告 / 弹窗 / 欢迎 |

## 第三方依赖与边界

房间/直播不是全自研：<strong>实时音视频用声网 Agora，IM 用腾讯云 IM（TIM）</strong>，平台负责业务编排、审核、榜单与数据。

```text
客户端 ──RTC（音频 / 麦位 / 连麦 / PK）──▶ Agora 声网
客户端 ──IM（私聊 / 房间消息）──────────▶ 腾讯云 IM ◀── lita-msg（代理 / 拦截 / 审核 / 发送）
平台   ──混流转推──────────────────────▶ Agora Mix → CDN → 非 RTC 观众
```

| 能力 | 供应商 | 平台侧落点 | 说明 |
| --- | --- | --- | --- |
| 实时音视频 | Agora 声网 | `litalive` 的 `miclink` / `liveonline`；`litaroom` 的 `AgoraTokenService` | 房间音频、连麦、直播 PK；token 与频道管理 |
| 直播转推 | Agora 混流 + CDN | `litalive` 的 `agoramixcdn` / `livestreamconverter` | 把房间音频混流转推到 CDN，形成直播形态 |
| IM | 腾讯云 IM（TIM） | `lita-msg` 的 `improxy`（`TencentImClient`） | 私聊、群、房间消息；平台做代理、拦截、审核、发送 |
| 推送 | Firebase FCM / AWS SNS / Kakao | `lita-push`；`lita-basic` 的 `kakaopush` | 按大区选择通道，韩国用 Kakao |
| 对象存储 / CDN | AWS S3 / 腾讯云 CDN | `lita-resource` / `lita-resource-center` | 图片、语音、特效资源 |
| 搜索 | Elasticsearch（AWS / 阿里云） | `litaroom` 的 `thd-aws-es` / `thd-aliyun-es` | 双云 + 开关切换 |
| A/B 与开关 | GrowthBook | `litaroom` 的 `thd-resources-config-growthbook` | 房间/活动实验 |
| 监控告警 | Prometheus + 飞书 | 各服务 | 指标 + 错误日志告警 |
| 消息队列 | Kafka | 房间事件、埋点 | 事件分发 |
| 登录 / 表格 | Google | 用户与运营 | 第三方登录、Sheets 导出 |

几个容易混淆的点：

- <strong>房间和直播共用 Agora</strong>；直播只是多了一层「混流转推 CDN」，不是另一家 RTC。
- <strong>IM 是腾讯云 IM，不是 Agora</strong>：`lita-msg` 的 `improxy` 包封装了 `TencentImClient`，并做消息拦截、敏感词、限额与补偿。
- <strong>房间状态、麦位、榜单、礼物、家族积分都是自研</strong>，第三方只提供 RTC / IM / 推送 / 存储等基础能力。
- IM 的 SDKAppID / Secret 走 Nacos 或环境变量，不应写进代码仓库。

## 直播与转推

- <strong>Agora（声网）</strong>负责实时音视频，凭证走 Nacos <code>thd-agora.yaml</code>
- <code>agoramixcdn</code> 把房间音频混流转推到 CDN，形成直播形态
- 非 RTC 观众通过 CDN 收听，直播间数据与语音房分开统计
- 直播间送礼在数仓里用 <code>room_source = 'liveroom'</code> 区分，语音房是 <code>'voiceroom'</code>

## 基础设施

- <strong>多个独立 Redis</strong>：在线状态、签名、房间状态分别部署，避免一个大 Key 拖垮全部
- <strong>ES 双云</strong>：AWS / 阿里云两套 ES，用开关切换
- <strong>Kafka</strong>：房间事件分发
- <strong>WebSocket / 长连接</strong>：在线状态与房间消息

## 数据与指标

| 指标 | 表 |
| --- | --- |
| 单次停留 | `dwd_once_room_stay_time` |
| 停留时长 | `dws_voice_room_stay_time` |
| 上麦时长 | `dws_voice_room_mic_time` |
| 直播间用户详情 | `dws_live_room_user_detail` |
| 首次进房 / 首次成为主播 | `dim_user_first_last_action` |
| 直播间送礼 | `dwd_gift_send`（`room_source = 'liveroom'`） |

## 阅读路径与排查

- <strong>进房失败</strong>：<code>litalive</code> 的 <code>liveauth</code> / <code>liveonline</code> + 房间状态 Redis
- <strong>麦位 / 连麦问题</strong>：<code>miclink</code>
- <strong>直播看不到 / 卡顿</strong>：<code>agoramixcdn</code>、<code>livestreamconverter</code>
- <strong>榜单不对</strong>：<code>liverank</code> + 结算定时任务
- <strong>IM 消息问题</strong>：<code>lita-msg</code> 的 <code>improxy</code>、<code>MessageInterceptService</code>
- <strong>停留数据核对</strong>：<code>dwd_once_room_stay_time</code> → <code>dws_voice_room_stay_time</code>
