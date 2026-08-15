# Completed Operator Readiness Evidence

## Readiness Classification

| Field | Value |
|---|---|
| Readiness name | Gate 6 operator readiness |
| Git commit | 9e3921cb |
| Release level | production deployment candidate |
| Environment | testnet |
| Broadcast mode | dry-run |
| Operator type | external operator |
| Reviewer | A. Shannon |
| Date | 2026-06-04 |

## Runbook Coverage

| Runbook | Required check | Evidence | Status |
|---|---|---|---|
| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-dry-run-readiness-2026-06-04-9e3921cb.md dry-run readiness runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Deployment and migration | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-deployment-migration-2026-06-04-9e3921cb.md deployment and migration runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Broadcast enablement | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-broadcast-enablement-2026-06-04-9e3921cb.md broadcast enablement runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Daemon startup | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-daemon-startup-2026-06-04-9e3921cb.md daemon startup runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Settlement failure triage | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-settlement-failure-triage-2026-06-04-9e3921cb.md settlement failure triage runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Reorg recovery | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-reorg-recovery-2026-06-04-9e3921cb.md reorg recovery runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Pause and resume | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-pause-resume-2026-06-04-9e3921cb.md pause and resume runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Key rotation | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-key-rotation-2026-06-04-9e3921cb.md key rotation runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Storage-rent and liquidity maintenance | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-storage-rent-liquidity-2026-06-04-9e3921cb.md storage-rent and liquidity maintenance runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Incident response | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-incident-response-2026-06-04-9e3921cb.md incident response runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| Monitoring and alerting | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-monitoring-alerting-2026-06-04-9e3921cb.md monitoring and alerting runbook evidence; stop-condition checks captured; verification-command checks captured | linked |
| SQLite and AVL backup restore | operator followed stop conditions and verification commands | artifact://operators/artifacts/runbook-sqlite-avl-backup-restore-2026-06-04-9e3921cb.md SQLite and AVL backup restore runbook evidence; stop-condition checks captured; verification-command checks captured | linked |

## Required Commands

| Command | Purpose | Evidence | Status |
|---|---|---|---|
| npm run status | operator status snapshot for readiness and service health | artifact://operators/artifacts/command-npm-run-status-2026-06-04-9e3921cb.md npm run status command output PASS exit code 0 captured operator status snapshot | linked |
| npm run demo:readiness | dry-run readiness check for signing and broadcast policy | artifact://operators/artifacts/command-npm-run-demo-readiness-2026-06-04-9e3921cb.md npm run demo:readiness command output PASS exit code 0 captured dry-run readiness boundary | linked |
| npm run release:gate | release-gate structural issue check for evidence completeness | artifact://operators/artifacts/command-npm-run-release-gate-2026-06-04-9e3921cb.md npm run release:gate command output PASS exit code 0 captured zero structural issues for evidence completeness review | linked |
| npm run backup:validate | backup restore validation for SQLite and AVL recovery evidence | artifact://operators/artifacts/command-npm-run-backup-validate-2026-06-04-9e3921cb.md npm run backup:validate command output PASS exit code 0 captured backup restore validation boundary | linked |
| npm run governance:validate | committee governance and key-rotation evidence validation | artifact://operators/artifacts/command-npm-run-governance-validate-2026-06-04-9e3921cb.md npm run governance:validate command output PASS exit code 0 captured committee governance and key-rotation validation boundary | linked |
| npm run check | clean-checkout build typecheck and test verification | artifact://operators/artifacts/command-npm-run-check-2026-06-04-9e3921cb.md npm run check command output PASS exit code 0 captured clean-checkout build typecheck and test verification | linked |
| npm run wasm:test | WASM and Rust AVL proof test verification | artifact://operators/artifacts/command-npm-run-wasm-test-2026-06-04-9e3921cb.md npm run wasm:test command output PASS exit code 0 captured WASM and Rust AVL proof test verification | linked |
| git status --short | Git hygiene worktree status and staged runtime artifact check | artifact://operators/artifacts/command-git-status-short-2026-06-04-9e3921cb.md git status --short command output PASS exit code 0 captured Git hygiene worktree status and runtime artifact review | linked |

## Incident And Recovery Drills

