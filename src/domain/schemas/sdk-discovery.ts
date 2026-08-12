import coreSdkDefault from "@hcengineering/core"
import * as coreSdkNamespace from "@hcengineering/core"
import { Schema, SchemaGetter } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

import { HulyClassRoutingHintSchema, HulyDomainName } from "./sdk-discovery-configurations.js"
import {
  Count,
  enumValuesDescription,
  HulyAttributeId,
  HulyEnumId,
  LimitParam,
  MAX_LIMIT,
  NonEmptyString,
  ObjectClassName
} from "./shared.js"

export const SDK_DISCOVERY_DEFAULT_LIMIT = 100
export const DEFAULT_INCLUDE_INHERITED_ATTRIBUTES = true
export const DEFAULT_CUSTOM_FIELDS_ONLY = false

const KnownClassifierKindValues = ["class", "interface", "mixin"] as const
const ClassifierKindValues = [...KnownClassifierKindValues, "unknown"] as const
const NormalizedScalarAttributeTypeKindValues = ["string", "number", "boolean", "date", "markup", "unknown"] as const
const NormalizedAttributeTypeKindValues = [
  ...NormalizedScalarAttributeTypeKindValues,
  "ref",
  "enum",
  "array",
  "collection"
] as const

// Native ESM exposes this CommonJS enum under default; Vitest exposes the named export.
const RuntimeClassifierKind = coreSdkNamespace.ClassifierKind ?? coreSdkDefault.ClassifierKind

export const HulyClassifierKindSchema = Schema.Literals(ClassifierKindValues).annotate({
  description: `Huly classifier kind: ${enumValuesDescription(ClassifierKindValues)}`
})
export type HulyClassifierKind = Schema.Schema.Type<typeof HulyClassifierKindSchema>

const HulySdkClassifierKindLiteral = Schema.Literals([
  RuntimeClassifierKind.CLASS,
  RuntimeClassifierKind.INTERFACE,
  RuntimeClassifierKind.MIXIN
])

export const HulySdkClassifierKindSchema = HulySdkClassifierKindLiteral.pipe(
  Schema.decodeTo(Schema.Literals(KnownClassifierKindValues), {
    decode: SchemaGetter.transform((kind) => {
      switch (kind) {
        case RuntimeClassifierKind.CLASS:
          return "class"
        case RuntimeClassifierKind.INTERFACE:
          return "interface"
        case RuntimeClassifierKind.MIXIN:
          return "mixin"
      }
    }),
    encode: SchemaGetter.transform((kind) => {
      switch (kind) {
        case "class":
          return RuntimeClassifierKind.CLASS
        case "interface":
          return RuntimeClassifierKind.INTERFACE
        case "mixin":
          return RuntimeClassifierKind.MIXIN
      }
    })
  })
).annotate({
  description: "Isomorphic codec between @hcengineering/core ClassifierKind values and MCP classifier kind strings"
})
export type HulySdkClassifierKind = Schema.Schema.Type<typeof HulySdkClassifierKindSchema>

export const HulyAttributeTypeKindSchema = Schema.Literals(NormalizedAttributeTypeKindValues).annotate({
  description: `Normalized MCP attribute type family derived from Huly type descriptor classes, not Huly SDK enum values: ${enumValuesDescription(
    NormalizedAttributeTypeKindValues
  )}`
})
export type HulyAttributeTypeKind = Schema.Schema.Type<typeof HulyAttributeTypeKindSchema>

export const HulyModelSearch = NonEmptyString.pipe(Schema.brand("HulyModelSearch"))
export type HulyModelSearch = Schema.Schema.Type<typeof HulyModelSearch>

const TypeDetailsSchema = Schema.Record(Schema.String, Schema.Unknown)

const HulyAttributeTypeBaseFields = {
  classId: Schema.optional(
    ObjectClassName.annotate({
      description: "Raw Huly type class ID, such as core:class:RefTo or core:class:TypeString"
    })
  ),
  raw: Schema.optional(
    TypeDetailsSchema.annotate({
      description:
        "Decoded raw Huly type descriptor, present only when the type family could not be determined (kind: unknown)"
    })
  )
} as const

const HulyScalarAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literals(NormalizedScalarAttributeTypeKindValues),
  ...HulyAttributeTypeBaseFields
})

const HulyRefAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("ref"),
  ...HulyAttributeTypeBaseFields,
  refTo: ObjectClassName.annotate({ description: "Target class when kind is ref" })
})

const HulyEnumAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("enum"),
  ...HulyAttributeTypeBaseFields,
  enumId: HulyEnumId.annotate({ description: "Enum document ID when kind is enum" })
})

const HulyCollectionAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("collection"),
  ...HulyAttributeTypeBaseFields,
  collectionOf: ObjectClassName.annotate({ description: "Attached document class when kind is collection" })
})

// An array element is itself a decoded attribute type, so the schema is recursive: an element may be a
// scalar, ref, enum, collection, or (rarely) another array. Encoded and decoded forms differ because
// branded identifiers (classId, refTo, ...) erase to plain strings when encoded, so both type
// parameters are supplied explicitly.
type HulyArrayAttributeType = {
  readonly kind: "array"
  readonly classId?: ObjectClassName | undefined
  readonly raw?: { readonly [key: string]: unknown } | undefined
  readonly arrayOf: HulyAttributeType
}

export type HulyArrayAttributeTypeEncoded = {
  readonly kind: "array"
  readonly classId?: string | undefined
  readonly raw?: { readonly [key: string]: unknown } | undefined
  readonly arrayOf: HulyAttributeTypeEncoded
}

export type HulyAttributeType =
  | Schema.Schema.Type<typeof HulyScalarAttributeTypeSchema>
  | Schema.Schema.Type<typeof HulyRefAttributeTypeSchema>
  | Schema.Schema.Type<typeof HulyEnumAttributeTypeSchema>
  | Schema.Schema.Type<typeof HulyCollectionAttributeTypeSchema>
  | HulyArrayAttributeType

type HulyAttributeTypeEncoded =
  | Schema.Codec.Encoded<typeof HulyScalarAttributeTypeSchema>
  | Schema.Codec.Encoded<typeof HulyRefAttributeTypeSchema>
  | Schema.Codec.Encoded<typeof HulyEnumAttributeTypeSchema>
  | Schema.Codec.Encoded<typeof HulyCollectionAttributeTypeSchema>
  | HulyArrayAttributeTypeEncoded

const HulyArrayAttributeTypeSchema = Schema.Struct({
  kind: Schema.Literal("array"),
  ...HulyAttributeTypeBaseFields,
  arrayOf: Schema.suspend(
    (): Schema.Codec<HulyAttributeType, HulyAttributeTypeEncoded> => HulyAttributeTypeSchema
  ).annotate({
    identifier: "HulyAttributeType",
    description: "Decoded element type when kind is array, recursively shaped like any attribute type"
  })
})

export const HulyAttributeTypeSchema: Schema.Codec<HulyAttributeType, HulyAttributeTypeEncoded> = Schema.Union([
  HulyScalarAttributeTypeSchema,
  HulyRefAttributeTypeSchema,
  HulyEnumAttributeTypeSchema,
  HulyCollectionAttributeTypeSchema,
  HulyArrayAttributeTypeSchema
]).annotate({ identifier: "HulyAttributeType", description: "Decoded Huly model attribute type descriptor." })

export const HulyClassToolHintSchema = Schema.Struct({
  category: NonEmptyString,
  exampleTools: Schema.Array(NonEmptyString)
})
export type HulyClassToolHint = Schema.Schema.Type<typeof HulyClassToolHintSchema>

export const HulyDiscoveryCount = Count.pipe(Schema.brand("HulyDiscoveryCount")).annotate({
  description: "Non-negative integer count"
})
export type HulyDiscoveryCount = Schema.Schema.Type<typeof HulyDiscoveryCount>

