import { describe, it } from "@effect/vitest"
import type { Card as HulyCard, CardSpace as HulyCardSpace, MasterTag } from "@hcengineering/card"
import type { ChatMessage } from "@hcengineering/chunter"
import type {
  AttachedData,
  AttachedDoc,
  Blob,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  Ref,
  Space
} from "@hcengineering/core"
import type { Layer } from "effect"
import { Effect, Exit } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import {
  parseAddCardCommentParams,
  parseDeleteCardCommentParams,
  parseListCardCommentsParams,
  parseUpdateCardCommentParams
} from "../../../src/domain/schemas/card-comments.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { CardCommentNotFoundError, CardNotFoundError, CardSpaceNotFoundError } from "../../../src/huly/errors.js"
import { cardPlugin, chunter } from "../../../src/huly/huly-plugins.js"
import {
  addCardComment,
  deleteCardComment,
  listCardComments,
  updateCardComment
} from "../../../src/huly/operations/card-comments.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"
import { capturedMarkupReferenceNodes } from "../../helpers/markup-capture.js"

const SPACE_ID = toRef<HulyCardSpace>("card-space-1")
const CARD_CLASS = toRef<MasterTag>("master-tag-1")
const personId = corePersonId("card-comment-person")

interface CardCommentState {
  readonly cardSpaces: Array<HulyCardSpace>
  readonly cards: Array<HulyCard>
  readonly messages: Array<ChatMessage>
  readonly updatedIds: Array<Ref<ChatMessage>>
  readonly removals: Array<string>
  nextId: number
}

const cardSpace = (): HulyCardSpace => ({
  _id: SPACE_ID,
  _class: cardPlugin.class.CardSpace,
  space: toRef<Space>("workspace"),
  name: "Product Strategy",
  description: "Card space",
  private: false,
  archived: false,
  members: [],
  types: [CARD_CLASS],
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const card = (): HulyCard => ({
  _id: toRef<HulyCard>("card-1"),
  _class: CARD_CLASS,
  space: SPACE_ID,
  title: "Decision Record",
  content: toRef<Blob>("content-blob"),
  parent: null,
  parentInfo: [],
  children: 0,
  blobs: {},
  rank: "0|aaa",
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0
})

const chatMessage = (
  id: string,
  body: string,
  overrides?: Partial<ChatMessage>
): ChatMessage => ({
  _id: toRef<ChatMessage>(id),
  _class: chunter.class.ChatMessage,
  space: SPACE_ID,
  attachedTo: toRef<Doc>("card-1"),
  attachedToClass: toClassRef<Doc>(CARD_CLASS),
  collection: "comments",
  message: markdownToMarkupString(body, testMarkupUrlConfig),
  modifiedBy: personId,
  modifiedOn: 1,
  createdBy: personId,
  createdOn: 1,
  isPinned: false,
  replies: 0,
  reactions: 0,
  ...overrides
})

const matchesValue = (actual: unknown, expected: unknown): boolean => {
  if (typeof expected === "object" && expected !== null && "$in" in expected) {
    const candidates = Reflect.get(expected, "$in")
    return Array.isArray(candidates) && candidates.includes(actual)
  }
  return actual === expected
}

const matchesQuery = <T extends Doc>(doc: T, query: DocumentQuery<T>): boolean =>
  Object.entries(query).every(([key, value]) => matchesValue(Reflect.get(doc, key), value))

const docsForClass = <T extends Doc>(
  state: CardCommentState,
  classRef: Ref<Class<T>>
): ReadonlyArray<T> => {
  const docs: ReadonlyArray<Doc> = classRef === cardPlugin.class.CardSpace
    ? state.cardSpaces
    : classRef === cardPlugin.class.Card
    ? state.cards
    : classRef === chunter.class.ChatMessage
    ? state.messages
    : []
  // Huly's runtime class ref selects the homogeneous fixture collection, but
  // TypeScript cannot narrow the SDK's phantom generic from that equality.

  return docs as ReadonlyArray<T>
}

const makeLayer = (state: CardCommentState): Layer.Layer<HulyClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const docs = docsForClass(state, classRef)
      .filter((doc) => matchesQuery(doc, query))
    const limit = options?.limit ?? docs.length
    const page = findResult(docs.slice(0, limit))
    page.total = docs.length
    return Effect.succeed(page)
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => Effect.map(findAll(classRef, query, { limit: 1 }), (docs) => docs.at(0))

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    const next = id ?? toRef<P>(`created-${state.nextId++}`)
    if (classRef === chunter.class.ChatMessage) {
      // HulyClient.addCollection pairs classRef with AttachedData<P>; this
      // ChatMessage branch therefore receives ChatMessage attributes. Ref
      // brands and generics are erased, so equality cannot narrow P, and the
      // SDK exposes no runtime schema with which to build a type guard.
      // eslint-disable-next-line no-restricted-syntax -- SDK contract establishes the erased generic relationship
      const chatAttributes = attributes as unknown as AttachedData<ChatMessage>
      state.messages.push({
        ...chatMessage(String(next), ""),
        _id: toRef<ChatMessage>(next),
        space,
        attachedTo: toRef<Doc>(attachedTo),
        attachedToClass: toClassRef<Doc>(attachedToClass),
        collection,
        ...chatAttributes
      })
    }
    return Effect.succeed(next)
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === chunter.class.ChatMessage) {
      const index = state.messages.findIndex((message) => String(message._id) === String(objectId))
      const message = assertAt(state.messages, index)
      state.updatedIds.push(toRef<ChatMessage>(objectId))
      state.messages[index] = { ...message, ...operations }
    }
    return Effect.succeed([])
  }

  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>
  ) => {
    if (classRef === chunter.class.ChatMessage) {
      state.removals.push(String(objectId))
      const index = state.messages.findIndex((message) => String(message._id) === String(objectId))
      if (index >= 0) state.messages.splice(index, 1)
    }
    return Effect.succeed([])
  }

  return HulyClient.testLayer({
    findAll,
    findOne,
    addCollection,
    updateDoc,
    removeDoc,
    workbenchUrlConfig: testWorkbenchUrlConfig,
    markupUrlConfig: testMarkupUrlConfig
  })
}

