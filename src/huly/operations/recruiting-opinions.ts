import type { AttachedData, DocumentUpdate } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type { OpinionIdentifier, OpinionRef } from "../../domain/schemas/recruiting-common.js"
import {
  OpinionId,
  OpinionIdentifier as OpinionIdentifierSchema,
  RecruitingOpinionValue,
  ReviewIdentifier as ReviewIdentifierSchema
} from "../../domain/schemas/recruiting-common.js"
import type {
  DeleteRecruitingOpinionResult,
  ListRecruitingOpinionsResult,
  OpinionDetail,
  RecruitingOpinionMutationResult
} from "../../domain/schemas/recruiting-extended-results.js"
import type {
  CreateRecruitingOpinionParams,
  DeleteRecruitingOpinionParams,
  GetRecruitingOpinionParams,
  ListRecruitingOpinionsParams,
  UpdateRecruitingOpinionParams
} from "../../domain/schemas/recruiting-extended.js"
import { Count, Timestamp } from "../../domain/schemas/shared.js"
import { assertAt } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  RecruitingModelMissingError,
  RecruitingOpinionIdentifierAmbiguousError,
  RecruitingOpinionNotFoundError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError
} from "../errors.js"
import {
  RecruitingMutationUnsupportedError,
  RecruitingOpinionIdentifierAmbiguousError as OpinionAmbiguous,
  RecruitingOpinionNotFoundError as OpinionMissing
} from "../errors.js"
import { recruitIds } from "../recruit-plugin.js"
import type { Opinion, Review } from "../types/recruiting.js"
import { markdownToMarkupString, optionalMarkupToMarkdown } from "./markup.js"
import { hulyNonEmptyTextOrFallback } from "./non-empty-text.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import {
  reviewRefFromDoc,
  reviewRefProjectionFromDoc,
  warnRecruitingReviewMetadataDegraded
} from "./recruiting-review-detail.js"
import { findReview } from "./recruiting-reviews.js"
import { incrementSequence, listLimit, optionalCount } from "./recruiting-shared.js"
import { toRef } from "./sdk-boundary.js"

const UNTITLED_OPINION_VALUE = RecruitingOpinionValue.make("Untitled opinion")

type OpinionReadError =
  | HulyClientError
  | RecruitingModelMissingError
  | RecruitingOpinionIdentifierAmbiguousError
  | RecruitingOpinionNotFoundError
  | RecruitingReviewIdentifierAmbiguousError
  | RecruitingReviewNotFoundError

type OpinionWriteError = OpinionReadError | RecruitingMutationUnsupportedError

interface OpinionReadParams {
  readonly review?: GetRecruitingOpinionParams["review"]
}

const prefixedNumber = (identifier: string, prefix: "OPE"): number | undefined => {
  const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(identifier)
  return match === null ? undefined : Number(match[1])
}

const opinionIdentifierFromNumber = (number: number): OpinionIdentifier => OpinionIdentifierSchema.make(`OPE-${number}`)

const opinionValue = (value: string) =>
  hulyNonEmptyTextOrFallback(RecruitingOpinionValue, value, UNTITLED_OPINION_VALUE)

interface OpinionRefProjection {
  readonly ref: OpinionRef
  readonly synthesizedReviewTitle: boolean
}

const opinionRefProjectionFromDoc = (
  client: HulyClient["Type"],
  opinion: Opinion,
  review: Review
): Effect.Effect<OpinionRefProjection, HulyClientError | RecruitingModelMissingError> =>
  Effect.gen(function* () {
    const reviewProjection = yield* reviewRefProjectionFromDoc(client, review)
    return {
      ref: {
        id: OpinionId.make(opinion._id),
        identifier: opinionIdentifierFromNumber(opinion.number),
        review: reviewProjection.ref,
        value: opinionValue(opinion.value)
      },
      synthesizedReviewTitle: reviewProjection.synthesizedTitle
    }
  })

export const opinionRefFromDoc = (
  client: HulyClient["Type"],
  opinion: Opinion,
  review: Review
): Effect.Effect<OpinionRef, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function* () {
    const projection = yield* opinionRefProjectionFromDoc(client, opinion, review)
    yield* warnRecruitingReviewMetadataDegraded(projection.synthesizedReviewTitle ? 1 : 0, 0)
    return projection.ref
  })

const opinionDetail = (
  client: HulyClient["Type"],
  opinion: Opinion,
  review: Review
): Effect.Effect<OpinionDetail, HulyClientError | RecruitingModelMissingError, Diagnostics> =>
  Effect.gen(function* () {
    const description = optionalMarkupToMarkdown(opinion.description, client.markupUrlConfig, undefined)
    const comments = optionalCount(opinion.comments)
    const attachments = optionalCount(opinion.attachments)
    return {
      ...(yield* opinionRefFromDoc(client, opinion, review)),
      ...(description === undefined || description === "" ? {} : { description }),
      ...(comments === undefined ? {} : { comments }),
      ...(attachments === undefined ? {} : { attachments }),
      modifiedOn: Timestamp.make(opinion.modifiedOn),
      ...(opinion.createdOn === undefined ? {} : { createdOn: Timestamp.make(opinion.createdOn) })
    }
  })

export const findOpinion = (
  client: HulyClient["Type"],
  identifier: OpinionIdentifier,
  review?: Review
): Effect.Effect<
  Opinion,
  HulyClientError | RecruitingOpinionIdentifierAmbiguousError | RecruitingOpinionNotFoundError
