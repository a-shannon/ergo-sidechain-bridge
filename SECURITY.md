# Security Policy — Ergo ↔ Frontier Sidechain Bridge

## Current Status & Mainnet Readiness

- **V1 / V1.1 / V1.2** is open-source, verified on SigmaState 6.0.2 JVM, live stock Ergo 6.0.3, live Frontier EVM, and public Ergo Testnet.
- **V1 operates under an explicitly federated `t`-of-`n` committee quorum trust model** on stock Ergo 6.0.3 (`BridgeTracker.es`) and `BridgeCommitteeTimelock.sol` on Frontier EVM. `BridgeTrackerStark.es` is a preactivation graduation seam targeting **EIP-0045** RISC Zero STARK verification once active on Ergo L1.
- **Mainnet deployment requires**:
  1. An independent external third-party security audit (see [`v1/docs/audit-package.md`](v1/docs/audit-package.md)).
  2. Multi-host operator isolation with mutual TLS (mTLS) and hardware/HSM key custody for every committee `signer-node`.
  3. On-chain ownership of `ErgoBridge.sol` transferred to `BridgeCommitteeTimelock.sol` (or Safe + Timelock) with non-zero admin delay.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security-sensitive vulnerabilities.**

Please report potential vulnerabilities privately via **GitHub Private Vulnerability Reporting** ("Security" → "Report a vulnerability" on `a-shannon/ergo-sidechain-bridge`).

Include:
- Exact affected file(s), contract branch, or RPC/HTTP endpoint.
- Concrete reproduction steps, failing transaction bytes, or proof-of-concept test.
- Expected security invariant violated (see `INV-L1-*`, `INV-EVM-*`, `INV-OPS-*` in [`v1/docs/audit-package.md`](v1/docs/audit-package.md)).

## In-Scope Components

- **ErgoScript L1 Contracts**: `v1/contracts/*.es` (`BridgeDepositLock.es`, `BridgeReserve.es`, `BridgeDup.es`, `BridgeTracker.es`, `BridgeTrackerStark.es`).
- **Solidity EVM Contracts**: `v1/solidity/*.sol` (`SERG.sol`, `ErgoBridge.sol`, `BridgeCommitteeTimelock.sol`).
- **Distributed Ceremony & Cryptography**: `v1/src/crypto/` (`signer.ts`, `ceremony-server.ts`, `ceremony-client.ts`, `x509.ts`).
- **Relayer, Codecs, AVL Prover & State Reconstruction**: `v1/src/core/`, `v1/src/state/`, `v1/src/relayer/`, `wasm-avl/`.
- **Web Console & CLI**: `v1/src/web/server.ts`, `v1/web/`, `v1/src/cli.ts`.

## Explicitly Out of Scope (Known Trust Assumptions in V1)

- A dishonest supermajority (`>= t` colluding committee members) admitting a fabricated sidechain checkpoint in federated V1 mode (addressed architecturally by EIP-0045 graduation to `BridgeTrackerStark.es`).
- Compromise of the `mintOperator` hot key on Frontier EVM prior to emergency pause (mitigated by `BridgeCommitteeTimelock.emergencyPause` zero-delay brake and `setMintOperator` rotation).
- Running `signer-node` with `--allow-unverified-admit-unsafe` or `BRIDGE_ALLOW_INSECURE_HTTP=true` in production (explicitly documented dev/test-only escape hatches).
