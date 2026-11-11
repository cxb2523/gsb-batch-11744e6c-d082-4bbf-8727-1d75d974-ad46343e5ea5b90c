/**
 * IndexedDB storage client for StageFlow scores using the `idb` Promise library.
 * Persists user score drafts and custom imported scenes across browser sessions.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StoredScoreRecord {
  id: string;
  title: string;
  subtitle?: string;
  rawYaml: string;
  isCustom: boolean;
  updatedAt: number;
  contentHash?: string;
  originalContentHash?: string;
  sourceUrl?: string;
  sourceFileName?: string;
}

interface StageFlowDbSchema extends DBSchema {
  scores: {
    key: string;
    value: StoredScoreRecord;
    indexes: { 'by-updated': number };
  };
}

const DB_NAME = 'stageflow-db';
const DB_VERSION = 1;
const STORE_NAME = 'scores';

let dbPromise: Promise<IDBPDatabase<StageFlowDbSchema>> | null = null;

export function getScoreDatabase(): Promise<IDBPDatabase<StageFlowDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<StageFlowDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-updated', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function getStoredScore(
  id: string
): Promise<StoredScoreRecord | undefined> {
  try {
    const db = await getScoreDatabase();
    return await db.get(STORE_NAME, id);
  } catch (err) {
    console.warn(`[scoreDb] Failed to read score '${id}' from IndexedDB:`, err);
    return undefined;
  }
}

export async function checkScoreExists(id: string): Promise<boolean> {
  try {
    const db = await getScoreDatabase();
    const count = await db.count(STORE_NAME, id);
    return count > 0;
  } catch (err) {
    console.warn(`[scoreDb] Failed to check existence for '${id}':`, err);
    return false;
  }
}

export async function saveStoredScore(record: StoredScoreRecord): Promise<void> {
  try {
    const db = await getScoreDatabase();
    await db.put(STORE_NAME, record);
  } catch (err) {
    console.warn(
      `[scoreDb] Failed to save score '${record.id}' to IndexedDB:`,
      err
    );
  }
}

export async function deleteStoredScore(id: string): Promise<void> {
  try {
    const db = await getScoreDatabase();
    await db.delete(STORE_NAME, id);
  } catch (err) {
    console.warn(
      `[scoreDb] Failed to delete score '${id}' from IndexedDB:`,
      err
    );
  }
}

export async function listAllStoredScores(): Promise<StoredScoreRecord[]> {
  try {
    const db = await getScoreDatabase();
    return await db.getAll(STORE_NAME);
  } catch (err) {
    console.warn('[scoreDb] Failed to list scores from IndexedDB:', err);
    return [];
  }
}

export async function clearAllStoredScores(): Promise<void> {
  try {
    const db = await getScoreDatabase();
    await db.clear(STORE_NAME);
  } catch (err) {
    console.warn('[scoreDb] Failed to clear scores from IndexedDB:', err);
  }
}
