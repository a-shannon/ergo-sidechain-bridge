# Live Public Ergo Testnet Deployment & Verification Proof

On **2026-11-27**, Bridge V1 was deployed live on **public Ergo Testnet** (indexed node `http://176.9.15.237:9052`, blocks `669454`–`669470`, tip-verified against `128.253.41.110:9052`) paired with a live Frontier EVM sidechain node, executing a full peg-in → `sERG` mint → `sERG` burn → distributed 2-of-3 committee admission → Ergo L1 payout → cold SQLite wipe & full L1 AVL reconstruction cycle.

---

## Verify Live On-Chain State Yourself (Read-Only, Zero Keys Needed)

From [`v1/`](../):

```bash
# 1. Inspect live Reserve, Dup, and Tracker singletons directly on public Ergo Testnet:
npm run status:testnet

# 2. Reconstruct all 3 AVL+ trees from scratch strictly from public Ergo Testnet box history:
npm run reconstruct:testnet

# 3. Launch the local Bridge Web Console wired to this live public Ergo Testnet deployment:
npm run ui:testnet
# -> open http://127.0.0.1:3000
```

Expected reconstruction output:
- `reserveEntries: 1`, `reserveDigestMatched: true` (`cbd3bb6dafeee2c0a7f565bf41ebca384e58b5cd26938c0e5057dacb92f589b601`)
- `trackerEntries: 1`, `trackerDigestMatched: true` (`31d1fabfdaf17df1d1505fff62d7b5469967db7ae7fe85a2dde02e47ffe1d13801`)
- `dupEntries: 1`, `dupDigestMatched: true` (`16d6b17d219448af5620dc66b3c51817a56295c2a4a9b7e5129cc2451beef78d01`)
- `activeTrackerEpoch: "1"`

---

## Live Deployment Identifiers

| Artifact | Value |
| :--- | :--- |
| **Family ID** | `8e839ab9614f2c6611d5d430b08f63b522c847ba6ab550e50f6f0bd6675803ca` |
| **Tracker Singleton NFT** | `bb18ce9facaea02c54639458cac6978a829bd585c8bd4fe357dbed09d94cc029` |
| **Dup Nullifier Singleton NFT** | `81db0a5a38849034bfb9e67db5e8590ecffedc0ecc3bf3129859d954e0439196` |
| **Reserve Singleton NFT** | `527229f2a82a4fe0b3c72d693290a86140b2b0ac660fed4e3272d4881aff35a1` |
| **Committee Policy** | 2-of-3 Schnorr `atLeast(2, [pk1, pk2, pk3])`, Epoch 1 |
| **Parameters** | `minDeposit = 0.01 ERG`, `minConfirmations = 6`, `maxAdmissionLag = 5`, `upgradeTimelock = 10`, `escapeTimeout = 500` |
| **Payout Recipient (Ergo Testnet)** | `3WwVtRgoer3sYsFk5LccH5JBpruQckjJMHrvkjSTDs1PYNN1kTFy` |

---

## Confirmed Public Ergo Testnet Transaction Trail

| Step | Ergo Testnet Height | Transaction ID | Verified Result |
| :--- | ---: | :--- | :--- |
| Mint `BridgeV1TrackerNFT` | `669454` | `e1fc6ec0434229ac33d668ccf016234c620011df469ac7fe691227fbe3725449` | Confirmed |
| Mint `BridgeV1DupNFT` | `669454` | `1b610408b9fde27d8500691d4ac9bb93ab41ceafff1c3c1b97fd96ffc5b94b38` | Confirmed |
| Mint `BridgeV1ReserveNFT` | `669454` | `f1a78aba0e68d4a5dd2d80f82ae132e7f224c15fc7194119739390b354ad8c31` | Confirmed |
| Atomic Genesis Deploy (`Tracker` + `Dup` + `Reserve`) | `669455` | `fa4573c7ceb3fbdf24b722bb843d3987640113f6e3046889c9f41fc7f422025e` | Confirmed (`20M` buffer, `10M` Dup, `10M` Tracker) |
| User Peg-In `BridgeDepositLock` (`0.03 ERG`) | `669455` | `976786f913f8cfcc36170c4d703460917e863a0386be142043f00c1681c30e3d` | Confirmed |
| Relayer `commitDeposit` into `BridgeReserve` | `669457` | `2c4abb20db75fbea38c14622e8e8f9a6174c28625f879bea9def2a38155292f9` | Confirmed (`liability = 30M`, AVL updated) |
| Frontier EVM `mintSERG` (`0.03 sERG`) | Frontier | `0xe6a5c63c4cd89ba558b00b06dec1f9ec06542f734b8601df5d77efec84a008c4` | Confirmed (`30,000,000` nanoERG minted) |
| Frontier EVM `pegOut` (`0.02 sERG` gross / `0.015` net) | Frontier blk `6` | `0x84e7f18e25aa41a0318668f783a2f5b043be333bf3b6ffa492defa5d689815c0` | Confirmed (`5M` bridge fee escrowed) |
| Distributed 2-of-3 Committee `admitCheckpoint` | `669461` | `4690ef8aeb26cc8e09ca80df470ec401f9aa4df63c55f931689fbec3c62f9ad7` | Confirmed (native Sigma `atLeast(2, 3)`) |
| Relayer `burnPayout` (`0.015 ERG` unlocked to user) | `669470` | `73cc037808b7afe6e3546d207af4f9c4f9418a7308d69b5c0a99491636fa2fbf` | Confirmed (`15,000,000` nanoERG received) |

---

## Final Solvency Balance Sheet

- **`BridgeReserve` ERG on Ergo Testnet**: `35,000,000` nanoERG (`15,000,000` active liability + `20,000,000` buffer)
- **`SERG.totalSupply()` on Frontier EVM**: `15,000,000` nanoERG (`10,000,000` user balance + `5,000,000` escrowed fees in `ErgoBridge`)
- **Payout received on Ergo Testnet**: `15,000,000` nanoERG confirmed on `3WwVtRgoer3sYsFk5LccH5JBpruQckjJMHrvkjSTDs1PYNN1kTFy`
- **`solvencyExactMatch`**: `true`
