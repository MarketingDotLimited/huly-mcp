# Issue #238: `MarkupContent` comment reads

Date: 2026-08-27

## Conclusion

[Issue #238](https://github.com/dearlordylord/huly-mcp/issues/238) is valid. `list_comments` does not crash the
server, but one comment whose runtime `message` value is a `MarkupContent` object makes the whole operation fail and
the MCP boundary reports an unrelated connection error. The immediate defect is a runtime boundary mismatch:
Huly's SDK type says `ChatMessage.message` is the string alias `Markup`, while persisted data can contain the
API-client shape `{ content: string, kind: "markdown" | "html" | "markup" }`.

The fix should parse that observed runtime union with Effect Schema before conversion, then render each supported
format. A `typeof value === "object"` branch plus `JSON.stringify(value)` is not sufficient: it neither validates
the object nor interprets `html` and `markup` according to their declared formats. Locally, the issue's proposed
`markupToMarkdownString(JSON.stringify(value))` fallback rendered an empty string for all three `MarkupContent`
kinds.

**Ticket disposition:** this is one self-contained compatibility fix; it does not need a formal specification or a
second implementation ticket. The upstream `MarkupContent` definition supplies the three format semantics and the
issue supplies the missing runtime evidence. The chosen wide fix owns normalization at the shared rich-text read
boundary, all affected readers, accurate classification of malformed stored payloads, and regression tests. It also
repairs the audited schema/domain-integrity paths that were incorrectly surfaced as connection failures. A narrow
`list_comments`-only patch would not be complete.

## Evidence and failure chain

1. The reporter reproduced the failure with `@firfi/huly-mcp` 0.49.5 and `@hcengineering/api-client` 0.7.423,
   after creating a comment with `new MarkupContent("## Test", "markdown")`. The issue has no follow-up comments or
   linked fix as of this report. ([issue](https://github.com/dearlordylord/huly-mcp/issues/238))
2. Huly's official API-client source defines `MarkupContent` with public `content` and `kind` fields, where `kind`
   is exactly `"markup" | "html" | "markdown"`.
   ([official source](https://github.com/hcengineering/huly.core/blob/981aaf40752109e78f8bb7ac20ee9aa33e110ea1/packages/api-client/src/markup/types.ts))
   The [published 0.7.423 tarball](https://registry.npmjs.org/@hcengineering/api-client/-/api-client-0.7.423.tgz)
   contains the same definition. This class is an API-client **write-input wrapper**, not the storage type: official
   `ChatMessage.message` is `Markup`, and
   [Huly core defines `Markup` as a string](https://github.com/hcengineering/huly.core/blob/981aaf40752109e78f8bb7ac20ee9aa33e110ea1/packages/core/src/classes.ts).
   The report therefore demonstrates a wrapper that escaped the expected API-client normalization/persistence path,
   not a second documented `ChatMessage` representation.
3. `listComments` reads `ChatMessage` documents and sends `msg.message` directly to
   `optionalMarkupToMarkdown`; it then decodes the complete mapped array with `Schema.Array(CommentSchema)`.
   ([comments.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/comments.ts#L76-L104))
4. `optionalMarkupToMarkdown` only distinguishes nullish values and otherwise calls
   `markupToMarkdownString`, whose parameter is statically `Markup` (a string).
   ([markup.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/markup.ts#L146-L149),
   [optional helper](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/markup.ts#L290-L306))
5. The installed, project-pinned `@hcengineering/text-core` implementation calls `markup.startsWith("{")`
   inside a `try`, then converts any caught error to an empty markup node. Passing
   `{ content: "## Test", kind: "markdown" }` was reproduced locally and returned an empty document node, not a
   thrown error. This behavior is also present in Huly's
   [official `markupToJSON` source](https://github.com/hcengineering/huly.core/blob/981aaf40752109e78f8bb7ac20ee9aa33e110ea1/packages/text-core/src/markup/utils.ts).
   Serializing the wrapper first does not repair it: the parsed `{ content, kind }` object is not a ProseMirror node,
   and local checks for `markdown`, `html`, and `markup` wrappers all produced empty Markdown.
6. The resulting Markdown is empty, but `CommentSchema.body` is `NonEmptyString`, so the array decode fails. Because
   the array is decoded as one value, one incompatible message prevents every otherwise valid comment from being
   returned.
   ([comments schema](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/domain/schemas/comments.ts#L13-L24))
7. `listComments` converts that parse error to `HulyConnectionError`; the MCP mapper deliberately replaces every
   such error's details with network/configuration advice. That explains the exact user-visible message and why it
   masks a payload compatibility error.
   ([operation mapping](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/comments.ts#L96-L103),
   [MCP mapping](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/mcp/error-mapping.ts#L274-L281))

There is also a possible **upstream prevention** concern, separate from the MCP read fix. The official API-client's
`processMarkup` recognizes `MarkupContent`, but assigns the promise returned by `uploadMarkup` into the outgoing
data without awaiting it. This is present in the pinned 0.7.423 source and current upstream source. It deserves an
upstream report, but it does not establish how this particular wrapper reached storage: `ChatMessage.message` is an
inline string `Markup`, not a `CollaborativeDoc`, and the issue only proves the persisted value and read failure.
([pinned upstream implementation](https://github.com/hcengineering/huly.core/blob/981aaf40752109e78f8bb7ac20ee9aa33e110ea1/packages/api-client/src/client.ts#L154-L165),
[current upstream implementation](https://github.com/hcengineering/huly.core/blob/main/packages/api-client/src/client.ts#L154-L165))

The string-only assumption entered with the initial comments implementation in commit `4709ede`; schema validation
was added later in `3148e99`, and commit `5328b47` maps that parse failure to `HulyConnectionError`. The generic
user-facing connection diagnostic comes from `954696a`. No later history adds object-format handling.

## Affected scope

The confirmed user-facing failure is `list_comments`. The vulnerable conversion is shared more broadly:

- `list_card_comments`, Recruiting attachment comments, and Inventory product comments all use
  `listAttachedCommentsPage`, the same converter, and the same non-empty `CommentSchema` array decode.
  ([attached-comments.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/attached-comments.ts#L47-L71))
- Drive file comments duplicate the same conversion/decode pattern.
  ([drive-comments.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/drive-comments.ts#L88-L110))
- Document inline-comment replies and several description/review/template readers also call the helper. Their output
  schemas do not all require non-empty text, so object values may silently become empty text rather than fail. This
  is data loss even where no MCP error occurs.

The repository itself writes issue comments as serialized ProseMirror markup via `markdownToMarkupString`, so its
own `add_comment` path is not expected to create the incompatible shape. The risk is existing or third-party-written
Huly data.

## Holistic codebase audit

The rest of the repository contains both the **same rich-text boundary defect** and **similar but distinct boundary
risks**. They should not all be described as confirmed instances of the reporter's storage shape.

### A. Same root cause: chat `message` fields

Every direct `ChatMessage.message` or `ThreadMessage.message` conversion assumes the SDK's static `Markup` alias is
the runtime truth. An escaped `{ content, kind }` wrapper reaches `markupToJSON`, whose catch-all converts the type
error into an empty node. The effect then depends on the consumer's output schema:

| Reader family | Runtime result for the reported wrapper | Scope decision |
| --- | --- | --- |
| Issue comments (`list_comments`) | The one mapped array is decoded as `Schema.Array(CommentSchema)`; empty body violates `NonEmptyString`, the full call fails, then the parse error becomes `HulyConnectionError`. | Confirmed #238 path. |
| Card, Recruiting, and Inventory comments | Shared `listAttachedCommentsPage` has the same whole-array decode and connection-error mapping. | Include in #238 because the same shared code and payload field are involved. |
| Drive file comments | Duplicates the same converter, whole-array decode, and connection-error mapping. | Include in #238 or refactor onto the shared comment decoder as part of it. |
| Channel messages, direct messages, thread replies, and pinned messages/replies | Their read models allow `body: string`; the empty conversion succeeds and silently loses content. | Include in the shared normalization regression surface. |
| Document inline-comment replies | `InlineCommentReply.body` is also `Schema.String`, so the incompatible value becomes an empty reply body. | Include in the shared normalization regression surface. |
| Activity messages/replies | `HulyActivityRecordSchema` parses `message` as `ActivityMarkup` (a branded string) before conversion. One object fails `Effect.forEach`, so the full page fails with the accurately named `ActivityRecordInvalidError`; it is not mislabeled as a connection failure. | Reuse the same boundary parser if wrapper compatibility is desired; its current error classification is already sound. |

The direct call-site evidence is in
[`comments.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/comments.ts#L76-L104),
[`attached-comments.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/attached-comments.ts#L47-L71),
[`drive-comments.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/drive-comments.ts#L88-L110),
[`channels.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/channels.ts#L338-L370),
[`direct-messages.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/direct-messages.ts#L113-L145),
[`threads.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/threads.ts#L67-L98),
[`chat-message-workflows.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/chat-message-workflows.ts#L89-L105), and
[`documents-inline-comments.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/documents-inline-comments.ts#L105-L137).
Activity records instead parse their boundary in
[`activity-shared.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/activity-shared.ts#L22-L41), then fail the collection traversal on one invalid record in the
[same module](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/activity-shared.ts#L80-L128).

### B. Structurally similar rich-text risks, not confirmed #238 occurrences

The same string-only converter is also used for Card, Component, Milestone, issue-template, message-template,
Recruiting review/opinion/match, and board-description fields. If any of those persisted fields contain an object
instead of the SDK-declared string `Markup`, they can also become empty Markdown. No issue, fixture, or upstream read
contract examined here shows that those fields currently contain `MarkupContent`; they are risk sites, not confirmed
defects. The complete production call-site list is discoverable from the two exports in
[`markup.ts`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/markup.ts#L146-L149) and
[`optionalMarkupToMarkdown`](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/markup.ts#L290-L306).

Telegram external-channel messages are a useful counterexample: the code parses `content` as `Schema.String` before
conversion and maps an incompatible payload to `HulyError`, so an object fails explicitly rather than becoming empty
or being called a connection problem.
([external-channel-messages.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/external-channel-messages.ts#L43-L55),
[parser](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/external-channel-messages.ts#L118-L122))

### C. Whole-collection decoding has a wider blast-radius pattern

Comments are not the only operations that decode a complete mapped result array in one call. `listProjects`,
`listIssues`, and `listLeads` do the same with `Schema.Array(...)`; one malformed projection therefore rejects the
entire result set. Their schemas and data differ, so this is the same failure-amplification pattern, not the same
`MarkupContent` root cause.
([projects.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/projects.ts#L45-L86),
[issues-read.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/issues-read.ts#L350-L382),
[leads.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/leads.ts#L284-L318))

Whether those list operations should be fail-fast, skip invalid rows with warnings, or return per-row errors is an
LLM-facing API policy decision. It is outside #238 because changing it alters partial-result semantics across tools.
It belongs in the boundary/error-taxonomy follow-up rather than being silently changed with the comment fix.

### D. Schema/domain failures are broadly mislabeled as connection failures

The comment symptom is part of a systemic taxonomy issue. At this revision, 18 production messages in Huly
operations explicitly say `failed schema validation` and construct `HulyConnectionError`; other uses apply the same
tag to missing model metadata or inconsistent references. The error class itself is documented as
`network/transport failures`, and the MCP mapper intentionally turns every instance into URL/workspace/network
guidance. That makes the advice wrong for payload, persistence, and domain-integrity failures.
([error definition](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/errors-base.ts#L34-L42),
[MCP mapping](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/mcp/error-mapping.ts#L274-L281),
[operation occurrences](https://github.com/dearlordylord/huly-mcp/search?q=%22failed+schema+validation%22&type=code))

Not every `HulyConnectionError` is suspect. Connection/bootstrap failures are classified at client acquisition, and
SDK operation promises such as `findAll`, `uploadMarkup`, and `fetchMarkup` are wrapped at the imperative adapter;
those are legitimate transport/integration mappings because the caught cause comes from the remote operation.
([connection classification](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/client.ts#L110-L140),
[SDK adapter](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/client.ts#L351-L362),
[markup adapter](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/client.ts#L516-L534))

### E. Catch-to-empty/default audit

The dangerous fallback in this incident is upstream `markupToJSON` swallowing every conversion exception and
returning an empty markup node. The local rich-text wrapper neither detects nor reports that fallback. The local
search found one other broad catch-to-empty-array in production: workflow-status duplicate recovery deliberately
returns `[]` after an older Huly server rejects its optional cross-project query. Its comment cites issue #34 and
states the degradation policy, so it is intentional compatibility behavior rather than another #238-class defect.
([task-management.ts](https://github.com/dearlordylord/huly-mcp/blob/a955dce5a76b0c64b26334cb3fa4c0d6cb1ef0a1/src/huly/operations/task-management.ts#L184-L199))

### Concrete ticketing recommendation

1. Keep **#238 as one bug fix**, with no separate formal spec. Its acceptance scope should cover a schema-derived
   `string | MarkupContent` parser, all three wrapper kinds, shared chat/comment conversion, correct malformed-payload
   errors, and mixed-record tests. The exact same chat-message consumers listed in section A are part of avoiding a
   knowingly partial fix.
2. File **one separate hardening ticket** for error taxonomy and collection failure policy. Inventory the 18 explicit
   schema-validation-to-connection mappings plus domain-integrity uses, introduce an accurately named typed boundary
   error, decide fail-fast versus warning-bearing partial results, and preserve genuine client/transport mappings.
3. Do **not** open individual tickets for every description/template converter call site without a reproducer. Once
   the shared parser exists, migrate those sites when their actual boundary type is established; otherwise record
   them as audit coverage in the hardening ticket.
4. Optionally file an **upstream huly.core prevention issue** for `processMarkup` not awaiting `uploadMarkup`. Keep it
   separate from #238 and describe it as an independently observed API-client defect, not the proven cause of the
   persisted comment wrapper.

## Recommended implementation

1. Define an Effect Schema at the Huly read boundary for the actual runtime union: string markup or a struct with
   string `content` and literal `kind` values. Derive its TypeScript type from the schema; do not widen the existing
   SDK type with a cast.
2. Parse before conversion and carry malformed/unknown shapes in a typed Effect error channel with operation and
   field context. Do not label schema incompatibility as a network failure.
3. Convert by format: return Markdown content directly; feed `kind: "markup"` content through the existing markup
   converter; convert `kind: "html"` through the existing HTML-to-node and node-to-Markdown functions. Preserve the
   current string behavior.
4. Make the shared path own this normalization so all call sites receive the compatibility fix. Decide explicitly
   how a genuinely empty comment should be represented; do not rely on `markupToJSON`'s catch-all empty node.

## Verification required with the fix

- Add focused markup tests for string markup and all three valid object kinds, plus nullish, empty-content, unknown
  kind, missing field, and unrelated-object cases.
- Add a `listComments` test using the existing `HulyClient` test Layer with a mixed array containing serialized
  markup and `{ content: "## Test", kind: "markdown" }`; assert both comments return and the Markdown body is intact.
  Add equivalent coverage for the shared attached-comment path so the broader fix cannot regress.
- Keep invalid runtime shapes as a typed, accurately classified boundary failure and test the MCP-facing message.
- Run `pnpm check-all`, then the required local-Docker integration: create a comment through the 0.7.423 REST path
  with `MarkupContent`, read it through `list_comments`, and verify a mixed-format issue remains fully readable.
