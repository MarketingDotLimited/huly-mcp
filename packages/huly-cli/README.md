# Huly CLI

Command-line frontend for the Huly operations shipped by [`@firfi/huly-mcp`](https://www.npmjs.com/package/@firfi/huly-mcp).

The CLI uses the same schema-owned operation registry as the MCP server. It does not proxy through MCP, JSON-RPC, or `tools/call`.

## Installation

```bash
npx -y @firfi/huly-cli@latest --help
```

Or install it globally:

```bash
npm install -g @firfi/huly-cli
huly --help
```

## Configuration

The CLI reads the same Huly environment variables as the MCP server:

> **Hosted Huly is shutting down.** If you use `https://huly.app`, follow Huly's [migration announcement](https://github.com/hcengineering/platform/blob/develop/README.md), [backup and restore guide](https://github.com/hcengineering/platform/blob/develop/docs/guides/backup-restore.en.md), and [self-hosting instructions](https://github.com/hcengineering/huly-selfhost). Self-hosted deployments are not affected.

```bash
export HULY_URL=https://your-huly-instance.example.com
export HULY_WORKSPACE=yourworkspace
export HULY_EMAIL=your@email.com
export HULY_PASSWORD=yourpassword
```

You can use `HULY_TOKEN` instead of `HULY_EMAIL` and `HULY_PASSWORD`. `HULY_CONNECTION_TIMEOUT` is also supported.

Aggregate CLI analytics are enabled by default and can be disabled with:

```bash
export HULY_CLI_TELEMETRY=0
```

The CLI uses the same PostHog project as `@firfi/huly-mcp`, but events are tagged with `surface=cli` and `package_name=@firfi/huly-cli` so CLI and MCP usage can be separated. Set `HULY_CLI_TELEMETRY_DEBUG=1` to print telemetry debug logs.

## Usage

Every command supports `--json`, `--input-json '<object>'`, and `--input-file path/to/input.json`. Explicit command-line flags override JSON/file input.

```bash
huly projects list
huly projects list --json
huly issues get PROJ 123 --json
huly issues create --project PROJ --title "Fix login flow" --description-file ./body.md
huly comments delete --comment-id 0123456789abcdef --yes
huly attachments download 0123456789abcdef --output ./attachment.bin
huly search "customer import"
```

Run `huly --help` for the generated command tree.

<!-- CLI_COMMAND_REFERENCE_START -->
<!-- Generated from cliCommandCatalog and shared operation schemas. Run `pnpm update-cli-readme`. -->
## Complete command reference

All commands also accept `--json`, `--input-json <object>`, and `--input-file <path>`. Explicit flags override JSON sources. Structured fields accept JSON. A field shown as a positional may also be supplied by its generated flag.

| Command | Purpose and behavior | Field flags |
| --- | --- | --- |
| `huly activity filters list` | List Activity Filters | `--limit` |
| `huly activity list` | List Activity | `--project`, `--issue-identifier`, `--limit`, `--teamspace`, `--document`, `--channel`, `--object-id`, `--object-class` |
| `huly activity mentions list` | List Mentions | `--limit` |
| `huly activity messages get` | Get Activity Message | — |
| `huly activity messages pin` | Pin Activity Message | — |
| `huly activity messages save` | Save Message | — |
| `huly activity messages unsave` | Unsave Message | — |
| `huly activity reactions add` | Add Reaction | — |
| `huly activity reactions list` | List Reactions | `--limit` |
| `huly activity reactions remove` | Remove Reaction Requires `--yes`. | — |
| `huly activity references list` | List Activity References | `--direction`, `--limit` |
| `huly activity replies add` | Add Activity Reply | `--body-file` |
| `huly activity replies delete` | Delete Activity Reply Requires `--yes`. | — |
| `huly activity replies list` | List Activity Replies | `--limit` |
| `huly activity replies update` | Update Activity Reply | `--body-file` |
| `huly activity saved list` | List Saved Messages | `--limit` |
| `huly approvals add` | Add an approval request; pass --requested and --tx as JSON Requires `--yes`. | `--space`, `--collection`, `--requested`, `--required-approves-count`, `--tx`, `--rejected-tx` |
| `huly approvals approve` | Approve a request as the current Huly actor Requires `--yes`. | `--comment` |
| `huly approvals cancel` | Cancel Approval Request Requires `--yes`. | — |
| `huly approvals comments add` | Add Approval Request Comment | `--body-file` |
| `huly approvals get` | Get Approval Request | — |
| `huly approvals list` | List Approval Requests | `--status`, `--attached-to`, `--attached-to-class`, `--limit` |
| `huly approvals reject` | Reject a request as the current Huly actor Requires `--yes`. | — |
| `huly associations create` | Create a generic association definition | `--automation-only`, `--if-exists` |
| `huly associations delete` | Delete an unused association definition Requires `--yes`. | — |
| `huly attachments add` | Add an attachment to a raw Huly object. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--kind`, `--description-file`, `--data-base64-file` |
| `huly attachments add-to-document` | Add an attachment to a document. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--teamspace`, `--document`, `--filename`, `--content-type`, `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--kind`, `--description-file`, `--data-base64-file` |
| `huly attachments add-to-issue` | Add an attachment to an issue. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--project`, `--identifier`, `--filename`, `--content-type`, `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--kind`, `--description-file`, `--data-base64-file` |
| `huly attachments delete` | Delete Attachment Requires `--yes`. | — |
| `huly attachments download` | Resolve or download an attachment Supports `--output <path>`. | — |
| `huly attachments get` | Get attachment metadata | — |
| `huly attachments list` | List attachments | `--object-id`, `--object-class`, `--limit` |
| `huly attachments pin` | Pin Attachment | — |
| `huly attachments read-image` | Read a supported image attachment; use --output to write its decoded bytes Supports `--output <path>`. | — |
| `huly attachments save` | Save Attachment | — |
| `huly attachments saved list` | List Saved Attachments | `--limit` |
| `huly attachments unsave` | Unsave Attachment | — |
| `huly attachments update` | Update Attachment | `--description`, `--pinned`, `--description-file` |
| `huly boards archive` | Archive Board | — |
| `huly boards cards archive` | Archive Board Card | — |
| `huly boards cards create` | Create Board Card | `--description`, `--kind`, `--status`, `--assignee`, `--members`, `--location`, `--cover`, `--start-date`, `--due-date`, `--description-file` |
| `huly boards cards delete` | Delete Board Card Requires `--yes`. | — |
| `huly boards cards get` | Get Board Card | — |
| `huly boards cards labels add` | Add Board Card Label | `--color`, `--category` |
| `huly boards cards labels list` | List Board Card Labels | — |
| `huly boards cards labels remove` | Remove Board Card Label Requires `--yes`. | — |
| `huly boards cards list` | List Board Cards | `--include-archived`, `--title-search`, `--limit` |
| `huly boards cards unarchive` | Unarchive Board Card Requires `--yes`. | — |
| `huly boards cards update` | Update Board Card | `--title`, `--description`, `--status`, `--assignee`, `--members`, `--add-members`, `--remove-members`, `--location`, `--cover`, `--start-date`, `--due-date`, `--description-file` |
| `huly boards common-preference get` | Get Board Common Preference | — |
| `huly boards create` | Create Board | `--description`, `--private`, `--project-type`, `--description-file` |
| `huly boards get` | Get Board | — |
| `huly boards labels create` | Create Board Label | `--color`, `--description`, `--category`, `--description-file` |
| `huly boards labels delete` | Delete Board Label Requires `--yes`. | — |
| `huly boards labels list` | List Board Labels | `--category`, `--title-search`, `--limit` |
| `huly boards labels update` | Update Board Label | `--title`, `--color`, `--description`, `--category`, `--description-file` |
| `huly boards list` | List Boards | `--include-archived`, `--limit` |
| `huly boards menu-pages list` | List Board Menu Pages | `--page`, `--limit` |
| `huly boards saved-views get` | Get Board Saved View | — |
| `huly boards saved-views list` | List Board Saved Views | `--visibility`, `--name-search`, `--limit` |
| `huly boards unarchive` | Unarchive Board Requires `--yes`. | — |
| `huly boards update` | Update Board | `--name`, `--description`, `--private`, `--description-file` |
| `huly boards viewlets list` | List Board Viewlets | `--viewlet`, `--limit` |
| `huly calendar calendars list` | List Calendars | — |
| `huly calendar events create` | Create a calendar event | `--description`, `--due-date`, `--all-day`, `--location`, `--participants`, `--external-participants`, `--reminders`, `--access`, `--time-zone`, `--block-time`, `--visibility`, `--calendar-id`, `--calendar-name`, `--description-file` |
| `huly calendar events delete` | Delete Event Requires `--yes`. | — |
| `huly calendar events get` | Get Event | — |
| `huly calendar events instances list` | List Event Instances | `--from`, `--to`, `--limit`, `--include-participants` |
| `huly calendar events list` | List Events | `--from`, `--to`, `--limit` |
| `huly calendar events recurring create` | Create a recurring event; pass --rules as JSON | `--description`, `--due-date`, `--rules`, `--all-day`, `--location`, `--participants`, `--external-participants`, `--reminders`, `--time-zone`, `--access`, `--block-time`, `--visibility`, `--calendar-id`, `--calendar-name`, `--description-file` |
| `huly calendar events recurring list` | List Recurring Events | `--limit` |
| `huly calendar events update` | Update a calendar event | `--title`, `--description`, `--date`, `--due-date`, `--all-day`, `--location`, `--visibility`, `--participants`, `--add-participants`, `--remove-participants`, `--external-participants`, `--add-external-participants`, `--remove-external-participants`, `--reminders`, `--access`, `--time-zone`, `--block-time`, `--calendar-id`, `--calendar-name`, `--description-file` |
| `huly calendar schedules create` | Create a calendar schedule; pass --availability as JSON | `--owner`, `--description`, `--meeting-duration`, `--meeting-interval`, `--availability`, `--time-zone`, `--calendar-id`, `--calendar-name` |
| `huly calendar schedules delete` | Delete Schedule Requires `--yes`. | — |
| `huly calendar schedules get` | Get Schedule | — |
| `huly calendar schedules list` | List Schedules | `--owner`, `--limit` |
| `huly calendar schedules update` | Update a calendar schedule; pass --availability as JSON | `--owner`, `--title`, `--description`, `--meeting-duration`, `--meeting-interval`, `--availability`, `--time-zone`, `--calendar-id`, `--calendar-name` |
| `huly cards comments add` | Add Card Comment | `--body-file` |
| `huly cards comments delete` | Delete Card Comment Requires `--yes`. | — |
| `huly cards comments list` | List Card Comments | `--limit` |
| `huly cards comments update` | Update Card Comment | `--body-file` |
| `huly cards create` | Create Card | `--content`, `--parent`, `--content-file` |
| `huly cards delete` | Delete Card Requires `--yes`. | — |
| `huly cards get` | Get Card | — |
| `huly cards list` | List Cards | `--type`, `--title-search`, `--title-regex`, `--content-search`, `--limit` |
| `huly cards master-tags list` | List Master Tags | — |
| `huly cards spaces list` | List Card Spaces | `--include-archived`, `--limit` |
| `huly cards update` | Update Card | `--title`, `--content`, `--content-file` |
| `huly cards versions list` | List Card Versions | `--limit` |
| `huly channels access request` | Request Channel Access Requires `--yes`. | — |
| `huly channels archive` | Archive Channel | — |
| `huly channels conversations closed set` | Set Conversation Closed | `--channel`, `--dm` |
| `huly channels conversations starred set` | Set Conversation Starred | `--channel`, `--dm` |
| `huly channels create` | Create Channel | `--topic`, `--private` |
| `huly channels delete` | Delete Channel Requires `--yes`. | — |
| `huly channels direct-messages create` | Create Direct Message | — |
| `huly channels direct-messages list` | List Direct Messages | `--limit` |
| `huly channels direct-messages messages delete` | Delete a direct-message message Requires `--yes`. | — |
| `huly channels direct-messages messages list` | List Dm Messages | `--limit` |
| `huly channels direct-messages messages send` | Send a direct message | `--body-file` |
| `huly channels direct-messages messages update` | Update a direct-message message | `--body-file` |
| `huly channels external-messages list` | List External Channel Messages | `--limit` |
| `huly channels get` | Get Channel | — |
| `huly channels group-direct-messages create` | Create Group Direct Message | — |
| `huly channels join` | Join Channel Requires `--yes`. | — |
| `huly channels leave` | Leave Channel Requires `--yes`. | — |
| `huly channels list` | List Channels | `--name-search`, `--name-regex`, `--topic-search`, `--limit`, `--include-archived` |
| `huly channels members add` | Add Channel Members | — |
| `huly channels members list` | List Channel Members | — |
| `huly channels members remove` | Remove Channel Members Requires `--yes`. | — |
| `huly channels messages attachments add` | Attach a file to a channel, direct-message, or thread message; pass --target as JSON. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--target`, `--filename`, `--content-type`, `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--description-file`, `--data-base64-file` |
| `huly channels messages attachments delete` | Delete Chat Message Attachment Requires `--yes`. | — |
| `huly channels messages attachments get` | Get Chat Message Attachment | — |
| `huly channels messages attachments list` | List Chat Message Attachments | `--limit` |
| `huly channels messages attachments update` | Update Chat Message Attachment | `--description`, `--pinned`, `--description-file` |
| `huly channels messages delete` | Delete a channel message Requires `--yes`. | — |
| `huly channels messages list` | List Channel Messages | `--limit` |
| `huly channels messages pinned list` | List Pinned Chat Messages | `--channel`, `--dm`, `--limit` |
| `huly channels messages pinned set` | Set Chat Message Pinned | `--channel`, `--dm` |
| `huly channels messages send` | Send a message to a channel | `--body-file` |
| `huly channels messages translate` | Translate Chat Message Requires `--yes`. | `--channel`, `--dm` |
| `huly channels messages update` | Update a channel message | `--body-file` |
| `huly channels threads replies add` | Reply to a channel message | `--body-file` |
| `huly channels threads replies delete` | Delete a thread reply Requires `--yes`. | — |
| `huly channels threads replies list` | List Thread Replies | `--limit` |
| `huly channels threads replies update` | Update a thread reply | `--body-file` |
| `huly channels unarchive` | Unarchive Channel Requires `--yes`. | — |
| `huly channels update` | Update Channel | `--name`, `--topic` |
| `huly collaborators object list` | List Object Collaborators | `--object-id`, `--object-class`, `--project`, `--issue-identifier`, `--teamspace`, `--document`, `--limit` |
| `huly comments add` | Add an issue comment | `--project`, `--issue-identifier`, `--body`, `--body-file` |
| `huly comments delete` | Delete an issue comment Requires `--yes`. | `--project`, `--issue-identifier`, `--comment-id` |
| `huly comments list` | List issue comments | `--project`, `--issue-identifier`, `--limit` |
| `huly comments update` | Update an issue comment | `--project`, `--issue-identifier`, `--comment-id`, `--body`, `--body-file` |
| `huly components create` | Create Component | `--description`, `--lead`, `--description-file` |
| `huly components delete` | Delete Component Requires `--yes`. | — |
| `huly components get` | Get a component | `--project`, `--component` |
| `huly components list` | List components | `--project`, `--limit` |
| `huly components update` | Update Component | `--label`, `--description`, `--lead`, `--description-file` |
| `huly contacts channel-providers list` | List Contact Channel Providers | — |
| `huly contacts employees list` | List Employees | `--limit` |
| `huly contacts organizations channels add` | Add Organization Channel | — |
| `huly contacts organizations channels list` | List Organization Channels | — |
| `huly contacts organizations channels remove` | Remove Organization Channel Requires `--yes`. | `--channel-id`, `--provider`, `--value` |
| `huly contacts organizations channels update` | Update Organization Channel | `--channel-id`, `--provider`, `--value`, `--new-provider`, `--new-value` |
| `huly contacts organizations create` | Create Organization | `--members` |
| `huly contacts organizations customer make` | Make Organization Customer Requires `--yes`. | — |
| `huly contacts organizations delete` | Delete Organization Requires `--yes`. | — |
| `huly contacts organizations get` | Get Organization | — |
| `huly contacts organizations list` | List Organizations | `--limit` |
| `huly contacts organizations members add` | Add Organization Member | — |
| `huly contacts organizations members list` | List Organization Members | — |
| `huly contacts organizations members remove` | Remove Organization Member Requires `--yes`. | — |
| `huly contacts organizations update` | Update Organization | `--name`, `--city`, `--description`, `--description-file` |
| `huly contacts persons channels add` | Add Person Channel | — |
| `huly contacts persons channels list` | List Person Channels | — |
| `huly contacts persons channels remove` | Remove Person Channel Requires `--yes`. | `--channel-id`, `--provider`, `--value` |
| `huly contacts persons channels update` | Update Person Channel | `--channel-id`, `--provider`, `--value`, `--new-provider`, `--new-value` |
| `huly contacts persons create` | Create Person | `--email`, `--city` |
| `huly contacts persons delete` | Delete Person Requires `--yes`. | — |
| `huly contacts persons get` | Get Person | `--person-id`, `--email` |
| `huly contacts persons list` | List Persons | `--name-search`, `--name-regex`, `--email-search`, `--limit` |
| `huly contacts persons organizations list` | List Person Organizations | `--person-id`, `--email` |
| `huly contacts persons update` | Update Person | `--first-name`, `--last-name`, `--city` |
| `huly custom-fields list` | List Custom Fields | `--target-class`, `--limit` |
| `huly custom-fields values get` | Get Custom Field Values | — |
| `huly deletion preview` | Preview Deletion | `--identifier` |
| `huly documents comments` | List document inline comments | `--teamspace`, `--document`, `--include-replies` |
| `huly documents create` | Create a document | `--teamspace`, `--title`, `--content`, `--parent`, `--content-file` |
| `huly documents delete` | Delete Document Requires `--yes`. | — |
| `huly documents edit` | Edit a document | `--teamspace`, `--document`, `--title`, `--content`, `--old-text`, `--new-text`, `--replace-all`, `--content-file`, `--old-text-file`, `--new-text-file` |
| `huly documents get` | Get a document | `--teamspace`, `--document` |
| `huly documents labels add` | Add Document Label | `--color` |
| `huly documents labels definitions list` | List Document Label Definitions | `--title-search`, `--limit` |
| `huly documents labels list` | List Document Labels | — |
| `huly documents labels remove` | Remove Document Label Requires `--yes`. | — |
| `huly documents list` | List documents | `--teamspace`, `--title-search`, `--title-regex`, `--content-search`, `--limit` |
| `huly documents snapshots get` | Get Document Snapshot | — |
| `huly documents snapshots list` | List Document Snapshots | `--limit` |
| `huly drawings create` | Create a drawing; pass opaque content with --content or --content-file | `--content`, `--content-file` |
| `huly drawings delete` | Delete Drawing Requires `--yes`. | — |
| `huly drawings get` | Get Drawing | — |
| `huly drawings list` | List Drawings | `--limit` |
| `huly drawings update` | Update drawing content; pass null to --content to clear it | `--content`, `--content-file` |
| `huly drive create` | Create Drive | `--description`, `--private`, `--auto-join`, `--members`, `--owners`, `--description-file` |
| `huly drive delete` | Delete Drive Requires `--yes`. | — |
| `huly drive files activity list` | List Drive File Activity | `--file-path`, `--file-id`, `--limit` |
| `huly drive files comments add` | Add Drive File Comment | `--file-path`, `--file-id`, `--body-file` |
| `huly drive files comments delete` | Delete Drive File Comment Requires `--yes`. | `--file-path`, `--file-id` |
| `huly drive files comments list` | List Drive File Comments | `--file-path`, `--file-id`, `--limit` |
| `huly drive files comments update` | Update Drive File Comment | `--file-path`, `--file-id`, `--body-file` |
| `huly drive files upload` | Upload a drive file. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--create-parents`, `--file-path`, `--file-url`, `--data`, `--data-base64-file` |
| `huly drive files versions list` | List Drive File Versions | — |
| `huly drive files versions restore` | Restore Drive File Version | — |
| `huly drive files versions upload` | Upload a new drive-file version. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--file-path`, `--file-url`, `--data`, `--data-base64-file` |
| `huly drive folders create` | Create Drive Folder | — |
| `huly drive get` | Get Drive | — |
| `huly drive items delete` | Delete Drive Item Requires `--yes`. | `--path`, `--item-id` |
| `huly drive items get` | Get Drive Item | `--path`, `--item-id` |
| `huly drive items list` | List Drive Items | `--path`, `--kind`, `--limit` |
| `huly drive items move` | Move Drive Item | `--path`, `--item-id` |
| `huly drive items rename` | Rename Drive Item | `--path`, `--item-id` |
| `huly drive list` | List Drives | `--query`, `--include-archived`, `--limit` |
| `huly drive members add` | Add drive members; members is a JSON array Requires `--yes`. | — |
| `huly drive members remove` | Remove drive members; members is a JSON array Requires `--yes`. | — |
| `huly drive owners set` | Replace drive owners; owners is a JSON array Requires `--yes`. | `--ensure-members` |
| `huly drive update` | Update Drive | `--name`, `--description`, `--private`, `--archived`, `--auto-join`, `--description-file` |
| `huly inventory categories list` | List Inventory Categories | `--query`, `--parent-category`, `--limit` |
| `huly inventory category create` | Create Inventory Category | `--parent-category` |
| `huly inventory category delete` | Delete Inventory Category Requires `--yes`. | `--parent-category` |
| `huly inventory category get` | Get Inventory Category | `--parent-category` |
| `huly inventory category update` | Update Inventory Category | `--parent-category`, `--name`, `--new-parent-category` |
| `huly inventory product activity list` | List Inventory Product Activity | `--category`, `--limit` |
| `huly inventory product attachment delete` | Delete Inventory Product Attachment Requires `--yes`. | `--category` |
| `huly inventory product attachment get` | Get Inventory Product Attachment | `--category` |
| `huly inventory product attachment update` | Update Inventory Product Attachment | `--category`, `--description`, `--pinned`, `--description-file` |
| `huly inventory product attachments list` | List Inventory Product Attachments | `--category`, `--limit` |
| `huly inventory product comment add` | Add Inventory Product Comment | `--category`, `--body-file` |
| `huly inventory product comment delete` | Delete Inventory Product Comment Requires `--yes`. | `--category` |
| `huly inventory product comment update` | Update Inventory Product Comment | `--category`, `--body-file` |
| `huly inventory product comments list` | List Inventory Product Comments | `--category`, `--limit` |
| `huly inventory product create` | Create Inventory Product | — |
| `huly inventory product delete` | Delete Inventory Product Requires `--yes`. | `--category` |
| `huly inventory product get` | Get Inventory Product | `--category` |
| `huly inventory product photo delete` | Delete Inventory Product Photo Requires `--yes`. | `--category` |
| `huly inventory product photo get` | Get Inventory Product Photo | `--category` |
| `huly inventory product photo update` | Update Inventory Product Photo | `--category`, `--description`, `--pinned`, `--description-file` |
| `huly inventory product photos list` | List Inventory Product Photos | `--category`, `--limit` |
| `huly inventory product update` | Update Inventory Product | `--category`, `--name`, `--new-category` |
| `huly inventory products attachments add` | Add a product attachment. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--category`, `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--data-base64-file` |
| `huly inventory products list` | List Inventory Products | `--query`, `--category`, `--limit` |
| `huly inventory products photos add` | Add a product photo. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--category`, `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--data-base64-file` |
| `huly inventory variant create` | Create Inventory Variant | `--category` |
| `huly inventory variant delete` | Delete Inventory Variant Requires `--yes`. | `--product`, `--category` |
| `huly inventory variant get` | Get Inventory Variant | `--product`, `--category` |
| `huly inventory variant update` | Update Inventory Variant | `--product`, `--category`, `--name`, `--sku` |
| `huly inventory variants list` | List Inventory Variants | `--query`, `--product`, `--category`, `--limit` |
| `huly issue-statuses create` | Create Issue Status | `--project-type`, `--task-type` |
| `huly issues component set` | Set or clear an issue component | `--project`, `--identifier`, `--component` |
| `huly issues create` | Create an issue | `--project`, `--title`, `--description`, `--priority`, `--assignee`, `--status`, `--task-type`, `--parent-issue`, `--due-date`, `--estimation`, `--description-file` |
| `huly issues delete` | Delete Issue Requires `--yes`. | — |
| `huly issues documents link` | Link a document to an issue Requires `--yes`. | `--project`, `--issue-identifier`, `--teamspace`, `--document` |
| `huly issues documents unlink` | Unlink a document from an issue Requires `--yes`. | `--project`, `--issue-identifier`, `--teamspace`, `--document` |
| `huly issues from-template create` | Create Issue From Template | `--title`, `--description`, `--priority`, `--assignee`, `--status`, `--include-children`, `--description-file` |
| `huly issues get` | Get an issue | — |
| `huly issues labels add` | Add an issue label | `--project`, `--identifier`, `--label`, `--color` |
| `huly issues labels remove` | Remove an issue label | `--project`, `--identifier`, `--label` |
| `huly issues list` | List issues | `--project`, `--status`, `--status-category`, `--assignee`, `--creator`, `--parent-issue`, `--title-search`, `--title-regex`, `--description-search`, `--component`, `--label`, `--milestone`, `--has-milestone`, `--has-assignee`, `--has-due-date`, `--has-component`, `--is-top-level`, `--limit` |
| `huly issues milestone set` | Set or clear an issue milestone | `--project`, `--identifier`, `--milestone` |
| `huly issues move` | Move an issue | `--new-parent` |
| `huly issues related-targets delete` | Delete Related Issue Space Target Requires `--yes`. | — |
| `huly issues related-targets list` | List Related Issue Targets | `--space`, `--object-class`, `--limit` |
| `huly issues related-targets set` | Set Related Issue Target | `--space`, `--object-class` |
| `huly issues relations add` | Add an issue relation | `--project`, `--issue-identifier`, `--target-issue`, `--relation-type` |
| `huly issues relations list` | List issue relations | `--project`, `--issue-identifier` |
| `huly issues relations remove` | Remove an issue relation | `--project`, `--issue-identifier`, `--target-issue`, `--relation-type` |
| `huly issues templates children add` | Add Template Child | `--description`, `--priority`, `--assignee`, `--component`, `--estimation`, `--description-file` |
| `huly issues templates children remove` | Remove Template Child Requires `--yes`. | — |
| `huly issues templates create` | Create Issue Template | `--description`, `--priority`, `--assignee`, `--component`, `--estimation`, `--children`, `--description-file` |
| `huly issues templates delete` | Delete Issue Template Requires `--yes`. | — |
| `huly issues templates get` | Get Issue Template | — |
| `huly issues templates list` | List Issue Templates | `--limit` |
| `huly issues templates update` | Update Issue Template | `--title`, `--description`, `--priority`, `--assignee`, `--component`, `--estimation`, `--description-file` |
| `huly issues update` | Update an issue | `--title`, `--description`, `--priority`, `--assignee`, `--status`, `--task-type`, `--due-date`, `--estimation`, `--description-file` |
| `huly labels create` | Create Label | `--color`, `--description`, `--category`, `--description-file` |
| `huly labels delete` | Delete Label Requires `--yes`. | — |
| `huly labels list` | List labels | `--category`, `--limit` |
| `huly labels update` | Update Label | `--title`, `--color`, `--description`, `--description-file` |
| `huly leads create` | Create Lead | `--description`, `--assignee`, `--status`, `--task-type`, `--description-file` |
| `huly leads funnels list` | List Funnels | `--include-archived`, `--limit` |
| `huly leads get` | Get Lead | — |
| `huly leads list` | List Leads | `--status`, `--assignee`, `--title-search`, `--limit` |
| `huly mail threads list` | List Mail Threads | `--space`, `--channel-title-search`, `--limit` |
| `huly milestones create` | Create Milestone | `--description`, `--description-file` |
| `huly milestones delete` | Delete Milestone Requires `--yes`. | — |
| `huly milestones get` | Get a milestone | `--project`, `--milestone` |
| `huly milestones list` | List milestones | `--project`, `--limit` |
| `huly milestones update` | Update Milestone | `--label`, `--description`, `--target-date`, `--status`, `--description-file` |
| `huly model attributes create` | Create Huly Model Attribute | `--type`, `--index`, `--automation-only`, `--hidden`, `--confirm` |
| `huly model attributes delete` | Delete Huly Model Attribute Requires `--yes`. | `--class`, `--confirm` |
| `huly model attributes list` | List Huly model attributes | `--class`, `--query`, `--custom-only`, `--limit` |
| `huly model attributes update` | Update Huly Model Attribute | `--class`, `--label`, `--index`, `--automation-only`, `--hidden`, `--confirm` |
| `huly model classes get` | Get a Huly model class and its attributes | `--include-inherited-attributes` |
| `huly model classes list` | List Huly model classes, interfaces, and mixins | `--query`, `--kind`, `--domain`, `--limit` |
| `huly model collaborators delete` | Delete Class Collaborator Metadata Requires `--yes`. | `--confirm` |
| `huly model collaborators get` | Get Class Collaborator Metadata | — |
| `huly model collaborators set` | Set Class Collaborator Metadata | `--provide-security`, `--provide-attached-security`, `--confirm` |
| `huly model domain-indexes list` | List Huly domain index configurations | — |
| `huly model enums create` | Create Huly Model Enum | `--confirm` |
| `huly model enums delete` | Delete Huly Model Enum Requires `--yes`. | `--confirm` |
| `huly model enums list` | List Huly model enums | `--enum`, `--query`, `--limit` |
| `huly model enums update` | Update Huly Model Enum | `--name`, `--values`, `--confirm` |
| `huly model permissions create` | Create Huly Permission | `--object-class`, `--transaction`, `--forbid`, `--description`, `--confirm` |
| `huly model permissions delete` | Delete Huly Permission Requires `--yes`. | `--confirm` |
| `huly model permissions update` | Update Huly Permission | `--label`, `--scope`, `--object-class`, `--transaction`, `--forbid`, `--description`, `--confirm` |
| `huly model plugins list` | List Huly plugin configurations | — |
| `huly model sequences create` | Create Huly Sequence | `--confirm`, `--prefix` |
| `huly model sequences delete` | Delete Huly Sequence Requires `--yes`. | `--confirm` |
| `huly model sequences list` | List Huly model sequences | — |
| `huly model sequences update` | Update Huly Custom Sequence | `--confirm` |
| `huly model space-types capabilities describe` | Describe a Huly space type's model capabilities | — |
| `huly notifications all archive` | Archive all notifications for the current account Requires `--yes`. | — |
| `huly notifications all read` | Mark all notifications read for the current account Requires `--yes`. | — |
| `huly notifications archive` | Archive Notification | — |
| `huly notifications contexts archive` | Archive Notification Context | — |
| `huly notifications contexts get` | Get Notification Context | — |
| `huly notifications contexts hide` | Hide Notification Context Requires `--yes`. | — |
| `huly notifications contexts list` | List Notification Contexts | `--limit`, `--pinned-only`, `--include-hidden` |
| `huly notifications contexts pin` | Pin Notification Context | — |
| `huly notifications contexts unarchive` | Unarchive Notification Context Requires `--yes`. | — |
| `huly notifications delete` | Delete Notification Requires `--yes`. | — |
| `huly notifications get` | Get Notification | — |
| `huly notifications list` | List Notifications | `--limit`, `--include-archived`, `--unread-only` |
| `huly notifications providers list` | List Notification Providers | `--limit`, `--include-unavailable` |
| `huly notifications providers settings update` | Update Notification Provider Setting | — |
| `huly notifications read mark` | Mark Notification Read | — |
| `huly notifications settings list` | List Notification Settings | `--limit` |
| `huly notifications types list` | List Notification Types | `--limit`, `--include-hidden`, `--object-class` |
| `huly notifications types settings update` | Update Notification Type Setting | — |
| `huly notifications unarchive` | Unarchive Notification Requires `--yes`. | — |
| `huly notifications unread mark` | Mark Notification Unread | — |
| `huly notifications unread-count get` | Get Unread Notification Count | — |
| `huly objects collaborators add` | Add a collaborator using one raw, issue, or document object locator Requires `--yes`. | `--object-id`, `--object-class`, `--project`, `--issue-identifier`, `--teamspace`, `--document` |
| `huly objects collaborators remove` | Remove a collaborator using one raw, issue, or document object locator Requires `--yes`. | `--object-id`, `--object-class`, `--project`, `--issue-identifier`, `--teamspace`, `--document` |
| `huly objects custom-fields set` | Set a custom field on a raw Huly object | — |
| `huly objects notifications subscribe` | Subscribe the current account to raw-object notifications Requires `--yes`. | `--space` |
| `huly objects notifications unsubscribe` | Unsubscribe the current account from raw-object notifications Requires `--yes`. | `--space` |
| `huly objects tags attach` | Attach a tag; pass the raw target locator with --object as JSON Requires `--yes`. | `--object`, `--color`, `--category`, `--weight` |
| `huly objects tags detach` | Detach a tag; pass the raw target locator with --object as JSON Requires `--yes`. | `--object` |
| `huly office defaults list` | List Office Defaults | — |
| `huly office devices preferences list` | List Device Preferences | — |
| `huly office floors get` | Get Office Floor | — |
| `huly office floors list` | List Office Floors | `--limit` |
| `huly office meeting-minutes get` | Get Meeting Minutes | — |
| `huly office meeting-minutes list` | List Meeting Minutes | `--attached-to-id`, `--from`, `--to`, `--limit` |
| `huly office offices get` | Get Office | — |
| `huly office offices list` | List Offices | `--floor-id`, `--limit` |
| `huly office rooms active-info list` | List Active Room Info | — |
| `huly office rooms get` | Get Office Room | — |
| `huly office rooms list` | List Office Rooms | `--floor-id`, `--limit` |
| `huly office rooms participants list` | List Active Room Participants | `--room-id` |
| `huly planner todos complete` | Complete Todo Requires `--yes`. | `--done-on` |
| `huly planner todos create` | Create Todo | `--description`, `--owner`, `--due-date`, `--priority`, `--visibility`, `--attached-to`, `--description-file` |
| `huly planner todos delete` | Delete Todo Requires `--yes`. | — |
| `huly planner todos get` | Get Todo | — |
| `huly planner todos labels add` | Add Todo Label | `--color` |
| `huly planner todos labels definitions list` | List Todo Label Definitions | `--title-search`, `--limit` |
| `huly planner todos labels list` | List Todo Labels | — |
| `huly planner todos labels remove` | Remove Todo Label Requires `--yes`. | — |
| `huly planner todos list` | List Todos | `--owner`, `--issue`, `--title`, `--title-search`, `--due-from`, `--due-to`, `--completion-state`, `--priority`, `--visibility`, `--limit` |
| `huly planner todos reopen` | Reopen Todo Requires `--yes`. | — |
| `huly planner todos schedule` | Schedule Todo Requires `--yes`. | — |
| `huly planner todos unschedule` | Unschedule Todo Requires `--yes`. | `--work-slot-id`, `--locator`, `--scope`, `--from` |
| `huly planner todos update` | Update Todo | `--title`, `--description`, `--owner`, `--due-date`, `--priority`, `--visibility`, `--description-file` |
| `huly platform associations list` | List Associations | `--association`, `--source-class`, `--target-class`, `--writable-only`, `--include-system`, `--limit` |
| `huly platform relations list` | List Relations | `--association`, `--source`, `--target`, `--direction`, `--limit` |
| `huly preferences spaces get` | Get Space Preference | `--include-archived`, `--class`, `--type` |
| `huly preferences spaces list` | List Space Preferences | `--space`, `--include-archived`, `--class`, `--type`, `--limit` |
| `huly processes executions cancel` | Cancel an active process execution Requires `--yes`. | — |
| `huly processes executions list` | List Process Executions | `--process`, `--card`, `--status`, `--limit` |
| `huly processes get` | Get Process | — |
| `huly processes list` | List Processes | `--master-tag`, `--limit` |
| `huly processes start` | Start a process on a card or document Requires `--yes`. | — |
| `huly project-types get` | Get Project Type | `--project-type` |
| `huly project-types list` | List Project Types | — |
| `huly projects create` | Create Project | `--description`, `--private`, `--description-file` |
| `huly projects delete` | Delete Project Requires `--yes`. | — |
| `huly projects get` | Get a project | — |
| `huly projects list` | List projects | `--include-archived`, `--limit` |
| `huly projects statuses` | List project issue statuses | — |
| `huly projects target-preferences list` | List Project Target Preferences | `--project`, `--limit` |
| `huly projects target-preferences upsert` | Create or update a project target preference; pass --props as a JSON array Requires `--yes`. | `--props` |
| `huly projects update` | Update Project | `--name`, `--description`, `--description-file` |
| `huly recruiting activity list` | List Recruiting Activity | `--limit` |
| `huly recruiting applicant create` | Create Recruiting Applicant | `--status`, `--assignee`, `--start-date`, `--due-date` |
| `huly recruiting applicant delete` | Delete Recruiting Applicant Requires `--yes`. | `--vacancy`, `--candidate` |
| `huly recruiting applicant get` | Get Recruiting Applicant | `--vacancy`, `--candidate` |
| `huly recruiting applicant match get` | Get Recruiting Applicant Match | — |
| `huly recruiting applicant matches list` | List Recruiting Applicant Matches | `--candidate`, `--complete`, `--query`, `--limit` |
| `huly recruiting applicant update` | Update Recruiting Applicant | `--vacancy`, `--candidate`, `--status`, `--assignee`, `--start-date`, `--due-date` |
| `huly recruiting applicants list` | List Recruiting Applicants | `--vacancy`, `--candidate`, `--status`, `--limit` |
| `huly recruiting attachment delete` | Delete Recruiting Attachment Requires `--yes`. | — |
| `huly recruiting attachment get` | Get Recruiting Attachment | — |
| `huly recruiting attachment update` | Update Recruiting Attachment | `--description`, `--pinned`, `--description-file` |
| `huly recruiting attachments add` | Add a recruiting attachment. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--file-path`, `--file-url`, `--data`, `--description`, `--pinned`, `--data-base64-file` |
| `huly recruiting attachments list` | List Recruiting Attachments | `--limit` |
| `huly recruiting candidate get` | Get Recruiting Candidate | — |
| `huly recruiting candidate profile set` | Set Recruiting Candidate Profile | `--title`, `--source`, `--onsite`, `--remote` |
| `huly recruiting candidate skill add` | Add Recruiting Candidate Skill | `--category`, `--color`, `--weight` |
| `huly recruiting candidate skill remove` | Remove Recruiting Candidate Skill Requires `--yes`. | — |
| `huly recruiting candidate skills list` | List Recruiting Candidate Skills | — |
| `huly recruiting candidates list` | List Recruiting Candidates | `--query`, `--limit` |
| `huly recruiting comment add` | Add Recruiting Comment | `--body-file` |
| `huly recruiting comment delete` | Delete Recruiting Comment Requires `--yes`. | — |
| `huly recruiting comment update` | Update Recruiting Comment | `--body-file` |
| `huly recruiting comments list` | List Recruiting Comments | `--limit` |
| `huly recruiting opinion create` | Create Recruiting Opinion | `--description`, `--description-file` |
| `huly recruiting opinion delete` | Delete Recruiting Opinion Requires `--yes`. | `--review` |
| `huly recruiting opinion get` | Get Recruiting Opinion | `--review` |
| `huly recruiting opinion update` | Update Recruiting Opinion | `--review`, `--value`, `--description`, `--description-file` |
| `huly recruiting opinions list` | List Recruiting Opinions | `--limit` |
| `huly recruiting related issue add` | Add Recruiting Related Issue | `--project` |
| `huly recruiting related issue remove` | Remove Recruiting Related Issue Requires `--yes`. | `--project` |
| `huly recruiting related issues list` | List Recruiting Related Issues | `--limit` |
| `huly recruiting review create` | Create Recruiting Review | `--due-date`, `--description`, `--verdict`, `--application`, `--company`, `--location`, `--participants`, `--description-file` |
| `huly recruiting review delete` | Delete Recruiting Review Requires `--yes`. | `--candidate`, `--application` |
| `huly recruiting review get` | Get Recruiting Review | `--candidate`, `--application` |
| `huly recruiting review update` | Update Recruiting Review | `--candidate`, `--application-context`, `--title`, `--description`, `--verdict`, `--date`, `--due-date`, `--application`, `--company`, `--location`, `--participants`, `--description-file` |
| `huly recruiting reviews list` | List Recruiting Reviews | `--candidate`, `--application`, `--query`, `--from`, `--to`, `--limit` |
| `huly recruiting skills list` | List Recruiting Skills | `--title-search`, `--category`, `--limit` |
| `huly recruiting vacancies list` | List Recruiting Vacancies | `--include-archived`, `--query`, `--type`, `--company`, `--limit` |
| `huly recruiting vacancy archive` | Archive Recruiting Vacancy | — |
| `huly recruiting vacancy create` | Create Recruiting Vacancy | `--short-description`, `--full-description`, `--type`, `--company`, `--location`, `--due-to`, `--private`, `--short-description-file`, `--full-description-file` |
| `huly recruiting vacancy get` | Get Recruiting Vacancy | — |
| `huly recruiting vacancy statuses list` | List Recruiting Vacancy Statuses | — |
| `huly recruiting vacancy types list` | List Recruiting Vacancy Types | `--include-archived`, `--limit` |
| `huly recruiting vacancy unarchive` | Unarchive Recruiting Vacancy Requires `--yes`. | — |
| `huly recruiting vacancy update` | Update Recruiting Vacancy | `--name`, `--short-description`, `--full-description`, `--type`, `--company`, `--location`, `--due-to`, `--private`, `--short-description-file`, `--full-description-file` |
| `huly relations create` | Create a relation; pass --source and --target as JSON | `--source`, `--target`, `--direction`, `--if-exists` |
| `huly relations delete` | Delete a relation by ID or exact structured endpoints Requires `--yes`. | `--relation`, `--association`, `--source`, `--target`, `--direction` |
| `huly search` | Search Huly | `--limit` |
| `huly spaces admins get` | Get Global Space Admins | — |
| `huly spaces admins set` | Set Global Space Admins Requires `--yes`. | `--admins` |
| `huly spaces create` | Create Generic Typed Space | `--description`, `--private`, `--auto-join`, `--restricted`, `--members`, `--owners`, `--role-assignments`, `--description-file` |
| `huly spaces get` | Get Space | `--include-archived`, `--class`, `--type` |
| `huly spaces list` | List Spaces | `--include-archived`, `--class`, `--type`, `--limit` |
| `huly spaces members add` | Add people to a space; members is a JSON array Requires `--yes`. | `--class`, `--type` |
| `huly spaces members remove` | Remove people from a space; members is a JSON array Requires `--yes`. | `--class`, `--type` |
| `huly spaces owners set` | Replace space owners; owners is a JSON array Requires `--yes`. | `--class`, `--type`, `--ensure-members` |
| `huly spaces permissions list` | List Space Permissions | `--scope`, `--object-class`, `--search`, `--limit` |
| `huly spaces roles create` | Create Space Role | `--confirm` |
| `huly spaces roles members add` | Add space-role members; members is a JSON array Requires `--yes`. | `--class`, `--type` |
| `huly spaces roles members remove` | Remove space-role members; members is a JSON array Requires `--yes`. | `--class`, `--type` |
| `huly spaces roles members set` | Replace space-role members; members is a JSON array Requires `--yes`. | `--class`, `--type` |
| `huly spaces roles permissions set` | Set Space Role Permissions | `--confirm` |
| `huly spaces types get` | Get Space Type | — |
| `huly spaces types list` | List Space Types | `--target-class`, `--limit` |
| `huly spaces update` | Update a generic space | `--class`, `--type`, `--name`, `--description`, `--private`, `--archived`, `--auto-join` |
| `huly status-categories create` | Create Generic Status Category | `--icon`, `--color`, `--order` |
| `huly status-categories delete` | Delete Generic Status Category Requires `--yes`. | `--of-attribute` |
| `huly status-categories get` | Get Generic Status Category | `--of-attribute` |
| `huly status-categories list` | List Generic Status Categories | `--of-attribute`, `--limit` |
| `huly status-categories update` | Update Generic Status Category | `--current-of-attribute`, `--label`, `--of-attribute`, `--default-status`, `--icon`, `--color`, `--order` |
| `huly storage upload` | Upload a file to Huly storage. filePath is read by the CLI process, fileUrl is fetched by the CLI process, data is canonical base64, and --data-base64-file encodes local bytes as base64. Provide exactly one source. | `--file-path`, `--file-url`, `--data`, `--data-base64-file` |
| `huly support status get` | Get Support Status | — |
| `huly tags attached list` | List Attached Tags | `--object-id`, `--object-class`, `--space`, `--collection` |
| `huly tags categories create` | Create Tag Category | `--target-class`, `--default` |
| `huly tags categories delete` | Delete Tag Category Requires `--yes`. | — |
| `huly tags categories list` | List Tag Categories | `--target-class`, `--limit` |
| `huly tags categories update` | Update Tag Category | `--label`, `--default` |
| `huly tags create` | Create Tag | `--color`, `--description`, `--category`, `--description-file` |
| `huly tags delete` | Delete Tag Requires `--yes`. | — |
| `huly tags list` | List Tags | `--category`, `--title-search`, `--limit` |
| `huly tags update` | Update Tag | `--title`, `--color`, `--description`, `--category`, `--description-file` |
| `huly task-types create` | Create Task Type | `--project-type`, `--template-task-type` |
| `huly task-types list` | List Task Types | `--project-type` |
| `huly teamspaces create` | Create Teamspace | `--description`, `--private`, `--description-file` |
| `huly teamspaces delete` | Delete Teamspace Requires `--yes`. | — |
| `huly teamspaces get` | Get a teamspace | — |
| `huly teamspaces list` | List teamspaces | `--include-archived`, `--limit` |
| `huly teamspaces update` | Update Teamspace | `--name`, `--description`, `--archived`, `--description-file` |
| `huly templates categories list` | List Message Template Categories | `--limit` |
| `huly templates fields list` | List Message Template Fields | `--category`, `--search`, `--limit` |
| `huly templates get` | Get Message Template | `--category` |
| `huly templates list` | List Message Templates | `--category`, `--search`, `--limit` |
| `huly templates render` | Render a message template; pass --values as a JSON object | `--category`, `--values` |
| `huly tests case create` | Create Test Case | `--description`, `--type`, `--priority`, `--status`, `--assignee`, `--description-file` |
| `huly tests case delete` | Delete Test Case Requires `--yes`. | — |
| `huly tests case get` | Get Test Case | — |
| `huly tests case update` | Update Test Case | `--name`, `--description`, `--type`, `--priority`, `--status`, `--assignee`, `--description-file` |
| `huly tests cases list` | List Test Cases | `--suite`, `--assignee`, `--limit` |
| `huly tests plan create` | Create Test Plan | `--description`, `--description-file` |
| `huly tests plan delete` | Delete Test Plan Requires `--yes`. | — |
| `huly tests plan get` | Get Test Plan | — |
| `huly tests plan item add` | Add Test Plan Item | `--assignee` |
| `huly tests plan item remove` | Remove Test Plan Item Requires `--yes`. | — |
| `huly tests plan run` | Run Test Plan | `--run-name`, `--due-date` |
| `huly tests plan update` | Update Test Plan | `--name`, `--description`, `--description-file` |
| `huly tests plans list` | List Test Plans | `--limit` |
| `huly tests projects list` | List Test Projects | `--limit` |
| `huly tests result create` | Create Test Result | `--name`, `--status`, `--assignee` |
| `huly tests result delete` | Delete Test Result Requires `--yes`. | — |
| `huly tests result get` | Get Test Result | — |
| `huly tests result update` | Update Test Result | `--status`, `--assignee`, `--description`, `--description-file` |
| `huly tests results list` | List Test Results | `--limit` |
| `huly tests run create` | Create Test Run | `--description`, `--due-date`, `--description-file` |
| `huly tests run delete` | Delete Test Run Requires `--yes`. | — |
| `huly tests run get` | Get Test Run | — |
| `huly tests run update` | Update Test Run | `--name`, `--description`, `--due-date`, `--description-file` |
| `huly tests runs list` | List Test Runs | `--limit` |
| `huly tests suite create` | Create Test Suite | `--description`, `--parent`, `--description-file` |
| `huly tests suite delete` | Delete Test Suite Requires `--yes`. | — |
| `huly tests suite get` | Get Test Suite | — |
| `huly tests suite update` | Update Test Suite | `--name`, `--description`, `--description-file` |
| `huly tests suites list` | List Test Suites | `--parent`, `--limit` |
| `huly time log` | Log time in hours against an issue | `--description` |
| `huly time reports detailed get` | Get Detailed Time Report | `--from`, `--to` |
| `huly time reports get` | Get Time Report | — |
| `huly time reports list` | List Time Spend Reports | `--project`, `--from`, `--to`, `--limit` |
| `huly time timers start` | Start an issue timer | — |
| `huly time timers stop` | Stop an issue timer | — |
| `huly time work-slots list` | List Work Slots | `--employee-id`, `--from`, `--to`, `--limit` |
| `huly user-statuses list` | List User Statuses | `--online`, `--user`, `--limit` |
| `huly views filtered get` | Get Filtered View | `--attached-to` |
| `huly views filtered list` | List Filtered Views | `--attached-to`, `--visibility`, `--name-search`, `--limit` |
| `huly views viewlets list` | List Viewlets | `--attach-to`, `--viewlet`, `--limit` |
| `huly workbench applications list` | List Workbench Applications | `--alias`, `--alias-search`, `--limit` |
| `huly workflow-statuses create` | Create Generic Workflow Status | `--category`, `--color`, `--description` |
| `huly workflow-statuses delete` | Delete Generic Workflow Status Requires `--yes`. | `--of-attribute` |
| `huly workflow-statuses get` | Get Generic Workflow Status | `--of-attribute` |
| `huly workflow-statuses list` | List Generic Workflow Statuses | `--of-attribute`, `--category`, `--limit` |
| `huly workflow-statuses update` | Update Generic Workflow Status | `--current-of-attribute`, `--name`, `--of-attribute`, `--category`, `--color`, `--description` |
| `huly workspace access-links create` | Create a workspace access link Requires `--yes`. | `--role`, `--first-name`, `--last-name`, `--navigate-url`, `--spaces`, `--not-before`, `--expiration`, `--personalized` |
| `huly workspace create` | Create a workspace Requires `--yes`. | `--region` |
| `huly workspace delete` | Delete the configured workspace Requires `--yes`. | — |
| `huly workspace guest-settings update` | Update workspace guest access settings Requires `--yes`. | `--allow-read-only`, `--allow-sign-up` |
| `huly workspace info get` | Get Workspace Info | — |
| `huly workspace list` | List Workspaces | `--limit` |
| `huly workspace members list` | List Workspace Members | `--limit` |
| `huly workspace members role update` | Update a workspace member role Requires `--yes`. | — |
| `huly workspace profile get` | Get User Profile | — |
| `huly workspace profile update` | Update the current user's profile; pass null to clear nullable fields Requires `--yes`. | `--bio`, `--city`, `--country`, `--website`, `--social-links`, `--is-public` |
| `huly workspace regions get` | Get Regions | — |
<!-- CLI_COMMAND_REFERENCE_END -->
