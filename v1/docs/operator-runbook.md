# Ergo ↔ Frontier Sidechain Bridge — Multi-Operator Production Runbook

This runbook covers day-0 deployment, mutual-TLS (mTLS) committee isolation, observability, routine maintenance (storage rent & committee rotation), and emergency incident response for Bridge V1/V1.2.

---

## 1. Security Topology & Separation of Duties

Never co-locate committee signing keys on the coordinator/relayer host:

| Host / Container | Secrets Held | Exposed Network Ports |
|---|---|---|
| `signer-1..N` (1 host per independent operator) | **ONLY its own single** `BRIDGE_SIGNER_SECRET_HEX`, `BRIDGE_SIGNER_AUTH_SECRET`, and TLS server key + CA cert | Ceremony HTTPS (`7101`, mTLS required) + loopback-only health/metrics (`127.0.0.1:7201`) |
| `relayer` (coordinator) | `BRIDGE_FEE_PAYER_SECRET_HEX`, `BRIDGE_EVM_RELAYER_KEY` (`mintOperator`), coordinator mTLS client key + per-signer HMAC secrets (**ZERO committee keys**) | Outbound only to Ergo node, Frontier RPC, and `signer-1..N` |
| `web-ui` (stateless read-only telemetry + EIP-12/EIP-1193 builder) | **ZERO private keys** | HTTP (`127.0.0.1:3000` or reverse proxy with explicit `BRIDGE_UI_ALLOWED_HOSTS`) |

Each `signer-node` MUST connect to its **own independent Frontier EVM RPC node** (`BRIDGE_EVM_RPC_URL`) so a compromised coordinator cannot trick signers into admitting a fabricated burn Merkle root.

---

## 2. Provisioning Mutual TLS (mTLS) PKI

Generate a private ECDSA P-256 CA, per-signer server certificates, and the coordinator client certificate without requiring `openssl`:

```bash
cd v1
npm run gen:mtls -- --out /secure/mtls-certs --signers signer-1,signer-2,signer-3 --ips 127.0.0.1 --days 365
```

1. Copy `/secure/mtls-certs/signer-<i>/{server.crt,server.key,ca.crt}` ONLY to operator `i`'s isolated host (`chmod 600 server.key`).
2. Copy `/secure/mtls-certs/coordinator/{client.crt,client.key,ca.crt}` ONLY to the coordinator host (`chmod 600 client.key`).
3. Move `/secure/mtls-certs/ca.key` to offline cold storage immediately after issuance.

Start each isolated signer with mTLS + dedicated loopback health/metrics probe port:

```bash
BRIDGE_SIGNER_SECRET_HEX=<64-hex-single-key> \
BRIDGE_SIGNER_AUTH_SECRET=<32+-char-random-hmac-secret> \
BRIDGE_EVM_RPC_URL=https://my-independent-frontier-rpc.example \
BRIDGE_SIGNER_TLS_KEY=/etc/bridge/server.key \
BRIDGE_SIGNER_TLS_CERT=/etc/bridge/server.crt \
BRIDGE_SIGNER_TLS_CA=/etc/bridge/ca.crt \
BRIDGE_SIGNER_HEALTH_PORT=7201 \
npx tsx src/cli.ts signer-node --config config.json --host 0.0.0.0 --port 7101
```

Verify locally on the signer host:
```bash
curl -fsS http://127.0.0.1:7201/health
curl -fsS http://127.0.0.1:7201/metrics | grep bridge_signer_
```

---

## 3. Prometheus & Alerting Setup

1. Scrape `http://127.0.0.1:3000/metrics` (`web-ui`) for on-chain solvency, storage-rent age, indexer lag, EVM state, and pending governance upgrades.
2. Scrape `http://127.0.0.1:7201/metrics` on each `signer-node` via local Prometheus agent / exporter for liveness and `bridge_signer_requests_total{result=~"replay|policy_rejected|auth_rejected"}`.
3. Load [`v1/ops/prometheus-alerts.yml`](../ops/prometheus-alerts.yml) into Prometheus `rule_files:`.

---

## 4. Routine Maintenance

### 4.1 Storage Rent Refresh (Permissionless)
Ergo boxes become eligible for storage rent after `1,051,200` blocks (~4 years). Alert `BridgeStorageRentWarning` fires at `500,000` blocks and `BridgeStorageRentDanger` fires at `750,000` blocks.

