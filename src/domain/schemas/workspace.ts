import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import {
  AccountId,
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  Email,
  EmptyParamsSchema,
  enumValuesDescription,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  PersonUuid,
  RegionId,
  SpaceId,
  UrlString as UrlStringSchema,
  withAtLeastOneRequired,
  WorkspaceMode,
  WorkspaceName,
  WorkspaceUuid,
  WorkspaceVersion
} from "./shared.js"

export const AccountRoleValues = ["READONLYGUEST", "DocGuest", "GUEST", "USER", "MAINTAINER", "OWNER", "ADMIN"] as const

export const AccountRoleSchema = Schema.Literals(AccountRoleValues).annotate({
  title: "AccountRole",
  description: `Workspace member role: ${enumValuesDescription(AccountRoleValues)}`
})

export type AccountRole = Schema.Schema.Type<typeof AccountRoleSchema>

export const ListWorkspaceMembersParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of members to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListWorkspaceMembersParams", description: "Parameters for listing workspace members" })

export type ListWorkspaceMembersParams = Schema.Schema.Type<typeof ListWorkspaceMembersParamsSchema>

export const UpdateMemberRoleParamsSchema = Schema.Struct({
  accountId: AccountId.annotate({ description: "Account UUID of the member" }),
  role: AccountRoleSchema.annotate({ description: "New role for the member" })
}).annotate({ title: "UpdateMemberRoleParams", description: "Parameters for updating a member's role" })

export type UpdateMemberRoleParams = Schema.Schema.Type<typeof UpdateMemberRoleParamsSchema>

export const ListWorkspacesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of workspaces to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListWorkspacesParams", description: "Parameters for listing workspaces" })

export type ListWorkspacesParams = Schema.Schema.Type<typeof ListWorkspacesParamsSchema>

export const CreateWorkspaceParamsSchema = Schema.Struct({
  name: NonEmptyString.annotate({ description: "Name for the new workspace" }),
  region: Schema.optional(RegionId.annotate({ description: "Region for the workspace (optional)" }))
}).annotate({ title: "CreateWorkspaceParams", description: "Parameters for creating a workspace" })

export type CreateWorkspaceParams = Schema.Schema.Type<typeof CreateWorkspaceParamsSchema>

export const UPDATE_USER_PROFILE_FIELDS = [
  "bio",
  "city",
  "country",
  "website",
  "socialLinks",
  "isPublic"
] as const satisfies ReadonlyArray<"bio" | "city" | "country" | "website" | "socialLinks" | "isPublic">

