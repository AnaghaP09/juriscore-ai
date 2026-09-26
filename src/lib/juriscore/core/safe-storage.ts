/**
 * `localStorage` access that never throws. Private modes, blocked storage, and full
 * quotas all surface as one `onFailure` call; state then simply stays in memory.
 */
export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createSafeStorage(
  resolve: () => Storage | null | undefined,
  onFailure: () => void,
): SafeStorage {
  const withStorage = <T>(fallback: T, apply: (storage: Storage) => T): T => {
    try {
      const storage = resolve();
      if (!storage) {
        onFailure();
        return fallback;
      }
      return apply(storage);
    } catch {
      onFailure();
      return fallback;
    }
  };

  return {
    get: (key) => withStorage<string | null>(null, (storage) => storage.getItem(key)),
    set: (key, value) => withStorage<void>(undefined, (storage) => storage.setItem(key, value)),
    remove: (key) => withStorage<void>(undefined, (storage) => storage.removeItem(key)),
  };
}
