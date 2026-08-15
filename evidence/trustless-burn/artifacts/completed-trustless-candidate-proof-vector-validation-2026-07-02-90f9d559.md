# Completed Trustless Candidate Proof-Vector Validation - 2026-07-02 - 90f9d559

This artifact records candidate-only trustless settlement evidence derived from
the current multi-leaf local proof vector.

Candidate evidence target:

- `artifact://trustless-burn/artifacts/completed-trustless-candidate-proof-vector-2026-07-02-90f9d559.json`

Source proof-vector report:

- `artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-02-90f9d559.json`

Generation command:

```powershell
npm run trustless:candidate -- --proof-vector test-vectors/trustless-burn-proof-v1-multi-leaf.json --state-db <temporary-public-fixture-state.sqlite> --label "Proof-vector-derived trustless settlement candidate" --generated-at 2026-07-02T00:00:00.000Z --out ../evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-2026-07-02-90f9d559.json
```

Generation result:

```text
StateTracker mode: read-only
evidenceKind: trustless-settlement-candidate
broadcast: no
contractCompatibility: candidate-only-trustless-v2-required
gate5Closure: no
prebroadcastEvidence: no
settlementReadiness: no
claimAuthorization: no
claimCount: 1
evidenceJson: written
```

Validation command:

```powershell
npm run trustless:candidate:validate -- ../evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-2026-07-02-90f9d559.json
```

Validation result: PASS / exit code 0.

Observed validator summary:

```text
../evidence/trustless-burn/artifacts/completed-trustless-candidate-proof-vector-2026-07-02-90f9d559.json: Trustless candidate evidence PASS: 1 read-only candidate claim(s), broadcast=no, contractCompatibility=candidate-only-trustless-v2-required; candidate-only evidence, not Gate 5 closure, pre-broadcast evidence, settlement readiness, or claim authorization.
```

Candidate identity:

| Field | Value |
|---|---|
| sidechainIdHex | 1111111111111111111111111111111111111111111111111111111111111111 |
| legacySidechainTxHash | 6666666666666666666666666666666666666666666666666666666666666666 |
| sidechainLogIndex | 8 |
| derivedBurnIdHex | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| bridgeEventRootHex | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| recipientErgoTreeHashHex | 8888888888888888888888888888888888888888888888888888888888888888 |
| amountNanoErg | 2000000 |

Boundary:

- Candidate-only evidence is not completed Gate 5 trustless burn evidence.
- It does not prove on-chain Ergo contract acceptance.
- It does not replace completed `npm run trustless:validate` evidence.
- The temporary public fixture database was derived only from the public proof
  vector values and was removed after generation.
- No private runtime database, deployment-state file, wallet, mnemonic, key, or
  secret material was read.
- No signing, transaction check, transaction submission, reconciliation,
  deployment, publication, or broadcast was performed.
- This does not authorize production-ready, mainnet, settlement-readiness,
  pre-broadcast, or testnet production-candidate claims.
