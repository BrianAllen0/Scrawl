import type { SQLiteDatabase } from 'expo-sqlite';

export type Note = {
  id: number;
  title: string;
  body: string;
  position: number;
};

export function listNotes(db: SQLiteDatabase) {
  return db.getAllAsync<Note>('SELECT * FROM notes ORDER BY position');
}

export function getNote(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Note>('SELECT * FROM notes WHERE id = ?', id);
}

/** Adds an empty note at the end of the list and returns its id. */
export async function createNote(db: SQLiteDatabase) {
  const result = await db.runAsync(
    'INSERT INTO notes (position) SELECT COALESCE(MAX(position) + 1, 0) FROM notes',
  );
  return result.lastInsertRowId;
}

export function updateNote(db: SQLiteDatabase, id: number, fields: Pick<Note, 'title' | 'body'>) {
  return db.runAsync('UPDATE notes SET title = ?, body = ? WHERE id = ?', fields.title, fields.body, id);
}

export function deleteNotes(db: SQLiteDatabase, ids: number[]) {
  const placeholders = ids.map(() => '?').join(', ');
  return db.runAsync(`DELETE FROM notes WHERE id IN (${placeholders})`, ...ids);
}

/**
 * Removes notes nothing was ever typed into, so backing out of "new note" leaves no trace.
 * Only call it while no editor is open, or it would delete the note being written.
 */
export function deleteEmptyNotes(db: SQLiteDatabase) {
  return db.runAsync("DELETE FROM notes WHERE title = '' AND body = ''");
}