export const HulyClassSummarySchema = Schema.Struct({
  classId: ObjectClassName,
  label: NonEmptyString,
  kind: HulyClassifierKindSchema,
  directAncestors: Schema.Array(ObjectClassName).annotate({
    description: "Direct class/interface parents from Huly extends and implements metadata"
  }),
  domain: Schema.optional(HulyDomainName),
  shortLabel: Schema.optional(NonEmptyString),
  pluralLabel: Schema.optional(NonEmptyString),
  hidden: Schema.optional(Schema.Boolean),
  readonly: Schema.optional(Schema.Boolean),
  attributesCount: Schema.optional(HulyDiscoveryCount),
  firstClassToolHints: Schema.Array(HulyClassToolHintSchema).annotate({
    description:
      "Representative MCP categories and example tool names for purpose-built operations on this class. This is a routing hint, not an exhaustive registry."
  }),
  routingHints: Schema.Array(HulyClassRoutingHintSchema).annotate({
    description:
      "Audited SDK parity routing hints. Covered classes name the safest MCP tools; gaps include the backlog issue; not-mcp-facing/ignored classes include only rationale."
  })
})
export type HulyClassSummary = Schema.Schema.Type<typeof HulyClassSummarySchema>

export const HulyAttributeSummarySchema = Schema.Struct({
  attributeId: HulyAttributeId,
  name: NonEmptyString,
  label: NonEmptyString,
  ownerClassId: ObjectClassName,
  ownerClassLabel: NonEmptyString,
  type: HulyAttributeTypeSchema,
  index: Schema.optional(Schema.Number),
  isCustom: Schema.optional(Schema.Boolean),
  defaultValue: Schema.optional(Schema.Unknown),
  automationOnly: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  inherited: Schema.Boolean
})
export type HulyAttributeSummary = Schema.Schema.Type<typeof HulyAttributeSummarySchema>

export const HulyEnumSummarySchema = Schema.Struct({
  enumId: HulyEnumId,
  name: NonEmptyString,
  values: Schema.Array(NonEmptyString)
})
export type HulyEnumSummary = Schema.Schema.Type<typeof HulyEnumSummarySchema>

const sdkDiscoveryLimitDescription = (entity: string): string =>
  `Maximum number of ${entity} to return after filtering (default: ${SDK_DISCOVERY_DEFAULT_LIMIT}, max: ${MAX_LIMIT})`

export const ListHulyClassesParamsSchema = Schema.Struct({
  query: Schema.optional(
    HulyModelSearch.annotate({ description: "Case-insensitive substring match against class ID or label" })
  ),
  kind: Schema.optional(
    HulyClassifierKindSchema.annotate({
      description: "Filter by class, interface, or mixin. unknown is only returned for unexpected model values."
    })
  ),
  domain: Schema.optional(
    HulyDomainName.annotate({
      description: "Filter by Huly storage domain, such as tracker, document, card, contact, or model"
    })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: sdkDiscoveryLimitDescription("classes") }))
}).annotate({
  title: "ListHulyClassesParams",
  description: "Parameters for discovering Huly class, interface, and mixin IDs from the workspace model"
})
export type ListHulyClassesParams = Schema.Schema.Type<typeof ListHulyClassesParamsSchema>

export const ListHulyClassesResultSchema = Schema.Struct({
  classes: Schema.Array(HulyClassSummarySchema),
  total: HulyDiscoveryCount
})
export type ListHulyClassesResult = Schema.Schema.Type<typeof ListHulyClassesResultSchema>

