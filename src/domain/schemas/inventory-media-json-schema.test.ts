import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { inventoryMediaJsonSchema, withExactlyOneInventoryMediaFileSource } from "./inventory-media-json-schema.js"
import {
  createInventoryProductParamsJsonSchema,
  createInventoryVariantParamsJsonSchema,
  listInventoryCategoriesParamsJsonSchema,
  updateInventoryProductParamsJsonSchema,
  updateInventoryVariantParamsJsonSchema
} from "./inventory.js"
import { parseJsonSchemaRecord } from "./json-schema.js"

const getProperty = (schema: unknown, property: string): unknown => {
  return parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)?.[property]
}

const getDescription = (schema: unknown, property: string): unknown => {
  const field = getProperty(schema, property)
  return parseJsonSchemaRecord(field)?.description
}

describe("Inventory media JSON schema helpers", () => {
  it("adds known Inventory media field descriptions without inventing custom ones", () => {
    const jsonSchema = inventoryMediaJsonSchema(Schema.Struct({ product: Schema.String, custom: Schema.String }))

    expect(getDescription(jsonSchema, "product")).toContain("Inventory product ID or exact product name")
    expect(getDescription(jsonSchema, "custom")).toBeUndefined()
  })

  it("adds oneOf requirements for exactly one media file source", () => {
    const jsonSchema = withExactlyOneInventoryMediaFileSource({ type: "object" })

    expect(parseJsonSchemaRecord(jsonSchema)?.oneOf).toEqual([
      { required: ["filePath"] },
      { required: ["fileUrl"] },
      { required: ["data"] }
    ])
  })

  it("preserves core inventory parameter descriptions", () => {
    expect(getDescription(listInventoryCategoriesParamsJsonSchema, "query")).toBe(
      "Case-insensitive substring filter for category names."
    )
    expect(getDescription(createInventoryProductParamsJsonSchema, "name")).toBe("New product name.")
    expect(getDescription(updateInventoryProductParamsJsonSchema, "product")).toBe(
      "Product ID or exact product name to update. Name lookup must be unambiguous; pass category when needed."
    )
    expect(getDescription(createInventoryVariantParamsJsonSchema, "sku")).toBe("New exact SKU.")
    expect(getDescription(updateInventoryVariantParamsJsonSchema, "sku")).toBe("New SKU.")
  })
})
