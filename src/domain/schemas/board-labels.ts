import { Schema } from "effect"

import { BoardCardRefSchema, BoardRefSchema } from "./boards.js"
import { clearableText } from "./clearable.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  TagCategoryId,
  TagCategoryIdentifier,
  TagElementId,
  TagReferenceId,
  withAtLeastOneRequired
} from "./shared.js"

export const BoardLabelIdentifier = NonEmptyString.pipe(Schema.brand("BoardLabelIdentifier")).annotate({
  identifier: "BoardLabelIdentifier",
  title: "BoardLabelIdentifier",
  description: "Board label locator: board label TagElement _id or exact label title."
})
export type BoardLabelIdentifier = Schema.Schema.Type<typeof BoardLabelIdentifier>

export const BoardLabelRefSchema = BoardLabelIdentifier.annotate({
  description:
    "Board label locator: board label TagElement _id or exact title. Titles must match exactly; pass the _id when titles are ambiguous."
})
export type BoardLabelRef = Schema.Schema.Type<typeof BoardLabelRefSchema>

export const BoardLabelSummarySchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  description: Schema.String,
  color: ColorCode,
  category: TagCategoryId,
  refCount: Schema.optional(Count)
}).annotate({
  title: "BoardLabelSummary",
  description:
    "Board label definition. Board labels are Huly TagElement rows where targetClass is @hcengineering/board Card."
})
export type BoardLabelSummary = Schema.Schema.Type<typeof BoardLabelSummarySchema>

export const BoardCardAttachedLabelSchema = Schema.Struct({
  id: TagReferenceId,
  label: TagElementId,
  title: NonEmptyString,
  color: ColorCode
}).annotate({
  title: "BoardCardAttachedLabel",
  description:
    "Board card label attachment. Board card labels are Huly TagReference rows in a board card's labels collection."
})
export type BoardCardAttachedLabel = Schema.Schema.Type<typeof BoardCardAttachedLabelSchema>

