import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { CLI_UPLOAD_SOURCE_SEMANTICS } from "./parity-contract.js"

export const parityCoreCliCommandCatalog = {
  add_attachment: {
    path: ["attachments", "add"],
    positional: ["objectId", "objectClass", "space", "filename", "contentType"],
    description: `Add an attachment to a raw Huly object. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: {
      base64FileInput: { fields: ["data"] },
      fileInput: { fields: ["description"] },
      uploadInput: { type: "huly-upload-source" }
    }
  },
  upload_file: {
    path: ["storage", "upload"],
    positional: ["filename", "contentType"],
    description: `Upload a file to Huly storage. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: { base64FileInput: { fields: ["data"] }, uploadInput: { type: "huly-upload-source" } }
  },
  create_drawing: {
    path: ["drawings", "create"],
    positional: ["parentId", "parentClass", "space"],
    description: "Create a drawing; pass opaque content with --content or --content-file",
    behavior: { fileInput: { fields: ["content"] } }
  },
  update_drawing: {
    path: ["drawings", "update"],
    positional: ["drawingId"],
    description: "Update drawing content; pass null to --content to clear it",
    behavior: { fileInput: { fields: ["content"] } }
  },
  upsert_project_target_preference: {
    path: ["projects", "target-preferences", "upsert"],
    positional: ["project"],
    description: "Create or update a project target preference; pass --props as a JSON array"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
