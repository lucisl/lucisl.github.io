// 快照编解码 + 行视图单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  flagEmoji,
  flagsOf,
  normalizeGenreTag,
  popBucketOf,
  primaryLangOf,
  rowOf,
  topGenresOf,
  SNAPSHOT_VERSION,
  type RawStation,
} from '../src/core/snapshot.ts';

function station(over: Partial<RawStation>): RawStation {
  return {
    stationuuid: 'a'.repeat(36),
    name: 'Test FM',
    url: 'https://stream.example/live.mp3',
    url_resolved: 'https://stream.example/live.mp3',
    codec: 'MP3',
    bitrate: 128,
    hls: 0,
    ssl_error: 0,
    country: 'France',
    countrycode: 'FR',
    state: 'Île-de-France',
    language: 'french',
    tags: 'pop, talk',
    votes: 10,
    clickcount: 100,
    clicktrend: 50,
    ...over,
  };
}

const resolveAll = { lat: 48.85, lng: 2.35, prec: 1 as const, tz: 'Europe/Paris', city: 'Paris' };

test('buildSnapshot 基础列对齐与词典', () => {
  const s = buildSnapshot([station({}), station({ stationuuid: 'b'.repeat(36), name: 'Radio B', language: 'english', tags: 'rock' })], () => resolveAll);
  assert.equal(s.v, SNAPSHOT_VERSION);
  assert.equal(s.n, 2);
  assert.equal(s.lat.length, 2);
  assert.deepEqual(s.genres, ['pop', 'news & talk', 'rock']);
  assert.deepEqual(s.langs, ['french', 'english']);
  assert.equal(s.countries[0].code, 'FR');
  assert.equal(s.tzs.length, 1);
  assert.equal(s.lat[0], 4885);
  assert.equal(s.lng[0], 235);
});

test('name+url 相同的行去重', () => {
  const s = buildSnapshot([station({ stationuuid: 'x'.repeat(36) }), station({ stationuuid: 'y'.repeat(36), name: '  test   fm ' })], () => resolveAll);
  assert.equal(s.n, 1);
});

test('无效行被跳过', () => {
  const s = buildSnapshot([
    station({ name: '' }),
    station({ stationuuid: 'b'.repeat(36), url_resolved: 'ftp://nope', url: 'ftp://nope' }),
    station({ stationuuid: 'c'.repeat(36) }),
  ], () => resolveAll);
  assert.equal(s.n, 1);
});

test('resolve 返回 null 时跳过', () => {
  const s = buildSnapshot([station({}), station({ stationuuid: 'z'.repeat(36), name: 'ZZZ' })], (r) => (r.stationuuid.startsWith('a') ? resolveAll : null));
  assert.equal(s.n, 1);
});

test('rowOf 还原完整视图', () => {
  const s = buildSnapshot([station({ url: 'http://backup.example/live.mp3', url_resolved: 'https://stream.example/live.mp3' })], () => resolveAll);
  const row = rowOf(s, 0);
  assert.ok(row);
  assert.equal(row.name, 'Test FM');
  assert.equal(row.url, 'https://stream.example/live.mp3');
  assert.equal(row.urlAlt, 'http://backup.example/live.mp3');
  assert.equal(row.country.name, 'France');
  assert.deepEqual(row.genres, ['pop', 'news & talk']);
  assert.equal(row.lang, 'french');
  assert.equal(row.city, 'Paris');
  assert.equal(row.tz, 'Europe/Paris');
  assert.ok(row.https && row.mp3 && !row.hls);
  assert.equal(rowOf(s, 999), null);
});

test('encode/decode 往返一致（容忍缺字段）', () => {
  const s = buildSnapshot([station({})], () => resolveAll);
  const back = decodeSnapshot(encodeSnapshot(s));
  assert.deepEqual(back.names, s.names);
  assert.deepEqual(back.g, s.g);
  const partial = decodeSnapshot(JSON.stringify({ v: 1, n: 1, names: ['x'] }));
  assert.equal(partial.n, 1);
  assert.deepEqual(partial.urls, []);
});

test('归一化：流派/语言/码率标志', () => {
  assert.equal(normalizeGenreTag('Top 40'), 'pop');
  assert.equal(normalizeGenreTag('News/Talk'), 'news & talk');
  assert.equal(primaryLangOf('eng,spa'), 'english');
  assert.equal(primaryLangOf(''), '');
  assert.deepEqual(topGenresOf('pop, pop, rock, jazz, classical'), ['pop', 'rock', 'jazz', 'classical']);
  assert.equal(flagsOf(station({ url: 'http://a', url_resolved: 'http://a' })), 4);
  assert.equal(flagsOf(station({ hls: 1 })), 1 | 2 | 4);
});

test('popBucket 单调且不越界', () => {
  assert.equal(popBucketOf(station({ clicktrend: 0, clickcount: 0, votes: 0 })), 0);
  assert.ok(popBucketOf(station({ clicktrend: 5 })) >= popBucketOf(station({ clicktrend: 1 })));
  assert.ok(popBucketOf(station({ clicktrend: 1e9 })) <= 10);
});

test('flagEmoji', () => {
  assert.equal(flagEmoji('FR'), '🇫🇷');
  assert.equal(flagEmoji('--'), '🏳️');
});
