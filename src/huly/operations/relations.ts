import type { Class, Doc, DocumentUpdate, FindOptions, Ref, RelatedDocument } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type {
  AddIssueRelationParams,
  AddIssueRelationResult,
  DocumentRelationEntry,
  ListIssueRelationsParams,
  ListIssueRelationsResult,
  RelationEntry,
  RemoveIssueRelationParams,
  RemoveIssueRelationResult
} from "../../domain/schemas/relations.js"
import {
  DocumentId,
  IssueId,
  IssueIdentifier,
  type TeamspaceId,
  TeamspaceIdentifier
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { HulyModelMetadataError, type IssueNotFoundError, type ProjectNotFoundError } from "../errors.js"
import { documentPlugin, tracker } from "../huly-plugins.js"
import {
  parseHulyDocumentRelationMetadata,
  parseHulyIssueRelationMetadata,
  parseHulyRelatedDocumentMetadata,
  parseHulyTeamspaceMetadata
} from "../model-metadata.js"
import { findIssueInProject, findProject, findProjectAndIssue, parseIssueIdentifier } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type RelationError = HulyClientError | ProjectNotFoundError | IssueNotFoundError | HulyModelMetadataError

const toIssueIdentifier = (value: string): IssueIdentifier => IssueIdentifier.make(value)
const toIssueId = (value: string): IssueId => IssueId.make(value)
const toTeamspaceIdentifier = (value: string): TeamspaceIdentifier => TeamspaceIdentifier.make(value)

const blockingIssueFindOptions = {
  projection: { _id: 1, _class: 1, identifier: 1, blockedBy: 1 }
} satisfies FindOptions<HulyIssue>

const resolveTargetIssue = (
  client: HulyClient["Type"],
  sourceProject: HulyProject,
  targetIssueStr: string
): Effect.Effect<
  { issue: HulyIssue; project: HulyProject },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function* () {
    const { fullIdentifier } = parseIssueIdentifier(targetIssueStr, sourceProject.identifier)
    const match = fullIdentifier.match(/^([A-Z]+)-\d+$/i)
    const prefix = match?.[1]?.toUpperCase() ?? null

    if (prefix !== null && prefix !== sourceProject.identifier.toUpperCase()) {
      const { client: c, project: targetProject } = yield* findProject(prefix)
      const issue = yield* findIssueInProject(c, targetProject, targetIssueStr)
      return { issue, project: targetProject }
    }

    const issue = yield* findIssueInProject(client, sourceProject, targetIssueStr)
    return { issue, project: sourceProject }
  })

// RelatedDocument = Pick<Doc, '_id' | '_class'>. Ref<T> → Ref<Doc> requires cast
// because Ref is invariant on its phantom type parameter. toRef bridges the branded string.
export const makeRelatedDocEntry = (id: string, _class: Ref<Class<Doc>>): RelatedDocument => ({
  _id: toRef<Doc>(id),
  _class: toRef<Class<Doc>>(_class)
})

export const hasRelationById = (arr: Array<RelatedDocument> | undefined, id: string): boolean =>
  arr?.some((r) => r._id === toRef<Doc>(id)) ?? false

const makeRelatedDoc = (issue: HulyIssue): RelatedDocument => makeRelatedDocEntry(issue._id, tracker.class.Issue)

export const addIssueRelation = (
  params: AddIssueRelationParams
): Effect.Effect<AddIssueRelationResult, RelationError, HulyClient> =>
  Effect.gen(function* () {
    const {
      client,
      issue: source,
      project
    } = yield* findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier })
    const { issue: target, project: targetProject } = yield* resolveTargetIssue(client, project, params.targetIssue)
    const sourceMetadata = yield* parseHulyIssueRelationMetadata(source)
    const targetMetadata = yield* parseHulyIssueRelationMetadata(target)

    const result = {
      sourceIssue: sourceMetadata.identifier,
      targetIssue: targetMetadata.identifier,
      relationType: params.relationType
    }

    // DocumentUpdate<HulyIssue> cast needed on $push/$pull literals: TS cannot infer which arm
    // of the complex intersection type (Partial<Data<T>> & PushOptions<T> & ...) applies.
    /* eslint-disable no-restricted-syntax -- see above */
    switch (params.relationType) {
      case "blocks": {
        if (hasRelationById(target.blockedBy, source._id)) {
          return { ...result, added: false }
        }
        // "blocks": source blocks target. Huly stores this on the blocked issue's blockedBy array.
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $push: { blockedBy: makeRelatedDoc(source) }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, added: true }
      }
      case "is-blocked-by": {
        if (hasRelationById(source.blockedBy, target._id)) {
          return { ...result, added: false }
        }
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $push: { blockedBy: makeRelatedDoc(target) }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, added: true }
      }
      case "relates-to": {
        if (hasRelationById(source.relations, target._id)) {
          return { ...result, added: false }
        }
        // Bidirectional: push to both sides. Partial failure accepted — matches Huly UI behavior.
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $push: { relations: makeRelatedDoc(target) }
        } as DocumentUpdate<HulyIssue>)
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $push: { relations: makeRelatedDoc(source) }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, added: true }
      }
    }
    /* eslint-enable no-restricted-syntax */
  })

