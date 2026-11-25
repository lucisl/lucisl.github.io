## 一句话

`mod_common_rank_record` 的价值不是"一张排行榜表"，而是**一套通用排行榜引擎的账本**：用 `biz / topic / key / locale / player / contributor` 六个维度，覆盖 PK、房间榜、家族榜、用户榜、CP 榜、日榜 / 总榜 / 阶段榜、贡献者榜等所有榜单场景。

---

## 1. 先看亮点：一张表怎么覆盖 N 个榜单

把六个字段当成"榜单坐标"：

| 维度 | 含义 | 例子 |
|---|---|---|
| `biz` | 业务线 / 活动 | `pk-v202608`、`room-rank-2026` |
| `topic` | 榜单场景 / 阶段 | `player_in_100_46`、`room`、`family_in_50_20`、`user`、`couple` |
| `key` | 空间 / 周期 / 阶段 | `20260821`（日榜）、`-`（总榜）、`stage-1` |
| `locale` | 大区 | `in` / `ph` / `vi` / `ko` / `zh` |
| `player` | 被排名实体 | userId / roomId / familyId / cpId |
| `contributor` | 贡献者 | 送礼人 / 陪玩师 / 家族成员 |

**同一个 `mod_common_rank_record`，换一组坐标就是另一个榜单：**

| 场景 | biz | topic | key | locale | player | contributor |
|---|---|---|---|---|---|---|
| PK 陪陪日榜 | `pk-v202608` | `player_in_100_46` | `20260821` | `in` | `userId` | `supporterId` |
| PK 陪陪总榜 | `pk-v202608` | `player_in_100_46` | `-` | `in` | `userId` | `supporterId` |
| 房间日榜 | `pk-v202608` | `room` | `20260821` | `in` | `roomId` | `-` |
| 家族阶段榜 | `pk-v202608` | `family_in_50_20` | `20260821` | `in` | `familyId` | `userId` |
| 用户总榜 | `pk-v202608` | `user` | `-` | `in` | `userId` | `-` |
| CP 榜 | `pk-v202608` | `couple` | `-` | `in` | `cpId` | `userId` |
| 贡献者榜 | `pk-v202608` | `player_in_100_46` | `20260821` | `in` | `supporterId` | `-` |

**这就是设计亮点：**

- 新增一个榜单，不需要建新表、不需要加字段；只需要新增一组 `biz/topic/key` 配置。
- 实体类型由 `player` 决定：用户、房间、家族、CP 都是字符串，模型不绑死业务对象。
- 周期/阶段由 `key` 决定：日榜、总榜、阶段榜是同一个模型的不同 key。
- 大区由 `locale` 决定：一套活动可以按大区隔离榜单。
- 贡献关系由 `contributor` 决定：同一个账本同时支持"玩家榜"和"贡献者榜"。

**面试一句话**

> 它不是"为 PK 写的一张表"，是"一个六维坐标的排行榜引擎"：biz 定业务、topic 定场景、key 定周期、locale 定大区、player 定实体、contributor 定贡献关系；新榜单只加坐标，不改表结构。

---

## 2. 账本模型：append-only + total_amount 快照

```sql
create table mod_common_rank_record
(
    id           bigint auto_increment primary key,
    biz          varchar(32)  not null,
    topic        varchar(64)  not null,
    player       varchar(128) not null,
    contributor  varchar(128),
    `key`        varchar(64)  not null,
    locale       varchar(16),
    trans_no     varchar(200) not null,
    amount       decimal(16,2) not null, -- 本次增加
    total_amount decimal(16,2) not null, -- 增加后的累计
    extra        varchar(256),
    create_time  bigint       not null,
    unique key idx_biz_trans (biz, topic, trans_no),
    key idx_biz_player (biz, topic, player, id)
);
```

**为什么是 append-only**

- 每次加分插一条流水，不 update 旧记录：可审计、可回放、可重建。
- `total_amount` 是"这次加完后的累计快照"，查最新值不用 sum 全表。
- `trans_no` 唯一键做幂等：重复消息 / 重复请求第二次 insert 直接冲突。
- `extra` 存扩展信息，不破坏主模型。

**代价**

- 表会一直增长：需要按 `biz/topic/create_time` 归档、分区或清理。
- 流水多了以后，重建 / 对账要控制扫描范围。

---

## 3. 写链路：锁 + 事务 + 唯一键

`ModCommonRankService.increase()`：

1. **Redis 锁**：`ModCommonRankRecord:increase:{biz}:{topic}:{key}:{player}`，`SETNX` + 1 秒 TTL，抢不到 `sleep(10ms)` 自旋。
2. **查最新记录**：`getLatestRecord` 取该 player 在该 key 下的最后一条。
3. **算新累计**：`newTotal = latest.totalAmount + amount`（没有历史则等于 `amount`）。
4. **插入流水**：`trans_no` 唯一键冲突 → 已处理，返回 `null`。
5. **更新贡献者**：写 `player → contributor`、`contributor → player` 两个 Redis 维度。
6. **更新结果缓存**：把最新 `totalAmount` 写到 `ModCommonRankResultRedis`。
7. **释放锁**：`finally` 删除 Redis key。

