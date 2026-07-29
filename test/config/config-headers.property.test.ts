import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as fc from "fast-check"
import { expect } from "vitest"

import { hulyConfigProviderFromHeaders } from "../../src/config/config.js"
import { HULY_CONFIG_HEADERS, REQUIRED_HULY_CONFIG_HEADERS } from "../../src/config/huly-config-constants.js"
import { propertyTestParameters } from "../helpers/property.js"

const headerValueArbitrary = fc.string({ minLength: 1, maxLength: 80 })
const supportedHeaderArbitrary = fc.constantFrom(...HULY_CONFIG_HEADERS)
const requiredHeaderArbitrary = fc.constantFrom(...REQUIRED_HULY_CONFIG_HEADERS)
const unsupportedHulyHeaderArbitrary = fc
  .stringMatching(/^x-huly-[a-z0-9-]{1,20}$/)
  .filter((name) => !HULY_CONFIG_HEADERS.includes(name))
const nonHulyHeaderNameArbitrary = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
  .filter((name) => !name.toLowerCase().startsWith("x-huly-"))

const completeSupportedHeadersArbitrary = fc
  .record({
    url: headerValueArbitrary,
    workspace: headerValueArbitrary,
    token: headerValueArbitrary,
    timeout: fc.option(headerValueArbitrary, { nil: undefined })
  })
  .map(({ timeout, token, url, workspace }) => ({
    "x-huly-url": url,
    "x-huly-workspace": workspace,
    "x-huly-token": token,
    ...(timeout === undefined ? {} : { "x-huly-connection-timeout": timeout })
  }))

const partialSupportedHeaderSubsetArbitrary = fc.oneof(
  fc.constant(["x-huly-connection-timeout"]),
  fc.subarray([...REQUIRED_HULY_CONFIG_HEADERS], { minLength: 2, maxLength: 2 }),
  fc
    .subarray([...HULY_CONFIG_HEADERS], { minLength: 1 })
    .filter((headers) => !REQUIRED_HULY_CONFIG_HEADERS.every((requiredHeader) => headers.includes(requiredHeader)))
)

const partialSupportedHeadersArbitrary = fc
  .tuple(
    partialSupportedHeaderSubsetArbitrary,
    fc.array(headerValueArbitrary, { minLength: HULY_CONFIG_HEADERS.length, maxLength: HULY_CONFIG_HEADERS.length })
  )
  .map(([headers, values]) => Object.fromEntries(headers.map((header, index) => [header, values[index]])))

const runProvider = (headers: unknown) => Effect.runPromise(hulyConfigProviderFromHeaders(headers))

const expectConfigValidationFailure = async (headers: unknown): Promise<void> => {
  const result = await Effect.runPromiseExit(hulyConfigProviderFromHeaders(headers))
  expect(result._tag).toBe("Failure")
}

const differentCasing = (header: string): string => header.replace("x-huly", "X-Huly")

describe("hulyConfigProviderFromHeaders properties", () => {
  it("returns undefined for arbitrary non-Huly headers", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(nonHulyHeaderNameArbitrary, headerValueArbitrary, { maxKeys: 8 }),
        async (headers) => {
          await expect(runProvider(headers)).resolves.toBeUndefined()
        }
      ),
      propertyTestParameters
    )
  })

  it("returns a provider when all required supported headers are single string values", async () => {
    await fc.assert(
      fc.asyncProperty(completeSupportedHeadersArbitrary, async (headers) => {
        await expect(runProvider(headers)).resolves.toBeDefined()
      }),
      propertyTestParameters
    )
  })

  it("fails for unsupported x-huly-* headers", async () => {
    await fc.assert(
      fc.asyncProperty(
        completeSupportedHeadersArbitrary,
        unsupportedHulyHeaderArbitrary,
        headerValueArbitrary,
        async (headers, unsupportedHeader, value) => {
          await expectConfigValidationFailure({ ...headers, [unsupportedHeader]: value })
        }
      ),
      propertyTestParameters
    )
  })

  it("fails when the same supported header appears with duplicate casing", async () => {
    await fc.assert(
      fc.asyncProperty(
        completeSupportedHeadersArbitrary,
        supportedHeaderArbitrary,
        headerValueArbitrary,
        headerValueArbitrary,
        async (headers, header, originalValue, duplicateValue) => {
          await expectConfigValidationFailure({
            ...headers,
            [header]: originalValue,
            [differentCasing(header)]: duplicateValue
          })
        }
      ),
      propertyTestParameters
    )
  })

  it("fails when required supported headers are arrays or undefined", async () => {
    await fc.assert(
      fc.asyncProperty(
        completeSupportedHeadersArbitrary,
        requiredHeaderArbitrary,
        fc.oneof(fc.array(headerValueArbitrary, { minLength: 1, maxLength: 3 }), fc.constant(undefined)),
        async (headers, header, invalidValue) => {
          await expectConfigValidationFailure({ ...headers, [header]: invalidValue })
        }
      ),
      propertyTestParameters
    )
  })

  it("fails for any non-empty supported header subset missing at least one required header", async () => {
    await fc.assert(
      fc.asyncProperty(partialSupportedHeadersArbitrary, async (headers) => {
        expect(Object.keys(headers).length).toBeGreaterThan(0)
        expect(REQUIRED_HULY_CONFIG_HEADERS.every((header) => header in headers)).toBe(false)
        await expectConfigValidationFailure(headers)
      }),
      propertyTestParameters
    )
  })
})
