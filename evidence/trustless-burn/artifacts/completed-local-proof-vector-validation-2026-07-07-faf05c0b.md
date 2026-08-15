# Completed Local Proof Vector Validation - 2026-07-07 - faf05c0b

This artifact records a current-head local proof-vector validation run for the
recipient-tree trustless burn proof vector.

Validated proof-vector target:

- `relayer/test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json`

Structured JSON report:

- `artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json`

Command:

```powershell
npm run trustless:proof-vector:validate -- test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json --json-out ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json
```

Result: PASS / exit code 0.

Observed validator summary:

```text
test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json: Trustless burn proof vector PASS: leafCount=2, proofNodes=1, gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.
bridgeEventRootHex: 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9
leafHashHex: 0a287906f429e445513ba008fa4d178c7319993b178bb37822228ddd024c7681
leafCount: 2
proofNodes: 1
```

Negative cases observed:

| Negative case | Status |
| --- | --- |
| wrong-sidechain-id | REJECTED |
| wrong-burn-id | REJECTED |
| wrong-event-index | REJECTED |
| wrong-recipient | REJECTED |
| wrong-amount | REJECTED |
| wrong-duplicate-prevention-key | REJECTED |
| wrong-bridge-event-root | REJECTED |
| malformed-inclusion-path | REJECTED |

Boundary:

- Local proof-core evidence only.
- No runtime database or deployment-state file was opened for proof-vector validation.
- No wallet, mnemonic, key, or secret material was read.
- No signing, transaction check, transaction submission, reconciliation,
  deployment, publication, or broadcast was performed.
- This does not close Gate 5 and does not support production-ready, mainnet,
  settlement-readiness, or testnet production-candidate claims.
