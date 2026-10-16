import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from './dates';
import { nextRepeat } from './repeat';

export type RepeatUnit = 'day' | 'week' | 'month';

export type Todo = {
  id: number;
  task: string;
  /** Local calendar date as YYYY-MM-DD, or null for no due date. */
  due_date: string | null;
  category: string;
  description: string;
  position: number;
  /** When the todo was marked done (ISO 8601), or null while it's open. */
  completed_at: string | null;
  /** Reopen this many units after completion; both null when the todo doesn't repeat. */
  repeat_every: number | null;
  repeat_unit: RepeatUnit | null;
  /** How many more times it reopens, counting down; null repeats forever. */
  repeats_left: number | null;
  /** Day of the month (1–31) a monthly repeat lands on; null for other units. */
  repeat_day: number | null;
};

export type TodoFields = Pick<
  Todo,
  'task' | 'due_date' | 'category' | 'description' | 'repeat_every' | 'repeat_unit' | 'repeats_left' | 'repeat_day'
>;

/** "Every day", "Every 2 weeks, 3 more", "Every month on day 31". */
export function describeRepeat(every: number, unit: RepeatUnit, left: number | null, day: number | null) {
  const interval = (every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`) + (day ? ` on day ${day}` : '');
  return left === null ? interval : `${interval}, ${left} more`;
}

export function listTodos(db: SQLiteDatabase) {
  return db.getAllAsync<Todo>('SELECT * FROM todos ORDER BY position');
}

export function getTodo(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Todo>('SELECT * FROM todos WHERE id = ?', id);
}

/** Adds an empty todo at the end of the list and returns its id. */
export async function createTodo(db: SQLiteDatabase) {
  const result = await db.runAsync(
    "INSERT INTO todos (task, position) SELECT '', COALESCE(MAX(position) + 1, 0) FROM todos",
  );
  return result.lastInsertRowId;
}

export function updateTodo(db: SQLiteDatabase, id: number, f: TodoFields) {
  return db.runAsync(
    `UPDATE todos SET task = ?, due_date = ?, category = ?, description = ?, repeat_every = ?, repeat_unit = ?,
      repeats_left = ?, repeat_day = ? WHERE id = ?`,
    f.task,
    f.due_date,
    f.category,
    f.description,
    f.repeat_every,
    f.repeat_unit,
    f.repeats_left,
    f.repeat_day,
    id,
  );
}

/**
 * Reopens completed repeating todos that are due again (see nextRepeat), moving the due date on and
 * using up one remaining repeat (NULL - 1 stays NULL, so unlimited ones never run out).
 */
export async function reopenRepeatingTodos(db: SQLiteDatabase) {
  const today = toISODate(new Date());
  const done = await db.getAllAsync<Todo>(
    'SELECT * FROM todos WHERE completed_at IS NOT NULL AND repeat_every IS NOT NULL AND (repeats_left IS NULL OR repeats_left > 0)',
  );
  const due = done.flatMap((todo) => {
    if (todo.completed_at === null || todo.repeat_every === null || todo.repeat_unit === null) return [];
    const next = nextRepeat(
      {
        dueDate: todo.due_date,
        doneOn: toISODate(new Date(todo.completed_at)),
        every: todo.repeat_every,
        unit: todo.repeat_unit,
        day: todo.repeat_day,
      },
      today,
    );
    return next.reopenOn <= today ? [{ id: todo.id, dueDate: next.dueDate }] : [];
  });
  if (due.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const { id, dueDate } of due) {
      await db.runAsync(
        'UPDATE todos SET completed_at = NULL, repeats_left = repeats_left - 1, due_date = ? WHERE id = ?',
        dueDate,
        id,
      );
    }
  });
}

export function setTodoCompleted(db: SQLiteDatabase, id: number, completedAt: string | null) {
  return db.runAsync('UPDATE todos SET completed_at = ? WHERE id = ?', completedAt, id);
}

export function deleteTodos(db: SQLiteDatabase, ids: number[]) {
  const placeholders = ids.map(() => '?').join(', ');
  return db.runAsync(`DELETE FROM todos WHERE id IN (${placeholders})`, ...ids);
}

/**
 * Removes todos nothing was ever entered into, so backing out of "new todo" leaves no trace.
 * Only call it while no editor is open, or it would delete the todo being written.
 */
export function deleteEmptyTodos(db: SQLiteDatabase) {
  return db.runAsync(
    "DELETE FROM todos WHERE task = '' AND description = '' AND category = '' AND due_date IS NULL",
  );
}

/** Categories already in use, most used first, offered as one-tap picks in the editor. */
export async function listCategories(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ category: string }>(
    "SELECT category FROM todos WHERE category != '' GROUP BY category ORDER BY COUNT(*) DESC, category",
  );
  return rows.map((r) => r.category);
}
