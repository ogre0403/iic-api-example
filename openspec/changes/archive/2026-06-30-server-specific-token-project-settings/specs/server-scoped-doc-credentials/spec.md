## ADDED Requirements

### Requirement: Persist credentials per spec server
The documentation UI SHALL persist Token and Project ID independently for each server declared by the active OpenAPI spec.

#### Scenario: Saving credentials updates only the active server context
- **WHEN** the user is viewing a spec with declared servers and edits Token or Project ID while server `A` is active
- **THEN** the saved credential record SHALL be associated only with that spec and server `A`
- **THEN** credential records for other servers in the same spec SHALL remain unchanged

#### Scenario: Switching servers restores that server's saved values
- **WHEN** the active server changes from server `A` to server `B`
- **THEN** the top-right Token and Project ID inputs SHALL display the saved values for server `B`
- **THEN** if server `B` has no saved values, the inputs SHALL be shown as empty

#### Scenario: Specs without declared servers retain isolated fallback credentials
- **WHEN** the user opens a spec that does not define any OpenAPI `servers`
- **THEN** the documentation UI SHALL use a per-spec fallback credential context
- **THEN** saving credentials for that spec SHALL NOT overwrite credentials saved for any other spec

### Requirement: Apply Try It credentials from the active server context
The documentation UI SHALL inject credentials into Try It fields by using the credential record for the currently active server context.

#### Scenario: Try It injects the active server's values
- **WHEN** a Try It form is rendered while a server-specific credential record exists for the active server
- **THEN** the bearer token input SHALL be populated with that server's token
- **THEN** any matching project field SHALL be populated with that server's Project ID

#### Scenario: Switching server clears stale values
- **WHEN** the active server changes to a context that has no saved token or Project ID
- **THEN** the documentation UI SHALL clear the corresponding Try It fields
- **THEN** it SHALL NOT retain values that were saved for the previously active server

#### Scenario: Re-entering an operation reuses the matching server credentials
- **WHEN** the user navigates to another endpoint or refreshes the rendered operation view while the same active server remains selected
- **THEN** the documentation UI SHALL re-apply the credential record for that active server

### Requirement: Synchronize active server selection with documentation controls
The documentation UI SHALL keep its credential context synchronized with the server currently selected for the active spec.

#### Scenario: Topbar server selection drives credential context
- **WHEN** the user selects a different server from the top-right server control
- **THEN** the documentation UI SHALL update the active server for the current spec
- **THEN** the Token and Project ID inputs SHALL switch to that server's credential record

#### Scenario: Viewer server changes update the topbar context
- **WHEN** the user changes the server from a Stoplight-rendered server selector inside the documentation viewer
- **THEN** the top-right server control SHALL update to the same server
- **THEN** subsequent Try It credential injection SHALL use that server's credential record

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
