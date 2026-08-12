import { Schema } from "effect"

export const FailureBoundaryScenarioSchema = Schema.Literals(["defect", "empty", "interrupt", "known", "mixed"])
export type FailureBoundaryScenario = Schema.Schema.Type<typeof FailureBoundaryScenarioSchema>
