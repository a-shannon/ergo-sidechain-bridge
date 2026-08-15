import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildTrustlessBurnProofBundle,
  buildTrustlessTrackerValueHex,
  deriveTrustlessSpvTrackerKeyHex,
  evaluateTrustlessBurnContractAcceptance,
  type TrustlessBurnContractAcceptanceInput,
} from './trustless-burn-contract-acceptance.js';
import type { TrustlessBurnLeafInput, TrustlessBurnMerkleProofStep } from './trustless-burn-proof.js';

interface ProofVector {
  leaves: TrustlessBurnLeafInput[];
  targetBurnIdHex: string;
  expected: {
    bridgeEventRootHex: string;
    proof: TrustlessBurnMerkleProofStep[];
    settlementBinding: {
      recipientErgoTreeHex: string;
      amountNanoErg: string;
    };
  };
}

const SIDECHAIN_HEIGHT = 12345;
const ERGO_ANCHOR_HEIGHT = 987654;
const CURRENT_ERGO_HEIGHT = ERGO_ANCHOR_HEIGHT + 10;

function readVector(): ProofVector {
  return JSON.parse(readFileSync(
    join(process.cwd(), 'test-vectors', 'trustless-burn-proof-v1-multi-leaf-recipient-tree.json'),
    'utf8',
  )) as ProofVector;
}

function acceptanceInput(overrides: Partial<TrustlessBurnContractAcceptanceInput> = {}): TrustlessBurnContractAcceptanceInput {
  const vector = readVector();
  const leaf = vector.leaves.find(candidate => candidate.burnIdHex === vector.targetBurnIdHex);
  if (!leaf) throw new Error('test vector target burn leaf is missing');
  const proofBundleHex = buildTrustlessBurnProofBundle({
    sidechainHeight: SIDECHAIN_HEIGHT,
    proof: vector.expected.proof,
  });
  const trackerKeyHex = deriveTrustlessSpvTrackerKeyHex({
    sidechainIdHex: leaf.sidechainIdHex,
    sidechainHeight: SIDECHAIN_HEIGHT,
    sidechainBlockHashHex: leaf.sidechainBlockHashHex,
  });
  const trackerValueHex = buildTrustlessTrackerValueHex({
    bridgeEventRootHex: vector.expected.bridgeEventRootHex,
    ergoAnchorHeight: ERGO_ANCHOR_HEIGHT,
  });

  return {
    leaf,
    bridgeEventRootHex: vector.expected.bridgeEventRootHex,
    proofBundleHex,
    trackerKeyHex,
    trackerValueHex,
    recipientErgoTreeHex: vector.expected.settlementBinding.recipientErgoTreeHex,
    payoutValueNanoErg: vector.expected.settlementBinding.amountNanoErg,
    currentErgoHeight: CURRENT_ERGO_HEIGHT,
    ...overrides,
  };
}

describe('trustless burn contract-equivalent acceptance', () => {
  it('accepts the checked-in multi-leaf proof vector under the V2 contract predicates', () => {
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput());

    expect(result.accepted).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checks).toEqual({
      trackerNftOk: true,
      dupNftOk: true,
      trackerValueDefined: true,
      finalityOk: true,
      leafFieldsOk: true,
      eventRootOk: true,
      notSpent: true,
      dupUpdated: true,
      payoutOk: true,
      shapeOk: true,
    });
    expect(result.derived.burnProofNodeCount).toBe(1);
    expect(result.derived.dupLookupProofLength).toBe(0);
    expect(result.derived.ergoAnchorHeight).toBe(ERGO_ANCHOR_HEIGHT);
  });

  it('rejects a tracker event root that does not match the burn inclusion proof', () => {
    const trackerValueHex = buildTrustlessTrackerValueHex({
      bridgeEventRootHex: 'aa'.repeat(32),
      ergoAnchorHeight: ERGO_ANCHOR_HEIGHT,
    });
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({ trackerValueHex }));

    expect(result.accepted).toBe(false);
    expect(result.checks.eventRootOk).toBe(false);
    expect(result.errors).toContain('burn inclusion proof must resolve to bridgeEventRoot');
  });

  it('rejects a malformed burn inclusion path in the proof bundle', () => {
    const proofBundleHex = buildTrustlessBurnProofBundle({
      sidechainHeight: SIDECHAIN_HEIGHT,
      proof: [{ side: 'right', hashHex: 'aa'.repeat(32) }],
    });
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({ proofBundleHex }));

    expect(result.accepted).toBe(false);
    expect(result.checks.eventRootOk).toBe(false);
    expect(result.errors).toContain('burn inclusion proof must resolve to bridgeEventRoot');
  });

  it('rejects stale Ergo anchors before proof acceptance can pass', () => {
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({
      currentErgoHeight: ERGO_ANCHOR_HEIGHT + 9,
    }));

    expect(result.accepted).toBe(false);
    expect(result.checks.finalityOk).toBe(false);
    expect(result.errors).toContain('Ergo anchor height must satisfy minimum confirmations');
  });

  it('rejects payout value drift from the proved burn amount', () => {
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({
      payoutValueNanoErg: '1999999',
    }));

    expect(result.accepted).toBe(false);
    expect(result.checks.payoutOk).toBe(false);
    expect(result.errors).toContain('payout value must equal proved amountNanoErg');
  });

  it('rejects recipient ErgoTree drift from the proved recipient hash', () => {
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({
      recipientErgoTreeHex: `0008cd02${'55'.repeat(32)}`,
    }));

    expect(result.accepted).toBe(false);
    expect(result.checks.leafFieldsOk).toBe(false);
    expect(result.errors).toContain('leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane');
  });

  it('rejects tracker keys that are not derived from the proved sidechain commitment identity', () => {
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({
      trackerKeyHex: 'bb'.repeat(32),
    }));

    expect(result.accepted).toBe(false);
    expect(result.checks.leafFieldsOk).toBe(false);
    expect(result.errors).toContain('leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane');
  });

  it('rejects already-spent DUP keys before accepting the burn proof', () => {
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({
      dupKeyAlreadySpent: true,
    }));

    expect(result.accepted).toBe(false);
    expect(result.checks.notSpent).toBe(false);
    expect(result.errors).toContain('DUP key must not already be spent');
  });

  it('rejects proof bundles with side bytes outside the contract encoding', () => {
    const valid = Buffer.from(acceptanceInput().proofBundleHex, 'hex');
    valid[24] = 2;
    const result = evaluateTrustlessBurnContractAcceptance(acceptanceInput({
      proofBundleHex: valid.toString('hex'),
    }));

    expect(result.accepted).toBe(false);
    expect(result.checks.shapeOk).toBe(false);
    expect(result.errors).toContain('burn proof side bytes must be 0 or 1');
    expect(result.errors).toContain('contract input shape must match trustless proof bundle constraints');
  });
});
