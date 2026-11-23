// 应用内「刷新目录」：不带 GeoNames 文件，坐标解析器从已有快照学习。
// 刷新时全量重建：同 uuid 的台被新数据替换；解析不到国家的台跳过（宁可少不可错）。
import type { RawStation, ResolvedCoords, Snapshot } from './snapshot.ts';

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(state|province|region|prefecture|governorate|department|oblast|krai|county|prov|dept)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** 从快照构建 (country|city)→坐标 与 country→质心 两级查表。 */
export function buildResolverFromSnapshot(s: Snapshot): (row: RawStation) => ResolvedCoords | null {
  const cityMap = new Map<string, { lat: number; lng: number; tz: string; n: number }>();
  const countryAgg = new Map<number, { lat: number; lng: number; tz: string; n: number }>();
  for (let i = 0; i < s.n; i++) {
    const cc = s.countries[s.c[i]]?.code ?? '';
    const city = norm(s.city[i] ?? '');
    const rec = { lat: s.lat[i] / 100, lng: s.lng[i] / 100, tz: s.tzs[s.tz[i]] ?? '' };
    const a = countryAgg.get(s.c[i]);
    if (!a) countryAgg.set(s.c[i], { ...rec, n: 1 });
    else {
      a.lat = (a.lat * a.n + rec.lat) / (a.n + 1);
      a.lng = (a.lng * a.n + rec.lng) / (a.n + 1);
      a.n += 1;
      if (!a.tz && rec.tz) a.tz = rec.tz;
    }
    if (city && (s.prec[i] ?? 0) >= 1) {
      const key = cc + '|' + city;
      const b = cityMap.get(key);
      if (!b) cityMap.set(key, { ...rec, n: 1 });
      else {
        b.lat = (b.lat * b.n + rec.lat) / (b.n + 1);
        b.lng = (b.lng * b.n + rec.lng) / (b.n + 1);
        b.n += 1;
        if (!b.tz && rec.tz) b.tz = rec.tz;
      }
    }
  }
  return (row: RawStation): ResolvedCoords | null => {
    const cc = (row.countrycode || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return null;
    const ci = s.countries.findIndex(c => c.code === cc);
    const state = norm(row.state || '');
    if (state) {
      const hit = cityMap.get(cc + '|' + state);
      if (hit) return { lat: hit.lat, lng: hit.lng, prec: 1, tz: hit.tz, city: row.state.trim() };
    }
    const agg = ci >= 0 ? countryAgg.get(ci) : undefined;
    if (agg) return { lat: agg.lat, lng: agg.lng, prec: 0, tz: agg.tz, city: state ? row.state.trim() : '' };
    const c = s.countries[ci];
    if (c && (c.lat !== 0 || c.lng !== 0)) return { lat: c.lat, lng: c.lng, prec: 0, tz: c.tz, city: row.state || '' };
    return null;
  };
}

/** 用已解析的电台行反向生成 RawStation 形状（供合并/导出调试）。 */
export function rebuildRowsFromSnapshot(s: Snapshot): RawStation[] {
  const out: RawStation[] = [];
  for (let i = 0; i < s.n; i++) {
    const codec = (s.fl[i] & 4) ? 'MP3' : 'AAC';
    out.push({
      stationuuid: s.ids[i],
      name: s.names[i],
      url: s.urls2[i] || s.urls[i],
      url_resolved: s.urls[i],
      codec,
      bitrate: s.br[i],
      hls: (s.fl[i] & 2) ? 1 : 0,
      ssl_error: 0,
      country: s.countries[s.c[i]]?.name ?? '',
      countrycode: s.countries[s.c[i]]?.code ?? '',
      state: s.city[i],
      language: s.l[i] >= 0 ? s.langs[s.l[i]] : '',
      tags: (s.g[i] ?? []).map(gi => s.genres[gi]).filter(Boolean).join(','),
      votes: 0,
      clickcount: s.pop[i] * 10,
      clicktrend: s.pop[i] * 10,
      geo_lat: s.lat[i] / 100,
      geo_long: s.lng[i] / 100,
    });
  }
  return out;
}
