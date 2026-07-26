import type { CardVersionChainId, CardVersionMetadata } from "../../domain/schemas/card-versions.js"

// This raw boundary-adjacent shape is intentionally not schema-derived: each
// field must be decoded independently so partial Huly metadata remains
// distinguishable from wholly absent metadata.
export interface CardVersionMetadataFields {
  readonly version?: unknown
  readonly baseId?: unknown
  readonly isLatest?: unknown
  readonly readonly?: unknown
}

export type CardVersionMetadataField = keyof CardVersionMetadataFields

export type OptionalDegradedFields =
  | readonly []
  | readonly ["isLatest"]
  | readonly ["readonly"]
  | readonly ["isLatest", "readonly"]

type MetadataWithout<K extends "isLatest" | "readonly"> =
  & Omit<CardVersionMetadata, K>
  & { readonly [P in K]?: never }

type RecoveredMetadataDegradation =
  | {
    readonly resolution: {
      readonly _tag: "RecoveredMetadata"
      readonly metadata: MetadataWithout<"isLatest">
    }
    readonly degradedFields: readonly ["isLatest"]
  }
  | {
    readonly resolution: {
      readonly _tag: "RecoveredMetadata"
      readonly metadata: MetadataWithout<"readonly">
    }
    readonly degradedFields: readonly ["readonly"]
  }
  | {
    readonly resolution: {
      readonly _tag: "RecoveredMetadata"
      readonly metadata: MetadataWithout<"isLatest" | "readonly">
    }
    readonly degradedFields: readonly ["isLatest", "readonly"]
  }

export type CoherentCardVersionMetadata = {
  readonly _tag: "Coherent"
  readonly metadata: CardVersionMetadata
}

export type RecoveredCardVersionMetadata = {
  readonly _tag: "Degraded"
} & RecoveredMetadataDegradation

export type ParsedCardVersionMetadata =
  | { readonly _tag: "Absent" }
  | CoherentCardVersionMetadata
  | RecoveredCardVersionMetadata
  | {
    readonly _tag: "Degraded"
    readonly resolution: {
      readonly _tag: "RecoveredChain"
      readonly chainId: CardVersionChainId
    }
    readonly degradedFields: readonly ["version", ...OptionalDegradedFields]
  }
  | {
    readonly _tag: "Degraded"
    readonly resolution: { readonly _tag: "Unresolved" }
    readonly degradedFields:
      | readonly ["baseId", ...OptionalDegradedFields]
      | readonly ["version", "baseId", ...OptionalDegradedFields]
  }
