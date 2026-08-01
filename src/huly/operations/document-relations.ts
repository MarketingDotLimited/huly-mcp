import type { Doc, DocumentUpdate } from "@hcengineering/core"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  LinkDocumentToIssueParams,
  LinkDocumentToIssueResult,
  UnlinkDocumentFromIssueParams,
  UnlinkDocumentFromIssueResult
} from "../../domain/schemas/document-relations.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  DocumentNotFoundError,
  HulyModelMetadataError,
  IssueNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import { documentPlugin } from "../huly-plugins.js"
import { parseHulyDocumentRelationMetadata, parseHulyIssueRelationMetadata } from "../model-metadata.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { hasRelationById, makeRelatedDocEntry } from "./relations.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type DocRelationError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | HulyModelMetadataError

type DocumentRelationParams = Pick<LinkDocumentToIssueParams, "project" | "issueIdentifier" | "teamspace" | "document">

const resolveDocumentRelationContext = (params: DocumentRelationParams) =>
  Effect.gen(function* () {
    const [{ client, issue, project }, { doc }] = yield* Effect.all([
      findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier }),
      findTeamspaceAndDocument({ teamspace: params.teamspace, document: params.document })
    ])
    const issueMetadata = yield* parseHulyIssueRelationMetadata(issue)
    const documentMetadata = yield* parseHulyDocumentRelationMetadata(doc)
    return { client, issue, project, doc, issueMetadata, documentMetadata }
  })

export const linkDocumentToIssue = (
  params: LinkDocumentToIssueParams
): Effect.Effect<LinkDocumentToIssueResult, DocRelationError, HulyClient> =>
  Effect.gen(function* () {
    const { client, doc, documentMetadata, issue, issueMetadata, project } =
      yield* resolveDocumentRelationContext(params)

    if (hasRelationById(issue.relations, documentMetadata.id)) {
      return { issue: issueMetadata.identifier, document: documentMetadata.id, documentTitle: doc.title, linked: false }
    }

    yield* client.updateDoc(
      toClassRef<HulyIssue>(issueMetadata.class),
      project._id,
      toRef<HulyIssue>(issueMetadata.id),
      // eslint-disable-next-line no-restricted-syntax -- DocumentUpdate<HulyIssue> cast: see relations.ts
      {
        $push: { relations: makeRelatedDocEntry(documentMetadata.id, documentPlugin.class.Document) }
      } as DocumentUpdate<HulyIssue>
    )

    return { issue: issueMetadata.identifier, document: documentMetadata.id, documentTitle: doc.title, linked: true }
  })

export const unlinkDocumentFromIssue = (
  params: UnlinkDocumentFromIssueParams
): Effect.Effect<UnlinkDocumentFromIssueResult, DocRelationError, HulyClient> =>
  Effect.gen(function* () {
    const { client, doc, documentMetadata, issue, issueMetadata, project } =
      yield* resolveDocumentRelationContext(params)

    if (!hasRelationById(issue.relations, documentMetadata.id)) {
      return {
        issue: issueMetadata.identifier,
        document: documentMetadata.id,
        documentTitle: doc.title,
        unlinked: false
      }
    }

    yield* client.updateDoc(
      toClassRef<HulyIssue>(issueMetadata.class),
      project._id,
      toRef<HulyIssue>(issueMetadata.id),
      // eslint-disable-next-line no-restricted-syntax -- DocumentUpdate<HulyIssue> cast: see relations.ts
      { $pull: { relations: { _id: toRef<Doc>(documentMetadata.id) } } } as DocumentUpdate<HulyIssue>
    )

    return { issue: issueMetadata.identifier, document: documentMetadata.id, documentTitle: doc.title, unlinked: true }
  })
