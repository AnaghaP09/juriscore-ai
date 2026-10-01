# LLM Gateway setup

The LLM Gateway sends prompts to a model from **your own proprietary LLM account**. JurisCore AI
runs Veil before every request and again over every reply, and writes a receipt for every
completed run. Your API key is held by the JurisCore AI server and never reaches the browser.

This page is the single home of the setup steps. The product links here; it does not repeat
them. It is published at <https://anaghap09.github.io/juriscore-ai/setup.html>; the Run guide for the
downloaded package is at <https://anaghap09.github.io/juriscore-ai/run.html>.

## 1. Get an unlock phrase

Open the dashboard and choose **Set up gateway** in the header. JurisCore AI suggests an unlock
phrase; copy it. You can also choose your own: 16 characters or more, and never the API key.
The phrase protects nothing until it is in your server's configuration (step 2 or 3).

## 2. Running from the repo (`bun run dev`)

In the repo folder (the top-level folder of the clone), create `.env.local` from the example
**only if it does not exist yet**. If it exists, open it and edit the three values in place so
your other settings (model allowlist, emergency stop) survive.

- macOS, Linux: `cp -n .env.example .env.local`
- Windows PowerShell: `if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }`

`.env.local` is ignored by git and never committed. Fill in three lines; the rest can stay as
they are:

```
JURISCORE_LLM_API_KEY=<your proprietary LLM API key>
JURISCORE_GATEWAY=enabled
JURISCORE_GATEWAY_TOKEN=<the phrase from step 1>
```

The API key comes from your LLM provider's developer platform. `JURISCORE_GATEWAY=enabled`
is optional: the gateway turns on when a key is present. If it is already set to `disabled`,
in this file or in the shell you start JurisCore AI from, change it or remove it, or the gateway
stays off.

Restart the server: stop it, then `bun run dev`. Environment variables are read at startup.

## 3. Running the downloaded package

There is no `.env.local` in the package (version 2026.10.01 or later). Set the same three
values in the shell, then start:

- macOS, Linux:
  ```
  export JURISCORE_LLM_API_KEY='<your key>'
  export JURISCORE_GATEWAY=enabled
  export JURISCORE_GATEWAY_TOKEN='<the phrase>'
  ./start.sh
  ```
- Windows PowerShell:
  ```
  $env:JURISCORE_LLM_API_KEY = '<your key>'
  $env:JURISCORE_GATEWAY = 'enabled'
  $env:JURISCORE_GATEWAY_TOKEN = '<the phrase>'
  .\start.cmd
  ```
- Windows Command Prompt:
  ```
  set "JURISCORE_LLM_API_KEY=<your key>"
  set JURISCORE_GATEWAY=enabled
  set "JURISCORE_GATEWAY_TOKEN=<the phrase>"
  start.cmd
  ```
- Container:
  ```
  docker run --rm -p 8080:8080 -e 'JURISCORE_LLM_API_KEY=<your key>' -e JURISCORE_GATEWAY=enabled -e 'JURISCORE_GATEWAY_TOKEN=<the phrase>' juriscore:<version>
  ```

Replace `<your key>` and `<the phrase>` including the angle brackets, and keep the quotes:
they let a phrase with spaces through unchanged. A phrase that itself contains a quote
character is best replaced by another suggestion. In `.env.local` no quotes are needed.

To change a value later: stop the server, set the values again, start it. A container is
stopped and started again with the new flags.

**Older packages** (before 2026.10.01) read `ANTHROPIC_API_KEY` only, need
`JURISCORE_GATEWAY=enabled`, and have no Set up gateway dialog: use any phrase of 16
characters or more.

## 4. Unlock and verify

Open `http://localhost:<port>/dashboard` **on the server's own machine**, choose **Unlock
gateway** in the header, and enter the phrase. The server sets an HttpOnly, SameSite=Strict
session cookie for two hours; the page does not keep the phrase.

The connection check runs by itself after unlock. The header then reads
**Connected — <provider> · <model>**, or shows the reason with a **Retry** action:

| Badge | Cause |
|---|---|
| API key rejected | The key is wrong or revoked. |
| Key lacks access to this model | The key's workspace cannot use the model. |
| Model not available to this account | The model id is not available to the account. |
| Rate limited, try again | The account hit a rate limit. |
| Provider unreachable | The server could not reach the provider. |
| The server is busy | Too many checks at once; retry in a moment. |
| Could not reach the server | The browser lost its connection; retry. |
| Check failed (status N) | Any other provider error. |

A wrong phrase is refused at Unlock: "That phrase does not match the server's
`JURISCORE_GATEWAY_TOKEN`." After any change to the key or the phrase: restart the server,
refresh the page, and unlock again; the check runs again by itself. **Test connection** in
the header repeats the check at any time.

