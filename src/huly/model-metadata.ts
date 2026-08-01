import { Effect, Schema } from "effect"

import { AssociationRoleName } from "../domain/schemas/generic-associations.js"
import {
  AssociationId,
  DocId,
  DocumentId,
  IssueId,
  IssueIdentifier,
  ObjectClassName,
  RelationId,
  TeamspaceId,
  TeamspaceIdentifier
} from "../domain/schemas/shared.js"
import { type HulyModelField, HulyModelMetadataError, type HulyModelName } from "./errors-base.js"

const AssociationCardinalitySchema = Schema.Literal("1:1", "1:N", "N:N")

const HulyAssociationMetadataSchema = Schema.Struct({
  id: AssociationId,
  sourceClass: ObjectClassName,
  targetClass: ObjectClassName,
  sourceRole: AssociationRoleName,
  targetRole: AssociationRoleName,
  cardinality: AssociationCardinalitySchema,
  automationOnly: Schema.optionalWith(Schema.Boolean, { exact: true })
})
export type HulyAssociationMetadata = Schema.Schema.Type<typeof HulyAssociationMetadataSchema>

const HulyRelationMetadataSchema = Schema.Struct({
  id: RelationId,
  associationId: AssociationId,
  sourceId: DocId,
  targetId: DocId
})
export type HulyRelationMetadata = Schema.Schema.Type<typeof HulyRelationMetadataSchema>

export interface ParsedHulyMetadata<T, M> {
  readonly doc: T
  readonly metadata: M
}

const HulyRelatedDocumentMetadataSchema = Schema.Struct({ id: DocId, class: ObjectClassName })
export type HulyRelatedDocumentMetadata = Schema.Schema.Type<typeof HulyRelatedDocumentMetadataSchema>

const HulyIssueRelationMetadataSchema = Schema.Struct({
  id: IssueId,
  identifier: IssueIdentifier,
  class: ObjectClassName
})
type HulyIssueRelationMetadata = Schema.Schema.Type<typeof HulyIssueRelationMetadataSchema>

const HulyDocumentRelationMetadataSchema = Schema.Struct({
  id: DocumentId,
  class: ObjectClassName,
  teamspaceId: TeamspaceId
})
export type HulyDocumentRelationMetadata = Schema.Schema.Type<typeof HulyDocumentRelationMetadataSchema>

const HulyTeamspaceMetadataSchema = Schema.Struct({ id: TeamspaceId, name: TeamspaceIdentifier })
type HulyTeamspaceMetadata = Schema.Schema.Type<typeof HulyTeamspaceMetadataSchema>

const HulyObjectMetadataSchema = Schema.Struct({ id: DocId, class: ObjectClassName })
type HulyObjectMetadata = Schema.Schema.Type<typeof HulyObjectMetadataSchema>

const parseField = <A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown,
  model: HulyModelName,
  field: HulyModelField
): Effect.Effect<A, HulyModelMetadataError> =>
  Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(() => new HulyModelMetadataError({ model, field })))

interface AssociationMetadataInput {
  readonly _id: unknown
  readonly classA: unknown
  readonly classB: unknown
  readonly nameA: unknown
  readonly nameB: unknown
  readonly type: unknown
  readonly automationOnly?: unknown
}

export const parseHulyAssociationMetadata = (
  input: AssociationMetadataInput
): Effect.Effect<HulyAssociationMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    const automationOnly =
      input.automationOnly === undefined
        ? undefined
        : yield* parseField(Schema.Boolean, input.automationOnly, "Association", "automationOnly")
    return {
      id: yield* parseField(AssociationId, input._id, "Association", "_id"),
      sourceClass: yield* parseField(ObjectClassName, input.classA, "Association", "classA"),
      targetClass: yield* parseField(ObjectClassName, input.classB, "Association", "classB"),
      sourceRole: yield* parseField(AssociationRoleName, input.nameA, "Association", "nameA"),
      targetRole: yield* parseField(AssociationRoleName, input.nameB, "Association", "nameB"),
      cardinality: yield* parseField(AssociationCardinalitySchema, input.type, "Association", "type"),
      ...(automationOnly === undefined ? {} : { automationOnly })
    }
  })

export const parseHulyAssociation = <T extends AssociationMetadataInput>(
  input: T
): Effect.Effect<ParsedHulyMetadata<T, HulyAssociationMetadata>, HulyModelMetadataError> =>
  Effect.map(parseHulyAssociationMetadata(input), (metadata) => ({ doc: input, metadata }))

export const parseHulyRelationMetadata = (input: {
  readonly _id: unknown
  readonly association: unknown
  readonly docA: unknown
  readonly docB: unknown
}): Effect.Effect<HulyRelationMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    return {
      id: yield* parseField(RelationId, input._id, "Relation", "_id"),
      associationId: yield* parseField(AssociationId, input.association, "Relation", "association"),
      sourceId: yield* parseField(DocId, input.docA, "Relation", "docA"),
      targetId: yield* parseField(DocId, input.docB, "Relation", "docB")
    }
  })

export const parseHulyRelation = <
  T extends { readonly _id: unknown; readonly association: unknown; readonly docA: unknown; readonly docB: unknown }
>(
  input: T
): Effect.Effect<ParsedHulyMetadata<T, HulyRelationMetadata>, HulyModelMetadataError> =>
  Effect.map(parseHulyRelationMetadata(input), (metadata) => ({ doc: input, metadata }))

export const parseHulyCreatedRelationId = (value: unknown): Effect.Effect<RelationId, HulyModelMetadataError> =>
  parseField(RelationId, value, "Relation", "_id")

export const parseHulyRelatedDocumentMetadata = (input: {
  readonly _id: unknown
  readonly _class: unknown
}): Effect.Effect<HulyRelatedDocumentMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    return {
      id: yield* parseField(DocId, input._id, "RelatedDocument", "_id"),
      class: yield* parseField(ObjectClassName, input._class, "RelatedDocument", "_class")
    }
  })

export const parseHulyIssueRelationMetadata = (input: {
  readonly _id: unknown
  readonly identifier: unknown
  readonly _class: unknown
}): Effect.Effect<HulyIssueRelationMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    return {
      id: yield* parseField(IssueId, input._id, "Issue", "_id"),
      identifier: yield* parseField(IssueIdentifier, input.identifier, "Issue", "identifier"),
      class: yield* parseField(ObjectClassName, input._class, "Issue", "_class")
    }
  })

export const parseHulyDocumentRelationMetadata = (input: {
  readonly _id: unknown
  readonly _class: unknown
  readonly space: unknown
}): Effect.Effect<HulyDocumentRelationMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    return {
      id: yield* parseField(DocumentId, input._id, "Document", "_id"),
      class: yield* parseField(ObjectClassName, input._class, "Document", "_class"),
      teamspaceId: yield* parseField(TeamspaceId, input.space, "Document", "space")
    }
  })

export const parseHulyTeamspaceMetadata = (input: {
  readonly _id: unknown
  readonly name: unknown
}): Effect.Effect<HulyTeamspaceMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    return {
      id: yield* parseField(TeamspaceId, input._id, "Teamspace", "_id"),
      name: yield* parseField(TeamspaceIdentifier, input.name, "Teamspace", "name")
    }
  })

export const parseHulyObjectMetadata = (input: {
  readonly _id: unknown
  readonly _class: unknown
}): Effect.Effect<HulyObjectMetadata, HulyModelMetadataError> =>
  Effect.gen(function* () {
    return {
      id: yield* parseField(DocId, input._id, "Object", "_id"),
      class: yield* parseField(ObjectClassName, input._class, "Object", "_class")
    }
  })
