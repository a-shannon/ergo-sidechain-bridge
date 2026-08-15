import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import {
  hasCompletedBackupRestoreChecklistUpdateEvidence,
  hasCompletedBackupRestoreReleaseNoteUpdateEvidence,
  parseRecoveryCommandRows,
  validateBackupRestoreEvidence,
} from './backup-restore-evidence.js';

const gitHygieneEvidence =
  'artifact://restore/git-hygiene-scan.log git status --short clean; git diff --check clean; no staged runtime artifacts';
const commandRows = [
  'Stop daemon and disable broadcast',
  'Pre-backup status snapshot',
  'Backup SQLite database and WAL set',
  'Restore into isolated or reviewed target',
  'Post-restore status snapshot',
  'Rebuild DUP AVL digest',
  'Rebuild SPV tracker digest',
  'Compare pre-backup and restored state',
  'Git hygiene scan',
].map(step => `| ${step} | ${commandEvidence(step)} | linked |`).join('\n');

const DUP_DIGEST = `0x${'a'.repeat(66)}`;
const SPV_DIGEST = `0x${'b'.repeat(66)}`;
const SINGLETON_DIGEST = `0x${'c'.repeat(64)}`;
const SPV_SINGLETON_DIGEST = `0x${'d'.repeat(64)}`;
const stateValues: Array<[string, string]> = [
  ['Peg-out status counts', 'pending=0,confirmed=2,failed=0'],
  ['Pending reconciliation rows', '0'],
  ['DUP AVL history count', '12'],
  ['DUP rebuilt digest', DUP_DIGEST],
  ['SPV tracker history count', '7'],
  ['SPV rebuilt digest', SPV_DIGEST],
  ['Persisted anchor heights', '1200,1201'],
  ['Pending DUP heartbeats', '0'],
  ['DUP singleton digest comparison or incident classification', `DUP singleton digest ${SINGLETON_DIGEST} matched`],
  [
    'SPV tracker singleton digest comparison or incident classification',
    `SPV tracker singleton digest ${SPV_SINGLETON_DIGEST} matched`,
  ],
  ['Runtime artifact hygiene', 'git status clean; runtime backups ignored'],
];
const backupCompareStateChecks = new Set([
  'Peg-out status counts',
  'Pending reconciliation rows',
  'DUP AVL history count',
  'DUP rebuilt digest',
  'SPV tracker history count',
  'SPV rebuilt digest',
  'Persisted anchor heights',
  'Pending DUP heartbeats',
]);
const stateRows = stateValues.map(([check]) => stateRow(check)).join('\n');

const boundaryRows = [
  'SQLite backup is local operator state, not consensus',
  'WAL and SHM are restored as matched set when present',
  'AVL histories are reconstructed from committed rows',
  'Digest mismatch triggers incident response',
  'Evidence excludes secrets and runtime databases',
].map(boundary => `| ${boundary} | artifact://restore/${slug(boundary)}.log | linked |`).join('\n');

const stopConditionRows = [
  'Daemon was running during backup without WAL files',
  'Restored DUP or SPV digest mismatches chain singleton',
  'Pending settlement may already have paid recipient',
  'Runtime backup files appear in git status',
  'Manual SQLite edit is proposed before chain-state classification',
].map(condition => `| ${condition} | artifact://restore/${slug(condition)}.md; checked and not hit; incident runbook if hit | linked |`).join('\n');

const publicationEvidence = [
  '- Release notes updated: yes',
  '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
  '- Pending Evidence Register updated: yes',
  '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
  '- Production-ready claim allowed by this drill: no',
  '- Testnet production-candidate claim allowed by this drill: no',
].join('\n');

