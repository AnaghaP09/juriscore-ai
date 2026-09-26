import type { PersistedReceipt, ValidationReceipt } from "./contracts";
import { downloadReceipt, receiptFileName, serializeReceipt } from "./receipts";
import { receiptStore, type ReceiptStore } from "./receipt-store";

/**
 * Optional folder sink for receipts (File System Access API, Chromium only). Receipts
 * only: sanitized text and reports are never written here automatically. Where the API
 * is missing the control is hidden, and any write failure falls back to a download.
 */

const FOLDER_SETTING = "receiptFolder";

type Permission = "granted" | "denied" | "prompt";

interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}

/** The subset of `FileSystemDirectoryHandle` the sink uses. */
export interface ReceiptFolderHandle {
  name: string;
  queryPermission?(descriptor: { mode: "readwrite" }): Promise<Permission>;
  requestPermission?(descriptor: { mode: "readwrite" }): Promise<Permission>;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<ReceiptFolderHandle>;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandleLike>;
}

type PickerWindow = {
  showDirectoryPicker?: (options?: { mode?: "readwrite"; id?: string }) => Promise<unknown>;
};

export function receiptFolderSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function getReceiptFolder(store: ReceiptStore = receiptStore()) {
  try {
    return (await store.getSetting<ReceiptFolderHandle>(FOLDER_SETTING)) ?? null;
  } catch {
    return null;
  }
}

export async function pickReceiptFolder(
  store: ReceiptStore = receiptStore(),
): Promise<ReceiptFolderHandle | null> {
  if (!receiptFolderSupported()) return null;
  const picker = (window as unknown as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const picked: unknown = await picker({ mode: "readwrite", id: "juriscore-receipts" });
    if (!picked) return null;
    const handle = picked as ReceiptFolderHandle;
    await store.setSetting(FOLDER_SETTING, handle);
    return handle;
  } catch {
    // The user closed the picker.
    return null;
  }
}

export async function forgetReceiptFolder(store: ReceiptStore = receiptStore()) {
  await store.setSetting(FOLDER_SETTING, undefined);
}

async function ensurePermission(handle: ReceiptFolderHandle) {
  const descriptor = { mode: "readwrite" as const };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(descriptor)) === "granted") return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission(descriptor)) === "granted";
}

export type FolderWriteResult =
  | { ok: true; path: string }
  | { ok: false; reason: string; downloaded: boolean };

/**
 * Writes `<module>/<receiptFileName>` into the chosen folder. On any failure the receipt
 * is downloaded instead and the reason is returned for display.
 */
export async function writeReceiptToFolder(
  receipt: ValidationReceipt | PersistedReceipt,
  options: {
    handle?: ReceiptFolderHandle | null;
    fallback?: (receipt: ValidationReceipt | PersistedReceipt) => void;
  } = {},
): Promise<FolderWriteResult> {
  const fallback = options.fallback ?? downloadReceipt;
  const failed = (reason: string): FolderWriteResult => {
    try {
      fallback(receipt);
      return { ok: false, reason, downloaded: true };
    } catch {
      return { ok: false, reason, downloaded: false };
    }
  };

  let body: string;
  try {
    body = serializeReceipt(receipt);
  } catch {
    return {
      ok: false,
      reason: "The receipt did not validate, so it was not saved.",
      downloaded: false,
    };
  }

  const handle = options.handle === undefined ? await getReceiptFolder() : options.handle;
  if (!handle) return failed("No receipt folder is chosen.");
  try {
    if (!(await ensurePermission(handle))) {
      return failed(`Permission to write to "${handle.name}" was not granted.`);
    }
    const folder = await handle.getDirectoryHandle(receipt.module, { create: true });
    const fileName = receiptFileName(receipt);
    const file = await folder.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(body);
    await writable.close();
    return { ok: true, path: `${handle.name}/${receipt.module}/${fileName}` };
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
    return failed(`Could not write to "${handle.name}"${detail}`);
  }
}
