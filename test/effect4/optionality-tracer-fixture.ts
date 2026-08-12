import { Schema } from "effect"

export const OptionalValueFixture = Schema.Struct({ value: Schema.optional(Schema.String) })

export const OptionalKeyFixture = Schema.Struct({ value: Schema.optionalKey(Schema.String) })
