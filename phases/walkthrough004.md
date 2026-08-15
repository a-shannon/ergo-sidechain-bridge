# Walkthrough 004 - Historical Frontier Peg-In Prototype

**Status:** Historical and superseded; not executable.

This walkthrough records the first local Substrate/Frontier peg-in prototype.
It predates the Gate 5 authority model and must not be used as a deployment,
mint, daemon, signing, submission, or broadcast recipe.

## Historical Scope

The prototype demonstrated:

- local Frontier EVM compatibility;
- Solidity artifact compilation for `SERG` and `ErgoBridge`;
- parsing an Ergo deposit recipient into an EVM address;
- receipt and event observation through the relayer;
- local SQLite idempotence for one observed deposit identity.

The former `deploy:sidechain` package command and
`relayer/src/scripts/deploy-sidechain.ts` have been removed. The relayer-side
owner-mint initiation path and the standalone write-capable Frontier spike are
also absent. The remaining Solidity owner entrypoint and any historical
deployment are audit liabilities, not supported funds authority.

## Why The Old Flow Is Invalid

The old sequence observed a refundable Ergo deposit and then called an
owner-authorized EVM mint. It did not prove canonical Ergo consensus, confirmed
source consumption into an exact non-refundable vault, or an on-chain V4 mint
reservation. A local status row and duplicate box-ID check provided process
idempotence only; neither could authorize funds.

The historical result therefore established local interoperability, not
deposit-to-mint exclusivity, trustless settlement, or production readiness.

## Retained Historical Facts

The original implementation work exposed several useful compatibility issues:

| Observation | Historical correction |
|---|---|
| R4 address bytes were passed as text | Decode the hex bytes before register encoding |
| Frontier RPC used the wrong local port | Align the configured endpoint with the node |
| The unspent-box API returned a wrapped collection | Read the response value explicitly |
| Process idempotence ignored terminal mint rows | Query the complete local lifecycle |
| A transitive Rust dependency required a newer toolchain | Pin a compatible Rust toolchain |
| Deep Windows build paths exceeded local limits | Use a machine-local Cargo target directory |

These notes are historical debugging context. They do not revive the retired
owner-mint path.

## Current Replacement Boundary

Current peg-in work stops after canonical deposit observation, confirmed source
consumption, exact committed-vault verification, and durable receipt binding.
Mint authority remains blocked until a separately versioned V4 proof and
reservation family is reviewed, activated, accepted by the target runtime, and
consumed atomically with replay protection.
