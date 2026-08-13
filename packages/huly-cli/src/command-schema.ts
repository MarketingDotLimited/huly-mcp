import { Schema } from "effect"

export const CliCommandSegment = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  Schema.brand("CliCommandSegment"),
  Schema.annotate({ identifier: "CliCommandSegment", description: "One normalized Huly CLI command path segment." })
)
export type CliCommandSegment = Schema.Schema.Type<typeof CliCommandSegment>

export const CliCommandPath = Schema.Array(CliCommandSegment).annotate({
  identifier: "CliCommandPath",
  description: "A decoded path through the Huly CLI command tree."
})
export type CliCommandPath = Schema.Schema.Type<typeof CliCommandPath>
