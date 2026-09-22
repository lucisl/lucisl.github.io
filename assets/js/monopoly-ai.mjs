// 大富翁 AI 决策：纯函数 decideAction(state, playerIndex) → action | null。
// 三种性格（参考版行为对齐）：
//   renter     周稳安 —— 稳健收租：逢低买地、优先补齐同色组，攒钱不建楼。
//   builder    秦逐   —— 建筑投资：买地后积极建楼，重视租金现金流。
//   strategist 苏妙   —— 道具策略：爱逛商店、关键时刻用道具控场。
import {
  BOARD, legalActions, currentRent, buildCost, landPrice,
} from './monopoly-core.mjs';

export const AI_PROFILES = {
  renter: { name: '周稳安', tag: '稳健收租派' },
  builder: { name: '秦逐', tag: '建筑投资派' },
  strategist: { name: '苏妙', tag: '道具策略派' },
};

const CASH_RESERVE = 700; // 各性格通用的最低流动现金

function ownedTiles(state, pi) {
  return state.props.filter((p) => p.owner === pi).map((p) => p.index);
}

// 是否差一块即可集齐同色组
function completesGroup(state, pi, tileIndex) {
  const group = BOARD[tileIndex].group;
  if (!group || group === 'transit') return false;
  const mates = BOARD.filter((t) => t.group === group && t.index !== tileIndex);
  return mates.every((t) => state.props.some((p) => p.index === t.index && p.owner === pi));
}

function wantsBuy(state, pi, tile) {
  const player = state.players[pi];
  const price = landPrice(state, tile);
  if (player.cash - price < 0) return false;
  const profile = state.players[pi].personality;
  if (profile === 'renter') return player.cash - price >= CASH_RESERVE / 2;
  if (profile === 'builder') return player.cash - price >= 0;
  return player.cash - price >= CASH_RESERVE / 2 || completesGroup(state, pi, tile);
}

function bestBuildTile(state, pi) {
  // 建筑投资派：优先能补全同色组的已购地，其次租金最高的空地
  const player = state.players[pi];
  if (player.personality !== 'builder') return null;
  const candidates = state.props
    .filter((p) => p.owner === pi && p.level < 3)
    .map((p) => p.index)
    .filter((tile) => player.cash - buildCost(state, tile) >= CASH_RESERVE);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => currentRent(state, b) - currentRent(state, a));
  return candidates[0];
}

function pickItemPlay(state, pi, acts) {
  const player = state.players[pi];
  const profile = player.personality;
  const usable = acts.filter((a) => a.type === 'useItem').map((a) => a.card);
  if (usable.length === 0) return null;

  // 免租护符：现金紧张且场上有人可能收租时先挂盾
  if (usable.includes('shield') && player.cash < 1200) return { type: 'useItem', card: 'shield' };
  // 翻倍收租：拥有高租金地产时挂上
  if (usable.includes('dblRent') && ownedTiles(state, pi).some((t) => currentRent(state, t) >= 200)) {
    return { type: 'useItem', card: 'dblRent' };
  }
  // 路障：放在起点点后 7 格附近的高价区，策略派最爱
  if (usable.includes('road') && profile === 'strategist') {
    return { type: 'useItem', card: 'road' };
  }
  // 拆迁令：对手有 2 级以上建筑时削弱之
  if (usable.includes('demolish')) {
    const target = state.props.find((p) => p.owner >= 0 && p.owner !== pi && p.level >= 2);
    if (target) return { type: 'useItem', card: 'demolish' };
  }
  // 快建卡：builder 直接拍在自己的空地
  if (usable.includes('fast') && profile === 'builder') {
    const own = ownedTiles(state, pi).find((t) => state.props.some((p) => p.index === t && p.level < 3));
    if (own !== undefined) return { type: 'useItem', card: 'fast' };
  }
  // 定点骰：距离可买的同色补全块 ≤6 时控步去买
  if (usable.includes('aim')) {
    const target = BOARD.findIndex((t, i) => i > player.pos && i <= player.pos + 6
      && t.price && state.props.every((p) => p.index !== i || p.owner < 0));
    if (target >= 0) {
      const pos = ((target - player.pos) % 24 + 24) % 24;
      if (pos >= 1 && pos <= 6) return { type: 'useItem', card: 'aim', value: pos };
    }
  }
  // 迁跃卡：直达最贵的无主地块
  if (usable.includes('teleport') && profile === 'strategist') {
    const free = BOARD.filter((t) => t.price && state.props.every((p) => p.index !== t.index || p.owner < 0))
      .sort((a, b) => b.price - a.price)[0];
    if (free) return { type: 'useItem', card: 'teleport' };
  }
  return null;
}