export const ListBoardLabelsParamsSchema = Schema.Struct({
  category: Schema.optional(
    TagCategoryIdentifier.annotateKey({ description: "Optional board label category _id or exact label." })
  ),
  titleSearch: Schema.optional(
    Schema.String.annotateKey({ description: "Optional board label title substring search." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of board labels to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({
  title: "ListBoardLabelsParams",
  description:
    "List board label definitions. Board labels are board-card tags: TagElement.targetClass is @hcengineering/board Card."
})
export type ListBoardLabelsParams = Schema.Schema.Type<typeof ListBoardLabelsParamsSchema>

export const CreateBoardLabelParamsSchema = Schema.Struct({
  title: NonEmptyString.annotate({
    description: "Board label title. Creation is idempotent by exact board label title when there is one match."
  }),
  color: Schema.optional(
    ColorCode.annotate({
      description: `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}).`
    })
  ),
  description: Schema.optional(Schema.String.annotateKey({ description: "Board label description." })),
  category: Schema.optional(
    TagCategoryIdentifier.annotate({
      description:
        "Board label category _id or exact label. If omitted, uses the board card tag default category or board.category.Other."
    })
  )
}).annotate({
  title: "CreateBoardLabelParams",
  description:
    "Create a board label definition for board cards. This writes a TagElement with targetClass = @hcengineering/board Card."
})
export type CreateBoardLabelParams = Schema.Schema.Type<typeof CreateBoardLabelParamsSchema>

export const UPDATE_BOARD_LABEL_FIELDS = ["title", "color", "description", "category"] as const satisfies ReadonlyArray<
  "title" | "color" | "description" | "category"
>

export const UpdateBoardLabelParamsSchema = Schema.Struct({
  label: BoardLabelRefSchema,
  title: Schema.optional(NonEmptyString.annotateKey({ description: "New board label title." })),
  color: Schema.optional(
    ColorCode.annotateKey({ description: `New Huly platform color palette index from 0 through ${MAX_COLOR_INDEX}.` })
  ),
  description: Schema.optional(clearableText("New board label description.")),
  category: Schema.optional(
    TagCategoryIdentifier.annotateKey({ description: "New board label category _id or exact label." })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_BOARD_LABEL_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_BOARD_LABEL_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateBoardLabelParams",
    description: `Update a board label definition. ${atLeastOneUpdateFieldMessage(UPDATE_BOARD_LABEL_FIELDS)}`
  })
export type UpdateBoardLabelParams = Schema.Schema.Type<typeof UpdateBoardLabelParamsSchema>
assertUpdateFields<UpdateBoardLabelParams>()(["label"], UPDATE_BOARD_LABEL_FIELDS)

export const DeleteBoardLabelParamsSchema = Schema.Struct({ label: BoardLabelRefSchema }).annotate({
  title: "DeleteBoardLabelParams",
  description: "Delete one board label definition by TagElement _id or exact title."
})
export type DeleteBoardLabelParams = Schema.Schema.Type<typeof DeleteBoardLabelParamsSchema>

export const BoardCardLabelParamsSchema = Schema.Struct({ board: BoardRefSchema, card: BoardCardRefSchema }).annotate({
  title: "BoardCardLabelParams",
  description: "Locate one board card before reading its board-card tag labels."
})
export type BoardCardLabelParams = Schema.Schema.Type<typeof BoardCardLabelParamsSchema>

export const AddBoardCardLabelParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  card: BoardCardRefSchema,
  label: BoardLabelRefSchema,
  color: Schema.optional(
    ColorCode.annotate({
      description: `Color for the board label definition when label is a new title (default: ${DEFAULT_COLOR_INDEX}). Existing labels are not recolored.`
    })
  ),
  category: Schema.optional(
    TagCategoryIdentifier.annotate({
      description:
        "Category for the board label definition when label is a new title. Existing labels are not recategorized."
    })
  )
}).annotate({
  title: "AddBoardCardLabelParams",
  description:
    "Attach a board label to a board card. If label is a new title, creates the board-card TagElement first, then attaches a TagReference in the card labels collection."
})
export type AddBoardCardLabelParams = Schema.Schema.Type<typeof AddBoardCardLabelParamsSchema>

export const RemoveBoardCardLabelParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  card: BoardCardRefSchema,
  label: BoardLabelRefSchema
}).annotate({
  title: "RemoveBoardCardLabelParams",
  description:
    "Detach a board label from a board card. Returns detached=false when the label exists but is not attached."
})
export type RemoveBoardCardLabelParams = Schema.Schema.Type<typeof RemoveBoardCardLabelParamsSchema>

export const ListBoardLabelsResultSchema = Schema.Struct({
  labels: Schema.Array(BoardLabelSummarySchema),
  total: Count
})
export type ListBoardLabelsResult = Schema.Schema.Type<typeof ListBoardLabelsResultSchema>

const CreatedBoardLabelResultSchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  created: Schema.Boolean
})

const UpdatedBoardLabelResultSchema = Schema.Struct({ id: TagElementId, updated: Schema.Literal(true) })

const DeletedBoardLabelResultSchema = Schema.Struct({ id: TagElementId, deleted: Schema.Literal(true) })

export const BoardLabelMutationResultSchema = Schema.Union([
  CreatedBoardLabelResultSchema,
  UpdatedBoardLabelResultSchema,
  DeletedBoardLabelResultSchema
])
export type BoardLabelMutationResult = Schema.Schema.Type<typeof BoardLabelMutationResultSchema>

export const ListBoardCardLabelsResultSchema = Schema.Struct({
  labels: Schema.Array(BoardCardAttachedLabelSchema),
  total: Count
})
export type ListBoardCardLabelsResult = Schema.Schema.Type<typeof ListBoardCardLabelsResultSchema>

export const AddBoardCardLabelResultSchema = Schema.Struct({
  id: TagReferenceId,
  label: TagElementId,
  title: NonEmptyString,
  attached: Schema.Boolean,
  labelCreated: Schema.Boolean
})
export type AddBoardCardLabelResult = Schema.Schema.Type<typeof AddBoardCardLabelResultSchema>

