// ICY 元数据解析单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IcyMetadataReader, tryParseIcyInfo } from '../src/core/icy.ts';

function icyInfoBlock(text: string): number[] {
  const bytes = [...text].map(c => c.charCodeAt(0));
  const units = Math.ceil((bytes.length + 1) / 16); // 16 字节块数
  const block = new Array(1 + units * 16).fill(0);
  block[0] = units;
  for (let i = 0; i < bytes.length; i++) block[1 + i] = bytes[i];
  return block;
}

test('tryParseIcyInfo 提取 StreamTitle', () => {
  const block = icyInfoBlock("StreamTitle='Daft Punk - Get Lucky';StreamUrl='';");
  const parsed = tryParseIcyInfo(Uint8Array.from(block));
  assert.ok(parsed);
  assert.equal(parsed.title, 'Daft Punk - Get Lucky');
  assert.equal(parsed.bytes, block.length);
});

test('tryParseIcyInfo 空信息段/不完整', () => {
  assert.deepEqual(tryParseIcyInfo(Uint8Array.from([0])), { title: null, bytes: 1 });
  const block = Uint8Array.from(icyInfoBlock("StreamTitle='X'"));
  assert.equal(tryParseIcyInfo(block.subarray(0, block.length - 1)), null);
  assert.equal(tryParseIcyInfo(Uint8Array.from([5, 65])), null);
});

/** 合成流：每 metaint 字节音频后跟对应标题的信息段。返回逐段数组方便测试。 */
function synthSegments(titles: string[], metaint = 40): Uint8Array[] {
  const segs: Uint8Array[] = [];
  const audio = (n: number) => Uint8Array.from(Array.from({ length: n }, (_, k) => k % 256));
  for (const t of titles) {
    segs.push(audio(metaint));
    segs.push(Uint8Array.from(icyInfoBlock(`StreamTitle='${t}';`)));
  }
  segs.push(audio(metaint));
  return segs;
}

const concat = (segs: Uint8Array[]) => {
  const total = segs.reduce((a, s) => a + s.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const s of segs) {
    out.set(s, o);
    o += s.length;
  }
  return out;
};

test('IcyMetadataReader 按段喂入得到各标题', () => {
  const segs = synthSegments(['A - One', 'B - Two']);
  const r = new IcyMetadataReader(40);
  assert.equal(r.push(concat(segs.slice(0, 2))), 'A - One');
  assert.equal(r.push(concat(segs.slice(2, 4))), 'B - Two');
  assert.equal(r.push(segs[4]), null);
  assert.equal(r.current, 'B - Two');
});

test('IcyMetadataReader 整块喂入第一帧即出标题', () => {
  const r = new IcyMetadataReader(40);
  const full = concat(synthSegments(['X - One', 'Y - Two', 'Z - Three']));
  assert.equal(r.push(full), 'X - One');
  // push 在首个新标题处返回，剩余字节应能无缝续喂
  const rest = full.subarray(40 + icyInfoBlock("StreamTitle='X - One';").length);
  assert.equal(r.push(rest), 'Y - Two');
  assert.equal(r.push(rest.subarray(40 + icyInfoBlock("StreamTitle='Y - Two';").length)), 'Z - Three');
});

test('IcyMetadataReader 1 字节碎片喂入结果一致（跨块状态机）', () => {
  const r = new IcyMetadataReader(40);
  const full = concat(synthSegments(['X - One', 'Y - Two', 'Z - Three']));
  const found: string[] = [];
  for (let i = 0; i < full.length; i++) {
    const t = r.push(full.subarray(i, i + 1));
    if (t) found.push(t);
  }
  assert.deepEqual(found, ['X - One', 'Y - Two', 'Z - Three']);
  assert.equal(r.current, 'Z - Three');
});

test('重复标题去重（第二次出现返回 null）', () => {
  const r = new IcyMetadataReader(32);
  const segs = synthSegments(['same - one', 'same - one'], 32);
  assert.equal(r.push(concat(segs.slice(0, 2))), 'same - one');
  assert.equal(r.push(concat(segs.slice(2, 4))), null);
  assert.equal(r.current, 'same - one');
});

test('无 metaint 时静默', () => {
  const r = new IcyMetadataReader(0);
  assert.equal(r.push(Uint8Array.from([1, 2, 3])), null);
});
