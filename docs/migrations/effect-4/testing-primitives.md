# Effect 4 testing primitives

This project uses the exact `effect@4.0.0-rc.108` and
`@effect/vitest@4.0.0-rc.108` APIs. Prefer `it.effect` for Effect tests. It
provides a fresh `Scope`, `TestClock`, and the other test services for each test;
do not wrap the whole test body in another `Effect.scoped` call. Use `it.live`
only when the live runtime service is itself the behavior under test.

## Deterministic time and synchronization

Never coordinate tests with wall-clock sleeps, polling loops, or timing guesses.
Use the primitive that states the relationship the test needs:

- `TestClock.adjust` or `TestClock.setTime` drives sleeps, timeouts, retries, and
  schedules without elapsed wall time. Fork the timed effect before advancing
  the clock.
- `Deferred` is a one-shot signal. It is the usual readiness or completion
  handshake between a test and a worker.
- `Latch` is a reusable gate. A closed latch suspends work; `open` releases
  current and future waiters, while `release` releases only current waiters.
- `Ref` records observations safely across fibers. Read it only after a
  `Deferred`, `Latch`, fiber join, or other explicit synchronization edge proves
  the relevant update happened.

The focused executable example is
`test/effect4/testing-primitives.test.ts`. Its worker announces readiness with a
`Deferred`, waits on a `Latch`, sleeps against `TestClock`, and appends events to
a `Ref`. The assertions never depend on a scheduler race or real elapsed time.

## Fork startup and ownership

Effect 4 renamed `Effect.fork` to `Effect.forkChild`. In rc.108, fork startup is
deferred by default: after `yield* Effect.forkChild(worker)`, do not assume the
worker has executed any setup. Wait for a `Deferred` readiness signal when the
test depends on that setup.

Pass `{ startImmediately: true }` only when eager startup is part of the intended
ordering. It changes scheduling, not lifecycle ownership, and it does not replace
an explicit readiness handshake.

Choose ownership separately:

- `forkChild` attaches the fiber to the creating parent fiber. When that parent
  terminates, its child is interrupted.
- `forkScoped` attaches the fiber to the current `Scope`. The fiber can outlive
  the effect that created it, but closing the owning scope interrupts it. An
  `it.effect` test supplies an outer scope automatically; use a deliberately
  nested `Effect.scoped` region only when a test must close a scope early and
  assert its finalization or interruption behavior.
- Avoid `forkDetach` in tests unless detached lifetime is precisely the behavior
  under test. Detached fibers make cleanup ownership harder to prove.

When interruption matters, observe it explicitly with `Fiber.await` and
`Exit.hasInterrupts`, and use `Effect.onInterrupt` or a resource finalizer to
record required cleanup. Joining a deliberately non-terminating worker is not a
cleanup strategy; close its owner or interrupt it.

## Layer acquisition and isolation

Effect 4 shares a layer memo map across ordinary provides. Treat this as a
safety net, while still composing the dependency graph explicitly. The focused
`test/effect4/layer-isolation.test.ts` counter proves that supplying the same
layer twice acquires and releases once, whereas wrapping one occurrence with
`Layer.fresh` acquires and releases twice.

Use `Layer.fresh(layer)` when one particular layer must be independent. Use
`Effect.provide(layer, { local: true })` when the entire provided subtree must
have a local memo map, such as an isolated test runtime. Do not chain ordinary
`Effect.provide` calls as an application composition style merely because v4
deduplicates them; a single provide with composed layers keeps ownership clear.

## Migration checklist

For each migrated test:

1. Replace scoped test helpers with `it.effect` and import `TestClock` from
   `effect/testing`.
2. Replace `Effect.fork` with `Effect.forkChild`, then decide whether parent or
   scope ownership is correct.
3. Audit startup assumptions. Keep deferred startup by default; add
   `startImmediately` only for an intentional eager-start edge, and use a
   `Deferred` when readiness matters.
4. Replace real sleeps and scheduler yields used as timing guesses with
   `TestClock`, `Deferred`, `Latch`, `Ref`, or another explicit Effect
   synchronization primitive.
5. Assert worker completion, interruption, and cleanup rather than relying on
   test-scope shutdown to hide an unobserved fiber.
6. Add acquisition/release counts when layer sharing matters, and choose either
   normal shared memoization, `Layer.fresh`, or `{ local: true }` deliberately.
