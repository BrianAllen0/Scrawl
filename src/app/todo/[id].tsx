import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/icon-button';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeDue, fromISODate, toISODate } from '@/lib/dates';
import { onDay } from '@/lib/repeat';
import {
  deleteTodos,
  getTodo,
  listCategories,
  setTodoCompleted,
  updateTodo,
  type RepeatUnit,
  type TodoFields,
} from '@/lib/todos';

const REPEAT_UNITS: { value: RepeatUnit; label: string }[] = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

const REPEAT_LIMITS = [
  { value: false, label: 'Forever' },
  { value: true, label: 'Limited' },
];

/** Default count when a repeat is switched from forever to limited. */
const DEFAULT_REPEATS = 3;

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

  // Off clears every repeat field; on starts as every day, forever.
  function toggleRepeat() {
    edit(
      todo?.repeat_unit
        ? { repeat_unit: null, repeat_every: null, repeats_left: null, repeat_day: null }
        : { repeat_unit: 'day', repeat_every: 1, repeats_left: null, repeat_day: null },
    );
  }

  // Repeats follow the due date, so a monthly repeat's day moves with it.
  function setDueDate(due_date: string | null) {
    const day = due_date && todo?.repeat_unit === 'month' ? { repeat_day: fromISODate(due_date).getDate() } : {};
    edit({ due_date, ...day });
  }

  // Monthly repeats need a day to land on: the due date's, or today's (which becomes the due date).
  function setRepeatUnit(repeat_unit: RepeatUnit) {
    if (repeat_unit !== 'month') return edit({ repeat_unit, repeat_day: null });
    const due_date = todo?.due_date ?? toISODate(new Date());
    edit({ repeat_unit, due_date, repeat_day: fromISODate(due_date).getDate() });
  }

  // Moves the due date to that day of its month, clamped like every later occurrence.
  function setRepeatDay(repeat_day: number) {
    edit({ repeat_day, ...(todo?.due_date ? { due_date: onDay(todo.due_date, repeat_day) } : {}) });
  }

  function pickDueDate() {
    DateTimePickerAndroid.open({
      value: todo?.due_date ? fromISODate(todo.due_date) : new Date(),
      mode: 'date',
      // Called only when a date is confirmed; dismissing the dialog changes nothing.
      onValueChange: (_, date) => setDueDate(toISODate(date)),
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
  // Inside the gray repeat box, inputs use the page color so they stand out from it.
  const boxInputStyle = [styles.input, { color: theme.text, backgroundColor: theme.background }];
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
              onValueChange={(_, date) => setDueDate(toISODate(date))}
            />
            {due && <IconButton icon="close" label="Remove due date" onPress={() => setDueDate(null)} />}
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
            {due && <IconButton icon="close" label="Remove due date" onPress={() => setDueDate(null)} />}
          </View>
        )}

        <Pressable
          onPress={toggleRepeat}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: todo.repeat_unit !== null }}
          style={styles.repeatToggle}>
          <MaterialIcons
            name={todo.repeat_unit ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color={todo.repeat_unit ? theme.accent : theme.textSecondary}
          />
          <ThemedText>Repeat after it&apos;s done</ThemedText>
        </Pressable>
        {todo.repeat_unit !== null && (
          <View style={[styles.repeatBox, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.numberRow}>
              <ThemedText>Every</ThemedText>
              <NumberField
                value={todo.repeat_every ?? 1}
                min={1}
                onChange={(repeat_every) => edit({ repeat_every })}
                accessibilityLabel={`Repeat every how many ${todo.repeat_unit}s`}
                style={boxInputStyle}
              />
            </View>
            <SegmentedControl
              options={REPEAT_UNITS}
              value={todo.repeat_unit}
              onChange={setRepeatUnit}
              label="Repeat unit"
            />
            {todo.repeat_unit === 'month' && (
              <View style={styles.numberRow}>
                <ThemedText>On day</ThemedText>
                <NumberField
                  value={todo.repeat_day ?? 1}
                  min={1}
                  max={31}
                  onChange={setRepeatDay}
                  accessibilityLabel="Day of the month to repeat on"
                  style={boxInputStyle}
                />
                <ThemedText type="small" themeColor="textSecondary" style={styles.numberHint}>
                  Shorter months use their last day
                </ThemedText>
              </View>
            )}
            <SegmentedControl
              options={REPEAT_LIMITS}
              value={todo.repeats_left !== null}
              onChange={(limited) => edit({ repeats_left: limited ? DEFAULT_REPEATS : null })}
              label="How many times"
            />
            {todo.repeats_left !== null && (
              <View style={styles.numberRow}>
                <NumberField
                  value={todo.repeats_left}
                  min={0}
                  onChange={(repeats_left) => edit({ repeats_left })}
                  accessibilityLabel="Repeat how many more times"
                  style={boxInputStyle}
                />
                <ThemedText>{todo.repeats_left === 1 ? 'more time' : 'more times'}</ThemedText>
              </View>
            )}
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

type NumberFieldProps = {
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  style: StyleProp<TextStyle>;
};

/**
 * A short whole-number input. Keeps its own text so it can be cleared mid-edit; only values from
 * `min` to `max` are saved, and leaving it blank or out of range shows the saved value again.
 */
function NumberField({ value, min, max = 999, onChange, accessibilityLabel, style }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  // Follow changes made elsewhere, e.g. a new due date moving the monthly day. Adjusted during
  // render rather than in an effect, as React recommends, so the old value never paints.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (Number(text) !== value) setText(String(value));
  }

  function change(next: string) {
    const digits = next.replace(/\D/g, '');
    setText(digits);
    if (digits && Number(digits) >= min && Number(digits) <= max) onChange(Number(digits));
  }

  return (
    <TextInput
      value={text}
      onChangeText={change}
      onEndEditing={() => setText(String(value))}
      keyboardType="number-pad"
      maxLength={String(max).length}
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      style={[style, styles.numberInput]}
    />
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
  repeatToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  repeatBox: {
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  numberHint: {
    flex: 1,
  },
  numberInput: {
    minWidth: 56,
    textAlign: 'center',
    marginBottom: 0,
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
