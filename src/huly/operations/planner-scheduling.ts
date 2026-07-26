import {
  AccessLevel,
  type Calendar as HulyCalendar,
  generateEventId,
  type Visibility as HulyVisibility
} from "@hcengineering/calendar"
import type { Employee, SocialIdentity } from "@hcengineering/contact"
import { type AttachedData, type Class, generateId, type Ref } from "@hcengineering/core"
import type { ToDo as HulyToDo, WorkSlot as HulyWorkSlot } from "@hcengineering/time"
import { Effect, Schema } from "effect"

import { TodoTitle, type TodoVisibility } from "../../domain/schemas/planner.js"
import { CalendarId, EventId, PersonId, Timestamp, type TodoId, WorkSlotId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  HulyConnectionError,
  PlannerSchedulingPrerequisiteError,
  type PlannerSchedulingPrerequisiteError as PlannerSchedulingPrerequisiteFailure
} from "../errors.js"
import { calendar, contact, time } from "../huly-plugins.js"
import { getDefaultCalendarRef } from "./calendar-shared.js"
import { parsePrimarySocialIdentityProjection } from "./primary-social-identity.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef, toSocialIdentityRef } from "./sdk-boundary.js"

const EmployeeProjectionSchema = Schema.Struct({
  _id: PersonId,
  active: Schema.Literal(true)
})
const CalendarProjectionSchema = Schema.Struct({
  _id: CalendarId,
  _class: Schema.Literal(calendar.class.Calendar, calendar.class.ExternalCalendar),
  space: Schema.Literal(calendar.space.Calendar),
  user: PersonId,
  hidden: Schema.Literal(false),
  access: Schema.Literal(AccessLevel.Writer, AccessLevel.Owner)
})
const PlannerWorkSlotDataSchema = Schema.Struct({
  eventId: EventId,
  date: Timestamp,
  dueDate: Timestamp,
  description: Schema.String,
  participants: Schema.Array(PersonId),
  calendar: CalendarId,
  blockTime: Schema.Literal(true),
  title: TodoTitle,
  allDay: Schema.Literal(false),
  access: Schema.Literal(AccessLevel.Owner),
  visibility: Schema.Literal("public", "freeBusy"),
  reminders: Schema.Array(Timestamp),
  user: PersonId
})

type PlannerWorkSlotData = Schema.Schema.Type<typeof PlannerWorkSlotDataSchema>

interface PlannerSchedulingContext {
  readonly calendar: CalendarId
  readonly employee: PersonId
  readonly primarySocialIdentity: PersonId
}

interface PlannerWorkSlotInput {
  readonly todoId: TodoId
  readonly todoClass: Ref<Class<HulyToDo>>
  readonly date: Timestamp
  readonly dueDate: Timestamp
  readonly title: TodoTitle
  readonly description: string
  readonly visibility: TodoVisibility
}

interface WorkSlotCreationResult {
  readonly slotId: WorkSlotId
}

type PlannerWorkSlotError = HulyClientError | PlannerSchedulingPrerequisiteFailure

const missingPrerequisite = (
  prerequisite: PlannerSchedulingPrerequisiteFailure["prerequisite"]
): Effect.Effect<never, PlannerSchedulingPrerequisiteFailure> =>
  Effect.fail(new PlannerSchedulingPrerequisiteError({ prerequisite }))

const parseEmployee = (
  value: unknown
): Effect.Effect<Schema.Schema.Type<typeof EmployeeProjectionSchema>, PlannerSchedulingPrerequisiteFailure> =>
  Schema.decodeUnknown(EmployeeProjectionSchema)(value).pipe(
    Effect.mapError(() => new PlannerSchedulingPrerequisiteError({ prerequisite: "employee identity" }))
  )

const parseCalendar = (
  value: unknown
): Effect.Effect<Schema.Schema.Type<typeof CalendarProjectionSchema>, PlannerSchedulingPrerequisiteFailure> =>
  Schema.decodeUnknown(CalendarProjectionSchema)(value).pipe(
    Effect.mapError(() => new PlannerSchedulingPrerequisiteError({ prerequisite: "personal calendar" }))
  )

const resolvePlannerSchedulingContext = Effect.fn("PlannerScheduling.resolveContext")(
  function*(client: HulyClient["Type"]): Effect.fn.Return<PlannerSchedulingContext, PlannerWorkSlotError> {
    const rawPrimarySocialIdentity = yield* client.findOne<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(client.getPrimarySocialId()) })
    )
    if (rawPrimarySocialIdentity === undefined) {
      return yield* missingPrerequisite("primary social identity")
    }
    const primarySocialIdentity = yield* parsePrimarySocialIdentityProjection(rawPrimarySocialIdentity).pipe(
      Effect.mapError(() => new PlannerSchedulingPrerequisiteError({ prerequisite: "primary social identity" }))
    )

    const rawEmployee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(primarySocialIdentity.attachedTo) })
    )
    if (rawEmployee === undefined) {
      return yield* missingPrerequisite("employee identity")
    }
    const employee = yield* parseEmployee(rawEmployee)

    const defaultCalendar = yield* getDefaultCalendarRef(client)
    const rawPersonalCalendar = yield* client.findOne<HulyCalendar>(
      calendar.class.Calendar,
      hulyQuery<HulyCalendar>({
        _id: defaultCalendar,
        user: toSocialIdentityRef(primarySocialIdentity._id),
        hidden: false,
        access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
      })
    )
    if (rawPersonalCalendar === undefined) {
      return yield* missingPrerequisite("personal calendar")
    }
    const personalCalendar = yield* parseCalendar(rawPersonalCalendar)

    return {
      calendar: personalCalendar._id,
      employee: employee._id,
      primarySocialIdentity: primarySocialIdentity._id
    }
  }
)

const plannerVisibility = (visibility: TodoVisibility): HulyVisibility =>
  visibility === "public" ? "public" : "freeBusy"

const parseWorkSlotData = (
  value: unknown
): Effect.Effect<PlannerWorkSlotData, HulyConnectionError> =>
  Schema.decodeUnknown(PlannerWorkSlotDataSchema)(value).pipe(
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `Planner work slot payload failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

export const createPlannerWorkSlot = (
  params: PlannerWorkSlotInput
): Effect.Effect<WorkSlotCreationResult, PlannerWorkSlotError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const context = yield* resolvePlannerSchedulingContext(client)
    const slotId: Ref<HulyWorkSlot> = generateId()
    const parsedSlotData = yield* parseWorkSlotData({
      eventId: generateEventId(),
      date: params.date,
      dueDate: params.dueDate,
      description: params.description,
      participants: [context.employee],
      calendar: context.calendar,
      blockTime: true,
      title: params.title,
      allDay: false,
      access: AccessLevel.Owner,
      visibility: plannerVisibility(params.visibility),
      reminders: [],
      user: context.primarySocialIdentity
    })
    const slotData: AttachedData<HulyWorkSlot> = {
      ...parsedSlotData,
      participants: parsedSlotData.participants.map(toRef<Employee>),
      calendar: toRef<HulyCalendar>(parsedSlotData.calendar),
      reminders: [...parsedSlotData.reminders],
      user: toSocialIdentityRef(parsedSlotData.user)
    }

    yield* client.addCollection(
      time.class.WorkSlot,
      calendar.space.Calendar,
      toRef<HulyToDo>(params.todoId),
      params.todoClass,
      "workslots",
      slotData,
      slotId
    )

    return { slotId: WorkSlotId.make(slotId) }
  })
