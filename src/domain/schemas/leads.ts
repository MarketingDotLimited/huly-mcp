import { JSONSchema, ParseResult, Schema } from "effect"

import {
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DocId,
  LimitParam,
  ListTotal,
  NonEmptyString,
  PersonName,
  PersonRefInput,
  StatusName,
  Timestamp
} from "./shared.js"
import { TaskTypeRefSchema } from "./task-management.js"

// --- Lead IDs ---
// Upstream Huly reference:
// https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/plugins/lead/src/index.ts#L71-L82
// Funnel is a Project-derived space; expose the stable `_id` as the machine identifier.
// Lead identifiers use the upstream `LEAD-<number>` convention.

export const FunnelReference = NonEmptyString.pipe(Schema.brand("FunnelReference"))
export type FunnelReference = Schema.Schema.Type<typeof FunnelReference>

export const FunnelIdentifier = DocId.pipe(Schema.brand("FunnelIdentifier"))
export type FunnelIdentifier = Schema.Schema.Type<typeof FunnelIdentifier>

// Specific upstream proof for the LEAD prefix:
// - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/types.ts#L70
// - https://github.com/hcengineering/platform/blob/b9657d53d130a2ed8034c1b71ab0cf8b7a0b4994/models/lead/src/migration.ts#L67
const CanonicalLeadIdentifier = Schema.Trim.pipe(
  Schema.pattern(/^LEAD-\d+$/, {
    // `CanonicalLeadIdentifier` is private and only consumed as the transform
    // target of `LeadIdentifier` below, whose decode always emits a canonical
    // `LEAD-<digits>` string. This pattern therefore never fails, so the message
    // thunk is never formatted; the user-facing failure message lives in the
    // transform's `decode` instead.
    /* v8 ignore next -- unreachable: transform always feeds a canonical LEAD-<n> value */
    message: () => "Expected lead identifier like 'LEAD-1'"
  }),
  Schema.brand("LeadIdentifier")
)

const leadIdentifierPattern = /^(?:LEAD-)?(\d+)$/i

export const LeadIdentifier = Schema.transformOrFail(Schema.String, CanonicalLeadIdentifier, {
  strict: true,
  decode: (input, _options, ast) => {
    const match = leadIdentifierPattern.exec(input.trim())
    return match !== null
      ? ParseResult.succeed(`LEAD-${match[1]}`)
      : ParseResult.fail(new ParseResult.Type(ast, input, "Expected lead identifier like 'LEAD-1'"))
  },
  encode: ParseResult.succeed
}).annotations({ jsonSchema: { type: "string", pattern: "^LEAD-[0-9]+$" } })
export type LeadIdentifier = Schema.Schema.Type<typeof LeadIdentifier>

// --- Output Schemas ---

export const FunnelSummarySchema = Schema.Struct({
  identifier: FunnelIdentifier,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean
}).annotations({ title: "FunnelSummary", description: "Sales funnel summary" })

export type FunnelSummary = Schema.Schema.Type<typeof FunnelSummarySchema>

