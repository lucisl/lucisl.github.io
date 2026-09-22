// 大富翁 · 云栖之城 —— 页面控制器：渲染 state、派发 action、驱动 AI 回合。
import {
  BOARD, CARDS, CARD_IDS, GROUPS, MARKETS, STORAGE_KEY, BAG_LIMIT,
  createGame, dispatch, legalActions,
  currentRent, landPrice, buildCost, baseBuildCost, basePrice,
  netWorth, ranking, forcedBuyCost,
} from './monopoly-core.mjs';
import { decideAction } from './monopoly-ai.mjs';

const PLAYER_COLORS = ['#b8f34a', '#e4a24f', '#6fb6e4', '#e46f61'];
const CARD_GLYPH = {
  aim: '🎯', double: '🎲', shield: '🛡', dblRent: '💹', fast: '🏗',
  demolish: '💥', teleport: '🌀', forced: '⚖', road: '🚧',
};
const STEP_MS = 900;

const $ = (sel) => document.querySelector(sel);
const boardEl = $('#board');
const playerRail = $('#player-rail');
const statusLine = $('#game-status');
const savePanel = $('#save-panel');
const marketPanel = $('#market-panel');
const bagPanel = $('#bag-panel');
const logList = $('#log-list');
const logEmpty = $('#log-empty');
const propsList = $('#props-list');
const propsEmpty = $('#props-empty');
const propCount = $('#prop-count');
const dialogModal = $('#dialog-modal');
const dialogCard = $('#dialog-card');
const rulesModal = $('#rules-modal');

let state = null;           // 当前对局（null = 大厅）
let speed = 1;              // 1 | 2
let paused = false;
let timer = null;           // AI 步进定时器
let soundOn = false;
let audioCtx = null;

// ---------- 棋盘布局：24 格环形，0=右下角，顺时针 ----------
// 底行 0..6（右→左），左列 7..12（下→上），顶行 13..18（左→右），右列 19..23（上→下）
function gridPos(index) {
  if (index <= 6) return { col: 7 - index, row: 7 };
  if (index <= 12) return { col: 1, row: 7 - (index - 6) };
  if (index <= 18) return { col: 1 + (index - 12), row: 1 };
  return { col: 7, row: 1 + (index - 18) };
}

