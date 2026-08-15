# Gate 5 Trustless Burn Blocker Map - 2026-06-25 - 8337cc67

This packet converts the current trustless-burn proof-vector and candidate-only
evidence into the Trustless Burn Verification Evidence layout. It is not
completed Gate 5 trustless-burn evidence and does not support settlement
readiness, testnet production-candidate, production-ready, mainnet, broadcast,
or completed trustless-burn implementation claims.

No wallet recovery material, signing credential material, restricted deployment
records, local runtime state, private database state, or live transaction
evidence was read or used for this packet.

Current local prerequisite evidence:

- artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md
- artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-25-a5462960.json
- artifact://trustless-burn/artifacts/completed-trustless-candidate-public-fixture-validation-2026-06-25-51f88f9c.md
- artifact://trustless-burn/artifacts/completed-trustless-candidate-public-fixture-2026-06-25-51f88f9c.json
- artifact://trustless-burn/gate5-sidechain-finality-addendum-2026-06-25-9dbeff16.md
- artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md

Current validation blocker report:

- artifact://trustless-burn/artifacts/trustless-validate-gate5-blocker-map-blocked-2026-06-26-575f9dd9.md

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 trustless-burn blocker map |
| Git commit | 8337cc67 |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path |
| Reviewer | A. Shannon |
| Date | 2026-06-25 |

## Required Components

| Component | Required property | Evidence | Status |
|---|---|---|---|
| Sidechain commitment format | Stable, versioned, sidechain-specific commitment format | Local proof-vector evidence records sidechainId and bridgeEventRoot proof-core values, but sidechain commitment format evidence is not captured as completed Gate 5 component evidence | blocker |
| Ergo extension-section anchoring | Commitment embedded under collision-safe `0x04xx` extension keys | extension-section anchoring under 0x04xx keys has not been captured in completed on-chain or contract evidence | blocker |
| Sidechain header/finality verifier | Ergo-verifiable sidechain header or finality rule | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md records local receipt-depth rejection before trustless burn leaf construction, but Ergo-verifiable sidechain finality authority has not been captured | blocker |
| SPV relay contract or tracker | SPV relay with authenticated commitment history on Ergo | SPV relay or tracker evidence has not been captured | blocker |
| Burn commitment tree | ErgoScript-friendly burn tree using Blake2b-compatible hashing | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records a local Blake2b-compatible proof-core bridgeEventRoot, but this is not completed Gate 5 component evidence | blocker |
| Burn inclusion proof | On-chain proof accepts only included burn events | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core inclusion validation, but on-chain proof acceptance evidence has not been captured | blocker |
| DUP settlement binding | Proved burn ID is the exact DUP key inserted by settlement | artifact://trustless-burn/artifacts/completed-trustless-candidate-public-fixture-validation-2026-06-25-51f88f9c.md records candidate-only duplicate-prevention key derivation, but settlement DUP insertion evidence has not been captured | blocker |
| Reorg handling | Reorged sidechain commitments cannot release ERG | reorg handling evidence has not been captured | blocker |
| Independent review | Independent consensus, commitment, proof format, and operator recovery review | independent Gate 5 review evidence has not been captured | blocker |

## Commitment Format

| Field | Value or encoding | Evidence | Status |
|---|---|---|---|
| sidechainId | 1111111111111111111111111111111111111111111111111111111111111111 | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records the local proof-vector sidechain ID, but this is not completed Gate 5 commitment-format evidence | blocker |
| sidechainHeight | not captured | sidechain height binding for a finality-checked sidechain header has not been captured | blocker |
| sidechainHeaderHash | 2222222222222222222222222222222222222222222222222222222222222222 | local proof-vector leaf value only; sidechain header/finality evidence has not been captured | blocker |
| bridgeEventRoot | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records the local bridgeEventRoot, but on-chain commitment evidence has not been captured | blocker |
| ergoAnchorHeight | not captured | Ergo anchor height binding has not been captured | blocker |
| commitmentPrefix | not captured | 0x04xx commitmentPrefix extension-key evidence has not been captured | blocker |
| hashFunction | Blake2b-compatible hashing in local proof-core | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core hashing, but contract-level hash-function evidence has not been captured | blocker |
| finalityRule | local receipt-depth guard only | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md records rejection when a burn receipt has `2` sidechain confirmations and requires `10`, but this is not Ergo-verifiable finality authority evidence | blocker |

## Burn Proof Binding

