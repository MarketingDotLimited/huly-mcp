import { Schema } from "effect"

import { PersonId } from "../../domain/schemas/shared.js"

const PrimarySocialIdentityProjectionSchema = Schema.Struct({ _id: PersonId, attachedTo: PersonId })

export const parsePrimarySocialIdentityProjection = Schema.decodeUnknownEffect(PrimarySocialIdentityProjectionSchema)
