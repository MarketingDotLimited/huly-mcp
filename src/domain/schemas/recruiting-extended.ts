import { Schema } from "effect"

import { EventParticipantLocatorSchema } from "./calendar.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema as toDraft07JsonSchemaBase, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  ApplicantIdentifier,
  ApplicantMatchIdentifier,
  CandidateIdentifier,
  OpinionIdentifier,
  ReviewIdentifier
} from "./recruiting-common.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

export * from "./recruiting-common.js"
export * from "./recruiting-extended-results.js"

const RECRUITING_EXTENDED_FIELD_DESCRIPTIONS = {
  match: "Applicant-match locator.",
  candidate: "Candidate locator.",
  review: "Review locator.",
  opinion: "Opinion locator.",
  application: "Applicant/application locator.",
  applicationContext: "Applicant/application context locator.",
  complete: "Filter by completion state.",
  query: "Case-insensitive search text.",
  from: "Inclusive lower timestamp bound.",
  to: "Inclusive upper timestamp bound.",
  limit: "Maximum number of records to return.",
  title: "Review title.",
  date: "Review date timestamp.",
  dueDate: "Review due timestamp.",
  description: `Markdown description. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
  verdict: "Review verdict.",
  company: "Company organization locator.",
  location: "Review location.",
  participants: "Calendar participant locators.",
  value: "Opinion value."
}

const toDraft07JsonSchema = (schema: Schema.Constraint): object =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchemaBase(schema), RECRUITING_EXTENDED_FIELD_DESCRIPTIONS)

const RecruitingSearchText = NonEmptyString.annotateKey({ description: "Non-empty case-insensitive search text." })

const RecruitingMarkdownInput = NonEmptyString.annotate({
  description: `Non-empty markdown text converted to Huly rich-text markup. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
})

