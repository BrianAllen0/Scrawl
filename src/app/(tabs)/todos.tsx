import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { memo, useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import ReorderableList, {
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';

import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { SelectionActions } from '@/components/selection-actions';
import { ThemedText } from '@/components/themed-text';
import { REORDER_AUTOSCROLL } from '@/constants/reorder';
import { Spacing } from '@/constants/theme';
import { useSelection } from '@/hooks/use-selection';
import { useTheme } from '@/hooks/use-theme';
import { describeDue } from '@/lib/dates';
import { saveOrder } from '@/lib/db';
import { applyDrop, buildRows } from '@/lib/todo-sections';
import {
  createTodo,
  deleteEmptyTodos,
  deleteTodos,
  describeRepeat,
  listTodos,
  reopenRepeatingTodos,
  setTodoCompleted,
  updateTodo,
  type Todo,
} from '@/lib/todos';

const COLLAPSED_KEY = 'todos.collapsedCategories';
const COMPLETED_EXPANDED_KEY = 'todos.completedExpanded';
/** Section key for Completed; contains a NUL so it can't collide with a typed category. */
const COMPLETED_SECTION = '\u0000completed';
/** How long a ticked todo stays in place, checked, before moving to Completed. */
const COMPLETE_DELAY_MS = 350;

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(Storage.getItemSync(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export default function TodosScreen() {
  const db = useSQLiteContext();
  const [todos, setTodos] = useState<Todo[]>([]);
  // Collapsed categories survive restarts; read synchronously so sections don't flash open.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Completed starts collapsed, like Google Tasks; opening it is remembered.
  const [completedCollapsed, setCompletedCollapsed] = useState(
    () => Storage.getItemSync(COMPLETED_EXPANDED_KEY) !== 'true',
  );
  // Todos just ticked: shown checked in place for a moment before they move to Completed.
  const [completing, setCompleting] = useState<Set<number>>(new Set());
  const { selected, selecting, toggle: toggleSelected, clear: clearSelection } = useSelection();
  const rows = buildRows(todos, collapsed, completedCollapsed);

  // Repeating todos whose interval has passed go back to their category before every load.
  const reload = useCallback(
    () =>
      reopenRepeatingTodos(db)
        .then(() => listTodos(db))
        .then(setTodos),
    [db],
  );

  // Reload whenever the tab regains focus, e.g. coming back from the editor. No editor is open
  // at that point, so it's also the safe moment to drop todos that were created but left blank.
  useFocusEffect(
    useCallback(() => {
      deleteEmptyTodos(db).then(reload);
    }, [db, reload]),
  );

  // Also on returning to the app, which doesn't refocus the tab: a daily todo is due again overnight.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && reload());
    return () => subscription.remove();
  }, [reload]);

  // And at midnight while the app stays open here, since a repeat comes due when the date changes.
  // A second past it, so a timer firing a touch early still sees the new date.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        reload();
        schedule();
      }, midnight.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reload]);

  async function addTodo() {
    const id = await createTodo(db);
    router.push(`/todo/${id}`);
  }

  const open = useCallback((id: number) => router.push(`/todo/${id}`), []);

  // Instant on purpose: the reorder list renders its own cells, so LayoutAnimation doesn't reach
  // them, and fading rows in would also replay on every drop, when the list rebuilds moved rows.
  const updateCollapsed = useCallback((change: (next: Set<string>) => void) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      change(next);
      Storage.setItemSync(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleSection = useCallback(
    (key: string) => {
      if (key === COMPLETED_SECTION) {
        setCompletedCollapsed((prev) => {
          Storage.setItemSync(COMPLETED_EXPANDED_KEY, String(prev));
          return !prev;
        });
        return;
      }
      updateCollapsed((next) => {
        if (!next.delete(key)) next.add(key);
      });
    },
    [updateCollapsed],
  );

  const toggleDone = useCallback(
    (id: number, done: boolean) => {
      const completedAt = done ? new Date().toISOString() : null;
      setTodoCompleted(db, id, completedAt);
      const apply = () => setTodos((list) => list.map((t) => (t.id === id ? { ...t, completed_at: completedAt } : t)));
      if (!done) return apply(); // reopening moves it back right away
      setCompleting((prev) => new Set(prev).add(id));
      setTimeout(() => {
        apply();
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, COMPLETE_DELAY_MS);
    },
    [db],
  );

  // A drop reorders within a section, or moves the todo into the section it was dropped in.
  function reorder({ from, to }: ReorderableListReorderEvent) {
    const { todos: next, recategorized } = applyDrop(rows, from, to, todos);
    setTodos(next);
    if (recategorized) {
      updateTodo(db, recategorized.id, recategorized);
      // Dropped just under a collapsed header: open that section so the todo doesn't vanish.
      updateCollapsed((next) => next.delete(recategorized.category));
    }
    saveOrder(
      db,
      'todos',
      next.map((t) => t.id),
    );
  }

  function deleteSelected() {
    setTodos((list) => list.filter((t) => !selected.has(t.id)));
    deleteTodos(db, [...selected]);
    clearSelection();
  }

  return (
    <Screen
      title={selecting ? `${selected.size} selected` : 'Todos'}
      actions={
        selecting ? (
          <SelectionActions
            count={selected.size}
            noun={['todo', 'todos']}
            onCancel={clearSelection}
            onDelete={deleteSelected}
          />
        ) : (
          <IconButton icon="add" label="New todo" onPress={addTodo} />
        )
      }>
      {/* One list with the category headers as rows (not a list per category): it scrolls from
          anywhere, stays virtualized, and lets a todo be dragged into another category. */}
      <ReorderableList
        data={rows}
        onReorder={reorder}
        dragEnabled={!selecting}
        {...REORDER_AUTOSCROLL}
        keyExtractor={(row) =>
          row.type === 'header' ? `header:${row.category}` : row.type === 'completed-header' ? 'completed' : String(row.todo.id)
        }
        // Rows re-render when selection or the just-ticked set changes, not only when the data does.
        extraData={[selected, completing]}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Nothing to do. Tap + to add a todo.
          </ThemedText>
        }
        // Handlers take ids, so a row's props only change with its own data or the selection, and
        // the memoized rows skip the rest on every reorder.
        renderItem={({ item }) =>
          item.type === 'todo' ? (
            <TodoRow
              todo={item.todo}
              checked={item.todo.completed_at !== null || completing.has(item.todo.id)}
              selecting={selecting}
              selected={selected.has(item.todo.id)}
              onOpen={open}
              onToggleSelected={toggleSelected}
              onToggleDone={toggleDone}
            />
          ) : (
            <SectionHeader
              sectionKey={item.type === 'header' ? item.category : COMPLETED_SECTION}
              count={item.count}
              collapsed={item.collapsed}
              onToggle={toggleSection}
            />
          )
        }
      />
    </Screen>
  );
}

type HeaderProps = {
  /** A category, or COMPLETED_SECTION. */
  sectionKey: string;
  count: number;
  collapsed: boolean;
  onToggle: (sectionKey: string) => void;
};

const SectionHeader = memo(function SectionHeader({ sectionKey, count, collapsed, onToggle }: HeaderProps) {
  const theme = useTheme();
  const name = sectionKey === COMPLETED_SECTION ? 'Completed' : sectionKey || 'No category';
  return (
    <Pressable
      onPress={() => onToggle(sectionKey)}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={`${name}, ${count} ${count === 1 ? 'todo' : 'todos'}`}
      style={styles.header}>
      <MaterialIcons name={collapsed ? 'chevron-right' : 'expand-more'} size={24} color={theme.textSecondary} />
      <ThemedText type="smallBold" style={styles.headerName}>
        {name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {count}
      </ThemedText>
    </Pressable>
  );
});

type RowProps = {
  todo: Todo;
  /** Done, or just ticked and about to move to Completed. */
  checked: boolean;
  selecting: boolean;
  selected: boolean;
  onOpen: (id: number) => void;
  onToggleSelected: (id: number) => void;
  onToggleDone: (id: number, done: boolean) => void;
};

/**
 * One todo: a done checkbox, the task, due date (red when overdue) and the first line of the
 * description; the section header shows the category, except in Completed, where the row does.
 * Tap to edit, drag the handle to reorder (open todos only), long press to start selecting.
 */
const TodoRow = memo(function TodoRow({
  todo,
  checked,
  selecting,
  selected,
  onOpen,
  onToggleSelected,
  onToggleDone,
}: RowProps) {
  const theme = useTheme();
  const drag = useReorderableDrag();
  const toggle = () => onToggleSelected(todo.id);
  const completed = todo.completed_at !== null;
  const due = todo.due_date ? describeDue(todo.due_date) : null;
  const dueColor = checked
    ? theme.textSecondary
    : due?.status === 'overdue'
      ? theme.danger
      : due?.status === 'today'
        ? theme.accent
        : theme.textSecondary;

  return (
    <Pressable
      onPress={selecting ? toggle : () => onOpen(todo.id)}
      // Keep onLongPress set in both modes: Pressable only skips the tap on release if it still has a
      // long-press handler then, and the long press that starts selecting has re-rendered this row.
      onLongPress={toggle}
      accessibilityState={selecting ? { selected } : undefined}
      accessibilityLabel={todo.task || 'Untitled todo'}
      style={[
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: selected ? theme.accent : 'transparent' },
      ]}>
      {selecting ? (
        <MaterialIcons
          name={selected ? 'check-box' : 'check-box-outline-blank'}
          size={26}
          color={selected ? theme.accent : theme.textSecondary}
        />
      ) : (
        <IconButton
          icon={checked ? 'check-circle' : 'radio-button-unchecked'}
          label={checked ? `Mark ${todo.task || 'todo'} as not done` : `Mark ${todo.task || 'todo'} as done`}
          color={checked ? theme.textSecondary : theme.accent}
          onPress={() => onToggleDone(todo.id, !checked)}
        />
      )}
      <View style={styles.body}>
        <ThemedText
          type="smallBold"
          style={[styles.task, checked && styles.checkedTask]}
          themeColor={checked ? 'textSecondary' : 'text'}
          numberOfLines={2}>
          {todo.task || 'Untitled todo'}
        </ThemedText>
        {(due || todo.repeat_unit !== null || (completed && !!todo.category)) && (
          <View style={styles.meta}>
            {due && (
              <View style={styles.due}>
                <MaterialIcons name="event" size={14} color={dueColor} />
                <ThemedText type="small" style={{ color: dueColor }}>
                  {due.label}
                </ThemedText>
              </View>
            )}
            {todo.repeat_every !== null && todo.repeat_unit !== null && (
              <View style={styles.due}>
                <MaterialIcons name="repeat" size={14} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  {describeRepeat(todo.repeat_every, todo.repeat_unit, todo.repeats_left, todo.repeat_day)}
                </ThemedText>
              </View>
            )}
            {/* Completed todos sit outside their category's section, so name it here. */}
            {completed && !!todo.category && (
              <ThemedText type="small" themeColor="textSecondary">
                {todo.category}
              </ThemedText>
            )}
          </View>
        )}
        {!!todo.description && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {todo.description}
          </ThemedText>
        )}
      </View>
      {!selecting && !completed && (
        <Pressable
          // Start dragging as soon as the handle is touched; no long press needed.
          onPressIn={drag}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel={`Reorder ${todo.task || 'todo'}`}
          style={styles.handle}>
          <MaterialIcons name="drag-indicator" size={22} color={theme.textSecondary} />
        </Pressable>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    // Spacing is a margin on each row, not `gap` on the list: the reorder library measures rows to
    // slide them aside during a drag, and a list-level gap isn't part of that measurement.
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    // Less on the left: the done checkbox brings its own touch padding.
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Spacing.three,
    // Always 2px so selecting a todo doesn't shift its layout, only recolors the border.
    borderWidth: 2,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  task: {
    fontSize: 16,
    lineHeight: 22,
  },
  checkedTask: {
    textDecorationLine: 'line-through',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  headerName: {
    flex: 1,
    fontSize: 16,
  },
  handle: {
    paddingVertical: Spacing.two,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
