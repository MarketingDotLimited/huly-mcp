import { businessReadOnlyCliCommandCatalogA } from "./catalog-read-only-business-a.js"
import { businessReadOnlyCliCommandCatalogB } from "./catalog-read-only-business-b.js"
import { collaborationReadOnlyCliCommandCatalog } from "./catalog-read-only-collaboration.js"
import { coreReadOnlyCliCommandCatalog } from "./catalog-read-only-core.js"
import { platformReadOnlyCliCommandCatalog } from "./catalog-read-only-platform.js"

export const readOnlyCliCommandCatalog = {
  ...coreReadOnlyCliCommandCatalog,
  ...collaborationReadOnlyCliCommandCatalog,
  ...businessReadOnlyCliCommandCatalogA,
  ...businessReadOnlyCliCommandCatalogB,
  ...platformReadOnlyCliCommandCatalog
} as const
