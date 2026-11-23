// expo-sqlite 持久层：收藏、设置、目录刷新缓存。
import * as SQLite from 'expo-sqlite';
import type { StationRow } from '../core/snapshot.ts';

export type FavoriteEntry = StationRow;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync('roamradio.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS favorites (
          id TEXT PRIMARY KEY NOT NULL,
          added INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS directory_cache (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          built_at TEXT NOT NULL,
          json TEXT NOT NULL,
          updated INTEGER NOT NULL
        );
      `);
      return d;
    })();
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

export async function listFavorites(): Promise<FavoriteEntry[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ json: string }>('SELECT json FROM favorites ORDER BY added DESC');
  const out: FavoriteEntry[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.json));
    } catch {
      /* 跳过坏行 */
    }
  }
  return out;
}

export async function addFavorite(row: FavoriteEntry): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT OR REPLACE INTO favorites (id, json) VALUES (?, ?)',
    row.id,
    JSON.stringify(row),
  );
}

export async function removeFavorite(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM favorites WHERE id = ?', id);
}

export async function getSetting(key: string): Promise<string | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

export async function getDirectoryCache(): Promise<{ builtAt: string; json: string } | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ built_at: string; json: string }>('SELECT built_at, json FROM directory_cache WHERE id = 1');
  return r ? { builtAt: r.built_at, json: r.json } : null;
}

export async function putDirectoryCache(builtAt: string, json: string): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT OR REPLACE INTO directory_cache (id, built_at, json, updated) VALUES (1, ?, ?, strftime(\'%s\',\'now\'))',
    builtAt,
    json,
  );
}
