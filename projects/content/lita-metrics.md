## 先看结论

这一页把 Lita 的<strong>业务指标</strong>和<strong>技术指标</strong>放在同一张快照里，方便对外介绍、面试复盘和容量评估时直接引用。业务数据取 <strong>2026-11-23</strong>（最近一个完整自然日），技术数据取 <strong>2026-11-24 12:34 CST</strong> 的实时 Prometheus 快照。

<div class="ws-stats">
  <div class="ws-stat"><span>DAU · 11-23</span><b>22,166</b><small>14 日均值 22,008</small></div>
  <div class="ws-stat"><span>MAU · 近 30 天</span><b>250,970</b><small>DAU/MAU 8.8%</small></div>
  <div class="ws-stat"><span>11 月获客安装</span><b>232,130</b><small>注册 101,839</small></div>
  <div class="ws-stat"><span>实时 QPS</span><b>884.9</b><small>24h 峰值 1,346.8</small></div>
  <div class="ws-stat"><span>周充值</span><b>48.45M</b><small>金币 · 8,976 付费用户</small></div>
</div>

五条最值得记住的结论：

- <strong>印尼是绝对基本盘</strong>：占 DAU 74.9%、11 月安装 77.0%、周充值 78.0%，区域策略先看印尼。
- <strong>韩国是小而高价值的市场</strong>：DAU 只占 2.8%，却贡献 7.5% 的周充值，ARPPU 约 14,700 金币，是印尼的 2.7 倍。
- <strong>增长偏买量</strong>：11 月安装中 72.0% 来自付费安装，整体注册率 43.9%；买量到注册之间还有提升空间。
- <strong>消费集中、房间渗透中等</strong>：语音房 DAU 占 37.2%，但当天送礼用户只占 DAU 6.7%；周充值 98.6% 来自老用户。
- <strong>技术侧稳定</strong>：5xx 为 0%，平均延迟 6.84 ms；但只有 avg/max，没有 p95 分桶，容量评估还需要补 histogram。

## 数据口径与快照

| 指标组 | 口径 | 数据源 | 时间 |
| --- | --- | --- | --- |
| DAU | 按 `user_id` 去重 | `lita_stats.dau` | 2026-11-23 |
| MAU | 近 30 天按 `user_id` 去重 | `lita_stats.dau` | 2026-10-25 ~ 11-23 |
| WAU | 近 7 天按 `user_id` 去重 | `lita_stats.dau` | 2026-11-17 ~ 11-23 |
| 安装 / 注册 | `period='daily'`，按 region 汇总 | `lita_stats.user_statsx` | 2026-11-01 ~ 11-23 |
| 充值 | `period='weekly'`，按 region 汇总 | `lita_stats.recharge_stats` | 周键 2026-11-16 |
| 送礼 | 按 `day_key` 过滤，去重用户/房间 | `lita_stats.room_gift_send_stats` | 2026-11-23 |
| 活动 | `locale='all'`，按活动配置汇总 | `lita_stats.active_stats_day` | 2026-11-23 |
| QPS / 延迟 | 5 分钟 rate，聚合全部 HTTP 服务 | 生产 Prometheus | 2026-11-24 12:34 CST |
| 代码 / 库规模 | 本地工作区 + `information_schema` | 仓库统计 / 只读库 | 2026-11-23 |

> 说明：`dau` 是分析表口径，`login_dau` 是登录事件表口径，两者相差 53 人（0.2%），本文统一用 `dau`。业务数据不使用 11-24 的未完整数据。

## 用户规模与活跃

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| DAU | 22,166 | 2026-11-23，按用户去重 |
| MAU | 250,970 | 近 30 天，按用户去重 |
| WAU | 83,152 | 近 7 天，按用户去重 |
| DAU/MAU | 8.8% | 日活占月活 |
| WAU/MAU | 33.1% | 周活占月活 |
| 登录 DAU | 22,219 | 登录事件表口径，与 DAU 相差 0.2% |
| 玩家 DAU | 4,763 | 占 DAU 21.5% |
| 非玩家 DAU | 17,403 | 占 DAU 78.5% |

DAU 近两周在 2.05 万 ~ 2.44 万之间，11-15 和 11-22 两个周日出现峰值；最近 7 天均值 22,141，比前 7 天的 21,874 高 1.2%。

