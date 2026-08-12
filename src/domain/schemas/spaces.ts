import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { clearableText } from "./clearable.js"
import {
  AccountUuid,
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  NonEmptyString,
  ObjectClassName,
  PermissionId,
  RoleId,
  SpaceClassFilter,
  SpaceId,
  SpaceIdentifier,
  SpaceTypeId,
  SpaceTypeIdentifier,
  withAtLeastOneRequired
} from "./shared.js"

const limitDescription = (subject: string): string => `Maximum ${subject} to return (default: ${DEFAULT_LIMIT}).`

export const SpacePermissionScopeSchema = Schema.Literals(["space", "workspace"])
export type SpacePermissionScope = Schema.Schema.Type<typeof SpacePermissionScopeSchema>

export const SpaceMemberIdentifier = NonEmptyString.pipe(Schema.brand("SpaceMemberIdentifier"))
export type SpaceMemberIdentifier = Schema.Schema.Type<typeof SpaceMemberIdentifier>

export const SpaceRoleIdentifier = NonEmptyString.pipe(Schema.brand("SpaceRoleIdentifier"))
export type SpaceRoleIdentifier = Schema.Schema.Type<typeof SpaceRoleIdentifier>

const SpaceMemberIdentifierSchema = SpaceMemberIdentifier.annotate({
  description:
    "Workspace member to resolve. Accepts a Huly account UUID directly, an exact email address, or an exact person display name."
})

const SpaceRoleIdentifierSchema = SpaceRoleIdentifier.annotate({
  description:
    "Role to resolve within the space's SpaceType. Accepts a raw Huly role _id or an exact role name from get_space_type."
})

const HulyOutputName = Schema.String.annotate({
  description: "Display name as stored by Huly; system records can use an empty string."
})

export const SpaceRoleAssignmentSchema = Schema.Struct({ roleId: RoleId, members: Schema.Array(AccountUuid) })
export type SpaceRoleAssignment = Schema.Schema.Type<typeof SpaceRoleAssignmentSchema>
export const DEFAULT_SPACE_OWNER_ENSURE_MEMBERS = true

export const SpaceSummarySchema = Schema.Struct({
  id: SpaceId,
  name: HulyOutputName,
  description: Schema.optional(Schema.String),
  class: ObjectClassName,
  type: Schema.optional(SpaceTypeId),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  autoJoin: Schema.optional(Schema.Boolean),
  membersCount: Count,
  ownersCount: Count
})
export type SpaceSummary = Schema.Schema.Type<typeof SpaceSummarySchema>

export const SpaceDetailSchema = Schema.Struct({
  id: SpaceId,
  name: HulyOutputName,
  description: Schema.String,
  class: ObjectClassName,
  type: Schema.optional(SpaceTypeId),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  autoJoin: Schema.optional(Schema.Boolean),
  members: Schema.Array(AccountUuid),
  owners: Schema.Array(AccountUuid),
  roleAssignments: Schema.optional(Schema.Array(SpaceRoleAssignmentSchema))
})
export type SpaceDetail = Schema.Schema.Type<typeof SpaceDetailSchema>

export const SpaceTypeSummarySchema = Schema.Struct({
  id: SpaceTypeId,
  name: HulyOutputName,
  shortDescription: Schema.optional(Schema.String),
  descriptor: NonEmptyString,
  baseClass: Schema.optional(ObjectClassName),
  targetClass: ObjectClassName,
  defaultMembers: Schema.Array(AccountUuid),
  autoJoin: Schema.optional(Schema.Boolean),
  rolesCount: Count
})
export type SpaceTypeSummary = Schema.Schema.Type<typeof SpaceTypeSummarySchema>

export const SpacePermissionSummarySchema = Schema.Struct({
  id: PermissionId,
  label: NonEmptyString,
  description: Schema.optional(Schema.String),
  scope: Schema.optional(SpacePermissionScopeSchema),
  objectClass: Schema.optional(ObjectClassName),
  txClass: Schema.optional(ObjectClassName),
  forbid: Schema.optional(Schema.Boolean)
})
export type SpacePermissionSummary = Schema.Schema.Type<typeof SpacePermissionSummarySchema>

