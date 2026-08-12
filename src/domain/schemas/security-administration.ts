import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  NonEmptyString,
  ObjectClassName,
  PermissionId,
  SpaceTypeIdentifier,
  withAtLeastOneRequired
} from "./shared.js"
import { ModelIdentifier } from "./model-administration.js"
import {
  SpacePermissionScopeSchema,
  SpacePermissionSummarySchema,
  SpaceRoleIdentifier,
  SpaceRoleSummarySchema
} from "./spaces.js"

export const PermissionIdentifier = NonEmptyString.pipe(Schema.brand("PermissionIdentifier")).annotate({
  description: "Exact permission _id, exact label, or exact final label segment from list_space_permissions."
})
export type PermissionIdentifier = Schema.Schema.Type<typeof PermissionIdentifier>

export const ClassCollaboratorMetadataId = NonEmptyString.pipe(Schema.brand("ClassCollaboratorMetadataId"))
export type ClassCollaboratorMetadataId = Schema.Schema.Type<typeof ClassCollaboratorMetadataId>

export const CollaboratorFieldName = NonEmptyString.pipe(Schema.brand("CollaboratorFieldName")).annotate({
  description: "Exact property name from list_huly_attributes for the selected class."
})
export type CollaboratorFieldName = Schema.Schema.Type<typeof CollaboratorFieldName>

const ConfirmSecurityWrite = Schema.Literal(true).annotate({
  description: "Must be true to acknowledge that this operation changes workspace access-control metadata."
})

const caseInsensitiveUnique = <A extends string>(values: ReadonlyArray<A>): boolean =>
  new Set(values.map((value) => value.toLocaleLowerCase())).size === values.length

const PermissionIdentifiers = Schema.Array(PermissionIdentifier)
  .check(Schema.makeFilter((values) => (caseInsensitiveUnique(values) ? undefined : "Permissions must be unique")))
  .annotate({ description: "Permission IDs or exact labels; duplicates are rejected case-insensitively." })

export const PermissionTransactionSchema = Schema.Literals(["create", "update", "remove", "mixin"])
export type PermissionTransaction = Schema.Schema.Type<typeof PermissionTransactionSchema>

export const CreateHulyPermissionParamsSchema = Schema.Struct({
  label: NonEmptyString.annotate({ description: "Clear human-readable permission label." }),
  scope: SpacePermissionScopeSchema,
  objectClass: Schema.optionalKey(
    ModelIdentifier.annotate({
      description: "Optional object class ID, tail name, or label constrained by this permission."
    })
  ),
  transaction: Schema.optionalKey(
    PermissionTransactionSchema.annotate({
      description: "Optional transaction kind constrained by this permission: create, update, remove, or mixin."
    })
  ),
  forbid: Schema.optionalKey(Schema.Boolean),
  description: Schema.optionalKey(NonEmptyString),
  confirm: ConfirmSecurityWrite
}).annotate({ title: "CreateHulyPermissionParams" })
export type CreateHulyPermissionParams = Schema.Schema.Type<typeof CreateHulyPermissionParamsSchema>

export const UPDATE_HULY_PERMISSION_FIELDS = [
  "label",
  "scope",
  "objectClass",
  "transaction",
  "forbid",
  "description"
] as const
export const UpdateHulyPermissionParamsSchema = Schema.Struct({
  permission: PermissionIdentifier,
  label: Schema.optionalKey(NonEmptyString),
  scope: Schema.optionalKey(SpacePermissionScopeSchema),
  objectClass: Schema.optionalKey(Schema.NullOr(ModelIdentifier)),
  transaction: Schema.optionalKey(Schema.NullOr(PermissionTransactionSchema)),
  forbid: Schema.optionalKey(Schema.Boolean),
  description: Schema.optionalKey(Schema.NullOr(NonEmptyString)),
  confirm: ConfirmSecurityWrite
})
  .check(
    Schema.makeFilter((params) =>
      UPDATE_HULY_PERMISSION_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_HULY_PERMISSION_FIELDS)
    )
  )
  .annotate({ title: "UpdateHulyPermissionParams" })
export type UpdateHulyPermissionParams = Schema.Schema.Type<typeof UpdateHulyPermissionParamsSchema>
assertUpdateFields<UpdateHulyPermissionParams>()(["permission", "confirm"], UPDATE_HULY_PERMISSION_FIELDS)

export const DeleteHulyPermissionParamsSchema = Schema.Struct({
  permission: PermissionIdentifier,
  confirm: ConfirmSecurityWrite
}).annotate({ title: "DeleteHulyPermissionParams" })
export type DeleteHulyPermissionParams = Schema.Schema.Type<typeof DeleteHulyPermissionParamsSchema>

export const CreateSpaceRoleParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotate({ description: "SpaceType _id or exact SpaceType name." }),
  name: NonEmptyString,
  permissions: PermissionIdentifiers,
  confirm: ConfirmSecurityWrite
}).annotate({ title: "CreateSpaceRoleParams" })
export type CreateSpaceRoleParams = Schema.Schema.Type<typeof CreateSpaceRoleParamsSchema>

export const SetSpaceRolePermissionsParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotate({ description: "SpaceType _id or exact SpaceType name." }),
  role: SpaceRoleIdentifier.annotate({ description: "Role _id or exact role name within the selected SpaceType." }),
  permissions: PermissionIdentifiers,
  confirm: ConfirmSecurityWrite
}).annotate({ title: "SetSpaceRolePermissionsParams" })
export type SetSpaceRolePermissionsParams = Schema.Schema.Type<typeof SetSpaceRolePermissionsParamsSchema>

export const GetClassCollaboratorMetadataParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotate({ description: "Class ID, tail name, or label." })
}).annotate({ title: "GetClassCollaboratorMetadataParams" })
export type GetClassCollaboratorMetadataParams = Schema.Schema.Type<typeof GetClassCollaboratorMetadataParamsSchema>

const CollaboratorFields = Schema.Array(CollaboratorFieldName).check(
  Schema.isNonEmpty(),
  Schema.makeFilter((fields) => (caseInsensitiveUnique(fields) ? undefined : "Collaborator fields must be unique"))
)

export const CollaboratorFieldSelectionSchema = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("all") }),
  Schema.Struct({ mode: Schema.Literal("none") }),
  Schema.Struct({ mode: Schema.Literal("fields"), fields: CollaboratorFields })
])
export type CollaboratorFieldSelection = Schema.Schema.Type<typeof CollaboratorFieldSelectionSchema>

export const SetClassCollaboratorMetadataParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotate({ description: "Class ID, tail name, or label." }),
  fieldSelection: CollaboratorFieldSelectionSchema,
  provideSecurity: Schema.optionalKey(
    Schema.Boolean.annotate({ description: "Propagate security through collaborator fields; defaults to false." })
  ),
  provideAttachedSecurity: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Propagate security through attached collaborator documents; defaults to false."
    })
  ),
  confirm: ConfirmSecurityWrite
}).annotate({ title: "SetClassCollaboratorMetadataParams" })
export type SetClassCollaboratorMetadataParams = Schema.Schema.Type<typeof SetClassCollaboratorMetadataParamsSchema>

export const DeleteClassCollaboratorMetadataParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotate({ description: "Class ID, tail name, or label." }),
  confirm: ConfirmSecurityWrite
}).annotate({ title: "DeleteClassCollaboratorMetadataParams" })
export type DeleteClassCollaboratorMetadataParams = Schema.Schema.Type<
  typeof DeleteClassCollaboratorMetadataParamsSchema
>

const ClassIdentitySchema = Schema.Struct({ classId: ObjectClassName, classLabel: NonEmptyString })
export const ClassCollaboratorMetadataSchema = Schema.Struct({
  metadataId: ClassCollaboratorMetadataId,
  classId: ObjectClassName,
  classLabel: NonEmptyString,
  fieldSelection: CollaboratorFieldSelectionSchema,
  provideSecurity: Schema.Boolean,
  provideAttachedSecurity: Schema.Boolean
})
export type ClassCollaboratorMetadata = Schema.Schema.Type<typeof ClassCollaboratorMetadataSchema>

export const GetClassCollaboratorMetadataResultSchema = Schema.Union([
  ClassIdentitySchema.pipe(Schema.fieldsAssign({ configured: Schema.Literal(false) })),
  ClassCollaboratorMetadataSchema.pipe(Schema.fieldsAssign({ configured: Schema.Literal(true) }))
])
export type GetClassCollaboratorMetadataResult = Schema.Schema.Type<typeof GetClassCollaboratorMetadataResultSchema>

export const CreateHulyPermissionResultSchema = Schema.Struct({
  permission: SpacePermissionSummarySchema,
  created: Schema.Boolean
})
export const UpdateHulyPermissionResultSchema = Schema.Struct({
  permission: SpacePermissionSummarySchema,
  updated: Schema.Boolean
})
export const DeleteHulyPermissionResultSchema = Schema.Struct({ permissionId: PermissionId, deleted: Schema.Boolean })
export const CreateSpaceRoleResultSchema = Schema.Struct({ role: SpaceRoleSummarySchema, created: Schema.Boolean })
export const SetSpaceRolePermissionsResultSchema = Schema.Struct({
  role: SpaceRoleSummarySchema,
  updated: Schema.Boolean
})
export const SetClassCollaboratorMetadataResultSchema = Schema.Struct({
  metadata: ClassCollaboratorMetadataSchema,
  created: Schema.Boolean
})
export const DeleteClassCollaboratorMetadataResultSchema = Schema.Struct({
  metadataId: ClassCollaboratorMetadataId,
  classId: ObjectClassName,
  deleted: Schema.Boolean
})

