import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildTrustlessBurnInstanceBindingCommand,
  buildTrustlessBurnInstanceBindingReport,
  formatTrustlessBurnInstanceBindingMarkdown,
  validateTrustlessBurnInstanceBindingReportJson,
} from './trustless-burn-instance-binding.js';

describe('Gate 5 trustless burn instance binding', () => {
  it('binds one non-mainnet instance from the execution request and candidate evidence', () => {
    const report = buildTrustlessBurnInstanceBindingReport({
      sourceCommit: 'abcdef1',
      executionRequestTarget: '../evidence/trustless-burn/request.md',
      executionRequestMarkdown: executionRequestMarkdown(),
      candidateTarget: '../evidence/trustless-burn/candidate.md',
      candidateMarkdown: candidateMarkdown(),
      command: buildTrustlessBurnInstanceBindingCommand({
        sourceCommit: 'abcdef1',
        executionRequest: '../evidence/trustless-burn/request.md',
        candidate: '../evidence/trustless-burn/candidate.md',
        out: '../evidence/trustless-burn/instance-binding.md',
        jsonOut: '../evidence/trustless-burn/artifacts/instance-binding.json',
      }),
    });
    const markdown = formatTrustlessBurnInstanceBindingMarkdown(report);

    expect(report.status).toBe('TRUSTLESS_BURN_INSTANCE_BINDING_READY');
    expect(report.exitCode).toBe(0);
    expect(report.selectedNetwork).toBe('local offline non-mainnet');
    expect(report.identity.sidechainIdHex).toBe('11'.repeat(32));
    expect(report.identity.sidechainTxHashHex).toBe('66'.repeat(32));
    expect(report.identity.sidechainBlockHashHex).toBe('22'.repeat(32));
    expect(report.identity.eventIndex).toBe(8);
    expect(report.identity.bridgeEventRootHex).toBe('1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb');
    expect(report.identity.ergoAnchorHeight).toBe(987654);
    expect(report.identity.burnIdHex).toBe('548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f');
    expect(report.identity.duplicatePreventionKeyHex).toBe(report.identity.burnIdHex);
    expect(report.identity.recipientErgoTreeHashHex).toBe('88'.repeat(32));
    expect(report.identity.amountNanoErg).toBe('2000000');
    expect(report.identity.assetIdHex).toBe('00'.repeat(32));
    expect(report.identity.proofVectorTarget).toBe(
      '../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json',
    );
    expect(report.supportingEvidenceTargets).toContain(
      'artifact://trustless-burn/artifacts/completed-gate5-burn-id-binding-2026-06-29-b8968c16.md',
    );
    expect(report.remainingBlockers).toContain('Ergo extension-section anchoring');
    expect(report.boundary['Concrete non-mainnet instance binding produced']).toBe('yes');
    expect(report.boundary['Node or RPC request performed by binding command']).toBe('no');
    expect(report.boundary['Transaction signing/check/submit/broadcast/reconciliation/deployment performed']).toBe('no');
    expect(report.boundary['Gate 5 trustless-burn evidence claimed complete']).toBe('no');
    expect(report.boundary['Release gate PASS claimed']).toBe('no');
    expect(validateTrustlessBurnInstanceBindingReportJson(report)).toEqual([]);
    expect(markdown).toContain('# Gate 5 Trustless Burn Instance Binding');
    expect(markdown).toContain('| Selected network | local offline non-mainnet |');
    expect(markdown).toContain('| burnId | 548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f |');
    expect(markdown).toContain('This packet does not close Gate 5');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('rejects reports that flip secret, runtime-state, node, signing, or claim boundaries', () => {
    const report = buildTrustlessBurnInstanceBindingReport({
      sourceCommit: 'abcdef1',
      executionRequestTarget: '../evidence/trustless-burn/request.md',
      executionRequestMarkdown: executionRequestMarkdown(),
      candidateTarget: '../evidence/trustless-burn/candidate.md',
      candidateMarkdown: candidateMarkdown(),
      command: 'npm run trustless:instance-binding -- --source-commit abcdef1',
    });

    const errors = validateTrustlessBurnInstanceBindingReportJson({
      ...report,
      boundary: {
        ...report.boundary,
        'Secret or environment file read': 'yes',
        'Wallet recovery material or private key read': 'yes',
        'Runtime database opened by binding command': 'yes',
        'Private deployment state opened by binding command': 'yes',
        'Node or RPC request performed by binding command': 'yes',
        'Transaction signing/check/submit/broadcast/reconciliation/deployment performed': 'yes',
        'Gate 5 trustless-burn evidence claimed complete': 'yes',
        'Release gate PASS claimed': 'yes',
      },
    });

    expect(errors).toContain('--trustless-burn-instance-binding-json report.boundary.Secret or environment file read must be no');
    expect(errors).toContain(
      '--trustless-burn-instance-binding-json report.boundary.Wallet recovery material or private key read must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-instance-binding-json report.boundary.Runtime database opened by binding command must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-instance-binding-json report.boundary.Private deployment state opened by binding command must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-instance-binding-json report.boundary.Node or RPC request performed by binding command must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-instance-binding-json report.boundary.Transaction signing/check/submit/broadcast/reconciliation/deployment performed must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-instance-binding-json report.boundary.Gate 5 trustless-burn evidence claimed complete must be no',
    );
    expect(errors).toContain('--trustless-burn-instance-binding-json report.boundary.Release gate PASS claimed must be no');
  });

  it('writes guarded Markdown and JSON output from existing binding inputs', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-burn-instance-binding-'));
    try {
      const executionRequest = join(basename(dir), 'request.md');
      const candidate = join(basename(dir), 'candidate.md');
      const out = join(basename(dir), 'binding.md');
      const jsonOut = join(basename(dir), 'binding.json');
      writeFileSync(join(process.cwd(), executionRequest), executionRequestMarkdown(), 'utf8');
      writeFileSync(join(process.cwd(), candidate), candidateMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-burn-instance-binding.ts',
          '--source-commit',
          'abcdef1',
          '--execution-request',
          executionRequest,
          '--candidate',
          candidate,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('# Gate 5 Trustless Burn Instance Binding');
      expect(result.stdout).toContain('- trustless burn instance binding JSON report written:');
      expect(result.stdout).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(existsSync(join(process.cwd(), out))).toBe(true);
      expect(existsSync(join(process.cwd(), jsonOut))).toBe(true);
      const written = JSON.parse(readFileSync(join(process.cwd(), jsonOut), 'utf8'));
      expect(written.status).toBe('TRUSTLESS_BURN_INSTANCE_BINDING_READY');
      expect(written.identity.burnIdHex).toBe('548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f');
      expect(written.boundary['Secret or environment file read']).toBe('no');
      expect(written.boundary['Transaction signing/check/submit/broadcast/reconciliation/deployment performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the candidate is missing a required instance identifier', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-burn-instance-binding-invalid-'));
    try {
      const executionRequest = join(basename(dir), 'request.md');
      const candidate = join(basename(dir), 'candidate.md');
      writeFileSync(join(process.cwd(), executionRequest), executionRequestMarkdown(), 'utf8');
      writeFileSync(
        join(process.cwd(), candidate),
        candidateMarkdown().replace(`"sidechainTxHashHex": "${'66'.repeat(32)}",`, ''),
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-burn-instance-binding.ts',
          '--source-commit',
          'abcdef1',
          '--execution-request',
          executionRequest,
          '--candidate',
          candidate,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--candidate missing required instance binding field sidechainTxHashHex');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function executionRequestMarkdown(): string {
  return [
    '# Gate 5 Trustless Burn Execution Request',
    '',
    'This request converts the current Gate 5 trustless-burn prerequisite map and operator packet into the next concrete operator evidence captures.',
    'It is planning output only and does not inspect private runtime state, read secrets, query nodes, authorize signing or transaction checks, submit, broadcast, close Gate 5, or support release claims.',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Status | TRUSTLESS_BURN_EXECUTION_REQUEST_READY |',
    '| Source commit | abcdef1 |',
    '| Candidate target | ../evidence/trustless-burn/candidate.md |',
    '',
    '## Operator Requests',
    '',
    '| Phase | Operator action | Evidence to return | Stop condition |',
    '| --- | --- | --- | --- |',
    '| 1. Bind one non-mainnet trustless-burn instance | Select exactly one non-mainnet burn instance and record sidechainId, sidechain transaction hash, sidechain block hash, event index, bridgeEventRoot, Ergo anchor height, burnId, duplicate-prevention key, recipient binding, amount, asset, proof-vector target, and candidate target. | Gate 5 instance binding packet with all identifiers, source evidence targets, selected network, reviewer-visible timestamp, and explicit no-mainnet/no-claim/no-broadcast scope. | Stop if the instance is generic, targetless, mainnet-scoped, missing any identifier, not bound to the current candidate target, or relies on private deployment/runtime material. |',
    '| 2. Refresh local proof-vector, candidate, and unsigned evidence | Produce or refresh guarded local proof-vector validation. | Proof-vector JSON. | Stop on unsafe JSON targets. |',
    '',
    '## Do Not Provide',
    '',
    '- Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, seed phrases, raw runtime databases, private deployment-state files, or node data directories.',
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '| --- | --- |',
    '| Planning output only | yes |',
    '| Concrete operator execution request produced | yes |',
    '| Secret or environment file read | no |',
    '| Wallet recovery material or private key read | no |',
    '| Runtime database opened by request command | no |',
    '| Private deployment state opened by request command | no |',
    '| Node or RPC request performed by request command | no |',
    '| Transaction signing/check/submit/broadcast/reconciliation/deployment performed | no |',
    '| Gate 5 trustless-burn evidence claimed complete | no |',
    '| Release gate PASS claimed | no |',
    '| Production-ready claim allowed | no |',
    '| Mainnet-grade evidence linked | no |',
    '| Testnet production-candidate claim authorized by request | no |',
  ].join('\n');
}

function candidateMarkdown(): string {
  return [
    '# Gate 5 Trustless Burn SPV-Linked Candidate - abcdef1',
    '',
    'This packet converts the current trustless-burn proof-vector evidence into the Trustless Burn Verification Evidence layout.',
    'No wallet recovery material, signing credential material, restricted deployment records, local runtime state, private database state, or live transaction evidence was read or used for this packet.',
    '',
    'Current local prerequisite evidence:',
    '',
    '- artifact://trustless-burn/artifacts/completed-gate5-burn-id-binding-2026-06-29-b8968c16.md',
    '- artifact://trustless-burn/artifacts/completed-gate5-duplicate-prevention-key-binding-2026-06-29-b8968c16.md',
    '- artifact://trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-26-9d5927a1.md',
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
    '',
    '## Commitment Format',
    '',
    '| Field | Value or encoding | Evidence | Status |',
    '|---|---|---|---|',
    `| ergoAnchorHeight | 987654 | artifact://trustless-burn/anchor-height.md | linked |`,
    '',
    '## Local Proof Vector',
    '',
    'Proof-vector validation report:',
    '../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json',
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
          recipientErgoTreeHashHex: '88'.repeat(32),
          amountNanoErg: '2000000',
          assetIdHex: '00'.repeat(32),
        },
        bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
        proof: [{ side: 'left', hashHex: '82'.repeat(32) }],
        duplicatePreventionKeyHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
        recipientErgoTreeHashHex: '88'.repeat(32),
        amountNanoErg: '2000000',
        assetIdHex: '00'.repeat(32),
        negativeCases: [{ name: 'wrong-sidechain-id' }],
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

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
