// 共享 UI 小件
import * as React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, FONT } from './theme.ts';

export function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {count !== undefined && <Text style={styles.chipCount}>{count.toLocaleString()}</Text>}
    </Pressable>
  );
}

export function SheetModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.sheetClose}>✕ 关闭</Text>
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(148,163,184,0.08)',
  },
  chipActive: { borderColor: C.accent, backgroundColor: 'rgba(125,211,252,0.14)' },
  chipText: { color: C.sub, fontSize: FONT.sm },
  chipTextActive: { color: C.accent },
  chipCount: { color: C.faint, fontSize: FONT.xs, marginLeft: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,18,0.6)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '86%',
    backgroundColor: C.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    paddingBottom: 34,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 10,
  },
  sheetTitle: { color: C.text, fontSize: FONT.lg, fontWeight: '700' },
  sheetClose: { color: C.sub, fontSize: FONT.md },
  section: { color: C.faint, fontSize: FONT.xs, letterSpacing: 1, marginTop: 16, marginBottom: 6, textTransform: 'uppercase' },
});
