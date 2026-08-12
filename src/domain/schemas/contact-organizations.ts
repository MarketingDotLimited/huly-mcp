import { Schema } from "effect"

import {
  toDraft07JsonSchema,
  withJsonSchemaPropertyDescriptions,
  withJsonSchemaUnionPropertyDescriptions
} from "./json-schema.js"

import {
  addOrganizationChannelParamsJsonSchema,
  AddOrganizationChannelParamsSchema,
  ContactChannelSummarySchema,
  parseAddOrganizationChannelParams
} from "./contact-channels.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  Email,
  hasAtLeastOneDefined,
  LimitParam,
  MemberReference,
  NonEmptyString,
  OrganizationId,
  PersonId,
  PersonName,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"
export const OrganizationMembershipSummarySchema = Schema.Struct({ id: OrganizationId, name: Schema.String })
export type OrganizationMembershipSummary = Schema.Schema.Type<typeof OrganizationMembershipSummarySchema>

export const OrganizationSummarySchema = Schema.Struct({
  id: OrganizationId,
  name: NonEmptyString,
  city: Schema.optional(Schema.String),
  members: Count,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})
export type OrganizationSummary = Schema.Schema.Type<typeof OrganizationSummarySchema>

export const ListOrganizationsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of organizations to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListOrganizationsParams", description: "Parameters for listing organizations" })

export type ListOrganizationsParams = Schema.Schema.Type<typeof ListOrganizationsParamsSchema>

export const CreateOrganizationParamsSchema = Schema.Struct({
  name: NonEmptyString.annotateKey({ description: "Organization name" }),
  members: Schema.optional(Schema.Array(MemberReference).annotateKey({ description: "Member person IDs or emails" }))
}).annotate({ title: "CreateOrganizationParams", description: "Parameters for creating an organization" })

export type CreateOrganizationParams = Schema.Schema.Type<typeof CreateOrganizationParamsSchema>

export const GetOrganizationParamsSchema = Schema.Struct({
  identifier: NonEmptyString.annotateKey({ description: "Organization ID or exact name" })
}).annotate({ title: "GetOrganizationParams", description: "Parameters for getting a single organization" })

export type GetOrganizationParams = Schema.Schema.Type<typeof GetOrganizationParamsSchema>

export const UPDATE_ORGANIZATION_FIELDS = ["name", "city", "description"] as const satisfies ReadonlyArray<
  "name" | "city" | "description"
>
const updateOrganizationFieldMessage = atLeastOneUpdateFieldMessage(UPDATE_ORGANIZATION_FIELDS)

export const UpdateOrganizationParamsSchema = Schema.Struct({
  identifier: NonEmptyString.annotateKey({ description: "Organization ID or exact name" }),
  name: Schema.optional(NonEmptyString.annotateKey({ description: "New organization name" })),
  city: Schema.optional(Schema.NullOr(Schema.String).annotateKey({ description: "New city (null to clear)" })),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotateKey({
      description: `New description/notes in markdown, or null to clear. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_ORGANIZATION_FIELDS) ? undefined : updateOrganizationFieldMessage
      )
    )
  )
  .annotate({
    title: "UpdateOrganizationParams",
    description: `Update fields on an existing organization. Only provided fields are modified. ${updateOrganizationFieldMessage}`
  })

export type UpdateOrganizationParams = Schema.Schema.Type<typeof UpdateOrganizationParamsSchema>
assertUpdateFields<UpdateOrganizationParams>()(["identifier"], UPDATE_ORGANIZATION_FIELDS)

export const DeleteOrganizationParamsSchema = Schema.Struct({
  identifier: NonEmptyString.annotateKey({ description: "Organization ID or exact name" })
}).annotate({ title: "DeleteOrganizationParams", description: "Parameters for deleting an organization" })

export type DeleteOrganizationParams = Schema.Schema.Type<typeof DeleteOrganizationParamsSchema>

export const ListOrganizationMembersParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotateKey({ description: "Organization ID or exact name" })
}).annotate({ title: "ListOrganizationMembersParams", description: "List persons who are members of an organization" })

export type ListOrganizationMembersParams = Schema.Schema.Type<typeof ListOrganizationMembersParamsSchema>

const ListPersonOrganizationsByIdSchema = Schema.Struct({
  personId: PersonId.annotateKey({ description: "Person ID" })
})

const ListPersonOrganizationsByEmailSchema = Schema.Struct({
  email: Email.annotateKey({ description: "Person email address" })
})

export const ListPersonOrganizationsParamsSchema = Schema.Union([
  ListPersonOrganizationsByIdSchema,
  ListPersonOrganizationsByEmailSchema
]).annotate({
  title: "ListPersonOrganizationsParams",
  description: "List organizations a person is a member of (provide personId or email)"
})

export type ListPersonOrganizationsParams = Schema.Schema.Type<typeof ListPersonOrganizationsParamsSchema>

export { addOrganizationChannelParamsJsonSchema, AddOrganizationChannelParamsSchema, parseAddOrganizationChannelParams }

export const RemoveOrganizationMemberParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotateKey({ description: "Organization ID or exact name" }),
  personIdentifier: NonEmptyString.annotateKey({
    description: "Person ID or email address to unlink from the organization"
  })
}).annotate({
  title: "RemoveOrganizationMemberParams",
  description: "Parameters for removing a person from an organization"
})

export type RemoveOrganizationMemberParams = Schema.Schema.Type<typeof RemoveOrganizationMemberParamsSchema>

export type AddOrganizationChannelParams = Schema.Schema.Type<typeof AddOrganizationChannelParamsSchema>

export const AddOrganizationMemberParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotateKey({ description: "Organization ID or exact name" }),
  personIdentifier: NonEmptyString.annotateKey({ description: "Person ID or email address" })
}).annotate({
  title: "AddOrganizationMemberParams",
  description: "Parameters for adding a person as an organization member"
})

export type AddOrganizationMemberParams = Schema.Schema.Type<typeof AddOrganizationMemberParamsSchema>

const organizationDescriptions = {
  organizationId: "Organization ID or exact name",
  identifier: "Organization ID or exact name",
  personIdentifier: "Person ID or email address",
  personId: "Person ID",
  email: "Person email address",
  limit: `Maximum number of organizations to return (default: ${DEFAULT_LIMIT})`,
  name: "Organization name",
  members: "Member person IDs or emails",
  city: "New city (null to clear)",
  description: `New description/notes in markdown, or null to clear. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
}
const describeOrganizationSchema = (schema: object): object =>
  withJsonSchemaPropertyDescriptions(schema, organizationDescriptions)

export const addOrganizationMemberParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(AddOrganizationMemberParamsSchema)
)
export const listOrganizationMembersParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(ListOrganizationMembersParamsSchema)
)
export const listPersonOrganizationsParamsJsonSchema = withJsonSchemaUnionPropertyDescriptions(
  toDraft07JsonSchema(ListPersonOrganizationsParamsSchema),
  organizationDescriptions
)
export const removeOrganizationMemberParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(RemoveOrganizationMemberParamsSchema)
)
export const listOrganizationsParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(ListOrganizationsParamsSchema)
)
export const createOrganizationParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(CreateOrganizationParamsSchema)
)
export const getOrganizationParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(GetOrganizationParamsSchema)
)
export const updateOrganizationParamsJsonSchema = withAtLeastOneRequired(
  describeOrganizationSchema(toDraft07JsonSchema(UpdateOrganizationParamsSchema)),
  UPDATE_ORGANIZATION_FIELDS
)
export const deleteOrganizationParamsJsonSchema = describeOrganizationSchema(
  toDraft07JsonSchema(DeleteOrganizationParamsSchema)
)

