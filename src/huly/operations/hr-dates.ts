import type { TzDate } from "@hcengineering/hr"
import { Effect } from "effect"

import { HrDate, type HrDate as HrDateType } from "../../domain/schemas/hr-requests.js"
import { HulyError } from "../errors.js"

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/
const YEAR_WIDTH = 4
const DATE_PART_WIDTH = 2
const MIDDAY_HOUR = 12
const MILLISECONDS_PER_MINUTE = 60_000

const requiredDatePart = (values: ReadonlyMap<string, number>, part: string): number => {
  const value = values.get(part)
  /* v8 ignore start -- Intl must return every explicitly requested numeric date-time part */
  if (value === undefined) throw new Error(`Intl.DateTimeFormat omitted '${part}'`)
  /* v8 ignore stop */
  return value
}

export const formatTzDate = (value: TzDate): HrDateType =>
  HrDate.make(
    `${String(value.year).padStart(YEAR_WIDTH, "0")}-${String(value.month + 1).padStart(DATE_PART_WIDTH, "0")}-${String(value.day).padStart(DATE_PART_WIDTH, "0")}`
  )

const offsetFor = (year: number, month: number, day: number, timeZone: string): number => {
  const instant = Date.UTC(year, month - 1, day, MIDDAY_HOUR)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant)
  const values = new Map(parts.map((part) => [part.type, Number(part.value)]))
  const localAsUtc = Date.UTC(
    requiredDatePart(values, "year"),
    requiredDatePart(values, "month") - 1,
    requiredDatePart(values, "day"),
    requiredDatePart(values, "hour"),
    requiredDatePart(values, "minute"),
    requiredDatePart(values, "second")
  )
  return Math.round((instant - localAsUtc) / MILLISECONDS_PER_MINUTE)
}

export const makeTzDate = (date: HrDateType, timeZone = "UTC"): Effect.Effect<TzDate, HulyError> =>
  Effect.try({
    try: () => {
      const match = DATE_PARTS.exec(date)
      if (match === null) throw new Error("invalid date")
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      const probe = new Date(Date.UTC(year, month - 1, day))
      if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
        throw new Error("invalid calendar date")
      }
      return { year, month: month - 1, day, offset: offsetFor(year, month, day, timeZone) }
    },
    catch: () => new HulyError({ message: `Invalid date '${date}' or IANA timezone '${timeZone}'` })
  })

export const ensureDateOrder = (startDate: HrDateType, endDate: HrDateType): Effect.Effect<void, HulyError> =>
  startDate <= endDate
    ? Effect.void
    : Effect.fail(new HulyError({ message: `startDate '${startDate}' must not be after endDate '${endDate}'` }))
