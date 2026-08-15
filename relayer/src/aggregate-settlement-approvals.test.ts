import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadHistoricalAggregateSettlementApprovals,
} from './aggregate-settlement-approvals.js';
import { buildAggregateSettlementPrebroadcastEvidenceRecord } from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';

const burnA = 'aa'.repeat(32);
const burnB = 'bb'.repeat(32);
const txIdA = '11'.repeat(32);
const txIdBatch = '22'.repeat(32);
const sidechainHeaderHashHex = '44'.repeat(32);
const bridgeEventRootHex = '55'.repeat(32);
const bridgeEventRootHexB = '66'.repeat(32);
const now = new Date('2026-05-17T00:00:00Z');
const deployedStateHash = '33'.repeat(32);
const FULLWIDTH_TRUE = '\uFF34\uFF32\uFF35\uFF25';
const FULLWIDTH_FALSE = '\uFF26\uFF21\uFF2C\uFF33\uFF25';
const FULLWIDTH_NO = '\uFF2E\uFF2F';

function overCapBurnTxHashes(): string[] {
  return Array.from({ length: 11 }, (_, index) => (0x10 + index).toString(16).repeat(32));
}

function overCapBridgeEventRootHexes(): string[] {
  return Array.from({ length: 11 }, (_, index) => (0x40 + index).toString(16).repeat(32));
}

function approvalMetadataFor(
  mode: 'single' | 'single-with-ingest' | 'batch' = 'single',
  burns = [burnA],
  expectedTxId = txIdA,
  checkCommand = `npm run settle:aggregate -- check ${burns[0]}`,
) {
  const burnSet = burns.join(',');
  const checkEvidenceJson = checkEvidenceJsonTargetFor(checkCommand);
  return {
    approvedAt: '2020-01-01T00:00:00Z',
    expiresAt: '2026-05-17T01:00:00Z',
    evidence:
      `artifact://approvals/operator-approval.json completed approval evidence target ` +
      `mode ${mode} non-broadcast Expected transaction ID ${expectedTxId} ordered burn set ${burnSet}`,
    checkCommand,
    checkEvidence:
      `artifact://approvals/check-output.log ${checkCommand} mode ${mode} non-broadcast PASS ` +
      `Expected transaction ID ${expectedTxId} ordered burn set ${burnSet}`,
    checkEvidenceJson,
  };
}

function checkEvidenceJsonTargetFor(checkCommand: string): string {
  const command = checkCommand.split(/\s+/)[4];
  if (command === 'check-batch') return 'aggregate-check-batch.json';
  if (command === 'check-with-ingest') return 'aggregate-check-with-ingest.json';
  if (command === 'check-anchored') return 'aggregate-check-anchored.json';
  return 'aggregate-check-single.json';
}

const approvalMetadata = approvalMetadataFor();
const batchApprovalMetadata = approvalMetadataFor(
  'batch',
  [burnA, burnB],
  txIdBatch,
  `npm run settle:aggregate -- check-batch ${burnA} ${burnB}`,
);
const batchBridgeEventRootHexes = [bridgeEventRootHex, bridgeEventRootHexB];
const fileMetadata = {
  version: 2,
  createdAt: '2026-05-16T23:00:00Z',
  environment: 'testnet',
  ergoNodeNetwork: 'testnet',
  ergoNodeUrl: 'http://127.0.0.1:9052',
  sidechainNetwork: 'patched-devnet',
  sidechainRpcUrl: 'http://127.0.0.1:9945',
  sidechainWsUrl: 'ws://127.0.0.1:9945',
  deployedStateHash,
};

const runtimeContext = {
  environment: 'testnet',
  ergoNodeNetwork: 'testnet',
  ergoNodeUrl: 'http://127.0.0.1:9052/',
  sidechainNetwork: 'patched-devnet',
  sidechainRpcUrl: 'http://127.0.0.1:9945/',
  sidechainWsUrl: 'ws://127.0.0.1:9945/',
  deployedStateHash,
};

let tempDirs: string[] = [];

function writeApprovalsFile(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'aggregate-approvals-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'aggregate-check-single.json'), JSON.stringify(aggregateEvidenceRecord('check', [burnA], txIdA), null, 2));
  writeFileSync(join(dir, 'aggregate-check-batch.json'), JSON.stringify(aggregateEvidenceRecord('check-batch', [burnA, burnB], txIdBatch), null, 2));
  writeFileSync(join(dir, 'aggregate-check-with-ingest.json'), JSON.stringify(aggregateEvidenceRecord('check-with-ingest', [burnA], txIdA), null, 2));
  writeFileSync(join(dir, 'aggregate-check-anchored.json'), JSON.stringify(aggregateEvidenceRecord('check-anchored', [burnA], txIdA), null, 2));
  const path = join(dir, 'approvals.json');
  writeFileSync(path, JSON.stringify(contents), 'utf-8');
  return path;
}

