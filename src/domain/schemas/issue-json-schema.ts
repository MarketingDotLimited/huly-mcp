export const withListIssueCrossFieldConstraints = (schema: object): object => ({
  ...schema,
  allOf: [
    { not: { required: ["titleSearch", "titleRegex"] } },
    { not: { required: ["assignee", "hasAssignee"] } },
    { not: { required: ["component", "hasComponent"] } },
    { not: { required: ["parentIssue", "isTopLevel"], properties: { isTopLevel: { const: true } } } }
  ]
})
