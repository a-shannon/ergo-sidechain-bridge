# ErgoScript Contracts — Ergo-Substrate Sidechain Bridge

## Contract Files

| File | Purpose | Phase |
|------|---------|-------|
| `SideChainState.es` | Canonical sidechain state singleton (R4=height, R5=T_h, R6=U_h, R7=C_h) | 001 |
| `MainChainLock.es` | ERG lock address for peg-in (users deposit here) | 001 |
| `MainChainLockCausalV2.es` | Non-deployed V2 refundable source lock; exact intent-to-vault transition | WP-06T20E-B |
| `MainChainCausalVaultV2.es` | Non-deployed V2 committed vault; no refund branch, authenticated ERG settlement only | WP-06T20E-B |
| `DoubleUnlockPreventionCausalV2.es` | Non-deployed replay singleton bound to the causal-vault ErgoTree hash | WP-06T20E-B |
| `MainChainCausalVaultValidityV1.es` | Non-deployed validity-settlement vault consuming the exact validity tracker as a data input | WP-06AB |
| `DoubleUnlockPreventionValidityV1.es` | Non-deployed committee-free replay singleton hash-bound to the validity-settlement vault | WP-06AB |
| `MainChainUnlock.es` | Transitional committee-authorized MCU source; no beneficiary timeout | 010a / WP-02 |
| `DoubleUnlockPrevention.es` | AVL+ tree of spent sidechain burn TX IDs | 001 |
| `MainChainAggregateUnlockTrustless.es` | V2 source-boundary compact trustless burn aggregate payout guard | 011 |
| `compiled_contracts.json` | Compiled ErgoTree hex + P2S addresses | 001 (after deployment) |
| `deployed_state.json` | On-chain box IDs, NFT IDs, deployment metadata | 001 (after deployment) |

The old v1 MainChainUnlock ErgoTree is immutable and remains unsafe if any box
still exists at that address. The current source does not upgrade those boxes.
New legacy MCU creation and spend are disabled in the relayer; use the read-only
`npm run inventory:legacy-mcu -- --address <legacy-address>` command before any
cutover decision. That command is an explicit-address diagnostic, not proof that
the supplied set or network is exhaustive. The separate
`npm run cutover:legacy-mcu-assess -- --manifest <manifest.json>
--expected-manifest-sha256 <digest> --primary-node-url <origin>
--witness-node-url <distinct-origin> --json-out <report>` command enforces the
expected network/checkpoint/address/script set, synchronized indexes, exact
two-origin agreement, and zero-UTXO observation
described in [Legacy MCU Cutover Manifest V1](../docs/legacy-mcu-cutover-manifest.md).
Origin agreement is not independent-source provenance or a consensus proof. The
command does not authenticate manifest review, authorize cutover, activate a
deployment, or authorize funds.

The committed-vault-v3 peg-in route has a separate non-authorizing observer:
`npm run pegin:route-observe -- --manifest <route-manifest.json>
--expected-manifest-sha256 <digest> --main-chain-lock-source
../contracts/MainChainLock.es --settlement-vault-source
../contracts/MainChainAggregateUnlockTrustless.es --primary-node-url <origin>
--witness-node-url <distinct-origin> --json-out <new-report.json>`. It binds the
exact MCL source/profile and settlement vault, classifies complete active MCL
and vault history, and accepts only exact confirmed MCL-to-vault transitions.
It does not read deployment state, authorize mint or routing, or activate a
deployment. See [Peg-In Route Observation V1](../docs/peg-in-route-observation.md).

The three causal V2 contracts are check-only source/settlement VM candidates.
They are not in `deployed_state.json`, do not replace the active V1 route, and
do not authorize minting. Their exact register, profile, and evidence boundaries are defined in
[Peg-In Causal Admission V2](../docs/peg-in-causal-admission-v2.md).

The WP-06AB validity-settlement contracts are a separate, preactivation
profile. The vault pins the exact `SPVTrackerValidityV1` NFT, proposition,
approved trust-root digest, sidechain and settlement profile; verifies burn
inclusion and payout fields; and requires the matching DUP update. The DUP
contract has no committee predicate and is hash-bound to that exact vault
ErgoTree. Both protected state successors must preserve a nondecreasing,
non-future creation height within 100 blocks of the current VM `HEIGHT`, so an
accepted transition remains mempool-safe without manufacturing a materially
aged replay or partial-vault box. Pinned-JVM compilation and reduction are
local conformance evidence only. The V1 compatibility proof does not establish that its burn root is a
member of finalized Frontier application state. The fixture uses synthetic
setup boxes and establishes no singleton lineage, activated profile, node
acceptance, signing, submission, broadcast, fee-funding authorization, Gate 5
closure or funds authority.

## Deployment

See [../phases/implementationplan001.md](../phases/implementationplan001.md) §5 for deployment procedure.
