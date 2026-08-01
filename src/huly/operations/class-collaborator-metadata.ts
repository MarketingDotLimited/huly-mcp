import type { AnyAttribute, ClassCollaborators, Data, Doc } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect, Either } from "effect"

import type {
  DeleteClassCollaboratorMetadataParams,
  DeleteClassCollaboratorMetadataResult,
  GetClassCollaboratorMetadataParams,
  GetClassCollaboratorMetadataResult,
  SetClassCollaboratorMetadataParams,
  SetClassCollaboratorMetadataResult
} from "../../domain/schemas/security-administration.js"
import { ClassCollaboratorMetadataId, CollaboratorFieldName } from "../../domain/schemas/security-administration.js"
import { NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  ClassCollaboratorMetadataNotFoundError,
  CollaboratorFieldNotFoundError,
  CollaboratorMetadataAmbiguousError
} from "../errors-security-administration.js"
import type { ModelClassAmbiguousError, ModelClassNotFoundError } from "../errors-model-administration.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { core } from "../huly-plugins.js"
import { loadClasses, resolveModelClass } from "./model-administration-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef } from "./sdk-boundary.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"

type DynamicClassDoc = Doc & Readonly<Record<string, unknown>>
type ClassCollaboratorRecord = ClassCollaborators<DynamicClassDoc>
type CollaboratorMetadataWriteError =
  | HulyClientError
  | ClassCollaboratorMetadataNotFoundError
  | CollaboratorFieldNotFoundError
  | CollaboratorMetadataAmbiguousError
  | ModelClassAmbiguousError
  | ModelClassNotFoundError

const loadDirectCollaboratorMetadata = (
  client: HulyClient["Type"],
  classId: ObjectClassName
): Effect.Effect<ClassCollaboratorRecord | undefined, HulyClientError | CollaboratorMetadataAmbiguousError> =>
  Effect.gen(function* () {
    const records = yield* client.findAll<ClassCollaboratorRecord>(
      core.class.ClassCollaborators,
      hulyQuery<ClassCollaboratorRecord>({ attachedTo: toClassRef<DynamicClassDoc>(classId) }),
      { limit: 2 }
    )
    if (records.length > 1) {
      return yield* new CollaboratorMetadataAmbiguousError({
        classId,
        metadataIds: records.map((record) => ClassCollaboratorMetadataId.make(String(record._id)))
      })
    }
    return records[0]
  })

const classIdentity = (cls: MetadataClassDoc) => ({
  classId: ObjectClassName.make(String(cls._id)),
  classLabel: Either.getOrElse(decodeHulyModelLabelTail(cls.label), () =>
    Either.getOrElse(decodeHulyModelLabelTail(String(cls._id)), () => NonEmptyString.make(String(cls._id)))
  )
})

const collaboratorFieldSelection = (metadata: ClassCollaboratorRecord) => {
  if (metadata.allFields === true) return { mode: "all" as const }
  if (metadata.fields.length === 0) return { mode: "none" as const }
  return { mode: "fields" as const, fields: metadata.fields.map((field) => CollaboratorFieldName.make(String(field))) }
}

const collaboratorMetadataSummary = (metadata: ClassCollaboratorRecord, cls: MetadataClassDoc) => ({
  metadataId: ClassCollaboratorMetadataId.make(String(metadata._id)),
  ...classIdentity(cls),
  fieldSelection: collaboratorFieldSelection(metadata),
  provideSecurity: metadata.provideSecurity === true,
  provideAttachedSecurity: metadata.provideAttachedSecurity === true
})

const resolveCollaboratorClass = (
  client: HulyClient["Type"],
  identifier: GetClassCollaboratorMetadataParams["class"]
) =>
  Effect.gen(function* () {
    const classes = yield* loadClasses(client)
    const cls = yield* resolveModelClass(classes, identifier)
    return { classes, cls }
  })

export const getClassCollaboratorMetadata = (
  params: GetClassCollaboratorMetadataParams
): Effect.Effect<GetClassCollaboratorMetadataResult, CollaboratorMetadataWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const { cls } = yield* resolveCollaboratorClass(client, params.class)
    const metadata = yield* loadDirectCollaboratorMetadata(client, ObjectClassName.make(String(cls._id)))
    return metadata === undefined
      ? { ...classIdentity(cls), configured: false as const }
      : { ...collaboratorMetadataSummary(metadata, cls), configured: true as const }
  })

