import { Schema } from "effect"

import { clearableText } from "./clearable.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import { IssuePrioritySchema } from "./issues.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ComponentIdentifier,
  ComponentLabel,
  Count,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  IssueId,
  IssueIdentifier,
  IssueTemplateChildId,
  IssueTemplateId,
  LimitParam,
  NonEmptyString,
  PersonName,
  PersonRefInput,
  ProjectIdentifier,
  StatusName,
  TemplateIdentifier,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import { PositiveTimeHours, timeHoursDescription } from "./time.js"

export const DEFAULT_INCLUDE_TEMPLATE_CHILDREN = true

// --- Child template schemas ---

export const IssueTemplateChildSchema = Schema.Struct({
  id: IssueTemplateChildId,
  title: NonEmptyString,
  description: Schema.optional(Schema.String),
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  component: Schema.optional(ComponentLabel),
  estimation: Schema.optional(
    PositiveTimeHours.annotate({ description: timeHoursDescription("Child default estimation") })
  )
}).annotate({ title: "IssueTemplateChild", description: "A child (sub-task) template within an issue template" })

export type IssueTemplateChild = Schema.Schema.Type<typeof IssueTemplateChildSchema>

/** Shared fields for child template input (used by both inline children and add_template_child). */
const ChildTemplateFieldsSchema = Schema.Struct({
  title: NonEmptyString.annotate({ description: "Child template title" }),
  description: Schema.optional(
    Schema.String.annotate({
      description: `Child template description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  priority: Schema.optional(IssuePrioritySchema.annotate({ description: "Child default priority" })),
  assignee: Schema.optional(PersonRefInput.annotate({ description: "Child default assignee email or display name" })),
  component: Schema.optional(ComponentIdentifier.annotate({ description: "Child default component ID or label" })),
  estimation: Schema.optional(
    PositiveTimeHours.annotate({ description: timeHoursDescription("Child default estimation") })
  )
})

export const ChildTemplateInputSchema = ChildTemplateFieldsSchema.annotate({
  title: "ChildTemplateInput",
  description: "Input for creating a child template within an issue template"
})

export type ChildTemplateInput = Schema.Schema.Type<typeof ChildTemplateInputSchema>

// --- Summary / detail schemas ---

export const IssueTemplateSummarySchema = Schema.Struct({
  id: IssueTemplateId,
  title: NonEmptyString,
  priority: Schema.optional(IssuePrioritySchema),
  childrenCount: Schema.optional(Count),
  modifiedOn: Schema.optional(Timestamp)
}).annotate({ title: "IssueTemplateSummary", description: "Issue template summary for list operations" })

export type IssueTemplateSummary = Schema.Schema.Type<typeof IssueTemplateSummarySchema>

export const IssueTemplateSchema = Schema.Struct({
  id: IssueTemplateId,
  title: NonEmptyString,
  description: Schema.optional(Schema.String),
  priority: Schema.optional(IssuePrioritySchema),
  assignee: Schema.optional(PersonName),
  component: Schema.optional(ComponentLabel),
  estimation: Schema.optional(PositiveTimeHours.annotate({ description: timeHoursDescription("Default estimation") })),
  children: Schema.optional(Schema.Array(IssueTemplateChildSchema)),
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotate({ title: "IssueTemplate", description: "Full issue template with all fields including children" })

export type IssueTemplate = Schema.Schema.Type<typeof IssueTemplateSchema>

// --- Params schemas ---

export const ListIssueTemplatesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of templates to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListIssueTemplatesParams", description: "Parameters for listing issue templates" })

export type ListIssueTemplatesParams = Schema.Schema.Type<typeof ListIssueTemplatesParamsSchema>

export const GetIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  template: TemplateIdentifier.annotate({ description: "Template ID or title" })
}).annotate({ title: "GetIssueTemplateParams", description: "Parameters for getting a single issue template" })

export type GetIssueTemplateParams = Schema.Schema.Type<typeof GetIssueTemplateParamsSchema>

export const CreateIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  title: NonEmptyString.annotate({ description: "Template title" }),
  description: Schema.optional(
    Schema.String.annotate({ description: `Template description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}` })
  ),
  priority: Schema.optional(
    IssuePrioritySchema.annotate({ description: "Default priority for issues created from this template" })
  ),
  assignee: Schema.optional(PersonRefInput.annotate({ description: "Default assignee email address or display name" })),
  component: Schema.optional(ComponentIdentifier.annotate({ description: "Default component ID or label" })),
  estimation: Schema.optional(PositiveTimeHours.annotate({ description: timeHoursDescription("Default estimation") })),
  children: Schema.optional(
    Schema.Array(ChildTemplateInputSchema).annotate({ description: "Child (sub-task) templates to include" })
  )
}).annotate({ title: "CreateIssueTemplateParams", description: "Parameters for creating an issue template" })

export type CreateIssueTemplateParams = Schema.Schema.Type<typeof CreateIssueTemplateParamsSchema>

export const CreateIssueFromTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  template: TemplateIdentifier.annotate({ description: "Template ID or title" }),
  title: Schema.optional(
    NonEmptyString.annotate({ description: "Override title (uses template title if not specified)" })
  ),
  description: Schema.optional(
    Schema.String.annotate({
      description: `Override description in markdown (uses template description if not specified). ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  priority: Schema.optional(IssuePrioritySchema.annotate({ description: "Override priority" })),
  assignee: Schema.optional(PersonRefInput.annotate({ description: "Override assignee email or display name" })),
  status: Schema.optional(
    StatusName.annotate({ description: "Initial status (uses project default if not specified)" })
  ),
  includeChildren: Schema.optional(
    Schema.Boolean.annotate({
      description: `Whether to create sub-issues from template children (default: ${DEFAULT_INCLUDE_TEMPLATE_CHILDREN})`
    })
  )
}).annotate({ title: "CreateIssueFromTemplateParams", description: "Parameters for creating an issue from a template" })

export type CreateIssueFromTemplateParams = Schema.Schema.Type<typeof CreateIssueFromTemplateParamsSchema>

export const UPDATE_ISSUE_TEMPLATE_FIELDS = [
  "title",
  "description",
  "priority",
  "assignee",
  "component",
  "estimation"
] as const satisfies ReadonlyArray<"title" | "description" | "priority" | "assignee" | "component" | "estimation">

export const UpdateIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  template: TemplateIdentifier.annotate({ description: "Template ID or title" }),
  title: Schema.optional(NonEmptyString.annotate({ description: "New template title" })),
  description: Schema.optional(
    clearableText(`New template description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`)
  ),
  priority: Schema.optional(IssuePrioritySchema.annotate({ description: "New default priority" })),
  assignee: Schema.optional(
    Schema.NullOr(PersonRefInput).annotate({
      description: "New default assignee email or display name (null to unassign)"
    })
  ),
  component: Schema.optional(
    Schema.NullOr(ComponentIdentifier).annotate({ description: "New default component ID or label (null to clear)" })
  ),
  estimation: Schema.optional(
    Schema.NullOr(PositiveTimeHours).annotate({
      description: `${timeHoursDescription("New default estimation")} Use null to clear.`
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_ISSUE_TEMPLATE_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_ISSUE_TEMPLATE_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateIssueTemplateParams",
    description: `Parameters for updating an issue template. ${atLeastOneUpdateFieldMessage(
      UPDATE_ISSUE_TEMPLATE_FIELDS
    )}`
  })

export type UpdateIssueTemplateParams = Schema.Schema.Type<typeof UpdateIssueTemplateParamsSchema>
assertUpdateFields<UpdateIssueTemplateParams>()(["project", "template"], UPDATE_ISSUE_TEMPLATE_FIELDS)

export const DeleteIssueTemplateParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  template: TemplateIdentifier.annotate({ description: "Template ID or title" })
}).annotate({ title: "DeleteIssueTemplateParams", description: "Parameters for deleting an issue template" })

export type DeleteIssueTemplateParams = Schema.Schema.Type<typeof DeleteIssueTemplateParamsSchema>

export const AddTemplateChildParamsSchema = ChildTemplateFieldsSchema.pipe(
  Schema.fieldsAssign({
    project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
    template: TemplateIdentifier.annotate({ description: "Template ID or title" })
  })
).annotate({
  title: "AddTemplateChildParams",
  description: "Parameters for adding a child template to an issue template"
})

export type AddTemplateChildParams = Schema.Schema.Type<typeof AddTemplateChildParamsSchema>

export const RemoveTemplateChildParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" }),
  template: TemplateIdentifier.annotate({ description: "Template ID or title" }),
  childId: IssueTemplateChildId.annotate({ description: "ID of the child template to remove" })
}).annotate({
  title: "RemoveTemplateChildParams",
  description: "Parameters for removing a child template from an issue template"
})

