import { describe, it } from "@effect/vitest"
import fc from "fast-check"
import { expect } from "vitest"

import { parseCardVersionMetadataFields } from "../../../src/huly/operations/cards-version-history.js"

const nullableBooleanArbitrary = fc.option(fc.boolean(), { nil: null })
const cardVersionChainIdArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,30}$/)
const malformedBooleanArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.array(fc.boolean(), { maxLength: 3 }),
  fc.record({ malformed: fc.boolean() })
)

describe("card version metadata parsing properties", () => {
  it("round-trips every coherent generated version state", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        cardVersionChainIdArbitrary,
        nullableBooleanArbitrary,
        nullableBooleanArbitrary,
        (version, baseId, isLatest, readonly) => {
          const result = parseCardVersionMetadataFields({ version, baseId, isLatest, readonly })

          expect(result).toEqual({
            _tag: "Coherent",
            metadata: {
              number: version,
              chainId: baseId,
              ...(isLatest === null ? {} : { isLatest }),
              ...(readonly === null ? {} : { readonly })
            }
          })
        }
      ),
      { numRuns: 500 }
    )
  })

  it("never collapses a generated partial required-field state into unversioned metadata", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        cardVersionChainIdArbitrary,
        fc.boolean(),
        (version, baseId, omitVersion) => {
          const result = parseCardVersionMetadataFields({
            version: omitVersion ? null : version,
            baseId: omitVersion ? baseId : null
          })

          expect(result._tag).toBe("Degraded")
          if (result._tag !== "Degraded") return
          expect(result.degradedFields).toEqual([omitVersion ? "version" : "baseId"])
          expect(result.resolution).toEqual(
            omitVersion
              ? { _tag: "RecoveredChain", chainId: baseId }
              : { _tag: "Unresolved" }
          )
        }
      ),
      { numRuns: 500 }
    )
  })

  it("preserves coherent required fields while identifying every malformed optional flag", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        cardVersionChainIdArbitrary,
        malformedBooleanArbitrary,
        fc.boolean(),
        fc.boolean(),
        (version, baseId, malformedFlag, malformedIsLatest, preserveOtherFlag) => {
          const result = parseCardVersionMetadataFields({
            version,
            baseId,
            isLatest: malformedIsLatest
              ? malformedFlag
              : preserveOtherFlag
              ? false
              : undefined,
            readonly: malformedIsLatest
              ? preserveOtherFlag ? false : undefined
              : malformedFlag
          })

          expect(result._tag).toBe("Degraded")
          if (result._tag !== "Degraded") return
          expect(result.resolution).toEqual({
            _tag: "RecoveredMetadata",
            metadata: {
              number: version,
              chainId: baseId,
              ...(preserveOtherFlag
                ? malformedIsLatest ? { readonly: false } : { isLatest: false }
                : {})
            }
          })
          expect(result.degradedFields).toEqual([malformedIsLatest ? "isLatest" : "readonly"])
        }
      ),
      { numRuns: 500 }
    )
  })

  it("omits both malformed optional flags from recovered metadata", () => {
    expect(parseCardVersionMetadataFields({
      version: 3,
      baseId: "chain-3",
      isLatest: "yes",
      readonly: "no"
    })).toEqual({
      _tag: "Degraded",
      resolution: {
        _tag: "RecoveredMetadata",
        metadata: { number: 3, chainId: "chain-3" }
      },
      degradedFields: ["isLatest", "readonly"]
    })
  })

  it("reports every malformed field when no version-chain identity can be recovered", () => {
    fc.assert(
      fc.property(malformedBooleanArbitrary, malformedBooleanArbitrary, (isLatest, readonly) => {
        const result = parseCardVersionMetadataFields({
          version: null,
          baseId: null,
          isLatest,
          readonly
        })

        expect(result).toEqual({
          _tag: "Degraded",
          resolution: { _tag: "Unresolved" },
          degradedFields: ["version", "baseId", "isLatest", "readonly"]
        })
      }),
      { numRuns: 500 }
    )
  })
})
