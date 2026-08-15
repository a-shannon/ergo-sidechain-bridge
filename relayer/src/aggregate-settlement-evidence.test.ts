import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  buildAggregateSettlementTrustlessCandidateEvidenceRecord,
  buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord,
  formatAggregateSettlementEvidenceJsonPathLabel,
  formatPreparedSettlementShapeEvidenceLines,
  resolveAggregateSettlementEvidenceJsonPath,
  summarizePreparedSettlementShape,
  summarizeTrustlessUnsignedTxPayoutBinding,
  validateAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  validateAggregateSettlementTrustlessCandidateEvidenceRecord,
  validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';

const testCheckerIdentity = {
  profile: 'e2s.ergo-node-transactions-check.v1',
  sourceAdapterProfile: 'e2s.ergo-node-json-source.v1',
  nodeOrigin: 'http://127.0.0.1:9053',
  path: '/transactions/check',
  method: 'POST',
  transportPolicy: 'no-redirect-no-proxy',
} as const;
const trustlessSidechainIdHex = '11'.repeat(32);
const trustlessSidechainTxHashHex = '22'.repeat(32);
const trustlessSidechainLogIndex = 7;
const trustlessRecipientErgoTreeHex = '0008cd02' + '44'.repeat(32);
const trustlessDerivedBurnIdHex = deriveTrustlessBurnIdHex({
  sidechainIdHex: trustlessSidechainIdHex,
  sidechainTxHashHex: trustlessSidechainTxHashHex,
  eventIndex: trustlessSidechainLogIndex,
});
const trustlessRecipientErgoTreeHashHex = validTrustlessPayoutBindingEvidence().recipientErgoTreeHashHex;

function validTrustlessPayoutBindingEvidence() {
  return summarizeTrustlessUnsignedTxPayoutBinding({
    outputs: [
      {},
      {},
      {
        ergoTree: trustlessRecipientErgoTreeHex,
        value: 1_000_000,
      },
      {},
    ],
  });
}

function overCapClaims() {
  return Array.from({ length: 11 }, (_, index) => ({
    burnTxHash: (0x10 + index).toString(16).repeat(32),
    sidechainBlockHeight: 200 + index,
    sidechainHeaderHashHex: (0x40 + index).toString(16).repeat(32),
    bridgeEventRootHex: (0x60 + index).toString(16).repeat(32),
    ergoAnchorHeight: 100 + index,
  }));
}

function validAggregateEvidenceInput(
  command = 'check-with-ingest',
  transactionCheckResponse: unknown = '',
) {
  return {
    generatedAt: '2026-05-17T10:30:00.000Z',
    command,
    label: 'Aggregate same-TX ingest settlement',
    expectedTxId: '11'.repeat(32),
    transactionCheckResponse,
    checkerIdentity: testCheckerIdentity,
    settlementShape: {
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 3, 1],
      contextExtensionKeyCountsCsv: '0,3,1',
    },
    claims: [{
      burnTxHash: '22'.repeat(32),
      sidechainBlockHeight: 123,
      sidechainHeaderHashHex: '33'.repeat(32),
      bridgeEventRootHex: '44'.repeat(32),
      ergoAnchorHeight: 456,
    }],
  };
}

function validAggregateEvidenceRecord(command = 'check-with-ingest'): Record<string, any> {
  return buildAggregateSettlementPrebroadcastEvidenceRecord(validAggregateEvidenceInput(command));
}

function validTrustlessCandidateEvidenceRecord(): Record<string, any> {
  return buildAggregateSettlementTrustlessCandidateEvidenceRecord({
    generatedAt: '2026-05-17T10:30:00.000Z',
    label: 'Trustless settlement candidate identity',
    claims: [{
      legacySidechainTxHash: trustlessSidechainTxHashHex,
      sidechainBlockHeight: 123,
      trustlessBurnDerivation: {
        sidechainIdHex: trustlessSidechainIdHex,
        sidechainLogIndex: trustlessSidechainLogIndex,
        derivedBurnIdHex: trustlessDerivedBurnIdHex,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: trustlessDerivedBurnIdHex,
        bridgeEventRootHex: '44'.repeat(32),
        recipientErgoTreeHashHex: trustlessRecipientErgoTreeHashHex,
        amountNanoErg: '1000000',
        assetIdHex: '77'.repeat(32),
      },
    }],
  });
}

