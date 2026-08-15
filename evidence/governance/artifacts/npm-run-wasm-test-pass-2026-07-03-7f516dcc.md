# npm run wasm:test Command Evidence - 2026-07-03 - 7f516dcc

This report records the standalone WASM AVL crate test result used by the Phase
010a committee governance blocker-map refresh at commit 7f516dcc.

It is command-output evidence only. It does not complete Gate 6 committee
governance evidence and does not support governance-ready, testnet
production-candidate, mainnet, deployment, key-rotation, signing, settlement,
or broadcast claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run wasm:test` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Result | PASS |
| Exit code | 0 |
| Rust command | `cargo test` |
| Unit tests | 13 passed |
| Doc tests | 0 failed |
| Stack trace emitted | no |
| Local path emitted | no |

## Boundary

This command result proves the WASM AVL crate test suite passed for this
readiness slice. It does not prove contract compilation against a local Ergo
node, committee key rotation, signer-gated mutation behavior, publication
updates, external reviewer approval, or any transaction broadcast.
