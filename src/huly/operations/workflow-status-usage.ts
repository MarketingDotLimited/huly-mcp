import type { Status, StatusCategory } from "@hcengineering/core"
import type { ProjectType, Task, TaskType } from "@hcengineering/task"
import { Effect } from "effect"

import { DocId, ProjectTypeId, StatusCategoryId, TaskTypeId } from "../../domain/schemas/shared.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import type { WorkflowStatusReference } from "../errors-workflow-statuses.js"
import { task } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"

const normalized = (value: string): string => value.toLocaleLowerCase()

const categoryDefaultReferences = (
  categories: ReadonlyArray<StatusCategory>,
  status: Status
): ReadonlyArray<WorkflowStatusReference> =>
  categories
    .filter(
      (category) =>
        category.ofAttribute === status.ofAttribute &&
        normalized(category.defaultStatusName) === normalized(status.name)
    )
    .map((category) => ({ kind: "status-category-default", categoryId: StatusCategoryId.make(category._id) }))

const projectTypeReferences = (
  projectTypes: ReadonlyArray<ProjectType>,
  status: Status
): ReadonlyArray<WorkflowStatusReference> =>
  projectTypes
    .filter((projectType) => projectType.statuses.some((entry) => entry._id === status._id))
    .map((projectType) => ({ kind: "project-type", projectTypeId: ProjectTypeId.make(projectType._id) }))

const taskTypeReferences = (
  taskTypes: ReadonlyArray<TaskType>,
  status: Status
): ReadonlyArray<WorkflowStatusReference> =>
  taskTypes
    .filter((taskType) => taskType.statuses.includes(status._id))
    .map((taskType) => ({ kind: "task-type", taskTypeId: TaskTypeId.make(taskType._id) }))

const taskReference = (entry: Task): WorkflowStatusReference => ({ kind: "task", taskId: DocId.make(entry._id) })

export const loadWorkflowStatusReferences = (
  client: HulyClientOperations,
  categories: ReadonlyArray<StatusCategory>,
  status: Status
): Effect.Effect<ReadonlyArray<WorkflowStatusReference>, HulyClientError> =>
  Effect.gen(function* () {
    const [projectTypes, taskTypes, tasks] = yield* Effect.all([
      client.findAll<ProjectType>(task.class.ProjectType, hulyQuery<ProjectType>({})),
      client.findAll<TaskType>(task.class.TaskType, hulyQuery<TaskType>({})),
      client.findAll<Task>(task.class.Task, hulyQuery<Task>({ status: status._id }), { limit: 10 })
    ])

    return [
      ...categoryDefaultReferences(categories, status),
      ...projectTypeReferences(projectTypes, status),
      ...taskTypeReferences(taskTypes, status),
      ...tasks.map(taskReference)
    ]
  })
