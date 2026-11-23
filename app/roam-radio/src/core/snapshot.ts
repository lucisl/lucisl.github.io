// 快照格式核心：列式索引数组布局（同 roamdial api/globe 的思路）。
// 纯逻辑模块：无 RN 依赖、无 fs，可被 scripts/build-snapshot.mjs（Node type-stripping）与 APP 共用。

export const SNAPSHOT_VERSION = 1;

export interface RawStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  codec: string;
  bitrate: number;
  hls: number;
  ssl_error: number;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  tags: string;
  votes: number;
  clickcount: number;
  clicktrend: number;
  geo_lat?: number | null;
  geo_long?: number | null;
}

export interface CountryInfo {
  code: string; // ISO2 大写，如 "FR"
  name: string; // 英文名
  lat: number;
  lng: number;
  tz: string; // IANA 时区，未知为 ""
}

export interface ResolvedCoords {
  lat: number;
  lng: number;
  prec: 0 | 1 | 2; // 0=国家锚点 1=行政区 2=电台自带坐标
  tz: string;
  city: string; // 展示用城市/地区名，可为 ""
}

export interface Snapshot {
  v: number;
  builtAt: string; // ISO
  n: number;
  genres: string[]; // 小写规范流派词典
  langs: string[]; // 语言词典（小写）
  countries: CountryInfo[];
  tzs: string[]; // 时区词典
  ids: string[]; // stationuuid 前 12 位（分享/收藏短 id）
  names: string[];
  urls: string[]; // 首选播放地址（url_resolved）
  urls2: string[]; // 备用线路（原始 url），同值时 ""
  lat: number[]; // 度 ×100 取整
  lng: number[];
  prec: number[];
  city: string[]; // 展示地名（行政区名，空则用国家名）
  tz: number[]; // tzs 索引
  g: number[][]; // genres 索引
  l: number[]; // langs 索引，-1 未知
  c: number[]; // countries 索引
  pop: number[]; // 0..10 分桶
  br: number[]; // kbps，0 未知
  fl: number[]; // bit0=https bit1=hls bit2=MP3
}

const MAX_GENRES = 400;
const MAX_LANGS = 300;
const MAX_STATIONS = 60000;
const MAX_NAME = 90;

export function normalizeGenreTag(raw: string): string {
  let t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'top 40' || t === 'hits' || t === 'hit' || t === 'chart') t = 'pop';
  else if (t === 'news/talk' || t === 'talk') t = 'news & talk';
  else if (t === 'rock & roll') t = 'rock';
  else if (t === 'hip hop' || t === 'rap') t = 'hip-hop';
  else if (t === 'classics') t = 'classical';
  return t;
}

export function topGenresOf(tags: string): string[] {
  const out: string[] = [];
  for (const raw of (tags || '').split(',')) {
    const t = normalizeGenreTag(raw);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 4) break;
  }
  return out;
}

export function primaryLangOf(language: string): string {
  for (const raw of (language || '').split(',')) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (t === 'eng') return 'english';
    if (t === 'fra' || t === 'fre') return 'french';
    if (t === 'deu' || t === 'ger') return 'german';
    if (t === 'spa') return 'spanish';
    if (t === 'por') return 'portuguese';
    if (t === 'ita') return 'italian';
    if (t === 'nld' || t === 'dut') return 'dutch';
    if (t === 'rus') return 'russian';
    if (t === 'chi' || t === 'zho' || t === 'chinese') return 'chinese';
    if (t === 'jpn' || t === 'japanese') return 'japanese';
    if (t === 'kor' || t === 'korean') return 'korean';
    if (t === 'ara') return 'arabic';
    if (t === 'hin') return 'hindi';
    return t;
  }
  return '';
}

/** 热门度分桶：clicktrend（近期点击）为主，clickcount/votes 对数兜底。 */
export function popBucketOf(row: RawStation): number {
  const score = Math.max(
    row.clicktrend || 0,
    Math.log10(1 + (row.clickcount || 0)) * 50,
    Math.log10(1 + (row.votes || 0)) * 40,
  );
  if (score <= 0) return 0;
  return Math.min(10, Math.max(1, Math.round(Math.log10(1 + score) * 4)));
}

export function flagsOf(row: RawStation): number {
  let f = 0;
  if ((row.url_resolved || row.url || '').startsWith('https://')) f |= 1;
  if (row.hls) f |= 2;
  if ((row.codec || '').toUpperCase() === 'MP3') f |= 4;
  return f;
}

