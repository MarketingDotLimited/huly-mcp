import type { AnyAttribute, AttachedData, Data, Permission, Role, Space, SpaceType } from "@hcengineering/core"
import { generateId, getRoleAttributeLabel } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateSpaceRoleParams,
  CreateSpaceRoleResult,
  PermissionIdentifier,
  SetSpaceRolePermissionsParams,
  SetSpaceRolePermissionsResult
} from "../../domain/schemas/security-administration.js"
import { NonEmptyString, PermissionId, RoleId, SpaceTypeId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  SpaceRoleNameConflictError,
  SpaceRolePermissionScopeError,
  SpaceRoleWriteUnsupportedError
} from "../errors-security-administration.js"
import type {
  SpaceRoleIdentifierAmbiguousError,
  SpaceRoleNotFoundError,
  SpaceTypeIdentifierAmbiguousError,
  SpaceTypeNotFoundError
} from "../errors.js"
import { core } from "../huly-plugins.js"
import { RoleAssignmentEditor } from "../security-metadata-constants.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef } from "./sdk-boundary.js"
import {
  displaySecurityLabel,
  loadPermissions,
  type PermissionResolverError,
  resolvePermission
} from "./security-administration.js"
import { normalizeModelIdentifier } from "./model-administration-shared.js"
import { findSpaceType } from "./spaces-read.js"
import { sortStrings } from "./spaces-shared.js"
import { resolveSpaceRole } from "./spaces-write.js"

type SpaceRoleWriteError =
  | HulyClientError
  | PermissionResolverError
  | SpaceRoleIdentifierAmbiguousError
  | SpaceRoleNameConflictError
  | SpaceRoleNotFoundError
  | SpaceRolePermissionScopeError
  | SpaceRoleWriteUnsupportedError
  | SpaceTypeIdentifierAmbiguousError
  | SpaceTypeNotFoundError

const resolvePermissions = (
  permissions: ReadonlyArray<Permission>,
  identifiers: ReadonlyArray<PermissionIdentifier>
): Effect.Effect<ReadonlyArray<Permission>, PermissionResolverError> =>
  Effect.forEach(identifiers, (identifier) => resolvePermission(permissions, identifier))

const permissionMap = (permissions: ReadonlyArray<Permission>): ReadonlyMap<Permission["_id"], Permission> =>
  new Map(permissions.map((permission) => [permission._id, permission]))

const securityRoleSummary = (role: Role, permissionsById: ReadonlyMap<Permission["_id"], Permission>) => ({
  id: RoleId.make(String(role._id)),
  name: NonEmptyString.make(role.name),
  permissions: role.permissions.map((permission) => PermissionId.make(String(permission))),
  permissionLabels: role.permissions
    .map((permission) => permissionsById.get(permission))
    .filter((permission) => permission !== undefined)
    .map((permission) => displaySecurityLabel(permission.label))
})

const samePermissionIds = (
  current: ReadonlyArray<Permission["_id"]>,
  requested: ReadonlyArray<Permission>
): boolean => {
  const currentIds = sortStrings([...current])
  const requestedIds = sortStrings(requested.map((permission) => permission._id))
  return currentIds.length === requestedIds.length && currentIds.every((id, index) => id === requestedIds[index])
}

const assertPermissionScopesAllowed = (
  spaceType: SpaceType,
  permissions: ReadonlyArray<Permission>
): Effect.Effect<void, SpaceRolePermissionScopeError> => {
  const invalid = permissions.find(
    (permission) => permission.scope === "workspace" && spaceType._id !== core.spaceType.SpacesType
  )
  return invalid === undefined
    ? Effect.void
    : Effect.fail(
        new SpaceRolePermissionScopeError({
          permissionId: PermissionId.make(String(invalid._id)),
          spaceTypeId: SpaceTypeId.make(String(spaceType._id))
        })
      )
}

const roleAttributeData = (spaceType: SpaceType, roleId: Role["_id"], roleName: NonEmptyString): Data<AnyAttribute> => {
  const label = getRoleAttributeLabel(roleName)
  return {
    name: roleId,
    attributeOf: toClassRef<Space>(String(spaceType.targetClass)),
    label,
    type: { _class: core.class.TypeAny, label, presenter: RoleAssignmentEditor, editor: RoleAssignmentEditor }
  }
}

