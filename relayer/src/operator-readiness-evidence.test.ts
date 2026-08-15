import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import {
  parseRunbookCoverageRows,
  validateOperatorReadinessEvidence,
} from './operator-readiness-evidence.js';

const runbookRows = [
  'Dry-run readiness',
  'Deployment and migration',
  'Broadcast enablement',
  'Daemon startup',
  'Settlement failure triage',
  'Reorg recovery',
  'Pause and resume',
  'Key rotation',
  'Storage-rent and liquidity maintenance',
  'Incident response',
  'Monitoring and alerting',
  'SQLite and AVL backup restore',
].map(runbook =>
  `| ${runbook} | operator followed stop conditions and verification commands | ` +
  `artifact://operator/runbooks/${slug(runbook)}.md stop-condition checks passed; verification-command checks captured | linked |`,
).join('\n');

const commandPurposes: Record<string, string> = {
  'npm run status': 'operator status snapshot for readiness and service health',
  'npm run demo:readiness': 'dry-run readiness check for signing and broadcast policy',
  'npm run release:gate': 'release-gate check expected blocked with zero structural issues until evidence is complete',
  'npm run backup:validate': 'backup restore validation for SQLite and AVL recovery evidence',
  'npm run governance:validate': 'committee governance and key-rotation evidence validation',
  'npm run check': 'clean-checkout build typecheck and test verification',
  'npm run wasm:test': 'WASM and Rust AVL proof test verification',
  'git status --short': 'Git hygiene worktree status and staged runtime artifact check',
};

const commandRows = [
  'npm run status',
  'npm run demo:readiness',
  'npm run release:gate',
  'npm run backup:validate',
  'npm run governance:validate',
  'npm run check',
  'npm run wasm:test',
  'git status --short',
].map(command =>
  `| ${command} | ${commandPurposes[command]} | artifact://operator/commands/${slug(command)}.log; ${command} command output PASS exit code 0 | linked |`,
).join('\n');

const drillRows = [
  'Broadcast disabled by default',
  'Daemon refuses unsafe live settlement',
  'Failed settlement triage',
  'Reorg recovery',
  'Pause and resume',
  'SQLite and AVL backup restore',
  'Storage-rent and liquidity alert',
  'Incident response record',
  'Key rotation and member loss',
].map(drill => `| ${drill} | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/${slug(drill)}.md | linked |`).join('\n');

const decisionRows = [
  'External operator can find every runbook',
  'Stop conditions are executable',
  'Monitoring signals are actionable',
  'Incident escalation is actionable',
  'Backup restore evidence is linked',
  'Governance rotation evidence is linked',
  'Broadcast enablement remains opt-in',
].map(decision => `| ${decision} | artifact://operator/decisions/${slug(decision)}.md | stop release if reviewer cannot reproduce | linked |`).join('\n');

const reviewerRows = [
  ['Runbook operator', 'operator readiness decision confirmed: external operator can find every runbook'],
  ['Security reviewer', 'operator readiness decision confirmed: stop conditions are executable'],
  ['Release owner', 'operator readiness decision confirmed: broadcast enablement remains opt-in'],
].map(([role, notes]) => `| ${role} | reviewer-a | approve | 2026-05-14 | ${notes} |`).join('\n');

