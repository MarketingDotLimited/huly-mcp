import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Schema } from "effect"

import {
  compareOracleValues,
  createOracleDeltaReport,
  EFFECT4_ORACLE_INTENTIONAL_DELTAS,
  formatOracleDelta
} from "./effect4-oracle-delta.js"
import { isJsonValue } from "./effect4-oracle-canonical.js"

const JsonValueSchema = Schema.declare(isJsonValue)

export const EFFECT4_ORACLE_PATH = "docs/migrations/effect-4/behavioral-oracle.json"

export const writeEffect4Oracle = async (root: string, content: string): Promise<string> => {
  const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
  await fs.mkdir(path.dirname(oraclePath), { recursive: true })
  await fs.writeFile(oraclePath, content, "utf8")
  return oraclePath
}

export const verifyEffect4Oracle = async (root: string, actual: string): Promise<string> => {
  const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
  const expected = await fs.readFile(oraclePath, "utf8")
  const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(JsonValueSchema))
  const classification = createOracleDeltaReport(
    compareOracleValues(decodeJson(expected), decodeJson(actual)),
    EFFECT4_ORACLE_INTENTIONAL_DELTAS
  )
  if (
    classification.unexpected.length > 0 ||
    classification.stale.length > 0 ||
    classification.duplicateIntentional.length > 0
  ) {
    const unexpected = classification.unexpected.map(formatOracleDelta).join("\n")
    const stale = classification.stale.map(formatOracleDelta).join("\n")
    const duplicate = classification.duplicateIntentional.map(formatOracleDelta).join("\n")
    throw new Error(
      `Effect 4 behavioral oracle differs from ${EFFECT4_ORACLE_PATH}.` +
        `${unexpected === "" ? "" : `\nUnexpected deltas:\n${unexpected}`}` +
        `${stale === "" ? "" : `\nStale intentional deltas:\n${stale}`}` +
        `${duplicate === "" ? "" : `\nDuplicate intentional deltas:\n${duplicate}`}`,
      { cause: classification }
    )
  }
  return oraclePath
}
