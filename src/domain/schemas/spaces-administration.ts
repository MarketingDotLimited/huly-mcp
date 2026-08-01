import { JSONSchema, Schema } from "effect"

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

const SpaceMemberLocatorSchema = SpaceMemberIdentifier.annotations({
  description: "Workspace member account UUID, exact email address, or exact person display name."
})

export const CreateSpaceRoleAssignmentSchema = Schema.Struct({
  role: SpaceRoleIdentifier.annotations({ description: "Role _id or exact role name from the selected space type." }),
  members: Schema.Array(SpaceMemberLocatorSchema)
    .pipe(Schema.minItems(1))
    .annotations({
      description: "Members to assign to this role. Assigned members are also added to the space member list."
    })
})
export type CreateSpaceRoleAssignment = Schema.Schema.Type<typeof CreateSpaceRoleAssignmentSchema>

export const CreateSpaceParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotations({
    description:
      "SpaceType _id or exact name. Generic creation is accepted only when SDK descriptor metadata proves the type uses core:class:TypedSpace directly."
  }),
  name: NonEmptyString.annotations({ description: "New space display name." }),
  description: Schema.optional(NonEmptyString.annotations({ description: "Plain-text space description." })),
  private: Schema.optional(Schema.Boolean.annotations({ description: "Whether the space is private." })),
  autoJoin: Schema.optional(
    Schema.Boolean.annotations({ description: "Whether workspace members auto-join the space." })
  ),
  restricted: Schema.optional(
    Schema.Boolean.annotations({ description: "Whether transactions require an assigned space-type permission." })
  ),
  members: Schema.optional(
    Schema.Array(SpaceMemberLocatorSchema).annotations({
      description:
        "Initial members. SpaceType default members, owners, and role-assigned members are always included as well."
    })
  ),
  owners: Schema.optional(
    Schema.Array(SpaceMemberLocatorSchema)
      .pipe(Schema.minItems(1))
      .annotations({
        description: "Initial owners. Defaults to the calling Huly account; every owner is also made a member."
      })
  ),
  roleAssignments: Schema.optional(
    Schema.Array(CreateSpaceRoleAssignmentSchema).annotations({
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
  admins: Schema.Array(SpaceMemberLocatorSchema).annotations({
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

export const createSpaceParamsJsonSchema = JSONSchema.make(CreateSpaceParamsSchema)
export const getGlobalSpaceAdminsParamsJsonSchema = JSONSchema.make(GetGlobalSpaceAdminsParamsSchema)
export const setGlobalSpaceAdminsParamsJsonSchema = JSONSchema.make(SetGlobalSpaceAdminsParamsSchema)

export const parseCreateSpaceParams = Schema.decodeUnknown(CreateSpaceParamsSchema)
export const parseGetGlobalSpaceAdminsParams = Schema.decodeUnknown(GetGlobalSpaceAdminsParamsSchema)
export const parseSetGlobalSpaceAdminsParams = Schema.decodeUnknown(SetGlobalSpaceAdminsParamsSchema)
