// 大富翁 · 云栖之城 —— 纯函数游戏引擎。
// 状态全部是 plain object（JSON 可序列化），RNG 随状态存储，保证可存档、可重放、可单测。
// UI 层只负责渲染 state 并 dispatch action。

export const BOARD_SIZE = 24;
export const START_INDEX = 0;
export const START_REWARD = 800;
export const INITIAL_CASH = 6000;
export const BAG_LIMIT = 6;
export const FULL_BAG_COMPENSATION = 180;
export const RENT_MULTIPLIERS = [1, 2, 3.5, 5.5];
export const COLOR_SET_BONUS = 1.5;
export const TRANSIT_DOUBLE_BONUS = 2;
export const SELL_LAND_RATIO = 0.65;
export const SELL_BUILDING_RATIO = 0.6;
export const FORCED_BUY_RATIO = 1.35;
export const MARKET_ROTATION = 4;
export const PARK_REWARD = 300;
export const LOG_LIMIT = 40;
export const STORAGE_KEY = 'devkit.monopoly.state.v1';

// 地块数据表：原创命名，机制与参考版一致。
// kind: start | street | transit | event | shop | service | park | rest | tax
export const BOARD = [
  { index: 0,  kind: 'start',   name: '新启程广场', sub: '+800',    reward: START_REWARD },
  { index: 1,  kind: 'street',  name: '晨风小筑',   sub: '600',     price: 600,  group: 'teal' },
  { index: 2,  kind: 'street',  name: '珊瑚集路',   sub: '680',     price: 680,  group: 'teal' },
  { index: 3,  kind: 'event',   name: '街角奇遇',   sub: '随机事件' },
  { index: 4,  kind: 'street',  name: '古榕里',     sub: '780',     price: 780,  group: 'green' },
  { index: 5,  kind: 'street',  name: '林畔花园',   sub: '860',     price: 860,  group: 'green' },
  { index: 6,  kind: 'shop',    name: '工具驿站',   sub: '道具补给' },
  { index: 7,  kind: 'street',  name: '咖啡巷口',   sub: '1000',    price: 1000, group: 'amber' },
  { index: 8,  kind: 'service', name: '社区服务',   sub: '-280',    amount: 280 },
  { index: 9,  kind: 'street',  name: '艺文长廊',   sub: '1100',    price: 1100, group: 'amber' },
  { index: 10, kind: 'transit', name: '城铁站',     sub: '1200',    price: 1200, group: 'transit' },
  { index: 11, kind: 'event',   name: '惊喜邮箱',   sub: '随机事件' },
  { index: 12, kind: 'park',    name: '湖畔公园',   sub: '+300 & 道具' },
  { index: 13, kind: 'street',  name: '星光市集',   sub: '1240',    price: 1240, group: 'purple' },
  { index: 14, kind: 'street',  name: '声乐大道',   sub: '1320',    price: 1320, group: 'purple' },
  { index: 15, kind: 'shop',    name: '灵感小铺',   sub: '道具补给' },
  { index: 16, kind: 'street',  name: '云端园区',   sub: '1460',    price: 1460, group: 'blue' },
  { index: 17, kind: 'street',  name: '创客中心',   sub: '1560',    price: 1560, group: 'blue' },
  { index: 18, kind: 'rest',    name: '悠然驿站',   sub: '休息一回合' },
  { index: 19, kind: 'street',  name: '金湾码头',   sub: '1750',    price: 1750, group: 'gold' },
  { index: 20, kind: 'tax',     name: '物业税',     sub: '-450',    amount: 450 },
  { index: 21, kind: 'event',   name: '命运路口',   sub: '随机事件' },
  { index: 22, kind: 'street',  name: '天际广场',   sub: '1900',    price: 1900, group: 'gold' },
  { index: 23, kind: 'transit', name: '空港枢纽',   sub: '1200',    price: 1200, group: 'transit' },
];

// 街道与车站的建楼费统一按地价的 44%（与参考版「升级建筑 480 / 地价 1100」一致）。
export function basePrice(tileIndex) {
  return BOARD[tileIndex].price ?? 0;
}
export function baseBuildCost(tileIndex) {
  return Math.round(basePrice(tileIndex) * 0.44);
}
// Lv0 基础租金约为地价的 17%。
export function baseRent(tileIndex) {
  return Math.round(basePrice(tileIndex) * 0.17);
}

