import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import {
  ChildTemplateInputSchema,
  CreateIssueTemplateParamsSchema,
  IssueSchema,
  IssueTemplateChildSchema,
  IssueTemplateSchema,
  UpdateIssueTemplateParamsSchema
} from "../../src/domain/schemas.js"
import { createIssueParamsJsonSchema, updateIssueParamsJsonSchema } from "../../src/domain/schemas/issues.js"
import { toDraft07JsonSchema } from "../../src/domain/schemas/json-schema.js"
import { TIME_HOURS_EXAMPLES } from "../../src/domain/schemas/time.js"

interface JsonSchemaProperty {
  readonly description?: string
}

interface JsonSchemaObject {
  readonly properties?: Readonly<Record<string, JsonSchemaProperty>>
}

const estimationDescription = (schema: unknown): string | undefined => {
  if (typeof schema !== "object" || schema === null) return undefined
  const properties = Reflect.get(schema, "properties")
  if (typeof properties !== "object" || properties === null) return undefined
  const estimation = Reflect.get(properties, "estimation")
  if (typeof estimation !== "object" || estimation === null) return undefined
  const description = Reflect.get(estimation, "description")
  return typeof description === "string" ? description : undefined
}

const estimationSchemas: ReadonlyArray<readonly [string, JsonSchemaObject]> = [
  ["issue output", toDraft07JsonSchema(IssueSchema)],
  ["issue create input", createIssueParamsJsonSchema],
  ["issue update input", updateIssueParamsJsonSchema],
  ["template output", toDraft07JsonSchema(IssueTemplateSchema)],
  ["template child output", toDraft07JsonSchema(IssueTemplateChildSchema)],
  ["template create input", toDraft07JsonSchema(CreateIssueTemplateParamsSchema)],
  ["template child input", toDraft07JsonSchema(ChildTemplateInputSchema)],
  ["template update input", toDraft07JsonSchema(UpdateIssueTemplateParamsSchema)]
]

describe("issue estimation hour contracts", () => {
  it("documents every issue and template estimation field in Huly-native hours", () => {
    for (const [name, schema] of estimationSchemas) {
      const description = estimationDescription(schema)
      expect(description, name).toContain("in hours (Huly native unit)")
      expect(description, name).toContain(TIME_HOURS_EXAMPLES)
      expect(description, name).not.toContain("estimation in minutes")
    }
  })
})