const baseState = (): CardCommentState => ({
  cardSpaces: [cardSpace()],
  cards: [card()],
  messages: [],
  updatedIds: [],
  removals: [],
  nextId: 1
})

describe("card comment operations", () => {
  it.effect("lists only genuine card comments across concrete and base card attachment classes", () =>
    Effect.gen(function*() {
      const state = baseState()
      state.messages.push(
        chatMessage("native-comment", "Native", { createdOn: 1 }),
        chatMessage("base-comment", "Compatible", {
          attachedToClass: cardPlugin.class.Card,
          createdOn: 2
        }),
        chatMessage("other-card", "Leak", { attachedTo: toRef<Doc>("card-2") }),
        chatMessage("other-collection", "Activity", { collection: "activity" }),
        chatMessage("other-class", "Wrong class", {
          attachedToClass: toRef<Class<Doc>>("tracker:class:Issue")
        })
      )
      const params = yield* parseListCardCommentsParams({
        cardSpace: "Product Strategy",
        card: "Decision Record",
        limit: 1
      })

      const result = yield* listCardComments(params).pipe(Effect.provide(makeLayer(state)))

      expect(result).toMatchObject({ cardId: "card-1", total: 2 })
      expect(result.comments.map((comment) => comment.id)).toEqual(["native-comment"])
    }))

  it.effect("adds markdown with native references using the concrete card class", () =>
    Effect.gen(function*() {
      const state = baseState()
      const params = yield* parseAddCardCommentParams({
        cardSpace: "card-space-1",
        card: "card-1",
        body:
          "See [another card](https://test.invalid/browse?workspace=test&_class=master-tag-1&_id=card-2&label=Other)."
      })

      const result = yield* addCardComment(params).pipe(Effect.provide(makeLayer(state)))
      const created = assertAt(state.messages, 0)

      expect(result.cardId).toBe("card-1")
      expect(created).toMatchObject({
        attachedTo: "card-1",
        attachedToClass: CARD_CLASS,
        collection: "comments",
        space: SPACE_ID
      })
      expect(capturedMarkupReferenceNodes(created.message)).toContainEqual({
        type: "reference",
        attrs: {
          id: "card-2",
          label: "Other",
          objectclass: "master-tag-1"
        }
      })
    }))

  it.effect("updates and deletes only comments belonging to the resolved card", () =>
    Effect.gen(function*() {
      const state = baseState()
      state.messages.push(
        chatMessage("comment-1", "Initial", { attachedToClass: cardPlugin.class.Card }),
        chatMessage("foreign-comment", "Foreign", { attachedTo: toRef<Doc>("card-2") })
      )
      const updateParams = yield* parseUpdateCardCommentParams({
        cardSpace: "Product Strategy",
        card: "Decision Record",
        commentId: "comment-1",
        body: "Updated"
      })
      const deleteParams = yield* parseDeleteCardCommentParams({
        cardSpace: "Product Strategy",
        card: "Decision Record",
        commentId: "comment-1"
      })

      expect((yield* updateCardComment(updateParams).pipe(Effect.provide(makeLayer(state)))).updated).toBe(true)
      expect((yield* deleteCardComment(deleteParams).pipe(Effect.provide(makeLayer(state)))).deleted).toBe(true)
      expect(state.updatedIds).toEqual(["comment-1"])
      expect(state.removals).toEqual(["comment-1"])
      expect(state.messages.map((message) => message._id)).toContain("foreign-comment")
    }))

  it.effect("returns distinct card-space, card, and card-comment not-found failures", () =>
    Effect.gen(function*() {
      const state = baseState()
      const missingSpace = yield* parseListCardCommentsParams({ cardSpace: "Missing", card: "card-1" })
      const missingCard = yield* parseListCardCommentsParams({ cardSpace: "Product Strategy", card: "Missing" })
      const missingComment = yield* parseDeleteCardCommentParams({
        cardSpace: "Product Strategy",
        card: "Decision Record",
        commentId: "missing"
      })

      expect(yield* Effect.exit(listCardComments(missingSpace).pipe(Effect.provide(makeLayer(state))))).toEqual(
        Exit.fail(new CardSpaceNotFoundError({ identifier: "Missing" }))
      )
      expect(yield* Effect.exit(listCardComments(missingCard).pipe(Effect.provide(makeLayer(state))))).toEqual(
        Exit.fail(new CardNotFoundError({ identifier: "Missing", cardSpace: "Product Strategy" }))
      )
      expect(yield* Effect.exit(deleteCardComment(missingComment).pipe(Effect.provide(makeLayer(state))))).toEqual(
        Exit.fail(
          new CardCommentNotFoundError({
            commentId: missingComment.commentId,
            card: missingComment.card,
            cardSpace: missingComment.cardSpace
          })
        )
      )
      expect(
        new CardCommentNotFoundError({
          commentId: missingComment.commentId,
          card: missingComment.card,
          cardSpace: missingComment.cardSpace
        }).message
      ).toBe("Comment 'missing' not found on card 'Decision Record' in card space 'Product Strategy'")
    }))
})
