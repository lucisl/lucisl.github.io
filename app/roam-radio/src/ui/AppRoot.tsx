// 应用主体：快照加载 → 星图/列表双视图 + 顶部筛选条 + 播放条 + 各弹层编排。
import * as React from 'react';
import { Alert, AppState, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { engine } from '../audio/engine.ts';
import { startMetastream } from '../audio/metastream.ts';
import { applyFilters, emptyFilters, genreCounts, nearby, weightedRandomPick, type Filters } from '../core/browse.ts';
import { rowOf, type Snapshot, type StationRow } from '../core/snapshot.ts';
import { loadSnapshot, radioBrowserFetcher, refreshDirectory } from '../core/loader.ts';
import { HistoryRing, pickNext, prefetchQueue } from '../core/queue.ts';
import { addFavorite, listFavorites, removeFavorite, setSetting } from '../store/db.ts';
import { fetchLyrics } from '../services/lyricsService.ts';
import { identifyConfig, identifyStream, hasIdentifyKey } from '../services/identifyService.ts';
import { musicSearchUrls } from '../services/searchApps.ts';
import { buildCloud, StarfieldView } from './StarfieldView.ts';
import { PlayerBar, StationDetail, useEngineState } from './PlayerBar.ts';
import { AboutSheet, BitrateSheet, CountrySheet, LangSheet, LyricsSheet, SavedSheet, SearchSheet, SettingsSheet, StationRowItem } from './Sheets.tsx';
import { Chip } from './parts.ts';
import { C, FONT } from './theme.ts';

type Sheet =
  | null
  | { kind: 'search' }
  | { kind: 'bitrate' }
  | { kind: 'langs' }
  | { kind: 'countries' }
  | { kind: 'saved' }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'lyrics' }
  | { kind: 'detail' }
  | { kind: 'list' };

