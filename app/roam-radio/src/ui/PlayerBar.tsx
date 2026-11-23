// 底部播放条 + 电台详情弹层
import * as React from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { engine } from '../audio/engine.ts';
import type { StationRow } from '../core/snapshot.ts';
import { flagEmoji } from '../core/snapshot.ts';
import { localTimeInTz, locationLabel, stationSubtitle } from './format.ts';
import { C, FONT } from './theme.ts';

export function useEngineState() {
  return React.useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}

export function PlayerBar({
  row,
  saved,
  onOpen,
  onSave,
  onPrev,
  onNext,
}: {
  row: StationRow | null;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const st = useEngineState();
  const isPlaying = st.status === 'playing' || st.status === 'loading';
  const [clock, setClock] = React.useState('');
  React.useEffect(() => {
    const t = setInterval(() => setClock(row ? localTimeInTz(row.tz) : ''), 10_000);
    setClock(row ? localTimeInTz(row.tz) : '');
    return () => clearInterval(t);
  }, [row?.tz]);

  if (!row) {
    return (
      <View style={styles.bar}>
        <Text style={styles.hint}>按「随机掉台」，坠入世界上某个城市的夜空</Text>
        <Pressable onPress={onNext} style={styles.startBtn}>
          <Text style={styles.startText}>开始收听</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.bar}>
      <Pressable style={styles.info} onPress={onOpen}>
        <Text style={styles.name} numberOfLines={1}>
          {st.nowPlaying ? `♪ ${st.nowPlaying}` : row.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {locationLabel(row.city, row.country)}
          {clock ? ` · 当地 ${clock}` : ''}
          {` · ${stationSubtitle(row.genres, row.lang, row.bitrate)}`}
        </Text>
      </Pressable>
      <View style={styles.controls}>
        <BarBtn label="⏮" onPress={onPrev} />
        <BarBtn
          big
          onPress={() => {
            if (st.status === 'idle' || st.status === 'error') engine.play(row);
            else engine.toggle();
          }}
          node={
            st.status === 'loading' ? (
              <ActivityIndicator color={C.text} />
            ) : (
              <Text style={styles.bigLabel}>{isPlaying ? '❚❚' : '▶'}</Text>
            )
          }
        />
        <BarBtn label="⏭" onPress={onNext} />
        <BarBtn label={saved ? '♥' : '♡'} onPress={onSave} active={saved} />
      </View>
    </View>
  );
}

function BarBtn({
  label,
  onPress,
  big,
  active,
  node,
}: {
  label?: string;
  onPress: () => void;
  big?: boolean;
  active?: boolean;
  node?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        big && styles.btnBig,
        pressed && { opacity: 0.7 },
        active && { transform: [{ scale: 1.15 }] },
      ]}
    >
      {node ?? <Text style={[styles.btnLabel, big && styles.btnLabelBig, active && { color: C.gold }]}>{label}</Text>}
    </Pressable>
  );
}

export function StationDetail({
  row,
  saved,
  onClose,
  onToggleSave,
  onLyrics,
  onIdentify,
  onNearby,
  onOpenInMap,
  canIdentify,
}: {
  row: StationRow;
  saved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  onLyrics: () => void;
  onIdentify: () => void;
  onNearby: (dir: 1 | -1) => void;
  onOpenInMap: () => void;
  canIdentify: boolean;
}) {
  const st = useEngineState();
  const [clock, setClock] = React.useState(() => localTimeInTz(row.tz));
  React.useEffect(() => {
    const t = setInterval(() => setClock(localTimeInTz(row.tz)), 10_000);
    return () => clearInterval(t);
  }, [row.tz]);
  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <Text style={styles.detailFlag}>{flagEmoji(row.country.code)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailName}>{row.name}</Text>
          <Text style={styles.detailSub}>
            {locationLabel(row.city, row.country)}
            {clock ? ` · 当地 ${clock}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.detailClose}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.detailTags}>{stationSubtitle(row.genres, row.lang, row.bitrate)}</Text>
      {st.nowPlaying ? (
        <View style={styles.npRow}>
          <Text style={styles.npLabel}>正在播放</Text>
          <Text style={styles.npTitle} numberOfLines={1}>
            {st.nowPlaying}
          </Text>
        </View>
      ) : (
        <Text style={styles.npEmpty}>{st.status === 'error' ? `线路不可用：${st.error ?? ''}` : '这个台读不到曲名'}</Text>
      )}
      <View style={styles.detailActions}>
        <DetailBtn label={st.status === 'playing' || st.status === 'loading' ? '❚❚ 暂停' : '▶ 播放'} onPress={() => engine.toggle()} />
        <DetailBtn label={saved ? '♥ 已收藏' : '♡ 收藏'} onPress={onToggleSave} />
        <DetailBtn
          label="分享"
          onPress={() =>
            void Share.share({
              message: `正在听「${row.name}」· ${row.country.name} — RoamRadio roamradio://s/${row.id}`,
            })
          }
        />
        {st.nowPlaying && canIdentify && <DetailBtn label="识别这首歌" onPress={onIdentify} />}
        <DetailBtn label="歌词" onPress={onLyrics} disabled={!st.nowPlaying} />
        <DetailBtn label="↑ 附近电台" onPress={() => onNearby(1)} />
        <DetailBtn label="↓ 附近电台" onPress={() => onNearby(-1)} />
        <DetailBtn label="📍 在星图中定位" onPress={onOpenInMap} />
      </View>
    </View>
  );
}

function DetailBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.detailBtn, pressed && { opacity: 0.7 }, disabled && { opacity: 0.35 }]}
    >
      <Text style={styles.detailBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(10,16,30,0.92)',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  hint: { flex: 1, color: C.faint, fontSize: FONT.sm },
  startBtn: { backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  startText: { color: '#04101f', fontWeight: '800' },
  info: { flex: 1 },
  name: { color: C.text, fontSize: FONT.md, fontWeight: '700' },
  sub: { color: C.sub, fontSize: FONT.xs, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { paddingHorizontal: 10, paddingVertical: 6 },
  btnBig: {
    backgroundColor: 'rgba(125,211,252,0.15)',
    borderRadius: 999,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { color: C.text, fontSize: FONT.lg },
  btnLabelBig: { color: C.text, fontSize: FONT.md },
  bigLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  detail: { padding: 18 },
  detailHead: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  detailFlag: { fontSize: 30 },
  detailName: { color: C.text, fontSize: FONT.xl - 3, fontWeight: '800' },
  detailSub: { color: C.sub, fontSize: FONT.sm, marginTop: 2 },
  detailClose: { color: C.sub, fontSize: FONT.lg },
  detailTags: { color: C.faint, fontSize: FONT.sm, marginTop: 8 },
  npRow: {
    marginTop: 12,
    backgroundColor: 'rgba(125,211,252,0.08)',
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  npLabel: { color: C.faint, fontSize: FONT.xs, textTransform: 'uppercase' },
  npTitle: { color: C.text, fontSize: FONT.md, marginTop: 2 },
  npEmpty: { color: C.faint, fontSize: FONT.sm, marginTop: 12 },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  detailBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailBtnText: { color: C.text, fontSize: FONT.sm },
});
