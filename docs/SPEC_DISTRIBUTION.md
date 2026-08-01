# Spec: static product page on GitHub Pages and downloadable on-prem package

Status: requested by the founder 2026-08-01; ready for implementation.
Owner: product. Implementer: engineering (main session). This spec is the docs-side record; no application code is changed by this document.

## Problem

The product has no public web presence and no way for a prospect to run it without cloning the repository and installing a toolchain. The sovereign positioning (`PRODUCT_CONTRACT.md`, amended 2026-08-01) needs both: a page that states the story, and a package a buyer can download and run inside their own environment.

## Why now

Ratified repositioning without a distribution channel is a story nobody can hear. The seed already exists: `landing/index.html` is a self-contained static page with inline styles and no build step — exactly the artifact GitHub Pages wants.

## Scope

In:

- publish the static product page from `landing/` to GitHub Pages via a workflow (`.github/workflows/pages.yml`), deploying only the `landing/` directory;
- update the page content to the amended contract: sovereign primary storyline, the three tiers with built-in packs always free, a Download section linking the release package, and the standard non-certification sentence;
- fix the unsupported claim in the page metadata: `landing/index.html:9` says "Available as a CLI and a web app" — no CLI exists in this repository; the page may only describe what ships;
- a versioned downloadable package published as a GitHub Release: `juriscore-<version>.zip` containing the production build output plus a start script and a plain-language `RUN.md` (install Bun, run one command, open the printed URL);
- a release workflow that gates packaging on `bun run check:core` and `bun run build` — the deterministic checks are the release gate;
- a container image as the second release artifact (`docker run`, offline-loadable via `docker save` tar) for the Enterprise on-prem path.

Out:

- hosting the running app itself on GitHub Pages — the app requires the server runtime for the MCP endpoints (`src/routes/[.mcp]/`) and cannot be a static export; Pages hosts the product page only;
- license keys, activation, telemetry, or update channels;
- publishing source archives: the repository is all rights reserved and not open source (`README.md:139-140`); releases ship built artifacts only;
- a Kubernetes chart or multi-service deployment.

## User-visible behavior

- the product page loads from the GitHub Pages URL with no external requests beyond its own assets; it states the pitch, the tiers, and a Download button;
- the download resolves to the latest GitHub Release;
- a user on macOS or Windows unzips the package, follows `RUN.md` (Bun install plus one start command), and reaches the dashboard on localhost;
- failure path: if Bun is missing, the start script prints the same install guidance as `scripts/setup.mjs:53-61` and exits with a non-zero code; it must not fail silently;
- the package runs with no external network calls at evaluation time, consistent with the amended V1 boundary; nothing in the package phones home.

## Contract impact

- implements the Free-tier distribution channel ("local playground", `PRODUCT_CONTRACT.md` commercial model) and the Enterprise install artifact;
- the page and `RUN.md` inherit the boundary language: no compliance claims, no unlabeled metrics, no claim of egress enforcement or certified air-gap operation;
- the page must not present any number without a maturity label; the current landing copy contains none, and that must remain true.

## Evidence and metrics

None added. The page states capabilities, not results.

## Done means

- the Pages workflow deploys `landing/` and the published URL renders;
- the release workflow produces `juriscore-<version>.zip` and the container tar, both built only after `bun run check:core` and `bun run build` pass;
- a clean machine (no repo clone) can download, unzip, and reach the dashboard following `RUN.md`;
- `landing/index.html` no longer claims a CLI;
- the page Download link points at the latest release.

## Risks and open questions

- the built TanStack Start output requires Bun at runtime; a true single-binary package (`bun build --compile`) is worth investigating but is not required for this slice (owner: engineering, decide during implementation);
- Pages publishes from a public repository path; confirm the repository can remain private with public Pages, or host the page from a separate public repository containing only `landing/` (owner: founder, before first deploy);
- release versioning scheme is undefined; adopt a plain `v0.x` tag series starting at the first packaged release (owner: product).
