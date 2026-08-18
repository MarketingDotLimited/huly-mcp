import { createInterface } from "node:readline"

import {
  handleUnsupportedNodeRequest,
  renderUnsupportedNodeDiagnostic,
  type UnsupportedNodeMcpConfig
} from "./unsupported-node-mcp.js"

export const startUnsupportedNodeMcp = (config: UnsupportedNodeMcpConfig): void => {
  process.stderr.write(`${renderUnsupportedNodeDiagnostic(config)}\n`)
  const lines = createInterface({ input: process.stdin })
  lines.on("line", (line) => {
    const response = handleUnsupportedNodeRequest(line, config)
    if (response !== undefined) process.stdout.write(`${response}\n`)
  })
}