const RecruitingClearableMarkdownInput = Schema.NullOr(RecruitingMarkdownInput).annotate({
  description: `Non-empty markdown replacement text, or null to clear this rich-text field. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
})

const RecruitingFreeTextInput = NonEmptyString.annotateKey({ description: "Non-empty free-form Recruiting text." })

const RecruitingClearableFreeTextInput = Schema.NullOr(RecruitingFreeTextInput).annotate({
  description: "Non-empty replacement text, or null to clear this field."
})

const ApplicantMatchCompleteInput = Schema.Boolean.annotate({
  description: "Filter generated applicant matches by Huly completion state."
})

export const ListRecruitingApplicantMatchesParamsSchema = Schema.Struct({
  candidate: Schema.optional(
    CandidateIdentifier.annotateKey({
      description: "Candidate locator: person _id, email, or exact person display name."
    })
  ),
  complete: Schema.optional(ApplicantMatchCompleteInput),
  query: Schema.optional(
    RecruitingSearchText.annotateKey({ description: "Case-insensitive applicant-match vacancy or summary search." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({
      description: `Maximum number of applicant matches to return (default: ${DEFAULT_LIMIT}).`
    })
  )
})
export type ListRecruitingApplicantMatchesParams = Schema.Schema.Type<typeof ListRecruitingApplicantMatchesParamsSchema>

export const GetRecruitingApplicantMatchParamsSchema = Schema.Struct({
  match: ApplicantMatchIdentifier.annotateKey({ description: "Applicant match locator: raw Huly applicant-match _id." })
})
export type GetRecruitingApplicantMatchParams = Schema.Schema.Type<typeof GetRecruitingApplicantMatchParamsSchema>

export const ListRecruitingReviewsParamsSchema = Schema.Struct({
  candidate: Schema.optional(CandidateIdentifier),
  application: Schema.optional(ApplicantIdentifier),
  query: Schema.optional(
    RecruitingSearchText.annotateKey({ description: "Case-insensitive review title, verdict, or location search." })
  ),
  from: Schema.optional(Timestamp),
  to: Schema.optional(Timestamp),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of reviews to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingReviewsParams = Schema.Schema.Type<typeof ListRecruitingReviewsParamsSchema>

export const ReviewLocatorSchema = Schema.Struct({
  review: ReviewIdentifier.annotate({
    description: "Review locator: raw _id, RVE-<number>, bare number, or exact title."
  }),
  candidate: Schema.optional(CandidateIdentifier),
  application: Schema.optional(ApplicantIdentifier)
})
export type ReviewLocator = Schema.Schema.Type<typeof ReviewLocatorSchema>

export const GetRecruitingReviewParamsSchema = ReviewLocatorSchema
export type GetRecruitingReviewParams = ReviewLocator

export const CreateRecruitingReviewParamsSchema = Schema.Struct({
  candidate: CandidateIdentifier,
  title: RecruitingFreeTextInput.annotateKey({ description: "Non-empty review title." }),
  date: Timestamp,
  dueDate: Schema.optional(Timestamp),
  description: Schema.optional(RecruitingMarkdownInput),
  verdict: Schema.optional(
    RecruitingFreeTextInput.annotateKey({ description: "Non-empty initial review verdict text." })
  ),
  application: Schema.optional(ApplicantIdentifier),
  company: Schema.optional(
    RecruitingFreeTextInput.annotateKey({ description: "Company organization ID or exact name." })
  ),
  location: Schema.optional(RecruitingFreeTextInput.annotateKey({ description: "Non-empty review location text." })),
  participants: Schema.optional(Schema.Array(EventParticipantLocatorSchema))
})
export type CreateRecruitingReviewParams = Schema.Schema.Type<typeof CreateRecruitingReviewParamsSchema>

export const UPDATE_RECRUITING_REVIEW_FIELDS = [
  "title",
  "description",
  "verdict",
  "date",
  "dueDate",
  "application",
  "company",
  "location",
  "participants"
] as const

export const UpdateRecruitingReviewParamsSchema = Schema.Struct({
  review: ReviewIdentifier,
  candidate: Schema.optional(CandidateIdentifier),
  applicationContext: Schema.optional(ApplicantIdentifier),
  title: Schema.optional(RecruitingFreeTextInput.annotateKey({ description: "Non-empty replacement review title." })),
  description: Schema.optional(RecruitingClearableMarkdownInput),
  verdict: Schema.optional(RecruitingClearableFreeTextInput),
  date: Schema.optional(Timestamp),
  dueDate: Schema.optional(Timestamp),
  application: Schema.optional(Schema.NullOr(ApplicantIdentifier)),
  company: Schema.optional(Schema.NullOr(RecruitingFreeTextInput)),
  location: Schema.optional(RecruitingClearableFreeTextInput),
  participants: Schema.optional(Schema.Array(EventParticipantLocatorSchema))
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_RECRUITING_REVIEW_FIELDS)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_REVIEW_FIELDS)
    )
  )
)
export type UpdateRecruitingReviewParams = Schema.Schema.Type<typeof UpdateRecruitingReviewParamsSchema>
assertUpdateFields<UpdateRecruitingReviewParams>()(
  ["review", "candidate", "applicationContext"],
  UPDATE_RECRUITING_REVIEW_FIELDS
)

export const DeleteRecruitingReviewParamsSchema = ReviewLocatorSchema
export type DeleteRecruitingReviewParams = ReviewLocator

export const ListRecruitingOpinionsParamsSchema = Schema.Struct({
  review: ReviewIdentifier,
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of opinions to return (default: ${DEFAULT_LIMIT}).` })
  )
})
export type ListRecruitingOpinionsParams = Schema.Schema.Type<typeof ListRecruitingOpinionsParamsSchema>

export const OpinionLocatorSchema = Schema.Struct({
  opinion: OpinionIdentifier.annotateKey({ description: "Opinion locator: raw _id, OPE-<number>, or bare number." }),
  review: Schema.optional(ReviewIdentifier)
})
export type OpinionLocator = Schema.Schema.Type<typeof OpinionLocatorSchema>

export const GetRecruitingOpinionParamsSchema = OpinionLocatorSchema
export type GetRecruitingOpinionParams = OpinionLocator

export const CreateRecruitingOpinionParamsSchema = Schema.Struct({
  review: ReviewIdentifier,
  value: RecruitingFreeTextInput.annotateKey({ description: "Non-empty opinion value." }),
  description: Schema.optional(RecruitingMarkdownInput)
})
export type CreateRecruitingOpinionParams = Schema.Schema.Type<typeof CreateRecruitingOpinionParamsSchema>

