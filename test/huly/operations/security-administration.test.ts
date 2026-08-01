import { describe, it } from "@effect/vitest"
import type {
  AnyAttribute,
  Class,
  ClassCollaborators,
  Doc,
  Permission,
  Role,
  SpaceType,
  SpaceTypeDescriptor
} from "@hcengineering/core"
import { ClassifierKind, toFindResult } from "@hcengineering/core"
import { Effect, Exit, Layer } from "effect"
import { expect } from "vitest"

import {
  CollaboratorFieldName,
  PermissionIdentifier,
  type PermissionTransaction,
  type CreateSpaceRoleParams,
  type SetSpaceRolePermissionsParams,
  type SetClassCollaboratorMetadataParams
} from "../../../src/domain/schemas/security-administration.js"
import { ModelIdentifier } from "../../../src/domain/schemas/model-administration.js"
import { NonEmptyString, SpaceTypeIdentifier } from "../../../src/domain/schemas/shared.js"
import { SpaceRoleIdentifier } from "../../../src/domain/schemas/spaces.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { core } from "../../../src/huly/huly-plugins.js"
import {
  createHulyPermission,
  deleteHulyPermission,
  updateHulyPermission
} from "../../../src/huly/operations/security-administration.js"
import {
  deleteClassCollaboratorMetadata,
  getClassCollaboratorMetadata,
  setClassCollaboratorMetadata
} from "../../../src/huly/operations/class-collaborator-metadata.js"
import { createSpaceRole, setSpaceRolePermissions } from "../../../src/huly/operations/security-role-writes.js"
import { toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

const personId = corePersonId("person-security-admin")
type DynamicClassDoc = Doc & Readonly<Record<string, unknown>>
type ClassCollaboratorRecord = ClassCollaborators<DynamicClassDoc>
// Brands are erased at runtime; SDK IntlString is a string and has no public fixture constructor.
const intlString = (value: string): Permission["label"] => value as Permission["label"]
// Brands are erased at runtime; SDK Asset is a string and has no public fixture constructor.
const asset = (value: string): SpaceTypeDescriptor["icon"] => value as SpaceTypeDescriptor["icon"]

const makePermission = (overrides: Partial<Permission> = {}): Permission => ({
  _id: toRef<Permission>("custom-permission"),
  _class: core.class.Permission,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  label: intlString("embedded:embedded:Review training"),
  scope: "space",
  ...overrides
})

const makeRole = (permission: Permission): Role => ({
  _id: toRef<Role>("role-reviewer"),
  _class: core.class.Role,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  attachedTo: toRef("space-type-training"),
  attachedToClass: core.class.SpaceType,
  collection: "roles",
  name: "Reviewer",
  permissions: [permission._id]
})

const makeSpaceType = (overrides: Partial<SpaceType> = {}): SpaceType => ({
  _id: toRef<SpaceType>("space-type-training"),
  _class: core.class.SpaceType,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  name: "Default Trainings",
  descriptor: toRef<SpaceTypeDescriptor>("descriptor-training"),
  targetClass: toClassRef("training:mixin:TrainingsTypeData"),
  roles: 0,
  ...overrides
})

const makeClass = (overrides: Partial<Class<Doc>> = {}): Class<Doc> => ({
  _id: toRef<Class<Doc>>("tracker:class:Issue"),
  _class: toClassRef<Class<Doc>>(core.class.Class),
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  label: intlString("tracker:string:Issue"),
  kind: ClassifierKind.CLASS,
  ...overrides
})

const makeAttribute = (name: string, owner: Class<Doc> = makeClass()): AnyAttribute => ({
  _id: toRef<AnyAttribute>(`attribute-${name}`),
  _class: core.class.Attribute,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  name,
  label: intlString(`embedded:embedded:${name}`),
  attributeOf: owner._id,
  type: { _class: core.class.TypeString, label: intlString("core:string:String") }
})

const makeCollaboratorMetadata = (overrides: Partial<ClassCollaboratorRecord> = {}): ClassCollaboratorRecord => ({
  _id: toRef<ClassCollaboratorRecord>("class-collaborators-issue"),
  _class: core.class.ClassCollaborators,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  attachedTo: makeClass()._id,
  fields: ["assignee"],
  provideSecurity: true,
  ...overrides
})

interface PermissionHarnessConfig {
  readonly permissions?: ReadonlyArray<Permission>
  readonly roles?: ReadonlyArray<Role>
  readonly spaceTypes?: ReadonlyArray<SpaceType>
  readonly descriptors?: ReadonlyArray<SpaceTypeDescriptor>
  readonly classes?: ReadonlyArray<Doc>
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly collaboratorMetadata?: ReadonlyArray<ClassCollaboratorRecord>
  readonly failCreateDoc?: boolean
  readonly omitRemoveCollection?: boolean
  readonly omitUpdateCollection?: boolean
}

interface CapturedWrite {
  readonly action?: "addCollection" | "createDoc" | "removeCollection" | "updateCollection"
  readonly attributes?: unknown
  readonly id?: unknown
  readonly operations?: unknown
}

const permissionLayer = (
  config: PermissionHarnessConfig,
  writes: Array<CapturedWrite>,
  diagnostics: Diagnostics["Type"] = { warnAgent: () => Effect.void, trail: () => Effect.void }
) => {
  // The SDK port methods are generic, while this heterogeneous fixture dispatches by the exact runtime class token;
  // each adapter cast is safe because every branch returns documents for that token and no generic fixture API exists.
  const findAll: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === core.class.Permission) return Effect.succeed(toFindResult([...(config.permissions ?? [])]))
    if (_class === core.class.Role) return Effect.succeed(toFindResult([...(config.roles ?? [])]))
    if (_class === core.class.SpaceType) return Effect.succeed(toFindResult([...(config.spaceTypes ?? [])]))
    if (_class === core.class.SpaceTypeDescriptor) {
      return Effect.succeed(toFindResult([...(config.descriptors ?? [])]))
    }
    if (_class === core.class.Attribute) return Effect.succeed(toFindResult([...(config.attributes ?? [])]))
    if (_class === core.class.ClassCollaborators) {
      return Effect.succeed(toFindResult([...(config.collaboratorMetadata ?? [])]))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]
  const findAllInModel: HulyClientOperations["findAllInModel"] = (() =>
    Effect.succeed(toFindResult([...(config.classes ?? [])]))) as HulyClientOperations["findAllInModel"]
  const createDoc: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown,
    id: unknown
  ) => {
    writes.push({ action: "createDoc", attributes, id })
    return config.failCreateDoc
      ? Effect.fail(new HulyConnectionError({ message: "create failed", cause: "test" }))
      : Effect.succeed(id)
  }) as HulyClientOperations["createDoc"]
  const updateDoc: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    _space: unknown,
    _id: unknown,
    operations: unknown
  ) => {
    writes.push({ operations })
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]
  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, id: unknown) => {
    writes.push({ id })
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]
  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: Readonly<Record<string, unknown>>) => {
    if (_class !== core.class.SpaceType) return Effect.succeed(undefined)
    const id = query._id
    return Effect.succeed(config.spaceTypes?.find((spaceType) => spaceType._id === id))
  }) as HulyClientOperations["findOne"]
  const addCollection: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown,
    id: unknown
  ) => {
    writes.push({ action: "addCollection", attributes, id })
    return Effect.succeed(id)
  }) as HulyClientOperations["addCollection"]
  const updateCollection: NonNullable<HulyClientOperations["updateCollection"]> = ((
    _class: unknown,
    _space: unknown,
    _id: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    operations: unknown
  ) => {
    writes.push({ action: "updateCollection", operations })
    return Effect.succeed(toRef<SpaceType>("space-type-training"))
  }) as NonNullable<HulyClientOperations["updateCollection"]>
  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> = ((
    _class: unknown,
    _space: unknown,
    id: unknown
  ) => {
    writes.push({ action: "removeCollection", id })
    return Effect.succeed(toRef<SpaceType>("space-type-training"))
  }) as NonNullable<HulyClientOperations["removeCollection"]>
  const clientLayer = HulyClient.testLayer({
    findAll,
    findAllInModel,
    findOne,
    createDoc,
    updateDoc,
    removeDoc,
    addCollection,
    ...(config.omitUpdateCollection === true ? {} : { updateCollection }),
    ...(config.omitRemoveCollection === true ? {} : { removeCollection })
  })
  const diagnosticsLayer = Layer.succeed(Diagnostics, diagnostics)
  return Layer.merge(clientLayer, diagnosticsLayer)
}

