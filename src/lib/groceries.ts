import type { SQLiteDatabase } from 'expo-sqlite';

export type Grocery = {
  id: number;
  item: string;
  quantity: number;
  position: number;
};

export function listGroceries(db: SQLiteDatabase) {
  return db.getAllAsync<Grocery>('SELECT * FROM groceries ORDER BY position');
}

export function getGrocery(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Grocery>('SELECT * FROM groceries WHERE id = ?', id);
}

/** Adds a blank item with quantity 1 at the end of the list and returns its id. */
export async function createGrocery(db: SQLiteDatabase) {
  const result = await db.runAsync(
    "INSERT INTO groceries (item, position) SELECT '', COALESCE(MAX(position) + 1, 0) FROM groceries",
  );
  return result.lastInsertRowId;
}

export function renameGrocery(db: SQLiteDatabase, id: number, item: string) {
  return db.runAsync('UPDATE groceries SET item = ? WHERE id = ?', item, id);
}

export function setGroceryQuantity(db: SQLiteDatabase, id: number, quantity: number) {
  return db.runAsync('UPDATE groceries SET quantity = ? WHERE id = ?', quantity, id);
}

export function deleteGroceries(db: SQLiteDatabase, ids: number[]) {
  const placeholders = ids.map(() => '?').join(', ');
  return db.runAsync(`DELETE FROM groceries WHERE id IN (${placeholders})`, ...ids);
}

/**
 * Removes items left without a name, so backing out of "new item" leaves no trace.
 * Only call it while no editor is open, or it would delete the item being written.
 */
export function deleteEmptyGroceries(db: SQLiteDatabase) {
  return db.runAsync("DELETE FROM groceries WHERE trim(item) = ''");
}
