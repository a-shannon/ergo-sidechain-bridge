import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord,
  summarizeTrustlessUnsignedTxPayoutBinding,
  type AggregateSettlementTrustlessCandidateEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import {
  validateTrustlessCandidateEvidenceJsonTarget,
  validateTrustlessUnsignedTxEvidenceJsonTarget,
  type TrustlessUnsignedTxEvidenceJsonValidation,
} from './aggregate-settlement-candidate-evidence-json.js';
import {
  buildTrustlessUnsignedTxValidationReport,
  formatTrustlessUnsignedTxValidationReportMarkdown,
} from './trustless-unsigned-tx-evidence-report.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

const sidechainIdHex = '11'.repeat(32);
const sidechainTxHashHex = '22'.repeat(32);
const sidechainLogIndex = 7;
const recipientErgoTreeHex = '0008cd02' + '44'.repeat(32);
const derivedBurnIdHex = deriveTrustlessBurnIdHex({
  sidechainIdHex,
  sidechainTxHashHex,
  eventIndex: sidechainLogIndex,
});
const recipientErgoTreeHashHex = unsignedTxPayoutBinding().recipientErgoTreeHashHex;

function unsignedTxPayoutBinding() {
  return summarizeTrustlessUnsignedTxPayoutBinding({
    outputs: [
      {},
      {},
      {
        ergoTree: recipientErgoTreeHex,
        value: 1_000_000,
      },
      {},
    ],
  });
}

function candidateRecord(): AggregateSettlementTrustlessCandidateEvidenceRecord {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-18T01:08:19.018Z',
    evidenceKind: 'trustless-settlement-candidate',
    label: 'Trustless settlement candidate identity',
    stateTrackerMode: 'read-only',
    broadcast: 'no',
    boundary: {
      gate5Closure: 'no',
      prebroadcastEvidence: 'no',
      settlementReadiness: 'no',
      testnetProductionCandidateClaim: 'no',
      productionReadyClaim: 'no',
    },
    claimCount: 1,
    claims: [{
      legacySidechainTxHash: sidechainTxHashHex,
      sidechainBlockHeight: 123,
      trustlessBurnDerivation: {
        sidechainIdHex,
        sidechainLogIndex,
        derivedBurnIdHex,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: derivedBurnIdHex,
        bridgeEventRootHex: '44'.repeat(32),
        recipientErgoTreeHashHex,
        amountNanoErg: '1000000',
      },
    }],
    contractCompatibility: 'candidate-only-trustless-v2-required',
  };
}

function unsignedTxRecord() {
  return buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord({
    generatedAt: '2026-07-01T10:30:00.000Z',
    label: 'Trustless single-leaf unsigned tx source boundary',
    candidateEvidence: candidateRecord(),
    selectedBoxes: {
      trackerBoxId: '10'.repeat(32),
      aggregateDupBoxId: '20'.repeat(32),
      unlockBoxId: '30'.repeat(32),
    },
    payoutBinding: unsignedTxPayoutBinding(),
    settlementShape: {
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 3, 4],
      contextExtensionKeyCountsCsv: '0,3,4',
    },
    contextExtensionGuard: {
      status: 'pass',
      reason: 'unsigned-source-boundary-only',
      effectiveThreshold: 4,
      offenders: [],
      signingPermitted: false,
      broadcastPermitted: false,
    },
  });
}

