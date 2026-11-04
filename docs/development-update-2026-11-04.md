# Ergo/Substrate bridge: development update, 4 November 2026

The bridge reference now selects the patched redirect dependency across its
Solidity and relayer toolchains. This removes the known local dependency-audit
blocker while preserving the exact compiled contracts and their source bindings.
It helps keep the reference reproducible for teams evaluating Ergo as a
settlement layer for a Substrate/EVM sidechain.

The Solidity contracts were rebuilt in an isolated checkout. Their ten ABI,
bytecode, metadata and storage-layout artifacts are byte-for-byte unchanged;
only the dependency hashes in the build manifest changed. Those measured
identities propagate through the current consensus and node-build locks.
Historical build receipts retain their original identities.

Validation now uses the locked Vitest 4.1.12. The affected source-lock tests and
a bounded synthetic process case pass, the WASM package was built afresh, and
TypeScript and import checks pass against that package. The isolated Solidity
and relayer npm audits both report zero vulnerabilities. The exact source and
artifact joins received independent review. Hosted CI on this update remains
pending.

The operational milestone ahead is still two complete deposit, mint, burn and
withdrawal cycles on the same fresh synthetic chain, carrying successor state
and replay history between cycles. Stopped-state recovery, operator/FED-7
evidence and external acceptance remain open. The earlier native invocation
stays closed; its failure cause is unestablished.

The reference remains explicitly federated. The STARK-based trustless upgrade
is a separate track, and production readiness has not been established.
