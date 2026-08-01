import { AccessLevel, type Calendar } from "@hcengineering/calendar"
import type { Contact, Person } from "@hcengineering/contact"
import type { AttachedData, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  ApplicantIdentifier,
  CandidateIdentifier,
  ReviewIdentifier,
  ReviewRef
} from "../../domain/schemas/recruiting-common.js"
import type {
  DeleteRecruitingReviewResult,
  ListRecruitingReviewsResult,
  ReviewDetail
} from "../../domain/schemas/recruiting-extended-results.js"
import type {
  CreateRecruitingReviewParams,
  DeleteRecruitingReviewParams,
  GetRecruitingReviewParams,
  ListRecruitingReviewsParams,
  UpdateRecruitingReviewParams
} from "../../domain/schemas/recruiting-extended.js"
import { Count } from "../../domain/schemas/shared.js"
import { assertAt } from "../../utils/assertions.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantNotFoundError,
  RecruitingModelMissingError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError
} from "../errors.js"
import {
  RecruitingMutationUnsupportedError,
  RecruitingReviewIdentifierAmbiguousError as ReviewAmbiguous,
  RecruitingReviewNotFoundError as ReviewMissing
} from "../errors.js"
import { core } from "../huly-plugins.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Candidate, Review } from "../types/recruiting.js"
import { resolveParticipantLocators } from "./calendar-shared.js"
import { markdownToMarkupString } from "./markup.js"
import { resolveOrganizationByIdentifier } from "./organization-resolvers.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { candidateEmail, ensureCandidateMixin, resolveCandidatePerson } from "./recruiting-candidate-shared.js"
import {
  reviewDetail,
  reviewRefFromCandidate,
  reviewRefFromDoc,
  reviewRefProjectionFromDoc,
  warnRecruitingReviewMetadataDegraded
} from "./recruiting-review-detail.js"
import { findApplicant, incrementSequence, listLimit } from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

const REVIEW_DEFAULT_DURATION_MINUTES = 30
const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const DEFAULT_REVIEW_DURATION_MS = REVIEW_DEFAULT_DURATION_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
// Huly's Recruiting review UI stores an empty calendar ref, so MCP mirrors that model-specific sentinel.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary: empty calendar ref is the upstream Recruiting UI sentinel
const reviewUiEmptyCalendar = "" as Ref<Calendar>

type ReviewReadError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingApplicantIdentifierAmbiguousError
  | RecruitingApplicantNotFoundError
  | RecruitingModelMissingError
  | RecruitingReviewIdentifierAmbiguousError
  | RecruitingReviewNotFoundError

type ReviewWriteError =
  | ReviewReadError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError
  | RecruitingMutationUnsupportedError

const prefixedReviewNumber = (identifier: string): number | undefined => {
  const match = /^RVE-(\d+)$/i.exec(identifier)
  return match === null ? undefined : Number(match[1])
}

const optionalApplication = (
  client: HulyClient["Type"],
  identifier: ApplicantIdentifier | undefined,
  candidate?: Person
) => (identifier === undefined ? Effect.succeed(undefined) : findApplicant(client, identifier, undefined, candidate))

const optionalCandidate = (client: HulyClient["Type"], identifier: CandidateIdentifier | undefined) =>
  identifier === undefined ? Effect.succeed(undefined) : resolveCandidatePerson(client, identifier)

const matchesReviewText = (review: Review, query: string | undefined): boolean => {
  const normalized = normalizeForComparison(query ?? "")
  if (normalized === "") return true
  return [review.title, review.verdict, review.location ?? ""].some((value) =>
    normalizeForComparison(value).includes(normalized)
  )
}

const reviewMatchesFilters = (
  review: Review,
  candidate: Person | undefined,
  application: Applicant | undefined
): boolean =>
  (candidate === undefined || String(review.attachedTo) === String(candidate._id)) &&
  (application === undefined || String(review.application) === String(application._id))

export { reviewRefFromDoc } from "./recruiting-review-detail.js"

export const findReview = (
  client: HulyClient["Type"],
  identifier: ReviewIdentifier,
  candidate?: Person,
  application?: Applicant
): Effect.Effect<Review, HulyClientError | RecruitingReviewIdentifierAmbiguousError | RecruitingReviewNotFoundError> =>
  Effect.gen(function* () {
    const byId = yield* client.findOne<Review>(
      recruitIds.class.Review,
      hulyQuery<Review>({ _id: toRef<Review>(identifier) })
    )
    if (byId !== undefined) {
      if (reviewMatchesFilters(byId, candidate, application)) return byId
      return yield* new ReviewMissing({ identifier })
    }

    const number = prefixedReviewNumber(identifier)
    const filters: StrictDocumentQuery<Review> = {
      ...(number === undefined ? { title: identifier } : { number }),
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) }),
      ...(application === undefined ? {} : { application: application._id })
    }
    const reviews = yield* client.findAll<Review>(recruitIds.class.Review, hulyQuery(filters))
    if (reviews.length === 0) return yield* new ReviewMissing({ identifier })
    if (reviews.length > 1) {
      return yield* new ReviewAmbiguous({ identifier, matches: Count.make(reviews.length) })
    }
    return assertAt(reviews, 0)
  })

