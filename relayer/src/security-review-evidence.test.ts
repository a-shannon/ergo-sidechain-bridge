import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  parseScopeCoverageRows,
  validateSecurityReviewEvidence,
} from './security-review-evidence.js';

const scopeRows = [
  'ErgoScript contracts',
  'Relayer signing',
  'AVL proof generation',
  'Settlement reconciliation',
  'Sidechain finality and burn validity',
  'Operator recovery',
  'Dependency risk',
].map(area =>
  `| ${area} | covered | artifact://security/${slug(area)}.log | none | ${scopeRiskFocus(area)} | linked |`,
).join('\n');

const evidenceRows = [
  'Clean checkout CI run',
  '`npm run check` output',
  '`npm run wasm:test` output',
  'Fresh local devnet rehearsal',
  'Fresh testnet rehearsal',
  'Failed broadcast / phantom AVL drill',
  'SQLite/AVL backup-restore drill',
  'Batch settlement check/submit/confirm rehearsal',
  'Release notes draft',
].map(item => `| ${item} | linked | artifact://security/${slug(item)}.log | verified for Gate 4 review |`).join('\n');

const findingRows = [
  'Critical findings',
  'High findings',
  'Medium findings',
  'Low findings',
  'Informational findings',
  'Accepted risks',
  'Publication blockers',
].map(item => `| ${item} | 0 | 0 | artifact://security/${slug(item)}.log | linked |`).join('\n');

const negativeRows = [
  ['Can a production path sign through the Ergo node wallet?', 'no, checked against evidence'],
  [
    'Can default production/testnet mode sign an unsafe ContextExtension shape?',
    'no, checked against evidence',
  ],
  [
    'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
    'no, checked against evidence',
  ],
  ['Can a failed broadcast or reorg insert a phantom DUP key?', 'no, checked against evidence'],
  [
    'Can a batch settlement accept a wrong-recipient, low-value, or reused payout?',
    'no, checked against evidence',
  ],
  [
    'Can a same-recipient batch collision pay fewer outputs than expected?',
    'no, checked against evidence',
  ],
  [
    'Can stale SPV tracker or DUP history build against the wrong singleton digest?',
    'no, checked against evidence',
  ],
  [
    'Can trusted burn interpretation be mistaken for trustless verification?',
    'no, checked against evidence',
  ],
  [
    'Can an operator recover from SQLite loss without private maintainer context?',
    'yes, recoverable with linked runbook and backup-restore evidence',
  ],
].map(([question, answer]) => negativeRow(question, answer)).join('\n');

