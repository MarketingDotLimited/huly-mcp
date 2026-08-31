import { generateId, type Ref, SortingOrder } from "@hcengineering/core"
import type {
  Document as HulyDocument,
  SavedDocument as HulySavedDocument,
  Teamspace as HulyTeamspace
} from "@hcengineering/document"
import type { Preference as HulyPreference } from "@hcengineering/preference"
import { Effect } from "effect"

import type {
  ListSavedDocumentsParams,
  ListSavedDocumentsResult,
  SavedDocumentSummary,
  SaveDocumentParams,
  SaveDocumentResult,
  UnsaveDocumentParams,
  UnsaveDocumentResult
} from "../../domain/schemas.js"
import { Count, DocumentId, SavedDocumentId, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import type { DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { core, documentPlugin, preference } from "../huly-plugins.js"
import { buildDocumentUrlFromConfig } from "../url-builders.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type SaveDocumentError = HulyClientError | TeamspaceNotFoundError | DocumentNotFoundError

type UnsaveDocumentError = HulyClientError | TeamspaceNotFoundError | DocumentNotFoundError

type ListSavedDocumentsError = HulyClientError

type SavedDocumentPreference =
  | { readonly kind: "saved-document"; readonly doc: HulySavedDocument | undefined }
  | { readonly kind: "preference"; readonly doc: HulyPreference | undefined }

type ExistingSavedDocumentPreference =
  | { readonly kind: "saved-document"; readonly doc: HulySavedDocument }
  | { readonly kind: "preference"; readonly doc: HulyPreference }

type SavedDocumentList =
  | { readonly kind: "saved-document"; readonly docs: ReadonlyArray<HulySavedDocument> }
  | { readonly kind: "preference"; readonly docs: ReadonlyArray<HulyPreference> }

const modelClassRef = toClassRef<MetadataClassDoc>(core.class.Class)
const savedDocumentModelId = toRef<MetadataClassDoc>(documentPlugin.class.SavedDocument)

const savedDocumentPreferenceKind = (
  client: HulyClientOperations
): Effect.Effect<SavedDocumentPreference["kind"], HulyClientError> =>
  client
    .findAllInModel<MetadataClassDoc>(modelClassRef, hulyQuery<MetadataClassDoc>({ _id: savedDocumentModelId }), {
      limit: 1
    })
    .pipe(Effect.map((classes) => (classes.length === 0 ? "preference" : "saved-document")))

const findSavedDocumentPreference = (
  client: HulyClientOperations,
  documentId: Ref<HulyDocument>
): Effect.Effect<SavedDocumentPreference, HulyClientError> =>
  Effect.gen(function* () {
    const kind = yield* savedDocumentPreferenceKind(client)
    if (kind === "saved-document") {
      const doc = yield* client.findOne<HulySavedDocument>(
        documentPlugin.class.SavedDocument,
        hulyQuery<HulySavedDocument>({ attachedTo: documentId })
      )
      return { kind, doc }
    }
    const doc = yield* client.findOne<HulyPreference>(
      preference.class.Preference,
      hulyQuery<HulyPreference>({ attachedTo: documentId })
    )
    return { kind, doc }
  })

const createSavedDocumentPreference = (
  client: HulyClientOperations,
  doc: HulyDocument,
  kind: SavedDocumentPreference["kind"],
  savedId: Ref<HulySavedDocument>
): Effect.Effect<Ref<HulySavedDocument> | Ref<HulyPreference>, HulyClientError> =>
  // The local integration workspace (model version 0.7.343) exposes
  // SavedDocument in the installed SDK but does not register
  // document:class:SavedDocument in the live model. SavedDocument adds no
  // fields beyond Preference.attachedTo, so base Preference is the compatibility
  // representation only when the typed class is unavailable.
  kind === "saved-document"
    ? client.createDoc(documentPlugin.class.SavedDocument, core.space.Workspace, { attachedTo: doc._id }, savedId)
    : client.createDoc(preference.class.Preference, core.space.Workspace, { attachedTo: doc._id }, savedId)

const removeSavedDocumentPreference = (
  client: HulyClientOperations,
  saved: ExistingSavedDocumentPreference
): Effect.Effect<unknown, HulyClientError> =>
  saved.kind === "saved-document"
    ? client.removeDoc(documentPlugin.class.SavedDocument, saved.doc.space, saved.doc._id)
    : client.removeDoc(preference.class.Preference, saved.doc.space, saved.doc._id)

const listSavedDocumentPreferences = (
  client: HulyClientOperations,
  limit: number
): Effect.Effect<SavedDocumentList, HulyClientError> =>
  Effect.gen(function* () {
    const kind = yield* savedDocumentPreferenceKind(client)
    if (kind === "saved-document") {
      const docs = yield* client.findAll<HulySavedDocument>(
        documentPlugin.class.SavedDocument,
        hulyQuery<HulySavedDocument>({}),
        { limit, sort: { modifiedOn: SortingOrder.Descending } }
      )
      return { kind, docs }
    }
    const docs = yield* client.findAll<HulyPreference>(preference.class.Preference, hulyQuery<HulyPreference>({}), {
      limit,
      sort: { modifiedOn: SortingOrder.Descending }
    })
    return { kind, docs }
  })

/**
 * Save/bookmark a document for the current user.
 * Idempotent: returns the existing saved preference when the document is already saved.
 */
export const saveDocument = (
  params: SaveDocumentParams
): Effect.Effect<SaveDocumentResult, SaveDocumentError, HulyClient> =>
  Effect.gen(function* () {
    const { client, doc } = yield* findTeamspaceAndDocument(params)

    const existing = yield* findSavedDocumentPreference(client, doc._id)
    if (existing.doc !== undefined) {
      return { savedId: SavedDocumentId.make(existing.doc._id), documentId: DocumentId.make(doc._id), created: false }
    }

    const savedId: Ref<HulySavedDocument> = generateId()
    yield* createSavedDocumentPreference(client, doc, existing.kind, savedId)

    return { savedId: SavedDocumentId.make(savedId), documentId: DocumentId.make(doc._id), created: true }
  })

/**
 * Remove a document from saved/bookmarks.
 * Idempotent: returns removed=false when no saved preference exists.
 */
export const unsaveDocument = (
  params: UnsaveDocumentParams
): Effect.Effect<UnsaveDocumentResult, UnsaveDocumentError, HulyClient> =>
  Effect.gen(function* () {
    const { client, doc } = yield* findTeamspaceAndDocument(params)

    const saved = yield* findSavedDocumentPreference(client, doc._id)
    if (saved.doc === undefined) {
      return { documentId: DocumentId.make(doc._id), removed: false }
    }

    if (saved.kind === "saved-document") {
      yield* removeSavedDocumentPreference(client, { kind: "saved-document", doc: saved.doc })
    } else {
      yield* removeSavedDocumentPreference(client, { kind: "preference", doc: saved.doc })
    }

    return { documentId: DocumentId.make(doc._id), removed: true }
  })

/**
 * List saved/bookmarked documents for the current user.
 * Stale or inaccessible saved references are omitted from the result.
 */
export const listSavedDocuments = (
  params: ListSavedDocumentsParams
): Effect.Effect<ListSavedDocumentsResult, ListSavedDocumentsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)

    const savedDocuments = yield* listSavedDocumentPreferences(client, limit)

    const hydratedDocuments = yield* Effect.forEach(
      savedDocuments.docs,
      (saved): Effect.Effect<SavedDocumentSummary | undefined, HulyClientError> =>
        Effect.gen(function* () {
          const doc = yield* client.findOne<HulyDocument>(
            documentPlugin.class.Document,
            hulyQuery<HulyDocument>({ _id: toRef<HulyDocument>(saved.attachedTo) })
          )
          if (doc === undefined) return undefined

          const teamspace = yield* client.findOne<HulyTeamspace>(
            documentPlugin.class.Teamspace,
            hulyQuery<HulyTeamspace>({ _id: doc.space, archived: false })
          )
          if (teamspace === undefined) return undefined

          const documentId = DocumentId.make(doc._id)
          const summary: SavedDocumentSummary = {
            savedId: SavedDocumentId.make(saved._id),
            documentId,
            title: doc.title,
            teamspace: teamspace.name,
            url: buildDocumentUrlFromConfig(client.workbenchUrlConfig, doc.title, documentId),
            ...(doc.modifiedOn === undefined ? {} : { modifiedOn: Timestamp.make(doc.modifiedOn) })
          }
          return summary
        })
    )
    const documents = hydratedDocuments.filter((doc): doc is SavedDocumentSummary => doc !== undefined)

    return { documents, total: Count.make(documents.length) }
  })
