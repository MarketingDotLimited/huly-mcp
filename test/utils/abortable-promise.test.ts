import { describe, expect, it } from "vitest"

import { awaitAbortably } from "../../src/utils/abortable-promise.js"

describe("awaitAbortably", () => {
  it("preserves Promise success and failure", async () => {
    await expect(awaitAbortably(Promise.resolve("done"), new AbortController().signal, "aborted")).resolves.toBe("done")
    await expect(
      awaitAbortably(Promise.reject(new Error("failed")), new AbortController().signal, "aborted")
    ).rejects.toThrow("failed")
  })

  it("rejects when already aborted or aborted while pending", async () => {
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    await expect(awaitAbortably(Promise.resolve("late"), alreadyAborted.signal, "already stopped")).rejects.toThrow(
      "already stopped"
    )

    const pendingAbort = new AbortController()
    const pending = awaitAbortably(new Promise<never>(() => {}), pendingAbort.signal, "stopped while pending")
    pendingAbort.abort()
    await expect(pending).rejects.toThrow("stopped while pending")
  })
})
