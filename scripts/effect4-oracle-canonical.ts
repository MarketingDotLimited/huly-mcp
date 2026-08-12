const JSON_INDENT_SPACES = 2

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

const isPlainRecord = (value: object): value is Readonly<Record<string, unknown>> => {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const normalizeObject = (value: Readonly<Record<string, unknown>>, ancestors: WeakSet<object>): JsonValue => {
  if (ancestors.has(value)) throw new TypeError("Oracle values must not contain cycles.")
  ancestors.add(value)
  try {
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key === "symbol")) {
      throw new TypeError("Oracle objects must not contain symbol keys.")
    }
    const stringKeys = keys.filter((key): key is string => typeof key === "string")
    const entries = stringKeys.sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError("Oracle objects must contain only enumerable data properties.")
      }
      return [key, normalizeJsonValue(descriptor.value, ancestors)] as const
    })
    return Object.fromEntries(entries)
  } finally {
    ancestors.delete(value)
  }
}

export const normalizeJsonValue = (value: unknown, ancestors = new WeakSet<object>()): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Oracle values must contain only finite numbers.")
    return value
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Oracle values must not contain cycles.")
    ancestors.add(value)
    try {
      return value.map((entry) => normalizeJsonValue(entry, ancestors))
    } finally {
      ancestors.delete(value)
    }
  }
  if (typeof value === "object" && isPlainRecord(value)) return normalizeObject(value, ancestors)
  throw new TypeError(`Oracle value contains unsupported ${typeof value}.`)
}

export const isJsonValue = (value: unknown): value is JsonValue => {
  try {
    normalizeJsonValue(value)
    return true
  } catch {
    return false
  }
}

export const canonicalJson = (value: unknown): string => {
  const encoded = JSON.stringify(normalizeJsonValue(value), null, JSON_INDENT_SPACES)
  return `${encoded}\n`
}
