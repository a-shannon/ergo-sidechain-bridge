# Backup Restore Evidence Template

Use this template for Gate 3 SQLite/AVL backup-restore or reconstructibility
evidence. It proves an operator can preserve and restore local bridge state
without losing the histories needed to rebuild DUP and SPV tracker proofs.

This is not production-readiness evidence by itself. It must be linked with the
full lifecycle rehearsal, release checklist, and operator runbooks.

Do not paste `.env` contents, seed phrases, signing secret material, API
secrets, local user paths, SQLite files, WAL files, diagnostic dumps, or private
deployment state.

## Drill Classification

Date must use `YYYY-MM-DD`.
Git commit must use a 7-40 character Git commit SHA.
Do not duplicate classification fields; each required field must have one
canonical row.

| Field | Value |
|---|---|
| Drill name | |
| Git commit | |
| Release level | validated PoC / institutional reference / production deployment candidate |
| Environment | local offline / local devnet / patched devnet / testnet / staging |
| Broadcast mode | disabled / dry-run |
| Source state | |
| Restore target | |
| Reviewer | |
| Date | |

`Release level = production deployment candidate` requires `Environment =
testnet`.

`Restore target` must state an isolated restore database or a reviewed restore
target. A direct live runtime database restore is not acceptable release
evidence unless completed reviewer approval evidence and rollback plan evidence
are linked in the `Restore target` value. Any `live`, `runtime`, `production`,
or `relayer database` target requires those links even when the target is also
described as isolated.

## Required Commands

Run from `ergo-sidechain-bridge/relayer` unless stated otherwise. Record the
artifact location for each command or action; do not paste raw secret-bearing
output into this file.

```powershell
npm run status
npm run demo:readiness
npm run backup:snapshot -- ./bridge-state.sqlite
npm run backup:compare -- ../evidence/recovery/pre-backup-snapshot.json ../evidence/recovery/restored-snapshot.json
npm run wasm:test
git diff --check
git status --short
```

Validate a completed copy before linking it as Gate 3 backup-restore evidence:

```powershell
cd relayer
npm run backup:validate -- ../evidence/recovery/<completed-backup-restore-evidence>.md
```