export const UpdateUserProfileParamsSchema = Schema.Struct({
  bio: Schema.optional(Schema.NullOr(Schema.String).annotate({ description: "Bio text (null to clear)" })),
  city: Schema.optional(Schema.NullOr(Schema.String).annotate({ description: "City (null to clear)" })),
  country: Schema.optional(Schema.NullOr(Schema.String).annotate({ description: "Country (null to clear)" })),
  website: Schema.optional(Schema.NullOr(Schema.String).annotate({ description: "Website URL (null to clear)" })),
  socialLinks: Schema.optional(
    Schema.NullOr(Schema.Record(Schema.String, Schema.String)).annotate({
      description: "Social links as key-value pairs (null to clear)"
    })
  ),
  isPublic: Schema.optional(Schema.Boolean.annotate({ description: "Whether profile is public" }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_USER_PROFILE_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_USER_PROFILE_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateUserProfileParams",
    description: `Parameters for updating user profile. ${atLeastOneUpdateFieldMessage(UPDATE_USER_PROFILE_FIELDS)}`
  })

export type UpdateUserProfileParams = Schema.Schema.Type<typeof UpdateUserProfileParamsSchema>
assertUpdateFields<UpdateUserProfileParams>()([], UPDATE_USER_PROFILE_FIELDS)

export const UPDATE_GUEST_SETTINGS_FIELDS = ["allowReadOnly", "allowSignUp"] as const satisfies ReadonlyArray<
  "allowReadOnly" | "allowSignUp"
>

export const UpdateGuestSettingsParamsSchema = Schema.Struct({
  allowReadOnly: Schema.optional(Schema.Boolean.annotate({ description: "Allow read-only guests" })),
  allowSignUp: Schema.optional(Schema.Boolean.annotate({ description: "Allow guest sign-up" }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_GUEST_SETTINGS_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_GUEST_SETTINGS_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateGuestSettingsParams",
    description: `Parameters for updating guest settings. ${atLeastOneUpdateFieldMessage(UPDATE_GUEST_SETTINGS_FIELDS)}`
  })

export type UpdateGuestSettingsParams = Schema.Schema.Type<typeof UpdateGuestSettingsParamsSchema>
assertUpdateFields<UpdateGuestSettingsParams>()([], UPDATE_GUEST_SETTINGS_FIELDS)

const MAX_UNIX_SECONDS_TIMESTAMP = 9_999_999_999
export const DEFAULT_ACCESS_LINK_ROLE: AccountRole = "GUEST"

const UnixSecondsTimestamp = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(MAX_UNIX_SECONDS_TIMESTAMP)
).annotate({
  identifier: "UnixSecondsTimestamp",
  title: "UnixSecondsTimestamp",
  description: "Unix timestamp in seconds (non-negative integer)"
})

const AccessLinkCommonParamsSchema = Schema.Struct({
  role: Schema.optional(
    AccountRoleSchema.annotate({
      description: `Workspace role granted by the link. Defaults to ${DEFAULT_ACCESS_LINK_ROLE}.`
    })
  ),
  firstName: Schema.optional(NonEmptyString.annotate({ description: "Optional first name for personalized links." })),
  lastName: Schema.optional(NonEmptyString.annotate({ description: "Optional last name for personalized links." })),
  navigateUrl: Schema.optional(
    Schema.String.annotate({ description: "Optional URL/path Huly should open after the link is used." })
  ),
  spaces: Schema.optional(
    Schema.Array(SpaceId).annotate({
      description:
        "Optional Huly space IDs this link should grant access to. Use list_teamspaces, list_card_spaces, or other list tools to discover space IDs."
    })
  )
})

const PersonalizedAccessLinkParamsSchema = Schema.Struct({
  ...AccessLinkCommonParamsSchema.fields,
  notBefore: Schema.optional(
    UnixSecondsTimestamp.annotate({ description: "Unix timestamp in seconds before which the link is invalid." })
  ),
  expiration: Schema.optional(
    UnixSecondsTimestamp.annotate({ description: "Unix timestamp in seconds after which the link expires." })
  ),
  personalized: Schema.optional(
    Schema.Literal(true).annotate({
      description: "Whether the link is bound to one person. Omit to use Huly's personalized-link behavior."
    })
  )
})

const AnonymousAccessLinkParamsSchema = Schema.Struct({
  ...AccessLinkCommonParamsSchema.fields,
  notBefore: UnixSecondsTimestamp.annotate({
    description: "Unix timestamp in seconds before which a non-personalized link is invalid."
  }),
  expiration: UnixSecondsTimestamp.annotate({ description: "Unix timestamp in seconds after which the link expires." }),
  personalized: Schema.Literal(false).annotate({
    description: "Set false for anonymous reusable guest links. Anonymous links require notBefore and expiration."
  })
})

export const CreateAccessLinkParamsSchema = Schema.Union([
  PersonalizedAccessLinkParamsSchema,
  AnonymousAccessLinkParamsSchema
])
  .pipe(
    Schema.check(
      Schema.makeFilter((params) => {
        if (
          params.notBefore !== undefined &&
          params.expiration !== undefined &&
          params.expiration <= params.notBefore
        ) {
          return "expiration must be greater than notBefore."
        }
        return undefined
      })
    )
  )
  .annotate({ title: "CreateAccessLinkParams", description: "Parameters for creating a Huly workspace access link" })

export type CreateAccessLinkParams = Schema.Schema.Type<typeof CreateAccessLinkParamsSchema>

export const GetRegionsParamsSchema = EmptyParamsSchema

export type GetRegionsParams = Schema.Schema.Type<typeof GetRegionsParamsSchema>

export const listWorkspaceMembersParamsJsonSchema = toDraft07JsonSchema(ListWorkspaceMembersParamsSchema)
export const updateMemberRoleParamsJsonSchema = toDraft07JsonSchema(UpdateMemberRoleParamsSchema)
export const listWorkspacesParamsJsonSchema = toDraft07JsonSchema(ListWorkspacesParamsSchema)
export const createWorkspaceParamsJsonSchema = toDraft07JsonSchema(CreateWorkspaceParamsSchema)
export const updateUserProfileParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateUserProfileParamsSchema),
  UPDATE_USER_PROFILE_FIELDS
)
export const updateGuestSettingsParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateGuestSettingsParamsSchema),
  UPDATE_GUEST_SETTINGS_FIELDS
)
export const createAccessLinkParamsJsonSchema = toDraft07JsonSchema(CreateAccessLinkParamsSchema)
export const getRegionsParamsJsonSchema = toDraft07JsonSchema(GetRegionsParamsSchema)

