// 筛选/随机/附近/聚类 单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilters,
  clusterStations,
  distanceKm,
  emptyFilters,
  genreCounts,
  nearby,
  randomPick,
  weightedRandomPick,
  type Filters,
} from '../src/core/browse.ts';
import { buildSnapshot, type RawStation, type Snapshot } from '../src/core/snapshot.ts';

function makeStation(over: Partial<RawStation>): RawStation {
  return {
    stationuuid: '0'.repeat(36),
    name: 'X',
    url: 'https://s.example/1',
    url_resolved: 'https://s.example/1',
    codec: 'MP3',
    bitrate: 64,
    hls: 0,
    ssl_error: 0,
    country: 'China',
    countrycode: 'CN',
    state: 'Beijing',
    language: 'chinese',
    tags: 'pop',
    votes: 5,
    clickcount: 50,
    clicktrend: 50,
    ...over,
  };
}

function fixture(): Snapshot {
  const rows: RawStation[] = [];
  const coords: Record<string, { lat: number; lng: number }> = {
    A: { lat: 39.9, lng: 116.4 },
    B: { lat: 31.2, lng: 121.5 },
    C: { lat: 48.85, lng: 2.35 },
    D: { lat: 40.7, lng: -74.0 },
    E: { lat: 39.95, lng: 116.35 },
  };
  const def = [
    makeStation({ stationuuid: 'a'.repeat(36), name: 'Radio A', tags: 'pop,jazz', bitrate: 320 }),
    makeStation({ stationuuid: 'b'.repeat(36), name: 'Radio B', countrycode: 'CN', state: 'Shanghai', tags: 'rock', bitrate: 128, language: 'english' }),
    makeStation({ stationuuid: 'c'.repeat(36), name: 'Radio C', countrycode: 'FR', country: 'France', state: '', tags: 'pop', bitrate: 64, language: 'french' }),
    makeStation({ stationuuid: 'd'.repeat(36), name: 'Jazz NYC', countrycode: 'US', country: 'United States', state: '', tags: 'jazz, news & talk', bitrate: 192, clicktrend: 5000 }),
    makeStation({ stationuuid: 'e'.repeat(36), name: 'Radio E', tags: 'classical', bitrate: 96, language: '' }),
  ];
  const names = ['A', 'B', 'C', 'D', 'E'];
  for (let i = 0; i < def.length; i++) rows.push(def[i]);
  return buildSnapshot(rows, (r) => {
    const k = names[def.indexOf(r)];
    return { lat: coords[k].lat, lng: coords[k].lng, prec: 1, tz: 'UTC', city: 'C' + k };
  });
}

test('applyFilters：码率/语言/国家/流派/搜索', () => {
  const s = fixture();
  const idx = (f: Partial<Filters>) => applyFilters(s, { ...emptyFilters(), ...f }).map(i => s.names[i]);
  assert.deepEqual(idx({ minBitrate: 128 }).sort(), ['Jazz NYC', 'Radio A', 'Radio B']);
  assert.deepEqual(idx({ langs: ['english'] }), ['Radio B']);
  assert.deepEqual(idx({ countries: ['FR'] }), ['Radio C']);
  assert.deepEqual(idx({ genres: ['jazz'] }).sort(), ['Jazz NYC', 'Radio A']);
  assert.deepEqual(idx({ genres: ['jazz'], minBitrate: 192 }).sort(), ['Jazz NYC', 'Radio A']);
  assert.deepEqual(idx({ query: 'nyc' }), ['Jazz NYC']);
  assert.deepEqual(idx({ query: '上海' }), []);
});

test('genreCounts 忽略流派自身选择', () => {
  const s = fixture();
  const counts = genreCounts(s, { ...emptyFilters(), genres: ['pop'] });
  assert.equal(counts.get('jazz'), 2); // pop 已选时仍统计全部（基数=其余筛选）
});

test('randomPick 空集返回 -1；rng 决定结果', () => {
  assert.equal(randomPick([]), -1);
  assert.equal(randomPick([7, 8, 9], () => 0), 7);
  assert.equal(randomPick([7, 8, 9], () => 0.999999), 9);
});

test('weightedRandomPick 偏爱高热度', () => {
  const s = fixture();
  const all = [0, 1, 2, 3, 4];
  let hitsD = 0;
  const rng = mulberry32(42);
  for (let k = 0; k < 4000; k++) if (weightedRandomPick(s, all, rng) === 3) hitsD++;
  // D 的 pop=10（其余 8）：期望权重 ≈ 101/(101+4×65) ≈ 28%；均匀分布只有 20%
  assert.ok(hitsD > 1000, `high-pop station picked ${hitsD}/4000 times`);
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('nearby 按距离排序', () => {
  const s = fixture();
  const near = nearby(s, [0, 1, 2, 3, 4], 39.9, 116.4, 3);
  assert.equal(near.length, 3);
  assert.equal(s.names[near[0].i], 'Radio A');
  assert.ok(near[0].km < near[1].km && near[1].km < near[2].km);
});

test('distanceKm 已知城市对', () => {
  const km = distanceKm(39.9, 116.4, 31.2, 121.5);
  assert.ok(km > 1000 && km < 1100, `Beijing-Shanghai ~1060km got ${km.toFixed(0)}`);
});

test('clusterStations 聚合与代表台', () => {
  const s = fixture();
  const clusters = clusterStations(s, [0, 1, 2, 3, 4], 5);
  const bj = clusters.find(c => Math.abs(c.lat - 39.92) < 0.1);
  assert.ok(bj, 'beijing cluster exists');
  assert.equal(bj.count, 2); // A + E
  assert.equal(s.names[bj.memberIdx] === 'Radio A' || s.names[bj.memberIdx] === 'Radio E', true);
});
