import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { CLI_UPLOAD_SOURCE_SEMANTICS } from "./parity-contract.js"

export const parityCollaborationCliCommandCatalog = {
  add_approval_request: {
    path: ["approvals", "add"],
    positional: ["attachedTo", "attachedToClass"],
    description: "Add an approval request; pass --requested and --tx as JSON"
  },
  approve_approval_request: {
    path: ["approvals", "approve"],
    positional: ["request"],
    description: "Approve a request as the current Huly actor"
  },
  reject_approval_request: {
    path: ["approvals", "reject"],
    positional: ["request", "comment"],
    description: "Reject a request as the current Huly actor"
  },
  add_chat_message_attachment: {
    path: ["channels", "messages", "attachments", "add"],
    positional: [],
    description: `Attach a file to a channel, direct-message, or thread message; pass --target as JSON. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: { base64FileInput: { fields: ["data"] }, fileInput: { fields: ["description"] } }
  },
  add_thread_reply: {
    path: ["channels", "threads", "replies", "add"],
    positional: ["channel", "messageId", "body"],
    description: "Reply to a channel message",
    behavior: { fileInput: { fields: ["body"] } }
  },
  delete_channel_message: {
    path: ["channels", "messages", "delete"],
    positional: ["channel", "messageId"],
    description: "Delete a channel message",
    behavior: { confirmation: { type: "requires-yes", message: "channels messages delete requires --yes." } }
  },
  delete_dm_message: {
    path: ["channels", "direct-messages", "messages", "delete"],
    positional: ["dm", "messageId"],
    description: "Delete a direct-message message",
    behavior: {
      confirmation: { type: "requires-yes", message: "channels direct-messages messages delete requires --yes." }
    }
  },
  delete_thread_reply: {
    path: ["channels", "threads", "replies", "delete"],
    positional: ["channel", "messageId", "replyId"],
    description: "Delete a thread reply",
    behavior: { confirmation: { type: "requires-yes", message: "channels threads replies delete requires --yes." } }
  },
  send_channel_message: {
    path: ["channels", "messages", "send"],
    positional: ["channel", "body"],
    description: "Send a message to a channel",
    behavior: { fileInput: { fields: ["body"] } }
  },
  send_dm_message: {
    path: ["channels", "direct-messages", "messages", "send"],
    positional: ["dm", "body"],
    description: "Send a direct message",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_channel_message: {
    path: ["channels", "messages", "update"],
    positional: ["channel", "messageId", "body"],
    description: "Update a channel message",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_dm_message: {
    path: ["channels", "direct-messages", "messages", "update"],
    positional: ["dm", "messageId", "body"],
    description: "Update a direct-message message",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_thread_reply: {
    path: ["channels", "threads", "replies", "update"],
    positional: ["channel", "messageId", "replyId", "body"],
    description: "Update a thread reply",
    behavior: { fileInput: { fields: ["body"] } }
  },
  add_object_collaborator: {
    path: ["objects", "collaborators", "add"],
    positional: ["member"],
    description: "Add a collaborator using one raw, issue, or document object locator"
  },
  remove_object_collaborator: {
    path: ["objects", "collaborators", "remove"],
    positional: ["member"],
    description: "Remove a collaborator using one raw, issue, or document object locator"
  },
  subscribe_to_object_notifications: {
    path: ["objects", "notifications", "subscribe"],
    positional: ["objectId", "objectClass"],
    description: "Subscribe the current account to raw-object notifications"
  },
  unsubscribe_from_object_notifications: {
    path: ["objects", "notifications", "unsubscribe"],
    positional: ["objectId", "objectClass"],
    description: "Unsubscribe the current account from raw-object notifications"
  },
  attach_tag: {
    path: ["objects", "tags", "attach"],
    positional: ["targetClass", "tag"],
    description: "Attach a tag; pass the raw target locator with --object as JSON"
  },
  detach_tag: {
    path: ["objects", "tags", "detach"],
    positional: ["targetClass", "tag"],
    description: "Detach a tag; pass the raw target locator with --object as JSON"
  },
  archive_all_notifications: {
    path: ["notifications", "all", "archive"],
    positional: [],
    description: "Archive all notifications for the current account"
  },
  mark_all_notifications_read: {
    path: ["notifications", "all", "read"],
    positional: [],
    description: "Mark all notifications read for the current account"
  },
  add_space_members: {
    path: ["spaces", "members", "add"],
    positional: ["space", "members"],
    description: "Add people to a space; members is a JSON array"
  },
  remove_space_members: {
    path: ["spaces", "members", "remove"],
    positional: ["space", "members"],
    description: "Remove people from a space; members is a JSON array"
  },
  set_space_owners: {
    path: ["spaces", "owners", "set"],
    positional: ["space", "owners"],
    description: "Replace space owners; owners is a JSON array"
  },
  add_space_role_members: {
    path: ["spaces", "roles", "members", "add"],
    positional: ["space", "role", "members"],
    description: "Add space-role members; members is a JSON array"
  },
  remove_space_role_members: {
    path: ["spaces", "roles", "members", "remove"],
    positional: ["space", "role", "members"],
    description: "Remove space-role members; members is a JSON array"
  },
  set_space_role_members: {
    path: ["spaces", "roles", "members", "set"],
    positional: ["space", "role", "members"],
    description: "Replace space-role members; members is a JSON array"
  },
  update_space: { path: ["spaces", "update"], positional: ["space"], description: "Update a generic space" },
  render_message_template: {
    path: ["templates", "render"],
    positional: ["template"],
    description: "Render a message template; pass --values as a JSON object"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
