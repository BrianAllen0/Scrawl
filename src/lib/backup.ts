import type { SQLiteDatabase } from 'expo-sqlite';

import type { OrderedTable } from './db';

/**
 * A backup is every row of every table as JSON. Restoring replaces everything on the device.
 * Columns are listed here rather than read from the file, so a backup can only ever write to
 * known columns, and one from an older schema just leaves newer columns at their defaults.
 */
const COLUMNS: Record<OrderedTable, readonly string[]> = {
  notes: ['id', 'title', 'body', 'position'],
  groceries: ['id', 'item', 'quantity', 'position'],
  todos: ['id', 'task', 'due_date', 'category', 'description', 'position', 'completed_at', 'repeat_every', 'repeat_unit', 'repeats_left', 'repeat_day'],
};
const TABLES = Object.keys(COLUMNS) as OrderedTable[];

type Row = Record<string, string | number | null>;

export type Backup = {
  app: 'scrawl';
  schemaVersion: number;
  exportedAt: string;
} & Record<OrderedTable, Row[]>;

async function schemaVersion(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export async function exportBackup(db: SQLiteDatabase): Promise<Backup> {
  const rows = (table: OrderedTable) => db.getAllAsync<Row>(`SELECT * FROM ${table} ORDER BY position`);
  return {
    app: 'scrawl',
    schemaVersion: await schemaVersion(db),
    exportedAt: new Date().toISOString(),
    notes: await rows('notes'),
    groceries: await rows('groceries'),
    todos: await rows('todos'),
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks that `text` is a Scrawl backup this version of the app can restore, keeping only known
 * columns. Throws an Error whose message can be shown to the user.
 */
export function parseBackup(text: string, currentSchemaVersion: number): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a Scrawl backup.");
  }
  if (!isPlainObject(data) || data.app !== 'scrawl' || typeof data.schemaVersion !== 'number') {
    throw new Error("This file isn't a Scrawl backup.");
  }
  if (data.schemaVersion > currentSchemaVersion) {
    throw new Error('This backup is from a newer version of Scrawl. Update the app, then try again.');
  }

  const backup = { app: 'scrawl', schemaVersion: data.schemaVersion, exportedAt: String(data.exportedAt ?? '') };
  for (const table of TABLES) {
    const rows = data[table] ?? [];
    if (!Array.isArray(rows) || !rows.every(isPlainObject)) throw new Error('This backup is damaged.');
    (backup as Record<string, unknown>)[table] = rows.map((row) => {
      const kept: Row = {};
      for (const column of COLUMNS[table]) {
        const value = row[column];
        if (value === undefined) continue;
        if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
          throw new Error('This backup is damaged.');
        }
        kept[column] = value;
      }
      return kept;
    });
  }
  return backup as Backup;
}

/** Validates `text` against this database's schema; see parseBackup. */
export async function readBackup(db: SQLiteDatabase, text: string) {
  return parseBackup(text, await schemaVersion(db));
}

/** Replaces every note, grocery and todo with the backup's, all or nothing. */
export async function restoreBackup(db: SQLiteDatabase, backup: Backup) {
  await db.withTransactionAsync(async () => {
    for (const table of TABLES) {
      await db.runAsync(`DELETE FROM ${table}`);
      for (const row of backup[table]) {
        // Column names come from COLUMNS (via parseBackup), never from the file's own keys.
        const columns = Object.keys(row);
        await db.runAsync(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          ...columns.map((c) => row[c]),
        );
      }
    }
  });
}
