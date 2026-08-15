import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { validateTrustlessUnsignedTxEvidenceJsonTarget } from './aggregate-settlement-candidate-evidence-json.js';
import {
  buildLocalTrustlessSingleLeafUnsignedTxEvidence,
  createPublicTrustlessSingleLeafUnsignedTxFixture,
} from './trustless-unsigned-tx-local-evidence.js';
import type { TrustlessBurnInstanceBindingReport, TrustlessBurnInstanceIdentity } from './trustless-burn-instance-binding.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
} from './trustless-burn-proof.js';

describe('local trustless unsigned transaction evidence producer', () => {
  it('builds source-boundary evidence through the aggregate settlement service without signing', async () => {
    const result = await buildLocalTrustlessSingleLeafUnsignedTxEvidence({
      label: 'Unit local trustless unsigned tx evidence',
      generatedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(result.selectedAddresses).toEqual([result.fixture.deployed.mainChainAggregateUnlockTrustless?.address]);
    expect(result.evidence).toMatchObject({
      generatedAt: '2026-07-02T12:00:00.000Z',
      evidenceKind: 'trustless-single-leaf-unsigned-tx',
      label: 'Unit local trustless unsigned tx evidence',
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
      selectedBoxes: {
        trackerBoxId: result.fixture.trackerBox.boxId,
        aggregateDupBoxId: result.fixture.aggregateDupBox.boxId,
        unlockBoxId: result.fixture.unlockBox.boxId,
      },
      payoutBinding: {
        outputIndex: 2,
        recipientErgoTreeHex: result.fixture.pegOut.ergoRecipientAddress,
        recipientErgoTreeHashHex: result.fixture.settlementIdentity.recipientErgoTreeHashHex,
        amountNanoErg: result.fixture.pegOut.amount.toString(),
        recipientHashEqualsProvedBurn: true,
        amountEqualsProvedBurn: true,
      },
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
        signingPermitted: false,
        broadcastPermitted: false,
      },
      contractCompatibility: 'candidate-only-trustless-v2-required',
    });
    expect(result.evidence.contextExtensionGuard.offenders).toEqual([]);
    expect(result.prepared.eip12Tx.outputs[2]).toMatchObject({
      value: Number(result.fixture.pegOut.amount),
      ergoTree: result.fixture.pegOut.ergoRecipientAddress,
    });
    expect('transactionCheck' in result.evidence).toBe(false);
    expect('expectedTxId' in result.evidence).toBe(false);
  });

  it('builds source-boundary evidence for a compatible bound instance identity without signing', async () => {
    const identity = compatibleInstanceIdentity();
    const result = await buildLocalTrustlessSingleLeafUnsignedTxEvidence({
      label: 'Unit bound Gate 5 trustless unsigned tx evidence',
      generatedAt: '2026-07-06T12:00:00.000Z',
      instanceIdentity: identity,
    });
    const claim = result.evidence.claims[0];

    expect(result.fixture.accepted.sidechainIdHex).toBe(identity.sidechainIdHex);
    expect(result.fixture.accepted.sidechainHeaderHashHex).toBe(identity.sidechainBlockHashHex);
    expect(result.fixture.accepted.bridgeEventRootHex).toBe(identity.bridgeEventRootHex);
    expect(result.fixture.accepted.ergoAnchorHeight).toBe(identity.ergoAnchorHeight);
    expect(result.fixture.pegOut.sidechainTxHash).toBe(identity.sidechainTxHashHex);
    expect(result.fixture.pegOut.sidechainLogIndex).toBe(identity.eventIndex);
    expect(result.fixture.pegOut.amount).toBe(BigInt(identity.amountNanoErg));
    expect(claim.legacySidechainTxHash).toBe(identity.sidechainTxHashHex);
    expect(claim.trustlessBurnDerivation.sidechainIdHex).toBe(identity.sidechainIdHex);
    expect(claim.trustlessBurnDerivation.sidechainLogIndex).toBe(identity.eventIndex);
    expect(claim.trustlessBurnDerivation.derivedBurnIdHex).toBe(identity.burnIdHex);
    expect(claim.settlementIdentity).toMatchObject({
      duplicatePreventionKeyHex: identity.duplicatePreventionKeyHex,
      bridgeEventRootHex: identity.bridgeEventRootHex,
      recipientErgoTreeHashHex: identity.recipientErgoTreeHashHex,
      amountNanoErg: identity.amountNanoErg,
      assetIdHex: identity.assetIdHex,
    });
    expect(result.evidence.boundary).toMatchObject({
      transactionCheck: 'no',
      expectedTxId: 'no',
      signing: 'no',
      submit: 'no',
      gate5Closure: 'no',
    });
  });

  it('rejects a multi-leaf Gate 5 instance without a recipient ErgoTree proof preimage', async () => {
    await expect(buildLocalTrustlessSingleLeafUnsignedTxEvidence({
      label: 'Unit bound Gate 5 trustless unsigned tx evidence',
      generatedAt: '2026-07-06T12:00:00.000Z',
      instanceIdentity: multiLeafGate5InstanceIdentity(),
    })).rejects.toThrow('instance recipientErgoTreeHex must hash to recipientErgoTreeHashHex');
  });

  it('builds source-boundary evidence for a one-node multi-leaf instance with a proof-vector recipient tree', async () => {
    const vector = recipientTreeBoundProofVector();
    const identity = recipientTreeBoundMultiLeafGate5InstanceIdentity();
    const result = await buildLocalTrustlessSingleLeafUnsignedTxEvidence({
      label: 'Unit one-node Gate 5 trustless unsigned tx evidence',
      generatedAt: '2026-07-06T12:00:00.000Z',
      instanceIdentity: {
        ...identity,
        recipientErgoTreeHex: vector.expected.settlementBinding.recipientErgoTreeHex,
        trustlessBurnProof: vector.expected.proof,
      },
    });
    const claim = result.evidence.claims[0];

    expect(result.fixture.accepted.bridgeEventRootHex).toBe(vector.expected.bridgeEventRootHex);
    expect(result.fixture.pegOut.ergoRecipientAddress).toBe(vector.expected.settlementBinding.recipientErgoTreeHex);
    expect(claim.settlementIdentity).toMatchObject({
      duplicatePreventionKeyHex: identity.duplicatePreventionKeyHex,
      bridgeEventRootHex: identity.bridgeEventRootHex,
      recipientErgoTreeHashHex: identity.recipientErgoTreeHashHex,
      amountNanoErg: identity.amountNanoErg,
      assetIdHex: identity.assetIdHex,
    });
    expect(result.evidence.contextExtensionGuard).toMatchObject({
      status: 'pass',
      signingPermitted: false,
      broadcastPermitted: false,
    });
  });

  it('builds source-boundary evidence for a multi-node burn proof bundle without signing', async () => {
    const { identity, proof, recipientErgoTreeHex } = multiNodeRecipientTreeBoundInstance();
    const result = await buildLocalTrustlessSingleLeafUnsignedTxEvidence({
      label: 'Unit multi-node Gate 5 trustless unsigned tx evidence',
      generatedAt: '2026-07-07T12:00:00.000Z',
      instanceIdentity: {
        ...identity,
        recipientErgoTreeHex,
        trustlessBurnProof: proof.proof,
      },
    });
    const claim = result.evidence.claims[0];

    expect(proof.proof).toHaveLength(2);
    expect(result.fixture.accepted.bridgeEventRootHex).toBe(proof.bridgeEventRootHex);
    expect(result.fixture.pegOut.ergoRecipientAddress).toBe(recipientErgoTreeHex);
    expect(claim.settlementIdentity).toMatchObject({
      duplicatePreventionKeyHex: identity.duplicatePreventionKeyHex,
      bridgeEventRootHex: identity.bridgeEventRootHex,
      recipientErgoTreeHashHex: identity.recipientErgoTreeHashHex,
      amountNanoErg: identity.amountNanoErg,
      assetIdHex: identity.assetIdHex,
    });
    expect(result.evidence.boundary).toMatchObject({
      transactionCheck: 'no',
      expectedTxId: 'no',
      signing: 'no',
      submit: 'no',
      gate5Closure: 'no',
    });
    expect(result.evidence.contextExtensionGuard).toMatchObject({
      status: 'pass',
      signingPermitted: false,
      broadcastPermitted: false,
    });
  });

  it('prints producer claim boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/trustless-unsigned-tx-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run trustless:unsigned-tx');
    expect(result.stdout).toContain('does not load environment files');
    expect(result.stdout).toContain('does not load environment files, query nodes, read runtime databases, read deployment state, sign, check, approve, submit, reconcile, mutate state, broadcast, or authorize claims');
    expect(result.stdout).toContain('not Gate 5 closure');
    expect(result.stdout).toContain('not pre-broadcast evidence');
    expect(result.stdout).toContain('not transaction-check evidence');
    expect(result.stdout).toContain('not expected-tx-id evidence');
    expect(result.stdout).toContain('not signing authorization');
  });

  it('writes validator-compatible unsigned transaction evidence JSON for an instance binding JSON', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-producer-'));
    try {
      const bindingTarget = join(basename(dir), 'instance-binding.json');
      const outputTarget = join(basename(dir), 'unsigned-tx.json');
      writeFileSync(
        join(process.cwd(), bindingTarget),
        `${JSON.stringify(gate5InstanceBindingReport(), null, 2)}\n`,
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-unsigned-tx-evidence.ts',
          '--generated-at',
          '2026-07-06T12:00:00.000Z',
          '--label',
          'CLI compatible bound trustless unsigned tx evidence',
          '--instance-binding-json',
          bindingTarget,
          '--out',
          outputTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('evidenceKind: trustless-single-leaf-unsigned-tx');
      expect(result.stdout).toContain(`instanceBindingJson: ${bindingTarget}`);
      expect(result.stdout).toContain('broadcast: no');
      expect(result.stdout).toContain('transactionCheck: no');
      expect(result.stdout).toContain('expectedTxId: no');
      expect(result.stdout).toContain('signing: no');

      const parsed = JSON.parse(readFileSync(join(process.cwd(), outputTarget), 'utf8'));
      const claim = parsed.claims[0];
      const identity = compatibleInstanceIdentity();
      expect(parsed.label).toBe('CLI compatible bound trustless unsigned tx evidence');
      expect(claim.legacySidechainTxHash).toBe(identity.sidechainTxHashHex);
      expect(claim.trustlessBurnDerivation.derivedBurnIdHex).toBe(identity.burnIdHex);
      expect(claim.settlementIdentity.bridgeEventRootHex).toBe(identity.bridgeEventRootHex);
      expect(claim.settlementIdentity.recipientErgoTreeHashHex).toBe(identity.recipientErgoTreeHashHex);
      expect(claim.settlementIdentity.amountNanoErg).toBe(identity.amountNanoErg);
      expect(parsed.payoutBinding).toMatchObject({
        outputIndex: 2,
        recipientErgoTreeHashHex: identity.recipientErgoTreeHashHex,
        amountNanoErg: identity.amountNanoErg,
        recipientHashEqualsProvedBurn: true,
        amountEqualsProvedBurn: true,
      });
      expect(validateTrustlessUnsignedTxEvidenceJsonTarget(outputTarget)).toMatchObject({
        status: 'PASS',
        errors: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an incompatible multi-leaf instance binding JSON without writing output', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-producer-'));
    try {
      const bindingTarget = join(basename(dir), 'instance-binding.json');
      const outputTarget = join(basename(dir), 'unsigned-tx.json');
      writeFileSync(
        join(process.cwd(), bindingTarget),
        `${JSON.stringify(gate5InstanceBindingReport(multiLeafGate5InstanceIdentity()), null, 2)}\n`,
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-unsigned-tx-evidence.ts',
          '--generated-at',
          '2026-07-06T12:00:00.000Z',
          '--instance-binding-json',
          bindingTarget,
          '--out',
          outputTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        'instance recipientErgoTreeHex must hash to recipientErgoTreeHashHex',
      );
      expect(existsSync(join(process.cwd(), outputTarget))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes validator-compatible unsigned transaction evidence JSON for a proof-vector-bound multi-leaf instance', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-producer-'));
    try {
      const bindingTarget = join(basename(dir), 'instance-binding.json');
      const outputTarget = join(basename(dir), 'unsigned-tx.json');
      const proofVectorTarget = 'test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json';
      writeFileSync(
        join(process.cwd(), bindingTarget),
        `${JSON.stringify(gate5InstanceBindingReport(recipientTreeBoundMultiLeafGate5InstanceIdentity()), null, 2)}\n`,
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-unsigned-tx-evidence.ts',
          '--generated-at',
          '2026-07-06T12:00:00.000Z',
          '--label',
          'CLI proof-vector bound trustless unsigned tx evidence',
          '--instance-binding-json',
          bindingTarget,
          '--proof-vector-json',
          proofVectorTarget,
          '--out',
          outputTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('evidenceKind: trustless-single-leaf-unsigned-tx');
      expect(result.stdout).toContain(`instanceBindingJson: ${bindingTarget}`);
      expect(result.stdout).toContain(`proofVectorJson: ${proofVectorTarget}`);
      expect(result.stdout).toContain('broadcast: no');
      expect(result.stdout).toContain('transactionCheck: no');
      expect(result.stdout).toContain('expectedTxId: no');
      expect(result.stdout).toContain('signing: no');

      const parsed = JSON.parse(readFileSync(join(process.cwd(), outputTarget), 'utf8'));
      const claim = parsed.claims[0];
      const identity = recipientTreeBoundMultiLeafGate5InstanceIdentity();
      expect(parsed.label).toBe('CLI proof-vector bound trustless unsigned tx evidence');
      expect(claim.legacySidechainTxHash).toBe(identity.sidechainTxHashHex);
      expect(claim.trustlessBurnDerivation.derivedBurnIdHex).toBe(identity.burnIdHex);
      expect(claim.settlementIdentity.bridgeEventRootHex).toBe(identity.bridgeEventRootHex);
      expect(claim.settlementIdentity.recipientErgoTreeHashHex).toBe(identity.recipientErgoTreeHashHex);
      expect(claim.settlementIdentity.amountNanoErg).toBe(identity.amountNanoErg);
      expect(validateTrustlessUnsignedTxEvidenceJsonTarget(outputTarget)).toMatchObject({
        status: 'PASS',
        errors: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes validator-compatible unsigned transaction evidence JSON', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-producer-'));
    try {
      const target = join(basename(dir), 'unsigned-tx.json');
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-unsigned-tx-evidence.ts',
          '--generated-at',
          '2026-07-02T12:00:00.000Z',
          '--label',
          'CLI local trustless unsigned tx evidence',
          '--out',
          target,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('evidenceKind: trustless-single-leaf-unsigned-tx');
      expect(result.stdout).toContain('broadcast: no');
      expect(result.stdout).toContain('contextExtensionGuard: pass');
      expect(result.stdout).toContain('transactionCheck: no');
      expect(result.stdout).toContain('expectedTxId: no');
      expect(result.stdout).toContain('signing: no');
      expect(result.stdout).toContain('evidenceJson: written');

      const parsed = JSON.parse(readFileSync(join(process.cwd(), target), 'utf8'));
      expect(parsed.label).toBe('CLI local trustless unsigned tx evidence');
      expect(validateTrustlessUnsignedTxEvidenceJsonTarget(target)).toMatchObject({
        status: 'PASS',
        errors: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe evidence output targets before writing', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-unsigned-tx-producer-'));
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-unsigned-tx-evidence.ts',
          '--generated-at',
          '2026-07-02T12:00:00.000Z',
          '--out',
          '../operator/private-key-unsigned-tx.json',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('<blocked evidence JSON target>: refusing to write secret-bearing or runtime-state paths as evidence JSON');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function compatibleInstanceIdentity(): TrustlessBurnInstanceIdentity {
  const fixture = createPublicTrustlessSingleLeafUnsignedTxFixture();
  return {
    sidechainIdHex: fixture.accepted.sidechainIdHex,
    sidechainTxHashHex: fixture.pegOut.sidechainTxHash,
    sidechainBlockHashHex: fixture.accepted.sidechainHeaderHashHex,
    eventIndex: fixture.pegOut.sidechainLogIndex!,
    bridgeEventRootHex: fixture.settlementIdentity.bridgeEventRootHex,
    ergoAnchorHeight: fixture.accepted.ergoAnchorHeight,
    burnIdHex: fixture.settlementIdentity.duplicatePreventionKeyHex,
    duplicatePreventionKeyHex: fixture.settlementIdentity.duplicatePreventionKeyHex,
    recipientErgoTreeHashHex: fixture.settlementIdentity.recipientErgoTreeHashHex!,
    amountNanoErg: String(fixture.settlementIdentity.amountNanoErg),
    assetIdHex: fixture.settlementIdentity.assetIdHex!,
    proofVectorTarget: '../evidence/trustless-burn/artifacts/completed-compatible-single-leaf-proof-vector-report.json',
  };
}

function multiLeafGate5InstanceIdentity(): TrustlessBurnInstanceIdentity {
  return {
    sidechainIdHex: '11'.repeat(32),
    sidechainTxHashHex: '66'.repeat(32),
    sidechainBlockHashHex: '22'.repeat(32),
    eventIndex: 8,
    bridgeEventRootHex: '1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb',
    ergoAnchorHeight: 987654,
    burnIdHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
    duplicatePreventionKeyHex: '548fdcae1cfce1dcdeedc744894f8d3e2d18d1e20e500205c6ebfa86be7d891f',
    recipientErgoTreeHashHex: '88'.repeat(32),
    amountNanoErg: '2000000',
    assetIdHex: '00'.repeat(32),
    proofVectorTarget: '../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-9d5927a1.json',
  };
}

function recipientTreeBoundMultiLeafGate5InstanceIdentity(): TrustlessBurnInstanceIdentity {
  const vector = recipientTreeBoundProofVector();
  const leaf = vector.leaves[vector.expected.leafIndex];
  return {
    sidechainIdHex: leaf.sidechainIdHex,
    sidechainTxHashHex: leaf.sidechainTxHashHex,
    sidechainBlockHashHex: leaf.sidechainBlockHashHex,
    eventIndex: leaf.eventIndex,
    bridgeEventRootHex: vector.expected.bridgeEventRootHex,
    ergoAnchorHeight: 987654,
    burnIdHex: vector.targetBurnIdHex,
    duplicatePreventionKeyHex: vector.expected.settlementBinding.duplicatePreventionKeyHex,
    recipientErgoTreeHashHex: vector.expected.settlementBinding.recipientErgoTreeHashHex,
    amountNanoErg: String(vector.expected.settlementBinding.amountNanoErg),
    assetIdHex: vector.expected.settlementBinding.assetIdHex,
    proofVectorTarget: '../evidence/trustless-burn/artifacts/completed-recipient-tree-proof-vector-report.json',
  };
}

function recipientTreeBoundProofVector(): any {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), 'test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json'),
      'utf8',
    ),
  );
}

function multiNodeRecipientTreeBoundInstance(): {
  identity: TrustlessBurnInstanceIdentity;
  proof: ReturnType<typeof buildTrustlessBurnInclusionProof>;
  recipientErgoTreeHex: string;
} {
  const vector = recipientTreeBoundProofVector();
  const recipientErgoTreeHex = vector.expected.settlementBinding.recipientErgoTreeHex as string;
  const recipientErgoTreeHashHex = vector.expected.settlementBinding.recipientErgoTreeHashHex as string;
  const sidechainIdHex = '11'.repeat(32);
  const sidechainBlockHashHex = '22'.repeat(32);
  const assetIdHex = '00'.repeat(32);
  const leaf = (txByte: string, eventIndex: number, amountNanoErg: string) => {
    const sidechainTxHashHex = txByte.repeat(32);
    return {
      sidechainIdHex,
      sidechainBlockHashHex,
      burnIdHex: deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex,
        eventIndex,
      }),
      sidechainTxHashHex,
      eventIndex,
      recipientErgoTreeHashHex,
      amountNanoErg,
      assetIdHex,
    };
  };
  const target = leaf('66', 8, '2000000');
  const proof = buildTrustlessBurnInclusionProof([
    leaf('55', 7, '1000000'),
    leaf('56', 9, '1000001'),
    target,
    leaf('67', 10, '2000001'),
  ], target.burnIdHex);

  return {
    recipientErgoTreeHex,
    proof,
    identity: {
      sidechainIdHex: target.sidechainIdHex,
      sidechainTxHashHex: target.sidechainTxHashHex,
      sidechainBlockHashHex: target.sidechainBlockHashHex,
      eventIndex: target.eventIndex,
      bridgeEventRootHex: proof.bridgeEventRootHex,
      ergoAnchorHeight: 987654,
      burnIdHex: target.burnIdHex,
      duplicatePreventionKeyHex: target.burnIdHex,
      recipientErgoTreeHashHex: target.recipientErgoTreeHashHex,
      amountNanoErg: target.amountNanoErg,
      assetIdHex: target.assetIdHex,
      proofVectorTarget: '../evidence/trustless-burn/artifacts/completed-multi-node-proof-vector-report.json',
    },
  };
}

function gate5InstanceBindingReport(
  identity: TrustlessBurnInstanceIdentity = compatibleInstanceIdentity(),
): TrustlessBurnInstanceBindingReport {
  return {
    status: 'TRUSTLESS_BURN_INSTANCE_BINDING_READY',
    exitCode: 0,
    command: 'npm run trustless:instance-binding -- --source-commit abcdef1',
    sourceCommit: 'abcdef1',
    executionRequestTarget: '../evidence/trustless-burn/gate5-request.md',
    candidateTarget: '../evidence/trustless-burn/gate5-candidate.md',
    selectedNetwork: 'local offline non-mainnet',
    identity,
    supportingEvidenceTargets: [
      identity.proofVectorTarget,
    ],
    remainingBlockers: ['Unsigned transaction evidence refresh'],
    operatorNextEvidence: ['Refresh local unsigned transaction evidence for this exact instance.'],
    forbiddenInputs: ['Do not provide secrets, mnemonics, private keys, runtime databases, or deployment state.'],
    boundary: {
      'Planning/prerequisite output only': 'yes',
      'Execution request reused': 'yes',
      'Candidate evidence reused': 'yes',
      'Concrete non-mainnet instance binding produced': 'yes',
      'Secret or environment file read': 'no',
      'Wallet recovery material or private key read': 'no',
      'Node config secret read': 'no',
      'Runtime database opened by binding command': 'no',
      'Private deployment state opened by binding command': 'no',
      'Node or RPC request performed by binding command': 'no',
      'Transaction signing/check/submit/broadcast/reconciliation/deployment performed': 'no',
      'Gate 5 trustless-burn evidence claimed complete': 'no',
      'Release gate PASS claimed': 'no',
      'Production-ready claim allowed': 'no',
      'Mainnet-grade evidence linked': 'no',
      'Testnet production-candidate claim authorized by binding': 'no',
    },
  };
}
