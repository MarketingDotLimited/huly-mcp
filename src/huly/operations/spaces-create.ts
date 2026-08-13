import {
  type AnyAttribute,
  type AccountUuid as HulyAccountUuid,
  type Class,
  ClassifierKind,
  type Data,
  type Doc,
  generateId,
  type Ref,
  type Role,
  type RolesAssignment,
  type Space,
  type SpaceType,
  type SpaceTypeDescriptor,
  type TypedSpace
} from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type { CreateSpaceParams, CreateSpaceResult } from "../../domain/schemas/spaces-administration.js"
import {
  DEFAULT_TYPED_SPACE_AUTO_JOIN,
  DEFAULT_TYPED_SPACE_PRIVATE,
  DEFAULT_TYPED_SPACE_RESTRICTED
} from "../../domain/schemas/spaces-administration.js"
import {
  AccountUuid,
  NonEmptyString,
  ObjectClassName,
  RoleId,
  SpaceId,
  SpaceTypeId
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  SpaceRoleIdentifierAmbiguousError,
  SpaceRoleNotFoundError,
  SpaceTypeIdentifierAmbiguousError,
  SpaceTypeNotFoundError
} from "../errors.js"
import { SpaceCreationConflictError, SpaceTypeCreationUnsupportedError } from "../errors.js"
import { core } from "../huly-plugins.js"
import { RoleAssignmentEditor } from "../security-metadata-constants.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"
import { findSpaceType } from "./spaces-read.js"
import { mergeUniqueSortedAccountUuids, resolveMembers, type GenericSpace, spaceClass } from "./spaces-shared.js"
import { resolveSpaceRole } from "./spaces-write.js"

type CreateSpaceError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError
  | SpaceRoleIdentifierAmbiguousError
  | SpaceRoleNotFoundError
  | SpaceCreationConflictError
  | SpaceTypeCreationUnsupportedError
  | SpaceTypeIdentifierAmbiguousError
  | SpaceTypeNotFoundError

const SpaceCreationMetadataSchema = Schema.Struct({
  spaceType: SpaceTypeId,
  descriptor: NonEmptyString,
  baseClass: ObjectClassName,
  targetClass: ObjectClassName,
  system: Schema.optionalKey(Schema.Boolean)
})
type SpaceCreationMetadata = Schema.Schema.Type<typeof SpaceCreationMetadataSchema>

const TargetClassifierMetadataSchema = Schema.Struct({
  kind: Schema.Literals([ClassifierKind.CLASS, ClassifierKind.INTERFACE, ClassifierKind.MIXIN]),
  extends: Schema.optional(ObjectClassName)
})

const TargetAttributeMetadataSchema = Schema.Array(
  Schema.Struct({
    name: NonEmptyString,
    attributeOf: ObjectClassName,
    type: Schema.Struct({
      _class: ObjectClassName,
      presenter: Schema.optionalKey(NonEmptyString),
      editor: Schema.optionalKey(NonEmptyString)
    })
  })
)
const TargetRoleMetadataSchema = Schema.Array(Schema.Struct({ id: RoleId }))
type TargetAttributeMetadata = Schema.Schema.Type<typeof TargetAttributeMetadataSchema>
type TargetRoleMetadata = Schema.Schema.Type<typeof TargetRoleMetadataSchema>
const parseSpaceCreationMetadata = Schema.decodeUnknownEffect(SpaceCreationMetadataSchema)
const parseTargetClassifierMetadata = Schema.decodeUnknownEffect(TargetClassifierMetadataSchema)
const parseTargetAttributeMetadata = Schema.decodeUnknownEffect(TargetAttributeMetadataSchema)
const parseTargetRoleMetadata = Schema.decodeUnknownEffect(TargetRoleMetadataSchema)
const unsupported = (spaceType: SpaceTypeId, reason: NonEmptyString): SpaceTypeCreationUnsupportedError =>
  new SpaceTypeCreationUnsupportedError({ spaceType, reason })

const isCanonicalRoleAttribute = (attribute: TargetAttributeMetadata[number]): boolean =>
  attribute.type._class === ObjectClassName.make(core.class.TypeAny) &&
  attribute.type.presenter === RoleAssignmentEditor &&
  attribute.type.editor === RoleAssignmentEditor

const targetShapeProblem = (
  metadata: SpaceCreationMetadata,
  attributes: TargetAttributeMetadata,
  roles: TargetRoleMetadata
): NonEmptyString | undefined => {
  const roleIds = new Set<string>(roles.map((role) => role.id))
  const extraAttribute = attributes.find((attribute) => !roleIds.has(attribute.name))
  if (extraAttribute !== undefined) {
    return NonEmptyString.make(
      `target mixin '${metadata.targetClass}' declares non-role field '${extraAttribute.name}' without a provable safe default`
    )
  }
  const wrongTypeAttribute = attributes.find((attribute) => !isCanonicalRoleAttribute(attribute))
  if (wrongTypeAttribute !== undefined) {
    return NonEmptyString.make(
      `target mixin attribute '${wrongTypeAttribute.name}' is not a canonical Huly role-assignment field`
    )
  }
  const attributeNames = new Set(attributes.map((attribute) => attribute.name))
  if (attributeNames.size !== attributes.length) {
    return NonEmptyString.make(`target mixin '${metadata.targetClass}' declares duplicate role attributes`)
  }
  const missingRole = roles.find((role) => !attributeNames.has(role.id))
  return missingRole === undefined
    ? undefined
    : NonEmptyString.make(
        `target mixin '${metadata.targetClass}' has no declared attribute for configured role '${missingRole.id}'`
      )
}

