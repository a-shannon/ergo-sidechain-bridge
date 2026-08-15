# Gate 5 Trustless Burn SPV-Linked Candidate - 2026-07-07 - faf05c0b

This packet binds the recipient-tree proof-vector instance to the Gate 5
SPV-linked candidate layout. It is not completed Gate 5 trustless-burn evidence
and does not support settlement readiness, testnet production-candidate,
production-ready, mainnet, broadcast, or completed trustless-burn implementation
claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this packet.

Current local prerequisite evidence:

- artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md
- artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json
- artifact://trustless-burn/artifacts/completed-gate5-commitment-bridge-event-root-2026-07-06-39bfec72.md
- artifact://trustless-burn/artifacts/completed-gate5-recipient-ergo-tree-hash-binding-2026-07-06-39bfec72.md
- artifact://trustless-burn/artifacts/completed-gate5-inclusion-path-binding-2026-07-06-39bfec72.md
- artifact://trustless-burn/artifacts/completed-local-spv-tracker-observation-input-2026-07-06-39bfec72.json
- artifact://trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-39bfec72.md
- artifact://trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-39bfec72.json
- artifact://trustless-burn/anchor-observation-root-bound-testnet-2026-07-06-39bfec72.md
- artifact://trustless-burn/anchor-observation-root-bound-testnet-2026-07-06-39bfec72.json
- artifact://trustless-burn/gate5-observation-reconciliation-command-2026-07-06-39bfec72.md
- artifact://trustless-burn/gate5-observation-reconciliation-command-2026-07-06-39bfec72.json
- artifact://trustless-burn/artifacts/completed-local-settlement-tx-binding-2026-07-06-a6b1c444.md
- artifact://trustless-burn/artifacts/completed-local-positive-proof-acceptance-2026-07-09-ace3896d.md
- artifact://trustless-burn/artifacts/completed-local-dup-settlement-binding-2026-07-09-ace3896d.md
- artifact://trustless-burn/artifacts/completed-local-contract-acceptance-2026-07-09-c3612838.md
- artifact://trustless-burn/artifacts/completed-local-contract-acceptance-2026-07-09-c3612838.json
- artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-09-d198839b.json
- artifact://trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-09-d198839b.md
- artifact://trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-09-d198839b.md
- artifact://trustless-burn/artifacts/gate5-trustless-burn-instance-refresh-2026-07-09-d198839b.json

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 trustless-burn SPV-linked candidate |
| Git commit | faf05c0b |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path |
| Reviewer | A. Shannon |
| Date | 2026-07-07 |

## Required Components

| Component | Required property | Evidence | Status |
|---|---|---|---|
| Sidechain commitment format | Stable, versioned, sidechain-specific commitment format | artifact://trustless-burn/artifacts/completed-gate5-sidechain-commitment-format-2026-06-27-e9b25a8c.md completed Gate 5 sidechain commitment format component evidence; stable versioned sidechain-specific commitment format recorded; no settlement, broadcast, or claim authorization | linked |
| Ergo extension-section anchoring | Commitment embedded under collision-safe `0x04xx` extension keys | Anchor observation report: ../evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-06-39bfec72.json; no matching live mined 0x0401 anchor is captured for bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 | blocker |
| Sidechain header/finality verifier | Ergo-verifiable sidechain header or finality rule | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md records local receipt-depth rejection before trustless burn leaf construction, but Ergo-verifiable sidechain finality authority has not been captured | blocker |
| SPV relay contract or tracker | SPV relay with authenticated commitment history on Ergo | artifact://trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-39bfec72.md completed read-only local SPV tracker observation evidence; SPV tracker observation report: ../evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-06-39bfec72.json; tracker key/value linked to bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 and Ergo anchor height 987654; local offline prerequisite only; no burn inclusion, on-chain proof acceptance, settlement readiness, signing, submit, broadcast, or Gate 5 closure | linked |
| Burn commitment tree | ErgoScript-friendly burn tree using Blake2b-compatible hashing | artifact://trustless-burn/artifacts/completed-gate5-burn-commitment-tree-2026-06-28-a665e48b.md completed Gate 5 burn commitment tree component evidence; Blake2b-compatible local proof-core tree root recorded; recipient-tree proof-vector validation refreshed in artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md; no settlement, broadcast, or claim authorization | linked |
| Burn inclusion proof | On-chain proof accepts only included burn events | Local proof-core vector validates in artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md, but on-chain Ergo proof acceptance evidence has not been captured | blocker |
| DUP settlement binding | DUP replay key binds the unsigned settlement candidate to the proved burn | artifact://trustless-burn/artifacts/completed-local-dup-settlement-binding-2026-07-09-ace3896d.md completed local DUP settlement binding evidence; duplicatePreventionKeyHex 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f equals burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; settlementIdentity source trustless-burn-leaf carries duplicatePreventionKeyHex into the unsigned settlement shape; contextExtensionGuard pass; inputCount=3 outputCount=4 contextExtensionKeyCountsCsv=0,3,4; no signing, submit, broadcast, on-chain DUP insertion, settlement readiness, Gate 5 closure, or production claim support | linked |
| Reorg handling | Reorged sidechain commitments cannot release ERG | artifact://trustless-burn/artifacts/completed-gate5-reorg-handling-2026-06-29-5d075bd9.md completed Gate 5 reorg handling component evidence; local verifier and anchor-validation evidence reject reorged sidechain blocks, unfinalized blocks, stale tracker roots, and wrong Ergo anchor heights; on-chain proof acceptance, live SPV relay operation, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| Independent review | Independent consensus, commitment, proof format, and operator recovery review | Independent Gate 5 review evidence has not been captured | blocker |

