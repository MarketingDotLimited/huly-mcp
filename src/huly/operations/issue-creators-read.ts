import type { Person, SocialIdentity } from "@hcengineering/contact"
import type { PersonId as HulyPersonId, Ref } from "@hcengineering/core"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect, Option, Schema } from "effect"

import { PersonRefSchema, type PersonRef } from "../../domain/schemas/issues.js"
import type { Email } from "../../domain/schemas/shared.js"
import { IssueCreatorMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { contact } from "../huly-plugins.js"
import { batchGetEmailsForPersons } from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef, toSocialIdentityRef } from "./sdk-boundary.js"

export type IssueCreatorBySocialIdentity = ReadonlyMap<HulyPersonId, PersonRef>

const parsePersonRef = Schema.decodeUnknownOption(PersonRefSchema)

const uniqueCreatorIds = (issues: ReadonlyArray<HulyIssue>): Array<HulyPersonId> => [
  ...new Set(issues.flatMap((issue) => (issue.createdBy === undefined ? [] : [issue.createdBy])))
]

const creatorRef = (person: Person, emailByPerson: ReadonlyMap<Ref<Person>, Email>): Option.Option<PersonRef> =>
  parsePersonRef({
    id: person._id,
    ...(person.name.trim() === "" ? {} : { name: person.name }),
    ...(emailByPerson.has(person._id) ? { email: emailByPerson.get(person._id) } : {})
  })

export const creatorForIssue = (index: IssueCreatorBySocialIdentity, issue: HulyIssue): PersonRef | undefined =>
  issue.createdBy === undefined ? undefined : index.get(issue.createdBy)

export const loadIssueCreatorIndex = (
  client: HulyClient["Service"],
  issues: ReadonlyArray<HulyIssue>
): Effect.Effect<IssueCreatorBySocialIdentity, HulyClientError, Diagnostics> =>
  Effect.gen(function* () {
    const creatorIds = uniqueCreatorIds(issues)
    if (creatorIds.length === 0) return new Map<HulyPersonId, PersonRef>()

    const identities = yield* client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ _id: { $in: creatorIds.map(toSocialIdentityRef) } })
    )
    const personIds = [...new Set(identities.map((identity) => identity.attachedTo))]
    const persons =
      personIds.length === 0
        ? []
        : yield* client.findAll<Person>(
            contact.class.Person,
            hulyQuery<Person>({ _id: { $in: personIds.map(toRef<Person>) } })
          )
    const emailByPerson = yield* batchGetEmailsForPersons(
      client,
      persons.map((person) => person._id)
    )
    const personById = new Map(persons.map((person) => [person._id, person] as const))
    const index = new Map<HulyPersonId, PersonRef>()

    for (const identity of identities) {
      const person = personById.get(identity.attachedTo)
      if (person === undefined) continue
      const parsed = creatorRef(person, emailByPerson)
      if (Option.isSome(parsed)) index.set(identity._id, parsed.value)
    }

    const unresolvedCount = creatorIds.filter((creatorId) => !index.has(creatorId)).length
    if (unresolvedCount > 0) {
      const diagnostics = yield* Diagnostics
      yield* diagnostics.warnAgent({
        code: IssueCreatorMetadataDegradedWarningCode,
        message: `${unresolvedCount} unresolved issue creator reference(s) were omitted from issue results.`
      })
    }

    return index
  })
