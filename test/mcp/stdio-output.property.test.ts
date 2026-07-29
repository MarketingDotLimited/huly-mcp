import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { type ConsoleRedirectTarget, redirectConsoleToStderr } from "../../src/mcp/stdio-output.js"
import { propertyTestParameters } from "../helpers/property.js"

type ConsoleMethodName = keyof ConsoleRedirectTarget

interface ConsoleCall {
  readonly data: ReadonlyArray<unknown>
  readonly method: ConsoleMethodName
}

const methodArbitrary = fc.constantFrom<ConsoleMethodName>("debug", "error", "info", "log", "warn")
const dataArbitrary = fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), { maxLength: 4 })
const callArbitrary = fc.record({ data: dataArbitrary, method: methodArbitrary })

const createConsoleTarget = (calls: Array<ConsoleCall>): ConsoleRedirectTarget => {
  const writer =
    (method: ConsoleMethodName) =>
    (...data: ReadonlyArray<unknown>): void => {
      calls.push({ data, method })
    }

  return {
    debug: writer("debug"),
    error: writer("error"),
    info: writer("info"),
    log: writer("log"),
    warn: writer("warn")
  }
}

const invoke = (target: ConsoleRedirectTarget, call: ConsoleCall): void => {
  target[call.method](...call.data)
}

describe("redirectConsoleToStderr properties", () => {
  it("routes every redirected console method through the original error sink in call order", () => {
    fc.assert(
      fc.property(fc.array(callArbitrary, { maxLength: 20 }), (callsToMake) => {
        const calls: Array<ConsoleCall> = []
        const target = createConsoleTarget(calls)
        const handle = redirectConsoleToStderr(target)

        for (const call of callsToMake) {
          invoke(target, call)
        }

        handle.restore()

        expect(calls).toEqual(callsToMake.map((call) => ({ data: call.data, method: "error" })))
      }),
      propertyTestParameters
    )
  })

  it("restores the original method routing after any redirected call sequence", () => {
    fc.assert(
      fc.property(
        fc.array(callArbitrary, { maxLength: 20 }),
        fc.array(callArbitrary, { maxLength: 20 }),
        (beforeRestore, afterRestore) => {
          const calls: Array<ConsoleCall> = []
          const target = createConsoleTarget(calls)
          const handle = redirectConsoleToStderr(target)

          for (const call of beforeRestore) {
            invoke(target, call)
          }
          handle.restore()
          handle.restore()
          for (const call of afterRestore) {
            invoke(target, call)
          }

          expect(calls).toEqual([
            ...beforeRestore.map((call) => ({ data: call.data, method: "error" })),
            ...afterRestore
          ])
        }
      ),
      propertyTestParameters
    )
  })
})
