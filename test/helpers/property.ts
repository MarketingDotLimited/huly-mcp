import { Result, Schema } from "effect"
import type { Parameters } from "fast-check"

const DEFAULT_NUM_RUNS = 100

export const propertyTestParameters = { numRuns: DEFAULT_NUM_RUNS } satisfies Parameters

export const assertDecodeSuccess = <A, I>(schema: Schema.Codec<A, I>, input: unknown): A => {
  const result = Schema.decodeUnknownResult(schema)(input)

  if (Result.isFailure(result)) {
    throw new Error(`Expected schema decode to succeed, got: ${String(result.failure)}`)
  }

  return result.success
}

export const assertDecodeFailure = <A, I>(schema: Schema.Codec<A, I>, input: unknown): void => {
  const result = Schema.decodeUnknownResult(schema)(input)

  if (Result.isSuccess(result)) {
    throw new Error(`Expected schema decode to fail, got: ${String(result.success)}`)
  }
}

export const assertEncodeSuccess = <A, I>(schema: Schema.Codec<A, I>, value: A): I => {
  const result = Schema.encodeResult(schema)(value)

  if (Result.isFailure(result)) {
    throw new Error(`Expected schema encode to succeed, got: ${String(result.failure)}`)
  }

  return result.success
}

export const assertEncodeFailure = <A, I>(schema: Schema.Codec<A, I>, value: A): void => {
  const result = Schema.encodeResult(schema)(value)

  if (Result.isSuccess(result)) {
    throw new Error(`Expected schema encode to fail, got: ${String(result.success)}`)
  }
}
