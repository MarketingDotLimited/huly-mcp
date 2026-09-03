import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  DocId,
  hasAtLeastOneDefined,
  InventoryCategoryId,
  InventoryCategoryIdentifier,
  InventoryProductId,
  InventoryProductIdentifier,
  InventoryVariantId,
  InventoryVariantIdentifier,
  LimitParam,
  ListTotal,
  NonEmptyString,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

const InventoryCategorySummarySchema = Schema.Struct({
  id: InventoryCategoryId,
  name: NonEmptyString,
  parentCategory: Schema.optional(InventoryCategoryId),
  childCategories: Count,
  products: Count
})
export type InventoryCategorySummary = Schema.Schema.Type<typeof InventoryCategorySummarySchema>

export const InventoryCategoryDetailSchema = Schema.Struct({
  ...InventoryCategorySummarySchema.fields,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type InventoryCategoryDetail = Schema.Schema.Type<typeof InventoryCategoryDetailSchema>

const InventoryProductSummarySchema = Schema.Struct({
  id: InventoryProductId,
  name: NonEmptyString,
  category: InventoryCategoryId,
  variants: Count,
  photos: Count,
  attachments: Count
})
export type InventoryProductSummary = Schema.Schema.Type<typeof InventoryProductSummarySchema>

export const InventoryProductDetailSchema = Schema.Struct({
  ...InventoryProductSummarySchema.fields,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type InventoryProductDetail = Schema.Schema.Type<typeof InventoryProductDetailSchema>

const InventoryVariantSummarySchema = Schema.Struct({
  id: InventoryVariantId,
  name: NonEmptyString,
  sku: NonEmptyString,
  product: InventoryProductId
})
export type InventoryVariantSummary = Schema.Schema.Type<typeof InventoryVariantSummarySchema>

export const InventoryVariantDetailSchema = Schema.Struct({
  ...InventoryVariantSummarySchema.fields,
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
export type InventoryVariantDetail = Schema.Schema.Type<typeof InventoryVariantDetailSchema>

export const ListInventoryCategoriesResultSchema = Schema.Struct({
  categories: Schema.Array(InventoryCategorySummarySchema),
  total: ListTotal
})
export type ListInventoryCategoriesResult = Schema.Schema.Type<typeof ListInventoryCategoriesResultSchema>

export const ListInventoryProductsResultSchema = Schema.Struct({
  products: Schema.Array(InventoryProductSummarySchema),
  total: ListTotal
})
export type ListInventoryProductsResult = Schema.Schema.Type<typeof ListInventoryProductsResultSchema>

export const ListInventoryVariantsResultSchema = Schema.Struct({
  variants: Schema.Array(InventoryVariantSummarySchema),
  total: ListTotal
})
export type ListInventoryVariantsResult = Schema.Schema.Type<typeof ListInventoryVariantsResultSchema>

export const InventoryCreatedResultSchema = Schema.Struct({
  id: DocId.annotate({ description: "Inventory object ID" }),
  created: Schema.Literal(true)
})
export type InventoryCreatedResult = Schema.Schema.Type<typeof InventoryCreatedResultSchema>

export const InventoryUpdatedResultSchema = Schema.Struct({
  id: DocId.annotate({ description: "Inventory object ID" }),
  updated: Schema.Literal(true)
})
export type InventoryUpdatedResult = Schema.Schema.Type<typeof InventoryUpdatedResultSchema>

export const InventoryDeletedResultSchema = Schema.Struct({
  id: DocId.annotate({ description: "Inventory object ID" }),
  deleted: Schema.Literal(true)
})
export type InventoryDeletedResult = Schema.Schema.Type<typeof InventoryDeletedResultSchema>

const ListInventoryCategoriesParamsSchema = Schema.Struct({
  query: Schema.optional(
    NonEmptyString.annotateKey({ description: "Case-insensitive substring filter for category names." })
  ),
  parentCategory: Schema.optional(
    InventoryCategoryIdentifier.annotate({
      description:
        "Optional parent category scope. Use a category ID, exact category name, 'root', or 'inventory:global:Category'. Omit to search all categories."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of categories to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListInventoryCategoriesParams", description: "Parameters for listing inventory categories." })

export type ListInventoryCategoriesParams = Schema.Schema.Type<typeof ListInventoryCategoriesParamsSchema>

const GetInventoryCategoryParamsSchema = Schema.Struct({
  category: InventoryCategoryIdentifier.annotate({
    description:
      "Category ID or exact category name. Name lookup must be unambiguous; pass parentCategory when duplicate names may exist."
  }),
  parentCategory: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional exact parent scope for category name lookup." })
  )
}).annotate({ title: "GetInventoryCategoryParams", description: "Parameters for getting one inventory category." })

export type GetInventoryCategoryParams = Schema.Schema.Type<typeof GetInventoryCategoryParamsSchema>

const CreateInventoryCategoryParamsSchema = Schema.Struct({
  name: NonEmptyString.annotateKey({ description: "New category name." }),
  parentCategory: Schema.optional(
    InventoryCategoryIdentifier.annotate({
      description: "Parent category ID or exact name. Defaults to the Inventory root category."
    })
  )
}).annotate({ title: "CreateInventoryCategoryParams", description: "Parameters for creating an inventory category." })

export type CreateInventoryCategoryParams = Schema.Schema.Type<typeof CreateInventoryCategoryParamsSchema>

export const UPDATE_INVENTORY_CATEGORY_FIELDS = ["name", "newParentCategory"] as const

const UpdateInventoryCategoryParamsSchema = Schema.Struct({
  category: InventoryCategoryIdentifier.annotate({
    description:
      "Category ID or exact name to update. Name lookup must be unambiguous; pass parentCategory when needed."
  }),
  parentCategory: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional current parent scope for category name lookup." })
  ),
  name: Schema.optional(NonEmptyString.annotateKey({ description: "New category name." })),
  newParentCategory: Schema.optional(
    InventoryCategoryIdentifier.annotate({
      description: "New parent category ID or exact name; use 'root' to move to the Inventory root."
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_INVENTORY_CATEGORY_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_CATEGORY_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateInventoryCategoryParams",
    description: `Parameters for updating an inventory category. ${atLeastOneUpdateFieldMessage(
      UPDATE_INVENTORY_CATEGORY_FIELDS
    )}`
  })

export type UpdateInventoryCategoryParams = Schema.Schema.Type<typeof UpdateInventoryCategoryParamsSchema>
assertUpdateFields<UpdateInventoryCategoryParams>()(["category", "parentCategory"], UPDATE_INVENTORY_CATEGORY_FIELDS)

const DeleteInventoryCategoryParamsSchema = GetInventoryCategoryParamsSchema.annotate({
  title: "DeleteInventoryCategoryParams",
  description: "Parameters for deleting an empty inventory category."
})

export type DeleteInventoryCategoryParams = Schema.Schema.Type<typeof DeleteInventoryCategoryParamsSchema>

const ListInventoryProductsParamsSchema = Schema.Struct({
  query: Schema.optional(
    NonEmptyString.annotateKey({ description: "Case-insensitive substring filter for product names." })
  ),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional category scope by ID or exact category name." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of products to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListInventoryProductsParams", description: "Parameters for listing inventory products." })

export type ListInventoryProductsParams = Schema.Schema.Type<typeof ListInventoryProductsParamsSchema>

const GetInventoryProductParamsSchema = Schema.Struct({
  product: InventoryProductIdentifier.annotate({
    description: "Product ID or exact product name. Name lookup must be unambiguous; pass category when needed."
  }),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional exact category scope for product name lookup." })
  )
}).annotate({ title: "GetInventoryProductParams", description: "Parameters for getting one inventory product." })

export type GetInventoryProductParams = Schema.Schema.Type<typeof GetInventoryProductParamsSchema>

const CreateInventoryProductParamsSchema = Schema.Struct({
  name: NonEmptyString.annotateKey({ description: "New product name." }),
  category: InventoryCategoryIdentifier.annotate({
    description: "Category ID or exact category name where the product will be created."
  })
}).annotate({ title: "CreateInventoryProductParams", description: "Parameters for creating an inventory product." })

export type CreateInventoryProductParams = Schema.Schema.Type<typeof CreateInventoryProductParamsSchema>

export const UPDATE_INVENTORY_PRODUCT_FIELDS = ["name", "newCategory"] as const

const UpdateInventoryProductParamsSchema = Schema.Struct({
  product: InventoryProductIdentifier.annotate({
    description:
      "Product ID or exact product name to update. Name lookup must be unambiguous; pass category when needed."
  }),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional current category scope for product name lookup." })
  ),
  name: Schema.optional(NonEmptyString.annotateKey({ description: "New product name." })),
  newCategory: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "New category ID or exact category name." })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_INVENTORY_PRODUCT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_PRODUCT_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateInventoryProductParams",
    description: `Parameters for updating an inventory product. ${atLeastOneUpdateFieldMessage(
      UPDATE_INVENTORY_PRODUCT_FIELDS
    )}`
  })

export type UpdateInventoryProductParams = Schema.Schema.Type<typeof UpdateInventoryProductParamsSchema>
assertUpdateFields<UpdateInventoryProductParams>()(["product", "category"], UPDATE_INVENTORY_PRODUCT_FIELDS)

const DeleteInventoryProductParamsSchema = GetInventoryProductParamsSchema.annotate({
  title: "DeleteInventoryProductParams",
  description: "Parameters for deleting an inventory product with no variants, photos, or attachments."
})

export type DeleteInventoryProductParams = Schema.Schema.Type<typeof DeleteInventoryProductParamsSchema>

const ListInventoryVariantsParamsSchema = Schema.Struct({
  query: Schema.optional(
    NonEmptyString.annotateKey({ description: "Case-insensitive substring filter for variant names or SKUs." })
  ),
  product: Schema.optional(
    InventoryProductIdentifier.annotateKey({ description: "Optional product scope by ID or exact product name." })
  ),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional category scope used to resolve product names." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of variants to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListInventoryVariantsParams", description: "Parameters for listing inventory variants/SKUs." })

export type ListInventoryVariantsParams = Schema.Schema.Type<typeof ListInventoryVariantsParamsSchema>

const GetInventoryVariantParamsSchema = Schema.Struct({
  variant: InventoryVariantIdentifier.annotate({
    description:
      "Variant ID, exact variant name, or exact SKU. Name/SKU lookup must be unambiguous; pass product when needed."
  }),
  product: Schema.optional(
    InventoryProductIdentifier.annotateKey({ description: "Optional exact product scope for variant name/SKU lookup." })
  ),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional category scope used to resolve product names." })
  )
}).annotate({ title: "GetInventoryVariantParams", description: "Parameters for getting one inventory variant/SKU." })

export type GetInventoryVariantParams = Schema.Schema.Type<typeof GetInventoryVariantParamsSchema>

const CreateInventoryVariantParamsSchema = Schema.Struct({
  product: InventoryProductIdentifier.annotate({
    description: "Product ID or exact product name where the variant will be created."
  }),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional category scope used to resolve product names." })
  ),
  name: NonEmptyString.annotateKey({ description: "New variant name." }),
  sku: NonEmptyString.annotateKey({ description: "New exact SKU." })
}).annotate({ title: "CreateInventoryVariantParams", description: "Parameters for creating an inventory variant/SKU." })

export type CreateInventoryVariantParams = Schema.Schema.Type<typeof CreateInventoryVariantParamsSchema>

export const UPDATE_INVENTORY_VARIANT_FIELDS = ["name", "sku"] as const

const UpdateInventoryVariantParamsSchema = Schema.Struct({
  variant: InventoryVariantIdentifier.annotate({
    description: "Variant ID, exact variant name, or exact SKU to update. Pass product when needed."
  }),
  product: Schema.optional(
    InventoryProductIdentifier.annotateKey({ description: "Optional exact product scope for variant name/SKU lookup." })
  ),
  category: Schema.optional(
    InventoryCategoryIdentifier.annotateKey({ description: "Optional category scope used to resolve product names." })
  ),
  name: Schema.optional(NonEmptyString.annotateKey({ description: "New variant name." })),
  sku: Schema.optional(NonEmptyString.annotateKey({ description: "New SKU." }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_INVENTORY_VARIANT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_INVENTORY_VARIANT_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateInventoryVariantParams",
    description: `Parameters for updating an inventory variant/SKU. ${atLeastOneUpdateFieldMessage(
      UPDATE_INVENTORY_VARIANT_FIELDS
    )}`
  })

export type UpdateInventoryVariantParams = Schema.Schema.Type<typeof UpdateInventoryVariantParamsSchema>
assertUpdateFields<UpdateInventoryVariantParams>()(["variant", "product", "category"], UPDATE_INVENTORY_VARIANT_FIELDS)

const DeleteInventoryVariantParamsSchema = GetInventoryVariantParamsSchema.annotate({
  title: "DeleteInventoryVariantParams",
  description: "Parameters for deleting one inventory variant/SKU."
})

export type DeleteInventoryVariantParams = Schema.Schema.Type<typeof DeleteInventoryVariantParamsSchema>

const inventoryParamsJsonSchema = (schema: Schema.Constraint, descriptions: Readonly<Record<string, string>>): object =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)

export const listInventoryCategoriesParamsJsonSchema = inventoryParamsJsonSchema(ListInventoryCategoriesParamsSchema, {
  query: "Case-insensitive substring filter for category names.",
  parentCategory:
    "Optional parent category scope. Use a category ID, exact category name, 'root', or 'inventory:global:Category'. Omit to search all categories.",
  limit: `Maximum number of categories to return (default: ${DEFAULT_LIMIT}).`
})
const inventoryCategoryLookupDescriptions = {
  category:
    "Category ID or exact category name. Name lookup must be unambiguous; pass parentCategory when duplicate names may exist.",
  parentCategory: "Optional exact parent scope for category name lookup."
} as const
export const getInventoryCategoryParamsJsonSchema = inventoryParamsJsonSchema(
  GetInventoryCategoryParamsSchema,
  inventoryCategoryLookupDescriptions
)
export const createInventoryCategoryParamsJsonSchema = inventoryParamsJsonSchema(CreateInventoryCategoryParamsSchema, {
  name: "New category name.",
  parentCategory: "Parent category ID or exact name. Defaults to the Inventory root category."
})
export const updateInventoryCategoryParamsJsonSchema = withAtLeastOneRequired(
  inventoryParamsJsonSchema(UpdateInventoryCategoryParamsSchema, {
    category: "Category ID or exact name to update. Name lookup must be unambiguous; pass parentCategory when needed.",
    parentCategory: "Optional current parent scope for category name lookup.",
    name: "New category name.",
    newParentCategory: "New parent category ID or exact name; use 'root' to move to the Inventory root."
  }),
  UPDATE_INVENTORY_CATEGORY_FIELDS
)
export const deleteInventoryCategoryParamsJsonSchema = inventoryParamsJsonSchema(
  DeleteInventoryCategoryParamsSchema,
  inventoryCategoryLookupDescriptions
)
export const listInventoryProductsParamsJsonSchema = inventoryParamsJsonSchema(ListInventoryProductsParamsSchema, {
  query: "Case-insensitive substring filter for product names.",
  category: "Optional category scope by ID or exact category name.",
  limit: `Maximum number of products to return (default: ${DEFAULT_LIMIT}).`
})
const inventoryProductLookupDescriptions = {
  product: "Product ID or exact product name. Name lookup must be unambiguous; pass category when needed.",
  category: "Optional exact category scope for product name lookup."
} as const
export const getInventoryProductParamsJsonSchema = inventoryParamsJsonSchema(
  GetInventoryProductParamsSchema,
  inventoryProductLookupDescriptions
)
export const createInventoryProductParamsJsonSchema = inventoryParamsJsonSchema(CreateInventoryProductParamsSchema, {
  name: "New product name.",
  category: "Category ID or exact category name where the product will be created."
})
export const updateInventoryProductParamsJsonSchema = withAtLeastOneRequired(
  inventoryParamsJsonSchema(UpdateInventoryProductParamsSchema, {
    product: "Product ID or exact product name to update. Name lookup must be unambiguous; pass category when needed.",
    category: "Optional current category scope for product name lookup.",
    name: "New product name.",
    newCategory: "New category ID or exact category name."
  }),
  UPDATE_INVENTORY_PRODUCT_FIELDS
)
export const deleteInventoryProductParamsJsonSchema = inventoryParamsJsonSchema(
  DeleteInventoryProductParamsSchema,
  inventoryProductLookupDescriptions
)
export const listInventoryVariantsParamsJsonSchema = inventoryParamsJsonSchema(ListInventoryVariantsParamsSchema, {
  query: "Case-insensitive substring filter for variant names or SKUs.",
  product: "Optional product scope by ID or exact product name.",
  category: "Optional category scope used to resolve product names.",
  limit: `Maximum number of variants to return (default: ${DEFAULT_LIMIT}).`
})
const inventoryVariantLookupDescriptions = {
  variant:
    "Variant ID, exact variant name, or exact SKU. Name/SKU lookup must be unambiguous; pass product when needed.",
  product: "Optional exact product scope for variant name/SKU lookup.",
  category: "Optional category scope used to resolve product names."
} as const
export const getInventoryVariantParamsJsonSchema = inventoryParamsJsonSchema(
  GetInventoryVariantParamsSchema,
  inventoryVariantLookupDescriptions
)
export const createInventoryVariantParamsJsonSchema = inventoryParamsJsonSchema(CreateInventoryVariantParamsSchema, {
  product: "Product ID or exact product name where the variant will be created.",
  category: "Optional category scope used to resolve product names.",
  name: "New variant name.",
  sku: "New exact SKU."
})
export const updateInventoryVariantParamsJsonSchema = withAtLeastOneRequired(
  inventoryParamsJsonSchema(UpdateInventoryVariantParamsSchema, {
    variant: "Variant ID, exact variant name, or exact SKU to update. Pass product when needed.",
    product: "Optional exact product scope for variant name/SKU lookup.",
    category: "Optional category scope used to resolve product names.",
    name: "New variant name.",
    sku: "New SKU."
  }),
  UPDATE_INVENTORY_VARIANT_FIELDS
)
export const deleteInventoryVariantParamsJsonSchema = inventoryParamsJsonSchema(
  DeleteInventoryVariantParamsSchema,
  inventoryVariantLookupDescriptions
)

export const parseListInventoryCategoriesParams = Schema.decodeUnknownEffect(ListInventoryCategoriesParamsSchema)
export const parseGetInventoryCategoryParams = Schema.decodeUnknownEffect(GetInventoryCategoryParamsSchema)
export const parseCreateInventoryCategoryParams = Schema.decodeUnknownEffect(CreateInventoryCategoryParamsSchema)
export const parseUpdateInventoryCategoryParams = Schema.decodeUnknownEffect(UpdateInventoryCategoryParamsSchema)
export const parseDeleteInventoryCategoryParams = Schema.decodeUnknownEffect(DeleteInventoryCategoryParamsSchema)
export const parseListInventoryProductsParams = Schema.decodeUnknownEffect(ListInventoryProductsParamsSchema)
export const parseGetInventoryProductParams = Schema.decodeUnknownEffect(GetInventoryProductParamsSchema)
export const parseCreateInventoryProductParams = Schema.decodeUnknownEffect(CreateInventoryProductParamsSchema)
export const parseUpdateInventoryProductParams = Schema.decodeUnknownEffect(UpdateInventoryProductParamsSchema)
export const parseDeleteInventoryProductParams = Schema.decodeUnknownEffect(DeleteInventoryProductParamsSchema)
export const parseListInventoryVariantsParams = Schema.decodeUnknownEffect(ListInventoryVariantsParamsSchema)
export const parseGetInventoryVariantParams = Schema.decodeUnknownEffect(GetInventoryVariantParamsSchema)
export const parseCreateInventoryVariantParams = Schema.decodeUnknownEffect(CreateInventoryVariantParamsSchema)
export const parseUpdateInventoryVariantParams = Schema.decodeUnknownEffect(UpdateInventoryVariantParamsSchema)
export const parseDeleteInventoryVariantParams = Schema.decodeUnknownEffect(DeleteInventoryVariantParamsSchema)
