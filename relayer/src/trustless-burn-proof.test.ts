import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildTrustlessBurnCommitment,
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  validateTrustlessBurnInclusionProofEnvelope,
  verifyTrustlessBurnInclusionProof,
  verifyTrustlessBurnSettlementBinding,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  validateTrustlessBurnProofVector,
  validateTrustlessBurnProofVectorTarget,
  type TrustlessBurnProofVectorFile,
} from './trustless-burn-proof-vector.js';

const SIDECHAIN_ID = '11'.repeat(32);
const BLOCK_HASH = '22'.repeat(32);
const SIDECHAIN_TX_A = '55'.repeat(32);
const SIDECHAIN_TX_B = '66'.repeat(32);
const BURN_ID_A = '57182144540292d653cf0d5f3b1e1f347795d67f9dd7fa3d1d2e2fe420d06c3a';
const BURN_ID_B = '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f';
const RECIPIENT_A = '77'.repeat(32);
const RECIPIENT_B = '88'.repeat(32);
const ASSET_ERG = '00'.repeat(32);

function burn(overrides: Partial<TrustlessBurnLeafInput> = {}): TrustlessBurnLeafInput {
  return {
    sidechainIdHex: SIDECHAIN_ID,
    sidechainBlockHashHex: BLOCK_HASH,
    burnIdHex: BURN_ID_A,
    sidechainTxHashHex: SIDECHAIN_TX_A,
    eventIndex: 7,
    recipientErgoTreeHashHex: RECIPIENT_A,
    amountNanoErg: '1000000',
    assetIdHex: ASSET_ERG,
    ...overrides,
  };
}

function loadTrustlessBurnProofVector(
  fileName = 'trustless-burn-proof-v1.json',
): TrustlessBurnProofVectorFile {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'test-vectors', fileName), 'utf8'),
  ) as TrustlessBurnProofVectorFile;
}