const createRoleRecords = (
  client: HulyClient["Service"],
  spaceType: SpaceType,
  name: NonEmptyString,
  permissions: ReadonlyArray<Permission>
): Effect.Effect<Role["_id"], HulyClientError | SpaceRoleWriteUnsupportedError> =>
  Effect.gen(function* () {
    if (client.removeCollection === undefined) {
      return yield* new SpaceRoleWriteUnsupportedError({ operation: NonEmptyString.make("removeCollection") })
    }
    const roleId = generateId<Role>()
    const attributes: AttachedData<Role> = { name, permissions: permissions.map((permission) => permission._id) }
    yield* client.addCollection(
      core.class.Role,
      core.space.Model,
      spaceType._id,
      spaceType._class,
      "roles",
      attributes,
      roleId
    )
    const removeCollection = client.removeCollection
    yield* client
      .createDoc(core.class.Attribute, core.space.Model, roleAttributeData(spaceType, roleId, name), generateId())
      .pipe(
        Effect.catch((createError) =>
          removeCollection(core.class.Role, core.space.Model, roleId, spaceType._id, spaceType._class, "roles").pipe(
            Effect.flatMap(() => Effect.fail(createError))
          )
        )
      )
    return roleId
  })

export const createSpaceRole = (
  params: CreateSpaceRoleParams
): Effect.Effect<CreateSpaceRoleResult, SpaceRoleWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const spaceType = yield* findSpaceType(client, params.spaceType)
    const [roles, allPermissions] = yield* Effect.all([
      client.findAll<Role>(core.class.Role, hulyQuery<Role>({ attachedTo: spaceType._id })),
      loadPermissions(client)
    ])
    const permissions = yield* resolvePermissions(allPermissions, params.permissions)
    yield* assertPermissionScopesAllowed(spaceType, permissions)
    const nameMatches = roles.filter(
      (role) => normalizeModelIdentifier(role.name) === normalizeModelIdentifier(params.name)
    )
    if (nameMatches.length > 1) {
      return yield* new SpaceRoleNameConflictError({
        name: params.name,
        spaceTypeId: SpaceTypeId.make(String(spaceType._id))
      })
    }
    const [existing] = nameMatches
    if (existing !== undefined) {
      if (samePermissionIds(existing.permissions, permissions)) {
        return { role: securityRoleSummary(existing, permissionMap(permissions)), created: false }
      }
      return yield* new SpaceRoleNameConflictError({
        name: params.name,
        spaceTypeId: SpaceTypeId.make(String(spaceType._id))
      })
    }

    const roleId = yield* createRoleRecords(client, spaceType, params.name, permissions)
    return {
      role: {
        id: RoleId.make(String(roleId)),
        name: params.name,
        permissions: permissions.map((permission) => PermissionId.make(String(permission._id))),
        permissionLabels: permissions.map((permission) => displaySecurityLabel(permission.label))
      },
      created: true
    }
  })

export const setSpaceRolePermissions = (
  params: SetSpaceRolePermissionsParams
): Effect.Effect<SetSpaceRolePermissionsResult, SpaceRoleWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const spaceType = yield* findSpaceType(client, params.spaceType)
    const [role, allPermissions] = yield* Effect.all([
      resolveSpaceRole(client, SpaceTypeId.make(String(spaceType._id)), params.role),
      loadPermissions(client)
    ])
    const permissions = yield* resolvePermissions(allPermissions, params.permissions)
    yield* assertPermissionScopesAllowed(spaceType, permissions)
    if (client.updateCollection === undefined) {
      return yield* new SpaceRoleWriteUnsupportedError({ operation: NonEmptyString.make("updateCollection") })
    }
    yield* client.updateCollection(
      core.class.Role,
      core.space.Model,
      role._id,
      role.attachedTo,
      role.attachedToClass,
      role.collection,
      { permissions: permissions.map((permission) => permission._id) }
    )
    return {
      role: {
        id: RoleId.make(String(role._id)),
        name: role.name,
        permissions: permissions.map((permission) => PermissionId.make(String(permission._id))),
        permissionLabels: permissions.map((permission) => displaySecurityLabel(permission.label))
      },
      updated: true
    }
  })
