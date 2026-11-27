# Ergo ↔ Frontier Sidechain Bridge — V1 (`v1/`)

Clean, self-contained, stock-Ergo-compatible V1 implementation of the Ergo L1 ↔ Frontier/EVM sidechain bridge.

## Key Properties

- **Stock Ergo 6.0.3 Compatible**: Zero node patches, zero `0x0401` header extension requirement (`treeVersion = 0`, `scriptVersion = 3`). Works identically on stock devnet, public Ergo Testnet, and Mainnet.
- **5 Canonical ErgoScript Contracts (`contracts/`)**:
  - `BridgeDepositLock.es` (1,506 B) — refundable peg-in staging with permissionless timeout escape
  - `BridgeReserve.es` (2,587 B) — pooled ERG reserve with append-only deposit AVL, liability tracking, and permissionless `rentRefresh` (+ optional ERG top-up)
  - `BridgeDup.es` (3,770 B) — burn Merkle inclusion, confirmation depth, replay-prevention AVL, and `rentRefresh`; authenticates `BridgeTracker` via singleton `trackerNftId` + unified 370-byte AVL schema
  - `BridgeTracker.es` (2,526 B) — distributed `atLeast(t, n)` checkpoint admission, permissionless `rentRefresh`, timelocked committee rotation (`mode=1`), and timelocked irreversible EIP-0045 graduation (`mode=2`)
  - `BridgeTrackerStark.es` (1,668 B) — preactivation EIP-0045 (`verifyStark`, RISC Zero 3.1.0+) graduation target sharing the exact 370-byte tracker AVL schema (zero migration on `BridgeReserve` / `BridgeDup`)
- **Hardened V1 Solidity (`solidity/`)**: `SERG.sol`, `ErgoBridge.sol` (on-curve `secp256k1` validation via EIP-198 `0x05`, `MAX_PEGOUTS_PER_BLOCK = 256`, `renounceOwnership()` disabled, no public `burn()`), and `BridgeCommitteeTimelock.sol` (`t`-of-`n` multisig + timelocked admin + 7-day grace period + delegated `mintOperator` + zero-delay `emergencyPause`), reproducible `solc 0.8.35` build closure.
- **True Multi-Host Distributed Signing**: `src/crypto/ceremony-server.ts` + `src/crypto/ceremony-client.ts` (`cli.ts signer-node` + `BRIDGE_REMOTE_SIGNERS_JSON`) run isolated single-key committee hosts with HMAC-SHA256 + optional mTLS, independent Frontier RPC burn-root verification, cryptographic AVL insert verification, governance opt-in lockouts, and single-use Schnorr nonces.
- **Operator CLI & Web Console**: `status`, `reconstruct`, `ui`, `signer-node`, `deposit`, `refund`, `pegout`, `daemon`, `rent-refresh`, `propose-rotate`, `propose-graduate-stark`, `cancel-upgrade`, `execute-upgrade`.
- **100% Stateless Chain Reconstruction**: SQLite (`src/state/db.ts`) is purely a cache. After a crash or full DB deletion, `reconstructFromErgoNode()` replays all three singleton NFT chains directly from a stock Ergo node (`extraIndex = true`) and verifies exact 33-byte AVL digest equality against live on-chain `R5` registers.

## Layout

