import { Schema } from "effect"

import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { optionalOutput } from "./output-helpers.js"
import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  Email,
  LimitParam,
  ListTotal,
  MessageId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  PersonName,
  PositiveInteger,
  SpaceId,
  Timestamp,
  UrlString
} from "./shared.js"

const SdkOpenPayload = Schema.Unknown.annotate({
  description: "Raw SDK-owned approval transaction payload passed through without inventing a closed MCP-side schema."
})

const ApprovalRequestPersonIdentifier = NonEmptyString.annotate({
  description:
    "Person identifier for an approval participant. Prefer a raw Huly contact Person _id from read tools; exact email or exact display name are also accepted."
})

const ApprovalRequestBody = NonEmptyString.annotate({
  description: `Approval request comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
})

export const ApprovalRequestId = DocId.pipe(Schema.brand("ApprovalRequestId")).annotate({
  identifier: "ApprovalRequestId",
  title: "ApprovalRequestId",
  description: "Raw Huly Request document _id."
})
export type ApprovalRequestId = Schema.Schema.Type<typeof ApprovalRequestId>

export const ApprovalRequestCollection = NonEmptyString.pipe(Schema.brand("ApprovalRequestCollection")).annotate({
  identifier: "ApprovalRequestCollection",
  title: "ApprovalRequestCollection",
  description: "Parent collection name stored in Request.collection."
})
export type ApprovalRequestCollection = Schema.Schema.Type<typeof ApprovalRequestCollection>

export const ApprovalRequestStatusSchema = Schema.Literals(["Active", "Completed", "Rejected", "Cancelled"]).annotate({
  title: "ApprovalRequestStatus",
  description: "Generic approval request status from @hcengineering/request."
})
export type ApprovalRequestStatus = Schema.Schema.Type<typeof ApprovalRequestStatusSchema>

export const ApprovalPersonRefSchema = Schema.Struct({
  id: PersonId.annotate({ description: "Raw Huly contact Person _id referenced by the approval request." }),
  name: optionalOutput(PersonName),
  email: optionalOutput(
    Email.annotate({ description: "Best email channel found for the person, if resolvable and email-shaped." })
  ),
  url: optionalOutput(UrlString)
}).annotate({
  title: "ApprovalPersonRef",
  description:
    "Person referenced by a generic approval request. When contact metadata cannot be resolved, only id is returned."
})
export type ApprovalPersonRef = Schema.Schema.Type<typeof ApprovalPersonRefSchema>

export const ListApprovalRequestsParamsSchema = Schema.Struct({
  status: Schema.optional(
    ApprovalRequestStatusSchema.annotate({ description: "Optional approval request status filter." })
  ),
  attachedTo: Schema.optional(
    DocId.annotate({
      description:
        "Optional raw Huly document _id from Request.attachedTo. Use this when you already know the target document id."
    })
  ),
  attachedToClass: Schema.optional(
    ObjectClassName.annotate({
      description:
        "Optional raw Huly class id from Request.attachedToClass, for example tracker:class:Issue. Use with attachedTo when possible."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of approval requests to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({
  title: "ListApprovalRequestsParams",
  description:
    "Read-only discovery for generic @hcengineering/request Request documents. Filters accept raw Huly ids because approval requests can attach to many document classes."
})
export type ListApprovalRequestsParams = Schema.Schema.Type<typeof ListApprovalRequestsParamsSchema>

export const GetApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotate({ description: "Approval Request document _id." })
}).annotate({ title: "GetApprovalRequestParams", description: "Read one generic approval Request document by _id." })
export type GetApprovalRequestParams = Schema.Schema.Type<typeof GetApprovalRequestParamsSchema>

export const AddApprovalRequestParamsSchema = Schema.Struct({
  attachedTo: DocId.annotate({ description: "Raw Huly target document _id that the approval request attaches to." }),
  attachedToClass: ObjectClassName.annotate({
    description: "Raw Huly target document class id, for example tracker:class:Issue."
  }),
  space: Schema.optional(
    SpaceId.annotate({
      description:
        "Raw Huly space id for the target document. Omit it to resolve the target document and use its space."
    })
  ),
  collection: Schema.optional(
    ApprovalRequestCollection.annotate({
      description: "Parent collection name for the attached request. Defaults to requests."
    })
  ),
  requested: Schema.Array(ApprovalRequestPersonIdentifier)
    .pipe(Schema.check(Schema.isMinLength(1)))
    .annotate({ description: "People who must decide the approval. Duplicates are collapsed after resolution." }),
  requiredApprovesCount: Schema.optional(
    PositiveInteger.annotate({
      description:
        "Number of approvals required to complete the request. Defaults to the unique requested person count."
    })
  ),
  tx: SdkOpenPayload.annotate({
    description:
      "Opaque Huly SDK transaction applied by Huly when the approval request completes. Pass a real SDK tx payload."
  }),
  rejectedTx: Schema.optional(
    SdkOpenPayload.annotate({
      description: "Optional opaque Huly SDK transaction applied by Huly when the approval request is rejected."
    })
  )
}).annotate({
  title: "AddApprovalRequestParams",
  description:
    "Create a generic @hcengineering/request Request attached to any Huly document. This tool intentionally accepts raw target ids because approval requests are cross-module."
})
export type AddApprovalRequestParams = Schema.Schema.Type<typeof AddApprovalRequestParamsSchema>

export const AddApprovalRequestCommentParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotate({ description: "Approval Request document _id." }),
  body: ApprovalRequestBody
}).annotate({ title: "AddApprovalRequestCommentParams", description: "Add a plain comment to an approval request." })
export type AddApprovalRequestCommentParams = Schema.Schema.Type<typeof AddApprovalRequestCommentParamsSchema>

export const ApproveApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotate({ description: "Approval Request document _id." }),
  comment: Schema.optional(
    ApprovalRequestBody.annotate({ description: "Optional decision comment to attach before approving." })
  )
}).annotate({
  title: "ApproveApprovalRequestParams",
  description: "Approve an active approval request as the current Huly actor."
})
export type ApproveApprovalRequestParams = Schema.Schema.Type<typeof ApproveApprovalRequestParamsSchema>

export const RejectApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotate({ description: "Approval Request document _id." }),
  comment: ApprovalRequestBody.annotate({ description: "Required rejection decision comment." })
}).annotate({
  title: "RejectApprovalRequestParams",
  description: "Reject an active approval request as the current Huly actor."
})
export type RejectApprovalRequestParams = Schema.Schema.Type<typeof RejectApprovalRequestParamsSchema>

export const CancelApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotate({ description: "Approval Request document _id." })
}).annotate({
  title: "CancelApprovalRequestParams",
  description: "Cancel an active approval request created by the current Huly actor."
})
export type CancelApprovalRequestParams = Schema.Schema.Type<typeof CancelApprovalRequestParamsSchema>

export const ApprovalRequestSummarySchema = Schema.Struct({
  id: ApprovalRequestId,
  class: ObjectClassName.annotate({ description: "Raw Huly class id for the returned Request document." }),
  status: ApprovalRequestStatusSchema,
  attachedTo: DocId.annotate({ description: "Raw Huly document _id stored in Request.attachedTo." }),
  attachedToClass: ObjectClassName.annotate({ description: "Raw Huly class id stored in Request.attachedToClass." }),
  collection: ApprovalRequestCollection,
  space: SpaceId.annotate({ description: "Raw Huly space id stored in Request.space." }),
  requiredApprovesCount: Count.annotate({ description: "Number of approvals required to complete the request." }),
  requested: Schema.Array(ApprovalPersonRefSchema),
  approved: Schema.Array(ApprovalPersonRefSchema),
  rejected: optionalOutput(ApprovalPersonRefSchema),
  comments: optionalOutput(Count),
  createdOn: optionalOutput(Timestamp),
  modifiedOn: Timestamp
}).annotate({
  title: "ApprovalRequestSummary",
  description: "Read-only summary of a generic approval Request document."
})
export type ApprovalRequestSummary = Schema.Schema.Type<typeof ApprovalRequestSummarySchema>

export const ApprovalRequestDetailSchema = ApprovalRequestSummarySchema.pipe(
  Schema.fieldsAssign({
    approvedDates: optionalOutput(
      Schema.Array(Timestamp).annotate({
        description: "Approval timestamps from Request.approvedDates, aligned with approved people when present."
      })
    ),
    tx: SdkOpenPayload.annotate({ description: "Raw SDK transaction payload that the approval request refers to." }),
    rejectedTx: optionalOutput(
      SdkOpenPayload.annotate({ description: "Raw SDK rejection transaction payload, when present." })
    )
  })
).annotate({
  title: "ApprovalRequestDetail",
  description: "Detailed generic approval Request document with opaque SDK transaction payloads."
})
export type ApprovalRequestDetail = Schema.Schema.Type<typeof ApprovalRequestDetailSchema>

export const ListApprovalRequestsResultSchema = Schema.Struct({
  requests: Schema.Array(ApprovalRequestSummarySchema),
  total: ListTotal
})
export type ListApprovalRequestsResult = Schema.Schema.Type<typeof ListApprovalRequestsResultSchema>

export const GetApprovalRequestResultSchema = ApprovalRequestDetailSchema
export type GetApprovalRequestResult = Schema.Schema.Type<typeof GetApprovalRequestResultSchema>

export const ApprovalRequestMutationActionSchema = Schema.Literals([
  "created",
  "comment_added",
  "approved",
  "rejected",
  "cancelled"
]).annotate({
  title: "ApprovalRequestMutationAction",
  description: "Lifecycle action performed by an approval request write tool."
})
export type ApprovalRequestMutationAction = Schema.Schema.Type<typeof ApprovalRequestMutationActionSchema>

const CreatedApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("created"),
  changed: Schema.Literal(true),
  status: Schema.Literal("Active")
})

const CommentAddedApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("comment_added"),
  changed: Schema.Literal(true),
  comment: MessageId
})

const ApprovedApprovalRequestMutationResultSchema = Schema.Union([
  Schema.Struct({
    request: ApprovalRequestId,
    action: Schema.Literal("approved"),
    changed: Schema.Literal(true),
    comment: optionalOutput(
      MessageId.annotate({ description: "ChatMessage id when the approval call created an optional decision comment." })
    )
  }),
  Schema.Struct({
    request: ApprovalRequestId,
    action: Schema.Literal("approved"),
    changed: Schema.Literal(false),
    status: Schema.Literal("Active")
  })
])

const RejectedApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("rejected"),
  changed: Schema.Literal(true),
  status: Schema.Literal("Rejected"),
  comment: MessageId
})

const CancelledApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("cancelled"),
  changed: Schema.Literal(true),
  status: Schema.Literal("Cancelled")
})

export const ApprovalRequestMutationResultSchema = Schema.Union([
  CreatedApprovalRequestMutationResultSchema,
  CommentAddedApprovalRequestMutationResultSchema,
  ApprovedApprovalRequestMutationResultSchema,
  RejectedApprovalRequestMutationResultSchema,
  CancelledApprovalRequestMutationResultSchema
]).annotate({
  title: "ApprovalRequestMutationResult",
  description:
    "Discriminated result from an approval request write. Call get_approval_request after Huly indexes the write when you need the fully refreshed document."
})
export type ApprovalRequestMutationResult = Schema.Schema.Type<typeof ApprovalRequestMutationResultSchema>

const approvalParamsJsonSchema = (schema: Schema.Constraint, descriptions: Readonly<Record<string, string>>): object =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)

const requestDescription = "Approval Request document _id."
export const listApprovalRequestsParamsJsonSchema = approvalParamsJsonSchema(ListApprovalRequestsParamsSchema, {
  status: "Optional approval request status filter.",
  attachedTo: "Optional raw Huly target document _id.",
  attachedToClass: "Optional raw Huly target document class id.",
  limit: `Maximum number of approval requests to return (default: ${DEFAULT_LIMIT}).`
})
export const getApprovalRequestParamsJsonSchema = approvalParamsJsonSchema(GetApprovalRequestParamsSchema, {
  request: requestDescription
})
export const addApprovalRequestParamsJsonSchema = approvalParamsJsonSchema(AddApprovalRequestParamsSchema, {
  attachedTo: "Raw Huly target document _id that the approval request attaches to.",
  attachedToClass: "Raw Huly target document class id.",
  space: "Raw Huly target space id; omit to resolve it from the target.",
  collection: "Parent collection name; defaults to requests.",
  requested: "People who must decide the approval.",
  requiredApprovesCount: "Number of approvals required; defaults to the unique requested person count.",
  tx: "Opaque Huly SDK transaction applied when the request completes.",
  rejectedTx: "Optional opaque Huly SDK transaction applied when the request is rejected."
})
export const addApprovalRequestCommentParamsJsonSchema = approvalParamsJsonSchema(
  AddApprovalRequestCommentParamsSchema,
  { request: requestDescription, body: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` }
)
export const approveApprovalRequestParamsJsonSchema = approvalParamsJsonSchema(ApproveApprovalRequestParamsSchema, {
  request: requestDescription,
  comment: "Optional decision comment to attach before approving."
})
export const rejectApprovalRequestParamsJsonSchema = approvalParamsJsonSchema(RejectApprovalRequestParamsSchema, {
  request: requestDescription,
  comment: "Required rejection decision comment."
})
export const cancelApprovalRequestParamsJsonSchema = approvalParamsJsonSchema(CancelApprovalRequestParamsSchema, {
  request: requestDescription
})

export const parseListApprovalRequestsParams = Schema.decodeUnknownEffect(ListApprovalRequestsParamsSchema)
export const parseGetApprovalRequestParams = Schema.decodeUnknownEffect(GetApprovalRequestParamsSchema)
export const parseAddApprovalRequestParams = Schema.decodeUnknownEffect(AddApprovalRequestParamsSchema)
export const parseAddApprovalRequestCommentParams = Schema.decodeUnknownEffect(AddApprovalRequestCommentParamsSchema)
export const parseApproveApprovalRequestParams = Schema.decodeUnknownEffect(ApproveApprovalRequestParamsSchema)
export const parseRejectApprovalRequestParams = Schema.decodeUnknownEffect(RejectApprovalRequestParamsSchema)
export const parseCancelApprovalRequestParams = Schema.decodeUnknownEffect(CancelApprovalRequestParamsSchema)
