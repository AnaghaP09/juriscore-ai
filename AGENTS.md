# Agent notes

- Never rewrite published git history: no force-push, and no rebasing, amending or squashing
  commits that are already pushed. Work on feature branches and merge through pull requests.
- Keep `main` in a working state; the owner runs the product from it (`bun run dev` on :8080).
- JurisCore builds and runs without Lovable (see `docs/INDEPENDENT_BUILD.md`).
  `bun run check:lovable` reports any remaining Lovable dependency in the code and config;
  `bun run check:lovable --sync` also asks GitHub for sync activity (webhooks need admin
  rights; the command prints what it could not inspect).
