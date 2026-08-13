import { describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { expect } from "vitest"

type LifecycleEvent = "acquired" | "released"

const makeTrackedLayer = (events: Ref.Ref<ReadonlyArray<LifecycleEvent>>) =>
  Layer.effectDiscard(
    Effect.acquireRelease(
      Ref.update(events, (current) => [...current, acquired]),
      () => Ref.update(events, (current) => [...current, released])
    )
  )

const acquired: LifecycleEvent = "acquired"
const released: LifecycleEvent = "released"

describe("Effect 4 layer isolation", () => {
  it.effect("shares one acquisition across separate provide calls", () =>
    Effect.gen(function* () {
      const events = yield* Ref.make<ReadonlyArray<LifecycleEvent>>([])
      const trackedLayer = makeTrackedLayer(events)

      yield* Effect.gen(function* () {
        expect(yield* Ref.get(events)).toEqual(["acquired"])
      }).pipe(Effect.provide([trackedLayer, trackedLayer]))

      expect(yield* Ref.get(events)).toEqual(["acquired", "released"])
    })
  )

  it.effect("forces an independent acquisition with Layer.fresh", () =>
    Effect.gen(function* () {
      const events = yield* Ref.make<ReadonlyArray<LifecycleEvent>>([])
      const trackedLayer = makeTrackedLayer(events)

      yield* Effect.gen(function* () {
        expect(yield* Ref.get(events)).toEqual(["acquired", "acquired"])
      }).pipe(Effect.provide([trackedLayer, Layer.fresh(trackedLayer)]))

      expect(yield* Ref.get(events)).toEqual(["acquired", "acquired", "released", "released"])
    })
  )
})
