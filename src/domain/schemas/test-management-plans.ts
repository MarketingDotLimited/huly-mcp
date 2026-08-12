import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  enumValuesDescription,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  NonEmptyString,
  TestCaseIdentifier,
  TestPlanId,
  TestPlanIdentifier,
  TestPlanItemId,
  TestPlanItemId as TestPlanItemIdSchema,
  TestProjectIdentifier,
  TestResultId,
  TestResultIdentifier,
  TestRunId,
  TestRunIdentifier,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

import { TestRunStatusSchema, TestRunStatusValues } from "./test-management-core.js"

const projectField = TestProjectIdentifier.annotate({ description: "Test project ID or name" })
const limitField = LimitParam.annotate({ description: `Max items to return (default: ${DEFAULT_LIMIT})` })
const planField = TestPlanIdentifier.annotate({ description: "Test plan ID or name" })
const runField = TestRunIdentifier.annotate({ description: "Test run ID or name" })
const resultField = TestResultIdentifier.annotate({ description: "Test result ID or name" })
const nameField = NonEmptyString.annotate({ description: "Name" })
const descField = Schema.String.annotate({
  description: `Description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
})
const descNullField = Schema.NullOr(Schema.String).annotate({
  description: `Description in markdown, or null to clear. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
})
const assigneeField = NonEmptyString.annotate({ description: "Assignee email or name" })
export const TestPlanSummarySchema = Schema.Struct({ id: TestPlanId, name: Schema.String })
export type TestPlanSummary = Schema.Schema.Type<typeof TestPlanSummarySchema>
export const TestPlanItemSummarySchema = Schema.Struct({
  id: TestPlanItemId,
  testCase: Schema.String,
  testSuite: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String)
})
export type TestPlanItemSummary = Schema.Schema.Type<typeof TestPlanItemSummarySchema>
export const TestRunSummarySchema = Schema.Struct({
  id: TestRunId,
  name: Schema.String,
  dueDate: Schema.optional(Schema.Number)
})
export type TestRunSummary = Schema.Schema.Type<typeof TestRunSummarySchema>
export const TestResultSummarySchema = Schema.Struct({
  id: TestResultId,
  name: Schema.String,
  testCase: Schema.String,
  status: Schema.optional(TestRunStatusSchema),
  assignee: Schema.optional(Schema.String)
})
export type TestResultSummary = Schema.Schema.Type<typeof TestResultSummarySchema>

export const ListTestPlansParamsSchema = Schema.Struct({
  project: projectField,
  limit: Schema.optional(limitField)
}).annotate({ title: "ListTestPlansParams", description: "List test plans in a project" })
export type ListTestPlansParams = Schema.Schema.Type<typeof ListTestPlansParamsSchema>
export const ListTestPlansResultSchema = Schema.Struct({ plans: Schema.Array(TestPlanSummarySchema), total: ListTotal })
export type ListTestPlansResult = Schema.Schema.Type<typeof ListTestPlansResultSchema>

export const GetTestPlanParamsSchema = Schema.Struct({ project: projectField, plan: planField }).annotate({
  title: "GetTestPlanParams",
  description: "Get test plan details including items"
})
export type GetTestPlanParams = Schema.Schema.Type<typeof GetTestPlanParamsSchema>
export const GetTestPlanResultSchema = Schema.Struct({
  id: TestPlanId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  items: Schema.Array(TestPlanItemSummarySchema)
})
export type GetTestPlanResult = Schema.Schema.Type<typeof GetTestPlanResultSchema>

