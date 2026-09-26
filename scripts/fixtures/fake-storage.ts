/**
 * Minimal in-repo fakes for IndexedDB and localStorage, covering exactly the subset the
 * receipt store uses. No dependency: requests resolve on microtasks, a transaction
 * completes on the next macrotask once it has no pending requests, and every value is
 * inspectable through `dump()` so checks can byte-scan what was persisted.
 */

type Listener = (() => void) | null;

class FakeRequest<T = unknown> {
  result: T | undefined = undefined;
  error: Error | null = null;
  onsuccess: Listener = null;
  onerror: Listener = null;
  onupgradeneeded: Listener = null;
  onblocked: Listener = null;
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    // Folder handles and other host objects are kept by reference.
    return value;
  }
}

class FakeObjectStore {
  readonly records = new Map<unknown, unknown>();
  constructor(readonly keyPath: string | null) {}
  createIndex() {
    return {};
  }
}

class FakeDatabase {
  readonly stores = new Map<string, FakeObjectStore>();
  version = 0;

  get objectStoreNames() {
    return { contains: (name: string) => this.stores.has(name) };
  }

  createObjectStore(name: string, options?: { keyPath?: string }) {
    const store = new FakeObjectStore(options?.keyPath ?? null);
    this.stores.set(name, store);
    return store;
  }

  transaction(names: string | string[], _mode?: string) {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      if (!this.stores.has(name)) throw new Error(`No object store named ${name}.`);
    }
    return new FakeTransaction(this);
  }

  close() {}
}

class FakeTransaction {
  oncomplete: Listener = null;
  onerror: Listener = null;
  onabort: Listener = null;
  error: Error | null = null;
  private pending = 0;
  private finished = false;

  constructor(private readonly db: FakeDatabase) {
    this.scheduleCompletion();
  }

  objectStore(name: string) {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`No object store named ${name}.`);
    const run = <T>(operation: () => T) => this.request(operation);
    return {
      put: (value: unknown, key?: unknown) =>
        run(() => {
          const recordKey =
            key ?? (store.keyPath ? (value as Record<string, unknown>)[store.keyPath] : undefined);
          store.records.set(recordKey, cloneValue(value));
          return recordKey;
        }),
      get: (key: unknown) => run(() => cloneValue(store.records.get(key))),
      getAll: () => run(() => [...store.records.values()].map((value) => cloneValue(value))),
      delete: (key: unknown) => run(() => void store.records.delete(key)),
      clear: () => run(() => void store.records.clear()),
    };
  }

  private request<T>(operation: () => T) {
    if (this.finished) throw new Error("The transaction has finished.");
    const request = new FakeRequest<T>();
    this.pending += 1;
    queueMicrotask(() => {
      try {
        request.result = operation();
        request.onsuccess?.();
      } catch (error) {
        request.error = error as Error;
        this.error = request.error;
        request.onerror?.();
        this.onerror?.();
      } finally {
        this.pending -= 1;
        this.scheduleCompletion();
      }
    });
    return request;
  }

  private scheduleCompletion() {
    setTimeout(() => {
      if (this.finished || this.pending > 0 || this.error) return;
      this.finished = true;
      this.oncomplete?.();
    }, 0);
  }
}

export class FakeIndexedDB {
  readonly databases = new Map<string, FakeDatabase>();

  open(name: string, version = 1) {
    const request = new FakeRequest<FakeDatabase>();
    setTimeout(() => {
      let db = this.databases.get(name);
      const upgrade = !db || db.version < version;
      if (!db) {
        db = new FakeDatabase();
        this.databases.set(name, db);
      }
      request.result = db;
      if (upgrade) {
        db.version = version;
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    }, 0);
    return request;
  }

  /** Every persisted value, as JSON, for byte scans. */
  dump() {
    const out: Record<string, Record<string, unknown[]>> = {};
    for (const [dbName, db] of this.databases) {
      out[dbName] = {};
      for (const [storeName, store] of db.stores) {
        out[dbName][storeName] = [...store.records.entries()];
      }
    }
    return JSON.stringify(out);
  }
}

/** Fails the way blocked or private-mode storage does. */
export function failingIndexedDB(mode: "throw-on-open" | "error-on-open" | "throw-on-use") {
  if (mode === "throw-on-open") {
    return {
      open() {
        throw new Error("IndexedDB is disabled.");
      },
    };
  }
  if (mode === "error-on-open") {
    return {
      open() {
        const request = new FakeRequest();
        setTimeout(() => {
          request.error = new Error("Open failed.");
          request.onerror?.();
        }, 0);
        return request;
      },
    };
  }
  // Opens fine, then every transaction throws (quota, eviction, a revoked permission).
  const inner = new FakeIndexedDB();
  const broken = new FakeDatabase();
  broken.transaction = () => {
    throw new Error("Storage became unavailable.");
  };
  inner.databases.set("juriscore", broken);
  return inner;
}

export class FakeLocalStorage {
  readonly entries = new Map<string, string>();
  get length() {
    return this.entries.size;
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, String(value));
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
}

export class ThrowingLocalStorage {
  get length() {
    return 0;
  }
  key(): string | null {
    throw new Error("localStorage is disabled.");
  }
  getItem(): string | null {
    throw new Error("localStorage is disabled.");
  }
  setItem(): void {
    throw new Error("localStorage is disabled.");
  }
  removeItem(): void {
    throw new Error("localStorage is disabled.");
  }
  clear(): void {
    throw new Error("localStorage is disabled.");
  }
}
