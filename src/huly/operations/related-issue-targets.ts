import type { Class, Data, Doc, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { Project as HulyProject, RelatedIssueTarget as HulyRelatedIssueTarget } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  DeleteRelatedIssueSpaceTargetParams,
  DeleteRelatedIssueSpaceTargetResult,
  ListRelatedIssueTargetsParams,
  ListRelatedIssueTargetsResult,
  RelatedIssueTarget,
  RelatedIssueTargetRule,
  SetRelatedIssueTargetParams,
  SetRelatedIssueTargetResult
} from "../../domain/schemas/related-issue-targets.js"
import { RelatedIssueTargetId } from "../../domain/schemas/related-issue-targets.js"
import { ObjectClassName, ProjectIdentifier, SpaceId, SpaceIdentifier, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { ProjectNotFoundError, SpaceIdentifierAmbiguousError, SpaceNotFoundError } from "../errors.js"
import { HulyError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { listTotal } from "./counts.js"
import { findProject } from "./issues-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import { findSpace, type GenericSpace, spaceClass } from "./spaces-shared.js"

type RelatedIssueTargetError =
  | HulyClientError
  | ProjectNotFoundError
  | SpaceIdentifierAmbiguousError
  | SpaceNotFoundError
  | HulyError

type RelatedIssueTargetProjection = Pick<HulyRelatedIssueTarget, "_id" | "rule" | "space" | "modifiedOn"> & {
  readonly target?: HulyRelatedIssueTarget["target"] | undefined
  readonly createdOn?: HulyRelatedIssueTarget["createdOn"] | undefined
}

type RelatedIssueTargetQuery = StrictDocumentQuery<HulyRelatedIssueTarget> & {
  "rule.kind"?: HulyRelatedIssueTarget["rule"]["kind"]
  "rule.space"?: Ref<Space>
  "rule.ofClass"?: Ref<Class<Doc>>
}

const projectMapById = (
  client: HulyClient["Type"],
  ids: ReadonlyArray<Ref<HulyProject>>
): Effect.Effect<ReadonlyMap<Ref<HulyProject>, HulyProject>, HulyClientError> =>
  Effect.gen(function* () {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return new Map<Ref<HulyProject>, HulyProject>()
    const projects = yield* client.findAll<HulyProject>(
      tracker.class.Project,
      hulyQuery<HulyProject>({ _id: { $in: uniqueIds } }),
      { limit: uniqueIds.length }
    )
    const entries = projects.map((project): readonly [Ref<HulyProject>, HulyProject] => [project._id, project])
    return new Map<Ref<HulyProject>, HulyProject>(entries)
  })

const spaceMapById = (
  client: HulyClient["Type"],
  ids: ReadonlyArray<Ref<Space>>
): Effect.Effect<ReadonlyMap<Ref<Space>, GenericSpace>, HulyClientError> =>
  Effect.gen(function* () {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return new Map<Ref<Space>, GenericSpace>()
    const spaces = yield* client.findAll<GenericSpace>(
      spaceClass,
      hulyQuery<GenericSpace>({ _id: { $in: uniqueIds.map(toRef<GenericSpace>) } }),
      { limit: uniqueIds.length }
    )
    const entries = spaces.map((space): readonly [Ref<Space>, GenericSpace] => [toRef<Space>(space._id), space])
    return new Map<Ref<Space>, GenericSpace>(entries)
  })

const ruleResult = (
  target: RelatedIssueTargetProjection,
  spaces: ReadonlyMap<Ref<Space>, GenericSpace>
): RelatedIssueTargetRule => {
  if (target.rule.kind === "classRule") {
    return { kind: "classRule", objectClass: ObjectClassName.make(target.rule.ofClass) }
  }

  const space = spaces.get(target.rule.space)
  return {
    kind: "spaceRule",
    spaceId: SpaceId.make(target.rule.space),
    spaceName: space === undefined ? undefined : SpaceIdentifier.make(space.name),
    spaceClass: space === undefined ? undefined : ObjectClassName.make(space._class)
  }
}

const targetResult = (
  target: RelatedIssueTargetProjection,
  projects: ReadonlyMap<Ref<HulyProject>, HulyProject>,
  spaces: ReadonlyMap<Ref<Space>, GenericSpace>
): RelatedIssueTarget => ({
  targetId: RelatedIssueTargetId.make(target._id),
  rule: ruleResult(target, spaces),
  targetProject:
    target.target === undefined || target.target === null
      ? null
      : ProjectIdentifier.make(projects.get(target.target)?.identifier ?? String(target.target)),
  createdOn: target.createdOn === undefined ? undefined : Timestamp.make(target.createdOn),
  modifiedOn: Timestamp.make(target.modifiedOn)
})

const resolveTargetProject = (
  project: ProjectIdentifier | null
): Effect.Effect<Ref<HulyProject> | null, ProjectNotFoundError | HulyClientError, HulyClient> =>
  project === null
    ? Effect.succeed(null)
    : findProject(project).pipe(Effect.map(({ project: resolved }) => resolved._id))

const findSpaceRule = (
  client: HulyClient["Type"],
  space: Ref<Space>
): Effect.Effect<HulyRelatedIssueTarget | undefined, HulyClientError> => {
  // Huly document queries support dot-path predicates for nested object fields.
  const query: RelatedIssueTargetQuery = { "rule.kind": "spaceRule", "rule.space": space }
  return client.findOne<HulyRelatedIssueTarget>(
    tracker.class.RelatedIssueTarget,
    hulyQuery<HulyRelatedIssueTarget>(query)
  )
}

const findClassRule = (
  client: HulyClient["Type"],
  objectClass: Ref<Class<Doc>>
): Effect.Effect<HulyRelatedIssueTarget | undefined, HulyClientError> => {
  // Huly document queries support dot-path predicates for nested object fields.
  const query: RelatedIssueTargetQuery = { "rule.kind": "classRule", "rule.ofClass": objectClass }
  return client.findOne<HulyRelatedIssueTarget>(
    tracker.class.RelatedIssueTarget,
    hulyQuery<HulyRelatedIssueTarget>(query)
  )
}

const renderSingleTarget = (
  client: HulyClient["Type"],
  target: RelatedIssueTargetProjection
): Effect.Effect<RelatedIssueTarget, HulyClientError> =>
  Effect.gen(function* () {
    const projects = yield* projectMapById(
      client,
      target.target === undefined || target.target === null ? [] : [target.target]
    )
    const spaces = yield* spaceMapById(client, target.rule.kind === "spaceRule" ? [target.rule.space] : [])
    return targetResult(target, projects, spaces)
  })

export const listRelatedIssueTargets = (
  params: ListRelatedIssueTargetsParams
): Effect.Effect<ListRelatedIssueTargetsResult, RelatedIssueTargetError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const query: RelatedIssueTargetQuery = {}
    if (params.space !== undefined) {
      const space = yield* findSpace(client, { space: params.space, includeArchived: true })
      query["rule.kind"] = "spaceRule"
      query["rule.space"] = toRef<Space>(space._id)
    }
    if (params.objectClass !== undefined) {
      query["rule.kind"] = "classRule"
      query["rule.ofClass"] = toClassRef<Doc>(params.objectClass)
    }

    const targets = yield* client.findAll<HulyRelatedIssueTarget>(
      tracker.class.RelatedIssueTarget,
      hulyQuery<HulyRelatedIssueTarget>(query),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    const targetProjectIds = targets.flatMap((target) =>
      target.target === undefined || target.target === null ? [] : [target.target]
    )
    const spaceIds = targets.flatMap((target) => (target.rule.kind === "spaceRule" ? [target.rule.space] : []))
    const projects = yield* projectMapById(client, targetProjectIds)
    const spaces = yield* spaceMapById(client, spaceIds)

    return { targets: targets.map((target) => targetResult(target, projects, spaces)), total: listTotal(targets.total) }
  })

export const setRelatedIssueTarget = (
  params: SetRelatedIssueTargetParams
): Effect.Effect<SetRelatedIssueTargetResult, RelatedIssueTargetError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const targetProject = yield* resolveTargetProject(params.targetProject)
    if (params.space !== undefined) {
      const space = yield* findSpace(client, { space: params.space, includeArchived: true })
      const existing = yield* findSpaceRule(client, toRef<Space>(space._id))
      if (existing === undefined) {
        const targetId: Ref<HulyRelatedIssueTarget> = generateId()
        const data: Data<HulyRelatedIssueTarget> = {
          target: targetProject,
          rule: { kind: "spaceRule", space: toRef<Space>(space._id) }
        }
        yield* client.createDoc(tracker.class.RelatedIssueTarget, toRef<Space>(space._id), data, targetId)
        const createdTarget: RelatedIssueTargetProjection = {
          _id: targetId,
          modifiedOn: 0,
          rule: data.rule,
          space: toRef<Space>(space._id),
          target: data.target
        }
        return { target: yield* renderSingleTarget(client, createdTarget), created: true }
      }

      const update: DocumentUpdate<HulyRelatedIssueTarget> = { target: targetProject }
      yield* client.updateDoc(tracker.class.RelatedIssueTarget, toRef<Space>(existing.space), existing._id, update)
      return { target: yield* renderSingleTarget(client, { ...existing, ...update }), created: false }
    }

    const objectClassParam = params.objectClass
    /* v8 ignore next -- defensive only: SetRelatedIssueTargetParamsSchema requires space or objectClass. */
    if (objectClassParam === undefined) {
      return yield* new HulyError({ message: "Provide one of space or objectClass." })
    }
    const objectClass = toClassRef<Doc>(objectClassParam)
    const existing = yield* findClassRule(client, objectClass)
    if (existing === undefined) {
      return yield* new HulyError({
        message: `Related issue classRule for '${objectClassParam}' was not found. This tool does not create classRule targets.`
      })
    }
    const update: DocumentUpdate<HulyRelatedIssueTarget> = { target: targetProject }
    yield* client.updateDoc(tracker.class.RelatedIssueTarget, toRef<Space>(existing.space), existing._id, update)
    return { target: yield* renderSingleTarget(client, { ...existing, ...update }), created: false }
  })

export const deleteRelatedIssueSpaceTarget = (
  params: DeleteRelatedIssueSpaceTargetParams
): Effect.Effect<DeleteRelatedIssueSpaceTargetResult, RelatedIssueTargetError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const space = yield* findSpace(client, { space: params.space, includeArchived: true })
    const existing = yield* findSpaceRule(client, toRef<Space>(space._id))
    if (existing === undefined) {
      return yield* new HulyError({ message: `Related issue spaceRule for space '${params.space}' was not found.` })
    }
    yield* client.removeDoc(tracker.class.RelatedIssueTarget, toRef<Space>(existing.space), existing._id)
    return { targetId: RelatedIssueTargetId.make(existing._id), deleted: true }
  })