function validTrustlessUnsignedTxEvidenceRecord(): Record<string, any> {
  return buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord({
    generatedAt: '2026-07-01T10:30:00.000Z',
    label: 'Trustless single-leaf unsigned tx source boundary',
    candidateEvidence: validTrustlessCandidateEvidenceRecord() as any,
    selectedBoxes: {
      trackerBoxId: '10'.repeat(32),
      aggregateDupBoxId: '20'.repeat(32),
      unlockBoxId: '30'.repeat(32),
    },
    payoutBinding: validTrustlessPayoutBindingEvidence(),
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

describe('aggregate settlement evidence helpers', () => {
  it('summarizes input, output, and ContextExtension counts for pre-broadcast evidence', () => {
    const summary = summarizePreparedSettlementShape({
      inputs: [
        { boxId: 'tracker', extension: {} },
        { boxId: 'dup', extension: { '0': 'a', '1': 'b', '7': 'selector' } },
        { boxId: 'unlock', extension: { '0': 'proof' } },
      ],
      outputs: [
        { boxId: 'tracker-successor' },
        { boxId: 'dup-successor' },
        { boxId: 'recipient-payout' },
        { boxId: 'miner-fee' },
      ],
    });

    expect(summary).toEqual({
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 3, 1],
      contextExtensionKeyCountsCsv: '0,3,1',
    });
  });

  it('treats missing input extensions as zero-key ContextExtensions', () => {
    const summary = summarizePreparedSettlementShape({
      inputs: [{ boxId: 'p2pk' }, { boxId: 'contract', extension: { '0': 'proof' } }],
      outputs: [{ boxId: 'out' }],
    });

    expect(summary.contextExtensionKeyCounts).toEqual([0, 1]);
    expect(summary.contextExtensionKeyCountsCsv).toBe('0,1');
  });

  it('formats stable pre-broadcast evidence lines for operator command output', () => {
    const lines = formatPreparedSettlementShapeEvidenceLines({
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 3, 1],
      contextExtensionKeyCountsCsv: '0,3,1',
    });

    expect(lines).toEqual([
      'inputs: 3',
      'outputs: 4',
      'contextExtensionKeyCountsPerInput: 0,3,1',
    ]);
  });

  it('builds stable non-broadcast aggregate settlement evidence records', () => {
    const record = buildAggregateSettlementPrebroadcastEvidenceRecord({
      generatedAt: '2026-05-17T10:30:00.000Z',
      command: 'check-with-ingest',
      label: 'Aggregate same-TX ingest settlement',
      expectedTxId: '11'.repeat(32),
      transactionCheckResponse: '',
      checkerIdentity: testCheckerIdentity,
      settlementShape: {
        inputCount: 3,
        outputCount: 4,
        contextExtensionKeyCounts: [0, 3, 1],
        contextExtensionKeyCountsCsv: '0,3,1',
      },
      claims: [{
        burnTxHash: '22'.repeat(32),
        sidechainBlockHeight: 123,
        sidechainHeaderHashHex: '33'.repeat(32),
        bridgeEventRootHex: '44'.repeat(32),
        ergoAnchorHeight: 456,
      }],
    });

    expect(record).toEqual({
      schemaVersion: 2,
      generatedAt: '2026-05-17T10:30:00.000Z',
      command: 'check-with-ingest',
      label: 'Aggregate same-TX ingest settlement',
      stateTrackerMode: 'read-only',
      broadcast: 'no',
      transactionCheck: {
        endpoint: '/transactions/check',
        result: 'PASS',
        expectedTxId: '11'.repeat(32),
        nodeResponse: '',
        nodeResponseKind: 'empty-string',
        nodeResponseDigest: '12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126',
        checkerIdentity: testCheckerIdentity,
      },
      claimCount: 1,
      claims: [{
        burnTxHash: '22'.repeat(32),
        sidechainBlockHeight: 123,
        sidechainHeaderHashHex: '33'.repeat(32),
        bridgeEventRootHex: '44'.repeat(32),
        ergoAnchorHeight: 456,
      }],
      settlementShape: {
        inputCount: 3,
        outputCount: 4,
        contextExtensionKeyCounts: [0, 3, 1],
        contextExtensionKeyCountsCsv: '0,3,1',
      },
      sourceBindings: {
        state: {
          sourceType: 'read-only-state-tracker',
          input: '--state-db',
          readOnly: true,
          targetClass: 'operator-provided-state-db',
          runtimePathSerialized: false,
          defaultFallbackUsed: false,
          operations: ['read-only peg-out state lookup'],
        },
        deployedState: {
          sourceType: 'sanitized-deployed-state-json',
          input: '--deployed-state-json',
          targetClass: 'operator-provided-deployed-state-json',
          runtimePathSerialized: false,
          defaultLoaderUsed: false,
          operations: ['read-only sanitized deployed-state load'],
        },
      },
    });
    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(record)).toEqual([]);
  });

  it('records explicit operator input provenance without serializing runtime paths', () => {
    const record = validAggregateEvidenceRecord();

    expect(record.sourceBindings).toEqual({
      state: {
        sourceType: 'read-only-state-tracker',
        input: '--state-db',
        readOnly: true,
        targetClass: 'operator-provided-state-db',
        runtimePathSerialized: false,
        defaultFallbackUsed: false,
        operations: ['read-only peg-out state lookup'],
      },
      deployedState: {
        sourceType: 'sanitized-deployed-state-json',
        input: '--deployed-state-json',
        targetClass: 'operator-provided-deployed-state-json',
        runtimePathSerialized: false,
        defaultLoaderUsed: false,
        operations: ['read-only sanitized deployed-state load'],
      },
    });
    expect(JSON.stringify(record)).not.toMatch(/(?:^|["'\s])[A-Z]:[\\/]|bridge-state\.sqlite|deployed_state\.json/i);
  });

  it('rejects aggregate evidence records without explicit operator source bindings', () => {
    const missingBindings = validAggregateEvidenceRecord();
    delete missingBindings.sourceBindings;

    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(missingBindings)).toContain(
      'sourceBindings must be an object',
    );

    const weakened = validAggregateEvidenceRecord();
    weakened.sourceBindings.state.runtimePathSerialized = true;
    weakened.sourceBindings.state.defaultFallbackUsed = true;
    weakened.sourceBindings.state.targetClass = 'default-state-db';
    weakened.sourceBindings.deployedState.runtimePathSerialized = true;
    weakened.sourceBindings.deployedState.defaultLoaderUsed = true;
    weakened.sourceBindings.deployedState.targetClass = 'contracts/deployed_state.json';

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(weakened);
    expect(errors).toContain('sourceBindings.state.targetClass must be operator-provided-state-db');
    expect(errors).toContain('sourceBindings.state.runtimePathSerialized must be false');
    expect(errors).toContain('sourceBindings.state.defaultFallbackUsed must be false');
    expect(errors).toContain(
      'sourceBindings.deployedState.targetClass must be operator-provided-deployed-state-json',
    );
    expect(errors).toContain('sourceBindings.deployedState.runtimePathSerialized must be false');
    expect(errors).toContain('sourceBindings.deployedState.defaultLoaderUsed must be false');
  });

  it('fails closed when building invalid aggregate settlement evidence records', () => {
    expect(() => buildAggregateSettlementPrebroadcastEvidenceRecord({
      generatedAt: '2026-05-17T10:30:00.000Z',
      command: 'submit',
      label: 'Aggregate settlement submit',
      expectedTxId: '11'.repeat(32),
      transactionCheckResponse: '',
      checkerIdentity: testCheckerIdentity,
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
    })).toThrow(/command must be a non-broadcast aggregate check command/);
  });

  it('rejects aggregate evidence records that imply live action or failed node checks', () => {
    const record = validAggregateEvidenceRecord();
    record.command = 'submit';
    record.stateTrackerMode = 'read-write';
    record.broadcast = 'yes';
    record.transactionCheck.endpoint = '/transactions';
    record.transactionCheck.result = 'FAIL';

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain('command must be a non-broadcast aggregate check command');
    expect(errors).toContain('stateTrackerMode must be read-only');
    expect(errors).toContain('broadcast must be no');
    expect(errors).toContain('transactionCheck.endpoint must be /transactions/check');
    expect(errors).toContain('transactionCheck.result must be PASS');
  });

  it('rejects aggregate evidence records without observed node-check response binding', () => {
    const record = validAggregateEvidenceRecord();
    delete record.transactionCheck.nodeResponse;
    delete record.transactionCheck.nodeResponseKind;
    delete record.transactionCheck.nodeResponseDigest;

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain('transactionCheck.nodeResponse must expose the observed /transactions/check response');
    expect(errors).toContain(
      'transactionCheck.nodeResponseKind must identify the observed /transactions/check response kind',
    );
    expect(errors).toContain('transactionCheck.nodeResponseDigest must be 32-byte hex');
  });

  it('rejects missing or weakened checker identity bindings', () => {
    const missing = validAggregateEvidenceRecord();
    delete missing.transactionCheck.checkerIdentity;
    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(missing)).toContain(
      'transactionCheck.checkerIdentity must be an object',
    );

    const mutations: Array<[string, unknown, string]> = [
      ['profile', 'other-checker', 'transactionCheck.checkerIdentity.profile must identify the Ergo node checker'],
      [
        'sourceAdapterProfile',
        'other-source',
        'transactionCheck.checkerIdentity.sourceAdapterProfile must identify the Ergo node JSON source',
      ],
      ['path', '/transactions', 'transactionCheck.checkerIdentity.path must be /transactions/check'],
      ['method', 'GET', 'transactionCheck.checkerIdentity.method must be POST'],
      [
        'transportPolicy',
        'redirects-allowed',
        'transactionCheck.checkerIdentity.transportPolicy must be no-redirect-no-proxy',
      ],
      ['nodeOrigin', 'http://127.0.0.1:9053/', 'transactionCheck.checkerIdentity.nodeOrigin must be canonical'],
    ];
    for (const [field, value, expectedError] of mutations) {
      const record = validAggregateEvidenceRecord();
      record.transactionCheck.checkerIdentity[field] = value;
      expect(validateAggregateSettlementPrebroadcastEvidenceRecord(record)).toContain(expectedError);
    }
  });

  it('rejects aggregate evidence records whose node-check digest is not bound to the response body', () => {
    const record = validAggregateEvidenceRecord();
    record.transactionCheck.nodeResponse = { ok: true };
    record.transactionCheck.nodeResponseKind = 'object';
    record.transactionCheck.nodeResponseDigest = '12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126';

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain(
      'transactionCheck.nodeResponseDigest must match the observed /transactions/check response',
    );
  });

  it('rejects aggregate evidence records whose node-check response carries compatibility-normalized failure markers', () => {
    expect(() => buildAggregateSettlementPrebroadcastEvidenceRecord({
      generatedAt: '2026-05-17T10:30:00.000Z',
      command: 'check-with-ingest',
      label: 'Aggregate same-TX ingest settlement',
      expectedTxId: '11'.repeat(32),
      transactionCheckResponse: {
        status: 'PASS',
        validation: '\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24',
        exitCode: '\uFF11',
      },
      checkerIdentity: testCheckerIdentity,
      settlementShape: {
        inputCount: 3,
        outputCount: 4,
        contextExtensionKeyCounts: [0, 3, 1],
        contextExtensionKeyCountsCsv: '0,3,1',
      },
      claims: [{
        burnTxHash: '22'.repeat(32),
        sidechainBlockHeight: 123,
        sidechainHeaderHashHex: '33'.repeat(32),
        bridgeEventRootHex: '44'.repeat(32),
        ergoAnchorHeight: 456,
      }],
    })).toThrow(/transactionCheck\.nodeResponse must not include contradictory failure markers/);
  });

  it('rejects aggregate evidence records whose node-check response carries structured failure fields', () => {
    const emptyStructuredFields = buildAggregateSettlementPrebroadcastEvidenceRecord(
      validAggregateEvidenceInput('check-with-ingest', {
        status: 'PASS',
        errors: [],
        failures: {},
        errorCount: 0,
        failureTotal: 0,
      }),
    );

    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(emptyStructuredFields)).toEqual([]);

    for (const transactionCheckResponse of [
      {
        status: 'PASS',
        errors: ['node rejected candidate'],
      },
      {
        status: 'PASS',
        failures: {
          check: 'node rejected candidate',
        },
      },
      {
        status: 'PASS',
        errorCount: 1,
      },
      {
        status: 'PASS',
        failureTotal: 1,
      },
    ]) {
      expect(() => buildAggregateSettlementPrebroadcastEvidenceRecord(
        validAggregateEvidenceInput('check-with-ingest', transactionCheckResponse),
      )).toThrow(/transactionCheck\.nodeResponse must not include contradictory failure markers/);
    }
  });

  it('rejects aggregate evidence records with inconsistent claim and transaction shape counts', () => {
    const record = validAggregateEvidenceRecord();
    record.claimCount = 2;
    record.settlementShape.contextExtensionKeyCounts = [0, 3];
    record.settlementShape.contextExtensionKeyCountsCsv = '0,3,1';

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain('claimCount must match claims.length');
    expect(errors).toContain('settlementShape.contextExtensionKeyCounts length must match inputCount');
    expect(errors).toContain('settlementShape.contextExtensionKeyCountsCsv must match contextExtensionKeyCounts');
  });

  it('rejects aggregate evidence records with impossible command claim cardinality', () => {
    const singleClaimBatch = validAggregateEvidenceRecord();
    singleClaimBatch.command = 'check-batch';
    const multiClaimSingleCheck = validAggregateEvidenceRecord('check');
    multiClaimSingleCheck.claimCount = 2;
    multiClaimSingleCheck.claims = [
      multiClaimSingleCheck.claims[0],
      {
        ...multiClaimSingleCheck.claims[0],
        burnTxHash: '55'.repeat(32),
      },
    ];

    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(singleClaimBatch)).toContain(
      'check-batch evidence must contain at least two claims',
    );
    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(multiClaimSingleCheck)).toContain(
      'check evidence must contain exactly one claim',
    );
  });

  it('rejects aggregate batch evidence above the batch unlock claim cap', () => {
    const record = validAggregateEvidenceRecord();
    record.command = 'check-batch';
    record.claims = overCapClaims();
    record.claimCount = record.claims.length;

    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(record)).toContain(
      'check-batch evidence must not exceed batch unlock cap (10 claims)',
    );
  });

  it('rejects malformed aggregate evidence claim identifiers, heights, and duplicates', () => {
    const record = validAggregateEvidenceRecord();
    record.claimCount = 2;
    record.claims = [
      record.claims[0],
      {
        ...record.claims[0],
        sidechainBlockHeight: -1,
        sidechainHeaderHashHex: 'aa',
        bridgeEventRootHex: 'bb',
        ergoAnchorHeight: 1.5,
      },
    ];

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain('claims[1].burnTxHash must be unique');
    expect(errors).toContain('claims[1].sidechainBlockHeight must be a non-negative safe integer');
    expect(errors).toContain('claims[1].sidechainHeaderHashHex must be 32-byte hex');
    expect(errors).toContain('claims[1].bridgeEventRootHex must be 32-byte hex');
    expect(errors).toContain('claims[1].ergoAnchorHeight must be a non-negative safe integer');
  });

  it('requires tracker ingest fields for batch, same-TX ingest, and anchored evidence records', () => {
    for (const command of ['check-batch', 'check-with-ingest', 'check-anchored']) {
      const record = validAggregateEvidenceRecord(command === 'check-batch' ? 'check-with-ingest' : command);
      record.command = command;
      record.claimCount = command === 'check-batch' ? 2 : 1;
      record.claims = command === 'check-batch'
        ? [
            record.claims[0],
            {
              ...record.claims[0],
              burnTxHash: '55'.repeat(32),
            },
          ]
        : record.claims;
      delete record.claims[0].sidechainHeaderHashHex;
      delete record.claims[0].bridgeEventRootHex;
      delete record.claims[0].ergoAnchorHeight;

      const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
      expect(errors, command).toContain('claims[0].sidechainHeaderHashHex must be 32-byte hex');
      expect(errors, command).toContain('claims[0].bridgeEventRootHex must be 32-byte hex');
      expect(errors, command).toContain('claims[0].ergoAnchorHeight must be a non-negative safe integer');
    }
  });

  it('rejects non-object aggregate evidence records and unsupported fields', () => {
    const record = validAggregateEvidenceRecord();
    record.operatorNote = 'unexpected narrative field';
    record.transactionCheck.extra = 'unexpected';
    record.claims[0].extra = 'unexpected';
    record.settlementShape.extra = 'unexpected';

    expect(validateAggregateSettlementPrebroadcastEvidenceRecord(null)).toEqual([
      'aggregate settlement evidence record must be an object',
    ]);
    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain('aggregate settlement evidence record.operatorNote: unsupported evidence field');
    expect(errors).toContain('transactionCheck.extra: unsupported evidence field');
    expect(errors).toContain('claims[0].extra: unsupported evidence field');
    expect(errors).toContain('settlementShape.extra: unsupported evidence field');
  });

  it('builds read-only trustless settlement candidate evidence without transaction-check semantics', () => {
    const record = validTrustlessCandidateEvidenceRecord();

    expect(record).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-05-17T10:30:00.000Z',
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
        legacySidechainTxHash: '22'.repeat(32),
        sidechainBlockHeight: 123,
        trustlessBurnDerivation: {
          sidechainIdHex: trustlessSidechainIdHex,
          sidechainLogIndex: trustlessSidechainLogIndex,
          derivedBurnIdHex: trustlessDerivedBurnIdHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: trustlessDerivedBurnIdHex,
          bridgeEventRootHex: '44'.repeat(32),
          recipientErgoTreeHashHex: trustlessRecipientErgoTreeHashHex,
          amountNanoErg: '1000000',
          assetIdHex: '77'.repeat(32),
        },
      }],
      contractCompatibility: 'candidate-only-trustless-v2-required',
    });
    expect('sourceBindings' in record).toBe(false);
    expect('transactionCheck' in record).toBe(false);
    expect('expectedTxId' in record).toBe(false);
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(record)).toEqual([]);
  });

  it('builds read-only trustless unsigned tx evidence without transaction-check semantics', () => {
    const record = validTrustlessUnsignedTxEvidenceRecord();

    expect(record).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-07-01T10:30:00.000Z',
      evidenceKind: 'trustless-single-leaf-unsigned-tx',
      label: 'Trustless single-leaf unsigned tx source boundary',
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
      claims: validTrustlessCandidateEvidenceRecord().claims,
      selectedBoxes: {
        trackerBoxId: '10'.repeat(32),
        aggregateDupBoxId: '20'.repeat(32),
        unlockBoxId: '30'.repeat(32),
      },
      payoutBinding: validTrustlessPayoutBindingEvidence(),
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
    });
    expect('transactionCheck' in record).toBe(false);
    expect('expectedTxId' in record).toBe(false);
    expect(validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(record)).toEqual([]);
  });

  it('rejects trustless unsigned tx payout evidence that overpays the proved burn amount', () => {
    const record = validTrustlessUnsignedTxEvidenceRecord();
    record.payoutBinding.amountNanoErg = '1000001';
    record.payoutBinding.amountEqualsProvedBurn = false;

    const errors = validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(record);

    expect(errors).toContain(
      'payoutBinding.amountNanoErg must exactly match claims[0].settlementIdentity.amountNanoErg',
    );
    expect(errors).toContain('payoutBinding.amountEqualsProvedBurn must be true');
  });

  it('rejects trustless unsigned tx payout evidence that targets a different recipient tree', () => {
    const record = validTrustlessUnsignedTxEvidenceRecord();
    record.payoutBinding.recipientErgoTreeHex = '0008cd02' + '45'.repeat(32);
    record.payoutBinding.recipientHashEqualsProvedBurn = false;

    const errors = validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(record);

    expect(errors).toContain(
      'payoutBinding.recipientErgoTreeHashHex must equal Blake2b-256(recipientErgoTreeHex)',
    );
    expect(errors).toContain('payoutBinding.recipientHashEqualsProvedBurn must be true');
  });

  it('rejects trustless unsigned tx evidence that implies approval, check, signing, or broadcast', () => {
    const record = validTrustlessUnsignedTxEvidenceRecord();
    record.broadcast = 'yes';
    record.boundary.signing = 'yes';
    record.selectedBoxes.unlockBoxId = record.selectedBoxes.trackerBoxId;
    record.settlementShape.inputCount = 4;
    record.settlementShape.contextExtensionKeyCounts[2] = 8;
    record.contextExtensionGuard.signingPermitted = true;
    record.contextExtensionGuard.offenderCount = 1;
    record.transactionCheck = {
      endpoint: '/transactions/check',
      result: 'PASS',
    };
    record.expectedTxId = '11'.repeat(32);

    const errors = validateAggregateSettlementTrustlessUnsignedTxEvidenceRecord(record);
    expect(errors).toContain(
      'trustless unsigned tx evidence record.transactionCheck: unsupported evidence field',
    );
    expect(errors).toContain(
      'trustless unsigned tx evidence record.expectedTxId: unsupported evidence field',
    );
    expect(errors).toContain('broadcast must be no');
    expect(errors).toContain('boundary.signing must be no');
    expect(errors).toContain('selectedBoxes.unlockBoxId must be unique');
    expect(errors).toContain(
      'settlementShape.inputCount must be 3 for trustless single-leaf unsigned tx evidence',
    );
    expect(errors).toContain(
      'settlementShape.contextExtensionKeyCounts[2] must be 4 for the compact V2 trustless unlock input',
    );
    expect(errors).toContain('contextExtensionGuard.signingPermitted must be false');
    expect(errors).toContain('contextExtensionGuard.offenderCount must match offenders.length');
  });

  it('keeps trustless unsigned tx evidence out of pre-broadcast approval evidence', () => {
    const record = validTrustlessUnsignedTxEvidenceRecord();

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain(
      'aggregate settlement evidence record.evidenceKind: unsupported evidence field',
    );
    expect(errors).toContain(
      'aggregate settlement evidence record.contractCompatibility: unsupported evidence field',
    );
    expect(errors).toContain(
      'aggregate settlement evidence record.selectedBoxes: unsupported evidence field',
    );
    expect(errors).toContain(
      'aggregate settlement evidence record.contextExtensionGuard: unsupported evidence field',
    );
    expect(errors).toContain('command must be a non-empty string');
    expect(errors).toContain('transactionCheck must be an object');
  });

  it('accepts proof-vector source bindings for trustless candidate evidence', () => {
    const record = buildAggregateSettlementTrustlessCandidateEvidenceRecord({
      generatedAt: '2026-05-17T10:30:00.000Z',
      label: 'Trustless settlement candidate identity',
      sourceBindings: {
        proofVector: {
          sourceKind: 'trustless-burn-proof-vector',
          target: 'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
          targetBurnIdHex: trustlessDerivedBurnIdHex,
          bridgeEventRootHex: '44'.repeat(32),
          leafHashHex: '66'.repeat(32),
          leafCount: 2,
          proofNodeCount: 1,
          gate5Claim: false,
          contractsChanged: false,
          boundary: 'local-proof-core-candidate-only',
        },
      },
      claims: [{
        legacySidechainTxHash: trustlessSidechainTxHashHex,
        sidechainBlockHeight: 123,
        trustlessBurnDerivation: {
          sidechainIdHex: trustlessSidechainIdHex,
          sidechainLogIndex: trustlessSidechainLogIndex,
          derivedBurnIdHex: trustlessDerivedBurnIdHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: trustlessDerivedBurnIdHex,
          bridgeEventRootHex: '44'.repeat(32),
          recipientErgoTreeHashHex: '55'.repeat(32),
          amountNanoErg: '1000000',
        },
      }],
    });

    expect(record.sourceBindings?.proofVector?.target).toBe('test-vectors/trustless-burn-proof-v1-multi-leaf.json');
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(record)).toEqual([]);
  });

  it('rejects malformed or claim-escalating proof-vector source bindings', () => {
    const record = validTrustlessCandidateEvidenceRecord();
    record.sourceBindings = {
      proofVector: {
        sourceKind: 'trustless-burn-proof-vector',
        target: '../evidence/mainnet-production-proof-vector.json',
        targetBurnIdHex: '99'.repeat(32),
        bridgeEventRootHex: '88'.repeat(32),
        leafHashHex: 'aa',
        leafCount: 1,
        proofNodeCount: 0,
        gate5Claim: true,
        contractsChanged: true,
        boundary: 'gate-5-closure',
      },
    };

    const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(record);
    expect(errors).toContain(
      '../evidence/mainnet-production-proof-vector.json: sourceBindings.proofVector.target target must not use production claim wording',
    );
    expect(errors).toContain(
      'sourceBindings.proofVector.targetBurnIdHex must match claims[0].settlementIdentity.duplicatePreventionKeyHex',
    );
    expect(errors).toContain(
      'sourceBindings.proofVector.bridgeEventRootHex must match claims[0].settlementIdentity.bridgeEventRootHex',
    );
    expect(errors).toContain('sourceBindings.proofVector.leafHashHex must be 32-byte hex');
    expect(errors).toContain('sourceBindings.proofVector.leafCount must be at least 2');
    expect(errors).toContain('sourceBindings.proofVector.proofNodeCount must be a positive safe integer');
    expect(errors).toContain('sourceBindings.proofVector.gate5Claim must be false');
    expect(errors).toContain('sourceBindings.proofVector.contractsChanged must be false');
    expect(errors).toContain('sourceBindings.proofVector.boundary must be local-proof-core-candidate-only');
  });

  it('requires trustless candidate boundary fields to keep claims and readiness closed', () => {
    const missing = validTrustlessCandidateEvidenceRecord();
    delete missing.boundary;
    const escalated = validTrustlessCandidateEvidenceRecord();
    escalated.boundary.gate5Closure = 'yes';
    escalated.boundary.testnetProductionCandidateClaim = 'yes';
    escalated.boundary.productionReadyClaim = 'yes';

    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(missing)).toContain(
      'boundary must be an object',
    );
    const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(escalated);
    expect(errors).toContain('boundary.gate5Closure must be no');
    expect(errors).toContain('boundary.testnetProductionCandidateClaim must be no');
    expect(errors).toContain('boundary.productionReadyClaim must be no');
  });

  it('requires trustless candidate burn derivation to be independently recomputable', () => {
    const missing = validTrustlessCandidateEvidenceRecord();
    delete missing.claims[0].trustlessBurnDerivation;

    const wrongBurnId = validTrustlessCandidateEvidenceRecord();
    wrongBurnId.claims[0].trustlessBurnDerivation.derivedBurnIdHex = '99'.repeat(32);

    const wrongKey = validTrustlessCandidateEvidenceRecord();
    wrongKey.claims[0].settlementIdentity.duplicatePreventionKeyHex = '88'.repeat(32);

    const oversizedIndex = validTrustlessCandidateEvidenceRecord();
    oversizedIndex.claims[0].trustlessBurnDerivation.sidechainLogIndex = 0x100000000;

    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(missing)).toContain(
      'claims[0].trustlessBurnDerivation must be an object',
    );
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(wrongBurnId)).toContain(
      'claims[0].trustlessBurnDerivation.derivedBurnIdHex must match sidechainIdHex, legacySidechainTxHash, and sidechainLogIndex',
    );
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(wrongKey)).toContain(
      'claims[0].trustlessBurnDerivation.derivedBurnIdHex must match settlementIdentity.duplicatePreventionKeyHex',
    );
    expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(oversizedIndex)).toContain(
      'claims[0].trustlessBurnDerivation.sidechainLogIndex must fit uint32',
    );
  });

  it('keeps trustless candidate records out of pre-broadcast approval evidence', () => {
    const record = validTrustlessCandidateEvidenceRecord();

    const errors = validateAggregateSettlementPrebroadcastEvidenceRecord(record);
    expect(errors).toContain(
      'aggregate settlement evidence record.evidenceKind: unsupported evidence field',
    );
    expect(errors).toContain(
      'aggregate settlement evidence record.contractCompatibility: unsupported evidence field',
    );
    expect(errors).toContain('command must be a non-empty string');
    expect(errors).toContain('transactionCheck must be an object');
    expect(errors).toContain('settlementShape must be an object');
  });

  it('rejects trustless candidate evidence that implies approval, submit, or transaction-check readiness', () => {
    const record = validTrustlessCandidateEvidenceRecord();
    record.command = 'submit';
    record.expectedTxId = '11'.repeat(32);
    record.approval = 'approved';
    record.broadcast = 'yes';
    record.transactionCheck = {
      endpoint: '/transactions/check',
      result: 'PASS',
      expectedTxId: '11'.repeat(32),
    };

    const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(record);
    expect(errors).toContain(
      'trustless settlement candidate evidence record.command: unsupported evidence field',
    );
    expect(errors).toContain(
      'trustless settlement candidate evidence record.expectedTxId: unsupported evidence field',
    );
    expect(errors).toContain(
      'trustless settlement candidate evidence record.approval: unsupported evidence field',
    );
    expect(errors).toContain(
      'trustless settlement candidate evidence record.transactionCheck: unsupported evidence field',
    );
    expect(errors).toContain('broadcast must be no');
  });

  it('rejects malformed trustless candidate settlement identities and legacy duplicate-prevention keys', () => {
    const record = validTrustlessCandidateEvidenceRecord();
    record.claimCount = 2;
    record.contractCompatibility = 'legacy-aggregate-v1';
    record.claims = [
      {
        ...record.claims[0],
        settlementIdentity: {
          ...record.claims[0].settlementIdentity,
          source: 'legacy-aggregate-root',
          duplicatePreventionKeyHex: '22'.repeat(32),
          bridgeEventRootHex: 'aa',
          recipientErgoTreeHashHex: 'bb',
          amountNanoErg: '18446744073709551616',
          assetIdHex: 'cc',
        },
      },
      {
        ...record.claims[0],
        settlementIdentity: {
          ...record.claims[0].settlementIdentity,
          duplicatePreventionKeyHex: '22'.repeat(32),
        },
      },
    ];

    const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(record);
    expect(errors).toContain('contractCompatibility must be candidate-only-trustless-v2-required');
    expect(errors).toContain('claims[0].settlementIdentity.source must be trustless-burn-leaf');
    expect(errors).toContain(
      'claims[0].settlementIdentity.duplicatePreventionKeyHex must not equal legacySidechainTxHash',
    );
    expect(errors).toContain('claims[0].settlementIdentity.bridgeEventRootHex must be 32-byte hex');
    expect(errors).toContain('claims[0].settlementIdentity.recipientErgoTreeHashHex must be 32-byte hex');
    expect(errors).toContain('claims[0].settlementIdentity.assetIdHex must be 32-byte hex');
    expect(errors).toContain('claims[0].settlementIdentity.amountNanoErg must be a positive uint64 decimal string');
    expect(errors).toContain('claims[1].settlementIdentity.duplicatePreventionKeyHex must be unique');
  });

  it('rejects trustless candidate identities without recipient and amount bindings', () => {
    const record = validTrustlessCandidateEvidenceRecord();
    delete record.claims[0].settlementIdentity.recipientErgoTreeHashHex;
    delete record.claims[0].settlementIdentity.amountNanoErg;

    const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(record);
    expect(errors).toContain('claims[0].settlementIdentity.recipientErgoTreeHashHex must be 32-byte hex');
    expect(errors).toContain('claims[0].settlementIdentity.amountNanoErg must be a positive uint64 decimal string');
  });

  it('accepts relative JSON evidence output paths inside the bridge repository', () => {
    expect(validateAggregateSettlementEvidenceJsonPath('../evidence/testnet-prebroadcast/check.json')).toEqual([]);
    expect(validateAggregateSettlementEvidenceJsonPath('tmp/prebroadcast/check-output.json')).toEqual([]);
    const paddedResult = resolveAggregateSettlementEvidenceJsonPath('  ../evidence/testnet-prebroadcast/check.json  ');

    expect(paddedResult.errors).toEqual([]);
    expect(paddedResult.label).toBe('../evidence/testnet-prebroadcast/check.json');
    expect(paddedResult.path?.replace(/\\/g, '/')).toMatch(/evidence\/testnet-prebroadcast\/check\.json$/);
    expect(formatAggregateSettlementEvidenceJsonPathLabel('../evidence/testnet-prebroadcast/check.json')).toBe(
      '../evidence/testnet-prebroadcast/check.json',
    );
  });

  it('rejects claim-escalating aggregate evidence JSON target names', () => {
    expect(validateAggregateSettlementEvidenceJsonPath('../evidence/testnet-prebroadcast/production-ready-check.json')).toContain(
      '../evidence/testnet-prebroadcast/production-ready-check.json: aggregate evidence JSON target must not use production claim wording',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../evidence/testnet-prebroadcast/mainnet-production-check.json')).toContain(
      '../evidence/testnet-prebroadcast/mainnet-production-check.json: aggregate evidence JSON target must not use production claim wording',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../evidence/testnet-prebroadcast/testnet-production-candidate-check.json')).toContain(
      '../evidence/testnet-prebroadcast/testnet-production-candidate-check.json: aggregate evidence JSON target must not use production claim wording',
    );
  });

  it('rejects unsafe aggregate evidence JSON output paths without leaking sensitive target details', () => {
    const envFileName = '.' + 'env';
    const secretDlogFileName = `secrets.${'dlog'}`;
    const localFileUrl = 'file:' + '///' + ['C:', 'tmp', 'evidence', 'check.json'].join('/');

    const windowsAbsoluteErrors = validateAggregateSettlementEvidenceJsonPath(
      ['C:', 'tmp', 'evidence', 'check.json'].join('\\'),
    ).join('\n');
    expect(windowsAbsoluteErrors).toContain(
      '<blocked evidence JSON target>: refusing to write local absolute evidence JSON paths',
    );
    expect(windowsAbsoluteErrors).not.toContain('check.json');
    const posixAbsoluteErrors = validateAggregateSettlementEvidenceJsonPath('/tmp/evidence/check.json').join('\n');
    expect(posixAbsoluteErrors).toContain(
      '<blocked evidence JSON target>: refusing to write local absolute evidence JSON paths',
    );
    expect(posixAbsoluteErrors).not.toContain('check.json');
    const localFileUrlErrors = validateAggregateSettlementEvidenceJsonPath(localFileUrl).join('\n');
    expect(localFileUrlErrors).toContain(
      '<blocked evidence JSON target>: refusing to write local file URLs as evidence JSON',
    );
    expect(localFileUrlErrors).not.toContain('check.json');
    expect(validateAggregateSettlementEvidenceJsonPath('https://example.invalid/evidence/check.json')).toContain(
      '<blocked evidence JSON target>: refusing to write URI evidence JSON targets',
    );
    const paddedUriErrors = validateAggregateSettlementEvidenceJsonPath(
      '  https://example.invalid/evidence/check.json?token=secret  ',
    );
    expect(paddedUriErrors).toContain('<blocked evidence JSON target>: refusing to write URI evidence JSON targets');
    expect(paddedUriErrors.join('\n')).not.toContain('token=secret');
    expect(paddedUriErrors.join('\n')).not.toContain('example.invalid');
    expect(validateAggregateSettlementEvidenceJsonPath('artifact://prebroadcast/check.json')).toContain(
      '<blocked evidence JSON target>: refusing to write URI evidence JSON targets',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../../outside/check.json')).toContain(
      '<blocked evidence JSON target>: refusing to write evidence JSON paths outside the bridge repository',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../evidence/check.md')).toContain(
      '../evidence/check.md: aggregate evidence output must be a JSON file',
    );
    expect(validateAggregateSettlementEvidenceJsonPath(`../${envFileName}.json`)).toContain(
      '<blocked evidence JSON target>: refusing to write environment files as evidence JSON',
    );
    expect(validateAggregateSettlementEvidenceJsonPath(`../evidence/${secretDlogFileName}.json`)).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../runtime/bridge-state.sqlite')).toContain(
      'bridge-state.sqlite: aggregate evidence output must be a JSON file',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../runtime/bridge-state.sqlite.json')).toContain(
      'bridge-state.sqlite.json: refusing to write runtime database files as evidence JSON',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../runtime/runtime-state/check.json')).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../runtime/deployed_state.json')).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../operator/mnemonic-check.json')).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );
    expect(validateAggregateSettlementEvidenceJsonPath('../operator/private-key-check.json')).toContain(
      '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
    );
    for (const target of [
      '../operator/signing-key-check.json',
      '../operator/api-key-check.json',
      '../operator/seed-phrase-check.json',
      '../evidence/sourceTarget=(.env)/check.json',
      '../evidence/sourceTarget=(runtime/bridge-state.sqlite)/check.json',
      '../evidence/sourceTarget=%28.env%29/check.json',
      '../evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/check.json',
    ]) {
      const errors = validateAggregateSettlementEvidenceJsonPath(target);
      expect(errors, target).toContain(
        '<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON',
      );
      expect(errors.join('\n'), target).not.toContain(target);
    }
    for (const target of [
      '../evidence/sourceTarget=%2Ftmp%2Faggregate-check.json',
      '../evidence/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Faggregate-check.json',
    ]) {
      const errors = validateAggregateSettlementEvidenceJsonPath(target);
      expect(errors, target).toContain(
        '<blocked evidence JSON target>: refusing to write local-only evidence JSON target references',
      );
      expect(errors.join('\n'), target).not.toContain(target);
    }
  });

  it('rejects aggregate evidence JSON paths through junctions outside the bridge repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'aggregate-evidence-json-path-'));
    const bridgeRoot = join(root, 'bridge');
    const workspaceRoot = join(bridgeRoot, 'relayer');
    const external = join(root, 'external');
    try {
      mkdirSync(join(bridgeRoot, 'evidence'), { recursive: true });
      mkdirSync(workspaceRoot, { recursive: true });
      mkdirSync(external, { recursive: true });
      try {
        symlinkSync(external, join(bridgeRoot, 'evidence', 'link-out'), 'junction');
      } catch {
        return;
      }

      const errors = validateAggregateSettlementEvidenceJsonPath(
        '../evidence/link-out/check.json',
        workspaceRoot,
        bridgeRoot,
      );
      const resolved = resolveAggregateSettlementEvidenceJsonPath(
        '../evidence/link-out/check.json',
        workspaceRoot,
        bridgeRoot,
      );

      expect(errors).toContain(
        '<blocked evidence JSON target>: refusing to write evidence JSON paths outside the bridge repository',
      );
      expect(errors.join('\n')).not.toContain('check.json');
      expect(resolved.path).toBeUndefined();
      expect(resolved.errors.join('\n')).not.toContain(external);
      expect(resolved.errors.join('\n')).not.toContain('check.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