export const parseListWorkspaceMembersParams = Schema.decodeUnknownEffect(ListWorkspaceMembersParamsSchema)
export const parseUpdateMemberRoleParams = Schema.decodeUnknownEffect(UpdateMemberRoleParamsSchema)
export const parseListWorkspacesParams = Schema.decodeUnknownEffect(ListWorkspacesParamsSchema)
export const parseCreateWorkspaceParams = Schema.decodeUnknownEffect(CreateWorkspaceParamsSchema)
export const parseUpdateUserProfileParams = Schema.decodeUnknownEffect(UpdateUserProfileParamsSchema)
export const parseUpdateGuestSettingsParams = Schema.decodeUnknownEffect(UpdateGuestSettingsParamsSchema)
export const parseCreateAccessLinkParams = Schema.decodeUnknownEffect(CreateAccessLinkParamsSchema)
export const parseGetRegionsParams = Schema.decodeUnknownEffect(GetRegionsParamsSchema)

export const WorkspaceMemberSchema = Schema.Struct({
  personId: PersonUuid,
  role: AccountRoleSchema,
  name: Schema.optional(NonEmptyString),
  email: Schema.optional(Email)
})
export type WorkspaceMember = Schema.Schema.Type<typeof WorkspaceMemberSchema>

export const WorkspaceInfoSchema = Schema.Struct({
  uuid: WorkspaceUuid,
  name: WorkspaceName,
  url: UrlStringSchema,
  region: Schema.optional(RegionId),
  createdOn: Schema.Number,
  allowReadOnlyGuest: Schema.optional(Schema.Boolean),
  allowGuestSignUp: Schema.optional(Schema.Boolean),
  version: Schema.optional(WorkspaceVersion),
  mode: Schema.optional(WorkspaceMode)
})
export type WorkspaceInfo = Schema.Schema.Type<typeof WorkspaceInfoSchema>

export const WorkspaceSummarySchema = Schema.Struct({
  uuid: WorkspaceUuid,
  name: WorkspaceName,
  url: UrlStringSchema,
  region: Schema.optional(RegionId),
  createdOn: Schema.Number,
  lastVisit: Schema.optional(Schema.Number)
})
export type WorkspaceSummary = Schema.Schema.Type<typeof WorkspaceSummarySchema>

export const RegionInfoSchema = Schema.Struct({ region: RegionId, name: Schema.String })
export type RegionInfo = Schema.Schema.Type<typeof RegionInfoSchema>

export const UserProfileSchema = Schema.Struct({
  personUuid: PersonUuid,
  firstName: Schema.String,
  lastName: Schema.String,
  bio: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
  website: Schema.optional(Schema.String),
  socialLinks: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  isPublic: Schema.Boolean
})
export type UserProfile = Schema.Schema.Type<typeof UserProfileSchema>

export const UpdateMemberRoleResultSchema = Schema.Struct({
  accountId: AccountId,
  role: AccountRoleSchema,
  updated: Schema.Boolean
})
export type UpdateMemberRoleResult = Schema.Schema.Type<typeof UpdateMemberRoleResultSchema>

export const CreateWorkspaceResultSchema = Schema.Struct({
  uuid: WorkspaceUuid,
  url: UrlStringSchema,
  name: WorkspaceName
})
export type CreateWorkspaceResult = Schema.Schema.Type<typeof CreateWorkspaceResultSchema>

export const DeleteWorkspaceResultSchema = Schema.Struct({ deleted: Schema.Boolean })
export type DeleteWorkspaceResult = Schema.Schema.Type<typeof DeleteWorkspaceResultSchema>

export const UpdateUserProfileResultSchema = Schema.Struct({ updated: Schema.Boolean })
export type UpdateUserProfileResult = Schema.Schema.Type<typeof UpdateUserProfileResultSchema>

export const UpdateGuestSettingsResultSchema = Schema.Struct({
  updated: Schema.Boolean,
  allowReadOnly: Schema.optional(Schema.Boolean),
  allowSignUp: Schema.optional(Schema.Boolean)
})
export type UpdateGuestSettingsResult = Schema.Schema.Type<typeof UpdateGuestSettingsResultSchema>

export const CreateAccessLinkResultSchema = Schema.Struct({
  link: UrlStringSchema,
  role: AccountRoleSchema,
  spaces: Schema.optional(Schema.Array(SpaceId)),
  personalized: Schema.optional(Schema.Boolean)
})
export type CreateAccessLinkResult = Schema.Schema.Type<typeof CreateAccessLinkResultSchema>

export const ListWorkspaceMembersResultSchema = Schema.Array(WorkspaceMemberSchema)
export const ListWorkspacesResultSchema = Schema.Array(WorkspaceSummarySchema)
export const GetRegionsResultSchema = Schema.Array(RegionInfoSchema)
export const GetUserProfileResultSchema = Schema.NullOr(UserProfileSchema)