const permissionIdentifier = (value: string) => PermissionIdentifier.make(value)

describe("permission definition administration", () => {
  it.effect("creates permissions idempotently by a clear exact label", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const created = yield* createHulyPermission({
        label: NonEmptyString.make("Export training"),
        scope: "space",
        transaction: "create" satisfies PermissionTransaction,
        forbid: false,
        description: NonEmptyString.make("Can export training records"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({}, writes)))
      const existingPermission = makePermission()
      const existing = yield* createHulyPermission({
        label: NonEmptyString.make("Review training"),
        scope: "space",
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [existingPermission] }, writes)))

      expect(created.created).toBe(true)
      expect(created.permission).toMatchObject({ label: "Review training".replace("Review", "Export"), scope: "space" })
      expect(writes[0]?.attributes).toMatchObject({
        label: "embedded:embedded:Export training",
        txClass: core.class.TxCreateDoc,
        forbid: false,
        description: "embedded:embedded:Can export training records"
      })
      expect(existing).toEqual({
        permission: { id: "custom-permission", label: "Review training", scope: "space" },
        created: false
      })
    })
  )

  it.effect("updates custom permissions by label and clears optional constraints", () =>
    Effect.gen(function* () {
      const writes: Array<CapturedWrite> = []
      const permission = makePermission({
        objectClass: toClassRef<Doc>("training:class:Training"),
        txClass: toClassRef<Doc>(core.class.TxUpdateDoc),
        description: intlString("embedded:embedded:Old description"),
        forbid: true
      })
      const result = yield* updateHulyPermission({
        permission: permissionIdentifier("Review training"),
        label: NonEmptyString.make("Audit training"),
        objectClass: null,
        transaction: null,
        description: null,
        forbid: false,
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [permission] }, writes)))

      expect(result.permission).toEqual({
        id: "custom-permission",
        label: "Audit training",
        scope: "space",
        forbid: false
      })
      expect(writes[0]?.operations).toEqual({
        label: "embedded:embedded:Audit training",
        forbid: false,
        $unset: { objectClass: "", txClass: "", description: "" }
      })
    })
  )

  it.effect("rejects ambiguous labels, built-in mutation, and referenced structural changes", () =>
    Effect.gen(function* () {
      const ambiguous = yield* deleteHulyPermission({
        permission: permissionIdentifier("Review training"),
        confirm: true
      }).pipe(
        Effect.provide(
          permissionLayer(
            { permissions: [makePermission(), makePermission({ _id: toRef<Permission>("other-custom") })] },
            []
          )
        ),
        Effect.exit
      )
      const builtIn = makePermission({ _id: toRef<Permission>("core:permission:UpdateObject") })
      const protectedExit = yield* updateHulyPermission({
        permission: permissionIdentifier("core:permission:UpdateObject"),
        label: NonEmptyString.make("Changed"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [builtIn] }, [])), Effect.exit)
      const referenced = makePermission()
      const referencedExit = yield* updateHulyPermission({
        permission: permissionIdentifier("Review training"),
        scope: "workspace",
        confirm: true
      }).pipe(
        Effect.provide(permissionLayer({ permissions: [referenced], roles: [makeRole(referenced)] }, [])),
        Effect.exit
      )

      expect(Exit.isFailure(ambiguous)).toBe(true)
      expect(Exit.isFailure(protectedExit)).toBe(true)
      expect(Exit.isFailure(referencedExit)).toBe(true)
    })
  )

  it.effect("deletes only unreferenced custom permissions", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      const writes: Array<CapturedWrite> = []
      const deleted = yield* deleteHulyPermission({
        permission: permissionIdentifier("Review training"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [permission] }, writes)))
      const referenced = yield* deleteHulyPermission({
        permission: permissionIdentifier("Review training"),
        confirm: true
      }).pipe(
        Effect.provide(permissionLayer({ permissions: [permission], roles: [makeRole(permission)] }, [])),
        Effect.exit
      )

      expect(deleted).toEqual({ permissionId: "custom-permission", deleted: true })
      expect(writes).toEqual([{ id: "custom-permission" }])
      expect(Exit.isFailure(referenced)).toBe(true)
    })
  )

  it.effect("rejects missing and conflicting definitions and accepts every transaction family", () =>
    Effect.gen(function* () {
      const existing = makePermission()
      const missing = yield* deleteHulyPermission({
        permission: permissionIdentifier("Missing permission"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [existing] }, [])), Effect.exit)
      const conflict = yield* createHulyPermission({
        label: NonEmptyString.make("Review training"),
        scope: "workspace",
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [existing] }, [])), Effect.exit)
      const ambiguous = yield* createHulyPermission({
        label: NonEmptyString.make("Review training"),
        scope: "space",
        confirm: true
      }).pipe(
        Effect.provide(
          permissionLayer(
            { permissions: [existing, makePermission({ _id: toRef<Permission>("other-permission") })] },
            []
          )
        ),
        Effect.exit
      )
      const writes: Array<CapturedWrite> = []
      for (const transaction of ["update", "remove", "mixin"] as const) {
        yield* createHulyPermission({
          label: NonEmptyString.make(`Permission ${transaction}`),
          scope: "space",
          transaction,
          confirm: true
        }).pipe(Effect.provide(permissionLayer({}, writes)))
      }

      expect(Exit.isFailure(missing)).toBe(true)
      expect(Exit.isFailure(conflict)).toBe(true)
      expect(Exit.isFailure(ambiguous)).toBe(true)
      expect(writes.map((write) => write.attributes)).toEqual([
        expect.objectContaining({ txClass: core.class.TxUpdateDoc }),
        expect.objectContaining({ txClass: core.class.TxRemoveDoc }),
        expect.objectContaining({ txClass: core.class.TxMixin })
      ])
    })
  )

  it.effect("sets every optional permission constraint and preserves omitted values", () =>
    Effect.gen(function* () {
      const permission = makePermission({ description: intlString("embedded:embedded:Existing") })
      const writes: Array<CapturedWrite> = []
      const created = yield* createHulyPermission({
        label: NonEmptyString.make("Issue permission"),
        scope: "space",
        objectClass: ModelIdentifier.make("Issue"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ classes: [makeClass()] }, writes)))
      const updated = yield* updateHulyPermission({
        permission: permissionIdentifier("custom-permission"),
        scope: "workspace",
        objectClass: ModelIdentifier.make("Issue"),
        transaction: "update",
        description: NonEmptyString.make("Changed"),
        forbid: true,
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [permission], classes: [makeClass()] }, writes)))
      const labelOnly = yield* updateHulyPermission({
        permission: permissionIdentifier("custom-permission"),
        label: NonEmptyString.make("Renamed"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [permission] }, writes)))

      expect(created.permission).toMatchObject({ objectClass: "tracker:class:Issue", scope: "space" })
      expect(updated.permission).toMatchObject({
        objectClass: "tracker:class:Issue",
        txClass: core.class.TxUpdateDoc,
        description: "Changed",
        forbid: true
      })
      expect(writes[1]?.operations).toEqual({
        scope: "workspace",
        objectClass: "tracker:class:Issue",
        txClass: core.class.TxUpdateDoc,
        description: "embedded:embedded:Changed",
        forbid: true
      })
      expect(labelOnly.permission).toMatchObject({ label: "Renamed", description: "Existing", scope: "space" })
    })
  )

  it.effect("omits optional fields absent from an existing permission", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      delete permission.scope
      const result = yield* updateHulyPermission({
        permission: permissionIdentifier("custom-permission"),
        label: NonEmptyString.make("Renamed"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [permission] }, [])))

      expect(result.permission).toEqual({ id: "custom-permission", label: "Renamed" })
    })
  )

  it.effect("protects built-in deletion and reports descriptor references", () =>
    Effect.gen(function* () {
      const builtIn = makePermission({ _id: toRef<Permission>("core:permission:UpdateObject") })
      const protectedDelete = yield* deleteHulyPermission({
        permission: permissionIdentifier("core:permission:UpdateObject"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [builtIn] }, [])), Effect.exit)
      const specialized = makePermission({
        _id: toRef<Permission>("custom-specialized-permission"),
        _class: toClassRef<Permission>("core:class:ClassPermission")
      })
      const specializedDelete = yield* deleteHulyPermission({
        permission: permissionIdentifier("custom-specialized-permission"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ permissions: [specialized] }, [])), Effect.exit)
      const permission = makePermission()
      const descriptor: SpaceTypeDescriptor = {
        _id: toRef<SpaceTypeDescriptor>("descriptor-training"),
        _class: core.class.SpaceTypeDescriptor,
        space: core.space.Model,
        modifiedBy: personId,
        modifiedOn: 0,
        name: intlString("Training"),
        description: intlString("Training spaces"),
        icon: asset("icon"),
        baseClass: toClassRef("training:class:TrainingSpace"),
        availablePermissions: [permission._id]
      }
      const referenced = yield* deleteHulyPermission({
        permission: permissionIdentifier("custom-permission"),
        confirm: true
      }).pipe(
        Effect.provide(permissionLayer({ permissions: [permission], descriptors: [descriptor] }, [])),
        Effect.exit
      )

      expect(Exit.isFailure(protectedDelete)).toBe(true)
      expect(Exit.isFailure(specializedDelete)).toBe(true)
      expect(Exit.isFailure(referenced)).toBe(true)
    })
  )
})

