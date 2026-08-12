import type { Channel as HulyChannel } from "@hcengineering/chunter"
import type { Employee as HulyEmployee } from "@hcengineering/contact"
import type { AccountUuid as HulyAccountUuid, DocumentUpdate, Space } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  ChannelArchiveResult,
  ChannelLifecycleParams,
  ChannelMemberMutationParams,
  ChannelMemberMutationResult,
  ChannelMemberSummary,
  ListChannelMembersParams,
  ListChannelMembersResult
} from "../../domain/schemas/chat-conversations.js"
import { AccountUuid, ChannelId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  ChannelArchivedError,
  ChannelLastMemberRemovalError,
  ChannelLastOwnerRemovalError,
  ChannelNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import {
  ChannelArchivedError as ChannelArchived,
  ChannelLastMemberRemovalError as ChannelLastMemberRemoval,
  ChannelLastOwnerRemovalError as ChannelLastOwnerRemoval
} from "../errors.js"
import { chunter, contact } from "../huly-plugins.js"
import { findChannel } from "./channels-shared.js"
import { resolveEmployeeAccountUuid } from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef } from "./sdk-boundary.js"
import { arraysEqual, mergeUniqueSortedAccountUuids, removeAccountUuids, sortStrings } from "./spaces-shared.js"

type ChannelMemberError =
  | HulyClientError
  | ChannelNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | ChannelArchivedError
  | ChannelLastMemberRemovalError
  | ChannelLastOwnerRemovalError

type ChannelLifecycleError = HulyClientError | ChannelNotFoundError

const buildAccountUuidToNameMap = (
  client: HulyClient["Service"],
  accountUuids: ReadonlyArray<HulyAccountUuid>
): Effect.Effect<ReadonlyMap<HulyAccountUuid, PersonName>, HulyClientError> =>
  Effect.gen(function* () {
    if (accountUuids.length === 0) {
      return new Map<HulyAccountUuid, PersonName>()
    }

    const employees = yield* client.findAll<HulyEmployee>(
      contact.mixin.Employee,
      hulyQuery<HulyEmployee>({ personUuid: { $in: [...accountUuids] } })
    )

    const result = new Map<HulyAccountUuid, PersonName>()
    for (const employee of employees) {
      if (employee.personUuid !== undefined) {
        result.set(employee.personUuid, PersonName.make(employee.name))
      }
    }
    return result
  })

const resolveChannelMembers = (
  client: HulyClient["Service"],
  members: ChannelMemberMutationParams["members"]
): Effect.Effect<Array<HulyAccountUuid>, ChannelMemberError> =>
  Effect.forEach(members, (member) =>
    Schema.is(AccountUuid)(member) ? Effect.succeed(toAccountUuid(member)) : resolveEmployeeAccountUuid(client, member)
  ).pipe(Effect.map((values) => sortStrings([...new Set(values)])))

const updateChannelDoc = (
  client: HulyClient["Service"],
  channel: HulyChannel,
  operations: DocumentUpdate<HulyChannel>
): Effect.Effect<void, HulyClientError> =>
  client.updateDoc(chunter.class.Channel, toRef<Space>(channel._id), channel._id, operations).pipe(Effect.asVoid)

const requireActiveChannel = (channel: HulyChannel): Effect.Effect<void, ChannelArchivedError> =>
  channel.archived ? Effect.fail(new ChannelArchived({ channel: channel._id })) : Effect.void

const ensureRemovalKeepsValidChannel = (
  channel: HulyChannel,
  nextMembers: ReadonlyArray<HulyAccountUuid>
): Effect.Effect<void, ChannelLastMemberRemovalError | ChannelLastOwnerRemovalError> =>
  Effect.gen(function* () {
    if (nextMembers.length === 0) {
      return yield* new ChannelLastMemberRemoval({ channel: channel._id })
    }

    const owners = channel.owners ?? []
    if (owners.length > 0 && !nextMembers.some((member) => owners.includes(member))) {
      return yield* new ChannelLastOwnerRemoval({ channel: channel._id })
    }
  })

const memberMutationResult = (
  channel: HulyChannel,
  members: ReadonlyArray<HulyAccountUuid>,
  changed: boolean
): ChannelMemberMutationResult => ({
  channelId: ChannelId.make(channel._id),
  members: members.map((member) => AccountUuid.make(member)),
  changed
})

