/**
 * Planner / ToDo domain errors.
 *
 * @module
 */
import { Schema } from "effect"

export class TodoNotFoundError extends Schema.TaggedError<TodoNotFoundError>()("TodoNotFoundError", {
  locator: Schema.String
}) {
  override get message(): string {
    return `Planner ToDo not found for locator: ${this.locator}`
  }
}

export class TodoIdentifierAmbiguousError extends Schema.TaggedError<TodoIdentifierAmbiguousError>()(
  "TodoIdentifierAmbiguousError",
  { locator: Schema.String, matches: Schema.Number }
) {
  override get message(): string {
    return `Planner ToDo locator is ambiguous: ${this.locator} matched ${this.matches} ToDos`
  }
}

export class TodoWorkSlotNotFoundError extends Schema.TaggedError<TodoWorkSlotNotFoundError>()(
  "TodoWorkSlotNotFoundError",
  { workSlotId: Schema.String }
) {
  override get message(): string {
    return `Planner ToDo work slot '${this.workSlotId}' not found`
  }
}

export class PlannerSchedulingPrerequisiteError extends Schema.TaggedError<PlannerSchedulingPrerequisiteError>()(
  "PlannerSchedulingPrerequisiteError",
  { prerequisite: Schema.Literal("primary social identity", "employee identity", "personal calendar") }
) {
  override get message(): string {
    return `Cannot create a Planner-visible work slot: the authenticated user has no usable ${this.prerequisite}. Configure the user's Huly profile and personal calendar, then retry.`
  }
}
