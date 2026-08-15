# Gate 5 0x04 Extension Public Boundary Report

This report records the offline 0x0401 extension-shape simulation only.
This is prerequisite evidence only. It does not prove mined-block anchoring,
resolve the node patch requirement, close Gate 5, authorize settlement,
authorize broadcast, or support production-ready, mainnet, or testnet
production-candidate claims.

## Command Result

| Field | Value |
|---|---|
| Command | npm run trustless:extension-boundary -- --public-boundary --out <report.md> |
| Result | BOUNDARY_ONLY |
| Exit code | 0 |
| Local Ergo source checkout read | no |

## Simulation Checks

| Check | Result | Detail |
|---|---|---|
| Synthetic 0x0401 field satisfies consensus shape constraints | PASS | key=0401 valueBytes=32 |
| 0x0401 participates in Scorex-compatible extension Merkle root | PASS | root=d4c6879f319b4cb86c4e065ea573b5dc21d5c847d6de7ed076cdea882b210809 proofBytes=66 |
| Serialized extension section remains below block extension limit | PASS | serializedBytes=108 fields=3 |

## Boundary

| Boundary | Value |
|---|---|
| 0x0401 synthetic extension shape checked | yes |
| Local Ergo source checkout read | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Node or miner API request performed | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| Node patch requirement resolved | no |
| SPV relay or tracker evidence completed | no |
| On-chain proof acceptance evidence completed | no |
| Gate 5 closure allowed | no |
| Production-ready claim allowed | no |
| Mainnet deployment claim allowed | no |
| Testnet production-candidate claim allowed | no |
