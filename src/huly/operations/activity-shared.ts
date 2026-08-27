import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"
import { Effect, Schema } from "effect"

import { ActivityActionSchema, ActivityCount, type ActivityMessage } from "../../domain/schemas/activity.js"
import { ActivityMarkdown, ActivityMarkup } from "../../domain/schemas/domain-values.js"
import {
  ActivityMessageId,
  Count,
  DocId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  Timestamp
} from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { ActivityMessageNotFoundError, ActivityRecordInvalidError } from "../errors.js"
import { activity } from "../huly-plugins.js"
import { markupToMarkdownString } from "./markup.js"
import { findOneOrFail, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const HulyActivityRecordSchema = Schema.Struct({
  _id: ActivityMessageId,
  _class: Schema.optional(Schema.NullOr(ObjectClassName)),
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  modifiedBy: Schema.optional(Schema.NullOr(PersonId)),
  modifiedOn: Schema.optional(Schema.NullOr(Timestamp)),
  isPinned: Schema.optional(Schema.NullOr(Schema.Boolean)),
  replies: Schema.optional(Schema.NullOr(ActivityCount)),
  reactions: Schema.optional(Schema.NullOr(ActivityCount)),
  editedOn: Schema.optional(Schema.NullOr(Timestamp)),
  action: Schema.optional(Schema.NullOr(ActivityActionSchema)),
  message: Schema.optional(Schema.NullOr(ActivityMarkup)),
  srcDocId: Schema.optional(Schema.NullOr(DocId)),
  srcDocClass: Schema.optional(Schema.NullOr(ObjectClassName)),
  attachedDocId: Schema.optional(Schema.NullOr(DocId)),
  attachedDocClass: Schema.optional(Schema.NullOr(ObjectClassName))
})

type HulyActivityRecord = Schema.Schema.Type<typeof HulyActivityRecordSchema>

const activityMetadataFields = (msg: HulyActivityRecord) => ({
  ...(msg._class === undefined || msg._class === null ? {} : { messageClass: msg._class }),
  ...(msg.modifiedBy === undefined || msg.modifiedBy === null ? {} : { modifiedBy: msg.modifiedBy }),
  ...(msg.modifiedOn === undefined || msg.modifiedOn === null ? {} : { modifiedOn: msg.modifiedOn }),
  ...(msg.editedOn === undefined ? {} : { editedOn: msg.editedOn })
})

const activityCountFields = (msg: HulyActivityRecord) => ({
  ...(msg.isPinned === undefined || msg.isPinned === null ? {} : { isPinned: msg.isPinned }),
  ...(msg.replies === undefined || msg.replies === null ? {} : { replies: msg.replies }),
  ...(msg.reactions === undefined || msg.reactions === null ? {} : { reactions: msg.reactions })
})

const activityContentFields = (
  msg: HulyActivityRecord,
  markdownBody: ActivityMarkdown | undefined,
  isDocUpdate: boolean
) => ({
  ...(!isDocUpdate || msg.action === undefined || msg.action === null ? {} : { action: msg.action }),
  ...(msg.message === undefined || msg.message === null ? {} : { message: msg.message }),
  ...(markdownBody === undefined ? {} : { body: markdownBody })
})

const activitySourceReferenceFields = (msg: HulyActivityRecord, isReference: boolean) => ({
  ...(!isReference || msg.srcDocId === undefined || msg.srcDocId === null ? {} : { srcDocId: msg.srcDocId }),
  ...(!isReference || msg.srcDocClass === undefined || msg.srcDocClass === null ? {} : { srcDocClass: msg.srcDocClass })
})

const activityAttachedReferenceFields = (msg: HulyActivityRecord, isReference: boolean) => ({
  ...(!isReference || msg.attachedDocId === undefined || msg.attachedDocId === null
    ? {}
    : { attachedDocId: msg.attachedDocId }),
  ...(!isReference || msg.attachedDocClass === undefined || msg.attachedDocClass === null
    ? {}
    : { attachedDocClass: msg.attachedDocClass })
})

export const toActivityMessage = (
  value: unknown,
  markupUrlConfig: HulyClient["Service"]["markupUrlConfig"],
  operation: ActivityRecordInvalidError["operation"],
  recordIndex: Count
): Effect.Effect<ActivityMessage, ActivityRecordInvalidError> =>
  Effect.gen(function* () {
    const invalidRecord = (details: string) =>
      new ActivityRecordInvalidError({ operation, recordIndex, details: NonEmptyString.make(details) })
    const msg = yield* Schema.decodeUnknownEffect(HulyActivityRecordSchema)(value).pipe(
      Effect.mapError((parseError) => invalidRecord(parseError.message))
    )
    const message = msg.message
    const markdownBody =
      message === undefined || message === null
        ? undefined
        : yield* markupToMarkdownString(message, markupUrlConfig, {
            operation,
            entity: `activity record ${recordIndex} message`
          }).pipe(
            Effect.map((markdown) => ActivityMarkdown.make(markdown)),
            Effect.mapError((cause) => invalidRecord(cause.message))
          )
    const isReference = msg._class === ObjectClassName.make(activity.class.ActivityReference)
    const isDocUpdate = msg._class === ObjectClassName.make(activity.class.DocUpdateMessage)

    return {
      id: msg._id,
      objectId: msg.attachedTo,
      objectClass: msg.attachedToClass,
      ...activityMetadataFields(msg),
      ...activityCountFields(msg),
      ...activityContentFields(msg, markdownBody, isDocUpdate),
      ...activitySourceReferenceFields(msg, isReference),
      ...activityAttachedReferenceFields(msg, isReference)
    }
  })

export const toActivityMessages = (
  values: ReadonlyArray<unknown>,
  markupUrlConfig: HulyClient["Service"]["markupUrlConfig"],
  operation: ActivityRecordInvalidError["operation"]
): Effect.Effect<Array<ActivityMessage>, ActivityRecordInvalidError> =>
  Effect.forEach(values, (value, recordIndex) =>
    toActivityMessage(value, markupUrlConfig, operation, Count.make(recordIndex))
  )

export const findActivityMessage = (client: HulyClient["Service"], messageId: ActivityMessageId) =>
  findOneOrFail(
    client,
    activity.class.ActivityMessage,
    hulyQuery<HulyActivityMessage>({ _id: toRef<HulyActivityMessage>(messageId) }),
    () => new ActivityMessageNotFoundError({ messageId })
  )