```bash
BRIDGE_FEE_PAYER_SECRET_HEX=<fee-key> \
BRIDGE_BROADCAST_ENABLED=true \
npx tsx src/cli.ts rent-refresh --config config.json --target reserve
# Repeat for --target dup and --target tracker (optionally add --top-up <nanoErg>)
```

### 4.2 Cold SQLite Disaster Recovery (Zero State Loss)
If the relayer database is lost or corrupted, delete the stale SQLite file and reconstruct all 3 AVL+ trees (`BridgeReserve`, `BridgeTracker`, `BridgeDup`) directly from the Ergo L1 blockchain:

```bash
npx tsx src/cli.ts reconstruct --config config.json
```
Confirm output prints `"reserveDigestMatched": true`, `"trackerDigestMatched": true`, and `"dupDigestMatched": true` (exact live digest parity) before restarting `daemon`.

---

## 5. Committee Rotation Procedure (`Epoch N → Epoch N+1`)

Automated `signer-node` processes **intentionally disable** `proposeUpgrade` and `cancelUpgrade` by default. Perform governance rotations intentionally using a dedicated offline/operator ceremony:

1. **Pre-flight**: Collect the new committee compressed pubkeys (`pk1,pk2,...`) and threshold `t`, and verify `config.json` includes the new epoch entry under `"epochs": [...]`.
2. **Propose (2-of-3 / t-of-n)**:
   ```bash
   BRIDGE_FEE_PAYER_SECRET_HEX=<fee-key> \
   BRIDGE_COMMITTEE_SECRETS_HEX=<t-secrets-or-remote-gov-signers> \
   BRIDGE_BROADCAST_ENABLED=true \
   npx tsx src/cli.ts propose-rotate --config config.json --next-pubkeys pk1,pk2,pk3 --next-threshold 2
   ```
3. **Verify Timelock**: Run `npx tsx src/cli.ts status --config config.json` and confirm `tracker.governance.pendingMode == 1`, expected `pendingTargetScriptHash`, and `pendingActivatesAtHeight`.
4. **Wait for Timelock**: Allow `upgradeTimelockBlocks` to elapse while all operators inspect `pendingTargetScriptHash` independently.
5. **Execute (Permissionless once height >= `pendingActivatesAtHeight`)**:
   ```bash
   BRIDGE_FEE_PAYER_SECRET_HEX=<fee-key> \
   BRIDGE_BROADCAST_ENABLED=true \
   npx tsx src/cli.ts execute-upgrade --config config.json --target-ergotree <compiled-next-tracker-ergotree-hex>
   ```
6. **Restart Signers & Relayer**: Update `config.json` `epochs` on all hosts, restart new epoch `signer-node`s, and run `reconstruct` + `status` to verify `epoch == N+1`.

---

## 6. Emergency Incident Response

### Scenario A — `BridgeSolvencyViolation` (`sERG totalSupply > Reserve R6` or `Reserve ERG < R6`)
1. **Immediate EVM Halt (Zero Delay)**: Any committee member or `mintOperator` triggers `BridgeCommitteeTimelock.emergencyPause("solvency-alert")`.
2. **Stop Relayer**: Halt `relayer` daemon immediately (`SIGTERM`).
3. **Audit On-Chain State**: Run `npx tsx src/cli.ts reconstruct --config config.json` and compare `status` JSON against Frontier `ErgoBridge` `PegIn`/`PegOut` logs.
4. **Revoke Compromised `mintOperator` (if needed)**: Propose & confirm `timelock.setMintOperator(address(0))` via `t`-of-`n` committee quorum.
5. **Unpause ONLY after root cause is fixed and exact solvency parity is restored** via `t`-of-`n` timelocked `ErgoBridge.unpause()`.

### Scenario B — Unauthorized `BridgePendingUpgradeDetected` (`pendingMode > 0`)
1. Immediately notify all committee operators out-of-band.
2. Execute `t`-of-`n` cancellation **before** `HEIGHT >= pendingActivatesAtHeight`:
   ```bash
   BRIDGE_FEE_PAYER_SECRET_HEX=<fee-key> \
   BRIDGE_COMMITTEE_SECRETS_HEX=<t-committee-secrets> \
   BRIDGE_BROADCAST_ENABLED=true \
   npx tsx src/cli.ts cancel-upgrade --config config.json
   ```
3. Verify `status` shows `pendingMode: 0`, then rotate compromised keys immediately.
