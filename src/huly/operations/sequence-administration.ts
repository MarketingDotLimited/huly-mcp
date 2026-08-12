import type { AnyAttribute, Class, CustomSequence, Data, Doc, DocumentUpdate, Ref, Sequence } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import type {
  CreateHulySequenceParams,
  CreateHulySequenceResult,
  DeleteHulySequenceParams,
  DeleteHulySequenceResult,
  SequenceIdentifier,
  UpdateHulyCustomSequenceParams,
  UpdateHulyCustomSequenceResult
} from "../../domain/schemas/sequence-administration.js"
import { ModelIdentifier } from "../../domain/schemas/model-administration.js"
import {
  HulySequenceId,
  type HulySequencePrefix,
  HulySequenceValue
} from "../../domain/schemas/sdk-discovery-configurations.js"
import { HulyAttributeId, HulyTransactionScope, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  SequenceConcurrentWriteError,
  SequenceCurrentValueMismatchError,
  SequenceDefinitionConflictError,
  SequenceIdentifierAmbiguousError,
  SequenceInUseError,
  SequenceKindUnsupportedError,
  SequenceNotFoundError
} from "../errors-sequence-administration.js"
import type { ModelClassAmbiguousError, ModelClassNotFoundError } from "../errors-model-administration.js"
import { core } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { loadClasses, resolveModelClass } from "./model-administration-shared.js"
import { toClassRef } from "./sdk-boundary.js"
import { toSequenceSummary } from "./sdk-discovery-configurations.js"
import { mergeSequenceDocuments } from "./sequence-shared.js"

type SequenceWriteError =
  | HulyClientError
  | ModelClassAmbiguousError
  | ModelClassNotFoundError
  | SequenceConcurrentWriteError
  | SequenceCurrentValueMismatchError
  | SequenceDefinitionConflictError
  | SequenceIdentifierAmbiguousError
  | SequenceInUseError
  | SequenceKindUnsupportedError
  | SequenceNotFoundError

const loadSequences = (client: HulyClient["Service"]): Effect.Effect<ReadonlyArray<Sequence>, HulyClientError> =>
  Effect.gen(function* () {
    const [sequences, customSequences] = yield* Effect.all([
      client.findAll<Sequence>(core.class.Sequence, hulyQuery<Sequence>({})),
      client.findAll<CustomSequence>(core.class.CustomSequence, hulyQuery<CustomSequence>({}))
    ])
    return mergeSequenceDocuments(sequences, customSequences)
  })

const isCustomSequence = (sequence: Sequence): sequence is CustomSequence =>
  sequence._class === core.class.CustomSequence && "prefix" in sequence

const IdentifierTypeReferenceSchema = Schema.Struct({
  _class: Schema.Literal(core.class.TypeIdentifier),
  of: HulySequenceId
})

const customSequenceReferences = (
  client: HulyClient["Service"],
  sequenceId: HulySequenceId
): Effect.Effect<ReadonlyArray<HulyAttributeId>, HulyClientError> =>
  Effect.gen(function* () {
    const attributes = yield* client.findAll<AnyAttribute>(core.class.Attribute, hulyQuery<AnyAttribute>({}))
    return attributes.flatMap((attribute) => {
      const descriptor = Schema.decodeUnknownOption(IdentifierTypeReferenceSchema)(attribute.type)
      return Option.isSome(descriptor) && descriptor.value.of === sequenceId
        ? [HulyAttributeId.make(String(attribute._id))]
        : []
    })
  })

