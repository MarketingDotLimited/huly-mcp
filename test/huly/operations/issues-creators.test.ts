import { describe, it } from "@effect/vitest"
import { AvatarType, type Channel, type Person, type SocialIdentity } from "@hcengineering/contact"
import type { Attribute, Class, Doc, FindResult, PersonId as CorePersonId, Space, Status } from "@hcengineering/core"
import { SocialIdType } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import {
  type Issue as HulyIssue,
  IssuePriority,
  type Project as HulyProject,
  TimeReportDayType
} from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"

import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { contact, core, tracker } from "../../../src/huly/huly-plugins.js"
import { getIssue, listIssues } from "../../../src/huly/operations/issues.js"
import { toSocialIdentityRef } from "../../../src/huly/operations/sdk-boundary.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { email, issueIdentifier, personName, projectIdentifier } from "../../helpers/brands.js"
import { corePersonId, docRef, personRef } from "../../helpers/huly-sdk.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  // eslint-disable-next-line no-restricted-syntax -- Huly SDK FindResult is an array with attached metadata
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const makeProject = (): HulyProject => ({
  _id: docRef<HulyProject>("project-1"),
  _class: tracker.class.Project,
  space: docRef<Space>("space-1"),
  identifier: "TEST",
  name: "Test Project",
  description: "",
  private: false,
  members: [],
  archived: false,
  type: docRef<ProjectType>("project-type-1"),
  sequence: 1,
  defaultIssueStatus: docRef<Status>("status-open"),
  defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
  modifiedBy: corePersonId("social-system"),
  modifiedOn: 0,
  createdBy: corePersonId("social-system"),
  createdOn: 0
})

const makeStatus = (): Status => ({
  _id: docRef<Status>("status-open"),
  _class: docRef<Class<Status>>("core:class:Status"),
  space: docRef<Space>("space-1"),
  ofAttribute: docRef<Attribute<Status>>("tracker:attribute:IssueStatus"),
  name: "Open",
  modifiedBy: corePersonId("social-system"),
  modifiedOn: 0,
  createdBy: corePersonId("social-system"),
  createdOn: 0
})

const makeIssue = (id: string, createdBy: CorePersonId, modifiedOn = 0): HulyIssue => ({
  _id: docRef<HulyIssue>(id),
  _class: tracker.class.Issue,
  space: docRef<HulyProject>("project-1"),
  identifier: `TEST-${id.slice(-1)}`,
  title: `Issue ${id}`,
  description: null,
  status: docRef<Status>("status-open"),
  priority: IssuePriority.Medium,
  assignee: null,
  kind: docRef("task-type-1"),
  number: Number(id.slice(-1)),
  dueDate: null,
  rank: `0|${id}`,
  attachedTo: docRef<HulyIssue>(tracker.ids.NoParent),
  attachedToClass: tracker.class.Issue,
  collection: "subIssues",
  component: null,
  subIssues: 0,
  parents: [],
  estimation: 0,
  remainingTime: 0,
  reportedTime: 0,
  reports: 0,
  childInfo: [],
  modifiedBy: createdBy,
  modifiedOn,
  createdBy,
  createdOn: 0
})

const makePerson = (id: string, name: string): Person => ({
  _id: personRef(id),
  _class: contact.class.Person,
  space: docRef<Space>("space-1"),
  name,
  avatarType: AvatarType.COLOR,
  modifiedBy: corePersonId("social-system"),
  modifiedOn: 0,
  createdBy: corePersonId("social-system"),
  createdOn: 0
})

const makeSocialIdentity = (id: string, person: Person, type: SocialIdType, value: string): SocialIdentity => ({
  _id: toSocialIdentityRef(corePersonId(id)),
  _class: contact.class.SocialIdentity,
  space: docRef<Space>("space-1"),
  attachedTo: person._id,
  attachedToClass: contact.class.Person,
  collection: "socialIds",
  type,
  value,
  key: `${type}:${value}`,
  modifiedBy: corePersonId("social-system"),
  modifiedOn: 0,
  createdBy: corePersonId("social-system"),
  createdOn: 0
})

