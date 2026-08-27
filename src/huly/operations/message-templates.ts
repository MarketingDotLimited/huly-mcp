import { SortingOrder } from "@hcengineering/core"
import type {
  MessageTemplate as HulyMessageTemplate,
  TemplateCategory as HulyTemplateCategory,
  TemplateField as HulyTemplateField
} from "@hcengineering/templates"
import { templateFieldRegexp } from "@hcengineering/templates"
import { Effect } from "effect"

import type {
  GetMessageTemplateParams,
  ListMessageTemplateCategoriesParams,
  ListMessageTemplateFieldsParams,
  ListMessageTemplatesParams,
  MessageTemplate,
  MessageTemplateCategorySummary,
  MessageTemplateField,
  MessageTemplateRenderValue,
  MessageTemplateSummary,
  RenderMessageTemplateParams,
  RenderMessageTemplateResult
} from "../../domain/schemas/message-templates.js"
import { MessageTemplateMarkdown, TemplateFieldId } from "../../domain/schemas/message-templates.js"
import { Count } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import type { HulyDataInvalidError } from "../errors.js"
import { templates } from "../huly-plugins.js"
import {
  categoryMapFor,
  categorySummaryFor,
  fieldCategoryMapFor,
  hasBlankCategoryName,
  hasBlankTemplateFieldLabel,
  hasBlankTemplateTitle,
  resolveCategory,
  type ResolveCategoryError,
  resolveFieldCategory,
  type ResolveFieldCategoryError,
  resolveTemplate,
  type ResolveTemplateError,
  searchLike,
  templateDetailFor,
  templateFieldFor,
  templateSummaryFor,
  warnMetadataFallbacks
} from "./message-templates-support.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"

type ListMessageTemplateCategoriesError = HulyClientError
type ListMessageTemplatesError = ResolveCategoryError | HulyDataInvalidError
type GetMessageTemplateError = ResolveTemplateError | HulyDataInvalidError
type RenderMessageTemplateError = ResolveTemplateError | HulyDataInvalidError
type ListMessageTemplateFieldsError = ResolveFieldCategoryError

interface RenderedTemplateMessage {
  readonly renderedMessage: MessageTemplateMarkdown
  readonly unresolvedFieldIds: Array<TemplateFieldId>
  readonly unusedValueFields: Array<TemplateFieldId>
  readonly usedFields: Array<MessageTemplateRenderValue>
}

const fieldValueEntryFor = (value: MessageTemplateRenderValue): readonly [TemplateFieldId, string] => [
  value.field,
  value.value
]

const fieldValueMapFor = (values: ReadonlyArray<MessageTemplateRenderValue>): ReadonlyMap<TemplateFieldId, string> =>
  new Map(values.map(fieldValueEntryFor))

const uniqueFields = (fields: ReadonlyArray<TemplateFieldId>): Array<TemplateFieldId> => [...new Set(fields)]

const renderTokenWith = (
  valuesByField: ReadonlyMap<TemplateFieldId, string>
): ((token: string, rawField: string) => string) => {
  const renderToken = (token: string, rawField: string): string => {
    const value = valuesByField.get(TemplateFieldId.make(rawField))
    return value === undefined ? token : value
  }

  return renderToken
}

const renderTemplateTokens = (
  message: MessageTemplateMarkdown,
  valuesByField: ReadonlyMap<TemplateFieldId, string>
): MessageTemplateMarkdown => {
  const regexp = new RegExp(templateFieldRegexp.source, templateFieldRegexp.flags)

  return MessageTemplateMarkdown.make(String(message).replace(regexp, renderTokenWith(valuesByField)))
}

const usedFieldValueFor = (
  valuesByField: ReadonlyMap<TemplateFieldId, string>,
  field: TemplateFieldId
): Array<MessageTemplateRenderValue> => {
  const value = valuesByField.get(field)
  if (value === undefined) return []

  return [{ field, value }]
}

