import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildTrustlessBurnValidationReport } from './trustless-burn-evidence-report.js';
import {
  buildTrustlessBurnPrerequisiteMap,
  formatTrustlessBurnPrerequisiteMapMarkdown,
  prerequisiteForTrustlessBurnIssue,
} from './trustless-burn-prerequisite-map.js';
import {
  buildTrustlessBurnOperatorPacket,
  formatTrustlessBurnOperatorPacketMarkdown,
} from './trustless-burn-operator-packet.js';

describe('Gate 5 trustless burn prerequisite map', () => {
  it('maps trustless-burn validator blockers to concrete operator prerequisites', () => {
    expect(
      prerequisiteForTrustlessBurnIssue(
        'Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass',
      ),
    ).toContain('trustless:anchor-observe');
    expect(
      prerequisiteForTrustlessBurnIssue(
        'Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass',
      ),
    ).toContain('trustless:spv-tracker-observe');
    expect(
      prerequisiteForTrustlessBurnIssue(
        'Publication Decision: Trustless burn verification implemented must be yes before Gate 5 evidence can pass',
      ),
    ).toContain('Completed trustless-burn implementation evidence');
  });

  it('formats a blocked prerequisite map without closing Gate 5 or authorizing broadcast', () => {
    const validation = blockedValidation([
      'Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass',
      'Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass',
      'Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass',
      'Publication Decision: Trustless burn verification implemented must be yes before Gate 5 evidence can pass',
      'Reviewer Sign-Off: Protocol reviewer: decision must be approve before Gate 5 evidence can pass',
    ]);
    const validationReport = buildTrustlessBurnValidationReport({
      command: 'npm run trustless:validate -- ../evidence/trustless-burn/gate5-blocker.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../evidence/trustless-burn/gate5-blocker.md',
      validation,
    });
    const map = buildTrustlessBurnPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../evidence/trustless-burn/gate5-blocker.md',
      validatorReportTarget: '../evidence/trustless-burn/artifacts/report.md',
      command: 'npm run trustless:prerequisite-map -- --candidate ../evidence/trustless-burn/gate5-blocker.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });

    const markdown = formatTrustlessBurnPrerequisiteMapMarkdown(map);
    expect(markdown).toContain('# Gate 5 Trustless Burn Prerequisite Map - abcdef1');
    expect(markdown).toContain('| Result | BLOCKED |');
    expect(markdown).toContain('| Structural issues | 5 |');
    expect(markdown).toContain('## Anchor Observation Input Request');
    expect(markdown).toContain('## SPV Tracker Observation Input Request');
    expect(markdown).toContain('`sidechainFinality.sidechainBlockHeight`');
    expect(markdown).toContain('`sidechainFinality.observedSidechainHeight` / `requiredConfirmations`');
    expect(markdown).toContain('| Gate 5 trustless-burn closure claimed | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('formats an operator packet with exact capture questions and no authorization', () => {
    const validation = blockedValidation([
      'Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass',
      'Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass',
      'Reviewer Sign-Off: Security reviewer: decision must be approve before Gate 5 evidence can pass',
    ]);
    const validationReport = buildTrustlessBurnValidationReport({
      command: 'npm run trustless:validate -- ../evidence/trustless-burn/gate5-blocker.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../evidence/trustless-burn/gate5-blocker.md',
      validation,
    });
    const map = buildTrustlessBurnPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../evidence/trustless-burn/gate5-blocker.md',
      validatorReportTarget: '../evidence/trustless-burn/artifacts/report.md',
      command: 'npm run trustless:prerequisite-map -- --candidate ../evidence/trustless-burn/gate5-blocker.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });

    const packet = buildTrustlessBurnOperatorPacket({
      prerequisiteMap: map,
      prerequisiteMapTarget: '../evidence/trustless-burn/gate5-prerequisite-map.md',
      command: 'npm run trustless:prerequisite-map -- --candidate ../evidence/trustless-burn/gate5-blocker.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md> --operator-packet-out <packet.md>',
    });
    const markdown = formatTrustlessBurnOperatorPacketMarkdown(packet);

    expect(markdown).toContain('# Gate 5 Trustless Burn Operator Packet - abcdef1');
    expect(markdown).toContain('Current proof-vector candidate baseline');
    expect(markdown).toContain('Current Gate 5 candidate ../evidence/trustless-burn/gate5-blocker.md');
    expect(markdown).toContain('trustless-burn validator report ../evidence/trustless-burn/artifacts/report.md');
    expect(markdown).toContain('proof-vector validation report ../evidence/trustless-burn/artifacts/current-proof-vector-report.json');
    expect(markdown).not.toContain('2026-07-04-136ab3f2');
    expect(markdown).toContain('Compact unsigned candidate');
    expect(markdown).toContain('contextExtensionGuard = pass');
    expect(markdown).toContain('Replacement-profile target-node acceptance');
    expect(markdown).toContain('separately versioned, reviewed, activated external-fee settlement profile');
    expect(markdown).toContain('application-bound source finality');
    expect(markdown).toContain('global DUP cutover lineage');
    expect(markdown).not.toContain('npm run settle:aggregate -- check-with-ingest');
    expect(markdown).toContain('no submit, reconciliation, deployment, or broadcast approval');
    expect(markdown).toContain('Link replacement-profile target-node acceptance before treating node-backed check output as Gate 5 settlement-binding evidence.');
    expect(markdown).toContain('signed node-backed transaction check');
    expect(markdown).toContain('explicit non-mainnet signing/check approval');
    expect(markdown).toContain('No for legacy V1');
    expect(markdown).not.toContain('without signing');
    expect(markdown).toContain('Trustless burn verification implemented = yes');
    expect(markdown).toContain('Transitional trusted burn path disabled = yes');
    expect(markdown).toContain('Critical/high findings open = 0');
    expect(markdown).toContain('| Completed trustless burn evidence claimed | no |');
    expect(markdown).toContain('| Settlement readiness claimed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a validation report, prerequisite map, and operator packet for a guarded Markdown target', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-burn-prerequisite-map-'));
    try {
      const target = join(basename(dir), 'candidate.md');
      const reportOut = join(basename(dir), 'validator-report.md');
      const mapOut = join(basename(dir), 'prerequisite-map.md');
      const operatorPacketOut = join(basename(dir), 'operator-packet.md');
      writeFileSync(join(process.cwd(), target), invalidTrustlessBurnEvidence(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-burn-prerequisite-map.ts',
          '--candidate',
          target,
          '--validator-commit',
          'abcdef1',
          '--validator-report-out',
          reportOut,
          '--out',
          mapOut,
          '--operator-packet-out',
          operatorPacketOut,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('Trustless burn prerequisite map written');
      expect(result.stdout).toContain('Trustless burn operator packet written');
      const report = readFileSync(join(process.cwd(), reportOut), 'utf8');
      const map = readFileSync(join(process.cwd(), mapOut), 'utf8');
      const operatorPacket = readFileSync(join(process.cwd(), operatorPacketOut), 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(map).toContain('# Gate 5 Trustless Burn Prerequisite Map - abcdef1');
      expect(map).toContain('| Gate 5 trustless-burn closure claimed | no |');
      expect(operatorPacket).toContain('# Gate 5 Trustless Burn Operator Packet - abcdef1');
      expect(operatorPacket).toContain('artifact://trustless/proof-vector-report.json');
      expect(operatorPacket).toContain('| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function blockedValidation(errors: string[]) {
  return {
    status: 'BLOCKED' as const,
    classification: {
      evidenceName: '',
      gitCommit: '',
      releaseLevel: '',
      environment: '',
      broadcastMode: '',
      trustPath: '',
      reviewer: '',
      date: '',
    },
    componentRows: [],
    commitmentRows: [],
    burnProofRows: [],
    localProofVectorReportTarget: '../evidence/trustless-burn/artifacts/current-proof-vector-report.json',
    positiveRows: [],
    negativeRows: [],
    publicationDecision: {
      trustlessBurnVerificationImplemented: '',
      releaseSupported: '',
      productionReadyClaimAllowed: '',
      testnetProductionCandidateClaimAllowed: '',
      transitionalTrustedBurnPathDisabled: '',
      criticalHighFindingsOpen: '',
      releaseNotesUpdated: '',
      requiredReleaseChecklistUpdates: '',
      requiredReleaseNoteUpdates: '',
      reviewerDecisionSummary: '',
    },
    reviewerRows: [],
    errors,
    message: 'trustless burn evidence BLOCKED',
  };
}

function invalidTrustlessBurnEvidence(): string {
  return [
    '# Gate 5 Trustless Burn Candidate',
    '',
    '## Evidence Classification',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Evidence name | Gate 5 blocked candidate |',
    '| Git commit | abcdef1 |',
    '| Release level | institutional reference |',
    '| Environment | testnet |',
    '| Broadcast mode | disabled |',
    '| Trust path | trustless burn proof path |',
    '| Reviewer | A. Shannon |',
    '| Date | 2026-07-03 |',
    '',
    '## Required Components',
    '',
    '| Component | Required property | Evidence | Status |',
    '|---|---|---|---|',
    '| Ergo extension-section anchoring | 0x04xx extension anchoring | artifact://trustless/anchor.md | blocker |',
    '',
    '## Commitment Format',
    '',
    '| Field | Value or encoding | Evidence | Status |',
    '|---|---|---|---|',
    '| bridgeEventRoot | 00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff | artifact://trustless/root.md | linked |',
    '',
    '## Burn Proof Binding',
    '',
    '| Field | Binding rule | Evidence | Status |',
    '|---|---|---|---|',
    '| burnId | 111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000 | artifact://trustless/burn-id.md | linked |',
    '',
    '## Local Proof Vector',
    '',
    '```json',
    '{}',
    '```',
    '',
    'Proof-vector validation report: artifact://trustless/proof-vector-report.json',
    '',
    '## Positive Proof Acceptance',
    '',
    '| Check | Expected result | Evidence | Status |',
    '|---|---|---|---|',
    '| Valid burn proof acceptance | accepted | artifact://trustless/positive-proof.md | blocker |',
    '',
    '## Negative Tests',
    '',
    '| Check | Expected result | Evidence | Status |',
    '|---|---|---|---|',
    '| Wrong sidechain ID | rejected | artifact://trustless/wrong-sidechain.md | linked |',
    '',
    '## Publication Decision',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Trustless burn verification implemented | no |',
    '| Release supported | institutional reference |',
    '| Production-ready claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
    '| Transitional trusted burn path disabled | no |',
    '| Critical/high findings open | 1 |',
    '| Release notes updated | no |',
    '| Required release checklist updates | none |',
    '| Required release-note updates | none |',
    '| Reviewer decision summary | Gate 5 remains blocked. |',
    '',
    '## Reviewer Sign-Off',
    '',
    '| Role | Name | Decision | Date | Notes |',
    '|---|---|---|---|---|',
    '| Protocol reviewer | A. Shannon | block | 2026-07-03 | Trustless burn outcome remains blocked. |',
  ].join('\n');
}

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
