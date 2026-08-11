import type { HulyDomainError } from "../../huly/errors.js"
import { isInvalidParamsDomainError } from "../error-mapping.js"
import type { INVALID_PARAMS_DOMAIN_ERROR_TAGS } from "../error-mapping.js"

export type DomainFailureKind =
  | "ambiguity"
  | "authentication"
  | "authorization"
  | "conflict"
  | "input"
  | "integration"
  | "lookup"

const tags = (values: ReadonlyArray<HulyDomainError["_tag"]>): ReadonlySet<HulyDomainError["_tag"]> => new Set(values)

const AUTHORIZATION_TAG_VALUES = [
  "ApprovalRequestApproverNotRequestedError",
  "ApprovalRequestCancelUnauthorizedError",
  "HulyAttributeProtectedError",
  "PermissionProtectedError",
  "ProcessParallelExecutionForbiddenError",
  "SpaceRolePermissionScopeError"
] as const satisfies ReadonlyArray<HulyDomainError["_tag"]>
const AUTHORIZATION_TAGS = tags(AUTHORIZATION_TAG_VALUES)

const AMBIGUITY_TAG_VALUES = [
  "AssociationIdentifierAmbiguousError",
  "BoardCardIdentifierAmbiguousError",
  "BoardIdentifierAmbiguousError",
  "BoardLabelIdentifierAmbiguousError",
  "BoardMenuPageIdentifierAmbiguousError",
  "BoardProjectTypeIdentifierAmbiguousError",
  "BoardSavedViewIdentifierAmbiguousError",
  "BoardStatusIdentifierAmbiguousError",
  "BoardTaskTypeIdentifierAmbiguousError",
  "BoardViewletIdentifierAmbiguousError",
  "ContactChannelIdentifierAmbiguousError",
  "CollaboratorMetadataAmbiguousError",
  "DirectMessageIdentifierAmbiguousError",
  "DocumentTextMultipleMatchesError",
  "DriveIdentifierAmbiguousError",
  "DrivePathAmbiguousError",
  "FilteredViewIdentifierAmbiguousError",
  "GenericObjectIdentifierAmbiguousError",
  "HulyAttributeAmbiguousError",
  "HulyEnumAmbiguousError",
  "InventoryCategoryIdentifierAmbiguousError",
  "InventoryProductIdentifierAmbiguousError",
  "InventoryVariantIdentifierAmbiguousError",
  "MessageTemplateCategoryIdentifierAmbiguousError",
  "MessageTemplateIdentifierAmbiguousError",
  "MilestoneIdentifierAmbiguousError",
  "ModelClassAmbiguousError",
  "OrganizationIdentifierAmbiguousError",
  "PersonIdentifierAmbiguousError",
  "PermissionIdentifierAmbiguousError",
  "ProcessCardIdentifierAmbiguousError",
  "ProcessIdentifierAmbiguousError",
  "ProcessMasterTagAmbiguousError",
  "RecruitingApplicantIdentifierAmbiguousError",
  "RecruitingOpinionIdentifierAmbiguousError",
  "RecruitingReviewIdentifierAmbiguousError",
  "RecruitingVacancyIdentifierAmbiguousError",
  "RelationDirectionAmbiguousError",
  "RelationIdentifierAmbiguousError",
  "SequenceIdentifierAmbiguousError",
  "SpaceIdentifierAmbiguousError",
  "SpaceRoleIdentifierAmbiguousError",
  "SpaceTypeIdentifierAmbiguousError",
  "TagIdentifierAmbiguousError",
  "TelegramChannelIdentifierAmbiguousError",
  "TemplateFieldCategoryIdentifierAmbiguousError",
  "TodoIdentifierAmbiguousError",
  "ViewletIdentifierAmbiguousError",
  "WorkbenchApplicationAliasAmbiguousError",
  "WorkflowAttributeIdentifierAmbiguousError",
  "WorkflowStatusCategoryIdentifierAmbiguousError",
  "WorkflowStatusIdentifierAmbiguousError"
] as const satisfies ReadonlyArray<HulyDomainError["_tag"]>
const AMBIGUITY_TAGS = tags(AMBIGUITY_TAG_VALUES)

