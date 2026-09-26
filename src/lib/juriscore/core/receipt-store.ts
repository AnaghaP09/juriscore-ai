import {
  persistedReceiptSchema,
  type PersistedReceipt,
  type ValidationModule,
  type ValidatorVerdict,
} from "./contracts";
import { toPersistedReceipt } from "./receipts";

/**
 * Browser-local receipt history. It holds persisted receipts only — the allowlisted
 * projection, never sanitized text, documents, or finding values — and keeps the latest
 * `RECEIPT_HISTORY_LIMIT`. This is a convenience history, not an audit record.
 *
 * When IndexedDB is unavailable or fails, the store keeps working in memory and reports
 * that history is not being saved. It never throws into a check.
 */

export const RECEIPT_HISTORY_LIMIT = 200;
export const RECEIPT_DB_NAME = "juriscore";
export const RECEIPT_DB_VERSION = 1;
const RECEIPTS = "receipts";
const SETTINGS = "settings";
const CHANNEL = "juriscore.receipts";

export interface ReceiptFilter {
  module?: ValidationModule | "all";
  verdict?: ValidatorVerdict | "all";
  /** Case-insensitive match against id, module, and policy version. */
  q?: string;
  /** Keep receipts whose policies include this domain; needs `domainOf`. */
  domain?: string | "all";
  /** Derives a receipt's domains from its policy version (see `receipt-domains.ts`). */
  domainOf?: (receipt: PersistedReceipt) => string[];
}

export type ReceiptQuery = ReceiptFilter & { offset?: number; limit?: number };

export interface ReceiptPage {
  items: PersistedReceipt[];
  total: number;
}

export interface AddReceiptResult {
  receipt: PersistedReceipt;
  /** How many of the oldest receipts were dropped to stay within the limit. */
  trimmed: number;
}

export interface ReceiptStoreStatus {
  persistent: boolean;
  /** Set when history is being kept in memory only. */
  note: string | null;
}

export type ReceiptStoreEvent =
  | { type: "added"; id: string; trimmed: number }
  | { type: "cleared" }
  | { type: "status" };

/**
 * What clearing did. `deleted`: the saved history was deleted and the deletion committed.
 * `memory-cleared`: only this tab's temporary history was cleared; `persistedRemain` says
 * receipts saved earlier in this browser could not be reached and were not deleted.
 * `failed`: the saved history could not be deleted and is unchanged.
 */
export type ClearReceiptsResult =
  | { status: "deleted" }
  | { status: "memory-cleared"; persistedRemain: boolean }
  | { status: "failed"; reason: string };

export interface ReceiptStore {
  addReceipt(receipt: unknown): Promise<AddReceiptResult>;
  listReceipts(query?: ReceiptQuery): Promise<ReceiptPage>;
  countReceipts(filter?: ReceiptFilter): Promise<number>;
  /** Whether a receipt with this id is still in the history (not trimmed or cleared). */
  hasReceipt(id: string): Promise<boolean>;
  exportReceipts(filter?: ReceiptFilter): Promise<PersistedReceipt[]>;
  clearReceipts(): Promise<ClearReceiptsResult>;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;
  status(): ReceiptStoreStatus;
  onChange(listener: (event: ReceiptStoreEvent) => void): () => void;
}

/** Both receipt history (IndexedDB) and settings (localStorage) are unavailable. */
export const HISTORY_NOT_SAVED_NOTE =
  "History not saved in this browser: browser storage is unavailable, so receipts and settings last only until this tab closes.";

/** Receipt history (IndexedDB) is unavailable; settings are still saved. */
export const RECEIPTS_NOT_SAVED_NOTE =
  "Receipt history not saved in this browser: IndexedDB is unavailable, so receipts listed here last only until this tab closes. Settings are still saved.";

/** Settings (localStorage) are unavailable; receipt history is still saved. */
export const SETTINGS_NOT_SAVED_NOTE =
  "Settings not saved in this browser: local storage is unavailable, so policies, metrics, and loaded sources last only until this tab closes. Receipt history is still saved.";

