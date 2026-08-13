import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createWriteStream } from "node:fs"
import { createGzip } from "node:zlib"

import * as tar from "tar-stream"
import { describe, expect, it } from "vitest"

import { parsePnpmPackMetadata, tarArchiveUnpackedSize } from "../../scripts/cli-package-artifact.js"

describe("CLI package artifact boundary", () => {
  it("decodes pnpm pack metadata", () => {
    expect(
      parsePnpmPackMetadata(
        JSON.stringify({
          filename: "/tmp/firfi-huly-cli-0.48.1.tgz",
          files: [{ path: "dist/index.cjs" }],
          name: "@firfi/huly-cli",
          version: "0.48.1"
        })
      )
    ).toMatchObject({ name: "@firfi/huly-cli", version: "0.48.1" })
    expect(() => parsePnpmPackMetadata('{"name":"other"}')).toThrow()
  })

  it("sums structured tar entry sizes", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cli-package-artifact-test-"))
    const archive = path.join(directory, "fixture.tgz")
    try {
      const pack = tar.pack()
      const output = createWriteStream(archive)
      const finished = new Promise<void>((resolve, reject) => {
        output.on("close", resolve)
        output.on("error", reject)
      })
      pack.pipe(createGzip()).pipe(output)
      pack.entry({ name: "one.txt" }, "abc")
      pack.entry({ name: "two.txt" }, "12345")
      pack.finalize()
      await finished

      await expect(tarArchiveUnpackedSize(archive)).resolves.toBe(8)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })
})
