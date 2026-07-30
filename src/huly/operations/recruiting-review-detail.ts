import type { Organization, Person } from "@hcengineering/contact"
import { Effect } from "effect"

import type { RecruitingReviewTitle, ReviewIdentifier, ReviewRef } from "../../domain/schemas/recruiting-common.js"
import {
  RecruitingReviewTitle as ReviewTitleSchema,
  ReviewId,
  ReviewIdentifier as ReviewIdentifierSchema
} from "../../domain/schemas/recruiting-common.js"
import type { ReviewDetail } from "../../domain/schemas/recruiting-extended-results.js"
import { DocId, PersonName, Timestamp } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { RecruitingModelMissingError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Review } from "../types/recruiting.js"
import { buildParticipants } from "./calendar-shared.js"
import { optionalMarkupToMarkdown } from "./markup.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { hulyQuery } from "./query-helpers.js"
import { candidateEmail, toCandidateRef } from "./recruiting-candidate-shared.js"
import { applicantRefFromDoc, optionalCount } from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

const UNTITLED_REVIEW = ReviewTitleSchema.make("Untitled Review")

const reviewIdentifierFromNumber = (number: number): ReviewIdentifier => ReviewIdentifierSchema.make(`RVE-${number}`)

const reviewTitle = (title: string): RecruitingReviewTitle =>
  hulyNonEmptyTextOrFallback(ReviewTitleSchema, title, UNTITLED_REVIEW)

export const reviewRefFromCandidate = (
  id: Review["_id"],
  number: number,
  title: string,
  person: Person,
  email: string | undefined
): ReviewRef => ({
  id: ReviewId.make(id),
  identifier: reviewIdentifierFromNumber(number),
  title: reviewTitle(title),
  candidate: toCandidateRef(person, email)
})

export const reviewRefFromDoc = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewRef, HulyClientError | RecruitingModelMissingError> =>
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
    return {
      id: ReviewId.make(review._id),
      identifier: reviewIdentifierFromNumber(review.number),
      title: reviewTitle(review.title),
      candidate: toCandidateRef(person, email)
    }
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

export const reviewDetail = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<ReviewDetail, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function* () {
    const ref = yield* reviewRefFromDoc(client, review)
    const description = optionalMarkupToMarkdown(review.description, client.markupUrlConfig, undefined)
    const application =
      review.application === undefined
        ? undefined
        : yield* Effect.flatMap(
            client.findOne<Applicant>(recruitIds.class.Applicant, hulyQuery<Applicant>({ _id: review.application })),
            (applicant) =>
              applicant === undefined ? Effect.succeed(undefined) : applicantRefFromDoc(client, applicant)
          )
    const participants = yield* buildParticipants(client, review.participants)
    const company = yield* companySummary(client, review.company)
    return {
      ...ref,
      ...reviewTextFields(review, description),
      ...reviewContextFields(application, company),
      date: Timestamp.make(review.date),
      dueDate: Timestamp.make(review.dueDate),
      participants: participants.map((participant) => ({
        id: participant.id,
        /* v8 ignore next -- buildParticipants resolves person refs and always supplies names. */
        name: participant.name ?? PersonName.make(String(participant.id))
      })),
      ...reviewMetadataFields(review),
      modifiedOn: Timestamp.make(review.modifiedOn)
    }
  })
