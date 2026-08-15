import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import { writeOfflineReportJson } from './offline-report-json.js';
import {
  buildFreshTestnetCheckpoint,
  collectFreshTestnetAnchorObservations,
  collectFreshTestnetHeightEvidence,
  collectFreshTestnetSingletonCheckpoint,
  readFreshTestnetHeightEvidenceJson,
  readFreshTestnetSingletonCheckpointJson,
  validateFreshCheckpointBroadcastDisabled,
  validateFreshCheckpointReadOnlyNodeUrl,
  type FreshTestnetHeightEvidence,
} from './testnet-fresh-checkpoint.js';

const NOW = new Date('2026-05-18T02:30:00.000Z');
const EXPECTED_TX_ID = '4'.repeat(64);
const BURN_TX_ID = '1'.repeat(64);
const BURN_TX_ID_B = '2'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '6'.repeat(64);
const BRIDGE_EVENT_ROOT = '7'.repeat(64);
const DEPLOYED_STATE_HASH = 'a'.repeat(64);
const SINGLETON_NFT_ID = 'b'.repeat(64);
const SINGLETON_BOX_ID = 'c'.repeat(64);
const SINGLETON_TREE = '1001'.repeat(8);
const DUP_NFT_ID = 'd'.repeat(64);
const DUP_BOX_ID = 'e'.repeat(64);
const DUP_TREE = '1002'.repeat(8);
const ERGO_NODE_URL = 'http://localhost:9052';
const SIDECHAIN_RPC_URL = 'http://localhost:9945';
const liveSingletonSource = { mode: 'live-read-only-node' as const, ergoNodeUrl: ERGO_NODE_URL };
const liveAnchorSource = { mode: 'live-read-only-node' as const, ergoNodeUrl: ERGO_NODE_URL };
const liveHeightSource = {
  mode: 'live-read-only-sources' as const,
  ergoNodeUrl: ERGO_NODE_URL,
  sidechainRpcUrl: SIDECHAIN_RPC_URL,
};

const deployedState: any = {
  network: 'testnet',
  deployedAt: NOW.toISOString(),
  sideChainState: {
    nftId: SINGLETON_NFT_ID,
    boxId: SINGLETON_BOX_ID,
    address: 'addr',
    ergoTreeHex: SINGLETON_TREE,
  },
  doubleUnlockPrevention: {
    nftId: DUP_NFT_ID,
    boxId: DUP_BOX_ID,
    address: 'addr',
    ergoTreeHex: DUP_TREE,
  },
  mainChainLock: { address: 'addr', ergoTreeHex: '1003' },
  mainChainUnlock: { address: 'addr', ergoTreeHex: '1004' },
  relayer: { address: 'addr', publicKey: 'pk' },
};

function aggregateEvidenceRecord(): AggregateSettlementPrebroadcastEvidenceRecord {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: NOW.toISOString(),
    command: 'check-batch',
    label: 'Fresh testnet non-broadcast aggregate checkpoint',
    expectedTxId: EXPECTED_TX_ID,
    transactionCheckResponse: '',
    checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
    settlementShape: {
      inputCount: 4,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 4, 4, 2],
      contextExtensionKeyCountsCsv: '0,4,4,2',
    },
    claims: [
      {
        burnTxHash: BURN_TX_ID,
        sidechainBlockHeight: 200,
        sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
        bridgeEventRootHex: BRIDGE_EVENT_ROOT,
        ergoAnchorHeight: 100,
      },
      {
        burnTxHash: BURN_TX_ID_B,
        sidechainBlockHeight: 201,
        sidechainHeaderHashHex: '8'.repeat(64),
        bridgeEventRootHex: '9'.repeat(64),
        ergoAnchorHeight: 101,
      },
    ],
  });
}

function writeAggregateEvidence(dir: string, record: unknown = aggregateEvidenceRecord()): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(record, null, 2));
  return `${basename(dir)}/aggregate-check.json`;
}

function singletonCheckpoint(overrides: Record<string, unknown> = {}) {
  return {
    deployedStateHash: DEPLOYED_STATE_HASH,
    observedAt: NOW.toISOString(),
    nodeHeight: 250,
    nodeNetwork: 'testnet',
    expectedTxId: EXPECTED_TX_ID,
    expectedTxMempoolAbsent: true,
    expectedTxConfirmedAbsent: true,
    singletons: [{
      name: 'sideChainState',
      nftId: SINGLETON_NFT_ID,
      expectedBoxId: SINGLETON_BOX_ID,
      observedBoxId: SINGLETON_BOX_ID,
      expectedErgoTreeHex: SINGLETON_TREE,
      observedErgoTreeHex: SINGLETON_TREE,
      observedCount: 1,
    }, {
      name: 'doubleUnlockPrevention',
      nftId: DUP_NFT_ID,
      expectedBoxId: DUP_BOX_ID,
      observedBoxId: DUP_BOX_ID,
      expectedErgoTreeHex: DUP_TREE,
      observedErgoTreeHex: DUP_TREE,
      observedCount: 1,
    }],
    ...overrides,
  };
}

function anchorObservations(overrides: Record<string, unknown> = {}) {
  return [
    {
      ergoAnchorHeight: 100,
      expectedBridgeEventRootHex: BRIDGE_EVENT_ROOT,
      observedBridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
      matchingFieldFound: true,
      fieldCount: 1,
      headerIds: ['a'.repeat(64)],
      observedAt: NOW.toISOString(),
      nodeHeight: 250,
    },
    {
      ergoAnchorHeight: 101,
      expectedBridgeEventRootHex: '9'.repeat(64),
      observedBridgeEventRootHexes: ['9'.repeat(64)],
      matchingFieldFound: true,
      fieldCount: 1,
      headerIds: ['b'.repeat(64)],
      observedAt: NOW.toISOString(),
      nodeHeight: 250,
    },
  ].map(observation => ({ ...observation, ...overrides }));
}

function heightEvidence(overrides: Record<string, unknown> = {}): FreshTestnetHeightEvidence {
  return {
    observedAt: NOW.toISOString(),
    ergoNodeHeight: 250,
    sidechainBlockHeight: 300,
    sources: {
      ergo: 'read-only-no-auth /info',
      sidechain: 'read-only EVM getBlockNumber',
    },
    broadcastEnabled: false,
    ...overrides,
  } as FreshTestnetHeightEvidence;
}

