import { ParseResult, Schema } from "effect"

export const CUSTOM_FIELD_DATE_MAX_TIMESTAMP = 8_640_000_000_000_000

export const CustomFieldDateTimestamp = Schema.Number.pipe(
  Schema.finite(),
  Schema.int(),
  Schema.between(0, CUSTOM_FIELD_DATE_MAX_TIMESTAMP),
  Schema.brand("CustomFieldDateTimestamp")
).annotations({
  identifier: "CustomFieldDateTimestamp",
  title: "CustomFieldDateTimestamp",
  description: "Finite Unix timestamp in milliseconds within the ECMAScript Date range."
})

export type CustomFieldDateTimestamp = Schema.Schema.Type<typeof CustomFieldDateTimestamp>

const EPOCH_MILLISECONDS_PATTERN = /^(?:0|[1-9]\d*)$/
const ISO_CALENDAR_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const ISO_CALENDAR_DATE_LENGTH = 10

const parseStrictIsoCalendarDate = (input: string): number | undefined => {
  if (!ISO_CALENDAR_DATE_PATTERN.test(input)) return undefined
  const timestamp = Date.parse(`${input}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp)) return undefined
  return new Date(timestamp).toISOString().slice(0, ISO_CALENDAR_DATE_LENGTH) === input ? timestamp : undefined
}

const parseDocumentedDateInput = (input: string): number | undefined => {
  if (EPOCH_MILLISECONDS_PATTERN.test(input)) return Number(input)
  return parseStrictIsoCalendarDate(input)
}

export const CustomFieldDateValueSchema = Schema.transformOrFail(Schema.String, CustomFieldDateTimestamp, {
  strict: true,
  decode: (input, _options, ast) => {
    const timestamp = parseDocumentedDateInput(input)
    return timestamp === undefined
      ? ParseResult.fail(
          new ParseResult.Type(ast, input, "Expected YYYY-MM-DD or a canonical non-negative epoch-millisecond string")
        )
      : ParseResult.succeed(timestamp)
  },
  encode: (timestamp) => ParseResult.succeed(String(timestamp))
}).annotations({
  identifier: "CustomFieldDateValue",
  title: "CustomFieldDateValue",
  description:
    "A strict ISO calendar date (YYYY-MM-DD, UTC midnight) or canonical non-negative epoch-millisecond string."
})