function operatorEvidence(overrides: {
  releaseLevel?: string;
  environment?: string;
  broadcastMode?: string;
  releaseSupported?: string;
  productionClaimAllowed?: string;
  testnetProductionCandidateClaimAllowed?: string;
  operatorClaimAllowed?: string;
  criticalIncidentsOpen?: string;
  releaseNotesUpdated?: string;
  releaseNoteUpdates?: string;
  checklistUpdates?: string;
  reviewerDecisionSummary?: string;
  runbooks?: string;
  commands?: string;
  drills?: string;
  decisions?: string;
  reviewers?: string;
} = {}): string {
  const operatorClaimAllowed = overrides.operatorClaimAllowed ?? 'yes';
  const releaseSupported = overrides.releaseSupported ?? 'institutional reference';
  const testnetProductionCandidateClaimAllowed = overrides.testnetProductionCandidateClaimAllowed ?? 'no';
  const publicationUpdateBindings = [
    ...(releaseSupported === 'production deployment candidate'
      ? ['Release supported = production deployment candidate']
      : []),
    ...(operatorClaimAllowed === 'yes' ? ['Operator-ready claim allowed = yes'] : []),
    ...(overrides.productionClaimAllowed !== 'yes' ? ['Production-ready claim allowed = no'] : []),
    `Testnet production-candidate claim allowed = ${testnetProductionCandidateClaimAllowed}`,
  ];
  const defaultReleaseNoteUpdates = [
    'artifact://operator/completed-operator-readiness-release-note-update-evidence.md',
    ...publicationUpdateBindings,
  ].join('; ');
  const defaultChecklistUpdates = [
    'artifact://operator/completed-operator-readiness-checklist-update-evidence.md',
    ...publicationUpdateBindings,
  ].join('; ');

  return `
# Completed Operator Readiness Evidence

## Readiness Classification

| Field | Value |
|---|---|
| Readiness name | gate 6 operator readiness |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Environment | ${overrides.environment ?? 'staging'} |
| Broadcast mode | ${overrides.broadcastMode ?? 'dry-run'} |
| Operator type | external operator |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Runbook Coverage

| Runbook | Required check | Evidence | Status |
|---|---|---|---|
${overrides.runbooks ?? runbookRows}

## Required Commands

| Command | Purpose | Evidence | Status |
|---|---|---|---|
${overrides.commands ?? commandRows}

## Incident And Recovery Drills

| Drill | Expected outcome | Evidence | Status |
|---|---|---|---|
${overrides.drills ?? drillRows}

## Operational Decisions

| Decision | Required evidence | Stop condition | Status |
|---|---|---|---|
${overrides.decisions ?? decisionRows}

## Publication Decision

| Field | Value |
|---|---|
| Release supported | ${releaseSupported} |
| Production-ready claim allowed | ${overrides.productionClaimAllowed ?? 'no'} |
| Testnet production-candidate claim allowed | ${testnetProductionCandidateClaimAllowed} |
| Operator-ready claim allowed | ${operatorClaimAllowed} |
| Critical incidents open | ${overrides.criticalIncidentsOpen ?? '0'} |
| Release notes updated | ${overrides.releaseNotesUpdated ?? 'yes'} |
| Required release-note updates | ${overrides.releaseNoteUpdates ?? defaultReleaseNoteUpdates} |
| Required checklist updates | ${overrides.checklistUpdates ?? defaultChecklistUpdates} |
| Reviewer decision summary | ${overrides.reviewerDecisionSummary ?? 'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical incidents open = 0'} |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('operator readiness evidence validation', () => {
  it('parses runbook coverage rows', () => {
    const rows = parseRunbookCoverageRows(operatorEvidence());

    expect(rows[0]).toMatchObject({
      runbook: 'Dry-run readiness',
      status: 'linked',
    });
  });

  it('passes when every operator evidence row is structured and linked', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence());

    expect(result.status).toBe('PASS');
    expect(result.classification).toMatchObject({
      readinessName: 'gate 6 operator readiness',
      gitCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      environment: 'staging',
      broadcastMode: 'dry-run',
      operatorType: 'external operator',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.runbookRows).toHaveLength(12);
    expect(result.commandRows).toHaveLength(8);
    expect(result.drillRows).toHaveLength(9);
  });

  it('prints operator claim and release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-operator-readiness-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run operator:validate');
    expect(result.stdout).toContain('completed Operator Readiness Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --operator-readiness-evidence');
    expect(result.stdout).toContain('operator readiness validation target');
    expect(result.stdout).toContain('command-specific operator command evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('A standalone PASS does not authorize public claims');
    expect(result.stdout).toContain('Operator-ready or testnet production-candidate wording requires release:gate PASS');
    expect(result.stdout).toContain('Structural issues = 0');
    expect(result.stdout).toContain('Release supported = production deployment candidate');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed = yes');
    expect(result.stdout).toContain('Operator-ready claim allowed = yes');
    expect(result.stdout).toContain('Critical incidents open = 0');
    expect(result.stdout).toContain('Release notes updated = yes');
    expect(result.stdout).not.toContain('zero structural issues');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('requires operator readiness dates to use ISO calendar format', () => {
    const result = validateOperatorReadinessEvidence(
      operatorEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Readiness Classification: Date must use YYYY-MM-DD');
  });

  it('requires operator readiness Git commits to use commit SHA format', () => {
    const result = validateOperatorReadinessEvidence(
      operatorEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Readiness Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('blocks enabled broadcast mode for operator readiness evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({ broadcastMode: 'enabled' }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Readiness Classification: Broadcast mode must be disabled or dry-run before Gate 6 operator readiness evidence can pass',
    );
  });

  it('requires production deployment candidate operator readiness to be testnet-scoped', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Readiness Classification: production deployment candidate requires Environment testnet',
    );
  });

  it('requires production deployment candidate operator publication support to be testnet-scoped', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
      releaseSupported: 'production deployment candidate',
      productionClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'yes',
      operatorClaimAllowed: 'yes',
      criticalIncidentsOpen: '0',
      reviewerDecisionSummary:
        'release supported for production deployment candidate; operator-ready claim allowed; production-ready claim blocked; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Readiness Classification Environment = testnet',
    );
  });

  it('rejects duplicate readiness classification and publication decision fields', () => {
    const result = validateOperatorReadinessEvidence(
      operatorEvidence()
        .replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |')
        .replace('| Release supported | institutional reference |', '| Release supported | institutional reference |\n| Release supported | validated PoC |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Readiness Classification: Git commit: duplicate required field');
    expect(result.errors).toContain('Publication Decision: Release supported: duplicate required field');
  });

  it('blocks the blank template shape', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: '| Dry-run readiness | | | pending / linked / blocker |',
      commands: '| npm run status | | | pending / linked / blocker |',
      drills: '| Broadcast disabled by default | | | pending / linked / blocker |',
      decisions: '| External operator can find every runbook | | | pending / linked / blocker |',
      reviewers: '| Runbook operator | | approve / block | | |',
      releaseSupported: 'none',
      operatorClaimAllowed: 'yes',
      criticalIncidentsOpen: 'yes',
      releaseNotesUpdated: 'no',
      releaseNoteUpdates: '',
      checklistUpdates: '',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Runbook Coverage: Deployment and migration: missing required row');
    expect(result.errors).toContain('Required Commands: npm run demo:readiness: missing required row');
    expect(result.errors).toContain('Incident And Recovery Drills: Daemon refuses unsafe live settlement: missing required row');
    expect(result.errors).toContain('Operational Decisions: Stop conditions are executable: missing required row');
    expect(result.errors).toContain('Publication Decision: operator-ready claim requires a supported release level');
    expect(result.errors).toContain('Publication Decision: Critical incidents open must be 0');
    expect(result.errors).toContain('Publication Decision: Release notes updated must be yes before operator readiness can pass');
    expect(result.errors).toContain('Reviewer Sign-Off: Runbook operator: name is required');
  });

  it('requires critical incidents open to be the exact numeric zero', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      criticalIncidentsOpen: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: Critical incidents open must be 0');
  });

  it('rejects duplicate required operator-readiness rows', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: `${runbookRows}\n| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/dry-run-second.md | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Runbook Coverage: Dry-run readiness: duplicate required row');
  });

  it('requires linked command evidence markers', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | check passed locally | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm run check: linked status requires an evidence marker');
  });

  it('requires linked command purpose to match the command boundary', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        `| npm run demo:readiness | ${commandPurposes['npm run demo:readiness']} | artifact://operator/commands/npm-run-demo-readiness.log; npm run demo:readiness command output PASS exit code 0 | linked |`,
        '| npm run demo:readiness | mainnet broadcast approval | artifact://operator/commands/npm-run-demo-readiness.log; npm run demo:readiness command output PASS exit code 0 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run demo:readiness: purpose must identify readiness, dry-run, signing, or broadcast-policy boundary and must not approve mainnet, production-ready, release, publication, or broadcast enablement',
    );
  });

  it('requires command evidence to identify each command output', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows
        .replace(
          'artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0',
          'artifact://operator/commands/reviewed.log; generic command output PASS exit code 0',
        )
        .replace(
          'artifact://operator/commands/git-status-short.log; git status --short command output PASS exit code 0',
          'artifact://operator/commands/reviewed.log; generic command output PASS exit code 0',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm run check: evidence must identify npm run check output');
    expect(result.errors).toContain('Required Commands: git status --short: evidence must identify git status --short output');
  });

  it('requires linked command evidence to include explicit exit code 0 output', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence command output must include exit code 0',
    );
  });

  it('rejects linked command evidence that keeps an exit-code placeholder', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0/1 | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence command output must include exit code 0',
    );
  });

  it('rejects contradictory PASS command-output evidence for linked operator commands', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive operator command output',
    );
  });

  it('rejects contradictory linked operator row evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/dry-run-readiness.md FAIL exit code 1',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/reorg-recovery.md ERROR validation failed',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md BLOCKED with 1 structural issue',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: required evidence must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects linked operator-readiness evidence with compatibility-normalized failure markers', () => {
    const normalizedFailure = 'command output: PASS exit code 0 validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        `artifact://operator/runbooks/dry-run-readiness.md ${normalizedFailure}`,
      ),
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0; validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue | linked |`,
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        `artifact://operator/drills/reorg-recovery.md ${normalizedFailure}`,
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        `artifact://operator/decisions/external-operator-can-find-every-runbook.md ${normalizedFailure}`,
      ),
      releaseNoteUpdates:
        `artifact://operator/completed-operator-readiness-release-note-update-evidence.md; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; ${normalizedFailure}`,
      checklistUpdates:
        `artifact://operator/completed-operator-readiness-checklist-update-evidence.md; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; ${normalizedFailure}`,
      reviewers: reviewerRows.replace(
        'operator readiness decision confirmed: stop conditions are executable',
        `operator readiness decision confirmed: stop conditions are executable; ${normalizedFailure}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: required evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects linked operator-readiness evidence with structured failure fields', () => {
    const emptyStructuredFields = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0; {"errors":[]} errorCount: 0 | linked |`,
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/dry-run-readiness.md {"errors":["runbook gap"]}',
      ),
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0; errorCount: 1 | linked |`,
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/reorg-recovery.md {"failures":{"reorg":"blocked"}}',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md failureTotal: 1',
      ),
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md completed operator readiness release-note update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0; {"errors":["release-note gap"]}',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md completed operator readiness checklist update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0; {"failures":{"checklist":"blocked"}}',
      reviewers: reviewerRows.replace(
        'operator readiness decision confirmed: stop conditions are executable',
        'operator readiness decision confirmed: stop conditions are executable; errorCount: 1',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive operator command output',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: required evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects linked operator-readiness evidence with remaining issue markers', () => {
    const remainingIssues = 'command output: PASS exit code 0; Remaining issues: follow-up item pending';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        `artifact://operator/runbooks/dry-run-readiness.md ${remainingIssues}`,
      ),
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0; Remaining issues: follow-up item pending | linked |`,
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        `artifact://operator/drills/reorg-recovery.md ${remainingIssues}`,
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        `artifact://operator/decisions/external-operator-can-find-every-runbook.md ${remainingIssues}`,
      ),
      releaseNoteUpdates:
        `artifact://operator/completed-operator-readiness-release-note-update-evidence.md completed operator readiness release-note update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0; ${remainingIssues}`,
      checklistUpdates:
        `artifact://operator/completed-operator-readiness-checklist-update-evidence.md completed operator readiness checklist update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0; ${remainingIssues}`,
      reviewers: reviewerRows.replace(
        'operator readiness decision confirmed: stop conditions are executable',
        `operator readiness decision confirmed: stop conditions are executable; ${remainingIssues}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: required evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects linked operator-readiness evidence with open or known issue markers', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/dry-run-readiness.md command output: PASS exit code 0; Open issues: unresolved runbook blocker',
      ),
      commands: commandRows.replace(
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0 | linked |`,
        `| npm run check | ${commandPurposes['npm run check']} | artifact://operator/commands/npm-run-check.log; npm run check command output PASS exit code 0; Known issues: unresolved command blocker | linked |`,
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/reorg-recovery.md command output: PASS exit code 0; Open issues: unresolved drill blocker',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md command output: PASS exit code 0; Known issues: unresolved decision blocker',
      ),
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md completed operator readiness release-note update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0; Open issues: unresolved release-note blocker',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md completed operator readiness checklist update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0; Known issues: unresolved checklist blocker',
      reviewers: reviewerRows.replace(
        'operator readiness decision confirmed: stop conditions are executable',
        'operator readiness decision confirmed: stop conditions are executable; Open issues: unresolved reviewer blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: required evidence must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects linked required command evidence without a completed target', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-check.log',
        'npm run check command output: PASS',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed command artifact or non-template evidence link',
    );
  });

  it('rejects linked operator rows that only point to templates or bare validator commands', () => {
    const templateOnlyEvidence = '[Operator Readiness Evidence Template](operator-readiness-evidence-template.md), `npm run operator:validate`';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        '| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured | linked |',
        `| Dry-run readiness | operator followed stop conditions and verification commands | ${templateOnlyEvidence} | linked |`,
      ),
      commands: commandRows.replace(
        `| npm run status | ${commandPurposes['npm run status']} | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0 | linked |`,
        `| npm run status | ${commandPurposes['npm run status']} | ${templateOnlyEvidence} | linked |`,
      ),
      drills: drillRows.replace(
        '| Reorg recovery | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/reorg-recovery.md | linked |',
        `| Reorg recovery | operator confirms recovery or opens incident if unresolved | ${templateOnlyEvidence} | linked |`,
      ),
      decisions: decisionRows.replace(
        '| External operator can find every runbook | artifact://operator/decisions/external-operator-can-find-every-runbook.md | stop release if reviewer cannot reproduce | linked |',
        `| External operator can find every runbook | ${templateOnlyEvidence} | stop release if reviewer cannot reproduce | linked |`,
      ),
      releaseNoteUpdates: templateOnlyEvidence,
      checklistUpdates: templateOnlyEvidence,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects targetless command-output notes for linked operator evidence rows', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'npm run operator:validate command output: PASS; dry-run readiness runbook followed',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'npm run operator:validate command output: PASS; reorg recovery drill completed',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'npm run operator:validate command output: PASS; external operator can find every runbook',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects targetless command-output notes for operator publication update evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'completed operator readiness release-note update evidence: npm run operator:validate command output: PASS',
      checklistUpdates:
        'completed operator readiness checklist update evidence: npm run operator:validate command output: PASS',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects operator publication update evidence kinds hidden inside longer labels', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'artifact://operator/release-notes-update.md draft completed operator readiness release-note update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no',
      checklistUpdates:
        'artifact://operator/checklist-update.md candidate completed operator readiness checklist update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed operator-readiness release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must identify completed operator-readiness checklist update evidence',
    );
  });

  it('accepts compatibility-normalized operator publication update evidence kinds', () => {
    const operatorLabel = '\uFF4F\uFF50\uFF45\uFF52\uFF41\uFF54\uFF4F\uFF52';
    const readinessLabel = '\uFF52\uFF45\uFF41\uFF44\uFF49\uFF4E\uFF45\uFF53\uFF53';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        `artifact://operator/completed-release-note-update.md completed ${operatorLabel} ${readinessLabel} release-note update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no`,
      checklistUpdates:
        `artifact://operator/completed-checklist-update.md completed ${operatorLabel} ${readinessLabel} checklist update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects validator target bindings as linked operator row evidence', () => {
    const validationTargetEvidence =
      '[operator readiness validation target](artifact://operator/completed-operator-readiness-evidence.md)';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        `${validationTargetEvidence} dry-run readiness runbook stop conditions and verification commands`,
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        `${validationTargetEvidence} npm run status command output PASS exit code 0`,
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        `${validationTargetEvidence} reorg recovery drill recovered and reconciled`,
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        `${validationTargetEvidence} external operator can find every runbook evidence`,
      ),
      releaseNoteUpdates:
        '[operator readiness validation target](artifact://operator/completed-operator-readiness-release-note-update-evidence.md) completed operator readiness release-note update evidence',
      checklistUpdates:
        '[operator readiness validation target](artifact://operator/completed-operator-readiness-checklist-update-evidence.md) completed operator readiness checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('accepts concrete operator evidence before validation-target bindings', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured',
        'artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured; operator readiness validation target artifact://operator/validation/dry-run-readiness-input.md',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0',
        'artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0; operator readiness validation target artifact://operator/validation/npm-run-status-input.md',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/reorg-recovery.md; operator readiness validation target artifact://operator/validation/reorg-recovery-input.md',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md; operator readiness validation target artifact://operator/validation/external-operator-runbook-input.md',
      ),
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md completed operator readiness release-note update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; operator readiness validation target artifact://operator/validation/release-note-input.md',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md completed operator readiness checklist update evidence; Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; operator readiness validation target artifact://operator/validation/checklist-input.md',
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects targetless artifact markers for linked operator evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact:// completed dry-run readiness runbook evidence',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        'artifact://',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact:// ',
      ),
      releaseNoteUpdates: 'artifact:// completed operator readiness release-note update evidence',
      checklistUpdates: 'artifact:// completed operator readiness checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects runbook evidence that omits stop-condition and verification-command checks', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        '| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured | linked |',
        '| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/dry-run-readiness.md completed dry-run readiness runbook evidence | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must state stop-condition and verification-command checks',
    );
  });

  it('rejects row-named generic artifact targets for linked operator evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/generic-dry-run-readiness.md',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        'artifact://operator/commands/generic-npm-run-status.log',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/generic-reorg-recovery.md',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/generic-external-operator-can-find-every-runbook.md',
      ),
      releaseNoteUpdates:
        'completed operator readiness release-note update evidence artifact://operator/generic-completed-operator-readiness-release-note-update-evidence.md',
      checklistUpdates:
        'completed operator readiness checklist update evidence artifact://operator/generic-completed-operator-readiness-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects row-named sample operator artifact targets for linked operator evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/sample-operator-runbook-dry-run-readiness.md',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        'artifact://operator/commands/sample-readiness-command-npm-run-status.log',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/sample-operator-drill-reorg-recovery.md',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/sample-operator-decision-external-operator-can-find-every-runbook.md',
      ),
      releaseNoteUpdates:
        'completed operator readiness release-note update evidence artifact://operator/sample-release-note-update-completed-operator-readiness-release-note-update-evidence.md',
      checklistUpdates:
        'completed operator readiness checklist update evidence artifact://operator/sample-checklist-update-completed-operator-readiness-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for linked operator evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/dry-run-readiness-mainnet-production-certified.md',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        'artifact://operator/commands/npm-run-status-testnet-production-candidate-approval.log',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/reorg-recovery-mainnet-production-certified.md',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/external-operator-can-find-every-runbook-production-ready-approval.md',
      ),
      releaseNoteUpdates:
        'completed operator readiness release-note update evidence artifact://operator/completed-operator-readiness-release-note-update-evidence-mainnet-production-certified.md',
      checklistUpdates:
        'completed operator readiness checklist update evidence artifact://operator/completed-operator-readiness-checklist-update-evidence-production-ready-approval.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete artifact targets for linked operator evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/placeholder-dry-run-readiness.md',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        'artifact://operator/commands/todo-npm-run-status.log',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        'artifact://operator/drills/tbd-reorg-recovery.md',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/sample-evidence-external-operator-can-find-every-runbook.md',
      ),
      releaseNoteUpdates:
        'completed operator readiness release-note update evidence artifact://operator/example-evidence-completed-operator-readiness-release-note-update-evidence.md',
      checklistUpdates:
        'completed operator readiness checklist update evidence artifact://operator/placeholder-completed-operator-readiness-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete Markdown targets for linked operator evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        '[placeholder runbook evidence](docs/placeholder-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
      ),
      commands: commandRows.replace(
        'artifact://operator/commands/npm-run-status.log',
        '[todo command evidence](docs/todo-npm-run-status.log) npm run status command output exit code 0',
      ),
      drills: drillRows.replace(
        'artifact://operator/drills/reorg-recovery.md',
        '[tbd drill evidence](docs/tbd-reorg-recovery.md) reorg recovery drill recovered and reconciled',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        '[sample decision evidence](docs/sample-evidence-external-operator-can-find-every-runbook.md) external operator can find every runbook evidence',
      ),
      releaseNoteUpdates:
        '[example release-note evidence](docs/example-evidence-completed-operator-readiness-release-note-update-evidence.md) completed operator readiness release-note update evidence',
      checklistUpdates:
        '[generic checklist evidence](docs/generic-completed-operator-readiness-checklist-update-evidence.md) completed operator readiness checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each([
    'artifact://operator/runbooks/fixture-dry-run-readiness.md',
    'artifact://operator/runbooks/mock-dry-run-readiness.md',
    'artifact://operator/runbooks/dummy-dry-run-readiness.md',
    'artifact://operator/runbooks/fake-dry-run-readiness.md',
    'artifact://operator/runbooks/stub-dry-run-readiness.md',
    'artifact://operator/runbooks/testdata-dry-run-readiness.md',
    'artifact://operator/runbooks/synthetic-dry-run-readiness.md',
    'artifact://operator/runbooks/simulated-dry-run-readiness.md',
  ])('rejects fixture-style artifact marker %s for linked operator rows', artifactTarget => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        artifactTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    '[fixture](artifact://operator/runbooks/fixture-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[mock](artifact://operator/runbooks/mock-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[dummy](artifact://operator/runbooks/dummy-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[fake](artifact://operator/runbooks/fake-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[stub](artifact://operator/runbooks/stub-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[testdata](artifact://operator/runbooks/testdata-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[synthetic](artifact://operator/runbooks/synthetic-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
    '[simulated](artifact://operator/runbooks/simulated-dry-run-readiness.md) dry-run readiness runbook stop-condition checks passed; verification-command checks captured',
  ])('rejects fixture-style Markdown artifact link %s for linked operator rows', markdownTarget => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        markdownTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    {
      variant: 'raw',
      runbookTarget: ['', 'tmp', 'dry-run-readiness.md'].join('/'),
      commandTarget: ['file:', '', '', 'C:', 'tmp', 'npm-run-status.log'].join('/'),
      drillTarget: ['', '', 'operator-share', 'reorg-recovery.md'].join('/'),
      decisionTarget: ['', 'home', 'operator', 'external-runbook.md'].join('/'),
      releaseNoteTarget: ['', 'var', 'operator', 'completed-operator-readiness-release-note-update-evidence.md'].join('/'),
      checklistTarget: ['file:', '', '', 'C:', 'operator', 'completed-operator-readiness-checklist-update-evidence.md'].join('/'),
    },
    {
      variant: 'encoded',
      runbookTarget: '%2Ftmp%2Fdry-run-readiness.md',
      commandTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fnpm-run-status.log',
      drillTarget: '%2F%2Foperator-share%2Freorg-recovery.md',
      decisionTarget: '%2Fhome%2Foperator%2Fexternal-runbook.md',
      releaseNoteTarget: '%2Fvar%2Foperator%2Fcompleted-operator-readiness-release-note-update-evidence.md',
      checklistTarget: 'file%3A%2F%2F%2FC%3A%2Foperator%2Fcompleted-operator-readiness-checklist-update-evidence.md',
    },
    {
      variant: 'embedded encoded',
      runbookTarget: 'artifact://operator/sourceTarget=%2Ftmp%2Fdry-run-readiness.md',
      commandTarget: 'artifact://operator/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fnpm-run-status.log',
      drillTarget: 'artifact://operator/sourceTarget=%2F%2Foperator-share%2Freorg-recovery.md',
      decisionTarget: 'artifact://operator/sourceTarget=%2Fhome%2Foperator%2Fexternal-runbook.md',
      releaseNoteTarget:
        'artifact://operator/sourceTarget=%2Fvar%2Foperator%2Fcompleted-operator-readiness-release-note-update-evidence.md',
      checklistTarget:
        'artifact://operator/sourceTarget=file%3A%2F%2F%2FC%3A%2Foperator%2Fcompleted-operator-readiness-checklist-update-evidence.md',
    },
  ])(
    'rejects $variant local-only Markdown targets for linked operator evidence',
    ({
      runbookTarget,
      commandTarget,
      drillTarget,
      decisionTarget,
      releaseNoteTarget,
      checklistTarget,
    }) => {
      const result = validateOperatorReadinessEvidence(operatorEvidence({
        runbooks: runbookRows.replace(
          'artifact://operator/runbooks/dry-run-readiness.md',
          `[runbook evidence](${runbookTarget}) dry-run readiness runbook stop-condition checks passed; verification-command checks captured`,
        ),
        commands: commandRows.replace(
          'artifact://operator/commands/npm-run-status.log',
          `[command evidence](${commandTarget}) npm run status command output exit code 0`,
        ),
        drills: drillRows.replace(
          'artifact://operator/drills/reorg-recovery.md',
          `[drill evidence](${drillTarget}) reorg recovery drill recovered and reconciled`,
        ),
        decisions: decisionRows.replace(
          'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
          `[decision evidence](${decisionTarget}) external operator can find every runbook evidence`,
        ),
        releaseNoteUpdates:
          `[release-note evidence](${releaseNoteTarget}) completed operator readiness release-note update evidence`,
        checklistUpdates:
          `[checklist evidence](${checklistTarget}) completed operator readiness checklist update evidence`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Required Commands: npm run status: linked status requires a completed command artifact or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Incident And Recovery Drills: Reorg recovery: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Operational Decisions: External operator can find every runbook: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('rejects sensitive or runtime Markdown targets for linked operator evidence', () => {
    for (const target of [
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const result = validateOperatorReadinessEvidence(operatorEvidence({
        runbooks: runbookRows.replace(
          'artifact://operator/runbooks/dry-run-readiness.md',
          `[runbook evidence](${target}) dry-run readiness runbook stop-condition checks passed; verification-command checks captured`,
        ),
      }));

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Runbook Coverage: Dry-run readiness: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker',
      );
    }
  });

  it('accepts concrete operator artifact names that mention sample size or template removal', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/dry-run-readiness.md',
        'artifact://operator/runbooks/sample-size-analysis-dry-run-readiness.md',
      ),
      decisions: decisionRows.replace(
        'artifact://operator/decisions/external-operator-can-find-every-runbook.md',
        'artifact://operator/decisions/template-removal-audit-external-operator-can-find-every-runbook.md',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires operator-readiness-specific checklist and release-note update evidence', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates: 'artifact://operator/release-notes-gate-6.md',
      checklistUpdates: 'artifact://operator/release-checklist-gate-6.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed operator-readiness release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must identify completed operator-readiness checklist update evidence',
    );
  });

  it('rejects contradictory operator-readiness publication update evidence', () => {
    const contradictoryEvidence = 'operator readiness validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        `artifact://operator/completed-operator-readiness-release-note-update-evidence.md ${contradictoryEvidence}`,
      checklistUpdates:
        `artifact://operator/completed-operator-readiness-checklist-update-evidence.md ${contradictoryEvidence}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects operator-readiness publication updates that approve mainnet or production-ready claims', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md approves mainnet production operator deployment wording',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md approves production-ready operator claim wording',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('rejects operator-readiness publication updates that close incidents with textual zero-like terms', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md critical incidents open none',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md no open critical incidents',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical incidents open = 0; textual or shorthand critical incident terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Critical incidents open = 0; textual or shorthand critical incident terms are not accepted',
    );
  });

  it('rejects operator-readiness publication updates that close incidents with numeric shorthand', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md critical incident closure 0',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md critical incident count 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical incidents open = 0; textual or shorthand critical incident terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Critical incidents open = 0; textual or shorthand critical incident terms are not accepted',
    );
  });

  it('accepts exact critical incident closure bindings in publication updates', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical incidents open = 0',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact operator and testnet claim bindings in publication updates', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md Critical incidents open = 0',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md Critical incidents open = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Operator-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Operator-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in publication updates', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md Operator-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-ready claim denial in publication updates', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md Operator-ready claim allowed = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical incidents open = 0',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md Operator-ready claim allowed = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical incidents open = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact release support in production-candidate operator publication updates', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md Operator-ready claim allowed = yes; Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md Operator-ready claim allowed = yes; Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
  });

  it('rejects operator-readiness publication updates and reviewer summaries that keep decision placeholders', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      releaseNoteUpdates:
        'artifact://operator/completed-operator-readiness-release-note-update-evidence.md; Release supported = production deployment candidate/institutional reference; Operator-ready claim allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Critical incidents open = 0/1',
      checklistUpdates:
        'artifact://operator/completed-operator-readiness-checklist-update-evidence.md; Release supported = production deployment candidate/institutional reference; Operator-ready claim allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Critical incidents open = 0/1',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate/institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes/no; production-ready claim handling: Production-ready claim allowed = no/yes; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes/no; Critical incidents open = 0/1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Operator-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Operator-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Operator-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical incidents open = 0',
    );
  });

  it('rejects contradictory exact operator-readiness decision bindings in publication updates and reviewer summaries', () => {
    const contradictoryBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Operator-ready claim allowed = yes; Production-ready claim allowed = no; ' +
      'Testnet production-candidate claim allowed = yes; Critical incidents open = 0';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      releaseNoteUpdates:
        `artifact://operator/completed-operator-readiness-release-note-update-evidence.md ${contradictoryBindings}`,
      checklistUpdates:
        `artifact://operator/completed-operator-readiness-checklist-update-evidence.md ${contradictoryBindings}`,
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Release supported = institutional reference; ' +
        'operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
        'Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory operator-readiness decision bindings',
    );
  });

  it('rejects operator-readiness publication updates that reuse one completed evidence target', () => {
    const reusedPublicationUpdateTarget =
      'artifact://operator/completed-operator-readiness-publication-update-evidence.md';
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseNoteUpdates:
        `${reusedPublicationUpdateTarget} completed operator readiness release-note update evidence`,
      checklistUpdates:
        `${reusedPublicationUpdateTarget} completed operator readiness checklist update evidence`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed operator-readiness evidence targets',
    );
  });

  it('requires incident drill outcomes and linked artifacts', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      drills: drillRows.replace(
        '| Reorg recovery | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/reorg-recovery.md | linked |',
        '| Reorg recovery | | recovery notes | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Incident And Recovery Drills: Reorg recovery: expected outcome is required');
    expect(result.errors).toContain('Incident And Recovery Drills: Reorg recovery: linked status requires an evidence marker');
  });

  it('requires linked runbook checks to cover stop conditions and verification commands', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        '| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured | linked |',
        '| Dry-run readiness | operator reviewed the runbook | artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: linked status requires stop-condition and verification-command checks',
    );
  });

  it('requires runbook evidence to cite the covered runbook', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows
        .replace(
          '| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/dry-run-readiness.md stop-condition checks passed; verification-command checks captured | linked |',
          '| Dry-run readiness | operator followed stop conditions and verification commands | artifact://operator/runbooks/reviewed.md stop-condition checks passed; verification-command checks captured | linked |',
        )
        .replace(
          '| SQLite and AVL backup restore | operator followed stop conditions and verification commands | artifact://operator/runbooks/sqlite-and-avl-backup-restore.md stop-condition checks passed; verification-command checks captured | linked |',
          '| SQLite and AVL backup restore | operator followed stop conditions and verification commands | artifact://operator/runbooks/reviewed.md stop-condition checks passed; verification-command checks captured | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Dry-run readiness: evidence must identify dry-run readiness coverage',
    );
    expect(result.errors).toContain(
      'Runbook Coverage: SQLite and AVL backup restore: evidence must identify SQLite/AVL backup restore coverage',
    );
  });

  it('requires linked incident drill outcomes to be actionable', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      drills: drillRows.replace(
        '| Reorg recovery | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/reorg-recovery.md | linked |',
        '| Reorg recovery | operator reviewed the drill | artifact://operator/drills/reorg-recovery.md | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Reorg recovery: linked status requires an actionable recovery outcome',
    );
  });

  it('requires operational decisions to include stop conditions', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      decisions: decisionRows.replace(
        '| Monitoring signals are actionable | artifact://operator/decisions/monitoring-signals-are-actionable.md | stop release if reviewer cannot reproduce | linked |',
        '| Monitoring signals are actionable | artifact://operator/decisions/monitoring-signals-are-actionable.md | | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Operational Decisions: Monitoring signals are actionable: stop condition is required');
  });

  it('requires operational decision evidence to identify each decision category', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      decisions: decisionRows
        .replace(
          'artifact://operator/decisions/monitoring-signals-are-actionable.md',
          'artifact://operator/decisions/reviewed.md',
        )
        .replace(
          'artifact://operator/decisions/broadcast-enablement-remains-opt-in.md',
          'artifact://operator/decisions/reviewed.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operational Decisions: Monitoring signals are actionable: evidence must identify actionable monitoring signals',
    );
    expect(result.errors).toContain(
      'Operational Decisions: Broadcast enablement remains opt-in: evidence must identify broadcast opt-in evidence',
    );
  });

  it('requires linked operational decisions to include actionable stop conditions', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      decisions: decisionRows.replace(
        '| Monitoring signals are actionable | artifact://operator/decisions/monitoring-signals-are-actionable.md | stop release if reviewer cannot reproduce | linked |',
        '| Monitoring signals are actionable | artifact://operator/decisions/monitoring-signals-are-actionable.md | reviewer can reproduce | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operational Decisions: Monitoring signals are actionable: linked status requires an actionable stop condition',
    );
  });

  it('blocks completed operator readiness evidence that supports no release level', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseSupported: 'none',
      operatorClaimAllowed: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not be none before operator readiness can pass',
    );
  });

  it('blocks release support above the operator-readiness release level', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'validated PoC',
      releaseSupported: 'institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not exceed Readiness Classification release level',
    );
  });

  it('requires production-candidate operator readiness to carry exact release support', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate operator readiness requires exact Release supported = production deployment candidate',
    );
  });

  it('blocks production-ready claims below production deployment candidate level', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      productionClaimAllowed: 'yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production-ready claim requires production deployment candidate support',
    );
  });

  it('always blocks mainnet production-ready claims even at candidate release level', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      productionClaimAllowed: 'yes',
      operatorClaimAllowed: 'yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden',
    );
  });

  it('validates the separate testnet production-candidate claim field', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      testnetProductionCandidateClaimAllowed: 'maybe',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Testnet production-candidate claim allowed must be one of yes, no',
    );
  });

  it('blocks production-ready claims when operator-ready claims are not allowed', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseSupported: 'production deployment candidate',
      productionClaimAllowed: 'yes',
      operatorClaimAllowed: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production-ready claim requires operator-ready claim allowed',
    );
  });

  it('blocks production deployment candidate support when exact operator-ready claims are not allowed', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      productionClaimAllowed: 'no',
      operatorClaimAllowed: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Operator-ready claim allowed = yes',
    );
  });

  it('blocks production deployment candidate support when exact testnet production-candidate claims are not allowed', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      productionClaimAllowed: 'no',
      operatorClaimAllowed: 'yes',
      testnetProductionCandidateClaimAllowed: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires reviewer decision summary to cover release support, claims, and critical incidents', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary: 'gate 6 operator readiness evidence accepted',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires exact release-supported wording in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires explicit operator-ready claim handling in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claims reviewed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires explicit production-ready claim handling in operator reviewer summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claims reviewed; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires explicit testnet production-candidate claim handling in operator reviewer summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claims reviewed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires operator-ready claim handling rather than claim-allowed shorthand in reviewer summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim allowed: yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires exact Operator-ready claim allowed binding in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Operator-ready claim allowed = yes',
    );
  });

  it('requires exact Production-ready claim allowed denial in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact Testnet production-candidate claim allowed binding in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: testnet production-candidate claim not allowed; ' +
        'Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-candidate release support in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaimAllowed: 'yes',
      reviewerDecisionSummary:
        'release supported: production deployment candidate; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact institutional-reference release support in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      releaseSupported: 'institutional reference',
      reviewerDecisionSummary:
        'release supported: institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical incidents open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in operator summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim allowed: no; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in operator summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim allowed: no; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  });

  it('blocks reviewer decision summaries that approve production-ready operator claims', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim approved; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that leave critical incidents open', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical incidents must be numeric 0',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting remediation'],
    ['waiting', 'waiting for remediation'],
    ['deferred', 'deferred reviewer follow-up'],
  ])(
    'blocks reviewer decision summaries with exact closed incidents plus %s critical incident prose',
    (_label, unresolvedPhrase) => {
      const result = validateOperatorReadinessEvidence(operatorEvidence({
        reviewerDecisionSummary:
          'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          `Critical incidents open = 0; critical incidents ${unresolvedPhrase}`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Publication Decision: Reviewer decision summary must not leave critical incidents open',
      );
    },
  );

  it('blocks reviewer decision summaries with exact closed incidents plus nonzero critical incident count', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; critical incidents count 1 unresolved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave critical incidents open',
    );
  });

  it('blocks reviewer decision summaries that close critical incidents with textual zero-like terms', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical incidents must be numeric 0',
    );
  });

  it('requires exact critical incidents open wording in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical incidents must be numeric 0',
    );
  });

  it('requires exact Critical incidents open = 0 binding in reviewer decision summaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical incidents open = 0',
    );
  });

  it('blocks reviewer decision summaries that approve forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0; reviewer supports open critical incidents; operator allows non-opt-in broadcast enablement',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('accepts reviewer decision summaries that explicitly deny forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; open critical incidents not approved; ' +
        'reviewer approved no open critical incidents; ' +
        'non-opt-in broadcast enablement not approved; operator approved no non-opt-in broadcast enablement; ' +
        'forced broadcast enablement not approved',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('accepts reviewer decision summaries that approve absence of forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; reviewer approved absence of open critical incidents; ' +
        'operator approved absence of non-opt-in broadcast enablement',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('accepts reviewer decision summaries that approve lack of forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; reviewer approved lack of open critical incidents; ' +
        'operator approved lack of non-opt-in broadcast enablement',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('accepts reviewer decision summaries that approve absence of forbidden operator boundary contexts', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; absence of open critical incidents approved by reviewer; ' +
        'absence of non-opt-in broadcast enablement approved by operator',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('accepts reviewer decision summaries that approve lacking forbidden operator boundary contexts', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; lacking open critical incidents approved by reviewer; ' +
        'lacking non-opt-in broadcast enablement approved by operator',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('accepts reviewer text that approves evidence lacks forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; operator-ready claim handling: Operator-ready claim allowed = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical incidents open = 0; evidence lacks critical incidents open approved by reviewer; ' +
        'evidence lacks non-opt-in broadcast enablement approved by operator',
      reviewers: reviewerRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; evidence lacks critical incidents open approved by reviewer |',
        )
        .replace(
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in; evidence lacks non-opt-in broadcast enablement approved by operator |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical incidents',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Release owner: notes must not approve non-opt-in broadcast enablement',
    );
  });

  it('blocks reviewer decision summaries that endorse forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; operator-ready claim handling: operator-ready claim allowed; production-ready claim handling: production-ready claim blocked; testnet production-candidate claim handling: testnet production-candidate claim not allowed; critical incidents open 0; reviewer certifies open critical incidents; operator recommends non-opt-in broadcast enablement; forced broadcast enablement accredited',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical incidents',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement',
    );
  });

  it('rejects runbook evidence that leaves critical incidents open', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/incident-response.md stop-condition checks passed; verification-command checks captured',
        'artifact://operator/runbooks/incident-response.md stop-condition checks passed; verification-command checks captured; critical incidents open 1',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Incident response: evidence must not leave critical incidents open',
    );
  });

  it('rejects command evidence that leaves critical incidents open', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      commands: commandRows.replace(
        '| npm run status | operator status snapshot for readiness and service health | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0 | linked |',
        '| npm run status | operator status snapshot for readiness and service health | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0; critical incidents open 1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run status: evidence must not leave critical incidents open',
    );
  });

  it('rejects drill evidence that leaves critical incidents open', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      drills: drillRows.replace(
        '| Incident response record | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/incident-response-record.md | linked |',
        '| Incident response record | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/incident-response-record.md critical incidents open 1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Incident response record: evidence must not leave critical incidents open',
    );
  });

  it('rejects operational decision evidence that leaves critical incidents open', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      decisions: decisionRows.replace(
        '| Incident escalation is actionable | artifact://operator/decisions/incident-escalation-is-actionable.md | stop release if reviewer cannot reproduce | linked |',
        '| Incident escalation is actionable | artifact://operator/decisions/incident-escalation-is-actionable.md critical incidents open 1 | stop release if reviewer cannot reproduce | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operational Decisions: Incident escalation is actionable: required evidence must not leave critical incidents open',
    );
  });

  it.each([
    ['numeric open', 'critical incidents open 1'],
    ['pending', 'critical incidents pending reviewer follow-up'],
    ['awaiting', 'critical incidents awaiting remediation'],
    ['waiting', 'critical incidents waiting for remediation'],
    ['deferred', 'critical incidents deferred reviewer follow-up'],
  ])('rejects reviewer sign-off notes that leave critical incidents open: %s', (_label, unresolvedNote) => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; ${unresolvedNote} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not leave critical incidents open',
    );
  });

  it.each([
    ['pending', 'critical incidents pending reviewer follow-up'],
    ['awaiting', 'critical incidents awaiting remediation'],
    ['waiting', 'critical incidents waiting on remediation'],
    ['deferred', 'critical incidents deferred reviewer follow-up'],
  ])(
    'blocks linked operator evidence rows that leave critical incidents unresolved: %s',
    (_label, unresolvedPhrase) => {
      const result = validateOperatorReadinessEvidence(operatorEvidence({
        runbooks: runbookRows.replace(
          'artifact://operator/runbooks/incident-response.md stop-condition checks passed; verification-command checks captured',
          `artifact://operator/runbooks/incident-response.md stop-condition checks passed; verification-command checks captured; ${unresolvedPhrase}`,
        ),
        commands: commandRows.replace(
          '| npm run status | operator status snapshot for readiness and service health | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0 | linked |',
          `| npm run status | operator status snapshot for readiness and service health | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0; ${unresolvedPhrase} | linked |`,
        ),
        drills: drillRows.replace(
          '| Incident response record | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/incident-response-record.md | linked |',
          `| Incident response record | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/incident-response-record.md ${unresolvedPhrase} | linked |`,
        ),
        decisions: decisionRows.replace(
          '| Incident escalation is actionable | artifact://operator/decisions/incident-escalation-is-actionable.md | stop release if reviewer cannot reproduce | linked |',
          `| Incident escalation is actionable | artifact://operator/decisions/incident-escalation-is-actionable.md ${unresolvedPhrase} | stop release if reviewer cannot reproduce | linked |`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Runbook Coverage: Incident response: evidence must not leave critical incidents open',
      );
      expect(result.errors).toContain('Required Commands: npm run status: evidence must not leave critical incidents open');
      expect(result.errors).toContain(
        'Incident And Recovery Drills: Incident response record: evidence must not leave critical incidents open',
      );
      expect(result.errors).toContain(
        'Operational Decisions: Incident escalation is actionable: required evidence must not leave critical incidents open',
      );
    },
  );

  it.each([
    'Critical incidents open = 0/1',
    'critical incidents open: 0 / 1',
  ])('blocks linked operator evidence rows that keep critical incident count placeholder %s', placeholder => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      runbooks: runbookRows.replace(
        'artifact://operator/runbooks/incident-response.md stop-condition checks passed; verification-command checks captured',
        `artifact://operator/runbooks/incident-response.md stop-condition checks passed; verification-command checks captured; ${placeholder}`,
      ),
      commands: commandRows.replace(
        '| npm run status | operator status snapshot for readiness and service health | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0 | linked |',
        `| npm run status | operator status snapshot for readiness and service health | artifact://operator/commands/npm-run-status.log; npm run status command output PASS exit code 0; ${placeholder} | linked |`,
      ),
      drills: drillRows.replace(
        '| Incident response record | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/incident-response-record.md | linked |',
        `| Incident response record | operator confirms recovery or opens incident if unresolved | artifact://operator/drills/incident-response-record.md; ${placeholder} | linked |`,
      ),
      decisions: decisionRows.replace(
        '| Incident escalation is actionable | artifact://operator/decisions/incident-escalation-is-actionable.md | stop release if reviewer cannot reproduce | linked |',
        `| Incident escalation is actionable | artifact://operator/decisions/incident-escalation-is-actionable.md; ${placeholder} | stop release if reviewer cannot reproduce | linked |`,
      ),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; ${placeholder} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Runbook Coverage: Incident response: evidence must not leave critical incidents open',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run status: evidence must not leave critical incidents open',
    );
    expect(result.errors).toContain(
      'Incident And Recovery Drills: Incident response record: evidence must not leave critical incidents open',
    );
    expect(result.errors).toContain(
      'Operational Decisions: Incident escalation is actionable: required evidence must not leave critical incidents open',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not leave critical incidents open',
    );
  });

  it('rejects reviewer sign-off notes that approve forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; reviewer supports open critical incidents |',
        )
        .replace(
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: operator allows non-opt-in broadcast enablement |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical incidents',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Release owner: notes must not approve non-opt-in broadcast enablement',
    );
  });

  it('rejects reviewer sign-off notes with compatibility-normalized open critical incident approval wording', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 \uFF4F\uFF50\uFF45\uFF4E \uFF43\uFF52\uFF49\uFF54\uFF49\uFF43\uFF41\uFF4C \uFF49\uFF4E\uFF43\uFF49\uFF44\uFF45\uFF4E\uFF54\uFF53 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical incidents',
    );
  });

  it('rejects reviewer sign-off notes with base active verbs before forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: reviewer notes clear open critical incidents |',
        )
        .replace(
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: operator notes permit non-opt-in broadcast enablement |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical incidents',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Release owner: notes must not approve non-opt-in broadcast enablement',
    );
  });

  it('rejects reviewer sign-off notes with grant-family approval terms for forbidden operator boundaries', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: reviewer grants open critical incidents |',
        )
        .replace(
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: operator granted non-opt-in broadcast enablement |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical incidents',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Release owner: notes must not approve non-opt-in broadcast enablement',
    );
  });

  it('rejects reviewer sign-off notes that approve production-ready or mainnet production claims', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; production-ready operator claim approved |',
        )
        .replace(
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
          '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in; mainnet production release accepted |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Release owner: notes must not contain mainnet production claim wording',
    );
  });

  it('requires reviewer approvals before passing', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | block | 2026-05-14 | open incident |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: decision must be approve before operator readiness can pass');
  });

  it('requires reviewer notes to state concrete operator-readiness outcomes', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete operator-readiness outcome',
    );
  });

  it('rejects reviewer notes with contradictory operator-readiness failure markers', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory operator-readiness failure markers',
    );
  });

  it('rejects generic reviewer notes that do not cite operational decisions', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must cite a concrete operational decision or stop condition',
    );
  });

  it('rejects reviewer notes that cite operational decisions only as longer phrases', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: external operator can find every runbook extension |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must cite a concrete operational decision or stop condition',
    );
  });

  it('requires runbook operator sign-off to match the readiness classification identity', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Runbook operator | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: external operator can find every runbook |',
        '| Runbook operator | reviewer-b | approve | 2026-05-14 | operator readiness decision confirmed: external operator can find every runbook |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Runbook operator: name must match Readiness Classification Reviewer',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: stop conditions are executable |',
        '| Security reviewer | reviewer-a | approve | May 14 2026 | operator readiness decision confirmed: stop conditions are executable |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the readiness classification date', () => {
    const result = validateOperatorReadinessEvidence(operatorEvidence({
      reviewers: reviewerRows.replace(
        '| Release owner | reviewer-a | approve | 2026-05-14 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
        '| Release owner | reviewer-a | approve | 2026-05-13 | operator readiness decision confirmed: broadcast enablement remains opt-in |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Release owner: Date must not be before Readiness Classification Date',
    );
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
