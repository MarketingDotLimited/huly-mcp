import { Schema } from "effect"

export const optionalOutput = <S extends Schema.Constraint>(schema: S): Schema.optionalKey<S> =>
  Schema.optionalKey(schema)
