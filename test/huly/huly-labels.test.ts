import { describe, expect, it } from "vitest"

import { decodeHulyModelLabelTail, HULY_MODEL_ID_SEPARATOR, hulyModelLabelTail } from "../../src/huly/huly-labels.js"
import { tracker } from "../../src/huly/huly-plugins.js"

describe("Huly label helpers", () => {
  it("uses the SDK namespace separator to display the final label segment", () => {
    expect(HULY_MODEL_ID_SEPARATOR).toBe(":")
    expect(String(tracker.class.Issue)).toBe("tracker:class:Issue")
    expect(hulyModelLabelTail(tracker.class.Issue)).toBe("Issue")
    const decoded = decodeHulyModelLabelTail(tracker.class.Issue)
    expect(decoded._tag).toBe("Success")
    if (decoded._tag === "Success") expect(decoded.success).toBe("Issue")
  })

  it("preserves non-namespaced string labels", () => {
    expect(hulyModelLabelTail("Plain Label")).toBe("Plain Label")
  })

  it("rejects non-string labels instead of coercing them", () => {
    expect(decodeHulyModelLabelTail(undefined)._tag).toBe("Failure")
    expect(decodeHulyModelLabelTail(123)._tag).toBe("Failure")
    expect(decodeHulyModelLabelTail({ label: "Issue" })._tag).toBe("Failure")
  })
})
