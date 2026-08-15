import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  summarizeTrustlessUnsignedTxPayoutBinding,
  type AggregateSettlementTrustlessUnsignedTxEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import {
  buildTrustlessBurnInstanceBindingCommand,
  buildTrustlessBurnInstanceBindingReport,
  formatTrustlessBurnInstanceBindingMarkdown,
} from './trustless-burn-instance-binding.js';
import {
  buildTrustlessBurnInstanceRefreshCommand,
  buildTrustlessBurnInstanceRefreshReport,
  formatTrustlessBurnInstanceRefreshMarkdown,
  validateTrustlessBurnInstanceRefreshReportJson,
} from './trustless-burn-instance-refresh.js';

const recipientErgoTreeHex = '0008cd02' + '44'.repeat(32);
const recipientErgoTreeHashHex = unsignedTxPayoutBinding(1_000_000).recipientErgoTreeHashHex;

describe('Gate 5 trustless burn instance refresh', () => {
  it('marks refresh READY only when proof-vector, candidate, unsigned TX, and contract-acceptance evidence match the instance', () => {
    const targets = refreshTargets('tmp-ready');
    const binding = instanceBinding(targets);
    const report = buildTrustlessBurnInstanceRefreshReport({
      sourceCommit: 'abcdef1',
      command: buildTrustlessBurnInstanceRefreshCommand({
        sourceCommit: 'abcdef1',
        instanceBinding: targets.binding,
        instanceBindingJson: targets.bindingJson,
        candidate: targets.candidate,
        proofVectorReport: targets.proofVector,
        unsignedTxReport: targets.unsignedReport,
        unsignedTxJson: targets.unsignedJson,
        out: targets.out,
        jsonOut: targets.jsonOut,
      }),
      instanceBindingTarget: targets.binding,
      instanceBindingJsonTarget: targets.bindingJson,
      instanceBindingJson: binding,
      instanceBindingMarkdown: formatTrustlessBurnInstanceBindingMarkdown(binding),
      candidateTarget: targets.candidate,
      candidateMarkdown: candidateMarkdown(targets.proofVector),
      proofVectorReportTarget: targets.proofVector,
      proofVectorReportJson: proofVectorReport(),
      unsignedTxReportTarget: targets.unsignedReport,
      unsignedTxReportMarkdown: unsignedValidationMarkdown(targets.unsignedJson),
      unsignedTxJsonTarget: targets.unsignedJson,
      unsignedTxValidation: {
        label: targets.unsignedJson,
        status: 'PASS',
        message: 'Trustless unsigned TX evidence PASS',
        errors: [],
        record: matchingUnsignedTxRecord(),
      },
      contractAcceptanceJsonTarget: targets.contractAcceptanceJson,
      contractAcceptanceJson: contractAcceptanceReport(),
    });
    const markdown = formatTrustlessBurnInstanceRefreshMarkdown(report);

    expect(report.status).toBe('TRUSTLESS_BURN_INSTANCE_REFRESH_READY');
    expect(report.exitCode).toBe(0);
    expect(report.structuralIssues).toBe(0);
    expect(report.mismatches).toEqual([]);
    expect(report.checks.every(check => check.status === 'pass')).toBe(true);
    expect(report.boundary['Transaction check performed']).toBe('no');
    expect(report.boundary['Transaction signing performed or authorized']).toBe('no');
    expect(report.boundary['Transaction submit or broadcast performed or authorized']).toBe('no');
    expect(report.boundary['Contract-equivalent acceptance evidence checked']).toBe('yes');
    expect(validateTrustlessBurnInstanceRefreshReportJson(report)).toEqual([]);
    expect(markdown).toContain('| Status | TRUSTLESS_BURN_INSTANCE_REFRESH_READY |');
    expect(markdown).toContain('| burnId | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |');
    expect(markdown).toContain(`| Contract-equivalent acceptance JSON | ${targets.contractAcceptanceJson} |`);
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('blocks when a structurally valid unsigned TX belongs to another trustless burn instance', () => {
    const targets = refreshTargets('tmp-blocked');
    const binding = instanceBinding(targets);
    const report = buildTrustlessBurnInstanceRefreshReport({
      sourceCommit: 'abcdef1',
      command: 'npm run trustless:instance-refresh -- --source-commit abcdef1',
      instanceBindingTarget: targets.binding,
      instanceBindingJsonTarget: targets.bindingJson,
      instanceBindingJson: binding,
      instanceBindingMarkdown: formatTrustlessBurnInstanceBindingMarkdown(binding),
      candidateTarget: targets.candidate,
      candidateMarkdown: candidateMarkdown(targets.proofVector),
      proofVectorReportTarget: targets.proofVector,
      proofVectorReportJson: proofVectorReport(),
      unsignedTxReportTarget: targets.unsignedReport,
      unsignedTxReportMarkdown: unsignedValidationMarkdown(targets.unsignedJson),
      unsignedTxJsonTarget: targets.unsignedJson,
      unsignedTxValidation: {
        label: targets.unsignedJson,
        status: 'PASS',
        message: 'Trustless unsigned TX evidence PASS',
        errors: [],
        record: staleUnsignedTxRecord(),
      },
    });

    expect(report.status).toBe('TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.structuralIssues).toBeGreaterThan(0);
    expect(report.mismatches).toContain(
      'unsignedTx.claims[0].settlementIdentity.duplicatePreventionKeyHex must match instance 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
    );
    expect(report.mismatches).toContain(
      'unsignedTx.claims[0].settlementIdentity.bridgeEventRootHex must match instance 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
    );
    expect(report.nextEvidence[0]).toContain('Treat the existing unsigned transaction or contract-equivalent acceptance evidence as stale');
    expect(validateTrustlessBurnInstanceRefreshReportJson(report)).toEqual([]);
  });

  it('blocks when contract-equivalent acceptance evidence belongs to another bridgeEventRoot', () => {
    const targets = refreshTargets('tmp-contract-blocked');
    const binding = instanceBinding(targets);
    const report = buildTrustlessBurnInstanceRefreshReport({
      sourceCommit: 'abcdef1',
      command: 'npm run trustless:instance-refresh -- --source-commit abcdef1',
      instanceBindingTarget: targets.binding,
      instanceBindingJsonTarget: targets.bindingJson,
      instanceBindingJson: binding,
      instanceBindingMarkdown: formatTrustlessBurnInstanceBindingMarkdown(binding),
      candidateTarget: targets.candidate,
      candidateMarkdown: candidateMarkdown(targets.proofVector),
      proofVectorReportTarget: targets.proofVector,
      proofVectorReportJson: proofVectorReport(),
      unsignedTxReportTarget: targets.unsignedReport,
      unsignedTxReportMarkdown: unsignedValidationMarkdown(targets.unsignedJson),
      unsignedTxJsonTarget: targets.unsignedJson,
      unsignedTxValidation: {
        label: targets.unsignedJson,
        status: 'PASS',
        message: 'Trustless unsigned TX evidence PASS',
        errors: [],
        record: matchingUnsignedTxRecord(),
      },
      contractAcceptanceJsonTarget: targets.contractAcceptanceJson,
      contractAcceptanceJson: contractAcceptanceReport({ bridgeEventRootHex: 'aa'.repeat(32) }),
    });

    expect(report.status).toBe('TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.mismatches).toContain(
      'contractAcceptance.identity.bridgeEventRootHex must match instance 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
    );
    expect(report.mismatches).toContain(
      'contractAcceptance.positiveAcceptance.derived.merkleRootHex must match instance 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
    );
    expect(validateTrustlessBurnInstanceRefreshReportJson(report)).toEqual([]);
  });

  it('writes a blocked Markdown and JSON report from guarded evidence targets', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-burn-instance-refresh-'));
    try {
      const prefix = basename(dir);
      const targets = refreshTargets(prefix);
      const binding = instanceBinding(targets);
      writeFileSync(join(process.cwd(), targets.binding), formatTrustlessBurnInstanceBindingMarkdown(binding), 'utf8');
      writeFileSync(join(process.cwd(), targets.bindingJson), JSON.stringify(binding, null, 2), 'utf8');
      writeFileSync(join(process.cwd(), targets.candidate), candidateMarkdown(targets.proofVector), 'utf8');
      writeFileSync(join(process.cwd(), targets.proofVector), JSON.stringify(proofVectorReport(), null, 2), 'utf8');
      writeFileSync(join(process.cwd(), targets.unsignedReport), unsignedValidationMarkdown(targets.unsignedJson), 'utf8');
      writeFileSync(join(process.cwd(), targets.unsignedJson), JSON.stringify(staleUnsignedTxRecord(), null, 2), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-burn-instance-refresh.ts',
          '--source-commit',
          'abcdef1',
          '--instance-binding',
          targets.binding,
          '--instance-binding-json',
          targets.bindingJson,
          '--candidate',
          targets.candidate,
          '--proof-vector-report',
          targets.proofVector,
          '--unsigned-tx-report',
          targets.unsignedReport,
          '--unsigned-tx-json',
          targets.unsignedJson,
          '--out',
          targets.out,
          '--json-out',
          targets.jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('# Gate 5 Trustless Burn Instance Refresh Check');
      expect(result.stdout).toContain('| Status | TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED |');
      expect(result.stdout).toContain('- trustless burn instance refresh JSON report written:');
      expect(result.stdout).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(existsSync(join(process.cwd(), targets.out))).toBe(true);
      expect(existsSync(join(process.cwd(), targets.jsonOut))).toBe(true);
      const written = JSON.parse(readFileSync(join(process.cwd(), targets.jsonOut), 'utf8'));
      expect(written.status).toBe('TRUSTLESS_BURN_INSTANCE_REFRESH_BLOCKED');
      expect(written.mismatches).toContain(
        'unsignedTx.claims[0].settlementIdentity.amountNanoErg must match instance 2000000',
      );
      expect(written.boundary['Node or RPC request performed by refresh command']).toBe('no');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function refreshTargets(prefix: string) {
  return {
    binding: `${prefix}/binding.md`,
    bindingJson: `${prefix}/binding.json`,
    candidate: `${prefix}/candidate.md`,
    proofVector: `${prefix}/proof-vector.json`,
    unsignedReport: `${prefix}/unsigned-validation.md`,
    unsignedJson: `${prefix}/unsigned.json`,
    contractAcceptanceJson: `${prefix}/contract-acceptance.json`,
    out: `${prefix}/refresh.md`,
    jsonOut: `${prefix}/refresh.json`,
  };
}

function instanceBinding(targets: ReturnType<typeof refreshTargets>) {
  return buildTrustlessBurnInstanceBindingReport({
    sourceCommit: 'abcdef1',
    executionRequestTarget: `${targets.binding}-request.md`,
    executionRequestMarkdown: '',
    candidateTarget: targets.candidate,
    candidateMarkdown: candidateMarkdown(targets.proofVector),
    command: buildTrustlessBurnInstanceBindingCommand({
      sourceCommit: 'abcdef1',
      executionRequest: `${targets.binding}-request.md`,
      candidate: targets.candidate,
      out: targets.binding,
      jsonOut: targets.bindingJson,
    }),
  });
}

function candidateMarkdown(proofVectorTarget: string): string {
  return [
    '# Gate 5 Trustless Burn SPV-Linked Candidate - abcdef1',
    '',
    'No wallet recovery material, signing credential material, restricted deployment records, local runtime state, private database state, or live transaction evidence was read or used for this packet.',
    '',
    '## Evidence Classification',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Environment | local offline |',
    '| Broadcast mode | disabled |',
    '| Trust path | trustless burn proof path |',
    '',
    '## Required Components',
    '',
    '| Component | Required property | Evidence | Status |',
    '|---|---|---|---|',
    '| Ergo extension-section anchoring | Commitment embedded under collision-safe keys | artifact://trustless-burn/anchor.md | blocker |',
    '| Sidechain header/finality verifier | Ergo-verifiable sidechain header or finality rule | artifact://trustless-burn/finality.md | blocker |',
    '| Burn inclusion proof | On-chain proof accepts only included burn events | artifact://trustless-burn/proof.md | blocker |',
    '| DUP settlement binding | Proved burn ID is the exact DUP key inserted by settlement | artifact://trustless-burn/dup.md | blocker |',
    '| Independent review | Independent review | independent Gate 5 review evidence has not been captured | blocker |',
    '| Valid burn proof acceptance | accepted | on-chain proof acceptance evidence has not been captured | blocker |',
    '',
    '## Commitment Format',
    '',
    '| Field | Value or encoding | Evidence | Status |',
    '|---|---|---|---|',
    '| ergoAnchorHeight | 987654 | artifact://trustless-burn/anchor-height.md | linked |',
    '',
    '## Local Proof Vector',
    '',
    'Proof-vector validation report:',
    proofVectorTarget,
    '',
    '```json',
    JSON.stringify(
      {
        leaf: {
          sidechainIdHex: '11'.repeat(32),
          sidechainBlockHashHex: '22'.repeat(32),
          burnIdHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
          sidechainTxHashHex: '66'.repeat(32),
          eventIndex: 8,
          recipientErgoTreeHashHex,
          amountNanoErg: '2000000',
          assetIdHex: '00'.repeat(32),
        },
        bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
        proof: [{ side: 'left', hashHex: '82'.repeat(32) }],
        duplicatePreventionKeyHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
        recipientErgoTreeHashHex,
        amountNanoErg: '2000000',
        assetIdHex: '00'.repeat(32),
      },
      null,
      2,
    ),
    '```',
    '',
    '## Publication Decision',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Trustless burn verification implemented | no |',
    '| Production-ready claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
    '',
    '## Reviewer Sign-Off',
    '',
    '| Role | Name | Decision | Date | Notes |',
    '|---|---|---|---|---|',
    '| Protocol reviewer | A. Shannon | block | 2026-07-03 | Gate 5 remains blocked |',
  ].join('\n');
}

function proofVectorReport() {
  return {
    schemaVersion: 1,
    command: 'trustless:proof-vector:validate',
    status: 'PASS',
    errors: [],
    boundary: {
      readOnly: true,
      localProofCoreOnly: true,
      gate5Closure: false,
      settlementReadiness: false,
      broadcastAuthorization: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    reports: [
      {
        label: 'proof-vector.json',
        status: 'PASS',
        errors: [],
        bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
        negativeCaseResults: [
          'wrong-sidechain-id',
          'wrong-burn-id',
          'wrong-event-index',
          'wrong-recipient',
          'wrong-amount',
          'wrong-duplicate-prevention-key',
          'wrong-bridge-event-root',
          'malformed-inclusion-path',
        ].map(name => ({ name, status: 'REJECTED' })),
      },
    ],
  };
}

function contractAcceptanceReport(overrides: { bridgeEventRootHex?: string } = {}) {
  const bridgeEventRootHex = overrides.bridgeEventRootHex ?? '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb';
  return {
    schemaVersion: 1,
    status: 'PASS',
    exitCode: 0,
    command: 'npm run trustless:contract-acceptance -- --source-commit abcdef1',
    sourceCommit: 'abcdef1',
    candidateTarget: 'tmp-ready/candidate.md',
    instanceBindingJsonTarget: 'tmp-ready/binding.json',
    proofVectorTarget: 'tmp-ready/proof-vector.json',
    currentErgoHeight: 987664,
    sidechainHeight: 12345,
    selectedNetwork: 'local offline non-mainnet',
    identity: {
      sidechainIdHex: '11'.repeat(32),
      sidechainTxHashHex: '66'.repeat(32),
      sidechainBlockHashHex: '22'.repeat(32),
      eventIndex: 8,
      bridgeEventRootHex,
      ergoAnchorHeight: 987654,
      burnIdHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
      duplicatePreventionKeyHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
      recipientErgoTreeHashHex,
      amountNanoErg: '2000000',
      assetIdHex: '00'.repeat(32),
      proofVectorTarget: 'tmp-ready/proof-vector.json',
    },
    structuralIssues: 0,
    sourceChecks: [
      {
        check: 'Instance binding JSON validates',
        status: 'pass',
        detail: 'binding target tmp-ready/binding.json',
      },
    ],
    positiveAcceptance: {
      accepted: true,
      errors: [],
      derived: {
        trackerKeyHex: '99'.repeat(32),
        merkleRootHex: bridgeEventRootHex,
        burnProofNodeCount: 1,
        dupLookupProofLength: 0,
        ergoAnchorHeight: 987654,
      },
    },
    negativeCases: [
      'tracker-event-root-drift',
      'malformed-inclusion-path',
      'stale-ergo-anchor',
      'payout-value-drift',
      'recipient-tree-drift',
      'tracker-key-drift',
      'spent-dup-key',
      'bad-proof-side-byte',
    ].map(name => ({
      name,
      status: 'REJECTED',
      expectedError: `${name} expected rejection`,
      observedErrors: [`${name} expected rejection`],
    })),
    nextEvidence: ['local predicate packet remains prerequisite evidence only'],
    boundary: {
      'Contract-equivalent local predicate model evaluated': 'yes',
      'Current Gate 5 non-mainnet instance reused': 'yes',
      'Positive proof bundle checked by local predicate model': 'yes',
      'Negative predicate cases checked locally': 'yes',
      'Secret or environment file read': 'no',
      'Wallet recovery material or private key read': 'no',
      'Runtime database opened': 'no',
      'Private deployment state opened': 'no',
      'Node or RPC request performed': 'no',
      'ErgoScript VM execution performed': 'no',
      'On-chain proof acceptance claimed': 'no',
      'Mined Ergo anchor claimed': 'no',
      'Sidechain finality claimed': 'no',
      'DUP insertion on-chain claimed': 'no',
      'Transaction check performed': 'no',
      'Expected transaction ID claimed': 'no',
      'Transaction signing performed or authorized': 'no',
      'Transaction submit or broadcast performed or authorized': 'no',
      'Gate 5 trustless-burn evidence claimed complete': 'no',
      'Release gate PASS claimed': 'no',
      'Testnet production-candidate claim support': 'no',
      'Production-ready claim support': 'no',
      'Mainnet-grade evidence linked': 'no',
    },
  };
}

function unsignedValidationMarkdown(unsignedJsonTarget: string): string {
  return [
    '# Trustless Unsigned Transaction Evidence Validation Report',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Command | npm run trustless:unsigned-tx:validate -- <trustless-single-leaf-unsigned-tx-evidence.json> --report-out <report.md> |',
    '| Working directory | ergo-sidechain-bridge/relayer |',
    `| Validated target | ${unsignedJsonTarget} |`,
    '| Result | PASS |',
    '| Exit code | 0 |',
    '| Structural issues | 0 |',
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    '| Transaction-check evidence claimed | no |',
    '| Expected transaction ID evidence claimed | no |',
    '| Signing authorization granted | no |',
    '| Transaction broadcast, submit, deploy, reconcile, or state mutation performed | no |',
  ].join('\n');
}

function matchingUnsignedTxRecord(): AggregateSettlementTrustlessUnsignedTxEvidenceRecord {
  return {
    ...staleUnsignedTxRecord(),
    label: 'matching trustless unsigned tx',
    claims: [
      {
        legacySidechainTxHash: '66'.repeat(32),
        sidechainBlockHeight: 1001,
        trustlessBurnDerivation: {
          sidechainIdHex: '11'.repeat(32),
          sidechainLogIndex: 8,
          derivedBurnIdHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
          bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
          recipientErgoTreeHashHex,
          amountNanoErg: '2000000',
        },
      },
    ],
    payoutBinding: unsignedTxPayoutBinding(2_000_000),
  };
}

function staleUnsignedTxRecord(): AggregateSettlementTrustlessUnsignedTxEvidenceRecord {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-03T00:00:00.000Z',
    evidenceKind: 'trustless-single-leaf-unsigned-tx',
    label: 'stale trustless unsigned tx',
    stateTrackerMode: 'read-only',
    broadcast: 'no',
    boundary: {
      gate5Closure: 'no',
      prebroadcastEvidence: 'no',
      settlementReadiness: 'no',
      transactionCheck: 'no',
      expectedTxId: 'no',
      signing: 'no',
      submit: 'no',
      testnetProductionCandidateClaim: 'no',
      productionReadyClaim: 'no',
    },
    claimCount: 1,
    claims: [
      {
        legacySidechainTxHash: '55'.repeat(32),
        sidechainBlockHeight: 1001,
        trustlessBurnDerivation: {
          sidechainIdHex: '11'.repeat(32),
          sidechainLogIndex: 7,
          derivedBurnIdHex: '57182144540292d653cf0d5f3b1e1f347795d67f9dd7fa3d1d2e2fe420d06c3a',
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: '57182144540292d653cf0d5f3b1e1f347795d67f9dd7fa3d1d2e2fe420d06c3a',
          bridgeEventRootHex: '57fd4d8eae68fecabf590561062f0c054514149aca9617cfe12d1e0e5c6bb5c9',
          recipientErgoTreeHashHex: 'dd254d2834c85be8f7495b3044197f145cb39175571cb6d1a56ba6ff7f6f7401',
          amountNanoErg: '1000000',
        },
      },
    ],
    selectedBoxes: {
      trackerBoxId: '10'.repeat(32),
      aggregateDupBoxId: '20'.repeat(32),
      unlockBoxId: '30'.repeat(32),
    },
    payoutBinding: unsignedTxPayoutBinding(1_000_000),
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
      offenderCount: 0,
      offenders: [],
      signingPermitted: false,
      broadcastPermitted: false,
    },
    contractCompatibility: 'candidate-only-trustless-v2-required',
  };
}

function unsignedTxPayoutBinding(amountNanoErg: number) {
  return summarizeTrustlessUnsignedTxPayoutBinding({
    outputs: [
      {},
      {},
      {
        ergoTree: recipientErgoTreeHex,
        value: amountNanoErg,
      },
      {},
    ],
  });
}

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
