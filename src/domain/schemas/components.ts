import { Schema } from "effect"

import { clearableText } from "./clearable.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ComponentId,
  ComponentIdentifier,
  ComponentLabel,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  IssueIdentifier,
  LimitParam,
  PersonName,
  PersonRefInput,
  ProjectIdentifier,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

export const ComponentSummarySchema = Schema.Struct({
  id: ComponentId,
  label: ComponentLabel,
  lead: Schema.optional(PersonName),
  modifiedOn: Schema.optional(Timestamp)
}).annotate({ title: "ComponentSummary", description: "Component summary for list operations" })

export type ComponentSummary = Schema.Schema.Type<typeof ComponentSummarySchema>

export const ComponentSchema = Schema.Struct({
  id: ComponentId,
  label: ComponentLabel,
  description: Schema.optional(Schema.String),
  lead: Schema.optional(PersonName),
  project: ProjectIdentifier,
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotate({ title: "Component", description: "Full component with all fields" })

export type Component = Schema.Schema.Type<typeof ComponentSchema>

export const ListComponentsParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of components to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListComponentsParams", description: "Parameters for listing components" })

export type ListComponentsParams = Schema.Schema.Type<typeof ListComponentsParamsSchema>

export const GetComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  component: ComponentIdentifier.annotateKey({ description: "Component ID or label" })
}).annotate({ title: "GetComponentParams", description: "Parameters for getting a single component" })

export type GetComponentParams = Schema.Schema.Type<typeof GetComponentParamsSchema>

export const CreateComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  label: ComponentLabel.annotateKey({ description: "Component name/label" }),
  description: Schema.optional(
    Schema.String.annotateKey({
      description: `Component description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  lead: Schema.optional(PersonRefInput.annotateKey({ description: "Lead person email address or display name" }))
}).annotate({ title: "CreateComponentParams", description: "Parameters for creating a component" })

export type CreateComponentParams = Schema.Schema.Type<typeof CreateComponentParamsSchema>

export const UPDATE_COMPONENT_FIELDS = ["label", "description", "lead"] as const satisfies ReadonlyArray<
  "label" | "description" | "lead"
>

export const UpdateComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  component: ComponentIdentifier.annotateKey({ description: "Component ID or label" }),
  label: Schema.optional(ComponentLabel.annotateKey({ description: "New component name/label" })),
  description: Schema.optional(
    clearableText(`New component description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`)
  ),
  lead: Schema.optional(
    Schema.NullOr(PersonRefInput).annotateKey({
      description: "New lead person email or display name (null to unassign)"
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_COMPONENT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_COMPONENT_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateComponentParams",
    description: `Parameters for updating a component. ${atLeastOneUpdateFieldMessage(UPDATE_COMPONENT_FIELDS)}`
  })

export type UpdateComponentParams = Schema.Schema.Type<typeof UpdateComponentParamsSchema>
assertUpdateFields<UpdateComponentParams>()(["project", "component"], UPDATE_COMPONENT_FIELDS)

export const SetIssueComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  identifier: IssueIdentifier.annotateKey({ description: "Issue identifier (e.g., 'HULY-123')" }),
  component: Schema.NullOr(ComponentIdentifier).annotateKey({ description: "Component ID or label (null to clear)" })
}).annotate({ title: "SetIssueComponentParams", description: "Parameters for setting component on an issue" })

export type SetIssueComponentParams = Schema.Schema.Type<typeof SetIssueComponentParamsSchema>

export const DeleteComponentParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Project identifier (e.g., 'HULY')" }),
  component: ComponentIdentifier.annotateKey({ description: "Component ID or label" })
}).annotate({ title: "DeleteComponentParams", description: "Parameters for deleting a component" })

export type DeleteComponentParams = Schema.Schema.Type<typeof DeleteComponentParamsSchema>

const componentParamsJsonSchema = (schema: Schema.Constraint): object => toDraft07JsonSchema(schema)

export const listComponentsParamsJsonSchema = componentParamsJsonSchema(ListComponentsParamsSchema)
export const getComponentParamsJsonSchema = componentParamsJsonSchema(GetComponentParamsSchema)
export const createComponentParamsJsonSchema = componentParamsJsonSchema(CreateComponentParamsSchema)
export const updateComponentParamsJsonSchema = withAtLeastOneRequired(
  componentParamsJsonSchema(UpdateComponentParamsSchema),
  UPDATE_COMPONENT_FIELDS
)
export const setIssueComponentParamsJsonSchema = componentParamsJsonSchema(SetIssueComponentParamsSchema)
export const deleteComponentParamsJsonSchema = componentParamsJsonSchema(DeleteComponentParamsSchema)

export const parseComponent = Schema.decodeUnknownEffect(ComponentSchema)
export const parseComponentSummary = Schema.decodeUnknownEffect(ComponentSummarySchema)
export const parseListComponentsParams = Schema.decodeUnknownEffect(ListComponentsParamsSchema)
export const parseGetComponentParams = Schema.decodeUnknownEffect(GetComponentParamsSchema)
export const parseCreateComponentParams = Schema.decodeUnknownEffect(CreateComponentParamsSchema)
export const parseUpdateComponentParams = Schema.decodeUnknownEffect(UpdateComponentParamsSchema)
export const parseSetIssueComponentParams = Schema.decodeUnknownEffect(SetIssueComponentParamsSchema)
export const parseDeleteComponentParams = Schema.decodeUnknownEffect(DeleteComponentParamsSchema)
export const CreateComponentResultSchema = Schema.Struct({ id: ComponentId, label: ComponentLabel })
export type CreateComponentResult = Schema.Schema.Type<typeof CreateComponentResultSchema>
export const UpdateComponentResultSchema = Schema.Struct({ id: ComponentId, updated: Schema.Boolean })
export type UpdateComponentResult = Schema.Schema.Type<typeof UpdateComponentResultSchema>
export const SetIssueComponentResultSchema = Schema.Struct({
  identifier: IssueIdentifier,
  componentSet: Schema.Boolean
})
export type SetIssueComponentResult = Schema.Schema.Type<typeof SetIssueComponentResultSchema>
export const DeleteComponentResultSchema = Schema.Struct({ id: ComponentId, deleted: Schema.Boolean })
export type DeleteComponentResult = Schema.Schema.Type<typeof DeleteComponentResultSchema>

export const ListComponentsResultSchema = Schema.Array(ComponentSummarySchema)
export const GetComponentResultSchema = ComponentSchema
