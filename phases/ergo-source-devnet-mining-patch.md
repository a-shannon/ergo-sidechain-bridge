# Ergo Source — Devnet Mining Reward Routing Patch

> **DEVNET ONLY.** These patches are strictly for the local patched devnet node (port 9051).
> They must NEVER be applied to stock testnet or mainnet builds.
> They are not committed to the bridge repository.

## Purpose

Route mining rewards directly to the Fleet signer address (configured via
`ergo.node.miningPubKeyHex`) when using the internal miner with `testMnemonic`.
Stock Ergo nodes ignore `miningPubKeyHex` for internal mining — these patches
override that behavior.

## Why This Patch Exists

The Ergo node's internal miner derives the mining public key from the wallet's
`testMnemonic`. The emission TX reward address is built from this key. When
`miningPubKeyHex` is configured, it is only used for external miners (GPU pools).

For automated devnet deployments, we need mining rewards at the Fleet signer's
P2PK address so deployment scripts can build and sign transactions without
node-wallet transfers.

## The Autolykos v1/v2 Trap

**Autolykos v1** (block version 1, stock genesis):
- The miner's public key `pk` is integral to the PoW equation
- `checkPoWForVersion1` calls `genElement(version, m, pk, w, ...)`
- Substituting a different pk → PoW validation failure → node crash
- **Cannot redirect rewards in v1**

**Autolykos v2** (block version ≥ 2):
- `checkPoWForVersion2` only checks `hit < b` using `msg + nonce`
- `pk` is stored in the header but NOT used in PoW validation
- Substituting pk is safe — only affects reward address
- **Can redirect rewards in v2**

Stock devnet starts with block version 1 for heights 1–127, then switches to v2.
Forcing v2 from genesis avoids the v1 trap entirely.

## Files Changed (4)

### 1. `ergo-core/src/main/scala/org/ergoplatform/settings/Parameters.scala`

**Change:** `BlockVersion -> 1` → `BlockVersion -> 2`

Forces default block version to 2 in `DefaultParameters`. This is a broad change
that affects ALL networks built from this source. Acceptable only for an isolated
devnet binary.

### 2. `src/main/scala/org/ergoplatform/mining/ErgoMiner.scala`

**Change:** When `miningPubKey` is configured (from `miningPubKeyHex`), use it as
the reward public key instead of the wallet-derived `proverInput.publicImage`.

The wallet's secret key is still used for PoW computation — only the reward
address is overridden.

### 3. `src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala` (2 hunks)

**Hunk A (line ~197):** Always inject `minerPk` into the PoW solution, replacing
the conditional `CryptoFacade.isInfinityPoint` check. In v2, pk is not part of
PoW validation, so this is safe. The pk stored in the block header must match
the emission TX reward address to pass consensus validation.

**Hunk B (line ~632):** Use version `2: Byte` instead of `Header.InitialVersion`
for the genesis block candidate. This ensures the very first block uses Autolykos
v2 PoW rules.

### 4. `src/main/resources/node1/application.conf`

**No persistent changes.** The `miningPubKeyHex` is injected at runtime via the
`run-patched-ergo-devnet.ps1` script's merged config overlay. The base config
file remains clean.

## Exact Diff