// ---------- 音效 ----------
function unlockAudio() {
  if (!audioCtx && window.AudioContext) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function beep(freq = 440, ms = 90, type = 'triangle', gain = 0.05) {
  if (!soundOn || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(audioCtx.destination);
  osc.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
  osc.stop(audioCtx.currentTime + ms / 1000);
}
const sfx = {
  roll: () => { beep(320, 70); setTimeout(() => beep(480, 90), 90); },
  coin: () => { beep(880, 60, 'square', 0.04); setTimeout(() => beep(1180, 90, 'square', 0.04), 60); },
  bad: () => beep(180, 160, 'sawtooth', 0.04),
  click: () => beep(560, 40, 'triangle', 0.03),
  end: () => { beep(520, 80); setTimeout(() => beep(660, 120), 90); },
};

// ---------- 存档 ----------
function storage() {
  try { return globalThis.localStorage; } catch { return null; }
}
function saveGame(manual = false) {
  if (!state || state.over) { clearSaved(); return; }
  if (manual || !state.savedAt) state.savedAt = Date.now();
  const payload = JSON.stringify(state);
  try { storage()?.setItem(STORAGE_KEY, payload); } catch { /* 隐私模式下静默失败 */ }
}
function loadSaved() {
  let raw = null;
  try { raw = storage()?.getItem(STORAGE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.players) || parsed.over) return null;
    // 兼容缺字段
    parsed.turn = { aimed: null, forceDouble: false, skipped: false, ...parsed.turn };
    parsed.roads = parsed.roads ?? [];
    return parsed;
  } catch { return null; }
}
function clearSaved() {
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// ---------- 发起对局 ----------
function startGame(rounds) {
  state = createGame({ rounds, seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 });
  paused = false;
  saveGame();
  render();
  setStatus(`${currentName()}的回合，请操作。`);
}

// ---------- 状态推进 ----------
function run(action, fx) {
  if (!state) return;
  const before = structuredClone(state);
  try {
    state = dispatch(state, action);
  } catch (err) {
    console.warn('非法动作已忽略', action, err);
    state = before;
    return;
  }
  if (fx) fx(before, state);
  afterChange(before, state);
}

function afterChange(before, next) {
  saveGame();
  render();
  // 音效启发式：对比日志
  const fresh = next.log.filter((e) => !before.log.some((b) => b.id === e.id));
  const text = fresh.map((e) => e.text).join('\n');
  if (/掷出/.test(text)) sfx.roll();
  else if (/买下|租金|换回|购买|支付/.test(text)) sfx.coin();
  else if (/破产|抵挡/.test(text)) sfx.bad();
  // 动态模态跟随阶段
  syncDialog(before, next);
  // AI 自动走棋
  if (!next.over && !paused && currentKind() === 'ai') {
    timer = setTimeout(aiStep, STEP_MS / speed);
  } else if (!next.over && !paused && currentKind() === 'human' && next.turn.phase === 'end') {
    // 人类无需等待
  }
  if (next.over && !before.over) {
    sfx.end();
    clearSaved();
    openRanking();
  }
}

function currentKind() {
  return state.players[state.turn.player].kind;
}
function currentName() {
  return state.players[state.turn.player].name;
}

function aiStep() {
  if (!state || state.over) return;
  const action = decideAction(state, state.turn.player);
  if (!action) { render(); return; }
  run(action);
}

function setStatus(text) { statusLine.textContent = text; }

// ---------- 渲染 ----------
function money(n) { return `₵${n.toLocaleString('en-US')}`; }

function avatar(name, i) {
  const span = document.createElement('span');
  span.className = 'avatar';
  span.style.background = PLAYER_COLORS[i % 4];
  span.textContent = name.slice(0, 1);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function render() {
  renderBoard();
  renderPlayers();
  renderCenter();
  renderMarket();
  renderBag();
  renderLogs();
  renderProps();
  renderSavePanel(state?.savedAt);
  syncTopButtons();
}

function renderBoard() {
  boardEl.textContent = '';
  const owners = state ? state.props : null;
  const roadsHere = state ? state.roads : [];
  const occupy = {};
  if (state) for (const p of state.players) {
    (occupy[p.pos] ??= []).push(p);
  }
  const targeting = state?.turn.phase === 'target' && state.turn.pending?.kind === 'tileTarget'
    ? state.turn.pending.targets : null;

  for (const tile of BOARD) {
    const { col, row } = gridPos(tile.index);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile kind-' + tile.kind;
    btn.dataset.tile = tile.index;
    btn.style.gridColumn = col;
    btn.style.gridRow = row;

    const prop = owners?.find((p) => p.index === tile.index);
    const stripe = document.createElement('i');
    stripe.className = 'stripe';
    stripe.style.background = tile.group ? GROUPS[tile.group].color : 'transparent';
    btn.append(stripe);

    const nameEl = document.createElement('span');
    nameEl.className = 'g-name';
    nameEl.textContent = tile.name;
    const subEl = document.createElement('span');
    subEl.className = 'g-sub';
    if (prop && prop.owner >= 0) {
      btn.classList.add('owned');
      subEl.textContent = `${money(currentRent(state, tile.index))}`;
      const owner = document.createElement('i');
      owner.className = 'owner';
      owner.style.background = PLAYER_COLORS[prop.owner % 4];
      btn.append(owner);
      if (prop.level > 0) {
        const dots = document.createElement('span');
        dots.className = 'level-dots';
        for (let i = 0; i < prop.level; i += 1) dots.append(document.createElement('i'));
        btn.append(dots);
      }
    } else {
      subEl.textContent = tile.sub ?? '';
    }
    btn.append(nameEl, subEl);

    if (roadsHere.some((r) => r.tile === tile.index)) {
      const flag = document.createElement('span');
      flag.className = 'road-flag';
      flag.textContent = '🚧';
      flag.title = '路障';
      btn.append(flag);
    }
    if (tile.kind === 'start') btn.classList.add('start');    const here = occupy[tile.index] ?? [];
    if (here.length) btn.classList.add('here');
    if (targeting?.includes(tile.index)) {
      btn.classList.add('targetable');
      btn.addEventListener('click', () => chooseTileTarget(tile.index));
    } else {
      btn.addEventListener('click', () => openTileInfo(tile.index));
    }

    let desc = tile.name;
    if (prop && prop.owner >= 0) desc += `，${state.players[prop.owner].name}所有，${prop.level} 级，租金 ${currentRent(state, tile.index)}`;
    else if (tile.price) desc += `，待售 ${tile.price}`;
    else desc += `，${tile.sub ?? ''}`;
    if (here.length) desc += `，停留玩家：${here.map((p) => p.name).join('、')}`;
    btn.setAttribute('aria-label', desc);
    btn.title = desc;
    boardEl.append(btn);
  }

  // 棋子层
  if (state) {
    const layer = document.createElement('div');
    layer.className = 'token-layer';
    for (const p of state.players) {
      if (p.bankrupt) continue;
      const { col, row } = gridPos(p.pos);
      const token = document.createElement('span');
      token.className = 'token';
      token.style.background = PLAYER_COLORS[p.index % 4];
      token.textContent = p.name.slice(0, 1);
      const same = state.players.filter((q) => !q.bankrupt && q.pos === p.pos);
      const slot = same.indexOf(p);
      const cx0 = ((col - 0.5) / 7) * 100;
      const cy0 = ((row - 0.5) / 7) * 100;
      // 边缘格：棋子向棋盘中心内收固定距离，避开外侧色条但不越出本格
      const inward = 2.5;
      const cx = cx0 + Math.sign(50 - cx0) * inward;
      const cy = cy0 + Math.sign(50 - cy0) * inward;
      const dx = (slot % 2 === 0 ? -1 : 1) * 1.6;
      const dy = (slot < 2 ? -1 : 1) * 1.6;
      const offset = (base, d) => `calc(${base}% ${d >= 0 ? '+' : '-'} ${Math.abs(d)}%)`;
      token.style.left = offset(cx, dx);
      token.style.top = offset(cy, dy);
      token.title = p.name;
      layer.append(token);
    }
    boardEl.append(layer);
  }
}

function renderPlayers() {
  playerRail.textContent = '';
  const players = state?.players ?? Array.from({ length: 4 }, (_, i) => ({
    index: i, name: i === 0 ? '你' : ['周稳安', '秦逐', '苏妙'][i - 1], cash: 6000,
    kind: i === 0 ? 'human' : 'ai', personality: ['dreamer', 'renter', 'builder', 'strategist'][i],
    bankrupt: false,
  }));
  for (const p of players) {
    const li = document.createElement('div');
    li.className = 'player-card';
    if (state && !state.over && state.turn.player === p.index) li.classList.add('active');
    if (p.bankrupt) li.classList.add('bankrupt');
    li.append(avatar(p.name, p.index));
    const who = document.createElement('div');
    who.className = 'who';
    const nm = document.createElement('p');
    nm.className = 'name';
    nm.textContent = p.name;
    const tag = document.createElement('span');
    tag.className = 'role-tag';
    tag.textContent = p.kind === 'human' ? '玩家' : (p.personality === 'renter' ? '稳健收租派' : p.personality === 'builder' ? '建筑投资派' : '道具策略派');
    nm.append(tag);
    const cash = document.createElement('p');
    cash.className = 'cash';
    cash.textContent = money(p.bankrupt ? 0 : p.cash);
    who.append(nm, cash);
    if (state) {
      const meta = document.createElement('p');
      meta.className = 'net';
      const owned = state.props.filter((x) => x.owner === p.index).length;
      meta.textContent = p.bankrupt ? '已破产' : `净资产 ${netWorth(state, p.index).toLocaleString('en-US')} · ${owned} 处`;
      who.append(meta);
    }
    li.append(who);
    const st = document.createElement('span');
    st.className = 'state';
    if (state && !state.over && state.turn.player === p.index) st.textContent = p.kind === 'human' ? '你的回合' : '行动中';
    else if (p.bankrupt) st.textContent = '出局';
    li.append(st);
    li.setAttribute('aria-label', `${p.name}，现金 ${p.cash}`);
    playerRail.append(li);
  }
}

function renderCenter() {
  const old = boardEl.querySelector('.board-center');
  old?.remove();
  const center = document.createElement('div');
  center.className = 'board-center';

  if (!state) { renderLobby(center); boardEl.append(center); return; }
  const t = state.turn;
  const you = t.player === 0;
  const roundLabel = document.createElement('p');
  roundLabel.className = 'round-label';
  roundLabel.textContent = state.over ? '终局' : `第 ${Math.min(t.round, state.roundsTotal)} / ${state.roundsTotal} 轮`;
  center.append(roundLabel);

  if (state.over) {
    const h = document.createElement('h2');
    h.textContent = '本局结束';
    const msg = document.createElement('p');
    msg.className = 'center-msg';
    msg.textContent = state.over.headline;
    const actions = document.createElement('div');
    actions.className = 'center-actions';
    const again = btn('开新一局', 'primary', () => startGame(state.roundsTotal));
    const board = btn('查看结算榜', 'secondary', openRanking);
    actions.append(again, board);
    center.append(h, msg, actions);
    boardEl.append(center);
    return;
  }

  const who = document.createElement('div');
  who.className = 'turn-who';
  who.append(avatar(currentName(), t.player));
  who.append(document.createTextNode(you ? '轮到你了' : `${currentName()}的回合`));
  center.append(who);

  const dice = document.createElement('div');
  dice.className = 'center-actions';
  for (const v of t.dice) {
    const d = document.createElement('span');
    d.className = 'die';
    d.textContent = v;
    dice.append(d);
  }
  center.append(dice);

  const h = document.createElement('h2');
  const msg = document.createElement('p');
  msg.className = 'center-msg';
  const actions = document.createElement('div');
  actions.className = 'center-actions';
  const phase = t.phase;

  if (t.skipped && phase === 'end') {
    h.textContent = '休整一回合';
    msg.textContent = `${currentName()}在${BOARD[state.players[t.player].pos].name}休息，本回合不行动。`;
  } else if (phase === 'pre' && you) {
    h.textContent = '你的回合';
    msg.textContent = '可先使用一张道具、升级一处地产，再掷骰出发。';
    if (!t.rollConsumed) actions.append(btn('掷骰子，出发', 'primary', () => run({ type: 'roll' })));
    const flags = document.createElement('div');
    flags.className = 'pre-flags';
    flags.innerHTML = `${t.usedItem ? '<s>道具 已用</s>' : '<b>道具</b> 可用'} · ${t.usedBuild ? '<s>建设 已用</s>' : '<b>建设</b> 可用'}`;
    actions.append(flags);
  } else if (phase === 'pre' && !you) {
    h.textContent = '对手行动中';
    msg.textContent = `${currentName()}正在盘算。`;
  } else if (phase === 'offer') {
    const tile = BOARD[t.pending.tile];
    const canBuy = legalActions(state).some((a) => a.type === 'buy');
    h.textContent = you ? '发现待售地产' : '新地产入账';
    msg.textContent = you ? `你抵达${tile.name}，购入价 ${money(t.pending.price)}。` : `${currentName()}正在考虑${tile.name}。`;
    if (you) {
      const buy = btn(`买下 · ${money(t.pending.price)}`, 'primary', () => run({ type: 'buy' }));
      if (!canBuy) { buy.disabled = true; buy.title = '现金不足'; }
      actions.append(buy, btn('暂不购买', 'secondary', () => run({ type: 'decline' })));
    }
  } else if (phase === 'shop') {
    h.textContent = '道具补给站';
    msg.textContent = you ? '本次可购买 1 张道具。' : `${currentName()}正在逛街。`;
    if (you) actions.append(btn('逛逛商店', 'primary', openShop));
  } else if (phase === 'target') {
    const p = t.pending;
    h.textContent = `${CARDS[p.card].name}`;
    msg.textContent = p.kind === 'dieTarget' ? '指定本回合骰子点数。' : '在棋盘上点击高亮地块，或从下面选择。';
    if (p.kind === 'dieTarget') {
      const row = document.createElement('div');
      row.className = 'die-pick';
      for (let v = 1; v <= 6; v += 1) row.append(btn(String(v), 'secondary', () => chooseDieTarget(v)));
      actions.append(row);
    } else {
      const row = document.createElement('div');
      row.className = 'pick-row';
      for (const ti of p.targets) row.append(btn(BOARD[ti].name, 'secondary', () => chooseTileTarget(ti)));
      actions.append(row);
    }
    actions.append(btn('取消', 'secondary', () => run({ type: 'cancelTarget' })));
  } else if (phase === 'end') {
    const top = state.log[0]?.text ?? '';
    h.textContent = '回合结算';
    msg.textContent = top;
    if (you) actions.append(btn('结束回合', 'primary', () => { sfx.click(); run({ type: 'endTurn' }); }));
  }

  center.append(h, msg, actions);
  boardEl.append(center);
}

function renderLobby(center) {
  const saved = loadSaved();
  const h = document.createElement('h2');
  h.textContent = '小小起点，大大版图。';
  const p = document.createElement('p');
  p.className = 'center-msg';
  p.textContent = '买地 · 建楼 · 收租 · 道具博弈';
  const row = document.createElement('div');
  row.className = 'center-actions';
  const sel = document.createElement('select');
  sel.className = 'pick-btn';
  sel.setAttribute('aria-label', '选择局长');
  for (const [v, label] of [[12, '快速局 · 12 轮'], [24, '标准局 · 24 轮'], [36, '长局 · 36 轮']]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    if (v === 24) o.selected = true;
    sel.append(o);
  }
  row.append(sel);
  row.append(btn('单机对战', 'primary', () => startGame(Number(sel.value))));
  center.append(h, p, row);
  if (saved) {
    center.append(btn('恢复当前对局', 'secondary', () => {
      state = saved;
      render();
      setStatus('对局已恢复，继续你的回合。');
      if (currentKind() === 'ai') timer = setTimeout(aiStep, STEP_MS / speed);
      syncDialog({}, state);
    }));
    const note = document.createElement('p');
    note.className = 'center-msg';
    note.textContent = `上次对局：第 ${saved.turn.round}/${saved.roundsTotal} 轮 · ${saved.players[saved.turn.player].name}的回合`;
    center.append(note);
  }
  const hint = document.createElement('p');
  hint.className = 'center-msg';
  hint.textContent = '真人对战需要服务器支持，本作是单人 + 3 AI 本地游玩。';
  center.append(hint);
}

function renderMarket() {
  marketPanel.textContent = '';
  const m = state ? MARKETS[state.market.id] : MARKETS.calm;
  const label = document.createElement('p');
  label.className = 'mp-label';
  label.innerHTML = `<span>城市风向</span><span class="market-cycle">${state ? `第 ${state.market.segment} 段 · 每 4 轮轮换` : '每 4 轮轮换'}</span>`;
  const h = document.createElement('h2');
  h.className = 'market-name';
  h.textContent = m.name;
  const d = document.createElement('p');
  d.className = 'market-desc';
  d.textContent = m.desc;
  marketPanel.append(label, h, d);
}

function renderBag() {
  bagPanel.textContent = '';
  const label = document.createElement('p');
  label.className = 'mp-label';
  const bag = state ? state.players[0].bag : [];
  label.innerHTML = `<span>策略背包</span><span class="count">${state ? `${bag.length} / ${BAG_LIMIT}` : `— / ${BAG_LIMIT}`}</span>`;
  bagPanel.append(label);
  const slots = document.createElement('div');
  slots.className = 'bag-slots';
  const usable = state && !state.over && state.turn.player === 0
    ? new Set(legalActions(state).filter((a) => a.type === 'useItem').map((a) => a.card)) : new Set();
  if (state) {
    const counts = new Map();
    for (const c of bag) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const [card, n] of counts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bag-item';
      b.textContent = `${CARD_GLYPH[card]}${n > 1 ? n : ''}`;
      const meta = CARDS[card];
      b.title = `${meta.name}：${meta.desc}`;
      b.setAttribute('aria-label', `${meta.name}：${meta.desc}`);
      b.disabled = !usable.has(card);
      b.addEventListener('click', () => run({ type: 'useItem', card }));
      slots.append(b);
    }
    for (let i = bag.length; i < BAG_LIMIT; i += 1) {
      const ghost = document.createElement('span');
      ghost.className = 'bag-item';
      ghost.style.opacity = .18;
      slots.append(ghost);
    }
  }
  bagPanel.append(slots);
  const hint = document.createElement('p');
  hint.className = 'bag-hint';
  hint.textContent = state?.turn.phase === 'pre' && state.turn.player === 0 ? '本回合还能用 1 张。' : '轮到你且掷骰前可以使用。';
  bagPanel.append(hint);
}

function renderLogs() {
  logList.textContent = '';
  const entries = state?.log ?? [];
  logEmpty.hidden = entries.length > 0;
  for (const e of entries) {
    const li = document.createElement('li');
    const r = document.createElement('span');
    r.className = 'r';
    r.textContent = `R${e.round}`;
    li.append(r, document.createTextNode(e.text));
    logList.append(li);
  }
}

function myProps() {
  if (!state) return [];
  return state.props.filter((p) => p.owner === 0);
}

function renderProps() {
  propsList.textContent = '';
  const list = myProps();
  propCount.textContent = list.length;
  propsEmpty.hidden = list.length > 0;
  const acts = state && !state.over && state.turn.player === 0 ? legalActions(state) : [];
  for (const p of list) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'p-name';
    name.textContent = BOARD[p.index].name;
    const meta = document.createElement('p');
    meta.className = 'p-meta';
    meta.textContent = `${p.level} 级建筑 · 租 ${money(currentRent(state, p.index))}`;
    left.append(name, meta);
    li.append(left);
    if (p.level < 3 && acts.some((a) => a.type === 'build' && a.tile === p.index)) {
      li.append(btn(`建 ${money(buildCost(state, p.index))}`, 'secondary', () => run({ type: 'build', tile: p.index })));
    } else if (p.level < 3) {
      const cost = btn(`建 ${money(buildCost(state, p.index))}`, 'secondary', () => {});
      cost.disabled = true;
      cost.title = state.turn.usedBuild ? '本回合已建设过' : '现金不足或非你的回合';
      li.append(cost);
    }
    propsList.append(li);
  }
}

function renderSavePanel(savedAt) {
  savePanel.textContent = '';
  const label = document.createElement('p');
  label.className = 'mp-label';
  label.innerHTML = '<span>当前对局</span><span class="market-cycle">仅保留 1 份</span>';
  savePanel.append(label);
  const row = document.createElement('p');
  row.className = 'save-row';
  if (state && !state.over) {
    const phaseLabels = { pre: '准备行动', offer: '待购买地产', shop: '挑选道具', target: '道具选择中', end: '回合结算' };
    row.textContent = `${currentName()} · ${BOARD[state.players[state.turn.player].pos].name} · ${phaseLabels[state.turn.phase] ?? '进行中'}`;
  } else {
    row.textContent = state?.over ? '本局已结束' : '暂无进行中的对局，开局后将自动保存。';
  }
  savePanel.append(row);
  if (savedAt) {
    const time = document.createElement('p');
    time.className = 'save-row';
    time.innerHTML = `<span>保存于</span><time>${new Date(savedAt).toLocaleTimeString('zh-CN')}</time>`;
    savePanel.append(time);
  }
  const note = document.createElement('p');
  note.className = 'save-note';
  note.textContent = '自动更新进度，开新局将覆盖旧存档；保存在当前浏览器，不跨设备同步。';
  savePanel.append(note);
}

function syncTopButtons() {
  $('[data-action="save-game"]').disabled = !state || !!state.over;
  $('[data-action="toggle-pause"]').disabled = !state || !!state.over;
  $('[data-action="toggle-speed"]').textContent = `×${speed}`;
  $('[data-action="toggle-speed"]').setAttribute('aria-label', `当前 ${speed} 倍速，点击切换`);
  const pause = $('[data-action="toggle-pause"]');
  pause.setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
  pause.style.borderColor = paused ? 'var(--coral)' : '';
}

function btn(text, kind, handler) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = kind === 'primary' ? 'btn' : 'btn secondary';
  b.textContent = text;
  b.addEventListener('click', handler);
  return b;
}

