import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { normalizeForComparison } from "../../src/utils/normalize.js"
import { concatLink } from "../../src/utils/url.js"
import { propertyTestParameters } from "../helpers/property.js"

const hostArbitrary = fc.stringMatching(/^https:\/\/[a-z][a-z0-9-]{0,12}\.example$/)
const pathSegmentArbitrary = fc.stringMatching(/^[a-z][a-z0-9._-]{0,16}$/)
const separatorArbitrary = fc.constantFrom("-", "_", " ")

const withInsertedSeparators = (value: string, separator: string): string => value.split("").join(separator)

describe("URL and normalization utility properties", () => {
  it("concatLink normalizes exactly one slash between host and path for canonical inputs", () => {
    fc.assert(
      fc.property(
        hostArbitrary,
        pathSegmentArbitrary,
        fc.boolean(),
        fc.boolean(),
        (host, path, hostSlash, pathSlash) => {
          const inputHost = hostSlash ? `${host}/` : host
          const inputPath = pathSlash ? `/${path}` : path

          expect(concatLink(inputHost, inputPath)).toBe(`${host}/${path}`)
        }
      ),
      propertyTestParameters
    )
  })

  it("concatLink preserves query and fragment text after the path boundary", () => {
    fc.assert(
      fc.property(
        hostArbitrary,
        pathSegmentArbitrary,
        fc.stringMatching(/^[a-z0-9_=&-]{0,20}$/),
        fc.stringMatching(/^[a-z0-9_-]{0,12}$/),
        (host, path, query, fragment) => {
          const suffix = `?${query}#${fragment}`

          expect(concatLink(`${host}/`, `${path}${suffix}`)).toBe(`${host}/${path}${suffix}`)
        }
      ),
      propertyTestParameters
    )
  })

  it("normalizeForComparison is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (value) => {
        const normalized = normalizeForComparison(value)

        expect(normalizeForComparison(normalized)).toBe(normalized)
      }),
      propertyTestParameters
    )
  })

  it("normalizeForComparison ignores case and separator insertion", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z0-9]{1,24}$/), separatorArbitrary, (value, separator) => {
        const separatedUppercase = withInsertedSeparators(value.toUpperCase(), separator)

        expect(normalizeForComparison(separatedUppercase)).toBe(value.toLowerCase())
      }),
      propertyTestParameters
    )
  })
})
