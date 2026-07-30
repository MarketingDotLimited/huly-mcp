import type { Class, Doc, Ref, Space } from "@hcengineering/core"
import { Effect } from "effect"

import type { RecruitingResolvedTarget } from "../../domain/schemas/recruiting-media-results.js"
import type {
  RecruitingActivityTarget,
  RecruitingAttachmentTarget,
  RecruitingCommentTarget,
  RecruitingRelatedIssueTarget
} from "../../domain/schemas/recruiting-media.js"
import { NonEmptyString, ObjectClassName, SpaceId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantNotFoundError,
  RecruitingCandidateNotFoundError,
  RecruitingModelMissingError,
  RecruitingOpinionIdentifierAmbiguousError,
  RecruitingOpinionNotFoundError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError
} from "../errors.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Applicant, Candidate, Opinion, Review, Vacancy } from "../types/recruiting.js"
import {
  candidateEmail,
  resolveCandidate,
  resolveCandidatePerson,
  toCandidateRef
} from "./recruiting-candidate-shared.js"
import { findOpinion, opinionRefFromDoc, parentReviewFromOpinion } from "./recruiting-opinions.js"
import { resolveReviewLocator, reviewRefFromDoc } from "./recruiting-reviews.js"
import { applicantRefFromDoc, findApplicant, resolveVacancy, toVacancyRef } from "./recruiting-shared.js"
import { toClassRef } from "./sdk-boundary.js"

const candidateObjectClass = toClassRef(String(recruitIds.mixin.Candidate))

type RecruitingResolvedTargetError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | RecruitingApplicantIdentifierAmbiguousError
  | RecruitingApplicantNotFoundError
  | RecruitingCandidateNotFoundError
  | RecruitingModelMissingError
  | RecruitingOpinionIdentifierAmbiguousError
  | RecruitingOpinionNotFoundError
  | RecruitingReviewIdentifierAmbiguousError
  | RecruitingReviewNotFoundError
  | RecruitingVacancyIdentifierAmbiguousError
  | RecruitingVacancyNotFoundError

export interface RecruitingTargetCoordinates {
  readonly client: HulyClient["Type"]
  readonly target: RecruitingResolvedTarget
  readonly objectId: Ref<Doc>
  readonly objectClass: Ref<Class<Doc>>
  readonly space: Ref<Space>
  readonly display: NonEmptyString
}

const targetDisplay = (kind: RecruitingResolvedTarget["kind"], value: string): NonEmptyString =>
  NonEmptyString.make(`Recruiting ${kind} '${value}'`)

const coordinates = (
  client: HulyClient["Type"],
  target: RecruitingResolvedTarget,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  space: Ref<Space>,
  display: NonEmptyString
): RecruitingTargetCoordinates => ({ client, target, objectId, objectClass, space, display })

const vacancyTarget = (client: HulyClient["Type"], vacancy: Vacancy): RecruitingTargetCoordinates => {
  const ref = toVacancyRef(vacancy)
  return coordinates(
    client,
    {
      kind: "vacancy",
      id: ref.id,
      objectClass: ObjectClassName.make(recruitIds.class.Vacancy),
      space: SpaceId.make(vacancy.space),
      display: ref.name,
      ref
    },
    vacancy._id,
    recruitIds.class.Vacancy,
    vacancy.space,
    targetDisplay("vacancy", ref.name)
  )
}

const candidateTarget = (
  client: HulyClient["Type"],
  candidate: Candidate,
  email: string | undefined
): RecruitingTargetCoordinates => {
  const ref = toCandidateRef(candidate, email)
  return coordinates(
    client,
    {
      kind: "candidate",
      id: ref.id,
      objectClass: ObjectClassName.make(candidateObjectClass),
      space: SpaceId.make(candidate.space),
      display: ref.name,
      ref
    },
    candidate._id,
    candidateObjectClass,
    candidate.space,
    targetDisplay("candidate", ref.name)
  )
}