export const SpaceRoleSummarySchema = Schema.Struct({
  id: RoleId,
  name: NonEmptyString,
  permissions: Schema.Array(PermissionId),
  permissionLabels: Schema.Array(NonEmptyString)
})
export type SpaceRoleSummary = Schema.Schema.Type<typeof SpaceRoleSummarySchema>

export const SpaceTypeDetailSchema = Schema.Struct({
  id: SpaceTypeId,
  name: HulyOutputName,
  shortDescription: Schema.optional(Schema.String),
  descriptor: NonEmptyString,
  descriptorName: Schema.optional(NonEmptyString),
  descriptorDescription: Schema.optional(NonEmptyString),
  baseClass: Schema.optional(ObjectClassName),
  targetClass: ObjectClassName,
  defaultMembers: Schema.Array(AccountUuid),
  autoJoin: Schema.optional(Schema.Boolean),
  roles: Schema.Array(SpaceRoleSummarySchema),
  availablePermissions: Schema.Array(SpacePermissionSummarySchema)
})
export type SpaceTypeDetail = Schema.Schema.Type<typeof SpaceTypeDetailSchema>

export const ListSpacesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include archived spaces in results. Defaults to ${DEFAULT_INCLUDE_ARCHIVED}, so only active/non-archived spaces are returned.`
    })
  ),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description:
        "Optional raw Huly space class ID to filter results, for example 'tracker:class:Project' or 'document:class:Teamspace'."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id to filter typed spaces." })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: limitDescription("spaces") }))
})
export type ListSpacesParams = Schema.Schema.Type<typeof ListSpacesParamsSchema>
export const ListSpacesResultSchema = Schema.Struct({ spaces: Schema.Array(SpaceSummarySchema), total: ListTotal })
export type ListSpacesResult = Schema.Schema.Type<typeof ListSpacesResultSchema>

export const GetSpaceParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotate({
    description:
      "Space _id or exact space name. Resolution tries _id first, then exact name. Duplicate names require class and/or type narrowing."
  }),
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Allow matching archived spaces by exact name. Defaults to ${DEFAULT_INCLUDE_ARCHIVED} for name lookup. ID lookup can return archived spaces.`
    })
  ),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup." })
  )
})
export type GetSpaceParams = Schema.Schema.Type<typeof GetSpaceParamsSchema>

export const ListSpaceTypesParamsSchema = Schema.Struct({
  targetClass: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly target space class ID to filter configured space types."
    })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: limitDescription("space types") }))
})
export type ListSpaceTypesParams = Schema.Schema.Type<typeof ListSpaceTypesParamsSchema>
export const ListSpaceTypesResultSchema = Schema.Struct({
  spaceTypes: Schema.Array(SpaceTypeSummarySchema),
  total: ListTotal
})
export type ListSpaceTypesResult = Schema.Schema.Type<typeof ListSpaceTypesResultSchema>

export const GetSpaceTypeParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotate({
    description: "SpaceType _id or exact name. Resolution tries _id first, then exact name."
  })
})
export type GetSpaceTypeParams = Schema.Schema.Type<typeof GetSpaceTypeParamsSchema>

export const ListSpacePermissionsParamsSchema = Schema.Struct({
  scope: Schema.optional(
    SpacePermissionScopeSchema.annotate({ description: "Filter permissions by Huly scope: space or workspace." })
  ),
  objectClass: Schema.optional(
    SpaceClassFilter.annotate({ description: "Filter permissions bound to this raw Huly object class ID." })
  ),
  search: Schema.optional(
    NonEmptyString.annotate({
      description: "Case-insensitive substring search across permission id, label, and description."
    })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: limitDescription("permissions") }))
})
export type ListSpacePermissionsParams = Schema.Schema.Type<typeof ListSpacePermissionsParamsSchema>
export const ListSpacePermissionsResultSchema = Schema.Struct({
  permissions: Schema.Array(SpacePermissionSummarySchema),
  total: ListTotal
})
export type ListSpacePermissionsResult = Schema.Schema.Type<typeof ListSpacePermissionsResultSchema>

