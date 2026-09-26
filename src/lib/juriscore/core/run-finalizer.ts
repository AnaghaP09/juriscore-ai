/** How many finalized runs a finalizer remembers before forgetting the oldest. */
export const RUN_FINALIZER_CAPACITY = 64;

/**
 * Builds a run's receipt at most once per run identity. The first finalizing action for a
 * key starts the build; every later action with the same key — immediately, or after
 * switching to other runs and back — gets the same promise, so repeated Copy, Save report,
 * or Download clicks never store a second receipt. A build that fails (resolves null or
 * throws) is forgotten so the next action can try again.
 *
 * Keys should identify the run without holding its text (for Veil: strategy, policy
 * version, and the input digest). The oldest entries are dropped beyond `capacity`.
 */
export function createRunFinalizer<T>(capacity = RUN_FINALIZER_CAPACITY) {
  const runs = new Map<string, Promise<T | null>>();

  return (key: string, build: () => Promise<T | null>): Promise<T | null> => {
    const existing = runs.get(key);
    if (existing) {
      // Most recently used last, so eviction drops the least recently used run.
      runs.delete(key);
      runs.set(key, existing);
      return existing;
    }
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
}
