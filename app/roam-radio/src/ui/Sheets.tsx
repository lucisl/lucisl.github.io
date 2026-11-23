// 各弹层：搜索 / 筛选（码率、语言、国家）/ 收藏 / 设置 / 关于 / 歌词
import * as React from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { emptyFilters, type Filters } from '../core/browse.ts';
import { flagEmoji, type Snapshot, type StationRow } from '../core/snapshot.ts';
import { identifyConfig, hasIdentifyKey } from '../services/identifyService.ts';
import { addFavorite, listFavorites, removeFavorite, setSetting } from '../store/db.ts';
import { Chip, SectionLabel, SheetModal } from './parts.ts';
import { C, FONT } from './theme.ts';
import { stationSubtitle } from './format.ts';

const BITRATES = [0, 128, 192, 320];

export function SearchSheet({
  snap,
  filters,
  onPick,
  onClose,
}: {
  snap: Snapshot;
  filters: Filters;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState('');
  const results = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const out: number[] = [];
    for (let i = 0; i < snap.n && out.length < 60; i++) {
      const hay = (snap.names[i] + ' ' + snap.city[i] + ' ' + snap.countries[snap.c[i]]?.name + ' ' + (snap.g[i] ?? []).map((g) => snap.genres[g]).join(' ')).toLowerCase();
      if (hay.includes(query)) out.push(i);
    }
    return out;
  }, [q, snap]);
  return (
    <SheetModal title="搜索电台 / 城市 / 国家" onClose={onClose}>
      <View style={s.searchBox}>
        <TextInput
          autoFocus
          placeholder="例如：jazz、上海、BBC…"
          placeholderTextColor={C.faint}
          style={s.searchInput}
          value={q}
          onChangeText={setQ}
        />
      </View>
      <FlatList
        data={results}
        style={{ maxHeight: 380 }}
        keyExtractor={(i) => String(i)}
        renderItem={({ item }) => <StationRowItem snap={snap} i={item} onPress={() => onPick(item)} />}
        ListEmptyComponent={<Text style={s.empty}>{q ? '没有匹配的台' : '输入关键词开始搜索'}</Text>}
      />
    </SheetModal>
  );
}

