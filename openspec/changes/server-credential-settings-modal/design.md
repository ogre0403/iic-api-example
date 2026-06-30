## Context

The current documentation UI exposes `Server`, `Token`, and `Project ID` directly in the top-right navbar. Credential values are persisted in `iic_doc_credentials_v3`, while the active server per spec is tracked in `iic_active_server_v1`. Try It autofill is driven by the current credential context in `web/app.js`.

Today, server synchronization is fragile in two places:

- the viewer-to-topbar sync is driven by click text matching plus `setTimeout(() => selectServer(...), 0)`
- Try It credential refresh is often retriggered later through delayed timers after render or navigation

That combination creates a race: if the user changes the Stoplight server selector and quickly opens or submits Try It, the active credential context can still point at the previous server.

## Goals / Non-Goals

**Goals:**

- Replace the inline navbar credential editors with a single settings icon that opens a modal.
- Let the user review and edit the saved `Token` and `Project ID` for every declared server in the active spec from that modal.
- Keep Try It autofill bound to the currently selected server and prevent stale credentials from surviving a fast server switch.
- Preserve existing persisted credential data and the existing spec/server metadata pipeline.

**Non-Goals:**

- Changing how swagger metadata is generated or how server identifiers are derived.
- Introducing backend persistence or user accounts for credentials.
- Redesigning the rest of the documentation viewer beyond the credential-management affordance.

## Decisions

### 1. Replace inline credential editors with a settings modal

The top-right navbar will show a single credential/settings icon instead of inline `Token` and `Project ID` inputs. Clicking the icon opens a modal that lists the active spec's declared servers in order and provides editable `Token` and `Project ID` fields for each one. For specs without declared servers, the modal will show one fallback credential row.

This keeps the header compact and removes the need to switch server context repeatedly just to inspect three saved credential pairs.

Alternative considered: keep inline inputs and hide them in a collapsible area. Rejected because it still centers the workflow around editing one server at a time and keeps the navbar state-heavy.

### 2. Preserve the current persistence model and stage modal edits in memory

The existing localStorage keys remain the source of truth. Opening the modal creates an in-memory draft copy of the currently relevant credential records. Saving writes the edited rows back to the existing store in one batch; cancelling closes the modal without mutating persisted data.

This avoids a storage migration and lets the UI change stay focused on interaction and timing reliability.

Alternative considered: migrate to a new modal-specific schema. Rejected because it adds data-migration risk without solving the actual bug.

### 3. Make the viewer-selected server the source of truth for active credential context

Once the topbar server selector is removed, the active server must come from the Stoplight viewer. Introduce a single synchronization path that resolves the currently selected viewer server, updates `activeServerId`, refreshes any credential UI state, and then re-applies credentials to visible Try It fields.

That synchronization path should be invoked from:

- viewer server-selector interactions
- viewer re-render or mutation events that can change the rendered server control
- modal save, when the saved row matches the currently active server

Alternative considered: keep the current click listener and add more delayed retries. Rejected because it treats the symptom but leaves a stale-context window.

### 4. Add a pre-execution safeguard before Try It uses credentials

Before a Try It request is executed, the frontend should force one last `syncActiveServerFromViewer()` and `applyCredentialsToTryIt()` pass. This closes the race where Stoplight updates its selected server slightly later than the user interaction that opens or sends the request.

Alternative considered: rely only on render-time MutationObserver refreshes. Rejected because the user-reported failure happens specifically when they click faster than the delayed refresh cycle.

### 5. Saving credentials must not silently change the active server

The modal is for editing saved credentials, not for changing which server the viewer is currently targeting. The active server may be highlighted in the modal, but saving edits must keep the current viewer server selection unchanged.

This avoids surprising context switches and keeps the mental model simple: the viewer chooses the server, the modal manages the stored credentials for those servers.

## Risks / Trade-offs

- [Stoplight's internal DOM is not a stable API] -> Keep viewer-server detection isolated behind a small helper and preserve a safe fallback to the previously resolved active server when detection fails.
- [Modal draft state can drift from saved state] -> Use explicit `Save` and `Cancel` actions and only write localStorage on `Save`.
- [Extra credential re-apply hooks can overwrite user-entered values] -> Restrict forced updates to credential fields and keep existing skip-if-already-correct checks.
- [Existing credential sharing behavior may still surprise users across specs] -> Preserve the current persistence model in this change and avoid mixing UI/timing work with broader storage semantics changes.

## Migration Plan

- Ship the frontend changes without changing the existing credential storage keys.
- On first load after deployment, the modal reads and displays the same saved records that the inline inputs used before.
- Rollback can restore the old UI without losing data because persisted records remain compatible.

## Open Questions

- Should the modal visually mark the currently active server row, or is row ordering alone sufficient?
- For specs without declared servers, should the settings icon always remain available with a single fallback row, or should that case receive a smaller simplified modal?
