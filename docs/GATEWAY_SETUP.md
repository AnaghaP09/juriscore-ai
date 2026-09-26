# LLM Gateway setup

The LLM Gateway sends prompts to a model from **your own Anthropic account**. JurisCore
runs Veil before every request and again over every reply, and writes a receipt for every
run. The provider key is held by the JurisCore server and never reaches the browser.

## What you need

- An Anthropic API key from the [Anthropic Console](https://console.anthropic.com/).
  **Claude Pro and Max subscriptions do not include API access**; the key must come from a
  Console account with API billing.
- Access to the server's environment (for local use, a `.env.local` file in the project
  root).

## Server environment

Set these on the server only. Never put them in browser code or commit them; `.env` and
`.env.*` are gitignored, and `.env.example` lists the names without values.

| Variable | Required | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Your Anthropic API key. Read only after a request has passed the access gate. |
| `JURISCORE_GATEWAY` | yes | `enabled` turns the gateway routes on. Anything else and every gateway route answers 404. |
| `JURISCORE_GATEWAY_TOKEN` | yes | The JurisCore access token (16 characters or more) you type into **Unlock gateway**. It is not a provider credential. Enabled without a valid token, every gateway route answers 503. |
| `JURISCORE_GATEWAY_MODELS` | no | Comma-separated allowlist. Defaults to `claude-opus-5`. Supported: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. Any other id makes the gateway report **Not configured**. |
| `JURISCORE_GATEWAY_KILL` | no | `1` refuses every model request with 503 (server-side emergency stop). |

Example `.env.local`:

```
ANTHROPIC_API_KEY=<your key>
JURISCORE_GATEWAY=enabled
JURISCORE_GATEWAY_TOKEN=<a long random string>
JURISCORE_GATEWAY_MODELS=claude-opus-5,claude-sonnet-5,claude-haiku-4-5
```

`bun run dev` loads `.env.local` into the server's environment. For other deployments,
set the variables in the host's environment.

## Connect

1. Start the server: `bun run dev`, then open `http://localhost:8080/dashboard`.
2. In the header, choose **Unlock gateway** and enter the gateway token. The server sets
   an HttpOnly, SameSite=Strict session cookie for two hours; the page does not keep the
   token.
3. Choose **Test connection**. The server calls `models.retrieve` for the selected model,
   which spends no tokens.
4. The badge reads **Connected — Anthropic · claude-opus-5** only after that check
   succeeds. Otherwise it names the reason:

   | Badge | Cause |
   |---|---|
   | API key rejected | The key is wrong or revoked. |
   | Key lacks access to this model | The key's workspace cannot use the model. |
   | Model not available to this account | The model id is not available to the account. |
   | Rate limited, try again | The account hit a rate limit. |
   | Provider unreachable | The server could not reach Anthropic. |
   | Check failed (status N) | Any other provider error. |

Choosing another model shows that model's own state and checks it once automatically.
Connection state lives in the server process only; a restart returns every model to
**Not connected**.

## What a run does

`POST /api/gateway/run` with `purpose: "prompt"`:

1. Access gate: gateway enabled, same-origin `Origin`, JSON content type, rate limits, a
   valid session cookie, and the emergency stop.
2. The selected model must be **Connected**.
3. Veil protects the prompt under the policies active in your browser (custom policies
   travel with the request and are never stored by the server).
4. A second Veil pass re-scans the protected text under every detector. Anything still
   detectable, an unterminated private key, or leftover key material blocks the run:
   nothing is sent.
5. The protected prompt goes to Anthropic.
6. Veil checks the reply on the way back.
7. The response carries the reply for display and a text-free receipt
   (`module: "gateway"`, `digestVersion: "gateway.request.v1"`): the digest of the
   original request and the digest of the payload actually sent, never the text itself.

A reply the model declines is labelled **declined** with its category; a reply cut off
at the length limit is labelled **truncated**.

## Access boundary

The session cookie is a prototype boundary for a single operator on a local or stage
deployment. It is not multi-user authentication and must not be the only protection on a
public deployment.

## Checks

`bun run check:gateway` runs the gateway pipeline against a deterministic fake of the
Anthropic SDK: no network, no key. After `bun run build`, `bun run check:bundle` scans
the browser bundle for the SDK and the provider key's variable name.
