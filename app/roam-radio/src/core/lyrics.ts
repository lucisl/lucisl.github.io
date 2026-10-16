// 歌词核心：LRCLIB 查询 URL 构造、LRC 文本解析、同步行定位。全部纯逻辑。

export interface SyncedLine {
  /** 起始时间（毫秒）。 */
  t: number;
  text: string;
}

export interface LyricResult {
  synced: SyncedLine[];
  plain: string; // 纯文本歌词（无时间轴时用）
  /** 来源：lrclib / 空 */
  source: string;
}

export function lrclibSearchUrl(track: string, artist: string, durationSec = 0): string {
  const u = new URL('https://lrclib.net/api/search');
  if (track) u.searchParams.set('track_name', track);
  if (artist) u.searchParams.set('artist_name', artist);
  if (durationSec > 0) u.searchParams.set('duration', String(Math.round(durationSec)));
  return u.toString();
}

export function lrclibGetUrl(id: number): string {
  return `https://lrclib.net/api/get/${id}`;
}

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

/** 解析 LRC 时间轴行：[mm:ss.xx] / [mm:ss.xxx]，一行可多时间戳。 */
export function parseLrc(text: string): SyncedLine[] {
  const out: SyncedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!body) continue;
    for (const st of stamps) {
      const min = Number(st[1]);
      const sec = Number(st[2]);
      const fracStr = st[3] ?? '0';
      const frac = Number(('0.' + fracStr));
      const t = Math.round((min * 60 + sec + frac) * 1000);
      out.push({ t, text: body });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** 取 timeMs 时应显示的行索引（-1 = 还没开始）。 */
export function activeLineAt(lines: SyncedLine[], timeMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 从 LRCLIB search 结果里挑最合适的一条。 */
export function pickBestRecord(records: LrclibRecord[], track: string, artist: string): LrclibRecord | null {
  if (!records.length) return null;
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]|feat\.?.*$/g, '').trim();
  const wantT = norm(track);
  const wantA = norm(artist);
  let best: LrclibRecord | null = null;
  let bestScore = -1;
  for (const r of records) {
    let score = 0;
    if (norm(r.trackName) === wantT) score += 2;
    if (norm(r.artistName) === wantA) score += 2;
    if (r.syncedLyrics) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export function recordToResult(r: LrclibRecord): LyricResult {
  return {
    synced: r.syncedLyrics ? parseLrc(r.syncedLyrics) : [],
    plain: r.plainLyrics ?? '',
    source: 'lrclib',
  };
}

/** StreamTitle "Artist - Track" 拆分（电台元数据常见格式）。 */
export function splitTitleArtist(title: string): { artist: string; track: string } {
  const dash = title.indexOf(' - ');
  if (dash > 0) return { artist: title.slice(0, dash).trim(), track: title.slice(dash + 3).trim() };
  return { artist: '', track: title.trim() };
}
