import { Schema } from "effect"

import { Integer, NonNegativeInteger, PositiveInteger } from "./shared.js"

const MAX_ZERO_BASED_MONTH_INDEX = 11
const MAX_MONTH_DAY = 31
const MIN_SET_POSITION = -366
const MAX_SET_POSITION = 366

export const RecurrenceCount = PositiveInteger.pipe(Schema.brand("RecurrenceCount")).annotate({
  identifier: "RecurrenceCount",
  title: "RecurrenceCount",
  description: "Positive recurrence occurrence count."
})
export type RecurrenceCount = Schema.Schema.Type<typeof RecurrenceCount>

export const RecurrenceInterval = PositiveInteger.pipe(Schema.brand("RecurrenceInterval")).annotate({
  identifier: "RecurrenceInterval",
  title: "RecurrenceInterval",
  description: "Positive recurrence interval."
})
export type RecurrenceInterval = Schema.Schema.Type<typeof RecurrenceInterval>

export const MonthIndex = NonNegativeInteger.pipe(
  Schema.check(Schema.isLessThanOrEqualTo(MAX_ZERO_BASED_MONTH_INDEX)),
  Schema.brand("MonthIndex")
).annotate({
  identifier: "MonthIndex",
  title: "MonthIndex",
  description: "Zero-based calendar month index (0=January, 11=December)."
})
export type MonthIndex = Schema.Schema.Type<typeof MonthIndex>

export const MonthDayOrdinal = Integer.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(MAX_MONTH_DAY)),
  Schema.brand("MonthDayOrdinal")
).annotate({
  identifier: "MonthDayOrdinal",
  title: "MonthDayOrdinal",
  description: "Calendar month day, 1 through 31. Huly's recurrence generator does not support negative month days."
})
export type MonthDayOrdinal = Schema.Schema.Type<typeof MonthDayOrdinal>

export const SetPositionOrdinal = Integer.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(MIN_SET_POSITION),
    Schema.isLessThanOrEqualTo(MAX_SET_POSITION),
    Schema.makeFilter((value) => (value !== 0 ? undefined : "Set-position ordinal cannot be zero."))
  ),
  Schema.brand("SetPositionOrdinal")
).annotate({
  identifier: "SetPositionOrdinal",
  title: "SetPositionOrdinal",
  description: "Signed set-position ordinal, -366 through -1 or 1 through 366."
})
export type SetPositionOrdinal = Schema.Schema.Type<typeof SetPositionOrdinal>
