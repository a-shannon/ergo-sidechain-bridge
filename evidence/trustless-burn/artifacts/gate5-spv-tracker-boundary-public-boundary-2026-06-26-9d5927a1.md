# Gate 5 SPV Tracker Public Boundary Report

This report records an offline SPV tracker key/value/proof-shape simulation only.
This is prerequisite evidence only. It does not prove live SPV relay operation,
mined-block anchoring, on-chain proof acceptance, Gate 5 closure, settlement
readiness, broadcast authorization, or production-ready, mainnet, or testnet
production-candidate claims.

## Command Result

| Field | Value |
|---|---|
| Command | npm run trustless:spv-tracker-boundary -- --public-boundary --out <report.md> |
| Result | BOUNDARY_ONLY |
| Exit code | 0 |

## Simulation Checks

| Check | Result | Detail |
|---|---|---|
| SPV tracker domain and fixed sizes are exposed | PASS | domain=E2S_SPV_V1 keyBytes=32 valueBytes=36 |
| Tracker key derives from sidechain identity fields | PASS | key=46bfd6977e3c170f...194910328789dbdb (32 bytes) |
| Tracker value decodes to bridgeEventRoot and Ergo anchor height | PASS | value=3333333333333333...33333333000f1206 (36 bytes) anchorHeight=987654 |
| Insert proof advances the empty SPV tracker AVL digest | PASS | emptyDigest=cc490482d71a5efa...fa6039db31fe0200 (33 bytes) newDigest=3d9aef8c1870ae08...247d26d040189b01 (33 bytes) insertProofBytes=102 |
| Get proof returns the inserted tracker value | PASS | digest=3d9aef8c1870ae08...247d26d040189b01 (33 bytes) getProofBytes=137 |
| History digest matches insert and get proof digests | PASS | historyDigest=3d9aef8c1870ae08...247d26d040189b01 (33 bytes) |
| AVL register can encode the successor digest | PASS | registerBytes=38 |
| Missing sidechain identity is rejected by proof lookup | PASS | wrong header hash does not return the sample tracker value |

## Boundary

| Boundary | Value |
|---|---|
| SPV tracker key/value/proof shape checked | yes |
| Local source checkout read | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Node, RPC, or explorer request performed | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| SPV relay or tracker evidence completed | no |
| On-chain proof acceptance evidence completed | no |
| Gate 5 closure allowed | no |
| Production-ready claim allowed | no |
| Mainnet deployment claim allowed | no |
| Testnet production-candidate claim allowed | no |
