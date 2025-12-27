import Database from 'better-sqlite3';
import { SessionStore } from './types';

export interface SQLiteStoreOptions {
  filename: string;
}

export function SQLiteStore(options: SQLiteStoreOptions): SessionStore {
  const db = new Database(options.filename);
  
  // Создаем таблицу для сессий, если её нет
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const getStmt = db.prepare('SELECT value FROM sessions WHERE key = ?');
  const setStmt = db.prepare('INSERT OR REPLACE INTO sessions (key, value) VALUES (?, ?)');
  const deleteStmt = db.prepare('DELETE FROM sessions WHERE key = ?');

  return {
    get(sessionKey: string) {
      const row = getStmt.get(sessionKey) as { value: string } | undefined;
      if (!row) return undefined;
      try {
        return JSON.parse(row.value);
      } catch {
        return undefined;
      }
    },
    set(sessionKey: string, value: any) {
      setStmt.run(sessionKey, JSON.stringify(value));
    },
    delete(sessionKey: string) {
      deleteStmt.run(sessionKey);
    }
  };
}

