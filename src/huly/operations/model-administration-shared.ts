import type { AnyAttribute, Class, Enum as HulyEnum, Obj, Ref } from "@hcengineering/core"
import { Effect, Either, Option, Schema } from "effect"

import type { ModelIdentifier } from "../../domain/schemas/model-administration.js"
import {
  HulyAttributeId,
  type HulyAttributeIdentifier,
  type HulyEnumId,
  NonEmptyString,
  type ObjectClassName
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  HulyAttributeAmbiguousError,
  HulyAttributeNotFoundError,
  HulyEnumAmbiguousError,
  HulyEnumNotFoundError,
  ModelClassAmbiguousError,
  ModelClassNotFoundError
} from "../errors-model-administration.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { core } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toRef } from "./sdk-boundary.js"

const classRef = toRef<Class<MetadataClassDoc>>(core.class.Class)

export const normalizeModelIdentifier = (value: string): string => value.toLocaleLowerCase()
const labelTail = (value: unknown, fallback: string): string =>
  Either.getOrElse(decodeHulyModelLabelTail(value), () => fallback)

const resolveUnique = <A, E1, E2>(
  matches: ReadonlyArray<A>,
  notFound: E1,
  ambiguous: (matches: ReadonlyArray<A>) => E2
): Effect.Effect<A, E1 | E2> => {
  if (matches.length === 0) return Effect.fail(notFound)
  if (matches.length > 1) return Effect.fail(ambiguous(matches))
  const [match] = matches
  /* v8 ignore start -- guarded by the non-empty length branch above */
  if (match === undefined) return Effect.fail(notFound)
  /* v8 ignore stop */
  return Effect.succeed(match)
}

export const loadClasses = (
  client: HulyClient["Type"]
): Effect.Effect<ReadonlyArray<MetadataClassDoc>, HulyClientError> =>
  client.findAllInModel<MetadataClassDoc>(classRef, hulyQuery<MetadataClassDoc>({}))

export const resolveModelClass = (classes: ReadonlyArray<MetadataClassDoc>, identifier: ModelIdentifier) => {
  const exactId = classes.find((candidate) => String(candidate._id) === identifier)
  if (exactId !== undefined) return Effect.succeed(exactId)
  const target = normalizeModelIdentifier(identifier)
  const tailMatches = classes.filter((candidate) => {
    const id = String(candidate._id)
    const tail = id.slice(id.lastIndexOf(":") + 1)
    return normalizeModelIdentifier(tail) === target
  })
  const matches =
    tailMatches.length > 0
      ? tailMatches
      : classes.filter(
          (candidate) => normalizeModelIdentifier(labelTail(candidate.label, String(candidate._id))) === target
        )
  return resolveUnique(
    matches,
    new ModelClassNotFoundError({ identifier }),
    (ambiguous) =>
      new ModelClassAmbiguousError({
        identifier,
        matches: ambiguous.map((candidate) => NonEmptyString.make(String(candidate._id)))
      })
  )
}

export const loadEnums = (client: HulyClient["Type"]): Effect.Effect<ReadonlyArray<HulyEnum>, HulyClientError> =>
  client.findAll<HulyEnum>(core.class.Enum, hulyQuery<HulyEnum>({}))

export const resolveEnum = (enums: ReadonlyArray<HulyEnum>, identifier: ModelIdentifier) => {
  const exactId = enums.find((candidate) => String(candidate._id) === identifier)
  if (exactId !== undefined) return Effect.succeed(exactId)
  const matches = enums.filter(
    (candidate) => normalizeModelIdentifier(candidate.name) === normalizeModelIdentifier(identifier)
  )
  return resolveUnique(
    matches,
    new HulyEnumNotFoundError({ identifier }),
    (ambiguous) =>
      new HulyEnumAmbiguousError({
        identifier,
        matches: ambiguous.map((candidate) => NonEmptyString.make(String(candidate._id)))
      })
  )
}

export const enumReferences = (
  attributes: ReadonlyArray<AnyAttribute>,
  enumId: HulyEnumId
): ReadonlyArray<AnyAttribute> =>
  attributes.filter((attribute) => {
    const descriptor = Schema.decodeUnknownOption(Schema.Struct({ _class: Schema.String, of: Schema.String }))(
      attribute.type
    )
    return Option.isSome(descriptor) && descriptor.value._class === core.class.EnumOf && descriptor.value.of === enumId
  })

export const loadAttributes = (
  client: HulyClient["Type"]
): Effect.Effect<ReadonlyArray<AnyAttribute>, HulyClientError> =>
  client.findAll<AnyAttribute>(core.class.Attribute, hulyQuery<AnyAttribute>({}))

export const resolveAttribute = (
  attributes: ReadonlyArray<AnyAttribute>,
  identifier: HulyAttributeIdentifier,
  ownerClassId?: ObjectClassName
) => {
  const inOwner = attributes.filter(
    (candidate) => ownerClassId === undefined || String(candidate.attributeOf) === ownerClassId
  )
  const exactId = inOwner.find((candidate) => String(candidate._id) === identifier)
  if (exactId !== undefined) return Effect.succeed(exactId)
  const matches = inOwner.filter(
    (candidate) => normalizeModelIdentifier(candidate.name) === normalizeModelIdentifier(identifier)
  )
  return resolveUnique(
    matches,
    new HulyAttributeNotFoundError({ identifier }),
    (ambiguous) =>
      new HulyAttributeAmbiguousError({
        identifier,
        matches: ambiguous.map((candidate) => HulyAttributeId.make(String(candidate._id)))
      })
  )
}

export const ownerClassRef = (classId: ObjectClassName): Ref<Class<Obj>> => toRef<Class<Obj>>(classId)
