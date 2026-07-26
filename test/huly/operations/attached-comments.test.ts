import { describe, it } from "@effect/vitest"
import type { ChatMessage } from "@hcengineering/chunter"
import { type Class, type Doc, type DocumentQuery, type Ref, type Space, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { listAttachedCommentsPage } from "../../../src/huly/operations/attached-comments.js"
import { toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"

const listWithClasses = (
  primaryClass: Ref<Class<Doc>>,
  additionalClasses: ReadonlyArray<Ref<Class<Doc>>>
) => {
  let attachedToClassQuery: DocumentQuery<ChatMessage>["attachedToClass"] | undefined
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    _classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    attachedToClassQuery = Reflect.get(query, "attachedToClass")
    return Effect.succeed(toFindResult<T>([]))
  }

  return Effect.gen(function*() {
    const client = yield* HulyClient

    yield* listAttachedCommentsPage({
      client,
      space: toRef<Space>("space-1"),
      attachedTo: toRef<Doc>("target-1"),
      attachedToClass: primaryClass,
      additionalAttachedToClasses: additionalClasses,
      collection: "comments"
    })

    return attachedToClassQuery
  }).pipe(Effect.provide(HulyClient.testLayer({ findAll })))
}

describe("attached comment target class queries", () => {
  it.effect("includes the primary class before deduplicated additional classes", () =>
    Effect.gen(function*() {
      const primaryClass = toClassRef<Doc>("example:class:Primary")
      const additionalClass = toClassRef<Doc>("example:class:Additional")

      const query = yield* listWithClasses(primaryClass, [
        additionalClass,
        primaryClass,
        additionalClass
      ])

      expect(query).toEqual({ $in: [primaryClass, additionalClass] })
    }))

  it.effect("uses the primary class when the additional class list is empty", () =>
    Effect.gen(function*() {
      const primaryClass = toClassRef<Doc>("example:class:Primary")

      const query = yield* listWithClasses(primaryClass, [])

      expect(query).toBe(primaryClass)
    }))
})
