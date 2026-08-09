import { parityBusinessCliCommandCatalog } from "./catalog-parity-business.js"
import { parityCollaborationCliCommandCatalog } from "./catalog-parity-collaboration.js"
import { parityCoreCliCommandCatalog } from "./catalog-parity-core.js"
import { parityPlatformCliCommandCatalog } from "./catalog-parity-platform.js"

export const parityCliCommandCatalog = {
  ...parityCoreCliCommandCatalog,
  ...parityCollaborationCliCommandCatalog,
  ...parityBusinessCliCommandCatalog,
  ...parityPlatformCliCommandCatalog
} as const