export function AppRoot() {
  const [snap, setSnap] = React.useState<Snapshot | null>(null);
  const [snapInfo, setSnapInfo] = React.useState<{ from: 'bundle' | 'cache' } | null>(null);
  const [filters, setFilters] = React.useState<Filters>(emptyFilters());
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [view, setView] = React.useState<'sky' | 'globe' | 'list'>('sky');
  const [favorites, setFavorites] = React.useState<Set<string>>(new Set());
  const [lookRow, setLookRow] = React.useState<StationRow | null>(null);
  const [dwellPct, setDwellPct] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [canIdentify, setCanIdentify] = React.useState(false);
  const [lyric, setLyric] = React.useState<{ synced: { t: number; text: string }[]; plain: string } | null>(null);
  const st = useEngineState();

  const history = React.useRef(new HistoryRing(60));
  const metaHandle = React.useRef<{ stop: () => void } | null>(null);
  const indicesRef = React.useRef<number[]>([]);
  const started = React.useRef(false);

  // ---------- 启动加载 ----------
  React.useEffect(() => {
    let dead = false;
    (async () => {
      const { snap: s, from } = await loadSnapshot();
      if (dead) return;
      setSnap(s);
      setSnapInfo({ from });
      const favs = await listFavorites().catch(() => []);
      setFavorites(new Set(favs.map((f) => f.id)));
      const cfg = await identifyConfig();
      setCanIdentify(hasIdentifyKey(cfg));
      // 恢复上次收听的台（若仍在目录里）
      try {
        const { getSetting } = await import('../store/db.ts');
        const lastId = await getSetting('last_station');
        if (lastId) {
          const idx = s.ids.indexOf(lastId);
          if (idx >= 0) {
            const r = rowOf(s, idx);
            if (r) history.current.push(r.i);
          }
        }
      } catch { /* noop */ }
    })().catch((e) => Alert.alert('启动失败', String(e)));
    return () => {
      dead = true;
    };
  }, []);

  // ---------- 筛选索引 ----------
  const indices = React.useMemo(() => {
    if (!snap) return [];
    return applyFilters(snap, filters);
  }, [snap, filters]);
  indicesRef.current = indices;

  const cloud = React.useMemo(() => {
    if (!snap) return null;
    return buildCloud(snap.lat, snap.lng, snap.pop, indices.slice(0, 8000));
  }, [snap, indices]);

  const cloudIndices = React.useMemo(() => indices.slice(0, 8000), [indices]);

  const gCounts = React.useMemo(() => {
    if (!snap) return [] as { name: string; count: number }[];
    const counts = genreCounts(snap, filters);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
  }, [snap, filters]);

  // ---------- 播放编排 ----------
  const playRow = React.useCallback((row: StationRow, opts?: { keepHistory?: boolean }) => {
    if (!snap) return;
    engine.play(row);
    if (!opts?.keepHistory) history.current.push(row.i);
    void setSetting('last_station', row.id);
    metaHandle.current?.stop();
    metaHandle.current = startMetastream(row.url, (t) => engine.setNowPlaying(t));
  }, [snap]);

  const startRandom = React.useCallback(() => {
    if (!snap || started.current) return;
    started.current = true;
    const pool = indicesRef.current.length ? indicesRef.current : Array.from({ length: Math.min(snap.n, 8000) }, (_, i) => i);
    const i = weightedRandomPick(snap, pool);
    const row = i >= 0 ? rowOf(snap, i) : null;
    if (row) {
      playRow(row);
      schedulePrefetch(row.i);
    }
  }, [snap, playRow]);

  const schedulePrefetch = (excludeCurrent: number) => {
    if (!snap) return;
    const pool = indicesRef.current;
    if (pool.length < 2) return;
    const q = prefetchQueue(pool, excludeCurrent, 1);
    const nextRow = q.length ? rowOf(snap, q[0]) : null;
    engine.prefetch(nextRow);
  };

  const nextStation = React.useCallback(() => {
    if (!snap) return;
    const pool = indicesRef.current.length ? indicesRef.current : Array.from({ length: snap.n }, (_, i) => i);
    const avoid = [history.current.current ?? -1, ...recentHistory()];
    const i = pickNext(pool, avoid);
    const row = i >= 0 ? rowOf(snap, i) : null;
    if (row) {
      playRow(row);
      schedulePrefetch(row.i);
    }
  }, [snap, playRow]);

  const recentHistory = (): number[] => {
    const out: number[] = [];
    const cur = history.current.current;
    if (cur != null) out.push(cur);
    return out;
  };

  const prevStation = React.useCallback(() => {
    if (!snap) return;
    const i = history.current.popBack();
    if (i != null) {
      const row = rowOf(snap, i);
      if (row) playRow(row, { keepHistory: true });
    } else {
      nextStation();
    }
  }, [snap, playRow, nextStation]);

  // 全部线路失败 → 自动换台
  React.useEffect(() => {
    engine.onExhausted = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      nextStation();
    };
    return () => {
      engine.onExhausted = null;
    };
  }, [nextStation]);

  // 后台暂停元数据轮询（省电省流），回前台恢复
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        metaHandle.current?.stop();
        metaHandle.current = null;
      } else if (st.station) {
        metaHandle.current?.stop();
        metaHandle.current = startMetastream(st.station.url, (t) => engine.setNowPlaying(t));
      }
    });
    return () => sub.remove();
  }, [st.station?.url]);

  // ---------- 准星停留选台 ----------
  const dwellTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lookAt = React.useCallback((k: number | null) => {
    if (!snap) return;
    if (k == null || k < 0 || k >= cloudIndices.length) {
      setLookRow(null);
      setDwellPct(0);
      if (dwellTimer.current) clearInterval(dwellTimer.current);
      return;
    }
    const row = rowOf(snap, cloudIndices[k]);
    setLookRow(row);
    setDwellPct(0);
    if (dwellTimer.current) clearInterval(dwellTimer.current);
    const t0 = Date.now();
    dwellTimer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 1200);
      setDwellPct(p);
      if (p >= 1 && row) {
        if (dwellTimer.current) clearInterval(dwellTimer.current);
        playRow(row);
        schedulePrefetch(row.i);
        Haptics.selectionAsync().catch(() => {});
      }
    }, 80);
  }, [snap, cloudIndices, playRow]);

  React.useEffect(() => () => {
    if (dwellTimer.current) clearInterval(dwellTimer.current);
  }, []);

  // ---------- 收藏 ----------
  const toggleSave = React.useCallback(async (row: StationRow) => {
    const favs = new Set(favorites);
    if (favs.has(row.id)) {
      favs.delete(row.id);
      await removeFavorite(row.id);
    } else {
      favs.add(row.id);
      await addFavorite(row);
    }
    setFavorites(favs);
  }, [favorites]);

  // ---------- 深链 ----------
  React.useEffect(() => {
    if (!snap) return;
    const handle = (url: string | null) => {
      if (!url) return;
      const m = /[?&]s=([0-9a-f]{8,12})|\/s\/([0-9a-f]{8,12})/.exec(url);
      const id = m?.[1] ?? m?.[2];
      if (!id) return;
      const i = snap.ids.indexOf(id);
      if (i >= 0) {
        const row = rowOf(snap, i);
        if (row) {
          started.current = true;
          playRow(row);
        }
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [snap, playRow]);

  // ---------- 附近电台 ----------
  const nearbyCursor = React.useRef<{ center: number; order: number[]; pos: number } | null>(null);
  const goNearby = React.useCallback((dir: 1 | -1) => {
    const anchor = st.station ?? lookRow;
    if (!snap || !anchor) return;
    if (!nearbyCursor.current || nearbyCursor.current.center !== anchor.i || nearbyCursor.current.order[0] !== anchor.i) {
      const list = nearby(snap, indicesRef.current.length ? indicesRef.current : Array.from({ length: snap.n }, (_, i) => i), anchor.lat, anchor.lng, 30)
        .map((x) => x.i);
      nearbyCursor.current = { center: anchor.i, order: list, pos: 0 };
    }
    const c = nearbyCursor.current;
    c.pos = Math.max(0, Math.min(c.order.length - 1, c.pos + dir));
    const r = rowOf(snap, c.order[c.pos]);
    if (r) {
      playRow(r);
      setSheet({ kind: 'detail' });
    }
  }, [snap, st.station, lookRow, playRow]);

  // ---------- 目录刷新 ----------
  const doRefresh = React.useCallback(async () => {
    if (!snap || refreshing) return;
    setRefreshing(true);
    try {
      const r = await refreshDirectory(snap, radioBrowserFetcher());
      setSnap(r.snap);
      setSnapInfo({ from: 'cache' });
      Alert.alert('目录已刷新', `${r.snap.n.toLocaleString()} 台 · 新增 ${r.added} · 下线 ${r.dropped}`);
    } catch (e) {
      Alert.alert('刷新失败', String(e instanceof Error ? e.message : e) + '\n（保留原目录，不影响使用）');
    } finally {
      setRefreshing(false);
    }
  }, [snap, refreshing]);

  // ---------- 歌词 / 识曲 ----------
  const openLyrics = React.useCallback(async () => {
    if (!st.nowPlaying) return;
    const res = await fetchLyrics(st.nowPlaying);
    setLyric(res ? { synced: res.synced, plain: res.plain } : null);
    setSheet({ kind: 'lyrics' });
  }, [st.nowPlaying]);

  const doIdentify = React.useCallback(async () => {
    const row = st.station ?? lookRow;
    if (!row) return;
    setSheet({ kind: 'detail' });
    Alert.alert('识别中…', '正在截取 12 秒音频指纹');
    try {
      const res = await identifyStream(row.url);
      engine.setNowPlaying(`${res.artist} - ${res.song}`);
    } catch (e) {
      Alert.alert('识别失败', String(e instanceof Error ? e.message : e));
    }
  }, [st.station, lookRow]);

  const openInMusic = React.useCallback(async (title: string) => {
    const options = musicSearchUrls(title);
    Alert.alert(
      '搜索这首歌',
      title,
      options.map((o) => ({
        text: o.label,
        onPress: () => Linking.openURL(o.url).catch(() => Alert.alert('无法打开', o.label)),
      })),
    );
  }, []);

  // ---------- 渲染 ----------
  if (!snap) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>正在点亮星图…</Text>
      </View>
    );
  }

  const playing = st.station;
  const currentRow = playing ?? lookRow;

  return (
    <View style={styles.root}>
      {view !== 'list' && cloud && (
        <StarfieldView cloud={cloud} mode={view === 'globe' ? 'globe' : 'sky'} onLookAt={lookAt} onTapPoint={(k) => cloudIndices[k] != null && lookAt(k)} />
      )}
      {view === 'list' && (
        <FlatList
          style={{ flex: 1 }}
          data={indices.slice(0, 600)}
          keyExtractor={(i) => String(i)}
          renderItem={({ item }) => (
            <StationRowItem snap={snap} i={item} onPress={() => { const r = rowOf(snap, item); if (r) { started.current = true; playRow(r); } }} />
          )}
        />
      )}

      {/* 顶部状态 + 准星信息 */}
      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable onPress={() => { setView('sky'); setSheet(null); }} style={styles.logoWrap} pointerEvents="auto">
          <Text style={styles.logo}>RoamRadio</Text>
          <Text style={styles.logoSub}>
            {snap.n.toLocaleString()} 台 · {snap.countries.length} 个国家与地区
          </Text>
        </Pressable>
        <View style={styles.topBtns} pointerEvents="auto">
          <TopBtn label={view === 'globe' ? '✨' : '🌐'} onPress={() => setView(view === 'globe' ? 'sky' : 'globe')} />
          <TopBtn label="☰" onPress={() => setView('list')} />
          <TopBtn label="🔍" onPress={() => setSheet({ kind: 'search' })} />
          <TopBtn label={`♥${favorites.size || ''}`} onPress={() => setSheet({ kind: 'saved' })} />
          <TopBtn label="⚙" onPress={() => setSheet({ kind: 'settings' })} />
          <TopBtn label="ⓘ" onPress={() => setSheet({ kind: 'about' })} />
        </View>
      </View>

      {/* 准星 */}
      {view !== 'list' && !st.station && (
        <View style={styles.welcome} pointerEvents="none">
          <Text style={styles.welcomeH}>去一个新地方听。</Text>
          <Text style={styles.welcomeP}>拖动星空，把准星停在星星上 1 秒即可收听；或</Text>
          <Pressable onPress={startRandom} style={styles.welcomeBtn} pointerEvents="auto">
            <Text style={styles.welcomeBtnText}>开始收听</Text>
          </Pressable>
          <Text style={styles.welcomeKeys}>→ 下一站 · ← 上一站 · 捏合缩放</Text>
        </View>
      )}
      {view !== 'list' && lookRow && (
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={styles.reticleRing}>
            <View style={[styles.reticleProgress, { transform: [{ rotate: `${dwellPct * 360}deg` }] }]} />
          </View>
          <Text style={styles.reticleName} numberOfLines={1}>
            {lookRow.name}
          </Text>
          <Text style={styles.reticleSub} numberOfLines={1}>
            {lookRow.city || lookRow.country.name} · {lookRow.genres.slice(0, 2).join(' ') || '电台'}
          </Text>
        </View>
      )}

      {/* 播放浮标 */}
      {view !== 'list' && playing && (
        <View style={styles.buddy} pointerEvents="box-none">
          <Pressable onPress={() => setSheet({ kind: 'detail' })} pointerEvents="auto">
            <Text style={styles.buddyText} numberOfLines={1}>
              {st.nowPlaying ? `♪ ${st.nowPlaying}` : playing.name}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.bottomZone}>
        <View style={styles.filterRow}>
          <Pressable style={chipAll(filters)} onPress={() => setFilters((f) => ({ ...f, genres: [] }))}>
            <Text style={filters.genres.length ? { color: C.sub, fontSize: FONT.sm } : { color: C.accent, fontSize: FONT.sm, fontWeight: '700' }}>全部</Text>
          </Pressable>
          {gCounts.map((g) => (
            <Chip
              key={g.name}
              label={g.name}
              count={g.count}
              active={filters.genres.includes(g.name)}
              onPress={() =>
                setFilters((f) => ({
                  ...f,
                  genres: f.genres.includes(g.name) ? f.genres.filter((x) => x !== g.name) : [...f.genres, g.name],
                }))
              }
            />
          ))}
          <Chip label={`码率 ${filters.minBitrate ? '≥' + filters.minBitrate : 'Any'}`} active={filters.minBitrate > 0} onPress={() => setSheet({ kind: 'bitrate' })} />
          <Chip label={`语言 ${filters.langs.length || 'All'}`} active={filters.langs.length > 0} onPress={() => setSheet({ kind: 'langs' })} />
          <Chip label={`国家 ${filters.countries.length || 'All'}`} active={filters.countries.length > 0} onPress={() => setSheet({ kind: 'countries' })} />
        </View>

        <PlayerBar
          row={currentRow}
          saved={currentRow ? favorites.has(currentRow.id) : false}
          onOpen={() => currentRow && setSheet({ kind: 'detail' })}
          onSave={() => currentRow && toggleSave(currentRow)}
          onPrev={prevStation}
          onNext={nextStation}
        />
      </View>

      {/* 弹层 */}
      {sheet?.kind === 'search' && (
        <SearchSheet snap={snap} filters={filters} onPick={(i) => { const r = rowOf(snap, i); if (r) { started.current = true; playRow(r); } setSheet(null); }} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'bitrate' && (
        <BitrateSheet value={filters.minBitrate} onPick={(v) => setFilters((f) => ({ ...f, minBitrate: v }))} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'langs' && (
        <LangSheet
          langs={snap.langs.map((name) => ({ name, count: snap.l.filter((x) => x >= 0 && snap.langs[x] === name).length })).sort((a, b) => b.count - a.count).slice(0, 60)}
          selected={filters.langs}
          onToggle={(l) => setFilters((f) => ({ ...f, langs: f.langs.includes(l) ? f.langs.filter((x) => x !== l) : [...f.langs, l] }))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'countries' && (
        <CountrySheet
          countries={snap.countries.map((c) => ({ code: c.code, name: c.name, count: snap.c.filter((x) => snap.countries[x]?.code === c.code).length })).sort((a, b) => b.count - a.count).slice(0, 120)}
          selected={filters.countries}
          onToggle={(code) => setFilters((f) => ({ ...f, countries: f.countries.includes(code) ? f.countries.filter((x) => x !== code) : [...f.countries, code] }))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'saved' && (
        <SavedSheet
          onClose={() => setSheet(null)}
          onPlay={(r) => { started.current = true; playRow(r); setSheet(null); }}
          onChanged={(rows) => setFavorites(new Set(rows.map((x) => x.id)))}
        />
      )}
      {sheet?.kind === 'settings' && (
        <SettingsSheet
          onClose={() => { setSheet(null); identifyConfig().then((c) => setCanIdentify(hasIdentifyKey(c))); }}
          onRefreshDirectory={doRefresh}
          refreshing={refreshing}
          cacheInfo={{ source: snapInfo?.from ?? 'bundle', builtAt: snap.builtAt }}
        />
      )}
      {sheet?.kind === 'about' && <AboutSheet onClose={() => setSheet(null)} builtAt={snap.builtAt} stations={snap.n} />}
      {sheet?.kind === 'lyrics' && <LyricsSheet lyric={lyric} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'detail' && (st.station ?? lookRow) && (
        <StationDetailHost
          row={(st.station ?? lookRow)!}
          saved={favorites.has((st.station ?? lookRow)!.id)}
          onClose={() => setSheet(null)}
          onToggleSave={toggleSave}
          onLyrics={openLyrics}
          onIdentify={doIdentify}
          canIdentify={canIdentify}
          onNearby={goNearby}
          onNowPlayingLong={openInMusic}
        />
      )}
      {sheet?.kind === 'list' && (
        <View style={StyleSheet.absoluteFill}>
          <FlatList
            data={indices.slice(0, 800)}
            keyExtractor={(i) => String(i)}
            renderItem={({ item }) => {
              const r = rowOf(snap, item);
              return r ? <StationRowItem snap={snap} i={item} onPress={() => { started.current = true; playRow(r); }} right={favorites.has(r.id) ? <Text style={{ color: C.gold }}>♥</Text> : undefined} /> : null;
            }}
            ListHeaderComponent={
              <Pressable onPress={() => setView('sky')} style={styles.backToSky}>
                <Text style={{ color: C.accent, fontSize: FONT.md }}>← 返回星图</Text>
              </Pressable>
            }
          />
        </View>
      )}
    </View>
  );
}

/** 详情弹层（带 StationDetail 的 Modal 包装 + 在播长按跳音乐 App） */
function StationDetailHost(props: {
  row: StationRow;
  saved: boolean;
  onClose: () => void;
  onToggleSave: (r: StationRow) => void;
  onLyrics: () => void;
  onIdentify: () => void;
  canIdentify: boolean;
  onNearby: (dir: 1 | -1) => void;
  onNowPlayingLong: (title: string) => void;
}) {
  const st = useEngineState();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose}>
        <Pressable style={styles.detailCard} onPress={(e) => e.stopPropagation()}>
          <StationDetail
            row={props.row}
            saved={props.saved}
            onClose={props.onClose}
            onToggleSave={() => props.onToggleSave(props.row)}
            onLyrics={props.onLyrics}
            onIdentify={props.onIdentify}
            onNearby={props.onNearby}
            onOpenInMap={props.onClose}
            canIdentify={props.canIdentify}
          />
          {st.nowPlaying && (
            <Pressable onPress={() => props.onNowPlayingLong(st.nowPlaying!)} style={styles.npSearch}>
              <Text style={{ color: C.accent, fontSize: FONT.sm }}>🔎 在网易云 / QQ音乐 / Spotify 搜索这首歌</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TopBtn({ label, onPress, hide }: { label: string; onPress: () => void; active?: boolean; hide?: boolean }) {
  if (hide) return null;
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.topBtn}>
      <Text style={styles.topBtnText}>{label}</Text>
    </Pressable>
  );
}

const chipAll = (f: Filters) => [
  styles.chipAll,
  f.genres.length === 0 && styles.chipAllActive,
];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: C.sub, fontSize: FONT.md },
  topBar: { position: 'absolute', top: 52, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoWrap: {},
  logo: { color: C.text, fontSize: FONT.lg, fontWeight: '800' },
  logoSub: { color: C.faint, fontSize: FONT.xs, marginTop: 2 },
  topBtns: { flexDirection: 'row', gap: 4 },
  topBtn: { backgroundColor: 'rgba(10,16,30,0.75)', borderRadius: 999, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  topBtnText: { color: C.text, fontSize: FONT.sm },
  reticleProgressOuter: {},
  welcome: { position: 'absolute', top: '42%', left: 24, right: 24, alignItems: 'center' },
  welcomeH: { color: C.text, fontSize: 30, fontWeight: '800' },
  welcomeP: { color: C.sub, fontSize: FONT.md, marginTop: 10, textAlign: 'center', lineHeight: 21 },
  welcomeBtn: { marginTop: 18, backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 12 },
  welcomeBtnText: { color: '#04101f', fontWeight: '900', fontSize: FONT.lg },
  welcomeKeys: { color: C.faint, fontSize: FONT.sm, marginTop: 16 },
  reticleWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  reticleRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleProgress: {
    position: 'absolute',
    width: 2,
    height: 28,
    top: 0,
    backgroundColor: C.accent,
    borderRadius: 2,
    transform: [{ translateY: 0 }],
  },
  reticleName: { color: C.text, fontSize: FONT.md, fontWeight: '700', marginTop: 66, maxWidth: 240, textAlign: 'center' },
  reticleSub: { color: C.sub, fontSize: FONT.sm, marginTop: 2, maxWidth: 240, textAlign: 'center' },
  buddy: { position: 'absolute', top: 110, left: 14 },
  buddyText: { color: C.accent, fontSize: FONT.sm, fontWeight: '600', backgroundColor: 'rgba(10,16,30,0.75)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, maxWidth: 300 },
  bottomZone: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(10,16,30,0.88)',
  },
  chipAll: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipAllActive: { borderColor: C.accent },
  backToSky: { padding: 16, backgroundColor: C.bgSoft },
  detailCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, borderColor: C.border, paddingBottom: 40 },
  npSearch: { paddingHorizontal: 18, paddingBottom: 6 },
});