export const LeadSummarySchema = Schema.Struct({
  identifier: LeadIdentifier,
  title: Schema.String,
  status: StatusName,
  assignee: Schema.optional(PersonName),
  customer: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({ title: "LeadSummary", description: "Lead summary for list operations" })

export type LeadSummary = Schema.Schema.Type<typeof LeadSummarySchema>

export const LeadDetailSchema = Schema.Struct({
  identifier: LeadIdentifier,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: StatusName,
  assignee: Schema.optional(PersonName),
  customer: Schema.optional(Schema.String),
  funnel: FunnelIdentifier,
  funnelName: Schema.String,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({ title: "LeadDetail", description: "Full lead with all fields" })

export type LeadDetail = Schema.Schema.Type<typeof LeadDetailSchema>

// --- Param Schemas ---

export const ListFunnelsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotations({
      description: `Include archived funnels in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active)`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({ description: `Maximum number of funnels to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotations({ title: "ListFunnelsParams", description: "Parameters for listing funnels" })

export type ListFunnelsParams = Schema.Schema.Type<typeof ListFunnelsParamsSchema>

const ListLeadsParamsBase = Schema.Struct({
  funnel: FunnelReference.annotations({
    description: "Funnel ID returned by list_funnels, or funnel name for convenience lookup."
  }),
  status: Schema.optional(StatusName.annotations({ description: "Filter by status name" })),
  assignee: Schema.optional(PersonRefInput.annotations({ description: "Filter by assignee email or display name" })),
  titleSearch: Schema.optional(
    Schema.String.annotations({ description: "Search leads by title substring (case-insensitive)" })
  ),
  limit: Schema.optional(
    LimitParam.annotations({ description: `Maximum number of leads to return (default: ${DEFAULT_LIMIT})` })
  )
})

export const ListLeadsParamsSchema = ListLeadsParamsBase.annotations({
  title: "ListLeadsParams",
  description: "Parameters for listing leads in a funnel"
})

export type ListLeadsParams = Schema.Schema.Type<typeof ListLeadsParamsSchema>

export const GetLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotations({
    description: "Funnel ID returned by list_funnels, or funnel name for convenience lookup."
  }),
  identifier: LeadIdentifier.annotations({ description: "Lead identifier (e.g., 'LEAD-1')" })
}).annotations({ title: "GetLeadParams", description: "Parameters for getting a single lead" })

export type GetLeadParams = Schema.Schema.Type<typeof GetLeadParamsSchema>

const LeadPersonCustomerLocatorSchema = Schema.Struct({
  kind: Schema.Literal("person"),
  identifier: PersonRefInput.annotations({
    description: "Existing person _id, exact email address, or exact display name."
  })
})

const LeadOrganizationCustomerLocatorSchema = Schema.Struct({
  kind: Schema.Literal("organization"),
  identifier: NonEmptyString.annotations({
    description: "Existing organization _id or exact unique organization name."
  })
})

export const LeadCustomerLocatorSchema = Schema.Union(
  LeadPersonCustomerLocatorSchema,
  LeadOrganizationCustomerLocatorSchema
).annotations({
  title: "LeadCustomerLocator",
  description:
    "Explicit locator for an existing Huly customer contact. Use person for a person _id, exact email, or exact display name; use organization for an organization _id or exact unique name. This tool never creates contacts inline."
})

export type LeadCustomerLocator = Schema.Schema.Type<typeof LeadCustomerLocatorSchema>

export const CreateLeadParamsSchema = Schema.Struct({
  funnel: FunnelReference.annotations({
    description: "Active funnel ID returned by list_funnels, or exact funnel name."
  }),
  customer: LeadCustomerLocatorSchema.annotations({
    description:
      "Existing person or organization to attach as the customer. The contact is promoted to a Huly Customer idempotently when needed."
  }),
  title: NonEmptyString.annotations({ description: "Non-empty lead title." }),
  description: Schema.optional(
    Schema.String.annotations({
      description: "Optional Markdown description. Current-workspace Huly links are preserved as native references."
    })
  ),
  assignee: Schema.optional(
    PersonRefInput.annotations({
      description: "Optional employee assignee by person/employee ID, exact email, or exact display name."
    })
  ),
  status: Schema.optional(
    StatusName.annotations({ description: "Optional exact status name within the selected task type workflow." })
  ),
  taskType: Schema.optional(
    TaskTypeRefSchema.annotations({
      description:
        "Optional native Lead task type _id or exact display name within the funnel. Omit when the funnel has one deterministic Lead type."
    })
  )
}).annotations({
  title: "CreateLeadParams",
  description: "Create one native Huly lead for an existing person or organization in an active funnel."
})

export type CreateLeadParams = Schema.Schema.Type<typeof CreateLeadParamsSchema>

// --- JSON Schemas & Parsers ---

export const listFunnelsParamsJsonSchema = JSONSchema.make(ListFunnelsParamsSchema)
export const listLeadsParamsJsonSchema = JSONSchema.make(ListLeadsParamsSchema)
export const getLeadParamsJsonSchema = JSONSchema.make(GetLeadParamsSchema)
export const createLeadParamsJsonSchema = JSONSchema.make(CreateLeadParamsSchema)

export const parseListFunnelsParams = Schema.decodeUnknown(ListFunnelsParamsSchema)
export const parseListLeadsParams = Schema.decodeUnknown(ListLeadsParamsSchema)
export const parseGetLeadParams = Schema.decodeUnknown(GetLeadParamsSchema)
export const parseCreateLeadParams = Schema.decodeUnknown(CreateLeadParamsSchema, { onExcessProperty: "error" })
export const parseLeadDetail = Schema.decodeUnknown(LeadDetailSchema)
export const parseLeadSummary = Schema.decodeUnknown(LeadSummarySchema)
export const ListFunnelsResultSchema = Schema.Struct({ funnels: Schema.Array(FunnelSummarySchema), total: ListTotal })
export type ListFunnelsResult = Schema.Schema.Type<typeof ListFunnelsResultSchema>

export const ListLeadsResultSchema = Schema.Array(LeadSummarySchema)
export const GetLeadResultSchema = LeadDetailSchema

export const CreateLeadResultSchema = Schema.Struct({
  leadId: DocId.annotations({ description: "Raw Huly Lead document _id." }),
  identifier: LeadIdentifier.annotations({ description: "Human lead identifier in LEAD-<number> form." })
}).annotations({ title: "CreateLeadResult", description: "Identifiers for the newly created native Huly lead." })

export type CreateLeadResult = Schema.Schema.Type<typeof CreateLeadResultSchema>
