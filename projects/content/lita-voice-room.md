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
- <strong>停留数据核对</strong>：<code>dwd_once_room_stay_time</code> → <code>dws_voice_room_stay_time</code>
