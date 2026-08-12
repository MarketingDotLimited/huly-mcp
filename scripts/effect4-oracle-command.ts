import { Schema } from "effect"

import { renderEffect4Oracle } from "./effect4-oracle-data.js"
import { verifyEffect4Oracle, writeEffect4Oracle } from "./effect4-oracle-io.js"

const COMMAND_ARGUMENT_INDEX = 2
const OracleCommand = Schema.Literal("capture", "verify").annotations({
  message: () => "Usage: effect4-oracle-command.ts capture|verify"
})

const main = async (): Promise<void> => {
  const command = Schema.decodeUnknownSync(OracleCommand)(process.argv[COMMAND_ARGUMENT_INDEX])
  const content = await renderEffect4Oracle()
  const oraclePath =
    command === "capture"
      ? await writeEffect4Oracle(process.cwd(), content)
      : await verifyEffect4Oracle(process.cwd(), content)

  console.log(`${command === "capture" ? "Captured" : "Verified"} Effect 4 behavioral oracle: ${oraclePath}`)
}

void main()