**为什么需要锁**

- 同一 player 并发加分：两个请求都读同一个 `latest`，会算出一样 `totalAmount`，后写覆盖前写 → 少加。
- 锁把"读 latest → 算 total → insert"串行；唯一键再兜底重复流水。

**技术难点 / 风险**

- 锁 TTL 只有 1 秒：事务超过 1 秒锁可能提前过期，并发仍可能穿透；更稳是 Redisson 看门狗续期。
- 自旋锁占线程：高并发要评估等待时间，必要时分段锁 / 本地锁 + Redis 锁。
- `increase()` 捕获所有异常返回 `null`：调用方必须判断 `null`，否则会"以为加上了"。
- Redis 结果更新在 DB 事务内：Redis 不是事务资源；极端情况下 DB 回滚、Redis 已更新，需要 `syncResult` 重建。

---

## 4. 读链路：Redis ZSet + 时间 tie-break

### 4.1 Redis key 设计

```text
玩家榜：       common:rank:{biz}:{topic}:{locale}:{key}
玩家→贡献者：  common:rank:p2c:{biz}:{topic}:{key}:{player}
贡献者→玩家：  common:rank:c2p:{biz}:{topic}:{key}:{contributor}
```

- 玩家榜是 ZSet：member = `player`，score = 累计值 + 时间 tie-break。
- 贡献者两张 ZSet 是"关系图"：一个玩家有哪些贡献者，一个贡献者支持了哪些玩家。
- `getTopN` 用 `reverseRangeWithScores`；`get` 用 `score` + `reverseRank`。

### 4.2 分数编码：金额 + 时间 tie-break

`ModCommonRankResultRedis.update()` 不是直接写 `totalAmount`，而是：

```java
score = totalAmount + (40 * 864000.0) / (timestamp - BASE_TIME)
```

- `BASE_TIME = 2026-01-01`；时间越早，`delta` 越小，`baseA/delta` 越大。
- 效果：**金额相同时，越早达到的排名越高**，和 SQL `ORDER BY total_amount DESC, create_time ASC` 一致。
- 金额先 `×100` 再 `÷100`，保留两位精度；tie-break 约 0.001 量级，不会影响金额排序。

**设计亮点**

- 一个 ZSet 同时表达"金额排序 + 同分时间排序"，不用额外字段/二次排序。
- Redis 排名和 DB 窗口函数排名口径一致，重建后不会因为同分顺序不同而错位。

**坑**

- `getTopN` 取 score 后 `setScale(0, DOWN)` 会截断小数；如果金额有角/分，需要确认口径。
- tie-break 依赖 `timestamp` 单调性；如果乱序写入，同分排序可能和预期不一致。

### 4.3 DB 侧：窗口函数 + 重建

```sql
SELECT t.player, t.total_amount
FROM (
  SELECT r.*,
         ROW_NUMBER() OVER (
           PARTITION BY player
           ORDER BY total_amount DESC, create_time ASC
         ) AS rn
  FROM mod_common_rank_record r
  WHERE biz = ? AND topic = ? AND `key` = ? AND locale = ?
) t
WHERE t.rn = 1
ORDER BY t.total_amount DESC, t.create_time ASC
LIMIT ?;
```

- 内层：每个 player 取最新快照。
- 外层：按金额 + 时间排名。
- `syncResult` / `syncAllResult`：从流水重建 Redis；Redis 丢了 / 口径变了 / 活动回滚都能恢复。

---

## 5. 贡献者：两张 ZSet 组成关系图

`contributor` 字段 + 两张 Redis ZSet：

- `p2c:{biz}:{topic}:{key}:{player}`：这个玩家的贡献者榜单。
- `c2p:{biz}:{topic}:{key}:{contributor}`：这个贡献者支持的玩家榜单。

**用途**

- 玩家榜展示"谁撑起了这个玩家"。
- 结算时按 `AWARD_CONTRIBUTORS` 给贡献者发奖。
- 贡献者视角的榜单 / 战报 / 家族贡献。

**批量读**

- `getContributors` 用 `executePipelined` 一次取多个玩家的 Top3 贡献者，避免 N+1。

**坑**

- 贡献者只写 Redis，不落流水聚合；Redis 丢了这个维度要回放流水重建，不能只靠 `syncResult` 恢复结果榜。

---

## 6. 配置化：RankModule + YAML

`SimpleRankDispatchConfig`：

- `localeAware`：是否区分大区。
- `localeIsolated`：查询结果是否按大区隔离。
- `awards`：排名 → 奖励清单。