export type CreateHulyPermissionResult = Schema.Schema.Type<typeof CreateHulyPermissionResultSchema>
export type UpdateHulyPermissionResult = Schema.Schema.Type<typeof UpdateHulyPermissionResultSchema>
export type DeleteHulyPermissionResult = Schema.Schema.Type<typeof DeleteHulyPermissionResultSchema>
export type CreateSpaceRoleResult = Schema.Schema.Type<typeof CreateSpaceRoleResultSchema>
export type SetSpaceRolePermissionsResult = Schema.Schema.Type<typeof SetSpaceRolePermissionsResultSchema>
export type SetClassCollaboratorMetadataResult = Schema.Schema.Type<typeof SetClassCollaboratorMetadataResultSchema>
export type DeleteClassCollaboratorMetadataResult = Schema.Schema.Type<
  typeof DeleteClassCollaboratorMetadataResultSchema
>

const securityWriteConfirmationDescription =
  "Must be true to acknowledge that this operation changes workspace access-control metadata."

export const createHulyPermissionParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateHulyPermissionParamsSchema),
  {
    label: "Clear human-readable permission label.",
    scope: "Permission scope: space or workspace.",
    objectClass: "Optional object class ID, tail name, or label constrained by this permission.",
    transaction: "Optional constrained transaction kind: create, update, remove, or mixin.",
    forbid: "Whether the permission forbids rather than grants the selected action.",
    description: "Optional human-readable permission description.",
    confirm: securityWriteConfirmationDescription
  }
)
export const updateHulyPermissionParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdateHulyPermissionParamsSchema), {
    permission: "Permission ID, exact label, or exact final label segment.",
    label: "New human-readable permission label.",
    scope: "New permission scope: space or workspace.",
    objectClass: "New constrained object class; null clears the constraint.",
    transaction: "New constrained transaction kind; null clears the constraint.",
    forbid: "New forbid flag.",
    description: "New permission description; null clears it.",
    confirm: securityWriteConfirmationDescription
  }),
  UPDATE_HULY_PERMISSION_FIELDS
)
export const deleteHulyPermissionParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteHulyPermissionParamsSchema),
  {
    permission: "Permission ID, exact label, or exact final label segment.",
    confirm: securityWriteConfirmationDescription
  }
)
export const createSpaceRoleParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreateSpaceRoleParamsSchema),
  {
    spaceType: "SpaceType ID or exact SpaceType name.",
    name: "Unique role name within the selected SpaceType.",
    permissions: "Permission IDs or exact labels; duplicates are rejected case-insensitively.",
    confirm: securityWriteConfirmationDescription
  }
)
export const setSpaceRolePermissionsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SetSpaceRolePermissionsParamsSchema),
  {
    spaceType: "SpaceType ID or exact SpaceType name.",
    role: "Role ID or exact role name within the selected SpaceType.",
    permissions: "Replacement permission IDs or exact labels; duplicates are rejected case-insensitively.",
    confirm: securityWriteConfirmationDescription
  }
)
export const getClassCollaboratorMetadataParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetClassCollaboratorMetadataParamsSchema),
  { class: "Class ID, tail name, or label." }
)
export const setClassCollaboratorMetadataParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SetClassCollaboratorMetadataParamsSchema),
  {
    class: "Class ID, tail name, or label.",
    fieldSelection: "Collaborator field selection: all, none, or an explicit non-empty fields list.",
    provideSecurity: "Propagate security through collaborator fields; defaults to false.",
    provideAttachedSecurity: "Propagate security through attached collaborator documents; defaults to false.",
    confirm: securityWriteConfirmationDescription
  }
)
export const deleteClassCollaboratorMetadataParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeleteClassCollaboratorMetadataParamsSchema),
  { class: "Class ID, tail name, or label.", confirm: securityWriteConfirmationDescription }
)

const strictParseOptions = { onExcessProperty: "error" } as const
export const parseCreateHulyPermissionParams = Schema.decodeUnknownEffect(
  CreateHulyPermissionParamsSchema,
  strictParseOptions
)
export const parseUpdateHulyPermissionParams = Schema.decodeUnknownEffect(
  UpdateHulyPermissionParamsSchema,
  strictParseOptions
)
export const parseDeleteHulyPermissionParams = Schema.decodeUnknownEffect(
  DeleteHulyPermissionParamsSchema,
  strictParseOptions
)
export const parseCreateSpaceRoleParams = Schema.decodeUnknownEffect(CreateSpaceRoleParamsSchema, strictParseOptions)
export const parseSetSpaceRolePermissionsParams = Schema.decodeUnknownEffect(
  SetSpaceRolePermissionsParamsSchema,
  strictParseOptions
)
export const parseGetClassCollaboratorMetadataParams = Schema.decodeUnknownEffect(
  GetClassCollaboratorMetadataParamsSchema,
  strictParseOptions
)
export const parseSetClassCollaboratorMetadataParams = Schema.decodeUnknownEffect(
  SetClassCollaboratorMetadataParamsSchema,
  strictParseOptions
)
export const parseDeleteClassCollaboratorMetadataParams = Schema.decodeUnknownEffect(
  DeleteClassCollaboratorMetadataParamsSchema,
  strictParseOptions
)