const createRoleParams = (overrides: Partial<CreateSpaceRoleParams> = {}): CreateSpaceRoleParams => ({
  spaceType: SpaceTypeIdentifier.make("Default Trainings"),
  name: NonEmptyString.make("Reviewer"),
  permissions: [PermissionIdentifier.make("Review training")],
  confirm: true,
  ...overrides
})

const setRolePermissionsParams = (
  overrides: Partial<SetSpaceRolePermissionsParams> = {}
): SetSpaceRolePermissionsParams => ({
  spaceType: SpaceTypeIdentifier.make("Default Trainings"),
  role: SpaceRoleIdentifier.make("Reviewer"),
  permissions: [PermissionIdentifier.make("Review training")],
  confirm: true,
  ...overrides
})

describe("space role definition administration", () => {
  it.effect("creates a role and its assignment attribute in one guarded operation", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      const writes: Array<CapturedWrite> = []
      const result = yield* createSpaceRole(createRoleParams()).pipe(
        Effect.provide(permissionLayer({ permissions: [permission], spaceTypes: [makeSpaceType()] }, writes))
      )

      expect(result.role).toMatchObject({ name: "Reviewer", permissionLabels: ["Review training"] })
      expect(writes.map((write) => write.action)).toEqual(["addCollection", "createDoc"])
      expect(writes[0]?.attributes).toEqual({ name: "Reviewer", permissions: ["custom-permission"] })
      expect(writes[1]?.attributes).toMatchObject({
        name: result.role.id,
        attributeOf: "training:mixin:TrainingsTypeData",
        label: "embedded:embedded:Role: Reviewer"
      })
    })
  )

  it.effect("returns an equivalent existing role idempotently and rejects conflicts", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      const role = makeRole(permission)
      const config = { permissions: [permission], roles: [role], spaceTypes: [makeSpaceType({ roles: 1 })] }
      const existing = yield* createSpaceRole(createRoleParams()).pipe(Effect.provide(permissionLayer(config, [])))
      const conflict = yield* createSpaceRole(createRoleParams({ permissions: [] })).pipe(
        Effect.provide(permissionLayer(config, [])),
        Effect.exit
      )

      expect(existing).toEqual({
        role: {
          id: "role-reviewer",
          name: "Reviewer",
          permissions: ["custom-permission"],
          permissionLabels: ["Review training"]
        },
        created: false
      })
      expect(Exit.isFailure(conflict)).toBe(true)
    })
  )

  it.effect("sets role permissions by role name and rejects workspace permissions on ordinary space types", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      const role = makeRole(permission)
      const writes: Array<CapturedWrite> = []
      const result = yield* setSpaceRolePermissions(setRolePermissionsParams()).pipe(
        Effect.provide(
          permissionLayer(
            { permissions: [permission], roles: [role], spaceTypes: [makeSpaceType({ roles: 1 })] },
            writes
          )
        )
      )
      const workspacePermission = makePermission({ scope: "workspace" })
      const invalid = yield* setSpaceRolePermissions(
        setRolePermissionsParams({ permissions: [PermissionIdentifier.make("Review training")] })
      ).pipe(
        Effect.provide(
          permissionLayer(
            { permissions: [workspacePermission], roles: [role], spaceTypes: [makeSpaceType({ roles: 1 })] },
            []
          )
        ),
        Effect.exit
      )

      expect(result.updated).toBe(true)
      expect(writes).toEqual([{ action: "updateCollection", operations: { permissions: ["custom-permission"] } }])
      expect(Exit.isFailure(invalid)).toBe(true)
    })
  )

  it.effect("refuses unsupported partial writes and compensates failed role attributes", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      const base = { permissions: [permission], spaceTypes: [makeSpaceType()] }
      const unsupportedCreate = yield* createSpaceRole(createRoleParams()).pipe(
        Effect.provide(permissionLayer({ ...base, omitRemoveCollection: true }, [])),
        Effect.exit
      )
      const writes: Array<CapturedWrite> = []
      const compensated = yield* createSpaceRole(createRoleParams()).pipe(
        Effect.provide(permissionLayer({ ...base, failCreateDoc: true }, writes)),
        Effect.exit
      )
      const role = makeRole(permission)
      const unsupportedUpdate = yield* setSpaceRolePermissions(setRolePermissionsParams()).pipe(
        Effect.provide(
          permissionLayer(
            { permissions: [permission], roles: [role], spaceTypes: [makeSpaceType()], omitUpdateCollection: true },
            []
          )
        ),
        Effect.exit
      )

      expect(Exit.isFailure(unsupportedCreate)).toBe(true)
      expect(Exit.isFailure(compensated)).toBe(true)
      expect(writes.map((write) => write.action)).toEqual(["addCollection", "createDoc", "removeCollection"])
      expect(Exit.isFailure(unsupportedUpdate)).toBe(true)
    })
  )

  it.effect("rejects duplicate role names and allows workspace permissions on the all-spaces type", () =>
    Effect.gen(function* () {
      const permission = makePermission()
      const duplicate = yield* createSpaceRole(createRoleParams()).pipe(
        Effect.provide(
          permissionLayer(
            {
              permissions: [permission],
              roles: [makeRole(permission), { ...makeRole(permission), _id: toRef<Role>("role-reviewer-2") }],
              spaceTypes: [makeSpaceType({ roles: 2 })]
            },
            []
          )
        ),
        Effect.exit
      )
      const workspacePermission = makePermission({ scope: "workspace" })
      const allSpacesType = makeSpaceType({ _id: core.spaceType.SpacesType, name: "All spaces", roles: 1 })
      const role = { ...makeRole(workspacePermission), attachedTo: allSpacesType._id }
      const writes: Array<CapturedWrite> = []
      const updated = yield* setSpaceRolePermissions({
        spaceType: SpaceTypeIdentifier.make(String(core.spaceType.SpacesType)),
        role: SpaceRoleIdentifier.make("Reviewer"),
        permissions: [PermissionIdentifier.make("Review training")],
        confirm: true
      }).pipe(
        Effect.provide(
          permissionLayer({ permissions: [workspacePermission], roles: [role], spaceTypes: [allSpacesType] }, writes)
        )
      )

      expect(Exit.isFailure(duplicate)).toBe(true)
      expect(updated.updated).toBe(true)
    })
  )
})

