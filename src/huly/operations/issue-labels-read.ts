import type { Doc, Ref } from "@hcengineering/core"
import type { TagReference } from "@hcengineering/tags"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect, Either, Schema } from "effect"

import type { Label } from "../../domain/schemas/issues.js"
import { ColorCode, IssueId, NonEmptyString, TagReferenceId } from "../../domain/schemas/shared.js"
import { IssueLabelMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { tags, tracker } from "../huly-plugins.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const IssueLabelAttachmentBoundarySchema = Schema.Struct({
  _id: TagReferenceId,
  attachedTo: IssueId,
  title: Schema.optional(Schema.Unknown),
  color: Schema.optional(Schema.Unknown)
}).annotations({
  title: "IssueLabelAttachmentBoundary",
  description:
    "Partial Huly TagReference fields used to project issue labels. Missing or malformed presentation fields are handled by stable projection rules."
})

type IssueLabelAttachmentBoundary = Schema.Schema.Type<typeof IssueLabelAttachmentBoundarySchema>

const NormalizedLabelTitle = NonEmptyString.pipe(Schema.brand("NormalizedLabelTitle"))
type NormalizedLabelTitle = Schema.Schema.Type<typeof NormalizedLabelTitle>

type IssueLabelDegradationReason =
  | "malformed_attachment"
  | "missing_or_malformed_title"
  | "invalid_color"

interface IssueLabelCandidate {
  readonly referenceId: TagReferenceId
  readonly issueId: IssueId
  readonly title: NonEmptyString
  readonly normalizedTitle: NormalizedLabelTitle
  readonly color?: ColorCode | undefined
}

interface IssueLabelIndex {
  readonly byIssueId: ReadonlyMap<IssueId, ReadonlyArray<Label>>
  readonly degradationReasons: ReadonlyArray<IssueLabelDegradationReason>
}

interface IssueLabelCandidateProjection {
  readonly candidate?: IssueLabelCandidate
  readonly degradationReason?: IssueLabelDegradationReason
}

const decodeAttachment = Schema.decodeUnknownEither(IssueLabelAttachmentBoundarySchema)
const decodeTitle = Schema.decodeUnknownEither(NonEmptyString)
const decodeColor = Schema.decodeUnknownEither(ColorCode)
const toDocRef = (id: Ref<HulyIssue>): Ref<Doc> => toRef(IssueId.make(id))
const toIssueRef: (id: IssueId) => Ref<HulyIssue> = toRef

const normalizeLabelTitle = (title: NonEmptyString): NormalizedLabelTitle =>
  NormalizedLabelTitle.make(title.toLowerCase())
const COLOR_SORT_WIDTH = 2

const compareStrings = (left: string, right: string): number => Number(left > right) - Number(left < right)

const candidateSortKey = (candidate: IssueLabelCandidate): string =>
  [
    candidate.normalizedTitle,
    candidate.color === undefined ? "1" : "0",
    candidate.title,
    String(candidate.color).padStart(COLOR_SORT_WIDTH, "0"),
    candidate.referenceId
  ].join("\0")

const compareCandidates = (left: IssueLabelCandidate, right: IssueLabelCandidate): number =>
  compareStrings(candidateSortKey(left), candidateSortKey(right))

const toCandidate = (input: unknown): IssueLabelCandidateProjection => {
  const attachment = decodeAttachment(input)
  if (Either.isLeft(attachment)) return { degradationReason: "malformed_attachment" }

  const title = decodeTitle(attachment.right.title)
  if (Either.isLeft(title)) return { degradationReason: "missing_or_malformed_title" }

  const colorInput = attachment.right.color
  const color = colorInput === undefined ? undefined : decodeColor(colorInput)
  return {
    candidate: {
      referenceId: attachment.right._id,
      issueId: attachment.right.attachedTo,
      title: title.right,
      normalizedTitle: normalizeLabelTitle(title.right),
      ...(color !== undefined && Either.isRight(color) ? { color: color.right } : {})
    },
    ...(color !== undefined && Either.isLeft(color) ? { degradationReason: "invalid_color" } : {})
  }
}

