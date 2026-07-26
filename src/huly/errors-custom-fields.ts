/**
 * Custom field domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { DocId, ObjectClassName } from "../domain/schemas/shared.js"

export class CustomFieldNotFoundError extends Schema.TaggedError<CustomFieldNotFoundError>()(
  "CustomFieldNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Custom field '${this.identifier}' not found`
  }
}

export class CustomFieldObjectNotFoundError extends Schema.TaggedError<CustomFieldObjectNotFoundError>()(
  "CustomFieldObjectNotFoundError",
  {
    objectId: DocId,
    objectClass: ObjectClassName
  }
) {
  override get message(): string {
    return `Object '${this.objectId}' of class '${this.objectClass}' not found`
  }
}

export class InvalidCustomFieldDateValueError extends Schema.TaggedError<InvalidCustomFieldDateValueError>()(
  "InvalidCustomFieldDateValueError",
  {
    value: Schema.String
  }
) {
  override get message(): string {
    return `Invalid date custom-field value '${this.value}'. Use a real calendar date in YYYY-MM-DD form or a canonical non-negative epoch-millisecond string between 0 and 8640000000000000. Time-zone suffixes, date-times, signs, decimals, exponents, whitespace, and non-finite values are not accepted.`
  }
}
