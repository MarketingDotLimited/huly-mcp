import type { AnyAttribute, Data, DocumentUpdate, Enum as HulyEnum } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateHulyEnumParams,
  CreateHulyEnumResult,
  DeleteHulyEnumParams,
  DeleteHulyEnumResult,
  UpdateHulyEnumParams,
  UpdateHulyEnumResult
} from "../../domain/schemas/model-administration.js"
import { HulyAttributeId, HulyEnumId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  HulyEnumInUseError,
  type HulyEnumAmbiguousError,
  HulyEnumNameConflictError,
  type HulyEnumNotFoundError,
  HulyEnumOptionsInUseError
} from "../errors-model-administration.js"
import { core } from "../huly-plugins.js"
import { toEnumSummary } from "./sdk-discovery-mappers.js"
import {
  enumReferences,
  loadAttributes,
  loadEnums,
  normalizeModelIdentifier,
  resolveEnum
} from "./model-administration-shared.js"

type EnumResolverError = HulyEnumAmbiguousError | HulyEnumNotFoundError
type EnumWriteError =
  | HulyClientError
  | EnumResolverError
  | HulyEnumInUseError
  | HulyEnumNameConflictError
  | HulyEnumOptionsInUseError

const conflictingEnum = (enums: ReadonlyArray<HulyEnum>, name: string, excluding?: HulyEnum): HulyEnum | undefined =>
  enums.find(
    (candidate) =>
      candidate._id !== excluding?._id && normalizeModelIdentifier(candidate.name) === normalizeModelIdentifier(name)
  )

const sameEnumValues = (current: ReadonlyArray<string>, requested: ReadonlyArray<string>): boolean =>
  current.length === requested.length && current.every((value, index) => value === requested[index])

const referencedAttributeIds = (attributes: ReadonlyArray<AnyAttribute>, enumId: HulyEnumId) =>
  enumReferences(attributes, enumId).map((attribute) => HulyAttributeId.make(String(attribute._id)))

export const createHulyEnum = (
  params: CreateHulyEnumParams
): Effect.Effect<CreateHulyEnumResult, HulyClientError | HulyEnumNameConflictError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const enums = yield* loadEnums(client)
    const existing = conflictingEnum(enums, params.name)
    if (existing !== undefined) {
      if (sameEnumValues(existing.enumValues, params.values)) return { enum: toEnumSummary(existing), created: false }
      return yield* new HulyEnumNameConflictError({
        name: params.name,
        existingEnumId: HulyEnumId.make(String(existing._id))
      })
    }

    const enumId = generateId<HulyEnum>()
    const attributes: Data<HulyEnum> = { name: params.name, enumValues: Array.from(params.values) }
    yield* client.createDoc(core.class.Enum, core.space.Model, attributes, enumId)
    return {
      enum: { enumId: HulyEnumId.make(enumId), name: params.name, values: Array.from(params.values) },
      created: true
    }
  })

export const updateHulyEnum = (
  params: UpdateHulyEnumParams
): Effect.Effect<UpdateHulyEnumResult, EnumWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const enums = yield* loadEnums(client)
    const current = yield* resolveEnum(enums, params.enum)
    const name = params.name ?? current.name
    const conflict = conflictingEnum(enums, name, current)
    if (conflict !== undefined) {
      return yield* new HulyEnumNameConflictError({ name, existingEnumId: HulyEnumId.make(String(conflict._id)) })
    }

    const values = params.values === undefined ? current.enumValues : Array.from(params.values)
    const removesOptions = current.enumValues.some(
      (currentValue) =>
        !values.some((value) => normalizeModelIdentifier(value) === normalizeModelIdentifier(currentValue))
    )
    if (removesOptions) {
      const attributeIds = referencedAttributeIds(yield* loadAttributes(client), HulyEnumId.make(String(current._id)))
      if (attributeIds.length > 0) {
        return yield* new HulyEnumOptionsInUseError({ enumId: HulyEnumId.make(String(current._id)), attributeIds })
      }
    }

    const operations: DocumentUpdate<HulyEnum> = {
      ...(params.name === undefined ? {} : { name }),
      ...(params.values === undefined ? {} : { enumValues: values })
    }
    yield* client.updateDoc(current._class, current.space, current._id, operations)
    return { enum: { enumId: HulyEnumId.make(String(current._id)), name, values }, updated: true }
  })

export const deleteHulyEnum = (
  params: DeleteHulyEnumParams
): Effect.Effect<DeleteHulyEnumResult, EnumWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolveEnum(yield* loadEnums(client), params.enum)
    const enumId = HulyEnumId.make(String(current._id))
    const attributeIds = referencedAttributeIds(yield* loadAttributes(client), enumId)
    if (attributeIds.length > 0) return yield* new HulyEnumInUseError({ enumId, attributeIds })
    yield* client.removeDoc(current._class, current.space, current._id)
    return { enumId, deleted: true }
  })
