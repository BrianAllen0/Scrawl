import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import { Directory, File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { type IconName } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/appearance';
import { exportBackup, readBackup, restoreBackup } from '@/lib/backup';
import { toISODate } from '@/lib/dates';

const REPO_URL = 'https://github.com/BrianAllen0/Scrawl';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'unspecified', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Both pickers reject when the user backs out; that isn't an error worth reporting. */
const isCancel = (e: unknown) => e instanceof Error && /cancel/i.test(e.message);

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [theme, setTheme] = useState(getThemePreference);

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    setThemePreference(value);
  }

  async function exportData() {
    try {
      const backup = await exportBackup(db);
      const folder = await Directory.pickDirectoryAsync();
      const file = folder.createFile(`scrawl-backup-${toISODate(new Date())}.json`, 'application/json');
      file.write(JSON.stringify(backup, null, 2));
      Alert.alert('Exported', `Saved ${file.name}.`);
    } catch (e) {
      if (!isCancel(e)) Alert.alert("Couldn't export", e instanceof Error ? e.message : String(e));
    }
  }

  async function importData() {
    try {
      // Android often labels .json files as plain text or a generic binary, so don't filter them out.
      const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/*', 'application/octet-stream'] });
      if (picked.canceled) return;
      const backup = await readBackup(db, await picked.result.text());
      const contents = [
        plural(backup.notes.length, 'note'),
        plural(backup.groceries.length, 'grocery item'),
        plural(backup.todos.length, 'todo'),
      ].join(', ');
      Alert.alert('Replace everything?', `This backup has ${contents}. It replaces all your current data.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () =>
            restoreBackup(db, backup).then(
              () => Alert.alert('Imported', 'Your data has been restored.'),
              (e: unknown) => Alert.alert("Couldn't import", e instanceof Error ? e.message : String(e)),
            ),
        },
      ]);
    } catch (e) {
      if (!isCancel(e)) Alert.alert("Couldn't import", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen title="Settings">
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Appearance">
          <ThemePicker value={theme} onChange={chooseTheme} />
        </Section>

        <Section title="Data">
          <Row icon="file-upload" label="Export" detail="Save everything to a backup file" onPress={exportData} />
          <Row icon="file-download" label="Import" detail="Restore from a backup file" onPress={importData} />
        </Section>

        <Section title="About">
          <Row icon="info-outline" label="Version" value={Constants.expoConfig?.version} />
          <Row icon="person-outline" label="Author" value="Brian Allen" />
          <Row icon="gavel" label="License" value="MIT" onPress={() => Linking.openURL(`${REPO_URL}/blob/main/LICENSE`)} />
          <Row icon="code" label="Source code" detail="github.com/BrianAllen0/Scrawl" onPress={() => Linking.openURL(REPO_URL)} />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header">
        {title}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

type RowProps = {
  icon: IconName;
  label: string;
  /** Secondary line under the label. */
  detail?: string;
  /** Shown at the right end of the row. */
  value?: string;
  onPress?: () => void;
};

function Row({ icon, label, detail, value, onPress }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <MaterialIcons name={icon} size={22} color={theme.textSecondary} />
      <View style={styles.rowText}>
        <ThemedText>{label}</ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
      {value && <ThemedText themeColor="textSecondary">{value}</ThemedText>}
      {onPress && <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />}
    </Pressable>
  );
}

function ThemePicker({ value, onChange }: { value: ThemePreference; onChange: (value: ThemePreference) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Theme">
      {THEMES.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={[styles.segment, selected && { backgroundColor: theme.accentBackground }]}>
            <ThemedText style={selected && { color: theme.accent }}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  segments: {
    flexDirection: 'row',
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three - Spacing.one,
  },
});
