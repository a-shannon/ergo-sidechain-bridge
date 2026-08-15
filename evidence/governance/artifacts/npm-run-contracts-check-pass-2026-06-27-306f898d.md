# Gate 6 npm run contracts:check Command Evidence - 2026-06-27 - 306f898d

This artifact records current-head contract compilation check output for the
Gate 6 committee governance prerequisite command.

It is command-output evidence only. It is not completed Gate 6 committee
governance evidence, key-rotation evidence, release authorization, deployment
approval, signing approval, or broadcast approval.

## Command Result

| Field | Value |
|---|---|
| Command | npm run contracts:check |
| Working directory | ergo-sidechain-bridge/relayer |
| Result | PASS |
| Exit code | 0 |
| Git commit | 306f898d |
| Node runtime | v24.14.0 |
| Ergo node endpoint | http://213.239.193.208:9052/ |
| Ergo node network | testnet |
| Observed node height | 417791 |
| Mode | check-only contract compilation |
| Contracts compiled | 8/8 |
| Files written | no |

## Contract Rows

| Contract | Result | Evidence |
|---|---|---|
| SideChainState.es | PASS | command output printed Address and ErgoTree prefix |
| DoubleUnlockPrevention.es | PASS | command output printed Address and ErgoTree prefix |
| DoubleUnlockPreventionAggregate.es | PASS | command output printed Address and ErgoTree prefix |
| DoubleUnlockPreventionAggregateBatch.es | PASS | command output printed Address and ErgoTree prefix |
| SPVTracker.es | PASS | command output printed Address and ErgoTree prefix |
| MainChainLock.es | PASS | command output printed Address and ErgoTree prefix |
| MainChainUnlock.es | PASS | command output printed Address and ErgoTree prefix |
| MainChainAggregateUnlockBatch.es | PASS | command output printed Address and ErgoTree prefix |

## Boundary

- This artifact records command output for Gate 6 contract compilation
  prerequisite validation.
- The command ran in `--check` mode and used deterministic placeholder committee
  and singleton identifiers for compilation only.
- The command did not load `.env`, read deployed state, read runtime databases,
  read mnemonics, read wallet material, or read private node state.
- The command did not write `compiled_contracts.json` or any deployment-state
  artifact.
- The command did not sign, submit, broadcast, deploy, rotate keys, reconcile,
  or mutate bridge state.
- The public testnet node was used only for read-only `/info`,
  `/script/p2sAddress`, and `/utils/addressToRaw` compilation API calls.
