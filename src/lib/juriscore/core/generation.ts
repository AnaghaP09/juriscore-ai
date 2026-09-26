/**
 * Guards asynchronous results against the inputs they were computed from. `begin()` returns
 * a token for one piece of work; `invalidate()` marks every outstanding token stale (on an
 * edit, upload, removal, or unmount); `isCurrent(token)` says whether a finished piece of
 * work may still commit its result.
 */
export function createGeneration() {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    invalidate() {
      current += 1;
    },
    isCurrent(token: number) {
      return token === current;
    },
  };
}

export type Generation = ReturnType<typeof createGeneration>;
