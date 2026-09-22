import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, dispatch, legalActions, currentPlayerIndex,
} from '../assets/js/monopoly-core.mjs';
import { decideAction, AI_PROFILES } from '../assets/js/monopoly-ai.mjs';

// 可复现随机源（mulberry32）
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 让所有玩家（含玩家 0）都交给 AI 决策，跑完整局。allLogs 收集全程动态（state.log 只留 40 条）。
function simulate(seed, { rounds = 16, maxSteps = 6000, allLogs = false } = {}) {
  const rand = rng(seed);
  let state = createGame({ seed, rounds });
  const collected = new Map();
  let steps = 0;
  while (!state.over && steps < maxSteps) {
    steps += 1;
    const acts = legalActions(state);
    assert.ok(acts.length > 0, `phase ${state.turn.phase} 没有合法动作`);
    const action = decideAction(state, currentPlayerIndex(state), rand);
    assert.ok(action, `AI 在 phase ${state.turn.phase} 返回了 null，但合法动作有 ${acts.length} 个`);
    // 动作必须合法
    assert.ok(
      acts.some((a) => a.type === action.type
        && (a.card === undefined || a.card === action.card)
        && (a.tile === undefined || a.tile === action.tile)
        && (a.value === undefined || action.value === undefined || a.value === action.value)),
      `AI 选择了非法动作 ${JSON.stringify(action)}，合法集 ${JSON.stringify(acts)}`,
    );
    state = dispatch(state, action);
    if (allLogs) for (const entry of state.log) collected.set(entry.id, entry.text);
    // 基础不变量
    for (const p of state.players) {
      assert.ok(p.cash >= 0 && Number.isInteger(p.cash), `非法现金 ${p.cash}`);
      assert.ok(p.bag.length <= 6, '背包溢出');
    }
    assert.ok(state.log.length <= 40);
  }
  assert.ok(state.over, `未能在 ${maxSteps} 步内结束`);
  return { state, steps, logs: [...collected.values()] };
}

test('AI 整局模拟：多种子都能自然结束并产出排名', () => {
  for (const seed of [1, 7, 99, 2024, 31337]) {
    const { state } = simulate(seed);
    assert.equal(state.over.ranking.length, 4);
    const rows = state.over.ranking;
    assert.equal(rows[0].rank, 1);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i - 1].score >= rows[i].score, '排名应按净资产降序');
    }
    // 至少发生过买地（地产有主）——说明 AI 确实在经营
    assert.ok(state.props.some((p) => p.owner >= 0), 'AI 全局没买过任何地产');
  }
});

test('AI 模拟可复现：同一种子得到同样的终局', () => {
  const a = simulate(555).state.over;
  const b = simulate(555).state.over;
  assert.deepEqual(a.ranking, b.ranking);
});

test('AI 会做投资动作：出现买地、建楼、收租事件', () => {
  let sawBuild = false;
  let sawRent = false;
  let sawBuy = false;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { logs } = simulate(seed, { rounds: 24, allLogs: true });
    const joined = logs.join('\n');
    if (/升到 \d 级（花费/.test(joined)) sawBuild = true;
    if (/的租金/.test(joined)) sawRent = true;
    if (/城市币买下/.test(joined)) sawBuy = true;
  }
  assert.ok(sawBuy, '应有买地行为');
  assert.ok(sawBuild, '应有建楼行为（builder 性格）');
  assert.ok(sawRent, '应有收租行为');
});

test('AI 模拟跨多种子均能推进到终局、不卡死、不产生非法状态', () => {
  // AI 性格保守、经济稳，正常对局极少破产（破产路径由 core 测试直接覆盖）。
  // 这里验证引擎 + AI 组合在长局里始终有合法动作、状态自洽。
  for (const seed of [10, 20, 30, 40, 50, 60, 70, 80]) {
    const { state, steps } = simulate(seed, { rounds: 24 });
    assert.ok(state.over, `seed ${seed} 未正常结束`);
    assert.ok(steps > 50, `seed ${seed} 结束得过快（${steps} 步）`);
    // 结束时至少有人在经营地产
    assert.ok(state.props.some((p) => p.owner >= 0), `seed ${seed} 全程无人持有地产`);
    for (const p of state.players) {
      if (p.bankrupt) assert.equal(p.cash, 0);
    }
  }
});

test('decideAction：offer 阶段现金足够买地时会买下，不够则放弃', () => {
  // 构造：玩家 0 轮到 pre，用定点骰走到无主地块触发 offer，再断言 AI 选择 buy
  const rand = rng(1);
  let state = createGame({ seed: 5, rounds: 24 });
  const p0 = state.players[0];
  p0.pos = 0;
  p0.bag = [];
  p0.cash = 6000;
  // 直接进 offer：把玩家 0 送到第 1 格（晨风小筑，600）
  state.turn.player = 0;
  state.turn.phase = 'offer';
  state.turn.pending = { kind: 'offer', tile: 1, price: 600 };
  const action = decideAction(state, 0, rand);
  assert.deepEqual(action, { type: 'buy' });

  // 现金不足：legalActions 里就没有 buy，AI 应回退到 decline
  state = createGame({ seed: 5 });
  state.turn.phase = 'offer';
  state.turn.pending = { kind: 'offer', tile: 22, price: 1900 };
  state.players[0].cash = 100;
  assert.equal(legalActions(state).some((a) => a.type === 'buy'), false);
  assert.deepEqual(decideAction(state, 0, rand), { type: 'decline' });
});

test('AI 人格名与档案一致', () => {
  assert.equal(AI_PROFILES.renter.name, '周稳安');
  assert.equal(AI_PROFILES.builder.name, '秦逐');
  assert.equal(AI_PROFILES.strategist.name, '苏妙');
});
