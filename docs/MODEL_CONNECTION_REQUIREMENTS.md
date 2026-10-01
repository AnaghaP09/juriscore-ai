# Model Connection Requirements

## Current state (v2026.10.01)

- The gateway is on when `JURISCORE_LLM_API_KEY` is set in `.env.local` (the legacy
  `ANTHROPIC_API_KEY` is still read), unless `JURISCORE_GATEWAY=disabled`. The provider
  defaults to Anthropic (`JURISCORE_LLM_PROVIDER`), the model list to the built-in list
  (`JURISCORE_GATEWAY_MODELS`). There is no setting for allowed use cases. Setup steps are in
  `docs/GATEWAY_SETUP.md`; this document does not repeat them.
- Anthropic is the one built-in provider adapter, through the customer's own account. The key
  is held by the server and never sent to the browser.
- Unlocking is a shared phrase (`JURISCORE_GATEWAY_TOKEN`), suggested by the UI and typed by
  the user. A correct phrase gives the browser a session cookie that lasts two hours. This is
  not a user login: anyone with the phrase and access to the server gets the same session.
- Access boundary: the unlock route rejects plain HTTP from another machine and allows
  http://localhost and HTTPS from the same origin. The code does not enforce a localhost-only
  boundary and has no multi-user authentication. Keep the server on your own machine or
  behind your own access control.
- The dashboard **Active model** selector lists the server's model allowlist and shows the
  server-reported connection state for the selected model. After unlock, and after a model
  change, the page verifies the connection automatically. Any provider failure during a run
  drops the model to "not verified" until a later check succeeds.
- The **LLM Gateway** page sends prompts through Veil to the verified model and checks the
  reply with Veil. On the Veil workbench, **Copy** is still the handoff; its **Send to AI
  model** button stays unavailable until that page is wired to the gateway.
- The UI must not imply that sanitized content has been sent anywhere it was not.

## Product requirement

JurisCore must sit between the user or application and an explicitly configured model:

`User/application -> JurisCore gateway -> Veil protection -> configured provider/model -> output validation -> response and audit receipt`

JurisCore must not try to guess which model is active. An administrator configures the key and the unlock phrase in `.env.local`; provider and model fall back to the defaults above. An allowed-use-case setting is roadmap.

## Checklist

- [x] Keep the selector labeled **Active model**, paired with an explicit connection status.
- [x] Show **Not connected** while no provider connection exists.
- [x] Keep **Copy** as the manual handoff.
- [x] Show **Send to AI model** as unavailable until a real connection exists.
- [x] Add a server-side provider connection flow.
- [x] Store provider credentials on the server, never in browser storage.
- [x] Add a connection test and show its last verified time.
- [x] Verify automatically after unlock and after a model change; drop to "not verified" after
      a provider failure.
- [x] Replace **Not connected** with **Connected - provider name** only after validation succeeds.
- [x] Enable **Send to configured model** only after a connection passes validation (LLM
      Gateway page; the Veil workbench button is not wired yet).
- [x] Run Veil before every model request.
- [x] Validate model responses before returning them (Veil over the reply).
- [x] Produce an audit receipt without retaining raw sensitive values.
- [ ] Support a gateway API so other products can call JurisCore without using this UI.
      The routes exist but require the shared-phrase session cookie; a machine credential
      and per-user authentication are not built.

## Out of scope today

- Automatic model discovery.
- Treating an ordinary MCP tool or data connection as a verified model connection.
- A fake or non-functional send button.
- Provider credential entry in the browser.
- Claiming that the demo model selector represents a live connection.
