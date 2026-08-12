import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"

import { classifyCause, findRecoverableCauseFailure } from "../../src/runtime/cause-exit.js"

class SelectedFailure extends Error {}

describe("Cause and Exit interpretation", () => {
  it("selects the first typed failure in reason order", () => {
    const first = new Error("first")
    const second = new Error("second")
    const cause = Cause.combine(Cause.fail(first), Cause.fail(second))

    expect(classifyCause(cause)).toEqual({ _tag: "Failure", firstFailure: first })
  })

  it("finds the first matching typed failure without stopping at another failure", () => {
    const selected = new SelectedFailure("selected")
    const cause = Cause.combine(Cause.fail(new Error("other")), Cause.fail(selected))

    expect(
      findRecoverableCauseFailure(cause, (failure): failure is SelectedFailure => failure instanceof SelectedFailure)
    ).toBe(selected)
  })

  it("gives a defect precedence over typed failures without exposing the defect", () => {
    const cause = Cause.combine(Cause.fail("expected"), Cause.die("token=secret"))
    const classification = classifyCause(cause)

    expect(classification).toEqual({ _tag: "Fatal", reason: "Defect" })
    expect(
      findRecoverableCauseFailure(cause, (failure): failure is string => typeof failure === "string")
    ).toBeUndefined()
    expect(JSON.stringify(classification)).not.toContain("secret")
  })

  it("classifies interruption and combined fatal reasons", () => {
    expect(classifyCause(Cause.interrupt(42))).toEqual({ _tag: "Fatal", reason: "Interrupt" })
    expect(classifyCause(Cause.combine(Cause.interrupt(42), Cause.die("defect")))).toEqual({
      _tag: "Fatal",
      reason: "DefectAndInterrupt"
    })
  })

  it("recognizes empty causes", () => {
    expect(classifyCause(Cause.empty)).toEqual({ _tag: "Empty" })
  })

  it("interprets runPromiseExit success, failure, defect, and interruption", async () => {
    const success = await Effect.runPromiseExit(Effect.succeed("ok"))
    const failure = await Effect.runPromiseExit(Effect.fail("expected"))
    const defect = await Effect.runPromiseExit(Effect.die("token=secret"))
    const interruption = await Effect.runPromiseExit(Effect.interrupt)

    expect(Exit.isSuccess(success) && success.value).toBe("ok")
    expect(Exit.isFailure(failure) && classifyCause(failure.cause)).toEqual({
      _tag: "Failure",
      firstFailure: "expected"
    })
    expect(Exit.isFailure(defect) && classifyCause(defect.cause)).toEqual({ _tag: "Fatal", reason: "Defect" })
    expect(Exit.isFailure(interruption) && classifyCause(interruption.cause)).toEqual({
      _tag: "Fatal",
      reason: "Interrupt"
    })
  })
})