export const CreateTestPlanParamsSchema = Schema.Struct({
  project: projectField,
  name: nameField,
  description: Schema.optional(descField)
}).annotate({ title: "CreateTestPlanParams", description: "Create a test plan" })
export type CreateTestPlanParams = Schema.Schema.Type<typeof CreateTestPlanParamsSchema>
export const CreateTestPlanResultSchema = Schema.Struct({
  id: TestPlanId,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateTestPlanResult = Schema.Schema.Type<typeof CreateTestPlanResultSchema>

export const UPDATE_TEST_PLAN_FIELDS = ["name", "description"] as const satisfies ReadonlyArray<"name" | "description">

export const UpdateTestPlanParamsSchema = Schema.Struct({
  project: projectField,
  plan: planField,
  name: Schema.optional(nameField),
  description: Schema.optional(descNullField)
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_TEST_PLAN_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_TEST_PLAN_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateTestPlanParams",
    description: `Update a test plan. ${atLeastOneUpdateFieldMessage(UPDATE_TEST_PLAN_FIELDS)}`
  })
export type UpdateTestPlanParams = Schema.Schema.Type<typeof UpdateTestPlanParamsSchema>
assertUpdateFields<UpdateTestPlanParams>()(["project", "plan"], UPDATE_TEST_PLAN_FIELDS)
export const UpdateTestPlanResultSchema = Schema.Struct({ id: TestPlanId, updated: Schema.Boolean })
export type UpdateTestPlanResult = Schema.Schema.Type<typeof UpdateTestPlanResultSchema>

export const DeleteTestPlanParamsSchema = Schema.Struct({ project: projectField, plan: planField }).annotate({
  title: "DeleteTestPlanParams",
  description: "Delete a test plan"
})
export type DeleteTestPlanParams = Schema.Schema.Type<typeof DeleteTestPlanParamsSchema>
export const DeleteTestPlanResultSchema = Schema.Struct({ id: TestPlanId, deleted: Schema.Boolean })
export type DeleteTestPlanResult = Schema.Schema.Type<typeof DeleteTestPlanResultSchema>

export const AddTestPlanItemParamsSchema = Schema.Struct({
  project: projectField,
  plan: planField,
  testCase: TestCaseIdentifier.annotate({ description: "Test case ID or name to add" }),
  assignee: Schema.optional(assigneeField)
}).annotate({ title: "AddTestPlanItemParams", description: "Add a test case to a test plan" })
export type AddTestPlanItemParams = Schema.Schema.Type<typeof AddTestPlanItemParamsSchema>
export const AddTestPlanItemResultSchema = Schema.Struct({ id: TestPlanItemId, added: Schema.Boolean })
export type AddTestPlanItemResult = Schema.Schema.Type<typeof AddTestPlanItemResultSchema>

export const RemoveTestPlanItemParamsSchema = Schema.Struct({
  project: projectField,
  plan: planField,
  item: TestPlanItemIdSchema.annotate({ description: "Test plan item ID to remove" })
}).annotate({ title: "RemoveTestPlanItemParams", description: "Remove a test case from a test plan" })
export type RemoveTestPlanItemParams = Schema.Schema.Type<typeof RemoveTestPlanItemParamsSchema>
export const RemoveTestPlanItemResultSchema = Schema.Struct({ id: TestPlanItemId, removed: Schema.Boolean })
export type RemoveTestPlanItemResult = Schema.Schema.Type<typeof RemoveTestPlanItemResultSchema>

export const ListTestRunsParamsSchema = Schema.Struct({
  project: projectField,
  limit: Schema.optional(limitField)
}).annotate({ title: "ListTestRunsParams", description: "List test runs in a project" })
export type ListTestRunsParams = Schema.Schema.Type<typeof ListTestRunsParamsSchema>
export const ListTestRunsResultSchema = Schema.Struct({ runs: Schema.Array(TestRunSummarySchema), total: ListTotal })
export type ListTestRunsResult = Schema.Schema.Type<typeof ListTestRunsResultSchema>

export const GetTestRunParamsSchema = Schema.Struct({ project: projectField, run: runField }).annotate({
  title: "GetTestRunParams",
  description: "Get test run details including results"
})
export type GetTestRunParams = Schema.Schema.Type<typeof GetTestRunParamsSchema>
export const GetTestRunResultSchema = Schema.Struct({
  id: TestRunId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.Number),
  results: Schema.Array(TestResultSummarySchema)
})
export type GetTestRunResult = Schema.Schema.Type<typeof GetTestRunResultSchema>

const dueDateField = Timestamp.annotate({ description: "Due date as Unix timestamp in milliseconds" })

export const CreateTestRunParamsSchema = Schema.Struct({
  project: projectField,
  name: nameField,
  description: Schema.optional(descField),
  dueDate: Schema.optional(dueDateField)
}).annotate({ title: "CreateTestRunParams", description: "Create a test run" })
export type CreateTestRunParams = Schema.Schema.Type<typeof CreateTestRunParamsSchema>
export const CreateTestRunResultSchema = Schema.Struct({ id: TestRunId, name: Schema.String, created: Schema.Boolean })
export type CreateTestRunResult = Schema.Schema.Type<typeof CreateTestRunResultSchema>

export const UPDATE_TEST_RUN_FIELDS = ["name", "description", "dueDate"] as const satisfies ReadonlyArray<
  "name" | "description" | "dueDate"
>

export const UpdateTestRunParamsSchema = Schema.Struct({
  project: projectField,
  run: runField,
  name: Schema.optional(nameField),
  description: Schema.optional(descNullField),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotate({ description: "Due date (ms timestamp), or null to clear" })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_TEST_RUN_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_TEST_RUN_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateTestRunParams",
    description: `Update a test run. ${atLeastOneUpdateFieldMessage(UPDATE_TEST_RUN_FIELDS)}`
  })
export type UpdateTestRunParams = Schema.Schema.Type<typeof UpdateTestRunParamsSchema>
assertUpdateFields<UpdateTestRunParams>()(["project", "run"], UPDATE_TEST_RUN_FIELDS)
export const UpdateTestRunResultSchema = Schema.Struct({ id: TestRunId, updated: Schema.Boolean })
export type UpdateTestRunResult = Schema.Schema.Type<typeof UpdateTestRunResultSchema>

export const DeleteTestRunParamsSchema = Schema.Struct({ project: projectField, run: runField }).annotate({
  title: "DeleteTestRunParams",
  description: "Delete a test run"
})
export type DeleteTestRunParams = Schema.Schema.Type<typeof DeleteTestRunParamsSchema>
export const DeleteTestRunResultSchema = Schema.Struct({ id: TestRunId, deleted: Schema.Boolean })
export type DeleteTestRunResult = Schema.Schema.Type<typeof DeleteTestRunResultSchema>

export const ListTestResultsParamsSchema = Schema.Struct({
  project: projectField,
  run: runField,
  limit: Schema.optional(limitField)
}).annotate({ title: "ListTestResultsParams", description: "List test results in a run" })
export type ListTestResultsParams = Schema.Schema.Type<typeof ListTestResultsParamsSchema>
export const ListTestResultsResultSchema = Schema.Struct({
  results: Schema.Array(TestResultSummarySchema),
  total: ListTotal
})
export type ListTestResultsResult = Schema.Schema.Type<typeof ListTestResultsResultSchema>

export const GetTestResultParamsSchema = Schema.Struct({ project: projectField, result: resultField }).annotate({
  title: "GetTestResultParams",
  description: "Get test result details"
})
export type GetTestResultParams = Schema.Schema.Type<typeof GetTestResultParamsSchema>
export const GetTestResultDetailSchema = Schema.Struct({
  id: TestResultId,
  name: Schema.String,
  testCase: Schema.String,
  testSuite: Schema.optional(Schema.String),
  status: Schema.optional(TestRunStatusSchema),
  assignee: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String)
})
export type GetTestResultDetail = Schema.Schema.Type<typeof GetTestResultDetailSchema>

