/**
 * Builds a run's receipt at most once. The first finalizing action for a run key starts
 * the build; every later action with the same key gets the same promise, so repeated
 * Copy, Save report, or Download clicks never store a second receipt. A build that fails
 * (resolves null) is forgotten so the next action can try again.
 */
export function createRunFinalizer<T>() {
  let pending: { key: string; promise: Promise<T | null> } | null = null;

  return (key: string, build: () => Promise<T | null>): Promise<T | null> => {
    if (pending?.key === key) return pending.promise;
    const entry: { key: string; promise: Promise<T | null> } = {
      key,
      promise: Promise.resolve()
        .then(build)
        .catch(() => null)
        .then((value) => {
          if (value === null && pending === entry) pending = null;
          return value;
        }),
    };
    pending = entry;
    return entry.promise;
  };
}
