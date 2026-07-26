import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { timeTools } from "../../../src/mcp/tools/time.js"
import { assertExists } from "../../../src/utils/assertions.js"

const HOURS_EXAMPLES = "0.25 = 15 minutes"
const WORK_DAY_EXAMPLE = "8 = one work day"
const TIME_REPORT_TOOL_NAMES = [
  "log_time",
  "get_time_report",
  "list_time_spend_reports",
  "get_detailed_time_report"
] as const
type TimeReportToolName = (typeof TIME_REPORT_TOOL_NAMES)[number]

describe("time tool contracts", () => {
  it.effect("documents Huly hour semantics in time-report descriptions and schemas", () =>
    Effect.gen(function*() {
      const findTimeTool = (name: TimeReportToolName) =>
        assertExists(timeTools.find((tool) => tool.name === name), `Expected time tool '${name}'.`)
      const logTimeTool = findTimeTool("log_time")
      const timeReportTools = TIME_REPORT_TOOL_NAMES.map(findTimeTool)
      const reportReadTools = timeReportTools.filter((tool) => tool.name !== logTimeTool.name)

      for (const tool of timeReportTools) {
        expect(tool.description.toLowerCase()).toContain("hours")
        expect(tool.description).toContain(HOURS_EXAMPLES)
        expect(tool.description).toContain(WORK_DAY_EXAMPLE)
      }

      expect(JSON.stringify(logTimeTool.inputSchema).toLowerCase()).toContain("hours")
      for (const tool of reportReadTools) {
        const outputContract = JSON.stringify(tool.outputSchema)
        expect(outputContract.toLowerCase()).toContain("hours")
        expect(outputContract).toContain(HOURS_EXAMPLES)
        expect(outputContract).toContain(WORK_DAY_EXAMPLE)
      }
    }))
})
