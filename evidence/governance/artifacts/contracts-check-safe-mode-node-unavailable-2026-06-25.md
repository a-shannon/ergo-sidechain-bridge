# Contracts Check Safe-Mode Probe - 2026-06-25

This report records the current `contracts:check` prerequisite status after the
check-only compile path was constrained to public deterministic placeholders.

It is not completed Gate 6 committee governance evidence. It does not support
governance-ready, testnet production-candidate, mainnet, or completed
key-rotation claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run contracts:check` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Mode | check-only contract compilation |
| Result | BLOCKED |
| Exit code | 1 |
| Reached contract compilation | no |
| Blocking prerequisite | local Ergo node unavailable at `localhost:9052` |
| Files written | no |
| Broadcast attempted | no |

## Captured Output

```text
> ergo-sidechain-relayer@0.1.0 contracts:check
> tsx src/scripts/compile-contracts.ts --check

Cannot connect to Ergo node at localhost:9052
Run start_node.bat first.
```

## Boundary

The command now reaches the node availability check without relying on private
operator material. A completed Gate 6 command row still requires rerunning
`npm run contracts:check` against an available local Ergo node and capturing
successful contract compilation output.