export const removeIssueRelation = (
  params: RemoveIssueRelationParams
): Effect.Effect<RemoveIssueRelationResult, RelationError, HulyClient> =>
  Effect.gen(function* () {
    const {
      client,
      issue: source,
      project
    } = yield* findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier })
    const { issue: target, project: targetProject } = yield* resolveTargetIssue(client, project, params.targetIssue)
    const sourceMetadata = yield* parseHulyIssueRelationMetadata(source)
    const targetMetadata = yield* parseHulyIssueRelationMetadata(target)

    const result = {
      sourceIssue: sourceMetadata.identifier,
      targetIssue: targetMetadata.identifier,
      relationType: params.relationType
    }

    /* eslint-disable no-restricted-syntax -- see above */
    switch (params.relationType) {
      case "blocks": {
        if (!hasRelationById(target.blockedBy, source._id)) {
          return { ...result, removed: false }
        }
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $pull: { blockedBy: { _id: toRef<Doc>(source._id) } }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, removed: true }
      }
      case "is-blocked-by": {
        if (!hasRelationById(source.blockedBy, target._id)) {
          return { ...result, removed: false }
        }
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $pull: { blockedBy: { _id: toRef<Doc>(target._id) } }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, removed: true }
      }
      case "relates-to": {
        if (!hasRelationById(source.relations, target._id)) {
          return { ...result, removed: false }
        }
        // Bidirectional: pull from both sides. Partial failure accepted — matches Huly UI behavior.
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $pull: { relations: { _id: toRef<Doc>(target._id) } }
        } as DocumentUpdate<HulyIssue>)
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $pull: { relations: { _id: toRef<Doc>(source._id) } }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, removed: true }
      }
    }
    /* eslint-enable no-restricted-syntax */
  })

interface PartitionedIssueRelations {
  readonly documentRelations: Array<RelatedDocument>
  readonly issueRelations: Array<RelatedDocument>
}

const partitionIssueRelations = (relations: ReadonlyArray<RelatedDocument>): PartitionedIssueRelations => {
  const documentRelations: Array<RelatedDocument> = []
  const issueRelations: Array<RelatedDocument> = []
  const documentClass = String(documentPlugin.class.Document)
  for (const relation of relations) {
    ;(String(relation._class) === documentClass ? documentRelations : issueRelations).push(relation)
  }
  return { documentRelations, issueRelations }
}

const loadIssueIdentifiers = (
  client: HulyClient["Type"],
  relations: ReadonlyArray<RelatedDocument>
): Effect.Effect<ReadonlyMap<IssueId, IssueIdentifier>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    if (relations.length === 0) return new Map<IssueId, IssueIdentifier>()
    const issues = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ _id: { $in: relations.map((relation) => toRef<HulyIssue>(relation._id)) } })
    )
    const metadata = yield* Effect.forEach(issues, parseHulyIssueRelationMetadata)
    return new Map<IssueId, IssueIdentifier>(metadata.map((issue) => [issue.id, issue.identifier]))
  })

const loadTeamspaceNames = (
  client: HulyClient["Type"],
  documents: ReadonlyArray<HulyDocument>
): Effect.Effect<ReadonlyMap<TeamspaceId, TeamspaceIdentifier>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    const spaceIds = [...new Set(documents.map((document) => document.space))]
    if (spaceIds.length === 0) return new Map<TeamspaceId, TeamspaceIdentifier>()
    const teamspaces = yield* client.findAll<HulyTeamspace>(
      documentPlugin.class.Teamspace,
      hulyQuery<HulyTeamspace>({ _id: { $in: spaceIds.map(toRef<HulyTeamspace>) } })
    )
    const metadata = yield* Effect.forEach(teamspaces, parseHulyTeamspaceMetadata)
    return new Map<TeamspaceId, TeamspaceIdentifier>(metadata.map((teamspace) => [teamspace.id, teamspace.name]))
  })

