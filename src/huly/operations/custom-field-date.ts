import { Effect, Schema } from "effect"

import { type CustomFieldDateTimestamp, CustomFieldDateValueSchema } from "../../domain/schemas/custom-field-date.js"
import { InvalidCustomFieldDateValueError } from "../errors-custom-fields.js"

const decodeCustomFieldDateValue = Schema.decodeUnknownEffect(CustomFieldDateValueSchema)

export const parseCustomFieldDateValue = (
  input: string
): Effect.Effect<CustomFieldDateTimestamp, InvalidCustomFieldDateValueError> =>
  decodeCustomFieldDateValue(input).pipe(Effect.mapError(() => new InvalidCustomFieldDateValueError({ value: input })))
