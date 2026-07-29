import { Clock, Effect } from "effect"

import { type Data, type DocumentUpdate, generateId, type Ref, SortingOrder, type Space } from "@hcengineering/core"
import type {
  Project as HulyProject,
  ProjectTargetPreference as HulyProjectTargetPreference
} from "@hcengineering/tracker"

import type {
  ListProjectTargetPreferencesParams,
  ListProjectTargetPreferencesResult,
  ProjectTargetPreference,
  ProjectTargetPreferenceProperty,
  UpsertProjectTargetPreferenceParams,
  UpsertProjectTargetPreferenceResult
} from "../../domain/schemas/project-target-preferences.js"
import {
  ProjectTargetPreferenceId,
  TrackerPreferencePropertyKey
} from "../../domain/schemas/project-target-preferences.js"
import { ProjectIdentifier, SpaceId, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { ProjectNotFoundError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { listTotal } from "./counts.js"
import { findProject } from "./issues-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ListProjectTargetPreferencesError = HulyClientError | ProjectNotFoundError
type UpsertProjectTargetPreferenceError = HulyClientError | ProjectNotFoundError

type ProjectTargetPreferenceProjection = Pick<HulyProjectTargetPreference, "_id" | "attachedTo" | "usedOn"> & {
  readonly props?: HulyProjectTargetPreference["props"] | undefined
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

const preferenceResult = (
  preference: ProjectTargetPreferenceProjection,
  project: HulyProject | undefined
): ProjectTargetPreference => ({
  preferenceId: ProjectTargetPreferenceId.make(preference._id),
  attachedTo: SpaceId.make(preference.attachedTo),
  project: project === undefined ? undefined : ProjectIdentifier.make(project.identifier),
  usedOn: Timestamp.make(preference.usedOn),
  props: (preference.props ?? []).map((prop) => ({
    key: TrackerPreferencePropertyKey.make(prop.key),
    value: prop.value
  }))
})

const propertyKey = (property: ProjectTargetPreferenceProperty): string => property.key

const mergeProps = (
  current: ReadonlyArray<{ readonly key: string; readonly value: unknown }> | undefined,
  updates: ReadonlyArray<ProjectTargetPreferenceProperty> | undefined
): Array<{ readonly key: string; readonly value: unknown }> => {
  if (updates === undefined) return [...(current ?? [])]
  const updateByKey = new Map(updates.map((property) => [propertyKey(property), property.value]))
  const preserved = (current ?? []).filter((property) => !updateByKey.has(property.key))
  const replacements = updates.map((property) => ({ key: property.key, value: property.value }))
  return [...preserved, ...replacements]
}

export const listProjectTargetPreferences = (
  params: ListProjectTargetPreferencesParams
): Effect.Effect<ListProjectTargetPreferencesResult, ListProjectTargetPreferencesError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const project = params.project === undefined ? undefined : (yield* findProject(params.project)).project
    const preferences = yield* client.findAll<HulyProjectTargetPreference>(
      tracker.class.ProjectTargetPreference,
      hulyQuery<HulyProjectTargetPreference>(project === undefined ? {} : { attachedTo: project._id }),
      { limit: clampLimit(params.limit), sort: { usedOn: SortingOrder.Descending }, total: true }
    )
    const projects = yield* projectMapById(
      client,
      preferences.map((preference) => preference.attachedTo)
    )

    return {
      preferences: preferences.map((preference) => preferenceResult(preference, projects.get(preference.attachedTo))),
      total: listTotal(preferences.total)
    }
  })

export const upsertProjectTargetPreference = (
  params: UpsertProjectTargetPreferenceParams
): Effect.Effect<UpsertProjectTargetPreferenceResult, UpsertProjectTargetPreferenceError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)
    const usedOn = yield* Clock.currentTimeMillis
    const existing = yield* client.findOne<HulyProjectTargetPreference>(
      tracker.class.ProjectTargetPreference,
      hulyQuery<HulyProjectTargetPreference>({ attachedTo: project._id })
    )

    if (existing === undefined) {
      const preferenceId: Ref<HulyProjectTargetPreference> = generateId()
      const data: Data<HulyProjectTargetPreference> = {
        attachedTo: project._id,
        usedOn,
        props: mergeProps(undefined, params.props)
      }
      yield* client.createDoc(tracker.class.ProjectTargetPreference, toRef<Space>(project._id), data, preferenceId)
      return { preference: preferenceResult({ ...data, _id: preferenceId }, project), created: true }
    }

    const update: DocumentUpdate<HulyProjectTargetPreference> = {
      usedOn,
      props: mergeProps(existing.props, params.props)
    }
    yield* client.updateDoc(tracker.class.ProjectTargetPreference, toRef<Space>(existing.space), existing._id, update)

    return { preference: preferenceResult({ ...existing, ...update }, project), created: false }
  })
