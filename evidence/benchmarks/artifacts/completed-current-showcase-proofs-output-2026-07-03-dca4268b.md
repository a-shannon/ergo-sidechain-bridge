# Completed Offline Proof Objects Output

This report records deterministic offline proof-object inspection command output evidence.
It performs no node calls, signing, broadcast, local database access, runtime-state reads, or deployment-state reads.

## Command Result

| Field | Value |
|---|---|
| Command | npm run showcase:proofs -- --out <report.md> |
| Result | PASS |
| Exit code | 0 |
| Node calls | none |
| Signing | none |
| Broadcast | none |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |

## Proof Object Output

| Object | Size | Purpose |
|---|---:|---|
| Tracker key | 32 B | Sidechain block ID |
| Tracker value | 36 B | Event root plus anchor |
| Tracker get proof | 137 B | Membership proof |
| DUP lookup proof | 67 B | Non-membership proof |
| DUP insert proof | 67 B | State transition proof |
| AVL digest | 33 B | Committed tree root |
| Claim core | 109 B | Packed claim struct |
| Event root | 32 B | Burn commitment hash |

## Boundary

- This is offline proof-object inspection evidence only.
- This is not live benchmark evidence.
- This does not authorize trustless burn completion, production throughput, mainnet capacity, live settlement, or full parallel L1 settlement claims.
