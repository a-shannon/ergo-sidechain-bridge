# Completed Backup Restore Evidence

## Drill Classification

| Field | Value |
|---|---|
| Drill name | Gate 3 local offline backup restore drill |
| Git commit | 99e98fff |
| Release level | institutional reference |
| Environment | local offline |
| Broadcast mode | disabled |
| Source state | synthetic local SQLite state snapshot with DUP AVL and SPV tracker histories |
| Restore target | isolated restore database |
| Reviewer | A. Shannon |
| Date | 2026-05-31 |

## Required Commands

| Step | Required evidence | Status |
|---|---|---|
| Stop daemon and disable broadcast | artifact://recovery/artifacts/stop-daemon-disable-broadcast.md daemon state checked for local offline drill; broadcast disabled by Drill Classification and no submit path invoked | linked |
| Pre-backup status snapshot | artifact://recovery/artifacts/pre-backup-status-snapshot.md pre-backup status snapshot captured with npm run backup:snapshot output | linked |
| Backup SQLite database and WAL set | artifact://recovery/artifacts/sqlite-wal-backup.md SQLite backup copy created; WAL handling reviewed; no WAL or SHM file was present so matched-set restore was not required | linked |
| Restore into isolated or reviewed target | artifact://recovery/artifacts/isolated-restore-target.md restore executed into isolated restore target database | linked |
| Post-restore status snapshot | artifact://recovery/artifacts/post-restore-status-snapshot.md post-restore status snapshot captured with npm run backup:snapshot output | linked |
| Rebuild DUP AVL digest | artifact://recovery/artifacts/rebuild-dup-avl-digest.md DUP AVL rebuild digest from restored committed rows matched the pre-backup digest | linked |
| Rebuild SPV tracker digest | artifact://recovery/artifacts/rebuild-spv-tracker-digest.md SPV tracker rebuild digest from restored committed rows matched the pre-backup digest | linked |
| Compare pre-backup and restored state | artifact://recovery/artifacts/backup-compare-2026-05-31-99e98fff.json npm run backup:compare local snapshot comparison output; pre-backup snapshot artifact://recovery/artifacts/pre-backup-snapshot-2026-05-31-99e98fff.json; restored snapshot artifact://recovery/artifacts/restored-snapshot-2026-05-31-99e98fff.json; distinct pre-backup and restored JSON snapshot artifacts; restored snapshot generatedAt after pre-backup generatedAt; schemaVersion and snapshotSchemaVersions validated | linked |
| Git hygiene scan | artifact://recovery/artifacts/git-hygiene-scan.md git status --short output checked; git diff --check output checked; no staged runtime artifacts | linked |

## State Consistency Checks

| Check | Pre-backup value | Restored value | Evidence | Status |
|---|---|---|---|---|
| Peg-out status counts | detected=1,confirmed=0,phase1_created=0,aggregate_submitted=0,batch_submitted=1,phase2_unlocked=0,burn_reverted=0,failed=0 | detected=1,confirmed=0,phase1_created=0,aggregate_submitted=0,batch_submitted=1,phase2_unlocked=0,burn_reverted=0,failed=0 | artifact://recovery/artifacts/state-peg-out-status-counts.md npm run backup:compare local snapshot comparison output; peg-out status counts measured value detected=1,confirmed=0,phase1_created=0,aggregate_submitted=0,batch_submitted=1,phase2_unlocked=0,burn_reverted=0,failed=0 | linked |
| Pending reconciliation rows | 2 | 2 | artifact://recovery/artifacts/state-pending-reconciliation-rows.md npm run backup:compare local snapshot comparison output; pending reconciliation rows measured value 2 | linked |
| DUP AVL history count | 2 | 2 | artifact://recovery/artifacts/state-dup-avl-history-count.md npm run backup:compare local snapshot comparison output; DUP AVL history count measured value 2 | linked |
| DUP rebuilt digest | e1a78985f47c5df2423d4fc857978a4a51212759a3bd331a4dc76d5c4ea1051402 | e1a78985f47c5df2423d4fc857978a4a51212759a3bd331a4dc76d5c4ea1051402 | artifact://recovery/artifacts/state-dup-rebuilt-digest.md npm run backup:compare local snapshot comparison output; DUP rebuilt digest measured value e1a78985f47c5df2423d4fc857978a4a51212759a3bd331a4dc76d5c4ea1051402 | linked |
| SPV tracker history count | 1 | 1 | artifact://recovery/artifacts/state-spv-tracker-history-count.md npm run backup:compare local snapshot comparison output; SPV tracker history count measured value 1 | linked |
| SPV rebuilt digest | 594cdfde0b6e35b8a1cdcbfd22a4b83f0de480a2b55367780d5827133d438a7701 | 594cdfde0b6e35b8a1cdcbfd22a4b83f0de480a2b55367780d5827133d438a7701 | artifact://recovery/artifacts/state-spv-rebuilt-digest.md npm run backup:compare local snapshot comparison output; SPV rebuilt digest measured value 594cdfde0b6e35b8a1cdcbfd22a4b83f0de480a2b55367780d5827133d438a7701 | linked |
| Persisted anchor heights | 54321 | 54321 | artifact://recovery/artifacts/state-persisted-anchor-heights.md npm run backup:compare local snapshot comparison output; persisted anchor heights measured value 54321 | linked |
| Pending DUP heartbeats | 1 | 1 | artifact://recovery/artifacts/state-pending-dup-heartbeats.md npm run backup:compare local snapshot comparison output; pending DUP heartbeats measured value 1 | linked |
| DUP singleton digest comparison or incident classification | DUP singleton digest incident classification local-offline-no-chain-singleton-read | DUP singleton digest incident classification local-offline-no-chain-singleton-read | artifact://recovery/artifacts/state-dup-singleton-incident-classification.md DUP singleton digest incident classification measured value DUP singleton digest incident classification local-offline-no-chain-singleton-read | linked |
| SPV tracker singleton digest comparison or incident classification | SPV tracker singleton digest incident classification local-offline-no-chain-singleton-read | SPV tracker singleton digest incident classification local-offline-no-chain-singleton-read | artifact://recovery/artifacts/state-spv-singleton-incident-classification.md SPV tracker singleton digest incident classification measured value SPV tracker singleton digest incident classification local-offline-no-chain-singleton-read | linked |
| Runtime artifact hygiene | snapshot read-only; confirm git status clean or backups ignored | snapshot read-only; confirm git status clean or backups ignored | artifact://recovery/artifacts/state-runtime-artifact-hygiene.md npm run backup:compare local snapshot comparison output; runtime artifact hygiene measured value snapshot read-only; confirm git status clean or backups ignored | linked |

