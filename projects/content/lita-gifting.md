## 这个域解决什么问题

送礼是平台最核心的消费动作：用户用虚拟货币购买礼物，在语音房 / 直播间送出，触发特效、广播、榜单、家族积分、宝箱奖励，最终形成主播 / 陪玩师收益。

它同时是「钱」和「体验」：扣费必须准，特效和广播必须快，榜单必须实时，开奖必须可审计。

## 一次送礼链路

礼物配置 → 用户购买 / 持有 → 房间内送出 → 扣费与幂等 → 全屏特效 / 广播 → 榜单 / 家族积分 → 宝箱 / 盲盒开奖 → 收益结算。

## 服务与模块

### lita-basic：礼物主逻辑

| 模块 | 职责 |
| --- | --- |
| `appgiftcache` | 礼物配置缓存 |
| `giftevent` | 送礼事件 |
| `giftbroadcast` | 礼物广播 |
| `giftpackage` | 礼物包 |
| `blindpack` | 盲盒 |
| `effect` | 全屏特效 |
| `equip` | 装扮 / 佩戴 |
| `diamond` | 钻石账户 |
| `collectbox` | 宝箱 / 收集 |
| `chatlottery` | 聊天抽奖 |
| `billionareclub` | 富豪榜 / 大 R 玩法 |

### litaroom：房内玩法

| 模块 | 职责 |
| --- | --- |
| `giftpack` | 房内礼物包 |
| `luckybag` | 福袋 |
| `luckycoin` | 幸运币 |
| `newusergift` | 新人礼 |
| `welcome` | 欢迎 / 进场特效 |
| `celebration` | 庆祝 / 全服广播 |
| `weekwinner` | 周榜 / 周冠军 |

## 礼物类型

- <strong>普通礼物</strong>：直接送出，计入榜单
- <strong>盲盒 / 礼物包</strong>：送出后开奖
- <strong>宝箱</strong>：送礼累计 / 活动产出，开启得奖励
- <strong>福袋 / 幸运币</strong>：房间内互动玩法
- <strong>装扮 / 头卡</strong>：身份展示型消费
- <strong>活动礼物</strong>：配合活动任务 / 榜单

## 数据与指标

| 场景 | 表 |
| --- | --- |
| 送礼明细 | `dwd_gift_send` |
| 送礼详情 | `dws_gift_send_detail` |
| 用户送礼汇总 | `dws_gift_send_sender` |
| 用户宝箱开启 | `dws_gift_send_open_user` |
| 大区宝箱开启 | `dws_gift_send_open_locale` |

关键字段：

- <code>room_source</code> 区分 <code>voiceroom</code> / <code>liveroom</code>
- 首次送礼看 <code>dim_user_first_last_action.first_gift_time</code>
- 首次在语音房送礼看 <code>first_room_gift_time</code>

## 技术难点

- <strong>高频写 + 高价值</strong>：扣费、库存、幂等、事务一致性
- <strong>广播与特效</strong>：不能阻塞主链路，失败要降级
- <strong>榜单</strong>：实时累计 + 定时结算 + 补发
- <strong>宝箱概率</strong>：配置化、可审计、防刷
- <strong>多端一致性</strong>：客户端展示与实际扣费要对账

## 阅读路径

1. <code>lita-basic</code> 的 <code>gift*</code>、<code>blindpack</code>、<code>effect</code> 模块
2. <code>litaroom</code> 的 <code>giftpack</code>、<code>luckybag</code>、<code>luckycoin</code>
3. <code>docs/data/knowledge/GIFT.md</code>
4. 活动侧的送礼任务 / 榜单：<code>active-*</code>
