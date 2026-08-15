# Gate 5 Local Contract-Equivalent Burn Acceptance

This packet checks the current non-mainnet Gate 5 proof-vector instance against the local V2 trustless-burn contract predicate model.
It is still local contract-equivalent evidence only: it does not execute the ErgoScript VM, does not prove mined on-chain acceptance, and does not close Gate 5.

## Summary

| Field | Value |
| --- | --- |
| Status | PASS |
| Exit code | 0 |
| Source commit | c3612838 |
| Selected network | local offline non-mainnet |
| Structural issues | 0 |
| Sidechain height | 12345 |
| Current Ergo height used for local predicate | 987664 |

## Source Targets

| Target | Value |
| --- | --- |
| Candidate | ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md |
| Instance binding JSON | ../evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-09-ace3896d.json |
| Proof vector | test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json |

## Bound Instance Identity

| Field | Value |
| --- | --- |
| sidechainId | 1111111111111111111111111111111111111111111111111111111111111111 |
| sidechainTxHash | 6666666666666666666666666666666666666666666666666666666666666666 |
| sidechainBlockHash | 2222222222222222222222222222222222222222222222222222222222222222 |
| eventIndex | 8 |
| bridgeEventRoot | 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| ergoAnchorHeight | 987654 |
| burnId | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| duplicatePreventionKey | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| recipientErgoTreeHash | dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 |
| amountNanoErg | 2000000 |
| assetId | 0000000000000000000000000000000000000000000000000000000000000000 |

## Source Checks

| Check | Status | Detail |
| --- | --- | --- |
| Instance binding JSON validates | pass | binding target ../evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-09-ace3896d.json |
| Proof vector validates | pass | proof vector target test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json |
| Candidate sidechain height is available | pass | sidechainHeight 12345 |
| Target proof-vector leaf is present | pass | burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Instance sidechainId matches proof vector | pass | sidechainId 1111111111111111111111111111111111111111111111111111111111111111 |
| Instance sidechainTxHash matches proof vector | pass | sidechainTxHash 6666666666666666666666666666666666666666666666666666666666666666 |
| Instance sidechainBlockHash matches proof vector | pass | sidechainBlockHash 2222222222222222222222222222222222222222222222222222222222222222 |
| Instance eventIndex matches proof vector | pass | eventIndex 8 |
| Instance bridgeEventRoot matches proof vector | pass | bridgeEventRoot 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| Instance burnId matches proof vector | pass | burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Instance duplicatePreventionKey matches proof vector | pass | duplicatePreventionKey 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Instance recipientErgoTreeHash matches proof vector | pass | recipientErgoTreeHash dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401 |
| Instance amountNanoErg matches proof vector | pass | amountNanoErg 2000000 |
| Instance assetId matches proof vector | pass | assetId 0000000000000000000000000000000000000000000000000000000000000000 |

## Positive Contract-Equivalent Acceptance

| Field | Value |
| --- | --- |
| Accepted | yes |
| Observed errors | none |
| Derived tracker key | 46bfd6977e3c170fa567da9fd95d79d3e0232c3da99a4dc4194910328789dbdb |
| Derived Merkle root | 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| Burn proof node count | 1 |
| DUP lookup proof length | 0 |
| Ergo anchor height | 987654 |

## Negative Contract-Equivalent Rejection Checks

| Case | Status | Expected error | Observed errors |
| --- | --- | --- | --- |
| tracker-event-root-drift | REJECTED | burn inclusion proof must resolve to bridgeEventRoot | burn inclusion proof must resolve to bridgeEventRoot |
| malformed-inclusion-path | REJECTED | burn inclusion proof must resolve to bridgeEventRoot | burn inclusion proof must resolve to bridgeEventRoot |
| stale-ergo-anchor | REJECTED | Ergo anchor height must satisfy minimum confirmations | Ergo anchor height must satisfy minimum confirmations |
| payout-value-drift | REJECTED | payout value must equal proved amountNanoErg | payout value must equal proved amountNanoErg |
| recipient-tree-drift | REJECTED | leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane | leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane |
| tracker-key-drift | REJECTED | leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane | leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane |
| spent-dup-key | REJECTED | DUP key must not already be spent | DUP key must not already be spent |
| bad-proof-side-byte | REJECTED | burn proof side bytes must be 0 or 1 | burn proof side bytes must be 0 or 1; burn inclusion proof must resolve to bridgeEventRoot; contract input shape must match trustless proof bundle constraints |

## Next Evidence

- Use this local predicate-model packet only as prerequisite evidence for burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f.
- Next useful step is real non-broadcast ErgoScript VM acceptance for the same proof bundle, or a formal decision that the ContextExtension serialization blocker prevents live settlement evaluation until upstream conformance is resolved.
- Do not mark Gate 5 closed until mined 0x04 anchoring, Ergo-verifiable finality, on-chain proof acceptance, DUP insertion/replay rejection, stale/reorg rejection, and independent review are all captured.

## Boundary

| Boundary | Value |
| --- | --- |
| Contract-equivalent local predicate model evaluated | yes |
| Current Gate 5 non-mainnet instance reused | yes |
| Positive proof bundle checked by local predicate model | yes |
| Negative predicate cases checked locally | yes |
| Secret or environment file read | no |
| Wallet recovery material or private key read | no |
| Runtime database opened | no |
| Private deployment state opened | no |
| Node or RPC request performed | no |
| ErgoScript VM execution performed | no |
| On-chain proof acceptance claimed | no |
| Mined Ergo anchor claimed | no |
| Sidechain finality claimed | no |
| DUP insertion on-chain claimed | no |
| Transaction check performed | no |
| Expected transaction ID claimed | no |
| Transaction signing performed or authorized | no |
| Transaction submit or broadcast performed or authorized | no |
| Gate 5 trustless-burn evidence claimed complete | no |
| Release gate PASS claimed | no |
| Testnet production-candidate claim support | no |
| Production-ready claim support | no |
| Mainnet-grade evidence linked | no |