const mutateChannelMembers = (
  params: {
    readonly channel: ChannelMemberMutationParams["channel"]
    readonly members: ReadonlyArray<HulyAccountUuid>
  },
  mutateMembers: (
    current: ReadonlyArray<HulyAccountUuid>,
    resolved: ReadonlyArray<HulyAccountUuid>
  ) => ReadonlyArray<HulyAccountUuid>,
  validate?: (
    channel: HulyChannel,
    nextMembers: ReadonlyArray<HulyAccountUuid>
  ) => Effect.Effect<void, ChannelMemberError>
): Effect.Effect<ChannelMemberMutationResult, ChannelMemberError, HulyClient> =>
  Effect.gen(function* () {
    const { channel, client } = yield* findChannel(params.channel)
    yield* requireActiveChannel(channel)

    const nextMembers = mutateMembers(channel.members, params.members).map(toAccountUuid)
    if (validate !== undefined) {
      yield* validate(channel, nextMembers)
    }

    const changed = !arraysEqual(sortStrings(channel.members), nextMembers)
    if (changed) {
      yield* updateChannelDoc(client, channel, { members: nextMembers })
    }
    return memberMutationResult(channel, nextMembers, changed)
  })

export const listChannelMembers = (
  params: ListChannelMembersParams
): Effect.Effect<ListChannelMembersResult, ChannelNotFoundError | HulyClientError, HulyClient> =>
  Effect.gen(function* () {
    const { channel, client } = yield* findChannel(params.channel)
    const accountUuidToName = yield* buildAccountUuidToNameMap(client, channel.members)
    const members: Array<ChannelMemberSummary> = channel.members.map((member) => ({
      accountUuid: AccountUuid.make(member),
      name: accountUuidToName.get(member)
    }))
    return { channelId: ChannelId.make(channel._id), members }
  })

export const addChannelMembers = (
  params: ChannelMemberMutationParams
): Effect.Effect<ChannelMemberMutationResult, ChannelMemberError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const resolvedMembers = yield* resolveChannelMembers(client, params.members)
    return yield* mutateChannelMembers(
      { channel: params.channel, members: resolvedMembers },
      mergeUniqueSortedAccountUuids
    )
  })

export const removeChannelMembers = (
  params: ChannelMemberMutationParams
): Effect.Effect<ChannelMemberMutationResult, ChannelMemberError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const resolvedMembers = yield* resolveChannelMembers(client, params.members)
    return yield* mutateChannelMembers(
      { channel: params.channel, members: resolvedMembers },
      removeAccountUuids,
      ensureRemovalKeepsValidChannel
    )
  })

export const joinChannel = (
  params: ChannelLifecycleParams
): Effect.Effect<ChannelMemberMutationResult, ChannelMemberError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* mutateChannelMembers(
      { channel: params.channel, members: [client.getAccountUuid()] },
      mergeUniqueSortedAccountUuids
    )
  })

export const leaveChannel = (
  params: ChannelLifecycleParams
): Effect.Effect<ChannelMemberMutationResult, ChannelMemberError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* mutateChannelMembers(
      { channel: params.channel, members: [client.getAccountUuid()] },
      removeAccountUuids,
      ensureRemovalKeepsValidChannel
    )
  })

const setChannelArchived = (
  params: ChannelLifecycleParams,
  archived: boolean
): Effect.Effect<ChannelArchiveResult, ChannelLifecycleError, HulyClient> =>
  Effect.gen(function* () {
    const { channel, client } = yield* findChannel(params.channel)
    const changed = channel.archived !== archived
    if (changed) {
      yield* updateChannelDoc(client, channel, { archived })
    }
    return { channelId: ChannelId.make(channel._id), archived, changed }
  })

export const archiveChannel = (
  params: ChannelLifecycleParams
): Effect.Effect<ChannelArchiveResult, ChannelLifecycleError, HulyClient> => setChannelArchived(params, true)

export const unarchiveChannel = (
  params: ChannelLifecycleParams
): Effect.Effect<ChannelArchiveResult, ChannelLifecycleError, HulyClient> => setChannelArchived(params, false)