const statusField = TestRunStatusSchema.annotate({
  description: `Status: ${enumValuesDescription(TestRunStatusValues)}`
})

export const CreateTestResultParamsSchema = Schema.Struct({
  project: projectField,
  run: runField,
  testCase: TestCaseIdentifier.annotate({ description: "Test case ID or name" }),
  name: Schema.optional(NonEmptyString.annotate({ description: "Result name. Omit to use the test case name." })),
  status: Schema.optional(statusField),
  assignee: Schema.optional(assigneeField)
}).annotate({ title: "CreateTestResultParams", description: "Create a test result in a run" })
export type CreateTestResultParams = Schema.Schema.Type<typeof CreateTestResultParamsSchema>
export const CreateTestResultResultSchema = Schema.Struct({
  id: TestResultId,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateTestResultResult = Schema.Schema.Type<typeof CreateTestResultResultSchema>

export const UPDATE_TEST_RESULT_FIELDS = ["status", "assignee", "description"] as const satisfies ReadonlyArray<
  "status" | "assignee" | "description"
>

export const UpdateTestResultParamsSchema = Schema.Struct({
  project: projectField,
  result: resultField,
  status: Schema.optional(statusField),
  assignee: Schema.optional(
    Schema.NullOr(NonEmptyString).annotate({ description: "Assignee email or name, or null to unassign" })
  ),
  description: Schema.optional(descNullField)
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_TEST_RESULT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_TEST_RESULT_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateTestResultParams",
    description: `Update a test result. ${atLeastOneUpdateFieldMessage(UPDATE_TEST_RESULT_FIELDS)}`
  })
export type UpdateTestResultParams = Schema.Schema.Type<typeof UpdateTestResultParamsSchema>
assertUpdateFields<UpdateTestResultParams>()(["project", "result"], UPDATE_TEST_RESULT_FIELDS)
export const UpdateTestResultResultSchema = Schema.Struct({ id: TestResultId, updated: Schema.Boolean })
export type UpdateTestResultResult = Schema.Schema.Type<typeof UpdateTestResultResultSchema>

export const DeleteTestResultParamsSchema = Schema.Struct({ project: projectField, result: resultField }).annotate({
  title: "DeleteTestResultParams",
  description: "Delete a test result"
})
export type DeleteTestResultParams = Schema.Schema.Type<typeof DeleteTestResultParamsSchema>
export const DeleteTestResultResultSchema = Schema.Struct({ id: TestResultId, deleted: Schema.Boolean })
export type DeleteTestResultResult = Schema.Schema.Type<typeof DeleteTestResultResultSchema>

export const RunTestPlanParamsSchema = Schema.Struct({
  project: projectField,
  plan: planField,
  runName: Schema.optional(NonEmptyString.annotate({ description: "Name for the created test run" })),
  dueDate: Schema.optional(dueDateField)
}).annotate({ title: "RunTestPlanParams", description: "Execute a test plan by creating a run with results" })
export type RunTestPlanParams = Schema.Schema.Type<typeof RunTestPlanParamsSchema>
export const RunTestPlanResultSchema = Schema.Struct({ runId: TestRunId, name: Schema.String, resultsCreated: Count })
export type RunTestPlanResult = Schema.Schema.Type<typeof RunTestPlanResultSchema>

export const listTestPlansParamsJsonSchema = toDraft07JsonSchema(ListTestPlansParamsSchema)
export const getTestPlanParamsJsonSchema = toDraft07JsonSchema(GetTestPlanParamsSchema)
export const createTestPlanParamsJsonSchema = toDraft07JsonSchema(CreateTestPlanParamsSchema)
export const updateTestPlanParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateTestPlanParamsSchema),
  UPDATE_TEST_PLAN_FIELDS
)
export const deleteTestPlanParamsJsonSchema = toDraft07JsonSchema(DeleteTestPlanParamsSchema)
export const addTestPlanItemParamsJsonSchema = toDraft07JsonSchema(AddTestPlanItemParamsSchema)
export const removeTestPlanItemParamsJsonSchema = toDraft07JsonSchema(RemoveTestPlanItemParamsSchema)
export const listTestRunsParamsJsonSchema = toDraft07JsonSchema(ListTestRunsParamsSchema)
export const getTestRunParamsJsonSchema = toDraft07JsonSchema(GetTestRunParamsSchema)
export const createTestRunParamsJsonSchema = toDraft07JsonSchema(CreateTestRunParamsSchema)
export const updateTestRunParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateTestRunParamsSchema),
  UPDATE_TEST_RUN_FIELDS
)
export const deleteTestRunParamsJsonSchema = toDraft07JsonSchema(DeleteTestRunParamsSchema)
export const listTestResultsParamsJsonSchema = toDraft07JsonSchema(ListTestResultsParamsSchema)
export const getTestResultParamsJsonSchema = toDraft07JsonSchema(GetTestResultParamsSchema)
export const createTestResultParamsJsonSchema = toDraft07JsonSchema(CreateTestResultParamsSchema)
export const updateTestResultParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateTestResultParamsSchema),
  UPDATE_TEST_RESULT_FIELDS
)
export const deleteTestResultParamsJsonSchema = toDraft07JsonSchema(DeleteTestResultParamsSchema)
export const runTestPlanParamsJsonSchema = toDraft07JsonSchema(RunTestPlanParamsSchema)

