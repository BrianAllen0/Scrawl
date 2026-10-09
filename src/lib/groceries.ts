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

/** Adds an item with quantity 1 at the end of the list and returns the new row. */
export async function addGrocery(db: SQLiteDatabase, item: string): Promise<Grocery> {
  const result = await db.runAsync(
    'INSERT INTO groceries (item, position) SELECT ?, COALESCE(MAX(position) + 1, 0) FROM groceries',
    item,
  );
  return (await db.getFirstAsync<Grocery>('SELECT * FROM groceries WHERE id = ?', result.lastInsertRowId))!;
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