describe('trustless burn proof core', () => {
  it('derives burn IDs from sidechain event identity', () => {
    expect(deriveTrustlessBurnIdHex({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: SIDECHAIN_TX_A,
      eventIndex: 7,
    })).toBe(BURN_ID_A);
    expect(() => encodeTrustlessBurnLeaf(burn({ burnIdHex: '33'.repeat(32) }))).toThrow(
      /burnId must equal derived sidechain event identity/,
    );
  });

  it('encodes bridge-native burn leaves with stable field bindings', () => {
    const leaf = encodeTrustlessBurnLeaf(burn());

    expect(leaf.sidechainIdHex).toBe(SIDECHAIN_ID);
    expect(leaf.burnIdHex).toBe(BURN_ID_A);
    expect(leaf.eventIndex).toBe(7);
    expect(leaf.amountNanoErg).toBe('1000000');
    expect(leaf.encodedLeafHex).toHaveLength(1 * 2 + 32 * 2 * 6 + 4 * 2 + 8 * 2);
    expect(leaf.leafHashHex).toBe('82675b060423fffa706bdff7954dc1a4e3899a1ea157fb0db50e1f6daa71e87d');
  });

  it('builds and verifies a Blake2b burn inclusion proof against bridgeEventRoot', () => {
    const leaves = [
      burn(),
      burn({
        burnIdHex: BURN_ID_B,
        sidechainTxHashHex: SIDECHAIN_TX_B,
        eventIndex: 8,
        recipientErgoTreeHashHex: RECIPIENT_B,
        amountNanoErg: '2000000',
      }),
    ];
    const commitment = buildTrustlessBurnCommitment(leaves);
    const proof = buildTrustlessBurnInclusionProof(leaves, BURN_ID_B);

    expect(commitment.bridgeEventRootHex).toBe('1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb');
    expect(proof.bridgeEventRootHex).toBe(commitment.bridgeEventRootHex);
    expect(proof.leafIndex).toBe(1);
    expect(proof.leafCount).toBe(2);
    expect(proof.proof).toHaveLength(1);
    expect(verifyTrustlessBurnInclusionProof({
      leaf: leaves[1],
      bridgeEventRootHex: proof.bridgeEventRootHex,
      proof: proof.proof,
    })).toBe(true);
    expect(validateTrustlessBurnInclusionProofEnvelope(proof)).toMatchObject({
      ok: true,
      errors: [],
      bridgeEventRootHex: proof.bridgeEventRootHex,
      leafHashHex: proof.leaf.leafHashHex,
    });
  });

  it('rejects inclusion proof envelopes with inconsistent index, count, or leaf hash metadata', () => {
    const leaves = [
      burn(),
      burn({
        burnIdHex: BURN_ID_B,
        sidechainTxHashHex: SIDECHAIN_TX_B,
        eventIndex: 8,
        recipientErgoTreeHashHex: RECIPIENT_B,
        amountNanoErg: '2000000',
      }),
    ];
    const proof = buildTrustlessBurnInclusionProof(leaves, BURN_ID_B);
    const result = validateTrustlessBurnInclusionProofEnvelope({
      ...proof,
      leaf: {
        ...proof.leaf,
        leafHashHex: 'aa'.repeat(32),
      },
      leafIndex: 0,
      leafCount: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('proof leaf leafHashHex must match canonical leaf hash');
    expect(result.errors).toContain('proof length must match leafCount depth: expected 2, got 1');
    expect(result.errors).toContain('proof step 0 side must match leafIndex path');
  });

  it('rejects noncanonical odd-leaf sibling substitution', () => {
    const sidechainTxC = '67'.repeat(32);
    const burnIdC = deriveTrustlessBurnIdHex({
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: sidechainTxC,
      eventIndex: 9,
    });
    const leaves = [
      burn(),
      burn({
        burnIdHex: BURN_ID_B,
        sidechainTxHashHex: SIDECHAIN_TX_B,
        eventIndex: 8,
      }),
      burn({
        burnIdHex: burnIdC,
        sidechainTxHashHex: sidechainTxC,
        eventIndex: 9,
      }),
    ];
    const proof = buildTrustlessBurnInclusionProof(leaves, burnIdC);
    expect(proof.leafIndex).toBe(2);
    expect(proof.leafCount).toBe(3);
    expect(proof.proof[0]).toEqual({
      side: 'right',
      hashHex: proof.leaf.leafHashHex,
    });

    const result = validateTrustlessBurnInclusionProofEnvelope({
      ...proof,
      proof: [
        { ...proof.proof[0], hashHex: 'aa'.repeat(32) },
        proof.proof[1],
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'proof step 0 unpaired right sibling must duplicate the current hash',
    );
  });

  it('binds accepted proof fields to settlement payout and DUP key', () => {
    const leaves = [
      burn(),
      burn({
        burnIdHex: BURN_ID_B,
        sidechainTxHashHex: SIDECHAIN_TX_B,
        eventIndex: 8,
        recipientErgoTreeHashHex: RECIPIENT_B,
        amountNanoErg: '2000000',
      }),
    ];
    const proof = buildTrustlessBurnInclusionProof(leaves, BURN_ID_A);
    const result = verifyTrustlessBurnSettlementBinding({
      leaf: leaves[0],
      bridgeEventRootHex: proof.bridgeEventRootHex,
      proof: proof.proof,
      duplicatePreventionKeyHex: BURN_ID_A,
      recipientErgoTreeHashHex: RECIPIENT_A,
      amountNanoErg: '1000000',
      assetIdHex: ASSET_ERG,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.burnIdHex).toBe(BURN_ID_A);
  });

  it('rejects mismatched recipient, amount, duplicate-prevention key, and root', () => {
    const leaves = [burn(), burn({ burnIdHex: BURN_ID_B, sidechainTxHashHex: SIDECHAIN_TX_B, eventIndex: 8 })];
    const proof = buildTrustlessBurnInclusionProof(leaves, BURN_ID_A);
    const result = verifyTrustlessBurnSettlementBinding({
      leaf: leaves[0],
      bridgeEventRootHex: 'aa'.repeat(32),
      proof: proof.proof,
      duplicatePreventionKeyHex: BURN_ID_B,
      recipientErgoTreeHashHex: RECIPIENT_B,
      amountNanoErg: '2000000',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('duplicatePreventionKey must equal burnId');
    expect(result.errors).toContain('settlement recipient must equal proved recipientErgoTreeHash');
    expect(result.errors).toContain('settlement amount must equal proved amountNanoErg');
    expect(result.errors).toContain('burn inclusion proof must resolve to bridgeEventRoot');
  });

  it('rejects duplicate burn IDs in one commitment', () => {
    expect(() => buildTrustlessBurnCommitment([
      burn(),
      burn({ recipientErgoTreeHashHex: RECIPIENT_B }),
    ])).toThrow(/duplicate burnId/);
  });

  it('rejects malformed proof hashes and out-of-range leaf fields', () => {
    expect(() => encodeTrustlessBurnLeaf(burn({ eventIndex: 0x1_0000_0000 }))).toThrow(/eventIndex must fit in uint32/);
    expect(() => encodeTrustlessBurnLeaf(burn({ amountNanoErg: -1 }))).toThrow(/amountNanoErg must be a non-negative integer/);
    expect(() => encodeTrustlessBurnLeaf(burn({ amountNanoErg: 0 }))).toThrow(/positive Ergo Long range/);
    expect(() => encodeTrustlessBurnLeaf(burn({ amountNanoErg: Number.MAX_SAFE_INTEGER + 1 })))
      .toThrow(/amountNanoErg number input must be a safe integer/);
    expect(encodeTrustlessBurnLeaf(burn({ amountNanoErg: '9223372036854775807' })).amountNanoErg)
      .toBe('9223372036854775807');
    expect(() => encodeTrustlessBurnLeaf(burn({ amountNanoErg: '9223372036854775808' })))
      .toThrow(/positive Ergo Long range/);
    expect(() => verifyTrustlessBurnInclusionProof({
      leaf: burn(),
      bridgeEventRootHex: 'aa'.repeat(32),
      proof: [{ side: 'right', hashHex: 'bb' }],
    })).toThrow(/proof hash must be 32 bytes/);
  });

  it('validates the checked-in local trustless burn proof vector', () => {
    const vector = loadTrustlessBurnProofVector();
    const result = validateTrustlessBurnProofVector(vector);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.bridgeEventRootHex).toBe(vector.expected.bridgeEventRootHex);
    expect(result.leafHashHex).toBe(vector.expected.leafHashHex);
  });

  it('validates the multi-leaf local proof vector used for evidence-ready inclusion checks', () => {
    const vector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    const result = validateTrustlessBurnProofVector(vector);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(vector.expected.leafCount).toBeGreaterThan(1);
    expect(vector.expected.proof.length).toBeGreaterThan(0);
    expect(result.bridgeEventRootHex).toBe(vector.expected.bridgeEventRootHex);
    expect(result.leafHashHex).toBe(vector.expected.leafHashHex);
  });

  it('validates only non-empty local proof vectors as evidence-ready CLI targets', () => {
    const result = validateTrustlessBurnProofVectorTarget('test-vectors/trustless-burn-proof-v1-multi-leaf.json');

    expect(result.status).toBe('PASS');
    expect(result.message).toContain('Trustless burn proof vector PASS');
    expect(result.message).toContain('local proof-core evidence only, not Gate 5 closure');
    expect(result.leafCount).toBe(2);
    expect(result.proofNodeCount).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('blocks single-leaf proof vectors as evidence-ready CLI targets', () => {
    const result = validateTrustlessBurnProofVectorTarget('test-vectors/trustless-burn-proof-v1.json');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'expected.leafCount must be at least 2 for evidence-ready local inclusion proof validation',
    );
    expect(result.errors).toContain('expected.proof must include at least one structured inclusion proof node');
  });

  it('blocks unsafe proof vector CLI targets without leaking the requested path', () => {
    const result = validateTrustlessBurnProofVectorTarget('../operator/private-key-proof-vector.json');

    expect(result.status).toBe('BLOCKED');
    expect(result.label).toBe('<blocked JSON evidence target>');
    expect(result.errors.join('\n')).not.toContain('private-key-proof-vector.json');
  });

  it('prints local proof-core claim boundaries in proof-vector validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-proof-vector.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run trustless:proof-vector:validate');
    expect(result.stdout).toContain('read-only local proof-core evidence');
    expect(result.stdout).toContain('not Gate 5 closure');
    expect(result.stdout).toContain('not settlement readiness');
    expect(result.stdout).toContain('not broadcast authorization');
    expect(result.stdout).toContain('not production or testnet production-candidate claim support');
    expect(result.stdout).toContain('does not sign, approve, submit, publish, push, broadcast, or open runtime databases');
  });

  it('allows multiple proof-vector CLI targets when no JSON report is requested', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-proof-vector.ts',
        'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('trustless-burn-proof-v1-multi-leaf.json: Trustless burn proof vector PASS');
    expect(result.stdout).toContain('- bridgeEventRootHex: 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb');
  });

  it('refuses JSON proof-vector reports with multiple targets', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-proof-vector.ts',
        'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        '--json-out',
        '.tmp-trustless-proof-vector/report.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      '--json-out requires exactly one proof-vector target so Gate 5 can bind one report result to one embedded Local Proof Vector',
    );
    expect(result.stderr).toContain('Usage: npm run trustless:proof-vector:validate');
  });

  it('writes a structured proof-vector report for evidence capture', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-proof-vector-'));
    const reportTarget = `${basename(outputDir)}/report.json`;
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-trustless-burn-proof-vector.ts',
          'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
          '--json-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('- trustless burn proof-vector report written:');

      const report = JSON.parse(readFileSync(join(process.cwd(), reportTarget), 'utf8'));
      expect(report).toMatchObject({
        schemaVersion: 1,
        command: 'trustless:proof-vector:validate',
        status: 'PASS',
        boundary: {
          readOnly: true,
          localProofCoreOnly: true,
          gate5Closure: false,
          settlementReadiness: false,
          broadcastAuthorization: false,
          productionClaimSupport: false,
          testnetProductionCandidateClaimSupport: false,
        },
      });
      expect(report.reports[0]).toMatchObject({
        status: 'PASS',
        leafCount: 2,
        proofNodeCount: 1,
        bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
        negativeCaseResults: expect.arrayContaining([
          {
            name: 'wrong-sidechain-id',
            status: 'REJECTED',
            expectedErrors: ['burnId must equal derived sidechain event identity'],
            observedErrors: ['burnId must equal derived sidechain event identity'],
          },
        ]),
      });
      expect(report.reports[0].negativeCaseResults).toHaveLength(8);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe proof-vector report output targets before validation', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-proof-vector.ts',
        'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        '--json-out',
        '../operator/private-key-proof-vector-report.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain('private-key-proof-vector-report.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('rejects local proof vectors that make claims or drift from proof-core output', () => {
    const claimingVector = loadTrustlessBurnProofVector();
    claimingVector.gate5Claim = true;
    expect(validateTrustlessBurnProofVector(claimingVector).errors).toContain(
      'gate5Claim must remain false for local proof vectors',
    );

    const rootDriftVector = loadTrustlessBurnProofVector();
    rootDriftVector.expected.bridgeEventRootHex = 'aa'.repeat(32);
    expect(validateTrustlessBurnProofVector(rootDriftVector).errors).toContain(
      'expected.bridgeEventRootHex must match proof-core output',
    );

    const indexDriftVector = loadTrustlessBurnProofVector();
    indexDriftVector.expected.leafIndex = 1;
    expect(validateTrustlessBurnProofVector(indexDriftVector).errors).toContain(
      'expected.inclusionProof: leafIndex must be less than leafCount',
    );
  });

  it('requires concrete legacy aggregate root metadata when compat is declared', () => {
    const missingLegacyRootVector = loadTrustlessBurnProofVector();
    missingLegacyRootVector.compat = {
      liveAggregateSettlementStillUsesLegacyRoot: true,
    };

    expect(validateTrustlessBurnProofVector(missingLegacyRootVector).errors).toContain(
      'compat.legacyAggregateRootHex must be a concrete 32-byte legacy aggregate root while aggregate settlement still uses legacy root',
    );
  });

  it('requires checked proof vectors to carry fail-closed local negative cases', () => {
    const omittedNegativeCasesVector = loadTrustlessBurnProofVector() as unknown as Record<string, unknown>;
    delete omittedNegativeCasesVector.negativeCases;
    expect(validateTrustlessBurnProofVector(omittedNegativeCasesVector as unknown as TrustlessBurnProofVectorFile).errors).toContain(
      'negativeCases must be an array of local negative proof cases',
    );

    const missingNegativeCasesVector = {
      ...loadTrustlessBurnProofVector(),
      negativeCases: [],
    } as TrustlessBurnProofVectorFile;

    expect(validateTrustlessBurnProofVector(missingNegativeCasesVector).errors).toContain(
      'negativeCases must include wrong-sidechain-id',
    );

    const unknownNegativeCaseVector = loadTrustlessBurnProofVector();
    unknownNegativeCaseVector.negativeCases = [
      ...unknownNegativeCaseVector.negativeCases,
      {
        ...unknownNegativeCaseVector.negativeCases[0],
        name: 'operator-attestation-placeholder',
      },
    ];
    expect(validateTrustlessBurnProofVector(unknownNegativeCaseVector).errors).toContain(
      'negativeCases[operator-attestation-placeholder] unknown negative case name',
    );

    const acceptingNegativeCaseVector = loadTrustlessBurnProofVector();
    acceptingNegativeCaseVector.negativeCases = acceptingNegativeCaseVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-amount'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            amountNanoErg: '1000000',
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(acceptingNegativeCaseVector).errors).toContain(
      'negativeCases[wrong-amount] must be rejected by proof-core settlement binding',
    );

    const unexpectedErrorVector = loadTrustlessBurnProofVector();
    unexpectedErrorVector.negativeCases = unexpectedErrorVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          expectedErrors: ['some unrelated rejection'],
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(unexpectedErrorVector).errors).toContain(
      'negativeCases[wrong-recipient] expected error not observed: some unrelated rejection',
    );

    const driftedExpectedErrorVector = loadTrustlessBurnProofVector();
    driftedExpectedErrorVector.negativeCases = driftedExpectedErrorVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            amountNanoErg: '2000000',
          },
          expectedErrors: ['settlement amount must equal proved amountNanoErg'],
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(driftedExpectedErrorVector).errors).toContain(
      'negativeCases[wrong-recipient].expectedErrors must contain exactly the required proof-core error: settlement recipient must equal proved recipientErgoTreeHash',
    );

    const extraObservedErrorVector = loadTrustlessBurnProofVector();
    extraObservedErrorVector.negativeCases = extraObservedErrorVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            amountNanoErg: '2000000',
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(extraObservedErrorVector).errors).toContain(
      'negativeCases[wrong-recipient] observed unexpected proof-core error: settlement amount must equal proved amountNanoErg',
    );

    const malformedExpectedErrorVector = loadTrustlessBurnProofVector();
    malformedExpectedErrorVector.negativeCases = malformedExpectedErrorVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          expectedErrors: [
            'settlement recipient must equal proved recipientErgoTreeHash',
            { productionReadyClaimSupport: 'yes' },
          ] as unknown as string[],
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(malformedExpectedErrorVector).errors).toContain(
      'negativeCases[wrong-recipient].expectedErrors[1] must be a non-empty proof-core error string',
    );
  });

  it('rejects unexpected fields in checked proof-vector inputs', () => {
    const vector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json') as unknown as Record<string, any>;
    vector.metadata = { reviewerNote: 'not part of the proof-vector schema' };
    vector.leaves[0].operatorNote = 'not part of the burn leaf';
    vector.expected.reviewerNote = 'not part of expected proof output';
    vector.expected.proof[0].operatorNote = 'not part of the proof step';
    vector.expected.settlementBinding.reviewerNote = 'not part of settlement binding';
    vector.negativeCases = vector.negativeCases.map((negativeCase: Record<string, any>) =>
      negativeCase.name === 'wrong-sidechain-id'
        ? {
          ...negativeCase,
          metadata: { releaseClaim: 'not part of the negative case' },
          leaf: {
            ...negativeCase.leaf,
            operatorNote: 'not part of negative leaf override',
          },
          settlementBinding: {
            ...negativeCase.settlementBinding,
            reviewerNote: 'not part of negative settlement binding',
          },
        }
        : negativeCase.name === 'malformed-inclusion-path'
          ? {
            ...negativeCase,
            settlementBinding: {
              ...negativeCase.settlementBinding,
              proof: [
                {
                  ...negativeCase.settlementBinding.proof[0],
                  operatorNote: 'not part of the negative proof step',
                },
              ],
            },
          }
        : negativeCase,
    );

    const errors = validateTrustlessBurnProofVector(vector as unknown as TrustlessBurnProofVectorFile).errors;
    expect(errors).toContain('unexpected field metadata is not allowed in proof-vector input');
    expect(errors).toContain('leaves[0] unexpected field operatorNote is not allowed in proof-vector input');
    expect(errors).toContain('expected unexpected field reviewerNote is not allowed in proof-vector input');
    expect(errors).toContain('expected.proof[0] unexpected field operatorNote is not allowed in proof-vector input');
    expect(errors).toContain(
      'expected.settlementBinding unexpected field reviewerNote is not allowed in proof-vector input',
    );
    expect(errors).toContain('negativeCases[wrong-sidechain-id] unexpected field metadata is not allowed in proof-vector input');
    expect(errors).toContain(
      'negativeCases[wrong-sidechain-id].leaf unexpected field operatorNote is not allowed in proof-vector input',
    );
    expect(errors).toContain(
      'negativeCases[wrong-sidechain-id].settlementBinding unexpected field reviewerNote is not allowed in proof-vector input',
    );
    expect(errors).toContain(
      'negativeCases[malformed-inclusion-path].settlementBinding.proof[0] unexpected field operatorNote is not allowed in proof-vector input',
    );
  });

  it('requires checked negative proof-case proof overrides to use structured proof steps', () => {
    const nonArrayProofOverrideVector = loadTrustlessBurnProofVector();
    nonArrayProofOverrideVector.negativeCases = nonArrayProofOverrideVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: 'not-an-array' as unknown as typeof negativeCase.settlementBinding.proof,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(nonArrayProofOverrideVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].settlementBinding.proof must be an array when provided',
    );

    const emptyProofOverrideVector = loadTrustlessBurnProofVector();
    emptyProofOverrideVector.negativeCases = emptyProofOverrideVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: [],
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(emptyProofOverrideVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].settlementBinding.proof must include at least one structured proof step when provided',
    );

    const nonObjectProofStepVector = loadTrustlessBurnProofVector();
    nonObjectProofStepVector.negativeCases = nonObjectProofStepVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: ['not-a-proof-step'] as unknown as typeof negativeCase.settlementBinding.proof,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(nonObjectProofStepVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].settlementBinding.proof[0] must be an object with side and hashHex',
    );

    const omittedHashVector = loadTrustlessBurnProofVector();
    omittedHashVector.negativeCases = omittedHashVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: [{ side: 'right' }] as unknown as typeof negativeCase.settlementBinding.proof,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(omittedHashVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].settlementBinding.proof[0].hashHex must be a 32-byte hex string',
    );

    const invalidSideVector = loadTrustlessBurnProofVector();
    invalidSideVector.negativeCases = invalidSideVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: [{ side: 'center', hashHex: 'a'.repeat(64) }] as unknown as typeof negativeCase.settlementBinding.proof,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(invalidSideVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].settlementBinding.proof[0].side must be left or right',
    );
  });

  it('requires wrong bridgeEventRoot cases to mutate the root only', () => {
    const proofDriftRootVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    proofDriftRootVector.negativeCases = proofDriftRootVector.negativeCases.map(negativeCase => {
      if (negativeCase.name !== 'wrong-bridge-event-root') return negativeCase;
      const { bridgeEventRootHex: _bridgeEventRootHex, ...settlementBinding } = negativeCase.settlementBinding;
      return {
        ...negativeCase,
        settlementBinding: {
          ...settlementBinding,
          proof: [{ side: 'right', hashHex: 'a'.repeat(64) }],
        },
      };
    });

    const errors = validateTrustlessBurnProofVector(proofDriftRootVector).errors;
    expect(errors).toContain(
      'negativeCases[wrong-bridge-event-root].settlementBinding.bridgeEventRootHex must provide the wrong bridgeEventRoot override',
    );
    expect(errors).toContain(
      'negativeCases[wrong-bridge-event-root].settlementBinding.proof must not override the proof path; mutate bridgeEventRootHex instead',
    );
  });

  it('requires malformed inclusion path cases to mutate the proof path only', () => {
    const missingMalformedProofVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    missingMalformedProofVector.negativeCases = missingMalformedProofVector.negativeCases.map(negativeCase => {
      if (negativeCase.name !== 'malformed-inclusion-path') return negativeCase;
      const { proof: _proof, ...settlementBinding } = negativeCase.settlementBinding;
      return {
        ...negativeCase,
        settlementBinding,
      };
    });
    expect(validateTrustlessBurnProofVector(missingMalformedProofVector).errors).toContain(
      'negativeCases[malformed-inclusion-path].settlementBinding.proof must provide the malformed inclusion path override',
    );

    const sameProofVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    sameProofVector.negativeCases = sameProofVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'malformed-inclusion-path'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: sameProofVector.expected.proof,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(sameProofVector).errors).toContain(
      'negativeCases[malformed-inclusion-path].settlementBinding.proof must differ from the positive proof path',
    );

    const rootOverrideVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    rootOverrideVector.negativeCases = rootOverrideVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'malformed-inclusion-path'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            bridgeEventRootHex: 'a'.repeat(64),
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(rootOverrideVector).errors).toContain(
      'negativeCases[malformed-inclusion-path].settlementBinding.bridgeEventRootHex must not override bridgeEventRoot; mutate settlementBinding.proof instead',
    );
  });

  it('rejects stray proof and root overrides on ordinary negative cases', () => {
    const proofOverrideVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    proofOverrideVector.negativeCases = proofOverrideVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: proofOverrideVector.expected.proof,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(proofOverrideVector).errors).toContain(
      'negativeCases[wrong-recipient].settlementBinding.proof must not override the proof path for this negative case',
    );

    const rootOverrideVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    rootOverrideVector.negativeCases = rootOverrideVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-amount'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            bridgeEventRootHex: rootOverrideVector.expected.bridgeEventRootHex,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(rootOverrideVector).errors).toContain(
      'negativeCases[wrong-amount].settlementBinding.bridgeEventRootHex must not override bridgeEventRoot for this negative case',
    );
  });

  it('requires leaf overrides to stay scoped to their negative case field', () => {
    const missingLeafVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    missingLeafVector.negativeCases = missingLeafVector.negativeCases.map(negativeCase => {
      if (negativeCase.name !== 'wrong-sidechain-id') return negativeCase;
      const { leaf: _leaf, ...withoutLeaf } = negativeCase;
      return withoutLeaf;
    });
    expect(validateTrustlessBurnProofVector(missingLeafVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].leaf must provide the sidechainIdHex override',
    );

    const extraLeafDriftVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    extraLeafDriftVector.negativeCases = extraLeafDriftVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id' && negativeCase.leaf
        ? {
          ...negativeCase,
          leaf: {
            ...negativeCase.leaf,
            eventIndex: 9,
          },
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(extraLeafDriftVector).errors).toContain(
      'negativeCases[wrong-sidechain-id].leaf.eventIndex must match the positive leaf for this negative case',
    );

    const strayLeafVector = loadTrustlessBurnProofVector('trustless-burn-proof-v1-multi-leaf.json');
    strayLeafVector.negativeCases = strayLeafVector.negativeCases.map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          leaf: strayLeafVector.leaves[strayLeafVector.expected.leafIndex],
        }
        : negativeCase,
    );
    expect(validateTrustlessBurnProofVector(strayLeafVector).errors).toContain(
      'negativeCases[wrong-recipient].leaf must not override the positive leaf for this negative case',
    );
  });
});
