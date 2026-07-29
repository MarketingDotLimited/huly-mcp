import type { AccountUuid as HulyAccountUuid, Data, DocumentUpdate, Ref, Space, SpaceType } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateDriveParams,
  CreateDriveResult,
  DeleteDriveParams,
  DeleteDriveResult,
  DriveMemberMutationParams,
  DriveMemberMutationResult,
  SetDriveOwnersParams,
  SetDriveOwnersResult,
  UpdateDriveParams,
  UpdateDriveResult
} from "../../domain/schemas/drive-admin.js"
import { DEFAULT_DRIVE_AUTO_JOIN, UPDATE_DRIVE_FIELDS } from "../../domain/schemas/drive-admin.js"
import { AccountUuid, Count, DEFAULT_PRIVATE } from "../../domain/schemas/shared.js"
import { DEFAULT_SPACE_OWNER_ENSURE_MEMBERS } from "../../domain/schemas/spaces.js"
import { HulyClient } from "../client.js"
import { drive, type DriveSpace, type File, type Folder } from "../drive-sdk.js"
import { DriveNotEmptyError } from "../errors-drive.js"
import { core } from "../huly-plugins.js"
import { clearTextAsEmptyString } from "./clear-field-updates.js"
import { toDriveSummary } from "./drive-mappers.js"
import { resolveDrive } from "./drive-resolvers.js"
import { type DriveOperationError, driveTextOrUntitled, itemKind } from "./drive-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef } from "./sdk-boundary.js"
import {
  arraysEqual,
  mergeUniqueSortedAccountUuids,
  removeAccountUuids,
  resolveMembers,
  sortStrings
} from "./spaces-shared.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

const DRIVE_NOT_EMPTY_CHILD_SUMMARY_LIMIT = 5

type MemberListMutation = (
  currentMembers: ReadonlyArray<HulyAccountUuid>,
  resolvedMembers: ReadonlyArray<HulyAccountUuid>
) => ReadonlyArray<HulyAccountUuid>

type UpdateDriveField = (typeof UPDATE_DRIVE_FIELDS)[number]

type UpdateDriveEntries = {
  readonly [Field in UpdateDriveField]: DirectUpdateEntry<UpdateDriveField, DocumentUpdate<DriveSpace>, Field>
}

const currentAccountMemberList = (client: HulyClient["Type"]): ReadonlyArray<HulyAccountUuid> => [
  client.getAccountUuid()
]

const resolveInitialMembers = (
  client: HulyClient["Type"],
  params: CreateDriveParams
): Effect.Effect<
  { readonly members: ReadonlyArray<HulyAccountUuid>; readonly owners: ReadonlyArray<HulyAccountUuid> },
  DriveOperationError
> =>
  Effect.gen(function* () {
    const owners =
      params.owners === undefined ? currentAccountMemberList(client) : yield* resolveMembers(client, params.owners)
    const baseMembers =
      params.members === undefined ? currentAccountMemberList(client) : yield* resolveMembers(client, params.members)

    return { members: mergeUniqueSortedAccountUuids(baseMembers, owners), owners: sortStrings(owners) }
  })

const buildUpdateDriveOperations = (params: UpdateDriveParams): DocumentUpdate<DriveSpace> => {
  const updateEntries = {
    name: params.name === undefined ? {} : { name: params.name },
    description: params.description === undefined ? {} : { description: clearTextAsEmptyString(params.description) },
    private: params.private === undefined ? {} : { private: params.private },
    archived: params.archived === undefined ? {} : { archived: params.archived },
    autoJoin: params.autoJoin === undefined ? {} : { autoJoin: params.autoJoin }
  } satisfies UpdateDriveEntries

  return mergeUpdateEntries(Object.values(updateEntries))
}

const updateDriveDoc = (
  client: HulyClient["Type"],
  driveSpace: DriveSpace,
  operations: DocumentUpdate<DriveSpace>
): Effect.Effect<void, DriveOperationError> =>
  client.updateDoc(drive.class.Drive, core.space.Space, driveSpace._id, operations).pipe(Effect.asVoid)

const withDriveUpdates = (driveSpace: DriveSpace, operations: DocumentUpdate<DriveSpace>): DriveSpace => ({
  ...driveSpace,
  ...operations
})

const mutateDriveMembers = (
  params: DriveMemberMutationParams,
  mutateMembers: MemberListMutation
): Effect.Effect<DriveMemberMutationResult, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const resolvedMembers = yield* resolveMembers(client, params.members)
    const nextMembers = mutateMembers(driveSpace.members, resolvedMembers).map(toAccountUuid)
    const changed = !arraysEqual(sortStrings(driveSpace.members), nextMembers)
    const updatedDrive = changed ? { ...driveSpace, members: nextMembers } : driveSpace

    if (changed) {
      yield* updateDriveDoc(client, driveSpace, { members: nextMembers })
    }

    return {
      drive: toDriveSummary(client, updatedDrive),
      members: nextMembers.map((member) => AccountUuid.make(member)),
      changed
    }
  })

