import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_THREAT_MODEL_MATRIX_AREAS,
  validateThreatModelEvidence,
} from './threat-model-evidence.js';

const srcRoot = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = join(srcRoot, '..', '..');
const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');

describe('threat model evidence validation', () => {
  it('prints release-gate target and claim boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-threat-model-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run threat-model:validate');
    expect(result.stdout).toContain('Threat model and evidence matrix');
    expect(result.stdout).toContain('release:gate -- --threat-model-evidence');
    expect(result.stdout).toContain('validated target');
    expect(result.stdout).toContain('command-specific completed threat-model command output evidence');
    expect(result.stdout).toContain('Matrix Classification');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('accepts the current security evidence matrix as structured threat-model evidence', () => {
    const result = validateThreatModelEvidence(matrix);

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
    expect(result.matrixRows.map(row => row.area)).toEqual(
      expect.arrayContaining([...REQUIRED_THREAT_MODEL_MATRIX_AREAS]),
    );
  });

  it('blocks ambiguous production-ready and mainnet claim-boundary placeholders', () => {
    const ambiguousClaimBoundaries = [
      matrix,
      '',
      'Production-ready claim allowed = no/yes',
      'Mainnet deployment claim allowed = no/yes',
    ].join('\n');

    const result = validateThreatModelEvidence(ambiguousClaimBoundaries);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Threat Model Evidence: production-ready claim allowance must remain no',
    );
    expect(result.errors).toContain(
      'Threat Model Evidence: mainnet deployment claim allowance must remain no',
    );
  });

  it('blocks prose-joined production-ready and mainnet claim-boundary alternatives', () => {
    const ambiguousClaimBoundaries = [
      matrix,
      '',
      'Production-ready claim allowed = no or yes',
      'Mainnet deployment claim allowed = no, yes',
    ].join('\n');

    const result = validateThreatModelEvidence(ambiguousClaimBoundaries);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Threat Model Evidence: production-ready claim allowance must remain no',
    );
    expect(result.errors).toContain(
      'Threat Model Evidence: mainnet deployment claim allowance must remain no',
    );
  });

  it('exposes optional matrix classification fields when completed evidence provides them', () => {
    const classifiedMatrix = matrix.replace(
      '## Status Legend',
      [
        '## Matrix Classification',
        '',
        '| Field | Value |',
        '|---|---|',
        '| Matrix name | Ergo bridge security evidence matrix |',
        '| Git commit | abcdef1 |',
        '| Reviewer | A. Shannon |',
        '| Date | 2025-02-20 |',
        '',
        '## Status Legend',
      ].join('\n'),
    );

    const result = validateThreatModelEvidence(classifiedMatrix);

    expect(result.status).toBe('PASS');
    expect(result.classification).toEqual({
      matrixName: 'Ergo bridge security evidence matrix',
      gitCommit: 'abcdef1',
      reviewer: 'A. Shannon',
      date: '2025-02-20',
    });
  });

  it('blocks malformed optional matrix classification fields', () => {
    const classifiedMatrix = matrix.replace(
      '## Status Legend',
      [
        '## Matrix Classification',
        '',
        '| Field | Value |',
        '|---|---|',
        '| Matrix name | Ergo bridge security evidence matrix |',
        '| Git commit | not-a-commit |',
        '| Reviewer | A. Shannon |',
        '| Date | 2025-02-30 |',
        '',
        '## Status Legend',
      ].join('\n'),
    );

    const result = validateThreatModelEvidence(classifiedMatrix);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Matrix Classification: Git commit must be a 7-40 character Git commit SHA',
    );
    expect(result.errors).toContain(
      'Matrix Classification: Date must use YYYY-MM-DD',
    );
  });

  it('blocks duplicate optional matrix classification fields', () => {
    const classifiedMatrix = matrix.replace(
      '## Status Legend',
      [
        '## Matrix Classification',
        '',
        '| Field | Value |',
        '|---|---|',
        '| Matrix name | Ergo bridge security evidence matrix |',
        '| Git commit | abcdef1 |',
        '| Git commit | def5678 |',
        '| Reviewer | A. Shannon |',
        '| Date | 2025-02-20 |',
        '',
        '## Status Legend',
      ].join('\n'),
    );

    const result = validateThreatModelEvidence(classifiedMatrix);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Matrix Classification: Git commit: duplicate required field',
    );
  });

  it('blocks matrices that omit required risk areas', () => {
    const withoutPhantomBurn = matrix.replace(
      /^\| Phantom burn trust minimization \|.*\|\r?\n/m,
      '',
    );

    const result = validateThreatModelEvidence(withoutPhantomBurn);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: missing required areas: Phantom burn trust minimization',
    );
  });

  it('requires exact phantom-burn boundary terms', () => {
    const weakBoundaryTerms = matrix.replace(
      'Current burn interpretation is still transitional and not L1-trustless.',
      'Current burn interpretation is still transitionalized and not L1-trustlessly framed.',
    );

    const result = validateThreatModelEvidence(weakBoundaryTerms);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Phantom burn trust minimization: currentClaim must include transitional',
    );
    expect(result.errors).toContain(
      'Evidence Table: Phantom burn trust minimization: currentClaim must include not L1-trustless',
    );
  });

  it('blocks summary-only evidence rows without concrete repository references', () => {
    const summaryOnly = matrix.replace(
      /(\| ContextExtension signer divergence \|[^|]+\| )[^|]+(\| Guarded \|)/,
      '$1PASS$2',
    );

    const result = validateThreatModelEvidence(summaryOnly);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: ContextExtension signer divergence: evidence must cite concrete repository evidence',
    );
  });

  it('blocks command-only matrix evidence without concrete repository references', () => {
    const commandOnly = matrix.replace(
      /(\| Mempool-safe HEIGHT checks \|[^|]+\| )[^|]+(\| Covered locally \|)/,
      '$1`npm run check` $2',
    );

    const result = validateThreatModelEvidence(commandOnly);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must cite concrete repository evidence',
    );
  });

  it('blocks self-referential matrix evidence without row-specific repository references', () => {
    const selfReferential = matrix.replace(
      /(\| Mempool-safe HEIGHT checks \|[^|]+\| )[^|]+(\| Covered locally \|)/,
      '$1`docs/security-evidence-matrix.md` threat-model validation target $2',
    );

    const result = validateThreatModelEvidence(selfReferential);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must cite concrete repository evidence',
    );
  });

  it('blocks matrix rows with remaining issue markers', () => {
    const remainingIssues = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 Remaining issues |$2 Remaining issues |$3|$4 Remaining issues |',
    );

    const result = validateThreatModelEvidence(remainingIssues);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: currentClaim must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: missingBeforePublication must not include contradictory validation failure markers',
    );
  });

  it('blocks matrix rows with singular remaining issue markers', () => {
    const remainingIssue = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 Remaining issue: follow-up pending |$2 Remaining issue: follow-up pending |$3|$4 Remaining issue: follow-up pending |',
    );

    const result = validateThreatModelEvidence(remainingIssue);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: currentClaim must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: missingBeforePublication must not include contradictory validation failure markers',
    );
  });

  it('blocks matrix rows with compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const compatibilityFailure = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      `| Mempool-safe HEIGHT checks |$1 ${marker} |$2 ${marker} |$3|$4 ${marker} |`,
    );

    const result = validateThreatModelEvidence(compatibilityFailure);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: currentClaim must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: missingBeforePublication must not include contradictory validation failure markers',
    );
  });

  it('blocks matrix rows with structured failure fields', () => {
    const emptyStructuredFields = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 {"errors":[]} errorCount: 0 |$2 {"failures":{}} failureTotal: 0 |$3|$4 errorCount: 0 |',
    );

    const emptyResult = validateThreatModelEvidence(emptyStructuredFields);

    expect(emptyResult.status).toBe('PASS');
    expect(emptyResult.errors).toEqual([]);

    const structuredTotalFailure = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 errorsTotal=1 |$2 failures_total: 2 |$3|$4 errorsTotal=1 |',
    );

    const totalResult = validateThreatModelEvidence(structuredTotalFailure);

    expect(totalResult.status).toBe('BLOCKED');
    expect(totalResult.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: currentClaim must not include contradictory validation failure markers',
    );
    expect(totalResult.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must not include contradictory validation failure markers',
    );
    expect(totalResult.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: missingBeforePublication must not include contradictory validation failure markers',
    );

    const structuredFailure = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 {"errors":["height mismatch"]} |$2 {"failures":{"height":"blocked"}} |$3|$4 errorCount: 1 |',
    );

    const result = validateThreatModelEvidence(structuredFailure);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: currentClaim must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: missingBeforePublication must not include contradictory validation failure markers',
    );
  });

  it('blocks matrix rows with open or known issue markers', () => {
    const openKnownIssues = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 Open issues: unresolved height blocker |$2 Known issues: unresolved command blocker |$3|$4 Open issues: unresolved publication blocker |',
    );

    const result = validateThreatModelEvidence(openKnownIssues);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: currentClaim must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: evidence must not include contradictory validation failure markers',
    );
    expect(result.errors).toContain(
      'Evidence Table: Mempool-safe HEIGHT checks: missingBeforePublication must not include contradictory validation failure markers',
    );
  });

  it('allows matrix rows that explicitly report no open or known issues', () => {
    const noOpenKnownIssues = matrix.replace(
      /^\| Mempool-safe HEIGHT checks \|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/m,
      '| Mempool-safe HEIGHT checks |$1 Open issues: 0 |$2 Known issues: none |$3|$4 Open issues: no |',
    );

    const result = validateThreatModelEvidence(noOpenKnownIssues);

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('blocks row-named sample and synthetic threat-model evidence targets', () => {
    for (const target of [
      'docs/completed-sample-threat-model-evidence.md',
      'relayer/src/completed-example-risk-matrix.ts',
      'phases/completed-template-attack-chain-review.md',
      'docs/completed-synthetic-threat-model-evidence.md',
      'docs/completed-simulated-threat-model-evidence.md',
    ]) {
      const sampleDomain = matrix.replace(
        /(\| Mempool-safe HEIGHT checks \|[^|]+\| )[^|]+(\| Covered locally \|)/,
        `$1\`${target}\`$2`,
      );

      const result = validateThreatModelEvidence(sampleDomain);

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Evidence Table: Mempool-safe HEIGHT checks: evidence must cite concrete repository evidence',
      );
    }
  });

  it('blocks sensitive or runtime threat-model evidence targets', () => {
    for (const target of [
      'relayer/.env',
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const sensitiveTarget = matrix.replace(
        /(\| Mempool-safe HEIGHT checks \|[^|]+\| )[^|]+(\| Covered locally \|)/,
        `$1\`${target}\`$2`,
      );

      const result = validateThreatModelEvidence(sensitiveTarget);

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Evidence Table: Mempool-safe HEIGHT checks: evidence must cite concrete repository evidence',
      );
    }
  });

  it('allows concrete threat-model targets that mention sample size or template removal', () => {
    for (const target of [
      'docs/sample-size-analysis-threat-model.md',
      'docs/template-removal-audit-threat-model.md',
    ]) {
      const concreteAudit = matrix.replace(
        /(\| Mempool-safe HEIGHT checks \|[^|]+\| )[^|]+(\| Covered locally \|)/,
        `$1\`${target}\`$2`,
      );

      const result = validateThreatModelEvidence(concreteAudit);

      expect(result.status).toBe('PASS');
      expect(result.errors).toEqual([]);
    }
  });
});