The blank template is expected to fail validation. Gate 3 backup-restore
evidence passes only when required command evidence, state consistency checks,
reconstructibility boundaries, stop-condition classifications, and reviewer
sign-off rows are complete and linked.
`release:gate -- --backup-restore-evidence <completed-backup-restore-evidence>.md`
consumes the structured validator output, not only the PASS summary. The gate
requires the completed Markdown to expose Drill Classification fields, every
Required Commands row, every State Consistency Checks row, every
Reconstructibility Boundaries row, every Stop Conditions row, Publication
Evidence, snapshot provenance, and all Reviewer Sign-Off rows.
For release-gate evaluation, the structured Drill Classification must include
the drill name, a 7-40 character Git commit matching the final clean-checkout
Git commit, `Release level = production deployment candidate`, `Environment =
testnet`, `Broadcast mode = disabled` or `dry-run`, source-state scope, an
isolated or reviewed restore target, reviewer identity, and an ISO Date. A
validation object that only exposes rows and a `PASS` status cannot close Gate
3 without those classified provenance fields.
It also re-checks row payload specificity: command rows must carry
command-specific completed evidence, state rows must cite measured
pre-backup/restored values, boundary rows must carry boundary-specific
reconstructibility evidence, stop-condition rows must carry condition-specific
resolution evidence, publication updates must include completed Gate 3 update
evidence targets, and reviewer notes must state concrete backup-restore
outcomes while preserving claim, restore-target, and runtime-artifact
boundaries. Generic `PASS`, `approved`, `reviewed`, or `completed-pass`
payloads do not close Gate 3.
Row-named non-concrete artifact targets such as `generic-*`, `placeholder-*`,
`todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`, `fake-*`, `stub-*`,
`testdata-*`, `sample-evidence-*`, and `example-evidence-*` are also
placeholders, not completed command, state, boundary, stop-condition,
publication-update, restore-target approval, or snapshot provenance evidence.
Rows that mix pass-like command or validation notes with `FAIL`, `BLOCKED`,
`ERROR`, non-zero `exit code`, non-zero `errors`, or non-zero
`structural issues` remain blocked even when they also cite concrete
backup-restore artifacts.
The release checklist must link the completed backup-restore Markdown as a
completed evidence artifact separately from the `npm run backup:validate`
command output. A completed document that appears only as the validator's
validated target is not treated as linked completed evidence.
The same boundary applies inside structured rows: `backup-restore validation
target`, `backup validate target`, `validated target`, and `validated input`
links identify validator provenance only. They cannot by themselves satisfy
command, state, boundary, stop-condition, publication-update, restore-target
approval, or snapshot provenance evidence, even when the surrounding text says
`PASS` or names the expected row.
Rows marked `linked` must include a completed command-output target, completed
state/boundary/stop-condition evidence target, a non-template evidence link, or
an `artifact://...` marker. Template links, targetless command-output notes,
and bare validator command names alone are resolution targets or narrative
status notes, not completed evidence.
For Required Commands, the evidence cell must name the command-specific signal:
daemon and broadcast handling, pre-backup and post-restore snapshots,
SQLite/WAL backup handling, isolated or reviewed restore target, DUP AVL rebuild
digest, SPV tracker rebuild digest, pre-backup versus restored comparison, and
git hygiene scan output.
The `Git hygiene scan` command row must cite completed `git status --short`
output, completed `git diff --check` output, and a no-staged-runtime-artifacts
result; a generic git hygiene artifact is not enough to close the row.
Use `npm run backup:snapshot -- <sqlite-path>` before backup and after isolated
restore to capture local-only status counts, DUP/SPV history counts, rebuilt AVL
digests, persisted anchors, pending DUP heartbeats, and runtime artifact hygiene.
Use `npm run backup:compare -- <pre-snapshot.json> <restored-snapshot.json>`
to produce the local snapshot comparison artifact for the state rows.
Store comparison snapshots under an evidence path such as
`../evidence/recovery/`; `backup:compare` rejects `.runtime-backups/` and
`.devnet-backups/` because those directories are local runtime backup surfaces,
not release evidence locations.
The `Compare pre-backup and restored state` command row must link completed
`npm run backup:compare` output, identify the local snapshot comparison, and
cite `schemaVersion` validation from the comparison artifact.
The pre-backup and restored snapshot targets must be distinct JSON artifacts,
and the restored snapshot `generatedAt` timestamp must be after the pre-backup
snapshot `generatedAt` timestamp. `backup:compare` blocks evidence that
compares the same snapshot target or cloned snapshot timestamp on both sides,
even when all local state rows match.
`backup:validate` also checks that the command row itself cites the distinct
pre-backup/restored JSON artifact names and the `generatedAt` ordering; a
generic comparison artifact is not enough to close the row.
The release gate consumes that parsed provenance as
`preBackupSnapshotTarget`, `restoredSnapshotTarget`, `comparisonOutputTarget`,
`restoredGeneratedAfterPreBackup`, `schemaVersionObserved`, and
`snapshotSchemaVersionsObserved`. Missing or reused snapshot targets, missing
comparison output, missing generatedAt ordering, or missing schema-version
provenance keeps the Gate 3 backup-restore row blocked even if the checklist
contains a textual `backup:validate PASS` note.
The release gate also treats command, state, boundary, stop-condition, and
publication-update rows as separate evidence obligations. A completed artifact
target used to close one linked row cannot be reused to close another linked
row or both Gate 3 publication-update fields.
`backup:compare` also validates that each snapshot has `backup:snapshot`
metadata (`schemaVersion`, `databaseLabel`, `evidenceRows`, and `notes`) and
measured snapshot value formats. Each required `evidenceRows` entry must be
present and must match the corresponding measured `stateConsistencyValues`
value; a hand-trimmed or mismatched row blocks the comparison. The comparison
output records its own `schemaVersion` and the `snapshotSchemaVersions`
observed on both inputs.
JSON files missing tool metadata or using narrative values such as `reviewed`
are blocked before local rows can be linked.
This snapshot does not compare rebuilt DUP or SPV tracker digests with current
on-chain singleton boxes; keep DUP singleton and SPV tracker singleton
comparison or incident classification as separate reviewed evidence rows.