```text
v1/
  contracts/                   5 canonical ErgoScript V1 contracts
  solidity/                    Hardened SERG.sol, ErgoBridge.sol, BridgeCommitteeTimelock.sol (solc 0.8.35 closure) + Foundry fuzz/invariant suite
  ops/prometheus-alerts.yml    Prometheus alerting rules (solvency, storage rent, indexer lag, signer liveness/rejects)
  docs/v1-architecture.md      Full protocol spec, threat model, EIP-0045 & testnet runbooks
  docs/audit-package.md        External security audit handoff, formal invariants & SHA-256 manifest (`npm run audit:verify`)
  docs/operator-runbook.md     Multi-operator mTLS, Epoch rotation, storage-rent & incident-response runbook
  docs/testnet-proof.md        Reproducible live public Ergo Testnet deployment proof
  jvm/BridgeJvmTool.java       SigmaState 6.0.2 JVM batch compiler & tx verifier
  jvm/pom.xml                  Maven descriptor to fetch exact sigma-state_2.12:6.0.2 JARs
  src/core/codecs.ts           Binary codecs (229B intent, 205B leaf, odd Merkle, 370B tracker, EIP-0045)
  src/core/avl.ts              WASM AVL+ proof wrapper (Reserve 32/32, Tracker 32/370, DUP 32/1) & Sigma encodings
  src/core/contracts.ts        Template renderer, JVM family compiler, rotation & STARK seam
  src/core/tx-builders.ts      Deterministic EIP-12 builders for all lifecycle & governance txs
  src/crypto/signer.ts         sigma-rust single-key & true distributed atLeast(t,n) multi-party signer
  src/crypto/ceremony-server.ts Isolated signer-node HTTP/mTLS server, policy verifier & loopback `--health-port`
  src/crypto/ceremony-client.ts Multi-host mTLS ceremony client with Round-1 short-circuit & Round-2 failover
  src/crypto/x509.ts           Pure Node.js ECDSA P-256 X.509 v3 CA/mTLS certificate generator
  src/ops/metrics.ts           Zero-dependency Prometheus v0.0.4 exposition renderer
  src/web/server.ts            Hardened local Web Console API, EIP-12 builder & `/metrics` exporter
  src/clients/ergo-node.ts     Stock Ergo 6.0.x REST API client
  src/clients/evm-client.ts    Frontier/EVM ethers v6 client with instant-seal receipt polling & Timelock routing
  src/state/db.ts              SQLite store + 100% stateless Ergo L1 AVL chain reconstruction
  src/relayer/daemon.ts        Continuous peg-in / peg-out / solvency / storage-rent relayer daemon
  src/cli.ts                   Operator & user CLI (status, reconstruct, ui, signer-node, deposit, refund, pegout, daemon, governance)
  tests/contracts.test.ts      SigmaState 6.0.2 JVM lifecycle, rotation, EIP-0045 seam & distributed multisig matrix
  tests/ergoscript-mutations.test.ts 24 surgical 1-field adversarial ErgoScript mutations in SigmaState 6.0.2 JVM
  tests/multihost-ceremony.test.ts HTTP + mutual-TLS (mTLS) ceremony, `--health-port`, `/metrics` & policy tests
  tests/web-and-cli.test.ts    Hardened Web Console CSP, Host/Origin, Prometheus `/metrics` & P2PK tests
  tests/codecs-and-state.test.ts Codecs, odd-width Merkle, EIP-0045 statement, Sigma & SQLite unit tests
  scripts/e2e-live.ts          Live 3-cycle E2E + DB-wipe recovery + live committee rotation on stock Ergo 6.0.3 + Frontier
  scripts/fuzz-evm-frontier.ts Deterministic 80-step stateful EVM fuzzer against live Frontier EVM
  scripts/generate-mtls-certs.ts One-command mTLS PKI bundle generator (`npm run gen:mtls`)
  scripts/verify-audit-manifest.ts Deterministic SHA-256 verifier for `docs/audit-package.md` (`npm run audit:verify`)
```

## Quickstart (Node 24.x + JDK 17+ + Rust wasm-pack)

```bash
# 1. Verify V1 Solidity build closure
cd v1/solidity && npm ci --ignore-scripts --include=dev && node compile.js check && cd ..

# 2. Build WASM AVL prover (from repo root)
(cd ../wasm-avl && cargo test --locked && wasm-pack build --target nodejs --out-dir pkg)

# 3. Fetch SigmaState 6.0.2 JVM runtime JARs (one-time)
mvn -B -f jvm/pom.xml dependency:copy-dependencies -DoutputDirectory="$PWD/jvm/target/dependency"

# 4. Install, typecheck, and run full V1 test suite (SigmaState 6.0.2 JVM matrix + codecs/DB)
npm ci
npm run build
npm test

# 5. Run live multi-cycle E2E against stock unpatched Ergo 6.0.3 + Frontier (~2 min)
ERGO_STOCK_JAR=/path/to/ergo-6.0.3.jar FRONTIER_BIN=/path/to/frontier-template-node npm run test:e2e

# 6. Operator CLI (dry-run by default; set BRIDGE_BROADCAST_ENABLED=true to broadcast)
npm run cli -- status --config ./config.testnet.example.json
```

## Explicit Security & Claim Boundaries

- **V1 Trust Model**: V1 is a **federated bridge** (`atLeast(t, n)` committee on `BridgeTracker`, owner-gated `mintSERG` on `ErgoBridge`) with **on-chain enforced** conservation, replay protection, refundable peg-in escape, storage-rent safety, and timelocked governance.
- **EIP-0045 Preactivation Boundary**: `contracts/BridgeTrackerStark.es` and `encodeEip0045StatementV1` prepare the irreversible graduation target for RISC Zero 3.1.0+ native STARK verification. Actual trustless STARK execution activates only after EIP-0045 (`verifyStark` opcode `0xB9`) activates on Ergo consensus.
- See [docs/v1-architecture.md](docs/v1-architecture.md) for the complete specification, threat model, EIP-0045 graduation procedure, and Public Ergo Testnet runbook.