export const RemoveBoardCardLabelResultSchema = Schema.Struct({
  label: TagElementId,
  title: NonEmptyString,
  detached: Schema.Boolean,
  detachedCount: Count
})
export type RemoveBoardCardLabelResult = Schema.Schema.Type<typeof RemoveBoardCardLabelResultSchema>

const BOARD_LABEL_PARAM_DESCRIPTIONS = {
  board: "Board name or ID.",
  card: "Board card title or ID.",
  label: "Board label ID or exact title.",
  category: "Board label category ID or exact label.",
  titleSearch: "Case-insensitive label title search.",
  limit: `Maximum number of labels to return (default: ${DEFAULT_LIMIT}).`
} as const
const boardLabelParamsJsonSchema = (
  schema: Schema.Constraint,
  descriptions: Readonly<Record<string, string>> = BOARD_LABEL_PARAM_DESCRIPTIONS
): object => withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)
export const listBoardLabelsParamsJsonSchema = boardLabelParamsJsonSchema(ListBoardLabelsParamsSchema)
export const createBoardLabelParamsJsonSchema = boardLabelParamsJsonSchema(CreateBoardLabelParamsSchema, {
  ...BOARD_LABEL_PARAM_DESCRIPTIONS,
  title: "Board label title. Creation is idempotent by exact board label title when there is one match.",
  color: `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}).`,
  description: "Board label description.",
  category:
    "Board label category _id or exact label. If omitted, uses the board card tag default category or board.category.Other."
})
export const updateBoardLabelParamsJsonSchema = withAtLeastOneRequired(
  {
    ...boardLabelParamsJsonSchema(UpdateBoardLabelParamsSchema, {
      ...BOARD_LABEL_PARAM_DESCRIPTIONS,
      label: "Board label TagElement _id or exact title.",
      title: "New board label title.",
      color: `New Huly platform color palette index from 0 through ${MAX_COLOR_INDEX}.`,
      description: "New board label description; null clears it.",
      category: "New board label category _id or exact label."
    }),
    description: `Update a board label definition. ${atLeastOneUpdateFieldMessage(UPDATE_BOARD_LABEL_FIELDS)}`
  },
  UPDATE_BOARD_LABEL_FIELDS
)
export const deleteBoardLabelParamsJsonSchema = boardLabelParamsJsonSchema(DeleteBoardLabelParamsSchema)
export const boardCardLabelParamsJsonSchema = boardLabelParamsJsonSchema(BoardCardLabelParamsSchema)
export const addBoardCardLabelParamsJsonSchema = boardLabelParamsJsonSchema(AddBoardCardLabelParamsSchema, {
  ...BOARD_LABEL_PARAM_DESCRIPTIONS,
  color: `Color for the board label definition when label is a new title (default: ${DEFAULT_COLOR_INDEX}). Existing labels are not recolored.`,
  category: "Category for the board label definition when label is a new title. Existing labels are not recategorized."
})
export const removeBoardCardLabelParamsJsonSchema = boardLabelParamsJsonSchema(RemoveBoardCardLabelParamsSchema)

export const parseListBoardLabelsParams = Schema.decodeUnknownEffect(ListBoardLabelsParamsSchema)
export const parseCreateBoardLabelParams = Schema.decodeUnknownEffect(CreateBoardLabelParamsSchema)
export const parseUpdateBoardLabelParams = Schema.decodeUnknownEffect(UpdateBoardLabelParamsSchema)
export const parseDeleteBoardLabelParams = Schema.decodeUnknownEffect(DeleteBoardLabelParamsSchema)
export const parseBoardCardLabelParams = Schema.decodeUnknownEffect(BoardCardLabelParamsSchema)
export const parseAddBoardCardLabelParams = Schema.decodeUnknownEffect(AddBoardCardLabelParamsSchema)
export const parseRemoveBoardCardLabelParams = Schema.decodeUnknownEffect(RemoveBoardCardLabelParamsSchema)
