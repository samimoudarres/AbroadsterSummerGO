import type { PersistedProjectMeta, PhotoRecord } from './types';

const META_KEY = 'abroadster.postcard.project.v1';
const DB_NAME = 'abroadster-postcard';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
  });
  db.close();
}

export async function idbGetBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error ?? new Error('idb get failed'));
  });
  db.close();
  return blob;
}

export async function idbDeleteBlob(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
  });
  db.close();
}

export async function idbClearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb clear failed'));
  });
  db.close();
}

export function saveProjectMeta(meta: PersistedProjectMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // quota — caller may show a soft warning
  }
}

export function loadProjectMeta(): PersistedProjectMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProjectMeta;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearProjectMeta(): void {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    // ignore
  }
}

export async function hydratePhotoUrls(
  photos: Array<Omit<PhotoRecord, 'objectUrl'>>,
): Promise<PhotoRecord[]> {
  const out: PhotoRecord[] = [];
  for (const p of photos) {
    const blob = await idbGetBlob(p.blobKey);
    if (!blob) continue;
    out.push({ ...p, objectUrl: URL.createObjectURL(blob) });
  }
  return out;
}

export async function wipeLocalProject(): Promise<void> {
  clearProjectMeta();
  try {
    await idbClearAll();
  } catch {
    // ignore
  }
}
