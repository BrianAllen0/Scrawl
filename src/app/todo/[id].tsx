import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeDue, fromISODate, toISODate } from '@/lib/dates';
import { deleteTodos, getTodo, listCategories, setTodoCompleted, updateTodo, type TodoFields } from '@/lib/todos';

export default function TodoEditorScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const [todo, setTodo] = useState<TodoFields | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  useEffect(() => {
    getTodo(db, id).then((found) => {
      if (!found) return router.back();
      setTodo(found);
      setCompletedAt(found.completed_at);
    });
    listCategories(db).then(setCategories);
  }, [db, id]);

  // Autosave: every edit is written straight to the database.
  function edit(fields: Partial<TodoFields>) {
    if (!todo) return;
    const next = { ...todo, ...fields };
    setTodo(next);
    updateTodo(db, id, next);
  }

  function pickDueDate() {
    DateTimePickerAndroid.open({
      value: todo?.due_date ? fromISODate(todo.due_date) : new Date(),
      mode: 'date',
      // Called only when a date is confirmed; dismissing the dialog changes nothing.
      onValueChange: (_, date) => edit({ due_date: toISODate(date) }),
    });
  }

  function toggleDone() {
    const next = completedAt ? null : new Date().toISOString();
    setCompletedAt(next);
    setTodoCompleted(db, id, next);
  }

  function confirmDelete() {
    Alert.alert('Delete todo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTodos(db, [id]);
          router.back();
        },
      },
    ]);
  }

  if (!todo) return null;

  const due = todo.due_date ? describeDue(todo.due_date) : null;
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];
  // Existing categories other than the current one, offered as one-tap picks.
  const suggestions = categories.filter((c) => c !== todo.category);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                icon={completedAt ? 'check-circle' : 'check-circle-outline'}
                label={completedAt ? 'Mark as not done' : 'Mark as done'}
                color={completedAt ? theme.accent : theme.text}
                onPress={toggleDone}
              />
              <IconButton icon="delete" label="Delete todo" onPress={confirmDelete} />
            </View>
          ),
        }}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        bottomOffset={Spacing.three}>
        <TextInput
          value={todo.task}
          onChangeText={(task) => edit({ task })}
          placeholder="What needs doing?"
          placeholderTextColor={theme.textSecondary}
          style={[styles.task, { color: theme.text }]}
          autoFocus={!todo.task}
          multiline
          submitBehavior="blurAndSubmit"
        />

        <ThemedText type="smallBold" themeColor="textSecondary">
          Due date
        </ThemedText>
        {Platform.OS === 'ios' ? (
          <View style={styles.dueRow}>
            <DateTimePicker
              value={todo.due_date ? fromISODate(todo.due_date) : new Date()}
              mode="date"
              display="compact"
              onValueChange={(_, date) => edit({ due_date: toISODate(date) })}
            />
            {due && <IconButton icon="close" label="Remove due date" onPress={() => edit({ due_date: null })} />}
          </View>
        ) : (
          <View style={styles.dueRow}>
            <Pressable
              onPress={pickDueDate}
              accessibilityRole="button"
              accessibilityLabel={due ? `Due ${due.label}, change` : 'Add due date'}
              style={[styles.dueButton, { backgroundColor: theme.backgroundElement }]}>
              <MaterialIcons name="event" size={20} color={due ? theme.text : theme.textSecondary} />
              <ThemedText themeColor={due ? 'text' : 'textSecondary'}>{due ? due.label : 'Add due date'}</ThemedText>
            </Pressable>
            {due && <IconButton icon="close" label="Remove due date" onPress={() => edit({ due_date: null })} />}
          </View>
        )}

        <ThemedText type="smallBold" themeColor="textSecondary">
          Category
        </ThemedText>
        <TextInput
          value={todo.category}
          onChangeText={(category) => edit({ category })}
          onEndEditing={(e) => edit({ category: e.nativeEvent.text.trim() })}
          placeholder="e.g. Work, Home, Errands"
          placeholderTextColor={theme.textSecondary}
          style={inputStyle}
          returnKeyType="done"
        />
        {suggestions.length > 0 && (
          <View style={styles.chips}>
            {suggestions.map((c) => (
              <Pressable
                key={c}
                onPress={() => edit({ category: c })}
                accessibilityRole="button"
                accessibilityLabel={`Use category ${c}`}
                style={[styles.chip, { backgroundColor: theme.accentBackground }]}>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  {c}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        <ThemedText type="smallBold" themeColor="textSecondary">
          Description
        </ThemedText>
        <TextInput
          value={todo.description}
          onChangeText={(description) => edit({ description })}
          placeholder="Details, links, notes…"
          placeholderTextColor={theme.textSecondary}
          style={[inputStyle, styles.description]}
          multiline
          textAlignVertical="top"
        />
      </KeyboardAwareScrollView>
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
  form: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  task: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
    marginBottom: Spacing.two,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  dueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: -Spacing.one,
    marginBottom: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  description: {
    minHeight: 140,
  },
});