const resolveSequence = (
  client: HulyClient["Service"],
  identifier: SequenceIdentifier
): Effect.Effect<Sequence, SequenceWriteError> =>
  Effect.gen(function* () {
    const sequences = yield* loadSequences(client)
    const exact = sequences.find((sequence) => String(sequence._id) === identifier)
    if (exact !== undefined) return exact
    const resolvedClass = yield* resolveModelClass(yield* loadClasses(client), ModelIdentifier.make(identifier))
    const matches = sequences.filter((sequence) => String(sequence.attachedTo) === String(resolvedClass._id))
    if (matches.length === 0) return yield* new SequenceNotFoundError({ identifier })
    if (matches.length > 1) {
      return yield* new SequenceIdentifierAmbiguousError({
        identifier,
        matches: matches.map((sequence) => HulySequenceId.make(String(sequence._id)))
      })
    }
    const [match] = matches
    /* v8 ignore start -- guarded by the non-empty branch above */
    return match === undefined ? yield* new SequenceNotFoundError({ identifier }) : match
    /* v8 ignore stop */
  })

const isMatchingDefinition = (sequence: Sequence, params: CreateHulySequenceParams): boolean => {
  const isCustom = sequence._class === core.class.CustomSequence
  return params.kind === "standard" ? !isCustom : isCustom && "prefix" in sequence && sequence.prefix === params.prefix
}

const createSequenceDocument = <T extends Sequence>(
  client: HulyClient["Service"],
  sequenceClass: Ref<Class<T>>,
  attributes: Data<T>,
  sequenceId: Ref<T>,
  attachedTo: Ref<Class<Doc>>,
  classId: ObjectClassName
): Effect.Effect<void, HulyClientError | SequenceConcurrentWriteError> =>
  Effect.gen(function* () {
    const createIfNotMatched = client.createDocIfNotMatched
    const domainSequenceId = HulySequenceId.make(String(sequenceId))
    if (createIfNotMatched === undefined) {
      return yield* new SequenceConcurrentWriteError({ operation: "create", sequenceId: domainSequenceId })
    }
    const result = yield* createIfNotMatched(
      sequenceClass,
      core.space.Workspace,
      attributes,
      sequenceId,
      core.class.Sequence,
      hulyQuery<Sequence>({ attachedTo }),
      HulyTransactionScope.make(`huly-mcp:sequence:${classId}`)
    )
    if (result === "condition-not-met") {
      return yield* new SequenceConcurrentWriteError({ operation: "create", sequenceId: domainSequenceId })
    }
  })

const createStandardSequence = (
  client: HulyClient["Service"],
  attachedTo: Ref<Class<Doc>>,
  classId: ObjectClassName
): Effect.Effect<CreateHulySequenceResult, HulyClientError | SequenceConcurrentWriteError> =>
  Effect.gen(function* () {
    const sequenceId = generateId<Sequence>()
    const attributes: Data<Sequence> = { attachedTo, sequence: 0 }
    yield* createSequenceDocument(client, core.class.Sequence, attributes, sequenceId, attachedTo, classId)
    return {
      sequence: toSequenceSummary({
        _id: sequenceId,
        _class: core.class.Sequence,
        space: core.space.Workspace,
        modifiedBy: client.getPrimarySocialId(),
        modifiedOn: 0,
        ...attributes
      }),
      created: true
    }
  })

const createCustomSequence = (
  client: HulyClient["Service"],
  attachedTo: Ref<Class<Doc>>,
  classId: ObjectClassName,
  prefix: HulySequencePrefix
): Effect.Effect<CreateHulySequenceResult, HulyClientError | SequenceConcurrentWriteError> =>
  Effect.gen(function* () {
    const sequenceId = generateId<CustomSequence>()
    const attributes: Data<CustomSequence> = { attachedTo, sequence: 0, prefix }
    yield* createSequenceDocument(client, core.class.CustomSequence, attributes, sequenceId, attachedTo, classId)
    return {
      sequence: toSequenceSummary({
        _id: sequenceId,
        _class: core.class.CustomSequence,
        space: core.space.Workspace,
        modifiedBy: client.getPrimarySocialId(),
        modifiedOn: 0,
        ...attributes
      }),
      created: true
    }
  })

