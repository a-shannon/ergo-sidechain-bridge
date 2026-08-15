import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  parseGovernanceScopeRows,
  validateCommitteeGovernanceEvidence,
} from './committee-governance-evidence.js';

const OLD_COMMITTEE_KEY_HASH = 'a'.repeat(64);
const NEW_COMMITTEE_KEY_HASH_1 = '1'.repeat(64);
const NEW_COMMITTEE_KEY_HASH_2 = '2'.repeat(64);
const NEW_COMMITTEE_KEY_HASH_3 = '3'.repeat(64);
const NON_COMMITTEE_KEY_HASH = '9'.repeat(64);
const stripKnownNodeRuntimeWarnings = (stderr: string): string =>
  stderr
    .replace(
      /\(node:\d+\) \[DEP0205\] DeprecationWarning: `module\.register\(\)` is deprecated\. Use `module\.registerHooks\(\)` instead\.\r?\n?/g,
      '',
    )
    .replace(/\(Use `node --trace-deprecation \.\.\.` to show where the warning was created\)\r?\n?/g, '');

const scopeRows = [
  ['SideChainState successor authorization', 'old committee', 'new committee'],
  ['DUP authorization', 'old committee', 'new committee'],
  ['Aggregate DUP authorization', 'old committee', 'new committee'],
  ['Batch DUP authorization', 'old committee', 'new committee'],
  ['MainChainLock normal path', 'old committee', 'new committee'],
  ['MainChainLock emergency escape path', 'permissionless after timeout', 'unchanged'],
  ['SPVTracker ingest authorization', 'old committee', 'new committee'],
  [
    'MCU Phase 2 path',
    'legacy v1 permissionless Phase 2 path quarantined',
    'transitional atLeast committee containment pending Gate 5 / Phase 011',
  ],
].map(row => `| ${row[0]} | ${row[1]} | ${row[2]} | artifact://governance/${slug(row[0])}.log | linked |`).join('\n');

const commandRows = [
  'npm run contracts:check',
  'npm run check',
  'npm run wasm:test',
  'npm run demo:readiness',
  'npm run status',
  'spike010a-committee-guard-eval.ts',
].map(command =>
  `| ${command} | artifact://governance/${slug(command)}.log; ${command} command output PASS exit code 0 | linked |`,
).join('\n');

const rotationRows = [
  'Identify old committee public keys',
  'Identify new committee public keys',
  'Validate threshold policy',
  'Simulate member loss or lost-key tolerance',
  'Compile affected contracts',
  'Evaluate old and new signer behavior',
  'Preserve singleton continuity',
  'Reconcile deployment state',
  'Verify rollback plan',
].map(step =>
  `| ${step} | artifact://governance/${slug(step)}.log; ${rotationEvidenceFocus(step)} | linked | stop if ${slug(step)} fails |`,
).join('\n');

const positiveRows = [
  [
    'New committee executes signer-gated mutation after rotation',
    'accepted',
    `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
  ],
  [
    'Threshold member-loss tolerance still executes signer-gated mutation',
    'validated',
    `artifact://governance/member-loss-threshold-mutation.log; member-loss tolerance threshold quorum signer-gated mutation validated by ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_3}`,
  ],
].map(([check, expected, evidence]) => `| ${check} | ${expected} | ${evidence} | linked |`).join('\n');

const negativeRows = [
  [
    'Old single signer attempts signer-gated mutation after rotation',
    `old signer ${OLD_COMMITTEE_KEY_HASH}`,
  ],
  [
    'Non-committee signer attempts signer-gated mutation',
    `non-committee signer ${NON_COMMITTEE_KEY_HASH}`,
  ],
  'Committee threshold below policy',
  'MCU references stale SCS NFT after SCS redeploy',
  'MCL emergency escape path is accidentally committee-gated',
  'Broadcast is enabled before readiness review',
  [
    'Deployment state points to the wrong network',
    'deployment-state wrong-network rejection; npm run governance:reconcile:validate command output PASS exit code 0',
  ],
].map(row => {
  const [check, detail] = Array.isArray(row) ? row : [row, ''];
  return `| ${check} | rejected | artifact://governance/${slug(check)}.log${detail ? `; ${detail}` : ''} | linked |`;
}).join('\n');

