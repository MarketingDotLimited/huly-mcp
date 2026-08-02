import { Count, type ListTotal, UNKNOWN_TOTAL } from "../../domain/schemas/shared.js"

export const listTotal = (value: number): ListTotal => (value === UNKNOWN_TOTAL ? UNKNOWN_TOTAL : Count.make(value))

export const combinedListTotal = (values: ReadonlyArray<number>): ListTotal =>
  values.includes(UNKNOWN_TOTAL) ? UNKNOWN_TOTAL : listTotal(values.reduce((total, value) => total + value, 0))

export const optionalCount = (value: number | undefined): Count | undefined =>
  value === undefined ? undefined : Count.make(value)
