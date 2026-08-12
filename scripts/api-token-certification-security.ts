import { Redacted, Schema } from "effect"

import { NonNegativeInteger } from "../src/domain/schemas/shared.js"

export const CertificationSecretSafetySchema = Schema.Struct({
  capturedArtifactsChecked: NonNegativeInteger,
  secretDetected: Schema.Boolean
})
export type CertificationSecretSafety = Schema.Schema.Type<typeof CertificationSecretSafetySchema>

export const CertificationCaptureSourceSchema = Schema.Literals([
  "tool-error",
  "transport-error",
  "stdio-stderr",
  "http-stderr",
  "http-stdout"
])
export type CertificationCaptureSource = Schema.Schema.Type<typeof CertificationCaptureSourceSchema>

export const redactCertificationSecret = (text: string, token: Redacted.Redacted<string>): string =>
  text.split(Redacted.value(token)).join("[REDACTED]")

export class CertificationCaptureLedger {
  readonly #diagnostics: Array<string> = []
  readonly #pendingBySource = new Map<CertificationCaptureSource, string>()
  readonly #token: Redacted.Redacted<string>
  #capturedArtifactsChecked = 0
  #secretDetected = false

  constructor(token: Redacted.Redacted<string>) {
    this.#token = token
  }

  #detect(text: string): void {
    if (text.includes(Redacted.value(this.#token))) this.#secretDetected = true
  }

  #retainDiagnostic(source: CertificationCaptureSource, text: string): void {
    const sanitized = redactCertificationSecret(text, this.#token).trim()
    if (sanitized.length > 0) this.#diagnostics.push(`${source}: ${sanitized}`)
  }

  observe(source: CertificationCaptureSource, text: string): void {
    this.#capturedArtifactsChecked += 1
    const combined = `${this.#pendingBySource.get(source) ?? ""}${text}`
    this.#detect(combined)
    const pendingStart = combined.lastIndexOf("\n") + 1
    const pending = combined.slice(pendingStart)
    const completeLines = combined.slice(0, pendingStart).split("\n")
    this.#pendingBySource.set(source, pending)
    for (const line of completeLines) this.#retainDiagnostic(source, line)
  }

  inspect(text: string): void {
    this.#capturedArtifactsChecked += 1
    this.#detect(text)
  }

  #flushPending(): void {
    for (const [source, pending] of this.#pendingBySource) this.#retainDiagnostic(source, pending)
    this.#pendingBySource.clear()
  }

  diagnostics(): ReadonlyArray<string> {
    return [...this.#diagnostics]
  }

  summary(): CertificationSecretSafety {
    this.#flushPending()
    return { capturedArtifactsChecked: this.#capturedArtifactsChecked, secretDetected: this.#secretDetected }
  }
}
