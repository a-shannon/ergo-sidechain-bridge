# Legacy MCU Cutover Manifest V1

## Purpose

The immutable V1 `MainChainUnlock` script can still release ERG under its old
predicate. Source containment prevents the current relayer from creating or
spending those boxes, but it cannot upgrade boxes that already exist. Cutover
therefore requires a reviewed, network-bound inventory of every historical V1
address and exact ErgoTree.

The existing command remains diagnostic:

```text
npm run inventory:legacy-mcu -- --address <address> --json-out <new-report.json>
```

It does not establish network identity or address-set completeness. The
manifest-bound observation command is separate:

```text
npm run cutover:legacy-mcu-assess -- --manifest <manifest.json> --expected-manifest-sha256 <64-lowercase-hex> --primary-node-url <explicit-http-or-https-origin> --witness-node-url <distinct-origin> --json-out <new-assessment.json>
```

Both commands are read-only. Neither loads deployment state, runtime databases,
signer material, or broadcast configuration.

## Exact Manifest Shape

The V1 manifest uses exact fields; unknown and duplicate JSON keys are rejected.

| Field | Requirement |
|---|---|
| `schemaVersion` | `ergo.bridge.legacy-mcu-manifest.v1` |
| `kind` | `legacy-mcu-address-script-manifest` |
| `manifestId` | Stable lowercase identifier |
| `network.id` | Exact `ergo-<nodeInfoNetwork>` identifier |
| `network.nodeInfoNetwork` | `mainnet`, `testnet`, `local`, `development`, or `devnet` |
| `network.addressNetworkPrefix` | `0` for mainnet; `16` for every declared non-mainnet network |
| `network.p2sAddressHeader` | Network prefix plus P2S type: `3` or `19` |
| `network.anchorHeader.height` / `idHex` | Exact reviewed canonical checkpoint |
| `network.anchorHeader.minimumDepth` | At least 10 confirmations at observation |
| `network.anchorHeader.maximumAgeBlocks` | At least the minimum depth and at most the V1 bound of 720 blocks |
| `coverage.mode` | `complete_historical_v1_mcu_address_script_set` |
| `coverage.declaredEntryCount` | Positive count equal to `entries.length` |
| `coverage.cutoff.event` | `legacy_mcu_creation_disabled` |
| `coverage.cutoff.sourceRevision` | Exact 20-byte reviewed source revision |
| `coverage.basis` | Sorted, non-empty public review references and their SHA-256 digests |
| `entries[].ordinal` | Zero-based array position |
| `entries[].scriptRole` | `legacy-mcu-v1` |
| `entries[].address` | Valid P2S address on the declared network |
| `entries[].addressHeader` | Exact declared P2S header |
| `entries[].ergoTreeHex` | Exact lowercase immutable V1 ErgoTree bytes |
| `entries[].ergoTreeSha256Hex` | SHA-256 of the raw ErgoTree bytes |

Entries are lexically sorted by address. Addresses and ErgoTrees are unique.
The decoded address must reproduce the exact manifest ErgoTree. The current
`contracts/MainChainUnlock.es` source is the transitional replacement and must
not be compiled as a proxy for historical V1 bytes.

## Expected Digest

The caller supplies `--expected-manifest-sha256`. The tool computes:

```text
SHA-256(
  ASCII("ERGO-BRIDGE-LEGACY-MCU-CUTOVER-MANIFEST-V1")
  || 0x00
  || UTF8(canonical-json(manifest))
)
```

Canonical JSON sorts object keys, preserves array order, accepts only safe
integer numbers, and rejects undefined, non-finite, duplicate, or unknown
values. Digest equality binds the run to exact expected content. It does not
prove that the content was independently reviewed or authenticate who supplied
the digest.

## Observation Procedure

The command fails closed unless all of the following hold:

1. Manifest schema and expected digest match exactly.
2. Two distinct canonical node origins report the declared coherent network
   tuple.
3. Each node's extra index equals its full height, and `/info`, index progress,
   and best header identify the same tip before and after the scan.
4. Both sources identify the exact same starting and ending snapshots.
5. Both sources expose the reviewed checkpoint at its exact height, with depth
   inside the manifest's minimum-depth and maximum-age window.
6. Every manifest address is scanned through each source's bounded, complete
   paginated read adapter.
7. Every returned box carries its manifest-bound ErgoTree and a unique box ID.
8. Every legacy register set is structurally valid.
9. Zero legacy MCU UTXOs remain on both observations.

The non-authorizing observation classification is
`observation_condition_met_under_explicit_manifest`. Blocked classifications
distinguish invalid or mismatched manifests, origin-identity or observation-
agreement failures, incoherent networks, checkpoint policy failures, lagging
indexes, unstable views, query failures, malformed boxes, script mismatches,
and remaining legacy UTXOs. Every discovered box remains quarantined.

## Claim Boundary

A successful command records only a two-origin zero-legacy-UTXO observation
under the explicit manifest, synchronized indexes, and its checkpoint window.
Distinct origins can be aliases or proxies for one backend and do not prove
independent operation or canonical consensus. The report never authorizes
cutover. A separate authenticated decision must bind the independent historical
review and operational source provenance. The tool cannot activate a
deployment, verify a sidechain burn, authorize funds, or establish trustless
status or suitability for deployment.