const makeEmailChannel = (person: Person, value: string): Channel => ({
  _id: docRef<Channel>(`channel-${person._id}`),
  _class: contact.class.Channel,
  space: docRef<Space>("space-1"),
  attachedTo: person._id,
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value,
  modifiedBy: corePersonId("social-system"),
  modifiedOn: 0,
  createdBy: corePersonId("social-system"),
  createdOn: 0
})

interface QueryCapture {
  issueQuery?: unknown
  issueLimit?: number
  socialIdentityQueries: Array<unknown>
  personQueries: Array<unknown>
  channelQueries: Array<unknown>
}

interface TestData {
  issues: Array<HulyIssue>
  persons: Array<Person>
  socialIdentities: Array<SocialIdentity>
  channels?: Array<Channel>
}

const fieldValue = (value: unknown, field: PropertyKey): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, field) : undefined

const valuesIn = (queryValue: unknown): ReadonlyArray<unknown> | undefined => {
  const values = fieldValue(queryValue, "$in")
  return Array.isArray(values) ? values : undefined
}

const filterByQuery = <T>(values: ReadonlyArray<T>, query: unknown, field: keyof T): Array<T> => {
  const filter = fieldValue(query, String(field))
  const inValues = valuesIn(filter)
  if (inValues !== undefined) return values.filter((value) => inValues.includes(value[field]))
  return filter === undefined ? [...values] : values.filter((value) => value[field] === filter)
}

const filterByFields = <T>(values: ReadonlyArray<T>, query: unknown, fields: ReadonlyArray<keyof T>): Array<T> =>
  fields.reduce((matches, field) => filterByQuery(matches, query, field), [...values])

const makeTestLayer = (data: TestData, capture: QueryCapture) => {
  const project = makeProject()
  const status = makeStatus()
  const channels = data.channels ?? []

  // The SDK method is generic in the requested document class; this test stub
  // dispatches on that runtime class ref, which TypeScript cannot use to narrow T.
  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Issue) {
      capture.issueQuery = query
      const rawLimit = fieldValue(options, "limit")
      const limit = typeof rawLimit === "number" ? rawLimit : undefined
      if (limit !== undefined) capture.issueLimit = limit
      const filtered = filterByQuery(data.issues, query, "createdBy")
      const rawDirection = fieldValue(fieldValue(options, "sort"), "modifiedOn")
      const direction = typeof rawDirection === "number" ? rawDirection : 1
      return Effect.succeed(
        toFindResult(filtered.sort((left, right) => direction * (left.modifiedOn - right.modifiedOn)).slice(0, limit))
      )
    }
    if (String(_class) === String(core.class.Status)) return Effect.succeed(toFindResult([status]))
    if (_class === contact.class.SocialIdentity) {
      capture.socialIdentityQueries.push(query)
      const identities = filterByFields(data.socialIdentities, query, ["_id", "attachedTo", "type", "value"])
      return Effect.succeed(toFindResult(identities))
    }
    if (_class === contact.class.Person) {
      capture.personQueries.push(query)
      const persons = filterByFields(data.persons, query, ["_id", "name"])
      return Effect.succeed(toFindResult(persons))
    }
    if (_class === contact.class.Channel) {
      capture.channelQueries.push(query)
      const matchingChannels = filterByFields(channels, query, ["attachedTo", "provider", "value"])
      return Effect.succeed(toFindResult(matchingChannels))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  // As above, the generic SDK result is selected by a runtime class ref.
  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      if (fieldValue(query, "identifier") !== project.identifier) return Effect.succeed(undefined)
      return Effect.succeed(
        fieldValue(fieldValue(options, "lookup"), "type") === undefined
          ? project
          : { ...project, $lookup: { type: { _id: "project-type-1", statuses: [{ _id: status._id }] } } }
      )
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(
        data.issues.find(
          (issue) =>
            issue.identifier === fieldValue(query, "identifier") || issue.number === fieldValue(query, "number")
        )
      )
    }
    if (_class === contact.class.Person) {
      return Effect.succeed(data.persons.find((person) => person._id === fieldValue(query, "_id")))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne, fetchMarkup: () => Effect.succeed("") })
}

