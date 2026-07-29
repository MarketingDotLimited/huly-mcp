import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import { DriveIdentifier, DriveSummarySchema } from "./drive.js"
import {
  AccountUuid,
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_PRIVATE,
  hasAtLeastOneDefined,
  NonEmptyString,
  withAtLeastOneRequired
} from "./shared.js"
import { DEFAULT_SPACE_OWNER_ENSURE_MEMBERS, SpaceMemberIdentifier } from "./spaces.js"

export const DEFAULT_DRIVE_AUTO_JOIN = false

export const CreateDriveResultSchema = Schema.Struct({ drive: DriveSummarySchema, created: Schema.Boolean })
export type CreateDriveResult = Schema.Schema.Type<typeof CreateDriveResultSchema>

export const UpdateDriveResultSchema = Schema.Struct({ drive: DriveSummarySchema, updated: Schema.Boolean })
export type UpdateDriveResult = Schema.Schema.Type<typeof UpdateDriveResultSchema>

export const DeleteDriveResultSchema = Schema.Struct({ drive: DriveSummarySchema, deleted: Schema.Boolean })
export type DeleteDriveResult = Schema.Schema.Type<typeof DeleteDriveResultSchema>

export const DriveMemberMutationResultSchema = Schema.Struct({
  drive: DriveSummarySchema,
  members: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type DriveMemberMutationResult = Schema.Schema.Type<typeof DriveMemberMutationResultSchema>

export const SetDriveOwnersResultSchema = Schema.Struct({
  drive: DriveSummarySchema,
  owners: Schema.Array(AccountUuid),
  members: Schema.Array(AccountUuid),
  changed: Schema.Boolean
})
export type SetDriveOwnersResult = Schema.Schema.Type<typeof SetDriveOwnersResultSchema>

export const CreateDriveParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({
    description: "Drive name. If an active Drive already has this name, it is returned unchanged."
  }),
  description: Schema.optional(Schema.String.annotations({ description: "Plain-text Drive description." })),
  private: Schema.optional(
    Schema.Boolean.annotations({ description: `Whether the Drive is private. Defaults to ${DEFAULT_PRIVATE}.` })
  ),
  autoJoin: Schema.optional(
    Schema.Boolean.annotations({
      description: `Whether workspace members should auto-join the Drive. Defaults to ${DEFAULT_DRIVE_AUTO_JOIN}.`
    })
  ),
  members: Schema.optional(
    Schema.Array(SpaceMemberIdentifier).annotations({
      description:
        "Initial Drive members. Each entry may be an account UUID, exact email address, or exact person name. When omitted, the caller is added."
    })
  ),
  owners: Schema.optional(
    Schema.Array(SpaceMemberIdentifier).annotations({
      description:
        "Initial Drive owners. Each entry may be an account UUID, exact email address, or exact person name. When omitted, the caller is the owner."
    })
  )
})
export type CreateDriveParams = Schema.Schema.Type<typeof CreateDriveParamsSchema>

export const UPDATE_DRIVE_FIELDS = ["name", "description", "private", "archived", "autoJoin"] as const

export const UpdateDriveParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  name: Schema.optional(NonEmptyString.annotations({ description: "New Drive name." })),
  description: Schema.optional(clearableText("New plain-text Drive description.")),
  private: Schema.optional(Schema.Boolean.annotations({ description: "Whether the Drive is private." })),
  archived: Schema.optional(Schema.Boolean.annotations({ description: "Whether the Drive is archived." })),
  autoJoin: Schema.optional(
    Schema.Boolean.annotations({ description: "Whether workspace members should auto-join the Drive." })
  )
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_DRIVE_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_DRIVE_FIELDS)
  )
)
export type UpdateDriveParams = Schema.Schema.Type<typeof UpdateDriveParamsSchema>
assertUpdateFields<UpdateDriveParams>()(["drive"], UPDATE_DRIVE_FIELDS)

export const DeleteDriveParamsSchema = Schema.Struct({ drive: DriveIdentifier })
export type DeleteDriveParams = Schema.Schema.Type<typeof DeleteDriveParamsSchema>

export const DriveMemberMutationParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  members: Schema.Array(SpaceMemberIdentifier)
    .pipe(Schema.minItems(1))
    .annotations({
      description:
        "Members to add or remove. Each entry may be an account UUID, exact email address, or exact person name."
    })
})
export type DriveMemberMutationParams = Schema.Schema.Type<typeof DriveMemberMutationParamsSchema>

export const SetDriveOwnersParamsSchema = Schema.Struct({
  drive: DriveIdentifier,
  owners: Schema.Array(SpaceMemberIdentifier).annotations({
    description:
      "Replacement Drive owner list. Each entry may be an account UUID, exact email address, or exact person name. Pass [] to clear owners."
  }),
  ensureMembers: Schema.optional(
    Schema.Boolean.annotations({
      description: `Also add each owner to Drive members. Defaults to ${DEFAULT_SPACE_OWNER_ENSURE_MEMBERS}.`
    })
  )
})
export type SetDriveOwnersParams = Schema.Schema.Type<typeof SetDriveOwnersParamsSchema>

export const createDriveParamsJsonSchema = JSONSchema.make(CreateDriveParamsSchema)
export const updateDriveParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateDriveParamsSchema),
  UPDATE_DRIVE_FIELDS
)
export const deleteDriveParamsJsonSchema = JSONSchema.make(DeleteDriveParamsSchema)
export const driveMemberMutationParamsJsonSchema = JSONSchema.make(DriveMemberMutationParamsSchema)
export const setDriveOwnersParamsJsonSchema = JSONSchema.make(SetDriveOwnersParamsSchema)

export const parseCreateDriveParams = Schema.decodeUnknown(CreateDriveParamsSchema)
export const parseUpdateDriveParams = Schema.decodeUnknown(UpdateDriveParamsSchema)
export const parseDeleteDriveParams = Schema.decodeUnknown(DeleteDriveParamsSchema)
export const parseDriveMemberMutationParams = Schema.decodeUnknown(DriveMemberMutationParamsSchema)
export const parseSetDriveOwnersParams = Schema.decodeUnknown(SetDriveOwnersParamsSchema)