describe('fresh testnet non-broadcast checkpoint', () => {
  it('creates a publication-blocker checkpoint from aggregate check JSON', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.errors).toEqual([]);
      expect(report.checkpoint).toMatchObject({
        aggregateEvidence,
        lifecycleGate: 'Fresh testnet lifecycle',
        lifecycleStatus: 'publication blocker',
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [BURN_TX_ID, BURN_TX_ID_B],
        sidechainHeaderHashHexes: [SIDECHAIN_BLOCK_HASH, '8'.repeat(64)],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, '9'.repeat(64)],
        transactionCheckResult: 'PASS',
        broadcast: 'no',
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: anchorObservations(),
        heightEvidence: heightEvidence(),
        singletonObservationFreshness: {
          observedAt: NOW.toISOString(),
          checkedAt: NOW.toISOString(),
          maxAgeSeconds: 900,
          maxAgeMinutes: 15,
          ageSeconds: 0,
          ageMs: 0,
          status: 'fresh',
        },
      });
      expect(report.boundary).toEqual({
        lifecyclePassAllowed: false,
        broadcastAuthorized: false,
        liveSubmitPerformed: false,
        confirmationObserved: false,
        reconciliationPerformed: false,
        gate3ClosureAllowed: false,
        productionReadyClaimAllowed: false,
        testnetProductionCandidateClaimAllowed: false,
      });
      expect(report.sourceBindings).toEqual({
        aggregateEvidence,
        anchorObservations: {
          mode: 'live-read-only-node',
          observationCount: 2,
          ergoAnchorHeights: [100, 101],
          bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, '9'.repeat(64)],
          observedAtValues: [NOW.toISOString(), NOW.toISOString()],
          nodeHeights: [250, 250],
          ergoNodeUrl: ERGO_NODE_URL,
          readOnlyNodeClient: true,
          nodeAuthHeader: 'not-used',
          operations: [
            '/info',
            'Ergo extension fields at aggregate anchor heights',
            '0x0401 bridgeEventRoot matching',
          ],
        },
        heightEvidence: {
          mode: 'live-read-only-sources',
          observedAt: NOW.toISOString(),
          ergoNodeHeight: 250,
          sidechainBlockHeight: 300,
          broadcastEnabled: false,
          ergoNodeUrl: ERGO_NODE_URL,
          sidechainRpcUrl: SIDECHAIN_RPC_URL,
          readOnlyErgoNodeClient: true,
          readOnlySidechainRpcClient: true,
          nodeAuthHeader: 'not-used',
          operations: ['/info', 'EVM getBlockNumber'],
        },
        singletonCheckpoint: {
          mode: 'live-read-only-node',
          observedAt: NOW.toISOString(),
          nodeHeight: 250,
          expectedTxId: EXPECTED_TX_ID,
          deployedStateHash: DEPLOYED_STATE_HASH,
          singletonCount: 2,
          ergoNodeUrl: ERGO_NODE_URL,
          readOnlyNodeClient: true,
          nodeAuthHeader: 'not-used',
          operations: [
            '/info',
            'singleton boxes by token ID',
            'mempool/unconfirmed transaction lookup',
            'confirmed transaction lookup',
          ],
        },
      });
      expect(report.markdown).toContain('| Fresh testnet lifecycle | publication blocker |');
      expect(report.markdown).toContain(`Sidechain block hashes: ${SIDECHAIN_BLOCK_HASH},${'8'.repeat(64)}`);
      expect(report.markdown).toContain('Live submit performed: no');
      expect(report.markdown).toContain(`Deployed-state hash: ${DEPLOYED_STATE_HASH}`);
      expect(report.markdown).toContain('Live singleton checkpoint node network: testnet');
      expect(report.markdown).toContain(`Live singleton checkpoint observedAt: ${NOW.toISOString()}`);
      expect(report.markdown).toContain(`Live anchor observations: height=100:match=yes:roots=${BRIDGE_EVENT_ROOT}`);
      expect(report.markdown).toContain(`observedAt=${NOW.toISOString()}`);
      expect(report.markdown).toContain('nodeHeight=250');
      expect(report.markdown).toContain(`Live singleton checkpoint checkedAt: ${NOW.toISOString()}`);
      expect(report.markdown).toContain('Live singleton checkpoint max age seconds: 900');
      expect(report.markdown).toContain('Live singleton checkpoint age seconds: 0');
      expect(report.markdown).toContain('Live singleton checkpoint freshness: fresh');
      expect(report.markdown).toContain('Expected transaction absent from mempool: yes');
      expect(report.markdown).toContain('Expected transaction absent from confirmed chain: yes');
      expect(report.markdown).toContain(`Live singleton observations: sideChainState:${SINGLETON_BOX_ID}:count=1`);
      expect(report.markdown).toContain('Testnet production-candidate claim allowed: no');
      expect(report.lines.join('\n')).toContain('no signing, submit, confirmation, reconciliation, node mutation, or broadcast');
      expect(report.lines.join('\n')).toContain('Legacy V1 submission quarantine:');
      expect(report.lines.join('\n')).toContain('separately versioned external-fee settlement profile');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured checkpoint report', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/fresh-checkpoint.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'fresh-checkpoint.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.status).toBe('CREATED');
      expect(saved.checkpoint.lifecycleStatus).toBe('publication blocker');
      expect(saved.checkpoint.singletonObservationFreshness).toMatchObject({
        maxAgeSeconds: 900,
        ageSeconds: 0,
        status: 'fresh',
      });
      expect(saved.boundary.lifecyclePassAllowed).toBe(false);
      expect(saved.boundary.broadcastAuthorized).toBe(false);
      expect(saved.sourceBindings.singletonCheckpoint.mode).toBe('live-read-only-node');
      expect(saved.sourceBindings.singletonCheckpoint.observedAt).toBe(NOW.toISOString());
      expect(saved.sourceBindings.singletonCheckpoint.nodeHeight).toBe(250);
      expect(saved.sourceBindings.singletonCheckpoint.expectedTxId).toBe(EXPECTED_TX_ID);
      expect(saved.sourceBindings.singletonCheckpoint.deployedStateHash).toBe(DEPLOYED_STATE_HASH);
      expect(saved.sourceBindings.singletonCheckpoint.singletonCount).toBe(2);
      expect(saved.sourceBindings.singletonCheckpoint.ergoNodeUrl).toBe(ERGO_NODE_URL);
      expect(saved.sourceBindings.singletonCheckpoint.readOnlyNodeClient).toBe(true);
      expect(saved.sourceBindings.singletonCheckpoint.nodeAuthHeader).toBe('not-used');
      expect(saved.sourceBindings.singletonCheckpoint.operations).toEqual([
        '/info',
        'singleton boxes by token ID',
        'mempool/unconfirmed transaction lookup',
        'confirmed transaction lookup',
      ]);
      expect(saved.sourceBindings.anchorObservations).toEqual({
        mode: 'live-read-only-node',
        observationCount: 2,
        ergoAnchorHeights: [100, 101],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, '9'.repeat(64)],
        observedAtValues: [NOW.toISOString(), NOW.toISOString()],
        nodeHeights: [250, 250],
        ergoNodeUrl: ERGO_NODE_URL,
        readOnlyNodeClient: true,
        nodeAuthHeader: 'not-used',
        operations: [
          '/info',
          'Ergo extension fields at aggregate anchor heights',
          '0x0401 bridgeEventRoot matching',
        ],
      });
      expect(saved.sourceBindings.heightEvidence).toEqual({
        mode: 'live-read-only-sources',
        observedAt: NOW.toISOString(),
        ergoNodeHeight: 250,
        sidechainBlockHeight: 300,
        broadcastEnabled: false,
        ergoNodeUrl: ERGO_NODE_URL,
        sidechainRpcUrl: SIDECHAIN_RPC_URL,
        readOnlyErgoNodeClient: true,
        readOnlySidechainRpcClient: true,
        nodeAuthHeader: 'not-used',
        operations: ['/info', 'EVM getBlockNumber'],
      });
      expect(saved.markdown).toContain('Fresh Testnet Non-Broadcast Checkpoint');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe CLI JSON output targets before opening checkpoint evidence inputs', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-fresh-checkpoint.ts',
        '--aggregate-evidence',
        'missing-aggregate-check.json',
        '--height-evidence',
        'missing-height-evidence.json',
        '--current-ergo-height',
        '250',
        '--current-sidechain-height',
        '300',
        '--ergo-node-network',
        'testnet',
        '--sidechain-network',
        'patched-devnet',
        '--json-out',
        jsonOutTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(jsonOutTarget);
    expect(result.stderr).not.toContain('missing-aggregate-check.json');
    expect(result.stderr).not.toContain('missing-height-evidence.json');
    expect(result.stderr).not.toContain('JSON evidence file could not be read');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before opening checkpoint evidence inputs', () => {
    const outTarget = '../operator/private-key-evidence.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-fresh-checkpoint.ts',
        '--aggregate-evidence',
        'missing-aggregate-check.json',
        '--height-evidence',
        'missing-height-evidence.json',
        '--current-ergo-height',
        '250',
        '--current-sidechain-height',
        '300',
        '--ergo-node-network',
        'testnet',
        '--sidechain-network',
        'patched-devnet',
        '--out',
        outTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain('missing-aggregate-check.json');
    expect(result.stderr).not.toContain('missing-height-evidence.json');
    expect(result.stderr).not.toContain('JSON evidence file could not be read');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI output target guards before read-only checkpoint observation setup', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-fresh-checkpoint.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceOutputPath } from '../evidence-output-path.js'");
    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('let deployedState: ReturnType<typeof loadDeployedState> | undefined;');
    expect(source).toContain('deployedState = loadDeployedState();');
    expect(source).toContain('const readOnlyErgo = new ErgoClient(ergoNodeUrl, { readOnly: true });');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('deployedState = loadDeployedState();'),
    );
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const readOnlyErgo = new ErgoClient(ergoNodeUrl, { readOnly: true });'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('deployedState = loadDeployedState();'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const readOnlyErgo = new ErgoClient(ergoNodeUrl, { readOnly: true });'),
    );
  });

  it('keeps provided singleton CLI mode from requiring a local deployment-state read', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-fresh-checkpoint.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('if (args.singletonCheckpoint && !args.currentDeployedStateHash)');
    expect(source).toContain('let deployedStateHash = args.currentDeployedStateHash;');
    expect(source).toContain('if (args.singletonCheckpoint) {');
    expect(source).toContain('deployedState = loadDeployedState();');
    expect(source.indexOf('if (args.singletonCheckpoint) {')).toBeLessThan(
      source.indexOf('deployedState = loadDeployedState();'),
    );
    expect(source.indexOf('deployedState = loadDeployedState();')).toBeLessThan(
      source.indexOf('collectFreshTestnetSingletonCheckpoint({'),
    );
  });

  it('requires a sanitized deployed-state hash when CLI singleton checkpoint JSON is provided', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-fresh-checkpoint.ts',
        '--aggregate-evidence',
        'missing-aggregate-check.json',
        '--height-evidence',
        'missing-height-evidence.json',
        '--current-ergo-height',
        '250',
        '--current-sidechain-height',
        '300',
        '--ergo-node-network',
        'testnet',
        '--sidechain-network',
        'patched-devnet',
        '--singleton-checkpoint',
        'evidence/fresh/singleton-checkpoint.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--current-deployed-state-hash is required when --singleton-checkpoint is provided');
    expect(result.stderr).not.toContain('deployed_state.json not found');
    expect(result.stderr).not.toContain('JSON evidence file could not be read');
  });

  it('rejects malformed CLI deployed-state hashes before opening checkpoint evidence inputs', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-fresh-checkpoint.ts',
        '--aggregate-evidence',
        'missing-aggregate-check.json',
        '--height-evidence',
        'missing-height-evidence.json',
        '--current-ergo-height',
        '250',
        '--current-sidechain-height',
        '300',
        '--ergo-node-network',
        'testnet',
        '--sidechain-network',
        'patched-devnet',
        '--singleton-checkpoint',
        'evidence/fresh/singleton-checkpoint.json',
        '--current-deployed-state-hash',
        'abc',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--current-deployed-state-hash must be a 32-byte hex digest');
    expect(result.stderr).not.toContain('deployed_state.json not found');
    expect(result.stderr).not.toContain('JSON evidence file could not be read');
  });

  it('creates a checkpoint with provided-json singleton provenance only when the target is concrete', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/singleton-checkpoint.json',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });
      const templateTarget = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/singleton-checkpoint-template.json',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });
      const genericTarget = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/generic-singleton-checkpoint.json',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });
      const concreteAuditTarget = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/template-removal-audit-singleton-checkpoint.json',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.errors).toEqual([]);
      expect(report.sourceBindings.singletonCheckpoint.mode).toBe('provided-json');
      expect(report.sourceBindings.singletonCheckpoint.target).toBe('evidence/fresh/singleton-checkpoint.json');
      expect(report.sourceBindings.singletonCheckpoint.readOnlyNodeClient).toBe(false);
      expect(report.sourceBindings.singletonCheckpoint.nodeAuthHeader).toBe('not-applicable');
      expect(report.sourceBindings.singletonCheckpoint.operations).toEqual([]);
      expect(concreteAuditTarget.status).toBe('CREATED');
      expect(concreteAuditTarget.errors).toEqual([]);
      expect(concreteAuditTarget.sourceBindings.singletonCheckpoint.target).toBe(
        'evidence/fresh/template-removal-audit-singleton-checkpoint.json',
      );
      expect(templateTarget.status).toBe('BLOCKED');
      expect(templateTarget.errors).toContain(
        'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
      );
      expect(genericTarget.status).toBe('BLOCKED');
      expect(genericTarget.errors).toContain(
        'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
      );

      for (const target of [
        'evidence/fresh/fixture-singleton-checkpoint.json',
        'evidence/fresh/mock-singleton-checkpoint.json',
        'evidence/fresh/dummy-singleton-checkpoint.json',
        'evidence/fresh/fake-singleton-checkpoint.json',
        'evidence/fresh/stub-singleton-checkpoint.json',
        'evidence/fresh/testdata-singleton-checkpoint.json',
      ]) {
        const fixtureTarget = buildFreshTestnetCheckpoint({
          aggregateEvidence,
          currentErgoHeight: 250,
          currentSidechainHeight: 300,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          deployedState,
          deployedStateHash: DEPLOYED_STATE_HASH,
          singletonCheckpoint: singletonCheckpoint(),
          singletonCheckpointSource: {
            mode: 'provided-json',
            target,
          },
          anchorObservations: anchorObservations(),
          anchorObservationSource: liveAnchorSource,
          heightEvidence: heightEvidence(),
          heightEvidenceSource: liveHeightSource,
          now: NOW,
        });

        expect(fixtureTarget.status, target).toBe('BLOCKED');
        expect(fixtureTarget.errors, target).toContain(
          'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
        );
      }

      for (const target of [
        'operator/signing-key-singleton-checkpoint.json',
        'operator/api-key-singleton-checkpoint.json',
        'operator/seed-phrase-singleton-checkpoint.json',
        'evidence/sourceTarget=(.env)/singleton-checkpoint.json',
        'evidence/sourceTarget=(runtime/bridge-state.sqlite)/singleton-checkpoint.json',
        'evidence/sourceTarget=%28.env%29/singleton-checkpoint.json',
        'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/singleton-checkpoint.json',
        'runtime/deployed_state.json',
      ]) {
        const secretTarget = buildFreshTestnetCheckpoint({
          aggregateEvidence,
          currentErgoHeight: 250,
          currentSidechainHeight: 300,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          deployedState,
          deployedStateHash: DEPLOYED_STATE_HASH,
          singletonCheckpoint: singletonCheckpoint(),
          singletonCheckpointSource: {
            mode: 'provided-json',
            target,
          },
          anchorObservations: anchorObservations(),
          anchorObservationSource: liveAnchorSource,
          heightEvidence: heightEvidence(),
          heightEvidenceSource: liveHeightSource,
          now: NOW,
        });
        const serialized = JSON.stringify(secretTarget);

        expect(secretTarget.status, target).toBe('BLOCKED');
        expect(secretTarget.sourceBindings.singletonCheckpoint.target, target).toBe(
          '<blocked singleton checkpoint JSON target>',
        );
        expect(secretTarget.errors, target).toContain(
          'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
        );
        expect(serialized, target).not.toContain(target);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks provided-json height evidence source targets that name fixtures', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const concreteAuditTarget = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/sample-size-analysis-height-evidence.json',
        },
        now: NOW,
      });

      expect(concreteAuditTarget.status).toBe('CREATED');
      expect(concreteAuditTarget.errors).toEqual([]);
      expect(concreteAuditTarget.sourceBindings.heightEvidence.target).toBe(
        'evidence/fresh/sample-size-analysis-height-evidence.json',
      );

      for (const target of [
        'evidence/fresh/sample-height-evidence.json',
        'evidence/fresh/fixture-height-evidence.json',
        'evidence/fresh/mock-height-evidence.json',
        'evidence/fresh/dummy-height-evidence.json',
        'evidence/fresh/fake-height-evidence.json',
        'evidence/fresh/stub-height-evidence.json',
        'evidence/fresh/testdata-height-evidence.json',
      ]) {
        const report = buildFreshTestnetCheckpoint({
          aggregateEvidence,
          currentErgoHeight: 250,
          currentSidechainHeight: 300,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          deployedState,
          deployedStateHash: DEPLOYED_STATE_HASH,
          singletonCheckpoint: singletonCheckpoint(),
          singletonCheckpointSource: liveSingletonSource,
          anchorObservations: anchorObservations(),
          anchorObservationSource: liveAnchorSource,
          heightEvidence: heightEvidence(),
          heightEvidenceSource: {
            mode: 'provided-json',
            target,
          },
          now: NOW,
        });

        expect(report.status, target).toBe('BLOCKED');
        expect(report.errors, target).toContain(
          'height evidence: provided-json source target must cite a concrete non-template height evidence JSON target',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts sensitive provided-json height evidence source targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);

      for (const target of [
        'operator/signing-key-height-evidence.json',
        'operator/api-key-height-evidence.json',
        'operator/seed-phrase-height-evidence.json',
        'evidence/sourceTarget=(.env)/height-evidence.json',
        'evidence/sourceTarget=(runtime/bridge-state.sqlite)/height-evidence.json',
        'evidence/sourceTarget=%28.env%29/height-evidence.json',
        'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/height-evidence.json',
        'runtime/deployed_state.json',
      ]) {
        const report = buildFreshTestnetCheckpoint({
          aggregateEvidence,
          currentErgoHeight: 250,
          currentSidechainHeight: 300,
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          deployedState,
          deployedStateHash: DEPLOYED_STATE_HASH,
          singletonCheckpoint: singletonCheckpoint(),
          singletonCheckpointSource: liveSingletonSource,
          anchorObservations: anchorObservations(),
          anchorObservationSource: liveAnchorSource,
          heightEvidence: heightEvidence(),
          heightEvidenceSource: {
            mode: 'provided-json',
            target,
          },
          now: NOW,
        });
        const serialized = JSON.stringify(report);

        expect(report.status, target).toBe('BLOCKED');
        expect(report.sourceBindings.heightEvidence.target, target).toBe('<blocked height evidence JSON target>');
        expect(report.errors, target).toContain(
          'height evidence: provided-json source target must cite a concrete non-template height evidence JSON target',
        );
        expect(serialized, target).not.toContain(target);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('redacts encoded local-only provided-json source targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const encodedSingletonFileUrl = [
        'file%3A%2F%2F%2F',
        'C%3A%2F',
        'tmp%2F',
        'singleton-checkpoint.json',
      ].join('');
      const encodedHeightAbsolutePath = [
        '%2F',
        'tmp',
        '%2F',
        'height-evidence.json',
      ].join('');
      const encodedSingletonSourceTargetFileUrl = [
        'sourceTarget=',
        'file%3A%2F%2F%2F',
        'C%3A%2F',
        'tmp%2F',
        'singleton-checkpoint.json',
      ].join('');
      const encodedHeightSourceTargetAbsolutePath = [
        'sourceTarget=%2F',
        'tmp%2F',
        'height-evidence.json',
      ].join('');

      const singletonReport = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: encodedSingletonFileUrl,
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });
      const heightReport = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'provided-json',
          target: encodedHeightAbsolutePath,
        },
        now: NOW,
      });
      const singletonSourceTargetReport = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: encodedSingletonSourceTargetFileUrl,
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      });
      const heightSourceTargetReport = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'provided-json',
          target: encodedHeightSourceTargetAbsolutePath,
        },
        now: NOW,
      });

      expect(singletonReport.status).toBe('BLOCKED');
      expect(singletonReport.sourceBindings.singletonCheckpoint.target).toBe(
        '<blocked singleton checkpoint JSON target>',
      );
      expect(singletonReport.errors).toContain(
        'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
      );
      expect(JSON.stringify(singletonReport)).not.toContain(encodedSingletonFileUrl);

      expect(heightReport.status).toBe('BLOCKED');
      expect(heightReport.sourceBindings.heightEvidence.target).toBe('<blocked height evidence JSON target>');
      expect(heightReport.errors).toContain(
        'height evidence: provided-json source target must cite a concrete non-template height evidence JSON target',
      );
      expect(JSON.stringify(heightReport)).not.toContain(encodedHeightAbsolutePath);

      expect(singletonSourceTargetReport.status).toBe('BLOCKED');
      expect(singletonSourceTargetReport.sourceBindings.singletonCheckpoint.target).toBe(
        '<blocked singleton checkpoint JSON target>',
      );
      expect(singletonSourceTargetReport.errors).toContain(
        'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
      );
      expect(JSON.stringify(singletonSourceTargetReport)).not.toContain(encodedSingletonSourceTargetFileUrl);

      expect(heightSourceTargetReport.status).toBe('BLOCKED');
      expect(heightSourceTargetReport.sourceBindings.heightEvidence.target).toBe('<blocked height evidence JSON target>');
      expect(heightSourceTargetReport.errors).toContain(
        'height evidence: provided-json source target must cite a concrete non-template height evidence JSON target',
      );
      expect(JSON.stringify(heightSourceTargetReport)).not.toContain(encodedHeightSourceTargetAbsolutePath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks checkpoint creation without explicit read-only observation source provenance', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: anchorObservations(),
        heightEvidence: heightEvidence(),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toEqual(expect.arrayContaining([
        'live singleton checkpoint: source binding is required',
        'live anchor observation: source binding must be live-read-only-node',
        'height evidence: source binding is required',
      ]));
      expect(report.sourceBindings.singletonCheckpoint.mode).toBe('unspecified');
      expect(report.sourceBindings.anchorObservations.mode).toBe('unspecified');
      expect(report.sourceBindings.heightEvidence.mode).toBe('unspecified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks checkpoint creation without read-only height evidence provenance', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const missingEvidence = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        now: NOW,
      });
      const missingSource = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        now: NOW,
      });

      expect(missingEvidence.status).toBe('BLOCKED');
      expect(missingEvidence.errors).toContain('height evidence: read-only current height evidence is required');
      expect(missingSource.status).toBe('BLOCKED');
      expect(missingSource.errors).toContain('height evidence: source binding is required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks live source provenance without concrete read-only endpoint bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: { mode: 'live-read-only-node', ergoNodeUrl: '<node-url>' },
        anchorObservations: anchorObservations(),
        anchorObservationSource: { mode: 'live-read-only-node' },
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'live-read-only-sources',
          ergoNodeUrl: 'http://user:pass@localhost:9052',
          sidechainRpcUrl: '<sidechain-rpc-url>',
        },
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'live singleton checkpoint: source binding ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
      );
      expect(report.errors).toContain(
        'live anchor observation: source binding ergoNodeUrl must cite a concrete read-only http(s) URL',
      );
      expect(report.errors).toContain(
        'height evidence: source binding ergoNodeUrl must not include credentials or credential query parameters',
      );
      expect(report.errors).toContain(
        'height evidence: source binding sidechainRpcUrl must cite a concrete non-template read-only http(s) URL',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks live source provenance that cites generic endpoints', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://generic-ergo-node.invalid',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://node.invalid/generic-anchor',
        },
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'live-read-only-sources',
          ergoNodeUrl: 'https://generic-height-node.invalid',
          sidechainRpcUrl: 'https://node.invalid/generic-sidechain',
        },
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'live singleton checkpoint: source binding ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
      );
      expect(report.errors).toContain(
        'live anchor observation: source binding ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
      );
      expect(report.errors).toContain(
        'height evidence: source binding ergoNodeUrl must cite a concrete non-template read-only http(s) URL',
      );
      expect(report.errors).toContain(
        'height evidence: source binding sidechainRpcUrl must cite a concrete non-template read-only http(s) URL',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks live source provenance that cites internal fixture endpoints', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://fixture-node.invalid',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://node.invalid/mock-anchor',
        },
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'live-read-only-sources',
          ergoNodeUrl: 'https://dummy-ergo-node.invalid',
          sidechainRpcUrl: 'https://node.invalid/testdata-sidechain',
        },
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'live singleton checkpoint: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(report.errors).toContain(
        'live anchor observation: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(report.errors).toContain(
        'height evidence: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(report.errors).toContain(
        'height evidence: source binding sidechainRpcUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks synthetic and simulated fresh checkpoint source targets and endpoint provenance', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const syntheticTargets = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/completed-synthetic-singleton-checkpoint.json',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/completed-synthetic-height-evidence.json',
        },
        now: NOW,
      });

      expect(syntheticTargets.status).toBe('BLOCKED');
      expect(syntheticTargets.errors).toContain(
        'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
      );
      expect(syntheticTargets.errors).toContain(
        'height evidence: provided-json source target must cite a concrete non-template height evidence JSON target',
      );

      const syntheticEndpoints = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://synthetic-node.invalid',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://node.invalid/synthetic-anchor',
        },
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'live-read-only-sources',
          ergoNodeUrl: 'https://synthetic-height-node.invalid',
          sidechainRpcUrl: 'https://node.invalid/synthetic-sidechain',
        },
        now: NOW,
      });

      expect(syntheticEndpoints.status).toBe('BLOCKED');
      expect(syntheticEndpoints.errors).toContain(
        'live singleton checkpoint: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(syntheticEndpoints.errors).toContain(
        'live anchor observation: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(syntheticEndpoints.errors).toContain(
        'height evidence: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(syntheticEndpoints.errors).toContain(
        'height evidence: source binding sidechainRpcUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );

      const syntheticHeightRead = readFreshTestnetHeightEvidenceJson(
        `${basename(dir)}/evidence/completed-synthetic-height-evidence.json`,
      );
      const serialized = JSON.stringify(syntheticHeightRead);

      expect(syntheticHeightRead.heightEvidence).toBeUndefined();
      expect(syntheticHeightRead.targetLabel).toBe('<blocked height evidence JSON target>');
      expect(syntheticHeightRead.errors).toContain(
        '<blocked height evidence JSON target>: refusing to read template/sample/generic/placeholder/fixture/mock/dummy/fake/stub/testdata/synthetic/simulated targets as height evidence JSON',
      );
      expect(serialized).not.toContain('completed-synthetic-height-evidence.json');

      const simulatedTargets = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/completed-simulated-singleton-checkpoint.json',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'provided-json',
          target: 'evidence/fresh/completed-simulated-height-evidence.json',
        },
        now: NOW,
      });

      expect(simulatedTargets.status).toBe('BLOCKED');
      expect(simulatedTargets.errors).toContain(
        'live singleton checkpoint: provided-json source target must cite a concrete non-template singleton checkpoint JSON target',
      );
      expect(simulatedTargets.errors).toContain(
        'height evidence: provided-json source target must cite a concrete non-template height evidence JSON target',
      );

      const simulatedEndpoints = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://simulated-node.invalid',
        },
        anchorObservations: anchorObservations(),
        anchorObservationSource: {
          mode: 'live-read-only-node',
          ergoNodeUrl: 'https://node.invalid/simulated-anchor',
        },
        heightEvidence: heightEvidence(),
        heightEvidenceSource: {
          mode: 'live-read-only-sources',
          ergoNodeUrl: 'https://simulated-height-node.invalid',
          sidechainRpcUrl: 'https://node.invalid/simulated-sidechain',
        },
        now: NOW,
      });

      expect(simulatedEndpoints.status).toBe('BLOCKED');
      expect(simulatedEndpoints.errors).toContain(
        'live singleton checkpoint: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(simulatedEndpoints.errors).toContain(
        'live anchor observation: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(simulatedEndpoints.errors).toContain(
        'height evidence: source binding ergoNodeUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );
      expect(simulatedEndpoints.errors).toContain(
        'height evidence: source binding sidechainRpcUrl must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL',
      );

      const simulatedHeightRead = readFreshTestnetHeightEvidenceJson(
        `${basename(dir)}/evidence/completed-simulated-height-evidence.json`,
      );
      const simulatedReadSerialized = JSON.stringify(simulatedHeightRead);

      expect(simulatedHeightRead.heightEvidence).toBeUndefined();
      expect(simulatedHeightRead.targetLabel).toBe('<blocked height evidence JSON target>');
      expect(simulatedHeightRead.errors).toContain(
        '<blocked height evidence JSON target>: refusing to read template/sample/generic/placeholder/fixture/mock/dummy/fake/stub/testdata/synthetic/simulated targets as height evidence JSON',
      );
      expect(simulatedReadSerialized).not.toContain('completed-simulated-height-evidence.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks stale, mismatched, or broadcast-enabled height evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const base = {
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: singletonCheckpoint(),
        singletonCheckpointSource: liveSingletonSource,
        anchorObservations: anchorObservations(),
        anchorObservationSource: liveAnchorSource,
        heightEvidenceSource: liveHeightSource,
        now: NOW,
      };
      const stale = buildFreshTestnetCheckpoint({
        ...base,
        heightEvidence: heightEvidence({ observedAt: '2026-05-18T02:14:59.999Z' }),
      });
      const mismatched = buildFreshTestnetCheckpoint({
        ...base,
        heightEvidence: heightEvidence({ ergoNodeHeight: 249, sidechainBlockHeight: 299 }),
      });
      const broadcastEnabled = buildFreshTestnetCheckpoint({
        ...base,
        heightEvidence: heightEvidence({ broadcastEnabled: true }),
      });

      expect(stale.status).toBe('BLOCKED');
      expect(stale.errors).toContain('height evidence: observedAt must be no older than 15 minutes');
      expect(mismatched.status).toBe('BLOCKED');
      expect(mismatched.errors).toContain('height evidence: ergoNodeHeight must match Current Ergo height');
      expect(mismatched.errors).toContain('height evidence: sidechainBlockHeight must match Current sidechain height');
      expect(broadcastEnabled.status).toBe('BLOCKED');
      expect(broadcastEnabled.errors).toContain('height evidence: broadcastEnabled must be false');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads provided height evidence only from concrete JSON targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      mkdirSync(join(dir, 'evidence'), { recursive: true });
      writeFileSync(join(dir, 'evidence', 'height-evidence.json'), JSON.stringify(heightEvidence(), null, 2));
      writeFileSync(
        join(dir, 'evidence', 'sample-size-analysis-height-evidence.json'),
        JSON.stringify(heightEvidence(), null, 2),
      );
      const nonConcreteTargets = [
        'height-evidence-template.json',
        'sample-height-evidence.json',
        'generic-height-evidence.json',
        'fixture-height-evidence.json',
        'mock-height-evidence.json',
        'dummy-height-evidence.json',
        'fake-height-evidence.json',
        'stub-height-evidence.json',
        'testdata-height-evidence.json',
      ];
      for (const target of nonConcreteTargets) {
        writeFileSync(join(dir, 'evidence', target), JSON.stringify(heightEvidence(), null, 2));
      }

      const read = readFreshTestnetHeightEvidenceJson(`${basename(dir)}/evidence/height-evidence.json`);
      const concreteAuditTarget = readFreshTestnetHeightEvidenceJson(
        `${basename(dir)}/evidence/sample-size-analysis-height-evidence.json`,
      );

      expect(read.errors).toEqual([]);
      expect(read.heightEvidence).toEqual(heightEvidence());
      expect(read.targetLabel).toBe(`${basename(dir)}/evidence/height-evidence.json`);
      expect(concreteAuditTarget.errors).toEqual([]);
      expect(concreteAuditTarget.heightEvidence).toEqual(heightEvidence());
      expect(concreteAuditTarget.targetLabel).toBe(
        `${basename(dir)}/evidence/sample-size-analysis-height-evidence.json`,
      );
      for (const target of nonConcreteTargets) {
        const nonConcrete = readFreshTestnetHeightEvidenceJson(`${basename(dir)}/evidence/${target}`);
        expect(nonConcrete.heightEvidence, target).toBeUndefined();
        expect(nonConcrete.errors, target).toContain(
          '<blocked height evidence JSON target>: refusing to read template/sample/generic/placeholder/fixture/mock/dummy/fake/stub/testdata/synthetic/simulated targets as height evidence JSON',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collects read-only height evidence without enabling broadcast', async () => {
    const evidence = await collectFreshTestnetHeightEvidence({
      ergo: { getInfo: async () => ({ fullHeight: 250, network: 'testnet' }) },
      sidechain: { getBlockNumber: async () => 300 },
      now: NOW,
    });

    expect(evidence).toEqual({
      observedAt: NOW.toISOString(),
      ergoNodeHeight: 250,
      sidechainBlockHeight: 300,
      sources: {
        ergo: 'read-only-no-auth /info',
        sidechain: 'read-only EVM getBlockNumber',
      },
      broadcastEnabled: false,
    });
  });

  it('collects read-only anchor observations from Ergo extension fields', async () => {
    const observations = await collectFreshTestnetAnchorObservations({
      ergo: {
        getInfo: async () => ({ fullHeight: 250, network: 'testnet' }),
        getSidechainExtensionFieldsAtHeight: async (height: number) => [{
          key: '0401',
          value: height === 100 ? BRIDGE_EVENT_ROOT : '9'.repeat(64),
          height,
          headerId: height === 100 ? 'a'.repeat(64) : 'b'.repeat(64),
        }],
      },
      aggregateEvidence: aggregateEvidenceRecord(),
      now: NOW,
    });

    expect(observations).toEqual(anchorObservations());
  });

  it('blocks fresh checkpoint generation from a broadcast-enabled shell', () => {
    expect(validateFreshCheckpointBroadcastDisabled({ BRIDGE_BROADCAST_ENABLED: 'true' })).toEqual([
      'fresh testnet checkpoint: BRIDGE_BROADCAST_ENABLED must be false or unset',
    ]);
    expect(validateFreshCheckpointBroadcastDisabled({ BRIDGE_BROADCAST_ENABLED: 'false' })).toEqual([]);
    expect(validateFreshCheckpointBroadcastDisabled({})).toEqual([]);
  });

  it('blocks credential-bearing node URLs for read-only checkpoint collection', () => {
    const credentialError =
      'fresh testnet checkpoint: --node-url must not include credentials or credential query parameters';

    expect(validateFreshCheckpointReadOnlyNodeUrl('http://127.0.0.1:9053')).toEqual([]);
    expect(validateFreshCheckpointReadOnlyNodeUrl('https://node.example.test/path')).toEqual([]);
    expect(validateFreshCheckpointReadOnlyNodeUrl('http://user:pass@127.0.0.1:9053')).toEqual([
      credentialError,
    ]);
    expect(validateFreshCheckpointReadOnlyNodeUrl('https://node.example.test?api_key=redacted')).toEqual([
      credentialError,
    ]);
    expect(validateFreshCheckpointReadOnlyNodeUrl('file' + ':///' + ['tmp', 'node'].join('/'))).toEqual([
      'fresh testnet checkpoint: --node-url must be a valid http(s) URL',
    ]);
  });

  it('blocks records that are not complete non-broadcast transaction checks', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const record: any = aggregateEvidenceRecord();
      record.broadcast = 'yes';
      record.transactionCheck.result = 'FAIL';
      delete record.claims[0].bridgeEventRootHex;
      const aggregateEvidence = writeAggregateEvidence(dir, record);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.boundary.lifecyclePassAllowed).toBe(false);
      expect(report.errors).toContain('aggregate evidence: broadcast must be no');
      expect(report.errors).toContain('aggregate evidence: transactionCheck.result must be PASS');
      expect(report.errors).toContain('aggregate evidence claim[0]: bridgeEventRootHex is required for fresh testnet checkpoint');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks checkpoint creation without matching live anchor observations', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const missing = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        now: NOW,
      });
      const mismatched = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: anchorObservations({
          expectedBridgeEventRootHex: BRIDGE_EVENT_ROOT,
          observedBridgeEventRootHexes: ['f'.repeat(64)],
          matchingFieldFound: false,
        }),
        now: NOW,
      });

      expect(missing.status).toBe('BLOCKED');
      expect(missing.errors).toContain('live anchor observation: read-only 0x0401 anchor observations are required');
      expect(mismatched.status).toBe('BLOCKED');
      expect(mismatched.errors).toContain(
        'live anchor observation claim[0]: 0x0401 bridgeEventRoot must be present at Ergo anchor height 100',
      );
      expect(mismatched.errors).toContain(
        'live anchor observation claim[0]: observed roots must include aggregate bridgeEventRootHex at Ergo anchor height 100',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks stale, future, or height-mismatched live anchor observations', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const stale = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: anchorObservations({ observedAt: '2026-05-18T02:14:59.999Z' }),
        now: NOW,
      });
      const future = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: anchorObservations({ observedAt: '2026-05-18T02:30:00.001Z' }),
        now: NOW,
      });
      const heightMismatch = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: anchorObservations({ nodeHeight: 249 }),
        now: NOW,
      });
      const missingTimestamp = anchorObservations();
      delete (missingTimestamp[0] as any).observedAt;
      const missing = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        anchorObservations: missingTimestamp as any,
        now: NOW,
      });

      expect(stale.status).toBe('BLOCKED');
      expect(stale.errors).toContain('live anchor observation claim[0]: observedAt must be no older than 15 minutes');
      expect(future.status).toBe('BLOCKED');
      expect(future.errors).toContain('live anchor observation claim[0]: observedAt must not be in the future');
      expect(heightMismatch.status).toBe('BLOCKED');
      expect(heightMismatch.errors).toContain('live anchor observation claim[0]: nodeHeight must match Current Ergo height');
      expect(missing.status).toBe('BLOCKED');
      expect(missing.errors).toContain('live anchor observation claim[0]: observedAt must be an ISO UTC timestamp');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks mainnet or negated testnet scope', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet not connected',
        sidechainNetwork: 'mainnet',
        singletonCheckpoint: singletonCheckpoint(),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('network scope: Ergo node network must positively identify testnet');
      expect(report.errors).toContain('network scope: Sidechain network must identify patched-devnet, testnet, or non-mainnet');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks when live node network diverges from the declared Ergo node network', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint({ nodeNetwork: 'testnet-beta' }),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('live singleton checkpoint: node network must match declared Ergo node network');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks sensitive aggregate evidence targets without echoing the raw target', () => {
    const report = buildFreshTestnetCheckpoint({
      aggregateEvidence: '../.' + 'env',
      currentErgoHeight: 250,
      currentSidechainHeight: 300,
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      singletonCheckpoint: singletonCheckpoint(),
      now: NOW,
    });
    const serialized = JSON.stringify(report);

    expect(report.status).toBe('BLOCKED');
    expect(report.checkpoint.aggregateEvidence).toBe('<blocked evidence JSON target>');
    expect(serialized).toContain('<blocked evidence JSON target>');
    expect(serialized).not.toContain('../.' + 'env');
  });

  it('blocks aggregate evidence targets that resolve outside the bridge repository without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    const external = mkdtempSync(join(tmpdir(), 'fresh-checkpoint-aggregate-'));
    try {
      writeFileSync(join(external, 'aggregate-check.json'), JSON.stringify(aggregateEvidenceRecord(), null, 2));
      try {
        symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        return;
      }

      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence: `${basename(dir)}/link-out/aggregate-check.json`,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.checkpoint.aggregateEvidence).toBe('<blocked evidence JSON target>');
      expect(report.errors).toContain(
        'aggregate evidence: <blocked evidence JSON target>: must resolve inside the bridge repository',
      );
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('aggregate-check.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('blocks sensitive singleton checkpoint targets before reading them', () => {
    const envTarget = '../.' + 'env';
    const envResult = readFreshTestnetSingletonCheckpointJson(envTarget);
    const envSerialized = JSON.stringify(envResult);

    expect(envResult.checkpoint).toBeUndefined();
    expect(envResult.targetLabel).toBe('<blocked evidence JSON target>');
    expect(envResult.errors).toContain(
      '<blocked singleton checkpoint JSON target>: refusing to read environment files as singleton checkpoint JSON',
    );
    expect(envSerialized).not.toContain(envTarget);

    const keyTarget = '../operator/signing-key-checkpoint.json';
    const keyResult = readFreshTestnetSingletonCheckpointJson(keyTarget);
    const keySerialized = JSON.stringify(keyResult);

    expect(keyResult.checkpoint).toBeUndefined();
    expect(keyResult.targetLabel).toBe('<blocked evidence JSON target>');
    expect(keyResult.errors).toContain(
      '<blocked singleton checkpoint JSON target>: refusing to read secret-bearing or runtime-state paths as singleton checkpoint JSON',
    );
    expect(keySerialized).not.toContain(keyTarget);
  });

  it('blocks singleton checkpoint targets that resolve outside the bridge repository without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    const external = mkdtempSync(join(tmpdir(), 'fresh-checkpoint-singleton-'));
    try {
      writeFileSync(join(external, 'singleton-checkpoint.json'), JSON.stringify(singletonCheckpoint(), null, 2));
      try {
        symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        return;
      }

      const result = readFreshTestnetSingletonCheckpointJson(`${basename(dir)}/link-out/singleton-checkpoint.json`);
      const serialized = JSON.stringify(result);

      expect(result.checkpoint).toBeUndefined();
      expect(result.targetLabel).toBe('<blocked evidence JSON target>');
      expect(result.errors).toContain(
        '<blocked singleton checkpoint JSON target>: must resolve inside the bridge repository',
      );
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('singleton-checkpoint.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('blocks height evidence targets that resolve outside the bridge repository without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    const external = mkdtempSync(join(tmpdir(), 'fresh-checkpoint-height-'));
    try {
      writeFileSync(join(external, 'height-evidence.json'), JSON.stringify(heightEvidence(), null, 2));
      try {
        symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        return;
      }

      const result = readFreshTestnetHeightEvidenceJson(`${basename(dir)}/link-out/height-evidence.json`);
      const serialized = JSON.stringify(result);

      expect(result.heightEvidence).toBeUndefined();
      expect(result.targetLabel).toBe('<blocked height evidence JSON target>');
      expect(result.errors).toContain(
        '<blocked height evidence JSON target>: must resolve inside the bridge repository',
      );
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('height-evidence.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('blocks singleton checkpoints that do not bind to current deployed state', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const missingDup = singletonCheckpoint({
        deployedStateHash: 'f'.repeat(64),
        singletons: [{
          name: 'sideChainState',
          nftId: SINGLETON_NFT_ID,
          observedBoxId: SINGLETON_BOX_ID,
          expectedErgoTreeHex: SINGLETON_TREE,
          observedErgoTreeHex: SINGLETON_TREE,
          observedCount: 1,
        }],
      });
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedState,
        deployedStateHash: DEPLOYED_STATE_HASH,
        singletonCheckpoint: missingDup,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('live singleton checkpoint: deployed-state hash must match current deployed_state.json');
      expect(report.errors).toContain('live singleton checkpoint: singleton observation set must match current deployed_state.json');
      expect(report.errors).toContain('live singleton checkpoint singleton[0]: expected box ID is required for current deployed_state.json binding');
      expect(report.errors).toContain('live singleton checkpoint: missing doubleUnlockPrevention observation from current deployed_state.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks checkpoint when the expected transaction is already confirmed', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint({ expectedTxConfirmedAbsent: false }),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('live singleton checkpoint: Expected transaction ID must be absent from confirmed chain');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks stale current heights', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 99,
        currentSidechainHeight: 199,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint(),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Current Ergo height: must be greater than or equal to max aggregate evidence Ergo anchor height 101',
      );
      expect(report.errors).toContain(
        'Current sidechain height: must be greater than or equal to max aggregate evidence sidechain block height 201',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requires read-only singleton observations before creating a checkpoint', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('live singleton checkpoint: read-only singleton checkpoint is required');
      expect(report.lines.join('\n')).toContain('live singleton checkpoint: <missing>');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks stale or mismatched live singleton observations', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint({
          nodeHeight: 249,
          nodeNetwork: 'mainnet',
          expectedTxMempoolAbsent: false,
          singletons: [{
            name: 'sideChainState',
            nftId: SINGLETON_NFT_ID,
            expectedBoxId: SINGLETON_BOX_ID,
            observedBoxId: 'd'.repeat(64),
            expectedErgoTreeHex: SINGLETON_TREE,
            observedErgoTreeHex: '22',
            observedCount: 2,
          }],
        }),
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('live singleton checkpoint: Expected transaction ID must be absent from mempool');
      expect(report.errors).toContain('live singleton checkpoint: node height must match Current Ergo height');
      expect(report.errors).toContain('live singleton checkpoint: node network must positively identify testnet');
      expect(report.errors).toContain('live singleton checkpoint singleton[0]: observed singleton count must be exactly 1');
      expect(report.errors).toContain('live singleton checkpoint singleton[0]: observed box ID must match deployed_state box ID');
      expect(report.errors).toContain('live singleton checkpoint singleton[0]: observed ErgoTree must match deployed_state ErgoTree');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks live singleton observations without a valid observation timestamp', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const missingTimestamp: any = singletonCheckpoint();
      delete missingTimestamp.observedAt;
      const report = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: missingTimestamp,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain('live singleton checkpoint: observedAt must be an ISO UTC timestamp');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks stale or future live singleton observation timestamps', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-fresh-checkpoint-'));
    try {
      const aggregateEvidence = writeAggregateEvidence(dir);
      const stale = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint({ observedAt: '2026-05-18T02:14:59.999Z' }),
        now: NOW,
      });
      const future = buildFreshTestnetCheckpoint({
        aggregateEvidence,
        currentErgoHeight: 250,
        currentSidechainHeight: 300,
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        singletonCheckpoint: singletonCheckpoint({ observedAt: '2026-05-18T02:30:00.001Z' }),
        now: NOW,
      });

      expect(stale.status).toBe('BLOCKED');
      expect(stale.errors).toContain('live singleton checkpoint: observedAt must be no older than 15 minutes');
      expect(future.status).toBe('BLOCKED');
      expect(future.errors).toContain('live singleton checkpoint: observedAt must not be in the future');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collects read-only singleton observations from deployed state and node data', async () => {
    const deployedState: any = {
      network: 'testnet',
      deployedAt: NOW.toISOString(),
      sideChainState: {
        nftId: SINGLETON_NFT_ID,
        boxId: SINGLETON_BOX_ID,
        address: 'addr',
        ergoTreeHex: SINGLETON_TREE,
      },
      doubleUnlockPrevention: {
        nftId: 'e'.repeat(64),
        boxId: 'f'.repeat(64),
        address: 'addr',
        ergoTreeHex: '1002'.repeat(8),
      },
      mainChainLock: { address: 'addr', ergoTreeHex: '1003' },
      mainChainUnlock: { address: 'addr', ergoTreeHex: '1004' },
      relayer: { address: 'addr', publicKey: 'pk' },
    };
    const boxesByToken = new Map<string, any[]>([
      [SINGLETON_NFT_ID, [{ boxId: SINGLETON_BOX_ID, ergoTree: SINGLETON_TREE }]],
      ['e'.repeat(64), [{ boxId: 'f'.repeat(64), ergoTree: '1002'.repeat(8) }]],
    ]);
    const checkpoint = await collectFreshTestnetSingletonCheckpoint({
      ergo: {
        getBoxesByTokenId: async (tokenId: string) => boxesByToken.get(tokenId) ?? [],
        getInfo: async () => ({ fullHeight: 250, network: 'testnet' }),
        hasUnconfirmedTransaction: async () => false,
        getTransaction: async () => null,
      },
      deployedState,
      deployedStateHash: DEPLOYED_STATE_HASH,
      expectedTxId: EXPECTED_TX_ID,
      now: NOW,
    });

    expect(checkpoint).toMatchObject({
      deployedStateHash: DEPLOYED_STATE_HASH,
      observedAt: NOW.toISOString(),
      nodeHeight: 250,
      nodeNetwork: 'testnet',
      expectedTxId: EXPECTED_TX_ID,
      expectedTxMempoolAbsent: true,
      expectedTxConfirmedAbsent: true,
    });
    expect(checkpoint.singletons).toEqual([
      {
        name: 'sideChainState',
        nftId: SINGLETON_NFT_ID,
        expectedBoxId: SINGLETON_BOX_ID,
        observedBoxId: SINGLETON_BOX_ID,
        expectedErgoTreeHex: SINGLETON_TREE,
        observedErgoTreeHex: SINGLETON_TREE,
        observedCount: 1,
      },
      {
        name: 'doubleUnlockPrevention',
        nftId: 'e'.repeat(64),
        expectedBoxId: 'f'.repeat(64),
        observedBoxId: 'f'.repeat(64),
        expectedErgoTreeHex: '1002'.repeat(8),
        observedErgoTreeHex: '1002'.repeat(8),
        observedCount: 1,
      },
    ]);
  });
});