const renderTemplateMessage = (
  message: MessageTemplateMarkdown,
  placeholderFieldIds: ReadonlyArray<TemplateFieldId>,
  values: ReadonlyArray<MessageTemplateRenderValue>
): RenderedTemplateMessage => {
  const valuesByField = fieldValueMapFor(values)
  const usedFields = placeholderFieldIds.flatMap((field) => usedFieldValueFor(valuesByField, field))
  const placeholderFields = new Set(placeholderFieldIds)

  return {
    renderedMessage: renderTemplateTokens(message, valuesByField),
    unresolvedFieldIds: placeholderFieldIds.filter((field) => !valuesByField.has(field)),
    unusedValueFields: uniqueFields(values.map((fieldValue) => fieldValue.field)).filter(
      (field) => !placeholderFields.has(field)
    ),
    usedFields
  }
}

export const listMessageTemplateCategories = (
  params: ListMessageTemplateCategoriesParams
): Effect.Effect<Array<MessageTemplateCategorySummary>, ListMessageTemplateCategoriesError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const categories = yield* client.findAll<HulyTemplateCategory>(
      templates.class.TemplateCategory,
      hulyQuery<HulyTemplateCategory>({}),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )

    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(categories.filter(hasBlankCategoryName).length),
      "message template category row(s)",
      "category IDs as names"
    )

    return categories.map(categorySummaryFor)
  })

export const listMessageTemplates = (
  params: ListMessageTemplatesParams
): Effect.Effect<Array<MessageTemplateSummary>, ListMessageTemplatesError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const category = params.category === undefined ? undefined : yield* resolveCategory(client, params.category)
    const titleLike = searchLike(params.search)
    const categoryFilter = category === undefined ? {} : { space: category._id }
    const titleFilter = titleLike === undefined ? {} : { title: titleLike }
    const query: StrictDocumentQuery<HulyMessageTemplate> = { ...categoryFilter, ...titleFilter }

    const found = yield* client.findAll<HulyMessageTemplate>(templates.class.MessageTemplate, hulyQuery(query), {
      limit: clampLimit(params.limit),
      sort: { modifiedOn: SortingOrder.Descending }
    })
    const categories = yield* categoryMapFor(
      client,
      found.map((template) => template.space)
    )
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(found.filter(hasBlankTemplateTitle).length),
      "message template title row(s)",
      "template IDs as titles"
    )

    return yield* Effect.forEach(found, (template) => templateSummaryFor(template, client, categories))
  })

export const getMessageTemplate = (
  params: GetMessageTemplateParams
): Effect.Effect<MessageTemplate, GetMessageTemplateError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const template = yield* resolveTemplate(client, params)
    const categories = yield* categoryMapFor(client, [template.space])
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(hasBlankTemplateTitle(template) ? 1 : 0),
      "message template title row(s)",
      "template IDs as titles"
    )

    return yield* templateDetailFor(template, client, categories)
  })

export const renderMessageTemplate = (
  params: RenderMessageTemplateParams
): Effect.Effect<RenderMessageTemplateResult, RenderMessageTemplateError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const template = yield* resolveTemplate(client, params)
    const categories = yield* categoryMapFor(client, [template.space])
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(hasBlankTemplateTitle(template) ? 1 : 0),
      "message template title row(s)",
      "template IDs as titles"
    )

    const detail = yield* templateDetailFor(template, client, categories)

    return { ...detail, ...renderTemplateMessage(detail.message, detail.placeholderFieldIds, params.values ?? []) }
  })

export const listMessageTemplateFields = (
  params: ListMessageTemplateFieldsParams
): Effect.Effect<Array<MessageTemplateField>, ListMessageTemplateFieldsError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const category = params.category === undefined ? undefined : yield* resolveFieldCategory(client, params.category)
    const labelLike = searchLike(params.search)
    const categoryFilter = category === undefined ? {} : { category: category._id }
    const labelFilter = labelLike === undefined ? {} : { label: labelLike }
    const query: StrictDocumentQuery<HulyTemplateField> = { ...categoryFilter, ...labelFilter }

    const fields = yield* client.findAll<HulyTemplateField>(templates.class.TemplateField, hulyQuery(query), {
      limit: clampLimit(params.limit),
      sort: { modifiedOn: SortingOrder.Descending }
    })
    const categories = yield* fieldCategoryMapFor(
      client,
      fields.map((field) => field.category)
    )
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(fields.filter(hasBlankTemplateFieldLabel).length),
      "template field row(s)",
      "field IDs as labels"
    )

    return fields.map((field) => templateFieldFor(field, categories))
  })