const classAncestorIds = (
  classes: ReadonlyArray<MetadataClassDoc>,
  cls: MetadataClassDoc
): ReadonlySet<ObjectClassName> => {
  const classesById = new Map(classes.map((candidate) => [String(candidate._id), candidate]))
  const ancestors = new Set<ObjectClassName>()
  const visit = (candidate: MetadataClassDoc): void => {
    const id = ObjectClassName.make(String(candidate._id))
    if (ancestors.has(id)) return
    ancestors.add(id)
    if (typeof candidate.extends !== "string") return
    const parent = classesById.get(candidate.extends)
    if (parent !== undefined) visit(parent)
  }
  visit(cls)
  return ancestors
}

const collaboratorFields = (params: SetClassCollaboratorMetadataParams): ReadonlyArray<CollaboratorFieldName> =>
  params.fieldSelection.mode === "fields" ? params.fieldSelection.fields : []

const assertCollaboratorFieldsExist = (
  classes: ReadonlyArray<MetadataClassDoc>,
  cls: MetadataClassDoc,
  attributes: ReadonlyArray<AnyAttribute>,
  fields: ReadonlyArray<CollaboratorFieldName>
): Effect.Effect<void, CollaboratorFieldNotFoundError> => {
  const ancestorIds = classAncestorIds(classes, cls)
  const knownFields = new Set(
    attributes
      .filter((attribute) => ancestorIds.has(ObjectClassName.make(String(attribute.attributeOf))))
      .map((attribute) => attribute.name)
  )
  const missing = fields.filter((field) => !knownFields.has(field))
  return missing.length === 0
    ? Effect.void
    : Effect.fail(
        new CollaboratorFieldNotFoundError({ classId: ObjectClassName.make(String(cls._id)), fields: missing })
      )
}

const collaboratorMetadataData = (
  cls: MetadataClassDoc,
  params: SetClassCollaboratorMetadataParams
): Data<ClassCollaboratorRecord> => ({
  attachedTo: toClassRef<DynamicClassDoc>(String(cls._id)),
  allFields: params.fieldSelection.mode === "all",
  fields: Array.from(collaboratorFields(params)),
  provideSecurity: params.provideSecurity === true,
  provideAttachedSecurity: params.provideAttachedSecurity === true
})

export const setClassCollaboratorMetadata = (
  params: SetClassCollaboratorMetadataParams
): Effect.Effect<SetClassCollaboratorMetadataResult, CollaboratorMetadataWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const [{ classes, cls }, attributes] = yield* Effect.all([
      resolveCollaboratorClass(client, params.class),
      client.findAll<AnyAttribute>(core.class.Attribute, hulyQuery<AnyAttribute>({}))
    ])
    const fields = collaboratorFields(params)
    yield* assertCollaboratorFieldsExist(classes, cls, attributes, fields)
    const classId = ObjectClassName.make(String(cls._id))
    const current = yield* loadDirectCollaboratorMetadata(client, classId)
    const data = collaboratorMetadataData(cls, params)
    if (current === undefined) {
      const metadataId = generateId<ClassCollaboratorRecord>()
      yield* client.createDoc(core.class.ClassCollaborators, core.space.Model, data, metadataId)
      const createdMetadata: ClassCollaboratorRecord = {
        _id: metadataId,
        _class: core.class.ClassCollaborators,
        space: core.space.Model,
        modifiedBy: client.getPrimarySocialId(),
        modifiedOn: 0,
        ...data
      }
      return { metadata: collaboratorMetadataSummary(createdMetadata, cls), created: true }
    }
    const { attachedTo: _attachedTo, ...operations } = data
    yield* client.updateDoc(current._class, current.space, current._id, operations)
    return { metadata: collaboratorMetadataSummary({ ...current, ...data }, cls), created: false }
  })

export const deleteClassCollaboratorMetadata = (
  params: DeleteClassCollaboratorMetadataParams
): Effect.Effect<DeleteClassCollaboratorMetadataResult, CollaboratorMetadataWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const { cls } = yield* resolveCollaboratorClass(client, params.class)
    const classId = ObjectClassName.make(String(cls._id))
    const current = yield* loadDirectCollaboratorMetadata(client, classId)
    if (current === undefined) return yield* new ClassCollaboratorMetadataNotFoundError({ classId })
    yield* client.removeDoc(current._class, current.space, current._id)
    return { metadataId: ClassCollaboratorMetadataId.make(String(current._id)), classId, deleted: true }
  })
