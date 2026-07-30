import type { Class, Doc, DocumentUpdate, FindOptions, Ref, RelatedDocument } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

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
  ObjectClassName,
  TeamspaceId,
  TeamspaceIdentifier
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { documentPlugin, tracker } from "../huly-plugins.js"
import { findIssueInProject, findProject, findProjectAndIssue, parseIssueIdentifier } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type RelationError = HulyClientError | ProjectNotFoundError | IssueNotFoundError

const toIssueIdentifier = (value: string): IssueIdentifier => IssueIdentifier.make(value)
const toIssueId = (value: string): IssueId => IssueId.make(value)
const toObjectClassName = (value: string): ObjectClassName => ObjectClassName.make(value)
const toTeamspaceIdentifier = (value: string): TeamspaceIdentifier => TeamspaceIdentifier.make(value)
const toDocumentId = (value: string): DocumentId => DocumentId.make(value)

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

    const result = {
      sourceIssue: toIssueIdentifier(source.identifier),
      targetIssue: toIssueIdentifier(target.identifier),
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

    const result = {
      sourceIssue: toIssueIdentifier(source.identifier),
      targetIssue: toIssueIdentifier(target.identifier),
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
): Effect.Effect<ReadonlyMap<IssueId, IssueIdentifier>, HulyClientError> =>
  Effect.gen(function* () {
    if (relations.length === 0) return new Map<IssueId, IssueIdentifier>()
    const issues = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ _id: { $in: relations.map((relation) => toRef<HulyIssue>(relation._id)) } })
    )
    return new Map<IssueId, IssueIdentifier>(
      issues.map((issue) => [IssueId.make(issue._id), IssueIdentifier.make(issue.identifier)])
    )
  })

const loadTeamspaceNames = (
  client: HulyClient["Type"],
  documents: ReadonlyArray<HulyDocument>
): Effect.Effect<ReadonlyMap<TeamspaceId, TeamspaceIdentifier>, HulyClientError> =>
  Effect.gen(function* () {
    const spaceIds = [...new Set(documents.map((document) => document.space))]
    if (spaceIds.length === 0) return new Map<TeamspaceId, TeamspaceIdentifier>()
    const teamspaces = yield* client.findAll<HulyTeamspace>(
      documentPlugin.class.Teamspace,
      hulyQuery<HulyTeamspace>({ _id: { $in: spaceIds.map(toRef<HulyTeamspace>) } })
    )
    return new Map<TeamspaceId, TeamspaceIdentifier>(
      teamspaces.map((teamspace) => [TeamspaceId.make(teamspace._id), TeamspaceIdentifier.make(teamspace.name)])
    )
  })

const loadDocumentRelationEntries = (
  client: HulyClient["Type"],
  relations: ReadonlyArray<RelatedDocument>
): Effect.Effect<Array<DocumentRelationEntry>, HulyClientError> =>
  Effect.gen(function* () {
    if (relations.length === 0) return []
    const documents = yield* client.findAll<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ _id: { $in: relations.map((relation) => toRef<HulyDocument>(relation._id)) } })
    )
    const documentsById = new Map(documents.map((document) => [String(document._id), document]))
    const teamspaceNames = yield* loadTeamspaceNames(client, documents)
    return relations.map((relation) => {
      const document = documentsById.get(String(relation._id))
      return {
        title: document?.title ?? String(relation._id),
        teamspace: toTeamspaceIdentifier(
          document === undefined
            ? String(relation._id)
            : (teamspaceNames.get(TeamspaceId.make(document.space)) ?? String(document.space))
        ),
        _id: toDocumentId(String(relation._id)),
        _class: toObjectClassName(String(relation._class))
      }
    })
  })

export const listIssueRelations = (
  params: ListIssueRelationsParams
): Effect.Effect<ListIssueRelationsResult, RelationError, HulyClient> =>
  Effect.gen(function* () {
    const { client, issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.issueIdentifier
    })

    const blockedByRefs = issue.blockedBy ?? []
    const relationsRefs = issue.relations ?? []

    const { documentRelations, issueRelations } = partitionIssueRelations(relationsRefs)

    // Resolve issue refs (blockedBy are always issues; issueRelationsRefs are issue relations)
    const idToIdentifier = yield* loadIssueIdentifiers(client, [...blockedByRefs, ...issueRelations])

    const toEntry = (r: RelatedDocument): RelationEntry => ({
      identifier: toIssueIdentifier(idToIdentifier.get(IssueId.make(r._id)) ?? String(r._id)),
      _id: toIssueId(String(r._id)),
      _class: toObjectClassName(String(r._class))
    })

    const toIssueEntry = (i: HulyIssue): RelationEntry => ({
      identifier: toIssueIdentifier(i.identifier),
      _id: toIssueId(String(i._id)),
      _class: toObjectClassName(String(i._class))
    })

    // Huly stores "source blocks target" on the target issue as a RelatedDocument
    // in `blockedBy`. Live local-Huly verification for PR #48 showed that querying
    // `{ "blockedBy._id": issue._id }` returns no rows, so the implementation uses
    // the stored shape directly and keeps the exact-id filter below as a guard.
    const blockingIssueCandidates = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ blockedBy: makeRelatedDoc(issue) }),
      blockingIssueFindOptions
    )
    const blocks = blockingIssueCandidates
      .filter((candidate) => candidate._id !== issue._id && hasRelationById(candidate.blockedBy, issue._id))
      .map(toIssueEntry)

    const documents = yield* loadDocumentRelationEntries(client, documentRelations)

    return { blockedBy: blockedByRefs.map(toEntry), blocks, relations: issueRelations.map(toEntry), documents }
  })