| Drill | Expected outcome | Evidence | Status |
|---|---|---|---|
| Broadcast disabled by default | operator must stop unsafe path and confirm broadcast remains disabled | artifact://operators/artifacts/drill-broadcast-disabled-default-2026-06-04-9e3921cb.md broadcast disabled by default drill evidence; operator confirms recovery action | linked |
| Daemon refuses unsafe live settlement | operator refuses unsafe live settlement and records incident action | artifact://operators/artifacts/drill-daemon-refuses-unsafe-live-settlement-2026-06-04-9e3921cb.md daemon refuses unsafe live settlement drill evidence; operator confirms recovery action | linked |
| Failed settlement triage | operator must pause settlement path and escalate unresolved state | artifact://operators/artifacts/drill-settlement-triage-2026-06-04-9e3921cb.md failed settlement triage drill evidence; operator confirms recovery action | linked |
| Reorg recovery | operator must reconcile reorg state and confirm recovery state | artifact://operators/artifacts/drill-reorg-recovery-2026-06-04-9e3921cb.md reorg recovery drill evidence; operator confirms recovery action | linked |
| Pause and resume | operator must pause service, confirm safe state, and resume only after checks | artifact://operators/artifacts/drill-pause-resume-2026-06-04-9e3921cb.md pause and resume drill evidence; operator confirms recovery action | linked |
| SQLite and AVL backup restore | operator must restore SQLite and AVL state and confirm recovered state | artifact://operators/artifacts/drill-sqlite-avl-backup-restore-2026-06-04-9e3921cb.md SQLite and AVL backup restore drill evidence; operator confirms recovery action | linked |
| Storage-rent and liquidity alert | operator must escalate storage-rent or liquidity alert and record action | artifact://operators/artifacts/drill-storage-rent-liquidity-alert-2026-06-04-9e3921cb.md storage-rent and liquidity alert drill evidence; operator confirms recovery action | linked |
| Incident response record | operator opens incident record and confirms escalation path | artifact://operators/artifacts/drill-incident-response-record-2026-06-04-9e3921cb.md incident response record drill evidence; operator confirms recovery action | linked |
| Key rotation and member loss | operator must pause key rotation path and escalate member loss | artifact://operators/artifacts/drill-key-rotation-member-loss-2026-06-04-9e3921cb.md key rotation and member loss drill evidence; operator confirms recovery action | linked |

## Operational Decisions

| Decision | Required evidence | Stop condition | Status |
|---|---|---|---|
| External operator can find every runbook | artifact://operators/artifacts/decision-external-operator-runbook-discovery-2026-06-04-9e3921cb.md external operator runbook discovery evidence | stop release if reviewer cannot reproduce | linked |
| Stop conditions are executable | artifact://operators/artifacts/decision-executable-stop-conditions-2026-06-04-9e3921cb.md executable stop conditions evidence | stop release if stop conditions cannot be followed | linked |
| Monitoring signals are actionable | artifact://operators/artifacts/decision-actionable-monitoring-signals-2026-06-04-9e3921cb.md monitoring signals actionable evidence | pause release if monitoring signals lack operator action | linked |
| Incident escalation is actionable | artifact://operators/artifacts/decision-actionable-incident-escalation-2026-06-04-9e3921cb.md incident escalation actionable evidence | stop release if incident escalation owner is absent | linked |
| Backup restore evidence is linked | artifact://operators/artifacts/decision-backup-restore-linked-2026-06-04-9e3921cb.md backup restore SQLite AVL evidence | stop release if backup restore evidence is not linked | linked |
| Governance rotation evidence is linked | artifact://operators/artifacts/decision-governance-rotation-linked-2026-06-04-9e3921cb.md governance rotation committee key-rotation evidence | pause release if governance rotation evidence is missing | linked |
| Broadcast enablement remains opt-in | artifact://operators/artifacts/decision-broadcast-opt-in-2026-06-04-9e3921cb.md broadcast opt-in evidence; broadcast enablement remains opt-in | refuse broadcast if opt-in record is absent | linked |

## Publication Decision

| Field | Value |
|---|---|
| Release supported | production deployment candidate |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | yes |
| Operator-ready claim allowed | yes |
| Critical incidents open | 0 |
| Release notes updated | yes |
| Required release-note updates | artifact://operators/artifacts/completed-operator-readiness-release-note-update-evidence-2026-06-04-9e3921cb.md completed operator-readiness release-note update evidence; Release supported = production deployment candidate; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical incidents open = 0 |
| Required checklist updates | artifact://operators/artifacts/completed-operator-readiness-checklist-update-evidence-2026-06-04-9e3921cb.md completed operator-readiness checklist update evidence; Release supported = production deployment candidate; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical incidents open = 0 |
| Reviewer decision summary | Release supported = production deployment candidate; operator-ready claim handling: Operator-ready claim allowed = yes; Gate 6 testnet operator evidence; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; testnet-scoped evaluation; Critical incidents open = 0 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Runbook operator | A. Shannon | approve | 2026-06-04 | approved Gate 6 operator readiness decision: external operator can find every runbook; stop conditions are executable |
| Security reviewer | A. Shannon | approve | 2026-06-04 | approved Gate 6 operator readiness decision: broadcast enablement remains opt-in; incident escalation is actionable |
| Release owner | A. Shannon | approve | 2026-06-04 | approved Gate 6 operator readiness decision: monitoring signals are actionable; Critical incidents open = 0 |
