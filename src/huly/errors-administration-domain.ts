import { Schema } from "effect"

import { ModelAdministrationDomainError } from "./errors-model-administration.js"
import { SecurityAdministrationDomainError } from "./errors-security-administration.js"
import { SequenceAdministrationDomainError } from "./errors-sequence-administration.js"

export const AdministrationDomainError = Schema.Union(
  ModelAdministrationDomainError,
  SecurityAdministrationDomainError,
  SequenceAdministrationDomainError
)
