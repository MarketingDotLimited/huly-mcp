import type { Attrs, MarkupMark, MarkupNode } from "@hcengineering/text"
import { MarkupMarkType, MarkupNodeType, markupToJSON } from "@hcengineering/text"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { INLINE_COMMENT_MARK_TYPE, isInlineCommentMark } from "../../../src/huly/operations/inline-comment-mark.js"
import { sanitizeNodeForMarkdown } from "../../../src/huly/operations/markup.js"
import { propertyTestParameters } from "../../helpers/property.js"

interface RuntimeMarkupMark {
  readonly type: MarkupMarkType | typeof INLINE_COMMENT_MARK_TYPE
  readonly attrs?: Attrs
}

interface RuntimeMarkupNode {
  readonly type: MarkupNodeType
  readonly content?: Array<RuntimeMarkupNode>
  readonly marks?: Array<RuntimeMarkupMark>
  readonly attrs?: Attrs
  readonly text?: string
}

interface MarkupNodeParts {
  readonly type: MarkupNodeType
  readonly content: Array<MarkupNode> | undefined
  readonly marks: Array<MarkupMark> | undefined
  readonly attrs: Attrs | undefined
  readonly text: string | undefined
}

interface RuntimeMarkupNodeParts {
  readonly type: MarkupNodeType
  readonly content: Array<RuntimeMarkupNode> | undefined
  readonly marks: Array<RuntimeMarkupMark> | undefined
  readonly attrs: Attrs | undefined
  readonly text: string | undefined
}

const supportedMarkTypeArbitrary = fc.constantFrom(
  MarkupMarkType.link,
  MarkupMarkType.em,
  MarkupMarkType.bold,
  MarkupMarkType.code,
  MarkupMarkType.strike,
  MarkupMarkType.underline,
  MarkupMarkType.textColor,
  MarkupMarkType.textStyle
)

const attrValueArbitrary = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null)
)

const attrsArbitrary: fc.Arbitrary<Attrs> = fc.dictionary(
  fc.stringMatching(/^[a-z][a-zA-Z0-9_-]{0,16}$/),
  attrValueArbitrary,
  { maxKeys: 4 }
)

const optionalAttrsArbitrary = fc.option(attrsArbitrary, { nil: undefined })

const supportedMarkArbitrary: fc.Arbitrary<MarkupMark> = fc
  .record({ type: supportedMarkTypeArbitrary, attrs: optionalAttrsArbitrary })
  .map(({ attrs, type }) => (attrs === undefined ? { type } : { type, attrs }))

const inlineCommentMarkArbitrary: fc.Arbitrary<RuntimeMarkupMark> = optionalAttrsArbitrary.map((attrs) =>
  attrs === undefined ? { type: INLINE_COMMENT_MARK_TYPE } : { type: INLINE_COMMENT_MARK_TYPE, attrs }
)

const runtimeMarkArbitrary: fc.Arbitrary<RuntimeMarkupMark> = fc.oneof(
  supportedMarkArbitrary,
  inlineCommentMarkArbitrary
)

const optionalSupportedMarksArbitrary = fc.option(fc.array(supportedMarkArbitrary, { maxLength: 4 }), {
  nil: undefined
})

const optionalRuntimeMarksArbitrary = fc.option(fc.array(runtimeMarkArbitrary, { maxLength: 5 }), { nil: undefined })

const leafNodeTypeArbitrary = fc.constantFrom(
  MarkupNodeType.text,
  MarkupNodeType.hard_break,
  MarkupNodeType.horizontal_rule,
  MarkupNodeType.image,
  MarkupNodeType.reference,
  MarkupNodeType.emoji
)

const containerNodeTypeArbitrary = fc.constantFrom(
  MarkupNodeType.doc,
  MarkupNodeType.paragraph,
  MarkupNodeType.blockquote,
  MarkupNodeType.heading,
  MarkupNodeType.code_block,
  MarkupNodeType.ordered_list,
  MarkupNodeType.bullet_list,
  MarkupNodeType.list_item,
  MarkupNodeType.table,
  MarkupNodeType.table_row,
  MarkupNodeType.table_cell,
  MarkupNodeType.table_header
)

const buildMarkupNode = ({ attrs, content, marks, text, type }: MarkupNodeParts): MarkupNode => ({
  type,
  ...(content === undefined ? {} : { content }),
  ...(marks === undefined ? {} : { marks }),
  ...(attrs === undefined ? {} : { attrs }),
  ...(text === undefined ? {} : { text })
})

const buildRuntimeMarkupNode = ({ attrs, content, marks, text, type }: RuntimeMarkupNodeParts): RuntimeMarkupNode => ({
  type,
  ...(content === undefined ? {} : { content }),
  ...(marks === undefined ? {} : { marks }),
  ...(attrs === undefined ? {} : { attrs }),
  ...(text === undefined ? {} : { text })
})

const supportedMarkupNodeArbitrary = (maxDepth: number): fc.Arbitrary<MarkupNode> => {
  const leaf = fc
    .record({
      type: leafNodeTypeArbitrary,
      text: fc.string({ minLength: 1, maxLength: 60 }),
      marks: optionalSupportedMarksArbitrary,
      attrs: optionalAttrsArbitrary
    })
    .map(({ attrs, marks, text, type }) =>
      buildMarkupNode({ type, content: undefined, marks, attrs, text: type === MarkupNodeType.text ? text : undefined })
    )

  if (maxDepth <= 0) {
    return leaf
  }

  const child = supportedMarkupNodeArbitrary(maxDepth - 1)
  const container = fc
    .record({
      type: containerNodeTypeArbitrary,
      content: fc.array(child, { maxLength: 4 }),
      marks: optionalSupportedMarksArbitrary,
      attrs: optionalAttrsArbitrary
    })
    .map(({ attrs, content, marks, type }) => buildMarkupNode({ type, content, marks, attrs, text: undefined }))

  return fc.oneof(leaf, container)
}

