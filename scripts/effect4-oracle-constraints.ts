import { normalizeJsonValue, type JsonValue } from "./effect4-oracle-canonical.js"

const COMPOSITION_KEYWORDS = new Set(["anyOf", "not", "oneOf"])
const BOOLEAN_CONSTRAINT_KEYWORDS = new Set(["additionalProperties", "const", "unevaluatedProperties", "uniqueItems"])

export interface AuthoredConstraint {
  readonly path: ReadonlyArray<string | number>
  readonly value: JsonValue
}

const collectFromValue = (
  value: unknown,
  path: ReadonlyArray<string | number>,
  constraints: Array<AuthoredConstraint>
): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectFromValue(entry, [...path, index], constraints))
    return
  }
  if (typeof value !== "object" || value === null) return

  for (const key of Object.keys(value).sort()) {
    const child = Object.getOwnPropertyDescriptor(value, key)?.value
    const childPath = [...path, key]
    if (COMPOSITION_KEYWORDS.has(key) || (typeof child === "boolean" && BOOLEAN_CONSTRAINT_KEYWORDS.has(key))) {
      constraints.push({ path: childPath, value: normalizeJsonValue(child) })
    }
    collectFromValue(child, childPath, constraints)
  }
}

export const captureAuthoredConstraints = (
  tools: ReadonlyArray<{ readonly name: string; readonly inputSchema: object }>
) =>
  tools.flatMap((tool) => {
    const constraints: Array<AuthoredConstraint> = []
    collectFromValue(tool.inputSchema, [], constraints)
    return constraints.length === 0 ? [] : [{ toolName: tool.name, constraints }]
  })
