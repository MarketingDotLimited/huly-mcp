import type { Organization, Person } from "@hcengineering/contact"
import { Effect, Option, Schema } from "effect"

import type { RecruitingReviewTitle, ReviewIdentifier, ReviewRef } from "../../domain/schemas/recruiting-common.js"
import {
  RecruitingReviewTitle as ReviewTitleSchema,
  ReviewId,
  ReviewIdentifier as ReviewIdentifierSchema
} from "../../domain/schemas/recruiting-common.js"
import type { ReviewDetail } from "../../domain/schemas/recruiting-extended-results.js"
import { DocId, PersonId, PersonName, Timestamp } from "../../domain/schemas/shared.js"
import { RecruitingReviewMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { RecruitingModelMissingError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Review } from "../types/recruiting.js"
import { optionalMarkupToMarkdown } from "./markup.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { hulyQuery } from "./query-helpers.js"
import { candidateEmail, toCandidateRef } from "./recruiting-candidate-shared.js"
import { applicantRefFromDoc, optionalCount } from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

const UNTITLED_REVIEW = ReviewTitleSchema.make("Untitled Review")

const reviewIdentifierFromNumber = (number: number): ReviewIdentifier => ReviewIdentifierSchema.make(`RVE-${number}`)

interface ReviewTitleProjection {
  readonly title: RecruitingReviewTitle
  readonly synthesized: boolean
}

const reviewTitleProjection = (title: string): ReviewTitleProjection => ({
  title: hulyNonEmptyTextOrFallback(ReviewTitleSchema, title, UNTITLED_REVIEW),
  synthesized: title.trim() === ""
})

export const warnRecruitingReviewMetadataDegraded = (
  synthesizedTitles: number,
  synthesizedParticipantNames: number
): Effect.Effect<void, never, Diagnostics> => {
  if (synthesizedTitles === 0 && synthesizedParticipantNames === 0) return Effect.void
  return Effect.flatMap(Diagnostics, (diagnostics) =>
    diagnostics.warnAgent({
      code: RecruitingReviewMetadataDegradedWarningCode,
      message: `Recruiting review metadata was degraded: ${synthesizedTitles} title fallback(s) used 'Untitled Review' and ${synthesizedParticipantNames} participant name fallback(s) used the participant ID.`
    })
  )
}

export const reviewRefFromCandidate = (
  id: Review["_id"],
  number: number,
  title: string,
  person: Person,
  email: string | undefined
): ReviewRef => ({
  id: ReviewId.make(id),
  identifier: reviewIdentifierFromNumber(number),
  title: reviewTitleProjection(title).title,
  candidate: toCandidateRef(person, email)
})

export interface ReviewRefProjection {
  readonly ref: ReviewRef
  readonly synthesizedTitle: boolean
}

export const reviewRefProjectionFromDoc = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewRefProjection, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function* () {
    const person = yield* client.findOne<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: toRef<Person>(review.attachedTo) })
    )
    if (person === undefined) {
      return yield* new RecruitingModelMissingError({
        message: `Review '${review._id}' references missing candidate '${review.attachedTo}'`
      })
    }
    const email = yield* candidateEmail(client, person._id)
    const title = reviewTitleProjection(review.title)
    return {
      ref: {
        id: ReviewId.make(review._id),
        identifier: reviewIdentifierFromNumber(review.number),
        title: title.title,
        candidate: toCandidateRef(person, email)
      },
      synthesizedTitle: title.synthesized
    }
  })

export const reviewRefFromDoc = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewRef, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function* () {
    const projection = yield* reviewRefProjectionFromDoc(client, review)
    yield* warnRecruitingReviewMetadataDegraded(projection.synthesizedTitle ? 1 : 0, 0)
    return projection.ref
  })

const companySummary = (client: HulyClient["Type"], company: Review["company"]) =>
  company === undefined
    ? Effect.succeed(undefined)
    : Effect.map(
        client.findOne<Organization>(contact.class.Organization, hulyQuery<Organization>({ _id: company })),
        (organization) =>
          organization === undefined ? undefined : { id: DocId.make(organization._id), name: organization.name }
      )

const reviewTextFields = (
  review: Review,
  description: string | undefined
): Pick<ReviewDetail, "description" | "location" | "verdict"> => ({
  ...(description === undefined || description === "" ? {} : { description }),
  ...(review.verdict === "" ? {} : { verdict: review.verdict }),
  ...(review.location === undefined || review.location === "" ? {} : { location: review.location })
})

const reviewContextFields = (
  application: ReviewDetail["application"],
  company: ReviewDetail["company"]
): Pick<ReviewDetail, "application" | "company"> => ({
  ...(application === undefined ? {} : { application }),
  ...(company === undefined ? {} : { company })
})

const reviewMetadataFields = (review: Review): Pick<ReviewDetail, "createdOn" | "opinions"> => {
  const opinions = optionalCount(review.opinions)
  return {
    ...(opinions === undefined ? {} : { opinions }),
    ...(review.createdOn === undefined ? {} : { createdOn: Timestamp.make(review.createdOn) })
  }
}

const parseParticipantName = Schema.decodeUnknownOption(PersonName)

const reviewParticipants = (
  client: HulyClient["Type"],
  participantRefs: Review["participants"]
): Effect.Effect<
  { readonly participants: ReviewDetail["participants"]; readonly synthesizedNames: number },
  HulyClientError
> =>
  Effect.gen(function* () {
    if (participantRefs.length === 0) return { participants: [], synthesizedNames: 0 }
    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      hulyQuery<Person>({ _id: { $in: participantRefs.map(toRef<Person>) } })
    )
    const personById = new Map(persons.map((person) => [String(person._id), person]))
    let synthesizedNames = 0
    const participants = participantRefs.map((participantRef) => {
      const id = PersonId.make(String(participantRef))
      const name = parseParticipantName(personById.get(String(participantRef))?.name)
      if (Option.isSome(name)) return { id, name: name.value }
      synthesizedNames++
      return { id, name: PersonName.make(String(participantRef)) }
    })
    return { participants, synthesizedNames }
  })

export const reviewDetail = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewDetail, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function* () {
    const refProjection = yield* reviewRefProjectionFromDoc(client, review)
    const description = optionalMarkupToMarkdown(review.description, client.markupUrlConfig, undefined)
    const application =
      review.application === undefined
        ? undefined
        : yield* Effect.flatMap(
            client.findOne<Applicant>(recruitIds.class.Applicant, hulyQuery<Applicant>({ _id: review.application })),
            (applicant) =>
              applicant === undefined ? Effect.succeed(undefined) : applicantRefFromDoc(client, applicant)
          )
    const participantProjection = yield* reviewParticipants(client, review.participants)
    const company = yield* companySummary(client, review.company)
    yield* warnRecruitingReviewMetadataDegraded(
      refProjection.synthesizedTitle ? 1 : 0,
      participantProjection.synthesizedNames
    )
    return {
      ...refProjection.ref,
      ...reviewTextFields(review, description),
      ...reviewContextFields(application, company),
      date: Timestamp.make(review.date),
      dueDate: Timestamp.make(review.dueDate),
      participants: participantProjection.participants,
      ...reviewMetadataFields(review),
      modifiedOn: Timestamp.make(review.modifiedOn)
    }
  })