// 主入口：返回当前 AI 玩家的一个合法动作；null 表示 UI 应继续等待/推进。
// rand 注入以便测试复现；UI 使用默认 Math.random。
export function decideAction(state, playerIndex = state.turn.player, rand = Math.random) {
  const player = state.players[playerIndex];
  const acts = legalActions(state);
  if (acts.length === 0) return null;
  const types = (t) => acts.filter((a) => a.type === t);

  switch (state.turn.phase) {
    case 'pre': {
      // 策略派优先用道具，其他性格只在关键时刻用
      const item = pickItemPlay(state, playerIndex, acts);
      if (item && (player.personality === 'strategist' || rand() < 0.5 || item.card === 'shield')) {
        return item;
      }
      if (player.personality === 'builder') {
        const tile = bestBuildTile(state, playerIndex);
        if (tile !== null && !state.turn.usedBuild && types('build').some((a) => a.tile === tile)) {
          return { type: 'build', tile };
        }
      }
      const roll = types('roll')[0];
      if (roll) return { type: 'roll' };
      return types('endTurn')[0] ?? null;
    }
    case 'offer': {
      const tile = state.turn.pending.tile;
      if (types('buy').length > 0 && wantsBuy(state, playerIndex, tile)) {
        return { type: 'buy' };
      }
      return { type: 'decline' };
    }
    case 'shop': {
      if (player.personality !== 'strategist' && state.turn.round % 2 === 0 && rand() < 0.5) {
        return { type: 'leaveShop' };
      }
      const buys = types('shopBuy');
      if (buys.length === 0) return { type: 'leaveShop' };
      const priority = ['shield', 'dblRent', 'aim', 'double', 'fast', 'demolish', 'teleport', 'road', 'forced'];
      const chosen = buys.sort((a, b) => priority.indexOf(a.card) - priority.indexOf(b.card))[0];
      return chosen;
    }
    case 'target': {
      const pending = state.turn.pending;
      if (!pending || pending.targets.length === 0) return { type: 'cancelTarget' };
      if (pending.kind === 'dieTarget') {
        const card = pending.card;
        if (card === 'aim') {
          // 走向最近的无主可买地块
          const p = state.players[playerIndex];
          for (let step = 1; step <= 6; step += 1) {
            const landing = (p.pos + step) % 24;
            const tile = BOARD[landing];
            const prop = state.props.find((x) => x.index === landing);
            if (tile.price && prop && prop.owner < 0) return { type: 'chooseTarget', value: step };
          }
        }
        return { type: 'chooseTarget', value: 1 };
      }
      // 地块目标
      const targets = pending.targets;
      const card = pending.card;
      if (card === 'teleport') {
        // 直达最贵无主地块，否则原地
        const best = targets
          .filter((t) => BOARD[t].price && (state.props.find((p) => p.index === t)?.owner ?? -1) < 0)
          .sort((a, b) => BOARD[b].price - BOARD[a].price)[0];
        return { type: 'chooseTarget', tile: best ?? targets[0] };
      }
      if (card === 'road') {
        // 放在自己身前的地块防身
        const ahead = targets.find((t) => t !== player.pos && t > player.pos);
        return { type: 'chooseTarget', tile: ahead ?? targets[0] };
      }
      if (card === 'demolish' || card === 'forced') {
        const sorted = [...targets].sort((a, b) => {
          const pa = state.props.find((p) => p.index === a);
          const pb = state.props.find((p) => p.index === b);
          const ra = currentRent(state, a);
          const rb = currentRent(state, b);
          return rb - ra || (pb.level ?? 0) - (pa.level ?? 0);
        });
        return { type: 'chooseTarget', tile: sorted[0] };
      }
      // 快建卡：租金最高的自有空地
      const best = [...targets].sort((a, b) => currentRent(state, b) - currentRent(state, a))[0];
      return { type: 'chooseTarget', tile: best };
    }
    case 'end':
      return { type: 'endTurn' };
    default:
      return acts[0] ?? null;
  }
}
