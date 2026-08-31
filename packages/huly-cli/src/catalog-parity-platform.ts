import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const parityPlatformCliCommandCatalog = {
  create_association: {
    path: ["associations", "create"],
    positional: ["sourceClass", "targetClass", "sourceRole", "targetRole", "cardinality"],
    description: "Create a generic association definition"
  },
  create_relation: {
    path: ["relations", "create"],
    positional: ["association"],
    description: "Create a relation; pass --source and --target as JSON"
  },
  delete_association: {
    path: ["associations", "delete"],
    positional: ["association"],
    description: "Delete an unused association definition",
    behavior: { confirmation: { type: "requires-yes", message: "associations delete requires --yes." } }
  },
  delete_relation: {
    path: ["relations", "delete"],
    positional: [],
    description: "Delete a relation by ID or exact structured endpoints",
    behavior: { confirmation: { type: "requires-yes", message: "relations delete requires --yes." } }
  },
  set_custom_field: {
    path: ["objects", "custom-fields", "set"],
    positional: ["objectId", "objectClass", "fieldId", "value"],
    description: "Set a custom field on a raw Huly object"
  },
  cancel_execution: {
    path: ["processes", "executions", "cancel"],
    positional: ["execution"],
    description: "Cancel an active process execution"
  },
  start_process: {
    path: ["processes", "start"],
    positional: ["process", "card"],
    description: "Start a process on a card or document"
  },
  describe_huly_space_type_capabilities: {
    path: ["model", "space-types", "capabilities", "describe"],
    positional: ["spaceType"],
    description: "Describe a Huly space type's model capabilities"
  },
  describe_huly_package_viability: {
    path: ["model", "packages", "viability"],
    positional: [],
    description: "Describe Huly package availability and discovery readiness"
  },
  get_huly_class: {
    path: ["model", "classes", "get"],
    positional: ["class"],
    description: "Get a Huly model class and its attributes"
  },
  list_huly_attributes: {
    path: ["model", "attributes", "list"],
    positional: [],
    description: "List Huly model attributes"
  },
  list_huly_classes: {
    path: ["model", "classes", "list"],
    positional: [],
    description: "List Huly model classes, interfaces, and mixins"
  },
  list_huly_domain_index_configurations: {
    path: ["model", "domain-indexes", "list"],
    positional: [],
    description: "List Huly domain index configurations"
  },
  list_huly_enums: { path: ["model", "enums", "list"], positional: [], description: "List Huly model enums" },
  list_huly_plugin_configurations: {
    path: ["model", "plugins", "list"],
    positional: [],
    description: "List Huly plugin configurations"
  },
  list_huly_sequences: {
    path: ["model", "sequences", "list"],
    positional: [],
    description: "List Huly model sequences"
  },
  create_access_link: {
    path: ["workspace", "access-links", "create"],
    positional: [],
    description: "Create a workspace access link"
  },
  create_workspace: { path: ["workspace", "create"], positional: ["name"], description: "Create a workspace" },
  delete_workspace: { path: ["workspace", "delete"], positional: [], description: "Delete the configured workspace" },
  update_guest_settings: {
    path: ["workspace", "guest-settings", "update"],
    positional: [],
    description: "Update workspace guest access settings"
  },
  update_member_role: {
    path: ["workspace", "members", "role", "update"],
    positional: ["accountId", "role"],
    description: "Update a workspace member role"
  },
  update_user_profile: {
    path: ["workspace", "profile", "update"],
    positional: [],
    description: "Update the current user's profile; pass null to clear nullable fields"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