export const GROUPS = {
  teal:   { name: '海屿色调', color: '#57b8a4' },
  green:  { name: '林荫色调', color: '#7cb56b' },
  amber:  { name: '琥珀色调', color: '#d99543' },
  purple: { name: '暮紫色调', color: '#9b7bc4' },
  blue:   { name: '晴空调色', color: '#5b9bd5' },
  gold:   { name: '鎏金色调', color: '#c9a227' },
  transit:{ name: '交通枢纽', color: '#8a9199' },
};

// 9 种道具：价格与效果和参考版一致，名称原创。
export const CARDS = {
  aim:      { id: 'aim',      name: '定点骰',   price: 240, desc: '指定本回合骰子点数（1~6）。', target: 'die' },
  double:   { id: 'double',   name: '双骰卡',   price: 180, desc: '本回合掷两颗骰子，走得更远。', target: null },
  shield:   { id: 'shield',   name: '免租护符', price: 320, desc: '自动抵挡下一次租金，直到触发前一直有效。', target: null },
  dblRent:  { id: 'dblRent',  name: '翻倍收租', price: 340, desc: '下一笔未被免租护符抵挡的租金翻倍。', target: null },
  fast:     { id: 'fast',     name: '快建卡',   price: 440, desc: '将自己的一块地产免费升一级，最高三级。', target: 'ownBuilt' },
  demolish: { id: 'demolish', name: '拆迁令',   price: 380, desc: '拆除对手一块地产的一层建筑。', target: 'opponentBuilt' },
  teleport: { id: 'teleport', name: '迁跃卡',   price: 480, desc: '直接前往选定地块，替代本回合掷骰子；不领取经过起点奖励。', target: 'anyTile' },
  forced:   { id: 'forced',   name: '强拍卡',   price: 520, desc: '按地块与建筑原值的 135% 向对手强制收购，需另付收购款。', target: 'opponentOwned' },
  road:     { id: 'road',     name: '路障卡',   price: 200, desc: '在任一非起点地块放置路障，下一位经过的对手会被拦停。', target: 'roadTile' },
};
export const CARD_IDS = Object.keys(CARDS);

// 市况（城市风向）：每 4 轮重新抽取，影响买地/建楼（buyMult）与租金（rentMult）。
export const MARKETS = {
  calm:      { id: 'calm',      name: '平稳市况', desc: '所有交易按正常价格进行。', buyMult: 1,   rentMult: 1 },
  boom:      { id: 'boom',      name: '消费热潮', desc: '买地与建楼价格上浮 20%。', buyMult: 1.2, rentMult: 1 },
  landRush:  { id: 'landRush',  name: '地产热土', desc: '买地与建楼价格上浮 25%。', buyMult: 1.25, rentMult: 1 },
  recession: { id: 'recession', name: '市场收缩', desc: '买地、建楼和租金都下调 20%。', buyMult: 0.8, rentMult: 0.8 },
  rentBoon:  { id: 'rentBoon',  name: '租赁潮',   desc: '租金上浮 30%，交易价格不变。', buyMult: 1,   rentMult: 1.3 },
};
export const MARKET_IDS = Object.keys(MARKETS);

// 随机事件池：与参考版同类（补贴、旅行、维修账单、道具补给）。
export const EVENTS = [
  { id: 'subsidy',  text: '市政补贴到账：生活需要一点推力。', apply: { kind: 'grant', amount: 400 } },
  { id: 'gift',     text: '收到暖心红包：陌生人的好意。',     apply: { kind: 'grant', amount: 250 } },
  { id: 'found',    text: '街边捡到一个信封：里面是现金。',   apply: { kind: 'grant', amount: 150 } },
  { id: 'repair',   text: '水管维修账单：老房子的日常。',     apply: { kind: 'charge', amount: 300 } },
  { id: 'late',     text: '缴纳滞纳金：下次记得早点办事。',   apply: { kind: 'charge', amount: 200 } },
  { id: 'card1',    text: '补给空投：获得一张随机道具。',     apply: { kind: 'card' } },
  { id: 'card2',    text: '惊喜礼盒：获得一张随机道具。',     apply: { kind: 'card' } },
  { id: 'tour',     text: '城市观光巴士：被免费送到了别处。', apply: { kind: 'teleportRandom' } },
];