const FOLDER_STILL_SAVED = " New receipts are still written to the folder you chose.";

/**
 * The one storage notice, naming what failed. It never says receipts are temporary while
 * receipt history is still saved, and says so when the receipt folder still gets copies.
 */
export function storageNote(state: {
  receiptsFailed: boolean;
  settingsFailed: boolean;
  folderActive?: boolean;
}): string | null {
  const folder = state.folderActive ? FOLDER_STILL_SAVED : "";
  if (state.receiptsFailed && state.settingsFailed) return HISTORY_NOT_SAVED_NOTE + folder;
  if (state.receiptsFailed) return RECEIPTS_NOT_SAVED_NOTE + folder;
  if (state.settingsFailed) return SETTINGS_NOT_SAVED_NOTE;
  return null;
}

/**
 * Keeps a page offset inside the current total: an offset past the end (after receipts
 * were cleared or trimmed, here or in another tab) moves to the last page that has rows.
 */
export function clampPageOffset(offset: number, total: number, pageSize: number) {
  if (total <= 0 || pageSize <= 0) return 0;
  const lastPage = Math.floor((total - 1) / pageSize) * pageSize;
  return Math.min(Math.max(0, offset), lastPage);
}

export interface ReceiptStoreOptions {
  /** Defaults to `globalThis.indexedDB`. Pass `null` to force the in-memory store. */
  indexedDB?: IDBFactory | null;
  limit?: number;
  /** Notify other tabs through BroadcastChannel. Defaults to true where available. */
  broadcast?: boolean;
}

