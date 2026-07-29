export const clearTextAsEmptyString = (value: string | null): string => (value === null ? "" : value)

export const textContentOrClear = (value: string | null): string | undefined =>
  value === null || value.trim() === "" ? undefined : value
