import { JSONSchema, Schema } from "effect"

import { withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import { DEFAULT_LIMIT, DocId, LimitParam, NonEmptyString, Timestamp } from "./shared.js"

export const MessageTemplateCategoryId = DocId.pipe(Schema.brand("MessageTemplateCategoryId")).annotations({
  identifier: "MessageTemplateCategoryId",
  title: "MessageTemplateCategoryId",
  description: "Huly message template category ID."
})
export type MessageTemplateCategoryId = Schema.Schema.Type<typeof MessageTemplateCategoryId>

export const MessageTemplateId = DocId.pipe(Schema.brand("MessageTemplateId")).annotations({
  identifier: "MessageTemplateId",
  title: "MessageTemplateId",
  description: "Huly message template ID."
})
export type MessageTemplateId = Schema.Schema.Type<typeof MessageTemplateId>

export const TemplateFieldCategoryId = DocId.pipe(Schema.brand("TemplateFieldCategoryId")).annotations({
  identifier: "TemplateFieldCategoryId",
  title: "TemplateFieldCategoryId",
  description: "Huly template field category ID."
})
export type TemplateFieldCategoryId = Schema.Schema.Type<typeof TemplateFieldCategoryId>

export const TemplateFieldId = DocId.pipe(Schema.brand("TemplateFieldId")).annotations({
  identifier: "TemplateFieldId",
  title: "TemplateFieldId",
  description: "Huly template field ID. This is also the ID stored inside dollar-brace message template tokens."
})
export type TemplateFieldId = Schema.Schema.Type<typeof TemplateFieldId>

export const MessageTemplateCategoryIdentifier = NonEmptyString.pipe(
  Schema.brand("MessageTemplateCategoryIdentifier")
).annotations({
  identifier: "MessageTemplateCategoryIdentifier",
  title: "MessageTemplateCategoryIdentifier",
  description: "Message template category ID or exact category name."
})
export type MessageTemplateCategoryIdentifier = Schema.Schema.Type<typeof MessageTemplateCategoryIdentifier>

export const MessageTemplateIdentifier = NonEmptyString.pipe(Schema.brand("MessageTemplateIdentifier")).annotations({
  identifier: "MessageTemplateIdentifier",
  title: "MessageTemplateIdentifier",
  description: "Message template ID or exact template title."
})
export type MessageTemplateIdentifier = Schema.Schema.Type<typeof MessageTemplateIdentifier>

export const TemplateFieldCategoryIdentifier = NonEmptyString.pipe(
  Schema.brand("TemplateFieldCategoryIdentifier")
).annotations({
  identifier: "TemplateFieldCategoryIdentifier",
  title: "TemplateFieldCategoryIdentifier",
  description: "Template field category ID or exact raw label string."
})
export type TemplateFieldCategoryIdentifier = Schema.Schema.Type<typeof TemplateFieldCategoryIdentifier>

export const MessageTemplateMarkdown = Schema.String.pipe(Schema.brand("MessageTemplateMarkdown")).annotations({
  identifier: "MessageTemplateMarkdown",
  title: "MessageTemplateMarkdown",
  description: "Message template body converted from Huly markup to Markdown."
})
export type MessageTemplateMarkdown = Schema.Schema.Type<typeof MessageTemplateMarkdown>

export const MessageTemplateCategorySummarySchema = Schema.Struct({
  id: MessageTemplateCategoryId,
  name: NonEmptyString,
  description: Schema.String,
  archived: Schema.Boolean,
  private: Schema.Boolean,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "MessageTemplateCategorySummary",
  description: "Global Huly message template category summary."
})
export type MessageTemplateCategorySummary = Schema.Schema.Type<typeof MessageTemplateCategorySummarySchema>

export const MessageTemplateCategoryRefSchema = Schema.Struct({
  id: MessageTemplateCategoryId,
  name: NonEmptyString
}).annotations({ title: "MessageTemplateCategoryRef", description: "Resolved message template category reference." })
export type MessageTemplateCategoryRef = Schema.Schema.Type<typeof MessageTemplateCategoryRefSchema>

export const MessageTemplateSummarySchema = Schema.Struct({
  id: MessageTemplateId,
  title: NonEmptyString,
  category: MessageTemplateCategoryRefSchema,
  placeholderFieldIds: Schema.Array(TemplateFieldId),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "MessageTemplateSummary",
  description:
    "Global Huly message template summary with placeholder template field IDs parsed from dollar-brace message tokens."
})
export type MessageTemplateSummary = Schema.Schema.Type<typeof MessageTemplateSummarySchema>

export const MessageTemplateSchema = Schema.Struct({
  id: MessageTemplateId,
  title: NonEmptyString,
  category: MessageTemplateCategoryRefSchema,
  message: MessageTemplateMarkdown,
  placeholderFieldIds: Schema.Array(TemplateFieldId),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "MessageTemplate",
  description:
    "Full global Huly message template with Markdown body and placeholder template field IDs parsed from dollar-brace message tokens."
})
export type MessageTemplate = Schema.Schema.Type<typeof MessageTemplateSchema>

export const TemplateFieldCategoryRefSchema = Schema.Struct({
  id: TemplateFieldCategoryId,
  label: NonEmptyString
}).annotations({ title: "TemplateFieldCategoryRef", description: "Resolved Huly template field category reference." })
export type TemplateFieldCategoryRef = Schema.Schema.Type<typeof TemplateFieldCategoryRefSchema>

export const MessageTemplateFieldSchema = Schema.Struct({
  id: TemplateFieldId,
  label: NonEmptyString,
  category: TemplateFieldCategoryRefSchema,
  resourceId: NonEmptyString
}).annotations({
  title: "MessageTemplateField",
  description: "Available Huly template field placeholder metadata. The resourceId is not executed by read-only tools."
})
export type MessageTemplateField = Schema.Schema.Type<typeof MessageTemplateFieldSchema>

export const MessageTemplateRenderValueSchema = Schema.Struct({
  field: TemplateFieldId.annotations({
    description: "Template field ID to replace when the template contains a matching dollar-brace token."
  }),
  value: Schema.String.annotations({ description: "Caller-provided replacement text for this template field ID." })
}).annotations({
  title: "MessageTemplateRenderValue",
  description: "Caller-provided value used to render a Huly message template placeholder."
})
export type MessageTemplateRenderValue = Schema.Schema.Type<typeof MessageTemplateRenderValueSchema>

export const RenderMessageTemplateResultSchema = Schema.Struct({
  id: MessageTemplateId,
  title: NonEmptyString,
  category: MessageTemplateCategoryRefSchema,
  message: MessageTemplateMarkdown,
  renderedMessage: MessageTemplateMarkdown,
  placeholderFieldIds: Schema.Array(TemplateFieldId),
  usedFields: Schema.Array(MessageTemplateRenderValueSchema),
  unresolvedFieldIds: Schema.Array(TemplateFieldId),
  unusedValueFields: Schema.Array(TemplateFieldId)
}).annotations({
  title: "RenderMessageTemplateResult",
  description:
    "Rendered global Huly message template with caller-provided placeholder substitutions and unresolved field IDs."
})
export type RenderMessageTemplateResult = Schema.Schema.Type<typeof RenderMessageTemplateResultSchema>

export const ListMessageTemplateCategoriesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of template categories to return (default: ${DEFAULT_LIMIT}).`
    })
  )
}).annotations({
  title: "ListMessageTemplateCategoriesParams",
  description: "List global Huly message template categories."
})
export type ListMessageTemplateCategoriesParams = Schema.Schema.Type<typeof ListMessageTemplateCategoriesParamsSchema>

export const ListMessageTemplatesParamsSchema = Schema.Struct({
  category: Schema.optional(
    MessageTemplateCategoryIdentifier.annotations({
      description: "Optional category filter. Accepts a category ID or exact category name."
    })
  ),
  search: Schema.optional(
    Schema.String.annotations({ description: "Optional case-insensitive substring search over template titles." })
  ),
  limit: Schema.optional(
    LimitParam.annotations({ description: `Maximum number of templates to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotations({
  title: "ListMessageTemplatesParams",
  description: "List global Huly message templates, optionally filtered by category and title substring."
})
export type ListMessageTemplatesParams = Schema.Schema.Type<typeof ListMessageTemplatesParamsSchema>

export const GetMessageTemplateParamsSchema = Schema.Struct({
  template: MessageTemplateIdentifier.annotations({
    description: "Template ID or exact template title. If title is ambiguous, also provide category."
  }),
  category: Schema.optional(
    MessageTemplateCategoryIdentifier.annotations({
      description: "Optional category ID or exact category name used to disambiguate template title lookup."
    })
  )
}).annotations({
  title: "GetMessageTemplateParams",
  description: "Retrieve one global Huly message template with Markdown body and placeholder template field IDs."
})
export type GetMessageTemplateParams = Schema.Schema.Type<typeof GetMessageTemplateParamsSchema>

export const RenderMessageTemplateParamsSchema = Schema.Struct({
  template: MessageTemplateIdentifier.annotations({
    description: "Template ID or exact template title. If title is ambiguous, also provide category."
  }),
  category: Schema.optional(
    MessageTemplateCategoryIdentifier.annotations({
      description: "Optional category ID or exact category name used to disambiguate template title lookup."
    })
  ),
  values: Schema.optional(
    Schema.Array(MessageTemplateRenderValueSchema).annotations({
      description:
        "Optional caller-provided placeholder values. Each field is a template field ID from placeholderFieldIds; duplicate field entries use the last value."
    })
  )
}).annotations({
  title: "RenderMessageTemplateParams",
  description:
    "Render one global Huly message template by substituting caller-provided values for dollar-brace placeholder field IDs."
})
export type RenderMessageTemplateParams = Schema.Schema.Type<typeof RenderMessageTemplateParamsSchema>

export const ListMessageTemplateFieldsParamsSchema = Schema.Struct({
  category: Schema.optional(
    TemplateFieldCategoryIdentifier.annotations({
      description: "Optional template field category ID or exact raw label string."
    })
  ),
  search: Schema.optional(
    Schema.String.annotations({
      description: "Optional case-insensitive substring search over raw template field labels."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({ description: `Maximum number of template fields to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotations({
  title: "ListMessageTemplateFieldsParams",
  description: "List Huly template fields without executing provider resources or rendering templates."
})
export type ListMessageTemplateFieldsParams = Schema.Schema.Type<typeof ListMessageTemplateFieldsParamsSchema>

export const listMessageTemplateCategoriesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  JSONSchema.make(ListMessageTemplateCategoriesParamsSchema),
  { limit: `Maximum number of template categories to return (default: ${DEFAULT_LIMIT}).` }
)
export const listMessageTemplatesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  JSONSchema.make(ListMessageTemplatesParamsSchema),
  {
    category: "Optional category filter. Accepts a category ID or exact category name.",
    limit: `Maximum number of templates to return (default: ${DEFAULT_LIMIT}).`,
    search: "Optional case-insensitive substring search over template titles."
  }
)
export const getMessageTemplateParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  JSONSchema.make(GetMessageTemplateParamsSchema),
  {
    category: "Optional category ID or exact category name used to disambiguate template title lookup.",
    template: "Template ID or exact template title. If title is ambiguous, also provide category."
  }
)
export const renderMessageTemplateParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  JSONSchema.make(RenderMessageTemplateParamsSchema),
  {
    category: "Optional category ID or exact category name used to disambiguate template title lookup.",
    template: "Template ID or exact template title. If title is ambiguous, also provide category.",
    values:
      "Optional caller-provided placeholder values. Each field is a template field ID from placeholderFieldIds; duplicate field entries use the last value."
  }
)
export const listMessageTemplateFieldsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  JSONSchema.make(ListMessageTemplateFieldsParamsSchema),
  {
    category: "Optional template field category ID or exact raw label string.",
    limit: `Maximum number of template fields to return (default: ${DEFAULT_LIMIT}).`,
    search: "Optional case-insensitive substring search over raw template field labels."
  }
)

export const parseListMessageTemplateCategoriesParams = Schema.decodeUnknown(ListMessageTemplateCategoriesParamsSchema)
export const parseListMessageTemplatesParams = Schema.decodeUnknown(ListMessageTemplatesParamsSchema)
export const parseGetMessageTemplateParams = Schema.decodeUnknown(GetMessageTemplateParamsSchema)
export const parseRenderMessageTemplateParams = Schema.decodeUnknown(RenderMessageTemplateParamsSchema)
export const parseListMessageTemplateFieldsParams = Schema.decodeUnknown(ListMessageTemplateFieldsParamsSchema)

export const ListMessageTemplateCategoriesResultSchema = Schema.Array(MessageTemplateCategorySummarySchema)
export const ListMessageTemplatesResultSchema = Schema.Array(MessageTemplateSummarySchema)
export const GetMessageTemplateResultSchema = MessageTemplateSchema
export const ListMessageTemplateFieldsResultSchema = Schema.Array(MessageTemplateFieldSchema)