const projectCandidateGroup = (candidates: ReadonlyArray<IssueLabelCandidate>): ReadonlyArray<Label> => {
  const sorted = [...candidates].sort(compareCandidates)
  return sorted
    .filter((candidate, index) =>
      sorted.findIndex((other) => other.normalizedTitle === candidate.normalizedTitle) === index
    )
    .map((candidate) => ({
      title: candidate.title,
      ...(candidate.color === undefined ? {} : { color: candidate.color })
    }))
}

const buildIssueLabelIndex = (
  attachments: ReadonlyArray<IssueLabelAttachmentBoundary | TagReference>
): IssueLabelIndex => {
  const projections = attachments.map(toCandidate)
  const candidates = projections.flatMap((projection) =>
    projection.candidate === undefined ? [] : [projection.candidate]
  )
  const issueIds = [...new Set(candidates.map((candidate) => candidate.issueId))]
  return {
    byIssueId: new Map(
      issueIds.map((issueId) => [
        issueId,
        projectCandidateGroup(candidates.filter((candidate) => candidate.issueId === issueId))
      ])
    ),
    degradationReasons: projections.flatMap((projection) =>
      projection.degradationReason === undefined ? [] : [projection.degradationReason]
    )
  }
}

const countReason = (
  reasons: ReadonlyArray<IssueLabelDegradationReason>,
  reason: IssueLabelDegradationReason
): number => reasons.filter((candidate) => candidate === reason).length

const degradationMessage = (reasons: ReadonlyArray<IssueLabelDegradationReason>): string => {
  const malformedAttachments = countReason(reasons, "malformed_attachment")
  const malformedTitles = countReason(reasons, "missing_or_malformed_title")
  const invalidColors = countReason(reasons, "invalid_color")
  return `Issue label summaries omitted or partially projected malformed Huly metadata: `
    + `${malformedAttachments} malformed attachment(s), `
    + `${malformedTitles} missing or malformed title(s), and `
    + `${invalidColors} invalid color(s). `
    + `Duplicate case-insensitive titles prefer a reference with a valid color.`
}

export const labelsForIssue = (
  index: IssueLabelIndex,
  issueId: Ref<HulyIssue>
): ReadonlyArray<Label> => index.byIssueId.get(IssueId.make(issueId)) ?? []

export const issueIdsMatchingLabel = (
  index: IssueLabelIndex,
  label: NonEmptyString
): Array<Ref<HulyIssue>> => {
  const normalizedFilter = normalizeLabelTitle(label)
  return [...index.byIssueId]
    .filter(([, labels]) => labels.some((summary) => normalizeLabelTitle(summary.title) === normalizedFilter))
    .map(([issueId]) => toIssueRef(issueId))
    .sort(compareStrings)
}

export const loadIssueLabelIndex = (
  client: HulyClient["Type"],
  space: TagReference["space"],
  issueIds?: ReadonlyArray<Ref<HulyIssue>>
): Effect.Effect<IssueLabelIndex, HulyClientError, Diagnostics> =>
  Effect.gen(function*() {
    if (issueIds !== undefined && issueIds.length === 0) return buildIssueLabelIndex([])

    const diagnostics = yield* Diagnostics
    const baseQuery: StrictDocumentQuery<TagReference> = {
      space,
      attachedToClass: tracker.class.Issue,
      collection: "labels"
    }
    const query: StrictDocumentQuery<TagReference> = issueIds === undefined
      ? baseQuery
      : { ...baseQuery, attachedTo: { $in: issueIds.map(toDocRef) } }

    const attachments = yield* client.findAll<TagReference>(
      tags.class.TagReference,
      hulyQuery(query)
    )
    const index = buildIssueLabelIndex(attachments)
    if (index.degradationReasons.length > 0) {
      yield* diagnostics.warnAgent({
        code: IssueLabelMetadataDegradedWarningCode,
        message: degradationMessage(index.degradationReasons)
      })
    }
    return index
  })
