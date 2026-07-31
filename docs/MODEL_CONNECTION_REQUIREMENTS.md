# Model Connection Requirements

## Current prototype state

- The dashboard model selector is a simulation control only.
- No provider or model is currently connected.
- **Copy** is the only live handoff from Veil to another model.
- The UI must not imply that sanitized content has been sent anywhere.

## Product requirement

JurisCore must sit between the user or application and an explicitly configured model:

`User/application -> JurisCore gateway -> Veil protection -> configured provider/model -> output validation -> response and audit receipt`

JurisCore must not try to guess which model is active. An administrator must configure the provider, model ID, credentials, and allowed use cases.

## Prototype checklist

- [x] Keep the selector labeled **Active model**, paired with an explicit connection status.
- [x] Show **Not connected** while no provider connection exists.
- [x] Keep **Copy** as the manual handoff.
- [x] Show **Send to AI model** as unavailable until a real connection exists.
- [ ] Add a server-side provider connection flow.
- [ ] Store provider credentials on the server, never in browser storage.
- [ ] Add a connection test and show its last verified time.
- [ ] Replace **Not connected** with **Connected - provider name** only after validation succeeds.
- [ ] Enable **Send to configured model** only after a connection passes validation.
- [ ] Run Veil before every model request.
- [ ] Validate model responses before returning them.
- [ ] Produce an audit receipt without retaining raw sensitive values.
- [ ] Support a gateway API so other products can call JurisCore without using this UI.

## Out of scope for this prototype pass

- Automatic model discovery.
- Treating an ordinary MCP tool or data connection as a verified model connection.
- A fake or non-functional send button.
- Provider credential entry in the browser.
- Claiming that the demo model selector represents a live connection.
