import type { Employee as HulyEmployee, Person, PersonSpace } from "@hcengineering/contact"
import {
  type Class,
  type Data,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Ref,
  type Space
} from "@hcengineering/core"
import type { DocNotifyContext as HulyDocNotifyContext } from "@hcengineering/notification"
import { Effect } from "effect"

import type {
  ConversationTarget,
  ConversationKind,
  ConversationStateResult,
  SetConversationClosedParams,
  SetConversationStarredParams
} from "../../domain/schemas/chat-conversations.js"
import { ChannelId, NotificationContextId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  ChannelNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  NotificationPersonSpaceNotFoundError
} from "../errors.js"
import { NotificationPersonSpaceNotFoundError as NotificationPersonSpaceNotFound } from "../errors.js"
import { chunter, contact, notification } from "../huly-plugins.js"
import { findChannel } from "./channels-shared.js"
import { findDirectMessage } from "./direct-message-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type ResolveConversationError =
  | HulyClientError
  | ChannelNotFoundError
  | DirectMessageIdentifierAmbiguousError
  | DirectMessageNotFoundError

type ConversationStateError = ResolveConversationError | NotificationPersonSpaceNotFoundError

export interface ResolvedConversation {
  readonly kind: ConversationKind
  readonly objectId: Ref<Doc>
  readonly objectClass: Ref<Class<Doc>>
  readonly objectSpace: Ref<Space>
}

export const resolveConversation = (
  params: ConversationTarget
): Effect.Effect<ResolvedConversation, ResolveConversationError, HulyClient> =>
  Effect.gen(function* () {
    if (params.channel !== undefined) {
      const { channel } = yield* findChannel(params.channel)
      return {
        kind: "channel",
        objectId: toRef<Doc>(channel._id),
        objectClass: toClassRef<Doc>(chunter.class.Channel),
        objectSpace: toRef<Space>(channel._id)
      }
    }

    const { dm } = yield* findDirectMessage(params.dm)
    return {
      kind: "direct_message",
      objectId: toRef<Doc>(dm._id),
      objectClass: toClassRef<Doc>(chunter.class.DirectMessage),
      objectSpace: toRef<Space>(dm._id)
    }
  })

const findCurrentPersonSpace = (
  client: HulyClient["Service"]
): Effect.Effect<PersonSpace, HulyClientError | NotificationPersonSpaceNotFoundError> =>
  Effect.gen(function* () {
    const user = client.getAccountUuid()
    const employee = yield* client.findOne<HulyEmployee>(
      contact.mixin.Employee,
      hulyQuery<HulyEmployee>({ personUuid: user })
    )
    if (employee === undefined) {
      return yield* new NotificationPersonSpaceNotFound({ user })
    }

    const personSpace = yield* client.findOne<PersonSpace>(
      contact.class.PersonSpace,
      hulyQuery<PersonSpace>({ person: toRef<Person>(employee._id) })
    )
    if (personSpace === undefined) {
      return yield* new NotificationPersonSpaceNotFound({ user })
    }

    return personSpace
  })

const findConversationContext = (
  client: HulyClient["Service"],
  conversation: ResolvedConversation
): Effect.Effect<HulyDocNotifyContext | undefined, HulyClientError> =>
  client.findOne<HulyDocNotifyContext>(
    notification.class.DocNotifyContext,
    hulyQuery<HulyDocNotifyContext>({
      user: client.getAccountUuid(),
      objectId: conversation.objectId,
      objectClass: conversation.objectClass
    })
  )

const createConversationContext = (
  client: HulyClient["Service"],
  conversation: ResolvedConversation
): Effect.Effect<
  { readonly id: Ref<HulyDocNotifyContext>; readonly space: Ref<Space> },
  HulyClientError | NotificationPersonSpaceNotFoundError
> =>
  Effect.gen(function* () {
    const personSpace = yield* findCurrentPersonSpace(client)
    const contextId: Ref<HulyDocNotifyContext> = generateId()
    const contextSpace = toRef<Space>(personSpace._id)
    const contextData: Data<HulyDocNotifyContext> = {
      user: client.getAccountUuid(),
      objectId: conversation.objectId,
      objectClass: conversation.objectClass,
      objectSpace: conversation.objectSpace,
      isPinned: false,
      hidden: false
    }

    yield* client.createDoc(notification.class.DocNotifyContext, contextSpace, contextData, contextId)
    return { id: contextId, space: contextSpace }
  })

const updateContext = (
  client: HulyClient["Service"],
  context: HulyDocNotifyContext,
  operations: DocumentUpdate<HulyDocNotifyContext>
): Effect.Effect<void, HulyClientError> =>
  client.updateDoc(notification.class.DocNotifyContext, context.space, context._id, operations).pipe(Effect.asVoid)

const stateResult = (
  conversation: ResolvedConversation,
  contextId: Ref<HulyDocNotifyContext>,
  starred: boolean,
  closed: boolean,
  changed: boolean
): ConversationStateResult => ({
  kind: conversation.kind,
  objectId: ChannelId.make(conversation.objectId),
  contextId: NotificationContextId.make(contextId),
  starred,
  closed,
  changed
})

type ConversationStateTarget =
  | { readonly field: "isPinned"; readonly value: boolean }
  | { readonly field: "hidden"; readonly value: boolean }

const stateValues = (
  context: Pick<HulyDocNotifyContext, "hidden" | "isPinned">,
  target: ConversationStateTarget
): Pick<HulyDocNotifyContext, "hidden" | "isPinned"> => ({
  isPinned: target.field === "isPinned" ? target.value : context.isPinned,
  hidden: target.field === "hidden" ? target.value : context.hidden
})

const setConversationState = (
  params: ConversationTarget,
  target: ConversationStateTarget
): Effect.Effect<ConversationStateResult, ConversationStateError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const conversation = yield* resolveConversation(params)
    const context = yield* findConversationContext(client, conversation)

    if (context === undefined) {
      const createdContext = yield* createConversationContext(client, conversation)
      if (target.value) {
        yield* client.updateDoc(notification.class.DocNotifyContext, createdContext.space, createdContext.id, {
          [target.field]: true
        })
      }
      const createdState = stateValues({ isPinned: false, hidden: false }, target)
      return stateResult(conversation, createdContext.id, createdState.isPinned, createdState.hidden, true)
    }

    const currentValue = target.field === "isPinned" ? context.isPinned : context.hidden
    if (currentValue === target.value) {
      return stateResult(conversation, context._id, context.isPinned, context.hidden, false)
    }

    yield* updateContext(client, context, { [target.field]: target.value })
    const updatedState = stateValues(context, target)
    return stateResult(conversation, context._id, updatedState.isPinned, updatedState.hidden, true)
  })

export const setConversationStarred = (
  params: SetConversationStarredParams
): Effect.Effect<ConversationStateResult, ConversationStateError, HulyClient> =>
  setConversationState(params, { field: "isPinned", value: params.starred })

export const setConversationClosed = (
  params: SetConversationClosedParams
): Effect.Effect<ConversationStateResult, ConversationStateError, HulyClient> =>
  setConversationState(params, { field: "hidden", value: params.closed })
