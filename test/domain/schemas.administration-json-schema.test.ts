import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import * as approvalRequests from "../../src/domain/schemas/approval-requests.js"
import * as customFieldDate from "../../src/domain/schemas/custom-field-date.js"
import * as customFields from "../../src/domain/schemas/custom-fields.js"
import * as deletion from "../../src/domain/schemas/deletion.js"
import * as directMessages from "../../src/domain/schemas/direct-messages.js"
import * as genericAssociations from "../../src/domain/schemas/generic-associations.js"
import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import * as modelAdministration from "../../src/domain/schemas/model-administration.js"
import * as preferences from "../../src/domain/schemas/preferences.js"
import * as projectTargetPreferences from "../../src/domain/schemas/project-target-preferences.js"
import * as relations from "../../src/domain/schemas/relations.js"
import * as sdkDiscovery from "../../src/domain/schemas/sdk-discovery.js"
import * as sdkDiscoveryConfigurations from "../../src/domain/schemas/sdk-discovery-configurations.js"
import * as search from "../../src/domain/schemas/search.js"
import * as securityAdministration from "../../src/domain/schemas/security-administration.js"
import * as sequenceAdministration from "../../src/domain/schemas/sequence-administration.js"
import * as tagCategories from "../../src/domain/schemas/tag-categories.js"
import * as tags from "../../src/domain/schemas/tags.js"
import * as views from "../../src/domain/schemas/views.js"
import * as workbench from "../../src/domain/schemas/workbench.js"

const schemaModules = {
  approvalRequests,
  customFieldDate,
  customFields,
  deletion,
  directMessages,
  genericAssociations,
  modelAdministration,
  preferences,
  projectTargetPreferences,
  relations,
  sdkDiscovery,
  sdkDiscoveryConfigurations,
  search,
  securityAdministration,
  sequenceAdministration,
  tagCategories,
  tags,
  views,
  workbench
}

const propertyRecords = (schema: unknown): ReadonlyArray<Record<string, unknown>> => {
  const record = parseJsonSchemaRecord(schema)
  if (record === undefined) return []
  const direct = parseJsonSchemaRecord(record.properties)
  if (direct !== undefined) return [direct]
  if (!Array.isArray(record.anyOf)) return []
  return record.anyOf.flatMap((member) => {
    const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(member)?.properties)
    return properties === undefined ? [] : [properties]
  })
}

describe("administration and extension JSON schemas", () => {
  it("describes every property in exported Params JSON schemas", () => {
    const gaps = Object.entries(schemaModules).flatMap(([moduleName, moduleExports]) =>
      Object.entries(moduleExports).flatMap(([exportName, schema]) => {
        if (!exportName.endsWith("ParamsJsonSchema")) return []
        return propertyRecords(schema).flatMap((properties) =>
          Object.entries(properties).flatMap(([propertyName, property]) => {
            const description = parseJsonSchemaRecord(property)?.description
            return typeof description === "string" && description.length > 0
              ? []
              : [`${moduleName}.${exportName}.${propertyName}`]
          })
        )
      })
    )

    expect(gaps).toEqual([])
  })

  it("restores representative descriptions on direct and union schemas", () => {
    expect(
      parseJsonSchemaRecord(parseJsonSchemaRecord(sdkDiscovery.listHulyAttributesParamsJsonSchema)?.properties)?.query
    ).toMatchObject({ description: expect.stringContaining("attribute ID") })

    const relationMembers = parseJsonSchemaRecord(genericAssociations.deleteRelationParamsJsonSchema)?.anyOf
    expect(relationMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          properties: expect.objectContaining({
            relation: expect.objectContaining({ description: expect.any(String) })
          })
        }),
        expect.objectContaining({
          properties: expect.objectContaining({
            association: expect.objectContaining({ description: expect.any(String) }),
            source: expect.objectContaining({ description: expect.any(String) }),
            target: expect.objectContaining({ description: expect.any(String) })
          })
        })
      ])
    )
  })

  it.effect("attributes deletion cross-field failures to identifier", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(deletion.parsePreviewDeletionParams({ entityType: "issue", project: "PROJ" }))

      expect(error.message).toContain("identifier is required when entityType is 'issue'")
      expect(error.message).toContain('["identifier"]')
    })
  )
})