export const parseListTestPlansParams = Schema.decodeUnknownEffect(ListTestPlansParamsSchema)
export const parseGetTestPlanParams = Schema.decodeUnknownEffect(GetTestPlanParamsSchema)
export const parseCreateTestPlanParams = Schema.decodeUnknownEffect(CreateTestPlanParamsSchema)
export const parseUpdateTestPlanParams = Schema.decodeUnknownEffect(UpdateTestPlanParamsSchema)
export const parseDeleteTestPlanParams = Schema.decodeUnknownEffect(DeleteTestPlanParamsSchema)
export const parseAddTestPlanItemParams = Schema.decodeUnknownEffect(AddTestPlanItemParamsSchema)
export const parseRemoveTestPlanItemParams = Schema.decodeUnknownEffect(RemoveTestPlanItemParamsSchema)
export const parseListTestRunsParams = Schema.decodeUnknownEffect(ListTestRunsParamsSchema)
export const parseGetTestRunParams = Schema.decodeUnknownEffect(GetTestRunParamsSchema)
export const parseCreateTestRunParams = Schema.decodeUnknownEffect(CreateTestRunParamsSchema)
export const parseUpdateTestRunParams = Schema.decodeUnknownEffect(UpdateTestRunParamsSchema)
export const parseDeleteTestRunParams = Schema.decodeUnknownEffect(DeleteTestRunParamsSchema)
export const parseListTestResultsParams = Schema.decodeUnknownEffect(ListTestResultsParamsSchema)
export const parseGetTestResultParams = Schema.decodeUnknownEffect(GetTestResultParamsSchema)
export const parseCreateTestResultParams = Schema.decodeUnknownEffect(CreateTestResultParamsSchema)
export const parseUpdateTestResultParams = Schema.decodeUnknownEffect(UpdateTestResultParamsSchema)
export const parseDeleteTestResultParams = Schema.decodeUnknownEffect(DeleteTestResultParamsSchema)
export const parseRunTestPlanParams = Schema.decodeUnknownEffect(RunTestPlanParamsSchema)

export const GetTestResultResultSchema = GetTestResultDetailSchema
