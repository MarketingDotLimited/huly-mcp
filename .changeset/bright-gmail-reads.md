---
"@firfi/huly-mcp": minor
"@firfi/huly-cli": minor
---

Add an explicit Gmail/Telegram message compatibility assessment. Gmail reports `supported=false` because Huly does not expose the live deployment-wide writer version needed to distinguish current v1 records from stale data after a v2 upgrade; Telegram remains unsupported without a compatible published package.
