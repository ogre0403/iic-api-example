## Why

The current top-right credential area exposes per-server `Token` and `Project ID` directly in the navbar, which makes the header crowded and increases the chance of editing the wrong server context. In addition, the active server context can lag behind Stoplight's rendered server selector, so users who trigger Try It immediately after switching servers can send requests with the previous server's credentials.

## What Changes

- Replace the top-right per-server `Token` and `Project ID` inputs with a single settings icon that opens a modal for managing server-specific credentials.
- Show the declared servers for the active spec in that modal and allow the user to edit each server's `Token` and `Project ID` from one place, then persist those values on save.
- Keep Try It credential injection tied to the currently selected server so requests automatically use the matching saved `Token` and `Project ID`.
- Tighten server-selection synchronization so switching servers updates the active credential context before Try It can reuse stale values from the previous server.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `server-scoped-doc-credentials`: change the credential-management UI from inline navbar inputs to a settings modal, and require immediate synchronization between the active server and Try It credential injection.

## Impact

- Affected specs: `openspec/specs/server-scoped-doc-credentials/spec.md`
- Affected frontend: `web/index.html`, `web/styles.css`, `web/app.js`
- Affected behavior: topbar credential controls, modal state management, server-selection synchronization, and Try It credential autofill
