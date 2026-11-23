// 歌词核心单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLineAt,
  lrclibGetUrl,
  lrclibSearchUrl,
  parseLrc,
  pickBestRecord,
  recordToResult,
  splitTitleArtist,
  type LrclibRecord,
} from '../src/core/lyrics.ts';

test('parseLrc 多时间戳/毫秒位/去正文括号', () => {
  const lines = parseLrc('[00:01.00]第一行\n[00:02.50][00:30.00]副歌\n歌词没有时间的跳过\n[01:00.250]尾行');
  assert.deepEqual(lines, [
    { t: 1000, text: '第一行' },
    { t: 2500, text: '副歌' },
    { t: 30000, text: '副歌' },
    { t: 60250, text: '尾行' },
  ]);
});

test('activeLineAt 二分定位', () => {
  const lines = parseLrc('[00:01.00]a\n[00:05.00]b\n[00:09.00]c');
  assert.equal(activeLineAt(lines, 0), -1);
  assert.equal(activeLineAt(lines, 1000), 0);
  assert.equal(activeLineAt(lines, 4999), 0);
  assert.equal(activeLineAt(lines, 8999), 1);
  assert.equal(activeLineAt(lines, 999999), 2);
});

test('lrclib URL 构造', () => {
  assert.equal(lrclibSearchUrl('Get Lucky', 'Daft Punk', 248),
    'https://lrclib.net/api/search?track_name=Get+Lucky&artist_name=Daft+Punk&duration=248');
  assert.equal(lrclibGetUrl(123), 'https://lrclib.net/api/get/123');
});

function rec(over: Partial<LrclibRecord>): LrclibRecord {
  return { id: 1, trackName: 'T', artistName: 'A', duration: 200, syncedLyrics: null, plainLyrics: null, ...over };
}

test('pickBestRecord 精确名 + synced 优先', () => {
  const records = [
    rec({ id: 1, trackName: 'Other', syncedLyrics: '[00:01.0]x' }),
    rec({ id: 2, trackName: 'Get Lucky (Remix)', artistName: 'Daft Punk', plainLyrics: 'plain' }),
    rec({ id: 3, trackName: 'get lucky', artistName: 'daft punk', syncedLyrics: '[00:01.00]oh' }),
  ];
  const best = pickBestRecord(records, 'Get Lucky', 'Daft Punk');
  assert.equal(best?.id, 3);
  assert.equal(pickBestRecord([], 'x', 'y'), null);
});

test('recordToResult 同步/纯文本', () => {
  const r = recordToResult(rec({ syncedLyrics: '[00:02.00]hello', plainLyrics: 'hello world' }));
  assert.equal(r.synced.length, 1);
  assert.equal(r.plain, 'hello world');
  assert.equal(r.source, 'lrclib');
});

test('splitTitleArtist', () => {
  assert.deepEqual(splitTitleArtist('Abba - Dancing Queen'), { artist: 'Abba', track: 'Dancing Queen' });
  assert.deepEqual(splitTitleArtist('Just A Title'), { artist: '', track: 'Just A Title' });
});