export function StationRowItem({
  snap,
  i,
  onPress,
  right,
}: {
  snap: Snapshot;
  i: number;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  const country = snap.countries[snap.c[i]];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      <Text style={s.rowFlag}>{flagEmoji(country?.code ?? '')}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.rowName} numberOfLines={1}>{snap.names[i]}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {[snap.city[i] || country?.name, (snap.g[i] ?? []).slice(0, 2).map((g) => snap.genres[g]).join(' '), snap.br[i] ? snap.br[i] + 'kbps' : ''].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

export function BitrateSheet({ value, onPick, onClose }: { value: number; onPick: (v: number) => void; onClose: () => void }) {
  return (
    <SheetModal title="最低码率" onClose={onClose}>
      {BITRATES.map((b) => (
        <Pressable key={b} style={s.optRow} onPress={() => { onPick(b); onClose(); }}>
          <Text style={[s.optText, value === b && s.optActive]}>{b === 0 ? '不限码率' : `≥ ${b} kbps`}</Text>
          {value === b && <Text style={s.optCheck}>✓</Text>}
        </Pressable>
      ))}
    </SheetModal>
  );
}

export function LangSheet({
  langs,
  selected,
  onToggle,
  onClose,
}: {
  langs: { name: string; count: number }[];
  selected: string[];
  onToggle: (l: string) => void;
  onClose: () => void;
}) {
  return (
    <SheetModal title="语言（可多选）" onClose={onClose}>
      <ScrollView style={{ maxHeight: 420 }}>
        {langs.map((l) => (
          <Pressable key={l.name} style={s.optRow} onPress={() => onToggle(l.name)}>
            <Text style={[s.optText, selected.includes(l.name) && s.optActive]}>
              {l.name} <Text style={s.optCount}>{l.count}</Text>
            </Text>
            {selected.includes(l.name) && <Text style={s.optCheck}>✓</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </SheetModal>
  );
}

export function CountrySheet({
  countries,
  selected,
  onToggle,
  onClose,
}: {
  countries: { code: string; name: string; count: number }[];
  selected: string[];
  onToggle: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <SheetModal title="国家 / 地区（可多选）" onClose={onClose}>
      <ScrollView style={{ maxHeight: 460 }}>
        {countries.map((c) => (
          <Pressable key={c.code} style={s.optRow} onPress={() => onToggle(c.code)}>
            <Text style={[s.optText, selected.includes(c.code) && s.optActive]}>
              {flagEmoji(c.code)} {c.name} <Text style={s.optCount}>{c.count}</Text>
            </Text>
            {selected.includes(c.code) && <Text style={s.optCheck}>✓</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </SheetModal>
  );
}

export function SavedSheet({
  onClose,
  onPlay,
  onChanged,
}: {
  onClose: () => void;
  onPlay: (row: StationRow) => void;
  onChanged: (rows: StationRow[]) => void;
}) {
  const [rows, setRows] = React.useState<StationRow[]>([]);
  React.useEffect(() => {
    listFavorites().then(setRows).catch(() => setRows([]));
  }, []);
  const remove = async (r: StationRow) => {
    await removeFavorite(r.id);
    const next = rows.filter((x) => x.id !== r.id);
    setRows(next);
    onChanged(next);
  };
  return (
    <SheetModal title={`我的收藏（${rows.length}）`} onClose={onClose}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        style={{ maxHeight: 420 }}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => onPlay(item)}>
            <Text style={s.rowFlag}>{flagEmoji(item.country.code)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.rowSub}>{stationSubtitle(item.genres, item.lang, item.bitrate)}</Text>
            </View>
            <Pressable onPress={() => remove(item)} hitSlop={10}>
              <Text style={s.unfav}>✕</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={s.empty}>还没有收藏。听到喜欢的台，点 ♡ 即可存在本机。</Text>}
      />
    </SheetModal>
  );
}

export function SettingsSheet({
  onClose,
  onRefreshDirectory,
  refreshing,
  cacheInfo,
}: {
  onClose: () => void;
  onRefreshDirectory: () => void;
  refreshing: boolean;
  cacheInfo: { source: 'bundle' | 'cache'; builtAt: string };
}) {
  const [cfg, setCfg] = React.useState({ acr_host: '', acr_key: '', acr_secret: '', audd_token: '' });
  const [savedMsg, setSavedMsg] = React.useState('');
  React.useEffect(() => {
    identifyConfig().then((c) =>
      setCfg({ acr_host: c.acrHost, acr_key: c.acrKey, acr_secret: c.acrSecret, audd_token: c.auddToken }),
    );
  }, []);
  const save = async () => {
    await Promise.all([
      setSetting('acr_host', cfg.acr_host.trim()),
      setSetting('acr_key', cfg.acr_key.trim()),
      setSetting('acr_secret', cfg.acr_secret.trim()),
      setSetting('audd_token', cfg.audd_token.trim()),
    ]);
    setSavedMsg('已保存');
    setTimeout(() => setSavedMsg(''), 1500);
  };
  return (
    <SheetModal title="设置" onClose={onClose}>
      <View style={s.pad}>
        <SectionLabel>电台目录</SectionLabel>
        <Text style={s.hint}>
          当前来源：{cacheInfo.source === 'cache' ? '应用内刷新缓存' : '随包快照'} · 构建于{' '}
          {cacheInfo.builtAt.slice(0, 10)}
        </Text>
        <Pressable style={s.primaryBtn} onPress={onRefreshDirectory} disabled={refreshing}>
          <Text style={s.primaryBtnText}>{refreshing ? '正在刷新目录…' : '从 Radio Browser 刷新目录'}</Text>
        </Pressable>
        <Text style={s.hint}>刷新需要拉取约 70MB 数据（国内网络可能较慢），失败会自动保留现有目录。</Text>

        <SectionLabel>听歌识曲（可选）</SectionLabel>
        <Text style={s.hint}>配置后，在播歌名识别不到的台会出现「识别这首歌」。不配置不影响其他功能。</Text>
        {(['acr_host', 'acr_key', 'acr_secret', 'audd_token'] as const).map((k) => (
          <TextInput
            key={k}
            style={s.input}
            autoCapitalize="none"
            placeholder={
              k === 'acr_host' ? 'ACRCloud host（如 identify-eu-west-1.acrcloud.com）'
                : k === 'acr_key' ? 'ACRCloud access key'
                : k === 'acr_secret' ? 'ACRCloud access secret'
                : 'AudD api_token'
            }
            placeholderTextColor={C.faint}
            value={cfg[k]}
            secureTextEntry={k === 'acr_secret' || k === 'audd_token'}
            onChangeText={(v) => setCfg((c) => ({ ...c, [k]: v }))}
          />
        ))}
        <Pressable style={s.primaryBtn} onPress={save}>
          <Text style={s.primaryBtnText}>{savedMsg || '保存识曲配置'}</Text>
        </Pressable>
      </View>
    </SheetModal>
  );
}

export function AboutSheet({
  onClose,
  builtAt,
  stations,
}: {
  onClose: () => void;
  builtAt: string;
  stations: number;
}) {
  return (
    <SheetModal title="关于 RoamRadio" onClose={onClose}>
      <View style={s.pad}>
        <Text style={s.aboutP}>上班路上随机掉进世界上某个城市的电台，听听那里此刻在播什么。</Text>
        <Text style={s.aboutP}>无账号、无广告，收藏只存在你的手机里。</Text>
        <Text style={s.hint}>目录快照 {stations.toLocaleString()} 台 · 构建于 {builtAt.slice(0, 10)}</Text>
        <SectionLabel>数据与灵感</SectionLabel>
        <Text style={s.aboutP}>· 电台目录：社区维护的 Radio Browser（开放数据）</Text>
        <Text style={s.aboutP}>· 地名坐标：GeoNames</Text>
        <Text style={s.aboutP}>· 歌词：LRCLIB</Text>
        <Text style={s.aboutP}>· 交互灵感来自群友的网页版 roamdial.com，本站未使用其任何代码与数据。</Text>
      </View>
    </SheetModal>
  );
}

export function LyricsSheet({
  lyric,
  onClose,
}: {
  lyric: { synced: { t: number; text: string }[]; plain: string } | null;
  onClose: () => void;
}) {
  return (
    <SheetModal title="歌词" onClose={onClose}>
      <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={s.pad}>
        {!lyric && <Text style={s.empty}>先切到一个能读到曲名的台，歌词才会出现。</Text>}
        {lyric?.synced.map((l, i) => (
          <Text key={i} style={s.lyricLine}>{l.text}</Text>
        ))}
        {lyric && lyric.synced.length === 0 && lyric.plain ? (
          <Text style={s.lyricPlain}>{lyric.plain}</Text>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}

const s = StyleSheet.create({
  searchBox: { paddingHorizontal: 14 },
  searchInput: {
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: C.text,
    fontSize: FONT.md,
  },
  empty: { color: C.faint, padding: 20, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.07)',
  },
  rowFlag: { fontSize: 20 },
  rowName: { color: C.text, fontSize: FONT.md },
  rowSub: { color: C.faint, fontSize: FONT.xs, marginTop: 1 },
  unfav: { color: C.faint, fontSize: FONT.md, paddingHorizontal: 8 },
  optRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.07)',
  },
  optText: { color: C.sub, fontSize: FONT.md },
  optActive: { color: C.accent, fontWeight: '700' },
  optCount: { color: C.faint, fontSize: FONT.xs },
  optCheck: { color: C.accent, fontSize: FONT.md },
  pad: { paddingHorizontal: 16 },
  hint: { color: C.faint, fontSize: FONT.sm, lineHeight: 19, marginVertical: 4 },
  input: {
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: C.text,
    fontSize: FONT.sm,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#04101f', fontWeight: '800', fontSize: FONT.md },
  aboutP: { color: C.sub, fontSize: FONT.sm, lineHeight: 21, marginVertical: 3 },
  lyricLine: { color: C.text, fontSize: FONT.md, lineHeight: 26 },
  lyricPlain: { color: C.sub, fontSize: FONT.md, lineHeight: 24 },
});
