## 这个域解决什么问题

陪玩交易把「用户需求」与「陪玩师服务」连接起来：用户浏览技能、下单、支付，陪玩师接单、履约，平台完成结算与风控。

它和充值、订单、风控绑在一起，是资金链路最密集的域，也是排查「钱去哪了」时最常进的域。

## 一次交易链路

浏览陪玩师 / 技能 → 下单（按小时 / 按局）→ 支付 → 陪玩师接单 → 服务进行 → 完成确认 → 平台结算 / 分成。

## 服务与模块

### lita-earth：陪玩侧

| 模块 | 职责 |
| --- | --- |
| `playercourse` | 陪玩师课程 / 技能 |
| `users` | 陪玩师资料 |
| `recharge` | 陪玩相关充值 |
| `crowdfunding` | 众筹玩法 |
| `interactive` | 互动玩法 |
| `bingo` / `eliminate` / `draw` / `stairs` / `uno` | 独立小游戏 |
| `adslink` / `h5share` | 投放 / 分享 |

### lita-basic：交易基础

| 模块 | 职责 |
| --- | --- |
| `flashorder` | 闪单 / 速配 |
| `coupon` | 优惠券 |
| `apple` | Apple 内购校验 |
| `chargequery` | 充值查询 |
| `diamond` | 钻石账户 |
| `friend` | 好友 / 关系 |

### lita-payment：资金

| 模块 | 职责 |
| --- | --- |
| `recharge` | 充值 |
| `trans` | 交易 |
| `risk` | 风控 |

## 充值与支付

- 应用内购买（IPA）与第三方渠道并存
- 数仓里 <code>channel in (1, 2)</code> 表示 IPA 充值
- 多币种、多支付厂商；支付回调必须幂等
- 支付成功与入账要可对账，异常走补单

## 订单与结算

| 场景 | 表 |
| --- | --- |
| 订单明细 | `dwd_play_order` |
| 订单每日明细 | `dws_play_order_detail` |
| 用户订单汇总 | `dws_play_order_user` |
| 陪玩师订单汇总 | `dws_play_order_player` |
| 充值明细 | `dwd_recharge` |
| 用户充值汇总 | `dws_recharge_user` |
| 用户月充值 | `dws_recharge_user_month` |

首次下单 / 完单看 <code>dim_user_first_last_action.first_order_time</code>、<code>first_complete_time</code>；首次充值看 <code>first_recharge_time</code>。

## 风控

- <strong>支付风控</strong>：异常渠道、频次、金额
- <strong>订单风控</strong>：刷单、虚假履约
- <strong>退款 / 拒付</strong>：需要状态机与对账

## 技术点与坑

- <strong>回调幂等</strong>：唯一订单号 + 状态机，重复回调不能重复入账
- <strong>金额单位</strong>：用最小货币单位，避免浮点
- <strong>结算分层</strong>：明细与汇总两层，支持按用户 / 陪玩师 / 天复盘
- <strong>海外合规</strong>：多币种、税务、渠道差异

## 阅读路径

1. <code>lita-earth</code> 的 <code>playercourse</code> / <code>users</code>
2. <code>lita-basic</code> 的 <code>flashorder</code> / <code>apple</code> / <code>chargequery</code>
3. <code>lita-payment</code> 的 <code>recharge</code> / <code>trans</code> / <code>risk</code>
4. <code>docs/data/knowledge/ORDER.md</code>、<code>RECHARGE.md</code>
