import type { Doc, Ref } from "@hcengineering/core"
import type { TagReference } from "@hcengineering/tags"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect, Either, Schema } from "effect"

import type { Label } from "../../domain/schemas/issues.js"
import { ColorCode, IssueId, NonEmptyString, TagReferenceId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
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

interface IssueLabelCandidate {
  readonly referenceId: TagReferenceId
  readonly issueId: IssueId
  readonly title: NonEmptyString
  readonly normalizedTitle: string
  readonly color?: ColorCode | undefined
}

interface IssueLabelIndex {
  readonly byIssueId: ReadonlyMap<IssueId, ReadonlyArray<Label>>
}

const decodeAttachment = Schema.decodeUnknownEither(IssueLabelAttachmentBoundarySchema)
const decodeTitle = Schema.decodeUnknownEither(NonEmptyString)
const decodeColor = Schema.decodeUnknownEither(ColorCode)
const toDocRef: (id: string) => Ref<Doc> = toRef
const toIssueRef: (id: string) => Ref<HulyIssue> = toRef

const normalizeLabelTitle = (title: string): string => title.trim().toLowerCase()
const COLOR_SORT_WIDTH = 2

const compareStrings = (left: string, right: string): number => Number(left > right) - Number(left < right)

const candidateSortKey = (candidate: IssueLabelCandidate): string =>
  [
    candidate.normalizedTitle,
    candidate.title,
    String(candidate.color).padStart(COLOR_SORT_WIDTH, "0"),
    candidate.referenceId
  ].join("\0")

const compareCandidates = (left: IssueLabelCandidate, right: IssueLabelCandidate): number =>
  compareStrings(candidateSortKey(left), candidateSortKey(right))

const toCandidate = (input: unknown): IssueLabelCandidate | undefined => {
  const attachment = decodeAttachment(input)
  if (Either.isLeft(attachment)) return undefined

  const title = decodeTitle(attachment.right.title)
  if (Either.isLeft(title)) return undefined

  const color = decodeColor(attachment.right.color)
  return {
    referenceId: attachment.right._id,
    issueId: attachment.right.attachedTo,
    title: title.right,
    normalizedTitle: normalizeLabelTitle(title.right),
    ...(Either.isRight(color) ? { color: color.right } : {})
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
  const candidates = attachments.flatMap((attachment) => {
    const candidate = toCandidate(attachment)
    return candidate === undefined ? [] : [candidate]
  })
  const issueIds = [...new Set(candidates.map((candidate) => candidate.issueId))]
  return {
    byIssueId: new Map(
      issueIds.map((issueId) => [
        issueId,
        projectCandidateGroup(candidates.filter((candidate) => candidate.issueId === issueId))
      ])
    )
  }
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
): Effect.Effect<IssueLabelIndex, HulyClientError> =>
  Effect.gen(function*() {
    if (issueIds !== undefined && issueIds.length === 0) return buildIssueLabelIndex([])

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
    return buildIssueLabelIndex(attachments)
  })