// ---------- 弹窗 ----------
function openDialog(html, wire) {
  dialogCard.innerHTML = html;
  dialogModal.hidden = false;
  wire?.(dialogCard);
  dialogCard.querySelector('.modal-x')?.focus();
}
function closeDialog() {
  dialogModal.hidden = true;
  dialogCard.textContent = '';
}

function syncDialog(before, next) {
  if (next.turn.phase !== 'shop' || next.turn.player !== 0) {
    if (!dialogModal.hidden && !dialogCard.dataset.pinned) closeDialog();
    return;
  }
  openShop(); // 轮到自己落到商店：自动弹出
}

function openShop() {
  const bag = state.players[0].bag;
  const acts = new Set(legalActions(state).filter((a) => a.type === 'shopBuy').map((a) => a.card));
  const items = CARD_IDS.map((id) => {
    const c = CARDS[id];
    const afford = acts.has(id);
    return `<div class="shop-item"><strong>${CARD_GLYPH[id]} ${c.name}</strong><p>${c.desc}</p>
      <button type="button" class="btn" data-shop="${id}" ${afford ? '' : 'disabled'}>购买 · ${money(c.price)}</button></div>`;
  }).join('');
  openDialog(`<header><h2>灵感补给站</h2><button type="button" class="modal-x" data-close aria-label="关闭">×</button></header>
    <div class="dialog-body">
      <p class="d-msg">本次可购买 1 张，下个回合起使用。现金 ${money(state.players[0].cash)} · 背包 ${bag.length}/${BAG_LIMIT}</p>
      <div class="shop-grid">${items}</div>
      <div class="dialog-actions"><button type="button" class="btn secondary" data-leave>这次先不买，继续旅程</button></div>
    </div>`, (card) => {
    card.querySelectorAll('[data-shop]').forEach((b) => b.addEventListener('click', () => {
      closeDialog();
      run({ type: 'shopBuy', card: b.dataset.shop });
    }));
    card.querySelector('[data-leave]').addEventListener('click', () => {
      closeDialog();
      run({ type: 'leaveShop' });
    });
    card.querySelector('[data-close]').addEventListener('click', () => closeDialog());
  });
}