export const createHulySequence = (
  params: CreateHulySequenceParams
): Effect.Effect<CreateHulySequenceResult, SequenceWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const resolvedClass = yield* resolveModelClass(yield* loadClasses(client), params.class)
    const classId = ObjectClassName.make(String(resolvedClass._id))
    const attachedTo = toClassRef<Doc>(classId)
    const existing = (yield* loadSequences(client)).find((sequence) => String(sequence.attachedTo) === classId)
    if (existing !== undefined) {
      if (isMatchingDefinition(existing, params)) return { sequence: toSequenceSummary(existing), created: false }
      return yield* new SequenceDefinitionConflictError({
        classId,
        existingSequenceId: HulySequenceId.make(String(existing._id))
      })
    }
    return params.kind === "standard"
      ? yield* createStandardSequence(client, attachedTo, classId)
      : yield* createCustomSequence(client, attachedTo, classId, params.prefix)
  })

export const updateHulyCustomSequence = (
  params: UpdateHulyCustomSequenceParams
): Effect.Effect<UpdateHulyCustomSequenceResult, SequenceWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolveSequence(client, params.sequence)
    const sequenceId = HulySequenceId.make(String(current._id))
    if (!isCustomSequence(current)) {
      return yield* new SequenceKindUnsupportedError({ sequenceId })
    }
    if (current.prefix === params.prefix) {
      return { sequence: toSequenceSummary(current), updated: false }
    }
    const updateIfMatched = client.updateDocIfMatched
    if (updateIfMatched === undefined) {
      return yield* new SequenceConcurrentWriteError({ operation: "update custom prefix", sequenceId })
    }
    const operations: DocumentUpdate<CustomSequence> = { prefix: params.prefix }
    const updated = yield* updateIfMatched(
      core.class.CustomSequence,
      current.space,
      current._id,
      hulyQuery<CustomSequence>({ _id: current._id, sequence: current.sequence, prefix: current.prefix }),
      operations,
      HulyTransactionScope.make(`huly-mcp:sequence:${sequenceId}`)
    )
    if (updated === "condition-not-met") {
      return yield* new SequenceConcurrentWriteError({ operation: "update custom prefix", sequenceId })
    }
    return { sequence: toSequenceSummary({ ...current, prefix: params.prefix }), updated: true }
  })

const sequenceDeleteQuery = (sequence: Sequence) =>
  isCustomSequence(sequence)
    ? hulyQuery<CustomSequence>({ _id: sequence._id, sequence: sequence.sequence, prefix: sequence.prefix })
    : hulyQuery<Sequence>({ _id: sequence._id, sequence: sequence.sequence })

export const deleteHulySequence = (
  params: DeleteHulySequenceParams
): Effect.Effect<DeleteHulySequenceResult, SequenceWriteError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const current = yield* resolveSequence(client, params.sequence)
    const sequenceId = HulySequenceId.make(String(current._id))
    if (current.sequence !== params.expectedCurrentValue) {
      return yield* new SequenceCurrentValueMismatchError({
        sequenceId,
        expected: HulySequenceValue.make(params.expectedCurrentValue),
        actual: HulySequenceValue.make(current.sequence)
      })
    }
    if (isCustomSequence(current)) {
      const attributeIds = yield* customSequenceReferences(client, sequenceId)
      if (attributeIds.length > 0) return yield* new SequenceInUseError({ sequenceId, attributeIds })
    }
    const removeIfMatched = client.removeDocIfMatched
    if (removeIfMatched === undefined) {
      return yield* new SequenceConcurrentWriteError({ operation: "delete", sequenceId })
    }
    const deleted = isCustomSequence(current)
      ? yield* removeIfMatched(
          core.class.CustomSequence,
          current.space,
          current._id,
          sequenceDeleteQuery(current),
          HulyTransactionScope.make(`huly-mcp:sequence:${sequenceId}`)
        )
      : yield* removeIfMatched(
          core.class.Sequence,
          current.space,
          current._id,
          sequenceDeleteQuery(current),
          HulyTransactionScope.make(`huly-mcp:sequence:${sequenceId}`)
        )
    return deleted === "applied"
      ? { sequenceId, deleted: true }
      : yield* new SequenceConcurrentWriteError({ operation: "delete", sequenceId })
  })
