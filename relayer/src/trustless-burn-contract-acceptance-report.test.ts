import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import {
  buildTrustlessBurnContractAcceptanceCommand,
  buildTrustlessBurnContractAcceptanceReport,
  formatTrustlessBurnContractAcceptanceMarkdown,
  validateTrustlessBurnContractAcceptanceReportJson,
} from './trustless-burn-contract-acceptance-report.js';

const CANDIDATE_TARGET = '../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md';
const INSTANCE_BINDING_JSON_TARGET = '../evidence/trustless-burn/artifacts/gate5-trustless-burn-instance-binding-2026-07-09-ace3896d.json';
const PROOF_VECTOR_TARGET = 'test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json';
const SOURCE_COMMIT = 'a2c66a8c';
const CURRENT_ERGO_HEIGHT = 987664;

function readText(target: string): string {
  return readFileSync(join(process.cwd(), target), 'utf8');
}

function readJson(target: string): unknown {
  return JSON.parse(readText(target));
}

function buildReport(overrides: { currentErgoHeight?: number; proofVectorJson?: unknown } = {}) {
  return buildTrustlessBurnContractAcceptanceReport({
    sourceCommit: SOURCE_COMMIT,
    command: buildTrustlessBurnContractAcceptanceCommand({
      sourceCommit: SOURCE_COMMIT,
      candidate: CANDIDATE_TARGET,
      instanceBindingJson: INSTANCE_BINDING_JSON_TARGET,
      proofVector: PROOF_VECTOR_TARGET,
      currentErgoHeight: overrides.currentErgoHeight ?? CURRENT_ERGO_HEIGHT,
    }),
    candidateTarget: CANDIDATE_TARGET,
    candidateMarkdown: readText(CANDIDATE_TARGET),
    instanceBindingJsonTarget: INSTANCE_BINDING_JSON_TARGET,
    instanceBindingJson: readJson(INSTANCE_BINDING_JSON_TARGET),
    proofVectorTarget: PROOF_VECTOR_TARGET,
    proofVectorJson: overrides.proofVectorJson ?? readJson(PROOF_VECTOR_TARGET),
    currentErgoHeight: overrides.currentErgoHeight ?? CURRENT_ERGO_HEIGHT,
  });
}

describe('trustless burn contract-equivalent acceptance report', () => {
  it('passes the current Gate 5 instance through the local V2 contract predicate model', () => {
    const report = buildReport();

    expect(report.status).toBe('PASS');
    expect(report.structuralIssues).toBe(0);
    expect(report.sidechainHeight).toBe(12345);
    expect(report.positiveAcceptance.accepted).toBe(true);
    expect(report.positiveAcceptance.derived.merkleRootHex).toBe(report.identity.bridgeEventRootHex);
    expect(report.negativeCases.map(test => test.status)).toEqual([
      'REJECTED',
      'REJECTED',
      'REJECTED',
      'REJECTED',
      'REJECTED',
      'REJECTED',
      'REJECTED',
      'REJECTED',
    ]);
    expect(validateTrustlessBurnContractAcceptanceReportJson(report)).toEqual([]);
  });

  it('blocks stale anchor heights before local contract-equivalent acceptance can pass', () => {
    const report = buildReport({ currentErgoHeight: 987663 });

    expect(report.status).toBe('BLOCKED');
    expect(report.positiveAcceptance.accepted).toBe(false);
    expect(report.positiveAcceptance.errors).toContain('Ergo anchor height must satisfy minimum confirmations');
    expect(validateTrustlessBurnContractAcceptanceReportJson(report)).toEqual([]);
  });

  it('renders boundary text without claiming on-chain acceptance or Gate 5 closure', () => {
    const markdown = formatTrustlessBurnContractAcceptanceMarkdown(buildReport());

    expect(markdown).toContain('# Gate 5 Local Contract-Equivalent Burn Acceptance');
    expect(markdown).toContain('| On-chain proof acceptance claimed | no |');
    expect(markdown).toContain('| Gate 5 trustless-burn evidence claimed complete | no |');
    expect(markdown).toContain('| ErgoScript VM execution performed | no |');
  });

  it('writes Markdown and JSON reports through the CLI', () => {
    const dir = mkdtempSync('tmp-trustless-contract-acceptance-');
    const mdOut = join(dir, 'contract-acceptance.md');
    const jsonOut = join(dir, 'contract-acceptance.json');
    try {
      const result = spawnSync(process.execPath, [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-burn-contract-acceptance.ts',
        '--source-commit',
        SOURCE_COMMIT,
        '--candidate',
        CANDIDATE_TARGET,
        '--instance-binding-json',
        INSTANCE_BINDING_JSON_TARGET,
        '--proof-vector',
        PROOF_VECTOR_TARGET,
        '--current-ergo-height',
        String(CURRENT_ERGO_HEIGHT),
        '--out',
        mdOut,
        '--json-out',
        jsonOut,
      ], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Gate 5 Local Contract-Equivalent Burn Acceptance');
      expect(result.stdout).toContain('trustless burn contract-equivalent acceptance JSON report');
      expect(readFileSync(mdOut, 'utf8')).toContain('| Status | PASS |');
      expect(JSON.parse(readFileSync(jsonOut, 'utf8')).status).toBe('PASS');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
