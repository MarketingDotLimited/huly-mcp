import * as fs from "node:fs/promises"
import * as path from "node:path"

export const EFFECT4_ORACLE_PATH = "docs/migrations/effect-4/behavioral-oracle.json"

export const writeEffect4Oracle = async (root: string, content: string): Promise<string> => {
  const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
  await fs.mkdir(path.dirname(oraclePath), { recursive: true })
  await fs.writeFile(oraclePath, content, "utf8")
  return oraclePath
}

export const verifyEffect4Oracle = async (root: string, actual: string): Promise<string> => {
  const oraclePath = path.join(root, EFFECT4_ORACLE_PATH)
  const expected = await fs.readFile(oraclePath, "utf8")
  if (actual !== expected) {
    throw new Error(
      `Effect 4 behavioral oracle differs from ${EFFECT4_ORACLE_PATH}. Review the contract delta or run pnpm capture:effect4-oracle to accept it.`
    )
  }
  return oraclePath
}