const reviewerRows = [
  'Restore operator',
  'Security reviewer',
  'Operator reviewer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | restore evidence accepted |`).join('\n');

function backupRestoreEvidence(overrides: {
  commands?: string;
  states?: string;
  boundaries?: string;
  stops?: string;
  publication?: string;
  reviewers?: string;
  releaseLevel?: string;
  environment?: string;
  broadcastMode?: string;
  restoreTarget?: string;
} = {}): string {
  return `
# Completed Backup Restore Evidence

## Drill Classification

| Field | Value |
|---|---|
| Drill name | restore drill |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Environment | ${overrides.environment ?? 'patched devnet'} |
| Broadcast mode | ${overrides.broadcastMode ?? 'disabled'} |
| Source state | pre-rehearsal database snapshot |
| Restore target | ${overrides.restoreTarget ?? 'isolated restore database'} |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Required Commands

| Step | Required evidence | Status |
|---|---|---|
${overrides.commands ?? commandRows}

## State Consistency Checks

| Check | Pre-backup value | Restored value | Evidence | Status |
|---|---|---|---|---|
${overrides.states ?? stateRows}

## Reconstructibility Boundaries

| Boundary | Required evidence | Status |
|---|---|---|
${overrides.boundaries ?? boundaryRows}

## Stop Conditions

| Stop condition | Required resolution | Status |
|---|---|---|
${overrides.stops ?? stopConditionRows}

## Publication Evidence

${overrides.publication ?? publicationEvidence}

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('backup-restore evidence validation', () => {
  it('prints release-gate and claim boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-backup-restore-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run backup:validate');
    expect(result.stdout).toContain('completed Backup Restore Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --backup-restore-evidence');
    expect(result.stdout).toContain('backup-restore validation target');
    expect(result.stdout).toContain('command-specific completed backup-restore command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('Production-ready claim allowed by this drill: no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed by this drill: no');
    expect(result.stdout).toContain('Release notes updated: yes');
    expect(result.stdout).toContain('Pending Evidence Register updated: yes');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('parses required recovery command rows', () => {
    const rows = parseRecoveryCommandRows(backupRestoreEvidence());

    expect(rows[0]).toMatchObject({
      step: 'Stop daemon and disable broadcast',
      status: 'linked',
    });
  });

  it('passes when backup-restore evidence is fully structured', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence());

    expect(result.status).toBe('PASS');
    expect(result.stateRows).toHaveLength(11);
    expect(result.message).toContain('11 state consistency rows');
  });

  it('requires drill dates to use ISO calendar format', () => {
    const result = validateBackupRestoreEvidence(
      backupRestoreEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Date must use YYYY-MM-DD');
  });

  it('requires drill Git commits to use commit SHA format', () => {
    const result = validateBackupRestoreEvidence(
      backupRestoreEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate drill classification fields', () => {
    const result = validateBackupRestoreEvidence(
      backupRestoreEvidence().replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Git commit: duplicate required field');
  });

  it('blocks pending command evidence before Gate 3 backup evidence can pass', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: '| Stop daemon and disable broadcast | artifact://restore/stop.log | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: Pre-backup status snapshot: missing required row');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: status must be linked before backup-restore evidence can pass',
    );
  });

  it('rejects duplicate required backup-restore rows', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: `${commandRows}\n| Stop daemon and disable broadcast | artifact://restore/stop-second.log | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: Stop daemon and disable broadcast: duplicate required row');
  });

  it('blocks linked state rows without restored values or evidence markers', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: '| DUP rebuilt digest | digest-before | | no artifact | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('State Consistency Checks: Peg-out status counts: missing required row');
    expect(result.errors).toContain('State Consistency Checks: DUP rebuilt digest: Restored value is required');
    expect(result.errors).toContain('State Consistency Checks: DUP rebuilt digest: linked status requires an evidence marker');
  });

  it('rejects linked backup-restore rows that only point to templates or bare validator commands', () => {
    const templateOnlyEvidence = '[Backup Restore Evidence Template](backup-restore-evidence-template.md), `npm run backup:validate`';
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | ${templateOnlyEvidence} | linked |`,
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${templateOnlyEvidence} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        `| SQLite backup is local operator state, not consensus | ${templateOnlyEvidence}; local operator state not consensus | linked |`,
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | [Backup Restore Evidence Template](backup-restore-evidence-template.md), `git status --short`; checked and not hit; incident runbook if hit | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects linked backup-restore rows that only cite backup-restore validation targets', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | ${backupRestoreValidationTargetOnly(commandEvidence('Stop daemon and disable broadcast'))} | linked |`,
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${backupRestoreValidationTargetOnly(stateEvidence('DUP rebuilt digest'))} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        `| SQLite backup is local operator state, not consensus | ${backupRestoreValidationTargetOnly('artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log')} | linked |`,
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        `| Runtime backup files appear in git status | ${backupRestoreValidationTargetOnly('artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit')} | linked |`,
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: [backup-restore validation target](artifact://publication/gate-3-backup-restore-release-notes.md) completed Gate 3 backup-restore release-note update evidence',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: [backup-restore validation target](artifact://publication/gate-3-backup-restore-checklist.md) completed Gate 3 backup-restore checklist update evidence',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('accepts concrete backup-restore evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://restore/validation/backup-restore-validate-input.md';
    const validationTargetBinding = `backup-restore validation target ${validationTarget}`;
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log; ${validationTargetBinding} | linked |`,
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')}; ${validationTargetBinding} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        `| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log; ${validationTargetBinding} | linked |`,
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        `| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; ${validationTargetBinding} | linked |`,
      ),
      publication: [
        '- Release notes updated: yes',
        `- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; ${validationTargetBinding}`,
        '- Pending Evidence Register updated: yes',
        `- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; ${validationTargetBinding}`,
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires distinct backup-restore release-note and checklist publication targets', () => {
    const reusedTarget = 'artifact://publication/gate-3-backup-restore-publication-update.md';
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: [
        '- Release notes updated: yes',
        `- Required release-note updates: ${reusedTarget} completed Gate 3 backup-restore release-note update evidence`,
        '- Pending Evidence Register updated: yes',
        `- Required checklist updates: ${reusedTarget} completed Gate 3 backup-restore checklist update evidence`,
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note and checklist updates must use distinct completed Gate 3 backup-restore publication evidence targets',
    );
  });

  it('rejects backup-restore publication update evidence kinds hidden inside longer draft labels', () => {
    expect(hasCompletedBackupRestoreReleaseNoteUpdateEvidence(
      'draft completed Gate 3 backup-restore release-note update evidence artifact://publication/gate-3-backup-restore-release-notes.md; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
    )).toBe(false);
    expect(hasCompletedBackupRestoreChecklistUpdateEvidence(
      'candidate completed Gate 3 backup-restore checklist update evidence artifact://publication/gate-3-backup-restore-checklist.md; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
    )).toBe(false);
  });

  it('rejects publication evidence rows whose Gate 3 backup-restore evidence kind is hidden inside a longer draft label', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: draft completed Gate 3 backup-restore release-note update evidence artifact://publication/gate-3-backup-restore-release-notes.md; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: candidate completed Gate 3 backup-restore checklist update evidence artifact://publication/gate-3-backup-restore-checklist.md; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must include completed Gate 3 backup-restore release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must include completed Gate 3 backup-restore checklist update evidence',
    );
  });

  it('accepts compatibility-normalized backup-restore publication update evidence kinds', () => {
    const gateLabel = '\uFF27\uFF41\uFF54\uFF45';
    const gateNumber = '\uFF13';
    const backupRestoreLabel = '\uFF42\uFF41\uFF43\uFF4B\uFF55\uFF50-\uFF52\uFF45\uFF53\uFF54\uFF4F\uFF52\uFF45';
    const releaseNoteUpdates =
      `artifact://publication/completed-release-note-update.md completed ${gateLabel} ${gateNumber} ${backupRestoreLabel} release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no`;
    const checklistUpdates =
      `artifact://publication/completed-checklist-update.md completed ${gateLabel} ${gateNumber} ${backupRestoreLabel} checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no`;

    expect(hasCompletedBackupRestoreReleaseNoteUpdateEvidence(releaseNoteUpdates)).toBe(true);
    expect(hasCompletedBackupRestoreChecklistUpdateEvidence(checklistUpdates)).toBe(true);

    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: [
        '- Release notes updated: yes',
        `- Required release-note updates: ${releaseNoteUpdates}`,
        '- Pending Evidence Register updated: yes',
        `- Required checklist updates: ${checklistUpdates}`,
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects linked backup-restore rows with schemeless artifact targets', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://completed stop daemon and disable broadcast evidence | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects non-concrete artifact targets for linked backup-restore evidence', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/placeholder-stop-daemon-and-disable-broadcast.log daemon stopped and broadcast disabled | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | artifact://restore/todo-dup-rebuilt-digest.log npm run backup:compare local snapshot comparison output; DUP rebuilt digest output; measured value ${DUP_DIGEST} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/tbd-sqlite-backup-is-local-operator-state-not-consensus.log SQLite backup is local operator state and not consensus | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/sample-evidence-runtime-backup-files-appear-in-git-status.md; runtime backup files checked in git status and not hit; incident runbook if hit | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/sample-evidence-gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/example-evidence-gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      restoreTarget:
        'artifact://restore/placeholder-reviewer-approval.md reviewed live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects sample-domain artifact targets for linked backup-restore evidence', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/completed-sample-stop-daemon-and-disable-broadcast.log daemon stopped and broadcast disabled | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | artifact://restore/completed-example-dup-rebuilt-digest.json npm run backup:compare local snapshot comparison output; DUP rebuilt digest output; measured value ${DUP_DIGEST} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/completed-template-sqlite-backup-is-local-operator-state-not-consensus.log SQLite backup is local operator state and not consensus | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/completed-sample-stop-runtime-backup-files-appear-in-git-status.md; runtime backup files checked in git status and not hit; incident runbook if hit | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/completed-sample-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/completed-example-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      restoreTarget:
        'artifact://restore/completed-sample-reviewer-approval.md reviewed live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    'artifact://restore/fixture-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/mock-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/dummy-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/fake-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/stub-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/testdata-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/synthetic-stop-daemon-and-disable-broadcast.log',
    'artifact://restore/simulated-stop-daemon-and-disable-broadcast.log',
  ])('rejects fixture-style artifact marker %s for linked backup-restore evidence', artifactTarget => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | ${artifactTarget} daemon stopped and broadcast disabled | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    '[fixture](artifact://restore/fixture-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[mock](artifact://restore/mock-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[dummy](artifact://restore/dummy-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[fake](artifact://restore/fake-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[stub](artifact://restore/stub-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[testdata](artifact://restore/testdata-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[synthetic](artifact://restore/synthetic-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
    '[simulated](artifact://restore/simulated-stop-daemon-and-disable-broadcast.log) daemon stopped and broadcast disabled',
  ])('rejects fixture-style Markdown link %s for linked backup-restore evidence', markdownTarget => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | ${markdownTarget} | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    {
      variant: 'raw',
      tmpTarget: ['', 'tmp', 'stop-daemon-and-disable-broadcast.log'].join('/'),
      driveTarget: ['C:', 'tmp', 'dup-rebuilt-digest.log'].join('/'),
      fileTarget: ['file:', '', '', 'C:', 'tmp', 'sqlite-boundary.log'].join('/'),
      uncTarget: ['', '', 'share-name', 'runtime-backup-files.md'].join('/'),
      releaseNoteTarget: ['C:', 'tmp', 'gate-3-backup-restore-release-notes.md'].join('/'),
      checklistTarget: [
        'file:',
        '',
        '',
        'C:',
        'tmp',
        'gate-3-backup-restore-checklist.md',
      ].join('/'),
      reviewerApprovalTarget: ['', 'tmp', 'restore-reviewer-approval.md'].join('/'),
    },
    {
      variant: 'encoded',
      tmpTarget: '%2Ftmp%2Fstop-daemon-and-disable-broadcast.log',
      driveTarget: 'C%3A%2Ftmp%2Fdup-rebuilt-digest.log',
      fileTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fsqlite-boundary.log',
      uncTarget: '%2F%2Fshare-name%2Fruntime-backup-files.md',
      releaseNoteTarget: 'C%3A%2Ftmp%2Fgate-3-backup-restore-release-notes.md',
      checklistTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-3-backup-restore-checklist.md',
      reviewerApprovalTarget: '%2Ftmp%2Frestore-reviewer-approval.md',
    },
    {
      variant: 'embedded encoded',
      tmpTarget: 'artifact://restore/sourceTarget=%2Ftmp%2Fstop-daemon-and-disable-broadcast.log',
      driveTarget: 'artifact://restore/sourceTarget=C%3A%2Ftmp%2Fdup-rebuilt-digest.log',
      fileTarget: 'artifact://restore/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fsqlite-boundary.log',
      uncTarget: 'artifact://restore/sourceTarget=%2F%2Fshare-name%2Fruntime-backup-files.md',
      releaseNoteTarget:
        'artifact://publication/sourceTarget=C%3A%2Ftmp%2Fgate-3-backup-restore-release-notes.md',
      checklistTarget:
        'artifact://publication/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-3-backup-restore-checklist.md',
      reviewerApprovalTarget: 'artifact://restore/sourceTarget=%2Ftmp%2Frestore-reviewer-approval.md',
    },
  ])(
    'rejects $variant local-only targets for linked backup-restore evidence',
    ({
      tmpTarget,
      driveTarget,
      fileTarget,
      uncTarget,
      releaseNoteTarget,
      checklistTarget,
      reviewerApprovalTarget,
    }) => {
      const result = validateBackupRestoreEvidence(backupRestoreEvidence({
        commands: commandRows.replace(
          '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
          `| Stop daemon and disable broadcast | [stop daemon evidence](${tmpTarget}) daemon stopped and broadcast disabled | linked |`,
        ),
        states: stateRows.replace(
          stateRow('DUP rebuilt digest'),
          `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | [DUP rebuilt digest evidence](${driveTarget}) npm run backup:compare local snapshot comparison output; DUP rebuilt digest output; measured value ${DUP_DIGEST} | linked |`,
        ),
        boundaries: boundaryRows.replace(
          '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
          `| SQLite backup is local operator state, not consensus | [SQLite boundary evidence](${fileTarget}) SQLite backup is local operator state and not consensus | linked |`,
        ),
        stops: stopConditionRows.replace(
          '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
          `| Runtime backup files appear in git status | [runtime backup files evidence](${uncTarget}); runtime backup files checked in git status and not hit; incident runbook if hit | linked |`,
        ),
        publication: [
          '- Release notes updated: yes',
          `- Required release-note updates: [completed Gate 3 backup-restore release-note update evidence](${releaseNoteTarget}) completed Gate 3 backup-restore release-note update evidence`,
          '- Pending Evidence Register updated: yes',
          `- Required checklist updates: [completed Gate 3 backup-restore checklist update evidence](${checklistTarget}) completed Gate 3 backup-restore checklist update evidence`,
          '- Production-ready claim allowed by this drill: no',
          '- Testnet production-candidate claim allowed by this drill: no',
        ].join('\n'),
        restoreTarget:
          `[restore reviewer approval](${reviewerApprovalTarget}) reviewed live relayer database reviewer approval rollback plan`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Drill Classification: reviewed restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Drill Classification: live or runtime restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
      );
    },
  );

  it('rejects runtime database targets for linked backup-restore evidence', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.sqlite daemon stopped and broadcast disabled | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | artifact://restore/dup-rebuilt-digest.db npm run backup:compare local snapshot comparison output; DUP rebuilt digest output; measured value ${DUP_DIGEST} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.sqlite3 SQLite backup is local operator state and not consensus | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.sqlite-wal; runtime backup files checked in git status and not hit; incident runbook if hit | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.sqlite completed Gate 3 backup-restore release-note update evidence',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.sqlite-wal completed Gate 3 backup-restore checklist update evidence',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      restoreTarget:
        'artifact://restore/reviewer-approval.sqlite reviewed live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('allows concrete backup-restore targets that mention sample size or template removal', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        'artifact://restore/stop-daemon-and-disable-broadcast.log',
        'artifact://restore/sample-size-analysis-stop-daemon-and-disable-broadcast.log',
      ),
      states: stateRows.replace(
        'artifact://restore/dup-rebuilt-digest.log',
        'artifact://restore/template-removal-audit-dup-rebuilt-digest.log',
      ),
      boundaries: boundaryRows.replace(
        'artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log',
        'artifact://restore/sample-size-analysis-sqlite-backup-is-local-operator-state-not-consensus.log',
      ),
      stops: stopConditionRows.replace(
        'artifact://restore/runtime-backup-files-appear-in-git-status.md',
        'artifact://restore/template-removal-audit-runtime-backup-files-appear-in-git-status.md',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/sample-size-analysis-gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/template-removal-audit-gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      restoreTarget:
        'artifact://restore/template-removal-audit-reviewer-approval.md reviewed live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects linked backup-restore evidence whose command output has no evidence target', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | npm run backup:validate command output: PASS; daemon stopped; broadcast disabled | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | npm run backup:compare command output: PASS; local snapshot comparison output; DUP rebuild digest output; measured value ${DUP_DIGEST} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| AVL histories are reconstructed from committed rows | artifact://restore/avl-histories-are-reconstructed-from-committed-rows.log | linked |',
        '| AVL histories are reconstructed from committed rows | npm run backup:validate command output: PASS; AVL histories reconstructed from committed rows | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | git status --short command output: PASS; runtime backup files checked; git status clean; incident runbook if hit | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: npm run backup:validate command output: PASS; completed Gate 3 backup-restore release-note update evidence',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: npm run backup:validate command output: PASS; completed Gate 3 backup-restore checklist update evidence',
        '- Production-ready claim allowed by this drill: no',
      ].join('\n'),
      restoreTarget: 'npm run backup:validate command output: PASS; reviewed live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: AVL histories are reconstructed from committed rows: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects claim-escalating artifact targets for linked backup-restore evidence', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast-mainnet-production-certified.log daemon stopped and broadcast disabled | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | artifact://restore/dup-rebuilt-digest-testnet-production-candidate-approved.log npm run backup:compare local snapshot comparison output; measured value ${DUP_DIGEST} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus-mainnet-production-certified.log | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status-production-ready-approved.md; checked and not hit; incident runbook if hit | linked |',
      ),
      publication: publicationEvidence
        .replace(
          'artifact://publication/gate-3-backup-restore-release-notes.md',
          'artifact://publication/gate-3-backup-restore-release-notes-mainnet-production-certified.md',
        )
        .replace(
          'artifact://publication/gate-3-backup-restore-checklist.md',
          'artifact://publication/gate-3-backup-restore-checklist-production-ready-approved.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: linked status requires completed command-output target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects linked backup-restore evidence with contradictory failure markers', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: required resolution must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects backup-restore evidence with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 backup restore validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log ${contradictoryEvidence} | linked |`,
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} ${contradictoryEvidence} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        `| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log ${contradictoryEvidence} | linked |`,
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        `| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; ${contradictoryEvidence} | linked |`,
      ),
      publication: [
        '- Release notes updated: yes',
        `- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; ${contradictoryEvidence}`,
        '- Pending Evidence Register updated: yes',
        `- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; ${contradictoryEvidence}`,
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        `| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; ${contradictoryEvidence} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: required resolution must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects backup-restore evidence with structured failure fields', () => {
    const emptyStructuredFields = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0; {"errors":[]} errorCount: 0 | linked |',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0; errorCount: 1 | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} command output: PASS exit code 0; {"errors":["digest mismatch"]} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log {"failures":{"boundary":"blocked"}} | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; failureTotal: 1 | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; {"errors":["release-note gap"]}',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no; {"failures":{"checklist":"blocked"}}',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; failureTotal: 1 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: required resolution must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects backup-restore publication and reviewer rows with contradictory exact claim bindings', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: publicationEvidence
        .replace(
          'completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
          'completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no; ' +
            'Testnet production-candidate claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: yes',
        )
        .replace(
          'completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
          'completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no; ' +
            'Testnet production-candidate claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: yes',
        ),
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; ' +
          'Testnet production-candidate claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: yes |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore claim decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore claim decision bindings',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not include contradictory backup-restore claim decision bindings',
    );
  });

  it('rejects linked backup-restore evidence with remaining issue markers', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0; Remaining issues: unresolved daemon shutdown blocker | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} command output: PASS exit code 0; Remaining issues: unresolved digest blocker | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log command output: PASS exit code 0; Remaining issues: unresolved boundary blocker | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; command output: PASS exit code 0; Remaining issues: unresolved runtime blocker | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence command output: PASS exit code 0; Remaining issues: unresolved release-note blocker',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence command output: PASS exit code 0; Remaining issues: unresolved checklist blocker',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: required resolution must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects linked backup-restore evidence with singular remaining issue markers', () => {
    const remainingIssue = 'command output: PASS exit code 0; Remaining issue: follow-up pending';
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log ${remainingIssue} | linked |`,
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} ${remainingIssue} | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        `| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log ${remainingIssue} | linked |`,
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        `| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; ${remainingIssue} | linked |`,
      ),
      publication: [
        '- Release notes updated: yes',
        `- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence ${remainingIssue}`,
        '- Pending Evidence Register updated: yes',
        `- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence ${remainingIssue}`,
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        `| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; ${remainingIssue} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: required resolution must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects linked backup-restore evidence with open or known issue markers', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0; Open issues: unresolved daemon shutdown blocker | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} command output: PASS exit code 0; Known issues: unresolved digest blocker | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log command output: PASS exit code 0; Open issues: unresolved boundary blocker | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; command output: PASS exit code 0; Known issues: unresolved runtime blocker | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence command output: PASS exit code 0; Open issues: unresolved release-note blocker; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence command output: PASS exit code 0; Known issues: unresolved checklist blocker; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: required resolution must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers',
    );
  });

  it('allows linked backup-restore evidence with explicit no issue markers', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0; Open issues: 0 | linked |',
      ),
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | ${stateEvidence('DUP rebuilt digest')} command output: PASS exit code 0; Known issues: none | linked |`,
      ),
      boundaries: boundaryRows.replace(
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
        '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log command output: PASS exit code 0; Open issues: no | linked |',
      ),
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit; command output: PASS exit code 0; Known issues: n/a | linked |',
      ),
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence command output: PASS exit code 0; Open issues: 0; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence command output: PASS exit code 0; Known issues: none; Production-ready claim allowed by this drill: no; Testnet production-candidate claim allowed by this drill: no',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('rejects backup-restore command evidence that keeps an exit-code placeholder', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS exit code 0/1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
  });

  it.each([
    'structural issues = 0/1',
    'errors=0/1',
  ])('rejects backup-restore command evidence that keeps result count placeholder %s', placeholder => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        '| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log | linked |',
        `| Stop daemon and disable broadcast | artifact://restore/stop-daemon-and-disable-broadcast.log command output: PASS ${placeholder} | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Stop daemon and disable broadcast: required evidence must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects backup-restore publication updates that approve mainnet or production-ready claims', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: publicationEvidence
        .replace(
          '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence',
          '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence approves mainnet production deployment wording',
        )
        .replace(
          '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence',
          '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence approves production-ready backup-restore claim wording',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('requires linked command evidence to cite the command-specific signal', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows
        .replace(
          '| Backup SQLite database and WAL set | artifact://restore/backup-sqlite-database-and-wal-set.log | linked |',
          '| Backup SQLite database and WAL set | artifact://restore/reviewed.log | linked |',
        )
        .replace(
          '| Rebuild DUP AVL digest | artifact://restore/rebuild-dup-avl-digest.log | linked |',
          '| Rebuild DUP AVL digest | artifact://restore/reviewed.log | linked |',
        )
        .replace(
          `| Compare pre-backup and restored state | ${commandEvidence('Compare pre-backup and restored state')} | linked |`,
          '| Compare pre-backup and restored state | artifact://restore/compare-pre-backup-and-restored-state.log pre-backup restored state comparison | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Backup SQLite database and WAL set: required evidence must identify SQLite backup',
    );
    expect(result.errors).toContain(
      'Required Commands: Backup SQLite database and WAL set: required evidence must identify WAL handling',
    );
    expect(result.errors).toContain(
      'Required Commands: Rebuild DUP AVL digest: required evidence must identify DUP rebuild',
    );
    expect(result.errors).toContain(
      'Required Commands: Rebuild DUP AVL digest: required evidence must identify AVL rebuild',
    );
    expect(result.errors).toContain(
      'Required Commands: Rebuild DUP AVL digest: required evidence must identify digest output',
    );
    expect(result.errors).toContain(
      'Required Commands: Compare pre-backup and restored state: required evidence must identify backup:compare output',
    );
    expect(result.errors).toContain(
      'Required Commands: Compare pre-backup and restored state: required evidence must identify snapshot comparison',
    );
    expect(result.errors).toContain(
      'Required Commands: Compare pre-backup and restored state: required evidence must identify snapshot schemaVersion validation',
    );
  });

  it('requires backup:compare command evidence to cite distinct snapshot artifacts and timestamp ordering', () => {
    const genericCompareEvidence =
      'artifact://restore/compare-pre-backup-and-restored-state.log npm run backup:compare local snapshot comparison output; pre-backup restored state comparison; schemaVersion validation';
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        `| Compare pre-backup and restored state | ${commandEvidence('Compare pre-backup and restored state')} | linked |`,
        `| Compare pre-backup and restored state | ${genericCompareEvidence} | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Compare pre-backup and restored state: required evidence must identify distinct pre-backup and restored JSON snapshot artifacts',
    );
    expect(result.errors).toContain(
      'Required Commands: Compare pre-backup and restored state: required evidence must identify restored snapshot generatedAt after pre-backup generatedAt',
    );
  });

  it('requires git hygiene command evidence to cite exact git scans and runtime artifact result', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      commands: commandRows.replace(
        `| Git hygiene scan | ${gitHygieneEvidence} | linked |`,
        '| Git hygiene scan | artifact://restore/git-hygiene-scan.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: Git hygiene scan: required evidence must identify git status --short output',
    );
    expect(result.errors).toContain(
      'Required Commands: Git hygiene scan: required evidence must identify git diff --check output',
    );
    expect(result.errors).toContain(
      'Required Commands: Git hygiene scan: required evidence must identify no staged runtime artifacts',
    );
  });

  it('blocks linked state rows whose restored value differs from the pre-backup value', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | 0x${'d'.repeat(66)} | artifact://restore/dup-rebuilt-digest.log | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: restored value must match pre-backup value',
    );
  });

  it('requires linked state consistency evidence to cite the measured signal', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | artifact://restore/dup-digest.log | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must identify rebuild output',
    );
  });

  it('requires local state rows to cite backup:compare output', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRows.replace(
        stateRow('DUP rebuilt digest'),
        `| DUP rebuilt digest | ${DUP_DIGEST} | ${DUP_DIGEST} | artifact://restore/dup-rebuilt-digest.log DUP rebuild digest output | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: evidence must identify backup:compare local snapshot comparison output',
    );
  });

  it('requires linked state consistency evidence to cite measured row values', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRows
        .replace(
          stateRow('DUP AVL history count'),
          '| DUP AVL history count | 12 | 12 | artifact://restore/dup-avl-history-count.log npm run backup:compare local snapshot comparison output; DUP AVL history count matched | linked |',
        )
        .replace(
          stateRow('DUP singleton digest comparison or incident classification'),
          `| DUP singleton digest comparison or incident classification | DUP singleton digest ${SINGLETON_DIGEST} matched | DUP singleton digest ${SINGLETON_DIGEST} matched | artifact://restore/dup-singleton-digest-comparison.log DUP singleton digest comparison matched | linked |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: DUP AVL history count: evidence must cite the measured pre-backup/restored value',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP singleton digest comparison or incident classification: evidence must cite the measured pre-backup/restored value',
    );
  });

  it('requires separate DUP and SPV singleton chain comparison state rows', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRowsWithGenericSingletonOnly(),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: DUP singleton digest comparison or incident classification: missing required row',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: SPV tracker singleton digest comparison or incident classification: missing required row',
    );
  });

  it('requires linked state values to use measured count, digest, and hygiene formats', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRows
        .replace(
          stateRow('DUP AVL history count'),
          '| DUP AVL history count | twelve | twelve | artifact://restore/dup-avl-history-count.log | linked |',
        )
        .replace(
          stateRow('DUP rebuilt digest'),
          `| DUP rebuilt digest | 0x${'a'.repeat(64)} | 0x${'a'.repeat(64)} | artifact://restore/dup-rebuilt-digest.log | linked |`,
        )
        .replace(
          stateRow('Runtime artifact hygiene'),
          '| Runtime artifact hygiene | reviewed | reviewed | artifact://restore/runtime-artifact-hygiene.log | linked |',
        )
        .replace(
          stateRow('DUP singleton digest comparison or incident classification'),
          '| DUP singleton digest comparison or incident classification | singleton digest matched | singleton digest matched | artifact://restore/dup-singleton-digest-comparison.log DUP singleton digest comparison | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: DUP AVL history count: Pre-backup value must be a numeric history count',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP rebuilt digest: Pre-backup value must be a 33-byte AVL digest',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: Runtime artifact hygiene: Pre-backup value must state clean, ignored, none, or not staged artifact hygiene',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP singleton digest comparison or incident classification: Pre-backup value must include a concrete 32-byte singleton ID, 33-byte digest, or incident classification',
    );
  });

  it('rejects unsafe integer backup-restore state counts and heights', () => {
    const unsafeInteger = '9007199254740993';
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      states: stateRows
        .replace(
          stateRow('Peg-out status counts'),
          stateRowWithValue('Peg-out status counts', `pending=${unsafeInteger},confirmed=0,failed=0`),
        )
        .replace(
          stateRow('Pending reconciliation rows'),
          stateRowWithValue('Pending reconciliation rows', unsafeInteger),
        )
        .replace(
          stateRow('DUP AVL history count'),
          stateRowWithValue('DUP AVL history count', unsafeInteger),
        )
        .replace(
          stateRow('SPV tracker history count'),
          stateRowWithValue('SPV tracker history count', unsafeInteger),
        )
        .replace(
          stateRow('Persisted anchor heights'),
          stateRowWithValue('Persisted anchor heights', `${unsafeInteger},1201`),
        )
        .replace(
          stateRow('Pending DUP heartbeats'),
          stateRowWithValue('Pending DUP heartbeats', unsafeInteger),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'State Consistency Checks: Peg-out status counts: Pre-backup value must use safe integer status=count pairs',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: Pending reconciliation rows: Pre-backup value must be a safe integer row count',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: DUP AVL history count: Pre-backup value must be a safe integer history count',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: SPV tracker history count: Pre-backup value must be a safe integer history count',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: Persisted anchor heights: Pre-backup value must be safe integer anchor heights or none',
    );
    expect(result.errors).toContain(
      'State Consistency Checks: Pending DUP heartbeats: Pre-backup value must be a safe integer heartbeat count',
    );
  });

  it('blocks unsafe or unknown classification values', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      releaseLevel: 'production',
      environment: 'mainnet',
      broadcastMode: 'enabled',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: Release level must be one of validated PoC, institutional reference, production deployment candidate',
    );
    expect(result.errors).toContain(
      'Drill Classification: Environment must be one of local offline, local devnet, patched devnet, testnet, staging',
    );
    expect(result.errors).toContain('Drill Classification: Broadcast mode must be one of disabled, dry-run');
  });

  it('requires production deployment candidate backup-restore drills to be testnet-scoped', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'patched devnet',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: production deployment candidate requires Environment testnet',
    );
  });

  it('blocks restore targets that are neither isolated nor reviewed', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      restoreTarget: 'not reviewed live relayer database',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: Restore target must state isolated or reviewed target',
    );
  });

  it('requires reviewed non-isolated restore targets to link approval and rollback evidence', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      restoreTarget: 'reviewed live relayer database',
    }));
    const approved = validateBackupRestoreEvidence(backupRestoreEvidence({
      restoreTarget: 'artifact://restore/reviewer-approval.md reviewed live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must include reviewer approval evidence',
    );
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must mention reviewer approval',
    );
    expect(result.errors).toContain(
      'Drill Classification: reviewed restore target must mention rollback plan',
    );
    expect(approved.status).toBe('PASS');
  });

  it('requires live or runtime restore targets to link approval and rollback evidence even when labeled isolated', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      restoreTarget: 'isolated live relayer database',
    }));
    const approved = validateBackupRestoreEvidence(backupRestoreEvidence({
      restoreTarget: 'artifact://restore/reviewer-approval.md isolated live relayer database reviewer approval rollback plan',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must include reviewer approval evidence',
    );
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must mention reviewer approval',
    );
    expect(result.errors).toContain(
      'Drill Classification: live or runtime restore target must mention rollback plan',
    );
    expect(approved.status).toBe('PASS');
  });

  it('requires reconstructibility boundaries to be linked', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      boundaries: '| SQLite backup is local operator state, not consensus | artifact://restore/boundary.log | blocker |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reconstructibility Boundaries: WAL and SHM are restored as matched set when present: missing required row');
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: status must be linked before backup-restore evidence can pass',
    );
  });

  it('requires linked reconstructibility boundaries to cite boundary-specific evidence', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      boundaries: boundaryRows
        .replace(
          '| SQLite backup is local operator state, not consensus | artifact://restore/sqlite-backup-is-local-operator-state-not-consensus.log | linked |',
          '| SQLite backup is local operator state, not consensus | artifact://restore/reviewed.log | linked |',
        )
        .replace(
          '| Evidence excludes secrets and runtime databases | artifact://restore/evidence-excludes-secrets-and-runtime-databases.log | linked |',
          '| Evidence excludes secrets and runtime databases | artifact://restore/reviewed.log | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must mention SQLite backup scope',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must mention local operator state classification',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: SQLite backup is local operator state, not consensus: required evidence must mention not-consensus classification',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: Evidence excludes secrets and runtime databases: required evidence must mention exclusion or hygiene action',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: Evidence excludes secrets and runtime databases: required evidence must mention secret-material exclusion',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: Evidence excludes secrets and runtime databases: required evidence must mention runtime-database exclusion',
    );
  });

  it('requires WAL and SHM matched-set evidence for restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      boundaries: boundaryRows.replace(
        '| WAL and SHM are restored as matched set when present | artifact://restore/wal-and-shm-are-restored-as-matched-set-when-present.log | linked |',
        '| WAL and SHM are restored as matched set when present | artifact://restore/wal-backup.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: WAL and SHM are restored as matched set when present: required evidence must mention SHM handling',
    );
    expect(result.errors).toContain(
      'Reconstructibility Boundaries: WAL and SHM are restored as matched set when present: required evidence must mention matched-set handling when present',
    );
  });

  it('requires stop-condition resolutions', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      stops: '| Runtime backup files appear in git status | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Stop Conditions: Daemon was running during backup without WAL files: missing required row');
    expect(result.errors).toContain('Stop Conditions: Runtime backup files appear in git status: required resolution is required');
  });

  it('requires linked stop-condition resolutions to be evidenced and actionable', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      stops: stopConditionRows.replace(
        '| Runtime backup files appear in git status | artifact://restore/runtime-backup-files-appear-in-git-status.md; checked and not hit; incident runbook if hit | linked |',
        '| Runtime backup files appear in git status | reviewed clean | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires an evidence marker',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Runtime backup files appear in git status: linked status requires an actionable stop resolution',
    );
  });

  it('requires linked stop-condition resolutions to cite condition-specific facts', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      stops: stopConditionRows
        .replace(
          '| Restored DUP or SPV digest mismatches chain singleton | artifact://restore/restored-dup-or-spv-digest-mismatches-chain-singleton.md; checked and not hit; incident runbook if hit | linked |',
          '| Restored DUP or SPV digest mismatches chain singleton | artifact://restore/generic-stop-condition.md; checked and not hit; incident runbook if hit | linked |',
        )
        .replace(
          '| Manual SQLite edit is proposed before chain-state classification | artifact://restore/manual-sqlite-edit-is-proposed-before-chain-state-classification.md; checked and not hit; incident runbook if hit | linked |',
          '| Manual SQLite edit is proposed before chain-state classification | artifact://restore/sqlite-stop.md; checked and not hit; incident runbook if hit | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Stop Conditions: Restored DUP or SPV digest mismatches chain singleton: required resolution must mention DUP or SPV digest scope',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Restored DUP or SPV digest mismatches chain singleton: required resolution must mention digest mismatch evidence',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Restored DUP or SPV digest mismatches chain singleton: required resolution must mention mismatch classification',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Restored DUP or SPV digest mismatches chain singleton: required resolution must mention chain singleton comparison',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Manual SQLite edit is proposed before chain-state classification: required resolution must mention manual edit proposal',
    );
    expect(result.errors).toContain(
      'Stop Conditions: Manual SQLite edit is proposed before chain-state classification: required resolution must mention chain-state classification',
    );
  });

  it('requires publication evidence before backup-restore evidence can close Gate 3', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: [
        '- Release notes updated: no',
        '- Required release-note updates: [release notes template](release-notes-template.md)',
        '- Pending Evidence Register updated: no',
        '- Required checklist updates: `npm run backup:validate`',
        '- Production-ready claim allowed by this drill: yes',
        '- Testnet production-candidate claim allowed by this drill: yes',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Release notes updated must be yes before backup-restore evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Pending Evidence Register updated must be yes before backup-restore evidence can pass',
    );
    expect(result.errors).toContain('Publication Evidence: Production-ready claim allowed by this drill must be no');
    expect(result.errors).toContain(
      'Publication Evidence: Testnet production-candidate claim allowed by this drill must be no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must include completed Gate 3 backup-restore release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must include completed Gate 3 backup-restore checklist update evidence',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
  });

  it('requires publication update evidence to preserve exact drill claim denials', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: publicationEvidence
        .replaceAll('; Production-ready claim allowed by this drill: no', '')
        .replaceAll('; Testnet production-candidate claim allowed by this drill: no', ''),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must use exact Production-ready claim allowed by this drill: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must use exact Testnet production-candidate claim allowed by this drill: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must use exact Production-ready claim allowed by this drill: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must use exact Testnet production-candidate claim allowed by this drill: no',
    );
  });

  it('rejects backup-restore publication updates that keep drill claim denial placeholders', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: [
        '- Release notes updated: yes',
        '- Required release-note updates: artifact://publication/gate-3-backup-restore-release-notes.md completed Gate 3 backup-restore release-note update evidence; Production-ready claim allowed by this drill: no/yes; Testnet production-candidate claim allowed by this drill: no/yes',
        '- Pending Evidence Register updated: yes',
        '- Required checklist updates: artifact://publication/gate-3-backup-restore-checklist.md completed Gate 3 backup-restore checklist update evidence; Production-ready claim allowed by this drill: no/yes; Testnet production-candidate claim allowed by this drill: no/yes',
        '- Production-ready claim allowed by this drill: no',
        '- Testnet production-candidate claim allowed by this drill: no',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must use exact Production-ready claim allowed by this drill: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required release-note updates must use exact Testnet production-candidate claim allowed by this drill: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must use exact Production-ready claim allowed by this drill: no',
    );
    expect(result.errors).toContain(
      'Publication Evidence: Required checklist updates must use exact Testnet production-candidate claim allowed by this drill: no',
    );
  });

  it('fails closed when testnet production-candidate drill claim evidence is missing', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      publication: publicationEvidence
        .split('\n')
        .filter(line => !line.startsWith('- Testnet production-candidate claim allowed by this drill:'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Evidence: Testnet production-candidate claim allowed by this drill is required',
    );
  });

  it('requires reviewer sign-off decisions', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: '| Restore operator | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Restore operator: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Restore operator: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Restore operator: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Restore operator: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Restore operator | reviewer-a | block | 2026-05-14 | restore mismatch blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: decision must be approve before backup-restore evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | May 14 2026 | restore evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Operator reviewer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the drill classification date', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-13 | restore evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: Date must not be before Drill Classification Date',
    );
  });

  it('requires restore operator sign-off to match the drill classification identity', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Restore operator | reviewer-b | approve | 2026-05-14 | restore evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: name must match Drill Classification Reviewer',
    );
  });

  it('requires reviewer notes to state concrete backup-restore outcomes', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed restore evidence |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete backup-restore outcome',
    );
  });

  it('rejects reviewer notes with contradictory backup-restore failure markers', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not include contradictory backup-restore failure markers',
    );
  });

  it('rejects reviewer notes that approve production-ready backup-restore claims', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | production-ready restore claim approved after backup-restore evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve production-ready claim wording',
    );
  });

  it('rejects reviewer notes that contain forbidden backup-restore claim wording', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | backup-restore evidence accepted; production-ready release wording observed |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | backup-restore evidence accepted; mainnet production release wording observed |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it('rejects reviewer notes that approve runtime state mutation', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | runtime state mutation approved after restore evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve runtime state mutation',
    );
  });

  it('rejects reviewer notes that enable runtime state mutation', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer enables runtime state mutation |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve runtime state mutation',
    );
  });

  it('rejects reviewer notes with active approval verbs before forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer supports unreviewed live runtime restore target |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer allows runtime state mutation |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer permits staged runtime backup artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unreviewed live/runtime restore target',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve runtime state mutation',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve staged runtime backup artifacts',
    );
  });

  it('rejects compatibility-normalized reviewer notes that approve forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 unreviewed live runtime restore target |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer \uFF41\uFF4C\uFF4C\uFF4F\uFF57\uFF53 runtime state mutation |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer \uFF50\uFF45\uFF52\uFF4D\uFF49\uFF54\uFF53 staged runtime backup artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unreviewed live/runtime restore target',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve runtime state mutation',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve staged runtime backup artifacts',
    );
  });

  it('rejects reviewer notes with grant-family approval terms before forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore completed; reviewer grants unreviewed live runtime restore target |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore completed; reviewer granted runtime state mutation |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore completed; reviewer grants staged runtime backup artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unreviewed live/runtime restore target',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve runtime state mutation',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve staged runtime backup artifacts',
    );
  });

  it('rejects reviewer notes with certification-family approval terms before forbidden restore boundaries', () => {
    const boundaryResult = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore completed; unreviewed live runtime restore target certified |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore completed; runtime state mutation recommended |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore completed; staged runtime backup artifacts accredited |',
        ),
    }));
    const mismatchResult = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Restore operator | reviewer-a | approve | 2026-05-14 | restore completed; unresolved restore mismatch endorsed |',
      ),
    }));

    expect(boundaryResult.status).toBe('BLOCKED');
    expect(boundaryResult.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unreviewed live/runtime restore target',
    );
    expect(boundaryResult.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve runtime state mutation',
    );
    expect(boundaryResult.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve staged runtime backup artifacts',
    );
    expect(mismatchResult.status).toBe('BLOCKED');
    expect(mismatchResult.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unresolved backup-restore mismatches',
    );
  });

  it('allows reviewer notes that explicitly deny runtime mutation and mismatch approval', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; unresolved restore mismatch not approved; reviewer approved without unresolved restore mismatch |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; runtime state mutation not approved; reviewer approved without runtime state mutation |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve absent forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer approved absence of unresolved restore mismatch |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer approved absent runtime state mutation |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; reviewer approved absence of staged runtime backup artifacts |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve lack of forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; lack of unresolved restore mismatch approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; lack of runtime state mutation approved by reviewer |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; lack of staged runtime backup artifacts approved by reviewer |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve absence of forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; absence of unresolved restore mismatch approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; absence of runtime state mutation approved by reviewer |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; absence of staged runtime backup artifacts approved by reviewer |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve lacking forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; lacking unresolved restore mismatch approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; lacking runtime state mutation approved by reviewer |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; lacking staged runtime backup artifacts approved by reviewer |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve evidence lacks forbidden restore boundaries', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; evidence lacks unresolved restore mismatch approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; evidence lacks runtime state mutation approved by reviewer |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; evidence lacks staged runtime backup artifacts approved by reviewer |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('rejects reviewer notes that approve unreviewed runtime restore targets or staged runtime backup artifacts', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows
        .replace(
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; approved unreviewed live runtime restore target |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; approved staged runtime backup artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unreviewed live/runtime restore target',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve staged runtime backup artifacts',
    );
  });

  it('accepts reviewer notes that explicitly deny staged runtime backup artifact approval', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | restore evidence accepted; ' +
          'staged runtime backup artifacts not approved; reviewer approved no staged runtime backup artifacts |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve staged runtime backup artifacts',
    );
  });

  it('rejects reviewer notes that approve unresolved backup-restore mismatches', () => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        '| Restore operator | reviewer-a | approve | 2026-05-14 | unresolved restore mismatch accepted for publication after backup-restore evidence review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not approve unresolved backup-restore mismatches',
    );
  });

  it.each([
    ['pending', 'unresolved restore mismatch pending reviewer follow-up'],
    ['awaiting', 'restore mismatch awaiting reviewer follow-up'],
    ['waiting', 'restore mismatch waiting for reviewer follow-up'],
    ['deferred', 'restore mismatch deferred reviewer follow-up'],
  ])('rejects reviewer notes that leave backup-restore mismatches unresolved: %s', (_label, mismatchNote) => {
    const result = validateBackupRestoreEvidence(backupRestoreEvidence({
      reviewers: reviewerRows.replace(
        '| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted |',
        `| Restore operator | reviewer-a | approve | 2026-05-14 | restore evidence accepted; ${mismatchNote} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Restore operator: notes must not leave unresolved backup-restore mismatches open',
    );
  });

  it('blocks missing tables without throwing', () => {
    const result = validateBackupRestoreEvidence('# Incomplete restore drill\n\n## Drill Classification\n\nNo table yet.\n');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('## Required Commands: table not found');
    expect(result.errors).toContain('## State Consistency Checks: table not found');
    expect(result.errors).toContain('## Reconstructibility Boundaries: table not found');
    expect(result.errors).toContain('## Stop Conditions: table not found');
    expect(result.errors).toContain('## Publication Evidence: missing required section');
    expect(result.errors).toContain('## Reviewer Sign-Off: table not found');
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function commandEvidence(step: string): string {
  const artifact = `artifact://restore/${slug(step)}.log`;
  if (step === 'Compare pre-backup and restored state') {
    return `${artifact} npm run backup:compare local snapshot comparison output; pre-backup snapshot ../evidence/recovery/pre-backup-snapshot.json; restored snapshot ../evidence/recovery/restored-snapshot.json; distinct pre-backup and restored JSON snapshot artifacts; restored snapshot generatedAt after pre-backup generatedAt; schemaVersion validation`;
  }
  if (step === 'Git hygiene scan') return gitHygieneEvidence;
  return artifact;
}

function stateRow(check: string): string {
  const value = stateValues.find(([candidate]) => candidate === check)?.[1];
  if (!value) throw new Error(`missing state fixture for ${check}`);
  return `| ${check} | ${value} | ${value} | ${stateEvidence(check)} | linked |`;
}

function stateRowWithValue(check: string, value: string): string {
  return `| ${check} | ${value} | ${value} | ${stateEvidenceWithValue(check, value)} | linked |`;
}

function stateRowsWithGenericSingletonOnly(): string {
  const explicitSingletonChecks = new Set([
    'DUP singleton digest comparison or incident classification',
    'SPV tracker singleton digest comparison or incident classification',
  ]);
  const nonSingletonRows = stateValues
    .filter(([check]) => !explicitSingletonChecks.has(check))
    .map(([check]) => stateRow(check));
  const genericSingletonRow =
    `| Singleton digest comparison or incident classification | singleton digest ${SINGLETON_DIGEST} matched | ` +
    `singleton digest ${SINGLETON_DIGEST} matched | artifact://restore/singleton-digest-comparison.log singleton digest comparison | linked |`;

  return [...nonSingletonRows, genericSingletonRow].join('\n');
}

function stateEvidence(check: string): string {
  const artifact = `artifact://restore/${slug(check)}.log`;
  const value = stateValues.find(([candidate]) => candidate === check)?.[1];
  if (!value) throw new Error(`missing state fixture for ${check}`);
  if (backupCompareStateChecks.has(check)) {
    return `${artifact} npm run backup:compare local snapshot comparison output; measured value ${value}`;
  }
  return `${artifact}; measured value ${value}`;
}

function stateEvidenceWithValue(check: string, value: string): string {
  const artifact = `artifact://restore/${slug(check)}.log`;
  if (backupCompareStateChecks.has(check)) {
    return `${artifact} npm run backup:compare local snapshot comparison output; measured value ${value}`;
  }
  return `${artifact}; measured value ${value}`;
}

function backupRestoreValidationTargetOnly(value: string): string {
  const target = value.match(/artifact:\/\/[^\s;),]+/)?.[0] ?? 'artifact://restore/completed-backup-restore-evidence.md';
  const withoutTargets = value.replace(/artifact:\/\/[^\s;),]+/g, '').replace(/\s+/g, ' ').trim();
  return `[backup-restore validation target](${target}) ${withoutTargets}`.trim();
}
