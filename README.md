# JurisCore AI

JurisCore is a commercial AI validation and guardrail platform for teams building AI into SaaS products. It protects data before model use, validates important claims against authoritative sources, and returns an allow, revise, or block decision with evidence.

JurisCore has two core features:

- **Veil** protects customer, operational, security, and regulated data before it enters or leaves an AI workflow.
- **Plumb** checks documentation and product claims against code, configuration, schemas, policies, and APIs.

Both features use the same Policy Library. The prototype includes versioned references for PII, HIPAA, SOC 2, MITRE ATLAS, NIST AI RMF, and NIST CSF, plus browser-local custom policies. Policy packs guide checks; they do not certify compliance.

## Commercial model

JurisCore is not an open-source product. The intended model is product-led and usage-based:

- **Free:** local playground, built-in policy references, and limited Veil and Plumb checks.
- **Team:** metered API usage, custom policies, shared receipts, CI checks, and collaboration.
- **Enterprise:** SSO, RBAC, private policy packs, dedicated data controls, and priority support.

The source in this repository is a private product prototype and remains all rights reserved.

## Getting started

JurisCore runs locally on **macOS** and **Windows**. The only required tool is
[Bun](https://bun.sh/) — it provides the runtime, package manager, and script
runner. (Bun bundles its own JavaScript engine, so a separate Node.js install is
optional.)

### 1. Install Bun

**macOS** (Terminal):

```sh
curl -fsSL https://bun.sh/install | bash
```

Then restart your terminal and confirm:

```sh
bun --version
```

**Windows** (PowerShell):

```powershell
irm bun.sh/install.ps1 | iex
```

Then open a new PowerShell window and confirm:

```powershell
bun --version
```

### 2. Get the code

```sh
git clone https://github.com/AnaghaP09/juriscore-ai.git
cd juriscore-ai
```

### 3. Install dependencies

Use the self-healing setup command on **both** platforms:

```sh
bun run setup
```

On macOS this is just a normal install. On Windows it additionally recovers from
antivirus (Windows Defender) file-locks that can otherwise interrupt
`bun install` — so `bun run setup` is the reliable one-command path everywhere.
Plain `bun install` also works if you prefer.

### 4. Start the app

```sh
bun run dev
```

Open the printed URL (defaults to **http://localhost:8080/**). The dev server
supports hot reload, so edits under `src/` appear instantly.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run setup` | Cross-platform, self-healing dependency install |
| `bun run dev` | Start the local dev server (hot reload) |
| `bun run build` | Production build |
| `bun run preview` | Preview the production build locally |
| `bun run check:core` | Full deterministic validation suite (Veil + Plumb + contracts) |
| `bun run check:veil` | Veil engine checks |
| `bun run check:plumb` | Plumb engine checks |
| `bun run lint` | Lint with ESLint |
| `bun run format` | Format with Prettier |

Verify a production build before shipping:

```sh
bun run check:core
bun run build
```

## Dependencies

- **Bun** `>= 1.1` — required (runtime + package manager + script runner).
- **Git** — to clone the repository.
- All JavaScript dependencies are declared in [`package.json`](package.json) and
  pinned in [`bun.lock`](bun.lock); `bun run setup` installs them.
- **Node.js** `>= 20` — optional. Everything runs under Bun, but the setup
  script is also compatible with `node scripts/setup.mjs` if you prefer Node.
- No database, API keys, or `.env` are required for local development — the V1
  prototype runs entirely on deterministic, in-browser demo data.

## Troubleshooting

**Windows: `bun install` fails with `EPERM ... NtSetInformationFile` or
"moving <package> to cache dir failed".**
This is Windows Defender briefly locking a freshly extracted package. `bun run
setup` recovers automatically. To prevent it entirely, add a Defender exclusion
for Bun's cache (Settings → *Virus & threat protection* → *Manage settings* →
*Exclusions* → add folder) for:

```
%USERPROFILE%\.bun
```

Antivirus scanning is also heavier inside cloud-synced folders, so cloning to a
plain path such as `C:\dev\juriscore-ai` (rather than `Documents`/OneDrive) makes
installs faster and more reliable.

**Port 8080 already in use.** Stop the other process or set a different port,
e.g. `bun run dev --port 5173`.

See [the product contract](docs/PRODUCT_CONTRACT.md), [feature inventory](docs/FEATURE_INVENTORY.md), and [validation report](docs/VALIDATION_REPORT.md) for current scope and evidence maturity.

## Licensing

Copyright © JurisCore. All rights reserved. No open-source license is granted.
