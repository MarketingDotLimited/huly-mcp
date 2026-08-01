/**
 * Edit document operation for Huly MCP server.
 *
 * NOT SDK PARITY — see EditDocumentParamsSchema in domain/schemas/documents.ts
 * for the full design rationale.
 *
 * @module
 */
import type { DocumentUpdate } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import { Effect } from "effect"

import type { EditDocumentParams } from "../../domain/schemas.js"
import type { EditDocumentResult } from "../../domain/schemas/documents.js"
import { Count } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  DocumentEmptyContentError,
  type DocumentNotFoundError,
  type DocumentReferenceError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  type IssueNotFoundError,
  type HulyModelMetadataError,
  type PersonIdentifierAmbiguousError,
  type PersonNotFoundError,
  type ProjectNotFoundError,
  type TeamspaceNotFoundError
} from "../errors.js"
import { buildDocumentUrlFromConfig } from "../url-builders.js"
import { renderDocumentContentForWrite } from "./document-native-references.js"
import { findTeamspaceAndDocument } from "./documents-shared.js"

import { documentPlugin } from "../huly-plugins.js"
import { parseHulyDocumentRelationMetadata, parseHulyTeamspaceMetadata } from "../model-metadata.js"

type EditDocumentError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | DocumentTextNotFoundError
  | DocumentTextMultipleMatchesError
  | DocumentEmptyContentError
  | DocumentReferenceError
  | ProjectNotFoundError
  | IssueNotFoundError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | HulyModelMetadataError

const applyFullDocumentContent = (
  client: HulyClient["Type"],
  doc: HulyDocument,
  content: string,
  updateOps: DocumentUpdate<HulyDocument>
): Effect.Effect<void, EditDocumentError, HulyClient> =>
  Effect.gen(function* () {
    if (content.trim() === "") {
      updateOps.content = null
      return
    }
    const renderedContent = yield* renderDocumentContentForWrite(content)
    if (doc.content) {
      yield* client.updateMarkup(
        documentPlugin.class.Document,
        doc._id,
        "content",
        renderedContent.markup,
        renderedContent.format
      )
      return
    }
    updateOps.content = yield* client.uploadMarkup(
      documentPlugin.class.Document,
      doc._id,
      "content",
      renderedContent.markup,
      renderedContent.format
    )
  })

const applyDocumentSearchReplace = (
  client: HulyClient["Type"],
  doc: HulyDocument,
  identifier: EditDocumentParams["document"],
  oldText: string,
  newText: string,
  replaceAll: boolean
): Effect.Effect<void, EditDocumentError, HulyClient> =>
  Effect.gen(function* () {
    if (!doc.content) return yield* new DocumentEmptyContentError({ identifier })
    const currentContent = yield* client.fetchMarkup(doc._class, doc._id, "content", doc.content, "markdown")
    const occurrences = countOccurrences(currentContent, oldText)
    if (occurrences === 0) return yield* new DocumentTextNotFoundError({ searchText: oldText })
    if (occurrences > 1 && !replaceAll) {
      return yield* new DocumentTextMultipleMatchesError({ searchText: oldText, matchCount: Count.make(occurrences) })
    }
    const index = currentContent.indexOf(oldText)
    const newContent = replaceAll
      ? currentContent.split(oldText).join(newText)
      : currentContent.substring(0, index) + newText + currentContent.substring(index + oldText.length)
    const renderedContent = yield* renderDocumentContentForWrite(newContent)
    yield* client.updateMarkup(
      documentPlugin.class.Document,
      doc._id,
      "content",
      renderedContent.markup,
      renderedContent.format
    )
  })

const applyDocumentContentEdit = (
  client: HulyClient["Type"],
  doc: HulyDocument,
  params: EditDocumentParams,
  updateOps: DocumentUpdate<HulyDocument>
): Effect.Effect<void, EditDocumentError, HulyClient> =>
  params._tag === "ReplaceContent"
    ? applyFullDocumentContent(client, doc, params.content, updateOps)
    : params._tag === "SearchAndReplace"
      ? applyDocumentSearchReplace(client, doc, params.document, params.oldText, params.newText, params.replaceAll)
      : Effect.void

const persistDocumentFields = (
  client: HulyClient["Type"],
  doc: HulyDocument,
  teamspaceId: Parameters<HulyClient["Type"]["updateDoc"]>[1],
  updateOps: DocumentUpdate<HulyDocument>
): Effect.Effect<void, HulyClientError> =>
  Object.keys(updateOps).length === 0
    ? Effect.void
    : client.updateDoc(documentPlugin.class.Document, teamspaceId, doc._id, updateOps)

export const editDocument = (
  params: EditDocumentParams
): Effect.Effect<EditDocumentResult, EditDocumentError, HulyClient> =>
  Effect.gen(function* () {
    const { client, doc, teamspace } = yield* findTeamspaceAndDocument(params)
    const documentMetadata = yield* parseHulyDocumentRelationMetadata(doc)
    yield* parseHulyTeamspaceMetadata(teamspace)
    const updateOps: DocumentUpdate<HulyDocument> = params.title === undefined ? {} : { title: params.title }
    yield* applyDocumentContentEdit(client, doc, params, updateOps)

    const finalTitle = updateOps.title ?? doc.title
    const url = buildDocumentUrlFromConfig(client.workbenchUrlConfig, finalTitle, documentMetadata.id)
    yield* persistDocumentFields(client, doc, teamspace._id, updateOps)
    return { id: documentMetadata.id, updated: true, url }
  })

const NOT_FOUND_INDEX = -1

const countOccurrences = (text: string, search: string): number => {
  let count = 0
  let pos = text.indexOf(search)
  while (pos !== NOT_FOUND_INDEX) {
    count++
    pos = text.indexOf(search, pos + search.length)
  }
  return count
}