const runtimeMarkupNodeArbitrary = (maxDepth: number): fc.Arbitrary<RuntimeMarkupNode> => {
  const leaf = fc
    .record({
      type: leafNodeTypeArbitrary,
      text: fc.string({ minLength: 1, maxLength: 60 }),
      marks: optionalRuntimeMarksArbitrary,
      attrs: optionalAttrsArbitrary
    })
    .map(({ attrs, marks, text, type }) =>
      buildRuntimeMarkupNode({
        type,
        content: undefined,
        marks,
        attrs,
        text: type === MarkupNodeType.text ? text : undefined
      })
    )

  if (maxDepth <= 0) {
    return leaf
  }

  const child = runtimeMarkupNodeArbitrary(maxDepth - 1)
  const container = fc
    .record({
      type: containerNodeTypeArbitrary,
      content: fc.array(child, { maxLength: 4 }),
      marks: optionalRuntimeMarksArbitrary,
      attrs: optionalAttrsArbitrary
    })
    .map(({ attrs, content, marks, type }) => buildRuntimeMarkupNode({ type, content, marks, attrs, text: undefined }))

  return fc.oneof(leaf, container)
}

const runtimeRootArbitrary = fc
  .record({
    content: fc.array(runtimeMarkupNodeArbitrary(4), { maxLength: 4 }),
    marks: optionalRuntimeMarksArbitrary,
    attrs: optionalAttrsArbitrary
  })
  .map(({ attrs, content, marks }) =>
    buildRuntimeMarkupNode({ type: MarkupNodeType.doc, content, marks, attrs, text: undefined })
  )

const supportedRootArbitrary = fc
  .record({
    content: fc.array(supportedMarkupNodeArbitrary(4), { maxLength: 4 }),
    marks: optionalSupportedMarksArbitrary,
    attrs: optionalAttrsArbitrary
  })
  .map(({ attrs, content, marks }) =>
    buildMarkupNode({ type: MarkupNodeType.doc, content, marks, attrs, text: undefined })
  )

const generatedInlineCommentMark = {
  type: INLINE_COMMENT_MARK_TYPE,
  attrs: { thread: "generated-thread" }
} satisfies RuntimeMarkupMark

const toRuntimeMarkupNode = (node: RuntimeMarkupNode): MarkupNode => markupToJSON(JSON.stringify(node))

const addInlineCommentMarksAtEveryNode = (node: RuntimeMarkupNode): RuntimeMarkupNode => ({
  ...node,
  marks: [...(node.marks ?? []), generatedInlineCommentMark],
  ...(node.content === undefined ? {} : { content: node.content.map(addInlineCommentMarksAtEveryNode) })
})

const collectAllMarks = (node: MarkupNode): Array<MarkupMark> => [
  ...(node.marks ?? []),
  ...(node.content ?? []).flatMap(collectAllMarks)
]

describe("sanitizeNodeForMarkdown properties", () => {
  it("is recursively idempotent", () => {
    fc.assert(
      fc.property(runtimeRootArbitrary, (generated) => {
        const node = toRuntimeMarkupNode(generated)
        const once = sanitizeNodeForMarkdown(node)
        const twice = sanitizeNodeForMarkdown(once)

        expect(twice).toEqual(once)
        expect(twice).toBe(once)
      }),
      propertyTestParameters
    )
  })

  it("removes inline-comment marks at every depth", () => {
    fc.assert(
      fc.property(runtimeRootArbitrary.map(addInlineCommentMarksAtEveryNode), (generated) => {
        const sanitized = sanitizeNodeForMarkdown(toRuntimeMarkupNode(generated))

        expect(collectAllMarks(sanitized).map((mark) => mark.type)).not.toContain(INLINE_COMMENT_MARK_TYPE)
      }),
      propertyTestParameters
    )
  })

  it("preserves supported non-inline-comment marks", () => {
    fc.assert(
      fc.property(runtimeRootArbitrary, (generated) => {
        const node = toRuntimeMarkupNode(generated)
        const expectedMarks = collectAllMarks(node).filter((mark) => !isInlineCommentMark(mark))

        expect(collectAllMarks(sanitizeNodeForMarkdown(node))).toEqual(expectedMarks)
      }),
      propertyTestParameters
    )
  })

  it("preserves object identity for already unchanged nodes", () => {
    fc.assert(
      fc.property(supportedRootArbitrary, (node) => {
        expect(sanitizeNodeForMarkdown(node)).toBe(node)
      }),
      propertyTestParameters
    )
  })

  it("preserves object identity for unchanged sibling subtrees", () => {
    fc.assert(
      fc.property(
        supportedMarkupNodeArbitrary(3),
        runtimeMarkupNodeArbitrary(3).map((node) => toRuntimeMarkupNode(addInlineCommentMarksAtEveryNode(node))),
        (unchangedChild, changedChild) => {
          const root: MarkupNode = { type: MarkupNodeType.doc, content: [unchangedChild, changedChild] }

          const sanitized = sanitizeNodeForMarkdown(root)

          expect(sanitized).not.toBe(root)
          expect(sanitized.content?.[0]).toBe(unchangedChild)
          expect(sanitized.content?.[1]).not.toBe(changedChild)
        }
      ),
      propertyTestParameters
    )
  })
})