const setCollaboratorParams = (
  overrides: Partial<SetClassCollaboratorMetadataParams> = {}
): SetClassCollaboratorMetadataParams => ({
  class: ModelIdentifier.make("Issue"),
  fieldSelection: { mode: "fields", fields: [CollaboratorFieldName.make("assignee")] },
  provideSecurity: true,
  confirm: true,
  ...overrides
})

describe("class collaborator metadata administration", () => {
  it.effect("gets configured and unconfigured metadata by clear class name", () =>
    Effect.gen(function* () {
      const cls = makeClass()
      const unconfigured = yield* getClassCollaboratorMetadata({ class: ModelIdentifier.make("Issue") }).pipe(
        Effect.provide(permissionLayer({ classes: [cls] }, []))
      )
      const configured = yield* getClassCollaboratorMetadata({ class: ModelIdentifier.make("Issue") }).pipe(
        Effect.provide(permissionLayer({ classes: [cls], collaboratorMetadata: [makeCollaboratorMetadata()] }, []))
      )

      expect(unconfigured).toEqual({ classId: "tracker:class:Issue", classLabel: "Issue", configured: false })
      expect(configured).toMatchObject({
        metadataId: "class-collaborators-issue",
        fieldSelection: { mode: "fields", fields: ["assignee"] },
        provideSecurity: true,
        provideAttachedSecurity: false,
        configured: true
      })
    })
  )

  it.effect("creates field-scoped metadata after resolving inherited attributes", () =>
    Effect.gen(function* () {
      const parent = makeClass({ _id: toRef<Class<Doc>>("tracker:class:Task"), label: intlString("Task") })
      const issue = makeClass({ extends: parent._id })
      const writes: Array<CapturedWrite> = []
      const result = yield* setClassCollaboratorMetadata(setCollaboratorParams()).pipe(
        Effect.provide(
          permissionLayer({ classes: [parent, issue], attributes: [makeAttribute("assignee", parent)] }, writes)
        )
      )

      expect(result.created).toBe(true)
      expect(result.metadata).toMatchObject({ fieldSelection: { mode: "fields", fields: ["assignee"] } })
      expect(writes[0]).toMatchObject({
        action: "createDoc",
        attributes: {
          attachedTo: "tracker:class:Issue",
          fields: ["assignee"],
          provideSecurity: true,
          provideAttachedSecurity: false
        }
      })
    })
  )

  it.effect("updates metadata to all fields and rejects unknown field names", () =>
    Effect.gen(function* () {
      const cls = makeClass()
      const metadata = makeCollaboratorMetadata()
      const writes: Array<CapturedWrite> = []
      const updated = yield* setClassCollaboratorMetadata(
        setCollaboratorParams({
          fieldSelection: { mode: "all" },
          provideSecurity: false,
          provideAttachedSecurity: true
        })
      ).pipe(
        Effect.provide(
          permissionLayer(
            { classes: [cls], attributes: [makeAttribute("assignee")], collaboratorMetadata: [metadata] },
            writes
          )
        )
      )
      const invalid = yield* setClassCollaboratorMetadata(setCollaboratorParams()).pipe(
        Effect.provide(permissionLayer({ classes: [cls], attributes: [], collaboratorMetadata: [metadata] }, [])),
        Effect.exit
      )

      expect(updated.metadata).toMatchObject({
        fieldSelection: { mode: "all" },
        provideSecurity: false,
        provideAttachedSecurity: true
      })
      expect(writes[0]?.operations).toEqual({
        allFields: true,
        fields: [],
        provideSecurity: false,
        provideAttachedSecurity: true
      })
      expect(Exit.isFailure(invalid)).toBe(true)
    })
  )

  it.effect("deletes one direct metadata record and rejects ambiguous records", () =>
    Effect.gen(function* () {
      const cls = makeClass()
      const metadata = makeCollaboratorMetadata()
      const writes: Array<CapturedWrite> = []
      const deleted = yield* deleteClassCollaboratorMetadata({
        class: ModelIdentifier.make("Issue"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ classes: [cls], collaboratorMetadata: [metadata] }, writes)))
      const ambiguous = yield* getClassCollaboratorMetadata({ class: ModelIdentifier.make("Issue") }).pipe(
        Effect.provide(
          permissionLayer(
            {
              classes: [cls],
              collaboratorMetadata: [
                metadata,
                makeCollaboratorMetadata({ _id: toRef("class-collaborators-duplicate") })
              ]
            },
            []
          )
        ),
        Effect.exit
      )

      expect(deleted).toEqual({
        metadataId: "class-collaborators-issue",
        classId: "tracker:class:Issue",
        deleted: true
      })
      expect(writes).toEqual([{ id: "class-collaborators-issue" }])
      expect(Exit.isFailure(ambiguous)).toBe(true)
    })
  )

  it.effect("supports explicit no-fields metadata and refuses deletion when unconfigured", () =>
    Effect.gen(function* () {
      const cls = makeClass({ _id: toRef<Class<Doc>>("PlainClass"), label: intlString("") })
      const writes: Array<CapturedWrite> = []
      const diagnostics = yield* makeDiagnosticsScope
      const created = yield* setClassCollaboratorMetadata(
        setCollaboratorParams({ class: ModelIdentifier.make("PlainClass"), fieldSelection: { mode: "none" } })
      ).pipe(Effect.provide(permissionLayer({ classes: [cls] }, writes, diagnostics.service)))
      const missing = yield* deleteClassCollaboratorMetadata({
        class: ModelIdentifier.make("PlainClass"),
        confirm: true
      }).pipe(Effect.provide(permissionLayer({ classes: [cls] }, [])), Effect.exit)

      const warnings = yield* diagnostics.drainWarnings
      expect(created.metadata).toMatchObject({ classLabel: "PlainClass", fieldSelection: { mode: "none" } })
      expect(warnings).toEqual([expect.objectContaining({ code: "class_collaborator_metadata_degraded" })])
      expect(Exit.isFailure(missing)).toBe(true)
    })
  )

  it.effect("handles cyclic and missing class ancestors without recursing or inventing fields", () =>
    Effect.gen(function* () {
      const base = makeClass()
      const cyclic = makeClass({ extends: base._id })
      const missingParent = makeClass({
        _id: toRef<Class<Doc>>("tracker:class:Orphan"),
        label: intlString("tracker:string:Orphan"),
        extends: toRef<Class<Doc>>("tracker:class:Missing")
      })
      const cyclicResult = yield* setClassCollaboratorMetadata(
        setCollaboratorParams({ fieldSelection: { mode: "none" } })
      ).pipe(Effect.provide(permissionLayer({ classes: [cyclic] }, [])))
      const orphanResult = yield* setClassCollaboratorMetadata(
        setCollaboratorParams({ class: ModelIdentifier.make("Orphan"), fieldSelection: { mode: "none" } })
      ).pipe(Effect.provide(permissionLayer({ classes: [missingParent] }, [])))

      expect(cyclicResult.created).toBe(true)
      expect(orphanResult.created).toBe(true)
    })
  )
})
