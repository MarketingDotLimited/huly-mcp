import { Schema, SchemaTransformation } from "effect"

export const nonEmptyTrimmedString = (annotations?: Schema.Annotations.Bottom<string>) =>
  Schema.String.check(Schema.isNonEmpty()).pipe(
    Schema.annotate(annotations ?? {}),
    Schema.decodeTo(Schema.Trimmed.check(Schema.isNonEmpty()), SchemaTransformation.trim())
  )

export const NonEmptyString = nonEmptyTrimmedString({ identifier: "NonEmptyString" })
export type NonEmptyString = Schema.Schema.Type<typeof NonEmptyString>
