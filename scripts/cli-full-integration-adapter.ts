import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { Either, Schema } from "effect"

import { McpImageContentSchema } from "../src/domain/schemas/attachments.js"
import { cliCommandCatalog, isCliToolName } from "../packages/huly-cli/src/catalog.js"
import type { CliCommandSpec } from "../packages/huly-cli/src/catalog-types.js"
import { CliJsonWrappedResultSchema } from "../packages/huly-cli/src/render.js"
import { createImageSuccessResponse, createSuccessResponse, toMcpResponse } from "../src/mcp/tool-responses.js"
import {
  type FullIntegrationAdapterResponse,
  FullIntegrationAdapterResultSchema,
  FullIntegrationAdapterResponseSchema
} from "./full-integration-adapter-contract.js"

const AdapterArgumentsSchema = Schema.Tuple(
  Schema.NonEmptyTrimmedString.annotations({ description: "Installed packed huly executable." }),
  Schema.NonEmptyTrimmedString.annotations({ description: "MCP tools/call JSON payload." }),
  Schema.NonEmptyTrimmedString.annotations({ description: "Temporary image output path." })
)
const ToolArgumentsSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })
const ToolCallRequestSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: Schema.NonEmptyTrimmedString, arguments: ToolArgumentsSchema }),
  id: Schema.Number
})

const NODE_ARGUMENT_OFFSET = 2
const [executable, payload, imagePath] = Schema.decodeUnknownSync(AdapterArgumentsSchema)(
  process.argv.slice(NODE_ARGUMENT_OFFSET)
)
const request = Schema.decodeUnknownSync(Schema.parseJson(ToolCallRequestSchema))(payload)

if (!isCliToolName(request.params.name)) {
  throw new Error(`MCP integration requested unknown CLI tool ${request.params.name}.`)
}

const spec: CliCommandSpec = cliCommandCatalog[request.params.name]
const cliValue = (value: unknown): string => {
  if (typeof value === "string") return value
  const encoded = JSON.stringify(value)
  return encoded === undefined ? "" : encoded
}
const positionalArguments = spec.positional.flatMap((fieldName) => {
  const value = request.params.arguments[fieldName]
  return value === undefined ? [] : [cliValue(value)]
})
const imageOutputArguments = spec.behavior?.fileOutput?.type === "image-content" ? ["--output", imagePath] : []
const commandArguments = [
  ...spec.path,
  ...positionalArguments,
  "--input-json",
  JSON.stringify(request.params.arguments),
  "--yes",
  "--json",
  ...imageOutputArguments
]
const execution = spawnSync(executable, commandArguments, { encoding: "utf8" })

const errorText = (): string => {
  if (execution.error !== undefined) return execution.error.message
  const stderr = Schema.decodeUnknownSync(Schema.String)(execution.stderr).trim()
  return stderr.length === 0 ? `CLI exited with status ${String(execution.status)}.` : stderr
}

const errorResponse = (): FullIntegrationAdapterResponse => ({
  jsonrpc: "2.0",
  id: request.id,
  result: { content: [{ type: "text", text: errorText() }], isError: true }
})

const successResponse = (): FullIntegrationAdapterResponse => {
  const stdout = Schema.decodeUnknownSync(Schema.String)(execution.stdout)
  const cliOutput = Schema.decodeUnknownSync(Schema.parseJson())(stdout)
  const wrapped = Schema.decodeUnknownEither(CliJsonWrappedResultSchema)(cliOutput)
  const result = Either.isRight(wrapped) ? wrapped.right.result : cliOutput
  const warnings = Either.isRight(wrapped) && "warnings" in wrapped.right ? wrapped.right.warnings : []
  const image = Either.isRight(wrapped) && "image" in wrapped.right ? wrapped.right.image : undefined
  const toolResponse =
    image === undefined
      ? createSuccessResponse(result, warnings)
      : createImageSuccessResponse(
          result,
          Schema.decodeUnknownSync(McpImageContentSchema)({
            type: "image",
            data: readFileSync(imagePath).toString("base64"),
            mimeType: image.mimeType
          }),
          warnings
        )
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: Schema.decodeUnknownSync(FullIntegrationAdapterResultSchema)(toMcpResponse(toolResponse))
  }
}

const response = execution.status === 0 ? successResponse() : errorResponse()
console.log(JSON.stringify(Schema.encodeSync(FullIntegrationAdapterResponseSchema)(response)))
