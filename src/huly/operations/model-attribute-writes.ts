import type { AnyAttribute, Data, DocumentUpdate, Enum as HulyEnum } from "@hcengineering/core"
import { generateId, IndexKind } from "@hcengineering/core"
import { getEmbeddedLabel } from "@hcengineering/platform"
import { Effect, Result } from "effect"

import type {
  CreateHulyAttributeParams,
  CreateHulyAttributeResult,
  DeleteHulyAttributeParams,
  DeleteHulyAttributeResult,
  HulyAttributeIndex,
  HulyAttributeWriteType,
  UpdateHulyAttributeParams,
  UpdateHulyAttributeResult
} from "../../domain/schemas/model-administration.js"
import { ModelIdentifier } from "../../domain/schemas/model-administration.js"
import type { HulyAttributeSummary, HulyAttributeType } from "../../domain/schemas/sdk-discovery.js"
import { HulyAttributeId, HulyEnumId, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  type HulyAttributeAmbiguousError,
  HulyAttributeInUseError,
  HulyAttributeNameConflictError,
  type HulyAttributeNotFoundError,
  HulyAttributeProtectedError,
  type HulyEnumAmbiguousError,
  type HulyEnumNotFoundError,
  type ModelClassAmbiguousError,
  type ModelClassNotFoundError
} from "../errors-model-administration.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { core } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toAttributeSummary, type MetadataClassDoc } from "./sdk-discovery-mappers.js"
import {
  loadAttributes,
  loadClasses,
  loadEnums,
  normalizeModelIdentifier,
  ownerClassRef,
  resolveAttribute,
  resolveEnum,
  resolveModelClass
} from "./model-administration-shared.js"

type AttributeResolverError =
  | HulyAttributeAmbiguousError
  | HulyAttributeNotFoundError
  | ModelClassAmbiguousError
  | ModelClassNotFoundError
type AttributeWriteError =
  | HulyClientError
  | AttributeResolverError
  | HulyAttributeInUseError
  | HulyAttributeNameConflictError
  | HulyAttributeProtectedError
  | HulyEnumAmbiguousError
  | HulyEnumNotFoundError

const sdkIndex = (index: HulyAttributeIndex): IndexKind => {
  switch (index) {
    case "fulltext":
      return IndexKind.FullText
    case "indexed":
      return IndexKind.Indexed
    case "indexedDescending":
      return IndexKind.IndexedDsc
  }
}

const typeBase = (
  classId: AnyAttribute["type"]["_class"],
  label: AnyAttribute["type"]["label"],
  icon: NonNullable<AnyAttribute["type"]["icon"]>
): AnyAttribute["type"] => ({ _class: classId, label, icon })

const scalarType = (kind: "string" | "number" | "boolean" | "date" | "markup"): AnyAttribute["type"] => {
  switch (kind) {
    case "string":
      return typeBase(core.class.TypeString, core.string.String, core.icon.TypeString)
    case "number":
      return typeBase(core.class.TypeNumber, core.string.Number, core.icon.TypeNumber)
    case "boolean":
      return typeBase(core.class.TypeBoolean, core.string.Boolean, core.icon.TypeBoolean)
    case "markup":
      return typeBase(core.class.TypeMarkup, core.string.Markup, core.icon.TypeMarkup)
    case "date":
      return typeBase(core.class.TypeDate, core.string.Date, core.icon.TypeDate)
  }
}

const attributeType = (
  type: HulyAttributeWriteType,
  classes: ReadonlyArray<MetadataClassDoc>,
  enums: ReadonlyArray<HulyEnum>
): Effect.Effect<ResolvedAttributeType, AttributeResolverError | HulyEnumAmbiguousError | HulyEnumNotFoundError> =>
  Effect.gen(function* () {
    switch (type.kind) {
      case "string":
      case "number":
      case "boolean":
      case "date":
      case "markup":
        return { kind: type.kind, sdkType: scalarType(type.kind) }
      case "enum": {
        const resolved = yield* resolveEnum(enums, type.enum)
        return {
          sdkType: { ...typeBase(core.class.EnumOf, core.string.Enum, core.icon.TypeEnumOf), of: resolved._id },
          kind: "enum",
          enumId: HulyEnumId.make(String(resolved._id))
        }
      }
      case "ref": {
        const resolved = yield* resolveModelClass(classes, type.class)
        return {
          sdkType: { ...typeBase(core.class.RefTo, core.string.Ref, core.icon.TypeRef), to: resolved._id },
          kind: "ref",
          classId: ObjectClassName.make(String(resolved._id))
        }
      }
    }
  })

