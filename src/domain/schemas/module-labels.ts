import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { TodoLocatorSchema } from "./planner.js"
import {
  ColorCode,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  DocumentIdentifier,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  PositiveInteger,
  TagElementId,
  TagIdentifier,
  TagReferenceId,
  TeamspaceIdentifier
} from "./shared.js"

export const ModuleLabelDefinitionSchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  description: Schema.String,
  color: ColorCode,
  refCount: Schema.optional(Count)
}).annotate({
  title: "ModuleLabelDefinition",
  description: "Human-readable label definition for one Huly module domain."
})
export type ModuleLabelDefinition = Schema.Schema.Type<typeof ModuleLabelDefinitionSchema>

export const AttachedModuleLabelSchema = Schema.Struct({
  id: TagReferenceId,
  label: TagElementId,
  title: NonEmptyString,
  color: ColorCode
}).annotate({ title: "AttachedModuleLabel", description: "Human-readable label attached to one Huly object." })
export type AttachedModuleLabel = Schema.Schema.Type<typeof AttachedModuleLabelSchema>

const ListModuleLabelDefinitionsParamsSchema = Schema.Struct({
  titleSearch: Schema.optional(Schema.String.annotateKey({ description: "Optional label title substring search." })),
  limit: Schema.optional(
    LimitParam.annotateKey({
      description: `Maximum number of label definitions to return (default: ${DEFAULT_LIMIT}).`
    })
  )
})
export type ListModuleLabelDefinitionsParams = Schema.Schema.Type<typeof ListModuleLabelDefinitionsParamsSchema>

export const ListDocumentLabelDefinitionsParamsSchema = ListModuleLabelDefinitionsParamsSchema.annotate({
  title: "ListDocumentLabelDefinitionsParams",
  description: "List document label definitions without requiring the document target class."
})
export type ListDocumentLabelDefinitionsParams = Schema.Schema.Type<typeof ListDocumentLabelDefinitionsParamsSchema>

export const ListTodoLabelDefinitionsParamsSchema = ListModuleLabelDefinitionsParamsSchema.annotate({
  title: "ListTodoLabelDefinitionsParams",
  description: "List Planner ToDo label definitions without requiring the ToDo target class."
})
export type ListTodoLabelDefinitionsParams = Schema.Schema.Type<typeof ListTodoLabelDefinitionsParamsSchema>

const DocumentLocatorFields = {
  teamspace: TeamspaceIdentifier.annotateKey({ description: "Teamspace name or ID containing the document." }),
  document: DocumentIdentifier.annotateKey({ description: "Document title or ID within the teamspace." })
}

export const ListDocumentLabelsParamsSchema = Schema.Struct(DocumentLocatorFields).annotate({
  title: "ListDocumentLabelsParams",
  description: "List labels attached to one document resolved by teamspace and document title or ID."
})
export type ListDocumentLabelsParams = Schema.Schema.Type<typeof ListDocumentLabelsParamsSchema>

const NewLabelFields = {
  label: TagIdentifier.annotateKey({
    description: "Label TagElement _id or exact title. A missing title creates the module label definition."
  }),
  color: Schema.optional(
    ColorCode.annotateKey({
      description: `Color for a newly created label definition from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}). Ignored for an existing label.`
    })
  )
}

export const AddDocumentLabelParamsSchema = Schema.Struct({ ...DocumentLocatorFields, ...NewLabelFields }).annotate({
  title: "AddDocumentLabelParams",
  description: "Idempotently attach a label to one document, creating a missing label title first."
})
export type AddDocumentLabelParams = Schema.Schema.Type<typeof AddDocumentLabelParamsSchema>

export const RemoveDocumentLabelParamsSchema = Schema.Struct({
  ...DocumentLocatorFields,
  label: TagIdentifier.annotateKey({ description: "Label TagElement _id or exact title." })
}).annotate({
  title: "RemoveDocumentLabelParams",
  description: "Detach a label from one document without deleting the label definition."
})
export type RemoveDocumentLabelParams = Schema.Schema.Type<typeof RemoveDocumentLabelParamsSchema>

export const ListTodoLabelsParamsSchema = Schema.Struct({ locator: TodoLocatorSchema }).annotate({
  title: "ListTodoLabelsParams",
  description: "List labels attached to one Planner ToDo resolved by raw ID or human-oriented locator."
})
export type ListTodoLabelsParams = Schema.Schema.Type<typeof ListTodoLabelsParamsSchema>

export const AddTodoLabelParamsSchema = Schema.Struct({ locator: TodoLocatorSchema, ...NewLabelFields }).annotate({
  title: "AddTodoLabelParams",
  description: "Idempotently attach a label to one Planner ToDo, creating a missing label title first."
})
export type AddTodoLabelParams = Schema.Schema.Type<typeof AddTodoLabelParamsSchema>

export const RemoveTodoLabelParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  label: TagIdentifier.annotateKey({ description: "Label TagElement _id or exact title." })
}).annotate({
  title: "RemoveTodoLabelParams",
  description: "Detach a label from one Planner ToDo without deleting the label definition."
})
export type RemoveTodoLabelParams = Schema.Schema.Type<typeof RemoveTodoLabelParamsSchema>

