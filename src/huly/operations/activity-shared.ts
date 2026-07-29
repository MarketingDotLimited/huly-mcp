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

export const toActivityMessage = (
  value: unknown,
  markupUrlConfig: HulyClient["Type"]["markupUrlConfig"],
  operation: ActivityRecordInvalidError["operation"],
  recordIndex: Count
): Effect.Effect<ActivityMessage, ActivityRecordInvalidError> =>
  Effect.gen(function* () {
    const invalidRecord = (details: string) =>
      new ActivityRecordInvalidError({ operation, recordIndex, details: NonEmptyString.make(details) })
    const msg = yield* Schema.decodeUnknown(HulyActivityRecordSchema)(value).pipe(
      Effect.mapError((parseError) => invalidRecord(parseError.message))
    )
    const message = msg.message
    const markdownBody =
      message === undefined || message === null
        ? undefined
        : yield* Effect.try({
            try: () => ActivityMarkdown.make(markupToMarkdownString(message, markupUrlConfig)),
            catch: (cause) =>
              invalidRecord(
                `message markup could not be converted to Markdown: ${
                  cause instanceof Error ? cause.message : "unsupported markup"
                }`
              )
          })
    const isReference = msg._class === ObjectClassName.make(activity.class.ActivityReference)
    const isDocUpdate = msg._class === ObjectClassName.make(activity.class.DocUpdateMessage)

    return {
      id: msg._id,
      objectId: msg.attachedTo,
      objectClass: msg.attachedToClass,
      ...(msg._class === undefined || msg._class === null ? {} : { messageClass: msg._class }),
      ...(msg.modifiedBy === undefined || msg.modifiedBy === null ? {} : { modifiedBy: msg.modifiedBy }),
      ...(msg.modifiedOn === undefined || msg.modifiedOn === null ? {} : { modifiedOn: msg.modifiedOn }),
      ...(msg.isPinned === undefined || msg.isPinned === null ? {} : { isPinned: msg.isPinned }),
      ...(msg.replies === undefined || msg.replies === null ? {} : { replies: msg.replies }),
      ...(msg.reactions === undefined || msg.reactions === null ? {} : { reactions: msg.reactions }),
      ...(msg.editedOn === undefined ? {} : { editedOn: msg.editedOn }),
      ...(!isDocUpdate || msg.action === undefined || msg.action === null ? {} : { action: msg.action }),
      ...(message === undefined || message === null ? {} : { message }),
      ...(markdownBody === undefined ? {} : { body: markdownBody }),
      ...(!isReference || msg.srcDocId === undefined || msg.srcDocId === null ? {} : { srcDocId: msg.srcDocId }),
      ...(!isReference || msg.srcDocClass === undefined || msg.srcDocClass === null
        ? {}
        : { srcDocClass: msg.srcDocClass }),
      ...(!isReference || msg.attachedDocId === undefined || msg.attachedDocId === null
        ? {}
        : { attachedDocId: msg.attachedDocId }),
      ...(!isReference || msg.attachedDocClass === undefined || msg.attachedDocClass === null
        ? {}
        : { attachedDocClass: msg.attachedDocClass })
    }
  })

export const toActivityMessages = (
  values: ReadonlyArray<unknown>,
  markupUrlConfig: HulyClient["Type"]["markupUrlConfig"],
  operation: ActivityRecordInvalidError["operation"]
): Effect.Effect<Array<ActivityMessage>, ActivityRecordInvalidError> =>
  Effect.forEach(values, (value, recordIndex) =>
    toActivityMessage(value, markupUrlConfig, operation, Count.make(recordIndex))
  )

export const findActivityMessage = (client: HulyClient["Type"], messageId: ActivityMessageId) =>
  findOneOrFail(
    client,
    activity.class.ActivityMessage,
    hulyQuery<HulyActivityMessage>({ _id: toRef<HulyActivityMessage>(messageId) }),
    () => new ActivityMessageNotFoundError({ messageId })
  )
