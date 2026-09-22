import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD, MARKETS, START_REWARD,
  createGame, dispatch, legalActions,
  currentRent, baseRent, baseBuildCost, landPrice, buildCost,
  netWorth, ranking, forcedBuyCost,
} from '../assets/js/monopoly-core.mjs';

const game = (over = {}) => createGame({ seed: 42, ...over });

// 测试直接改 state（plain object；dispatch 内部会克隆输入，不污染原件）
function patchPlayer0(s, patch) {
  Object.assign(s.players[0], patch);
  return s;
}
// dispatch 返回新对象，测试里跨回合取地产状态必须重新查询
const propOf = (s, tileIndex) => s.props.find((p) => p.index === tileIndex);

test('新对局：四人 6000 现金、各 3 张道具、地产全无主、平稳市况', () => {
  const s = game();
  assert.equal(s.players.length, 4);
  for (const p of s.players) {
    assert.equal(p.cash, 6000);
    assert.equal(p.bag.length, 3);
  }
  for (const prop of s.props) assert.equal(prop.owner, -1);
  assert.equal(s.market.id, 'calm');
  assert.equal(s.turn.round, 1);
  assert.equal(s.turn.phase, 'pre');
  assert.equal(s.over, null);
});

test('棋盘结构：24 格、起点唯一、12 街道 + 2 车站 + 3 事件 + 2 商店等', () => {
  assert.equal(BOARD.length, 24);
  assert.equal(BOARD[0].kind, 'start');
  const count = (kind) => BOARD.filter((t) => t.kind === kind).length;
  assert.equal(count('street'), 12);
  assert.equal(count('transit'), 2);
  assert.equal(count('event'), 3);
  assert.equal(count('shop'), 2);
  assert.equal(count('park'), 1);
  assert.equal(count('rest'), 1);
  assert.equal(count('service') + count('tax'), 2);
});

test('租金倍率表：Lv0~Lv3 依次为基础 1 / 2 / 3.5 / 5.5 倍', () => {
  const s = game();
  const tile = 22; // 天际广场 1900
  const prop = s.props.find((p) => p.index === tile);
  prop.owner = 0;
  const base = baseRent(tile);
  assert.equal(base, Math.round(1900 * 0.17));
  for (const level of [0, 1, 2, 3]) {
    prop.level = level;
    assert.equal(currentRent(s, tile), Math.round(base * [1, 2, 3.5, 5.5][level]), `Lv${level}`);
  }
});

test('集齐同色两组地段：租金 +50%；只持有一半则没有加成', () => {
  const partial = game();
  partial.props.find((p) => p.index === 1).owner = 1;
  assert.equal(currentRent(partial, 1), baseRent(1)); // 只有晨风小筑，无加成
  const full = game();
  full.props.find((p) => p.index === 1).owner = 1;
  full.props.find((p) => p.index === 2).owner = 1;
  assert.equal(currentRent(full, 1), Math.round(baseRent(1) * 1.5));
  assert.equal(currentRent(full, 2), Math.round(baseRent(2) * 1.5));
});

test('持有两座车站：车站租金翻倍（只乘一次 2）', () => {
  const s = game();
  const x = s.props.find((p) => p.index === 10);
  const y = s.props.find((p) => p.index === 23);
  x.owner = 2;
  assert.equal(currentRent(s, 10), baseRent(10));
  y.owner = 2;
  assert.equal(currentRent(s, 10), Math.round(baseRent(10) * 2));
  assert.equal(currentRent(s, 23), Math.round(baseRent(23) * 2));
});

