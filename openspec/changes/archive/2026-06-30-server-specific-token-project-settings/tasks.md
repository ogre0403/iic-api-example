## 1. Swagger metadata generation

- [x] 1.1 Extend the Python metadata generation flow to extract each spec's ordered OpenAPI `servers` list and emit stable server identifiers in `web/specs.json`
- [x] 1.2 Reuse the same generated metadata structure for both nginx mode (`web/specs.json`) and standalone mode (`window.__SPECS_LIST__`) so spec tabs and server lists stay consistent
- [x] 1.3 Preserve specs that do not declare `servers` by emitting an empty server list and verifying `make specs` still succeeds after swagger updates

## 2. Server-scoped credential state and UI

- [x] 2.1 Replace the single global credential state in `web/app.js` with per-spec, per-server persistence plus saved active-server state and legacy global-key fallback
- [x] 2.2 Redesign the top-right controls in `web/index.html` / `web/app.js` to show the active server context, switch between server-specific Token/Project values, and fall back gracefully for specs without servers
- [x] 2.3 Restore the correct active server and credential values when the user switches specs, reloads the page, or opens a spec whose saved server is no longer valid

## 3. Try It synchronization and validation

- [x] 3.1 Update Try It credential injection and clearing logic so bearer token and project values always come from the currently active server context
- [x] 3.2 Synchronize the topbar server control with Stoplight's rendered server selector so changing either side updates the same credential context
- [x] 3.3 Verify the end-to-end behavior in both nginx and standalone flows, including switching servers, specs without `servers`, and regenerated metadata after swagger changes