<div class="ws-chart">
  <div class="ws-chart-head"><span>DAU · 2026-11-10 → 11-23</span><span>基线 19,000 · 峰值 24,436</span></div>
  <div class="ws-chart-row"><span>11-10</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:31.4%"></i></span><span class="ws-chart-val">20,707</span></div>
  <div class="ws-chart-row"><span>11-11</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:28.3%"></i></span><span class="ws-chart-val">20,538</span></div>
  <div class="ws-chart-row"><span>11-12</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:38.5%"></i></span><span class="ws-chart-val">21,093</span></div>
  <div class="ws-chart-row"><span>11-13</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:50.7%"></i></span><span class="ws-chart-val">21,754</span></div>
  <div class="ws-chart-row"><span>11-14</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:71.6%"></i></span><span class="ws-chart-val">22,890</span></div>
  <div class="ws-chart-row"><span>11-15</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:100%"></i></span><span class="ws-chart-val">24,436</span></div>
  <div class="ws-chart-row"><span>11-16</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:49.7%"></i></span><span class="ws-chart-val">21,702</span></div>
  <div class="ws-chart-row"><span>11-17</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:49.5%"></i></span><span class="ws-chart-val">21,690</span></div>
  <div class="ws-chart-row"><span>11-18</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:45.9%"></i></span><span class="ws-chart-val">21,493</span></div>
  <div class="ws-chart-row"><span>11-19</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:45.3%"></i></span><span class="ws-chart-val">21,463</span></div>
  <div class="ws-chart-row"><span>11-20</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:46.0%"></i></span><span class="ws-chart-val">21,498</span></div>
  <div class="ws-chart-row"><span>11-21</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:65.4%"></i></span><span class="ws-chart-val">22,557</span></div>
  <div class="ws-chart-row"><span>11-22</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:94.2%"></i></span><span class="ws-chart-val">24,119</span></div>
  <div class="ws-chart-row"><span>11-23</span><span class="ws-chart-track"><i class="ws-chart-fill" style="width:58.2%"></i></span><span class="ws-chart-val">22,166</span></div>
</div>

> 柱长按 19,000–24,436 映射，只用于看趋势，不表示从 0 起的绝对比例。

### 区域分布

| 地区 | DAU | 占 DAU | 角色 |
| --- | --- | --- | --- |
| 印尼 ID | 16,591 | 74.9% | 基本盘 |
| 越南 VN | 2,097 | 9.5% | 第二市场 |
| 菲律宾 PH | 1,312 | 5.9% | 稳定补充 |
| 马来西亚 MY | 1,122 | 5.1% | 稳定补充 |
| 韩国 KR | 624 | 2.8% | 高 ARPPU |
| 其它 | 420 | 1.9% | 日本、新加坡等 |

## 获客与注册

11 月前 23 天累计安装 232,130、注册 101,839，整体注册率 43.9%；日均安装约 10,093、日均注册约 4,428。这里的「月获」按月度安装/注册口径，月活见上一节。

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 安装 | 232,130 | 11-01 ~ 11-23 |
| 注册 | 101,839 | 注册率 43.9% |
| 自然安装 | 64,946 | 占安装 28.0% |
| 付费安装 | 167,184 | 占安装 72.0% |
| 11-23 安装 | 11,641 | 当日 |
| 11-23 注册 | 4,981 | 注册率 42.8% |

### 安装的区域结构

| 地区 | 安装 | 注册 | 注册率 | 安装占比 |
| --- | --- | --- | --- | --- |
| 印尼 ID | 178,691 | 78,941 | 44.2% | 77.0% |
| 越南 VN | 20,666 | 8,729 | 42.2% | 8.9% |
| 菲律宾 PH | 12,856 | 6,376 | 49.6% | 5.5% |
| 马来西亚 MY | 10,839 | 4,543 | 41.9% | 4.7% |
| 韩国 KR | 1,975 | 766 | 38.8% | 0.9% |
| 其它 | 7,103 | 2,484 | 35.0% | 3.1% |

菲律宾的注册率最高（49.6%），韩国最低（38.8%）；印尼贡献了超过四分之三的安装量，获客结构高度集中。

## 收入与付费

