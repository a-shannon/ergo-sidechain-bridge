import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { basename, join } from 'path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  validateAggregateSettlementTrustlessCandidateEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import {
  buildTrustlessSettlementCandidateEvidenceFromProofVector,
  buildTrustlessSettlementCandidateEvidenceFromState,
  validateTrustlessSettlementCandidateBuildInput,
  writeTrustlessSettlementCandidateEvidence,
} from './trustless-settlement-candidate.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import type { TrustlessBurnProofVectorFile } from './trustless-burn-proof-vector.js';
import { deriveSpvTrackerKey, encodeSpvTrackerValue } from './spv-tracker.js';
import { StateTracker, type SpvTrackerHistoryEntry } from './state-tracker.js';

const sidechainIdHex = '11'.repeat(32);
const burnTxHash = '22'.repeat(32);
const recipientTreeHash = '33'.repeat(32);
const bridgeEventRootHex = '44'.repeat(32);
const sidechainHeaderHashHex = '55'.repeat(32);
const sidechainHeight = 1234n;
const eventIndex = 7;
const amountNanoErg = '1000000';

function withCandidateState(run: (input: {
  dbPath: string;
  relativeDbPath: string;
  duplicatePreventionKeyHex: string;
}) => void, options: { sidechainLogIndex?: number } = {}): void {
  const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-state-'));
  const dbPath = join(dir, 'state.sqlite');
  const relativeDbPath = join(basename(dir), 'state.sqlite');
  const requestedSidechainLogIndex = options.sidechainLogIndex ?? eventIndex;
  const sidechainLogIndex = requestedSidechainLogIndex > 0xffff_ffff
    ? eventIndex
    : requestedSidechainLogIndex;
  const duplicatePreventionKeyHex = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex: burnTxHash,
    eventIndex,
  });
  const trackerIdentity = {
    sidechainIdHex,
    sidechainHeight,
    sidechainHeaderHashHex,
    bridgeEventRootHex,
    ergoAnchorHeight: 654321,
  };
  const spvEntry: SpvTrackerHistoryEntry = {
    keyHex: deriveSpvTrackerKey(trackerIdentity),
    valueHex: encodeSpvTrackerValue(trackerIdentity),
    sidechainHeight,
    sidechainHeaderHash: sidechainHeaderHashHex,
    bridgeEventRoot: bridgeEventRootHex,
    ergoAnchorHeight: trackerIdentity.ergoAnchorHeight,
  };
  const writable = new StateTracker(dbPath);
  try {
    writable.insertPegOut(
      burnTxHash,
      '0008cd02' + recipientTreeHash,
      BigInt(amountNanoErg),
      Number(sidechainHeight),
      {
        user: '0x0000000000000000000000000000000000000001',
        sidechainBlockHash: sidechainHeaderHashHex,
        sidechainLogIndex,
      },
    );
    writable.insertSpvTrackerEntry(spvEntry);
    writable.insertAvlKey('66'.repeat(32));
  } finally {
    writable.close();
  }
  if (requestedSidechainLogIndex !== sidechainLogIndex) {
    const legacy = new Database(dbPath);
    try {
      legacy.prepare(`UPDATE peg_out_events SET sidechain_log_index = ?`).run(
        requestedSidechainLogIndex,
      );
    } finally {
      legacy.close();
    }
  }

  try {
    run({ dbPath, relativeDbPath, duplicatePreventionKeyHex });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function loadProofVector(fileName = 'trustless-burn-proof-v1-multi-leaf.json'): TrustlessBurnProofVectorFile {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'test-vectors', fileName), 'utf8'),
  ) as TrustlessBurnProofVectorFile;
}

