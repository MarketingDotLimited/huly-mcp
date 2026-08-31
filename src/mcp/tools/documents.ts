import {
  createDocumentParamsJsonSchema,
  createTeamspaceParamsJsonSchema,
  deleteDocumentParamsJsonSchema,
  deleteTeamspaceParamsJsonSchema,
  DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE,
  editDocumentParamsJsonSchema,
  getDocumentParamsJsonSchema,
  getTeamspaceParamsJsonSchema,
  listDocumentsParamsJsonSchema,
  listSavedDocumentsParamsJsonSchema,
  listInlineCommentsParamsJsonSchema,
  listTeamspacesParamsJsonSchema,
  parseCreateDocumentParams,
  parseCreateTeamspaceParams,
  parseDeleteDocumentParams,
  parseDeleteTeamspaceParams,
  parseEditDocumentParams,
  parseGetDocumentParams,
  parseGetTeamspaceParams,
  parseListDocumentsParams,
  parseListSavedDocumentsParams,
  parseListInlineCommentsParams,
  parseListTeamspacesParams,
  parseSaveDocumentParams,
  parseUnsaveDocumentParams,
  saveDocumentParamsJsonSchema,
  unsaveDocumentParamsJsonSchema,
  parseUpdateTeamspaceParams,
  updateTeamspaceParamsJsonSchema
} from "../../domain/schemas.js"
import {
  CreateDocumentResultSchema,
  CreateTeamspaceResultSchema,
  DeleteDocumentResultSchema,
  DeleteTeamspaceResultSchema,
  EditDocumentResultSchema,
  GetDocumentResultSchema,
  GetTeamspaceResultSchema,
  ListDocumentsResultSchema,
  ListInlineCommentsResultSchema,
  ListTeamspacesResultSchema,
  UpdateTeamspaceResultSchema
} from "../../domain/schemas/documents.js"
import {
  ListSavedDocumentsResultSchema,
  SaveDocumentResultSchema,
  UnsaveDocumentResultSchema
} from "../../domain/schemas/documents-saved.js"
import {
  createDocument,
  createTeamspace,
  deleteDocument,
  deleteTeamspace,
  editDocument,
  getDocument,
  getTeamspace,
  listDocuments,
  listInlineComments,
  listTeamspaces,
  updateTeamspace
} from "../../huly/operations/documents.js"
import { listSavedDocuments, saveDocument, unsaveDocument } from "../../huly/operations/documents-saved.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "documents" as const