describe('trustless candidate evidence JSON validator', () => {
  it('prints candidate-only claim boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-candidate-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run trustless:candidate:validate');
    expect(result.stdout).toContain('candidate-only trustless settlement evidence JSON');
    expect(result.stdout).toContain('not Gate 5 closure');
    expect(result.stdout).toContain('not pre-broadcast evidence');
    expect(result.stdout).toContain('not settlement readiness');
    expect(result.stdout).toContain('not claim authorization');
    expect(result.stdout).toContain('does not sign, check, approve, submit, reconcile, broadcast, mutate runtime databases, or authorize claims');
  });

  it('passes a read-only trustless settlement candidate evidence JSON file', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidateRecord(), null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('PASS');
      expect(result.errors).toEqual([]);
      expect(result.message).toContain('broadcast=no');
      expect(result.message).toContain('candidate-only evidence');
      expect(result.message).toContain('not Gate 5 closure');
      expect(result.message).toContain('pre-broadcast evidence');
      expect(result.message).toContain('settlement readiness');
      expect(result.message).toContain('claim authorization');
      expect(result.record?.evidenceKind).toBe('trustless-settlement-candidate');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks pre-broadcast aggregate evidence JSON as the wrong record kind', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'prebroadcast.json');
      const prebroadcast = buildAggregateSettlementPrebroadcastEvidenceRecord({
        generatedAt: '2026-05-18T01:08:19.018Z',
        command: 'check',
        label: 'Aggregate settlement check',
        expectedTxId: '11'.repeat(32),
        transactionCheckResponse: '',
        checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
        settlementShape: {
          inputCount: 3,
          outputCount: 4,
          contextExtensionKeyCounts: [0, 3, 1],
          contextExtensionKeyCountsCsv: '0,3,1',
        },
        claims: [{
          burnTxHash: '22'.repeat(32),
          sidechainBlockHeight: 123,
        }],
      });
      writeFileSync(join(process.cwd(), target), JSON.stringify(prebroadcast, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('evidenceKind must be trustless-settlement-candidate');
      expect(result.errors).toContain('contractCompatibility must be candidate-only-trustless-v2-required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks candidate JSON that cannot independently prove burnId derivation', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      const candidate = candidateRecord();
      delete (candidate.claims[0] as any).trustlessBurnDerivation;
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidate, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('claims[0].trustlessBurnDerivation must be an object');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks candidate JSON with a mismatched derived burnId', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      const candidate = candidateRecord();
      candidate.claims[0].trustlessBurnDerivation.derivedBurnIdHex = '99'.repeat(32);
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidate, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'claims[0].trustlessBurnDerivation.derivedBurnIdHex must match sidechainIdHex, legacySidechainTxHash, and sidechainLogIndex',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks candidate JSON with amountNanoErg above uint64', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      const candidate = candidateRecord();
      candidate.claims[0].settlementIdentity.amountNanoErg = '18446744073709551616';
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidate, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'claims[0].settlementIdentity.amountNanoErg must be a positive uint64 decimal string',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks candidate JSON without recipient and amount bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      const candidate = candidateRecord();
      delete (candidate.claims[0].settlementIdentity as any).recipientErgoTreeHashHex;
      delete (candidate.claims[0].settlementIdentity as any).amountNanoErg;
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidate, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'claims[0].settlementIdentity.recipientErgoTreeHashHex must be 32-byte hex',
      );
      expect(result.errors).toContain(
        'claims[0].settlementIdentity.amountNanoErg must be a positive uint64 decimal string',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks old candidate JSON without explicit candidate-only boundary fields', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      const candidate = candidateRecord();
      delete (candidate as any).boundary;
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidate, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('boundary must be an object');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks candidate JSON that tries to claim Gate 5 or production-candidate readiness', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      const candidate = candidateRecord();
      (candidate.boundary as any).gate5Closure = 'yes';
      (candidate.boundary as any).testnetProductionCandidateClaim = 'yes';
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidate, null, 2));

      const result = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('boundary.gate5Closure must be no');
      expect(result.errors).toContain('boundary.testnetProductionCandidateClaim must be no');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe or unreadable trustless candidate evidence JSON targets', () => {
    const unsafe = validateTrustlessCandidateEvidenceJsonTarget('../operator/private-key-candidate.json');
    expect(unsafe.status).toBe('BLOCKED');
    expect(unsafe.errors).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );

    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      writeFileSync(join(process.cwd(), target), '{not-json');

      const unreadable = validateTrustlessCandidateEvidenceJsonTarget(target);
      expect(unreadable.status).toBe('BLOCKED');
      expect(unreadable.errors).toContain(
        `${target}: trustless candidate evidence JSON could not be read or parsed`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('trustless unsigned tx evidence JSON validator', () => {
  it('prints unsigned transaction claim boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-unsigned-tx-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run trustless:unsigned-tx:validate');
    expect(result.stdout).toContain('read-only trustless single-leaf unsigned transaction evidence JSON');
    expect(result.stdout).toContain('not Gate 5 closure');
    expect(result.stdout).toContain('not pre-broadcast evidence');
    expect(result.stdout).toContain('not transaction-check evidence');
    expect(result.stdout).toContain('not expected-tx-id evidence');
    expect(result.stdout).toContain('not signing authorization');
    expect(result.stdout).toContain('When --report-out is provided, exactly one unsigned transaction evidence target is allowed');
    expect(result.stdout).toContain('does not sign, check, approve, submit, reconcile, broadcast, mutate runtime databases, or authorize claims');
  });

  it('passes a read-only trustless unsigned transaction evidence JSON file', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-evidence-'));
    try {
      const target = join(basename(dir), 'unsigned-tx.json');
      writeFileSync(join(process.cwd(), target), JSON.stringify(unsignedTxRecord(), null, 2));

      const result = validateTrustlessUnsignedTxEvidenceJsonTarget(target);
      expect(result.status).toBe('PASS');
      expect(result.errors).toEqual([]);
      expect(result.message).toContain('broadcast=no');
      expect(result.message).toContain('contextExtensionGuard=pass');
      expect(result.message).toContain('not Gate 5 closure');
      expect(result.message).toContain('pre-broadcast evidence');
      expect(result.message).toContain('transaction-check evidence');
      expect(result.message).toContain('expected-tx-id evidence');
      expect(result.message).toContain('signing authorization');
      expect(result.record?.evidenceKind).toBe('trustless-single-leaf-unsigned-tx');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a bounded validation report for trustless unsigned transaction evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-evidence-'));
    try {
      const target = join(basename(dir), 'unsigned-tx.json');
      const reportTarget = join(basename(dir), 'unsigned-tx-validation-report.md');
      writeFileSync(join(process.cwd(), target), JSON.stringify(unsignedTxRecord(), null, 2));

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-trustless-unsigned-tx-evidence.ts',
          target,
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Wrote trustless unsigned transaction validation report to --report-out target.');

      const report = readFileSync(join(process.cwd(), reportTarget), 'utf8');
      expect(report).toContain('# Trustless Unsigned Transaction Evidence Validation Report');
      expect(report).toContain('| Result | PASS |');
      expect(report).toContain('| Structural issues | 0 |');
      expect(report).toContain('No structural issue groups were reported.');
      expect(report).toContain('| Gate 5 trustless burn closure claimed | no |');
      expect(report).toContain('| Pre-broadcast evidence claimed | no |');
      expect(report).toContain('| Transaction-check evidence claimed | no |');
      expect(report).toContain('| Expected transaction ID evidence claimed | no |');
      expect(report).toContain('| Signing authorization granted | no |');
      expect(report).toContain('| Transaction broadcast, submit, deploy, reconcile, or state mutation performed | no |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts spaced Windows paths from trustless unsigned transaction validation reports', () => {
    const separator = String.fromCharCode(92);
    const target = ['C:', 'bridge workstation', 'operator evidence', 'unsigned-tx.json'].join(separator);
    const validation: TrustlessUnsignedTxEvidenceJsonValidation = {
      label: target,
      status: 'PASS',
      message: `Validated ${target}`,
      errors: [],
    };

    const report = formatTrustlessUnsignedTxValidationReportMarkdown(
      buildTrustlessUnsignedTxValidationReport({
        command: `npm run trustless:unsigned-tx:validate -- ${target} --report-out <report.md>`,
        workingDirectory: target,
        validatedTarget: target,
        validation,
      }),
    );

    expect(report).toContain('| Validated target | [local-path] |');
    expect(report).toContain('| Working directory | [local-path] |');
    expect(report).not.toContain('bridge workstation');
    expect(report).not.toContain('operator evidence');
  });

  it('blocks candidate identity JSON as the wrong unsigned transaction evidence kind', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-evidence-'));
    try {
      const target = join(basename(dir), 'candidate.json');
      writeFileSync(join(process.cwd(), target), JSON.stringify(candidateRecord(), null, 2));

      const result = validateTrustlessUnsignedTxEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('evidenceKind must be trustless-single-leaf-unsigned-tx');
      expect(result.errors).toContain('selectedBoxes must be an object');
      expect(result.errors).toContain('settlementShape must be an object');
      expect(result.errors).toContain('contextExtensionGuard must be an object');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks pre-broadcast aggregate evidence JSON as the wrong unsigned transaction record kind', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-evidence-'));
    try {
      const target = join(basename(dir), 'prebroadcast.json');
      const prebroadcast = buildAggregateSettlementPrebroadcastEvidenceRecord({
        generatedAt: '2026-05-18T01:08:19.018Z',
        command: 'check',
        label: 'Aggregate settlement check',
        expectedTxId: '11'.repeat(32),
        transactionCheckResponse: '',
        checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
        settlementShape: {
          inputCount: 3,
          outputCount: 4,
          contextExtensionKeyCounts: [0, 3, 1],
          contextExtensionKeyCountsCsv: '0,3,1',
        },
        claims: [{
          burnTxHash: '22'.repeat(32),
          sidechainBlockHeight: 123,
        }],
      });
      writeFileSync(join(process.cwd(), target), JSON.stringify(prebroadcast, null, 2));

      const result = validateTrustlessUnsignedTxEvidenceJsonTarget(target);
      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('evidenceKind must be trustless-single-leaf-unsigned-tx');
      expect(result.errors).toContain('contractCompatibility must be candidate-only-trustless-v2-required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks --report-out when multiple unsigned transaction evidence targets are supplied', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-evidence-'));
    try {
      const firstTarget = join(basename(dir), 'unsigned-tx-a.json');
      const secondTarget = join(basename(dir), 'unsigned-tx-b.json');
      const reportTarget = join(basename(dir), 'unsigned-tx-validation-report.md');
      writeFileSync(join(process.cwd(), firstTarget), JSON.stringify(unsignedTxRecord(), null, 2));
      writeFileSync(join(process.cwd(), secondTarget), JSON.stringify(unsignedTxRecord(), null, 2));

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-trustless-unsigned-tx-evidence.ts',
          firstTarget,
          secondTarget,
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        '--report-out requires exactly one trustless unsigned transaction evidence target.',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe or unreadable trustless unsigned transaction evidence JSON targets', () => {
    const unsafe = validateTrustlessUnsignedTxEvidenceJsonTarget('../operator/private-key-unsigned-tx.json');
    expect(unsafe.status).toBe('BLOCKED');
    expect(unsafe.errors).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );

    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-evidence-'));
    try {
      const target = join(basename(dir), 'unsigned-tx.json');
      writeFileSync(join(process.cwd(), target), '{not-json');

      const unreadable = validateTrustlessUnsignedTxEvidenceJsonTarget(target);
      expect(unreadable.status).toBe('BLOCKED');
      expect(unreadable.errors).toContain(
        `${target}: trustless unsigned TX evidence JSON could not be read or parsed`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
