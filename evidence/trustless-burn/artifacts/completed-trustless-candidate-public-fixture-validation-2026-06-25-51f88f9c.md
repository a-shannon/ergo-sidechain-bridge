# Completed Trustless Candidate Public Fixture Validation - 2026-06-25 - 51f88f9c

This artifact records candidate-only trustless settlement evidence generated
from a deterministic public fixture state database.

The fixture database was created only for this command run and was not sourced
from private runtime state, deployment state, wallet material, or live node
state.

Candidate evidence target:

- artifact://trustless-burn/artifacts/completed-trustless-candidate-public-fixture-2026-06-25-51f88f9c.json

Generation command:

```powershell
npm run trustless:candidate -- --burn-tx 2222222222222222222222222222222222222222222222222222222222222222 --duplicate-prevention-key 5236a760c284ca4a5dcb9c47a12c56f2db86328b6e447ac2cce1a184abc63843 --bridge-event-root 4444444444444444444444444444444444444444444444444444444444444444 --recipient-ergo-tree-hash 3333333333333333333333333333333333333333333333333333333333333333 --amount-nanoerg 1000000 --sidechain-id-hex 1111111111111111111111111111111111111111111111111111111111111111 --state-db <public-fixture-state.sqlite> --label "Public fixture trustless settlement candidate" --generated-at 2026-06-25T00:00:00.000Z --out ../evidence/trustless-burn/artifacts/completed-trustless-candidate-public-fixture-2026-06-25-51f88f9c.json
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
npm run trustless:candidate:validate -- ../evidence/trustless-burn/artifacts/completed-trustless-candidate-public-fixture-2026-06-25-51f88f9c.json
```

Validation result: PASS / exit code 0.

Observed validator summary:

```text
../evidence/trustless-burn/artifacts/completed-trustless-candidate-public-fixture-2026-06-25-51f88f9c.json: Trustless candidate evidence PASS: 1 read-only candidate claim(s), broadcast=no, contractCompatibility=candidate-only-trustless-v2-required; candidate-only evidence, not Gate 5 closure, pre-broadcast evidence, settlement readiness, or claim authorization.
```

Fixture identity:

| Field | Value |
|---|---|
| sidechainIdHex | 1111111111111111111111111111111111111111111111111111111111111111 |
| legacySidechainTxHash | 2222222222222222222222222222222222222222222222222222222222222222 |
| sidechainLogIndex | 7 |
| derivedBurnIdHex | 5236a760c284ca4a5dcb9c47a12c56f2db86328b6e447ac2cce1a184abc63843 |
| bridgeEventRootHex | 4444444444444444444444444444444444444444444444444444444444444444 |
| recipientErgoTreeHashHex | 3333333333333333333333333333333333333333333333333333333333333333 |
| amountNanoErg | 1000000 |

Boundary:

- Candidate-only evidence is not completed Gate 5 trustless burn evidence.
- It does not prove on-chain Ergo contract acceptance.
- It does not replace completed `npm run trustless:validate` evidence.
- It does not authorize signing, pre-broadcast, settlement readiness,
  transaction submission, reconciliation, production-ready claims, mainnet
  claims, or testnet production-candidate claims.
