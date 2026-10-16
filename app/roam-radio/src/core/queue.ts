// 秒切与换线路核心：上一站历史环、下一站候选、同一电台多线路失败切换。
import type { StationRow } from './snapshot.ts';

/** 历史环：push 当前台，back() 依次回退（最多 size 个）。 */
export class HistoryRing {
  private items: number[] = [];
  constructor(private size = 50) {}
  push(i: number) {
    if (this.items[this.items.length - 1] === i) return;
    this.items.push(i);
    if (this.items.length > this.size) this.items.shift();
  }
  popBack(): number | null {
    if (this.items.length < 2) return null;
    this.items.pop();
    return this.items[this.items.length - 1];
  }
  get current(): number | null {
    return this.items.length ? this.items[this.items.length - 1] : null;
  }
  get length(): number {
    return this.items.length;
  }
}

/** 一个电台的候选线路（先 https 后 http，先主后备；去重）。 */
export function streamCandidates(row: StationRow): string[] {
  const urls: string[] = [];
  for (const u of [row.url, row.urlAlt]) {
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls;
}

/** 第 fail 次失败后应使用的候选线路索引（自动换线路）。 */
export function candidateAfterFailures(candidates: string[], failures: number): number {
  return Math.min(candidates.length - 1, Math.max(0, failures));
}

/**
 * 下一站选取：排除当前台与最近 avoid 个历史台，避免连续重复。
 * rng 注入以便单测。
 */
export function pickNext(
  indices: number[],
  avoid: number[],
  rng: () => number = Math.random,
): number {
  if (!indices.length) return -1;
  const banned = new Set(avoid);
  const pool = banned.size ? indices.filter(i => !banned.has(i)) : indices;
  if (!pool.length) return indices[Math.min(indices.length - 1, Math.floor(rng() * indices.length))];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** 预缓冲队列：从第 1 候选开始的连续 K 个不重复随机台（秒切用）。 */
export function prefetchQueue(
  indices: number[],
  current: number,
  size = 3,
  rng: () => number = Math.random,
): number[] {
  const out: number[] = [];
  let guard = 0;
  while (out.length < size && guard < size * 20) {
    const i = pickNext(indices, [current, ...out], rng);
    if (i >= 0 && !out.includes(i)) out.push(i);
    guard++;
  }
  return out;
}
