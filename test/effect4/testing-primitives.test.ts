import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Latch, Ref } from "effect"
import { TestClock } from "effect/testing"

describe("Effect 4 testing primitives", () => {
  it.effect("provides an automatic scope for scoped children", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkScoped(Effect.never)

      yield* Fiber.interrupt(fiber)
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(fiber)))
    })
  )

  it.effect("coordinates deferred child startup and virtual time explicitly", () =>
    Effect.gen(function* () {
      type WorkerEvent = "started" | "completed"
      const started = yield* Deferred.make<void>()
      const gate = yield* Latch.make(false)
      const events = yield* Ref.make<ReadonlyArray<WorkerEvent>>([])

      const worker = Effect.gen(function* () {
        yield* Ref.update(events, (current) => [...current, "started"])
        yield* Deferred.succeed(started, undefined)
        yield* gate.await
        yield* Effect.sleep("10 seconds")
        yield* Ref.update(events, (current) => [...current, "completed"])
      })

      const fiber = yield* Effect.forkChild(worker)

      assert.deepStrictEqual(yield* Ref.get(events), [])
      yield* Deferred.await(started)
      assert.deepStrictEqual(yield* Ref.get(events), ["started"])

      yield* gate.open
      yield* TestClock.adjust("9 seconds")
      assert.deepStrictEqual(yield* Ref.get(events), ["started"])

      yield* TestClock.adjust("1 second")
      yield* Fiber.join(fiber)
      assert.deepStrictEqual(yield* Ref.get(events), ["started", "completed"])
    })
  )

  it.effect("interrupts an eagerly started scoped worker when its owner closes", () =>
    Effect.gen(function* () {
      type ScopedWorkerEvent = "scope-started" | "scope-interrupted"
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const events = yield* Ref.make<ReadonlyArray<ScopedWorkerEvent>>([])

      const worker = Effect.gen(function* () {
        yield* Ref.update(events, (current) => [...current, "scope-started"])
        yield* Deferred.succeed(started, undefined)
        return yield* Effect.never
      }).pipe(
        Effect.onInterrupt(() =>
          Effect.gen(function* () {
            yield* Ref.update(events, (current) => [...current, "scope-interrupted"])
            yield* Deferred.succeed(interrupted, undefined)
          })
        )
      )

      const fiber = yield* Effect.scoped(
        Effect.gen(function* () {
          const scopedFiber = yield* Effect.forkScoped(worker, { startImmediately: true })
          yield* Deferred.await(started)
          return scopedFiber
        })
      )

      yield* Deferred.await(interrupted)
      assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(fiber)))
      assert.deepStrictEqual(yield* Ref.get(events), ["scope-started", "scope-interrupted"])
    })
  )
})