/** 行级去重键：名称归一 + 地址归一。 */
export function dedupeKeyOf(row: RawStation): string {
  const name = (row.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const url = (row.url_resolved || row.url || '').trim().toLowerCase();
  return name + ' ' + url;
}

/**
 * 列式编码。rows 建议已按热度降序（超出 MAX_STATIONS 截断）。
 * resolve(row) 返回坐标；返回 null 的行会被跳过。
 */
export function buildSnapshot(
  rows: RawStation[],
  resolve: (row: RawStation) => ResolvedCoords | null,
  builtAt: string = new Date().toISOString(),
): Snapshot {
  const s: Snapshot = {
    v: SNAPSHOT_VERSION, builtAt, n: 0,
    genres: [], langs: [], countries: [], tzs: [],
    ids: [], names: [], urls: [], urls2: [],
    lat: [], lng: [], prec: [], city: [], tz: [],
    g: [], l: [], c: [], pop: [], br: [], fl: [],
  };
  const genreIdx = new Map<string, number>();
  const langIdx = new Map<string, number>();
  const countryByCode = new Map<string, number>();
  const tzIdx = new Map<string, number>();
  const seen = new Set<string>();

  const tzOf = (tz: string): number => {
    let i = tzIdx.get(tz);
    if (i === undefined) {
      i = s.tzs.length;
      s.tzs.push(tz);
      tzIdx.set(tz, i);
    }
    return i;
  };

  for (const row of rows) {
    if (s.n >= MAX_STATIONS) break;
    const name = (row.name || '').trim().slice(0, MAX_NAME);
    const url = (row.url_resolved || row.url || '').trim();
    if (!name || !url || !/^https?:\/\//.test(url)) continue;
    const key = dedupeKeyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);

    const coords = resolve(row);
    if (!coords) continue;

    let ci = countryByCode.get((row.countrycode || '').toUpperCase());
    if (ci === undefined) {
      ci = s.countries.length;
      s.countries.push({
        code: (row.countrycode || '').toUpperCase() || '--',
        name: (row.country || '').trim() || (row.countrycode || '').toUpperCase() || '未知',
        lat: 0, lng: 0, tz: '',
      });
      countryByCode.set((row.countrycode || '').toUpperCase() || '--', ci);
    }

    const gs: number[] = [];
    for (const t of topGenresOf(row.tags)) {
      let gi = genreIdx.get(t);
      if (gi === undefined && s.genres.length < MAX_GENRES) {
        gi = s.genres.length;
        s.genres.push(t);
        genreIdx.set(t, gi);
      }
      if (gi !== undefined) gs.push(gi);
    }

    let li = -1;
    const lang = primaryLangOf(row.language);
    if (lang) {
      const found = langIdx.get(lang);
      if (found !== undefined) {
        li = found;
      } else if (s.langs.length < MAX_LANGS) {
        li = s.langs.length;
        s.langs.push(lang);
        langIdx.set(lang, li);
      }
    }

    const alt = url !== (row.url || '').trim() ? (row.url || '').trim() : '';
    const c = s.countries[ci];
    if (coords.prec === 0 && (c.lat === 0 && c.lng === 0) && coords.lat !== 0) {
      c.lat = coords.lat;
      c.lng = coords.lng;
      if (!c.tz) c.tz = coords.tz;
    }

    s.n += 1;
    s.ids.push((row.stationuuid || '').replace(/-/g, '').slice(0, 12));
    s.names.push(name);
    s.urls.push(url);
    s.urls2.push(alt === url ? '' : alt);
    s.lat.push(Math.round(coords.lat * 100));
    s.lng.push(Math.round(coords.lng * 100));
    s.prec.push(coords.prec);
    s.city.push((coords.city || '').slice(0, 40));
    s.tz.push(tzOf(coords.tz || ''));
    s.g.push(gs);
    s.l.push(li);
    s.c.push(ci);
    s.pop.push(popBucketOf(row));
    s.br.push(Math.max(0, Math.round(row.bitrate || 0)));
    s.fl.push(flagsOf(row));
  }
  return s;
}

export function encodeSnapshot(s: Snapshot): string {
  return JSON.stringify(s);
}

/** 宽松解码（JSON 文本 → Snapshot），字段缺失时补空数组，防刷新数据损坏拖垮启动。 */
export function decodeSnapshot(text: string): Snapshot {
  const j = JSON.parse(text);
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    v: j.v ?? 0, builtAt: j.builtAt ?? '', n: j.n ?? 0,
    genres: arr(j.genres), langs: arr(j.langs), countries: arr(j.countries), tzs: arr(j.tzs),
    ids: arr(j.ids), names: arr(j.names), urls: arr(j.urls), urls2: arr(j.urls2),
    lat: arr(j.lat), lng: arr(j.lng), prec: arr(j.prec), city: arr(j.city), tz: arr(j.tz),
    g: arr(j.g), l: arr(j.l), c: arr(j.c), pop: arr(j.pop), br: arr(j.br), fl: arr(j.fl),
  };
}

/** 单行只读视图（索引 → 值），供 UI/播放层使用。 */
export interface StationRow {
  i: number;
  id: string;
  name: string;
  url: string;
  urlAlt: string;
  lat: number;
  lng: number;
  prec: number;
  city: string;
  country: CountryInfo;
  genres: string[];
  lang: string;
  pop: number;
  bitrate: number;
  https: boolean;
  hls: boolean;
  mp3: boolean;
  tz: string;
}

export function rowOf(s: Snapshot, i: number): StationRow | null {
  if (i < 0 || i >= s.n) return null;
  const country = s.countries[s.c[i]] ?? { code: '--', name: '', lat: 0, lng: 0, tz: '' };
  const genres: string[] = [];
  for (const gi of s.g[i] ?? []) if (gi < s.genres.length) genres.push(s.genres[gi]);
  const li = s.l[i];
  return {
    i,
    id: s.ids[i] ?? '',
    name: s.names[i] ?? '',
    url: s.urls[i] ?? '',
    urlAlt: s.urls2[i] ?? '',
    lat: (s.lat[i] ?? 0) / 100,
    lng: (s.lng[i] ?? 0) / 100,
    prec: s.prec[i] ?? 0,
    city: s.city[i] ?? '',
    country,
    genres,
    lang: li >= 0 ? s.langs[li] ?? '' : '',
    pop: s.pop[i] ?? 0,
    bitrate: s.br[i] ?? 0,
    https: (s.fl[i] & 1) === 1,
    hls: (s.fl[i] & 2) === 2,
    mp3: (s.fl[i] & 4) === 4,
    tz: s.tzs[s.tz[i]] ?? country.tz ?? '',
  };
}

/** ISO2 → 区域指示符 emoji 旗帜。 */
export function flagEmoji(code: string): string {
  const cc = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || cc === '--') return '🏳️';
  let out = '';
  for (const ch of cc) out += String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65);
  return out;
}
