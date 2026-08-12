import { Cause } from "effect"

export type CauseClassification<E> =
  | { readonly _tag: "Empty" }
  | { readonly _tag: "Failure"; readonly firstFailure: E }
  | { readonly _tag: "Fatal"; readonly reason: "Defect" | "DefectAndInterrupt" | "Interrupt" }

export const classifyCause = <E>(cause: Cause.Cause<E>): CauseClassification<E> => {
  const hasDefects = Cause.hasDies(cause)
  const hasInterruptions = Cause.hasInterrupts(cause)
  if (hasDefects || hasInterruptions) {
    return { _tag: "Fatal", reason: hasDefects ? (hasInterruptions ? "DefectAndInterrupt" : "Defect") : "Interrupt" }
  }
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason)) return { _tag: "Failure", firstFailure: reason.error }
  }
  return { _tag: "Empty" }
}

export const findRecoverableCauseFailure = <E, F extends E>(
  cause: Cause.Cause<E>,
  predicate: (failure: E) => failure is F
): F | undefined => {
  if (classifyCause(cause)._tag !== "Failure") return undefined
  for (const reason of cause.reasons) {
    if (Cause.isFailReason(reason) && predicate(reason.error)) return reason.error
  }
  return undefined
}
