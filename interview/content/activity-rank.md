## 一句话

`mod_common_rank_record` 不是一张"排行榜结果表"，而是一张 **append-only（只追加）的记账表**：每次加分插一条流水，唯一键做幂等，Redis 存结果，DB 存事实。

---

## 1. 表结构：流水 + 快照

```sql
create table mod_common_rank_record
(
    id           bigint auto_increment primary key,
    biz          varchar(32)  not null,  -- 业务
    topic        varchar(64)  not null,  -- 榜单场景
    player       varchar(128) not null,  -- 排行目标：用户/房间/家族/CP
    contributor  varchar(128),           -- 贡献者
    `key`        varchar(64)  not null,  -- 空间：日榜/总榜/阶段
    locale       varchar(16),            -- 大区
    trans_no     varchar(200) not null,  -- 业务流水号
    amount       decimal(16,2) not null, -- 本次增加
    total_amount decimal(16,2) not null, -- 增加后的累计
    extra        varchar(256),
    create_time  bigint       not null,
    unique key idx_biz_trans (biz, topic, trans_no),
    key idx_biz_player (biz, topic, player, id)
);
```

**关键设计**

- **只追加**：不 update 旧记录；每次 `amount` 插一条，`total_amount` 存"这次加完后的累计快照"。
- **唯一键**：`(biz, topic, trans_no)` 是幂等闸门；同一业务流水重复消费，第二次 insert 直接 `DuplicateKey`。
- **查询索引**：`(biz, topic, player, id)` 支持"某玩家最新一条"和"某玩家流水"。
- **贡献者**：`contributor` 让榜单支持"谁给这个玩家贡献了多少"。

---

## 2. 写入链路：锁 + 事务 + 唯一键

`ModCommonRankService.increase()`：

1. **Redis 锁**：`ModCommonRankRecord:increase:{biz}:{topic}:{key}:{player}`，`SETNX` + 1 秒 TTL，抢不到就 `sleep(10ms)` 自旋。
2. **查最新记录**：`getLatestRecord` 取该 player 在该 key 下的最后一条。
3. **算新累计**：`newTotal = latest.totalAmount + amount`（没有历史则等于 `amount`）。
4. **插入流水**：`trans_no` 唯一键冲突 → 说明已处理，返回 `null`。
5. **更新贡献者**：写 player→contributor、contributor→player 两个 Redis 维度。
6. **更新结果缓存**：把最新 `totalAmount` 写到 `ModCommonRankResultRedis`。
7. **释放锁**：`finally` 删除 Redis key。

**为什么先锁再查再插？**

- 同一 player 的并发加分，如果两个请求都读到同一个 `latest`，会算出一样的 `totalAmount`，后写覆盖前写，导致少加。
- 锁把"读 latest → 算 total → insert"变成串行；唯一键再兜底重复流水。

**技术难点 / 风险**

- 锁 TTL 只有 1 秒：如果事务执行超过 1 秒，锁可能提前过期，并发仍可能穿透；更稳的做法是 Redisson 看门狗续期。
- 自旋锁会占线程；高并发下要评估等待时间，必要时改成分段锁 / 本地锁 + Redis 锁。
- `increase()` 捕获所有异常返回 `null`，调用方必须判断 `null`，否则会"以为加上了"。
- Redis 结果更新在 DB 事务内，Redis 不是事务资源；极端情况下 DB 回滚、Redis 已更新，需要 `syncResult` 重建。

---

## 3. 查询链路：Redis 结果 + SQL 窗口函数

**在线读**

- TopN、玩家排名、贡献者榜都走 `ModCommonRankResultRedis`，不直接扫流水表。
- `getTopNWithContributors`、`getTopNContributors`、`getTopNPlayersOfContributor` 分别支持"带贡献者的榜""某玩家的贡献者""某贡献者支持的玩家"。

**落库查 / 结算查**

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

两层 `ROW_NUMBER()`：

- 内层：每个 player 取 `total_amount` 最大、`create_time` 最早的一条（最新快照）。
- 外层：按 `total_amount DESC, create_time ASC` 排名，解决同分排序。

**重建**

- `syncResult(biz, topic, locale, key)`：从 DB 取每个 player 的最新记录，清 Redis，重写。
- `syncAllResult(biz)`：按 `DISTINCT topic/key/locale` 全量重建。
- `transferData()`：旧 Redis → 新 Redis 的迁移任务。

---

## 4. 贡献者：player ↔ contributor 双向

`increaseContributor()` 写两个 Redis 维度：

- `player → contributors`：这个玩家是谁撑起来的，用于"玩家榜 + 贡献者 TopN"。
- `contributor → players`：这个贡献者支持了哪些玩家，用于"贡献者视角"。

**用途**

- 陪玩榜 / 家族榜 / CP 榜：不仅要看玩家收了多少，还要看谁贡献的。
- 活动结算：按排名发奖时，可以给"玩家 + 贡献者"分别发奖。

**注意**

- 贡献者数据只写 Redis，不落流水表（`contributor` 字段在记录里有，但聚合在 Redis）。
- Redis 丢失后，贡献者维度需要从流水重新聚合，不能只靠 `syncResult` 恢复结果榜。

---

## 5. 这张表的取舍

**优点**

- 流水可追溯：每次加分有 `trans_no`、`amount`、`total_amount`、时间。
- 幂等简单：唯一键就是闸门，不依赖"先查后写"。
- 查询快：在线读 Redis，DB 只做事实和重建。
- 支持贡献者、分空间（key）、分大区（locale）。

**代价 / 坑**

- 表会一直增长：需要归档 / 分区 / 清理策略。
- `trans_no` 唯一键是 `(biz, topic, trans_no)`，不包含 `key/player/locale`；同一 `trans_no` 不能在不同 key 复用，业务流水号必须全局唯一。
- `getLatestRecord` 只按 `biz/topic/player/key` 查，不带 `locale`；如果同一 key 跨大区共用，需要确认隔离口径。
- 锁 TTL 1 秒、自旋等待、异常吞掉，都是高并发下要盯的点。
- Redis 结果与 DB 事实可能短暂不一致；要有重建 / 对账任务。

---

## 6. 面试怎么讲

**"这个排行榜怎么设计的？"**

> 不是一张结果表，是一张只追加的记账表：每次加分插一条流水，`trans_no` 唯一键做幂等，`total_amount` 存累计快照；在线读 Redis 结果，DB 用窗口函数取每个玩家最新一条再排名；贡献者用 Redis 双向维度支持"谁撑起了谁"。

**"并发加分怎么保证不丢？"**

> 先按 `biz/topic/key/player` 加 Redis 锁，把"读 latest → 算 total → insert"串行；唯一键 `(biz, topic, trans_no)` 再兜底重复流水。锁 TTL 1 秒、自旋 10ms，高并发下要评估锁续期和等待成本。

**"Redis 和 DB 不一致怎么办？"**

> DB 是事实，Redis 是结果缓存；有 `syncResult` / `syncAllResult` 可以从流水重建。贡献者维度是 Redis 聚合，丢了要回放流水，所以流水表不能随便删。

**"这个设计有什么问题？"**

> 表会一直涨，要归档；`trans_no` 唯一键粒度是 biz/topic，跨 key 不能复用；锁 TTL 和异常吞掉是风险点；Redis 结果更新在 DB 事务内，极端情况下要重建。