const classLabel = (cls: MetadataClassDoc): NonEmptyString =>
  Result.getOrElse(decodeHulyModelLabelTail(cls.label), () => NonEmptyString.make(String(cls._id)))

const assertCustom = (attribute: AnyAttribute): Effect.Effect<void, HulyAttributeProtectedError> =>
  attribute.isCustom === true
    ? Effect.void
    : Effect.fail(new HulyAttributeProtectedError({ attributeId: HulyAttributeId.make(String(attribute._id)) }))

const assertUpdateAllowed = (
  attribute: AnyAttribute,
  params: UpdateHulyAttributeParams
): Effect.Effect<void, HulyAttributeProtectedError> =>
  params.hidden !== undefined &&
  params.label === undefined &&
  params.index === undefined &&
  params.automationOnly === undefined
    ? Effect.void
    : assertCustom(attribute)

const findAttributeConflict = (
  attributes: ReadonlyArray<AnyAttribute>,
  ownerClassId: ObjectClassName,
  name: string
): AnyAttribute | undefined =>
  attributes.find(
    (attribute) =>
      String(attribute.attributeOf) === ownerClassId &&
      normalizeModelIdentifier(attribute.name) === normalizeModelIdentifier(name)
  )

type ResolvedAttributeType =
  | { readonly kind: "string" | "number" | "boolean" | "date" | "markup"; readonly sdkType: AnyAttribute["type"] }
  | { readonly kind: "enum"; readonly sdkType: AnyAttribute["type"]; readonly enumId: HulyEnumId }
  | { readonly kind: "ref"; readonly sdkType: AnyAttribute["type"]; readonly classId: ObjectClassName }

const createAttributeData = (
  params: CreateHulyAttributeParams,
  ownerClassId: ObjectClassName,
  resolvedType: ResolvedAttributeType
): Data<AnyAttribute> => ({
  attributeOf: ownerClassRef(ownerClassId),
  name: params.name,
  label: getEmbeddedLabel(params.label),
  type: resolvedType.sdkType,
  isCustom: true,
  ...(params.index === undefined ? {} : { index: sdkIndex(params.index) }),
  ...(params.automationOnly === undefined
    ? {}
    : { automationOnly: params.automationOnly, readonly: params.automationOnly }),
  ...(params.hidden === undefined ? {} : { hidden: params.hidden })
})

const createdAttributeTypeSummary = (resolvedType: ResolvedAttributeType): HulyAttributeType => {
  if (resolvedType.kind === "enum") {
    return { kind: "enum", classId: ObjectClassName.make(String(core.class.EnumOf)), enumId: resolvedType.enumId }
  }
  if (resolvedType.kind === "ref") {
    return { kind: "ref", classId: ObjectClassName.make(String(core.class.RefTo)), refTo: resolvedType.classId }
  }
  return { kind: resolvedType.kind, classId: ObjectClassName.make(String(resolvedType.sdkType._class)) }
}

const createdAttributeSummary = (
  params: CreateHulyAttributeParams,
  owner: MetadataClassDoc,
  attributeId: HulyAttributeId,
  resolvedType: ResolvedAttributeType
): HulyAttributeSummary => ({
  attributeId,
  name: params.name,
  label: params.label,
  ownerClassId: ObjectClassName.make(String(owner._id)),
  ownerClassLabel: classLabel(owner),
  type: createdAttributeTypeSummary(resolvedType),
  ...(params.index === undefined ? {} : { index: sdkIndex(params.index) }),
  isCustom: true,
  ...(params.automationOnly === undefined ? {} : { automationOnly: params.automationOnly }),
  ...(params.hidden === undefined ? {} : { hidden: params.hidden }),
  inherited: false
})

const sameAttributeType = (current: HulyAttributeType, requested: ResolvedAttributeType): boolean => {
  if (requested.kind === "enum") return current.kind === "enum" && current.enumId === requested.enumId
  if (requested.kind === "ref") return current.kind === "ref" && current.refTo === requested.classId
  return current.kind === requested.kind
}

const equivalentAttribute = (
  current: HulyAttributeSummary,
  params: CreateHulyAttributeParams,
  requestedType: ResolvedAttributeType
): boolean => {
  const requestedIndex = params.index === undefined ? undefined : sdkIndex(params.index)
  return [
    current.label === params.label,
    sameAttributeType(current.type, requestedType),
    current.index === requestedIndex,
    Boolean(current.automationOnly) === Boolean(params.automationOnly),
    Boolean(current.hidden) === Boolean(params.hidden)
  ].every(Boolean)
}

