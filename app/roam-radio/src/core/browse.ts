// 浏览/筛选核心：流派、码率、语言、国家四组筛选 + 随机掉台 + 附近电台 + 搜索 + 星图聚类。
import type { Snapshot } from './snapshot.ts';

export interface Filters {
  /** 已选流派（小写规范名）。空数组 = 不过滤。 */
  genres: string[];
  /** 最低码率 kbps，0 = 不限。 */
  minBitrate: number;
  /** 已选语言，空 = 全部。 */
  langs: string[];
  /** 已选国家 code，空 = 全部。 */
  countries: string[];
  /** 搜索词（name/city/country 子串匹配，小写）。 */
  query: string;
}

export const emptyFilters = (): Filters => ({ genres: [], minBitrate: 0, langs: [], countries: [], query: '' });

/** 返回满足筛选的行索引数组（升序）。 */
export function applyFilters(s: Snapshot, f: Filters): number[] {
  const out: number[] = [];
  const gWant: number[] = [];
  for (const name of f.genres) {
    const gi = s.genres.indexOf(name);
    if (gi >= 0) gWant.push(gi);
  }
  const lWant: number[] = [];
  for (const name of f.langs) {
    const li = s.langs.indexOf(name);
    if (li >= 0) lWant.push(li);
  }
  const cWant: number[] = [];
  for (const code of f.countries) {
    const ci = s.countries.findIndex(c => c.code === code);
    if (ci >= 0) cWant.push(ci);
  }
  const q = f.query.trim().toLowerCase();
  for (let i = 0; i < s.n; i++) {
    if (f.minBitrate > 0 && s.br[i] < f.minBitrate) continue;
    if (lWant.length && !lWant.includes(s.l[i])) continue;
    if (cWant.length && !cWant.includes(s.c[i])) continue;
    if (gWant.length) {
      const gs = s.g[i] ?? [];
      let hit = false;
      for (const gi of gWant) if (gs.includes(gi)) { hit = true; break; }
      if (!hit) continue;
    }
    if (q) {
      const hay = (s.names[i] + ' ' + s.city[i] + ' ' + (s.countries[s.c[i]]?.name ?? '')).toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(i);
  }
  return out;
}

/** 流派计数（用于筛选条上的数字），忽略流派自身的选择。 */
export function genreCounts(s: Snapshot, f: Filters): Map<string, number> {
  const base = applyFilters(s, { ...f, genres: [] });
  const counts = new Map<string, number>();
  for (const i of base) {
    for (const gi of s.g[i] ?? []) {
      const name = s.genres[gi];
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** 可注入 rng 以便单测；默认 Math.random。 */
export function randomPick(indices: number[], rng: () => number = Math.random): number {
  if (!indices.length) return -1;
  return indices[Math.min(indices.length - 1, Math.floor(rng() * indices.length))];
}

/** 热门加权随机：pop 桶越大越容易被抽中（平方权重，兼顾新鲜感）。 */
export function weightedRandomPick(s: Snapshot, indices: number[], rng: () => number = Math.random): number {
  if (!indices.length) return -1;
  let total = 0;
  for (const i of indices) total += (s.pop[i] ?? 0) ** 2 + 1;
  let r = rng() * total;
  for (const i of indices) {
    r -= (s.pop[i] ?? 0) ** 2 + 1;
    if (r <= 0) return i;
  }
  return indices[indices.length - 1];
}

/** 大圆距离 km。 */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 按距离取附近电台（用于「↑↓ nearby」和「城市展开螺旋」）。 */
export function nearby(s: Snapshot, indices: number[], lat: number, lng: number, k: number): { i: number; km: number }[] {
  const scored = indices.map(i => ({ i, km: distanceKm(lat, lng, s.lat[i] / 100, s.lng[i] / 100) }));
  scored.sort((a, b) => a.km - b.km);
  return scored.slice(0, k);
}

export interface StarCluster {
  lat: number;
  lng: number;
  count: number;
  pop: number; // 簇内最高热度
  memberIdx: number; // 代表行索引（最高 pop）
}

/**
 * 星图聚类：按 cellDeg 度网格聚合。zoom 层级越大 cellDeg 越小，
 * 城市从单点展开成螺旋由上层渲染决定，这里只负责分组。
 */
export function clusterStations(s: Snapshot, indices: number[], cellDeg: number): StarCluster[] {
  const byCell = new Map<string, { lat: number; lng: number; n: number; pop: number; best: number }>();
  for (const i of indices) {
    const key = Math.floor(s.lat[i] / 100 / cellDeg) + ':' + Math.floor(s.lng[i] / 100 / cellDeg);
    let c = byCell.get(key);
    if (!c) {
      c = { lat: 0, lng: 0, n: 0, pop: -1, best: i };
      byCell.set(key, c);
    }
    c.lat += s.lat[i];
    c.lng += s.lng[i];
    c.n += 1;
    if ((s.pop[i] ?? 0) > c.pop) {
      c.pop = s.pop[i] ?? 0;
      c.best = i;
    }
  }
  const out: StarCluster[] = [];
  for (const c of byCell.values()) {
    out.push({ lat: c.lat / c.n / 100, lng: c.lng / c.n / 100, count: c.n, pop: c.pop, memberIdx: c.best });
  }
  return out;
}
