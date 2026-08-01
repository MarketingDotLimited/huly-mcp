import {
  CreateHulyAttributeResultSchema,
  CreateHulyEnumResultSchema,
  createHulyAttributeParamsJsonSchema,
  createHulyEnumParamsJsonSchema,
  DeleteHulyAttributeResultSchema,
  DeleteHulyEnumResultSchema,
  deleteHulyAttributeParamsJsonSchema,
  deleteHulyEnumParamsJsonSchema,
  parseCreateHulyAttributeParams,
  parseCreateHulyEnumParams,
  parseDeleteHulyAttributeParams,
  parseDeleteHulyEnumParams,
  parseUpdateHulyAttributeParams,
  parseUpdateHulyEnumParams,
  UpdateHulyAttributeResultSchema,
  UpdateHulyEnumResultSchema,
  updateHulyAttributeParamsJsonSchema,
  updateHulyEnumParamsJsonSchema
} from "../../domain/schemas/model-administration.js"
import {
  createHulyAttribute,
  deleteHulyAttribute,
  updateHulyAttribute
} from "../../huly/operations/model-attribute-writes.js"
import { createHulyEnum, deleteHulyEnum, updateHulyEnum } from "../../huly/operations/model-enum-writes.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "model-administration" as const
const MODEL_WRITE_GUARD =
  "This changes workspace model metadata. confirm=true is required so an agent cannot mutate the model accidentally."

export const modelAdministrationTools = [
  defineTool(
    {
      name: "create_huly_enum",
      description: `Create a Huly model enum with ordered option values. An exact case-insensitive name is idempotent only when its ordered values match; otherwise the call returns a conflict. ${MODEL_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: createHulyEnumParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateHulyEnumResultSchema
    },
    parseCreateHulyEnumParams,
    createHulyEnum
  ),
  defineTool(
    {
      name: "update_huly_enum",
      description: `Update a Huly model enum resolved by exact ID or name. Renaming and adding options are safe; removing an option is refused while any attribute references the enum. ${MODEL_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: updateHulyEnumParamsJsonSchema,
      resultSchema: UpdateHulyEnumResultSchema
    },
    parseUpdateHulyEnumParams,
    updateHulyEnum
  ),
  defineTool(
    {
      name: "delete_huly_enum",
      description: `Permanently delete a Huly model enum resolved by exact ID or name. Refuses deletion while any attribute references it. ${MODEL_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: deleteHulyEnumParamsJsonSchema,
      resultSchema: DeleteHulyEnumResultSchema
    },
    parseDeleteHulyEnumParams,
    deleteHulyEnum
  ),
  defineTool(
    {
      name: "create_huly_attribute",
      description: `Create a custom Huly Attribute/property on a class resolved by exact ID, tail name, or label. Supports string, number, boolean, date, markup, enum, and reference types; enum and reference targets also resolve by name. Existing same-name attributes are idempotent only when their definition matches; otherwise the call returns a conflict. New records are always isCustom=true. ${MODEL_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: createHulyAttributeParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateHulyAttributeResultSchema
    },
    parseCreateHulyAttributeParams,
    createHulyAttribute
  ),
  defineTool(
    {
      name: "update_huly_attribute",
      description: `Update label, index, automation-only, or hidden state for a Huly Attribute resolved by ID or exact name. Pass class by ID/name to disambiguate. Built-in attributes permit hidden-only updates; all other built-in mutations are protected, and property keys/types cannot be changed here. Hide/unhide uses the SDK behavior exercised by Huly settings. ${MODEL_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: updateHulyAttributeParamsJsonSchema,
      resultSchema: UpdateHulyAttributeResultSchema
    },
    parseUpdateHulyAttributeParams,
    updateHulyAttribute
  ),
  defineTool(
    {
      name: "delete_huly_attribute",
      description: `Permanently delete an unused custom Huly Attribute resolved by ID or exact name. Pass class by ID/name to disambiguate. Built-in attributes and attributes present on any owning-class document are protected. ${MODEL_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: deleteHulyAttributeParamsJsonSchema,
      resultSchema: DeleteHulyAttributeResultSchema
    },
    parseDeleteHulyAttributeParams,
    deleteHulyAttribute
  )
] as const satisfies ReadonlyArray<RegisteredTool>
