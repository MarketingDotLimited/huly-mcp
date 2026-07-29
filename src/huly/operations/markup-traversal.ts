import type { MarkupNode } from "@hcengineering/text"
// eslint-disable-next-line no-restricted-imports -- This module is the typed boundary around the SDK traversal API.
import { traverseAllMarks as unsafeTraverseAllMarks } from "@hcengineering/text"

type ReadonlyMarkupMark = { readonly type: unknown; readonly attrs?: Readonly<Record<string, unknown>> }

type ReadonlyMarkupNode = Readonly<Omit<MarkupNode, "attrs" | "content" | "marks">> & {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: ReadonlyArray<ReadonlyMarkupNode>
  readonly marks?: ReadonlyArray<ReadonlyMarkupMark>
}

export const traverseAllMarks = (
  root: MarkupNode,
  visit: (node: ReadonlyMarkupNode, mark: ReadonlyMarkupMark) => void
): void => {
  unsafeTraverseAllMarks(root, (node, mark) => {
    visit(node, mark)
  })
}
