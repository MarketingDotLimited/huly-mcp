import { Schema } from "effect"

import { NonNegativeInteger } from "../src/domain/schemas/shared.js"

export const OutputLineCount = NonNegativeInteger.pipe(Schema.brand("OutputLineCount")).annotations({
  identifier: "OutputLineCount",
  description: "Number of lines emitted by a successful quality-gate command."
})
export type OutputLineCount = Schema.Schema.Type<typeof OutputLineCount>

interface SuccessfulOutputLineUpdate {
  readonly currentOutputLines: OutputLineCount
  readonly maximumOutputLines: OutputLineCount
  readonly stageName: string
  readonly stageOutputLines: OutputLineCount
}

export const addSuccessfulOutputLines = ({
  currentOutputLines,
  maximumOutputLines,
  stageName,
  stageOutputLines
}: SuccessfulOutputLineUpdate): OutputLineCount => {
  const nextOutputLines = OutputLineCount.make(currentOutputLines + stageOutputLines)
  if (nextOutputLines > maximumOutputLines) {
    throw new Error(
      `Quality gate successful output exceeded ${maximumOutputLines} lines after '${stageName}' ` +
        `(${nextOutputLines} lines observed)`
    )
  }
  return nextOutputLines
}
