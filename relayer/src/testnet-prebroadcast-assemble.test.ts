import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildAggregateSettlementPrebroadcastEvidenceRecord } from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import { assembleTestnetPrebroadcastEvidence } from './testnet-prebroadcast-assemble.js';

const HEX = {
  expectedTxId: '11'.repeat(32),
  burnTxId: '22'.repeat(32),
  sidechainBlockHash: '33'.repeat(32),
  bridgeEventRoot: '44'.repeat(32),
  pegIn: '55'.repeat(32),
  deploymentStateHash: '66'.repeat(32),
  contractId: '77'.repeat(32),
  singletonId: '88'.repeat(32),
};
const MNEMONIC_PATH_FRAGMENT = 'mnemo' + 'nic';

function aggregateRecord(): Record<string, any> {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T10:30:00.000Z',
    command: 'check-with-ingest',
    label: 'Aggregate same-TX ingest settlement',
    expectedTxId: HEX.expectedTxId,
    transactionCheckResponse: '',
    checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
    settlementShape: {
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 4, 2],
      contextExtensionKeyCountsCsv: '0,4,2',
    },
    claims: [{
      burnTxHash: HEX.burnTxId,
      sidechainBlockHeight: 200,
      sidechainHeaderHashHex: HEX.sidechainBlockHash,
      bridgeEventRootHex: HEX.bridgeEventRoot,
      ergoAnchorHeight: 100,
    }],
  });
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    aggregateRecord: aggregateRecord(),
    aggregateJsonLinkTarget: 'aggregate-check.json',
    evidencePackageName: 'fresh-testnet-prebroadcast-2026-05-17',
    date: '2026-05-17',
    operator: 'operator-a',
    reviewer: 'reviewer-a',
    gitCommit: '48e57e8d',
    sidechainNetwork: 'patched-devnet',
    checkArtifact: 'artifact://prebroadcast/check.log npm run check PASS',
    wasmTestArtifact: 'artifact://prebroadcast/wasm-test.log npm run wasm:test PASS',
    readinessArtifact: 'artifact://prebroadcast/readiness.log npm run demo:readiness PASS',
    statusArtifact: 'artifact://prebroadcast/status.log npm run status PASS',
    contextExtensionGuardResult:
      'artifact://prebroadcast/context-extension-guard.log ContextExtension guard PASS sigma-rust/JVM conformance fail-closed behavior',
    broadcastPolicyResult:
      'artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false',
    cleanDeploymentStateEvidence:
      `artifact://prebroadcast/deployment-state.log clean deployment state deployment-state hash=${HEX.deploymentStateHash} contract IDs=${HEX.contractId} singleton inventory=${HEX.singletonId}`,
    currentErgoHeight: '150 artifact://prebroadcast/current-ergo-height.log',
    currentSidechainHeight: '250 artifact://prebroadcast/current-sidechain-height.log',
    pegInEventIdOrTxId: `${HEX.pegIn} artifact://prebroadcast/peg-in.log`,
    nonBroadcastArtifact: 'artifact://prebroadcast/non-broadcast-attestation.log',
    ...overrides,
  };
}

describe('assembleTestnetPrebroadcastEvidence', () => {
  it('creates validator-compatible prebroadcast evidence from aggregate check JSON and completed artifacts', () => {
    const report = assembleTestnetPrebroadcastEvidence(validInput());

    expect(report.status).toBe('CREATED');
    expect(report.errors).toEqual([]);
    expect(report.validation.status).toBe('PASS');
    expect(report.markdown).toContain('- Environment: testnet');
    expect(report.markdown).toContain(`- Expected transaction ID: ${HEX.expectedTxId} [aggregate JSON](aggregate-check.json)`);
    expect(report.markdown).toContain('- Gate 3 closure claimed: no');
    expect(report.markdown).toContain('- Live broadcast approval recorded: no artifact://prebroadcast/non-broadcast-attestation.log');
    expect(report.lines.join('\n')).toContain('no signing, node query, submit, confirmation, or broadcast command executed');
  });

  it('blocks unsafe aggregate JSON link targets before rendering evidence', () => {
    const report = assembleTestnetPrebroadcastEvidence(validInput({
      aggregateJsonLinkTarget: '../aggregate-check.json',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors.join('\n')).toContain('aggregate JSON link target must not use parent directory segments');
  });

  it('blocks unsafe CLI aggregate JSON inputs before reading them', () => {
    const target = `operator/${MNEMONIC_PATH_FRAGMENT}-check.json`;
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-prebroadcast-assemble.ts',
        '--aggregate-json',
        target,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('<blocked evidence JSON target>: aggregate evidence JSON input BLOCKED');
    expect(result.stderr).not.toContain(target);
    expect(result.stderr).not.toContain('Could not read aggregate JSON');
  });

  it('blocks CLI aggregate JSON inputs that resolve outside the bridge without leaking the target', () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'prebroadcast-assemble-outside-'));
    const outsideEvidenceDir = join(outsideRoot, 'evidence');
    const internalRoot = mkdtempSync('.tmp-prebroadcast-assemble-link-');
    const linkPath = join(internalRoot, 'link-out');
    const target = `${basename(internalRoot)}/link-out/aggregate-check.json`;

    try {
      mkdirSync(outsideEvidenceDir, { recursive: true });
      writeFileSync(
        join(outsideEvidenceDir, 'aggregate-check.json'),
        JSON.stringify(aggregateRecord(), null, 2),
        'utf8',
      );
      symlinkSync(outsideEvidenceDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/testnet-prebroadcast-assemble.ts',
          '--aggregate-json',
          target,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('<blocked evidence JSON target>: aggregate evidence JSON input BLOCKED');
      expect(result.stderr).not.toContain('link-out');
      expect(result.stderr).not.toContain('aggregate-check.json');
      expect(result.stderr).not.toContain(outsideRoot);
    } finally {
      rmSync(internalRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when CLI aggregate JSON input is missing', () => {
    const target = 'tmp-prebroadcast-assemble-missing/aggregate-check.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-prebroadcast-assemble.ts',
        '--aggregate-json',
        target,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${target}: aggregate evidence JSON input could not be read in read-only mode`);
    expect(result.stderr).not.toContain('JSON.parse');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before reading aggregate JSON inputs', () => {
    const outTarget = '../operator/private-key-evidence.md';
    const aggregateTarget = 'missing-aggregate-check.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-prebroadcast-assemble.ts',
        '--aggregate-json',
        aggregateTarget,
        '--out',
        outTarget,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain(aggregateTarget);
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI Markdown output guard before aggregate JSON reads', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/scripts/testnet-prebroadcast-assemble.ts'),
      'utf8',
    );

    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain('const aggregateRecord = readAggregateJsonRecord(args.aggregateJson);');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const aggregateRecord = readAggregateJsonRecord(args.aggregateJson);'),
    );
  });

  it('blocks generated packages that carry enabled broadcast evidence', () => {
    const report = assembleTestnetPrebroadcastEvidence(validInput({
      broadcastPolicyResult:
        'artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: BRIDGE_BROADCAST_ENABLED=true',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain(
      'Testnet Pre-Broadcast Evidence: document must not include broadcast-enabled or live-action indicators',
    );
  });
});
