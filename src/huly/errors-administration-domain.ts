import { Schema } from "effect"

import { ModelAdministrationDomainError } from "./errors-model-administration.js"
import { SecurityAdministrationDomainError } from "./errors-security-administration.js"

export const AdministrationDomainError = Schema.Union(ModelAdministrationDomainError, SecurityAdministrationDomainError)
