import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { toDraft07JsonSchema, withExactlyOneRequired } from "../../src/domain/schemas/json-schema.js"
import {
  classifyOracleDeltas,
  compareOracleValues,
  createOracleDeltaReport,
  type IntentionalOracleDelta
} from "../../scripts/effect4-oracle-delta.js"
import { validateCurrentDraft07Corpora } from "../../scripts/effect4-oracle-current-corpus.js"
import {
  validateDraft07DiscoveryResult,
  validateDraft07ToolCorpus,
  verifyRuntimeDraft07Agreement
} from "../../scripts/effect4-oracle-draft07.js"
import { EFFECT4_ORACLE_PATH, verifyEffect4Oracle } from "../../scripts/effect4-oracle-io.js"

describe("Effect 4 oracle structural parity", () => {
  it("retains array order and reports escaped JSON Pointer paths", () => {
    expect(compareOracleValues({ tools: [{ name: "a" }, { "a/b~c": true }] }, { tools: [{ name: "b" }] })).toEqual([
      { _tag: "Changed", path: "/tools/0/name", before: "a", after: "b" },
      { _tag: "Removed", path: "/tools/1", before: { "a/b~c": true } }
    ])
    expect(compareOracleValues({ "a/b~c": 1 }, { "a/b~c": 2 })).toEqual([
      { _tag: "Changed", path: "/a~1b~0c", before: 1, after: 2 }
    ])
  })

  it("accepts exact intentional deltas and rejects unexpected or stale entries", () => {
    const deltas = compareOracleValues({ count: 1 }, { count: 2 })
    const exact: ReadonlyArray<IntentionalOracleDelta> = [
      {
        _tag: "Changed",
        path: "/count",
        before: 1,
        after: 2,
        rationale: "Effect 4 intentionally changes this fixture.",
        issue: "#225"
      }
    ]
    expect(classifyOracleDeltas(deltas, exact)).toEqual({ unexpected: [], stale: [], duplicateIntentional: [] })
    expect(classifyOracleDeltas(deltas, [])).toEqual({ unexpected: deltas, stale: [], duplicateIntentional: [] })
    expect(classifyOracleDeltas([], exact)).toEqual({ unexpected: [], stale: exact, duplicateIntentional: [] })
    expect(classifyOracleDeltas(deltas, [...exact, ...exact]).duplicateIntentional).toEqual(exact)
    expect(createOracleDeltaReport(deltas, exact)).toMatchObject({ bySurface: { count: 1 }, total: 1 })
  })

  it("rejects unexpected and stale deltas through the file verifier", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "effect4-oracle-parity-"))
    try {
      const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
      await fs.mkdir(path.dirname(oraclePath), { recursive: true })
      await fs.writeFile(oraclePath, '{"count":1}\n', "utf8")
      await expect(verifyEffect4Oracle(root, '{"count":2}\n')).rejects.toThrow("/count")
      await expect(verifyEffect4Oracle(root, '{"count":1}\n')).resolves.toBe(oraclePath)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe("Effect 4 oracle Draft-07 validation", () => {
  const RuntimeFixture = Schema.Struct({
    code: Schema.NonEmptyString,
    count: Schema.Int,
    pair: Schema.Tuple([Schema.String, Schema.Number])
  })
  const RuntimeFixtureJsonSchema = toDraft07JsonSchema(RuntimeFixture)

  it("compiles the complete current native and proxy corpora without CLI imports", () => {
    expect(validateCurrentDraft07Corpora()).toEqual({ native: 524, proxy: 6 })
  }, 60_000)

  it("compiles complete tool documents and rejects duplicate names or dialect leaks", () => {
    const outputSchema = toDraft07JsonSchema(Schema.Struct({ accepted: Schema.Boolean }))
    expect(
      validateDraft07ToolCorpus([{ name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema }])
    ).toHaveLength(1)
    expect(
      validateDraft07DiscoveryResult({
        tools: [{ name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema }]
      })
    ).toBe(1)
    expect(() =>
      validateDraft07ToolCorpus([
        { name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema },
        { name: "fixture", inputSchema: RuntimeFixtureJsonSchema, outputSchema }
      ])
    ).toThrow("duplicate tool")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "newer-dialect",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "array", prefixItems: [] },
          outputSchema
        }
      ])
    ).toThrow("prefixItems")
    expect(() =>
      validateDraft07ToolCorpus([
        {
          name: "missing-ref",
          inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", $ref: "#/$defs/Missing" },
          outputSchema
        }
      ])
    ).toThrow("unresolved local ref")
  })

  it("resolves escaped JSON Pointer definition names", () => {
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $defs: { "A/B~C": { type: "string" } },
      $ref: "#/$defs/A~1B~0C"
    }
    expect(validateDraft07ToolCorpus([{ name: "escaped", inputSchema: schema, outputSchema: schema }])).toHaveLength(1)
  })

  it("proves representative runtime parsing agrees with emitted Draft-07", () => {
    verifyRuntimeDraft07Agreement({
      name: "struct-refinement-tuple",
      schema: RuntimeFixture,
      jsonSchema: RuntimeFixtureJsonSchema,
      samples: [
        { code: "A", count: 1, pair: ["left", 2] },
        { code: "", count: 1, pair: ["left", 2] },
        { code: "A", count: 1.5, pair: ["left", 2] },
        { code: "A", count: 1, pair: ["left"] }
      ]
    })
  })

  it("proves authored cross-field constraints agree with the matching runtime rule", () => {
    const SourceFixture = Schema.Struct({
      filePath: Schema.optionalKey(Schema.String),
      fileUrl: Schema.optionalKey(Schema.String)
    }).pipe(
      Schema.check(
        Schema.makeFilter((value) =>
          (value.filePath === undefined) !== (value.fileUrl === undefined) ? undefined : "Provide exactly one source."
        )
      )
    )
    const authored = withExactlyOneRequired(toDraft07JsonSchema(SourceFixture), ["filePath", "fileUrl"])
    expect(
      validateDraft07ToolCorpus([
        {
          name: "authored",
          inputSchema: authored,
          outputSchema: toDraft07JsonSchema(Schema.Struct({ accepted: Schema.Boolean }))
        }
      ])
    ).toHaveLength(1)
    verifyRuntimeDraft07Agreement({
      name: "authored-exactly-one",
      schema: SourceFixture,
      jsonSchema: authored,
      samples: [
        { filePath: "/tmp/a" },
        { fileUrl: "https://example.test/a" },
        {},
        { filePath: "/tmp/a", fileUrl: "https://example.test/a" }
      ]
    })
  })
})