## Commitment Format

| Field | Value or encoding | Evidence | Status |
|---|---|---|---|
| sidechainId | 1111111111111111111111111111111111111111111111111111111111111111 | artifact://trustless-burn/artifacts/completed-gate5-commitment-sidechain-id-2026-06-28-7de11aac.md completed Gate 5 commitment sidechain ID evidence; fixed-width 32-byte sidechain identity binding recorded; no finality, settlement, broadcast, or claim authorization | linked |
| sidechainHeight | 12345 | artifact://trustless-burn/artifacts/completed-gate5-commitment-sidechain-height-2026-06-29-bf0626ae.md completed Gate 5 commitment sidechain height evidence; non-negative u64 big-endian sidechainHeight=12345 recorded; Ergo-verifiable sidechain finality, authenticated header history, mined anchor, settlement, broadcast, and claim authorization remain out of scope | linked |
| sidechainHeaderHash | 2222222222222222222222222222222222222222222222222222222222222222 | artifact://trustless-burn/artifacts/completed-gate5-commitment-sidechain-header-hash-2026-06-29-f2403b18.md completed Gate 5 commitment sidechain header hash evidence; fixed-width 32-byte local proof-core header hash recorded; no finality, authenticated header history, mined anchor, settlement, broadcast, or claim authorization | linked |
| bridgeEventRoot | 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 | artifact://trustless-burn/artifacts/completed-gate5-commitment-bridge-event-root-2026-07-06-39bfec72.md completed Gate 5 commitment bridge event root evidence; fixed-width 32-byte local proof-core root recorded; no mined anchor, finality, settlement, broadcast, or claim authorization | linked |
| ergoAnchorHeight | 987654 | artifact://trustless-burn/artifacts/completed-gate5-commitment-ergo-anchor-height-2026-06-29-2dc77a6d.md completed Gate 5 commitment Ergo anchor height evidence; non-negative boundary-only anchorHeight=987654 recorded; mined Ergo anchor binding, live SPV tracker operation, on-chain proof acceptance, settlement, broadcast, and claim authorization remain out of scope | linked |
| commitmentPrefix | 0x0401 under 0x04xx extension keyspace | artifact://trustless-burn/artifacts/completed-gate5-commitment-prefix-2026-06-29-de7d0473.md completed Gate 5 commitment prefix evidence; 0x0401 under 0x04xx extension keyspace recorded; mined Ergo anchor binding, node patch completion, on-chain proof acceptance, settlement, broadcast, and claim authorization remain out of scope | linked |
| hashFunction | Blake2b-compatible hashing in local proof-core | artifact://trustless-burn/artifacts/completed-gate5-commitment-hash-function-2026-06-29-bcc71649.md completed Gate 5 commitment hash function evidence; Blake2b-compatible local proof-core hashing recorded; contract-level hash-function proof, on-chain proof acceptance, settlement, broadcast, and claim authorization remain out of scope | linked |
| finalityRule | local sidechain receipt-depth guard: requiredConfirmations=10 | artifact://trustless-burn/artifacts/completed-gate5-commitment-finality-rule-2026-06-29-ce197edd.md completed Gate 5 commitment finality rule evidence; local receipt-depth guard requiredConfirmations=10 recorded; Ergo-verifiable finality authority, authenticated commitment history, mined anchoring, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |

## Burn Proof Binding

| Field | Binding rule | Evidence | Status |
|---|---|---|---|
| burnId | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f | artifact://trustless-burn/artifacts/completed-gate5-burn-id-binding-2026-06-29-b8968c16.md completed Gate 5 burn proof burnId evidence; local proof-core burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f recorded; finality, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| recipientErgoTreeHash | recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 | artifact://trustless-burn/artifacts/completed-gate5-recipient-ergo-tree-hash-binding-2026-07-06-39bfec72.md completed Gate 5 burn proof recipientErgoTreeHash evidence; local proof-core recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 recorded; recipientErgoTreeHex preimage 0008cd024444444444444444444444444444444444444444444444444444444444444444 hashes to the proved recipient hash; sidechain finality, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| amountNanoErg | amountNanoErg 2000000 | artifact://trustless-burn/artifacts/completed-gate5-amount-nanoerg-binding-2026-06-29-8bb23dcb.md completed Gate 5 burn proof amountNanoErg evidence; local proof-core amountNanoErg 2000000 recorded; sidechain finality, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| sidechainTxHash | 6666666666666666666666666666666666666666666666666666666666666666 | artifact://trustless-burn/artifacts/completed-gate5-sidechain-tx-hash-binding-2026-06-29-b8968c16.md completed Gate 5 burn proof sidechainTxHash evidence; local proof-core sidechainTxHash 6666666666666666666666666666666666666666666666666666666666666666 recorded; finalized transaction inclusion, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| sidechainBlockHash | 2222222222222222222222222222222222222222222222222222222222222222 | artifact://trustless-burn/artifacts/completed-gate5-sidechain-block-hash-binding-2026-06-29-b8968c16.md completed Gate 5 burn proof sidechainBlockHash evidence; local proof-core sidechainBlockHash 2222222222222222222222222222222222222222222222222222222222222222 recorded; Ergo-verifiable finality, finalized block evidence, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| eventIndex | 8 | artifact://trustless-burn/artifacts/completed-gate5-event-index-binding-2026-06-29-b8968c16.md completed Gate 5 burn proof eventIndex evidence; local proof-core eventIndex 8 recorded; finalized event inclusion, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| inclusionPath | burn inclusion proof must resolve to bridgeEventRoot | artifact://trustless-burn/artifacts/completed-gate5-inclusion-path-binding-2026-07-06-39bfec72.md completed Gate 5 burn proof inclusionPath evidence; local proof-core inclusion path resolves to bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 with proof[0].side=left and proof[0].hashHex=2c109937d8c0b176a74f5df14a900158a469c03ee963296be38fd9f704781c66; mined anchoring, sidechain finality, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| duplicatePreventionKey | duplicatePreventionKey equals burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f | artifact://trustless-burn/artifacts/completed-gate5-duplicate-prevention-key-binding-2026-06-29-b8968c16.md completed Gate 5 burn proof duplicatePreventionKey evidence; local proof-core duplicatePreventionKey 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f equals burnId; DUP settlement insertion, on-chain proof acceptance, settlement, broadcast, and claim authorization remain outside this prerequisite | linked |
| settlementTxBinding | settlement transaction binding carries payout recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 and amountNanoErg 2000000 into the unsigned settlement shape | artifact://trustless-burn/artifacts/completed-local-settlement-tx-binding-2026-07-06-a6b1c444.md completed local settlementTxBinding evidence links the unsigned settlement identity to burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f, duplicatePreventionKey 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f, bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9, recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401, amountNanoErg 2000000, sidechainTxHash 6666666666666666666666666666666666666666666666666666666666666666, sidechainBlockHash 2222222222222222222222222222222222222222222222222222222222222222, and eventIndex 8 | linked |

## Local Proof Vector

Proof-vector validation report:
../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json

