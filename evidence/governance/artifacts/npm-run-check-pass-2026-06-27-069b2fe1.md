# npm run check Command Evidence - 2026-06-27 - 069b2fe1

This report records the repository check result used by the Phase 010a
committee governance blocker map at commit 069b2fe1.

It is command-output evidence only. It does not complete Gate 6 committee
governance evidence and does not support governance-ready, testnet
production-candidate, mainnet, deployment, key-rotation, signing, settlement,
or broadcast claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run check` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Result | PASS |
| Exit code | 0 |
| Runtime | Node 24.x compatible npm runtime |
| Build step | `wasm:build` completed |
| TypeScript step | `tsc` completed |
| Test runner | `vitest run` |
| Test files | 97 passed |
| Tests | 6683 passed |

## Boundary

This command result proves the relayer check suite passed for this readiness
slice. It does not prove contract compilation against a local Ergo node,
committee key rotation, signer-gated mutation behavior, publication updates,
external reviewer approval, or any transaction broadcast.