export const resolveReviewLocator = (client: HulyClient["Type"], params: GetRecruitingReviewParams) =>
  Effect.gen(function* () {
    const candidate = yield* optionalCandidate(client, params.candidate)
    const application = yield* optionalApplication(client, params.application, candidate)
    return yield* findReview(client, params.review, candidate, application)
  })

export const listRecruitingReviews = (
  params: ListRecruitingReviewsParams
): Effect.Effect<ListRecruitingReviewsResult, ReviewReadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const candidate = yield* optionalCandidate(client, params.candidate)
    const application = yield* optionalApplication(client, params.application, candidate)
    const query: StrictDocumentQuery<Review> = {
      ...(candidate === undefined ? {} : { attachedTo: toRef<Candidate>(candidate._id) }),
      ...(application === undefined ? {} : { application: application._id }),
      ...(params.from === undefined ? {} : { date: { $gte: params.from } }),
      ...(params.to === undefined ? {} : { dueDate: { $lte: params.to } })
    }
    const reviews = yield* client.findAll<Review>(recruitIds.class.Review, hulyQuery(query), {
      sort: { date: SortingOrder.Descending }
    })
    const limited = reviews
      .filter((review) => matchesReviewText(review, params.query))
      .slice(0, listLimit(params.limit))
    const projections = yield* Effect.forEach(limited, (review) => reviewRefProjectionFromDoc(client, review))
    const synthesizedTitles = projections.filter((projection) => projection.synthesizedTitle).length
    yield* warnRecruitingReviewMetadataDegraded(synthesizedTitles, 0)
    const refs = projections.map((projection) => projection.ref)
    return { reviews: refs, total: Count.make(refs.length) }
  })

export const getRecruitingReview = (
  params: GetRecruitingReviewParams
): Effect.Effect<ReviewDetail, ReviewReadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    return yield* reviewDetail(client, yield* resolveReviewLocator(client, params))
  })

const resolveParticipants = (
  client: HulyClient["Type"],
  params: CreateRecruitingReviewParams | UpdateRecruitingReviewParams
) =>
  params.participants === undefined
    ? Effect.succeed([toRef<Contact>(client.getPrimarySocialId())])
    : resolveParticipantLocators(client, params.participants)

export const createRecruitingReview = (
  params: CreateRecruitingReviewParams
): Effect.Effect<{ readonly review: ReviewRef }, ReviewWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const person = yield* resolveCandidatePerson(client, params.candidate)
    yield* ensureCandidateMixin(client, person, {})
    const application = yield* optionalApplication(client, params.application, person)
    const company =
      params.company === undefined ? undefined : (yield* resolveOrganizationByIdentifier(client, params.company))._id
    const number = yield* incrementSequence(client, recruitIds.class.Review, "review")
    const reviewId = generateId<Review>()
    const data: AttachedData<Review> = {
      number,
      date: params.date,
      dueDate: params.dueDate ?? params.date + DEFAULT_REVIEW_DURATION_MS,
      description:
        params.description === undefined ? "" : markdownToMarkupString(params.description, client.markupUrlConfig),
      verdict: params.verdict ?? "",
      title: params.title,
      participants: yield* resolveParticipants(client, params),
      company,
      application: application?._id,
      location: params.location ?? "",
      access: AccessLevel.Reader,
      allDay: false,
      eventId: "",
      calendar: reviewUiEmptyCalendar,
      user: client.getPrimarySocialId(),
      blockTime: false
    }
    yield* client.addCollection(
      recruitIds.class.Review,
      core.space.Workspace,
      person._id,
      recruitIds.mixin.Candidate,
      "reviews",
      data,
      reviewId
    )
    return {
      review: reviewRefFromCandidate(reviewId, number, data.title, person, yield* candidateEmail(client, person._id))
    }
  })

type ResolvedReviewApplication = Effect.Effect.Success<ReturnType<typeof optionalApplication>>
type ResolvedReviewCompany = Effect.Effect.Success<ReturnType<typeof resolveOrganizationByIdentifier>>["_id"]

