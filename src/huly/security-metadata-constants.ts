import { NonEmptyString } from "../domain/schemas/shared.js"
import { HULY_MODEL_ID_SEPARATOR } from "./huly-labels.js"

export const RoleAssignmentEditor = NonEmptyString.make("setting:component:RoleAssignmentEditor")

export const hasNamespacedModelId = (id: string): boolean => id.includes(HULY_MODEL_ID_SEPARATOR)
