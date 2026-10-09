import type { SQLiteDatabase } from 'expo-sqlite';

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
};

export type TodoFields = Pick<Todo, 'task' | 'due_date' | 'category' | 'description'>;

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
    'UPDATE todos SET task = ?, due_date = ?, category = ?, description = ? WHERE id = ?',
    f.task,
    f.due_date,
    f.category,
    f.description,
    id,
  );
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