function aggregateEvidenceRecord(
  command: string,
  burns: string[],
  expectedTxId: string,
  checkerNodeOrigin = fileMetadata.ergoNodeUrl,
) {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-16T23:10:00.000Z',
    command,
    label: 'approval fixture aggregate check',
    expectedTxId,
    transactionCheckResponse: '',
    checkerIdentity: {
      ...TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
      nodeOrigin: checkerNodeOrigin,
    },
    settlementShape: {
      inputCount: command === 'check-batch' ? 4 : 3,
      outputCount: 4,
      contextExtensionKeyCounts: command === 'check-batch' ? [0, 4, 4, 2] : [0, 4, 2],
      contextExtensionKeyCountsCsv: command === 'check-batch' ? '0,4,4,2' : '0,4,2',
    },
    claims: burns.map((burnTxHash, index) => ({
      burnTxHash,
      sidechainBlockHeight: 200 + index,
      sidechainHeaderHashHex,
      bridgeEventRootHex: index === 0 ? bridgeEventRootHex : bridgeEventRootHexB,
      ergoAnchorHeight: 100 + index,
    })),
  });
}

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('historical aggregate settlement approval lookup', () => {
  it('resolves single approvals only for the exact burn hash and mode', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    const resolver = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(resolver.expectedTxIdForSingle(`0x${burnA}`, 'single')).toBe(txIdA);
    expect(resolver.expectedTxIdForSingle(burnA, 'single-with-ingest')).toBeNull();
    expect(resolver.expectedTxIdForSingle(burnB, 'single')).toBeNull();
  });

  it('resolves batch approvals only for the exact ordered burn set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        bridgeEventRootHexes: batchBridgeEventRootHexes,
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
      }],
    });
    const resolver = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(resolver.expectedTxIdForBatch([`0x${burnA}`, `0x${burnB}`])).toBe(txIdBatch);
    expect(resolver.expectedTxIdForBatch([burnB, burnA])).toBeNull();
    expect(resolver.expectedTxIdForBatch([burnA])).toBeNull();
  });

  it('rechecks expiry for every historical expected transaction identity lookup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:30:00Z'));
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    const lookup = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(lookup.expectedTxIdForSingle(burnA, 'single')).toBe(txIdA);

    vi.setSystemTime(new Date(approvalMetadata.expiresAt));
    expect(lookup.expectedTxIdForSingle(burnA, 'single')).toBeNull();
  });

  it('loads a versioned JSON approval file', () => {
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [
        {
          mode: 'single-with-ingest',
          burnTxHash: `0x${burnA}`,
          expectedTxId: `0x${txIdA}`,
          ...approvalMetadataFor(
            'single-with-ingest',
            [burnA],
            txIdA,
            `npm run settle:aggregate -- check-with-ingest ${burnA} ${sidechainHeaderHashHex} ${bridgeEventRootHex} 100`,
          ),
        },
        {
          mode: 'batch',
          burnTxHashes: [burnA, burnB],
          bridgeEventRootHexes: batchBridgeEventRootHexes,
          expectedTxId: txIdBatch,
          ...batchApprovalMetadata,
        },
      ],
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);
    const resolver = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(resolver.expectedTxIdForSingle(burnA, 'single-with-ingest')).toBe(txIdA);
    expect(resolver.expectedTxIdForBatch([burnA, burnB])).toBe(txIdBatch);
  });

  it('loads Windows npm.cmd non-broadcast approval check commands', () => {
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadataFor('single', [burnA], txIdA, `npm.cmd run settle:aggregate -- check ${burnA}`),
      }],
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);
    const resolver = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(resolver.expectedTxIdForSingle(burnA, 'single')).toBe(txIdA);
  });

  it('uses a live wall clock for historical lookup expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:30:00Z'));
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    const lookup = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(lookup.expectedTxIdForSingle(burnA, 'single')).toBe(txIdA);
    vi.setSystemTime(new Date(approvalMetadata.expiresAt));
    expect(lookup.expectedTxIdForSingle(burnA, 'single')).toBeNull();
  });

  it('rejects malformed or ambiguous approval files', () => {
    expect(() => loadHistoricalAggregateSettlementApprovals(undefined)).toThrow(/approval evidence path/);

    const invalidHexPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{ mode: 'single', burnTxHash: 'not-hex', expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(invalidHexPath, now)).toThrow(/burnTxHash/);

    const duplicateBatchPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnA],
        bridgeEventRootHexes: [bridgeEventRootHex, bridgeEventRootHex],
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
        checkCommand: `npm run settle:aggregate -- check-batch ${burnA} ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(duplicateBatchPath, now)).toThrow(/duplicates/);
  });

  it('rejects batch approvals above the batch unlock claim cap', () => {
    const burns = overCapBurnTxHashes();
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: burns,
        bridgeEventRootHexes: overCapBridgeEventRootHexes(),
        expectedTxId: txIdBatch,
        ...approvalMetadataFor(
          'batch',
          burns,
          txIdBatch,
          `npm run settle:aggregate -- check-batch ${burns.join(' ')}`,
        ),
      }],
    });

    expect(() => loadHistoricalAggregateSettlementApprovals(path, now)).toThrow(/at most 10 burn tx hashes/);
  });

  it('requires batch approval check commands to match the ordered burn set', () => {
    const singleCheckPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        bridgeEventRootHexes: batchBridgeEventRootHexes,
        expectedTxId: txIdBatch,
        ...approvalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(singleCheckPath, now)).toThrow(/check-batch/);

    const reorderedCheckPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        bridgeEventRootHexes: batchBridgeEventRootHexes,
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
        checkCommand: `npm run settle:aggregate -- check-batch ${burnB} ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(reorderedCheckPath, now)).toThrow(/in order/);

    const partialCheckPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        bridgeEventRootHexes: batchBridgeEventRootHexes,
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
        checkCommand: `npm run settle:aggregate -- check-batch ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(partialCheckPath, now)).toThrow(/burnTxHashes/);
  });

  it('requires batch approval bridge roots to match checkEvidenceJson claims in order', () => {
    const missingRootsPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingRootsPath, now)).toThrow(/bridgeEventRootHexes/);

    const reorderedRootsPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        bridgeEventRootHexes: [bridgeEventRootHexB, bridgeEventRootHex],
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(reorderedRootsPath, now)).toThrow(/bridgeEventRootHexes.*in order/);

    const extraRootsPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'batch',
        burnTxHashes: [burnA, burnB],
        bridgeEventRootHexes: [bridgeEventRootHex, bridgeEventRootHexB, '77'.repeat(32)],
        expectedTxId: txIdBatch,
        ...batchApprovalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(extraRootsPath, now)).toThrow(/one root per burn tx hash/);
  });

  it('requires single approval check commands to match the approved burn', () => {
    const wrongBurnPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkCommand: `npm run settle:aggregate -- check ${burnB}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(wrongBurnPath, now)).toThrow(/must match approval burnTxHash/);

    const batchCheckPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkCommand: `npm run settle:aggregate -- check-batch ${burnA} ${burnB}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(batchCheckPath, now)).toThrow(/must not use check-batch/);
  });

  it('requires single approval check command variants to match their approval mode and full argument shape', () => {
    const singleWithIngestAsPlainCheckPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single-with-ingest',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadataFor('single-with-ingest', [burnA], txIdA, `npm run settle:aggregate -- check ${burnA}`),
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(singleWithIngestAsPlainCheckPath, now)).toThrow(/single-with-ingest/);

    const singleWithExtraArgPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadataFor('single', [burnA], txIdA, `npm run settle:aggregate -- check ${burnA} 100`),
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(singleWithExtraArgPath, now)).toThrow(/exactly one burnTxHash/);

    const missingIngestArgsPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single-with-ingest',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadataFor(
          'single-with-ingest',
          [burnA],
          txIdA,
          `npm run settle:aggregate -- check-with-ingest ${burnA}`,
        ),
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingIngestArgsPath, now)).toThrow(/sidechainHeaderHashHex/);

    const malformedIngestHexPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single-with-ingest',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadataFor(
          'single-with-ingest',
          [burnA],
          txIdA,
          `npm run settle:aggregate -- check-with-ingest ${burnA} not-hex ${bridgeEventRootHex} 100`,
        ),
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(malformedIngestHexPath, now)).toThrow(/sidechainHeaderHashHex/);

    const missingAnchorHeightPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single-with-ingest',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadataFor('single-with-ingest', [burnA], txIdA, `npm run settle:aggregate -- check-anchored ${burnA}`),
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingAnchorHeightPath, now)).toThrow(/ergoAnchorHeight/);
  });

  it('requires approval evidence to cite the exact approved facts', () => {
    const missingCommandEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log mode single non-broadcast PASS ` +
          `Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingCommandEvidencePath, now)).toThrow(/check command/);

    const negatedCommandEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log not ${approvalMetadata.checkCommand} ` +
          `mode single non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(negatedCommandEvidencePath, now)).toThrow(
      /positive check command/,
    );

    const compatibilityNegatedCommandEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${FULLWIDTH_NO} ${approvalMetadata.checkCommand} ` +
          `mode single non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityNegatedCommandEvidencePath, now)).toThrow(
      /positive check command/,
    );

    const missingCheckScopeEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${approvalMetadata.checkCommand} mode single PASS ` +
          `Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingCheckScopeEvidencePath, now)).toThrow(/non-broadcast/);

    const negatedApprovalScopePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target ` +
          `mode single not non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(negatedApprovalScopePath, now)).toThrow(/non-broadcast/);

    const negatedCheckScopePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${approvalMetadata.checkCommand} ` +
          `mode single not non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(negatedCheckScopePath, now)).toThrow(/non-broadcast/);

    const compatibilityFalseApprovalScopePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target ` +
          `mode single non-broadcast=${FULLWIDTH_FALSE} Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityFalseApprovalScopePath, now)).toThrow(/non-broadcast/);

    const compatibilityFalseCheckScopePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${approvalMetadata.checkCommand} ` +
          `mode single non-broadcast=${FULLWIDTH_FALSE} PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityFalseCheckScopePath, now)).toThrow(/non-broadcast/);

    const impreciseApprovalModePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target ` +
          `mode single-with-ingest non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(impreciseApprovalModePath, now)).toThrow(/approval mode/);

    const impreciseCheckModePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${approvalMetadata.checkCommand} ` +
          `mode single-with-ingest non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(impreciseCheckModePath, now)).toThrow(/approval mode/);

    const contradictoryCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${approvalMetadata.checkCommand} mode single non-broadcast not PASS ` +
          `Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(contradictoryCheckEvidencePath, now)).toThrow(
      /internally positive PASS/,
    );

    const falsePassCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/check-output.log ${approvalMetadata.checkCommand} mode single non-broadcast PASS=false ` +
          `Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(falsePassCheckEvidencePath, now)).toThrow(
      /internally positive PASS/,
    );

    const missingTxIdEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target ` +
          `mode single non-broadcast ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingTxIdEvidencePath, now)).toThrow(/Expected transaction ID/);

    const incompleteApprovalEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json approval evidence target ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(incompleteApprovalEvidencePath, now)).toThrow(
      /completed approval evidence target/,
    );

    const negatedCompletedApprovalEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json not completed approval evidence target ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(negatedCompletedApprovalEvidencePath, now)).toThrow(
      /completed approval evidence target/,
    );

    const compatibilityFalseCompletedApprovalEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target=${FULLWIDTH_FALSE} ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityFalseCompletedApprovalEvidencePath, now)).toThrow(
      /completed approval evidence target/,
    );

    const rejectedApprovalEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target approval rejected ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(rejectedApprovalEvidencePath, now)).toThrow(
      /positive operator approval/,
    );

    const falseApprovalDecisionPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target ` +
          `approval status = false mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(falseApprovalDecisionPath, now)).toThrow(
      /positive operator approval/,
    );

    const compatibilityFalseApprovalDecisionPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/operator-approval.json completed approval evidence target ` +
          `approval status = ${FULLWIDTH_FALSE} mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityFalseApprovalDecisionPath, now)).toThrow(
      /positive operator approval/,
    );
  });

  it('rejects non-concrete approval evidence targets', () => {
    for (const evidenceTarget of [
      'artifact://approvals/generic-operator-approval.json',
      'artifact://approvals/sample-evidence-operator-approval.json',
      'artifact://approvals/fixture-operator-approval.json',
      'artifact://approvals/mock-operator-approval.json',
      'artifact://approvals/dummy-operator-approval.json',
      'artifact://approvals/fake-operator-approval.json',
      'artifact://approvals/stub-operator-approval.json',
      'artifact://approvals/testdata-operator-approval.json',
      'artifact://approvals/completed-synthetic-operator-approval.json',
      'artifact://approvals/completed-simulated-operator-approval.json',
    ]) {
      const genericEvidencePath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          evidence:
            `${evidenceTarget} completed approval evidence target ` +
            `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(genericEvidencePath, now)).toThrow(/evidence/);
    }

    for (const checkEvidenceTarget of [
      'artifact://approvals/generic-check-output.log',
      'artifact://approvals/sample-evidence-check-output.log',
      'artifact://approvals/fixture-check-output.log',
      'artifact://approvals/mock-check-output.log',
      'artifact://approvals/dummy-check-output.log',
      'artifact://approvals/fake-check-output.log',
      'artifact://approvals/stub-check-output.log',
      'artifact://approvals/testdata-check-output.log',
      'artifact://approvals/completed-synthetic-check-output.log',
      'artifact://approvals/completed-simulated-check-output.log',
    ]) {
      const genericCheckEvidencePath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidence:
            `${checkEvidenceTarget} ${approvalMetadata.checkCommand} mode single non-broadcast PASS ` +
            `Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(genericCheckEvidencePath, now)).toThrow(/checkEvidence/);
    }

    for (const checkEvidenceJson of [
      'generic-aggregate-check-single.json',
      'sample-evidence-aggregate-check-single.json',
      'fixture-aggregate-check-single.json',
      'mock-aggregate-check-single.json',
      'dummy-aggregate-check-single.json',
      'fake-aggregate-check-single.json',
      'stub-aggregate-check-single.json',
      'testdata-aggregate-check-single.json',
      'completed-synthetic-aggregate-check-single.json',
      'completed-simulated-aggregate-check-single.json',
    ]) {
      const genericJsonPath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidenceJson,
        }],
      });
      writeFileSync(
        join(dirname(genericJsonPath), checkEvidenceJson),
        JSON.stringify(aggregateEvidenceRecord('check', [burnA], txIdA), null, 2),
        'utf-8',
      );
      expect(() => loadHistoricalAggregateSettlementApprovals(genericJsonPath, now)).toThrow(/checkEvidenceJson/);
    }
  });

  it('rejects claim-escalating approval evidence targets', () => {
    const claimEscalatingEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/production-ready-operator-approval.json completed approval evidence target ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(claimEscalatingEvidencePath, now)).toThrow(/evidence/);

    const claimEscalatingCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/mainnet-production-check-output.log ${approvalMetadata.checkCommand} ` +
          `mode single non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(claimEscalatingCheckEvidencePath, now)).toThrow(/checkEvidence/);

    const productionCandidateEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/testnet-production-candidate-operator-approval.json completed approval evidence target ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(productionCandidateEvidencePath, now)).toThrow(/evidence/);

    const productionCandidateCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `artifact://approvals/testnet-production-candidate-check-output.log ${approvalMetadata.checkCommand} ` +
          `mode single non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(productionCandidateCheckEvidencePath, now)).toThrow(/checkEvidence/);

    const productionCandidateCheckEvidenceJson = 'testnet-production-candidate-aggregate-check-single.json';
    const productionCandidateCheckEvidenceJsonPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidenceJson: productionCandidateCheckEvidenceJson,
      }],
    });
    writeFileSync(
      join(dirname(productionCandidateCheckEvidenceJsonPath), productionCandidateCheckEvidenceJson),
      JSON.stringify(aggregateEvidenceRecord('check', [burnA], txIdA), null, 2),
      'utf-8',
    );
    expect(() => loadHistoricalAggregateSettlementApprovals(productionCandidateCheckEvidenceJsonPath, now)).toThrow(
      /checkEvidenceJson/,
    );
  });

  it('allows concrete approval audit targets that mention sample size or template removal', () => {
    const checkEvidenceJson = 'sample-size-analysis-aggregate-check-single.json';
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `artifact://approvals/template-removal-audit-operator-approval.json completed approval evidence target ` +
          `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
        checkEvidence:
          `artifact://approvals/sample-size-analysis-check-output.log ${approvalMetadata.checkCommand} ` +
          `mode single non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
        checkEvidenceJson,
      }],
    });
    writeFileSync(
      join(dirname(path), checkEvidenceJson),
      JSON.stringify(aggregateEvidenceRecord('check', [burnA], txIdA), null, 2),
      'utf-8',
    );

    vi.useFakeTimers();
    vi.setSystemTime(now);
    const resolver = loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext);

    expect(resolver.expectedTxIdForSingle(burnA, 'single')).toBe(txIdA);
  });

  it('requires checkEvidenceJson to be safe, readable, valid, and bound to the approval facts', () => {
    const missingJsonFieldPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidenceJson: undefined,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingJsonFieldPath, now)).toThrow(/checkEvidenceJson/);

    const unsafeJsonTargetPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidenceJson: `../secrets.${'dlog'}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(unsafeJsonTargetPath, now)).toThrow(/checkEvidenceJson/);

    for (const sensitiveCheckEvidenceJson of [
      'operator/signing-key-check.json',
      'operator/seed-phrase-check.json',
      'sourceTarget=%2Ftmp%2Faggregate-check-single.json',
      'sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Faggregate-check-single.json',
    ]) {
      const sensitiveNameJsonPath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidenceJson: sensitiveCheckEvidenceJson,
        }],
      });
      mkdirSync(join(dirname(sensitiveNameJsonPath), 'operator'), { recursive: true });
      writeFileSync(
        join(dirname(sensitiveNameJsonPath), sensitiveCheckEvidenceJson),
        JSON.stringify(aggregateEvidenceRecord('check', [burnA], txIdA), null, 2),
        'utf-8',
      );
      expect(() => loadHistoricalAggregateSettlementApprovals(sensitiveNameJsonPath, now)).toThrow(/checkEvidenceJson/);
    }

    const unreadableJsonPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidenceJson: 'missing-aggregate-check.json',
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(unreadableJsonPath, now)).toThrow(/cannot be read/);

    const invalidJsonPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    writeFileSync(join(dirname(invalidJsonPath), 'aggregate-check-single.json'), '{not-json', 'utf-8');
    expect(() => loadHistoricalAggregateSettlementApprovals(invalidJsonPath, now)).toThrow(/cannot be read/);

    const mismatchedExpectedTxIdPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    writeFileSync(
      join(dirname(mismatchedExpectedTxIdPath), 'aggregate-check-single.json'),
      JSON.stringify(aggregateEvidenceRecord('check', [burnA], '99'.repeat(32)), null, 2),
      'utf-8',
    );
    expect(() => loadHistoricalAggregateSettlementApprovals(mismatchedExpectedTxIdPath, now)).toThrow(/Expected transaction ID/);

    const mismatchedCommandPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    writeFileSync(
      join(dirname(mismatchedCommandPath), 'aggregate-check-single.json'),
      JSON.stringify(aggregateEvidenceRecord('check-anchored', [burnA], txIdA), null, 2),
      'utf-8',
    );
    expect(() => loadHistoricalAggregateSettlementApprovals(mismatchedCommandPath, now)).toThrow(/command/);
  });

  it('rejects checkEvidenceJson symlink escapes from the approvals directory', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'aggregate-approvals-outside-'));
    tempDirs.push(outsideDir);
    writeFileSync(
      join(outsideDir, 'aggregate-check-single.json'),
      JSON.stringify(aggregateEvidenceRecord('check', [burnA], txIdA), null, 2),
      'utf-8',
    );
    const approvalsPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidenceJson: 'external-link/aggregate-check-single.json',
      }],
    });
    symlinkSync(
      outsideDir,
      join(dirname(approvalsPath), 'external-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(() => loadHistoricalAggregateSettlementApprovals(approvalsPath, now)).toThrow(
      /checkEvidenceJson must stay inside the approvals directory/,
    );
  });

  it('rejects approval files without audit metadata or active approval windows', () => {
    const emptyPath = writeApprovalsFile({ ...fileMetadata, approvals: [] });
    expect(() => loadHistoricalAggregateSettlementApprovals(emptyPath, now)).toThrow(/at least one approval/);

    const impossibleTimestampPath = writeApprovalsFile({
      ...fileMetadata,
      createdAt: '2026-02-31T23:00:00Z',
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        approvedAt: '2026-02-31T00:00:00Z',
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(impossibleTimestampPath, now)).toThrow(/valid ISO UTC timestamp/);

    const missingEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence: 'approved by operator',
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingEvidencePath, now)).toThrow(/evidence/);

    const expiredPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        expiresAt: '2026-05-16T23:59:59Z',
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(expiredPath, now)).toThrow(/expiresAt/);

    const sensitiveEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence: ['file:', '', '', 'C:', 'Users', 'operator', '.' + 'env'].join('/'),
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(sensitiveEvidencePath, now)).toThrow(/evidence/);

    const localEvidenceTargetPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence: `${approvalMetadata.evidence} source ${['', 'tmp', 'operator-approval.json'].join('/')}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(localEvidenceTargetPath, now)).toThrow(/evidence/);

    for (const sensitiveEvidenceTarget of [
      'artifact://approvals/operator/signing-key-approval.json',
      'artifact://approvals/operator/seed-phrase-approval.json',
    ]) {
      const sensitiveSharedNameEvidencePath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          evidence:
            `${sensitiveEvidenceTarget} completed approval evidence target ` +
            `mode single non-broadcast Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(sensitiveSharedNameEvidencePath, now)).toThrow(/evidence/);
    }

    for (const sourceTargetBinding of ['sourceTarget=(.env)', 'sourceTarget=%28.env%29']) {
      const punctuationWrappedEvidenceTargetPath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          evidence: `${approvalMetadata.evidence} ${sourceTargetBinding}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(punctuationWrappedEvidenceTargetPath, now)).toThrow(/evidence/);
    }

    for (const localOnlySourceTargetBinding of [
      'sourceTarget=%2Ftmp%2Foperator-approval.json',
      'sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Foperator-approval.json',
    ]) {
      const localOnlySourceTargetPath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          evidence: `${approvalMetadata.evidence} ${localOnlySourceTargetBinding}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(localOnlySourceTargetPath, now)).toThrow(/evidence/);
    }

    const mainnetPath = writeApprovalsFile({
      ...fileMetadata,
      ergoNodeNetwork: 'mainnet',
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(mainnetPath, now)).toThrow(/mainnet/);

    const negatedErgoNodeNetworkPath = writeApprovalsFile({
      ...fileMetadata,
      ergoNodeNetwork: 'not testnet',
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(negatedErgoNodeNetworkPath, now)).toThrow(/network/);

    const negatedSidechainNetworkPath = writeApprovalsFile({
      ...fileMetadata,
      sidechainNetwork: 'without non-mainnet confirmation',
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(negatedSidechainNetworkPath, now)).toThrow(/network/);

    const productionReadyEnvironmentPath = writeApprovalsFile({
      ...fileMetadata,
      environment: 'production-ready testnet',
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(productionReadyEnvironmentPath, now)).toThrow(/production/);

    const productionCandidateSidechainNetworkPath = writeApprovalsFile({
      ...fileMetadata,
      sidechainNetwork: 'testnet production-candidate',
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(productionCandidateSidechainNetworkPath, now)).toThrow(/production/);
  });

  it('rejects approval metadata for node A when check evidence was produced against node B', () => {
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
      }],
    });
    writeFileSync(
      join(dirname(path), 'aggregate-check-single.json'),
      JSON.stringify(
        aggregateEvidenceRecord('check', [burnA], txIdA, 'http://127.0.0.1:9053'),
        null,
        2,
      ),
      'utf-8',
    );

    expect(() => loadHistoricalAggregateSettlementApprovals(path, now, runtimeContext)).toThrow(
      /checker node origin must match approval-file ergoNodeUrl/,
    );
  });

  it('rejects approval rows without non-broadcast check evidence', () => {
    const broadcastEnabledEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `${approvalMetadata.evidence} scoped shell BRIDGE_BROADCAST_ENABLED=true broadcast enabled`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(broadcastEnabledEvidencePath, now)).toThrow(/broadcast/);

    const broadcastStatusEnabledEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence: `${approvalMetadata.evidence} broadcast status = enabled`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(broadcastStatusEnabledEvidencePath, now)).toThrow(/broadcast/);

    const broadcastEnabledCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `${approvalMetadata.checkEvidence} scoped shell BRIDGE_BROADCAST_ENABLED=true broadcast enabled`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(broadcastEnabledCheckEvidencePath, now)).toThrow(/broadcast/);

    const compatibilityBroadcastEnabledEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        evidence:
          `${approvalMetadata.evidence} BRIDGE_BROADCAST_ENABLED=${FULLWIDTH_TRUE}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityBroadcastEnabledEvidencePath, now)).toThrow(/broadcast/);

    const compatibilityBroadcastEnabledCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `${approvalMetadata.checkEvidence} BRIDGE_BROADCAST_ENABLED=${FULLWIDTH_TRUE}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(compatibilityBroadcastEnabledCheckEvidencePath, now)).toThrow(/broadcast/);

    const broadcastModeTrueCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence: `${approvalMetadata.checkEvidence} broadcast mode: true`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(broadcastModeTrueCheckEvidencePath, now)).toThrow(/broadcast/);

    const submitCommandPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkCommand: `npm run settle:aggregate -- submit ${burnA} ${txIdA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(submitCommandPath, now)).toThrow(/checkCommand/);

    const windowsSubmitCommandPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkCommand: `npm.cmd run settle:aggregate -- submit ${burnA} ${txIdA}`,
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(windowsSubmitCommandPath, now)).toThrow(/checkCommand/);

    const targetlessCheckEvidencePath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence: 'command output: PASS',
      }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(targetlessCheckEvidencePath, now)).toThrow(/checkEvidence/);

    for (const localCheckEvidenceSuffix of [
      `copied from ${['', '', 'operator-share', 'checks', 'check-output.log'].join('/')}`,
      'copied from %2Ftmp%2Faggregate-approval-check-output.log',
    ]) {
      const localCheckEvidenceTargetPath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidence: `${approvalMetadata.checkEvidence} ${localCheckEvidenceSuffix}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(localCheckEvidenceTargetPath, now)).toThrow(/checkEvidence/);
    }

    for (const sensitiveCheckEvidenceTarget of [
      'artifact://approvals/operator/signing-key-check.log',
      'artifact://approvals/operator/seed-phrase-check.log',
    ]) {
      const sensitiveSharedNameCheckEvidencePath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidence:
            `${sensitiveCheckEvidenceTarget} ${approvalMetadata.checkCommand} ` +
            `mode single non-broadcast PASS Expected transaction ID ${txIdA} ordered burn set ${burnA}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(sensitiveSharedNameCheckEvidencePath, now)).toThrow(/checkEvidence/);
    }

    for (const sourceTargetBinding of [
      'sourceTarget=(runtime/bridge-state.sqlite)',
      'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
    ]) {
      const punctuationWrappedCheckEvidenceTargetPath = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidence: `${approvalMetadata.checkEvidence} ${sourceTargetBinding}`,
        }],
      });
      expect(() => loadHistoricalAggregateSettlementApprovals(punctuationWrappedCheckEvidenceTargetPath, now)).toThrow(/checkEvidence/);
    }
  });

  it('rejects approval check evidence with compatibility-normalized failure markers', () => {
    const path = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence:
          `${approvalMetadata.checkEvidence} validation\uFF1A\uFF26\uFF21\uFF29\uFF2C exit code \uFF11`,
      }],
    });

    expect(() => loadHistoricalAggregateSettlementApprovals(path, now)).toThrow(/internally positive PASS/);
  });

  it('rejects approval check evidence with structured failure fields', () => {
    const emptyStructuredFieldsPath = writeApprovalsFile({
      ...fileMetadata,
      approvals: [{
        mode: 'single',
        burnTxHash: burnA,
        expectedTxId: txIdA,
        ...approvalMetadata,
        checkEvidence: `${approvalMetadata.checkEvidence} {"errors":[]} errorCount: 0 failureTotal: 0`,
      }],
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(loadHistoricalAggregateSettlementApprovals(emptyStructuredFieldsPath, now)
      .expectedTxIdForSingle(burnA, 'single')).toBe(txIdA);

    for (const structuredFailureField of [
      '{"errors":["node rejected candidate"]}',
      '{"failures":{"check":"node rejected candidate"}}',
      'errorCount: 1',
      'failureTotal: 1',
    ]) {
      const path = writeApprovalsFile({
        ...fileMetadata,
        approvals: [{
          mode: 'single',
          burnTxHash: burnA,
          expectedTxId: txIdA,
          ...approvalMetadata,
          checkEvidence: `${approvalMetadata.checkEvidence} ${structuredFailureField}`,
        }],
      });

      expect(() => loadHistoricalAggregateSettlementApprovals(path, now)).toThrow(/internally positive PASS/);
    }
  });

  it('rejects legacy approval files and files missing runtime binding metadata', () => {
    const legacyPath = writeApprovalsFile({
      version: 1,
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(legacyPath, now)).toThrow(/version must be 2/);

    const missingContextPath = writeApprovalsFile({
      version: 2,
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(missingContextPath, now)).toThrow(/createdAt/);
  });

  it('rejects approval files that do not match the runtime context', () => {
    const pathBearingNode = writeApprovalsFile({
      ...fileMetadata,
      ergoNodeUrl: 'http://127.0.0.1:9052/api',
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(pathBearingNode, now, runtimeContext)).toThrow(
      /without a path/,
    );

    const wrongNodePath = writeApprovalsFile({
      ...fileMetadata,
      ergoNodeUrl: 'http://127.0.0.1:9053',
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(wrongNodePath, now, runtimeContext)).toThrow(/ergoNodeUrl/);

    const wrongStatePath = writeApprovalsFile({
      ...fileMetadata,
      deployedStateHash: '44'.repeat(32),
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(wrongStatePath, now, runtimeContext)).toThrow(/deployedStateHash/);

    const wrongSidechainNetworkPath = writeApprovalsFile({
      ...fileMetadata,
      sidechainNetwork: 'another-testnet',
      approvals: [{ mode: 'single', burnTxHash: burnA, expectedTxId: txIdA, ...approvalMetadata }],
    });
    expect(() => loadHistoricalAggregateSettlementApprovals(wrongSidechainNetworkPath, now, runtimeContext)).toThrow(/sidechainNetwork/);
  });
});
