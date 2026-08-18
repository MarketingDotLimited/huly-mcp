/** Await a Promise while allowing the owning Effect fiber to stop waiting on abort. */
export const awaitAbortably = <A>(promise: Promise<A>, signal: AbortSignal, message: string): Promise<A> =>
  new Promise((resolve, reject) => {
    const abort = (): void => reject(new Error(message))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (cause: unknown) => {
        signal.removeEventListener("abort", abort)
        reject(cause)
      }
    )
  })
