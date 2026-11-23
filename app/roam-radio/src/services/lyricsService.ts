// 歌词服务：LRCLIB（免 key）。
import { lrclibSearchUrl, pickBestRecord, recordToResult, splitTitleArtist, type LrclibRecord, type LyricResult } from '../core/lyrics.ts';

export async function fetchLyrics(nowPlayingTitle: string): Promise<LyricResult | null> {
  const { artist, track } = splitTitleArtist(nowPlayingTitle);
  if (!track) return null;
  const url = lrclibSearchUrl(track, artist);
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RoamRadio/1.0' } });
  if (!res.ok) return null;
  const records = (await res.json()) as LrclibRecord[];
  const best = pickBestRecord(Array.isArray(records) ? records : [], track, artist);
  return best ? recordToResult(best) : null;
}
