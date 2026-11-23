#!/usr/bin/env node
// 从 Radio Browser + GeoNames 生成随包电台快照 assets/snapshot.json.gz。
// 用法：node scripts/build-snapshot.mjs [--cache /tmp/rb-stations.json] [--out assets/snapshot.json.gz]
// 首次跑会拉 ~50k 台（几十 MB），之后可用 --cache 复用原始 JSON 调试。

import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { buildSnapshot, encodeSnapshot } from '../src/core/snapshot.ts';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

const API_BASE = process.env.RB_API ?? 'https://de1.api.radio-browser.info';
const UA = 'RoamRadioSnapshot/1.0 (personal app; contact: github.com/lucisl)';

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const cachePath = argVal('--cache', join(here, '.stations-cache.json'));
const outPath = argVal('--out', join(projectRoot, 'assets', 'snapshot.json.gz'));

async function fetchStations() {
  if (args.includes('--from-cache') && existsSync(cachePath)) {
    console.log('using cached', cachePath);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }
  const url = `${API_BASE}/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=60000`;
  console.log('fetching', url);
  const t0 = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`got ${(text.length / 1e6).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, text);
  return JSON.parse(text);
}

// ---------- GeoNames ----------

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normName = (s) =>
  stripAccents(String(s || '').toLowerCase())
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(state|province|region|prefecture|governorate|department|oblast|krai|county|prov|dept)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const GEONAMES_FILES = [
  ['admin1CodesASCII.txt', 'https://download.geonames.org/export/dump/admin1CodesASCII.txt'],
  ['countryInfo.txt', 'https://download.geonames.org/export/dump/countryInfo.txt'],
  ['cities15000.txt', 'https://download.geonames.org/export/dump/cities15000.txt', 'https://download.geonames.org/export/dump/cities15000.zip'],
];

function ensureGazetteer() {
  const g = join(here, 'gazetteer');
  mkdirSync(g, { recursive: true });
  const { execSync } = require('node:child_process');
  for (const [name, url, zipUrl] of GEONAMES_FILES) {
    const p = join(g, name);
    if (existsSync(p)) continue;
    console.log('downloading', name);
    if (zipUrl) {
      execSync(`curl -sSf --retry 2 -o "${p}.zip" "${zipUrl}" && unzip -o -q "${p}.zip" -d "${g}" && rm "${p}.zip"`);
    } else {
      execSync(`curl -sSf --retry 2 -o "${p}" "${url}"`);
    }
  }
}

function loadGazetteer() {
  ensureGazetteer();
  const g = join(here, 'gazetteer');
  // admin1 名称
  const adminNames = new Map(); // "US.NY" -> name
  for (const line of readFileSync(join(g, 'admin1CodesASCII.txt'), 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length >= 2) adminNames.set(f[0], f[1]);
  }
  // cities15000（2026 版 19 列）: 0 id,1 name,2 ascii,3 alt,4 lat,5 lng,6 fclass,7 fcode,
  // 8 cc,9 cc2,10 admin1,11 a2,12 a3,13 a4,14 population,15 elevation,16 dem,17 timezone,18 moddate
  const regionAgg = new Map(); // "FR|11" -> {lat,lng,pop,best:{name,pop,tz}}
  const capitalByGnid = new Map(); // geonameid -> {lat,lng,tz}
  const cities = new Map(); // "FR|norm-name" -> {lat,lng,tz,pop}（同名取人口最大）
  const countryAgg = new Map(); // cc -> {lat,lng,pop,tzCount:Map}
  for (const line of readFileSync(join(g, 'cities15000.txt'), 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 19) continue;
    const lat = Number(f[4]);
    const lng = Number(f[5]);
    const cc = f[8];
    const a1 = f[10];
    const pop = Number(f[14] || 0);
    const tz = f[17] || '';
    if (!cc || Number.isNaN(lat)) continue;
    const putCity = (key, val) => {
      const old = cities.get(key);
      if (!old || val.pop > old.pop) cities.set(key, val);
    };
    const cv = { lat, lng, tz, pop, name: f[1] };
    putCity(`${cc}|${normName(f[1])}`, cv);
    putCity(`${cc}|${normName(f[2])}`, cv);
    if (f[6] === 'P' && f[7] === 'PPLC') {
      capitalByGnid.set(f[0], { lat, lng, tz });
      putCity(`${cc}|${normName(f[1])}`, cv);
    }
    if (a1) {
      const key = cc + '|' + a1;
      let r = regionAgg.get(key);
      if (!r) regionAgg.set(key, (r = { lat: 0, lng: 0, pop: 0, best: { name: f[1], pop: -1, tz } }));
      r.lat += lat * pop;
      r.lng += lng * pop;
      r.pop += pop;
      if (pop > r.best.pop) r.best = { name: f[1], pop, tz };
    }
    let c = countryAgg.get(cc);
    if (!c) countryAgg.set(cc, (c = { lat: 0, lng: 0, pop: 0, tzCount: new Map() }));
    c.lat += lat * pop;
    c.lng += lng * pop;
    c.pop += pop;
    c.tzCount.set(tz, (c.tzCount.get(tz) ?? 0) + pop);
  }
  // countryInfo（列：0 ISO,4 Country,5 Capital,16 geonameid）
  const countryMeta = new Map(); // cc -> {name, capitalGnid, capitalName}
  for (const line of readFileSync(join(g, 'countryInfo.txt'), 'utf8').split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const f = line.split('\t');
    if (f.length < 17) continue;
    countryMeta.set(f[0], { name: f[4], capitalGnid: f[16], capitalName: f[5] });
  }
  // 组装区域查询表
  const regions = new Map(); // "FR|norm-name" -> {lat,lng,tz,bestName}
  for (const [key, r] of regionAgg) {
    const [cc, code] = key.split('|');
    const name = adminNames.get(`${cc}.${code}`) ?? adminNames.get(code) ?? '';
    if (!name || r.pop <= 0) continue;
    const val = { lat: r.lat / r.pop, lng: r.lng / r.pop, tz: r.best.tz, bestName: name };
    const nk = cc + '|' + normName(name);
    if (!regions.has(nk)) regions.set(nk, val);
  }
  // 国家质心优先（人口加权平均，星图更分散自然），首都坐标兜底
  const countryCentroid = new Map(); // cc -> {lat,lng,tz}
  for (const [cc, meta] of countryMeta) {
    const agg = countryAgg.get(cc);
    if (agg && agg.pop > 0) {
      const tz = [...agg.tzCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      countryCentroid.set(cc, { lat: agg.lat / agg.pop, lng: agg.lng / agg.pop, tz });
    } else {
      const anchor = capitalByGnid.get(meta.capitalGnid);
      if (anchor) countryCentroid.set(cc, anchor);
    }
  }
  return { regions, countryCentroid, cities };
}

const gaz = loadGazetteer();

/** "New York NY" / "Los Angeles CA" / "Prov. of Madrid" → 候选匹配串（全长、去尾缩写、前缀） */
function stateCandidates(state) {
  const out = [state];
  const noSuffix = state.replace(/\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\b/g, '').replace(/\s+/g, ' ').trim();
  if (noSuffix && noSuffix !== state) out.push(noSuffix);
  const tokens = state.split(' ');
  for (let n = 1; n < tokens.length; n++) out.push(tokens.slice(0, n).join(' '));
  const noPunct = state.replace(/\b(prov\.?|province|state|dept\.?|department|region|prefecture|county)\b/gi, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noPunct && noPunct !== state) {
    out.push(noPunct);
    const t2 = noPunct.split(' ');
    for (let n = 1; n < t2.length; n++) out.push(t2.slice(0, n).join(' '));
  }
  return [...new Set(out.filter(Boolean))];
}

function resolveStation(row) {
  const cc = String(row.countrycode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const rawState = String(row.state || '').trim();
  if (rawState && rawState.toLowerCase() !== cc.toLowerCase()) {
    const cands = stateCandidates(rawState);
    for (const c of cands) {
      const nk = normName(c);
      if (!nk || nk === cc.toLowerCase()) continue;
      const city = gaz.cities.get(cc + '|' + nk);
      if (city) return { lat: city.lat, lng: city.lng, prec: 2, tz: city.tz, city: city.name };
      const r = gaz.regions.get(cc + '|' + nk);
      if (r) return { lat: r.lat, lng: r.lng, prec: 1, tz: r.tz, city: r.bestName };
    }
  }
  const c = gaz.countryCentroid.get(cc);
  if (c) return { lat: c.lat, lng: c.lng, prec: 0, tz: c.tz, city: '' };
  return null;
}

// ---------- main ----------

const rows = await fetchStations();
console.log('raw rows:', rows.length);

// 排序：clicktrend 优先（近期热度），clickcount 兜底 —— 保证截断 6 万时保留最有活力的台
rows.sort((a, b) => (b.clicktrend || 0) - (a.clicktrend || 0) || (b.clickcount || 0) - (a.clickcount || 0));

let resolved = 0;
let geo = 0;
const snapshot = buildSnapshot(rows, (row) => {
  const r = resolveStation(row);
  if (r) {
    resolved++;
    if (r.prec === 1) geo++;
  }
  return r;
});

const json = encodeSnapshot(snapshot);
const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, gz);

// APP 侧以「base64 常量模块」内联随包快照（避开 asset 二进制读取路径）
const genPath = join(projectRoot, 'src', 'core', 'bundledSnapshot.generated.ts');
writeFileSync(
  genPath,
  '// 由 scripts/build-snapshot.mjs 生成，勿手改。随包电台目录（gzip→base64）。\n' +
    `export const BUNDLED_SNAPSHOT_GZ_B64 =\n  '${gz.toString('base64')}';\n`,
);
console.log('wrote         :', genPath);

const pct = (n) => ((n / (snapshot.n || 1)) * 100).toFixed(1) + '%';
console.log('stations kept :', snapshot.n);
console.log('admin1-level  :', pct(geo), '(region centroid)');
console.log('country anchor:', pct(resolved - geo));
console.log('countries     :', snapshot.countries.length);
console.log('genres        :', snapshot.genres.length);
console.log('langs         :', snapshot.langs.length);
console.log('json MB       :', (json.length / 1e6).toFixed(2));
console.log('gz KB         :', (gz.length / 1024).toFixed(1));
console.log('wrote         :', outPath);