export const createHulyAttribute = (
  params: CreateHulyAttributeParams
): Effect.Effect<CreateHulyAttributeResult, AttributeWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const [classes, enums, attributes] = yield* Effect.all([
      loadClasses(client),
      loadEnums(client),
      loadAttributes(client)
    ])
    const owner = yield* resolveModelClass(classes, params.class)
    const ownerClassId = ObjectClassName.make(String(owner._id))
    const existing = findAttributeConflict(attributes, ownerClassId, params.name)
    const type = yield* attributeType(params.type, classes, enums)
    if (existing !== undefined) {
      const summary = toAttributeSummary(existing, classLabel(owner), ownerClassId)
      if (equivalentAttribute(summary, params, type)) return { attribute: summary, created: false }
      return yield* new HulyAttributeNameConflictError({
        name: params.name,
        ownerClassId,
        existingAttributeId: HulyAttributeId.make(String(existing._id))
      })
    }

    const attributeId = generateId<AnyAttribute>()
    yield* client.createDoc(
      core.class.Attribute,
      core.space.Model,
      createAttributeData(params, ownerClassId, type),
      attributeId
    )
    return { attribute: createdAttributeSummary(params, owner, HulyAttributeId.make(attributeId), type), created: true }
  })

const resolveOwner = (classes: ReadonlyArray<MetadataClassDoc>, identifier: ModelIdentifier | undefined) =>
  identifier === undefined
    ? Effect.succeed(undefined)
    : resolveModelClass(classes, identifier).pipe(Effect.map((owner) => ObjectClassName.make(String(owner._id))))

const attributeUpdateOperations = (params: UpdateHulyAttributeParams): DocumentUpdate<AnyAttribute> => {
  const direct: DocumentUpdate<AnyAttribute> = {
    ...(params.label === undefined ? {} : { label: getEmbeddedLabel(params.label) }),
    ...(params.index === undefined || params.index === null ? {} : { index: sdkIndex(params.index) }),
    ...(params.automationOnly === undefined
      ? {}
      : { automationOnly: params.automationOnly, readonly: params.automationOnly }),
    ...(params.hidden === undefined ? {} : { hidden: params.hidden })
  }
  return params.index === null ? { ...direct, $unset: { index: "" } } : direct
}

const updatedAttributeSummary = (
  params: UpdateHulyAttributeParams,
  current: HulyAttributeSummary
): HulyAttributeSummary => {
  const withoutIndex = (({ index: _index, ...summary }) => summary)(current)
  const indexedSummary = params.index === null ? withoutIndex : current
  return {
    ...indexedSummary,
    ...(params.label === undefined ? {} : { label: params.label }),
    ...(params.index === undefined || params.index === null ? {} : { index: sdkIndex(params.index) }),
    ...(params.automationOnly === undefined ? {} : { automationOnly: params.automationOnly }),
    ...(params.hidden === undefined ? {} : { hidden: params.hidden })
  }
}

export const updateHulyAttribute = (
  params: UpdateHulyAttributeParams
): Effect.Effect<UpdateHulyAttributeResult, AttributeWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const [classes, attributes] = yield* Effect.all([loadClasses(client), loadAttributes(client)])
    const ownerClassId = yield* resolveOwner(classes, params.class)
    const current = yield* resolveAttribute(attributes, params.attribute, ownerClassId)
    yield* assertUpdateAllowed(current, params)
    const owner = yield* resolveModelClass(classes, params.class ?? ModelIdentifier.make(String(current.attributeOf)))
    yield* client.updateDoc(current._class, current.space, current._id, attributeUpdateOperations(params))
    const currentSummary = toAttributeSummary(current, classLabel(owner), ObjectClassName.make(String(owner._id)))
    return { attribute: updatedAttributeSummary(params, currentSummary), updated: true }
  })

export const deleteHulyAttribute = (
  params: DeleteHulyAttributeParams
): Effect.Effect<DeleteHulyAttributeResult, AttributeWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const [classes, attributes] = yield* Effect.all([loadClasses(client), loadAttributes(client)])
    const ownerClassId = yield* resolveOwner(classes, params.class)
    const current = yield* resolveAttribute(attributes, params.attribute, ownerClassId)
    yield* assertCustom(current)
    const attributeId = HulyAttributeId.make(String(current._id))
    const ownerId = ObjectClassName.make(String(current.attributeOf))
    const usage = yield* client.findOne(ownerClassRef(ownerId), hulyQuery({ [current.name]: { $exists: true } }))
    if (usage !== undefined) {
      return yield* new HulyAttributeInUseError({
        attributeId,
        ownerClassId: ownerId,
        name: NonEmptyString.make(current.name)
      })
    }
    yield* client.removeDoc(current._class, current.space, current._id)
    return { attributeId, deleted: true }
  })
