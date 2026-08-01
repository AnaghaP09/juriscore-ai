#!/bin/sh
# JurisCore on-prem package — start script (macOS, Linux).
# Runs the bundled server. Every dependency is already inside this folder, so
# nothing is downloaded and no registry is contacted.
set -e

if ! command -v bun >/dev/null 2>&1; then
  echo "[juriscore] Bun is required but was not found on your PATH. Install it first:"
  echo "[juriscore]   macOS / Linux : curl -fsSL https://bun.sh/install | bash"
  echo '[juriscore]   Windows       : powershell -c "irm bun.sh/install.ps1 | iex"'
  echo "[juriscore] Then re-run:  ./start.sh"
  exit 1
fi

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"

PORT="${PORT:-8080}"
export PORT

echo "[juriscore] Starting JurisCore. Open http://localhost:$PORT/ when the server reports it is listening."
exec bun run ./server/index.mjs
