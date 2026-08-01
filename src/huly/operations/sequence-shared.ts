import type { CustomSequence, Sequence } from "@hcengineering/core"

import { HulySequenceId } from "../../domain/schemas/sdk-discovery-configurations.js"

const sequenceKey = (sequence: Sequence): HulySequenceId => HulySequenceId.make(String(sequence._id))

export const mergeSequenceDocuments = (
  sequences: ReadonlyArray<Sequence>,
  customSequences: ReadonlyArray<CustomSequence>
): ReadonlyArray<Sequence> => [
  ...new Map<HulySequenceId, Sequence>([
    ...sequences.map((sequence) => [sequenceKey(sequence), sequence] as const),
    ...customSequences.map((sequence) => [sequenceKey(sequence), sequence] as const)
  ]).values()
]