在活动 YAML 里，一个榜单就是一个模块实例：

```yaml
modules:
  player_in_100_46:
    module: RankModule
    configuration:
      topic: player_in_100_46
      playerType: USER
      startTime: ...
      finishTime: ...
      mainRound:
        settles:
          - strategy: PLAYER_LIST
            topN: 100
          - strategy: AWARD
            topN: 10
            settleAward:
              awardName: player_in_100_46
          - strategy: AWARD_CONTRIBUTORS
            topN: 10
            settleAwardContributors:
              contributorFromRank: 1
              contributorToRank: 1
              awardName: player_in_100_46-contributor
```

**新榜单 = 新配置**

- 复制一段 YAML，改 `topic/key/playerType/awards` 就是一个新榜单。
- 不需要写新的 Mapper / Service / 表。
- 结算策略 `PLAYER_LIST` / `AWARD` / `AWARD_CONTRIBUTORS` 直接复用。

---

## 7. 设计亮点总结

1. **六维坐标建模**：`biz/topic/key/locale/player/contributor` 把"业务、场景、周期、大区、实体、贡献关系"拆成正交维度，一套模型覆盖所有榜单。
2. **事件溯源-lite**：append-only 流水 + `total_amount` 快照，既能审计/重放，又能 O(1) 查最新值。
3. **幂等写入**：`(biz, topic, trans_no)` 唯一键 + `DuplicateKey` 直接返回，重复消息不重复加分。
4. **读写分离**：DB 存事实，Redis ZSet 存结果；在线读 Redis，重建读 DB。
5. **时间 tie-break 编码**：一个 ZSet 同时表达金额排序和同分时间排序，和 SQL 口径一致。
6. **贡献者关系图**：p2c / c2p 两张 ZSet 支持玩家榜、贡献者榜、贡献者结算。
7. **可重建**：`syncResult` / `syncAllResult` 从流水恢复 Redis，活动回滚 / 口径调整有兜底。
8. **配置化接入**：RankModule + YAML，新榜单只加配置，不写新表/新服务。

---

## 8. 这套设计的边界 / 坑

- **表增长**：append-only 会一直涨；要按 `biz/topic/create_time` 归档、分区、清理。
- **唯一键粒度**：`(biz, topic, trans_no)` 不含 `key/player/locale`；同一 `trans_no` 不能跨 key 复用，业务流水号必须全局唯一。
- **locale 假设**：`getLatestRecord` 只按 `biz/topic/player/key` 查，不带 `locale`；如果同一 key 跨大区共用，需要确认隔离口径。
- **锁 TTL**：1 秒 TTL + 10ms 自旋，没有看门狗；长事务 / 高并发要评估。
- **双写一致性**：DB 事务内更新 Redis；极端情况下要 `syncResult` 重建。
- **贡献者丢失**：贡献者维度只在 Redis，丢了要回放流水，不能只重建结果榜。
- **热点**：单个热门 player / 榜单 ZSet 可能成热点 Key；要评估 Redis 集群 slot、拆分、限流。
- **精度**：金额 `×100` 再 `÷100`、`setScale(0, DOWN)` 截断；有角/分要确认口径。
- **顺序**：tie-break 依赖 timestamp 单调；乱序写入可能影响同分排序。

---

## 9. 面试怎么讲

**30 秒版**

> 我们把排行榜做成一个六维坐标的通用引擎：`biz` 定业务、`topic` 定场景、`key` 定周期、`locale` 定大区、`player` 定实体、`contributor` 定贡献关系。DB 是 append-only 账本，`trans_no` 唯一键做幂等；Redis 是结果缓存，score 用"金额 + 时间 tie-break"编码；新榜单只加 YAML 配置，不建新表。

**2 分钟版**

> 写入先按 `biz/topic/key/player` 加 Redis 锁，读 latest、算 total、插流水；唯一键兜底重复。读走 Redis ZSet，score 编码保证同分时越早排名越高，和 DB 的 `ROW_NUMBER()` 口径一致；Redis 丢了可以用 `syncResult` 从流水重建。贡献者用 p2c/c2p 两张 ZSet 做关系图，结算时按 `AWARD_CONTRIBUTORS` 给贡献者发奖。这套模型支撑 PK、房间、家族、用户、CP、日榜/总榜/阶段榜，新增场景只加配置。

**追问：这算亮点吗？**

> 单看一张表不算；亮点是"坐标建模 + 账本 + 幂等 + 读写分离 + 时间 tie-break + 贡献者图 + 可重建 + 配置化"组合起来，让一个新榜单从"建表写服务"变成"加一组坐标和 YAML"。

**追问：有什么问题？**

> 表会涨、锁 TTL 1 秒、`trans_no` 粒度是 biz/topic、locale 没进 latest 查询、贡献者只在 Redis、金额精度和热点 Key 都要治理；这些是这套设计的边界。
