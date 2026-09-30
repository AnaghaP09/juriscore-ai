# Run JurisCore

This folder is a complete JurisCore instance. It runs on your own machine or
server. Nothing in it calls out to the internet, and nothing is sent anywhere,
unless you turn on the optional LLM Gateway (see below), which sends prompts to
your own model provider account and nowhere else.

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

## 4. Decide who can reach it

By default the server listens on **every network interface** of the machine, so
other devices on the same network can open it by the machine's address. There
is no login (see below), so choose deliberately:

- **Only this machine:** set `HOST=127.0.0.1` before starting.
  - macOS or Linux: `HOST=127.0.0.1 ./start.sh`
  - Windows: `set HOST=127.0.0.1` then `start.cmd`
- **A network you control:** leave `HOST` unset, or set it to the address of
  the interface you want to serve, and keep the machine behind your firewall.
  From another device over plain HTTP you can browse and run checks, but
  receipts, copy-to-clipboard and the LLM Gateway need HTTPS or the server's
  own machine.

`HOST` and `PORT` can be combined: `HOST=127.0.0.1 PORT=9000 ./start.sh`.

## Running it as a container instead

If you were given the container image tar:

```
docker load -i juriscore-<version>-docker-image.tar.gz
docker run --rm -p 8080:8080 juriscore:<version>
```

The image carries the same files as this folder. It needs no network access.

Inside the container the server must listen on all interfaces, so do not set
`HOST` there. Control exposure with the port mapping instead: `-p 8080:8080`
publishes it to every interface of the host machine, while
`-p 127.0.0.1:8080:8080` keeps it to the host machine only.

## What you are running

- **Veil** protects text before it reaches a model: it detects personal
  identifiers, customer and tenant identifiers, credentials and secrets,
  regulated health identifiers, and prompt-attack patterns, and returns allow,
  revise, or block with findings and the active policy versions.
- **Plumb** compares structured claims against authoritative values and returns
  matches, drifted, or cannot determine.
- Both are also exposed over the Model Context Protocol at `/mcp`.
- **LLM Gateway** sends a prompt to a model from your own proprietary LLM
  account, with Veil run over the prompt and over the reply and a receipt for
  every completed run. It is **off** until three values are set in the
  environment before starting: `JURISCORE_LLM_API_KEY`, `JURISCORE_GATEWAY`
  and `JURISCORE_GATEWAY_TOKEN`. Steps, including the exact commands for your
  shell and for the container, are in the setup guide:
  <https://github.com/AnaghaP09/juriscore-ai/blob/main/docs/GATEWAY_SETUP.md>. The dashboard suggests the unlock phrase
  (**Set up gateway** in the header). The gateway is unlocked from the server's
  own machine only. The API key stays on the server and never reaches the
  browser; with the gateway on, the only outbound calls are to your provider,
  made by the server. This applies to package 2026.10.01 or later.

Every dependency is already bundled in this package. Starting it does not
install anything, and evaluation makes no external call.

## What this build does not do

Read this before putting it in front of anything that matters.

- **There is no authentication.** Anyone who can reach the address can use the
  app and call every MCP tool. Bind it to a network you control (step 4 shows
  how). The LLM Gateway passphrase gates the gateway only, not the app.
- **Nothing is persisted.** Receipts are handed back to you per check; there is
  no server-side store, no history, and no multi-user state.
- **It does not certify compliance.** The policy packs translate published
  references into checks. They do not reproduce restricted standards, decide
  legal applicability, or replace qualified review.
- **It does not enforce network egress** and is not a certified air-gapped
  system, though it makes no outbound call of its own unless the LLM Gateway
  is turned on.
- Figures shown in the interface carry a label saying whether they are targets,
  simulated, benchmark, pilot, or production results. Read the label.

## If something goes wrong

- `bun: command not found` — Bun is not installed, or your terminal predates the
  install. Reopen the terminal and try again.
- The address is already in use — start with a different `PORT` (step 3).
- Nothing else in this folder needs configuration. There is no database and
  no environment file to set up. The only optional settings are `PORT`, `HOST`,
  and the LLM Gateway variables above.