const reviewerRows = [
  'Lead reviewer',
  'Security owner',
  'Maintainer',
  'Operator reviewer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | security review accepted |`).join('\n');

function securityReviewEvidence(overrides: {
  scopes?: string;
  evidence?: string;
  findings?: string;
  negatives?: string;
  reviewers?: string;
  releaseLevel?: string;
  environment?: string;
  reviewerOrganization?: string;
  organizationType?: string;
  independence?: string;
  finalDecision?: string;
  releaseSupported?: string;
  productionReady?: string;
  testnetProductionCandidate?: string;
  openCriticalHigh?: string;
  acceptedRisksReflected?: string;
  checklistUpdates?: string;
  releaseNoteUpdates?: string;
  decisionSummary?: string;
} = {}): string {
  return `
# Completed Independent Security Review

## Review Classification

| Field | Value |
|---|---|
| Review name | external review |
| Reviewed commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Environment | ${overrides.environment ?? 'staging'} |
| Reviewer organization | ${overrides.reviewerOrganization ?? 'ReviewLab Alpha security desk'} |
| Reviewer organization type | ${overrides.organizationType ?? 'external audit firm'} |
| Lead reviewer | reviewer-a |
| Reviewer independence | ${overrides.independence ?? 'independent external'} |
| Review period | 2026-05-01 to 2026-05-14 |
| Final decision | ${overrides.finalDecision ?? 'approve'} |
| Date | 2026-05-14 |

## Required Scope Coverage

| Area | Coverage | Evidence | Finding IDs | Risk focus reviewed | Status |
|---|---|---|---|---|---|
${overrides.scopes ?? scopeRows}

## Required Evidence Package

| Evidence | Status | Link or artifact | Reviewer note |
|---|---|---|---|
${overrides.evidence ?? evidenceRows}

## Finding Disposition

| Finding class | Count | Open critical/high | Closure evidence | Status |
|---|---|---|---|---|
${overrides.findings ?? findingRows}

## Required Negative Review Checks

| Question | Reviewer answer | Evidence | Status |
|---|---|---|---|
${overrides.negatives ?? negativeRows}

## Publication Decision

| Field | Value |
|---|---|
| Release supported | ${overrides.releaseSupported ?? 'institutional reference'} |
| Production-ready claim allowed | ${overrides.productionReady ?? 'no'} |
| Testnet production-candidate claim allowed | ${overrides.testnetProductionCandidate ?? 'no'} |
| Critical/high findings open | ${overrides.openCriticalHigh ?? '0'} |
| Accepted risks reflected in release notes | ${overrides.acceptedRisksReflected ?? 'yes'} |
| Required release checklist updates | ${overrides.checklistUpdates ?? 'artifact://security/checklist-review.log accepted-risk checklist updates copied; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes'} |
| Required release-note updates | ${overrides.releaseNoteUpdates ?? 'artifact://security/release-notes-review.log accepted-risk release-note updates copied; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes'} |
| Reviewer decision summary | ${overrides.decisionSummary ?? 'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical/high findings open = 0; Accepted risks reflected in release notes = yes'} |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('security review evidence validation', () => {
  it('parses required scope rows', () => {
    const rows = parseScopeCoverageRows(securityReviewEvidence());

    expect(rows[0]).toMatchObject({
      area: 'ErgoScript contracts',
      coverage: 'covered',
      riskFocus: 'HEIGHT singleton payout binding reviewed',
      status: 'linked',
    });
  });

  it('passes when independent security review evidence is fully structured', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence());

    expect(result.status).toBe('PASS');
    expect(result.scopeRows).toHaveLength(7);
    expect(result.classification).toMatchObject({
      reviewedCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      environment: 'staging',
      reviewerOrganization: 'ReviewLab Alpha security desk',
      reviewerOrganizationType: 'external audit firm',
      leadReviewer: 'reviewer-a',
      reviewerIndependence: 'independent external',
      reviewPeriod: '2026-05-01 to 2026-05-14',
      finalDecision: 'approve',
      date: '2026-05-14',
    });
    expect(result.message).toContain('7 scope areas');
  });

  it('prints independent-review release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-security-review-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run security:validate');
    expect(result.stdout).toContain('completed Independent Security Review Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --security-review-evidence');
    expect(result.stdout).toContain('security review validation target');
    expect(result.stdout).toContain('required evidence package');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('A standalone PASS is not release authorization');
    expect(result.stdout).toContain('Production-ready/mainnet claims remain blocked');
    expect(result.stdout).toContain('Structural issues = 0');
    expect(result.stdout).toContain('Critical/high findings open = 0');
    expect(result.stdout).toContain('Publication blockers = 0');
    expect(result.stdout).not.toContain('zero structural issues');
    expect(result.stdout).not.toContain('zero critical/high findings');
    expect(result.stdout).toContain(
      'does not audit dependencies, sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('writes a sanitized security review validation blocker report with issue groups', () => {
    const reportDir = mkdtempSync(join(process.cwd(), '.tmp-security-report-'));
    const reportPath = join(reportDir, 'blocked-report.md');
    const reportTarget = `${reportDir.slice(process.cwd().length + 1).replace(/\\/g, '/')}/blocked-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-security-review-evidence.ts',
          '../evidence/security/gate4-independent-security-review-blocker-map-2026-06-25-2f0163fd.md',
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Security review evidence BLOCKED');
      expect(result.stdout).toContain('Wrote security review validation report to --report-out target.');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('# Security Review Evidence Validation Report');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Exit code | 1 |');
      expect(report).toContain('| Structural issues | 43 |');
      expect(report).toContain(
        '| Validated target | ../evidence/security/gate4-independent-security-review-blocker-map-2026-06-25-2f0163fd.md |',
      );
      expect(report).toContain('| Review classification | 1 |');
      expect(report).toContain('| Publication decision | 2 |');
      expect(report).toContain('| Required scope coverage | 14 |');
      expect(report).toContain('| Required evidence package | 5 |');
      expect(report).toContain('| Finding disposition | 8 |');
      expect(report).toContain('| Required negative review checks | 9 |');
      expect(report).toContain('| Reviewer sign-off | 4 |');
      expect(report).toContain(
        'does not authorize public claims, release claims, publishing, deployment, accepted-risk closure, review approval, or transaction broadcast',
      );
      expect(report).toContain(
        '| Transaction broadcast, submit, deploy, audit approval, accepted-risk closure, or state mutation performed | no |',
      );
      const windowsHomePrefix = ['C:', 'Users'].join(String.fromCharCode(92));
      expect(report).not.toContain(windowsHomePrefix);
      expect(report).not.toContain('privateKey');
      expect(report).not.toContain('mnemonic');
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it('requires security review dates to use ISO calendar format', () => {
    const result = validateSecurityReviewEvidence(
      securityReviewEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Date must use YYYY-MM-DD');
  });

  it('requires reviewed commits to use commit SHA format', () => {
    const result = validateSecurityReviewEvidence(
      securityReviewEvidence().replace('| Reviewed commit | abc1234 |', '| Reviewed commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Reviewed commit must be a 7-40 character Git commit SHA');
  });

  it('requires review periods to use an ordered ISO date range', () => {
    const malformed = validateSecurityReviewEvidence(
      securityReviewEvidence().replace(
        '| Review period | 2026-05-01 to 2026-05-14 |',
        '| Review period | May 1 to May 14 |',
      ),
    );
    const backwards = validateSecurityReviewEvidence(
      securityReviewEvidence().replace(
        '| Review period | 2026-05-01 to 2026-05-14 |',
        '| Review period | 2026-05-14 to 2026-05-01 |',
      ),
    );

    expect(malformed.status).toBe('BLOCKED');
    expect(malformed.errors).toContain('Review Classification: Review period must use YYYY-MM-DD to YYYY-MM-DD');
    expect(backwards.status).toBe('BLOCKED');
    expect(backwards.errors).toContain('Review Classification: Review period start date must not be after end date');
  });

  it('requires review periods to end before the review date', () => {
    const result = validateSecurityReviewEvidence(
      securityReviewEvidence().replace('| Date | 2026-05-14 |', '| Date | 2026-05-10 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Review period end date must not be after Date');
  });

  it('requires an external reviewer organization type', () => {
    const result = validateSecurityReviewEvidence(
      securityReviewEvidence().replace('| Reviewer organization type | external audit firm |\n', ''),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Reviewer organization type is required');
  });

  it('rejects generic reviewer organization placeholders', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewerOrganization: 'external security team',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Reviewer organization must identify a concrete external security reviewer organization or affiliation',
    );
  });

  it('rejects duplicate security review classification and publication decision fields', () => {
    const result = validateSecurityReviewEvidence(
      securityReviewEvidence()
        .replace('| Reviewed commit | abc1234 |', '| Reviewed commit | abc1234 |\n| Reviewed commit | def5678 |')
        .replace('| Release supported | institutional reference |', '| Release supported | institutional reference |\n| Release supported | validated PoC |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Reviewed commit: duplicate required field');
    expect(result.errors).toContain('Publication Decision: Release supported: duplicate required field');
  });

  it('blocks missing or pending scope coverage before Gate 4 evidence can pass', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: '| ErgoScript contracts | blocker | artifact://security/contracts.log | SEC-001 | HEIGHT singleton payout binding reviewed | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Scope Coverage: Relayer signing: missing required row');
    expect(result.errors).toContain(
      'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
    );
    expect(result.errors).toContain(
      'Required Scope Coverage: ErgoScript contracts: status must be linked before security review evidence can pass',
    );
  });

  it('rejects duplicate required security-review rows', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: `${scopeRows}\n| Relayer signing | covered | artifact://security/relayer-signing-second.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Scope Coverage: Relayer signing: duplicate required row');
  });

  it('requires scope coverage to cite area-specific risk focus', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows
        .replace(
          '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
          '| Relayer signing | covered | artifact://security/relayer-signing.log | none | reviewed | linked |',
        )
        .replace(
          '| Dependency risk | covered | artifact://security/dependency-risk.log | none | sigma-rust Fleet dependency lockfile upgrade reviewed | linked |',
          '| Dependency risk | covered | artifact://security/dependency-risk.log | none | | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: risk focus must mention node-wallet, ContextExtension, broadcast, or signing controls',
    );
    expect(result.errors).toContain('Required Scope Coverage: Dependency risk: risk focus is required');
  });

  it('requires linked evidence package rows with artifacts and notes', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: '| Clean checkout CI run | linked | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence Package: `npm run check` output: missing required row');
    expect(result.errors).toContain('Required Evidence Package: Clean checkout CI run: link or artifact marker is required');
    expect(result.errors).toContain('Required Evidence Package: Clean checkout CI run: reviewer note is required');
  });

  it('requires evidence package reviewer notes to state a concrete outcome', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | reviewed |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: reviewer note must state verified, accepted, pass/fail, blocker, match, or reconciliation outcome',
    );
  });

  it('rejects evidence package reviewer notes with slash-delimited outcome alternatives', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | passed/failed for Gate 4 review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: reviewer note must use one concrete outcome without slash-delimited alternatives',
    );
  });

  it('requires evidence package artifacts to identify the evidence item', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: evidenceRows
        .replace(
          '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
          '| `npm run check` output | linked | artifact://security/completed-security-review-artifact.log | verified for Gate 4 review |',
        )
        .replace(
          '| Fresh testnet rehearsal | linked | artifact://security/fresh-testnet-rehearsal.log | verified for Gate 4 review |',
          '| Fresh testnet rehearsal | linked | artifact://security/completed-rehearsal-review-artifact.log | verified for Gate 4 review |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: evidence artifact must identify npm run check output',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: Fresh testnet rehearsal: evidence artifact must identify testnet rehearsal',
    );
  });

  it('rejects linked security review evidence that only points to templates or bare validator commands', () => {
    const templateOnlyEvidence =
      '[Independent Security Review Evidence Template](independent-security-review-evidence-template.md), `npm run security:validate`';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        `| Relayer signing | covered | ${templateOnlyEvidence} | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
      ),
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        `| Clean checkout CI run | linked | ${templateOnlyEvidence} | verified for Gate 4 review |`,
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        `| Critical findings | 0 | 0 | ${templateOnlyEvidence} | linked |`,
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        `| Can any settlement broadcast without \`BRIDGE_BROADCAST_ENABLED=true\`? | no, checked against evidence | ${templateOnlyEvidence} | linked |`,
      ),
      checklistUpdates: templateOnlyEvidence,
      releaseNoteUpdates: templateOnlyEvidence,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: link or artifact must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
    );
  });

  it('rejects validation-target-only evidence for linked security review rows', () => {
    const validationTargetLabel = 'security review validation target';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        `| Relayer signing | covered | [${validationTargetLabel}](artifact://security/relayer-signing.log) Relayer signing evidence | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
      ),
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        `| Clean checkout CI run | linked | [${validationTargetLabel}](artifact://security/clean-checkout-ci-run.log) Clean checkout CI run evidence | verified for Gate 4 review |`,
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        `| Critical findings | 0 | 0 | [${validationTargetLabel}](artifact://security/critical-findings.log) Critical findings closure evidence | linked |`,
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        `| Can any settlement broadcast without \`BRIDGE_BROADCAST_ENABLED=true\`? | no, checked against evidence | [${validationTargetLabel}](artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log) broadcast negative check evidence | linked |`,
      ),
      checklistUpdates:
        `[${validationTargetLabel}](artifact://security/completed-gate-4-checklist-update-evidence.md) accepted-risk checklist updates copied`,
      releaseNoteUpdates:
        `[${validationTargetLabel}](artifact://security/completed-gate-4-release-note-update-evidence.md) accepted-risk release-note updates copied`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: link or artifact must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
    );
  });

  it('accepts concrete security review evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://security/validation/security-review-validate-input.md';
    const validationTargetBinding = `security review validation target ${validationTarget}`;
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        `| Relayer signing | covered | artifact://security/relayer-signing.log; ${validationTargetBinding} | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
      ),
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        `| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log; ${validationTargetBinding} | verified for Gate 4 review |`,
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        `| Critical findings | 0 | 0 | artifact://security/critical-findings.log; ${validationTargetBinding} | linked |`,
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        `| Can any settlement broadcast without \`BRIDGE_BROADCAST_ENABLED=true\`? | no, checked against evidence | artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log; ${validationTargetBinding} | linked |`,
      ),
      checklistUpdates:
        `artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes; ${validationTargetBinding}`,
      releaseNoteUpdates:
        `artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes; ${validationTargetBinding}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects security review evidence with structured failure fields', () => {
    const emptyStructuredFields = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log; {"errors":[]} errorCount: 0 | verified for Gate 4 review |',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        'artifact://security/ergoscript-contracts.log',
        'artifact://security/ergoscript-contracts.log {"errors":["scope gap"]}',
      ),
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log; {"failures":{"ci":"blocked"}} | verified for Gate 4 review |',
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log; errorCount: 1 | linked |',
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no, checked against evidence | artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log; failureTotal: 1 | linked |',
      ),
      checklistUpdates:
        'artifact://security/checklist-review.log accepted-risk checklist updates copied; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes; {"errors":["checklist gap"]}',
      releaseNoteUpdates:
        'artifact://security/release-notes-review.log accepted-risk release-note updates copied; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes; {"failures":{"release":"blocked"}}',
      reviewers: reviewerRows.replace(
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; failureTotal: 1 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: ErgoScript contracts: evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: link or artifact must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory security-review failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory security-review failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Lead reviewer: notes must not include contradictory security review failure markers',
    );
  });

  it('rejects linked scope and evidence rows with targetless command-output notes', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        '| Relayer signing | covered | npm run security:validate command output: PASS | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
      ),
      evidence: evidenceRows.replace(
        '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
        '| `npm run check` output | linked | npm run check command output: PASS | verified for Gate 4 review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
    );
  });

  it('rejects linked security evidence rows with contradictory failure markers', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        'artifact://security/relayer-signing.log',
        'artifact://security/relayer-signing.log command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
      ),
      evidence: evidenceRows.replace(
        'artifact://security/npm-run-check-output.log',
        'artifact://security/npm-run-check-output.log npm run check command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
      ),
      findings: findingRows.replace(
        'artifact://security/critical-findings.log',
        'artifact://security/critical-findings.log closure validation BLOCKED with 1 structural issue',
      ),
      negatives: negativeRows.replace(
        'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log',
        'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log negative check validation BLOCKED with 1 structural issue',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must not include contradictory security review failure markers',
    );
  });

  it('rejects linked security evidence rows with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 security review validation\uFF1ABLOCKED with \uFF11 structural issue';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        'artifact://security/relayer-signing.log',
        `artifact://security/relayer-signing.log ${contradictoryEvidence}`,
      ),
      evidence: evidenceRows.replace(
        'artifact://security/npm-run-check-output.log',
        `artifact://security/npm-run-check-output.log ${contradictoryEvidence}`,
      ),
      findings: findingRows.replace(
        'artifact://security/critical-findings.log',
        `artifact://security/critical-findings.log ${contradictoryEvidence}`,
      ),
      negatives: negativeRows.replace(
        'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log',
        `artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log ${contradictoryEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must not include contradictory security review failure markers',
    );
  });

  it('rejects linked security evidence rows with remaining issue markers', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        'artifact://security/relayer-signing.log',
        'artifact://security/relayer-signing.log command output: PASS exit code 0; Remaining issues: unresolved signer review blocker',
      ),
      evidence: evidenceRows.replace(
        'artifact://security/npm-run-check-output.log',
        'artifact://security/npm-run-check-output.log npm run check command output: PASS exit code 0; Remaining issues: unresolved check evidence blocker',
      ),
      findings: findingRows.replace(
        'artifact://security/critical-findings.log',
        'artifact://security/critical-findings.log closure validation PASS exit code 0; Remaining issues: unresolved critical finding blocker',
      ),
      negatives: negativeRows.replace(
        'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log',
        'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log negative check validation PASS exit code 0; Remaining issues: unresolved broadcast negative-check blocker',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must not include contradictory security review failure markers',
    );
  });

  it('rejects linked security evidence rows with open or known issue markers', () => {
    for (const issueMarker of [
      'Open issues: unresolved security review blocker',
      'Known issues: unresolved security review blocker',
      'Open issue count > 0',
      'Known findings total >= 1',
      'Pending blockers count above zero',
    ]) {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        scopes: scopeRows.replace(
          'artifact://security/relayer-signing.log',
          `artifact://security/relayer-signing.log command output: PASS exit code 0; ${issueMarker}`,
        ),
        evidence: evidenceRows.replace(
          'artifact://security/npm-run-check-output.log',
          `artifact://security/npm-run-check-output.log npm run check command output: PASS exit code 0; ${issueMarker}`,
        ),
        findings: findingRows.replace(
          'artifact://security/critical-findings.log',
          `artifact://security/critical-findings.log closure validation PASS exit code 0; ${issueMarker}`,
        ),
        negatives: negativeRows.replace(
          'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log',
          `artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log negative check validation PASS exit code 0; ${issueMarker}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Scope Coverage: Relayer signing: evidence must not include contradictory security review failure markers',
      );
      expect(result.errors).toContain(
        'Required Evidence Package: `npm run check` output: link or artifact must not include contradictory security review failure markers',
      );
      expect(result.errors).toContain(
        'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
      );
      expect(result.errors).toContain(
        'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must not include contradictory security review failure markers',
      );
    }
  });

  it('rejects linked security evidence rows with open or pending finding markers', () => {
    for (const issueMarker of [
      'Open findings: unresolved security review blocker',
      'Pending findings: unresolved security review blocker',
    ]) {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        scopes: scopeRows.replace(
          'artifact://security/relayer-signing.log',
          `artifact://security/relayer-signing.log command output: PASS exit code 0; ${issueMarker}`,
        ),
        evidence: evidenceRows.replace(
          'artifact://security/npm-run-check-output.log',
          `artifact://security/npm-run-check-output.log npm run check command output: PASS exit code 0; ${issueMarker}`,
        ),
        findings: findingRows.replace(
          'artifact://security/critical-findings.log',
          `artifact://security/critical-findings.log closure validation PASS exit code 0; ${issueMarker}`,
        ),
        negatives: negativeRows.replace(
          'artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log',
          `artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log negative check validation PASS exit code 0; ${issueMarker}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Scope Coverage: Relayer signing: evidence must not include contradictory security review failure markers',
      );
      expect(result.errors).toContain(
        'Required Evidence Package: `npm run check` output: link or artifact must not include contradictory security review failure markers',
      );
      expect(result.errors).toContain(
        'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
      );
      expect(result.errors).toContain(
        'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must not include contradictory security review failure markers',
      );
    }
  });

  it('rejects linked security evidence rows with trailing unresolved count markers', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows.replace(
        'artifact://security/critical-findings.log',
        'artifact://security/critical-findings.log closure validation PASS exit code 0; 1 finding unresolved',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must not include contradictory security review failure markers',
    );
  });

  it.each([
    'structural issues = 0/1',
    'errors=0/1',
  ])('rejects linked security evidence rows that keep result count placeholder %s', placeholder => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        'artifact://security/relayer-signing.log',
        `artifact://security/relayer-signing.log command output: PASS ${placeholder}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must not include contradictory security review failure markers',
    );
  });

  it.each([
    'artifact://',
    'artifact:// ',
    'artifact:// relayer signing review',
    'artifact://completed relayer signing review',
  ])(
    'rejects targetless artifact marker %s for linked security review rows',
    targetlessArtifact => {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        scopes: scopeRows.replace(
          '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
          `| Relayer signing | covered | ${targetlessArtifact} | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
        ),
        evidence: evidenceRows.replace(
          '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
          `| \`npm run check\` output | linked | ${targetlessArtifact} | verified for Gate 4 review |`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
      );
    },
  );

  it('rejects non-concrete artifact targets for linked security review rows', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        '| Relayer signing | covered | artifact://security/placeholder-relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
      ),
      evidence: evidenceRows.replace(
        '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
        '| `npm run check` output | linked | artifact://security/todo-npm-run-check-output.log | verified for Gate 4 review |',
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        '| Critical findings | 0 | 0 | artifact://security/tbd-critical-findings.log | linked |',
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no, checked against evidence | artifact://security/sample-evidence-can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log | linked |',
      ),
      checklistUpdates: 'artifact://security/example-evidence-completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates',
      releaseNoteUpdates: 'artifact://security/placeholder-completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
    );
  });

  it('rejects row-named sample security review targets for linked security review rows', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        '| Relayer signing | covered | artifact://security/sample-security-review-relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
      ),
      evidence: evidenceRows.replace(
        '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
        '| `npm run check` output | linked | artifact://security/sample-review-npm-run-check-output.log | verified for Gate 4 review |',
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        '| Critical findings | 0 | 0 | artifact://security/sample-findings-critical-findings.log | linked |',
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no, checked against evidence | artifact://security/sample-negative-check-can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log | linked |',
      ),
      checklistUpdates: 'artifact://security/sample-checklist-update-completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates',
      releaseNoteUpdates: 'artifact://security/sample-release-note-update-completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
    );
  });

  it('rejects claim-escalating artifact targets for linked security review evidence', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        '| Relayer signing | covered | artifact://security/relayer-signing-testnet-production-candidate.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
      ),
      evidence: evidenceRows.replace(
        '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
        '| `npm run check` output | linked | artifact://security/npm-run-check-output-production-ready-endorsed.log | verified for Gate 4 review |',
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        '| Critical findings | 0 | 0 | artifact://security/critical-findings-open-certified.log | linked |',
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no, checked against evidence | artifact://security/can-any-settlement-broadcast-without-bridge-broadcast-enabled-true-publication-blockers-open-accredited.log | linked |',
      ),
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence-accepted-risks-without-release-notes-approved.md accepted-risk checklist updates copied',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence-private-maintainer-context-certified.md accepted-risk release-note updates copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
    );
  });

  it('rejects compatibility-normalized claim-escalating security review artifact targets', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: evidenceRows.replace(
        '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
        '| `npm run check` output | linked | artifact://security/npm-run-check-output-\uFF50\uFF52\uFF4F\uFF44\uFF55\uFF43\uFF54\uFF49\uFF4F\uFF4E-\uFF52\uFF45\uFF41\uFF44\uFF59-endorsed.log | verified for Gate 4 review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
    );
  });

  it('rejects non-concrete Markdown evidence link targets for linked security review rows', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        '| Relayer signing | covered | [relayer signing evidence](../evidence/security/placeholder-relayer-signing.log) | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
      ),
      evidence: evidenceRows.replace(
        '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
        '| `npm run check` output | linked | [npm run check output](../evidence/security/todo-npm-run-check-output.log) | verified for Gate 4 review |',
      ),
      findings: findingRows.replace(
        '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
        '| Critical findings | 0 | 0 | [critical findings closure](../evidence/security/tbd-critical-findings.log) | linked |',
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no, checked against evidence | [broadcast negative check](../evidence/security/sample-evidence-can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log) | linked |',
      ),
      checklistUpdates: '[completed Gate 4 checklist update evidence](../evidence/security/example-evidence-completed-gate-4-checklist-update-evidence.md) accepted-risk checklist updates',
      releaseNoteUpdates: '[completed Gate 4 release-note update evidence](../evidence/security/placeholder-completed-gate-4-release-note-update-evidence.md) accepted-risk release-note updates',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
    );
  });

  it.each([
    'artifact://security/fixture-relayer-signing.log',
    'artifact://security/mock-relayer-signing.log',
    'artifact://security/dummy-relayer-signing.log',
    'artifact://security/fake-relayer-signing.log',
    'artifact://security/stub-relayer-signing.log',
    'artifact://security/testdata-relayer-signing.log',
    'artifact://security/synthetic-relayer-signing.log',
    'artifact://security/simulated-relayer-signing.log',
  ])('rejects fixture-style artifact marker %s for linked security review rows', artifactTarget => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        `| Relayer signing | covered | ${artifactTarget} | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
  });

  it.each([
    '[fixture](../evidence/security/fixture-relayer-signing.log)',
    '[mock](../evidence/security/mock-relayer-signing.log)',
    '[dummy](../evidence/security/dummy-relayer-signing.log)',
    '[fake](../evidence/security/fake-relayer-signing.log)',
    '[stub](../evidence/security/stub-relayer-signing.log)',
    '[testdata](../evidence/security/testdata-relayer-signing.log)',
    '[synthetic](../evidence/security/synthetic-relayer-signing.log)',
    '[simulated](../evidence/security/simulated-relayer-signing.log)',
  ])('rejects fixture-style Markdown evidence link %s for linked security review rows', markdownTarget => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        `| Relayer signing | covered | ${markdownTarget} | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
    );
  });

  it.each([
    {
      variant: 'raw',
      tmpTarget: ['', 'tmp', 'security-review.log'].join('/'),
      driveTarget: ['C:', 'tmp', 'npm-run-check-output.log'].join('/'),
      fileTarget: ['file:', '', '', 'C:', 'tmp', 'critical-findings.log'].join('/'),
      uncTarget: ['', '', 'share-name', 'broadcast-negative-check.log'].join('/'),
      checklistTarget: ['C:', 'tmp', 'completed-gate-4-checklist-update-evidence.md'].join('/'),
      releaseNoteTarget: [
        'file:',
        '',
        '',
        'C:',
        'tmp',
        'completed-gate-4-release-note-update-evidence.md',
      ].join('/'),
    },
    {
      variant: 'encoded',
      tmpTarget: '%2Ftmp%2Fsecurity-review.log',
      driveTarget: 'C%3A%2Ftmp%2Fnpm-run-check-output.log',
      fileTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fcritical-findings.log',
      uncTarget: '%2F%2Fshare-name%2Fbroadcast-negative-check.log',
      checklistTarget: 'C%3A%2Ftmp%2Fcompleted-gate-4-checklist-update-evidence.md',
      releaseNoteTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fcompleted-gate-4-release-note-update-evidence.md',
    },
    {
      variant: 'embedded encoded',
      tmpTarget: 'artifact://security/sourceTarget=%2Ftmp%2Fsecurity-review.log',
      driveTarget: 'artifact://security/sourceTarget=C%3A%2Ftmp%2Fnpm-run-check-output.log',
      fileTarget: 'artifact://security/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fcritical-findings.log',
      uncTarget: 'artifact://security/sourceTarget=%2F%2Fshare-name%2Fbroadcast-negative-check.log',
      checklistTarget: 'artifact://security/sourceTarget=C%3A%2Ftmp%2Fcompleted-gate-4-checklist-update-evidence.md',
      releaseNoteTarget:
        'artifact://security/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fcompleted-gate-4-release-note-update-evidence.md',
    },
  ])(
    'rejects $variant local-only evidence targets for linked security review rows',
    ({ tmpTarget, driveTarget, fileTarget, uncTarget, checklistTarget, releaseNoteTarget }) => {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        scopes: scopeRows.replace(
          '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
          `| Relayer signing | covered | [relayer signing evidence](${tmpTarget}) | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
        ),
        evidence: evidenceRows.replace(
          '| `npm run check` output | linked | artifact://security/npm-run-check-output.log | verified for Gate 4 review |',
          `| \`npm run check\` output | linked | [npm run check output](${driveTarget}) | verified for Gate 4 review |`,
        ),
        findings: findingRows.replace(
          '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
          `| Critical findings | 0 | 0 | [critical findings closure](${fileTarget}) | linked |`,
        ),
        negatives: negativeRows.replace(
          negativeRow(
            'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
            'no, checked against evidence',
          ),
          `| Can any settlement broadcast without \`BRIDGE_BROADCAST_ENABLED=true\`? | no, checked against evidence | [broadcast negative check](${uncTarget}) | linked |`,
        ),
        checklistUpdates:
          `[completed Gate 4 checklist update evidence](${checklistTarget}) accepted-risk checklist updates copied`,
        releaseNoteUpdates:
          `[completed Gate 4 release-note update evidence](${releaseNoteTarget}) accepted-risk release-note updates copied`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Required Evidence Package: `npm run check` output: link or artifact must include a real artifact:// target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Finding Disposition: Critical findings: closure evidence must include a real artifact:// target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence must include a real artifact:// target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release checklist updates must include a real artifact:// target or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must include a real artifact:// target or non-template evidence link',
      );
    },
  );

  it('rejects sensitive or runtime evidence targets for linked security review rows', () => {
    for (const target of [
      'relayer/private-key-review.md',
      'relayer/wallet-mnemonic-review.md',
      'relayer/bridge-state-review.sqlite',
      'artifact://security/private-key-review.log',
    ]) {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        scopes: scopeRows.replace(
          '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
          `| Relayer signing | covered | [relayer signing evidence](${target}) | none | node-wallet ContextExtension broadcast signing reviewed | linked |`,
        ),
      }));

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Required Scope Coverage: Relayer signing: evidence must include a real artifact:// target or non-template evidence link',
      );
    }
  });

  it('allows concrete security review targets that mention sample size or template removal', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        'artifact://security/relayer-signing.log',
        'artifact://security/sample-size-analysis-relayer-signing.log',
      ),
      evidence: evidenceRows.replace(
        'artifact://security/npm-run-check-output.log',
        'artifact://security/template-removal-audit-npm-run-check-output.log',
      ),
      findings: findingRows.replace(
        'artifact://security/critical-findings.log',
        'artifact://security/sample-size-analysis-critical-findings.log',
      ),
      negatives: negativeRows.replace(
        negativeRow(
          'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
          'no, checked against evidence',
        ),
        '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | no, checked against evidence | artifact://security/template-removal-audit-can-any-settlement-broadcast-without-bridge-broadcast-enabled-true.log | linked |',
      ),
      checklistUpdates: 'artifact://security/sample-size-analysis-completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes',
      releaseNoteUpdates: 'artifact://security/template-removal-audit-completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('PASS');
  });

  it('blocks unsupported classification and publication decision values', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production',
      environment: 'mainnet',
      organizationType: 'internal project team',
      independence: 'maintainer',
      finalDecision: 'maybe',
      releaseSupported: 'mainnet',
      productionReady: 'yes',
      acceptedRisksReflected: 'maybe',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Release level must be one of validated PoC, institutional reference, production deployment candidate',
    );
    expect(result.errors).toContain(
      'Review Classification: Environment must be one of local offline, patched devnet, testnet, staging',
    );
    expect(result.errors).toContain(
      'Review Classification: Reviewer organization type must be one of external audit firm, independent security researcher, exchange security team',
    );
    expect(result.errors).toContain('Review Classification: Reviewer independence must be one of independent external');
    expect(result.errors).toContain('Review Classification: Final decision must be one of approve, block');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must be one of none, validated PoC, institutional reference, production deployment candidate',
    );
    expect(result.errors).toContain('Publication Decision: Accepted risks reflected in release notes must be one of yes, no');
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; security review can only support testnet production-candidate claims',
    );
  });

  it('requires approving final decision and reflected release artifacts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      finalDecision: 'block',
      releaseSupported: 'none',
      acceptedRisksReflected: 'no',
      checklistUpdates: 'checklist reviewed',
      releaseNoteUpdates: 'release notes reviewed',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Final decision must be approve before security review evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not be none before review evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Decision: accepted risks must be reflected in release notes before review evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a link, command, or artifact marker',
    );
  });

  it('requires accepted-risk publication updates and decision summary details', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      checklistUpdates: 'artifact://security/checklist-review.log',
      releaseNoteUpdates: 'artifact://security/release-notes-review.log',
      decisionSummary: 'release supported',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include accepted-risk checklist updates',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include accepted-risk release-note updates',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  });

  it('requires exact release-supported wording in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release support institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  });

  it('blocks reviewer decision summaries that approve production-ready security claims', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling approved; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('requires actionable production-ready claim handling in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim reviewed; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  });

  it('requires production-ready claim handling rather than claim-blocked shorthand in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim blocked; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  });

  it('requires exact production-ready claim denial in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling blocked; testnet production-candidate claim handling not allowed; critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires actionable testnet production-candidate claim handling in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claims reviewed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-blocked shorthand in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  });

  it('blocks reviewer decision summaries that leave critical or high findings open', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 1; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting remediation'],
    ['waiting', 'waiting for remediation'],
    ['deferred', 'deferred reviewer follow-up'],
  ])(
    'blocks reviewer decision summaries with exact closed findings plus %s critical/high finding prose',
    (_label, unresolvedPhrase) => {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        decisionSummary:
          'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
          `critical/high findings ${unresolvedPhrase}`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Publication Decision: Reviewer decision summary must not leave critical/high findings open',
      );
    },
  );

  it('blocks reviewer decision summaries with exact closed findings plus nonzero critical/high findings count', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'critical/high findings count 1 unresolved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave critical/high findings open',
    );
  });

  it('blocks reviewer decision summaries that close critical or high findings with textual zero-like terms', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open none; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    );
  });

  it('requires exact critical/high findings open wording in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings = 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    );
  });

  it('requires exact Critical/high findings open binding in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0',
    );
  });

  it('requires reviewer decision summaries to reflect accepted risks in release notes', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: accepted risks must be reflected in release notes',
    );
  });

  it('requires exact Accepted risks reflected in release notes binding in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks reflected in release notes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Accepted risks reflected in release notes = yes',
    );
  });

  it('requires exact testnet production-candidate claim allowance in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling not allowed; critical/high findings open 0; ' +
        'Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-candidate release support in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes',
      decisionSummary:
        'release supported for production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact institutional-reference release support in reviewer decision summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseSupported: 'institutional reference',
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('requires accepted-risk release-note handling evidence rather than yes shorthand in reviewer summaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risk release note handling: yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: accepted risks must be reflected in release notes',
    );
  });

  it('blocks reviewer decision summaries that approve open critical or high findings after closing them', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied; open critical/high findings approved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
  });

  it('blocks reviewer decision summaries that approve open publication blockers', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied; open publication blockers approved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting reviewer follow-up'],
    ['waiting', 'waiting on reviewer follow-up'],
    ['deferred', 'deferred reviewer follow-up'],
  ])(
    'blocks reviewer decision summaries with exact zero publication blockers plus %s publication blocker prose',
    (_label, unresolvedPhrase) => {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        decisionSummary:
          'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
          `Publication blockers = 0; publication blockers ${unresolvedPhrase}`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Publication Decision: Reviewer decision summary must not leave publication blockers open',
      );
    },
  );

  it('rejects required evidence package notes that leave critical or high findings open', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review; critical/high findings open 1 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: reviewer note must not leave critical/high findings open',
    );
  });

  it('rejects finding closure evidence that leaves critical or high findings open', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows.replace(
        'artifact://security/critical-findings.log',
        'artifact://security/critical-findings.log critical/high findings open 1',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: closure evidence must not leave critical/high findings open',
    );
  });

  it.each([
    ['numeric open', 'critical/high findings open 1'],
    ['waiting', 'critical/high findings waiting for remediation'],
    ['deferred', 'critical/high findings deferred reviewer follow-up'],
  ])('rejects reviewer sign-off notes that leave critical or high findings open: %s', (_label, unresolvedNote) => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        `| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; ${unresolvedNote} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Lead reviewer: notes must not leave critical/high findings open',
    );
  });

  it.each([
    ['pending', 'publication blockers pending reviewer follow-up'],
    ['waiting', 'publication blockers waiting on reviewer follow-up'],
    ['deferred', 'publication blockers deferred reviewer follow-up'],
  ])('rejects reviewer sign-off notes that leave publication blockers open: %s', (_label, unresolvedNote) => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        `| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted; ${unresolvedNote} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not leave publication blockers open',
    );
  });

  it('blocks reviewer decision summaries that say accepted risks were not reflected', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks not reflected in release notes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: accepted risks must be reflected in release notes',
    );
  });

  it('blocks reviewer decision summaries that approve accepted risks missing release artifacts after reflecting them', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks reflected in release notes; accepted risks without release artifacts approved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  });

  it('accepts reviewer decision summaries that explicitly deny open security boundary approvals', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'open critical/high findings not approved; ' +
        'reviewer approved no open critical/high findings; publication blockers open not approved; ' +
        'reviewer approved no open publication blockers; accepted risks without release artifacts not approved; ' +
        'reviewer approved no accepted risks without release artifacts',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  });

  it('accepts reviewer decision summaries that approve absent open security boundary approvals', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'reviewer approved absent open critical/high findings; ' +
        'reviewer approved absent open publication blockers',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
  });

  it('accepts reviewer decision summaries that approve absence of open security boundary contexts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'absence of open critical/high findings approved by reviewer; ' +
        'absence of open publication blockers approved by reviewer; ' +
        'absence of accepted risks without release artifacts approved by reviewer',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  });

  it('accepts reviewer decision summaries that approve lack of open security boundary contexts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'lack of open critical/high findings approved by reviewer; ' +
        'lack of open publication blockers approved by reviewer; ' +
        'lack of accepted risks without release artifacts approved by reviewer',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  });

  it('accepts reviewer decision summaries that approve lacking open security boundary contexts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'lacking open critical/high findings approved by reviewer; ' +
        'lacking open publication blockers approved by reviewer; ' +
        'lacking accepted risks without release artifacts approved by reviewer',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  });

  it('accepts reviewer decision summaries that approve evidence lacks open security boundary contexts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'evidence lacks open critical/high findings approved by reviewer; ' +
        'evidence lacks open publication blockers approved by reviewer; ' +
        'evidence lacks accepted risks without release artifacts approved by reviewer',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high findings',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve open publication blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  });

  it('blocks publication support above the reviewed release level', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'institutional reference',
      releaseSupported: 'production deployment candidate',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not exceed Review Classification release level',
    );
  });

  it('requires production-candidate security reviews to carry exact release support', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'institutional reference',
      productionReady: 'no',
      testnetProductionCandidate: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate review requires exact Release supported = production deployment candidate',
    );
  });

  it('blocks production deployment candidate support when production-ready claims are not allowed', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'no',
      decisionSummary: 'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('rejects production-ready claims even for production deployment candidate reviews', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'yes',
      testnetProductionCandidate: 'yes',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; security review can only support testnet production-candidate claims',
    );
  });

  it('allows production deployment candidate support through the testnet production-candidate claim field', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact production-ready claim denial in security review publication updates', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact production-candidate release support in security review publication updates', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Publication blockers = 0',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Publication blockers = 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact blocker closure bindings in production-candidate security review publication updates', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
  });

  it('rejects contradictory security review publication update evidence', () => {
    const contradictoryEvidence = 'security review validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        `artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied ${contradictoryEvidence}`,
      releaseNoteUpdates:
        `artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied ${contradictoryEvidence}`,
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory security-review failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory security-review failure markers',
    );
  });

  it('rejects security review publication update evidence with open or known issue markers', () => {
    for (const issueMarker of [
      'Open issues: unresolved Gate 4 publication blocker',
      'Known issues: unresolved Gate 4 publication blocker',
    ]) {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        releaseLevel: 'production deployment candidate',
        environment: 'testnet',
        releaseSupported: 'production deployment candidate',
        productionReady: 'no',
        testnetProductionCandidate: 'yes',
        checklistUpdates:
          `artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied ${issueMarker}`,
        releaseNoteUpdates:
          `artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied ${issueMarker}`,
        decisionSummary:
          'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Publication Decision: Required release checklist updates must not include contradictory security-review failure markers',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must not include contradictory security-review failure markers',
      );
    }
  });

  it('requires Gate 4-specific checklist and release-note update evidence for production-candidate support', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates: 'artifact://security/release-checklist-update.md accepted-risk checklist updates copied',
      releaseNoteUpdates: 'artifact://security/release-notes-update.md accepted-risk release-note updates copied',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must identify completed Gate 4 checklist update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed Gate 4 release-note update evidence',
    );
  });

  it('rejects security review publication update evidence kinds hidden inside longer labels', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/gate-4-release-checklist.md draft completed Gate 4 checklist update evidence; accepted-risk checklist updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      releaseNoteUpdates:
        'artifact://security/gate-4-release-notes.md candidate completed Gate 4 release-note update evidence; accepted-risk release-note updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must identify completed Gate 4 checklist update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed Gate 4 release-note update evidence',
    );
  });

  it('accepts compatibility-normalized security review publication update evidence kinds', () => {
    const gateLabel = '\uFF27\uFF41\uFF54\uFF45';
    const gateNumber = '\uFF14';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        `artifact://security/completed-checklist-update.md completed ${gateLabel} ${gateNumber} checklist update evidence; accepted-risk checklist updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0`,
      releaseNoteUpdates:
        `artifact://security/completed-release-note-update.md completed ${gateLabel} ${gateNumber} release-note update evidence; accepted-risk release-note updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0`,
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects security review publication updates that approve production claim escalation', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; mainnet production deployment accepted',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; production-ready bridge claim approved',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain production-ready claim wording',
    );
  });

  it('blocks security review publication updates that close findings or blockers with textual zero-like terms', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; critical/high findings open none',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; publication blockers resolved',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks reflected in release notes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
  });

  it('blocks security review publication updates that close findings or blockers with numeric shorthand', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; critical/high findings open 0',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; publication blockers 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks reflected in release notes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
  });

  it('accepts exact security blocker closure bindings in publication updates', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes; Release supported = production deployment candidate; Critical/high findings open = 0; Publication blockers = 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact accepted-risk and testnet-candidate bindings in security review publication updates', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Critical/high findings open = 0; Publication blockers = 0',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Critical/high findings open = 0; Publication blockers = 0',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; critical/high findings open 0; Accepted risks reflected in release notes = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Accepted risks reflected in release notes = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Accepted risks reflected in release notes = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in security review publication updates', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      checklistUpdates:
        'artifact://security/checklist-review.log accepted-risk checklist updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes',
      releaseNoteUpdates:
        'artifact://security/release-notes-review.log accepted-risk release-note updates copied; Production-ready claim allowed = no; Accepted risks reflected in release notes = yes; Testnet production-candidate claim allowed = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('rejects security review publication updates and reviewer summaries that keep decision placeholders', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; Production-ready claim allowed = no/yes; Accepted risks reflected in release notes = yes/no; Testnet production-candidate claim allowed = yes/no; Release supported = production deployment candidate/institutional reference; Critical/high findings open = 0/1; Publication blockers = 0/1',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; Production-ready claim allowed = no/yes; Accepted risks reflected in release notes = yes/no; Testnet production-candidate claim allowed = yes/no; Release supported = production deployment candidate/institutional reference; Critical/high findings open = 0/1; Publication blockers = 0/1',
      decisionSummary:
        'Release supported = production deployment candidate/institutional reference; production-ready claim handling: Production-ready claim allowed = no/yes; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes/no; critical/high findings open 0/1; Accepted risks reflected in release notes = yes/no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Accepted risks reflected in release notes = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Accepted risks reflected in release notes = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Accepted risks reflected in release notes = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('rejects contradictory exact security review decision bindings in publication evidence', () => {
    const contradictoryDecisionBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
      'Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
      'Accepted risks reflected in release notes = yes; Accepted risks reflected in release notes = no; ' +
      'Critical/high findings open = 0; Critical/high findings open = 1; ' +
      'Publication blockers = 0; Publication blockers = 1';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        `artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied; ${contradictoryDecisionBindings}`,
      releaseNoteUpdates:
        `artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied; ${contradictoryDecisionBindings}`,
      decisionSummary:
        `release support: ${contradictoryDecisionBindings}; ` +
        'production-ready claim handling: Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
        'critical/high findings: Critical/high findings open = 0; Critical/high findings open = 1; ' +
        'accepted risks: Accepted risks reflected in release notes = yes; Accepted risks reflected in release notes = no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory security review decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory security review decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory security review decision bindings',
    );
  });

  it('rejects reused publication update evidence targets', () => {
    const reusedPublicationTarget =
      'artifact://security/completed-gate-4-publication-update-evidence.md';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        `${reusedPublicationTarget} completed Gate 4 checklist update evidence; accepted-risk checklist updates copied`,
      releaseNoteUpdates:
        `${reusedPublicationTarget} completed Gate 4 release-note update evidence; accepted-risk release-note updates copied`,
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: required release checklist updates and required release-note updates must use distinct completed evidence targets',
    );
  });

  it('blocks testnet production-candidate claims below production deployment candidate support', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      testnetProductionCandidate: 'yes',
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: testnet production-candidate claim requires production deployment candidate support',
    );
  });

  it('requires production deployment candidate reviews to be testnet-scoped', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
      releaseSupported: 'production deployment candidate',
      productionReady: 'no',
      testnetProductionCandidate: 'yes',
      checklistUpdates:
        'artifact://security/completed-gate-4-checklist-update-evidence.md accepted-risk checklist updates copied',
      releaseNoteUpdates:
        'artifact://security/completed-gate-4-release-note-update-evidence.md accepted-risk release-note updates copied',
      decisionSummary:
        'Release supported = production deployment candidate; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed; critical/high findings open 0; accepted risks copied',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: production deployment candidate release level requires Environment testnet',
    );
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Review Classification Environment = testnet',
    );
  });

  it('blocks open critical or high findings', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: '| High findings | 1 | 1 | artifact://security/high.log | linked |',
      openCriticalHigh: '1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Finding Disposition: Critical findings: missing required row');
    expect(result.errors).toContain(
      'Finding Disposition: High findings: open critical/high must be 0 before review evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Decision: critical/high findings open must be 0 before review evidence can pass',
    );
  });

  it('requires critical/high findings open to use exact numeric zero', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      openCriticalHigh: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: critical/high findings open must be 0 before review evidence can pass',
    );
  });

  it('requires finding disposition open critical/high counts to use exact numeric zero', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows
        .replace(
          '| Critical findings | 0 | 0 | artifact://security/critical-findings.log | linked |',
          '| Critical findings | 0 | none | artifact://security/critical-findings.log | linked |',
        )
        .replace(
          '| Medium findings | 0 | 0 | artifact://security/medium-findings.log | linked |',
          '| Medium findings | 0 | n/a | artifact://security/medium-findings.log | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Finding Disposition: Critical findings: open critical/high must be 0');
    expect(result.errors).toContain('Finding Disposition: Medium findings: open critical/high must be 0');
    expect(result.errors).toContain(
      'Finding Disposition: Critical findings: open critical/high must be 0 before review evidence can pass',
    );
  });

  it('requires scope finding IDs to be closed by finding disposition evidence', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| ErgoScript contracts | covered | artifact://security/ergoscript-contracts.log | none | HEIGHT singleton payout binding reviewed | linked |',
        '| ErgoScript contracts | covered | artifact://security/ergoscript-contracts.log | SR-001 | HEIGHT singleton payout binding reviewed | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: ErgoScript contracts: finding IDs SR-001 must be referenced by Finding Disposition closure evidence',
    );
  });

  it('requires finding disposition counts to be structured values', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows.replace(
        '| Medium findings | 0 | 0 | artifact://security/medium-findings.log | linked |',
        '| Medium findings | reviewed | reviewed | artifact://security/medium-findings.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Finding Disposition: Medium findings: count must be 0, none, no, or an integer');
    expect(result.errors).toContain('Finding Disposition: Medium findings: open critical/high must be 0');
  });

  it('rejects unsafe finding disposition counts', () => {
    const unsafeCount = '9007199254740993';
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows.replace(
        '| Medium findings | 0 | 0 | artifact://security/medium-findings.log | linked |',
        `| Medium findings | ${unsafeCount} | 0 | artifact://security/medium-findings.log | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Finding Disposition: Medium findings: count must be a safe integer');
  });

  it('blocks publication blockers even when critical/high findings are closed', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows.replace(
        '| Publication blockers | 0 | 0 | artifact://security/publication-blockers.log | linked |',
        '| Publication blockers | 2 | 0 | artifact://security/publication-blockers.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Finding Disposition: Publication blockers: count must be 0 before review evidence can pass',
    );
  });

  it('requires publication blocker counts to use exact numeric zero', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      findings: findingRows.replace(
        '| Publication blockers | 0 | 0 | artifact://security/publication-blockers.log | linked |',
        '| Publication blockers | none | 0 | artifact://security/publication-blockers.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Finding Disposition: Publication blockers: count must be 0 before review evidence can pass',
    );
  });

  it('requires negative review checks to be answered and linked', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      negatives: '| Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`? | | no artifact | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: missing required row',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: reviewer answer is required',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: evidence marker is required',
    );
  });

  it('requires negative review answers to be fail-closed and recovery-positive', () => {
    const ambiguousNegatives = negativeRows
      .replace(
        negativeRow(
          'Can a production path sign through the Ergo node wallet?',
          'no, checked against evidence',
        ),
        negativeRow('Can a production path sign through the Ergo node wallet?', 'reviewed'),
      )
      .replace(
        negativeRow(
          'Can trusted burn interpretation be mistaken for trustless verification?',
          'no, checked against evidence',
        ),
        negativeRow(
          'Can trusted burn interpretation be mistaken for trustless verification?',
          'accepted with caveats',
        ),
      )
      .replace(
        negativeRow(
          'Can an operator recover from SQLite loss without private maintainer context?',
          'yes, recoverable with linked runbook and backup-restore evidence',
        ),
        negativeRow(
          'Can an operator recover from SQLite loss without private maintainer context?',
          'reviewed',
        ),
      );
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      negatives: ambiguousNegatives,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: reviewer answer must state no/cannot/rejected/blocked for unsafe node-wallet signing',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can trusted burn interpretation be mistaken for trustless verification?: reviewer answer must state no/cannot/rejected/blocked for trusted burn being presented as trustless',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: reviewer answer must state yes/recoverable without private maintainer context',
    );
  });

  it('blocks private maintainer context approvals in security-review decisions', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      negatives: negativeRows.replace(
        negativeRow(
          'Can an operator recover from SQLite loss without private maintainer context?',
          'yes, recoverable with linked runbook and backup-restore evidence',
        ),
        '| Can an operator recover from SQLite loss without private maintainer context? | yes, recoverable; private maintainer context used: yes | artifact://security/completed-sqlite-recovery.log SQLite recovery private maintainer context used: yes | linked |',
      ),
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied; private maintainer context is authorized',
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; reviewer grants private maintainer context |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: reviewer answer must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not admit private maintainer context',
    );
  });

  it('blocks compatibility-normalized private maintainer context admissions', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      negatives: negativeRows.replace(
        negativeRow(
          'Can an operator recover from SQLite loss without private maintainer context?',
          'yes, recoverable with linked runbook and backup-restore evidence',
        ),
        '| Can an operator recover from SQLite loss without private maintainer context? | yes, recoverable; private maintainer context \uFF55\uFF53\uFF45\uFF44: \uFF59\uFF45\uFF53 | artifact://security/completed-sqlite-recovery.log private maintainer context \uFF55\uFF53\uFF45\uFF44: \uFF59\uFF45\uFF53 | linked |',
      ),
      decisionSummary:
        'Release supported = institutional reference; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high findings open = 0; Accepted risks reflected in release notes = yes; ' +
        'private maintainer context is \uFF41\uFF55\uFF54\uFF48\uFF4F\uFF52\uFF49\uFF5A\uFF45\uFF44',
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; reviewer \uFF47\uFF52\uFF41\uFF4E\uFF54\uFF53 private maintainer context |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: reviewer answer must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not admit private maintainer context',
    );
  });

  it('blocks reviewer decision summaries that certify private maintainer context', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied; private maintainer context certified',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not admit private maintainer context',
    );
  });

  it('blocks reviewer decision summaries that endorse private maintainer context', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      decisionSummary:
        'release supported for institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling not allowed; critical/high findings open 0; accepted risks copied; private maintainer context endorsed; private context recommended; private maintainer context accredited',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not admit private maintainer context',
    );
  });

  it('blocks private maintainer context admissions in security-review row evidence', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      scopes: scopeRows.replace(
        '| Relayer signing | covered | artifact://security/relayer-signing.log | none | node-wallet ContextExtension broadcast signing reviewed | linked |',
        '| Relayer signing | covered | artifact://security/relayer-signing.log private maintainer context used: yes | none | node-wallet ContextExtension broadcast signing reviewed; reviewer grants private maintainer context | linked |',
      ),
      evidence: evidenceRows.replace(
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log | verified for Gate 4 review |',
        '| Clean checkout CI run | linked | artifact://security/clean-checkout-ci-run.log clean checkout CI run private maintainer context used: yes | verified for Gate 4 review; private maintainer context is authorized |',
      ),
      findings: findingRows.replace(
        '| Low findings | 0 | 0 | artifact://security/low-findings.log | linked |',
        '| Low findings | 0 | 0 | artifact://security/low-findings.log private maintainer context used: yes | linked |',
      ),
      checklistUpdates:
        'artifact://security/checklist-review.log accepted-risk checklist updates copied; private maintainer context used: yes',
      releaseNoteUpdates:
        'artifact://security/release-notes-review.log accepted-risk release-note updates copied; private maintainer context is authorized',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Required Scope Coverage: Relayer signing: risk focus must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: link or artifact must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Required Evidence Package: Clean checkout CI run: reviewer note must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Finding Disposition: Low findings: closure evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not admit private maintainer context',
    );
  });

  it('requires negative review evidence to identify the reviewed unsafe path', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      negatives: negativeRows.replace(
        negativeRow(
          'Can a production path sign through the Ergo node wallet?',
          'no, checked against evidence',
        ),
        '| Can a production path sign through the Ergo node wallet? | no, checked against evidence | artifact://security/completed-negative-review.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: evidence must identify node-wallet production signing review evidence',
    );
  });

  it('requires reviewer sign-off decisions', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: '| Lead reviewer | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security owner: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Lead reviewer: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Lead reviewer: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Lead reviewer: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Lead reviewer: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Security owner | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Security owner | reviewer-a | block | 2026-05-14 | security review blocker blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security owner: decision must be approve before security review evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Maintainer | reviewer-a | approve | May 14 2026 | security review accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Maintainer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the review classification date', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-13 | security review accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: Date must not be before Review Classification Date',
    );
  });

  it('requires reviewer notes to state concrete security-review outcomes', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | reviewed report |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Lead reviewer: notes must state a concrete security-review outcome',
    );
  });

  it('rejects reviewer notes with contradictory security review failure markers', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Lead reviewer: notes must not include contradictory security review failure markers',
    );
  });

  it('rejects reviewer notes with open or known issue markers', () => {
    for (const issueMarker of [
      'Open issues: unresolved security reviewer blocker',
      'Known issues: unresolved security reviewer blocker',
    ]) {
      const result = validateSecurityReviewEvidence(securityReviewEvidence({
        reviewers: reviewerRows.replace(
          '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          `| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; ${issueMarker} |`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Reviewer Sign-Off: Lead reviewer: notes must not include contradictory security review failure markers',
      );
    }
  });

  it('rejects reviewer notes with production-ready or mainnet claim wording', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows
        .replace(
          '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; production-ready bridge claim approved |',
        )
        .replace(
          '| Security owner | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Security owner | reviewer-a | approve | 2026-05-14 | security review accepted; mainnet production deployment accepted |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Lead reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security owner: notes must not contain mainnet production claim wording',
    );
  });

  it('rejects reviewer notes that approve open publication blockers', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted; open publication blockers approved |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve open publication blockers',
    );
  });

  it('rejects reviewer notes with compatibility-normalized open publication blocker approval wording', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted; \uFF4F\uFF50\uFF45\uFF4E \uFF50\uFF55\uFF42\uFF4C\uFF49\uFF43\uFF41\uFF54\uFF49\uFF4F\uFF4E \uFF42\uFF4C\uFF4F\uFF43\uFF4B\uFF45\uFF52\uFF53 \uFF41\uFF50\uFF50\uFF52\uFF4F\uFF56\uFF45\uFF44 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve open publication blockers',
    );
  });

  it('rejects reviewer notes that approve forbidden security boundaries before naming them', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted; approved open publication blockers |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; approved security accepted risks without release artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve open publication blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve accepted risks missing release artifacts',
    );
  });

  it('rejects reviewer notes that approve accepted risks missing release artifacts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; accepted risks without release notes approved |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve accepted risks missing release artifacts',
    );
  });

  it('rejects reviewer notes that approve accepted risks lacking release artifacts', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; reviewer allows accepted risks lacking release notes |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve accepted risks missing release artifacts',
    );
  });

  it('rejects reviewer notes with active approval verbs for open security-review boundaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review verified; reviewer supports open publication blockers |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review validated; reviewer allows accepted risks without release artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve open publication blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve accepted risks missing release artifacts',
    );
  });

  it('rejects reviewer notes with grant-family approval terms for open security-review boundaries', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review verified; reviewer grants open publication blockers |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review validated; reviewer granted accepted risks without release artifacts |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve open publication blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve accepted risks missing release artifacts',
    );
  });

  it('accepts reviewer notes that explicitly deny open security boundary approvals', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | security review accepted; reviewer approved no open publication blockers |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | security review accepted; reviewer approved no accepted risks without release artifacts |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve open publication blockers',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve accepted risks missing release artifacts',
    );
  });

  it('requires lead reviewer sign-off to match the review classification identity', () => {
    const result = validateSecurityReviewEvidence(securityReviewEvidence({
      reviewers: reviewerRows.replace(
        '| Lead reviewer | reviewer-a | approve | 2026-05-14 | security review accepted |',
        '| Lead reviewer | reviewer-b | approve | 2026-05-14 | security review accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Lead reviewer: name must match Review Classification Lead reviewer',
    );
  });

  it('blocks missing tables without throwing', () => {
    const result = validateSecurityReviewEvidence('# Incomplete review\n\n## Review Classification\n\nNo table yet.\n');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('## Required Scope Coverage: table not found');
    expect(result.errors).toContain('## Required Evidence Package: table not found');
    expect(result.errors).toContain('## Finding Disposition: table not found');
    expect(result.errors).toContain('## Required Negative Review Checks: table not found');
    expect(result.errors).toContain('## Reviewer Sign-Off: table not found');
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function scopeRiskFocus(area: string): string {
  const focusByArea: Record<string, string> = {
    'ErgoScript contracts': 'HEIGHT singleton payout binding reviewed',
    'Relayer signing': 'node-wallet ContextExtension broadcast signing reviewed',
    'AVL proof generation': 'AVL batch unified proof non-concatenation reviewed',
    'Settlement reconciliation': 'DUP settlement confirmation reorg reconciliation reviewed',
    'Sidechain finality and burn validity': 'sidechain finality burn SPV trusted boundary reviewed',
    'Operator recovery': 'SQLite backup restore reconstruct runbook reviewed',
    'Dependency risk': 'sigma-rust Fleet dependency lockfile upgrade reviewed',
  };

  return focusByArea[area] ?? 'unmapped risk focus';
}

function negativeRow(question: string, answer: string): string {
  return `| ${question} | ${answer} | artifact://security/${slug(question)}.log | linked |`;
}
