# @firfi/huly-cli

## 0.46.0

### Minor Changes

- 29a2b13: Add an explicit Gmail/Telegram message compatibility assessment. Gmail reports `supported=false` because Huly does not expose the live deployment-wide writer version needed to distinguish current v1 records from stale data after a v2 upgrade; Telegram remains unsupported without a compatible published package.
- 6dfa416: Add locator-backed pinned channel and direct-message workflows, plus explicit unsupported results for channel request-access and browser-only translation.
- 3dc27ca: Add guarded Huly enum and custom-attribute model administration with name-aware resolution, reference checks, and safe hide/unhide support.
- 798c2b2: Add guarded permission definitions, typed-space role definition writes, and class collaborator metadata administration with clear-name resolution and local-Huly lifecycle coverage.
- bd19f35: Add generic workflow status and status-category CRUD tools with relationship-aware resolution and lifecycle safeguards.
- cec66fb: Add guarded Sequence and CustomSequence administration with atomic retry protection, identifier resolution, and local-Huly rollback coverage.
- a9436d0: Add metadata-gated generic typed-space creation and global space-admin discovery and replacement tools.

## 0.45.0

### Minor Changes

- e8dc993: Clarify upload source locations across file tools and add `read_attachment_content`, which returns supported images as a single MCP image block through native and proxy invocation with metadata-only structured content, bounded storage reads, redacted failures, CLI image descriptors, and a 4 MiB safety limit.
- d38cf78: Add complete card-comment CRUD with friendly card-space and card locators, compatible Huly-native comment reads, markdown native-reference preservation, pagination, and actionable not-found errors.
- bb3044d: Expose coherent card version metadata and truthful, deterministic, read-only card version history.

### Patch Changes

- 9553bc7: Parse date custom-field inputs into finite Unix-millisecond values before Huly writes, with strict documented ISO calendar-date and epoch-millisecond forms plus actionable typed failures for invalid values.

## 0.44.0

### Minor Changes

- 0befdbe: Publish the first standalone Huly CLI package backed by the shared operation registry.

### Patch Changes

- 2e060eb: Add optional CLI telemetry and tag PostHog events with package/surface discriminators.
