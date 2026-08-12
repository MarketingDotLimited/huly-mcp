import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import {
  AccountUuid,
  EmptyParamsSchema,
  NonEmptyString,
  ObjectClassName,
  SpaceId,
  SpaceTypeId,
  SpaceTypeIdentifier
} from "./shared.js"
import { SpaceMemberIdentifier, SpaceRoleIdentifier } from "./spaces.js"

export const DEFAULT_TYPED_SPACE_AUTO_JOIN = false
export const DEFAULT_TYPED_SPACE_PRIVATE = false
export const DEFAULT_TYPED_SPACE_RESTRICTED = false

const SpaceMemberLocatorSchema = SpaceMemberIdentifier.annotate({
  description: "Workspace member account UUID, exact email address, or exact person display name."
})

export const CreateSpaceRoleAssignmentSchema = Schema.Struct({
  role: SpaceRoleIdentifier.annotate({ description: "Role _id or exact role name from the selected space type." }),
  members: Schema.Array(SpaceMemberLocatorSchema)
    .pipe(Schema.check(Schema.isMinLength(1)))
    .annotate({
      description: "Members to assign to this role. Assigned members are also added to the space member list."
    })
})
export type CreateSpaceRoleAssignment = Schema.Schema.Type<typeof CreateSpaceRoleAssignmentSchema>

export const CreateSpaceParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotate({
    description:
      "SpaceType _id or exact name. Generic creation is accepted only when SDK descriptor metadata proves the type uses core:class:TypedSpace directly."
  }),
  name: NonEmptyString.annotate({ description: "New space display name." }),
  description: Schema.optional(NonEmptyString.annotate({ description: "Plain-text space description." })),
  private: Schema.optional(Schema.Boolean.annotate({ description: "Whether the space is private." })),
  autoJoin: Schema.optional(Schema.Boolean.annotate({ description: "Whether workspace members auto-join the space." })),
  restricted: Schema.optional(
    Schema.Boolean.annotate({ description: "Whether transactions require an assigned space-type permission." })
  ),
  members: Schema.optional(
    Schema.Array(SpaceMemberLocatorSchema).annotate({
      description:
        "Initial members. SpaceType default members, owners, and role-assigned members are always included as well."
    })
  ),
  owners: Schema.optional(
    Schema.Array(SpaceMemberLocatorSchema)
      .pipe(Schema.check(Schema.isMinLength(1)))
      .annotate({
        description: "Initial owners. Defaults to the calling Huly account; every owner is also made a member."
      })
  ),
  roleAssignments: Schema.optional(
    Schema.Array(CreateSpaceRoleAssignmentSchema).annotate({
      description: "Optional role assignments created in the same MCP call after the space document is created."
    })
  )
})
export type CreateSpaceParams = Schema.Schema.Type<typeof CreateSpaceParamsSchema>

export const CreateSpaceResultSchema = Schema.Struct({
  id: SpaceId,
  name: NonEmptyString,
  class: ObjectClassName,
  type: SpaceTypeId,
  members: Schema.Array(AccountUuid),
  owners: Schema.Array(AccountUuid)
})
export type CreateSpaceResult = Schema.Schema.Type<typeof CreateSpaceResultSchema>

export const GetGlobalSpaceAdminsParamsSchema = EmptyParamsSchema
export type GetGlobalSpaceAdminsParams = Schema.Schema.Type<typeof GetGlobalSpaceAdminsParamsSchema>
export const GetGlobalSpaceAdminsResultSchema = Schema.Struct({ admins: Schema.Array(AccountUuid) })
export type GetGlobalSpaceAdminsResult = Schema.Schema.Type<typeof GetGlobalSpaceAdminsResultSchema>

export const SetGlobalSpaceAdminsParamsSchema = Schema.Struct({
  admins: Schema.Array(SpaceMemberLocatorSchema).annotate({
    description:
      "Complete replacement global space-admin list. Accepts account UUIDs, exact emails, or exact person display names; pass [] to clear the role."
  })
})
export type SetGlobalSpaceAdminsParams = Schema.Schema.Type<typeof SetGlobalSpaceAdminsParamsSchema>
export const SetGlobalSpaceAdminsResultSchema = Schema.Struct({
  admins: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type SetGlobalSpaceAdminsResult = Schema.Schema.Type<typeof SetGlobalSpaceAdminsResultSchema>

export const createSpaceParamsJsonSchema = toDraft07JsonSchema(CreateSpaceParamsSchema)
export const getGlobalSpaceAdminsParamsJsonSchema = toDraft07JsonSchema(GetGlobalSpaceAdminsParamsSchema)
export const setGlobalSpaceAdminsParamsJsonSchema = toDraft07JsonSchema(SetGlobalSpaceAdminsParamsSchema)

export const parseCreateSpaceParams = Schema.decodeUnknownEffect(CreateSpaceParamsSchema)
export const parseGetGlobalSpaceAdminsParams = Schema.decodeUnknownEffect(GetGlobalSpaceAdminsParamsSchema)
export const parseSetGlobalSpaceAdminsParams = Schema.decodeUnknownEffect(SetGlobalSpaceAdminsParamsSchema)
