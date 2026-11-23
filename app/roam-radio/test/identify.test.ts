// 识曲参数构造单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acrCloudParams,
  acrCloudResult,
  audDParams,
  clipSample,
} from '../src/core/identify.ts';

test('audDParams 固定端点与字段', () => {
  const p = audDParams('tok123', 'YWJj');
  assert.equal(p.endpoint, 'https://api.audd.io/');
  assert.deepEqual(p.fields, { api_token: 'tok123' });
  assert.deepEqual(p.sample, { field: 'file', base64: 'YWJj', filename: 'sample.mp3', contentType: 'audio/mpeg' });
});

test('acrCloudParams 签名 = sign(secret, sample+host+key+version+ts)', async () => {
  const cfg = { host: 'identify-eu-west-1.acrcloud.com', accessKey: 'AK', accessSecret: 'SK' };
  const p = await acrCloudParams(cfg, 'Q0FMTCM=', {
    sampleBytes: 5,
    timestampUs: 111,
    sign: async (secret, data) => {
      assert.equal(secret, 'SK');
      assert.equal(data, 'Q0FMTCM=' + cfg.host + 'AK' + '1.0' + '111');
      return 'SIG==' ;
    },
  });
  assert.equal(p.endpoint, 'https://identify-eu-west-1.acrcloud.com/v1/identify');
  assert.equal(p.fields.signature, 'SIG==');
  assert.equal(p.fields.sample_bytes, '5');
  assert.equal(p.fields.timestamp, '111');
});

test('解析 ACR 结果', () => {
  assert.deepEqual(
    acrCloudResult({ status: { code: 0 }, metadata: { music: [{ title: 'Song', artists: [{ name: 'Artist' }] }] } }),
    { song: 'Song', artist: 'Artist' },
  );
  assert.equal(acrCloudResult({ status: { code: 2004 } }), null);
});

test('clipSample 截头尾', () => {
  const big = new Uint8Array(500_000).fill(7);
  const clipped = clipSample(big, 100);
  assert.equal(clipped.length, 100);
  assert.equal(clipSample(new Uint8Array(10), 100).length, 10);
});