const CONFLICT_TAG_VALUES = [
  "AssociationConflictError",
  "AssociationInUseError",
  "ContactChannelConflictError",
  "DrivePathConflictError",
  "HulyAttributeInUseError",
  "HulyAttributeNameConflictError",
  "HulyEnumInUseError",
  "HulyEnumNameConflictError",
  "HulyEnumOptionsInUseError",
  "InventoryConflictError",
  "RecruitingDuplicateApplicantError",
  "PermissionInUseError",
  "PermissionLabelConflictError",
  "RelationEndpointClassMismatchError",
  "SequenceConcurrentWriteError",
  "SequenceCurrentValueMismatchError",
  "SequenceDefinitionConflictError",
  "SequenceInUseError",
  "SpaceCreationConflictError",
  "SpaceRoleNameConflictError",
  "WorkflowStatusCategoryInUseError",
  "WorkflowStatusCategoryLabelConflictError",
  "WorkflowStatusClassMismatchError",
  "WorkflowStatusInUseError",
  "WorkflowStatusNameConflictError"
] as const satisfies ReadonlyArray<HulyDomainError["_tag"]>
const CONFLICT_TAGS = tags(CONFLICT_TAG_VALUES)

const LOOKUP_TAG_VALUES = [
  "ActivityMessageNotFoundError",
  "ApprovalRequestNotFoundError",
  "ApprovalRequestTargetNotFoundError",
  "AssociationNotFoundError",
  "AttachmentNotFoundError",
  "BoardCardNotFoundError",
  "BoardLabelNotFoundError",
  "BoardMenuPageNotFoundError",
  "BoardNotFoundError",
  "BoardProjectTypeNotFoundError",
  "BoardSavedViewNotFoundError",
  "BoardStatusNotFoundError",
  "BoardTaskTypeNotFoundError",
  "BoardViewletNotFoundError",
  "CardCommentNotFoundError",
  "CardNotFoundError",
  "CardSpaceNotFoundError",
  "ChannelNotFoundError",
  "ChatMessageAttachmentNotFoundError",
  "ClassCollaboratorMetadataNotFoundError",
  "CollaboratorFieldNotFoundError",
  "CommentNotFoundError",
  "ComponentNotFoundError",
  "ContactChannelNotFoundError",
  "CustomFieldNotFoundError",
  "CustomFieldObjectNotFoundError",
  "DirectMessageNotFoundError",
  "DocumentNotFoundError",
  "DocumentTextNotFoundError",
  "DrawingNotFoundError",
  "DriveFileCommentNotFoundError",
  "DriveFileNotFoundError",
  "DriveFileVersionNotFoundError",
  "DriveNotFoundError",
  "DrivePathNotFoundError",
  "EventNotFoundError",
  "FileNotFoundError",
  "FilteredViewNotFoundError",
  "FloorNotFoundError",
  "FunnelNotFoundError",
  "GenericObjectNotFoundError",
  "HulyAttributeNotFoundError",
  "HulyClassNotFoundError",
  "HulyEnumNotFoundError",
  "InventoryCategoryNotFoundError",
  "InventoryProductCommentNotFoundError",
  "InventoryProductNotFoundError",
  "InventoryVariantNotFoundError",
  "IssueNotFoundError",
  "IssueTemplateNotFoundError",
  "LeadNotFoundError",
  "MasterTagNotFoundError",
  "MeetingMinutesNotFoundError",
  "MessageNotFoundError",
  "MessageTemplateCategoryNotFoundError",
  "MessageTemplateNotFoundError",
  "MilestoneNotFoundError",
  "ModelClassNotFoundError",
  "NotificationContextNotFoundError",
  "NotificationNotFoundError",
  "NotificationPersonSpaceNotFoundError",
  "NotificationProviderNotFoundError",
  "NotificationTypeNotFoundError",
  "OrganizationNotFoundError",
  "PermissionNotFoundError",
  "PersonNotFoundError",
  "ProcessCardNotFoundError",
  "ProcessExecutionNotFoundError",
  "ProcessInitialStateNotFoundError",
  "ProcessMasterTagNotFoundError",
  "ProcessNotFoundError",
  "ProjectNotFoundError",
  "ReactionNotFoundError",
  "RecruitingApplicantMatchNotFoundError",
  "RecruitingApplicantNotFoundError",
  "RecruitingAttachmentNotFoundError",
  "RecruitingCandidateNotFoundError",
  "RecruitingCommentNotFoundError",
  "RecruitingOpinionNotFoundError",
  "RecruitingReviewNotFoundError",
  "RecruitingVacancyNotFoundError",
  "RecruitingVacancyTypeNotFoundError",
  "RecurringEventNotFoundError",
  "RelationNotFoundError",
  "RoomNotFoundError",
  "SavedAttachmentNotFoundError",
  "SavedMessageNotFoundError",
  "ScheduleNotFoundError",
  "SequenceNotFoundError",
  "SpaceNotFoundError",
  "SpaceRoleNotFoundError",
  "SpaceTypeNotFoundError",
  "TagCategoryNotFoundError",
  "TagNotFoundError",
  "TeamspaceNotFoundError",
  "TemplateChildNotFoundError",
  "TemplateFieldCategoryNotFoundError",
  "TestCaseNotFoundError",
  "TestPlanItemNotFoundError",
  "TestPlanNotFoundError",
  "TestProjectNotFoundError",
  "TestResultNotFoundError",
  "TestRunNotFoundError",
  "TestSuiteNotFoundError",
  "ThreadReplyNotFoundError",
  "TodoNotFoundError",
  "TodoWorkSlotNotFoundError",
  "ViewletNotFoundError",
  "WorkflowAttributeNotFoundError",
  "WorkflowStatusCategoryNotFoundError",
  "WorkflowStatusNotFoundError"
] as const satisfies ReadonlyArray<HulyDomainError["_tag"]>
const LOOKUP_TAGS = tags(LOOKUP_TAG_VALUES)