const applicantTarget = (
  client: HulyClient["Type"],
  applicant: Applicant
): Effect.Effect<RecruitingTargetCoordinates, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function* () {
    const ref = yield* applicantRefFromDoc(client, applicant)
    return coordinates(
      client,
      {
        kind: "applicant",
        id: ref.id,
        objectClass: ObjectClassName.make(recruitIds.class.Applicant),
        space: SpaceId.make(applicant.space),
        display: ref.identifier,
        ref
      },
      applicant._id,
      recruitIds.class.Applicant,
      applicant.space,
      targetDisplay("applicant", ref.identifier)
    )
  })

const reviewTarget = (
  client: HulyClient["Type"],
  review: Review
): Effect.Effect<RecruitingTargetCoordinates, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function* () {
    const ref = yield* reviewRefFromDoc(client, review)
    return coordinates(
      client,
      {
        kind: "review",
        id: ref.id,
        objectClass: ObjectClassName.make(recruitIds.class.Review),
        space: SpaceId.make(review.space),
        display: ref.title,
        ref
      },
      review._id,
      recruitIds.class.Review,
      review.space,
      targetDisplay("review", ref.title)
    )
  })

const opinionTarget = (
  client: HulyClient["Type"],
  opinion: Opinion,
  review: Review
): Effect.Effect<RecruitingTargetCoordinates, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function* () {
    const ref = yield* opinionRefFromDoc(client, opinion, review)
    return coordinates(
      client,
      {
        kind: "opinion",
        id: ref.id,
        objectClass: ObjectClassName.make(recruitIds.class.Opinion),
        space: SpaceId.make(opinion.space),
        display: ref.value,
        ref
      },
      opinion._id,
      recruitIds.class.Opinion,
      opinion.space,
      targetDisplay("opinion", ref.identifier)
    )
  })

type RecruitingTargetInput =
  | RecruitingActivityTarget
  | RecruitingAttachmentTarget
  | RecruitingCommentTarget
  | RecruitingRelatedIssueTarget

const resolveApplicantActivityTarget = (
  client: HulyClient["Type"],
  params: Extract<RecruitingTargetInput, { readonly kind: "applicant" }>
): Effect.Effect<RecruitingTargetCoordinates, RecruitingResolvedTargetError, Diagnostics> =>
  Effect.gen(function* () {
    const vacancy = params.vacancy === undefined ? undefined : yield* resolveVacancy(client, params.vacancy)
    const candidate =
      params.candidate === undefined ? undefined : yield* resolveCandidatePerson(client, params.candidate)
    return yield* applicantTarget(client, yield* findApplicant(client, params.applicant, vacancy, candidate))
  })

const resolveOpinionActivityTarget = (
  client: HulyClient["Type"],
  params: Extract<RecruitingTargetInput, { readonly kind: "opinion" }>
): Effect.Effect<RecruitingTargetCoordinates, RecruitingResolvedTargetError, Diagnostics> =>
  Effect.gen(function* () {
    const review =
      params.review === undefined ? undefined : yield* resolveReviewLocator(client, { review: params.review })
    const opinion = yield* findOpinion(client, params.opinion, review)
    return yield* opinionTarget(client, opinion, review ?? (yield* parentReviewFromOpinion(client, opinion)))
  })

export const resolveRecruitingTarget = (
  client: HulyClient["Type"],
  params: RecruitingTargetInput
): Effect.Effect<RecruitingTargetCoordinates, RecruitingResolvedTargetError, Diagnostics> =>
  Effect.gen(function* () {
    switch (params.kind) {
      case "vacancy":
        return vacancyTarget(client, yield* resolveVacancy(client, params.vacancy))
      case "candidate": {
        const candidate = yield* resolveCandidate(client, params.candidate)
        return candidateTarget(client, candidate, yield* candidateEmail(client, candidate._id))
      }
      case "applicant":
        return yield* resolveApplicantActivityTarget(client, params)
      case "review":
        return yield* reviewTarget(client, yield* resolveReviewLocator(client, params))
      case "opinion":
        return yield* resolveOpinionActivityTarget(client, params)
    }
  })