const parseCreationMetadata = (
  spaceType: SpaceType,
  descriptor: SpaceTypeDescriptor
): Effect.Effect<SpaceCreationMetadata, SpaceTypeCreationUnsupportedError> => {
  const spaceTypeId = SpaceTypeId.make(spaceType._id)
  return parseSpaceCreationMetadata({
    spaceType: spaceType._id,
    descriptor: descriptor._id,
    baseClass: descriptor.baseClass,
    targetClass: spaceType.targetClass,
    ...(descriptor.system === undefined ? {} : { system: descriptor.system })
  }).pipe(
    Effect.mapError(() =>
      unsupported(spaceTypeId, NonEmptyString.make("SDK descriptor metadata is missing or malformed"))
    )
  )
}

const requireSafeTargetShape = (
  client: HulyClient["Service"],
  metadata: SpaceCreationMetadata
): Effect.Effect<void, HulyClientError | SpaceTypeCreationUnsupportedError> =>
  Effect.gen(function* () {
    const classifier = yield* client.findOne<Class<Doc>>(
      toClassRef<Class<Doc>>(core.class.Class),
      hulyQuery<Class<Doc>>({ _id: toClassRef<Doc>(metadata.targetClass) })
    )
    if (classifier === undefined) {
      return yield* unsupported(
        metadata.spaceType,
        NonEmptyString.make(`target mixin '${metadata.targetClass}' was not found in SDK model metadata`)
      )
    }
    const classifierMetadata = yield* parseTargetClassifierMetadata(classifier).pipe(
      Effect.mapError(() =>
        unsupported(metadata.spaceType, NonEmptyString.make("target mixin SDK metadata is malformed"))
      )
    )
    if (
      classifierMetadata.kind !== ClassifierKind.MIXIN ||
      classifierMetadata.extends !== ObjectClassName.make(core.class.TypedSpace)
    ) {
      return yield* unsupported(
        metadata.spaceType,
        NonEmptyString.make(`target '${metadata.targetClass}' is not a direct TypedSpace mixin`)
      )
    }

    const [attributes, roles] = yield* Effect.all([
      client.findAll<AnyAttribute>(
        core.class.Attribute,
        hulyQuery<AnyAttribute>({ attributeOf: toClassRef<Doc>(metadata.targetClass) })
      ),
      client.findAll<Role>(core.class.Role, hulyQuery<Role>({ attachedTo: toRef<SpaceType>(metadata.spaceType) }), {
        limit: clampLimit(undefined)
      })
    ])
    const attributeMetadata = yield* parseTargetAttributeMetadata(
      attributes.map((attribute) => ({
        name: attribute.name,
        attributeOf: attribute.attributeOf,
        type: attribute.type
      }))
    ).pipe(
      Effect.mapError(() =>
        unsupported(metadata.spaceType, NonEmptyString.make("target mixin attribute metadata is malformed"))
      )
    )
    const roleMetadata = yield* parseTargetRoleMetadata(roles.map((role) => ({ id: role._id }))).pipe(
      Effect.mapError(() =>
        unsupported(metadata.spaceType, NonEmptyString.make("target mixin role metadata is malformed"))
      )
    )
    const problem = targetShapeProblem(metadata, attributeMetadata, roleMetadata)
    if (problem !== undefined) return yield* unsupported(metadata.spaceType, problem)
    return yield* Effect.void
  })

const requireSupportedMetadata = (
  client: HulyClient["Service"],
  spaceType: SpaceType
): Effect.Effect<SpaceCreationMetadata, HulyClientError | SpaceTypeCreationUnsupportedError> =>
  Effect.gen(function* () {
    const spaceTypeId = SpaceTypeId.make(spaceType._id)
    const descriptor = yield* client.findOne<SpaceTypeDescriptor>(
      core.class.SpaceTypeDescriptor,
      hulyQuery<SpaceTypeDescriptor>({ _id: spaceType.descriptor })
    )
    if (descriptor === undefined) {
      return yield* unsupported(spaceTypeId, NonEmptyString.make(`descriptor '${spaceType.descriptor}' was not found`))
    }

    const metadata = yield* parseCreationMetadata(spaceType, descriptor)
    if (metadata.system === true) {
      return yield* unsupported(spaceTypeId, NonEmptyString.make("its descriptor is system-managed"))
    }
    if (metadata.baseClass !== ObjectClassName.make(core.class.TypedSpace)) {
      return yield* unsupported(
        spaceTypeId,
        NonEmptyString.make(
          `base class '${metadata.baseClass}' may require module-specific fields; use that module's purpose-built creation tool`
        )
      )
    }
    yield* requireSafeTargetShape(client, metadata)
    return metadata
  })