const emptyCapture = (): QueryCapture => ({ socialIdentityQueries: [], personQueries: [], channelQueries: [] })

const withWarningCapture = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<{ result: A; warnings: ReadonlyArray<ToolWarning> }, E, Exclude<R, Diagnostics>> =>
  Effect.gen(function* () {
    const scope = yield* makeDiagnosticsScope
    const result = yield* effect.pipe(Effect.provideService(Diagnostics, scope.service))
    return { result, warnings: yield* scope.drainWarnings }
  })

describe("issue creators", () => {
  it.effect("filters by raw Person ID across every SocialIdentity before applying the limit", () =>
    Effect.gen(function* () {
      const creator = makePerson("person-creator", "Creator Person")
      const primary = makeSocialIdentity("social-email", creator, SocialIdType.EMAIL, "creator@example.com")
      const secondary = makeSocialIdentity("social-github", creator, SocialIdType.GITHUB, "creator")
      const other = makePerson("person-other", "Other Person")
      const otherIdentity = makeSocialIdentity("social-other", other, SocialIdType.EMAIL, "other@example.com")
      const capture = emptyCapture()
      const layer = makeTestLayer(
        {
          issues: [
            makeIssue("issue-1", otherIdentity._id, 3),
            makeIssue("issue-2", secondary._id, 2),
            makeIssue("issue-3", primary._id, 1)
          ],
          persons: [creator, other],
          socialIdentities: [primary, secondary, otherIdentity],
          channels: [makeEmailChannel(creator, "preferred@example.com")]
        },
        capture
      )

      const result = yield* listIssues({
        project: projectIdentifier("TEST"),
        creator: personName("person-creator"),
        limit: 1
      }).pipe(Effect.provide(layer), withWarningCapture)

      expect(fieldValue(capture.issueQuery, "createdBy")).toEqual({ $in: [primary._id, secondary._id] })
      expect(capture.issueLimit).toBe(1)
      expect(result.result).toHaveLength(1)
      expect(assertAt(result.result, 0).creator).toEqual({
        id: "person-creator",
        name: "Creator Person",
        email: "preferred@example.com"
      })
      expect(capture.socialIdentityQueries).toHaveLength(3)
      expect(capture.personQueries).toHaveLength(1)
      expect(capture.channelQueries).toHaveLength(1)
      expect(result.warnings.filter((warning) => warning.code === "issue_creator_metadata_degraded")).toEqual([])
    })
  )

  it.effect("resolves exact email and exact display-name creator filters", () =>
    Effect.gen(function* () {
      const creator = makePerson("person-creator", "Creator Person")
      const identity = makeSocialIdentity("social-email", creator, SocialIdType.EMAIL, "creator@example.com")
      const data = { issues: [makeIssue("issue-1", identity._id)], persons: [creator], socialIdentities: [identity] }

      const byEmail = yield* listIssues({
        project: projectIdentifier("TEST"),
        creator: email("creator@example.com")
      }).pipe(Effect.provide(makeTestLayer(data, emptyCapture())), withWarningCapture)
      const byName = yield* listIssues({
        project: projectIdentifier("TEST"),
        creator: personName("Creator Person")
      }).pipe(Effect.provide(makeTestLayer(data, emptyCapture())), withWarningCapture)

      expect(byEmail.result.map((issue) => issue.issueId)).toEqual(["issue-1"])
      expect(byName.result.map((issue) => issue.issueId)).toEqual(["issue-1"])
    })
  )

  it.effect("batch-projects distinct creators with independently optional names and emails", () =>
    Effect.gen(function* () {
      const namedCreator = makePerson("person-named", "Named Creator")
      const namedIdentity = makeSocialIdentity("social-named", namedCreator, SocialIdType.GITHUB, "named")
      const emailedCreator = makePerson("person-emailed", "")
      const emailedIdentity = makeSocialIdentity(
        "social-emailed",
        emailedCreator,
        SocialIdType.EMAIL,
        "emailed@example.com"
      )
      const capture = emptyCapture()
      const layer = makeTestLayer(
        {
          issues: [makeIssue("issue-1", namedIdentity._id), makeIssue("issue-2", emailedIdentity._id)],
          persons: [namedCreator, emailedCreator],
          socialIdentities: [namedIdentity, emailedIdentity]
        },
        capture
      )

      const result = yield* listIssues({ project: projectIdentifier("TEST") }).pipe(
        Effect.provide(layer),
        withWarningCapture
      )

      expect(result.result.map((issue) => issue.creator)).toEqual([
        { id: "person-named", name: "Named Creator" },
        { id: "person-emailed", email: "emailed@example.com" }
      ])
      expect(capture.socialIdentityQueries).toHaveLength(2)
      expect(capture.personQueries).toHaveLength(1)
      expect(capture.channelQueries).toHaveLength(1)
      expect(result.warnings.filter((warning) => warning.code === "issue_creator_metadata_degraded")).toEqual([])
    })
  )

  it.effect("rejects ambiguous exact names and returns no issues for an unknown creator", () =>
    Effect.gen(function* () {
      const first = makePerson("person-1", "Same Name")
      const second = makePerson("person-2", "Same Name")
      const data = { issues: [], persons: [first, second], socialIdentities: [] }

      const ambiguous = yield* Effect.flip(
        listIssues({ project: projectIdentifier("TEST"), creator: personName("Same Name") }).pipe(
          Effect.provide(makeTestLayer(data, emptyCapture())),
          withWarningCapture
        )
      )
      const unknownCapture = emptyCapture()
      const unknown = yield* listIssues({
        project: projectIdentifier("TEST"),
        creator: personName("Unknown Person")
      }).pipe(Effect.provide(makeTestLayer(data, unknownCapture)), withWarningCapture)

      expect(ambiguous._tag).toBe("PersonIdentifierAmbiguousError")
      expect(unknown.result).toEqual([])
      expect(unknownCapture.issueQuery).toBeUndefined()
    })
  )

  it.effect("batch-projects creators for get and list and emits one warning for unresolved references", () =>
    Effect.gen(function* () {
      const creator = makePerson("person-creator", "")
      const identity = makeSocialIdentity("social-email", creator, SocialIdType.EMAIL, "not-an-email")
      const unresolved = corePersonId("social-legacy")
      const issues = [makeIssue("issue-1", identity._id), makeIssue("issue-2", unresolved)]
      const data = { issues, persons: [creator], socialIdentities: [identity] }

      const listed = yield* listIssues({ project: projectIdentifier("TEST") }).pipe(
        Effect.provide(makeTestLayer(data, emptyCapture())),
        withWarningCapture
      )
      const fetched = yield* getIssue({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(makeTestLayer(data, emptyCapture())), withWarningCapture)

      expect(assertAt(listed.result, 0).creator).toEqual({ id: "person-creator" })
      expect(assertAt(listed.result, 1).creator).toBeUndefined()
      expect(listed.warnings.filter((warning) => warning.code === "issue_creator_metadata_degraded")).toHaveLength(1)
      expect(fetched.result.creator).toEqual({ id: "person-creator" })
      expect(fetched.warnings.filter((warning) => warning.code === "issue_creator_metadata_degraded")).toEqual([])
    })
  )
})