function newestFirst(a: PersistedReceipt, b: PersistedReceipt) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function matchesReceiptFilter(receipt: PersistedReceipt, filter: ReceiptFilter = {}) {
  if (filter.module && filter.module !== "all" && receipt.module !== filter.module) return false;
  if (filter.verdict && filter.verdict !== "all" && receipt.verdict !== filter.verdict) {
    return false;
  }
  if (filter.domain && filter.domain !== "all" && filter.domainOf) {
    if (!filter.domainOf(receipt).includes(filter.domain)) return false;
  }
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    const haystack = `${receipt.id}\n${receipt.module}\n${receipt.policyVersion}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."));
  });
  // Awaited by the caller on the success path; a failed request is handled there.
  done.catch(() => undefined);
  return done;
}

function openDatabase(factory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(RECEIPT_DB_NAME, RECEIPT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECEIPTS)) {
        const receipts = db.createObjectStore(RECEIPTS, { keyPath: "id" });
        receipts.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked."));
  });
}

// Reading `indexedDB` itself can throw where storage is blocked.
function resolveFactory(option: IDBFactory | null | undefined): IDBFactory | null {
  try {
    return (option === undefined ? globalThis.indexedDB : option) ?? null;
  } catch {
    return null;
  }
}

/** Oldest receipts beyond the limit, given every stored receipt. */
function overflow(all: PersistedReceipt[], limit: number) {
  return [...all].sort(newestFirst).slice(limit);
}

export function createReceiptStore(options: ReceiptStoreOptions = {}): ReceiptStore {
  const limit = options.limit ?? RECEIPT_HISTORY_LIMIT;
  const listeners = new Set<(event: ReceiptStoreEvent) => void>();
  // A bounded, validated snapshot of what IndexedDB last returned or committed. While
  // storage works it mirrors the saved history; if storage later fails, the store carries
  // on from it instead of dropping receipts that were already shown.
  let memory: PersistedReceipt[] = [];
  const memorySettings = new Map<string, unknown>();
  let persistent = true;
  // Set once IndexedDB has been opened: receipts may then exist that memory cannot delete.
  let everPersisted = false;
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  let channel: BroadcastChannel | null = null;
  if (options.broadcast !== false && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (message: MessageEvent<ReceiptStoreEvent>) => {
        for (const listener of listeners) listener(message.data);
      };
    } catch {
      channel = null;
    }
  }

  const emit = (event: ReceiptStoreEvent, local = false) => {
    for (const listener of listeners) listener(event);
    if (local || !persistent) return;
    try {
      channel?.postMessage(event);
    } catch {
      // Other tabs refresh on their next read.
    }
  };

  const degrade = () => {
    if (!persistent) return;
    persistent = false;
    dbPromise = Promise.resolve(null);
    emit({ type: "status" }, true);
  };

  const database = () => {
    if (dbPromise) return dbPromise;
    const factory = resolveFactory(options.indexedDB);
    if (!factory) {
      degrade();
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = (async () => {
      try {
        const db = await openDatabase(factory);
        everPersisted = true;
        return db;
      } catch {
        degrade();
        return null;
      }
    })();
    return dbPromise;
  };

  const readAll = async (): Promise<PersistedReceipt[]> => {
    const db = await database();
    if (db) {
      try {
        const transaction = db.transaction(RECEIPTS, "readonly");
        const all = await requestResult(
          transaction.objectStore(RECEIPTS).getAll() as IDBRequest<unknown[]>,
        );
        // A record that no longer parses is skipped rather than shown or exported.
        const valid = all
          .flatMap((record) => {
            const parsed = persistedReceiptSchema.safeParse(record);
            return parsed.success ? [parsed.data] : [];
          })
          .sort(newestFirst);
        memory = valid.slice(0, limit);
        return valid;
      } catch {
        degrade();
      }
    }
    return [...memory].sort(newestFirst);
  };

  const matching = async (filter: ReceiptFilter) => {
    const all = await readAll();
    return all.filter((receipt) => matchesReceiptFilter(receipt, filter));
  };

  const addToMemory = (receipt: PersistedReceipt) => {
    const all = [receipt, ...memory.filter((item) => item.id !== receipt.id)];
    const dropped = new Set(overflow(all, limit).map((item) => item.id));
    memory = all.filter((item) => !dropped.has(item.id));
    return dropped.size;
  };

  return {
    async addReceipt(input) {
      // Validation and projection happen before anything is written, and a receipt that
      // fails either is rejected: storage never holds a partial or unlisted record.
      const receipt = toPersistedReceipt(input);
      const db = await database();
      if (db) {
        try {
          const transaction = db.transaction(RECEIPTS, "readwrite");
          const done = transactionDone(transaction);
          const store = transaction.objectStore(RECEIPTS);
          store.put(receipt);
          // Retention runs in the same transaction as the write, so history never holds
          // more than the limit even for a moment.
          const all = await requestResult(store.getAll() as IDBRequest<PersistedReceipt[]>);
          const dropped = overflow(all, limit);
          for (const item of dropped) store.delete(item.id);
          await done;
          // Mirror the committed history (validated, within the limit) for a later fallback.
          const droppedIds = new Set(dropped.map((item) => item.id));
          memory = all
            .filter((item) => !droppedIds.has(item.id))
            .flatMap((record) => {
              const parsed = persistedReceiptSchema.safeParse(record);
              return parsed.success ? [parsed.data] : [];
            })
            .sort(newestFirst)
            .slice(0, limit);
          emit({ type: "added", id: receipt.id, trimmed: dropped.length });
          return { receipt, trimmed: dropped.length };
        } catch {
          // The write did not commit; it joins the snapshot of what was already saved.
          degrade();
        }
      }
      const trimmed = addToMemory(receipt);
      emit({ type: "added", id: receipt.id, trimmed });
      return { receipt, trimmed };
    },

    async listReceipts(filter = {}) {
      const all = await matching(filter);
      const offset = Math.max(0, filter.offset ?? 0);
      const pageSize = Math.max(0, filter.limit ?? all.length);
      return { items: all.slice(offset, offset + pageSize), total: all.length };
    },

    async countReceipts(filter = {}) {
      return (await matching(filter)).length;
    },

    async hasReceipt(id) {
      const db = await database();
      if (db) {
        try {
          const transaction = db.transaction(RECEIPTS, "readonly");
          const record: unknown = await requestResult(transaction.objectStore(RECEIPTS).get(id));
          return persistedReceiptSchema.safeParse(record).success;
        } catch {
          degrade();
        }
      }
      return memory.some((receipt) => receipt.id === id);
    },

    async exportReceipts(filter = {}) {
      const all = await matching(filter);
      return all.map((receipt) => toPersistedReceipt(receipt));
    },

    async clearReceipts(): Promise<ClearReceiptsResult> {
      const db = await database();
      if (db) {
        try {
          const transaction = db.transaction(RECEIPTS, "readwrite");
          const done = transactionDone(transaction);
          transaction.objectStore(RECEIPTS).clear();
          await done;
        } catch (error) {
          // The saved history is unchanged: keep showing it, and let the caller retry.
          // Storage is not marked unavailable here, since reads would then hide receipts
          // that still exist.
          return {
            status: "failed",
            reason:
              error instanceof Error && error.message
                ? error.message
                : "The browser did not delete the saved history.",
          };
        }
        memory = [];
        emit({ type: "cleared" });
        return { status: "deleted" };
      }
      memory = [];
      emit({ type: "cleared" });
      return { status: "memory-cleared", persistedRemain: everPersisted };
    },

    async getSetting<T>(key: string) {
      const db = await database();
      if (db) {
        try {
          const transaction = db.transaction(SETTINGS, "readonly");
          const value: unknown = await requestResult(transaction.objectStore(SETTINGS).get(key));
          if (value === undefined) memorySettings.delete(key);
          else memorySettings.set(key, value);
          return value as T | undefined;
        } catch {
          degrade();
        }
      }
      return memorySettings.get(key) as T | undefined;
    },

    async setSetting(key, value) {
      const db = await database();
      if (db) {
        try {
          const transaction = db.transaction(SETTINGS, "readwrite");
          const done = transactionDone(transaction);
          const store = transaction.objectStore(SETTINGS);
          if (value === undefined) store.delete(key);
          else store.put(value, key);
          await done;
          if (value === undefined) memorySettings.delete(key);
          else memorySettings.set(key, value);
          return;
        } catch {
          degrade();
        }
      }
      if (value === undefined) memorySettings.delete(key);
      else memorySettings.set(key, value);
    },

    status() {
      return { persistent, note: persistent ? null : RECEIPTS_NOT_SAVED_NOTE };
    },

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let sharedStore: ReceiptStore | null = null;

/** The browser's one receipt store. Created on first use, so it is never built on the server. */
export function receiptStore() {
  if (!sharedStore) sharedStore = createReceiptStore();
  return sharedStore;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "id",
  "module",
  "verdict",
  "policyVersion",
  "findingCount",
  "inputDigest",
  "digestVersion",
  "sourceDigest",
  "maturity",
  "createdAt",
] as const;

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV of receipt fields, built from the persisted projection only. With `domainOf`, a
 * derived `domain` column follows `policyVersion`.
 */
export function receiptsToCsv(
  receipts: PersistedReceipt[],
  domainOf?: (receipt: PersistedReceipt) => string[],
) {
  const columns: string[] = [...CSV_COLUMNS];
  if (domainOf) columns.splice(columns.indexOf("policyVersion") + 1, 0, "domain");
  const rows = receipts.map((input) => {
    const receipt = toPersistedReceipt(input);
    const row: Record<string, string> = {
      id: receipt.id,
      module: receipt.module,
      verdict: receipt.verdict,
      policyVersion: receipt.policyVersion,
      findingCount: String(receipt.findingIds.length),
      inputDigest: receipt.inputDigest,
      digestVersion: receipt.digestVersion ?? "",
      sourceDigest: receipt.sourceDigest ?? "",
      maturity: receipt.maturity,
      createdAt: receipt.createdAt,
    };
    if (domainOf) row.domain = domainOf(receipt).join("; ");
    return columns.map((column) => csvCell(row[column] ?? "")).join(",");
  });
  return `${columns.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

export function receiptsToJson(receipts: PersistedReceipt[]) {
  const projected = receipts.map((receipt) => toPersistedReceipt(receipt));
  return JSON.stringify(projected, null, 2);
}
