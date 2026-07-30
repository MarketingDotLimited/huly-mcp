import {
  createLeadParamsJsonSchema,
  CreateLeadResultSchema,
  getLeadParamsJsonSchema,
  GetLeadResultSchema,
  listFunnelsParamsJsonSchema,
  ListFunnelsResultSchema,
  listLeadsParamsJsonSchema,
  ListLeadsResultSchema,
  parseCreateLeadParams,
  parseGetLeadParams,
  parseListFunnelsParams,
  parseListLeadsParams
} from "../../domain/schemas/leads.js"
import { createLead } from "../../huly/operations/leads-create.js"
import { getLead, listFunnels, listLeads } from "../../huly/operations/leads.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "leads" as const

export const leadTools = [
  defineTool(
    {
      name: "list_funnels",
      description:
        "List all Huly sales funnels (lead pipelines). Returns each funnel's stable ID and display name, sorted by name. Supports filtering by archived status.",
      category: CATEGORY,
      inputSchema: listFunnelsParamsJsonSchema,
      resultSchema: ListFunnelsResultSchema
    },
    parseListFunnelsParams,
    listFunnels
  ),
  defineTool(
    {
      name: "list_leads",
      description:
        "Query Huly leads in a funnel with optional filters. Pass the funnel ID returned by list_funnels, or a funnel name for convenience lookup. Returns leads sorted by modification date (newest first). Supports filtering by status, assignee, and title search.",
      category: CATEGORY,
      inputSchema: listLeadsParamsJsonSchema,
      resultSchema: ListLeadsResultSchema
    },
    parseListLeadsParams,
    listLeads
  ),
  defineTool(
    {
      name: "get_lead",
      description:
        "Retrieve full details for a Huly lead including markdown description, customer name, funnel ID and funnel name, and status. Lead identifiers follow the upstream Huly format like 'LEAD-1'.",
      category: CATEGORY,
      inputSchema: getLeadParamsJsonSchema,
      resultSchema: GetLeadResultSchema
    },
    parseGetLeadParams,
    getLead
  ),
  defineTool(
    {
      name: "create_lead",
      description:
        "Create one native Huly lead in an active funnel for an existing person or organization. Resolve the funnel by ID or exact name; identify the customer explicitly as person or organization; optionally choose an employee assignee, Lead-compatible task type, exact workflow status, and Markdown description. Automatically applies the Customer mixin when needed, preserves native Huly references, and returns both leadId and LEAD-<number>. This tool never creates a person or organization inline.",
      category: CATEGORY,
      inputSchema: createLeadParamsJsonSchema,
      resultSchema: CreateLeadResultSchema
    },
    parseCreateLeadParams,
    createLead
  )
] as const satisfies ReadonlyArray<RegisteredTool>
