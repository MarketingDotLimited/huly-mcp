import type {
  Component as HulyComponent,
  Issue as HulyIssue,
  IssueTemplate as HulyIssueTemplate,
  Milestone as HulyMilestone
} from "@hcengineering/tracker"
import { Effect } from "effect"

import type { DeletionImpact, PreviewDeletionParams } from "../../domain/schemas/deletion.js"
import { Count, type ListTotal, UNKNOWN_TOTAL } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  ComponentNotFoundError,
  type IssueNotFoundError,
  MilestoneNotFoundError,
  type ProjectNotFoundError
} from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { findComponentByIdOrLabel } from "./components.js"
import { listTotal } from "./counts.js"
import { findProject, findProjectAndIssue } from "./issues-shared.js"
import { findByNameOrId } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type PreviewDeletionError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | ComponentNotFoundError
  | MilestoneNotFoundError

const sumListTotals = (values: ReadonlyArray<ListTotal>): ListTotal =>
  values.includes(UNKNOWN_TOTAL) ? UNKNOWN_TOTAL : Count.make(values.reduce((sum, value) => sum + value, 0))

const countedDeletionWarning = (count: number, singular: string, suffix: string): string | undefined =>
  count > 0 ? `${count} ${singular}${count === 1 ? "" : "s"} ${suffix}` : undefined

const compactWarnings = (warnings: ReadonlyArray<string | undefined>): Array<string> =>
  warnings.flatMap((warning) => (warning === undefined ? [] : [warning]))

const issueDeletionWarnings = (impact: {
  readonly attachments: number
  readonly blockedBy: number
  readonly comments: number
  readonly relations: number
  readonly subIssues: number
}): Array<string> =>
  compactWarnings([
    countedDeletionWarning(impact.subIssues, "sub-issue", "that will be orphaned")?.replace(/^/, "Has "),
    countedDeletionWarning(impact.blockedBy, "other issue", "— blocking relations will be removed")?.replace(
      /^/,
      "Blocked by "
    ),
    countedDeletionWarning(impact.relations, "relation", "to other issues")?.replace(/^/, "Has "),
    countedDeletionWarning(impact.comments, "comment", "that will be deleted")?.replace(/^/, "Has "),
    countedDeletionWarning(impact.attachments, "attachment", "that will be deleted")?.replace(/^/, "Has ")
  ])

const projectDeletionWarnings = (impact: {
  readonly components: ListTotal
  readonly issues: ListTotal
  readonly milestones: ListTotal
  readonly templates: ListTotal
}): Array<string> =>
  compactWarnings([
    countedDeletionWarning(impact.issues, "issue", "that will be deleted")?.replace(/^/, "Contains "),
    countedDeletionWarning(impact.components, "component", "that will be deleted")?.replace(/^/, "Contains "),
    countedDeletionWarning(impact.milestones, "milestone", "that will be deleted")?.replace(/^/, "Contains "),
    countedDeletionWarning(impact.templates, "template", "that will be deleted")?.replace(/^/, "Contains ")
  ])

const previewIssueDeletion = (
  params: PreviewDeletionParams & { identifier: string }
): Effect.Effect<DeletionImpact, PreviewDeletionError, HulyClient> =>
  Effect.gen(function* () {
    const { issue } = yield* findProjectAndIssue({ project: params.project, identifier: params.identifier })

    const subIssues = issue.subIssues
    const comments = issue.comments ?? 0
    const attachments = issue.attachments ?? 0
    const blockedBy = issue.blockedBy?.length ?? 0
    const relations = issue.relations?.length ?? 0

    const totalAffected = subIssues + comments + attachments + blockedBy + relations
    const impact = { subIssues, comments, attachments, blockedBy, relations }

    return {
      entityType: "issue" as const,
      identifier: issue.identifier,
      impact: {
        subIssues: Count.make(impact.subIssues),
        comments: Count.make(impact.comments),
        attachments: Count.make(impact.attachments),
        blockedBy: Count.make(impact.blockedBy),
        relations: Count.make(impact.relations)
      },
      warnings: issueDeletionWarnings(impact),
      totalAffected: Count.make(totalAffected)
    }
  })

