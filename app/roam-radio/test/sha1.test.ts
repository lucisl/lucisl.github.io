// SHA-1/HMAC 单测：对照 node:crypto 真实实现
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { bytesToBase64, hmacSha1Base64, sha1Hex } from '../src/core/sha1.ts';

test('sha1Hex 对齐 node crypto', () => {
  for (const s of ['', 'abc', 'hello world', 'The quick brown fox jumps over the lazy dog', 'x'.repeat(1000), '中文签名测试']) {
    assert.equal(sha1Hex(s), createHash('sha1').update(s, 'utf8').digest('hex'), s.slice(0, 20));
  }
});

test('hmacSha1Base64 对齐 node crypto', () => {
  const cases: [string, string][] = [
    ['key', 'The quick brown fox jumps over the lazy dog'],
    ['secret123', 'samplehostAK1.017123456789'],
    ['很长的密钥'.repeat(20), 'data'.repeat(500)],
    ['', 'empty key'],
  ];
  for (const [k, d] of cases) {
    assert.equal(hmacSha1Base64(k, d), createHmac('sha1', k).update(d, 'utf8').digest('base64'));
  }
});

test('bytesToBase64', () => {
  assert.equal(bytesToBase64(new Uint8Array([])), '');
  assert.equal(bytesToBase64(new Uint8Array([102, 111, 111])), 'Zm9v');
  assert.equal(bytesToBase64(new Uint8Array([102, 111, 111, 98])), 'Zm9vYg==');
  assert.equal(bytesToBase64(new Uint8Array([0xfb, 0xff, 0xfe])), '+//+');
});