const driveChildSummary = (item: Folder | File) => ({
  id: driveTextOrUntitled(item._id),
  title: driveTextOrUntitled(item.title),
  kind: itemKind(item)
})

const findDriveChildren = (
  client: HulyClient["Type"],
  driveSpace: DriveSpace
): Effect.Effect<
  { readonly folders: ReadonlyArray<Folder>; readonly files: ReadonlyArray<File> },
  DriveOperationError
> =>
  Effect.gen(function* () {
    const folders = yield* client.findAll<Folder>(drive.class.Folder, hulyQuery<Folder>({ space: driveSpace._id }))
    const files = yield* client.findAll<File>(drive.class.File, hulyQuery<File>({ space: driveSpace._id }))
    return { folders, files }
  })

export const createDrive = (
  params: CreateDriveParams
): Effect.Effect<CreateDriveResult, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const existing = yield* client.findOne<DriveSpace>(
      drive.class.Drive,
      hulyQuery<DriveSpace>({ name: params.name, archived: false })
    )

    if (existing !== undefined) {
      return { drive: toDriveSummary(client, existing), created: false }
    }

    const initial = yield* resolveInitialMembers(client, params)
    const driveId: Ref<DriveSpace> = generateId()
    const driveData: Data<DriveSpace> = {
      name: params.name,
      description: params.description ?? "",
      private: params.private ?? DEFAULT_PRIVATE,
      archived: false,
      members: initial.members.map(toAccountUuid),
      owners: initial.owners.map(toAccountUuid),
      type: toRef<SpaceType>(drive.spaceType.DefaultDrive),
      autoJoin: params.autoJoin ?? DEFAULT_DRIVE_AUTO_JOIN
    }

    yield* client.createDoc(drive.class.Drive, core.space.Space, driveData, driveId)

    return {
      drive: toDriveSummary(client, {
        _id: driveId,
        _class: drive.class.Drive,
        space: toRef<Space>(core.space.Space),
        modifiedBy: client.getPrimarySocialId(),
        modifiedOn: 0,
        createdBy: client.getPrimarySocialId(),
        createdOn: 0,
        ...driveData
      }),
      created: true
    }
  })

export const updateDrive = (
  params: UpdateDriveParams
): Effect.Effect<UpdateDriveResult, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    yield* requireUpdateFields("update_drive", params, UPDATE_DRIVE_FIELDS)
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const operations = buildUpdateDriveOperations(params)

    yield* updateDriveDoc(client, driveSpace, operations)
    return { drive: toDriveSummary(client, withDriveUpdates(driveSpace, operations)), updated: true }
  })

export const deleteDrive = (
  params: DeleteDriveParams
): Effect.Effect<DeleteDriveResult, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const children = yield* findDriveChildren(client, driveSpace)
    const childItems = [...children.folders, ...children.files]

    if (childItems.length > 0) {
      return yield* Effect.fail(
        new DriveNotEmptyError({
          drive: params.drive,
          childCount: Count.make(childItems.length),
          children: childItems.slice(0, DRIVE_NOT_EMPTY_CHILD_SUMMARY_LIMIT).map(driveChildSummary)
        })
      )
    }

    yield* client.removeDoc(drive.class.Drive, core.space.Space, driveSpace._id)
    return { drive: toDriveSummary(client, driveSpace), deleted: true }
  })

export const addDriveMembers = (
  params: DriveMemberMutationParams
): Effect.Effect<DriveMemberMutationResult, DriveOperationError, HulyClient> =>
  mutateDriveMembers(params, mergeUniqueSortedAccountUuids)

export const removeDriveMembers = (
  params: DriveMemberMutationParams
): Effect.Effect<DriveMemberMutationResult, DriveOperationError, HulyClient> =>
  mutateDriveMembers(params, removeAccountUuids)

export const setDriveOwners = (
  params: SetDriveOwnersParams
): Effect.Effect<SetDriveOwnersResult, DriveOperationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const driveSpace = yield* resolveDrive(client, params.drive)
    const owners = (yield* resolveMembers(client, params.owners)).map(toAccountUuid)
    const ensureMembers = params.ensureMembers ?? DEFAULT_SPACE_OWNER_ENSURE_MEMBERS
    const nextMembers = ensureMembers
      ? mergeUniqueSortedAccountUuids(driveSpace.members, owners).map(toAccountUuid)
      : sortStrings(driveSpace.members).map(toAccountUuid)
    const currentOwners = sortStrings(driveSpace.owners ?? []).map(toAccountUuid)
    const changedOwners = !arraysEqual(currentOwners, owners)
    const changedMembers = !arraysEqual(sortStrings(driveSpace.members), nextMembers)
    const updatedDrive: DriveSpace = { ...driveSpace, owners, members: nextMembers }

    if (changedOwners || changedMembers) {
      yield* updateDriveDoc(client, driveSpace, { owners, ...(changedMembers ? { members: nextMembers } : {}) })
    }

    return {
      drive: toDriveSummary(client, updatedDrive),
      owners: owners.map((owner) => AccountUuid.make(owner)),
      members: nextMembers.map((member) => AccountUuid.make(member)),
      changed: changedOwners || changedMembers
    }
  })
