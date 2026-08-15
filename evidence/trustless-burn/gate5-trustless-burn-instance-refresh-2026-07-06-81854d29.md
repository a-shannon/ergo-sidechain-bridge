# Gate 5 Trustless Burn Instance Refresh Check

This packet checks whether the local proof-vector, candidate, and unsigned transaction evidence are bound to the same non-mainnet trustless-burn instance.
It does not close Gate 5, does not authorize transaction checks, signing, submit, broadcast, deployment, reconciliation, release-gate PASS, mainnet, production-ready, or testnet-production-candidate claims.

## Summary

| Field | Value |
| --- | --- |
| Status | TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED |
| Exit code | 1 |
| Source commit | 81854d29 |
| Selected network | local offline non-mainnet |
| Structural issues | 8 |

## Source Targets

| Target | Value |
| --- | --- |
| Instance binding | ../evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-06-96c9f80a.md |
| Instance binding JSON | ../evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-06-96c9f80a.json |
| Candidate | ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-03-541347da.md |
| Proof-vector report | ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |
| Unsigned TX validation report | ../evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-validation-2026-07-03-57d80158.md |
| Unsigned TX JSON | ../evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-2026-07-03-57d80158.json |

## Bound Instance Identity

| Field | Value |
| --- | --- |
| sidechainId | 1111111111111111111111111111111111111111111111111111111111111111 |
| sidechainTxHash | 6666666666666666666666666666666666666666666666666666666666666666 |
| sidechainBlockHash | 2222222222222222222222222222222222222222222222222222222222222222 |
| eventIndex | 8 |
| bridgeEventRoot | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| ergoAnchorHeight | 987654 |
| burnId | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| duplicatePreventionKey | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| recipientErgoTreeHash | 8888888888888888888888888888888888888888888888888888888888888888 |
| amountNanoErg | 2000000 |
| assetId | 0000000000000000000000000000000000000000000000000000000000000000 |
| proofVectorTarget | ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |

## Refresh Checks

| Check | Status | Detail |
| --- | --- | --- |
| Instance binding Markdown matches JSON identity | pass | binding target ../evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-06-96c9f80a.md carries burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |
| Candidate target matches instance binding target | pass | candidate target ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-03-541347da.md |
| Candidate Markdown carries bound instance identity | pass | candidate carries the bound burnId, root, recipient, amount, and sidechain identifiers |
| Proof-vector target matches instance binding target | pass | proof-vector report target ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json |
| Proof-vector report status is PASS | pass | proof-vector report status PASS |
| Proof-vector report remains local read-only evidence | pass | proof-vector boundary is readOnly/localProofCoreOnly with no closure, settlement, broadcast, or claim support |
| Proof-vector report bridgeEventRoot matches instance | pass | bridgeEventRoot 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| Proof-vector report includes expected rejected negative cases | pass | required negative cases rejected |
| Unsigned TX validation report target matches JSON target | pass | validated target ../evidence/trustless-burn/artifacts/completed-local-trustless-single-leaf-unsigned-tx-2026-07-03-57d80158.json |
| Unsigned TX validation report is PASS with zero structural issues | pass | unsigned TX validation report PASS / 0 structural issues |
| Unsigned TX validation report preserves no-check/no-sign/no-broadcast boundary | pass | unsigned TX validation report records no transaction check, expected tx id, signing, or broadcast |
| Unsigned TX JSON structure validates | pass | Trustless unsigned TX evidence PASS: 1 single-leaf unsigned transaction source-boundary claim(s), broadcast=no, contextExtensionGuard=pass; not Gate 5 closure, pre-broadcast evidence, transaction-check evidence, expected-tx-id evidence, signing authorization, or claim authorization. |
| Unsigned TX JSON settlement identity matches instance | blocked | unsigned TX JSON must be regenerated for the bound instance before this refresh can be READY |
| Unsigned TX JSON context-extension guard remains source-boundary only | pass | contextExtensionGuard pass with signingPermitted=false and broadcastPermitted=false |

## Exact Binding Mismatches

- unsignedTx.claims[0].legacySidechainTxHash must match instance 6666666666666666666666666666666666666666666666666666666666666666
- unsignedTx.claims[0].trustlessBurnDerivation.sidechainLogIndex must match instance eventIndex 8
- unsignedTx.claims[0].trustlessBurnDerivation.derivedBurnIdHex must match instance 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f
- unsignedTx.claims[0].settlementIdentity.duplicatePreventionKeyHex must match instance 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f
- unsignedTx.claims[0].settlementIdentity.bridgeEventRootHex must match instance 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb
- unsignedTx.claims[0].settlementIdentity.recipientErgoTreeHashHex must match instance 8888888888888888888888888888888888888888888888888888888888888888
- unsignedTx.claims[0].settlementIdentity.amountNanoErg must match instance 2000000

## Next Evidence

- Treat the existing unsigned transaction evidence as stale for this instance until every exact binding mismatch is cleared.
- Regenerate local trustless unsigned transaction evidence for burnId 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f, bridgeEventRoot 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb, recipient 8888888888888888888888888888888888888888888888888888888888888888, and amountNanoErg 2000000.
- Keep the regenerated unsigned transaction evidence offline and source-boundary only: no /transactions/check, expected tx id, signing, submit, broadcast, reconciliation, node mutation, or deployment.
- After exact unsigned evidence matches the instance, capture sanitized anchor, SPV tracker, finality, proof-acceptance, and DUP settlement binding evidence for the same identifiers.

## Boundary

| Boundary | Value |
| --- | --- |
| Refresh/prerequisite output only | yes |
| Instance binding evidence reused | yes |
| Candidate evidence reused | yes |
| Proof-vector report evidence reused | yes |
| Unsigned transaction evidence checked | yes |
| Secret or environment file read | no |
| Wallet recovery material or private key read | no |
| Node config secret read | no |
| Runtime database opened by refresh command | no |
| Private deployment state opened by refresh command | no |
| Node or RPC request performed by refresh command | no |
| Transaction check performed | no |
| Expected transaction ID claimed | no |
| Transaction signing performed or authorized | no |
| Transaction submit or broadcast performed or authorized | no |
| Settlement reconciliation performed | no |
| Gate 5 trustless-burn evidence claimed complete | no |
| Release gate PASS claimed | no |
| Production-ready claim allowed | no |
| Mainnet-grade evidence linked | no |
| Testnet production-candidate claim authorized by refresh | no |
