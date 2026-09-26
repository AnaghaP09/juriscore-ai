# Model Connection Requirements

## Current prototype state

- The dashboard **Active model** selector lists the server's model allowlist and shows the
  server-reported connection state for the selected model (see `docs/GATEWAY_SETUP.md`).
- Anthropic is the one provider, through the customer's own account. The key is held by
  the server.
- The **LLM Gateway** page sends prompts through Veil to a connected model. On the Veil
  workbench, **Copy** is still the handoff; its **Send to AI model** button stays
  unavailable until that page is wired to the gateway.
- The UI must not imply that sanitized content has been sent anywhere it was not.

## Product requirement

JurisCore must sit between the user or application and an explicitly configured model:

`User/application -> JurisCore gateway -> Veil protection -> configured provider/model -> output validation -> response and audit receipt`

JurisCore must not try to guess which model is active. An administrator must configure the provider, model ID, credentials, and allowed use cases.

## Prototype checklist

- [x] Keep the selector labeled **Active model**, paired with an explicit connection status.
- [x] Show **Not connected** while no provider connection exists.
- [x] Keep **Copy** as the manual handoff.
- [x] Show **Send to AI model** as unavailable until a real connection exists.
- [x] Add a server-side provider connection flow.
- [x] Store provider credentials on the server, never in browser storage.
- [x] Add a connection test and show its last verified time.
- [x] Replace **Not connected** with **Connected - provider name** only after validation succeeds.
- [x] Enable **Send to configured model** only after a connection passes validation (LLM
      Gateway page; the Veil workbench button is not wired yet).
- [x] Run Veil before every model request.
- [x] Validate model responses before returning them (Veil over the reply).
- [x] Produce an audit receipt without retaining raw sensitive values.
- [ ] Support a gateway API so other products can call JurisCore without using this UI.
      The routes exist but require the browser session cookie; a machine credential is
      not built.

## Out of scope for this prototype pass

- Automatic model discovery.
- Treating an ordinary MCP tool or data connection as a verified model connection.
- A fake or non-functional send button.
- Provider credential entry in the browser.
- Claiming that the demo model selector represents a live connection.
