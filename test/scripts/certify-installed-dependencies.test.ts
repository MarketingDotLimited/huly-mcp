import { describe, expect, it } from "vitest"

import { certifyInstalledDependencyGraph } from "../../scripts/certify-installed-dependencies.js"

describe("installed dependency graph certification", () => {
  it("accepts the portable ws graph without external Effect packages", () => {
    const graph = JSON.stringify({
      dependencies: {
        "@firfi/huly-mcp": { dependencies: { ws: { dependencies: { bufferutil: {}, "utf-8-validate": {} } } } }
      }
    })

    expect(certifyInstalledDependencyGraph(graph, "@firfi/huly-mcp")).toContain("ws")
  })

  it("accepts pnpm's array-shaped production dependency report", () => {
    const graph = JSON.stringify([{ name: "@firfi/huly-cli", dependencies: { ws: { name: "ws" } } }])

    expect(certifyInstalledDependencyGraph(graph, "@firfi/huly-cli")).toEqual(
      expect.arrayContaining(["@firfi/huly-cli", "ws"])
    )
  })

  it("rejects external Effect packages and missing package roots", () => {
    expect(() =>
      certifyInstalledDependencyGraph(
        JSON.stringify({ dependencies: { "@firfi/huly-mcp": { dependencies: { effect: {}, ws: {} } } } }),
        "@firfi/huly-mcp"
      )
    ).toThrow(/external Effect/u)
    expect(() =>
      certifyInstalledDependencyGraph(JSON.stringify({ dependencies: { ws: {} } }), "@firfi/huly-cli")
    ).toThrow(/does not contain/u)
    expect(() =>
      certifyInstalledDependencyGraph(
        JSON.stringify({ dependencies: { "@firfi/huly-cli": { dependencies: { "@effect/platform": {}, ws: {} } } } }),
        "@firfi/huly-cli"
      )
    ).toThrow(/external Effect/u)
  })

  it("rejects a missing ws dependency and accepts omitted optional accelerators", () => {
    expect(() =>
      certifyInstalledDependencyGraph(JSON.stringify({ dependencies: { "@firfi/huly-mcp": {} } }), "@firfi/huly-mcp")
    ).toThrow(/required ws/u)
    expect(
      certifyInstalledDependencyGraph(
        JSON.stringify({ dependencies: { "@firfi/huly-mcp": { dependencies: { ws: {} } } } }),
        "@firfi/huly-mcp"
      )
    ).toContain("ws")
  })

  it("walks nested dependency records and rejects malformed dependency nodes at the boundary", () => {
    const graph = JSON.stringify({
      dependencies: {
        wrapper: {
          dependencies: {
            unrelated: { dependencies: { leaf: {} } },
            "@firfi/huly-cli": { dependencies: { ws: { dependencies: { bufferutil: {}, "utf-8-validate": {} } } } }
          }
        }
      }
    })

    expect(certifyInstalledDependencyGraph(graph, "@firfi/huly-cli")).toEqual(
      expect.arrayContaining(["@firfi/huly-cli", "bufferutil", "utf-8-validate", "wrapper", "ws"])
    )
    expect(() =>
      certifyInstalledDependencyGraph(
        JSON.stringify({ dependencies: { "@firfi/huly-cli": { dependencies: { ws: null } } } }),
        "@firfi/huly-cli"
      )
    ).toThrow()
    expect(() => certifyInstalledDependencyGraph(JSON.stringify({ dependencies: [] }), "@firfi/huly-cli")).toThrow()
  })
})
