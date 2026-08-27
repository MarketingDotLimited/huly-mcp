import { Schema } from "effect"

import {
  HulyAuthError,
  HulyConnectionError,
  HulyDataInvalidError,
  HulyError,
  HulyModelMetadataError,
  HulyUnavailableError,
  NoUpdateFieldsError
} from "./errors-base.js"

export const HulyDomainBaseError = Schema.Union([
  HulyError,
  NoUpdateFieldsError,
  HulyConnectionError,
  HulyDataInvalidError,
  HulyUnavailableError,
  HulyAuthError,
  HulyModelMetadataError
])
