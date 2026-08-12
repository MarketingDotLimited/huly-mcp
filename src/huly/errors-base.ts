/**
 * Base error types for Huly MCP server.
 *
 * @module
 */
import { Schema } from "effect"

import {
  HulyEndpointOriginSchema,
  HulyUnavailableDetailCodeSchema,
  HulyUnavailableFailureKindSchema
} from "./unavailable-diagnostics.js"

/**
 * Base Huly error - generic operational error.
 */
export class HulyError extends Schema.TaggedError<HulyError>()("HulyError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Update request did not include any fields to change.
 */
export class NoUpdateFieldsError extends Schema.TaggedError<NoUpdateFieldsError>()("NoUpdateFieldsError", {
  operation: Schema.String,
  fields: Schema.Array(Schema.String)
}) {
  override get message(): string {
    return `${this.operation} requires at least one update field: ${this.fields.join(", ")}`
  }
}

/**
 * Connection error - network/transport failures.
 */
export class HulyConnectionError extends Schema.TaggedError<HulyConnectionError>()("HulyConnectionError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/** A sanitized connection failure that permits safe, actionable MCP guidance. */
export class HulyUnavailableError extends Schema.TaggedError<HulyUnavailableError>()("HulyUnavailableError", {
  endpointOrigin: HulyEndpointOriginSchema,
  failureKind: HulyUnavailableFailureKindSchema,
  detailCode: Schema.optionalKey(HulyUnavailableDetailCodeSchema)
}) {}

/**
 * Authentication error - invalid credentials or expired session.
 */
export class HulyAuthError extends Schema.TaggedError<HulyAuthError>()("HulyAuthError", { message: Schema.String }) {}

const HulyModelNameSchema = Schema.Literals([
  "Association",
  "Relation",
  "RelatedDocument",
  "Issue",
  "Document",
  "Teamspace",
  "Object"
])
export type HulyModelName = Schema.Schema.Type<typeof HulyModelNameSchema>

const HulyModelFieldSchema = Schema.Literals([
  "_id",
  "_class",
  "association",
  "docA",
  "docB",
  "classA",
  "classB",
  "nameA",
  "nameB",
  "type",
  "automationOnly",
  "identifier",
  "space",
  "name"
])
export type HulyModelField = Schema.Schema.Type<typeof HulyModelFieldSchema>

/** Untrusted Huly SDK model metadata did not satisfy the domain boundary contract. */
export class HulyModelMetadataError extends Schema.TaggedError<HulyModelMetadataError>()("HulyModelMetadataError", {
  model: HulyModelNameSchema,
  field: HulyModelFieldSchema
}) {
  override get message(): string {
    return `Huly ${this.model} metadata contains an invalid '${this.field}' field. Repair the affected backend model data before retrying.`
  }
}
