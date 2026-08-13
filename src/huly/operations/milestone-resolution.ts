import type { Milestone as HulyMilestone, Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import { IssueMilestoneRefSchema, type IssueMilestoneRef } from "../../domain/schemas/issues.js"
import {
  type MilestoneIdentifier,
  type MilestoneLabel,
  NonEmptyString,
  type ProjectIdentifier
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { HulyConnectionError, MilestoneIdentifierAmbiguousError, MilestoneNotFoundError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const NormalizedMilestoneLabel = NonEmptyString.pipe(Schema.brand("NormalizedMilestoneLabel"))
type NormalizedMilestoneLabel = Schema.Schema.Type<typeof NormalizedMilestoneLabel>
const parseIssueMilestoneRef = Schema.decodeUnknownEffect(IssueMilestoneRefSchema)

const normalizeMilestoneLabel = (label: MilestoneIdentifier | MilestoneLabel): NormalizedMilestoneLabel =>
  NormalizedMilestoneLabel.make(label.trim().toLowerCase())

const findMilestoneById = (
  client: HulyClient["Service"],
  project: HulyProject,
  identifier: MilestoneIdentifier
): Effect.Effect<HulyMilestone | undefined, HulyClientError> =>
  client.findOne<HulyMilestone>(
    tracker.class.Milestone,
    hulyQuery<HulyMilestone>({ space: project._id, _id: toRef<HulyMilestone>(identifier) })
  )

const parseMilestoneRef = (milestone: HulyMilestone): Effect.Effect<IssueMilestoneRef, HulyConnectionError> =>
  parseIssueMilestoneRef({ id: milestone._id, label: milestone.label }).pipe(
    Effect.mapError(
      (cause) =>
        new HulyConnectionError({
          message: "Huly returned malformed milestone metadata while resolving an issue filter.",
          cause
        })
    )
  )

export const resolveIssueFilterMilestone = (
  client: HulyClient["Service"],
  project: HulyProject,
  identifier: MilestoneIdentifier,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<
  HulyMilestone,
  HulyClientError | HulyConnectionError | MilestoneIdentifierAmbiguousError | MilestoneNotFoundError
> =>
  Effect.gen(function* () {
    const idMatch = yield* findMilestoneById(client, project, identifier)
    if (idMatch !== undefined) {
      yield* parseMilestoneRef(idMatch)
      return idMatch
    }

    const milestones = yield* client.findAll<HulyMilestone>(
      tracker.class.Milestone,
      hulyQuery<HulyMilestone>({ space: project._id })
    )

    const normalizedIdentifier = normalizeMilestoneLabel(identifier)
    const parsedMilestones = yield* Effect.forEach(milestones, (milestone) =>
      Effect.map(parseMilestoneRef(milestone), (ref) => ({ milestone, ref }))
    )
    const labelMatches = parsedMilestones.filter(
      ({ ref }) => normalizeMilestoneLabel(ref.label) === normalizedIdentifier
    )
    const onlyLabelMatch = labelMatches.length === 1 ? labelMatches[0] : undefined
    if (onlyLabelMatch !== undefined) return onlyLabelMatch.milestone
    if (labelMatches.length > 1) {
      const candidates = labelMatches.map(({ ref }) => ref).sort((left, right) => left.id.localeCompare(right.id))
      return yield* new MilestoneIdentifierAmbiguousError({ identifier, project: projectIdentifier, candidates })
    }

    return yield* new MilestoneNotFoundError({ identifier, project: projectIdentifier })
  })

export const resolveMilestoneExact = (
  client: HulyClient["Service"],
  project: HulyProject,
  identifier: MilestoneIdentifier,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<HulyMilestone, HulyClientError | MilestoneNotFoundError> =>
  Effect.gen(function* () {
    const idMatch = yield* findMilestoneById(client, project, identifier)
    if (idMatch !== undefined) return idMatch

    const labelMatch = yield* client.findOne<HulyMilestone>(
      tracker.class.Milestone,
      hulyQuery<HulyMilestone>({ space: project._id, label: identifier })
    )
    return labelMatch !== undefined
      ? labelMatch
      : yield* new MilestoneNotFoundError({ identifier, project: projectIdentifier })
  })
