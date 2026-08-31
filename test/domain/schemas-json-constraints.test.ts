import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import {
  addAttachmentParamsJsonSchema,
  addDocumentAttachmentParamsJsonSchema,
  addIssueAttachmentParamsJsonSchema,
  editDocumentParamsJsonSchema,
  listCardsParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDocumentsParamsJsonSchema,
  listIssuesParamsJsonSchema,
  listPersonsParamsJsonSchema,
  previewDeletionParamsJsonSchema,
  uploadFileParamsJsonSchema
} from "../../src/domain/schemas.js"

describe("cross-field JSON schema constraints", () => {
  const fileSourceAlternatives = [{ required: ["filePath"] }, { required: ["fileUrl"] }, { required: ["data"] }]

  it("exposes file source alternatives for upload and attachment tools", () => {
    for (const schema of [
      uploadFileParamsJsonSchema,
      addAttachmentParamsJsonSchema,
      addIssueAttachmentParamsJsonSchema,
      addDocumentAttachmentParamsJsonSchema
    ]) {
      expect(schema).toMatchObject({ type: "object", anyOf: fileSourceAlternatives })
    }
  })

  it("exposes mutually exclusive search filters", () => {
    expect(listPersonsParamsJsonSchema).toMatchObject({ not: { required: ["nameSearch", "nameRegex"] } })
    expect(listChannelsParamsJsonSchema).toMatchObject({ not: { required: ["nameSearch", "nameRegex"] } })
    expect(listCardsParamsJsonSchema).toMatchObject({ not: { required: ["titleSearch", "titleRegex"] } })
    expect(listDocumentsParamsJsonSchema).toMatchObject({ not: { required: ["titleSearch", "titleRegex"] } })
  })

  it("exposes list issue cross-field exclusions", () => {
    expect(listIssuesParamsJsonSchema).toMatchObject({
      allOf: [
        { not: { required: ["titleSearch", "titleRegex"] } },
        { not: { required: ["assignee", "hasAssignee"] } },
        { not: { required: ["component", "hasComponent"] } },
        { not: { required: ["parentIssue", "isTopLevel"], properties: { isTopLevel: { const: true } } } }
      ]
    })
  })

  it("exposes edit document content mode constraints", () => {
    expect(editDocumentParamsJsonSchema).toMatchObject({
      allOf: [
        { not: { anyOf: [{ required: ["content", "old_text"] }, { required: ["content", "new_text"] }] } },
        { if: { required: ["old_text"] }, then: { required: ["new_text"] } },
        { if: { required: ["new_text"] }, then: { required: ["old_text"] } },
        { if: { required: ["replace_all"] }, then: { required: ["old_text", "new_text"] } }
      ]
    })
  })

  it("exposes preview deletion identifier requirement for non-project targets", () => {
    expect(previewDeletionParamsJsonSchema).toMatchObject({
      allOf: [
        {
          if: { required: ["entityType"], properties: { entityType: { enum: ["issue", "component", "milestone"] } } },
          then: { required: ["identifier"] }
        }
      ]
    })
  })
})
