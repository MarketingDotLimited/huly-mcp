export const CLI_PARITY_BASELINE = {
  registryOperations: 522,
  cliRoutes: 451,
  ignoredOperations: 71,
  directLiveCases: 68,
  deferredLiveCases: 383
} as const

export const CLI_PARITY_TARGET = { ignoredOperations: 0, routesPerRegistryOperation: 1 } as const

export const CLI_BEHAVIOR_CLASSES = [
  "scalar-input",
  "structured-json-input",
  "nullable-clear-input",
  "text-file-input",
  "upload-input",
  "structured-output",
  "binary-output",
  "image-output",
  "agent-warning",
  "typed-error",
  "consequential-confirmation",
  "workspace-administration"
] as const

export type CliBehaviorClass = (typeof CLI_BEHAVIOR_CLASSES)[number]

export const CLI_DEDICATED_LIVE_RISK_CLASSES = [
  "transport",
  "safety",
  "privacy",
  "workspace-client",
  "lifecycle"
] as const

export type CliDedicatedLiveRiskClass = (typeof CLI_DEDICATED_LIVE_RISK_CLASSES)[number]
