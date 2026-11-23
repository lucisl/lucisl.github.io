// 刷新合并核心单测：从旧快照学习坐标解析
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResolverFromSnapshot, rebuildRowsFromSnapshot } from '../src/core/merge.ts';
import { buildSnapshot, type RawStation, type ResolvedCoords } from '../src/core/snapshot.ts';

function raw(over: Partial<RawStation>): RawStation {
  return {
    stationuuid: 'u' + Math.random().toString(36).slice(2, 30),
    name: 'Station',
    url: 'https://s.example/1',
    url_resolved: 'https://s.example/1',
    codec: 'MP3', bitrate: 128, hls: 0, ssl_error: 0,
    country: 'China', countrycode: 'CN', state: 'Beijing',
    language: 'chinese', tags: 'pop', votes: 1, clickcount: 10, clicktrend: 5,
    ...over,
  };
}

const coordsFor: Record<string, ResolvedCoords> = {
  'CN|Beijing': { lat: 39.9, lng: 116.4, prec: 1, tz: 'Asia/Shanghai', city: 'Beijing' },
  'CN|Shanghai': { lat: 31.2, lng: 121.5, prec: 1, tz: 'Asia/Shanghai', city: 'Shanghai' },
  'FR|': { lat: 48.8, lng: 2.3, prec: 0, tz: 'Europe/Paris', city: '' },
};
const resolver = (row: RawStation): ResolvedCoords | null =>
  coordsFor[(row.countrycode || '') + '|' + (row.state || '')] ?? null;

test('旧快照 → 学习出的解析器命中同行政区', () => {
  const old = buildSnapshot(
    [raw({ name: 'A1', state: 'Beijing' }), raw({ name: 'A2', state: 'Shanghai' }), raw({ name: 'F1', countrycode: 'FR', country: 'France', state: '' })],
    resolver,
  );
  const learned = buildResolverFromSnapshot(old);
  const bj = learned(raw({ name: 'New', state: 'Beijing' }));
  assert.ok(bj && Math.abs(bj.lat - 39.9) < 0.01 && bj.prec === 1);
  // 大小写/常见后缀差异也能命中（"Beijing" vs "beijing"）
  const bj2 = learned(raw({ name: 'New2', state: 'BEIJING' }));
  assert.ok(bj2 && bj2.prec === 1);
  // 未知行政区 → 国家质心
  const xj = learned(raw({ name: 'New3', state: 'Xinjiang' }));
  assert.ok(xj && xj.prec === 0 && Math.abs(xj.lat - 35.55) < 0.1); // 中京沪均值附近
  // 无国家码 → null
  assert.equal(learned(raw({ name: 'Bad', countrycode: '' })), null);
});

test('重建行 → 再编码，数据保持', () => {
  const snap = buildSnapshot([raw({ name: 'Keep Me', state: 'Beijing', tags: 'pop,rock' })], resolver);
  const rebuilt = rebuildRowsFromSnapshot(snap);
  const snap2 = buildSnapshot(rebuilt, (r) => (r.state ? coordsFor['CN|Beijing'] : null));
  assert.equal(snap2.n, 1);
  assert.equal(snap2.names[0], 'Keep Me');
  assert.deepEqual(snap2.g[0].map(gi => snap2.genres[gi]).sort(), ['pop', 'rock']);
  assert.equal(snap2.lat[0], 3990);
});
