---
"@firfi/huly-cli": minor
---

Expose all 522 shared Huly operations through 522 native CLI routes with generated schema-aware help, structured and file-backed input, binary/image output, agent-visible warnings, and typed errors. Consequential actions now require `--yes`; behavior/risk coverage, generated documentation, and packed-package dependency closure are permanent release gates.

The parity boundary is the shared Huly operation registry. JSON-RPC discovery, MCP resources/prompts, proxy discovery, MCP toolsets, and MCP multimodal envelopes remain protocol-only; the CLI provides native help, flags and ordered JSON sources, terminal/file rendering, warning output, and binary/image file output instead.

Release evidence: `pnpm check-all` passed; the packed CLI live behavior/risk suite passed against local Huly; the full MCP suite and its packed-CLI mirror each passed the same 1,095 tests with 0 failures and 27 intentional skips; fresh tarballs installed and passed smoke tests with both pnpm and npm; and the packed 522-route CLI passed on Node 20, 22, 24, and 26.
