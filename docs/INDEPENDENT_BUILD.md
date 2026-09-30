# Building JurisCore without Lovable

JurisCore started as a Lovable prototype. It no longer depends on Lovable for anything:
the UI is plain React 19, Radix/shadcn components, Tailwind 4 and TanStack Start, and every
package installs from the public npm registry.

## Commands

| Task                                                     | Command                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Install                                                  | `bun install` (CI uses `bun install --frozen-lockfile`)           |
| Dev server (stage, http://localhost:8080)                | `bun run dev`                                                     |
| Production build (Cloudflare `cloudflare-module` output) | `bun run build`                                                   |
| Self-hosted release package (Bun preset)                 | `bun run package:release`                                         |
| Checks                                                   | `bun run check:core`, `bunx tsc --noEmit`, `bun run check:bundle` |
| Lovable independence                                     | `bun run check:lovable` (add `--sync` to also ask GitHub)         |

## What replaced what

| Was (Lovable)                                                          | Now                                                                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lovable.dev/vite-tanstack-config` wrapper                            | `vite.config.ts` registers Tailwind, tsconfig paths, TanStack Start, Nitro and React directly, with the same settings                                       |
| `@lovable.dev/mcp-js` and its generated routes                         | `src/lib/mcp/define.ts` + `src/lib/mcp/http.ts` on the official `@modelcontextprotocol/sdk`; `/mcp` answers exactly as before (`scripts/check-mcp-http.ts`) |
| Lovable-only routes `/.mcp/*`, `/.well-known/oauth-protected-resource` | removed (editor-only; the metadata route was a 404)                                                                                                         |
| Lovable error reporting                                                | the root error boundary logs to the console                                                                                                                 |
| Lovable npm mirror in `bun.lock`                                       | public registry, same versions and integrity hashes                                                                                                         |
| Lovable favicon                                                        | JurisCore's own mark (`public/favicon.svg`, `public/favicon.ico`)                                                                                           |

## Checking that Lovable is not syncing

- `bun run check:lovable --sync` reports the last commit by Lovable's GitHub App
  (`gpt-engineer-app[bot]`), any newer Lovable commit, GitHub event, check run, status or
  webhook, and fails if it finds one. The **Lovable watch** workflow runs it daily.
- The one thing it cannot see is whether the Lovable GitHub App is still installed, because
  a user token cannot list app installations. Check
  [github.com/settings/installations](https://github.com/settings/installations): if
  "Lovable" (or "GPT Engineer") is listed, uninstall it or remove this repository from it.
  Also disconnect GitHub in the Lovable project's settings.