Choosing another model shows that model's own state and checks it once automatically.
Connection state lives in the server process only; a restart returns every model to
**Not connected** and needs a new unlock.

## 5. Who can unlock

One phrase per running server. Every browser on that machine that reaches it uses the same
phrase and gets its own session. Per-device and per-user phrases are not built; per-user
needs login, which is roadmap.

The gateway is unlocked only from a browser on the server's own machine in this build. From
another device over plain HTTP you can browse and run checks, but receipts, copy-to-clipboard
and the gateway need HTTPS or the server's own machine: browsers withhold the secure-context
features they rely on. The Unlock dialog says so and sends nothing in that case; the server
refuses such a session request too. Remote gateway use, including behind an HTTPS proxy, is
roadmap.

## 6. Migrating an existing install

If your `JURISCORE_GATEWAY_TOKEN` holds the API key, the server ignores it, prints one line
saying so, and refuses every unlock until you set a separate phrase (step 1). Delete that
token line and use a phrase. `ANTHROPIC_API_KEY` from earlier installs is still read when
`JURISCORE_LLM_API_KEY` is empty; renaming it is optional.

## 7. Providers

`JURISCORE_LLM_PROVIDER` selects the provider. The only value this build accepts is
`anthropic`, which is also the default, so the line can be left out. Other proprietary
providers (OpenAI, Azure OpenAI, Google and others) are roadmap; any other value is reported
under Set up gateway as a configuration error, never as a connectable provider.

The Anthropic key comes from the [Anthropic Console](https://console.anthropic.com/).
**Claude Pro and Max subscriptions do not include API access**; the key must come from a
Console account with API billing.

## Server environment

Set these on the server only. Never put them in browser code or commit them; `.env` and
`.env.*` are gitignored, and `.env.example` lists the names with instructions and no values.

| Variable | Required | Meaning |
|---|---|---|
| `JURISCORE_LLM_API_KEY` | yes | Your proprietary LLM API key. Its value is read only after a request has passed the access gate. |
| `JURISCORE_GATEWAY` | no | `enabled` turns the gateway on; `disabled` forces it off; empty means on when a key is set. |
| `JURISCORE_GATEWAY_TOKEN` | yes | The unlock phrase (16 characters or more) you type into **Unlock gateway**. Not a provider credential, and never equal to the key. Missing or too short, every gateway request answers 503. |
| `JURISCORE_LLM_PROVIDER` | no | `anthropic` (default and only accepted value). |
| `JURISCORE_GATEWAY_MODELS` | no | Comma-separated allowlist. Defaults to `claude-opus-5`. Supported: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. Any other id makes the gateway report a configuration error. |
| `JURISCORE_GATEWAY_KILL` | no | `1` refuses every model request with 503 (server-side emergency stop). |
| `ANTHROPIC_API_KEY` | no | Legacy name for the key, read when `JURISCORE_LLM_API_KEY` is empty. |

`bun run dev` loads `.env.local` into the server's environment. The package reads the shell
environment (step 3).

The gateway routes accept requests only from the page they were served with (same origin),
so a script calling `/api/gateway/*` directly is refused. Reach the gateway through the
dashboard at the address the server prints.

## What a run does

`POST /api/gateway/run` with `purpose: "prompt"`:

1. Access gate: gateway on, same-origin `Origin`, JSON content type, rate limits, a valid
   session cookie, and the emergency stop.
2. The selected model must be **Connected**.
3. Veil protects the prompt under the policies active in your browser (custom policies
   travel with the request and are never stored by the server).
4. A second Veil pass re-scans the protected text under every detector. Anything still
   detectable, an unterminated private key, or leftover key material blocks the run:
   nothing is sent.
5. The protected prompt goes to the provider.
6. Veil checks the reply on the way back.
7. The response carries the reply for display and a text-free receipt
   (`module: "gateway"`, `digestVersion: "gateway.request.v1"`): the digest of the
   original request and the digest of the payload actually sent, never the text itself.

A reply the model declines is labelled **declined** with its category; a reply cut off at
the length limit is labelled **truncated**. If the provider fails after the prompt was sent,
no receipt is written for that attempt (see the release notes' known issues).

## Access boundary

The session cookie is a prototype boundary for a single operator on a local deployment. It
is not multi-user authentication and must not be the only protection on a public deployment.

## Checks

`bun run check:gateway` runs the gateway pipeline against a deterministic fake of the
provider SDK: no network, no key. It also checks the enable rule, the phrase-equals-key
refusal, the remote-HTTP refusal, the suggested-phrase generator, the unlock-and-verify flow,
and that `.env.example` lists every variable with instructions and no values. After
`bun run build`, `bun run check:bundle` scans the browser bundle for the SDK, the provider
host, both key variable names, the server gateway modules, and the check fixtures.