export type RemoveTemplateChildParams = Schema.Schema.Type<typeof RemoveTemplateChildParamsSchema>

// --- JSON schemas ---

export const listIssueTemplatesParamsJsonSchema = toDraft07JsonSchema(ListIssueTemplatesParamsSchema)
export const getIssueTemplateParamsJsonSchema = toDraft07JsonSchema(GetIssueTemplateParamsSchema)
export const createIssueTemplateParamsJsonSchema = toDraft07JsonSchema(CreateIssueTemplateParamsSchema)
export const createIssueFromTemplateParamsJsonSchema = toDraft07JsonSchema(CreateIssueFromTemplateParamsSchema)
export const updateIssueTemplateParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateIssueTemplateParamsSchema),
  UPDATE_ISSUE_TEMPLATE_FIELDS
)
export const deleteIssueTemplateParamsJsonSchema = toDraft07JsonSchema(DeleteIssueTemplateParamsSchema)
export const addTemplateChildParamsJsonSchema = toDraft07JsonSchema(AddTemplateChildParamsSchema)
export const removeTemplateChildParamsJsonSchema = toDraft07JsonSchema(RemoveTemplateChildParamsSchema)

// --- Parsers ---

export const parseIssueTemplate = Schema.decodeUnknownEffect(IssueTemplateSchema)
export const parseIssueTemplateSummary = Schema.decodeUnknownEffect(IssueTemplateSummarySchema)
export const parseListIssueTemplatesParams = Schema.decodeUnknownEffect(ListIssueTemplatesParamsSchema)
export const parseGetIssueTemplateParams = Schema.decodeUnknownEffect(GetIssueTemplateParamsSchema)
export const parseCreateIssueTemplateParams = Schema.decodeUnknownEffect(CreateIssueTemplateParamsSchema)
export const parseCreateIssueFromTemplateParams = Schema.decodeUnknownEffect(CreateIssueFromTemplateParamsSchema)
export const parseUpdateIssueTemplateParams = Schema.decodeUnknownEffect(UpdateIssueTemplateParamsSchema)
export const parseDeleteIssueTemplateParams = Schema.decodeUnknownEffect(DeleteIssueTemplateParamsSchema)
export const parseAddTemplateChildParams = Schema.decodeUnknownEffect(AddTemplateChildParamsSchema)
export const parseRemoveTemplateChildParams = Schema.decodeUnknownEffect(RemoveTemplateChildParamsSchema)
export const CreateIssueTemplateResultSchema = Schema.Struct({ id: IssueTemplateId, title: Schema.String })
export type CreateIssueTemplateResult = Schema.Schema.Type<typeof CreateIssueTemplateResultSchema>
export const UpdateIssueTemplateResultSchema = Schema.Struct({ id: IssueTemplateId, updated: Schema.Boolean })
export type UpdateIssueTemplateResult = Schema.Schema.Type<typeof UpdateIssueTemplateResultSchema>
export const DeleteIssueTemplateResultSchema = Schema.Struct({ id: IssueTemplateId, deleted: Schema.Boolean })
export type DeleteIssueTemplateResult = Schema.Schema.Type<typeof DeleteIssueTemplateResultSchema>
export const CreateIssueFromTemplateResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  issueId: IssueId,
  childrenCreated: Schema.optional(Count)
})
export type CreateIssueFromTemplateResult = Schema.Schema.Type<typeof CreateIssueFromTemplateResultSchema>
export const AddTemplateChildResultSchema = Schema.Struct({
  id: IssueTemplateChildId,
  title: Schema.String,
  added: Schema.Boolean
})
export type AddTemplateChildResult = Schema.Schema.Type<typeof AddTemplateChildResultSchema>
export const RemoveTemplateChildResultSchema = Schema.Struct({
  id: IssueTemplateChildId,
  title: Schema.String,
  removed: Schema.Boolean
})
export type RemoveTemplateChildResult = Schema.Schema.Type<typeof RemoveTemplateChildResultSchema>

export const ListIssueTemplatesResultSchema = Schema.Array(IssueTemplateSummarySchema)
export const GetIssueTemplateResultSchema = IssueTemplateSchema
