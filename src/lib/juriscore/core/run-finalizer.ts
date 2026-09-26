import { RECEIPT_HISTORY_LIMIT, receiptStore, type ReceiptStore } from "./receipt-store";

/**
 * How many finalized runs a finalizer remembers. It matches the history limit: a run's
 * receipt can only still be in the history if it is among the latest receipts created.
 */
export const RUN_FINALIZER_CAPACITY = RECEIPT_HISTORY_LIMIT;

export interface RunFinalizerOptions<T> {
  capacity?: number;
  /**
   * Whether a finished run's value may still be reused. One that may not (its receipt was
   * trimmed or cleared) is forgotten and the run is built again.
   */
  isCurrent?: (value: T) => boolean | Promise<boolean>;
}

export interface RunFinalizer<T> {
  (key: string, build: () => Promise<T | null>): Promise<T | null>;
  /** Forgets every run, e.g. after the history was cleared. */
  reset(): void;
}

/**
 * Builds a run's receipt at most once per run identity. The first finalizing action for a
 * key starts the build; every later action with the same key — immediately, or after
 * switching to other runs and back — gets the same result, so repeated Copy, Save report,
 * or Download clicks never store a second receipt. A build that fails (resolves null or
 * throws) is forgotten so the next action can try again.
 *
 * Keys should identify the run without holding its text (for Veil: strategy, policy
 * version, and the input digest). Beyond `capacity`, the run built longest ago is dropped;
 * reuse does not refresh it, so the kept runs are the ones whose receipts were created last.
 */
export function createRunFinalizer<T>(
  options: number | RunFinalizerOptions<T> = {},
): RunFinalizer<T> {
  const resolved: RunFinalizerOptions<T> =
    typeof options === "number" ? { capacity: options } : options;
  const { capacity = RUN_FINALIZER_CAPACITY, isCurrent } = resolved;
  const runs = new Map<string, Promise<T | null>>();

  const start = (key: string, build: () => Promise<T | null>) => {
    const promise: Promise<T | null> = Promise.resolve()
      .then(build)
      .catch(() => null)
      .then((value) => {
        if (value === null && runs.get(key) === promise) runs.delete(key);
        return value;
      });
    runs.set(key, promise);
    while (runs.size > capacity) {
      const oldest = runs.keys().next().value as string;
      runs.delete(oldest);
    }
    return promise;
  };

  const finalize = (key: string, build: () => Promise<T | null>): Promise<T | null> => {
    const existing = runs.get(key);
    if (!existing) return start(key, build);
    if (!isCurrent) return existing;
    return existing.then(async (value) => {
      if (value !== null) {
        let current = false;
        try {
          current = await isCurrent(value);
        } catch {
          current = false;
        }
        if (current) return value;
      }
      if (runs.get(key) === existing) runs.delete(key);
      // Another action may already have started the rebuild; it is reused, not repeated.
      return runs.get(key) ?? start(key, build);
    });
  };

  return Object.assign(finalize, {
    reset() {
      runs.clear();
    },
  });
}

/**
 * A finalizer whose runs are reused only while their receipt is still in `store`'s
 * history: a trimmed receipt is built again, and clearing the history (here or in another
 * tab) forgets every run.
 */
export function createReceiptRunFinalizer<T extends { receipt: { id: string } }>(
  store: Pick<ReceiptStore, "hasReceipt" | "onChange">,
  capacity = RUN_FINALIZER_CAPACITY,
): RunFinalizer<T> {
  const finalize = createRunFinalizer<T>({
    capacity,
    isCurrent: (value) => store.hasReceipt(value.receipt.id),
  });
  store.onChange((event) => {
    if (event.type === "cleared") finalize.reset();
  });
  return finalize;
}

const sharedFinalizers = new Map<string, RunFinalizer<unknown>>();

/**
 * The tab-wide finalizer for one workbench. It lives outside any component, so leaving the
 * page and returning (or remounting) keeps reusing receipts of runs already finalized in
 * this tab. It holds run identities and stored receipts only, never input text.
 */
export function sharedReceiptRunFinalizer<T extends { receipt: { id: string } }>(
  scope: string,
  store: Pick<ReceiptStore, "hasReceipt" | "onChange"> = receiptStore(),
): RunFinalizer<T> {
  let finalizer = sharedFinalizers.get(scope);
  if (!finalizer) {
    finalizer = createReceiptRunFinalizer<T>(store) as unknown as RunFinalizer<unknown>;
    sharedFinalizers.set(scope, finalizer);
  }
  return finalizer as unknown as RunFinalizer<T>;
}