const DEFAULT_PLAYERS = [
  { name: '你',   kind: 'human', personality: 'dreamer' },
  { name: '周稳安', kind: 'ai',    personality: 'renter'  },
  { name: '秦逐',  kind: 'ai',      personality: 'builder' },
  { name: '苏妙',  kind: 'ai',      personality: 'strategist' },
];

// ---------- RNG（mulberry32，状态即 seed 整数） ----------
function nextRandom(rng) {
  let t = (rng + 0x6d2b79f5) | 0;
  rng = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { rng: rng >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

function makeRng(state) {
  return {
    next() {
      const { rng, value } = nextRandom(state.rng);
      state.rng = rng;
      return value;
    },
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick(list) {
      return list[this.int(0, list.length - 1)];
    },
  };
}

// ---------- 工具 ----------
const clone = (value) => JSON.parse(JSON.stringify(value));

function pushLog(state, text) {
  state.log.unshift({ id: state.logSeq++, round: state.turn.round, text });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
}

export function currentPlayerIndex(state) {
  return state.turn.player;
}
export function currentPlayer(state) {
  return state.players[state.turn.player];
}

function alivePlayers(state) {
  return state.players.filter((p) => !p.bankrupt);
}

// ---------- 派生查询（供 UI 与测试） ----------
export function marketOf(state) {
  return MARKETS[state.market.id];
}
export function landPrice(state, tileIndex) {
  return Math.round(basePrice(tileIndex) * marketOf(state).buyMult);
}
export function buildCost(state, tileIndex) {
  return Math.round(baseBuildCost(tileIndex) * marketOf(state).buyMult);
}
// 含同色/双车站/市况倍率、但不含「翻倍收租」道具与免租护符的应收租金。
export function currentRent(state, tileIndex) {
  const prop = state.props.find((p) => p.index === tileIndex);
  if (!prop || prop.owner < 0) return 0;
  const tile = BOARD[tileIndex];
  let amount = baseRent(tileIndex) * RENT_MULTIPLIERS[prop.level];
  if (tile.group === 'transit') {
    const others = BOARD.filter((t) => t.group === 'transit' && t.index !== tileIndex);
    if (others.some((t) => {
      const other = state.props.find((p) => p.index === t.index);
      return other && other.owner === prop.owner;
    })) {
      amount *= TRANSIT_DOUBLE_BONUS;
    }
  } else if (tile.group) {
    const same = BOARD.filter((t) => t.group === tile.group);
    if (same.every((t) => {
      const mate = state.props.find((p) => p.index === t.index);
      return mate && mate.owner === prop.owner;
    })) {
      amount *= COLOR_SET_BONUS;
    }
  }
  return Math.round(amount * marketOf(state).rentMult);
}
export function netWorth(state, playerIndex) {
  const p = state.players[playerIndex];
  if (p.bankrupt) return 0;
  let value = p.cash;
  for (const prop of state.props) {
    if (prop && prop.owner === playerIndex) {
      value += basePrice(prop.index) + prop.level * baseBuildCost(prop.index);
    }
  }
  return value;
}
export function ranking(state) {
  const rows = state.players.map((p, i) => ({
    playerIndex: i,
    name: p.name,
    bankrupt: p.bankrupt,
    cash: p.bankrupt ? 0 : p.cash,
    score: netWorth(state, i),
  }));
  rows.sort((a, b) => (a.bankrupt - b.bankrupt) || (b.score - a.score) || (b.cash - a.cash));
  let rank = 0;
  rows.forEach((row, i) => {
    if (i > 0 && (row.score !== rows[i - 1].score || row.cash !== rows[i - 1].cash)) rank = i;
    row.rank = rank + 1;
  });
  return rows;
}

export function forcedBuyCost(state, tileIndex) {
  const prop = state.props.find((p) => p.index === tileIndex);
  const total = basePrice(tileIndex) + prop.level * baseBuildCost(tileIndex);
  return Math.round(total * FORCED_BUY_RATIO);
}

// ---------- 创建对局 ----------
export function createGame({ seed, rounds = 24, players = DEFAULT_PLAYERS } = {}) {
  const state = {
    version: 1,
    rng: (seed ?? Date.now()) >>> 0,
    roundsTotal: rounds,
    players: players.map((p, i) => ({
      index: i,
      name: p.name,
      kind: p.kind,
      personality: p.personality,
      cash: INITIAL_CASH,
      pos: START_INDEX,
      bag: [],
      shield: false,
      rentDouble: false,
      resting: false,
      bankrupt: false,
    })),
    props: BOARD.filter((t) => t.price).map((t) => ({ index: t.index, owner: -1, level: 0 })),
    roads: [],
    market: { id: 'calm', round: 1, segment: 1 },
    turn: {
      player: 0,
      round: 1,
      phase: 'pre',
      usedItem: false,
      usedBuild: false,
      rollConsumed: false,
      aimed: null,
      forceDouble: false,
      dice: [],
      pending: null,
    },
    log: [],
    logSeq: 1,
    over: null,
  };
  const rng = makeRng(state);
  for (const p of state.players) {
    for (let i = 0; i < 3; i += 1) p.bag.push(rng.pick(CARD_IDS));
  }
  pushLog(state, `每位玩家拥有 ${INITIAL_CASH} 城市币和三张初始道具，第 ${rounds} 轮结束后比拼净资产。`);
  return state;
}

function propOf(state, tileIndex) {
  return state.props.find((p) => p.index === tileIndex) ?? null;
}

// ---------- 金钱流转 ----------
function grant(state, player, amount, reason) {
  player.cash += amount;
  pushLog(state, `${player.name}获得 ${amount} 城市币：${reason}。`);
}

// 变卖优先级：先逐层卖建筑（建造费 60%），再卖地块（原价 65%）。
function liquidateOnce(state, player) {
  const owned = state.props.filter((p) => p.owner === player.index);
  if (owned.length === 0) return false;
  const built = owned
    .filter((p) => p.level > 0)
    .sort((a, b) => b.level - a.level || a.index - b.index);
  if (built.length > 0) {
    const tile = built[0];
    tile.level -= 1;
    const refund = Math.round(baseBuildCost(tile.index) * SELL_BUILDING_RATIO);
    player.cash += refund;
    pushLog(state, `${player.name}出售${BOARD[tile.index].name}的一层建筑，换回 ${refund} 城市币。`);
    return true;
  }
  const cheapest = owned.sort((a, b) => basePrice(a.index) - basePrice(b.index))[0];
  const refund = Math.round(basePrice(cheapest.index) * SELL_LAND_RATIO);
  cheapest.owner = -1;
  player.cash += refund;
  pushLog(state, `${player.name}出售${BOARD[cheapest.index].name}，换回 ${refund} 城市币。`);
  return true;
}

function bankrupt(state, player, creditor) {
  if (creditor && creditor.index !== player.index) {
    creditor.cash += player.cash;
    pushLog(state, `${player.name}的剩余 ${player.cash} 城市币转给了${creditor.name}。`);
  }
  for (const prop of state.props) {
    if (prop.owner === player.index) {
      prop.owner = -1;
      prop.level = 0;
    }
  }
  player.cash = 0;
  player.bag = [];
  player.bankrupt = true;
  pushLog(state, `${player.name}宣告破产，地产归银行。`);
  if (player.kind === 'human') {
    endGame(state, '你破产出局，本局结束。');
  } else if (alivePlayers(state).length === 1) {
    endGame(state, `${alivePlayers(state)[0].name}成为本城大富翁。`);
  }
}

// 收款方 creditor 可为 null（交给银行/市政）。不足则自动变卖，仍不足破产。
function charge(state, player, amount, creditor, reason) {
  if (amount <= 0) return;
  let guard = 0;
  while (player.cash < amount && guard < 100) {
    guard += 1;
    if (!liquidateOnce(state, player)) break;
  }
  if (player.cash < amount) {
    bankrupt(state, player, creditor ?? null);
    return;
  }
  player.cash -= amount;
  if (creditor) creditor.cash += amount;
  pushLog(state, `${player.name}支付 ${amount} 城市币：${reason}。`);
}

// ---------- 终局 ----------
function endGame(state, headline) {
  state.over = { headline, ranking: ranking(state) };
  state.turn.phase = 'over';
  pushLog(state, headline);
}

function finishGameIfDue(state) {
  const survivors = alivePlayers(state);
  if (state.over) return;
  if (survivors.length === 1) {
    endGame(state, `${survivors[0].name}笑到最后，提前获胜！`);
  }
}

// ---------- 移动与落地 ----------
function moveTo(state, player, steps) {
  for (let i = 0; i < steps; i += 1) {
    player.pos = (player.pos + 1) % BOARD_SIZE;
    if (player.pos === START_INDEX) {
      grant(state, player, START_REWARD, '经过新启程广场');
    }
    const road = state.roads.find((r) => r.tile === player.pos && r.by !== player.index);
    if (road) {
      state.roads = state.roads.filter((r) => r !== road);
      pushLog(state, `${player.name}被${BOARD[road.tile].name}的路障拦下。`);
      break;
    }
  }
}

function payRent(state, tenant, tileIndex) {
  const prop = propOf(state, tileIndex);
  const landlord = state.players[prop.owner];
  if (tenant.shield) {
    tenant.shield = false;
    pushLog(state, `${tenant.name}的免租护符抵挡了${BOARD[tileIndex].name}的 ${currentRent(state, tileIndex)} 城市币租金。`);
    return;
  }
  let amount = currentRent(state, tileIndex);
  if (landlord.rentDouble) {
    amount *= 2;
    landlord.rentDouble = false;
    pushLog(state, `${landlord.name}使用了翻倍收租。`);
  }
  charge(state, tenant, amount, landlord, `${BOARD[tileIndex].name}的租金`);
}

function drawEvent(state, player) {
  const rng = makeRng(state);
  const event = rng.pick(EVENTS);
  pushLog(state, `${player.name}抽到事件：${event.text}`);
  const a = event.apply;
  if (a.kind === 'grant') grant(state, player, a.amount, event.text);
  else if (a.kind === 'charge') charge(state, player, a.amount, null, event.text);
  else if (a.kind === 'card') giveRandomCard(state, player);
  else if (a.kind === 'teleportRandom') {
    const streets = BOARD.filter((t) => t.price && t.index !== player.pos);
    player.pos = rng.pick(streets).index;
    pushLog(state, `${player.name}被观光巴士送到了${BOARD[player.pos].name}，只是看看风景。`);
  }
}

function giveRandomCard(state, player) {
  const rng = makeRng(state);
  const card = rng.pick(CARD_IDS);
  if (player.bag.length >= BAG_LIMIT) {
    grant(state, player, FULL_BAG_COMPENSATION, '背包满了，道具折算现金');
  } else {
    player.bag.push(card);
    pushLog(state, `${player.name}获得了「${CARDS[card].name}」。`);
  }
}

function resolveTile(state, player) {
  const tile = BOARD[player.pos];
  const t = state.turn;
  if (tile.kind === 'street' || tile.kind === 'transit') {
    const prop = propOf(state, tile.index);
    if (!prop || prop.owner < 0) {
      t.phase = 'offer';
      t.pending = { kind: 'offer', tile: tile.index, price: landPrice(state, tile.index) };
    } else if (prop.owner === player.index) {
      pushLog(state, `${player.name}回到自己的${tile.name}，小憩片刻。`);
      t.phase = 'end';
    } else {
      payRent(state, player, tile.index);
      if (!player.bankrupt) t.phase = 'end';
      else t.phase = 'end';
    }
  } else if (tile.kind === 'event') {
    drawEvent(state, player);
    if (!state.over) t.phase = 'end';
  } else if (tile.kind === 'shop') {
    t.phase = 'shop';
    t.pending = { kind: 'shop', tile: tile.index };
    pushLog(state, `${player.name}来到${tile.name}，可购买一张道具。`);
  } else if (tile.kind === 'service' || tile.kind === 'tax') {
    charge(state, player, tile.amount, null, tile.name);
    if (!state.over) t.phase = 'end';
  } else if (tile.kind === 'park') {
    grant(state, player, PARK_REWARD, '湖畔公园的休整补贴');
    giveRandomCard(state, player);
    t.phase = 'end';
  } else if (tile.kind === 'rest') {
    player.resting = true;
    pushLog(state, `${player.name}在${tile.name}放下小假，下一个自己的回合休息。`);
    t.phase = 'end';
  } else {
    t.phase = 'end';
  }
}

// ---------- 道具与回合目标 ----------
function pendingTargets(state, cardId, player) {
  switch (CARDS[cardId].target) {
    case 'ownBuilt':
      return state.props.filter((p) => p.owner === player.index && p.level < 3).map((p) => p.index);
    case 'opponentBuilt':
      return state.props.filter((p) => p.owner >= 0 && p.owner !== player.index && p.level > 0)
        .map((p) => p.index);
    case 'opponentOwned':
      return state.props.filter((p) => p.owner >= 0 && p.owner !== player.index)
        .map((p) => p.index)
        .filter((i) => player.cash >= forcedBuyCost(state, i));
    case 'anyTile':
      return BOARD.filter((tb) => tb.index !== START_INDEX).map((tb) => tb.index);
    case 'roadTile':
      return BOARD.filter((tb) => tb.index !== START_INDEX && !state.roads.some((r) => r.tile === tb.index))
        .map((tb) => tb.index);
    default:
      return [];
  }
}

function itemUsable(state, player, cardId) {
  const t = state.turn;
  if (t.usedItem || t.rollConsumed) return false;
  if (!player.bag.includes(cardId)) return false;
  const target = CARDS[cardId].target;
  if (target === 'die' || target === null) {
    if (cardId === 'aim' && t.dice.length > 0) return false;
    if (cardId === 'double' && t.dice.length > 0) return false;
    return true;
  }
  return pendingTargets(state, cardId, player).length > 0;
}

function consumeCard(player, cardId) {
  player.bag.splice(player.bag.indexOf(cardId), 1);
}

function applyCard(state, player, cardId, target) {
  const t = state.turn;
  t.usedItem = true;
  switch (cardId) {
    case 'aim':
      t.aimed = target;
      consumeCard(player, cardId);
      pushLog(state, `${player.name}使用了「定点骰」。`);
      t.phase = 'pre';
      break;
    case 'double':
      consumeCard(player, cardId);
      t.forceDouble = true;
      pushLog(state, `${player.name}使用了「双骰卡」。`);
      t.phase = 'pre';
      break;
    case 'shield':
      consumeCard(player, cardId);
      player.shield = true;
      pushLog(state, `${player.name}使用了「免租护符」。`);
      t.phase = 'pre';
      break;
    case 'dblRent':
      consumeCard(player, cardId);
      player.rentDouble = true;
      pushLog(state, `${player.name}使用了「翻倍收租」。`);
      t.phase = 'pre';
      break;
    case 'fast': {
      consumeCard(player, cardId);
      const prop = propOf(state, target);
      prop.level += 1;
      pushLog(state, `${player.name}用「快建卡」将${BOARD[target].name}升到 ${prop.level} 级。`);
      t.phase = 'pre';
      break;
    }
    case 'demolish': {
      consumeCard(player, cardId);
      const prop = propOf(state, target);
      prop.level -= 1;
      pushLog(state, `${player.name}用「拆迁令」拆除了${BOARD[target].name}的一层建筑。`);
      t.phase = 'pre';
      break;
    }
    case 'road': {
      consumeCard(player, cardId);
      state.roads.push({ tile: target, by: player.index });
      pushLog(state, `${player.name}在${BOARD[target].name}放下了路障。`);
      t.phase = 'pre';
      break;
    }
    case 'teleport': {
      consumeCard(player, cardId);
      t.rollConsumed = true;
      t.pending = null;
      player.pos = target;
      pushLog(state, `${player.name}使用「迁跃卡」直达${BOARD[target].name}。`);
      resolveTile(state, player);
      break;
    }
    case 'forced': {
      consumeCard(player, cardId);
      const prop = propOf(state, target);
      const cost = forcedBuyCost(state, target);
      const seller = state.players[prop.owner];
      charge(state, player, cost, seller, `强拍${BOARD[target].name}`);
      if (!player.bankrupt) {
        prop.owner = player.index;
        pushLog(state, `${player.name}以 ${cost} 城市币强制收购了${BOARD[target].name}。`);
      }
      t.phase = 'pre';
      break;
    }
    default:
      throw new Error(`未知道具：${cardId}`);
  }
}

// ---------- 回合推进 ----------
function beginTurn(state) {
  const t = state.turn;
  t.usedItem = false;
  t.usedBuild = false;
  t.rollConsumed = false;
  t.aimed = null;
  t.forceDouble = false;
  t.dice = [];
  t.pending = null;
  t.skipped = false;
  const player = currentPlayer(state);
  if (player.resting) {
    player.resting = false;
    t.skipped = true;
    t.phase = 'end';
    pushLog(state, `${player.name}在${BOARD[player.pos].name}休整，本回合不行动。`);
    return;
  }
  t.phase = 'pre';
}

function advanceTurn(state) {
  let idx = state.turn.player;
  let wrapped = false;
  for (let i = 0; i < state.players.length; i += 1) {
    idx = (idx + 1) % state.players.length;
    if (idx === 0) wrapped = true;
    if (!state.players[idx].bankrupt) break;
  }
  const t = state.turn;
  if (wrapped) {
    t.round += 1;
    if (t.round > state.roundsTotal) {
      finishRoundRanking(state);
      return;
    }
    // 每 4 轮抽取新风向（第 1、5、9… 轮）。
    if ((t.round - 1) % MARKET_ROTATION === 0) {
      const rng = makeRng(state);
      const options = MARKET_IDS.filter((m) => m !== state.market.id);
      state.market = { id: rng.pick(options), round: t.round, segment: Math.floor((t.round - 1) / MARKET_ROTATION) + 1 };
      pushLog(state, `城市风向转变：${MARKETS[state.market.id].name}。${MARKETS[state.market.id].desc}`);
    }
    finishGameIfDue(state);
    if (state.over) return;
  }
  t.player = idx;
  beginTurn(state);
}

function finishRoundRanking(state) {
  const survivors = alivePlayers(state);
  if (survivors.length <= 1) {
    endGame(state, `${survivors[0] ? `${survivors[0].name}笑到最后，提前获胜！` : '全员破产。'}`);
    return;
  }
  const rows = ranking(state);
  const top = rows.filter((r) => r.rank === 1).map((r) => r.name);
  endGame(state, top.length > 1 ? `第 ${state.roundsTotal} 轮结束：${top.join('、')}并列第一！` : `第 ${state.roundsTotal} 轮结束：${top[0]}是本城大富翁！`);
}

// ---------- 合法动作（UI 按钮态与 AI 决策的单一来源） ----------
export function legalActions(state) {
  const t = state.turn;
  if (state.over || t.phase === 'over') return [];
  const player = currentPlayer(state);
  const acts = [];
  if (t.phase === 'pre') {
    if (!t.rollConsumed) acts.push({ type: 'roll' });
    for (const card of new Set(player.bag)) {
      if (itemUsable(state, player, card)) acts.push({ type: 'useItem', card });
    }
    if (!t.usedBuild) {
      for (const prop of state.props) {
        if (prop.owner === player.index && prop.level < 3 && player.cash >= buildCost(state, prop.index)) {
          acts.push({ type: 'build', tile: prop.index });
        }
      }
    }
    for (const prop of state.props) {
      if (prop.owner === player.index && prop.level > 0) acts.push({ type: 'sellBuilding', tile: prop.index });
      if (prop.owner === player.index && prop.level === 0) acts.push({ type: 'sellTile', tile: prop.index });
    }
  } else if (t.phase === 'offer') {
    if (player.cash >= t.pending.price) acts.push({ type: 'buy' });
    acts.push({ type: 'decline' });
  } else if (t.phase === 'shop') {
    if (player.bag.length < BAG_LIMIT) {
      for (const card of CARD_IDS) {
        if (player.cash >= CARDS[card].price) acts.push({ type: 'shopBuy', card });
      }
    }
    acts.push({ type: 'leaveShop' });
  } else if (t.phase === 'target') {
    acts.push({ type: 'cancelTarget' });
    for (const tile of t.pending.targets) {
      if (t.pending.card === 'aim') acts.push({ type: 'chooseTarget', value: tile });
      else acts.push({ type: 'chooseTarget', tile });
    }
  } else if (t.phase === 'end') {
    acts.push({ type: 'endTurn' });
  }
  return acts;
}

// ---------- 主入口 ----------
export function dispatch(input, action) {
  const state = clone(input);
  const t = state.turn;
  const player = currentPlayer(state);
  const has = (type, extra) => legalActions(input).some(
    (a) => a.type === type && Object.entries(extra ?? {}).every(([k, v]) => a[k] === v),
  );

  switch (action.type) {
    case 'roll': {
      if (!has('roll')) throw new Error('当前不能掷骰子');
      const rng = makeRng(state);
      if (t.aimed) {
        t.dice = [t.aimed];
      } else {
        const count = t.forceDouble ? 2 : 1;
        t.dice = [];
        for (let i = 0; i < count; i += 1) t.dice.push(rng.int(1, 6));
      }
      const steps = t.dice.reduce((s, v) => s + v, 0);
      pushLog(state, `${player.name}掷出 ${t.dice.join(' 和 ')}，准备前进 ${steps} 格。`);
      moveTo(state, player, steps);
      resolveTile(state, player);
      break;
    }
    case 'useItem': {
      if (!has('useItem', { card: action.card })) throw new Error('该道具此刻不可用');
      const targetKind = CARDS[action.card].target;
      if (targetKind === 'die') {
        const value = action.value ?? null;
        if (value === null) {
          t.pending = { kind: 'dieTarget', card: action.card, targets: [1, 2, 3, 4, 5, 6] };
          t.phase = 'target';
        } else {
          applyCard(state, player, action.card, value);
        }
      } else if (targetKind === null) {
        applyCard(state, player, action.card, null);
      } else {
        t.pending = { kind: 'tileTarget', card: action.card, targets: pendingTargets(state, action.card, player) };
        t.phase = 'target';
      }
      break;
    }
    case 'chooseTarget': {
      if (t.phase !== 'target') throw new Error('当前没有待选择的道具目标');
      const pending = t.pending;
      if (pending.kind === 'dieTarget') {
        const value = Number(action.value);
        if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('定点骰需要 1~6');
        applyCard(state, player, pending.card, value);
      } else {
        if (!pending.targets.includes(action.tile)) throw new Error('目标地块不合法');
        applyCard(state, player, pending.card, action.tile);
      }
      break;
    }
    case 'cancelTarget': {
      if (t.phase !== 'target') throw new Error('没有可取消的选择');
      t.pending = null;
      t.phase = 'pre';
      break;
    }
    case 'build': {
      if (!has('build', { tile: action.tile })) throw new Error('当前不能升级这块地产');
      const prop = propOf(state, action.tile);
      const cost = buildCost(state, action.tile);
      charge(state, player, cost, null, `升级${BOARD[action.tile].name}`);
      if (!player.bankrupt) {
        prop.level += 1;
        t.usedBuild = true;
        pushLog(state, `${player.name}将${BOARD[action.tile].name}升到 ${prop.level} 级（花费 ${cost}）。`);
      }
      break;
    }
    case 'buy': {
      if (!has('buy')) throw new Error('当前不能购买');
      const { tile, price } = t.pending;
      const prop = propOf(state, tile);
      charge(state, player, price, null, `买下${BOARD[tile].name}`);
      if (player.bankrupt) break;
      prop.owner = player.index;
      pushLog(state, `${player.name}以 ${price} 城市币买下${BOARD[tile].name}。`);
      t.pending = null;
      t.phase = 'end';
      break;
    }
    case 'decline': {
      if (!has('decline')) throw new Error('当前不能放弃购买');
      pushLog(state, `${player.name}选择暂不购买。`);
      t.pending = null;
      t.phase = 'end';
      break;
    }
    case 'shopBuy': {
      if (!has('shopBuy', { card: action.card })) throw new Error('买不了这张道具');
      const card = CARDS[action.card];
      charge(state, player, card.price, null, `购买「${card.name}」`);
      if (!player.bankrupt) {
        player.bag.push(action.card);
        pushLog(state, `${player.name}购入「${card.name}」，下个回合起可用。`);
      }
      t.pending = null;
      t.phase = 'end';
      break;
    }
    case 'leaveShop': {
      if (!has('leaveShop')) throw new Error('当前不在商店');
      pushLog(state, `${player.name}选择暂不购买。`);
      t.pending = null;
      t.phase = 'end';
      break;
    }
    case 'sellBuilding': {
      if (!has('sellBuilding', { tile: action.tile })) throw new Error('不能出售这块地产的建筑');
      const prop = propOf(state, action.tile);
      prop.level -= 1;
      const refund = Math.round(baseBuildCost(action.tile) * SELL_BUILDING_RATIO);
      player.cash += refund;
      pushLog(state, `${player.name}出售${BOARD[action.tile].name}的一层建筑，换回 ${refund} 城市币。`);
      break;
    }
    case 'sellTile': {
      if (!has('sellTile', { tile: action.tile })) throw new Error('不能出售这块地产');
      const prop = propOf(state, action.tile);
      prop.level = 0;
      prop.owner = -1;
      const refund = Math.round(basePrice(action.tile) * SELL_LAND_RATIO);
      player.cash += refund;
      pushLog(state, `${player.name}出售${BOARD[action.tile].name}，换回 ${refund} 城市币。`);
      break;
    }
    case 'endTurn': {
      if (!has('endTurn')) throw new Error('当前不能结束回合');
      advanceTurn(state);
      break;
    }
    default:
      throw new Error(`未知动作：${action.type}`);
  }
  return state;
}