const previewProjectDeletion = (
  params: PreviewDeletionParams
): Effect.Effect<DeletionImpact, PreviewDeletionError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)

    const [issues, components, milestones, templates] = yield* Effect.all([
      client.findAll<HulyIssue>(tracker.class.Issue, { space: project._id }, { limit: 1, total: true }),
      client.findAll<HulyComponent>(tracker.class.Component, { space: project._id }, { limit: 1, total: true }),
      client.findAll<HulyMilestone>(tracker.class.Milestone, { space: project._id }, { limit: 1, total: true }),
      client.findAll<HulyIssueTemplate>(tracker.class.IssueTemplate, { space: project._id }, { limit: 1, total: true })
    ])

    const issueCount = listTotal(issues.total)
    const componentCount = listTotal(components.total)
    const milestoneCount = listTotal(milestones.total)
    const templateCount = listTotal(templates.total)

    const impact = {
      issues: issueCount,
      components: componentCount,
      milestones: milestoneCount,
      templates: templateCount
    }
    const totalAffected = sumListTotals([issueCount, componentCount, milestoneCount, templateCount])

    return {
      entityType: "project" as const,
      identifier: project.identifier,
      impact,
      warnings: projectDeletionWarnings(impact),
      totalAffected
    }
  })

const previewComponentDeletion = (
  params: PreviewDeletionParams & { identifier: string }
): Effect.Effect<DeletionImpact, PreviewDeletionError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)

    const component = yield* findComponentByIdOrLabel(client, project._id, params.identifier)
    if (component === undefined) {
      return yield* new ComponentNotFoundError({ identifier: params.identifier, project: params.project })
    }

    const issues = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      { space: project._id, component: component._id },
      { limit: 1, total: true }
    )

    const issueCount = listTotal(issues.total)

    const warnings: Array<string> = []
    if (issueCount > 0) {
      warnings.push(`${issueCount} issue${issueCount > 1 ? "s" : ""} use${issueCount === 1 ? "s" : ""} this component`)
    }

    return {
      entityType: "component" as const,
      identifier: component.label,
      impact: { issues: issueCount },
      warnings,
      totalAffected: issueCount
    }
  })

const previewMilestoneDeletion = (
  params: PreviewDeletionParams & { identifier: string }
): Effect.Effect<DeletionImpact, PreviewDeletionError, HulyClient> =>
  Effect.gen(function* () {
    const { client, project } = yield* findProject(params.project)

    const milestone = yield* findByNameOrId(
      client,
      tracker.class.Milestone,
      { space: project._id, _id: toRef<HulyMilestone>(params.identifier) },
      { space: project._id, label: params.identifier }
    )
    if (milestone === undefined) {
      return yield* new MilestoneNotFoundError({ identifier: params.identifier, project: params.project })
    }

    const issues = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      { space: project._id, milestone: milestone._id },
      { limit: 1, total: true }
    )

    const issueCount = listTotal(issues.total)

    const warnings: Array<string> = []
    if (issueCount > 0) {
      warnings.push(
        `${issueCount} issue${issueCount > 1 ? "s" : ""} ${issueCount === 1 ? "is" : "are"} in this milestone`
      )
    }

    return {
      entityType: "milestone" as const,
      identifier: milestone.label,
      impact: { issues: issueCount },
      warnings,
      totalAffected: issueCount
    }
  })

// Schema.filter on PreviewDeletionParamsSchema guarantees `identifier` is defined for non-project types.
// TypeScript can't narrow filtered Schema types, so the cast is necessary here.
type WithIdentifier = PreviewDeletionParams & { identifier: string }

export const previewDeletion = (
  params: PreviewDeletionParams
): Effect.Effect<DeletionImpact, PreviewDeletionError, HulyClient> => {
  /* eslint-disable no-restricted-syntax -- see comment on WithIdentifier above */
  switch (params.entityType) {
    case "issue":
      return previewIssueDeletion(params as WithIdentifier)
    case "project":
      return previewProjectDeletion(params)
    case "component":
      return previewComponentDeletion(params as WithIdentifier)
    case "milestone":
      return previewMilestoneDeletion(params as WithIdentifier)
  }
  /* eslint-enable no-restricted-syntax */
}
