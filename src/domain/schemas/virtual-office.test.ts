import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  GetMeetingMinutesParamsSchema,
  GetOfficeRoomParamsSchema,
  ListActiveRoomParticipantsParamsSchema,
  ListMeetingMinutesParamsSchema,
  ListOfficeRoomsParamsSchema,
  RoomAccessSchema,
  getMeetingMinutesParamsJsonSchema,
  listMeetingMinutesParamsJsonSchema,
  listOfficeRoomsParamsJsonSchema,
  RoomTypeSchema
} from "./virtual-office.js"
import { parseJsonSchemaRecord } from "./json-schema.js"

const propertyDescription = (schema: object, field: string): unknown => {
  const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
  return parseJsonSchemaRecord(properties?.[field])?.description
}

describe("Virtual office schemas", () => {
  it("accepts stable room enum strings", () => {
    expect(Result.isSuccess(Schema.decodeUnknownResult(RoomAccessSchema)("open"))).toBe(true)
    expect(Result.isSuccess(Schema.decodeUnknownResult(RoomTypeSchema)("video"))).toBe(true)
  })

  it("accepts room and active participant list filters", () => {
    expect(Result.isSuccess(Schema.decodeUnknownResult(ListOfficeRoomsParamsSchema)({ floorId: "floor-1" }))).toBe(true)
    expect(Result.isSuccess(Schema.decodeUnknownResult(GetOfficeRoomParamsSchema)({ roomId: "room-1" }))).toBe(true)
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(ListActiveRoomParticipantsParamsSchema)({ roomId: "room-1" }))
    ).toBe(true)
  })

  it("accepts meeting minutes filters and get params", () => {
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(ListMeetingMinutesParamsSchema)({ attachedToId: "room-1", from: 100, to: 200 })
      )
    ).toBe(true)
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(GetMeetingMinutesParamsSchema)({ meetingMinutesId: "minutes-1" }))
    ).toBe(true)
  })

  it("preserves public parameter descriptions", () => {
    expect(propertyDescription(listOfficeRoomsParamsJsonSchema, "floorId")).toBe("Optional floor ID filter.")
    expect(propertyDescription(listMeetingMinutesParamsJsonSchema, "attachedToId")).toContain(
      "meeting notes/transcript record"
    )
    expect(propertyDescription(getMeetingMinutesParamsJsonSchema, "meetingMinutesId")).toBe(
      "Meeting notes/transcript record ID (meeting minutes ID)."
    )
  })
})