> =>
  Effect.gen(function* () {
    const byId = yield* client.findOne<Opinion>(
      recruitIds.class.Opinion,
      hulyQuery<Opinion>({ _id: toRef<Opinion>(identifier) })
    )
    if (byId !== undefined) {
      if (review === undefined || String(byId.attachedTo) === String(review._id)) return byId
      return yield* new OpinionMissing({ identifier })
    }

    const number = prefixedNumber(identifier, "OPE")
    const query: StrictDocumentQuery<Opinion> = {
      ...(number === undefined ? { _id: toRef<Opinion>(identifier) } : { number }),
      ...(review === undefined ? {} : { attachedTo: review._id })
    }
    const opinions = yield* client.findAll<Opinion>(recruitIds.class.Opinion, hulyQuery(query))
    if (opinions.length === 0) return yield* new OpinionMissing({ identifier })
    if (opinions.length > 1) {
      return yield* new OpinionAmbiguous({ identifier, matches: Count.make(opinions.length) })
    }
    return assertAt(opinions, 0)
  })

const resolveReview = (client: HulyClient["Type"], review: OpinionReadParams["review"]) =>
  review === undefined ? Effect.succeed(undefined) : findReview(client, review)

export const parentReviewFromOpinion = (client: HulyClient["Type"], opinion: Opinion) =>
  findReview(client, ReviewIdentifierSchema.make(String(opinion.attachedTo)))

export const listRecruitingOpinions = (
  params: ListRecruitingOpinionsParams
): Effect.Effect<ListRecruitingOpinionsResult, OpinionReadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const review = yield* findReview(client, params.review)
    const opinions = yield* client.findAll<Opinion>(
      recruitIds.class.Opinion,
      hulyQuery<Opinion>({ attachedTo: review._id }),
      { limit: listLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )
    const projections = yield* Effect.forEach(opinions, (opinion) =>
      opinionRefProjectionFromDoc(client, opinion, review)
    )
    yield* warnRecruitingReviewMetadataDegraded(
      projections.some((projection) => projection.synthesizedReviewTitle) ? 1 : 0,
      0
    )
    const refs = projections.map((projection) => projection.ref)
    return { opinions: refs, total: Count.make(refs.length) }
  })

export const getRecruitingOpinion = (
  params: GetRecruitingOpinionParams
): Effect.Effect<OpinionDetail, OpinionReadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const review = yield* resolveReview(client, params.review)
    const opinion = yield* findOpinion(client, params.opinion, review)
    const parent = review ?? (yield* parentReviewFromOpinion(client, opinion))
    return yield* opinionDetail(client, opinion, parent)
  })

export const createRecruitingOpinion = (
  params: CreateRecruitingOpinionParams
): Effect.Effect<RecruitingOpinionMutationResult, OpinionWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const review = yield* findReview(client, params.review)
    const number = yield* incrementSequence(client, recruitIds.class.Opinion, "opinion")
    const opinionId = generateId<Opinion>()
    const data: AttachedData<Opinion> = {
      number,
      value: params.value,
      description:
        params.description === undefined ? "" : markdownToMarkupString(params.description, client.markupUrlConfig)
    }
    yield* client.addCollection(
      recruitIds.class.Opinion,
      review.space,
      review._id,
      recruitIds.class.Review,
      "opinions",
      data,
      opinionId
    )
    return {
      opinion: {
        id: OpinionId.make(opinionId),
        identifier: opinionIdentifierFromNumber(number),
        review: yield* reviewRefFromDoc(client, review),
        value: opinionValue(data.value)
      }
    }
  })

export const updateRecruitingOpinion = (
  params: UpdateRecruitingOpinionParams
): Effect.Effect<RecruitingOpinionMutationResult, OpinionWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const updateCollection = client.updateCollection
    if (updateCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({ message: "Huly client does not support updateCollection" })
    }
    const review = yield* resolveReview(client, params.review)
    const opinion = yield* findOpinion(client, params.opinion, review)
    const parent = review ?? (yield* parentReviewFromOpinion(client, opinion))
    const operations: DocumentUpdate<Opinion> = {
      ...(params.value === undefined ? {} : { value: params.value }),
      ...(params.description === undefined
        ? {}
        : {
            description:
              params.description === null ? "" : markdownToMarkupString(params.description, client.markupUrlConfig)
          })
    }
    yield* updateCollection(
      recruitIds.class.Opinion,
      opinion.space,
      opinion._id,
      opinion.attachedTo,
      recruitIds.class.Review,
      "opinions",
      operations
    )
    return { opinion: yield* opinionRefFromDoc(client, { ...opinion, ...operations }, parent) }
  })

export const deleteRecruitingOpinion = (
  params: DeleteRecruitingOpinionParams
): Effect.Effect<DeleteRecruitingOpinionResult, OpinionWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const removeCollection = client.removeCollection
    if (removeCollection === undefined) {
      return yield* new RecruitingMutationUnsupportedError({ message: "Huly client does not support removeCollection" })
    }
    const review = yield* resolveReview(client, params.review)
    const opinion = yield* findOpinion(client, params.opinion, review)
    const parent = review ?? (yield* parentReviewFromOpinion(client, opinion))
    const ref = yield* opinionRefFromDoc(client, opinion, parent)
    yield* removeCollection(
      recruitIds.class.Opinion,
      opinion.space,
      opinion._id,
      opinion.attachedTo,
      recruitIds.class.Review,
      "opinions"
    )
    return { opinion: ref, deleted: true }
  })
