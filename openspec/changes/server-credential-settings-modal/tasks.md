## 1. Replace the topbar credential UI

- [x] 1.1 Update `web/index.html` and `web/styles.css` to remove the inline `Token` / `Project ID` controls from the topbar and add a single credential settings icon with modal markup
- [x] 1.2 Style the credential settings modal so it lists the active spec's server rows clearly, supports the fallback no-server case, and provides explicit save/cancel actions

## 2. Implement modal-based credential editing

- [x] 2.1 Refactor `web/app.js` topbar credential state to open/close the modal, build editable rows from the active spec's declared servers, and stage modal edits separately from persisted values
- [x] 2.2 Persist modal saves back to the existing credential store without changing the active viewer server, then refresh visible Try It fields when the currently active server's saved values changed

## 3. Eliminate stale credentials during server switches

- [x] 3.1 Replace the current delayed viewer-server sync path with a single active-server synchronization helper driven by the Stoplight viewer's server selection state
- [x] 3.2 Add a pre-execution credential refresh so a fast Try It action after changing servers still uses the newly selected server's token and project
- [x] 3.3 Manually verify the three declared servers each retain their own token/project pair, the modal restores saved values after reopen, and rapid server switching no longer sends stale credentials
