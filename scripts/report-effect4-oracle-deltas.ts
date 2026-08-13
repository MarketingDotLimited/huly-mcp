import * as fs from "node:fs/promises"

import { Schema } from "effect"

import { canonicalJson } from "./effect4-oracle-canonical.js"
import { renderEffect4Oracle } from "./effect4-oracle-data.js"
import { compareOracleValues } from "./effect4-oracle-delta.js"
import { EFFECT4_ORACLE_PATH } from "./effect4-oracle-io.js"
import { createOracleDeltaAuditReport } from "./effect4-oracle-review.js"
import { BehavioralOracleSchema } from "./effect4-oracle-schema.js"

interface Effect4OracleDeltaReportDependencies {
  readonly readBaseline: () => Promise<string>
  readonly renderCurrent: () => Promise<string>
  readonly write: (content: string) => void
}

export const readEffect4OracleBaseline = (): Promise<string> => fs.readFile(EFFECT4_ORACLE_PATH, "utf8")
export const writeEffect4OracleDeltaReport = (content: string): void => {
  process.stdout.write(content)
}

export const reportEffect4OracleDeltas = async (dependencies: Effect4OracleDeltaReportDependencies): Promise<void> => {
  const [baselineJson, currentJson] = await Promise.all([dependencies.readBaseline(), dependencies.renderCurrent()])
  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(BehavioralOracleSchema))
  const baseline = decode(baselineJson)
  const current = decode(currentJson)
  const deltas = compareOracleValues(baseline, current)
  dependencies.write(canonicalJson(createOracleDeltaAuditReport(baselineJson, currentJson, baseline, current, deltas)))
}

export const runEffect4OracleDeltaReportCommand = (
  vitestEnvironment: string | undefined,
  dependencies: Effect4OracleDeltaReportDependencies
): Promise<void> => (vitestEnvironment === undefined ? reportEffect4OracleDeltas(dependencies) : Promise.resolve())

void runEffect4OracleDeltaReportCommand(process.env["VITEST"], {
  readBaseline: readEffect4OracleBaseline,
  renderCurrent: renderEffect4Oracle,
  write: writeEffect4OracleDeltaReport
})
