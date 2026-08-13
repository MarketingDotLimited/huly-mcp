import { describe, it } from "@effect/vitest"
import { Effect, Logger, References } from "effect"
import { expect } from "vitest"

import { makeDiagnosticsScope } from "../../src/huly/diagnostics.js"

const captureLogs = <A>(
  effect: Effect.Effect<A>
): Effect.Effect<{
  readonly result: A
  readonly logs: ReadonlyArray<{ readonly level: string; readonly value: unknown }>
}> =>
  Effect.gen(function* () {
    const logs: Array<{ readonly level: string; readonly value: unknown }> = []
    const logger = Logger.make<unknown, void>((entry) => {
      const level = entry.logLevel === "Warn" ? "warn" : entry.logLevel === "Info" ? "info" : entry.logLevel
      const message = Array.isArray(entry.message) && entry.message.length === 1 ? entry.message[0] : entry.message
      logs.push({ level, value: message })
    })
    const result = yield* effect.pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Info")
    )
    return { result, logs }
  })

describe("Diagnostics", () => {
  it.effect("warnAgent accumulates a tool warning and writes an operator warning log", () =>
    Effect.gen(function* () {
      const scope = yield* makeDiagnosticsScope
      const warning = { code: "status_metadata_unresolved" as const, message: "Status metadata was degraded." }

      const { logs } = yield* captureLogs(scope.service.warnAgent(warning))
      const warnings = yield* scope.drainWarnings

      expect(warnings).toEqual([warning])
      expect(logs).toEqual([
        {
          level: "warn",
          value: "Agent-visible tool warning [status_metadata_unresolved]: Status metadata was degraded."
        }
      ])
    })
  )

  it.effect("trail writes an operator log without accumulating tool warnings", () =>
    Effect.gen(function* () {
      const scope = yield* makeDiagnosticsScope

      const { logs } = yield* captureLogs(scope.service.trail("metadata recovered from model"))
      const warnings = yield* scope.drainWarnings

      expect(warnings).toEqual([])
      expect(logs).toEqual([{ level: "info", value: "Diagnostic trail: metadata recovered from model" }])
    })
  )
})