function withProofVectorCandidateState(run: (input: {
  dbPath: string;
  relativeDbPath: string;
  vector: TrustlessBurnProofVectorFile;
}) => void): void {
  const vector = loadProofVector();
  const leaf = vector.leaves[vector.expected.leafIndex];
  const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-vector-candidate-state-'));
  const dbPath = join(dir, 'state.sqlite');
  const relativeDbPath = join(basename(dir), 'state.sqlite');
  const trackerIdentity = {
    sidechainIdHex: leaf.sidechainIdHex,
    sidechainHeight,
    sidechainHeaderHashHex: leaf.sidechainBlockHashHex,
    bridgeEventRootHex: vector.expected.bridgeEventRootHex,
    ergoAnchorHeight: 654321,
  };
  const spvEntry: SpvTrackerHistoryEntry = {
    keyHex: deriveSpvTrackerKey(trackerIdentity),
    valueHex: encodeSpvTrackerValue(trackerIdentity),
    sidechainHeight,
    sidechainHeaderHash: trackerIdentity.sidechainHeaderHashHex,
    bridgeEventRoot: trackerIdentity.bridgeEventRootHex,
    ergoAnchorHeight: trackerIdentity.ergoAnchorHeight,
  };
  const writable = new StateTracker(dbPath);
  try {
    writable.insertPegOut(
      leaf.sidechainTxHashHex,
      '0008cd02' + leaf.recipientErgoTreeHashHex,
      BigInt(String(leaf.amountNanoErg)),
      Number(sidechainHeight),
      {
        user: '0x0000000000000000000000000000000000000001',
        sidechainBlockHash: leaf.sidechainBlockHashHex,
        sidechainLogIndex: Number(leaf.eventIndex),
      },
    );
    writable.insertSpvTrackerEntry(spvEntry);
  } finally {
    writable.close();
  }

  try {
    run({ dbPath, relativeDbPath, vector });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('trustless settlement candidate generator', () => {
  it('prints candidate-only claim boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-settlement-candidate.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('candidate-only evidence JSON');
    expect(result.stdout).toContain('not Gate 5 closure');
    expect(result.stdout).toContain('not pre-broadcast evidence');
    expect(result.stdout).toContain('not settlement readiness');
    expect(result.stdout).toContain('not claim authorization');
    expect(result.stdout).toContain('does not sign, check, approve, submit, reconcile, broadcast, or mutate runtime databases');
  });

  it('builds candidate-only evidence from read-only SQLite state', () => {
    withCandidateState(({ dbPath, duplicatePreventionKeyHex }) => {
      const result = buildTrustlessSettlementCandidateEvidenceFromState({
        stateDbPath: dbPath,
        burnTxHash,
        duplicatePreventionKeyHex,
        bridgeEventRootHex,
        recipientErgoTreeHashHex: recipientTreeHash,
        amountNanoErg,
        sidechainIdHex,
        generatedAt: '2026-05-18T01:12:19.066Z',
        label: 'Offline trustless candidate',
      });

      expect(result.summary).toEqual({
        stateTrackerMode: 'read-only',
        evidenceKind: 'trustless-settlement-candidate',
        broadcast: 'no',
        contractCompatibility: 'candidate-only-trustless-v2-required',
        gate5Closure: 'no',
        prebroadcastEvidence: 'no',
        settlementReadiness: 'no',
        claimAuthorization: 'no',
        claimCount: 1,
      });
      expect(result.evidence).toMatchObject({
        evidenceKind: 'trustless-settlement-candidate',
        broadcast: 'no',
        contractCompatibility: 'candidate-only-trustless-v2-required',
        claimCount: 1,
        claims: [{
          legacySidechainTxHash: burnTxHash,
          sidechainBlockHeight: Number(sidechainHeight),
          trustlessBurnDerivation: {
            sidechainIdHex,
            sidechainLogIndex: eventIndex,
            derivedBurnIdHex: duplicatePreventionKeyHex,
          },
          settlementIdentity: {
            source: 'trustless-burn-leaf',
            duplicatePreventionKeyHex,
            bridgeEventRootHex,
            recipientErgoTreeHashHex: recipientTreeHash,
            amountNanoErg,
          },
        }],
      });
      expect('sourceBindings' in result.evidence).toBe(false);
      expect('transactionCheck' in result.evidence).toBe(false);
      expect('expectedTxId' in result.evidence).toBe(false);
      expect('approval' in result.evidence).toBe(false);
      expect('command' in result.evidence).toBe(false);
      expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(result.evidence)).toEqual([]);
      expect(validateAggregateSettlementPrebroadcastEvidenceRecord(result.evidence)).toContain(
        'transactionCheck must be an object',
      );
    });
  });

  it('builds candidate-only evidence from a validated proof-vector target', () => {
    withProofVectorCandidateState(({ dbPath, vector }) => {
      const leaf = vector.leaves[vector.expected.leafIndex];
      const result = buildTrustlessSettlementCandidateEvidenceFromProofVector({
        stateDbPath: dbPath,
        proofVectorTarget: 'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        generatedAt: '2026-05-18T01:12:19.066Z',
        label: 'Proof-vector trustless candidate',
      });

      expect(result.summary).toMatchObject({
        stateTrackerMode: 'read-only',
        evidenceKind: 'trustless-settlement-candidate',
        broadcast: 'no',
        contractCompatibility: 'candidate-only-trustless-v2-required',
        gate5Closure: 'no',
        prebroadcastEvidence: 'no',
        settlementReadiness: 'no',
        claimAuthorization: 'no',
      });
      expect(result.evidence.claims[0]).toMatchObject({
        legacySidechainTxHash: leaf.sidechainTxHashHex,
        sidechainBlockHeight: Number(sidechainHeight),
        trustlessBurnDerivation: {
          sidechainIdHex: leaf.sidechainIdHex,
          sidechainLogIndex: leaf.eventIndex,
          derivedBurnIdHex: vector.expected.settlementBinding.duplicatePreventionKeyHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: vector.expected.settlementBinding.duplicatePreventionKeyHex,
          bridgeEventRootHex: vector.expected.bridgeEventRootHex,
          recipientErgoTreeHashHex: vector.expected.settlementBinding.recipientErgoTreeHashHex,
          amountNanoErg: String(vector.expected.settlementBinding.amountNanoErg),
          assetIdHex: vector.expected.settlementBinding.assetIdHex,
        },
      });
      expect(result.evidence.sourceBindings?.proofVector).toEqual({
        sourceKind: 'trustless-burn-proof-vector',
        target: 'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        targetBurnIdHex: vector.targetBurnIdHex,
        bridgeEventRootHex: vector.expected.bridgeEventRootHex,
        leafHashHex: vector.expected.leafHashHex,
        leafCount: vector.expected.leafCount,
        proofNodeCount: vector.expected.proof.length,
        gate5Claim: false,
        contractsChanged: false,
        boundary: 'local-proof-core-candidate-only',
      });
      expect(validateAggregateSettlementTrustlessCandidateEvidenceRecord(result.evidence)).toEqual([]);
      expect(validateAggregateSettlementPrebroadcastEvidenceRecord(result.evidence)).toContain(
        'transactionCheck must be an object',
      );
    });
  });

  it('blocks single-leaf proof vectors before candidate evidence generation', () => {
    withProofVectorCandidateState(({ dbPath }) => {
      expect(() => buildTrustlessSettlementCandidateEvidenceFromProofVector({
        stateDbPath: dbPath,
        proofVectorTarget: 'test-vectors/trustless-burn-proof-v1.json',
      })).toThrow('proof vector target must be evidence-ready');
    });
  });

  it('validates candidate input shape before state access', () => {
    expect(validateTrustlessSettlementCandidateBuildInput({
      burnTxHash: 'not-hex',
      duplicatePreventionKeyHex: 'aa',
      bridgeEventRootHex: bridgeEventRootHex.slice(2),
      recipientErgoTreeHashHex: recipientTreeHash,
      amountNanoErg: '0',
      assetIdHex: 'asset',
      sidechainIdHex,
      generatedAt: '2026-05-18',
      label: ' ',
    })).toEqual([
      'burnTxHash must be 32-byte hex',
      'duplicatePreventionKeyHex must be 32-byte hex',
      'bridgeEventRootHex must be 32-byte hex',
      'assetIdHex must be 32-byte hex',
      'amountNanoErg must be a positive uint64 decimal string',
      'generatedAt must be an ISO timestamp',
      'label must be a non-empty string when provided',
    ]);
  });

  it('rejects candidate amounts above uint64 before state access', () => {
    expect(validateTrustlessSettlementCandidateBuildInput({
      burnTxHash,
      duplicatePreventionKeyHex: deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: burnTxHash, eventIndex }),
      bridgeEventRootHex,
      recipientErgoTreeHashHex: recipientTreeHash,
      amountNanoErg: '18446744073709551616',
      sidechainIdHex,
    })).toEqual([
      'amountNanoErg must be a positive uint64 decimal string',
    ]);
  });

  it('accepts max uint64 candidate amounts as decimal strings', () => {
    expect(validateTrustlessSettlementCandidateBuildInput({
      burnTxHash,
      duplicatePreventionKeyHex: deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: burnTxHash, eventIndex }),
      bridgeEventRootHex,
      recipientErgoTreeHashHex: recipientTreeHash,
      amountNanoErg: '18446744073709551615',
      sidechainIdHex,
    })).toEqual([]);
  });

  it('writes candidate evidence JSON with exclusive creation', () => {
    withCandidateState(({ dbPath, duplicatePreventionKeyHex }) => {
      const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-candidate-out-'));
      try {
        const out = join(basename(dir), 'nested', 'candidate.json');
        const result = writeTrustlessSettlementCandidateEvidence({
          stateDbPath: dbPath,
          burnTxHash,
          duplicatePreventionKeyHex,
          bridgeEventRootHex,
          recipientErgoTreeHashHex: recipientTreeHash,
          amountNanoErg,
          sidechainIdHex,
          out,
        });

        const saved = JSON.parse(readFileSync(join(process.cwd(), out), 'utf8'));
        expect(saved).toEqual(result.evidence);
        expect(() => writeTrustlessSettlementCandidateEvidence({
          stateDbPath: dbPath,
          burnTxHash,
          duplicatePreventionKeyHex,
          bridgeEventRootHex,
          recipientErgoTreeHashHex: recipientTreeHash,
          amountNanoErg,
          sidechainIdHex,
          out,
        })).toThrow(/EEXIST|file already exists/i);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('writes CLI candidate evidence from a proof-vector target without retyped proof fields', () => {
    withProofVectorCandidateState(({ relativeDbPath, vector }) => {
      const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-vector-candidate-out-'));
      const out = join(basename(dir), 'candidate.json');
      try {
        const result = spawnSync(
          process.execPath,
          [
            'node_modules/tsx/dist/cli.mjs',
            'src/scripts/trustless-settlement-candidate.ts',
            '--proof-vector',
            'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
            '--state-db',
            relativeDbPath,
            '--out',
            out,
          ],
          {
            cwd: process.cwd(),
            encoding: 'utf8',
          },
        );

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('StateTracker mode: read-only');
        expect(result.stdout).toContain('contractCompatibility: candidate-only-trustless-v2-required');
        const saved = JSON.parse(readFileSync(join(process.cwd(), out), 'utf8'));
        expect(saved.claims[0].legacySidechainTxHash).toBe(
          vector.leaves[vector.expected.leafIndex].sidechainTxHashHex,
        );
        expect(saved.claims[0].settlementIdentity.bridgeEventRootHex).toBe(
          vector.expected.bridgeEventRootHex,
        );
        expect(saved.sourceBindings.proofVector.targetBurnIdHex).toBe(vector.targetBurnIdHex);
        expect(saved.sourceBindings.proofVector.leafHashHex).toBe(vector.expected.leafHashHex);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('rejects legacy or non-derived duplicate-prevention keys', () => {
    withCandidateState(({ dbPath }) => {
      expect(() => buildTrustlessSettlementCandidateEvidenceFromState({
        stateDbPath: dbPath,
        burnTxHash,
        duplicatePreventionKeyHex: burnTxHash,
        bridgeEventRootHex,
        recipientErgoTreeHashHex: recipientTreeHash,
        amountNanoErg,
        sidechainIdHex,
      })).toThrow('duplicatePreventionKeyHex must match derived trustless burnId');
      expect(() => buildTrustlessSettlementCandidateEvidenceFromState({
        stateDbPath: dbPath,
        burnTxHash,
        duplicatePreventionKeyHex: 'aa'.repeat(32),
        bridgeEventRootHex,
        recipientErgoTreeHashHex: recipientTreeHash,
        amountNanoErg,
        sidechainIdHex,
      })).toThrow('duplicatePreventionKeyHex must match derived trustless burnId');
    });
  });

  it('rejects read-only state sidechain log indexes outside the trustless burnId uint32 domain', () => {
    withCandidateState(({ dbPath, duplicatePreventionKeyHex }) => {
      expect(() => buildTrustlessSettlementCandidateEvidenceFromState({
        stateDbPath: dbPath,
        burnTxHash,
        duplicatePreventionKeyHex,
        bridgeEventRootHex,
        recipientErgoTreeHashHex: recipientTreeHash,
        amountNanoErg,
        sidechainIdHex,
      })).toThrow('sidechainLogIndex must fit uint32 to verify trustless burnId');
    }, { sidechainLogIndex: 0x1_0000_0000 });
  });

  it('rejects unsafe evidence output targets before writing', () => {
    withCandidateState(({ dbPath, duplicatePreventionKeyHex }) => {
      expect(() => writeTrustlessSettlementCandidateEvidence({
        stateDbPath: dbPath,
        burnTxHash,
        duplicatePreventionKeyHex,
        bridgeEventRootHex,
        recipientErgoTreeHashHex: recipientTreeHash,
        amountNanoErg,
        sidechainIdHex,
        out: '../operator/private-key-candidate.json',
      })).toThrow(/refusing to write secret-bearing or runtime-state paths as evidence JSON/);
    });
  });

  it('blocks unsafe CLI output targets before opening local state databases', () => {
    const outTarget = '../operator/private-key-candidate.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-settlement-candidate.ts',
        '--burn-tx',
        burnTxHash,
        '--duplicate-prevention-key',
        deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: burnTxHash, eventIndex }),
        '--bridge-event-root',
        bridgeEventRootHex,
        '--recipient-ergo-tree-hash',
        recipientTreeHash,
        '--amount-nanoerg',
        amountNanoErg,
        '--sidechain-id-hex',
        sidechainIdHex,
        '--state-db',
        'missing-trustless-candidate-state.sqlite',
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
    expect(result.stderr).toContain('<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain('missing-trustless-candidate-state.sqlite');
    expect(result.stderr).not.toContain('--state-db could not be read in read-only mode');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI output guard before state database resolution', () => {
    const source = readFileSync(join(process.cwd(), 'src/scripts/trustless-settlement-candidate.ts'), 'utf8');

    expect(source).toContain("import { resolveAggregateSettlementEvidenceJsonPath } from '../aggregate-settlement-evidence.js'");
    expect(source).toContain("const out = requireArg(args.out, '--out');");
    expect(source).toContain('validateCliOutputPath(out);');
    expect(source).toContain('const candidateInput = candidateInputFromArgs(args);');
    expect(source).toContain('validateCandidateInputShape(candidateInput);');
    expect(source).toContain('const stateDbPath = resolveCliStateDbPath(args.stateDbPath);');
    expect(source.indexOf("const out = requireArg(args.out, '--out');")).toBeLessThan(
      source.indexOf('const stateDbPath = resolveCliStateDbPath(args.stateDbPath);'),
    );
    expect(source.indexOf('validateCliOutputPath(out);')).toBeLessThan(
      source.indexOf('const stateDbPath = resolveCliStateDbPath(args.stateDbPath);'),
    );
    expect(source.indexOf('const candidateInput = candidateInputFromArgs(args);')).toBeLessThan(
      source.indexOf('const stateDbPath = resolveCliStateDbPath(args.stateDbPath);'),
    );
    expect(source.indexOf('validateCandidateInputShape(candidateInput);')).toBeLessThan(
      source.indexOf('const stateDbPath = resolveCliStateDbPath(args.stateDbPath);'),
    );
  });

  it('validates required CLI args before resolving state database targets', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-settlement-candidate.ts',
        '--duplicate-prevention-key',
        deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: burnTxHash, eventIndex }),
        '--bridge-event-root',
        bridgeEventRootHex,
        '--recipient-ergo-tree-hash',
        recipientTreeHash,
        '--amount-nanoerg',
        amountNanoErg,
        '--sidechain-id-hex',
        sidechainIdHex,
        '--state-db',
        'missing-trustless-candidate-state.sqlite',
        '--out',
        'tmp-trustless-candidate-out/candidate.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--burn-tx is required');
    expect(result.stderr).not.toContain('--state-db could not be read in read-only mode');
    expect(result.stderr).not.toContain('missing-trustless-candidate-state.sqlite');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('validates malformed CLI scalar args before resolving state database targets', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-settlement-candidate.ts',
        '--burn-tx',
        'not-hex',
        '--duplicate-prevention-key',
        deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: burnTxHash, eventIndex }),
        '--bridge-event-root',
        bridgeEventRootHex,
        '--recipient-ergo-tree-hash',
        recipientTreeHash,
        '--amount-nanoerg',
        amountNanoErg,
        '--sidechain-id-hex',
        sidechainIdHex,
        '--generated-at',
        '2026-05-18',
        '--state-db',
        'missing-trustless-candidate-state.sqlite',
        '--out',
        'tmp-trustless-candidate-out/candidate.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('burnTxHash must be 32-byte hex');
    expect(result.stderr).toContain('generatedAt must be an ISO timestamp');
    expect(result.stderr).not.toContain('--state-db could not be read in read-only mode');
    expect(result.stderr).not.toContain('missing-trustless-candidate-state.sqlite');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI state database targets before opening local files', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-settlement-candidate.ts',
        '--burn-tx',
        burnTxHash,
        '--duplicate-prevention-key',
        deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex: burnTxHash, eventIndex }),
        '--bridge-event-root',
        bridgeEventRootHex,
        '--recipient-ergo-tree-hash',
        recipientTreeHash,
        '--amount-nanoerg',
        amountNanoErg,
        '--sidechain-id-hex',
        sidechainIdHex,
        '--state-db',
        '../operator/private-key.sqlite',
        '--out',
        'tmp-trustless-candidate-out/candidate.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--state-db <blocked state-db target> must not target secret-bearing material');
    expect(result.stderr).not.toContain('../operator/private-key.sqlite');
    expect(result.stderr).not.toContain(process.cwd());
  });
});
