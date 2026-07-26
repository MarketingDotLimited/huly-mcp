# @firfi/huly-cli

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