test('经过新启程广场领取 800；定点骰决定步数', () => {
  let s = patchPlayer0(game(), { pos: 22, bag: ['aim'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 2 });
  s = dispatch(s, { type: 'roll' });
  assert.deepEqual(s.turn.dice, [2]);
  assert.equal(s.players[0].pos, 0);
  assert.equal(s.players[0].cash, 6000 + START_REWARD);
});

test('迁跃卡直达地块：不领起点奖励、替代本回合掷骰', () => {
  let s = patchPlayer0(game(), { pos: 23, bag: ['teleport'] });
  s = dispatch(s, { type: 'useItem', card: 'teleport' });
  assert.equal(s.turn.phase, 'target');
  s = dispatch(s, { type: 'chooseTarget', tile: 1 });
  assert.equal(s.players[0].pos, 1);
  assert.equal(s.players[0].cash, 6000); // 途经起点没有 +800
  assert.equal(s.turn.phase, 'offer');
  assert.equal(legalActions(s).filter((a) => a.type === 'roll').length, 0);
});

test('买地询问：现金不足只能放弃；买下按标价扣款、地产易主', () => {
  const base = patchPlayer0(game(), { pos: 0, bag: ['aim'] });
  let broke = dispatch(base, { type: 'useItem', card: 'aim', value: 1 });
  broke = dispatch(broke, { type: 'roll' });
  broke.players[0].cash = 100;
  assert.equal(broke.turn.phase, 'offer');
  const acts = legalActions(broke).map((a) => a.type);
  assert.ok(!acts.includes('buy'));
  assert.ok(acts.includes('decline'));

  let rich = dispatch(base, { type: 'useItem', card: 'aim', value: 1 });
  rich = dispatch(rich, { type: 'roll' });
  assert.equal(rich.turn.pending.price, 600);
  rich = dispatch(rich, { type: 'buy' });
  assert.equal(rich.props.find((p) => p.index === 1).owner, 0);
  assert.equal(rich.players[0].cash, 5400);
  assert.equal(rich.turn.phase, 'end');
});

test('出售建筑返还建造费 60%，出售地块返还原价 65% 并清空建筑', () => {
  let s = game();
  const prop = s.props.find((p) => p.index === 9); // 艺文长廊 1100
  prop.owner = 0;
  prop.level = 1;
  s = dispatch(s, { type: 'sellBuilding', tile: 9 });
  assert.equal(s.players[0].cash, 6000 + Math.round(baseBuildCost(9) * 0.6));
  assert.equal(propOf(s, 9).level, 0);
  s = dispatch(s, { type: 'sellTile', tile: 9 });
  assert.equal(s.players[0].cash, 6000 + Math.round(baseBuildCost(9) * 0.6) + Math.round(1100 * 0.65));
  assert.equal(propOf(s, 9).owner, -1);
});

test('支付不足时自动变现：先逐层卖建筑、再卖地块，顺序与金额正确', () => {
  let s = patchPlayer0(game(), { cash: 100, pos: 19, bag: ['aim'] });
  propOf(s, 9).owner = 0;
  propOf(s, 9).level = 1;
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' }); // 20 物业税 −450
  assert.equal(propOf(s, 9).owner, -1);
  assert.equal(propOf(s, 9).level, 0);
  assert.equal(s.players[0].cash, 100 + Math.round(baseBuildCost(9) * 0.6) + Math.round(1100 * 0.65) - 450);
  const joined = s.log.map((l) => l.text).join('\n');
  const sellBuilding = joined.indexOf('出售艺文长廊的一层建筑');
  const sellTile = joined.indexOf('出售艺文长廊，换回');
  // 日志最新在前：后发生的卖地应排在更前面
  assert.ok(sellTile >= 0 && sellTile < sellBuilding);
});

test('资不抵债：人类破产、地产归银行、当局立即结束', () => {
  let s = patchPlayer0(game(), { cash: 10, pos: 19, bag: ['aim'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' }); // 物业税 450，无资产可卖 → 破产
  assert.equal(s.players[0].bankrupt, true);
  assert.equal(s.players[0].cash, 0);
  assert.ok(s.over);
  assert.match(s.over.headline, /破产/);
});

test('破产付租：剩余现金转给房东，AI 破产不结束当局', () => {
  let s = game();
  s.props.find((p) => p.index === 1).owner = 0; // 玩家0 持有晨风小筑
  s.turn.player = 1;
  patchPlayer0(s, {});
  s.players[1].cash = 50;
  s.players[1].bag = ['aim'];
  s.players[1].pos = 0;
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' }); // 租金 102，付不出且无资产 → 破产
  assert.equal(s.players[1].bankrupt, true);
  assert.equal(s.players[1].cash, 0);
  assert.equal(s.players[0].cash, 6000 + 50); // 房东拿到破产者剩余现金
  assert.equal(propOf(s, 1).owner, 0);        // 房东自己的地产不受影响
  assert.equal(s.over, null);
});

test('免租护符抵挡租金：盾消耗、双方现金不动', () => {
  let s = game();
  s.props.find((p) => p.index === 1).owner = 1;
  s = patchPlayer0(s, { pos: 0, bag: ['aim'], shield: true });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' });
  assert.equal(s.players[0].shield, false);
  assert.equal(s.players[0].cash, 6000);
  assert.equal(s.players[1].cash, 6000);
  assert.match(s.log[0].text, /免租护符/);
});

test('翻倍收租：下一笔租金 ×2，触发后标志清除', () => {
  let s = game();
  s.props.find((p) => p.index === 1).owner = 1;
  s.players[1].rentDouble = true;
  const rent = currentRent(s, 1);
  s = patchPlayer0(s, { pos: 0, bag: ['aim'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' });
  assert.equal(s.players[0].cash, 6000 - rent * 2);
  assert.equal(s.players[1].cash, 6000 + rent * 2);
  assert.equal(s.players[1].rentDouble, false);
});

test('快建卡免费升一级、拆迁令拆对手一层', () => {
  let s = game();
  propOf(s, 1).owner = 0;
  s = patchPlayer0(s, { bag: ['fast'] });
  s = dispatch(s, { type: 'useItem', card: 'fast' });
  s = dispatch(s, { type: 'chooseTarget', tile: 1 });
  assert.equal(propOf(s, 1).level, 1);

  propOf(s, 2).owner = 2;
  propOf(s, 2).level = 2;
  s.players[0].bag = ['demolish'];
  s.turn.usedItem = false;
  s = dispatch(s, { type: 'useItem', card: 'demolish' });
  assert.ok(s.turn.pending.targets.includes(2));
  s = dispatch(s, { type: 'chooseTarget', tile: 2 });
  assert.equal(propOf(s, 2).level, 1);
});

test('强拍卡：按地块与建筑原值 135% 付款，建筑一并易主', () => {
  let s = game();
  propOf(s, 9).owner = 2;
  propOf(s, 9).level = 2;
  const cost = forcedBuyCost(s, 9);
  assert.equal(cost, Math.round((1100 + 2 * baseBuildCost(9)) * 1.35));
  s = patchPlayer0(s, { bag: ['forced'] });
  s = dispatch(s, { type: 'useItem', card: 'forced' });
  s = dispatch(s, { type: 'chooseTarget', tile: 9 });
  assert.equal(propOf(s, 9).owner, 0);
  assert.equal(propOf(s, 9).level, 2);
  assert.equal(s.players[0].cash, 6000 - cost);
  assert.equal(s.players[2].cash, 6000 + cost);
});

test('路障卡：下一位经过的对手被拦停，放置者自己经过不受影响', () => {
  let s = patchPlayer0(game(), { bag: ['road'] });
  s = dispatch(s, { type: 'useItem', card: 'road' });
  s = dispatch(s, { type: 'chooseTarget', tile: 3 });
  assert.equal(s.roads.length, 1);

  // 放置者本人走过自己的路障（借重置道具额度模拟下一回合）
  s.players[0].bag = ['aim'];
  s.players[0].pos = 1;
  s.turn.usedItem = false;
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 4 });
  s = dispatch(s, { type: 'roll' });
  assert.equal(s.players[0].pos, 5); // 2→3→4→5，越过路障格
  assert.equal(s.roads.length, 1);
  s = dispatch(s, { type: 'decline' }); // 落在林畔花园的询问
  s = dispatch(s, { type: 'endTurn' });

  // 对手走过同一格被拦停
  s.players[1].bag = ['aim'];
  s.players[1].pos = 1;
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 4 });
  s = dispatch(s, { type: 'roll' });
  assert.equal(s.players[1].pos, 3);
  assert.equal(s.roads.length, 0); // 路障消耗
});

test('双骰卡：本回合掷两颗骰子', () => {
  let s = patchPlayer0(game(), { bag: ['double'] });
  s = dispatch(s, { type: 'useItem', card: 'double' });
  s = dispatch(s, { type: 'roll' });
  assert.equal(s.turn.dice.length, 2);
  assert.ok(s.turn.dice.every((d) => d >= 1 && d <= 6));
});

test('道具目标选择可取消：不消耗道具、不占本回合道具额度', () => {
  let s = patchPlayer0(game(), { bag: ['teleport'] });
  s = dispatch(s, { type: 'useItem', card: 'teleport' });
  assert.equal(s.turn.phase, 'target');
  s = dispatch(s, { type: 'cancelTarget' });
  assert.equal(s.turn.phase, 'pre');
  assert.deepEqual(s.players[0].bag, ['teleport']);
  assert.equal(s.turn.usedItem, false);
});

test('每回合限一张道具：用过后不再出现在合法动作里', () => {
  let s = patchPlayer0(game(), { bag: ['shield', 'double'] });
  s = dispatch(s, { type: 'useItem', card: 'shield' });
  assert.equal(legalActions(s).filter((a) => a.type === 'useItem').length, 0);
});

test('付费建楼：每回合限一次、按市况计价', () => {
  let s = game();
  propOf(s, 1).owner = 0;
  const cost = buildCost(s, 1);
  s = dispatch(s, { type: 'build', tile: 1 });
  assert.equal(propOf(s, 1).level, 1);
  assert.equal(s.players[0].cash, 6000 - cost);
  assert.equal(legalActions(s).filter((a) => a.type === 'build').length, 0);
});

test('市况倍率：地产热土买价/建费 +25%、租赁潮租金 +30%', () => {
  let s = game();
  s.market = { id: 'landRush', round: 5, segment: 2 };
  assert.equal(landPrice(s, 1), Math.round(600 * MARKETS.landRush.buyMult));
  assert.equal(buildCost(s, 1), Math.round(baseBuildCost(1) * 1.25));
  s.props.find((p) => p.index === 1).owner = 1;
  s.market = { id: 'rentBoon', round: 9, segment: 3 };
  assert.equal(currentRent(s, 1), Math.round(baseRent(1) * 1.3));
});

// 推进一整局的辅助：每回合自然掷骰，询问时买、商店时走。
function advanceUntil(state, predicate, maxSteps = 2000) {
  let s = state;
  for (let i = 0; i < maxSteps && !predicate(s); i += 1) {
    assert.ok(!s.over || predicate(s), '当局已结束但 predicate 未满足');
    const acts = legalActions(s);
    assert.ok(acts.length > 0, `无路可走：phase ${s.turn.phase}`);
    let action;
    switch (s.turn.phase) {
      case 'pre':
        action = { type: 'roll' };
        break;
      case 'offer':
        action = acts.find((a) => a.type === 'buy') ?? { type: 'decline' };
        break;
      case 'shop':
        action = { type: 'leaveShop' };
        break;
      case 'end':
        action = { type: 'endTurn' };
        break;
      default:
        throw new Error(`advanceUntil 卡在 phase ${s.turn.phase}`);
    }
    s = dispatch(s, action);
  }
  assert.ok(predicate(s), 'predicate 未满足');
  return s;
}

test('风向每 4 轮重抽：第 5 轮起市况离开平稳期', () => {
  let s = game();
  s = advanceUntil(s, (x) => x.turn.round >= 5);
  assert.notEqual(s.market.id, 'calm');
  assert.equal(s.market.segment, 2);
  // 第 1~4 轮保持平稳：重放到第 4 轮检查
  let early = game();
  early = advanceUntil(early, (x) => x.turn.round >= 4);
  assert.equal(early.market.id, 'calm');
});

test('打完 roundsTotal 轮自动结算排名；排名按净资产、破产垫底', () => {
  let s = game({ rounds: 2 });
  s = advanceUntil(s, (x) => x.over);
  assert.ok(s.over);
  assert.equal(s.over.ranking.length, 4);
  const rows = s.over.ranking;
  assert.equal(rows[0].rank, 1);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].score >= rows[i].score);
  }
  const you = rows.find((r) => r.playerIndex === 0);
  assert.equal(you.score, netWorth(s, 0));
});