```json
{
  "leaf": {
    "sidechainIdHex": "1111111111111111111111111111111111111111111111111111111111111111",
    "sidechainBlockHashHex": "2222222222222222222222222222222222222222222222222222222222222222",
    "burnIdHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
    "sidechainTxHashHex": "6666666666666666666666666666666666666666666666666666666666666666",
    "eventIndex": 8,
    "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
    "amountNanoErg": "2000000",
    "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "bridgeEventRootHex": "701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9",
  "proof": [
    {
      "side": "left",
      "hashHex": "2c109937d8c0b176a74f5df14a900158a469c03ee963296be38fd9f704781c66"
    }
  ],
  "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
  "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
  "amountNanoErg": "2000000",
  "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000",
  "negativeCases": [
    {
      "name": "wrong-sidechain-id",
      "leaf": {
        "sidechainIdHex": "1212121212121212121212121212121212121212121212121212121212121212",
        "sidechainBlockHashHex": "2222222222222222222222222222222222222222222222222222222222222222",
        "burnIdHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "sidechainTxHashHex": "6666666666666666666666666666666666666666666666666666666666666666",
        "eventIndex": 8,
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "burnId must equal derived sidechain event identity"
      ]
    },
    {
      "name": "wrong-burn-id",
      "leaf": {
        "sidechainIdHex": "1111111111111111111111111111111111111111111111111111111111111111",
        "sidechainBlockHashHex": "2222222222222222222222222222222222222222222222222222222222222222",
        "burnIdHex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "sidechainTxHashHex": "6666666666666666666666666666666666666666666666666666666666666666",
        "eventIndex": 8,
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "burnId must equal derived sidechain event identity"
      ]
    },
    {
      "name": "wrong-event-index",
      "leaf": {
        "sidechainIdHex": "1111111111111111111111111111111111111111111111111111111111111111",
        "sidechainBlockHashHex": "2222222222222222222222222222222222222222222222222222222222222222",
        "burnIdHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "sidechainTxHashHex": "6666666666666666666666666666666666666666666666666666666666666666",
        "eventIndex": 9,
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "burnId must equal derived sidechain event identity"
      ]
    },
    {
      "name": "wrong-recipient",
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "7777777777777777777777777777777777777777777777777777777777777777",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "settlement recipient must equal proved recipientErgoTreeHash"
      ]
    },
    {
      "name": "wrong-amount",
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "1000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "settlement amount must equal proved amountNanoErg"
      ]
    },
    {
      "name": "wrong-duplicate-prevention-key",
      "settlementBinding": {
        "duplicatePreventionKeyHex": "57182144540292d653cf0d5f3b1e1f347795d67f9dd7fa3d1d2e2fe420d06c3a",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "duplicatePreventionKey must equal burnId"
      ]
    },
    {
      "name": "wrong-bridge-event-root",
      "settlementBinding": {
        "bridgeEventRootHex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "burn inclusion proof must resolve to bridgeEventRoot"
      ]
    },
    {
      "name": "malformed-inclusion-path",
      "settlementBinding": {
        "proof": [
          {
            "side": "right",
            "hashHex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          }
        ],
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "expectedErrors": [
        "burn inclusion proof must resolve to bridgeEventRoot"
      ]
    }
  ]
}
```

## Positive Proof Acceptance

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Valid burn proof acceptance | accepted | artifact://trustless-burn/artifacts/completed-local-positive-proof-acceptance-2026-07-09-ace3896d.md completed local positive burn proof acceptance evidence; Contract-equivalent acceptance report: ../evidence/trustless-burn/artifacts/completed-local-contract-acceptance-2026-07-09-c3612838.json; artifact://trustless-burn/artifacts/completed-local-contract-acceptance-2026-07-09-c3612838.md completed local contract-equivalent V2 predicate acceptance evidence; local proof-core burn proof accepted; local V2 predicate accepted the same proof bundle; inclusion proof resolves to bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9; burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; duplicatePreventionKey 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f equals burnId; settlement transaction binding carries payout recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 and amountNanoErg 2000000; sidechainTxHash 6666666666666666666666666666666666666666666666666666666666666666; sidechainBlockHash 2222222222222222222222222222222222222222222222222222222222222222; eventIndex 8; no ErgoScript VM execution, no on-chain proof acceptance, no mined anchor, no DUP insertion, no signing, no submit, no broadcast, no Gate 5 closure, and no production or testnet production-candidate claim support | linked |