const INTEGRATION_TAG_VALUES = [
  "ActivityRecordInvalidError",
  "BoardModelSequenceMissingError",
  "BoardMutationUnsupportedError",
  "FileFetchError",
  "FileUploadError",
  "HulyConnectionError",
  "HulyError",
  "HulyModelMetadataError",
  "HulyStorageConfigError",
  "HulyUnavailableError",
  "NotificationProviderNotConfigurableError",
  "PermissionKindUnsupportedError",
  "PlannerSchedulingPrerequisiteError",
  "ProcessExecutionNotCancellableError",
  "SpaceRoleAssignmentsMalformedError",
  "SpaceRoleWriteUnsupportedError",
  "WorkflowAttributeUnsupportedError",
  "WorkflowRelationshipInvalidError"
] as const satisfies ReadonlyArray<HulyDomainError["_tag"]>

type ClassifiedDomainTag =
  | (typeof AMBIGUITY_TAG_VALUES)[number]
  | (typeof AUTHORIZATION_TAG_VALUES)[number]
  | (typeof CONFLICT_TAG_VALUES)[number]
  | (typeof INVALID_PARAMS_DOMAIN_ERROR_TAGS)[number]
  | (typeof INTEGRATION_TAG_VALUES)[number]
  | (typeof LOOKUP_TAG_VALUES)[number]
  | "HulyAuthError"

type UnclassifiedDomainTag = Exclude<HulyDomainError["_tag"], ClassifiedDomainTag>

export const unclassifiedDomainFailureTags: Record<UnclassifiedDomainTag, never> = {}

export const classifyDomainFailure = (error: HulyDomainError): DomainFailureKind => {
  if (error._tag === "HulyAuthError") return "authentication"
  if (AUTHORIZATION_TAGS.has(error._tag)) return "authorization"
  if (AMBIGUITY_TAGS.has(error._tag)) return "ambiguity"
  if (CONFLICT_TAGS.has(error._tag)) return "conflict"
  if (LOOKUP_TAGS.has(error._tag)) return "lookup"
  return isInvalidParamsDomainError(error) ? "input" : "integration"
}