function chooseTileTarget(tile) {
  run({ type: 'chooseTarget', tile });
}
function chooseDieTarget(value) {
  run({ type: 'chooseTarget', value });
}

function openTileInfo(tileIndex) {
  if (!state) return;
  const tile = BOARD[tileIndex];
  const prop = state?.props.find((p) => p.index === tileIndex);
  const ownerName = prop && prop.owner >= 0 ? state.players[prop.owner].name : '银行（待售）';
  const rentRows = [0, 1, 2, 3].map((lv) => {
    const fake = structuredClone(state);
    const fp = fake.props.find((p) => p.index === tileIndex);
    if (fp) fp.level = lv;
    const rent = tile.price ? currentRent(fake, tileIndex) : 0;
    return `<tr><td>${lv === 0 ? '空地' : `${lv} 级`}</td><td class="num">${tile.price ? money(rent) : '—'}</td></tr>`;
  }).join('');
  const isMine = prop && state && prop.owner === 0;
  const acts = isMine ? legalActions(state) : [];
  const buildable = acts.find((a) => a.type === 'build' && a.tile === tileIndex);
  const sellB = acts.find((a) => a.type === 'sellBuilding' && a.tile === tileIndex);
  const sellT = acts.find((a) => a.type === 'sellTile' && a.tile === tileIndex);
  let actionsHtml = '';
  if (buildable) actionsHtml += `<button type="button" class="btn" data-do-build>升级建筑 · ${money(buildCost(state, tileIndex))}</button>`;
  if (sellB) actionsHtml += `<button type="button" class="btn secondary" data-do-sellb>出售建筑 · +${money(Math.round(baseBuildCost(tileIndex) * 0.6))}</button>`;
  if (sellT) actionsHtml += `<button type="button" class="btn secondary" data-do-sellt>出售地块 · +${money(Math.round(basePrice(tileIndex) * 0.65))}</button>`;
  openDialog(`<header><h2>${tile.name}</h2><button type="button" class="modal-x" data-close aria-label="关闭">×</button></header>
    <div class="dialog-body">
      <p class="d-msg">${tile.group ? `${GROUPS[tile.group].name} · ` : ''}当前归属：${ownerName}${prop ? ` · 建筑 Lv.${prop.level}` : ''}${tile.price ? ` · 资产原值 ${money(tile.price)}` : ''}</p>
      ${tile.price ? `<table class="rank-table"><tr><th>等级</th><th>参考租金</th></tr>${rentRows}</table>` : `<p>${tile.sub ?? ''}</p>`}
      <div class="dialog-actions">${actionsHtml}<button type="button" class="btn secondary" data-close>关闭</button></div>
    </div>`, (card) => {
    card.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDialog));
    card.querySelector('[data-do-build]')?.addEventListener('click', () => { closeDialog(); run({ type: 'build', tile: tileIndex }); });
    card.querySelector('[data-do-sellb]')?.addEventListener('click', () => { closeDialog(); run({ type: 'sellBuilding', tile: tileIndex }); });
    card.querySelector('[data-do-sellt]')?.addEventListener('click', () => { closeDialog(); run({ type: 'sellTile', tile: tileIndex }); });
  });
}