## Negative Tests

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Wrong sidechain ID | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-sidechain-id-2026-06-26-174d4cfb.md; wrong sidechain ID rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity. | linked |
| Wrong recipient | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-recipient-2026-06-26-174d4cfb.md; wrong recipient rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; negativeCase wrong-recipient observed error settlement recipient must equal proved recipientErgoTreeHash. | linked |
| Wrong amount | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-amount-2026-06-26-174d4cfb.md; wrong amount rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; negativeCase wrong-amount observed error settlement amount must equal proved amountNanoErg. | linked |
| Reused burn ID | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-reused-burn-id-2026-06-26-174d4cfb.md; duplicate reused burn ID rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; negativeCase wrong-burn-id observed error burnId must equal derived sidechain event identity; negativeCase wrong-event-index observed error burnId must equal derived sidechain event identity; negativeCase wrong-duplicate-prevention-key observed error duplicatePreventionKey must equal burnId. | linked |
| Reorged sidechain block | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-reorged-sidechain-block-2026-06-26-247a84b1.md; reorged sidechain block rejected; rejected burnId 0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76; observed error burn receipt block hash does not match canonical sidechain block. | linked |
| Unfinalized sidechain block | rejected | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md; unfinalized sidechain block rejected; rejected burnId 0794b13285e5ae81ed49455a428e01a9f648f120f705f6b678dd5abe1d6cbb76; receipt 1111111111111111111111111111111111111111111111111111111111111111:7 observed error burn receipt has 2 sidechain confirmation(s), requires 10. | linked |
| Stale SPV tracker digest | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-stale-spv-tracker-digest-2026-06-26-174d4cfb.md; stale SPV tracker digest rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; negativeCase wrong-bridge-event-root observed error burn inclusion proof must resolve to bridgeEventRoot. | linked |
| Wrong Ergo anchor height | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-ergo-anchor-height-2026-06-26-247a84b1.md; wrong Ergo anchor height rejected; rejected bridgeEventRoot c4740365cf82fb50b350d1ace62a48b411539643cf7f343b2ce2c1f71e2e23ca; observed result invalid because expected 0x0401 bridgeEventRoot was absent at persisted Ergo anchor height 50000. | linked |
| Malformed inclusion path | rejected | artifact://trustless-burn/artifacts/completed-gate5-negative-malformed-inclusion-path-2026-06-26-174d4cfb.md; malformed inclusion path rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; negativeCase malformed-inclusion-path observed error burn inclusion proof must resolve to bridgeEventRoot. | linked |
| Trusted-oracle fallback presented as trustless | rejected by review | artifact://trustless-burn/artifacts/completed-gate5-negative-trusted-oracle-fallback-rejection-2026-06-26-96384d6e.md; trusted-oracle fallback presented as trustless rejected; rejected burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f; Gate 5 still lacks Ergo-verifiable finality, authenticated commitment history, on-chain proof acceptance, DUP settlement insertion, reorg handling, and independent review. | linked |

## Publication Decision

| Field | Value |
|---|---|
| Trustless burn verification implemented | no |
| Release supported | institutional reference |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Transitional trusted burn path disabled | no |
| Critical/high findings open | 1 |
| Release notes updated | yes |
| Required release checklist updates | artifact://trustless-burn/artifacts/completed-gate5-checklist-update-evidence-2026-06-26-b354f254.md completed Gate 5 checklist update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Required release-note updates | artifact://trustless-burn/artifacts/completed-gate5-release-note-update-evidence-2026-06-26-b354f254.md completed Gate 5 release-note update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Reviewer decision summary | release support remains Release supported = institutional reference; Trustless burn verification implemented = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; transitional trusted burn path handling: Transitional trusted burn path disabled = no; Critical/high findings open = 1 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Protocol reviewer | A. Shannon | block | 2026-07-07 | Recipient-tree local proof-vector validation, burn ID, sidechain transaction hash, sidechain block hash, event index, duplicate-prevention key, recipient hash, amount, inclusion path, finality-rule prerequisite, local reorg-handling prerequisite, and linked local SPV tracker observation are recorded, but Ergo-verifiable sidechain finality, on-chain proof acceptance, DUP settlement insertion, linked 0x04xx anchoring, and independent review still block Gate 5. |
| Security reviewer | unassigned | block | 2026-07-07 | Trustless burn remains blocked until commitment format, burn inclusion proof, SPV tracker observation, stale tracker rejection, reorg rejection, trusted-oracle fallback rejection, and no-broadcast boundaries are independently reviewed. |
| Operator reviewer | unassigned | block | 2026-07-07 | Validate operator recovery, readiness, release-note, checklist, anchor observation closure, and no-broadcast evidence before Gate 5 approval. |
