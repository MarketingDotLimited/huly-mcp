import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import type { Person } from "@hcengineering/contact"
import type { DocumentUpdate } from "@hcengineering/core"
import { Effect } from "effect"

import type { UpdateBoardCardParams } from "../../domain/schemas.js"
import type { HulyClient } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { descriptionFromMarkdown } from "./boards-output.js"
import {
  type BoardCardWriteError,
  getBoardProjectType,
  resolveBoardStatus,
  resolveBoardTaskType,
  resolveEmployeeRef,
  resolveEmployeeRefs
} from "./boards-shared.js"
import { toRef } from "./sdk-boundary.js"
import { type DirectUpdateEntry, mergeUpdateEntries } from "./update-guards.js"

type Field =
  | "title"
  | "description"
  | "status"
  | "assignee"
  | "members"
  | "location"
  | "cover"
  | "startDate"
  | "dueDate"

type CardUpdateEntry<K extends Field> = Effect.Effect<
  DirectUpdateEntry<Field, DocumentUpdate<HulyBoardCard>, K>,
  BoardCardWriteError,
  Diagnostics
>
type CardUpdateEntries = { readonly [K in Field]: CardUpdateEntry<K> }

interface CardStatusContext {
  readonly projectType: Effect.Effect.Success<ReturnType<typeof getBoardProjectType>> | undefined
  readonly kind: Effect.Effect.Success<ReturnType<typeof resolveBoardTaskType>> | undefined
}

const resolveCardStatusContext = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  card: HulyBoardCard,
  params: UpdateBoardCardParams
): Effect.Effect<CardStatusContext, BoardCardWriteError, Diagnostics> =>
  Effect.gen(function* () {
    const projectType = params.status === undefined ? undefined : yield* getBoardProjectType(client, resolvedBoard)
    const kind =
      projectType === undefined
        ? undefined
        : yield* resolveBoardTaskType(client, resolvedBoard, projectType, String(card.kind))
    return { projectType, kind }
  })

const cardStatusEntry = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  params: UpdateBoardCardParams,
  context: CardStatusContext
): CardUpdateEntry<"status"> =>
  params.status === undefined || context.projectType === undefined || context.kind === undefined
    ? Effect.succeed({})
    : Effect.map(
        resolveBoardStatus(client, resolvedBoard, context.projectType, context.kind, params.status),
        (status) => ({ status: status.id })
      )

const cardAssigneeEntry = (client: HulyClient["Type"], params: UpdateBoardCardParams): CardUpdateEntry<"assignee"> =>
  params.assignee === undefined
    ? Effect.succeed({})
    : params.assignee === null
      ? Effect.succeed({ assignee: null })
      : Effect.map(resolveEmployeeRef(client, params.assignee), (assignee) => ({ assignee: toRef<Person>(assignee) }))

const cardMembersEntry = (
  client: HulyClient["Type"],
  card: HulyBoardCard,
  params: UpdateBoardCardParams
): CardUpdateEntry<"members"> =>
  Effect.gen(function* () {
    if (params.members !== undefined) return { members: [...(yield* resolveEmployeeRefs(client, params.members))] }
    const current = card.members ?? []
    const add = params.addMembers === undefined ? [] : yield* resolveEmployeeRefs(client, params.addMembers)
    const remove = params.removeMembers === undefined ? [] : yield* resolveEmployeeRefs(client, params.removeMembers)
    if (add.length === 0 && remove.length === 0) return {}
    const afterRemove = current.filter((member) => !remove.includes(member))
    return { members: [...afterRemove, ...add.filter((member) => !afterRemove.includes(member))] }
  })

const cardPresentationEntries = (
  client: HulyClient["Type"],
  params: UpdateBoardCardParams
): Pick<CardUpdateEntries, "cover" | "description" | "location" | "title"> => ({
  title: Effect.succeed(params.title === undefined ? {} : { title: params.title }),
  description: Effect.succeed(
    params.description === undefined
      ? {}
      : { description: descriptionFromMarkdown(params.description ?? "", client.markupUrlConfig) }
  ),
  location: Effect.succeed(params.location === undefined ? {} : { location: params.location ?? "" }),
  cover: Effect.succeed(params.cover === undefined ? {} : { cover: params.cover })
})

const cardDateEntries = (params: UpdateBoardCardParams): Pick<CardUpdateEntries, "dueDate" | "startDate"> => ({
  startDate: Effect.succeed(params.startDate === undefined ? {} : { startDate: params.startDate }),
  dueDate: Effect.succeed(params.dueDate === undefined ? {} : { dueDate: params.dueDate })
})

const cardUpdateEntries = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  card: HulyBoardCard,
  params: UpdateBoardCardParams,
  context: CardStatusContext
): CardUpdateEntries => ({
  ...cardPresentationEntries(client, params),
  ...cardDateEntries(params),
  status: cardStatusEntry(client, resolvedBoard, params, context),
  assignee: cardAssigneeEntry(client, params),
  members: cardMembersEntry(client, card, params)
})

export const buildCardUpdate = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  card: HulyBoardCard,
  params: UpdateBoardCardParams
): Effect.Effect<DocumentUpdate<HulyBoardCard>, BoardCardWriteError, Diagnostics> =>
  Effect.gen(function* () {
    const context = yield* resolveCardStatusContext(client, resolvedBoard, card, params)
    const entries = cardUpdateEntries(client, resolvedBoard, card, params, context)
    return mergeUpdateEntries(yield* Effect.all(Object.values(entries)))
  })