export const GetHulyClassParamsSchema = Schema.Struct({
  class: ObjectClassName.annotate({
    description: "Exact Huly class, interface, or mixin ID returned by list_huly_classes"
  }),
  includeInheritedAttributes: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include attributes declared on parent classes. Defaults to ${DEFAULT_INCLUDE_INHERITED_ATTRIBUTES}.`
    })
  )
}).annotate({
  title: "GetHulyClassParams",
  description: "Parameters for reading one Huly class and its model attributes"
})
export type GetHulyClassParams = Schema.Schema.Type<typeof GetHulyClassParamsSchema>

export const GetHulyClassResultSchema = Schema.Struct({
  class: HulyClassSummarySchema,
  ancestors: Schema.Array(HulyClassSummarySchema),
  attributes: Schema.Array(HulyAttributeSummarySchema)
})
export type GetHulyClassResult = Schema.Schema.Type<typeof GetHulyClassResultSchema>

export const ListHulyAttributesParamsSchema = Schema.Struct({
  class: Schema.optional(
    ObjectClassName.annotate({
      description: "Only return attributes declared directly on this class, interface, or mixin ID"
    })
  ),
  query: Schema.optional(
    HulyModelSearch.annotate({
      description: "Case-insensitive substring match against attribute ID, name, label, owner class ID, or type target"
    })
  ),
  customOnly: Schema.optional(
    Schema.Boolean.annotate({
      description: `Only return attributes marked as custom fields. Defaults to ${DEFAULT_CUSTOM_FIELDS_ONLY}.`
    })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: sdkDiscoveryLimitDescription("attributes") }))
}).annotate({ title: "ListHulyAttributesParams", description: "Parameters for discovering Huly model attributes" })
export type ListHulyAttributesParams = Schema.Schema.Type<typeof ListHulyAttributesParamsSchema>

export const ListHulyAttributesResultSchema = Schema.Struct({
  attributes: Schema.Array(HulyAttributeSummarySchema),
  total: HulyDiscoveryCount
})
export type ListHulyAttributesResult = Schema.Schema.Type<typeof ListHulyAttributesResultSchema>

export const ListHulyEnumsParamsSchema = Schema.Struct({
  enum: Schema.optional(HulyEnumId.annotate({ description: "Exact enum document ID" })),
  query: Schema.optional(
    HulyModelSearch.annotate({
      description: "Case-insensitive substring match against enum ID, enum name, or enum values"
    })
  ),
  limit: Schema.optional(LimitParam.annotate({ description: sdkDiscoveryLimitDescription("enums") }))
}).annotate({ title: "ListHulyEnumsParams", description: "Parameters for discovering Huly model enum definitions" })
export type ListHulyEnumsParams = Schema.Schema.Type<typeof ListHulyEnumsParamsSchema>

export const ListHulyEnumsResultSchema = Schema.Struct({
  enums: Schema.Array(HulyEnumSummarySchema),
  total: HulyDiscoveryCount
})
export type ListHulyEnumsResult = Schema.Schema.Type<typeof ListHulyEnumsResultSchema>

export { HulyDomainName } from "./sdk-discovery-configurations.js"

export const listHulyClassesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListHulyClassesParamsSchema),
  {
    query: "Case-insensitive substring match against class ID or label.",
    kind: "Filter by class, interface, or mixin.",
    domain: "Filter by Huly storage domain, such as tracker, document, card, contact, or model.",
    limit: sdkDiscoveryLimitDescription("classes")
  }
)
export const getHulyClassParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetHulyClassParamsSchema),
  {
    class: "Exact Huly class, interface, or mixin ID returned by list_huly_classes.",
    includeInheritedAttributes: `Include attributes declared on parent classes. Defaults to ${DEFAULT_INCLUDE_INHERITED_ATTRIBUTES}.`
  }
)
export const listHulyAttributesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListHulyAttributesParamsSchema),
  {
    class: "Only return attributes declared directly on this class, interface, or mixin ID.",
    query: "Case-insensitive substring match against attribute ID, name, label, owner class ID, or type target.",
    customOnly: `Only return attributes marked as custom fields. Defaults to ${DEFAULT_CUSTOM_FIELDS_ONLY}.`,
    limit: sdkDiscoveryLimitDescription("attributes")
  }
)
export const listHulyEnumsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListHulyEnumsParamsSchema),
  {
    enum: "Exact enum document ID.",
    query: "Case-insensitive substring match against enum ID, name, or option values.",
    limit: sdkDiscoveryLimitDescription("enums")
  }
)

const strictParseOptions = { onExcessProperty: "error" } as const

export const parseListHulyClassesParams = Schema.decodeUnknownEffect(ListHulyClassesParamsSchema, strictParseOptions)
export const parseGetHulyClassParams = Schema.decodeUnknownEffect(GetHulyClassParamsSchema, strictParseOptions)
export const parseListHulyAttributesParams = Schema.decodeUnknownEffect(
  ListHulyAttributesParamsSchema,
  strictParseOptions
)
export const parseListHulyEnumsParams = Schema.decodeUnknownEffect(ListHulyEnumsParamsSchema, strictParseOptions)