function openRanking() {
  const rows = ranking(state).map((r) =>
    `<tr class="${r.rank === 1 ? 'rank-1' : ''}"><td>${r.rank === 1 ? '👑 第 ' + r.rank + ' 名' : `第 ${r.rank} 名`}</td><td>${r.name}${r.bankrupt ? '（破产）' : ''}</td><td class="num">${money(r.score)}</td><td class="num">${money(r.cash)}</td></tr>`).join('');
  openDialog(`<header><h2>城市结算榜</h2><button type="button" class="modal-x" data-close aria-label="关闭">×</button></header>
    <div class="dialog-body">
      <p class="d-msg">${state.over.headline}</p>
      <table class="rank-table"><tr><th>名次</th><th>玩家</th><th>净资产</th><th>现金</th></tr>${rows}</table>
      <div class="dialog-actions"><button type="button" class="btn" data-restart>开新一局</button><button type="button" class="btn secondary" data-close>关闭</button></div>
    </div>`, (card) => {
    card.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDialog));
    card.querySelector('[data-restart]').addEventListener('click', () => { closeDialog(); startGame(state.roundsTotal); });
  });
}

// 规则弹窗
function renderRules() {
  const dl = $('#card-legend');
  dl.innerHTML = CARD_IDS.map((id) => {
    const c = CARDS[id];
    return `<div><dt>${CARD_GLYPH[id]} ${c.name}<span class="price">${money(c.price)}</span></dt><dd>${c.desc}</dd></div>`;
  }).join('');
}