const resolveReviewApplicationUpdate = (
  client: HulyClient["Type"],
  params: UpdateRecruitingReviewParams
): Effect.Effect<ResolvedReviewApplication | null | undefined, ReviewWriteError> =>
  params.application === undefined
    ? Effect.succeed(undefined)
    : params.application === null
      ? Effect.succeed(null)
      : optionalApplication(client, params.application)

const resolveReviewCompanyUpdate = (
  client: HulyClient["Type"],
  params: UpdateRecruitingReviewParams
): Effect.Effect<ResolvedReviewCompany | null | undefined, ReviewWriteError> =>
  params.company === undefined
    ? Effect.succeed(undefined)
    : params.company === null
      ? Effect.succeed(null)
      : Effect.map(resolveOrganizationByIdentifier(client, params.company), (company) => company._id)

const reviewTextUpdate = (
  client: HulyClient["Type"],
  params: UpdateRecruitingReviewParams
): DocumentUpdate<Review> => ({
  ...(params.title === undefined ? {} : { title: params.title }),
  ...(params.description === undefined
    ? {}
    : {
        description:
          params.description === null ? "" : markdownToMarkupString(params.description, client.markupUrlConfig)
      }),
  ...(params.verdict === undefined ? {} : { verdict: params.verdict ?? "" }),
  ...(params.location === undefined ? {} : { location: params.location ?? "" })
})

const reviewDateUpdate = (params: UpdateRecruitingReviewParams): DocumentUpdate<Review> => ({
  ...(params.date === undefined ? {} : { date: params.date }),
  ...(params.dueDate === undefined ? {} : { dueDate: params.dueDate })
})

const reviewBasicUpdate = (
  client: HulyClient["Type"],
  params: UpdateRecruitingReviewParams
): DocumentUpdate<Review> => ({ ...reviewTextUpdate(client, params), ...reviewDateUpdate(params) })

const reviewContextUpdate = (
  client: HulyClient["Type"],
  params: UpdateRecruitingReviewParams,
  application: ResolvedReviewApplication | null | undefined,
  company: ResolvedReviewCompany | null | undefined
): Effect.Effect<DocumentUpdate<Review>, ReviewWriteError> =>
  Effect.gen(function* () {
    const participants = params.participants === undefined ? undefined : yield* resolveParticipants(client, params)
    return {
      ...(participants === undefined ? {} : { participants }),
      ...(application === undefined || application === null ? {} : { application: application._id }),
      ...(company === undefined || company === null ? {} : { company })
    }
  })

const reviewUnsetFields = (
  application: ResolvedReviewApplication | null | undefined,
  company: ResolvedReviewCompany | null | undefined
) => ({ ...(application === null ? { application: "" } : {}), ...(company === null ? { company: "" } : {}) })

export const updateRecruitingReview = (
  params: UpdateRecruitingReviewParams
): Effect.Effect<{ readonly review: ReviewRef }, ReviewWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const updateCollection = client.updateCollection
    if (updateCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({ message: "Huly client does not support updateCollection" })
    }
    const candidate = yield* optionalCandidate(client, params.candidate)
    const applicationContext = yield* optionalApplication(client, params.applicationContext, candidate)
    const review = yield* findReview(client, params.review, candidate, applicationContext)
    const application = yield* resolveReviewApplicationUpdate(client, params)
    const company = yield* resolveReviewCompanyUpdate(client, params)
    const direct: DocumentUpdate<Review> = {
      ...reviewBasicUpdate(client, params),
      ...(yield* reviewContextUpdate(client, params, application, company))
    }
    const unset = reviewUnsetFields(application, company)
    const operations = Object.keys(unset).length === 0 ? direct : { ...direct, $unset: unset }
    yield* updateCollection(
      recruitIds.class.Review,
      review.space,
      review._id,
      review.attachedTo,
      recruitIds.mixin.Candidate,
      "reviews",
      operations
    )
    return { review: yield* reviewRefFromDoc(client, { ...review, ...direct }) }
  })

export const deleteRecruitingReview = (
  params: DeleteRecruitingReviewParams
): Effect.Effect<DeleteRecruitingReviewResult, ReviewWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const removeCollection = client.removeCollection
    if (removeCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({ message: "Huly client does not support removeCollection" })
    }
    const review = yield* resolveReviewLocator(client, params)
    const ref = yield* reviewRefFromDoc(client, review)
    yield* removeCollection(
      recruitIds.class.Review,
      review.space,
      review._id,
      review.attachedTo,
      recruitIds.mixin.Candidate,
      "reviews"
    )
    return { review: ref, deleted: true }
  })