| Step | Required evidence | Status |
|---|---|---|
| Stop daemon and disable broadcast | | pending / linked / blocker |
| Pre-backup status snapshot | | pending / linked / blocker |
| Backup SQLite database and WAL set | | pending / linked / blocker |
| Restore into isolated or reviewed target | | pending / linked / blocker |
| Post-restore status snapshot | | pending / linked / blocker |
| Rebuild DUP AVL digest | | pending / linked / blocker |
| Rebuild SPV tracker digest | | pending / linked / blocker |
| Compare pre-backup and restored state | | pending / linked / blocker |
| Git hygiene scan | | pending / linked / blocker |

## State Consistency Checks

Record pre-backup and restored observations. A row marked `linked` must have a
restored value that exactly matches the pre-backup value. If the restored state
differs from the pre-backup state, classify the row as `blocker` and move to
the incident runbook before restarting the daemon.
The `Evidence` cell must identify the specific measured signal for the row,
such as peg-out status counts, pending reconciliation rows, DUP/SPV history
counts, rebuilt digests, persisted anchor heights, pending DUP heartbeats,
DUP singleton comparison, SPV tracker singleton comparison, and runtime
artifact hygiene.
Generic artifact names or notes such as `reviewed` are not enough.
The `backup:snapshot` JSON can provide local pre-backup and post-restore values
for every local SQLite row in this section except the DUP and SPV tracker
singleton comparison rows.
The `backup:compare` JSON must show matching local snapshot values before these
rows can be linked as restored state consistency evidence.
Local SQLite State Consistency Checks rows must link completed
`npm run backup:compare` local snapshot comparison output in the `Evidence`
cell. Each linked State Consistency Checks evidence cell must also cite the
measured pre-backup/restored value copied into the row; a generic comparison
artifact without the measured value cannot close the row. The DUP singleton
digest comparison, SPV tracker singleton digest comparison, and runtime artifact
hygiene rows require separate evidence because they are not proved by the local
snapshot comparison.
Do not use the snapshot alone as proof that local digests match the current
on-chain singleton boxes.
Values must be measured, not narrative placeholders: status rows use
`status=count` pairs, count rows use numeric values, rebuilt digests use
33-byte AVL hex digests, anchor rows use numeric heights or `none`, and each
DUP and SPV tracker singleton row states a concrete 32-byte singleton ID or
33-byte digest match, or an incident classification. Runtime hygiene rows state
clean, ignored, none, or not-staged artifact status.

| Check | Pre-backup value | Restored value | Evidence | Status |
|---|---|---|---|---|
| Peg-out status counts | | | | pending / linked / blocker |
| Pending reconciliation rows | | | | pending / linked / blocker |
| DUP AVL history count | | | | pending / linked / blocker |
| DUP rebuilt digest | | | | pending / linked / blocker |
| SPV tracker history count | | | | pending / linked / blocker |
| SPV rebuilt digest | | | | pending / linked / blocker |
| Persisted anchor heights | | | | pending / linked / blocker |
| Pending DUP heartbeats | | | | pending / linked / blocker |
| DUP singleton digest comparison or incident classification | | | | pending / linked / blocker |
| SPV tracker singleton digest comparison or incident classification | | | | pending / linked / blocker |
| Runtime artifact hygiene | | | | pending / linked / blocker |

## Reconstructibility Boundaries

These statements keep the drill honest. Mark each row `linked` only when the
reviewer has checked the supporting evidence.
The `Required evidence` cell must name the boundary-specific fact being checked;
generic artifact names or notes such as `reviewed` are not enough.
Boundary evidence must preserve each concrete assertion in the boundary. For
example, WAL/SHM evidence must cite WAL handling, SHM handling, and matched-set
restore behavior when present; digest mismatch evidence must cite the digest
comparison, mismatch classification, and incident response path.

