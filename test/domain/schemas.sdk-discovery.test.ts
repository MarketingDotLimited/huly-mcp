import { describe, it } from "@effect/vitest"
import { ClassifierKind } from "@hcengineering/core"
import { Effect, Result, Schema } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../src/utils/assertions.js"

import {
  DescribeHulySpaceTypeCapabilitiesParamsSchema,
  HulyClassRoutingHintSchema,
  ListHulyDomainIndexConfigurationsResultSchema,
  ListHulyPluginConfigurationsResultSchema,
  ListHulySequencesResultSchema
} from "../../src/domain/schemas/sdk-discovery-configurations.js"
import {
  GetHulyClassParamsSchema,
  GetHulyClassResultSchema,
  HulySdkClassifierKindSchema,
  listHulyAttributesParamsJsonSchema,
  ListHulyAttributesParamsSchema,
  ListHulyAttributesResultSchema,
  ListHulyClassesParamsSchema,
  ListHulyClassesResultSchema,
  ListHulyEnumsParamsSchema,
  ListHulyEnumsResultSchema,
  SDK_DISCOVERY_DEFAULT_LIMIT
} from "../../src/domain/schemas/sdk-discovery.js"
import { MAX_LIMIT } from "../../src/domain/schemas/shared.js"

describe("sdk discovery schemas", () => {
  it.effect("maps classifier kinds with the real Huly SDK enum values", () =>
    Effect.gen(function* () {
      const sdkClassifierKindNames = Object.keys(ClassifierKind)
        .filter((key) => Number.isNaN(Number(key)))
        .sort()

      expect(sdkClassifierKindNames).toEqual(["CLASS", "INTERFACE", "MIXIN"])
      expect(ClassifierKind.CLASS).toBe(0)
      expect(ClassifierKind.INTERFACE).toBe(1)
      expect(ClassifierKind.MIXIN).toBe(2)

      expect(yield* Schema.decodeUnknownEffect(HulySdkClassifierKindSchema)(ClassifierKind.CLASS)).toBe("class")
      expect(yield* Schema.decodeUnknownEffect(HulySdkClassifierKindSchema)(ClassifierKind.INTERFACE)).toBe("interface")
      expect(yield* Schema.decodeUnknownEffect(HulySdkClassifierKindSchema)(ClassifierKind.MIXIN)).toBe("mixin")

      expect(yield* Schema.encodeEffect(HulySdkClassifierKindSchema)("class")).toBe(ClassifierKind.CLASS)
      expect(yield* Schema.encodeEffect(HulySdkClassifierKindSchema)("interface")).toBe(ClassifierKind.INTERFACE)
      expect(yield* Schema.encodeEffect(HulySdkClassifierKindSchema)("mixin")).toBe(ClassifierKind.MIXIN)
      expect(Result.isFailure(Schema.decodeUnknownResult(HulySdkClassifierKindSchema)(999))).toBe(true)
    })
  )

  it.effect("validates class discovery params", () =>
    Effect.gen(function* () {
      const params = yield* Schema.decodeUnknownEffect(ListHulyClassesParamsSchema)({
        query: "issue",
        kind: "class",
        domain: "tracker",
        limit: 20
      })

      expect(params).toEqual({ query: "issue", kind: "class", domain: "tracker", limit: 20 })

      expect(() => Schema.decodeUnknownSync(ListHulyClassesParamsSchema)({ query: "   " })).toThrow()
      expect(() => Schema.decodeUnknownSync(ListHulyClassesParamsSchema)({ kind: "document" })).toThrow()
      expect(() => Schema.decodeUnknownSync(ListHulyClassesParamsSchema)({ limit: MAX_LIMIT + 1 })).toThrow()
    })
  )

  it("documents SDK discovery limits from shared constants", () => {
    const jsonSchema = JSON.stringify(listHulyAttributesParamsJsonSchema)

    expect(jsonSchema).toContain(`default: ${SDK_DISCOVERY_DEFAULT_LIMIT}`)
    expect(jsonSchema).toContain(`max: ${MAX_LIMIT}`)
  })

  it.effect("validates get class, attribute, and enum params", () =>
    Effect.gen(function* () {
      expect(yield* Schema.decodeUnknownEffect(GetHulyClassParamsSchema)({ class: "tracker:class:Issue" })).toEqual({
        class: "tracker:class:Issue"
      })
      expect(() => Schema.decodeUnknownSync(GetHulyClassParamsSchema)({ class: "" })).toThrow()
      expect(() => Schema.decodeUnknownSync(ListHulyAttributesParamsSchema)({ class: " " })).toThrow()
      expect(() => Schema.decodeUnknownSync(ListHulyEnumsParamsSchema)({ enum: "" })).toThrow()
    })
  )

  it.effect("encodes discovery result schemas", () =>
    Effect.gen(function* () {
      const classResult = yield* Schema.decodeUnknownEffect(ListHulyClassesResultSchema)({
        classes: [
          {
            classId: "tracker:class:Issue",
            label: "Issue",
            kind: "class",
            directAncestors: [],
            domain: "tracker",
            attributesCount: 1,
            firstClassToolHints: [{ category: "issues", exampleTools: ["list_issues"] }],
            routingHints: []
          }
        ],
        total: 1
      })
      expect(yield* Schema.encodeEffect(ListHulyClassesResultSchema)(classResult)).toEqual({
        classes: [
          {
            classId: "tracker:class:Issue",
            label: "Issue",
            kind: "class",
            directAncestors: [],
            domain: "tracker",
            attributesCount: 1,
            firstClassToolHints: [{ category: "issues", exampleTools: ["list_issues"] }],
            routingHints: []
          }
        ],
        total: 1
      })

      const attributeResult = yield* Schema.decodeUnknownEffect(ListHulyAttributesResultSchema)({
        attributes: [
          {
            attributeId: "attr:issue.assignee",
            name: "assignee",
            label: "Assignee",
            ownerClassId: "tracker:class:Issue",
            ownerClassLabel: "Issue",
            type: {
              kind: "ref",
              classId: "core:class:RefTo",
              refTo: "contact:class:Person",
              raw: { _class: "core:class:RefTo", to: "contact:class:Person" }
            },
            inherited: false
          }
        ],
        total: 1
      })
      expect((yield* Schema.encodeEffect(ListHulyAttributesResultSchema)(attributeResult)).total).toBe(1)
      expect(() =>
        Schema.decodeUnknownSync(ListHulyAttributesResultSchema)({
          attributes: [
            {
              attributeId: "attr:issue.assignee",
              name: "assignee",
              label: "Assignee",
              ownerClassId: "tracker:class:Issue",
              ownerClassLabel: "Issue",
              type: { kind: "ref", raw: { _class: "core:class:RefTo" } },
              inherited: false
            }
          ],
          total: 1
        })
      ).toThrow()

      const getClassResult = yield* Schema.decodeUnknownEffect(GetHulyClassResultSchema)({
        class: assertAt(classResult.classes, 0),
        ancestors: [],
        attributes: attributeResult.attributes
      })
      expect((yield* Schema.encodeEffect(GetHulyClassResultSchema)(getClassResult)).class.classId).toBe(
        "tracker:class:Issue"
      )

      const enumResult = yield* Schema.decodeUnknownEffect(ListHulyEnumsResultSchema)({
        enums: [{ enumId: "enum:priority", name: "Priority", values: ["Low", "High"] }],
        total: 1
      })
      expect(yield* Schema.encodeEffect(ListHulyEnumsResultSchema)(enumResult)).toEqual({
        enums: [{ enumId: "enum:priority", name: "Priority", values: ["Low", "High"] }],
        total: 1
      })
    })
  )

  it("rejects negative and fractional discovery counts", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListHulyClassesResultSchema)({
        classes: [
          {
            classId: "tracker:class:Issue",
            label: "Issue",
            kind: "class",
            directAncestors: [],
            attributesCount: -1,
            firstClassToolHints: [],
            routingHints: []
          }
        ],
        total: 1
      })
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(ListHulyClassesResultSchema)({ classes: [], total: -1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ListHulyAttributesResultSchema)({ attributes: [], total: 1.5 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ListHulyEnumsResultSchema)({ enums: [], total: -1 })).toThrow()
  })

  it.effect("validates new read-only SDK discovery outputs", () =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(ListHulyPluginConfigurationsResultSchema)({
          pluginConfigurations: [
            { pluginId: "tracker", label: "Tracker", enabled: true, beta: false, transactionCount: 3 }
          ],
          total: 1
        })
      ).toMatchObject({ total: 1 })

      expect(
        yield* Schema.decodeUnknownEffect(ListHulyDomainIndexConfigurationsResultSchema)({
          domainIndexConfigurations: [
            {
              domain: "tracker",
              disabled: [{ kind: "field", key: "legacyIndex" }],
              indexes: [{ kind: "sdk-open-metadata", metadata: { keys: "identifier" } }],
              skip: ["transient"]
            }
          ],
          total: 1
        })
      ).toMatchObject({ total: 1 })

      expect(
        yield* Schema.decodeUnknownEffect(ListHulySequencesResultSchema)({
          sequences: [
            { sequenceId: "sequence-issue", attachedClass: "tracker:class:Issue", currentValue: 0, prefix: "ISSUE" }
          ],
          total: 1
        })
      ).toMatchObject({ total: 1 })

      expect(() =>
        Schema.decodeUnknownSync(ListHulySequencesResultSchema)({
          sequences: [{ sequenceId: "sequence-issue", attachedClass: "tracker:class:Issue", currentValue: -1 }],
          total: 1
        })
      ).toThrow()
    })
  )

  it.effect("validates parity routing and space capability params", () =>
    Effect.gen(function* () {
      expect(
        yield* Schema.decodeUnknownEffect(HulyClassRoutingHintSchema)({
          status: "covered",
          safestMcpTools: ["list_issues"],
          rationale: "Issues are covered by first-class issue tools."
        })
      ).toMatchObject({ status: "covered" })
      expect(
        yield* Schema.decodeUnknownEffect(HulyClassRoutingHintSchema)({
          status: "gap",
          backlogIssue: 92,
          rationale: "Tracked by issue 92."
        })
      ).toMatchObject({ status: "gap" })
      expect(() =>
        Schema.decodeUnknownSync(HulyClassRoutingHintSchema)({
          status: "gap",
          safestMcpTools: ["list_issues"],
          rationale: "Impossible state."
        })
      ).toThrow()
      expect(
        yield* Schema.decodeUnknownEffect(DescribeHulySpaceTypeCapabilitiesParamsSchema)({ spaceType: "space-type-1" })
      ).toEqual({ spaceType: "space-type-1" })
    })
  )
})