## Reconstructibility Boundaries

| Boundary | Required evidence | Status |
|---|---|---|
| SQLite backup is local operator state, not consensus | artifact://recovery/artifacts/boundary-sqlite-local-state.md SQLite backup classified as local-operator-state and not-consensus evidence | linked |
| WAL and SHM are restored as matched set when present | artifact://recovery/artifacts/boundary-wal-shm-matched-set.md WAL handling, SHM handling, and matched-set handling when present reviewed for restore | linked |
| AVL histories are reconstructed from committed rows | artifact://recovery/artifacts/boundary-avl-committed-rows.md AVL histories reconstructed and rebuilt from committed-rows evidence | linked |
| Digest mismatch triggers incident response | artifact://recovery/artifacts/boundary-digest-mismatch-incident-response.md digest mismatch classification triggers incident response evidence | linked |
| Evidence excludes secrets and runtime databases | artifact://recovery/artifacts/boundary-evidence-excludes-sensitive-runtime.md evidence hygiene excludes secret material and runtime databases including SQLite, WAL, and SHM files | linked |

## Stop Conditions

| Stop condition | Required resolution | Status |
|---|---|---|
| Daemon was running during backup without WAL files | artifact://recovery/artifacts/stop-daemon-without-wal.md daemon state and WAL handling checked; stop and block restore if daemon is running during backup without WAL files | linked |
| Restored DUP or SPV digest mismatches chain singleton | artifact://recovery/artifacts/stop-digest-mismatch-chain-singleton.md DUP or SPV digest mismatch against chain singleton triggers incident runbook and blocks restart | linked |
| Pending settlement may already have paid recipient | artifact://recovery/artifacts/stop-pending-settlement-paid-recipient.md pending settlement paid-recipient risk checked; pause and block restore until recipient payment state is classified | linked |
| Runtime backup files appear in git status | artifact://recovery/artifacts/stop-runtime-backups-in-git-status.md runtime backup files in git status checked; stop and block staging if runtime backup artifacts appear | linked |
| Manual SQLite edit is proposed before chain-state classification | artifact://recovery/artifacts/stop-manual-sqlite-edit-before-chain-classification.md manual SQLite edit proposal requires chain-state classification first; do not edit before classification | linked |

## Publication Evidence

- Release notes updated: yes
- Required release-note updates: artifact://recovery/artifacts/completed-gate-3-backup-restore-release-note-evidence.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no
- Pending Evidence Register updated: yes
- Required checklist updates: artifact://recovery/artifacts/completed-gate-3-backup-restore-checklist-update-evidence.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no
- Production-ready claim allowed by this drill: no
- Testnet production-candidate claim allowed by this drill: no

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Restore operator | A. Shannon | approve | 2026-05-31 | approved Gate 3 local offline backup restore outcome; SQLite/WAL/SHM isolated restore and AVL/DUP/SPV state consistency matched |
| Security reviewer | A. Shannon | approve | 2026-05-31 | approved backup-restore boundary outcome; evidence hygiene excluded secret material and runtime database files from committed artifacts |
| Operator reviewer | A. Shannon | approve | 2026-05-31 | approved operator restore outcome; stop conditions classify daemon, digest, settlement, runtime artifact, and manual SQLite edit risks |
