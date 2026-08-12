import { Schema } from "effect"

export const clearableText = (description: string) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.annotate({ description: `${description} Pass null to clear; empty string is also accepted.` })
  )