const reviewerRows = [
  'Governance owner',
  'Security reviewer',
  'Operator reviewer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | governance drill accepted |`).join('\n');

function governanceEvidence(overrides: {
  scopes?: string;
  commands?: string;
  rotations?: string;
  positives?: string;
  negatives?: string;
  publicationRules?: string;
  reviewers?: string;
  releaseLevel?: string;
  environment?: string;
  broadcastMode?: string;
  governanceModel?: string;
  threshold?: string;
  memberCount?: string;
} = {}): string {
  return `
# Completed Committee Governance Evidence

## Drill Classification

| Field | Value |
|---|---|
| Drill name | committee drill |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Environment | ${overrides.environment ?? 'patched devnet'} |
| Broadcast mode | ${overrides.broadcastMode ?? 'disabled'} |
| Governance model | ${overrides.governanceModel ?? 'Phase 010a atLeast multisig'} |
| Committee threshold | ${overrides.threshold ?? '2'} |
| Committee member count | ${overrides.memberCount ?? '3'} |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Scope

| Surface | Current authority | Target authority | Evidence | Status |
|---|---|---|---|---|
${overrides.scopes ?? scopeRows}

## Required Commands

| Command | Evidence | Status |
|---|---|---|
${overrides.commands ?? commandRows}

## Rotation Plan

| Step | Required evidence | Status | Stop condition |
|---|---|---|---|
${overrides.rotations ?? rotationRows}

## Positive Checks

| Check | Expected result | Evidence | Status |
|---|---|---|---|
${overrides.positives ?? positiveRows}

## Negative Checks

| Check | Expected result | Evidence | Status |
|---|---|---|---|
${overrides.negatives ?? negativeRows}

## Publication Rules

- Keep unresolved blockers visible.

| Field | Value |
|---|---|
${overrides.publicationRules ?? publicationRuleRows()}

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('committee governance evidence validation', () => {
  it('parses required governance scope rows', () => {
    const rows = parseGovernanceScopeRows(governanceEvidence());

    expect(rows[0]).toMatchObject({
      surface: 'SideChainState successor authorization',
      status: 'linked',
    });
  });

  it('passes when committee governance evidence is fully structured', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence());

    expect(result.status).toBe('PASS');
    expect(result.rotationRows).toHaveLength(9);
    expect(result.positiveRows).toHaveLength(2);
    expect(result.classification).toMatchObject({
      drillName: 'committee drill',
      gitCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      environment: 'patched devnet',
      broadcastMode: 'disabled',
      governanceModel: 'Phase 010a atLeast multisig',
      committeeThreshold: '2',
      committeeMemberCount: '3',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.publicationDecision).toMatchObject({
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
      governanceReadyClaimAllowed: 'yes',
    });
    expect(result.message).toContain('9 rotation rows');
    expect(result.message).toContain('2 positive checks');
  });

  it('prints governance claim and release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-committee-governance-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run governance:validate');
    expect(result.stdout).toContain('completed Committee Governance Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --governance-evidence');
    expect(result.stdout).toContain('governance validation target');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('A standalone PASS does not authorize public claims');
    expect(result.stdout).toContain('Governance-ready or testnet production-candidate wording requires release:gate PASS');
    expect(result.stdout).toContain('Structural issues = 0');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed = yes');
    expect(result.stdout).toContain('Governance-ready claim allowed = yes');
    expect(result.stdout).toContain('Open governance blockers = 0');
    expect(result.stdout).toContain('Release notes updated = yes');
    expect(result.stdout).not.toContain('zero structural issues');
    expect(result.stdout).toContain(
      'does not rotate keys, sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('writes a sanitized committee governance validation blocker report with issue groups', () => {
    const reportDir = mkdtempSync(join(process.cwd(), '.tmp-governance-report-'));
    const reportPath = join(reportDir, 'blocked-report.md');
    const reportTarget = `${reportDir.slice(process.cwd().length + 1).replace(/\\/g, '/')}/blocked-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-committee-governance-evidence.ts',
          '../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md',
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(stripKnownNodeRuntimeWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('Committee governance evidence BLOCKED');
      expect(result.stdout).toContain('Wrote committee governance validation report to --report-out target.');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('# Committee Governance Evidence Validation Report');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Exit code | 1 |');
      expect(report).toContain('| Structural issues | 46 |');
      expect(report).toContain(
        '| Validated target | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md |',
      );
      expect(report).toContain('| Scope | 12 |');
      expect(report).toContain('| Required commands | 4 |');
      expect(report).toContain('| Rotation plan | 11 |');
      expect(report).toContain('| Positive checks | 2 |');
      expect(report).toContain('| Negative checks | 7 |');
      expect(report).toContain('| Publication rules | 7 |');
      expect(report).toContain('| Reviewer sign-off | 3 |');
      expect(report).toContain(
        'does not authorize public claims, release claims, publishing, deployment, key rotation, governance mutation, or transaction broadcast',
      );
      expect(report).toContain(
        '| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |',
      );
      const windowsHomePrefix = ['C:', 'Users'].join(String.fromCharCode(92));
      expect(report).not.toContain(windowsHomePrefix);
      expect(report).not.toContain('privateKey');
      expect(report).not.toContain('mnemonic');
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it('requires governance drill dates to use ISO calendar format', () => {
    const result = validateCommitteeGovernanceEvidence(
      governanceEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Date must use YYYY-MM-DD');
  });

  it('requires governance drill Git commits to use commit SHA format', () => {
    const result = validateCommitteeGovernanceEvidence(
      governanceEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate governance drill classification fields', () => {
    const result = validateCommitteeGovernanceEvidence(
      governanceEvidence().replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Git commit: duplicate required field');
  });

  it('blocks single-signer governance mode before Gate 6 evidence can pass', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      governanceModel: 'single signer',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: Governance model must not be single signer before Gate 6 evidence can pass',
    );
  });

  it('blocks enabled broadcast mode before Gate 6 governance evidence can pass', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      broadcastMode: 'enabled',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: Broadcast mode must not be enabled before Gate 6 governance evidence can pass',
    );
  });

  it('blocks invalid threshold policies', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      threshold: '4',
      memberCount: '3',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Committee threshold cannot exceed member count');
  });

  it('requires threshold policy to prove multisig and member-loss tolerance', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      threshold: '1',
      memberCount: '1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: Committee threshold must be at least 2 before Gate 6 evidence can pass',
    );
    expect(result.errors).toContain(
      'Drill Classification: Committee member count must be at least 3 before Gate 6 evidence can pass',
    );
    expect(result.errors).toContain(
      'Drill Classification: Committee threshold must be lower than member count to prove member-loss tolerance',
    );
  });

  it('rejects non-numeric threshold policy fields', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      threshold: 'two',
      memberCount: 'three',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Committee threshold must be a positive integer');
    expect(result.errors).toContain('Drill Classification: Committee member count must be a positive integer');
  });

  it('rejects unsafe threshold policy fields', () => {
    const unsafeInteger = '9007199254740993';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      threshold: unsafeInteger,
      memberCount: unsafeInteger,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Drill Classification: Committee threshold must be a safe integer');
    expect(result.errors).toContain('Drill Classification: Committee member count must be a safe integer');
  });

  it('blocks pending scope rows and missing evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: '| SideChainState successor authorization | old | new | | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Scope: DUP authorization: missing required row');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: status must be linked before committee governance evidence can pass',
    );
  });

  it('rejects duplicate required governance rows', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: `${scopeRows}\n| DUP authorization | old committee | new committee | artifact://governance/dup-second.log | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Scope: DUP authorization: duplicate required row');
  });

  it('preserves MCL escape and requires fail-closed transitional MCU scope', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows
        .replace(
          '| MainChainLock emergency escape path | permissionless after timeout | unchanged | artifact://governance/mainchainlock-emergency-escape-path.log | linked |',
          '| MainChainLock emergency escape path | emergency escape reviewed | new committee atLeast multisig | artifact://governance/mainchainlock-emergency-escape-path.log | linked |',
        )
        .replace(
          '| MCU Phase 2 path | legacy v1 permissionless Phase 2 path quarantined | transitional atLeast committee containment pending Gate 5 / Phase 011 | artifact://governance/mcu-phase-2-path.log | linked |',
          '| MCU Phase 2 path | legacy path reviewed | permanent committee authority | artifact://governance/mcu-phase-2-path.log | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: MainChainLock emergency escape path: current authority must mention permissionless emergency escape',
    );
    expect(result.errors).toContain(
      'Scope: MainChainLock emergency escape path: current authority must mention timeout semantics',
    );
    expect(result.errors).toContain(
      'Scope: MainChainLock emergency escape path: target authority must state unchanged emergency escape',
    );
    expect(result.errors).toContain(
      'Scope: MainChainLock emergency escape path: target authority must not committee-gate emergency escape',
    );
    expect(result.errors).toContain(
      'Scope: MCU Phase 2 path: current authority must identify the legacy permissionless Phase 2 path',
    );
    expect(result.errors).toContain(
      'Scope: MCU Phase 2 path: current authority must state that legacy MCU creation and spend are quarantined or disabled',
    );
    expect(result.errors).toContain(
      'Scope: MCU Phase 2 path: target authority must identify Phase 011 or Gate 5 as the proof replacement',
    );
    expect(result.errors).toContain(
      'Scope: MCU Phase 2 path: target authority must limit committee authorization to transitional containment',
    );
  });

  it('requires required command artifacts', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: '| npm run check | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm run contracts:check: missing required row');
    expect(result.errors).toContain('Required Commands: npm run check: linked status requires an evidence marker');
  });

  it('requires linked command evidence to identify the governance command output', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: commandRows.replace(
        '| npm run demo:readiness | artifact://governance/npm-run-demo-readiness.log; npm run demo:readiness command output PASS exit code 0 | linked |',
        '| npm run demo:readiness | artifact://governance/governance-commands.log; governance command output PASS exit code 0 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run demo:readiness: evidence must identify npm run demo:readiness output',
    );
  });

  it('requires linked command evidence to include explicit exit code 0 output', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence command output must include exit code 0',
    );
  });

  it('rejects linked command evidence that keeps an exit-code placeholder', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0/1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence command output must include exit code 0',
    );
  });

  it('rejects contradictory PASS command-output evidence for linked governance commands', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive governance command output',
    );
  });

  it('rejects contradictory linked governance row evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/sidechainstate-successor-authorization.log FAIL exit code 1',
      ),
      rotations: rotationRows.replace(
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance ERROR validation failed | linked | stop if validate-threshold-policy fails |',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} BLOCKED with 1 structural issue`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH} ERROR validation failed`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
  });

  it('rejects committee governance evidence with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 committee governance validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `artifact://governance/sidechainstate-successor-authorization.log ${contradictoryEvidence}`,
      ),
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        `| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; ${contradictoryEvidence} | linked |`,
      ),
      rotations: rotationRows.replace(
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
        `| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance; ${contradictoryEvidence} | linked | stop if validate-threshold-policy fails |`,
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}; ${contradictoryEvidence}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}; ${contradictoryEvidence}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${contradictoryEvidence}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${contradictoryEvidence}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${contradictoryEvidence}`,
      }),
      reviewers: reviewerRows.replace(
        'governance drill accepted',
        `governance drill accepted; ${contradictoryEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not include contradictory committee-governance failure markers',
    );
  });

  it('rejects committee governance evidence with structured failure fields', () => {
    const emptyStructuredFields = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; {"errors":[]} errorCount: 0 | linked |',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/sidechainstate-successor-authorization.log {"errors":["scope gap"]}',
      ),
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; errorCount: 1 | linked |',
      ),
      rotations: rotationRows.replace(
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance; {"failures":{"threshold":"blocked"}} | linked | stop if validate-threshold-policy fails |',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}; failureTotal: 1`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}; {"errors":["negative check gap"]}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; {"errors":["release-note gap"]}',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; {"failures":{"checklist":"blocked"}}',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; errorCount: 1',
      }),
      reviewers: reviewerRows.replace(
        'governance drill accepted',
        'governance drill accepted; failureTotal: 1',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive governance command output',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not include contradictory committee-governance failure markers',
    );
  });

  it('rejects linked governance row evidence with remaining issue markers', () => {
    const remainingIssues = 'command output: PASS exit code 0; Remaining issues: follow-up item pending';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `artifact://governance/sidechainstate-successor-authorization.log ${remainingIssues}`,
      ),
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        `| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; Remaining issues: follow-up item pending | linked |`,
      ),
      rotations: rotationRows.replace(
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
        `| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance; ${remainingIssues} | linked | stop if validate-threshold-policy fails |`,
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}; ${remainingIssues}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}; ${remainingIssues}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${remainingIssues}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${remainingIssues}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${remainingIssues}`,
      }),
      reviewers: reviewerRows.replace(
        'governance drill accepted',
        `governance drill accepted; ${remainingIssues}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not include contradictory committee-governance failure markers',
    );
  });

  it('rejects linked governance row evidence with open or known issue markers', () => {
    for (const unresolvedIssues of [
      'command output: PASS exit code 0; Open issues: unresolved governance blocker',
      'command output: PASS exit code 0; Known issues: unresolved governance blocker',
      'command output: PASS exit code 0; Unresolved issue count: 1',
      'command output: PASS exit code 0; Open vulnerability total = 1',
      'command output: PASS exit code 0; Pending blocker count: 2',
    ]) {
      const result = validateCommitteeGovernanceEvidence(governanceEvidence({
        scopes: scopeRows.replace(
          'artifact://governance/sidechainstate-successor-authorization.log',
          `artifact://governance/sidechainstate-successor-authorization.log ${unresolvedIssues}`,
        ),
        commands: commandRows.replace(
          '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
          `| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; ${unresolvedIssues} | linked |`,
        ),
        rotations: rotationRows.replace(
          '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
          `| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance; ${unresolvedIssues} | linked | stop if validate-threshold-policy fails |`,
        ),
        positives: positiveRows.replace(
          `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
          `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}; ${unresolvedIssues}`,
        ),
        negatives: negativeRows.replace(
          `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
          `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}; ${unresolvedIssues}`,
        ),
        publicationRules: publicationRuleRows({
          releaseNoteUpdates:
            `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${unresolvedIssues}`,
          checklistUpdates:
            `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${unresolvedIssues}`,
          externalReviewEvidence:
            `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; ${unresolvedIssues}`,
        }),
        reviewers: reviewerRows.replace(
          'governance drill accepted',
          `governance drill accepted; ${unresolvedIssues}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Scope: SideChainState successor authorization: evidence must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Required Commands: npm run check: evidence must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Rotation Plan: Validate threshold policy: required evidence must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Publication Rules: Required release-note updates must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Publication Rules: Required checklist updates must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Publication Rules: External review evidence must not include contradictory committee-governance failure markers',
      );
      expect(result.errors).toContain(
        'Reviewer Sign-Off: Governance owner: notes must not include contradictory committee-governance failure markers',
      );
    }
  });

  it.each([
    'Open governance blockers = 0/1',
    'open governance blocker handling: 0/1',
  ])('rejects linked governance row evidence that keeps blocker count placeholder %s', placeholder => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `artifact://governance/sidechainstate-successor-authorization.log ${placeholder}`,
      ),
      commands: commandRows.replace(
        '| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0 | linked |',
        `| npm run check | artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; ${placeholder} | linked |`,
      ),
      rotations: rotationRows.replace(
        '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
        `| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance; ${placeholder} | linked | stop if validate-threshold-policy fails |`,
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}; ${placeholder}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}; ${placeholder}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not leave governance blockers open',
    );
  });

  it('requires rotation plan evidence and stop conditions', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: '| Validate threshold policy | no artifact | linked | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Rotation Plan: Identify old committee public keys: missing required row');
    expect(result.errors).toContain('Rotation Plan: Validate threshold policy: linked status requires an evidence marker');
    expect(result.errors).toContain('Rotation Plan: Validate threshold policy: stop condition is required');
  });

  it('requires rotation plan stop conditions to be actionable', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: rotationRows.replace(
        '| Verify rollback plan | artifact://governance/verify-rollback-plan.log; rollback previous-authority recovery path | linked | stop if verify-rollback-plan fails |',
        '| Verify rollback plan | artifact://governance/verify-rollback-plan.log; rollback previous-authority recovery path | linked | reviewed later |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rotation Plan: Verify rollback plan: stop condition must state an actionable stop, block, fail, pause, rollback, incident, or refusal condition',
    );
  });

  it('requires rotation plan evidence to cite step-specific governance facts', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: rotationRows
        .replace(
          '| Validate threshold policy | artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance | linked | stop if validate-threshold-policy fails |',
          '| Validate threshold policy | artifact://governance/reviewed.log | linked | stop if threshold fails |',
        )
        .replace(
          '| Verify rollback plan | artifact://governance/verify-rollback-plan.log; rollback previous-authority recovery path | linked | stop if verify-rollback-plan fails |',
          '| Verify rollback plan | artifact://governance/reviewed.log | linked | stop if rollback fails |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must identify m/n or threshold policy',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: required evidence must identify quorum or lost-key/member-loss tolerance',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Verify rollback plan: required evidence must identify rollback or previous-authority recovery',
    );
  });

  it('rejects placeholder-only compile evidence for affected contracts', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: rotationRows.replace(
        '| Compile affected contracts | artifact://governance/compile-affected-contracts.log; contracts:check compile placeholder validation | linked | stop if compile-affected-contracts fails |',
        '| Compile affected contracts | artifact://governance/compile-affected-contracts.log; placeholder validation passed | linked | stop if compile-affected-contracts fails |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rotation Plan: Compile affected contracts: required evidence must identify contract compilation or contracts:check output',
    );
  });

  it('requires committee key rotation rows to include concrete public identifiers', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: rotationRows
        .replace(
          `| Identify old committee public keys | artifact://governance/identify-old-committee-public-keys.log; old committee public keys hashes only ${OLD_COMMITTEE_KEY_HASH} | linked | stop if identify-old-committee-public-keys fails |`,
          '| Identify old committee public keys | artifact://governance/identify-old-committee-public-keys.log; old committee public keys hashes only | linked | stop if identify-old-committee-public-keys fails |',
        )
        .replace(
          `| Identify new committee public keys | artifact://governance/identify-new-committee-public-keys.log; new committee public keys hashes only ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} ${NEW_COMMITTEE_KEY_HASH_3} | linked | stop if identify-new-committee-public-keys fails |`,
          `| Identify new committee public keys | artifact://governance/identify-new-committee-public-keys.log; new committee public keys hashes only ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} | linked | stop if identify-new-committee-public-keys fails |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rotation Plan: Identify old committee public keys: required evidence must include at least one concrete public key/hash identifier',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Identify new committee public keys: required evidence must include at least 3 concrete public key/hash identifiers matching Committee member count',
    );
  });

  it('requires new committee public identifiers to be disjoint from the old committee', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: rotationRows.replace(
        `| Identify new committee public keys | artifact://governance/identify-new-committee-public-keys.log; new committee public keys hashes only ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} ${NEW_COMMITTEE_KEY_HASH_3} | linked | stop if identify-new-committee-public-keys fails |`,
        `| Identify new committee public keys | artifact://governance/identify-new-committee-public-keys.log; new committee public keys hashes only ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} ${OLD_COMMITTEE_KEY_HASH} | linked | stop if identify-new-committee-public-keys fails |`,
      ),
      positives: positiveRows.replace(NEW_COMMITTEE_KEY_HASH_3, NEW_COMMITTEE_KEY_HASH_2),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rotation Plan: Identify new committee public keys: must not reuse old committee public key/hash identifiers',
    );
  });

  it('requires positive checks proving the new committee can operate', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      positives: '| New committee executes signer-gated mutation after rotation | accepted | | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Checks: Threshold member-loss tolerance still executes signer-gated mutation: missing required row',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: status must be linked before committee governance evidence can pass',
    );
  });

  it('requires positive-check evidence to cite new-committee and member-loss operation facts', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      positives: positiveRows
        .replace(
          `| New committee executes signer-gated mutation after rotation | accepted | artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} | linked |`,
          '| New committee executes signer-gated mutation after rotation | reviewed | artifact://governance/accepted.log | linked |',
        )
        .replace(
          `| Threshold member-loss tolerance still executes signer-gated mutation | validated | artifact://governance/member-loss-threshold-mutation.log; member-loss tolerance threshold quorum signer-gated mutation validated by ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_3} | linked |`,
          '| Threshold member-loss tolerance still executes signer-gated mutation | validated | artifact://governance/accepted.log | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: expected result must state accepted, approved, passed, validated, verified, or succeeded',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must identify new committee behavior',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must identify signer-gated mutation',
    );
    expect(result.errors).toContain(
      'Positive Checks: Threshold member-loss tolerance still executes signer-gated mutation: evidence must identify member-loss or lost-key tolerance',
    );
    expect(result.errors).toContain(
      'Positive Checks: Threshold member-loss tolerance still executes signer-gated mutation: evidence must identify threshold quorum',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must include at least 2 concrete public key/hash identifiers matching Committee threshold',
    );
    expect(result.errors).toContain(
      'Positive Checks: Threshold member-loss tolerance still executes signer-gated mutation: evidence must include at least 2 concrete public key/hash identifiers matching Committee threshold',
    );
  });

  it('requires positive-check signer identifiers to belong to the declared new committee', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      positives: positiveRows.replace(
        NEW_COMMITTEE_KEY_HASH_2,
        NON_COMMITTEE_KEY_HASH,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must include at least 2 declared new committee public key/hash identifiers matching Committee threshold',
    );
  });

  it('requires negative checks to be linked', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      negatives: '| Non-committee signer attempts signer-gated mutation | rejected | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: missing required row',
    );
    expect(result.errors).toContain(
      'Negative Checks: Non-committee signer attempts signer-gated mutation: linked status requires an evidence marker',
    );
  });

  it('requires negative check expected results to fail closed', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      negatives: negativeRows.replace(
        '| MCU references stale SCS NFT after SCS redeploy | rejected | artifact://governance/mcu-references-stale-scs-nft-after-scs-redeploy.log | linked |',
        '| MCU references stale SCS NFT after SCS redeploy | reviewed | artifact://governance/mcu-references-stale-scs-nft-after-scs-redeploy.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Checks: MCU references stale SCS NFT after SCS redeploy: expected result must state rejected, blocked, refused, or failed',
    );
  });

  it('rejects slash-delimited positive and negative check expected-result alternatives', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      positives: positiveRows.replace(
        '| New committee executes signer-gated mutation after rotation | accepted |',
        '| New committee executes signer-gated mutation after rotation | accepted/rejected |',
      ),
      negatives: negativeRows.replace(
        '| Old single signer attempts signer-gated mutation after rotation | rejected |',
        '| Old single signer attempts signer-gated mutation after rotation | rejected/accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: expected result must use one exact positive outcome without slash-delimited alternatives',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: expected result must use one exact fail-closed outcome without slash-delimited alternatives',
    );
  });

  it('requires negative-check evidence to cite the rejected governance fact', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      negatives: negativeRows
        .replace(
          `| Old single signer attempts signer-gated mutation after rotation | rejected | artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH} | linked |`,
          '| Old single signer attempts signer-gated mutation after rotation | rejected | artifact://governance/rejected.log | linked |',
        )
        .replace(
          '| Deployment state points to the wrong network | rejected | artifact://governance/deployment-state-points-to-the-wrong-network.log; deployment-state wrong-network rejection; npm run governance:reconcile:validate command output PASS exit code 0 | linked |',
          '| Deployment state points to the wrong network | rejected | artifact://governance/rejected.log | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must identify old signer behavior',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must identify signer-gated mutation',
    );
    expect(result.errors).toContain(
      'Negative Checks: Deployment state points to the wrong network: evidence must identify deployment state',
    );
    expect(result.errors).toContain(
      'Negative Checks: Deployment state points to the wrong network: evidence must identify network mismatch',
    );
  });

  it('requires deployment-state reconciliation rows to cite sanitized reconciliation validator output', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      rotations: rotationRows.replace(
        '| Reconcile deployment state | artifact://governance/reconcile-deployment-state.log; deployment-state network singleton reconciliation; npm run governance:reconcile:validate command output PASS exit code 0 | linked | stop if reconcile-deployment-state fails |',
        '| Reconcile deployment state | artifact://governance/reconcile-deployment-state.log; deployment-state network singleton reconciliation | linked | stop if reconcile-deployment-state fails |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Rotation Plan: Reconcile deployment state: required evidence must identify npm run governance:reconcile:validate output',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Reconcile deployment state: required evidence must include sanitized reconciliation command output',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Reconcile deployment state: required evidence command output must include exit code 0',
    );
  });

  it('requires wrong-network negative rows to cite sanitized reconciliation validator output', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      negatives: negativeRows.replace(
        '| Deployment state points to the wrong network | rejected | artifact://governance/deployment-state-points-to-the-wrong-network.log; deployment-state wrong-network rejection; npm run governance:reconcile:validate command output PASS exit code 0 | linked |',
        '| Deployment state points to the wrong network | rejected | artifact://governance/deployment-state-points-to-the-wrong-network.log; deployment-state wrong-network rejection | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Checks: Deployment state points to the wrong network: evidence must identify npm run governance:reconcile:validate output',
    );
    expect(result.errors).toContain(
      'Negative Checks: Deployment state points to the wrong network: evidence must include sanitized reconciliation command output',
    );
    expect(result.errors).toContain(
      'Negative Checks: Deployment state points to the wrong network: evidence command output must include exit code 0',
    );
  });

  it('requires old and non-committee signer negative checks to cite rejected signer identifiers', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      negatives: negativeRows
        .replace(`; old signer ${OLD_COMMITTEE_KEY_HASH}`, '')
        .replace(`; non-committee signer ${NON_COMMITTEE_KEY_HASH}`, ''),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must include a concrete public key/hash identifier for the rejected signer',
    );
    expect(result.errors).toContain(
      'Negative Checks: Non-committee signer attempts signer-gated mutation: evidence must include a concrete public key/hash identifier for the rejected signer',
    );
  });

  it('requires publication rules to link release-note and checklist evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNotesUpdated: 'no',
        releaseNoteUpdates: '[Committee Governance Evidence Template](committee-governance-evidence-template.md), `npm run governance:validate`',
        checklistUpdates: 'reviewed',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Release notes updated must be yes before committee governance evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include a link, command, or artifact marker',
    );
  });

  it('rejects targetless command-output notes for governance publication update evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'completed Gate 6 governance release-note update evidence: npm run governance:validate command output: PASS',
        checklistUpdates:
          'completed Gate 6 governance checklist update evidence: npm run governance:validate command output: PASS',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires publication rule evidence to identify Gate 6 governance update evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates: 'artifact://governance/release-notes-update.md',
        checklistUpdates: 'artifact://governance/checklist-update.md',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must identify completed Gate 6 governance release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must identify completed Gate 6 governance checklist update evidence',
    );
  });

  it('rejects Gate 6 governance publication evidence kinds hidden inside longer draft labels', () => {
    const publicationUpdateBindings =
      '; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/draft-completed-gate-6-governance-release-note-update-evidence.md${publicationUpdateBindings}`,
        checklistUpdates:
          `artifact://governance/draft-completed-gate-6-governance-checklist-update-evidence.md${publicationUpdateBindings}`,
        externalReviewEvidence:
          `artifact://governance/draft-completed-gate-6-governance-external-review-evidence.md${publicationUpdateBindings}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must identify completed Gate 6 governance release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must identify completed Gate 6 governance checklist update evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must identify completed Gate 6 governance external review evidence',
    );
  });

  it('requires publication rules to link completed external review evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        externalReviewEvidence: 'reviewed',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must identify completed Gate 6 governance external review evidence',
    );
  });

  it('rejects contradictory governance publication update evidence', () => {
    const contradictoryEvidence = 'committee governance validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md ${contradictoryEvidence}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md ${contradictoryEvidence}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory committee-governance failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory committee-governance failure markers',
    );
  });

  it('rejects governance publication updates that approve mainnet or production-ready claims', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md approves mainnet production governance deployment wording',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md approves production-ready governance claim wording',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('rejects governance publication updates that close governance-ready claims with prose-only terms', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; governance-ready claim handling allowed',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; governance-ready claim approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Governance-ready claim allowed = yes; prose-only governance-ready closure is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Governance-ready claim allowed = yes; prose-only governance-ready closure is not accepted',
    );
  });

  it('requires exact governance-ready claim bindings in governance publication updates', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Governance-ready claim allowed = yes',
    );
  });

  it('requires hyphenated exact governance-ready claim bindings in governance publication evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0',
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: Governance ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling: Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes',
    );
  });

  it('accepts exact governance-ready claim bindings in governance publication updates', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; governance-ready claim handling allowed',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; governance-ready claim approved',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact production-ready claim denial in governance publication evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance-ready claim allowed = yes; Open governance blockers = 0',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance-ready claim allowed = yes; Open governance blockers = 0',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact production-candidate bindings in governance publication updates', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance-ready claim allowed = yes; Open governance blockers = 0',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance-ready claim allowed = yes; Open governance blockers = 0',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact production-candidate bindings in governance external review evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Open governance blockers = 0',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('rejects contradictory exact governance decision bindings in publication evidence', () => {
    const contradictoryDecisionBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Governance-ready claim allowed = yes; Governance-ready claim allowed = no; ' +
      'Production-ready claim allowed = no; ' +
      'Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
      'Open governance blockers = 0; Open governance blockers = 1';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaimAllowed: 'yes',
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; ${contradictoryDecisionBindings}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; ${contradictoryDecisionBindings}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; ${contradictoryDecisionBindings}`,
        reviewerDecisionSummary:
          `release support: ${contradictoryDecisionBindings}; ` +
          'governance-ready claim handling: Governance-ready claim allowed = yes; Governance-ready claim allowed = no; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: Open governance blockers = 0; Open governance blockers = 1',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory governance decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory governance decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must not include contradictory governance decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not include contradictory governance decision bindings',
    );
  });

  it('rejects governance publication evidence and reviewer summaries that keep decision placeholders', () => {
    const placeholderBindings =
      'Release supported = production deployment candidate/institutional reference; Governance-ready claim allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Open governance blockers = 0/1';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; ${placeholderBindings}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; ${placeholderBindings}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; ${placeholderBindings}`,
        reviewerDecisionSummary:
          'Release supported = production deployment candidate/institutional reference; ' +
          'governance-ready claim handling: Governance-ready claim allowed = yes/no; ' +
          'production-ready claim handling: Production-ready claim allowed = no/yes; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes/no; ' +
          'open governance blocker handling: Open governance blockers = 0/1',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0',
    );
  });

  it('requires reviewer decision summary to bound governance release claims', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary: 'governance release blockers resolved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires exact release-supported wording in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires explicit governance-ready claim handling in reviewer decision summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claims reviewed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires exact governance-ready claim binding in reviewer decision summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes',
    );
  });

  it('rejects reviewer decision summaries that also deny supported release handling', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; release support: none; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: release support must not be none when Release supported is institutional reference',
    );
  });

  it('requires explicit production-ready claim handling in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claims reviewed; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires explicit testnet production-candidate claim handling in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claims reviewed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires governance-ready claim handling rather than claim-allowed shorthand in reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in governance summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim allowed: no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('requires exact production-ready claim denial in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in governance summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim allowed: no; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  });

  it('blocks reviewer decision summaries that approve production-ready governance claims', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: approved; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that leave governance blockers open', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 1 open blocker accepted',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: open governance blockers must be 0',
    );
  });

  it('blocks reviewer decision summaries that close governance blockers while leaving them pending', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling: Open governance blockers = 0; open governance blockers pending key-rotation follow-up',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: open governance blockers must be 0',
    );
  });

  it('blocks reviewer decision summaries that close governance blockers while reporting a nonzero blocker count', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling: Open governance blockers = 0; governance blocker count 1 unresolved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: open governance blockers must be 0',
    );
  });

  it('requires numeric zero for open governance blocker handling in reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: none',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: open governance blockers must be 0',
    );
  });

  it('requires exact open governance blocker handling in reviewer decision summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: open governance blockers must be 0',
    );
  });

  it('requires exact open governance blocker binding in reviewer decision summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0',
    );
  });

  it('accepts exact Open governance blockers binding inside reviewer blocker handling', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling: Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('blocks reviewer decision summaries that approve open governance blockers after closing them', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers; open governance blockers approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not approve open governance blockers',
    );
  });

  it('accepts reviewer decision summaries that explicitly deny forbidden governance boundaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: 0; Open governance blockers = 0; ' +
          'open governance blockers not approved; reviewer approved no open governance blockers; ' +
          'single signer governance not approved; reviewer approved no single signer fallback',
      }),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
  });

  it('accepts reviewer decision summaries that approve absent forbidden governance boundaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: 0; Open governance blockers = 0; ' +
          'reviewer approved absent open governance blockers; ' +
          'reviewer approved absent single signer governance',
      }),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
  });

  it('accepts reviewer decision summaries that approve absence of forbidden governance boundaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: 0; Open governance blockers = 0; ' +
          'absence of open governance blockers approved by reviewer; ' +
          'absence of single signer governance approved by reviewer',
      }),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
  });

  it('accepts reviewer decision summaries that approve lack of forbidden governance boundaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: 0; Open governance blockers = 0; ' +
          'lack of open governance blockers approved by reviewer; ' +
          'reviewer approved lack of single signer governance',
      }),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
  });

  it('accepts reviewer text that approves evidence lacks forbidden governance boundaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: 0; Open governance blockers = 0; ' +
          'evidence lacks governance blockers approved by reviewer; ' +
          'evidence lacks single signer governance approved by reviewer',
      }),
      reviewers: reviewerRows
        .replace(
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; evidence lacks governance blockers approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; evidence lacks single signer fallback approved by reviewer |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Governance owner: notes must not approve open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve single-signer governance',
    );
  });

  it('blocks reviewer decision summaries that approve single-signer governance', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers; single signer governance approved',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
  });

  it('blocks reviewer decision summaries with grant-family approval terms before single-signer governance', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers; reviewer grants single signer governance',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
  });

  it('blocks linked governance evidence rows that approve single-signer fallback', () => {
    const singleSignerApproval = 'reviewer grants single signer fallback';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `artifact://governance/sidechainstate-successor-authorization.log; ${singleSignerApproval}`,
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        `artifact://governance/npm-run-check.log; ${singleSignerApproval}`,
      ),
      rotations: rotationRows.replace(
        `artifact://governance/identify-old-committee-public-keys.log; ${rotationEvidenceFocus('Identify old committee public keys')}`,
        `artifact://governance/identify-old-committee-public-keys.log; ${rotationEvidenceFocus('Identify old committee public keys')}; ${singleSignerApproval}`,
      ),
      positives: positiveRows.replace(
        'artifact://governance/new-committee-signer-gated-mutation.log',
        `artifact://governance/new-committee-signer-gated-mutation.log; ${singleSignerApproval}`,
      ),
      negatives: negativeRows.replace(
        'artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log',
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; ${singleSignerApproval}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; ${singleSignerApproval}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; ${singleSignerApproval}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; ${singleSignerApproval}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Identify old committee public keys: required evidence must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must not approve single-signer governance',
    );
  });

  it('blocks linked governance evidence rows with compatibility-normalized single-signer approval wording', () => {
    const singleSignerApproval =
      'reviewer grants \uFF53\uFF49\uFF4E\uFF47\uFF4C\uFF45 \uFF53\uFF49\uFF47\uFF4E\uFF45\uFF52 fallback';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        `artifact://governance/npm-run-check.log; ${singleSignerApproval}`,
      ),
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          `open governance blocker handling: Open governance blockers = 0; ${singleSignerApproval}`,
      }),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; ${singleSignerApproval} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not approve single-signer governance',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve single-signer governance',
    );
  });

  it('blocks linked governance evidence rows that leave governance blockers open', () => {
    const openBlocker = 'open governance blockers 1 unresolved';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `artifact://governance/sidechainstate-successor-authorization.log; ${openBlocker}`,
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        `artifact://governance/npm-run-check.log; ${openBlocker}`,
      ),
      rotations: rotationRows.replace(
        `artifact://governance/identify-old-committee-public-keys.log; ${rotationEvidenceFocus('Identify old committee public keys')}`,
        `artifact://governance/identify-old-committee-public-keys.log; ${rotationEvidenceFocus('Identify old committee public keys')}; ${openBlocker}`,
      ),
      positives: positiveRows.replace(
        'artifact://governance/new-committee-signer-gated-mutation.log',
        `artifact://governance/new-committee-signer-gated-mutation.log; ${openBlocker}`,
      ),
      negatives: negativeRows.replace(
        'artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log',
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; ${openBlocker}`,
      ),
      reviewers: reviewerRows.replace(
        'governance drill accepted',
        `governance drill accepted; ${openBlocker}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Identify old committee public keys: required evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: evidence must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not include contradictory committee-governance failure markers',
    );
  });

  it('blocks governance publication-update evidence that leaves blockers open', () => {
    const openBlocker = 'open governance blockers 1 unresolved';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; ${openBlocker}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; ${openBlocker}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; ${openBlocker}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not leave governance blockers open',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must not leave governance blockers open',
    );
  });

  it('blocks governance publication-update evidence that closes blockers with textual zero-like terms', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; open governance blockers none',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; governance blockers remaining no',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; open governance blocker handling zero',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
  });

  it('blocks governance publication-update evidence that closes blockers with numeric shorthand', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; governance blocker closure 0',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; governance blocker count 0',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; governance blocker handling 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
  });

  it('requires exact open-governance blocker bindings in publication updates when blockers are closed', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; Governance-ready claim allowed = yes',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; Governance-ready claim allowed = yes',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
  });

  it('accepts exact governance blocker closure bindings in publication updates', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it('constrains governance publication claims to the classified release level', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'institutional reference',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'no',
        openGovernanceBlockers: '1 unresolved rotation blocker',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Release supported must not exceed Drill Classification release level',
    );
    expect(result.errors).toContain(
      'Publication Rules: Governance-ready claim allowed must be yes before committee governance evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Rules: Open governance blockers must be 0 before committee governance evidence can pass',
    );
  });

  it('requires open governance blockers to be the exact numeric zero', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        openGovernanceBlockers: 'none',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Open governance blockers must be 0 before committee governance evidence can pass',
    );
  });

  it('rejects production-ready claims even with production deployment candidate support', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'yes',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Production-ready claim allowed must be no for Gate 6; use Testnet production-candidate claim allowed for testnet production-candidate support',
    );
  });

  it('requires production deployment candidate governance drills to be testnet-scoped', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'patched devnet',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Drill Classification: production deployment candidate requires Environment testnet',
    );
  });

  it('requires production deployment candidate governance publication support to be testnet-scoped', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'patched devnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: production deployment candidate support requires exact Drill Classification Environment = testnet',
    );
  });

  it('blocks production deployment candidate support without exact testnet production-candidate allowance', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'no',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires production-candidate governance drills to carry exact release support', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'institutional reference',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'no',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: production deployment candidate drill requires exact Release supported = production deployment candidate',
    );
  });

  it('blocks testnet production-candidate claims without production deployment candidate support', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseSupported: 'institutional reference',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Testnet production-candidate claim allowed requires production deployment candidate support',
    );
  });

  it('requires exact testnet production-candidate claim allowance in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: allowed after gate pass; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; ' +
          'open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact testnet production-candidate claim denial in governance publication evidence', () => {
    const contradictoryClaimBinding =
      'Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Open governance blockers = 0';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; ${contradictoryClaimBinding}`,
        checklistUpdates:
          `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; ${contradictoryClaimBinding}`,
        externalReviewEvidence:
          `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; ${contradictoryClaimBinding}`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-candidate release support in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
        reviewerDecisionSummary:
          'release supported: production deployment candidate; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact institutional-reference release support in governance reviewer summaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseSupported: 'institutional reference',
        reviewerDecisionSummary:
          'release supported: institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'open governance blocker handling: Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('rejects governance publication updates that reuse one completed evidence target', () => {
    const reusedPublicationUpdateTarget =
      'artifact://governance/completed-gate-6-governance-release-note-update-evidence-completed-gate-6-governance-checklist-update-evidence.md';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `${reusedPublicationUpdateTarget} completed Gate 6 governance release-note update evidence`,
        checklistUpdates:
          `${reusedPublicationUpdateTarget} completed Gate 6 governance checklist update evidence`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates and Required checklist updates must use distinct completed Gate 6 governance evidence targets',
    );
  });

  it.each([
    [
      'release-note update',
      {
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence-completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance release-note update evidence',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence-completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence',
      },
    ],
    [
      'checklist update',
      {
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence-completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance checklist update evidence',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence-completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence',
      },
    ],
  ])('rejects governance external review evidence that reuses the %s target', (_label, overrides) => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows(overrides),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: External review evidence must use a distinct completed Gate 6 governance external review evidence target from Required release-note updates and Required checklist updates',
    );
  });

  it('accepts testnet production-candidate support without production-ready claims', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRuleRows({
        releaseSupported: 'production deployment candidate',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'yes',
        governanceReadyClaimAllowed: 'yes',
        openGovernanceBlockers: '0',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; open governance blocker handling: 0; Open governance blockers = 0',
      }),
    }));

    expect(result.status).toBe('PASS');
    expect(result.publicationDecision).toMatchObject({
      releaseSupported: 'production deployment candidate',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'yes',
      governanceReadyClaimAllowed: 'yes',
    });
  });

  it('rejects linked governance rows that only point to templates or bare validator commands', () => {
    const templateOnlyEvidence =
      '[Committee Governance Evidence Template](committee-governance-evidence-template.md), `npm run governance:validate`';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        templateOnlyEvidence,
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        templateOnlyEvidence,
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log',
        templateOnlyEvidence,
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `${templateOnlyEvidence}; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        'artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log',
        templateOnlyEvidence,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects targetless command-output notes for linked governance rows', () => {
    const targetlessCommandOutput = 'npm run governance:validate command output: PASS';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        targetlessCommandOutput,
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        'npm run check command output: PASS',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        `${targetlessCommandOutput}; m/n threshold quorum lost-key tolerance`,
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `${targetlessCommandOutput}; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `${targetlessCommandOutput}; old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects validator target bindings as linked governance row evidence', () => {
    const validationTargetEvidence =
      '[governance validation target](artifact://governance/completed-committee-governance-evidence.md)';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `${validationTargetEvidence} governance scope authority evidence`,
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        `${validationTargetEvidence} npm run check command output PASS exit code 0`,
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        `${validationTargetEvidence} m/n threshold quorum lost-key tolerance`,
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `${validationTargetEvidence} new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `${validationTargetEvidence} old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          '[governance validation target](artifact://governance/completed-gate-6-governance-release-note-update-evidence.md) completed Gate 6 governance release-note update evidence',
        checklistUpdates:
          '[governance validation target](artifact://governance/completed-gate-6-governance-checklist-update-evidence.md) completed Gate 6 governance checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects separator-delimited validator target bindings as linked governance row evidence', () => {
    const validationTargetEvidence =
      '[committee-governance-validation-target](artifact://governance/completed-committee-governance-evidence.md)';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `${validationTargetEvidence} governance scope authority evidence`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects row-named generic artifact targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/generic-sidechainstate-successor-authorization.log',
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        'artifact://governance/generic-npm-run-check.log',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        'artifact://governance/generic-validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/generic-new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/generic-old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/generic-completed-gate-6-governance-release-note-update-evidence.md',
        checklistUpdates:
          'artifact://governance/generic-completed-gate-6-governance-checklist-update-evidence.md',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects row-named sample governance artifact targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/sample-governance-scope-sidechainstate-successor-authorization.log',
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        'artifact://governance/sample-governance-command-npm-run-check.log',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        'artifact://governance/sample-rotation-validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/sample-committee-positive-new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/sample-negative-check-old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/sample-release-note-update-completed-gate-6-governance-release-note-update-evidence.md',
        checklistUpdates:
          'artifact://governance/sample-checklist-update-completed-gate-6-governance-checklist-update-evidence.md',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete artifact targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/placeholder-sidechainstate-successor-authorization.log',
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        'artifact://governance/todo-npm-run-check.log',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        'artifact://governance/tbd-validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/sample-evidence-new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/example-evidence-old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/placeholder-completed-gate-6-governance-release-note-update-evidence.md',
        checklistUpdates:
          'artifact://governance/todo-completed-gate-6-governance-checklist-update-evidence.md',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete Markdown targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        '[placeholder scope evidence](docs/placeholder-sidechainstate-successor-authorization.log)',
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        '[todo command evidence](docs/todo-npm-run-check.log) npm run check output exit code 0',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        '[tbd rotation evidence](docs/tbd-validate-threshold-policy.log) m/n threshold quorum lost-key tolerance',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `[sample positive evidence](docs/sample-evidence-new-committee-signer-gated-mutation.log) new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `[example negative evidence](docs/example-evidence-old-single-signer-attempts-signer-gated-mutation-after-rotation.log) old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          '[placeholder release-note evidence](docs/placeholder-completed-gate-6-governance-release-note-update-evidence.md) completed Gate 6 governance release-note update evidence',
        checklistUpdates:
          '[todo checklist evidence](docs/todo-completed-gate-6-governance-checklist-update-evidence.md) completed Gate 6 governance checklist update evidence',
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects synthetic artifact targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/synthetic-sidechainstate-successor-authorization.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects synthetic Markdown targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        '[synthetic scope evidence](docs/synthetic-sidechainstate-successor-authorization.log)',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects claim-escalating artifact targets for linked governance evidence', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/sidechainstate-successor-authorization-testnet-production-candidate-certified.log',
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log',
        'artifact://governance/npm-run-check-production-ready-endorsed.log',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        'artifact://governance/validate-threshold-policy-mainnet-production-certified.log; m/n threshold quorum lost-key tolerance',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation-production-ready-endorsed.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation-mainnet-production-certified.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    'artifact://governance/fixture-sidechainstate-successor-authorization.log',
    'artifact://governance/mock-sidechainstate-successor-authorization.log',
    'artifact://governance/dummy-sidechainstate-successor-authorization.log',
    'artifact://governance/fake-sidechainstate-successor-authorization.log',
    'artifact://governance/stub-sidechainstate-successor-authorization.log',
    'artifact://governance/testdata-sidechainstate-successor-authorization.log',
    'artifact://governance/simulated-sidechainstate-successor-authorization.log',
  ])('rejects fixture-style artifact marker %s for linked governance rows', artifactTarget => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        artifactTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    '[fixture](artifact://governance/fixture-sidechainstate-successor-authorization.log)',
    '[mock](artifact://governance/mock-sidechainstate-successor-authorization.log)',
    '[dummy](artifact://governance/dummy-sidechainstate-successor-authorization.log)',
    '[fake](artifact://governance/fake-sidechainstate-successor-authorization.log)',
    '[stub](artifact://governance/stub-sidechainstate-successor-authorization.log)',
    '[testdata](artifact://governance/testdata-sidechainstate-successor-authorization.log)',
    '[simulated](artifact://governance/simulated-sidechainstate-successor-authorization.log)',
  ])('rejects fixture-style Markdown artifact link %s for linked governance rows', markdownTarget => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        markdownTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    {
      variant: 'raw',
      scopeTarget: ['', 'tmp', 'sidechainstate-successor-authorization.log'].join('/'),
      commandTarget: ['file:', '', '', 'C:', 'tmp', 'npm-run-check.log'].join('/'),
      rotationTarget: ['', '', 'governance-share', 'validate-threshold-policy.log'].join('/'),
      positiveTarget: ['', 'home', 'operator', 'new-committee-signer-gated-mutation.log'].join('/'),
      negativeTarget: ['', 'var', 'governance', 'old-single-signer-attempts-signer-gated-mutation-after-rotation.log'].join('/'),
      releaseNoteTarget: ['', 'private', 'governance', 'completed-gate-6-governance-release-note-update-evidence.md'].join('/'),
      checklistTarget: ['file:', '', '', 'C:', 'governance', 'completed-gate-6-governance-checklist-update-evidence.md'].join('/'),
    },
    {
      variant: 'encoded',
      scopeTarget: '%2Ftmp%2Fsidechainstate-successor-authorization.log',
      commandTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fnpm-run-check.log',
      rotationTarget: '%2F%2Fgovernance-share%2Fvalidate-threshold-policy.log',
      positiveTarget: '%2Fhome%2Foperator%2Fnew-committee-signer-gated-mutation.log',
      negativeTarget: '%2Fvar%2Fgovernance%2Fold-single-signer-attempts-signer-gated-mutation-after-rotation.log',
      releaseNoteTarget: '%2Fprivate%2Fgovernance%2Fcompleted-gate-6-governance-release-note-update-evidence.md',
      checklistTarget: 'file%3A%2F%2F%2FC%3A%2Fgovernance%2Fcompleted-gate-6-governance-checklist-update-evidence.md',
    },
    {
      variant: 'embedded encoded',
      scopeTarget: 'artifact://governance/sourceTarget=%2Ftmp%2Fsidechainstate-successor-authorization.log',
      commandTarget: 'artifact://governance/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fnpm-run-check.log',
      rotationTarget:
        'artifact://governance/sourceTarget=%2F%2Fgovernance-share%2Fvalidate-threshold-policy.log',
      positiveTarget:
        'artifact://governance/sourceTarget=%2Fhome%2Foperator%2Fnew-committee-signer-gated-mutation.log',
      negativeTarget:
        'artifact://governance/sourceTarget=%2Fvar%2Fgovernance%2Fold-single-signer-attempts-signer-gated-mutation-after-rotation.log',
      releaseNoteTarget:
        'artifact://governance/sourceTarget=%2Fprivate%2Fgovernance%2Fcompleted-gate-6-governance-release-note-update-evidence.md',
      checklistTarget:
        'artifact://governance/sourceTarget=file%3A%2F%2F%2FC%3A%2Fgovernance%2Fcompleted-gate-6-governance-checklist-update-evidence.md',
    },
  ])(
    'rejects $variant local-only Markdown targets for linked governance evidence',
    ({
      scopeTarget,
      commandTarget,
      rotationTarget,
      positiveTarget,
      negativeTarget,
      releaseNoteTarget,
      checklistTarget,
    }) => {
      const result = validateCommitteeGovernanceEvidence(governanceEvidence({
        scopes: scopeRows.replace(
          'artifact://governance/sidechainstate-successor-authorization.log',
          `[scope evidence](${scopeTarget})`,
        ),
        commands: commandRows.replace(
          'artifact://governance/npm-run-check.log',
          `[command evidence](${commandTarget}) npm run check output exit code 0`,
        ),
        rotations: rotationRows.replace(
          'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
          `[rotation evidence](${rotationTarget}) m/n threshold quorum lost-key tolerance`,
        ),
        positives: positiveRows.replace(
          `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
          `[positive evidence](${positiveTarget}) new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        ),
        negatives: negativeRows.replace(
          `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
          `[negative evidence](${negativeTarget}) old signer signer-gated mutation rejected ${OLD_COMMITTEE_KEY_HASH}`,
        ),
        publicationRules: publicationRuleRows({
          releaseNoteUpdates:
            `[release-note evidence](${releaseNoteTarget}) completed Gate 6 governance release-note update evidence`,
          checklistUpdates:
            `[checklist evidence](${checklistTarget}) completed Gate 6 governance checklist update evidence`,
        }),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Required Commands: npm run check: linked status requires completed command output, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Rotation Plan: Validate threshold policy: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Positive Checks: New committee executes signer-gated mutation after rotation: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Negative Checks: Old single signer attempts signer-gated mutation after rotation: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Rules: Required checklist updates must include completed Gate 6 governance checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('rejects sensitive or runtime Markdown targets for linked governance evidence', () => {
    for (const target of [
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const result = validateCommitteeGovernanceEvidence(governanceEvidence({
        scopes: scopeRows.replace(
          'artifact://governance/sidechainstate-successor-authorization.log',
          `[scope evidence](${target}) completed SideChainState successor authorization evidence`,
        ),
      }));

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
      );
    }
  });

  it('accepts concrete governance artifact names that mention sample size or template removal', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/sample-size-analysis-sidechainstate-successor-authorization.log',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        'artifact://governance/template-removal-audit-validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('accepts command-output context when linked governance rows include a concrete evidence target', () => {
    const targetedCommandOutput =
      'npm run governance:validate command output: PASS; artifact://governance/sidechainstate-successor-authorization.log';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        targetedCommandOutput,
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects validation-target-only governance evidence bindings', () => {
    const validationTargetLabel = 'committee governance validation target';
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        `[${validationTargetLabel}](artifact://governance/sidechainstate-successor-authorization.log)`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          `[${validationTargetLabel}](artifact://governance/completed-gate-6-governance-release-note-update-evidence.md) completed Gate 6 governance release-note update evidence`,
      }),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 6 governance release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('accepts concrete governance evidence before validation-target bindings', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      scopes: scopeRows.replace(
        'artifact://governance/sidechainstate-successor-authorization.log',
        'artifact://governance/sidechainstate-successor-authorization.log; committee governance validation target artifact://governance/validation/sidechainstate-successor-authorization-input.md',
      ),
      commands: commandRows.replace(
        'artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0',
        'artifact://governance/npm-run-check.log; npm run check command output PASS exit code 0; committee governance validation target artifact://governance/validation/npm-run-check-input.md',
      ),
      rotations: rotationRows.replace(
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance',
        'artifact://governance/validate-threshold-policy.log; m/n threshold quorum lost-key tolerance; committee governance validation target artifact://governance/validation/validate-threshold-policy-input.md',
      ),
      positives: positiveRows.replace(
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}`,
        `artifact://governance/new-committee-signer-gated-mutation.log; new committee signer-gated mutation accepted by threshold signers ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2}; committee governance validation target artifact://governance/validation/new-committee-signer-gated-mutation-input.md`,
      ),
      negatives: negativeRows.replace(
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}`,
        `artifact://governance/old-single-signer-attempts-signer-gated-mutation-after-rotation.log; old signer ${OLD_COMMITTEE_KEY_HASH}; committee governance validation target artifact://governance/validation/old-single-signer-attempt-input.md`,
      ),
      publicationRules: publicationRuleRows({
        releaseNoteUpdates:
          'artifact://governance/completed-gate-6-governance-release-note-update-evidence.md completed Gate 6 governance release-note update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; committee governance validation target artifact://governance/validation/release-note-input.md',
        checklistUpdates:
          'artifact://governance/completed-gate-6-governance-checklist-update-evidence.md completed Gate 6 governance checklist update evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; committee governance validation target artifact://governance/validation/checklist-input.md',
        externalReviewEvidence:
          'artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence; Governance-ready claim allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Open governance blockers = 0; committee governance validation target artifact://governance/validation/external-review-input.md',
      }),
    }));

    expect(result.status).toBe('PASS');
  });

  it.each([
    'artifact://',
    'artifact:// ',
    'artifact:// governance scope evidence',
    'artifact://completed governance scope evidence',
  ])(
    'rejects targetless artifact marker %s for linked governance rows',
    targetlessArtifact => {
      const result = validateCommitteeGovernanceEvidence(governanceEvidence({
        scopes: scopeRows.replace(
          'artifact://governance/sidechainstate-successor-authorization.log',
          targetlessArtifact,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Scope: SideChainState successor authorization: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker',
      );
    },
  );

  it('requires reviewer sign-off decisions', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: '| Governance owner | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Governance owner: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Governance owner: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Governance owner: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Governance owner: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Governance owner | reviewer-a | block | 2026-05-14 | rotation blocked unresolved |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Security reviewer | reviewer-a | approve | May 14 2026 | governance drill accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the drill classification date', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-13 | governance drill accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: Date must not be before Drill Classification Date',
    );
  });

  it('requires reviewer notes to state concrete governance-readiness outcomes', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed governance drill |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete governance-readiness outcome',
    );
  });

  it('rejects reviewer notes with production-ready or mainnet production claim wording', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows
        .replace(
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; production-ready governance claim approved |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; mainnet production release accepted |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it('rejects reviewer notes with contradictory committee governance failure markers', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not include contradictory committee-governance failure markers',
    );
  });

  it('rejects reviewer notes with contradictory exact governance decision bindings', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; Governance-ready claim allowed = yes; Governance-ready claim allowed = no |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not include contradictory governance decision bindings',
    );
  });

  it('rejects reviewer notes that approve open blockers or single-signer governance', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows
        .replace(
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; approved open governance blockers |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; approved single signer governance |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not approve open governance blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve single-signer governance',
    );
  });

  it('rejects reviewer notes that approve governance blockers with active verbs', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows
        .replace(
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; reviewer supports governance blockers |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; reviewer allows single signer fallback |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not approve open governance blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve single-signer governance',
    );
  });

  it('rejects reviewer notes with grant-family approval terms before governance boundaries', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows
        .replace(
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; reviewer grants governance blockers',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; reviewer grants single signer fallback',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: notes must not approve open governance blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve single-signer governance',
    );
  });

  it('rejects governance approvals written with certification-family approval terms', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      publicationRules: publicationRuleRows({
        reviewerDecisionSummary:
          'release support: institutional reference; governance-ready claim handling: allowed; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed; open governance blocker handling: 0 open blockers; single signer governance certified; governance blockers endorsed',
      }),
      reviewers: reviewerRows
        .replace(
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted; open governance blockers accredited |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | governance drill accepted; single signer fallback recommended |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Rules: Reviewer decision summary must not approve open governance blockers');
    expect(result.errors).toContain('Publication Rules: Reviewer decision summary must not approve single-signer governance');
    expect(result.errors).toContain('Reviewer Sign-Off: Governance owner: notes must not approve open governance blockers');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: notes must not approve single-signer governance');
  });

  it('requires governance owner sign-off to match the drill classification identity', () => {
    const result = validateCommitteeGovernanceEvidence(governanceEvidence({
      reviewers: reviewerRows.replace(
        '| Governance owner | reviewer-a | approve | 2026-05-14 | governance drill accepted |',
        '| Governance owner | reviewer-b | approve | 2026-05-14 | governance drill accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Governance owner: name must match Drill Classification Reviewer',
    );
  });

  it('blocks missing tables without throwing', () => {
    const result = validateCommitteeGovernanceEvidence('# Incomplete governance drill\n\n## Drill Classification\n\nNo table yet.\n');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('## Scope: table not found');
    expect(result.errors).toContain('## Required Commands: table not found');
    expect(result.errors).toContain('## Rotation Plan: table not found');
    expect(result.errors).toContain('## Positive Checks: missing required section');
    expect(result.errors).toContain('## Positive Checks: table not found');
    expect(result.errors).toContain('## Negative Checks: table not found');
    expect(result.errors).toContain('Publication Rules: Release supported is required');
    expect(result.errors).toContain('Publication Rules: Required release-note updates is required');
    expect(result.errors).toContain('## Reviewer Sign-Off: table not found');
  });
});

function publicationRuleRows(overrides: {
  releaseSupported?: string;
  productionReadyClaimAllowed?: string;
  testnetProductionCandidateClaimAllowed?: string;
  governanceReadyClaimAllowed?: string;
  openGovernanceBlockers?: string;
  releaseNotesUpdated?: string;
  releaseNoteUpdates?: string;
  checklistUpdates?: string;
  externalReviewEvidence?: string;
  reviewerDecisionSummary?: string;
} = {}): string {
  const releaseSupported = overrides.releaseSupported ?? 'institutional reference';
  const productionReadyClaimAllowed = overrides.productionReadyClaimAllowed ?? 'no';
  const testnetProductionCandidateClaimAllowed = overrides.testnetProductionCandidateClaimAllowed ?? 'no';
  const governanceReadyClaimAllowed = overrides.governanceReadyClaimAllowed ?? 'yes';
  const openGovernanceBlockers = overrides.openGovernanceBlockers ?? '0';
  const publicationUpdateBindings = [
    governanceReadyClaimAllowed === 'yes' ? 'Governance-ready claim allowed = yes' : '',
    productionReadyClaimAllowed === 'no' ? 'Production-ready claim allowed = no' : '',
    releaseSupported === 'production deployment candidate' ? 'Release supported = production deployment candidate' : '',
    testnetProductionCandidateClaimAllowed === 'yes' || testnetProductionCandidateClaimAllowed === 'no'
      ? `Testnet production-candidate claim allowed = ${testnetProductionCandidateClaimAllowed}`
      : '',
    openGovernanceBlockers === '0' ? 'Open governance blockers = 0' : '',
  ].filter(Boolean).map(binding => `; ${binding}`).join('');

  return [
    ['Release supported', releaseSupported],
    ['Production-ready claim allowed', productionReadyClaimAllowed],
    ['Testnet production-candidate claim allowed', testnetProductionCandidateClaimAllowed],
    ['Governance-ready claim allowed', governanceReadyClaimAllowed],
    ['Open governance blockers', openGovernanceBlockers],
    ['Release notes updated', overrides.releaseNotesUpdated ?? 'yes'],
    [
      'Required release-note updates',
      overrides.releaseNoteUpdates ??
        `artifact://governance/completed-gate-6-governance-release-note-update-evidence.md${publicationUpdateBindings}`,
    ],
    [
      'Required checklist updates',
      overrides.checklistUpdates ??
        `artifact://governance/completed-gate-6-governance-checklist-update-evidence.md${publicationUpdateBindings}`,
    ],
    [
      'External review evidence',
      overrides.externalReviewEvidence ??
        `artifact://governance/completed-gate-6-governance-external-review-evidence.md completed Gate 6 governance external review evidence${publicationUpdateBindings}`,
    ],
    [
      'Reviewer decision summary',
      overrides.reviewerDecisionSummary ??
        'Release supported = institutional reference; governance-ready claim handling: Governance-ready claim allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; open governance blocker handling: Open governance blockers = 0',
    ],
  ].map(([field, value]) => `| ${field} | ${value} |`).join('\n');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function rotationEvidenceFocus(step: string): string {
  const focusByStep: Record<string, string> = {
    'Identify old committee public keys': `old committee public keys hashes only ${OLD_COMMITTEE_KEY_HASH}`,
    'Identify new committee public keys': `new committee public keys hashes only ${NEW_COMMITTEE_KEY_HASH_1} ${NEW_COMMITTEE_KEY_HASH_2} ${NEW_COMMITTEE_KEY_HASH_3}`,
    'Validate threshold policy': 'm/n threshold quorum lost-key tolerance',
    'Simulate member loss or lost-key tolerance': 'member-loss lost-key tolerance drill',
    'Compile affected contracts': 'contracts:check compile placeholder validation',
    'Evaluate old and new signer behavior': 'old and new signer signing guard behavior',
    'Preserve singleton continuity': 'singleton NFT register script value continuity',
    'Reconcile deployment state': 'deployment-state network singleton reconciliation; npm run governance:reconcile:validate command output PASS exit code 0',
    'Verify rollback plan': 'rollback previous-authority recovery path',
  };

  return focusByStep[step] ?? 'unmapped rotation focus';
}