interface ResolvedRoleAssignments {
  readonly assignments: RolesAssignment
  readonly members: ReadonlyArray<HulyAccountUuid>
}

type TypedSpaceRoleAssignments = TypedSpace & RolesAssignment

const resolveRoleAssignments = (
  client: HulyClient["Service"],
  spaceType: SpaceTypeId,
  requested: CreateSpaceParams["roleAssignments"]
): Effect.Effect<ResolvedRoleAssignments, CreateSpaceError> =>
  Effect.gen(function* () {
    const resolved = yield* Effect.forEach(requested ?? [], (assignment) =>
      Effect.all({
        role: resolveSpaceRole(client, spaceType, assignment.role),
        members: resolveMembers(client, assignment.members)
      })
    )
    const assignments = resolved.reduce<RolesAssignment>(
      (current, item) => ({
        ...current,
        [item.role._id]: mergeUniqueSortedAccountUuids(current[item.role._id] ?? [], item.members)
      }),
      {}
    )
    return { assignments, members: resolved.flatMap((item) => item.members) }
  })

const createSpaceResult = (id: Ref<TypedSpace>, data: Data<TypedSpace>): CreateSpaceResult => ({
  id: SpaceId.make(id),
  name: NonEmptyString.make(data.name),
  class: ObjectClassName.make(core.class.TypedSpace),
  type: SpaceTypeId.make(data.type),
  members: data.members.map((member) => AccountUuid.make(member)),
  owners: (data.owners ?? []).map((owner) => AccountUuid.make(owner))
})

const resolveOptionalMembers = (
  client: HulyClient["Service"],
  requested: CreateSpaceParams["members"],
  fallback: ReadonlyArray<HulyAccountUuid>
) => (requested === undefined ? Effect.succeed([...fallback]) : resolveMembers(client, requested))

const newSpaceData = (
  params: CreateSpaceParams,
  spaceType: SpaceType,
  owners: ReadonlyArray<HulyAccountUuid>,
  members: ReadonlyArray<HulyAccountUuid>
): Data<TypedSpace> => ({
  name: params.name,
  description: params.description ?? "",
  private: params.private ?? DEFAULT_TYPED_SPACE_PRIVATE,
  archived: false,
  members: [...members],
  owners: [...owners],
  type: toRef(spaceType._id),
  autoJoin: params.autoJoin ?? spaceType.autoJoin ?? DEFAULT_TYPED_SPACE_AUTO_JOIN,
  restricted: params.restricted ?? DEFAULT_TYPED_SPACE_RESTRICTED
})

const createNewSpace = (
  client: HulyClient["Service"],
  params: CreateSpaceParams,
  spaceType: SpaceType,
  metadata: SpaceCreationMetadata
): Effect.Effect<CreateSpaceResult, CreateSpaceError> =>
  Effect.gen(function* () {
    const owners = yield* resolveOptionalMembers(client, params.owners, [client.getAccountUuid()])
    const requestedMembers = yield* resolveOptionalMembers(client, params.members, [])
    const roles = yield* resolveRoleAssignments(client, metadata.spaceType, params.roleAssignments)
    const members = mergeUniqueSortedAccountUuids(
      mergeUniqueSortedAccountUuids(spaceType.members ?? [], requestedMembers),
      [...owners, ...roles.members]
    )
    const id: Ref<TypedSpace> = generateId()
    const data = newSpaceData(params, spaceType, owners, members)

    yield* client.createDoc(core.class.TypedSpace, core.space.Space, data, id)
    yield* client.createMixin<TypedSpace, TypedSpaceRoleAssignments>(
      id,
      core.class.TypedSpace,
      toRef<Space>(core.space.Space),
      toMixinRef<TypedSpaceRoleAssignments>(metadata.targetClass),
      roles.assignments
    )
    return createSpaceResult(id, data)
  })

export const createSpace = (
  params: CreateSpaceParams
): Effect.Effect<CreateSpaceResult, CreateSpaceError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const spaceType = yield* findSpaceType(client, params.spaceType)
    const metadata = yield* requireSupportedMetadata(client, spaceType)
    const existing = yield* client.findOne<GenericSpace>(
      spaceClass,
      hulyQuery<GenericSpace>({ name: params.name, type: toRef(spaceType._id), archived: false })
    )
    if (existing !== undefined) {
      return yield* new SpaceCreationConflictError({
        spaceType: metadata.spaceType,
        name: params.name,
        existingSpace: SpaceId.make(existing._id)
      })
    }
    return yield* createNewSpace(client, params, spaceType, metadata)
  })