// ---------- 顶栏事件 ----------
$('[data-action="toggle-sound"]').addEventListener('click', (e) => {
  soundOn = !soundOn;
  unlockAudio();
  e.currentTarget.setAttribute('aria-pressed', String(soundOn));
  e.currentTarget.setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
  if (soundOn) sfx.click();
});
$('[data-action="toggle-speed"]').addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  sfx.click();
  syncTopButtons();
});
$('[data-action="toggle-pause"]').addEventListener('click', () => {
  if (!state || state.over) return;
  paused = !paused;
  if (paused && timer) { clearTimeout(timer); timer = null; }
  if (!paused) afterChange(state, state); // 恢复时重新调度
  sfx.click();
  syncTopButtons();
  setStatus(paused ? '游戏已暂停。' : '游戏继续。');
});
$('[data-action="open-rules"]').addEventListener('click', () => {
  rulesModal.hidden = false;
});
$('[data-action="save-game"]').addEventListener('click', () => {
  saveGame(true);
  render();
  setStatus('对局已保存到当前浏览器。');
  sfx.coin();
});
$('[data-action="new-game"]').addEventListener('click', () => {
  if (state && !state.over && !window.confirm('开新一局将覆盖当前自动存档，确定？')) return;
  clearSaved();
  closeDialog();
  state = null;
  render();
  setStatus('等待开始游戏');
});
rulesModal.addEventListener('click', (e) => {
  if (e.target === rulesModal || e.target.closest('[data-action="close-rules"]')) rulesModal.hidden = true;
});
dialogModal.addEventListener('click', (e) => {
  if (e.target === dialogModal) closeDialog();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDialog();
    rulesModal.hidden = true;
  }
});

// 管理面板 tabs
document.querySelectorAll('.mp-tabs [role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mp-tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    $('#panel-log').hidden = tab.dataset.tab !== 'log';
    $('#panel-props').hidden = tab.dataset.tab !== 'props';
  });
});

// ---------- 启动 ----------
renderRules();
render();
setStatus('等待开始游戏');

// 仅 ?debug 时暴露内部句柄，供自动化测试驱动完整对局；普通访问不受影响。
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.__monopoly = {
    getState: () => state,
    act: run,
    start: startGame,
    isOver: () => Boolean(state?.over),
    // 立即执行一个 AI 步（不等定时器），供自动化同步驱动整局
    aiNow: () => {
      if (!state || state.over || currentKind() !== 'ai') return false;
      if (timer) { clearTimeout(timer); timer = null; }
      aiStep();
      return true;
    },
    // 用同一套 AI 决策驱动人类回合，便于自动化跑完整局
    playHuman: () => {
      if (!state || state.over || state.turn.player !== 0) return false;
      const action = decideAction(state, 0);
      if (!action) return false;
      run(action);
      return true;
    },
  };
}