export const parseAddOrganizationMemberParams = Schema.decodeUnknownEffect(AddOrganizationMemberParamsSchema)
export const parseListOrganizationMembersParams = Schema.decodeUnknownEffect(ListOrganizationMembersParamsSchema)
export const parseListPersonOrganizationsParams = Schema.decodeUnknownEffect(ListPersonOrganizationsParamsSchema)
export const parseRemoveOrganizationMemberParams = Schema.decodeUnknownEffect(RemoveOrganizationMemberParamsSchema)
export const parseListOrganizationsParams = Schema.decodeUnknownEffect(ListOrganizationsParamsSchema)
export const parseCreateOrganizationParams = Schema.decodeUnknownEffect(CreateOrganizationParamsSchema)
export const parseGetOrganizationParams = Schema.decodeUnknownEffect(GetOrganizationParamsSchema)
export const parseUpdateOrganizationParams = Schema.decodeUnknownEffect(UpdateOrganizationParamsSchema)
export const parseDeleteOrganizationParams = Schema.decodeUnknownEffect(DeleteOrganizationParamsSchema)
export const CreateOrganizationResultSchema = Schema.Struct({ id: OrganizationId })
export type CreateOrganizationResult = Schema.Schema.Type<typeof CreateOrganizationResultSchema>

export const GetOrganizationResultSchema = Schema.Struct({
  id: OrganizationId,
  name: NonEmptyString,
  city: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  channels: Schema.optional(Schema.Array(ContactChannelSummarySchema)),
  members: Count,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})
export type GetOrganizationResult = Schema.Schema.Type<typeof GetOrganizationResultSchema>
export const UpdateOrganizationResultSchema = Schema.Struct({ id: OrganizationId, updated: Schema.Boolean })
export type UpdateOrganizationResult = Schema.Schema.Type<typeof UpdateOrganizationResultSchema>
export const DeleteOrganizationResultSchema = Schema.Struct({ id: OrganizationId, deleted: Schema.Boolean })
export type DeleteOrganizationResult = Schema.Schema.Type<typeof DeleteOrganizationResultSchema>
export const OrganizationMemberEntrySchema = Schema.Struct({
  personId: PersonId,
  name: PersonName,
  email: Schema.optional(Email)
})
export type OrganizationMemberEntry = Schema.Schema.Type<typeof OrganizationMemberEntrySchema>
export const ListOrganizationMembersResultSchema = Schema.Struct({
  organizationId: OrganizationId,
  members: Schema.Array(OrganizationMemberEntrySchema)
})
export type ListOrganizationMembersResult = Schema.Schema.Type<typeof ListOrganizationMembersResultSchema>
export const ListPersonOrganizationsResultSchema = Schema.Struct({
  personId: PersonId,
  organizations: Schema.Array(OrganizationMembershipSummarySchema)
})
export type ListPersonOrganizationsResult = Schema.Schema.Type<typeof ListPersonOrganizationsResultSchema>
export const RemoveOrganizationMemberResultSchema = Schema.Struct({ id: OrganizationId, removed: Schema.Boolean })
export type RemoveOrganizationMemberResult = Schema.Schema.Type<typeof RemoveOrganizationMemberResultSchema>

export const ListOrganizationsResultSchema = Schema.Array(OrganizationSummarySchema)
export const MakeOrganizationCustomerResultSchema = Schema.Struct({ id: OrganizationId, applied: Schema.Boolean })
export type MakeOrganizationCustomerResult = Schema.Schema.Type<typeof MakeOrganizationCustomerResultSchema>
export const AddOrganizationMemberResultSchema = Schema.Struct({ id: OrganizationId, added: Schema.Boolean })
export type AddOrganizationMemberResult = Schema.Schema.Type<typeof AddOrganizationMemberResultSchema>
