# server-scoped-doc-credentials Specification

## Purpose

Persist and apply API documentation credentials (Token and Project ID) on a per-spec, per-server basis so that Try It requests use the correct credentials for the currently active server, and generate the spec/server metadata that drives this behavior from swagger sources.

## Requirements

### Requirement: Persist credentials per spec server
The documentation UI SHALL let the user manage Token and Project ID for each server declared by the active OpenAPI spec from a dedicated credential settings modal.

#### Scenario: Opening the credential settings shows all server records for the active spec
- **WHEN** the user clicks the top-right credential settings icon while viewing a spec that declares servers
- **THEN** a modal SHALL open and show one editable Token and Project ID pair for each declared server in display order
- **THEN** each server row SHALL be pre-filled with that server's saved values, or shown empty when no values have been saved

#### Scenario: Saving from the modal updates only the edited server records
- **WHEN** the user changes one or more server rows in the credential settings modal and saves
- **THEN** the saved credential record for each edited server SHALL be updated independently
- **THEN** credential records for servers not edited in that save SHALL remain unchanged

#### Scenario: Specs without declared servers retain isolated fallback credentials
- **WHEN** the user opens the credential settings modal for a spec that does not define any OpenAPI `servers`
- **THEN** the UI SHALL expose a single fallback credential context for that spec
- **THEN** saving that fallback context SHALL NOT overwrite credentials saved for any other spec

### Requirement: Apply Try It credentials from the active server context
The documentation UI SHALL inject credentials into Try It fields by using the credential record for the server currently selected in the documentation viewer.

#### Scenario: Try It injects the active server's values
- **WHEN** a Try It form is rendered while a server-specific credential record exists for the active viewer-selected server
- **THEN** the bearer token input SHALL be populated with that server's token
- **THEN** any matching project field SHALL be populated with that server's Project ID

#### Scenario: Switching server clears stale values
- **WHEN** the active viewer-selected server changes to a context that has no saved token or Project ID
- **THEN** the documentation UI SHALL clear the corresponding Try It fields
- **THEN** it SHALL NOT retain values that were saved for the previously active server

#### Scenario: Immediate Try It after switching server uses the new server credentials
- **WHEN** the user changes the active server and immediately opens or executes Try It before a delayed viewer refresh completes
- **THEN** the documentation UI SHALL resolve the newly selected server before applying credentials to the request form
- **THEN** the request SHALL use the Token and Project ID saved for the newly selected server, not the previous server

#### Scenario: Re-entering an operation reuses the matching server credentials
- **WHEN** the user navigates to another endpoint or refreshes the rendered operation view while the same active server remains selected
- **THEN** the documentation UI SHALL re-apply the credential record for that active server

### Requirement: Synchronize active server selection with documentation controls
The documentation UI SHALL keep its credential context synchronized with the server currently selected in the documentation viewer and with the credential settings modal.

#### Scenario: Viewer server changes update active credential context immediately
- **WHEN** the user changes the server from a Stoplight-rendered server selector inside the documentation viewer
- **THEN** the active credential context SHALL update in the same interaction cycle
- **THEN** subsequent Try It credential injection SHALL use that server's credential record

#### Scenario: Credential settings reflect the current viewer server without changing it
- **WHEN** the credential settings modal is opened while a server is active in the documentation viewer
- **THEN** the modal SHALL reflect that server as the current context for Try It autofill
- **THEN** saving credential edits SHALL NOT change the active server selected in the documentation viewer

#### Scenario: Saved active server is invalid after metadata refresh
- **WHEN** a previously saved active server is no longer present in the current metadata for a spec
- **THEN** the documentation UI SHALL fall back to the first valid server for that spec
- **THEN** it SHALL use that fallback server for displayed credentials and future injection

### Requirement: Generate spec server metadata from swagger sources
The documentation build tooling SHALL generate `web/specs.json` from `swagger/*.yaml`, including the ordered server definitions declared by each spec.

#### Scenario: Metadata generation includes server definitions
- **WHEN** the metadata generation script processes a swagger file that defines OpenAPI `servers`
- **THEN** the corresponding `web/specs.json` entry SHALL include the spec file name, display label, and ordered list of server definitions for that spec
- **THEN** each generated server entry SHALL include a stable identifier that the frontend can use for persistence

#### Scenario: Metadata generation tracks swagger updates
- **WHEN** a swagger file adds, removes, or edits a server definition and the metadata generation script is rerun
- **THEN** `web/specs.json` SHALL be updated to match the swagger source without manual edits to web assets

#### Scenario: Specs without servers still appear in metadata
- **WHEN** the metadata generation script processes a swagger file that does not define OpenAPI `servers`
- **THEN** `web/specs.json` SHALL still include the spec entry
- **THEN** that entry SHALL expose an empty server list rather than omitting the spec
