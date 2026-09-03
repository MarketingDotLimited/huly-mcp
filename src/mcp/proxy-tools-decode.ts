import { Result, Schema, type SchemaAST } from "effect"
import { mapParseErrorToMcp } from "./error-mapping.js"
import type { McpToolResponse } from "./tool-responses.js"

export type DecodeOrErrorResult<A> =
  | { readonly _tag: "success"; readonly params: A }
  | { readonly _tag: "error"; readonly response: McpToolResponse }

export const strictProxyInputParseOptions = { onExcessProperty: "error" } as const satisfies SchemaAST.ParseOptions

export const decodeOrError = <A, I>(
  schema: Schema.Codec<A, I>,
  input: unknown,
  toolName: string
): DecodeOrErrorResult<A> => {
  const decoded = Schema.decodeUnknownResult(schema, strictProxyInputParseOptions)(input ?? {})
  if (Result.isSuccess(decoded)) return { _tag: "success", params: decoded.success }
  return { _tag: "error", response: mapParseErrorToMcp(decoded.failure, toolName) }
}