周键 2026-11-16 的周充值合计 <strong>48,447,808 金币</strong>，付费用户 <strong>8,976</strong>；按周会材料的 149.3 coins/USD 估算，约 <strong>32.45 万美元/周</strong>。

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 周充值 | 48,447,808 coins | 周口径 |
| 付费用户 | 8,976 | 周去重 |
| ARPPU | 5,397 coins | 约 $36.2/周 |
| ARPU（按 WAU） | 583 coins | 约 $3.9/周 |
| 付费率（/WAU） | 10.8% | 周付费用户 / WAU |
| 付费率（/MAU） | 3.6% | 周付费用户 / MAU |
| 新用户充值 | 673,763 coins | 占 1.4% |
| 老用户充值 | 47,774,045 coins | 占 98.6% |

### 收入的区域结构

| 地区 | 周充值 coins | 占比 | 付费用户 | ARPPU |
| --- | --- | --- | --- | --- |
| 印尼 ID | 37,775,581 | 78.0% | 6,961 | 5,426 |
| 韩国 KR | 3,616,261 | 7.5% | 246 | 14,700 |
| 越南 VN | 2,840,679 | 5.9% | 685 | 4,146 |
| 马来西亚 MY | 1,752,477 | 3.6% | 520 | 3,370 |
| 菲律宾 PH | 1,300,080 | 2.7% | 401 | 3,242 |
| 其它 | 1,162,730 | 2.4% | 163 | 7,133 |

韩国用 2.8% 的 DAU 贡献了 7.5% 的充值，ARPPU 约 14,700 金币；印尼贡献 78.0% 的充值，但 ARPPU 只有 5,426 金币。前五个地区合计占周充值的 97.6%。

## 送礼与房间消费

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 送礼金币 | 4,211,649 coins | 2026-11-23 |
| 送礼用户 | 1,479 | 占 DAU 6.7% |
| 有送礼房间 | 202 | 当天有送礼记录的房间 |
| 人均送礼 | 2,847 coins | 金币 / 送礼用户 |
| 每房间均值 | 20,850 coins | 金币 / 有送礼房间 |
| 语音房 DAU | 8,239 | 占 DAU 37.2% |
| 登录 DAU | 22,219 | 登录事件口径 |

房间侧呈现「进房率不低、付费送礼集中」的结构：37.2% 的 DAU 进入语音房，但只有 6.7% 的 DAU 发生送礼；202 个有送礼的房间承担了当天的全部送礼金币。

## 活动参与

2026-11-23 有 3 个活动配置产生统计数据，合计参与用户 156 人、活动总量 1,472,363、金币流水 117,435。

| 活动配置 | 参与用户 | 活动总量 | 金币流水 |
| --- | --- | --- | --- |
| 89 | 10 | 275,000 | 0 |
| 94 | 7 | 35,081 | 5,083 |
| 96 | 139 | 1,162,282 | 112,352 |
| 合计 | 156 | 1,472,363 | 117,435 |

配置 96 贡献了 89.1% 的参与用户、78.9% 的活动总量和 95.7% 的金币流水，是当天的主力活动；配置 89 和 94 的参与规模都在 10 人左右。

> `active_stats_day.all_total` 在不同活动类型下可能表示积分、抽奖次数或流水，跨配置比较时只看量级，不把它当作统一收入口径。

## 技术指标

| 指标 | 数值 | 口径 |
| --- | --- | --- |
| 实时 QPS | 884.9 | 5 分钟 rate |
| 24 小时峰值 QPS | 1,346.8 | 1 分钟步长取最大值 |
| 平均延迟 | 6.84 ms | sum / count |
| 最大观测延迟 | 1.38 s | `http_server_requests_seconds_max` |
| 4xx 比例 | 0.052% | 5 分钟 rate |
| 5xx 比例 | 0% | 5 分钟 rate |
| 采集 job | 44 | Prometheus |
| 采集 target | 346（344 up） | Prometheus `up` |
| 估算日请求量 | 约 7,645 万 | QPS × 86,400，仅作量级参考 |

当前 QPS 约 885，24 小时峰值约 1,347；平均延迟 6.84 ms，最大观测 1.38 s；4xx 约 0.05%，5xx 为 0。Prometheus 共有 44 个采集 job、346 个 target，其中 344 个在线。

> 延迟只有 avg 和 max，没有 histogram bucket，因此无法给出 p95/p99；容量评估时应补充分位数指标。

## 工程与数据规模