export const UPDATE_SPACE_FIELDS = ["name", "description", "private", "archived", "autoJoin"] as const

export const UpdateSpaceParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotate({
    description:
      "Space _id or exact space name to update. Use class/type narrowing if the name is shared by multiple spaces."
  }),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup." })
  ),
  name: Schema.optional(NonEmptyString.annotate({ description: "New space display name." })),
  description: Schema.optional(clearableText("New plain-text description.")),
  private: Schema.optional(Schema.Boolean.annotate({ description: "Whether the space is private." })),
  archived: Schema.optional(Schema.Boolean.annotate({ description: "Whether the space is archived." })),
  autoJoin: Schema.optional(
    Schema.Boolean.annotate({ description: "Whether workspace members should auto-join the space when supported." })
  )
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_SPACE_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_SPACE_FIELDS)
    )
  )
)
export type UpdateSpaceParams = Schema.Schema.Type<typeof UpdateSpaceParamsSchema>
assertUpdateFields<UpdateSpaceParams>()(["space", "class", "type"], UPDATE_SPACE_FIELDS)
export const UpdateSpaceResultSchema = Schema.Struct({ id: SpaceId, updated: Schema.Boolean })
export type UpdateSpaceResult = Schema.Schema.Type<typeof UpdateSpaceResultSchema>

