# Completed Local Proof Vector Validation - 2026-07-02 - 90f9d559

This artifact records a current-head local proof-vector validation run for the
multi-leaf trustless burn proof vector.

Validated proof-vector target:

- `relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json`

Structured JSON report:

- `artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-02-90f9d559.json`

Command:

```powershell
npm run trustless:proof-vector:validate -- test-vectors/trustless-burn-proof-v1-multi-leaf.json --json-out ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-02-90f9d559.json
```

Result: PASS / exit code 0.

Observed validator summary:

```text
test-vectors/trustless-burn-proof-v1-multi-leaf.json: Trustless burn proof vector PASS: leafCount=2, proofNodes=1, gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.
bridgeEventRootHex: 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb
leafHashHex: 31c300fa370b8c9ff01a722eea2f590130fc2c5008249d861234a30d2df4ea6f
leafCount: 2
proofNodes: 1
```

Boundary:

- Local proof-core evidence only.
- No runtime database or deployment-state file was opened.
- No wallet, mnemonic, key, or secret material was read.
- No signing, transaction check, transaction submission, reconciliation,
  deployment, publication, or broadcast was performed.
- This does not close Gate 5 and does not support production-ready, mainnet,
  settlement-readiness, or testnet production-candidate claims.