test('只剩一名存活玩家时提前获胜', () => {
  let s = game();
  for (let i = 1; i <= 3; i += 1) s.players[i].bankrupt = true;
  s = patchPlayer0(s, { pos: 19, bag: ['aim'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' }); // 交税后进入 end
  s = dispatch(s, { type: 'endTurn' }); // 绕回 0 时触发判定
  assert.ok(s.over);
  assert.match(s.over.headline, /提前获胜/);
});

test('并列规则：净资产与现金都相同则名次并列', () => {
  const s = game();
  s.players[3].cash = 5900; // 其余三人相同
  const rows = ranking(s);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1);
  assert.equal(rows[2].rank, 1);
  assert.equal(rows[3].rank, 4);
});

test('悠然驿站：停留后下一个自己的回合休息，无法掷骰', () => {
  let s = patchPlayer0(game(), { pos: 17, bag: ['aim'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' }); // 18 悠然驿站
  assert.equal(s.players[0].resting, true);
  s = dispatch(s, { type: 'endTurn' });  // → 玩家1
  s.turn.phase = 'end';
  s = dispatch(s, { type: 'endTurn' });  // → 玩家2
  s.turn.phase = 'end';
  s = dispatch(s, { type: 'endTurn' });  // → 玩家3
  s.turn.phase = 'end';
  s = dispatch(s, { type: 'endTurn' });  // → 玩家0（休息）
  assert.equal(s.turn.player, 0);
  assert.equal(s.turn.phase, 'end');
  assert.equal(s.turn.skipped, true);
  assert.equal(legalActions(s).filter((a) => a.type === 'roll').length, 0);
  assert.equal(s.players[0].resting, false);
});

test('湖畔公园：+300 与随机道具；背包满则折 180 现金', () => {
  let s = patchPlayer0(game(), { pos: 11, bag: ['aim'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' }); // 12 湖畔公园
  assert.equal(s.players[0].pos, 12);
  assert.equal(s.players[0].cash, 6300);
  assert.equal(s.players[0].bag.length, 1); // 消耗 aim 后又抽到一张

  s = patchPlayer0(game(), { pos: 11, bag: ['aim', 'shield', 'shield', 'shield', 'shield', 'shield', 'shield'] });
  s = dispatch(s, { type: 'useItem', card: 'aim', value: 1 });
  s = dispatch(s, { type: 'roll' });
  assert.equal(s.players[0].cash, 6000 + 300 + 180); // 公园 300 + 满包折算 180
});

test('日志保持最新在前且不超过 40 条；state JSON round-trip 后可重放', () => {
  let s = game();
  s = advanceUntil(s, (x) => x.turn.round > 1);
  assert.ok(s.log.length <= 40);
  assert.equal(s.log[0].round <= s.turn.round, true);
  const rollAction = legalActions(s).find((a) => a.type === 'roll');
  assert.ok(rollAction, '应当处于可掷骰状态');
  const revived = JSON.parse(JSON.stringify(s));
  assert.deepEqual(legalActions(revived), legalActions(s));
  assert.deepEqual(dispatch(revived, rollAction).turn.dice, dispatch(s, rollAction).turn.dice);
});
