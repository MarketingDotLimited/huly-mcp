import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import {
  DEFAULT_LIMIT,
  DocId,
  hasAtLeastOneDefined,
  hasMutuallyExclusiveFields,
  LimitParam,
  ListTotal,
  ObjectClassName,
  ProjectIdentifier,
  SpaceId,
  SpaceIdentifier,
  Timestamp,
  withAtLeastOneRequired,
  withMutuallyExclusiveFields
} from "./shared.js"

export const RelatedIssueTargetId = DocId.pipe(Schema.brand("RelatedIssueTargetId"))
export type RelatedIssueTargetId = Schema.Schema.Type<typeof RelatedIssueTargetId>

export const RelatedIssueTargetRuleSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("spaceRule"),
    spaceId: SpaceId,
    spaceName: Schema.optional(SpaceIdentifier),
    spaceClass: Schema.optional(ObjectClassName)
  }),
  Schema.Struct({ kind: Schema.Literal("classRule"), objectClass: ObjectClassName })
]).annotate({
  title: "RelatedIssueTargetRule",
  description: "Rule that selects which source objects use a default destination project for related issues."
})
export type RelatedIssueTargetRule = Schema.Schema.Type<typeof RelatedIssueTargetRuleSchema>

export const RelatedIssueTargetSchema = Schema.Struct({
  targetId: RelatedIssueTargetId,
  rule: RelatedIssueTargetRuleSchema,
  targetProject: Schema.NullOr(ProjectIdentifier),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
}).annotate({
  title: "RelatedIssueTarget",
  description: "Huly tracker rule for choosing the default destination project for related issues."
})
export type RelatedIssueTarget = Schema.Schema.Type<typeof RelatedIssueTargetSchema>

export const ListRelatedIssueTargetsParamsSchema = Schema.Struct({
  space: Schema.optional(
    SpaceIdentifier.annotateKey({
      description:
        "Optional source space name or ID. When provided, returns only the spaceRule that sets that space's default related-issue destination project."
    })
  ),
  objectClass: Schema.optional(
    ObjectClassName.annotateKey({
      description:
        "Optional exact Huly object class ID. When provided, returns only the classRule that sets that class's default related-issue destination project."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({
      description: `Maximum number of related issue targets to return (default: ${DEFAULT_LIMIT}).`
    })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasMutuallyExclusiveFields(params, ["space", "objectClass"])
          ? "Provide only one of space or objectClass."
          : undefined
      )
    )
  )
  .annotate({
    title: "ListRelatedIssueTargetsParams",
    description:
      "List rules that choose the default destination project for related issues. Filter by either a source space locator or an exact object class ID."
  })
export type ListRelatedIssueTargetsParams = Schema.Schema.Type<typeof ListRelatedIssueTargetsParamsSchema>

const RelatedIssueTargetLocatorFields = {
  space: Schema.optional(
    SpaceIdentifier.annotateKey({
      description:
        "Source space name or ID for a spaceRule. Space rules set the default destination project for related issues from that space and can be created or updated by this tool."
    })
  ),
  objectClass: Schema.optional(
    ObjectClassName.annotateKey({
      description:
        "Exact Huly object class ID for an existing classRule. Class rules set the default destination project for related issues from that object class and can only have their targetProject updated."
    })
  )
}

const validateRelatedIssueTargetLocator = (params: {
  readonly space?: unknown
  readonly objectClass?: unknown
}): string | undefined => {
  if (!hasAtLeastOneDefined(params, ["space", "objectClass"])) {
    return "Provide one of space or objectClass."
  }
  if (hasMutuallyExclusiveFields(params, ["space", "objectClass"])) {
    return "Provide only one of space or objectClass."
  }
  return undefined
}

export const SetRelatedIssueTargetParamsSchema = Schema.Struct({
  ...RelatedIssueTargetLocatorFields,
  targetProject: Schema.NullOr(ProjectIdentifier).annotateKey({
    description:
      "Default destination project identifier for related issues from the selected space or object class, or null to clear the default destination project."
  })
})
  .pipe(Schema.check(Schema.makeFilter(validateRelatedIssueTargetLocator)))
  .annotate({
    title: "SetRelatedIssueTargetParams",
    description:
      "Create/update a spaceRule or update an existing classRule that chooses the default destination project for related issues. Class rules are not created by this tool."
  })
export type SetRelatedIssueTargetParams = Schema.Schema.Type<typeof SetRelatedIssueTargetParamsSchema>

export const DeleteRelatedIssueSpaceTargetParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotateKey({
    description: "Source space name or ID whose spaceRule default related-issue destination project should be deleted."
  })
}).annotate({
  title: "DeleteRelatedIssueSpaceTargetParams",
  description:
    "Delete a spaceRule that chooses the default destination project for related issues from one space. Class rules cannot be deleted by this tool."
})
export type DeleteRelatedIssueSpaceTargetParams = Schema.Schema.Type<typeof DeleteRelatedIssueSpaceTargetParamsSchema>
export const ListRelatedIssueTargetsResultSchema = Schema.Struct({
  targets: Schema.Array(RelatedIssueTargetSchema),
  total: ListTotal
})
export type ListRelatedIssueTargetsResult = Schema.Schema.Type<typeof ListRelatedIssueTargetsResultSchema>
export const SetRelatedIssueTargetResultSchema = Schema.Struct({
  target: RelatedIssueTargetSchema,
  created: Schema.Boolean
})
export type SetRelatedIssueTargetResult = Schema.Schema.Type<typeof SetRelatedIssueTargetResultSchema>
export const DeleteRelatedIssueSpaceTargetResultSchema = Schema.Struct({
  targetId: RelatedIssueTargetId,
  deleted: Schema.Boolean
})
export type DeleteRelatedIssueSpaceTargetResult = Schema.Schema.Type<typeof DeleteRelatedIssueSpaceTargetResultSchema>

const relatedIssueTargetJsonSchema = (schema: Schema.Constraint): object => toDraft07JsonSchema(schema)

export const listRelatedIssueTargetsParamsJsonSchema = withMutuallyExclusiveFields(
  relatedIssueTargetJsonSchema(ListRelatedIssueTargetsParamsSchema),
  ["space", "objectClass"]
)
export const setRelatedIssueTargetParamsJsonSchema = withAtLeastOneRequired(
  withMutuallyExclusiveFields(relatedIssueTargetJsonSchema(SetRelatedIssueTargetParamsSchema), [
    "space",
    "objectClass"
  ]),
  ["space", "objectClass"]
)
export const deleteRelatedIssueSpaceTargetParamsJsonSchema = relatedIssueTargetJsonSchema(
  DeleteRelatedIssueSpaceTargetParamsSchema
)

export const parseListRelatedIssueTargetsParams = Schema.decodeUnknownEffect(ListRelatedIssueTargetsParamsSchema)
export const parseSetRelatedIssueTargetParams = Schema.decodeUnknownEffect(SetRelatedIssueTargetParamsSchema)
export const parseDeleteRelatedIssueSpaceTargetParams = Schema.decodeUnknownEffect(
  DeleteRelatedIssueSpaceTargetParamsSchema
)
