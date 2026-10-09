import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'scrawl.db';

/**
 * Schema migrations, applied in order. The database's `user_version` pragma records how many
 * have run, so to change the schema append a new entry; never edit one that has shipped.
 * Every table has a `position` column holding the user's manual (drag/sort) order.
 */
const MIGRATIONS = [
  `
  CREATE TABLE notes (
    id       INTEGER PRIMARY KEY,
    title    TEXT    NOT NULL DEFAULT '',
    body     TEXT    NOT NULL DEFAULT '',
    position INTEGER NOT NULL
  );
  CREATE TABLE groceries (
    id       INTEGER PRIMARY KEY,
    item     TEXT    NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    position INTEGER NOT NULL
  );
  CREATE TABLE todos (
    id          INTEGER PRIMARY KEY,
    task        TEXT    NOT NULL,
    due_date    TEXT,   -- ISO date (YYYY-MM-DD), NULL when there is no due date
    category    TEXT    NOT NULL DEFAULT '',
    description TEXT    NOT NULL DEFAULT '',
    position    INTEGER NOT NULL
  );
  `,
];

/** Passed to SQLiteProvider's onInit: brings the database up to the latest schema. */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      // PRAGMA doesn't accept bound parameters; version is a loop counter, not user input.
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export type OrderedTable = 'notes' | 'groceries' | 'todos';

/** Saves a manual order: each id's position becomes its index in `ids`. */
export async function saveOrder(db: SQLiteDatabase, table: OrderedTable, ids: number[]) {
  await db.withTransactionAsync(async () => {
    // `table` is one of three fixed names (it can't be a bound parameter), never user input.
    const statement = await db.prepareAsync(`UPDATE ${table} SET position = ? WHERE id = ?`);
    try {
      for (const [position, id] of ids.entries()) await statement.executeAsync(position, id);
    } finally {
      await statement.finalizeAsync();
    }
  });
}
