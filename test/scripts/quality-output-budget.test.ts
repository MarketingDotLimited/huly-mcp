import { expect, test } from "vitest"

import { addSuccessfulOutputLines, OutputLineCount } from "../../scripts/quality-output-budget.js"

test("accepts successful output exactly at the checked-in budget", () => {
  expect(
    addSuccessfulOutputLines({
      currentOutputLines: OutputLineCount.make(7),
      maximumOutputLines: OutputLineCount.make(10),
      stageName: "fixture",
      stageOutputLines: OutputLineCount.make(3)
    })
  ).toBe(10)
})

test("identifies the stage that pushes successful output over budget", () => {
  expect(() =>
    addSuccessfulOutputLines({
      currentOutputLines: OutputLineCount.make(8),
      maximumOutputLines: OutputLineCount.make(10),
      stageName: "noisy fixture",
      stageOutputLines: OutputLineCount.make(3)
    })
  ).toThrow("Quality gate successful output exceeded 10 lines after 'noisy fixture' (11 lines observed)")
})
