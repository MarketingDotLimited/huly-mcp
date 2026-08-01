import { JSONSchema, Schema } from "effect"

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

export const PermissionIdentifier = NonEmptyString.pipe(Schema.brand("PermissionIdentifier")).annotations({
  description: "Exact permission _id, exact label, or exact final label segment from list_space_permissions."
})
export type PermissionIdentifier = Schema.Schema.Type<typeof PermissionIdentifier>

export const ClassCollaboratorMetadataId = NonEmptyString.pipe(Schema.brand("ClassCollaboratorMetadataId"))
export type ClassCollaboratorMetadataId = Schema.Schema.Type<typeof ClassCollaboratorMetadataId>

export const CollaboratorFieldName = NonEmptyString.pipe(Schema.brand("CollaboratorFieldName")).annotations({
  description: "Exact property name from list_huly_attributes for the selected class."
})
export type CollaboratorFieldName = Schema.Schema.Type<typeof CollaboratorFieldName>

const ConfirmSecurityWrite = Schema.Literal(true).annotations({
  description: "Must be true to acknowledge that this operation changes workspace access-control metadata."
})

const caseInsensitiveUnique = <A extends string>(values: ReadonlyArray<A>): boolean =>
  new Set(values.map((value) => value.toLocaleLowerCase())).size === values.length

const PermissionIdentifiers = Schema.Array(PermissionIdentifier)
  .pipe(Schema.filter((values) => (caseInsensitiveUnique(values) ? undefined : "Permissions must be unique")))
  .annotations({ description: "Permission IDs or exact labels; duplicates are rejected case-insensitively." })

export const PermissionTransactionSchema = Schema.Literal("create", "update", "remove", "mixin")
export type PermissionTransaction = Schema.Schema.Type<typeof PermissionTransactionSchema>

export const CreateHulyPermissionParamsSchema = Schema.Struct({
  label: NonEmptyString.annotations({ description: "Clear human-readable permission label." }),
  scope: SpacePermissionScopeSchema,
  objectClass: Schema.optionalWith(
    ModelIdentifier.annotations({
      description: "Optional object class ID, tail name, or label constrained by this permission."
    }),
    { exact: true }
  ),
  transaction: Schema.optionalWith(
    PermissionTransactionSchema.annotations({
      description: "Optional transaction kind constrained by this permission: create, update, remove, or mixin."
    }),
    { exact: true }
  ),
  forbid: Schema.optionalWith(Schema.Boolean, { exact: true }),
  description: Schema.optionalWith(NonEmptyString, { exact: true }),
  confirm: ConfirmSecurityWrite
}).annotations({ title: "CreateHulyPermissionParams" })
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
  label: Schema.optionalWith(NonEmptyString, { exact: true }),
  scope: Schema.optionalWith(SpacePermissionScopeSchema, { exact: true }),
  objectClass: Schema.optionalWith(Schema.NullOr(ModelIdentifier), { exact: true }),
  transaction: Schema.optionalWith(Schema.NullOr(PermissionTransactionSchema), { exact: true }),
  forbid: Schema.optionalWith(Schema.Boolean, { exact: true }),
  description: Schema.optionalWith(Schema.NullOr(NonEmptyString), { exact: true }),
  confirm: ConfirmSecurityWrite
})
  .pipe(
    Schema.filter((params) =>
      UPDATE_HULY_PERMISSION_FIELDS.some((field) => params[field] !== undefined)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_HULY_PERMISSION_FIELDS)
    )
  )
  .annotations({ title: "UpdateHulyPermissionParams" })
export type UpdateHulyPermissionParams = Schema.Schema.Type<typeof UpdateHulyPermissionParamsSchema>
assertUpdateFields<UpdateHulyPermissionParams>()(["permission", "confirm"], UPDATE_HULY_PERMISSION_FIELDS)

export const DeleteHulyPermissionParamsSchema = Schema.Struct({
  permission: PermissionIdentifier,
  confirm: ConfirmSecurityWrite
}).annotations({ title: "DeleteHulyPermissionParams" })
export type DeleteHulyPermissionParams = Schema.Schema.Type<typeof DeleteHulyPermissionParamsSchema>

export const CreateSpaceRoleParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotations({ description: "SpaceType _id or exact SpaceType name." }),
  name: NonEmptyString,
  permissions: PermissionIdentifiers,
  confirm: ConfirmSecurityWrite
}).annotations({ title: "CreateSpaceRoleParams" })
export type CreateSpaceRoleParams = Schema.Schema.Type<typeof CreateSpaceRoleParamsSchema>

export const SetSpaceRolePermissionsParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotations({ description: "SpaceType _id or exact SpaceType name." }),
  role: SpaceRoleIdentifier.annotations({ description: "Role _id or exact role name within the selected SpaceType." }),
  permissions: PermissionIdentifiers,
  confirm: ConfirmSecurityWrite
}).annotations({ title: "SetSpaceRolePermissionsParams" })
export type SetSpaceRolePermissionsParams = Schema.Schema.Type<typeof SetSpaceRolePermissionsParamsSchema>

export const GetClassCollaboratorMetadataParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotations({ description: "Class ID, tail name, or label." })
}).annotations({ title: "GetClassCollaboratorMetadataParams" })
export type GetClassCollaboratorMetadataParams = Schema.Schema.Type<typeof GetClassCollaboratorMetadataParamsSchema>

const CollaboratorFields = Schema.Array(CollaboratorFieldName).pipe(
  Schema.minItems(1),
  Schema.filter((fields) => (caseInsensitiveUnique(fields) ? undefined : "Collaborator fields must be unique"))
)

export const CollaboratorFieldSelectionSchema = Schema.Union(
  Schema.Struct({ mode: Schema.Literal("all") }),
  Schema.Struct({ mode: Schema.Literal("none") }),
  Schema.Struct({ mode: Schema.Literal("fields"), fields: CollaboratorFields })
)
export type CollaboratorFieldSelection = Schema.Schema.Type<typeof CollaboratorFieldSelectionSchema>

export const SetClassCollaboratorMetadataParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotations({ description: "Class ID, tail name, or label." }),
  fieldSelection: CollaboratorFieldSelectionSchema,
  provideSecurity: Schema.optionalWith(Schema.Boolean, { exact: true }),
  provideAttachedSecurity: Schema.optionalWith(Schema.Boolean, { exact: true }),
  confirm: ConfirmSecurityWrite
}).annotations({ title: "SetClassCollaboratorMetadataParams" })
export type SetClassCollaboratorMetadataParams = Schema.Schema.Type<typeof SetClassCollaboratorMetadataParamsSchema>

export const DeleteClassCollaboratorMetadataParamsSchema = Schema.Struct({
  class: ModelIdentifier.annotations({ description: "Class ID, tail name, or label." }),
  confirm: ConfirmSecurityWrite
}).annotations({ title: "DeleteClassCollaboratorMetadataParams" })
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

export const GetClassCollaboratorMetadataResultSchema = Schema.Union(
  ClassIdentitySchema.pipe(Schema.extend(Schema.Struct({ configured: Schema.Literal(false) }))),
  ClassCollaboratorMetadataSchema.pipe(Schema.extend(Schema.Struct({ configured: Schema.Literal(true) })))
)
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

export const createHulyPermissionParamsJsonSchema = JSONSchema.make(CreateHulyPermissionParamsSchema)
export const updateHulyPermissionParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateHulyPermissionParamsSchema),
  UPDATE_HULY_PERMISSION_FIELDS
)
export const deleteHulyPermissionParamsJsonSchema = JSONSchema.make(DeleteHulyPermissionParamsSchema)
export const createSpaceRoleParamsJsonSchema = JSONSchema.make(CreateSpaceRoleParamsSchema)
export const setSpaceRolePermissionsParamsJsonSchema = JSONSchema.make(SetSpaceRolePermissionsParamsSchema)
export const getClassCollaboratorMetadataParamsJsonSchema = JSONSchema.make(GetClassCollaboratorMetadataParamsSchema)
export const setClassCollaboratorMetadataParamsJsonSchema = JSONSchema.make(SetClassCollaboratorMetadataParamsSchema)
export const deleteClassCollaboratorMetadataParamsJsonSchema = JSONSchema.make(
  DeleteClassCollaboratorMetadataParamsSchema
)

const strictParseOptions = { onExcessProperty: "error" } as const
export const parseCreateHulyPermissionParams = Schema.decodeUnknown(
  CreateHulyPermissionParamsSchema,
  strictParseOptions
)
export const parseUpdateHulyPermissionParams = Schema.decodeUnknown(
  UpdateHulyPermissionParamsSchema,
  strictParseOptions
)
export const parseDeleteHulyPermissionParams = Schema.decodeUnknown(
  DeleteHulyPermissionParamsSchema,
  strictParseOptions
)
export const parseCreateSpaceRoleParams = Schema.decodeUnknown(CreateSpaceRoleParamsSchema, strictParseOptions)
export const parseSetSpaceRolePermissionsParams = Schema.decodeUnknown(
  SetSpaceRolePermissionsParamsSchema,
  strictParseOptions
)
export const parseGetClassCollaboratorMetadataParams = Schema.decodeUnknown(
  GetClassCollaboratorMetadataParamsSchema,
  strictParseOptions
)
export const parseSetClassCollaboratorMetadataParams = Schema.decodeUnknown(
  SetClassCollaboratorMetadataParamsSchema,
  strictParseOptions
)
export const parseDeleteClassCollaboratorMetadataParams = Schema.decodeUnknown(
  DeleteClassCollaboratorMetadataParamsSchema,
  strictParseOptions
)