const loadDocumentRelationEntries = (
  client: HulyClient["Type"],
  relations: ReadonlyArray<RelatedDocument>
): Effect.Effect<Array<DocumentRelationEntry>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    if (relations.length === 0) return []
    const documents = yield* client.findAll<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ _id: { $in: relations.map((relation) => toRef<HulyDocument>(relation._id)) } })
    )
    const documentMetadata = yield* Effect.forEach(documents, parseHulyDocumentRelationMetadata)
    const documentsById = new Map(documents.map((document) => [String(document._id), document]))
    const metadataById = new Map(documentMetadata.map((metadata) => [String(metadata.id), metadata]))
    const teamspaceNames = yield* loadTeamspaceNames(client, documents)
    return yield* Effect.forEach(relations, (relation) =>
      Effect.gen(function* () {
        const relationMetadata = yield* parseHulyRelatedDocumentMetadata(relation)
        const document = documentsById.get(String(relation._id))
        const metadata = metadataById.get(String(relation._id))
        const documentId = yield* Schema.decodeUnknown(DocumentId)(relationMetadata.id).pipe(
          Effect.mapError(() => new HulyModelMetadataError({ model: "RelatedDocument", field: "_id" }))
        )
        return {
          title: document?.title ?? String(relation._id),
          teamspace: toTeamspaceIdentifier(
            document === undefined || metadata === undefined
              ? String(relation._id)
              : (teamspaceNames.get(metadata.teamspaceId) ?? String(metadata.teamspaceId))
          ),
          _id: documentId,
          _class: relationMetadata.class
        }
      })
    )
  })

export const listIssueRelations = (
  params: ListIssueRelationsParams
): Effect.Effect<ListIssueRelationsResult, RelationError, HulyClient> =>
  Effect.gen(function* () {
    const { client, issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.issueIdentifier
    })
    yield* parseHulyIssueRelationMetadata(issue)

    const blockedByRefs = issue.blockedBy ?? []
    const relationsRefs = issue.relations ?? []
    const blockedByMetadata = yield* Effect.forEach(blockedByRefs, parseHulyRelatedDocumentMetadata)
    const relationsMetadata = yield* Effect.forEach(relationsRefs, parseHulyRelatedDocumentMetadata)

    const { documentRelations, issueRelations } = partitionIssueRelations(relationsRefs)

    // Resolve issue refs (blockedBy are always issues; issueRelationsRefs are issue relations)
    const idToIdentifier = yield* loadIssueIdentifiers(client, [...blockedByRefs, ...issueRelations])

    const toEntry = (metadata: (typeof blockedByMetadata)[number]): RelationEntry => {
      const id = toIssueId(metadata.id)
      return { identifier: toIssueIdentifier(idToIdentifier.get(id) ?? String(id)), _id: id, _class: metadata.class }
    }

    // Huly stores "source blocks target" on the target issue as a RelatedDocument
    // in `blockedBy`. Live local-Huly verification for PR #48 showed that querying
    // `{ "blockedBy._id": issue._id }` returns no rows, so the implementation uses
    // the stored shape directly and keeps the exact-id filter below as a guard.
    const blockingIssueCandidates = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ blockedBy: makeRelatedDoc(issue) }),
      blockingIssueFindOptions
    )
    const blocks = yield* Effect.forEach(
      blockingIssueCandidates.filter(
        (candidate) => candidate._id !== issue._id && hasRelationById(candidate.blockedBy, issue._id)
      ),
      (candidate): Effect.Effect<RelationEntry, HulyModelMetadataError> =>
        Effect.map(parseHulyIssueRelationMetadata(candidate), (metadata) => ({
          identifier: metadata.identifier,
          _id: metadata.id,
          _class: metadata.class
        }))
    )

    const documents = yield* loadDocumentRelationEntries(client, documentRelations)

    const blockedBy = blockedByMetadata.map(toEntry)
    const issueRelationIds = new Set(issueRelations.map((relation) => String(relation._id)))
    const relationEntries = relationsMetadata
      .filter((metadata) => issueRelationIds.has(String(metadata.id)))
      .map(toEntry)
    return { blockedBy, blocks, relations: relationEntries, documents }
  })
