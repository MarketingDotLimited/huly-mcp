import type { Ref } from "@hcengineering/core"
import type { Issue as HulyIssue, Milestone as HulyMilestone, Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Option, Schema } from "effect"

import { IssueMilestoneRefSchema, type IssueMilestoneRef } from "../../domain/schemas/issues.js"
import { MilestoneId } from "../../domain/schemas/shared.js"
import { IssueMilestoneMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { tracker } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"

export type IssueMilestoneIndex = ReadonlyMap<MilestoneId, IssueMilestoneRef>

const parseMilestoneRef = Schema.decodeUnknownOption(IssueMilestoneRefSchema)

const uniqueMilestoneRefs = (issues: ReadonlyArray<HulyIssue>): Array<Ref<HulyMilestone>> => [
  ...new Set(
    issues.flatMap((issue) => (issue.milestone === null || issue.milestone === undefined ? [] : [issue.milestone]))
  )
]

export const milestoneForIssue = (index: IssueMilestoneIndex, issue: HulyIssue): IssueMilestoneRef | undefined =>
  issue.milestone === null || issue.milestone === undefined ? undefined : index.get(MilestoneId.make(issue.milestone))

export const loadIssueMilestoneIndex = (
  client: HulyClient["Type"],
  project: HulyProject,
  issues: ReadonlyArray<HulyIssue>
): Effect.Effect<IssueMilestoneIndex, HulyClientError, Diagnostics> =>
  Effect.gen(function* () {
    const refs = uniqueMilestoneRefs(issues)
    if (refs.length === 0) return new Map<MilestoneId, IssueMilestoneRef>()

    const milestones = yield* client.findAll<HulyMilestone>(
      tracker.class.Milestone,
      hulyQuery<HulyMilestone>({ space: project._id, _id: { $in: refs } })
    )
    const index = new Map<MilestoneId, IssueMilestoneRef>()
    for (const milestone of milestones) {
      const parsed = parseMilestoneRef({ id: milestone._id, label: milestone.label })
      if (Option.isSome(parsed)) index.set(parsed.value.id, parsed.value)
    }

    const unresolvedCount = refs.filter((ref) => !index.has(MilestoneId.make(ref))).length
    if (unresolvedCount > 0) {
      const diagnostics = yield* Diagnostics
      yield* diagnostics.warnAgent({
        code: IssueMilestoneMetadataDegradedWarningCode,
        message: `${unresolvedCount} unresolved milestone reference(s) were omitted from issue results.`
      })
    }

    return index
  })
