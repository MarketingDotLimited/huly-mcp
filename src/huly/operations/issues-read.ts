/**
 * Issue read operations: list and get.
 *
 * @module
 */
import type { Person, SocialIdentity } from "@hcengineering/contact"
import { type Ref, SortingOrder, type Status, type WithLookup } from "@hcengineering/core"
import { type Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type {
  GetIssueParams,
  Issue,
  IssueStatusCategoryFilter,
  IssueSummary,
  ListIssuesParams
} from "../../domain/schemas.js"
import { IssueSummarySchema, parseIssue } from "../../domain/schemas/issues.js"
import { IssueId, type ProjectIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  ComponentNotFoundError,
  InvalidStatusError,
  MilestoneIdentifierAmbiguousError,
  MilestoneNotFoundError,
  PersonIdentifierAmbiguousError,
  ProjectNotFoundError
} from "../errors.js"
import { HulyConnectionError, IssueNotFoundError } from "../errors.js"
import { contact, tracker } from "../huly-plugins.js"
import { findComponentByIdOrLabel } from "./components.js"
import { findPersonByEmailOrName, findPersonByIdOrExactEmailOrName } from "./contacts-shared.js"
import { creatorForIssue, loadIssueCreatorIndex } from "./issue-creators-read.js"
import { issueIdsMatchingLabel, labelsForIssue, loadIssueLabelIndex } from "./issue-labels-read.js"
import { loadIssueMilestoneIndex, milestoneForIssue } from "./issue-milestones-read.js"
import { topLevelIssueParent } from "./issues-parent.js"
import {
  findIssueInProject,
  findProjectWithStatuses,
  parseIssueIdentifier,
  priorityToString,
  resolveStatusByName,
  type WorkflowStatus
} from "./issues-shared.js"
import { resolveIssueFilterMilestone } from "./milestone-resolution.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery, withLookup } from "./query-helpers.js"

type ListIssuesError =
  | HulyClientError
  | HulyConnectionError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | ComponentNotFoundError
  | MilestoneNotFoundError
  | MilestoneIdentifierAmbiguousError
  | PersonIdentifierAmbiguousError

type GetIssueError = HulyClientError | HulyConnectionError | ProjectNotFoundError | IssueNotFoundError

type IssueWithLookup = WithLookup<HulyIssue> & { $lookup?: { assignee?: Person } }

const resolveStatusName = (statuses: Array<WorkflowStatus>, statusId: Ref<Status>): string => {
  const statusDoc = statuses.find((s) => s._id === statusId)
  return statusDoc?.name ?? "Unknown"
}

const hasUnknownStatusCategory = (statuses: ReadonlyArray<WorkflowStatus>): boolean =>
  statuses.some((status) => status.category === "unknown")

const requireKnownStatusCategories = (
  statuses: ReadonlyArray<WorkflowStatus>,
  category: IssueStatusCategoryFilter,
  project: ProjectIdentifier
): Effect.Effect<void, HulyConnectionError> =>
  hasUnknownStatusCategory(statuses)
    ? Effect.fail(
        new HulyConnectionError({
          message: `Cannot filter project '${project}' issues by status category '${category}' because Huly did not return complete status category metadata. Use an exact status name instead.`
        })
      )
    : Effect.void

const statusIdsByCategory = (
  statuses: ReadonlyArray<WorkflowStatus>,
  category: IssueStatusCategoryFilter
): Array<Ref<Status>> => statuses.filter((status) => status.category === category).map((status) => status._id)

/**
 * List issues with filters.
 * Results sorted by modifiedOn descending.
 */
export const listIssues = (
  params: ListIssuesParams
): Effect.Effect<Array<IssueSummary>, ListIssuesError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, project, statuses } = yield* findProjectWithStatuses(params.project)

    const query: StrictDocumentQuery<IssueWithLookup> = { space: project._id }

    if (params.statusCategory !== undefined) {
      yield* requireKnownStatusCategories(statuses, params.statusCategory, params.project)
      const matchingStatuses = statusIdsByCategory(statuses, params.statusCategory)
      if (matchingStatuses.length > 0) {
        query.status = { $in: matchingStatuses }
      } else {
        return []
      }
    }

    if (params.status !== undefined) {
      query.status = yield* resolveStatusByName(statuses, params.status, params.project)
    }

    if (params.assignee !== undefined) {
      const assigneePerson = yield* findPersonByEmailOrName(client, params.assignee)
      if (assigneePerson !== undefined) {
        query.assignee = assigneePerson._id
      } else {
        return []
      }
    }

    if (params.creator !== undefined) {
      const creator = yield* findPersonByIdOrExactEmailOrName(client, params.creator)
      if (creator === undefined) return []
      const identities = yield* client.findAll<SocialIdentity>(
        contact.class.SocialIdentity,
        hulyQuery<SocialIdentity>({ attachedTo: creator._id })
      )
      if (identities.length === 0) return []
      query.createdBy = { $in: identities.map((identity) => identity._id) }
    }

    // Apply title search using $like operator
    if (params.titleSearch !== undefined && params.titleSearch.trim() !== "") {
      query.title = { $like: `%${escapeLikeWildcards(params.titleSearch)}%` }
    }

    if (params.titleRegex !== undefined && params.titleRegex.trim() !== "") {
      query.title = { $regex: params.titleRegex }
    }

    if (params.descriptionSearch !== undefined && params.descriptionSearch.trim() !== "") {
      query.$search = params.descriptionSearch
    }

    if (params.parentIssue !== undefined) {
      const parentIssue = yield* findIssueInProject(client, project, params.parentIssue)
      query.attachedTo = parentIssue._id
    }

    if (params.component !== undefined) {
      const component = yield* findComponentByIdOrLabel(client, project._id, params.component)
      if (component !== undefined) {
        query.component = component._id
      } else {
        return []
      }
    }

    if (params.hasAssignee === true) {
      query.assignee = { $ne: null }
    } else if (params.hasAssignee === false) {
      query.assignee = null
    }

    if (params.hasDueDate === true) {
      query.dueDate = { $ne: null }
    } else if (params.hasDueDate === false) {
      query.dueDate = null
    }

    if (params.hasComponent === true) {
      query.component = { $ne: null }
    } else if (params.hasComponent === false) {
      query.component = null
    }

    if (params.milestone !== undefined) {
      query.milestone = (yield* resolveIssueFilterMilestone(client, project, params.milestone, params.project))._id
    } else if (params.hasMilestone === true) {
      query.milestone = { $ne: null }
    } else if (params.hasMilestone === false) {
      query.milestone = null
    }

    if (params.isTopLevel === true) {
      query.attachedTo = topLevelIssueParent().attachedTo
    }

    const labelFilter = params.label
    const labelFilterContext =
      labelFilter === undefined
        ? undefined
        : { index: yield* loadIssueLabelIndex(client, project._id), label: labelFilter }
    const matchingIssueIds =
      labelFilterContext === undefined
        ? undefined
        : issueIdsMatchingLabel(labelFilterContext.index, labelFilterContext.label)
    if (matchingIssueIds?.length === 0) return []
    const effectiveQuery: StrictDocumentQuery<IssueWithLookup> =
      matchingIssueIds === undefined ? query : { ...query, _id: { $in: matchingIssueIds } }

    const limit = clampLimit(params.limit)

    const issues = yield* client.findAll<IssueWithLookup>(
      tracker.class.Issue,
      hulyQuery(effectiveQuery),
      withLookup<IssueWithLookup>(
        { limit, sort: { modifiedOn: SortingOrder.Descending } },
        { assignee: contact.class.Person }
      )
    )

    const labelIndex =
      labelFilterContext === undefined
        ? yield* loadIssueLabelIndex(
            client,
            project._id,
            issues.map((issue) => issue._id)
          )
        : labelFilterContext.index
    const milestoneIndex = yield* loadIssueMilestoneIndex(client, project, issues)
    const creatorIndex = yield* loadIssueCreatorIndex(client, issues)
    const rawSummaries = issues.map((issue) => {
      const statusName = resolveStatusName(statuses, issue.status)
      const assigneeName = issue.$lookup?.assignee?.name
      const directParent = issue.parents.length > 0 ? issue.parents[issue.parents.length - 1] : undefined
      const milestone = milestoneForIssue(milestoneIndex, issue)
      const creator = creatorForIssue(creatorIndex, issue)

      return {
        issueId: IssueId.make(issue._id),
        identifier: issue.identifier,
        title: issue.title,
        status: statusName,
        priority: priorityToString(issue.priority),
        assignee: assigneeName,
        ...(creator === undefined ? {} : { creator }),
        parentIssue: directParent?.identifier,
        subIssues: issue.subIssues > 0 ? issue.subIssues : undefined,
        labels: labelsForIssue(labelIndex, issue._id),
        ...(milestone === undefined ? {} : { milestone }),
        modifiedOn: issue.modifiedOn
      }
    })

    // Spread: Schema.decodeUnknown returns readonly array; return type requires mutable
    const validated = yield* Schema.decodeUnknown(Schema.Array(IssueSummarySchema))(rawSummaries).pipe(
      Effect.mapError(
        (parseError) =>
          new HulyConnectionError({
            message: `listIssues response failed schema validation: ${parseError.message}`,
            cause: parseError
          })
      )
    )

    return [...validated]
  })

