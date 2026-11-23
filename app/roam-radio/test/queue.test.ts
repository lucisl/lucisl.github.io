// 秒切队列 / 历史环 / 换线路 单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateAfterFailures,
  HistoryRing,
  pickNext,
  prefetchQueue,
  streamCandidates,
} from '../src/core/queue.ts';
import type { StationRow } from '../src/core/snapshot.ts';

function row(url: string, urlAlt = ''): StationRow {
  return {
    i: 0, id: 'id', name: 'n', url, urlAlt, lat: 0, lng: 0, prec: 1, city: '',
    country: { code: 'CN', name: 'China', lat: 0, lng: 0, tz: '' },
    genres: [], lang: '', pop: 1, bitrate: 128, https: true, hls: false, mp3: true, tz: '',
  };
}

test('HistoryRing push/current/popBack 与上限', () => {
  const h = new HistoryRing(3);
  assert.equal(h.current, null);
  h.push(1); h.push(1); // 连续重复忽略
  h.push(2); h.push(3); h.push(4);
  assert.equal(h.length, 3);
  assert.equal(h.current, 4);
  assert.equal(h.popBack(), 3);
  assert.equal(h.popBack(), 2);
  assert.equal(h.popBack(), null); // 只剩一个时不回退
  assert.equal(h.current, 2);
});

test('streamCandidates 去重且主备有序', () => {
  assert.deepEqual(streamCandidates(row('https://a', 'https://a')), ['https://a']);
  assert.deepEqual(streamCandidates(row('https://a', 'http://b')), ['https://a', 'http://b']);
});

test('candidateAfterFailures 夹在候选范围内', () => {
  const c = ['a', 'b'];
  assert.equal(candidateAfterFailures(c, 0), 0);
  assert.equal(candidateAfterFailures(c, 1), 1);
  assert.equal(candidateAfterFailures(c, 9), 1);
});

test('pickNext 排除历史与当前', () => {
  const seq = [0.9, 0.1];
  let k = 0;
  const rng = () => seq[k++ % seq.length];
  const got = pickNext([1, 2, 3], [2], rng);
  assert.ok(got !== 2);
  assert.equal(pickNext([], [1]), -1);
});

test('prefetchQueue 无重复且不含当前台', () => {
  const q = prefetchQueue([1, 2, 3, 4, 5], 2, 3, mulberry(7));
  assert.equal(q.length, 3);
  assert.ok(!q.includes(2));
  assert.equal(new Set(q).size, 3);
});

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
