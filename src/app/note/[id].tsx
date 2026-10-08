import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { MarkdownText } from '@/components/markdown-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteNote, getNote, updateNote } from '@/lib/notes';

export default function NoteEditorScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const [note, setNote] = useState<{ title: string; body: string } | null>(null);
  // Existing notes open rendered; a new, blank note opens straight into editing.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getNote(db, id).then((found) => {
      if (!found) return router.back();
      setNote(found);
      setEditing(!found.title && !found.body);
    });
  }, [db, id]);

  // Autosave: every edit is written straight to the database.
  function edit(fields: Partial<{ title: string; body: string }>) {
    if (!note) return;
    const next = { ...note, ...fields };
    setNote(next);
    updateNote(db, id, next);
  }

  function confirmDelete() {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(db, id);
          router.back();
        },
      },
    ]);
  }

  if (!note) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              {editing ? (
                <IconButton icon={{ ios: 'eye', android: 'visibility' }} label="Preview" onPress={() => setEditing(false)} />
              ) : (
                <IconButton icon={{ ios: 'pencil', android: 'edit' }} label="Edit" onPress={() => setEditing(true)} />
              )}
              <IconButton icon={{ ios: 'trash', android: 'delete' }} label="Delete note" onPress={confirmDelete} />
            </View>
          ),
        }}
      />
      {editing ? (
        <KeyboardAvoidingView behavior="padding" style={styles.container}>
          <TextInput
            value={note.title}
            onChangeText={(title) => edit({ title })}
            placeholder="Title"
            placeholderTextColor={theme.textSecondary}
            style={[styles.title, styles.titleInput, { color: theme.text }]}
            autoFocus={!note.title && !note.body}
          />
          <TextInput
            value={note.body}
            onChangeText={(body) => edit({ body })}
            placeholder="Write something… (Markdown supported)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.body, { color: theme.text }]}
            multiline
            textAlignVertical="top"
          />
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerStyle={styles.rendered}>
          <ThemedText style={styles.title}>{note.title || 'Untitled'}</ThemedText>
          <MarkdownText value={note.body} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 600,
  },
  titleInput: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  body: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: Spacing.three,
  },
  rendered: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
});