/**
 * Get a single issue with full details.
 *
 * Looks up issue by identifier (e.g., "HULY-123" or just 123).
 * Returns full issue including:
 * - Description rendered as markdown
 * - Assignee name (not just ID)
 * - Status name
 * - All metadata
 */
export const getIssue = (params: GetIssueParams): Effect.Effect<Issue, GetIssueError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, project, statuses } = yield* findProjectWithStatuses(params.project)

    const { fullIdentifier, number } = parseIssueIdentifier(params.identifier, params.project)

    const issue =
      (yield* client.findOne<HulyIssue>(
        tracker.class.Issue,
        hulyQuery<HulyIssue>({ space: project._id, identifier: fullIdentifier })
      )) ??
      (number !== null
        ? yield* client.findOne<HulyIssue>(tracker.class.Issue, hulyQuery<HulyIssue>({ space: project._id, number }))
        : undefined)
    if (issue === undefined) {
      return yield* new IssueNotFoundError({ identifier: params.identifier, project: params.project })
    }

    const statusName = resolveStatusName(statuses, issue.status)

    const person =
      issue.assignee !== null
        ? yield* client.findOne<Person>(contact.class.Person, hulyQuery<Person>({ _id: issue.assignee }))
        : undefined

    const description = issue.description
      ? yield* client.fetchMarkup(issue._class, issue._id, "description", issue.description, "markdown")
      : undefined

    const directParent = issue.parents.length > 0 ? issue.parents[issue.parents.length - 1] : undefined
    const labelIndex = yield* loadIssueLabelIndex(client, project._id, [issue._id])
    const milestoneIndex = yield* loadIssueMilestoneIndex(client, project, [issue])
    const creatorIndex = yield* loadIssueCreatorIndex(client, [issue])
    const milestone = milestoneForIssue(milestoneIndex, issue)
    const creator = creatorForIssue(creatorIndex, issue)

    return yield* parseIssue({
      issueId: IssueId.make(issue._id),
      identifier: issue.identifier,
      title: issue.title,
      description,
      status: statusName,
      priority: priorityToString(issue.priority),
      assignee: person?.name,
      assigneeRef: person ? { id: person._id, name: person.name } : undefined,
      ...(creator === undefined ? {} : { creator }),
      labels: labelsForIssue(labelIndex, issue._id),
      ...(milestone === undefined ? {} : { milestone }),
      project: params.project,
      parentIssue: directParent?.identifier,
      subIssues: issue.subIssues > 0 ? issue.subIssues : undefined,
      modifiedOn: issue.modifiedOn,
      createdOn: issue.createdOn,
      dueDate: issue.dueDate ?? undefined,
      estimation: issue.estimation > 0 ? issue.estimation : undefined
    }).pipe(
      Effect.mapError(
        (parseError) =>
          new HulyConnectionError({
            message: `getIssue response failed schema validation: ${parseError.message}`,
            cause: parseError
          })
      )
    )
  })