| Field | Binding rule | Evidence | Status |
|---|---|---|---|
| burnId | burnId must equal the derived sidechain event identity | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core rejection when burnId diverges from the derived sidechain event identity | blocker |
| recipientErgoTreeHash | settlement recipient must equal proved recipientErgoTreeHash | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core recipient binding | blocker |
| amountNanoErg | settlement amount must equal proved amountNanoErg | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core amount binding | blocker |
| sidechainTxHash | sidechainTxHash is encoded in the burn leaf | local proof-vector leaf value is present, but sidechain transaction inclusion evidence has not been captured | blocker |
| sidechainBlockHash | sidechainBlockHash is encoded in the burn leaf and must belong to a finalized sidechain block | local proof-vector leaf value is present, but finalized sidechain block evidence has not been captured | blocker |
| eventIndex | eventIndex is encoded in the burn leaf and participates in the derived burn identity | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core rejection when eventIndex changes the derived identity | blocker |
| inclusionPath | burn inclusion proof must resolve to bridgeEventRoot | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core inclusion-path rejection | blocker |
| duplicatePreventionKey | duplicatePreventionKey must equal burnId | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records local proof-core duplicate-prevention binding | blocker |
| settlementTxBinding | settlement payout must bind the proved burn recipient and amount before DUP insertion | candidate-only settlement identity is recorded in artifact://trustless-burn/artifacts/completed-trustless-candidate-public-fixture-validation-2026-06-25-51f88f9c.md, but settlement transaction acceptance evidence has not been captured | blocker |

## Local Proof Vector

Proof-vector validation report:
../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-25-a5462960.json

```json
{
  "leaf": {
    "sidechainIdHex": "1111111111111111111111111111111111111111111111111111111111111111",
    "sidechainBlockHashHex": "2222222222222222222222222222222222222222222222222222222222222222",
    "burnIdHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
    "sidechainTxHashHex": "6666666666666666666666666666666666666666666666666666666666666666",
    "eventIndex": 8,
    "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
    "amountNanoErg": "2000000",
    "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
  },
  "bridgeEventRootHex": "1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb",
  "proof": [
    {
      "side": "left",
      "hashHex": "82675b060423fffa706bdff7954dc1a4e3899a1ea157fb0db50e1f6daa71e87d"
    }
  ],
  "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
  "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
        "amountNanoErg": "2000000",
        "assetIdHex": "0000000000000000000000000000000000000000000000000000000000000000"
      },
      "settlementBinding": {
        "duplicatePreventionKeyHex": "548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f",
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
        "recipientErgoTreeHashHex": "8888888888888888888888888888888888888888888888888888888888888888",
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
| Valid burn proof acceptance | accepted | local proof-core vector validates in artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md, but on-chain Ergo proof acceptance, DUP insertion, settlement payout binding, and accepted settlement transaction evidence have not been captured | blocker |

## Negative Tests

| Check | Expected result | Evidence | Status |
|---|---|---|---|
| Wrong sidechain ID | rejected | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records negativeCase wrong-sidechain-id rejected with `burnId must equal derived sidechain event identity` against burn ID 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f | blocker |
| Wrong recipient | rejected | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records negativeCase wrong-recipient rejected with `settlement recipient must equal proved recipientErgoTreeHash` against burn ID 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f | blocker |
| Wrong amount | rejected | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records negativeCase wrong-amount rejected with `settlement amount must equal proved amountNanoErg` against burn ID 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f | blocker |
| Reused burn ID | rejected | duplicate or reused burn ID settlement rejection evidence has not been captured for a completed Gate 5 DUP replay case | blocker |
| Reorged sidechain block | rejected | reorged sidechain block rejection evidence has not been captured | blocker |
| Unfinalized sidechain block | rejected | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md records local verifier rejection before leaf construction when a burn receipt has `2` sidechain confirmations and requires `10`; Gate 5 still lacks Ergo-verifiable sidechain finality authority and on-chain commitment evidence | blocker |
| Stale SPV tracker digest | rejected | stale SPV tracker digest rejection evidence has not been captured | blocker |
| Wrong Ergo anchor height | rejected | wrong Ergo anchor height rejection evidence has not been captured | blocker |
| Malformed inclusion path | rejected | artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md records negativeCase malformed-inclusion-path rejected with `burn inclusion proof must resolve to bridgeEventRoot` against burn ID 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f | blocker |
| Trusted-oracle fallback presented as trustless | rejected by review | trusted-oracle fallback rejection review evidence has not been captured | blocker |

## Publication Decision

| Field | Value |
|---|---|
| Trustless burn verification implemented | no |
| Release supported | institutional reference |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Transitional trusted burn path disabled | no |
| Critical/high findings open | 1 |
| Release notes updated | no |
| Required release checklist updates | completed Gate 5 checklist update evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Required release-note updates | completed Gate 5 release-note update evidence has not been produced; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Reviewer decision summary | release support remains Release supported = institutional reference; Trustless burn verification implemented = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; transitional trusted burn path handling: Transitional trusted burn path disabled = no; Critical/high findings open = 1 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Protocol reviewer | A. Shannon | block | 2026-06-25 | Local proof-core validation, candidate-only duplicate-prevention derivation, and local unfinalized sidechain receipt rejection are recorded, but Ergo-verifiable sidechain finality, SPV or tracker commitment history, on-chain proof acceptance, DUP settlement insertion, reorg handling, 0x04xx anchoring, and independent review still block Gate 5 |
| Security reviewer | unassigned | block | 2026-06-25 | Review commitment format, burn inclusion proof, stale tracker rejection, reorg rejection, trusted-oracle fallback rejection, and no-broadcast boundaries before Gate 5 approval |
| Operator reviewer | unassigned | block | 2026-06-25 | Validate operator recovery, readiness, release-note, checklist, and no-broadcast evidence before Gate 5 approval |