export const SpaceMemberMutationParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotate({
    description:
      "Space _id or exact space name whose members should change. Use class/type narrowing if the name is shared by multiple spaces."
  }),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup." })
  ),
  members: Schema.Array(SpaceMemberIdentifierSchema)
    .pipe(Schema.check(Schema.isMinLength(1)))
    .annotate({
      description:
        "Members to add or remove. Each entry may be an account UUID, exact email address, or exact person name."
    })
})
export type SpaceMemberMutationParams = Schema.Schema.Type<typeof SpaceMemberMutationParamsSchema>
export const SpaceMemberMutationResultSchema = Schema.Struct({
  id: SpaceId,
  members: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type SpaceMemberMutationResult = Schema.Schema.Type<typeof SpaceMemberMutationResultSchema>

export const SetSpaceOwnersParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotate({
    description:
      "Space _id or exact space name whose owners should be replaced. Use class/type narrowing if the name is shared by multiple spaces."
  }),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup." })
  ),
  owners: Schema.Array(SpaceMemberIdentifierSchema).annotate({
    description:
      "Replacement owner list. Each entry may be an account UUID, exact email address, or exact person name. Pass [] to clear owners."
  }),
  ensureMembers: Schema.optional(
    Schema.Boolean.annotate({
      description: `Also add each owner to members. Defaults to ${DEFAULT_SPACE_OWNER_ENSURE_MEMBERS}.`
    })
  )
})
export type SetSpaceOwnersParams = Schema.Schema.Type<typeof SetSpaceOwnersParamsSchema>
export const SetSpaceOwnersResultSchema = Schema.Struct({
  id: SpaceId,
  owners: Schema.Array(AccountUuid),
  members: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type SetSpaceOwnersResult = Schema.Schema.Type<typeof SetSpaceOwnersResultSchema>

const SpaceRoleMemberMutationFields = {
  space: SpaceIdentifier.annotate({
    description:
      "Typed space _id or exact space name whose role assignment should change. The space must have a SpaceType."
  }),
  class: Schema.optional(
    SpaceClassFilter.annotate({
      description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
    })
  ),
  type: Schema.optional(
    SpaceTypeId.annotate({ description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup." })
  ),
  role: SpaceRoleIdentifierSchema,
  members: Schema.Array(SpaceMemberIdentifierSchema)
    .pipe(Schema.check(Schema.isMinLength(1)))
    .annotate({
      description:
        "Members to add or remove from this role. Each entry may be an account UUID, exact email address, or exact person name."
    })
}

export const SpaceRoleMemberMutationParamsSchema = Schema.Struct(SpaceRoleMemberMutationFields)
export type SpaceRoleMemberMutationParams = Schema.Schema.Type<typeof SpaceRoleMemberMutationParamsSchema>

export const SetSpaceRoleMembersParamsSchema = Schema.Struct({
  ...SpaceRoleMemberMutationFields,
  members: Schema.Array(SpaceMemberIdentifierSchema).annotate({
    description:
      "Replacement member list for this role only. Each entry may be an account UUID, exact email address, or exact person name. Pass [] to clear this role."
  })
})
export type SetSpaceRoleMembersParams = Schema.Schema.Type<typeof SetSpaceRoleMembersParamsSchema>
export const SpaceRoleMembersResultSchema = Schema.Struct({
  id: SpaceId,
  roleId: RoleId,
  members: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type SpaceRoleMembersResult = Schema.Schema.Type<typeof SpaceRoleMembersResultSchema>
export const SetSpaceRoleMembersResultSchema = SpaceRoleMembersResultSchema
export type SetSpaceRoleMembersResult = Schema.Schema.Type<typeof SetSpaceRoleMembersResultSchema>
export const AddSpaceRoleMembersResultSchema = SpaceRoleMembersResultSchema
export type AddSpaceRoleMembersResult = Schema.Schema.Type<typeof AddSpaceRoleMembersResultSchema>
export const RemoveSpaceRoleMembersResultSchema = SpaceRoleMembersResultSchema
export type RemoveSpaceRoleMembersResult = Schema.Schema.Type<typeof RemoveSpaceRoleMembersResultSchema>

export const listSpacesParamsJsonSchema = toDraft07JsonSchema(ListSpacesParamsSchema)
export const getSpaceParamsJsonSchema = toDraft07JsonSchema(GetSpaceParamsSchema)
export const listSpaceTypesParamsJsonSchema = toDraft07JsonSchema(ListSpaceTypesParamsSchema)
export const getSpaceTypeParamsJsonSchema = toDraft07JsonSchema(GetSpaceTypeParamsSchema)
export const listSpacePermissionsParamsJsonSchema = toDraft07JsonSchema(ListSpacePermissionsParamsSchema)
export const updateSpaceParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateSpaceParamsSchema),
  UPDATE_SPACE_FIELDS
)
export const spaceMemberMutationParamsJsonSchema = toDraft07JsonSchema(SpaceMemberMutationParamsSchema)
export const setSpaceOwnersParamsJsonSchema = toDraft07JsonSchema(SetSpaceOwnersParamsSchema)
export const spaceRoleMemberMutationParamsJsonSchema = toDraft07JsonSchema(SpaceRoleMemberMutationParamsSchema)
export const setSpaceRoleMembersParamsJsonSchema = toDraft07JsonSchema(SetSpaceRoleMembersParamsSchema)

export const parseListSpacesParams = Schema.decodeUnknownEffect(ListSpacesParamsSchema)
export const parseGetSpaceParams = Schema.decodeUnknownEffect(GetSpaceParamsSchema)
export const parseListSpaceTypesParams = Schema.decodeUnknownEffect(ListSpaceTypesParamsSchema)
export const parseGetSpaceTypeParams = Schema.decodeUnknownEffect(GetSpaceTypeParamsSchema)
export const parseListSpacePermissionsParams = Schema.decodeUnknownEffect(ListSpacePermissionsParamsSchema)
export const parseUpdateSpaceParams = Schema.decodeUnknownEffect(UpdateSpaceParamsSchema)
export const parseSpaceMemberMutationParams = Schema.decodeUnknownEffect(SpaceMemberMutationParamsSchema)
export const parseSetSpaceOwnersParams = Schema.decodeUnknownEffect(SetSpaceOwnersParamsSchema)
export const parseSpaceRoleMemberMutationParams = Schema.decodeUnknownEffect(SpaceRoleMemberMutationParamsSchema)
export const parseSetSpaceRoleMembersParams = Schema.decodeUnknownEffect(SetSpaceRoleMembersParamsSchema)

export const GetSpaceResultSchema = SpaceDetailSchema
export const GetSpaceTypeResultSchema = SpaceTypeDetailSchema
export const AddSpaceMembersResultSchema = SpaceMemberMutationResultSchema
export const RemoveSpaceMembersResultSchema = SpaceMemberMutationResultSchema
