/**
 * Stockage local des écrans de terrain (spec 074, ADR-0026) : une file d'opérations en attente
 * et le dernier instantané, dans IndexedDB. L'interface `KeyValueStore` permet de tester la file
 * sans navigateur (`memoryStore`).
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

const DB_NAME = "koinonia-offline";
const STORE = "kv";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode: IDBTransactionMode) {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Magasin IndexedDB (navigateur). */
export const idbStore: KeyValueStore = {
  async get<T>(key: string) {
    return (await request((await tx("readonly")).get(key))) as T | undefined;
  },
  async set<T>(key: string, value: T) {
    await request((await tx("readwrite")).put(value, key));
  },
  async delete(key: string) {
    await request((await tx("readwrite")).delete(key));
  },
  async keys(prefix: string) {
    const all = (await request((await tx("readonly")).getAllKeys())) as IDBValidKey[];
    return all.map(String).filter((k) => k.startsWith(prefix));
  },
};

/** Magasin en mémoire (tests, navigateur sans IndexedDB). */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return map.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    },
    async keys(prefix: string) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

export function defaultStore(): KeyValueStore {
  return typeof indexedDB === "undefined" ? memoryStore() : idbStore;
}

/** File d'opérations d'un écran (`scope` = événement et écran), dans l'ordre d'ajout. */
export function opQueue<T extends { id: string }>(store: KeyValueStore, scope: string) {
  const prefix = `ops:${scope}:`;
  let seq = 0;
  return {
    async push(op: T) {
      seq = (seq + 1) % 1000;
      await store.set(`${prefix}${Date.now().toString().padStart(15, "0")}${String(seq).padStart(3, "0")}:${op.id}`, op);
    },
    async pending(): Promise<T[]> {
      const keys = (await store.keys(prefix)).sort();
      const ops: (T | undefined)[] = await Promise.all(keys.map((k) => store.get<T>(k)));
      return ops.filter((o): o is T => o !== undefined);
    },
    async remove(ids: string[]) {
      const wanted = new Set(ids);
      const keys = await store.keys(prefix);
      await Promise.all(keys.filter((k) => wanted.has(k.slice(k.lastIndexOf(":") + 1))).map((k) => store.delete(k)));
    },
    async count() {
      return (await store.keys(prefix)).length;
    },
  };
}

/** Identifiant stable de l'appareil (créé au premier usage). */
export async function deviceId(store: KeyValueStore): Promise<string> {
  const existing = await store.get<string>("device");
  if (existing) return existing;
  const id = globalThis.crypto.randomUUID();
  await store.set("device", id);
  return id;
}
