export const UPLOAD_FILE_PATH_DESCRIPTION =
  "Filesystem path resolved on the MCP server host (inside its container when Dockerized), not on the MCP client. For a client-local file, send base64 data instead."

export const UPLOAD_FILE_URL_DESCRIPTION =
  "Remote URL fetched by the MCP server; it must be reachable from the server's network."

export const UPLOAD_BASE64_DATA_DESCRIPTION =
  "Base64-encoded file content sent by the MCP client. Use this for client-local files."

export const UPLOAD_SOURCE_SEMANTICS =
  "filePath is resolved on the MCP server host, data is client-local base64 content, and fileUrl is fetched by the MCP server."

export const UPLOAD_SOURCE_FIELD_DESCRIPTIONS = {
  filePath: UPLOAD_FILE_PATH_DESCRIPTION,
  fileUrl: UPLOAD_FILE_URL_DESCRIPTION,
  data: UPLOAD_BASE64_DATA_DESCRIPTION
} as const