export const ListModuleLabelDefinitionsResultSchema = Schema.Struct({
  labels: Schema.Array(ModuleLabelDefinitionSchema)
})
export type ListModuleLabelDefinitionsResult = Schema.Schema.Type<typeof ListModuleLabelDefinitionsResultSchema>

export const ListAttachedModuleLabelsResultSchema = Schema.Struct({ labels: Schema.Array(AttachedModuleLabelSchema) })
export type ListAttachedModuleLabelsResult = Schema.Schema.Type<typeof ListAttachedModuleLabelsResultSchema>

const ModuleLabelMutationResultFields = { id: TagReferenceId, label: TagElementId, title: NonEmptyString }

export const AddModuleLabelResultSchema = Schema.Union([
  Schema.Struct({
    ...ModuleLabelMutationResultFields,
    attached: Schema.Literal(true),
    labelCreated: Schema.Literal(true)
  }),
  Schema.Struct({
    ...ModuleLabelMutationResultFields,
    attached: Schema.Literal(true),
    labelCreated: Schema.Literal(false)
  }),
  Schema.Struct({
    ...ModuleLabelMutationResultFields,
    attached: Schema.Literal(false),
    labelCreated: Schema.Literal(false)
  })
])
export type AddModuleLabelResult = Schema.Schema.Type<typeof AddModuleLabelResultSchema>

const RemovedModuleLabelFields = { label: TagElementId, title: NonEmptyString }

export const RemoveModuleLabelResultSchema = Schema.Union([
  Schema.Struct({ ...RemovedModuleLabelFields, detached: Schema.Literal(true), detachedCount: PositiveInteger }),
  Schema.Struct({ ...RemovedModuleLabelFields, detached: Schema.Literal(false), detachedCount: Schema.Literal(0) })
])
export type RemoveModuleLabelResult = Schema.Schema.Type<typeof RemoveModuleLabelResultSchema>

const MODULE_LABEL_DESCRIPTIONS = {
  titleSearch: "Optional label title substring search.",
  limit: `Maximum number of label definitions to return (default: ${DEFAULT_LIMIT}).`,
  teamspace: "Teamspace name or ID containing the document.",
  document: "Document title or ID within the teamspace.",
  locator: "Planner ToDo raw ID or human-oriented locator.",
  label: "Label TagElement _id or exact title.",
  color: `Color for a newly created label definition from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}). Ignored for an existing label.`
} as const

const moduleLabelParamsJsonSchema = (
  schema: Schema.Constraint,
  descriptions: Readonly<Record<string, string>> = MODULE_LABEL_DESCRIPTIONS
): object => withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)

export const listDocumentLabelDefinitionsParamsJsonSchema = moduleLabelParamsJsonSchema(
  ListDocumentLabelDefinitionsParamsSchema
)
export const listDocumentLabelsParamsJsonSchema = moduleLabelParamsJsonSchema(ListDocumentLabelsParamsSchema)
export const addDocumentLabelParamsJsonSchema = moduleLabelParamsJsonSchema(AddDocumentLabelParamsSchema, {
  ...MODULE_LABEL_DESCRIPTIONS,
  label: "Label TagElement _id or exact title. A missing title creates the module label definition."
})
export const removeDocumentLabelParamsJsonSchema = moduleLabelParamsJsonSchema(RemoveDocumentLabelParamsSchema)
export const listTodoLabelDefinitionsParamsJsonSchema = moduleLabelParamsJsonSchema(
  ListTodoLabelDefinitionsParamsSchema
)
export const listTodoLabelsParamsJsonSchema = moduleLabelParamsJsonSchema(ListTodoLabelsParamsSchema)
export const addTodoLabelParamsJsonSchema = moduleLabelParamsJsonSchema(AddTodoLabelParamsSchema, {
  ...MODULE_LABEL_DESCRIPTIONS,
  label: "Label TagElement _id or exact title. A missing title creates the module label definition."
})
export const removeTodoLabelParamsJsonSchema = moduleLabelParamsJsonSchema(RemoveTodoLabelParamsSchema)

export const parseListDocumentLabelDefinitionsParams = Schema.decodeUnknownEffect(
  ListDocumentLabelDefinitionsParamsSchema
)
export const parseListDocumentLabelsParams = Schema.decodeUnknownEffect(ListDocumentLabelsParamsSchema)
export const parseAddDocumentLabelParams = Schema.decodeUnknownEffect(AddDocumentLabelParamsSchema)
export const parseRemoveDocumentLabelParams = Schema.decodeUnknownEffect(RemoveDocumentLabelParamsSchema)
export const parseListTodoLabelDefinitionsParams = Schema.decodeUnknownEffect(ListTodoLabelDefinitionsParamsSchema)
export const parseListTodoLabelsParams = Schema.decodeUnknownEffect(ListTodoLabelsParamsSchema)
export const parseAddTodoLabelParams = Schema.decodeUnknownEffect(AddTodoLabelParamsSchema)
export const parseRemoveTodoLabelParams = Schema.decodeUnknownEffect(RemoveTodoLabelParamsSchema)