| 维度 | 数值 | 说明 |
| --- | --- | --- |
| Git 仓库 | 42 个 | 独立仓库，非 monorepo |
| Java 文件 | 22,873 | 不含 `target/` |
| Java 代码 | 约 179 万行 | 含空行与注释 |
| 业务域 | 18 个 | 用户、房间、直播、礼物、支付、活动等 |
| 表文档 | 2,451 份 | 文档仓库口径，不等于在线表数量 |
| API 契约 | 188 份 | Swagger 自动生成 |
| `funbit` 库 | 836 张表 / 4.0 TB | `information_schema` 统计 |
| `lita_stats` 库 | 678 张表 / 2.3 TB | 统计与报表库 |

两个已统计的库合计约 6.3 TB；`funbit` 是老单体主库，表数量和体量都最大，`lita_stats` 则承载 DAU、安装、充值、送礼和活动等统计表。

## 观察与限制

### 可以怎么读

- <strong>区域高度集中</strong>：印尼同时是 DAU、安装和收入的第一大来源；越南、菲律宾、马来西亚是第二梯队，韩国是低 DAU、高 ARPPU 的补充市场。
- <strong>增长依赖买量</strong>：72.0% 的安装是付费安装，注册率 43.9%；如果自然安装占比提升，获客成本结构会明显不同。
- <strong>活跃稳定但粘性一般</strong>：DAU/MAU 8.8%、WAU/MAU 33.1%，DAU 在 2.2 万附近波动，周日有明显峰值。
- <strong>收入靠老用户</strong>：周充值 98.6% 来自老用户，新用户只贡献 1.4%；付费率按 WAU 约 10.8%，按 MAU 约 3.6%。
- <strong>消费与房间渗透不匹配</strong>：37.2% 的 DAU 进语音房，但只有 6.7% 的 DAU 送礼；房间内消费转化还有空间。
- <strong>技术侧健康</strong>：5xx 为 0%，平均延迟 6.84 ms；但缺少 p95，且 346 个 target 中有 2 个离线，需要结合告警确认是否为采集端噪声。

### 口径限制

- 业务数据取最近完整日 2026-11-23；11-24 的数据不完整，未纳入。
- `login_dau` 与 `dau` 相差 53 人（0.2%），属于事件表与分析表的口径差异，不影响趋势判断。
- 分区域注册率存在个别异常（例如泰国安装 1,238、注册 0），汇总注册率以总量为准。
- 金币兑美元按 149.3 coins/USD 估算，实际渠道价格、区域定价和分成会影响真实收入。
- QPS/延迟只覆盖接入 Prometheus 的 HTTP 服务，不等同于网关或第三方调用的全量请求。
- 留存率、LTV、ROI 需要登录明细、买量花费和归因数据，本次快照未做估算；只读统计视图也没有现成留存表。
- 代码量、仓库数、表文档和 API 契约来自本地工作区与文档仓库，统计截止 2026-11-23。

## 复现方式

业务指标可在 `lita_stats` 只读库执行：

```sql
-- DAU / MAU / WAU
SELECT COUNT(DISTINCT user_id) FROM dau WHERE date = 20261123;
SELECT COUNT(DISTINCT user_id) FROM dau WHERE date BETWEEN 20261025 AND 20261123;
SELECT COUNT(DISTINCT user_id) FROM dau WHERE date BETWEEN 20261117 AND 20261123;

-- 11 月获客
SELECT SUM(install), SUM(register), SUM(organic_install), SUM(pa_install)
FROM user_statsx
WHERE date BETWEEN 20261101 AND 20261123 AND period = 'daily';

-- 周充值
SELECT SUM(total_coin), SUM(new_user_coin), SUM(old_user_coin), SUM(total_user)
FROM recharge_stats
WHERE date = 20261116 AND period = 'weekly';

-- 当日送礼
SELECT SUM(total_coin), COUNT(DISTINCT user_id), COUNT(DISTINCT room_id)
FROM room_gift_send_stats
WHERE day_key >= 202611230000 AND day_key < 202611240000;
```

技术指标可在 Prometheus 执行：

```promql
# 实时 QPS
sum(rate(http_server_requests_seconds_count[5m]))

# 平均延迟（毫秒）
sum(rate(http_server_requests_seconds_sum[5m]))
  / sum(rate(http_server_requests_seconds_count[5m])) * 1000

# 24 小时峰值 QPS
max_over_time(sum(rate(http_server_requests_seconds_count[5m]))[24h:1m])

# 5xx 比例
sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
  / sum(rate(http_server_requests_seconds_count[5m])) * 100
```

> 所有查询均为只读；生产凭据不进入页面、不写入仓库。