| Boundary | Required evidence | Status |
|---|---|---|
| SQLite backup is local operator state, not consensus | | pending / linked / blocker |
| WAL and SHM are restored as matched set when present | | pending / linked / blocker |
| AVL histories are reconstructed from committed rows | | pending / linked / blocker |
| Digest mismatch triggers incident response | | pending / linked / blocker |
| Evidence excludes secrets and runtime databases | | pending / linked / blocker |

## Stop Conditions

Each stop condition must be classified before this artifact can count as release
evidence. Rows marked `linked` in Stop Conditions must include completed output,
a non-template evidence link, or an `artifact://...` marker plus an actionable
resolution using stop, block, fail, disable, pause, incident, do not, refuse, or
runbook language.
Each linked resolution must cite the condition-specific fact it classifies:
daemon/WAL state, DUP or SPV digest mismatch against the chain singleton,
pending settlement paid-recipient risk, runtime backup files in `git status`, or
manual SQLite edit before chain-state classification. Generic runbook links are
not enough.

| Stop condition | Required resolution | Status |
|---|---|---|
| Daemon was running during backup without WAL files | | pending / linked / blocker |
| Restored DUP or SPV digest mismatches chain singleton | | pending / linked / blocker |
| Pending settlement may already have paid recipient | | pending / linked / blocker |
| Runtime backup files appear in git status | | pending / linked / blocker |
| Manual SQLite edit is proposed before chain-state classification | | pending / linked / blocker |

## Publication Evidence

Gate 3 backup-restore evidence must update publication control documents before
it can close a public-release blocker. This section is executable guard input;
do not replace it with prose.

`Release notes updated` and `Pending Evidence Register updated` must be `yes`.
`Production-ready claim allowed by this drill` must be `no`; a backup-restore
drill can prove operator recovery, but it cannot by itself authorize
production-ready language.
`Testnet production-candidate claim allowed by this drill` must be `no`; a
backup-restore drill cannot by itself authorize testnet production-candidate or
production-grade testnet language.
Required release-note and checklist updates must include completed evidence
targets, not template links, targetless command-output notes, or bare validator
command names. They must cite distinct completed publication evidence targets;
one combined backup-restore publication-update artifact cannot satisfy both
fields.

- Release notes updated: yes / no
- Required release-note updates: completed Gate 3 backup-restore release-note update evidence:
- Pending Evidence Register updated: yes / no
- Required checklist updates: completed Gate 3 backup-restore checklist update evidence:
- Production-ready claim allowed by this drill: no
- Testnet production-candidate claim allowed by this drill: no

## Reviewer Sign-Off

Every reviewer decision must be `approve` before this evidence can pass. A
`block` decision must stay documented until resolved.
The `Restore operator` sign-off name must match the `Reviewer` value in Drill
Classification; a different approver cannot close Gate 3 backup-restore
evidence after the restore operator is named.
Reviewer sign-off dates must use `YYYY-MM-DD`, and each sign-off `Date` must
not be before the Drill Classification `Date`. Gate 3 backup-restore evidence
cannot be closed with a reviewer approval that predates the drill.
Reviewer notes must state a concrete backup-restore outcome tied to backup,
restore, SQLite/WAL/SHM handling, AVL/DUP/SPV rebuilds, digest or state
consistency, reconstructibility boundaries, stop conditions, incident response,
runtime artifact hygiene, or Gate 3 review. Generic notes such as
`reviewed restore evidence` are not enough.
Reviewer notes are evidence rows too: they must not mix an approving,
actionable recovery outcome with failed validator/command markers, `ERROR`,
non-zero `exit code`, non-zero `errors`, or non-zero `structural issues`.
Reviewer notes must not approve production-ready or mainnet production wording,
testnet production-candidate wording by this drill, unreviewed live/runtime
restore targets, or staged runtime backup artifacts.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Restore operator | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
