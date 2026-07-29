import type { DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import { type AccountUuid as HulyAccountUuid, type Ref } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateGroupDirectMessageParams,
  CreateGroupDirectMessageResult
} from "../../domain/schemas/chat-conversations.js"
import { GroupDirectMessageMinimumOtherPeople } from "../../domain/schemas/chat-conversations.js"
import { AccountUuid, ChannelId, Count } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  DirectMessageParticipantCountError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { DirectMessageParticipantCountError as DirectMessageParticipantCount } from "../errors.js"
import { chunter } from "../huly-plugins.js"
import { resolveEmployeeAccountUuid } from "./contacts-shared.js"
import { createDirectMessageSpace } from "./direct-message-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { arraysEqual, sortStrings } from "./spaces-shared.js"

type CreateGroupDirectMessageError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | DirectMessageParticipantCountError

const exactSortedMembers = (members: ReadonlyArray<HulyAccountUuid>): Array<HulyAccountUuid> =>
  sortStrings([...new Set(members)])

const hasExactMembers = (dm: HulyDirectMessage, sortedMembers: ReadonlyArray<HulyAccountUuid>): boolean =>
  arraysEqual(sortStrings(dm.members), sortedMembers)

const toResult = (
  dmId: Ref<HulyDirectMessage>,
  members: ReadonlyArray<HulyAccountUuid>,
  created: boolean
): CreateGroupDirectMessageResult => ({
  id: ChannelId.make(dmId),
  created,
  members: members.map((member) => AccountUuid.make(member))
})

export const createGroupDirectMessage = (
  params: CreateGroupDirectMessageParams
): Effect.Effect<CreateGroupDirectMessageResult, CreateGroupDirectMessageError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const me = client.getAccountUuid()
    const resolved = yield* Effect.forEach(params.people, (person) => resolveEmployeeAccountUuid(client, person))
    const others = exactSortedMembers(resolved.filter((member) => member !== me))

    if (others.length < GroupDirectMessageMinimumOtherPeople) {
      return yield* new DirectMessageParticipantCount({
        requested: Count.make(params.people.length),
        nonSelfParticipants: Count.make(others.length)
      })
    }

    const members = exactSortedMembers([me, ...others])
    const existingDms = yield* client.findAll<HulyDirectMessage>(
      chunter.class.DirectMessage,
      hulyQuery<HulyDirectMessage>({ members: me })
    )
    const existing = existingDms.find((dm) => hasExactMembers(dm, members))
    if (existing !== undefined) {
      return toResult(existing._id, members, false)
    }

    const dmId = yield* createDirectMessageSpace(client, members)
    return toResult(dmId, members, true)
  })