export const UPDATE_RECRUITING_OPINION_FIELDS = ["value", "description"] as const
export const UpdateRecruitingOpinionParamsSchema = Schema.Struct({
  opinion: OpinionIdentifier,
  review: Schema.optional(ReviewIdentifier),
  value: Schema.optional(RecruitingFreeTextInput.annotateKey({ description: "Non-empty replacement opinion value." })),
  description: Schema.optional(RecruitingClearableMarkdownInput)
}).pipe(
  Schema.check(
    Schema.makeFilter((params) =>
      hasAtLeastOneDefined(params, UPDATE_RECRUITING_OPINION_FIELDS)
        ? undefined
        : atLeastOneUpdateFieldMessage(UPDATE_RECRUITING_OPINION_FIELDS)
    )
  )
)
export type UpdateRecruitingOpinionParams = Schema.Schema.Type<typeof UpdateRecruitingOpinionParamsSchema>
assertUpdateFields<UpdateRecruitingOpinionParams>()(["opinion", "review"], UPDATE_RECRUITING_OPINION_FIELDS)

export const DeleteRecruitingOpinionParamsSchema = OpinionLocatorSchema
export type DeleteRecruitingOpinionParams = OpinionLocator

export const listRecruitingApplicantMatchesParamsJsonSchema = toDraft07JsonSchema(
  ListRecruitingApplicantMatchesParamsSchema
)
export const getRecruitingApplicantMatchParamsJsonSchema = toDraft07JsonSchema(GetRecruitingApplicantMatchParamsSchema)
export const listRecruitingReviewsParamsJsonSchema = toDraft07JsonSchema(ListRecruitingReviewsParamsSchema)
export const getRecruitingReviewParamsJsonSchema = toDraft07JsonSchema(GetRecruitingReviewParamsSchema)
export const createRecruitingReviewParamsJsonSchema = toDraft07JsonSchema(CreateRecruitingReviewParamsSchema)
export const updateRecruitingReviewParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateRecruitingReviewParamsSchema),
  UPDATE_RECRUITING_REVIEW_FIELDS
)
export const deleteRecruitingReviewParamsJsonSchema = toDraft07JsonSchema(DeleteRecruitingReviewParamsSchema)
export const listRecruitingOpinionsParamsJsonSchema = toDraft07JsonSchema(ListRecruitingOpinionsParamsSchema)
export const getRecruitingOpinionParamsJsonSchema = toDraft07JsonSchema(GetRecruitingOpinionParamsSchema)
export const createRecruitingOpinionParamsJsonSchema = toDraft07JsonSchema(CreateRecruitingOpinionParamsSchema)
export const updateRecruitingOpinionParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateRecruitingOpinionParamsSchema),
  UPDATE_RECRUITING_OPINION_FIELDS
)
export const deleteRecruitingOpinionParamsJsonSchema = toDraft07JsonSchema(DeleteRecruitingOpinionParamsSchema)

export const parseListRecruitingApplicantMatchesParams = Schema.decodeUnknownEffect(
  ListRecruitingApplicantMatchesParamsSchema
)
export const parseGetRecruitingApplicantMatchParams = Schema.decodeUnknownEffect(
  GetRecruitingApplicantMatchParamsSchema
)
export const parseListRecruitingReviewsParams = Schema.decodeUnknownEffect(ListRecruitingReviewsParamsSchema)
export const parseGetRecruitingReviewParams = Schema.decodeUnknownEffect(GetRecruitingReviewParamsSchema)
export const parseCreateRecruitingReviewParams = Schema.decodeUnknownEffect(CreateRecruitingReviewParamsSchema)
export const parseUpdateRecruitingReviewParams = Schema.decodeUnknownEffect(UpdateRecruitingReviewParamsSchema)
export const parseDeleteRecruitingReviewParams = Schema.decodeUnknownEffect(DeleteRecruitingReviewParamsSchema)
export const parseListRecruitingOpinionsParams = Schema.decodeUnknownEffect(ListRecruitingOpinionsParamsSchema)
export const parseGetRecruitingOpinionParams = Schema.decodeUnknownEffect(GetRecruitingOpinionParamsSchema)
export const parseCreateRecruitingOpinionParams = Schema.decodeUnknownEffect(CreateRecruitingOpinionParamsSchema)
export const parseUpdateRecruitingOpinionParams = Schema.decodeUnknownEffect(UpdateRecruitingOpinionParamsSchema)
export const parseDeleteRecruitingOpinionParams = Schema.decodeUnknownEffect(DeleteRecruitingOpinionParamsSchema)
