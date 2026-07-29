import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { createRestClient } from "@hcengineering/api-client"
import type { Person as HulyPerson } from "@hcengineering/contact"
import { describe, expect, it } from "vitest"

import { contact } from "../../src/huly/huly-plugins.js"
import { assertAt } from "../../src/utils/assertions.js"

describe("@hcengineering/api-client REST lookup decoding", () => {
  it("preserves inlined lookups when lookupMap is null", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          dataType: "TotalArray",
          value: [
            {
              _id: "person-1",
              _class: contact.class.Person,
              space: contact.space.Contacts,
              name: "Doe,John",
              modifiedBy: "social-1",
              modifiedOn: 1,
              $lookup: { owner: { _id: "person-1", name: "Doe,John" } }
            }
          ],
          total: 1,
          lookupMap: null
        })
      )
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

    try {
      const address = server.address()
      if (address === null || typeof address === "string") {
        throw new Error("Expected the test server to listen on a TCP socket")
      }

      const client = createRestClient(
        `http://127.0.0.1:${(address satisfies AddressInfo).port}`,
        "workspace-1",
        "token"
      )
      const result = await client.findAll<HulyPerson>(contact.class.Person, {})

      expect(assertAt(result, 0)).toMatchObject({ $lookup: { owner: { _id: "person-1" } } })
      expect(result).not.toHaveProperty("lookupMap")
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      )
    }
  })
})
