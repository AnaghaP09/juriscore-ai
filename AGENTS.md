# Agent notes

- Never rewrite published git history: no force-push, and no rebasing, amending or squashing
  commits that are already pushed. Work on feature branches and merge through pull requests.
- Keep `main` in a working state; the owner's stage (`bun run dev` on :8080) runs from it.
- JurisCore builds and runs without Lovable (see `docs/INDEPENDENT_BUILD.md`).
  `bun run check:lovable` reports any remaining Lovable dependency or sync activity.
