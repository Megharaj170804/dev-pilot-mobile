import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { RADII, SPACING } from '../constants/theme';
import { useApp, useThemePalette } from '../context/AppContext';
import { parseTextileBlocks } from '../domain/redmineUtils';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { palette } = useThemePalette();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { palette } = useThemePalette();
  return (
    <View style={[styles.cardHeader, { borderBottomColor: palette.borderSubtle }]}>
      <View style={styles.cardHeaderText}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.cardSubtitle, { color: palette.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'epic';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { palette } = useThemePalette();
  const colors: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: palette.surface3, fg: palette.text2 },
    primary: { bg: palette.primaryMuted, fg: palette.primaryInk },
    success: { bg: palette.successSurface, fg: palette.success },
    warning: { bg: palette.warningSurface, fg: palette.warning },
    danger: { bg: palette.dangerSurface, fg: palette.danger },
    epic: { bg: palette.epicSoft, fg: palette.epic },
  };
  const c = colors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'success' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const { palette } = useThemePalette();
  const bgMap = {
    primary: palette.primary,
    ghost: palette.surface2,
    success: palette.success,
    danger: palette.danger,
  };
  const fgMap = {
    primary: '#FFFFFF',
    ghost: palette.text,
    success: '#FFFFFF',
    danger: '#FFFFFF',
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' ? styles.buttonSm : styles.buttonMd,
        {
          backgroundColor: bgMap[variant],
          borderColor: variant === 'ghost' ? palette.border : 'transparent',
          borderWidth: variant === 'ghost' ? 1 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fgMap[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 14 : 16} color={fgMap[variant]} /> : null}
          <Text
            style={[
              styles.buttonText,
              { color: fgMap[variant], fontSize: size === 'sm' ? 12 : 14 },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (val: T) => void;
}) {
  const { palette } = useThemePalette();
  return (
    <View style={[styles.segWrap, { backgroundColor: palette.surface2, borderColor: palette.border }]}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segItem,
              active && { backgroundColor: palette.panel3 },
            ]}
          >
            <Text
              style={[
                styles.segText,
                { color: active ? palette.text : palette.textMuted, fontWeight: active ? '600' : '500' },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { palette } = useThemePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? palette.primaryMuted : palette.surface2,
          borderColor: active ? palette.primary : palette.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? palette.primaryInk : palette.textMuted, fontWeight: active ? '600' : '500' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FieldInput({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  const { palette } = useThemePalette();
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={[styles.fieldLabel, { color: palette.text2 }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={palette.textSubtle}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: palette.surface2,
            borderColor: palette.border,
            color: palette.text,
          },
          props.multiline && styles.inputMultiline,
          props.style,
        ]}
      />
      {hint ? <Text style={[styles.fieldHint, { color: palette.textSubtle }]}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { palette } = useThemePalette();
  return (
    <View style={styles.emptyWrap}>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.emptyMsg, { color: palette.textMuted }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="sm" style={{ marginTop: SPACING.md }} />
      ) : null}
    </View>
  );
}

export function OfflineBanner({ onPressQueue }: { onPressQueue?: () => void }) {
  const { isOnline, pendingQueueCount, isSyncing, palette, flushOutbox } = useApp();
  if (isOnline && pendingQueueCount === 0) return null;

  return (
    <Pressable
      onPress={onPressQueue || (isOnline ? flushOutbox : undefined)}
      style={[
        styles.offlineBanner,
        {
          backgroundColor: isOnline ? palette.primaryMuted : palette.warningSurface,
          borderColor: isOnline ? palette.primary : palette.warning,
        },
      ]}
    >
      <Ionicons
        name={isOnline ? 'cloud-upload-outline' : 'cloud-offline-outline'}
        size={16}
        color={isOnline ? palette.primaryInk : palette.warning}
      />
      <Text
        style={[
          styles.offlineText,
          { color: isOnline ? palette.primaryInk : palette.warning },
        ]}
      >
        {!isOnline
          ? `Offline mode (SQLite cache)${pendingQueueCount ? ` · ${pendingQueueCount} pending` : ''}`
          : isSyncing
            ? `Syncing ${pendingQueueCount} queued change(s)…`
            : `${pendingQueueCount} queued change(s) ready — tap to sync`}
      </Text>
    </Pressable>
  );
}

export function TextilePreview({ text }: { text: string }) {
  const { palette } = useThemePalette();
  const blocks = parseTextileBlocks(text);
  if (!blocks.length) {
    return <Text style={{ color: palette.textSubtle, fontStyle: 'italic' }}>(empty)</Text>;
  }
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'hr') {
          return <View key={idx} style={{ height: 1, backgroundColor: palette.border, marginVertical: 4 }} />;
        }
        if (b.type === 'heading') {
          return (
            <Text key={idx} style={{ color: palette.text, fontWeight: '700', fontSize: 13.5, marginTop: 6 }}>
              {b.text}
            </Text>
          );
        }
        if (b.type === 'checkbox') {
          return (
            <View key={idx} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Ionicons
                name={b.checked ? 'checkbox' : 'square-outline'}
                size={16}
                color={b.checked ? palette.success : palette.textMuted}
                style={{ marginTop: 2 }}
              />
              <Text style={{ flex: 1, color: palette.text2, fontSize: 13, lineHeight: 19 }}>
                {b.ordered && b.index ? `${b.index}. ` : ''}
                {b.text}
              </Text>
            </View>
          );
        }
        if (b.type === 'bullet') {
          return (
            <Text key={idx} style={{ color: palette.text2, fontSize: 13, lineHeight: 19, paddingLeft: 6 }}>
              {b.ordered && b.index ? `${b.index}. ` : '• '}
              {b.text}
            </Text>
          );
        }
        return (
          <Text key={idx} style={{ color: palette.text2, fontSize: 13, lineHeight: 19 }}>
            {b.text}
          </Text>
        );
      })}
    </View>
  );
}

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  sub?: string;
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  placeholder = 'Select…',
  onChange,
}: {
  label: string;
  value: T | null | undefined;
  options: SelectOption<T>[];
  placeholder?: string;
  onChange: (val: T) => void;
}) {
  const { palette } = useThemePalette();
  const [open, setOpen] = React.useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={[styles.fieldLabel, { color: palette.text2 }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.selectTrigger,
          { backgroundColor: palette.surface2, borderColor: palette.border },
        ]}
      >
        <Text
          style={{ color: selected ? palette.text : palette.textSubtle, fontSize: 14, flex: 1 }}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={palette.textMuted} />
      </Pressable>

      {open ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
            <Pressable style={[styles.pickerSheet, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
              <View style={[styles.pickerHead, { borderBottomColor: palette.borderSubtle }]}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{label || placeholder}</Text>
                <Button label="Done" size="sm" variant="ghost" onPress={() => setOpen(false)} />
              </View>
              <FlatList
                data={options}
                keyExtractor={item => String(item.value)}
                style={{ maxHeight: 380 }}
                renderItem={({ item }) => {
                  const active = item.value === value;
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      style={[
                        styles.pickerRow,
                        { borderBottomColor: palette.borderSubtle },
                        active && { backgroundColor: palette.primaryMuted },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: active ? palette.primaryInk : palette.text, fontWeight: active ? '600' : '400', fontSize: 14 }}>
                          {item.label}
                        </Text>
                        {item.sub ? <Text style={{ color: palette.textMuted, fontSize: 12 }}>{item.sub}</Text> : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={palette.primaryInk} /> : null}
                    </Pressable>
                  );
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

export function ToastBanner() {
  const { toastText, palette } = useApp();
  if (!toastText) return null;
  return (
    <View style={[styles.toastWrap, { backgroundColor: palette.panel3, borderColor: palette.borderStrong }]}>
      <Text style={[styles.toastText, { color: palette.text }]}>{toastText}</Text>
    </View>
  );
}

export function ScreenScroll({
  children,
  refreshControl,
}: {
  children: React.ReactNode;
  refreshControl?: React.ReactElement;
}) {
  const { palette } = useThemePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 42,
  },
  card: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADII.sm,
  },
  buttonSm: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonMd: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    fontWeight: '600',
  },
  segWrap: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 2,
  },
  segItem: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: RADII.xs,
    alignItems: 'center',
  },
  segText: {
    fontSize: 12.5,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  fieldHint: {
    fontSize: 11.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  selectTrigger: {
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    paddingBottom: 24,
  },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 10,
  },
  emptyWrap: {
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyMsg: {
    fontSize: 13,
    textAlign: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  offlineText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  toastWrap: {
    position: 'absolute',
    bottom: 84,
    left: 20,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    zIndex: 99,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
