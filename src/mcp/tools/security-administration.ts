import {
  CreateHulyPermissionResultSchema,
  CreateSpaceRoleResultSchema,
  createHulyPermissionParamsJsonSchema,
  createSpaceRoleParamsJsonSchema,
  DeleteClassCollaboratorMetadataResultSchema,
  DeleteHulyPermissionResultSchema,
  deleteClassCollaboratorMetadataParamsJsonSchema,
  deleteHulyPermissionParamsJsonSchema,
  GetClassCollaboratorMetadataResultSchema,
  getClassCollaboratorMetadataParamsJsonSchema,
  parseCreateHulyPermissionParams,
  parseCreateSpaceRoleParams,
  parseDeleteClassCollaboratorMetadataParams,
  parseDeleteHulyPermissionParams,
  parseGetClassCollaboratorMetadataParams,
  parseSetClassCollaboratorMetadataParams,
  parseSetSpaceRolePermissionsParams,
  parseUpdateHulyPermissionParams,
  SetClassCollaboratorMetadataResultSchema,
  SetSpaceRolePermissionsResultSchema,
  setClassCollaboratorMetadataParamsJsonSchema,
  setSpaceRolePermissionsParamsJsonSchema,
  UpdateHulyPermissionResultSchema,
  updateHulyPermissionParamsJsonSchema
} from "../../domain/schemas/security-administration.js"
import {
  createHulyPermission,
  deleteHulyPermission,
  updateHulyPermission
} from "../../huly/operations/security-administration.js"
import {
  deleteClassCollaboratorMetadata,
  getClassCollaboratorMetadata,
  setClassCollaboratorMetadata
} from "../../huly/operations/class-collaborator-metadata.js"
import { createSpaceRole, setSpaceRolePermissions } from "../../huly/operations/security-role-writes.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "security-administration" as const
const SECURITY_WRITE_GUARD =
  "This changes workspace access-control metadata. confirm=true is required so an agent cannot mutate security configuration accidentally."

export const securityAdministrationTools = [
  defineTool(
    {
      name: "create_huly_permission",
      description: `Create a base Huly Permission with a clear human label and optional class/transaction constraints. Class accepts an exact class ID, tail name, or label. Exact labels are idempotent only when the full definition matches. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: createHulyPermissionParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateHulyPermissionResultSchema
    },
    parseCreateHulyPermissionParams,
    createHulyPermission
  ),
  defineTool(
    {
      name: "update_huly_permission",
      description: `Update a custom Huly Permission resolved by exact ID or exact label. Namespaced built-in permissions are protected. Label/description changes are allowed on unreferenced custom permissions; semantic changes are refused while referenced by a role or SpaceType descriptor. Null clears optional constraints. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: updateHulyPermissionParamsJsonSchema,
      resultSchema: UpdateHulyPermissionResultSchema
    },
    parseUpdateHulyPermissionParams,
    updateHulyPermission
  ),
  defineTool(
    {
      name: "delete_huly_permission",
      description: `Permanently delete a custom Huly Permission resolved by exact ID or exact label. Namespaced built-ins are protected, and referenced permissions are refused loudly. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: deleteHulyPermissionParamsJsonSchema,
      resultSchema: DeleteHulyPermissionResultSchema
    },
    parseDeleteHulyPermissionParams,
    deleteHulyPermission
  ),
  defineTool(
    {
      name: "create_space_role",
      description: `Create a Huly role definition using a SpaceType ID or exact name and permission ID or exact label values. The call creates both the attached Role and required typed-space assignment attribute, compensating if the second write fails. Workspace-scoped permissions are restricted to the stable all-spaces SpaceType. Existing exact role names are idempotent only when permission sets match. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: createSpaceRoleParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: CreateSpaceRoleResultSchema
    },
    parseCreateSpaceRoleParams,
    createSpaceRole
  ),
  defineTool(
    {
      name: "set_space_role_permissions",
      description: `Replace one existing role definition's permission set. SpaceType accepts an ID or exact name, role accepts an ID or exact name scoped to that SpaceType, and each permission accepts an ID or exact label. Pass permissions=[] to clear the role. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: setSpaceRolePermissionsParamsJsonSchema,
      resultSchema: SetSpaceRolePermissionsResultSchema
    },
    parseSetSpaceRolePermissionsParams,
    setSpaceRolePermissions
  ),
  defineTool(
    {
      name: "get_class_collaborator_metadata",
      description:
        "Get the direct core ClassCollaborators metadata for a Huly class resolved by class ID, tail name, or label. Returns configured=false when the class inherits defaults or has no direct record.",
      category: CATEGORY,
      inputSchema: getClassCollaboratorMetadataParamsJsonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: GetClassCollaboratorMetadataResultSchema
    },
    parseGetClassCollaboratorMetadataParams,
    getClassCollaboratorMetadata
  ),
  defineTool(
    {
      name: "set_class_collaborator_metadata",
      description: `Create or replace direct core ClassCollaborators metadata for a class resolved by class ID, tail name, or label. fieldSelection supports all person-like fields, no fields, or exact property names validated against the class and its ancestors. Security propagation flags are normalized explicitly. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: setClassCollaboratorMetadataParamsJsonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      resultSchema: SetClassCollaboratorMetadataResultSchema
    },
    parseSetClassCollaboratorMetadataParams,
    setClassCollaboratorMetadata
  ),
  defineTool(
    {
      name: "delete_class_collaborator_metadata",
      description: `Permanently delete the direct core ClassCollaborators metadata record for a class resolved by ID, tail name, or label. Inherited metadata is never selected or deleted. ${SECURITY_WRITE_GUARD}`,
      category: CATEGORY,
      inputSchema: deleteClassCollaboratorMetadataParamsJsonSchema,
      resultSchema: DeleteClassCollaboratorMetadataResultSchema
    },
    parseDeleteClassCollaboratorMetadataParams,
    deleteClassCollaboratorMetadata
  )
] as const satisfies ReadonlyArray<RegisteredTool>
