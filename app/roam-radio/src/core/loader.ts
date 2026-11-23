// 快照加载：优先用 SQLite 里更新的刷新缓存，否则解随包 gz(base64) 模块。
import pako from 'pako';
import { buildResolverFromSnapshot } from './merge.ts';
import { buildSnapshot, decodeSnapshot, encodeSnapshot, SNAPSHOT_VERSION, type RawStation, type Snapshot } from './snapshot.ts';
import { getDirectoryCache, putDirectoryCache } from '../store/db.ts';
import { BUNDLED_SNAPSHOT_GZ_B64 } from './bundledSnapshot.generated.ts';

const B64IDX = (() => {
  const t = new Int16Array(256).fill(-1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) t[chars.charCodeAt(i)] = i;
  return t;
})();

/** 无 atob 依赖的 base64 → bytes */
export function b64ToBytes(b64: string): Uint8Array {
  const out = new Uint8Array(Math.floor((b64.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < b64.length; i++) {
    const c = b64.charCodeAt(i);
    const v = c < 256 ? B64IDX[c] : -1;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export async function loadSnapshot(): Promise<{ snap: Snapshot; from: 'cache' | 'bundle' }> {
  const cached = await getDirectoryCache().catch(() => null);
  if (cached) {
    try {
      const s = decodeSnapshot(cached.json);
      if (s.v === SNAPSHOT_VERSION && s.n > 1000) return { snap: s, from: 'cache' };
    } catch {
      /* 缓存损坏 → 用随包 */
    }
  }
  const json = new TextDecoder('utf-8').decode(pako.ungzip(b64ToBytes(BUNDLED_SNAPSHOT_GZ_B64)));
  return { snap: decodeSnapshot(json), from: 'bundle' };
}

export interface RefreshResult {
  snap: Snapshot;
  added: number;
  dropped: number;
}

/** 应用内刷新目录：直接调 Radio Browser；坐标从旧快照学习；失败抛出。 */
export async function refreshDirectory(old: Snapshot, fetchJson: () => Promise<RawStation[]>): Promise<RefreshResult> {
  const rows = await fetchJson();
  const resolver = buildResolverFromSnapshot(old);
  const fresh = buildSnapshot(rows, resolver);
  if (fresh.n < old.n * 0.5) {
    throw new Error(`刷新结果过少（${fresh.n}），已保留原目录`);
  }
  const oldIds = new Set(old.ids);
  const newIds = new Set(fresh.ids);
  let added = 0;
  let dropped = 0;
  for (const id of newIds) if (!oldIds.has(id)) added++;
  for (const id of oldIds) if (!newIds.has(id)) dropped++;
  await putDirectoryCache(fresh.builtAt, encodeSnapshot(fresh));
  return { snap: fresh, added, dropped };
}

/** 构造刷新用的 Radio Browser 拉取函数（RN fetch，无需 CORS）。 */
export function radioBrowserFetcher(apiBase = 'https://de1.api.radio-browser.info'): () => Promise<RawStation[]> {
  return async () => {
    const res = await fetch(
      `${apiBase}/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=60000`,
      { headers: { Accept: 'application/json', 'User-Agent': 'RoamRadio/1.0' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as RawStation[];
  };
}
