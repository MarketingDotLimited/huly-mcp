import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Schema } from "effect"

import { compareOracleValues, createOracleDeltaReport, formatOracleDelta } from "./effect4-oracle-delta.js"
import { OracleDeltaReviewSchema, verifyReviewedOracleDeltas } from "./effect4-oracle-review.js"
import { isJsonValue } from "./effect4-oracle-canonical.js"

const JsonValueSchema = Schema.declare(isJsonValue)
const DELTA_ERROR_SAMPLE_SIZE = 20

export const EFFECT4_ORACLE_PATH = "docs/migrations/effect-4/behavioral-oracle.json"
export const EFFECT4_ORACLE_DELTA_REVIEW_PATH = "docs/migrations/effect-4/behavioral-oracle-delta-review.json"

export const writeEffect4Oracle = async (root: string, content: string): Promise<string> => {
  const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
  await fs.mkdir(path.dirname(oraclePath), { recursive: true })
  await fs.writeFile(oraclePath, content, "utf8")
  return oraclePath
}

export const verifyEffect4Oracle = async (root: string, actual: string): Promise<string> => {
  const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
  const reviewPath = path.join(root, EFFECT4_ORACLE_DELTA_REVIEW_PATH)
  const [expected, reviewJson] = await Promise.all([fs.readFile(oraclePath, "utf8"), fs.readFile(reviewPath, "utf8")])
  const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(JsonValueSchema))
  const deltas = compareOracleValues(decodeJson(expected), decodeJson(actual))
  const review = Schema.decodeUnknownSync(Schema.fromJsonString(OracleDeltaReviewSchema))(reviewJson)
  try {
    verifyReviewedOracleDeltas(expected, actual, deltas, review)
  } catch (cause) {
    const report = createOracleDeltaReport(deltas, [])
    const sample = report.unexpected.slice(0, DELTA_ERROR_SAMPLE_SIZE).map(formatOracleDelta).join("\n")
    throw new Error(
      `Effect 4 behavioral oracle differs from ${EFFECT4_ORACLE_PATH}.` +
        `${sample === "" ? "" : `\nDelta sample:\n${sample}`}`,
      { cause }
    )
  }
  return oraclePath
}