```diff
--- a/ergo-core/src/main/scala/org/ergoplatform/settings/Parameters.scala
+++ b/ergo-core/src/main/scala/org/ergoplatform/settings/Parameters.scala
@@ -326,7 +326,9 @@ object Parameters {
     OutputCostIncrease -> OutputCostDefault,
     MaxBlockSizeIncrease -> MaxBlockSizeDefault,
     MaxBlockCostIncrease -> MaxBlockCostDefault,
-    BlockVersion -> 1
+    // DEVNET PATCH: Start at block version 2 to enable Autolykos v2 from genesis.
+    // This allows miningPubKeyHex to route rewards without breaking PoW.
+    BlockVersion -> 2
   )

--- a/src/main/scala/org/ergoplatform/mining/ErgoMiner.scala
+++ b/src/main/scala/org/ergoplatform/mining/ErgoMiner.scala
@@ -90,10 +90,15 @@ class ErgoMiner(
     case FirstSecretResponse(Success(proverInput: DLogProverInput)) =>
-      log.info("Setting secret and public key")
+      val rewardPk = ergoSettings.miningPubKey.getOrElse(proverInput.publicImage)
+      log.info(s"Setting secret key and public key (miningPubKeyHex override: ${ergoSettings.miningPubKey.isDefined})")
       onStart(
         secretKeyOpt = Some(proverInput),
-        publicKey    = proverInput.publicImage
+        publicKey    = rewardPk
       )

--- a/src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala
+++ b/src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala
@@ -198,13 +197,14 @@
     case preSolution: AutolykosSolution =>
-      val solution =
-        if (CryptoFacade.isInfinityPoint(preSolution.pk)) {
-          AutolykosSolution(minerPk.value, preSolution.w, preSolution.n, preSolution.d)
-        } else {
-          preSolution
-        }
+      val solution =
+        AutolykosSolution(minerPk.value, preSolution.w, preSolution.n, preSolution.d)

@@ -632,7 +632,9 @@
         .getOrElse(
-          (interlinksExtension, Array(0: Byte, 0: Byte, 0: Byte), Header.InitialVersion)
+          (interlinksExtension, Array(0: Byte, 0: Byte, 0: Byte), 2: Byte)
         )
```

## How to Revert

```bash
cd ../ergo-source
git checkout -- \
  ergo-core/src/main/scala/org/ergoplatform/settings/Parameters.scala \
  src/main/scala/org/ergoplatform/mining/ErgoMiner.scala \
  src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala
```

Then rebuild: `sbt assembly`

## Security Considerations

- The wallet's private key (`testMnemonic`) is still used for PoW nonce search
- Only the reward destination (public key in block header + emission TX) changes
- The patched binary must never connect to external peers
- `scorex.network.knownPeers = []` ensures isolation

## Fee Proposition Mismatch (minimalFeeAmount = 0)

> **DEVNET ONLY.** This config is injected by `run-patched-ergo-devnet.ps1`.
> It does NOT apply to stock testnet or mainnet nodes.

### Problem

The Ergo node's mempool validates fees by matching TX outputs against
`settings.chainSettings.monetary.feeProposition`. This proposition is computed
as `ErgoTreePredef.feeProposition(minerRewardDelay)`.

On our devnet, `minerRewardDelay = 1` (from `node1/application.conf`), producing
a fee proposition ErgoTree different from the standard `minerRewardDelay = 720`.

Fleet SDK's `FEE_CONTRACT` (and `@fleet-sdk/core`'s `RECOMMENDED_MIN_FEE_VALUE`)
use the standard 720-block delay. When the consolidation TX includes a fee output
with this standard tree, the devnet node rejects it:

```
Min fee not met: 0.001 ergs required, 0.0 ergs given
```

The node sees 0 fee because the output's ErgoTree does not match its local
feeProposition (delay=1 vs delay=720).

### Solution

Set `ergo.node.minimalFeeAmount = 0` in the devnet config overlay. This disables
the minimum fee check entirely. The consolidation TX uses implicit fee (the
difference between inputs and outputs goes to the miner).

This is safe because:
1. The devnet is an isolated local chain with no external peers
2. There is no economic attack surface on a private devnet
3. The miner still collects the implicit fee

### Why not compute the correct fee tree?

`ErgoTreePredef.feeProposition(1)` is a Scala function in the sigma-state library.
It is not exposed in Fleet SDK or ergo-lib-wasm. Computing the equivalent tree
in TypeScript would require reimplementing the tree construction, which is
fragile and unmaintainable for a devnet-only utility.