export const documentTools = [
  defineTool(
    {
      name: "list_teamspaces",
      description:
        "List all Huly document teamspaces. Returns teamspaces sorted by name. Supports filtering by archived status.",
      category: CATEGORY,
      inputSchema: listTeamspacesParamsJsonSchema,
      resultSchema: ListTeamspacesResultSchema
    },
    parseListTeamspacesParams,
    listTeamspaces
  ),
  defineTool(
    {
      name: "get_teamspace",
      description:
        "Get details for a Huly document teamspace including document count. Finds by name or ID, including archived teamspaces.",
      category: CATEGORY,
      inputSchema: getTeamspaceParamsJsonSchema,
      resultSchema: GetTeamspaceResultSchema
    },
    parseGetTeamspaceParams,
    getTeamspace
  ),
  defineTool(
    {
      name: "create_teamspace",
      description:
        "Create a new Huly document teamspace. Idempotent: returns existing teamspace if one with the same name exists.",
      category: CATEGORY,
      inputSchema: createTeamspaceParamsJsonSchema,
      resultSchema: CreateTeamspaceResultSchema
    },
    parseCreateTeamspaceParams,
    createTeamspace
  ),
  defineTool(
    {
      name: "update_teamspace",
      description:
        "Update fields on an existing Huly document teamspace. Only provided fields are modified. Set description to null to clear it.",
      category: CATEGORY,
      inputSchema: updateTeamspaceParamsJsonSchema,
      resultSchema: UpdateTeamspaceResultSchema
    },
    parseUpdateTeamspaceParams,
    updateTeamspace
  ),
  defineTool(
    {
      name: "delete_teamspace",
      description: "Permanently delete a Huly document teamspace. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteTeamspaceParamsJsonSchema,
      resultSchema: DeleteTeamspaceResultSchema
    },
    parseDeleteTeamspaceParams,
    deleteTeamspace
  ),
  defineTool(
    {
      name: "list_documents",
      description:
        "List documents in a Huly teamspace. Returns documents sorted by modification date (newest first). Each result includes a 'url' field pointing to the document in the Huly web app. Supports searching by title substring (titleSearch) and content (contentSearch).",
      category: CATEGORY,
      inputSchema: listDocumentsParamsJsonSchema,
      resultSchema: ListDocumentsResultSchema
    },
    parseListDocumentsParams,
    listDocuments
  ),
  defineTool(
    {
      name: "get_document",
      description:
        "Retrieve full details for a Huly document including markdown content and a 'url' field pointing to the document in the Huly web app. Use this to view document content and metadata.",
      category: CATEGORY,
      inputSchema: getDocumentParamsJsonSchema,
      resultSchema: GetDocumentResultSchema
    },
    parseGetDocumentParams,
    getDocument
  ),
  defineTool(
    {
      name: "create_document",
      description:
        "Create a new document in a Huly teamspace. Content is markdown and supports native Mermaid diagrams (```mermaid blocks render interactively in Huly UI). " +
        DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE +
        " Optionally pass parent as a document title or ID to create a nested child document; invalid parents fail instead of silently creating a top-level document. Returns the created document id and a 'url' field pointing to the document in the Huly web app. Use link_document_to_issue only if you also want an issue-document association.",
      category: CATEGORY,
      inputSchema: createDocumentParamsJsonSchema,
      resultSchema: CreateDocumentResultSchema
    },
    parseCreateDocumentParams,
    createDocument
  ),
  defineTool(
    {
      name: "edit_document",
      description:
        "Edit an existing Huly document. You may rename with title and/or edit the body. Body editing has two mutually exclusive modes: (1) content replaces the entire markdown body, (2) old_text + new_text performs exact targeted search-and-replace. " +
        DOCUMENT_NATIVE_REFERENCE_TOOL_USAGE +
        " For targeted replace, multiple matches error unless replace_all is true; empty new_text deletes matched text. Content supports native Mermaid diagrams. Returns a 'url' field pointing to the document in the Huly web app.",
      category: CATEGORY,
      inputSchema: editDocumentParamsJsonSchema,
      resultSchema: EditDocumentResultSchema
    },
    parseEditDocumentParams,
    editDocument
  ),
  defineTool(
    {
      name: "list_inline_comments",
      description:
        "List inline comment threads from a Huly document. Extracts comments embedded in document content as ProseMirror marks. Each comment includes the highlighted text and thread ID. Set includeReplies=true to also fetch thread reply messages with sender names.",
      category: CATEGORY,
      inputSchema: listInlineCommentsParamsJsonSchema,
      resultSchema: ListInlineCommentsResultSchema
    },
    parseListInlineCommentsParams,
    listInlineComments
  ),
  defineTool(
    {
      name: "save_document",
      description: "Save or bookmark a Huly document for the current user. Idempotent when already saved.",
      category: CATEGORY,
      inputSchema: saveDocumentParamsJsonSchema,
      resultSchema: SaveDocumentResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    parseSaveDocumentParams,
    saveDocument
  ),
  defineTool(
    {
      name: "unsave_document",
      description: "Remove a Huly document from the current user's saved bookmarks. Idempotent when not saved.",
      category: CATEGORY,
      inputSchema: unsaveDocumentParamsJsonSchema,
      resultSchema: UnsaveDocumentResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    parseUnsaveDocumentParams,
    unsaveDocument
  ),
  defineTool(
    {
      name: "list_saved_documents",
      description: "List documents saved or bookmarked by the current user.",
      category: CATEGORY,
      inputSchema: listSavedDocumentsParamsJsonSchema,
      resultSchema: ListSavedDocumentsResultSchema
    },
    parseListSavedDocumentsParams,
    listSavedDocuments
  ),
  defineTool(
    {
      name: "delete_document",
      description: "Permanently delete a Huly document. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteDocumentParamsJsonSchema,
      resultSchema: DeleteDocumentResultSchema
    },
    parseDeleteDocumentParams,
    deleteDocument
  )
] as const satisfies ReadonlyArray<RegisteredTool>
