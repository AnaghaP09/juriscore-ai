# Run JurisCore

This folder is a complete JurisCore instance. It runs on your own machine or
server. Nothing in it calls out to the internet, and nothing is sent anywhere.

## 1. Install Bun

Bun is the only thing you need to install. It is a single command.

- **macOS or Linux:** `curl -fsSL https://bun.sh/install | bash`
- **Windows (PowerShell):** `irm bun.sh/install.ps1 | iex`

Close and reopen your terminal afterwards so `bun` is on your PATH.

## 2. Start JurisCore

From inside this folder:

- **macOS or Linux:** `./start.sh`
- **Windows:** `start.cmd`

If Bun is missing, the script tells you how to install it and stops. It never
starts halfway.

## 3. Open it

The server prints the address it is listening on. It is
<http://localhost:8080/> unless you changed it.

To use a different port, set `PORT` first:

- **macOS or Linux:** `PORT=9000 ./start.sh`
- **Windows:** `set PORT=9000` then `start.cmd`

Go to `/dashboard` for the workbench, and `/connect` for the MCP endpoint and
the client configuration snippets.

## Running it as a container instead

If you were given the container image tar:

```
docker load -i juriscore-<version>-docker-image.tar.gz
docker run --rm -p 8080:8080 juriscore:<version>
```

The image carries the same files as this folder. It needs no network access.

## What you are running

- **Veil** protects text before it reaches a model: it detects personal
  identifiers, customer and tenant identifiers, credentials and secrets,
  regulated health identifiers, and prompt-attack patterns, and returns allow,
  revise, or block with findings and the active policy versions.
- **Plumb** compares structured claims against authoritative values and returns
  matches, drifted, or cannot determine.
- Both are also exposed over the Model Context Protocol at `/mcp`.

Every dependency is already bundled in this package. Starting it does not
install anything, and evaluation makes no external call.

## What this build does not do

Read this before putting it in front of anything that matters.

- **There is no authentication.** Anyone who can reach the address can use the
  app and call every MCP tool. Bind it to a network you control.
- **Nothing is persisted.** Receipts are handed back to you per check; there is
  no server-side store, no history, and no multi-user state.
- **It does not certify compliance.** The policy packs translate published
  references into checks. They do not reproduce restricted standards, decide
  legal applicability, or replace qualified review.
- **It does not enforce network egress** and is not a certified air-gapped
  system, though it makes no outbound call of its own.
- Figures shown in the interface carry a label saying whether they are targets,
  simulated, benchmark, pilot, or production results. Read the label.

## If something goes wrong

- `bun: command not found` — Bun is not installed, or your terminal predates the
  install. Reopen the terminal and try again.
- The address is already in use — start with a different `PORT` (step 3).
- Nothing else in this folder needs configuration. There are no API keys, no
  database, and no environment file to set up.
