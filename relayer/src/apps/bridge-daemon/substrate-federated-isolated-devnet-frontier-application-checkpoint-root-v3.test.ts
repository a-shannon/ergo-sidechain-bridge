import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../ergo-settlement-core/strict-json.js';
import {
  assertFrontierLabApplicationOwnerClaimV1,
  bindFrontierLabApplicationOwnerRequestV1,
  claimFrontierLabApplicationOwnerRequestV1,
  createFrontierLabApplicationOwnerV1,
  disposeFrontierLabApplicationOwnerV1,
  type FrontierLabApplicationOwnerV1,
} from '../../adapters/frontier-lab-application-owner-v1.js';

const mocks = vi.hoisted(() => ({
  packetReceipts: new WeakSet<object>(),
  mintReceipts: new WeakSet<object>(),
  runnerReceipts: new WeakSet<object>(),
  runnerV3Receipts: new WeakSet<object>(),
  setupSigners: new WeakSet<object>(),
  setupSigner: undefined as object | undefined,
  setupSignerChecks: [] as string[],
  sessionKeys: [] as readonly string[],
  sessionBindingFailure: false,
  signFailure: null as Error | null,
  signGate: undefined as Promise<void> | undefined,
  signStarted: undefined as (() => void) | undefined,
  revokeSetupDuringProof: false,
  revokeSetupDuringSign: false,
  signArguments: undefined as readonly unknown[] | undefined,
  signedTransactions: Object.freeze({ mint: '0x0102', approval: '0x0304', pegOut: '0x0506' }),
  runnerV2Calls: 0,
  runnerV3Calls: 0,
  runnerV2Assertions: 0,
  runnerV3Assertions: 0,
  runnerVersion: 3,
  runnerIdentityFault: '' as '' | 'owner' | 'recipient',
  checkpointReceipts: new WeakSet<object>(),
  sequence: [] as string[],
  disposeCalls: 0,
  createSessionCalls: 0,
  sessionFailure: false,
  disposeFailure: false,
  packetUnregistered: false,
  mintFault: '' as '' | 'provenance' | 'packet' | 'target' | 'receipt' | 'inner-target',
  runnerFailure: null as Error | null,
  runnerPreflightFailure: null as Error | null,
  runnerPreflightCalls: 0,
  runnerTargetDrift: false,
  checkpointRootDrift: false,
  checkpointApplicationDrift: false,
  packet: undefined as object | undefined,
  innerMintSourceProof: undefined as object | undefined,
  mintSourceProof: undefined as object | undefined,
  runner: undefined as object | undefined,
  checkpoint: undefined as object | undefined,
  runnerInput: undefined as Record<string, unknown> | undefined,
  runnerDeadline: undefined as number | undefined,
  checkpointInput: undefined as Record<string, unknown> | undefined,
  targetDescriptorDigestHex: '11'.repeat(32),
  packetReceiptDigestHex: '12'.repeat(32),
  innerMintReceiptDigestHex: '13'.repeat(32),
  outerMintReceiptDigestHex: '14'.repeat(32),
  runnerReceiptDigestHex: '15'.repeat(32),
  checkpointReceiptDigestHex: '16'.repeat(32),
  checkpointInnerReceiptDigestHex: '17'.repeat(32),
  sidechainIdHex: `0x${'21'.repeat(32)}`,
  sourceNativeBlockHashHex: `0x${'22'.repeat(32)}`,
  executionBlockHashHex: `0x${'23'.repeat(32)}`,
  bridgeEventRootHex: `0x${'24'.repeat(32)}`,
  burnIdHex: `0x${'25'.repeat(32)}`,
  bridgeAddressHex: `0x${'31'.repeat(20)}`,
  tokenAddressHex: `0x${'32'.repeat(20)}`,
}));

vi.mock('../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance: (value: unknown) => {
    mocks.setupSignerChecks.push(mocks.sequence.at(-1) ?? 'constructor');
    assertRegistered(mocks.setupSigners, value, 'setup signer');
  },
}));

vi.mock('./frontier-lab-proof-bound-application-signing-v1.js', () => ({
  signFrontierLabProofBoundApplicationV1: async (
    owner: Readonly<FrontierLabApplicationOwnerV1>, requestSha256Hex: string,
    packet: unknown, proof: unknown, ergoRecipientPublicKeyHex: string,
  ) => {
    assertFrontierLabApplicationOwnerClaimV1(owner, requestSha256Hex);
    try {
      mocks.sequence.push('sign');
      mocks.signArguments = [owner, requestSha256Hex, packet, proof, ergoRecipientPublicKeyHex];
      mocks.signStarted?.();
      if (mocks.signGate !== undefined) await mocks.signGate;
      if (mocks.revokeSetupDuringSign) mocks.setupSigners.delete(mocks.setupSigner!);
      if (mocks.signFailure !== null) throw mocks.signFailure;
      return mocks.signedTransactions;
    } finally {
      disposeFrontierLabApplicationOwnerV1(owner);
    }
  },
}));

vi.mock(
  '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPacketV2Provenance:
      (value: unknown) => assertRegistered(
        mocks.packetReceipts,
        value,
        'packet',
      ),
    assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance:
      (value: unknown) => assertRegistered(
        mocks.mintReceipts,
        value,
        'packet mint source-proof',
      ),
    assertSubstrateFederatedIsolatedDevnetPacketCheckpointAttestationReceiptV3Provenance:
      (value: unknown) => assertRegistered(
        mocks.checkpointReceipts,
        value,
        'packet checkpoint',
      ),
    createSubstrateFederatedIsolatedDevnetPacketCheckpointContinuationSessionV3:
      (_signer: unknown) => {
        mocks.createSessionCalls += 1;
        mocks.sequence.push('session');
        if (mocks.sessionFailure) throw new Error('injected session failure');
        mocks.sessionKeys = Object.freeze([mocks.sessionBindingFailure ? 'ff'.repeat(33)
          : (_signer as { publicKeyHex?: string }).publicKeyHex ?? '']);
        return Object.freeze({
          signer: Object.freeze({ ergoAdmissionPublicKeysHex: mocks.sessionKeys }),
          dispose: () => {
            mocks.disposeCalls += 1;
            mocks.sequence.push('dispose');
            if (mocks.disposeFailure) throw new Error('injected dispose failure');
          },
          produce: async (_input: unknown) => {
            mocks.sequence.push('packet');
            const packet = Object.freeze({
              receipt: Object.freeze({
                receiptDigestHex: mocks.packetReceiptDigestHex,
                targetDescriptorDigestHex:
                  mocks.targetDescriptorDigestHex,
              }),
              portableReplayInput: Object.freeze({
                artifacts: Object.freeze({
                  sourceArchive: Buffer.from('non-canonical packet bytes'),
                }),
              }),
              replay: Object.freeze({ reportDigestHex: 'aa'.repeat(32) }),
            });
            if (!mocks.packetUnregistered) mocks.packetReceipts.add(packet);
            mocks.packet = packet;
            return packet;
          },
          produceMintSourceProof: (
            packet: unknown,
            _input: unknown,
          ) => {
            if (packet !== mocks.packet) {
              throw new Error('mock mint received another packet');
            }
            mocks.sequence.push('mint');
            const innerMintSourceProof = Object.freeze({
              receiptDigestHex: mocks.innerMintReceiptDigestHex,
              targetDescriptorDigestHex:
                mocks.mintFault === 'inner-target' ? 'ff'.repeat(32) : mocks.targetDescriptorDigestHex,
            });
            const mintSourceProof = Object.freeze({
              packetReceiptDigestHex: mocks.mintFault === 'packet' ? 'ff'.repeat(32) : mocks.packetReceiptDigestHex,
              targetDescriptorDigestHex:
                mocks.mintFault === 'target' ? 'ff'.repeat(32) : mocks.targetDescriptorDigestHex,
              sourceProofReceiptDigestHex:
                mocks.mintFault === 'receipt' ? 'ff'.repeat(32) : mocks.innerMintReceiptDigestHex,
              sourceProof: innerMintSourceProof,
              receiptDigestHex: mocks.outerMintReceiptDigestHex,
            });
            mocks.innerMintSourceProof = innerMintSourceProof;
            if (mocks.mintFault !== 'provenance') mocks.mintReceipts.add(mintSourceProof);
            mocks.mintSourceProof = mintSourceProof;
            if (mocks.revokeSetupDuringProof) mocks.setupSigners.delete(mocks.setupSigner!);
            return mintSourceProof;
          },
          produceCheckpointAttestation: (
            packet: unknown,
            mintSourceProof: unknown,
            input: Record<string, unknown>,
          ) => {
            if (
              packet !== mocks.packet
              || mintSourceProof !== mocks.mintSourceProof
            ) {
              throw new Error('mock checkpoint received another continuation');
            }
            mocks.sequence.push('checkpoint');
            mocks.checkpointInput = input;
            const checkpoint = Object.freeze({
              targetDescriptorDigestHex:
                mocks.targetDescriptorDigestHex,
              checkpointAttestation: Object.freeze({
                targetDescriptorDigestHex:
                  mocks.targetDescriptorDigestHex,
                checkpointStatement: Object.freeze({
                  sourceNativeBlockHeight:
                    String(input.sourceNativeBlockHeight),
                  sourceNativeBlockHashHex:
                    unprefixed(String(input.sourceNativeBlockHashHex)),
                  executionBlockHashHex:
                    unprefixed(String(input.executionBlockHashHex)),
                  bridgeEventRootHex: mocks.checkpointRootDrift
                    ? 'ff'.repeat(32)
                    : unprefixed(String(input.bridgeEventRootHex)),
                  burnLeafCount: input.burnLeafCount,
                  sidechainIdHex: unprefixed(mocks.sidechainIdHex),
                  bridgeAddressHex: mocks.checkpointApplicationDrift
                    ? 'ee'.repeat(20)
                    : unprefixed(mocks.bridgeAddressHex),
                  tokenAddressHex: unprefixed(mocks.tokenAddressHex),
                }),
                receiptDigestHex:
                  mocks.checkpointInnerReceiptDigestHex,
              }),
              receiptDigestHex: mocks.checkpointReceiptDigestHex,
            });
            mocks.checkpointReceipts.add(checkpoint);
            mocks.checkpoint = checkpoint;
            return checkpoint;
          },
        });
      },
  }),
);

vi.mock(
  '../../substrate-federated-isolated-devnet-frontier-peg-out-application-runner-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_APPLICATION_RUNNER_COMPLETION_BUDGET_MS_V1:
      45 * 60_000,
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance:
      (value: unknown) => {
        mocks.runnerV2Assertions += 1;
        assertRegistered(mocks.runnerReceipts, value, 'application runner V2');
      },
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV3Provenance:
      (value: unknown) => {
        mocks.runnerV3Assertions += 1;
        assertRegistered(mocks.runnerV3Receipts, value, 'application runner V3');
      },
    runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV3:
      async (input: Record<string, unknown>, completionDeadline: number | undefined) => {
        mocks.runnerV3Calls += 1;
        mocks.sequence.push('runnerV3');
        mocks.runnerInput = input;
        mocks.runnerDeadline = completionDeadline;
        if (mocks.runnerFailure !== null) throw mocks.runnerFailure;
        if (input.mintSourceProofReceipt !== mocks.innerMintSourceProof) {
          throw new Error('runner did not receive the exact inner mint proof');
        }
        const owner = mocks.signArguments![0] as FrontierLabApplicationOwnerV1;
        const signedApplication = Object.freeze({
          ownerAddressHex: mocks.runnerIdentityFault === 'owner' ? `0x${'ff'.repeat(20)}` : owner.ownerAddressHex,
          ergoRecipientPublicKeyHex: mocks.runnerIdentityFault === 'recipient'
            ? `0x${'ff'.repeat(33)}` : input.ergoRecipientPublicKeyHex,
          transactionHashes: Object.freeze({ mint: '41'.repeat(32), approval: '42'.repeat(32), pegOut: '43'.repeat(32) }),
        });
        const applicationEvidence = Object.freeze({
          application: Object.freeze({
            bridgeAddressHex: mocks.bridgeAddressHex, tokenAddressHex: mocks.tokenAddressHex,
            ownerAddressHex: signedApplication.ownerAddressHex,
          }),
          signedApplication,
          sourceNativeBlock: Object.freeze({ height: 7, hashHex: mocks.sourceNativeBlockHashHex }),
          execution: Object.freeze({ sidechainIdHex: mocks.sidechainIdHex, blockHashHex: mocks.executionBlockHashHex }),
          burn: Object.freeze({ burnIdHex: mocks.burnIdHex, bridgeEventRootHex: mocks.bridgeEventRootHex, burnLeafCount: 1 }),
        });
        const runner = Object.freeze({
          version: mocks.runnerVersion,
          executionResult: Object.freeze({ applicationEvidence }),
          signedApplication,
          mintSourceProof: Object.freeze({
            receiptDigestHex: mocks.innerMintReceiptDigestHex,
            targetDescriptorDigestHex: mocks.runnerTargetDrift ? 'ff'.repeat(32) : mocks.targetDescriptorDigestHex,
          }),
          receiptDigestHex: mocks.runnerReceiptDigestHex,
        });
        // A downgrade has genuine legacy mock provenance, but never V3 provenance.
        (mocks.runnerVersion === 2 ? mocks.runnerReceipts : mocks.runnerV3Receipts).add(runner);
        mocks.runner = runner;
        return runner;
      },
    preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1:
      (input: Readonly<Record<string, unknown>>) => {
        mocks.runnerPreflightCalls += 1;
        if (mocks.runnerPreflightFailure !== null) {
          throw mocks.runnerPreflightFailure;
        }
        return Object.freeze({ ...input });
      },
    runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2:
      async (
        input: Record<string, unknown>,
        completionDeadline: number | undefined,
      ) => {
        mocks.runnerV2Calls += 1;
        mocks.sequence.push('application-burn');
        mocks.runnerInput = input;
        mocks.runnerDeadline = completionDeadline;
        if (mocks.runnerFailure !== null) {
          throw mocks.runnerFailure;
        }
        if (input.mintSourceProofReceipt !== mocks.innerMintSourceProof) {
          throw new Error('runner did not receive the exact inner mint proof');
        }
        const applicationEvidence = Object.freeze({
          application: Object.freeze({
            bridgeAddressHex: mocks.bridgeAddressHex,
            tokenAddressHex: mocks.tokenAddressHex,
            ownerAddressHex: `0x${'33'.repeat(20)}`,
          }),
          sourceNativeBlock: Object.freeze({
            height: 7,
            hashHex: mocks.sourceNativeBlockHashHex,
          }),
          execution: Object.freeze({
            sidechainIdHex: mocks.sidechainIdHex,
            blockHashHex: mocks.executionBlockHashHex,
          }),
          burn: Object.freeze({
            burnIdHex: mocks.burnIdHex,
            bridgeEventRootHex: mocks.bridgeEventRootHex,
            burnLeafCount: 1,
          }),
        });
        const runner = Object.freeze({
          version: 2,
          executionResult: Object.freeze({ applicationEvidence }),
          mintSourceProof: Object.freeze({
            receiptDigestHex: mocks.innerMintReceiptDigestHex,
            targetDescriptorDigestHex: mocks.runnerTargetDrift
              ? 'ff'.repeat(32)
              : mocks.targetDescriptorDigestHex,
          }),
          receiptDigestHex: mocks.runnerReceiptDigestHex,
        });
        mocks.runnerReceipts.add(runner);
        mocks.runner = runner;
        return runner;
      },
  }),
);

import {
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance,
  createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3,
  runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3,
} from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';

describe('federated isolated-devnet Frontier application/checkpoint root V3', () => {
  const owners: Readonly<FrontierLabApplicationOwnerV1>[] = [];
  afterEach(() => {
    for (const owner of owners.splice(0)) disposeFrontierLabApplicationOwnerV1(owner);
  });

  async function retainedOwner(claim = true) {
    const owner = await createFrontierLabApplicationOwnerV1(mocks.bridgeAddressHex);
    owners.push(owner);
    const bytes = Buffer.from(`${canonicalJson({
      schema: 'e2s.substrate-federated-isolated-devnet-bootstrap-command-request.v1',
      version: 1,
      sourceTarget: {
        expectedChainId: '42', bridgeAddress: mocks.bridgeAddressHex,
        bridgeOwnerAddress: owner.ownerAddressHex,
        signedLegacyOwnerMintTransactionHex: owner.signedLegacyOwnerMintTransactionHex,
      },
    })}\n`);
    const requestSha256Hex = createHash('sha256').update(bytes).digest('hex');
    bindFrontierLabApplicationOwnerRequestV1(owner, bytes, requestSha256Hex);
    if (claim) expect(claimFrontierLabApplicationOwnerRequestV1(requestSha256Hex)).toBe(owner);
    return Object.freeze({ owner, requestSha256Hex });
  }

  beforeEach(() => {
    mocks.packetReceipts = new WeakSet<object>();
    mocks.mintReceipts = new WeakSet<object>();
    mocks.runnerReceipts = new WeakSet<object>();
    mocks.runnerV3Receipts = new WeakSet<object>();
    mocks.setupSigners = new WeakSet<object>();
    mocks.setupSigner = undefined;
    mocks.setupSignerChecks.length = 0;
    mocks.sessionKeys = [];
    mocks.sessionBindingFailure = false;
    mocks.signFailure = null;
    mocks.signGate = undefined;
    mocks.signStarted = undefined;
    mocks.revokeSetupDuringProof = false;
    mocks.revokeSetupDuringSign = false;
    mocks.signArguments = undefined;
    mocks.runnerV2Calls = 0;
    mocks.runnerV3Calls = 0;
    mocks.runnerV2Assertions = 0;
    mocks.runnerV3Assertions = 0;
    mocks.runnerVersion = 3;
    mocks.runnerIdentityFault = '';
    mocks.checkpointReceipts = new WeakSet<object>();
    mocks.sequence.length = 0;
    mocks.disposeCalls = 0;
    mocks.createSessionCalls = 0;
    mocks.sessionFailure = false;
    mocks.disposeFailure = false;
    mocks.packetUnregistered = false;
    mocks.mintFault = '';
    mocks.runnerFailure = null;
    mocks.runnerPreflightFailure = null;
    mocks.runnerPreflightCalls = 0;
    mocks.runnerTargetDrift = false;
    mocks.checkpointRootDrift = false;
    mocks.checkpointApplicationDrift = false;
    mocks.packet = undefined;
    mocks.innerMintSourceProof = undefined;
    mocks.mintSourceProof = undefined;
    mocks.runner = undefined;
    mocks.checkpoint = undefined;
    mocks.runnerInput = undefined;
    mocks.runnerDeadline = undefined;
    mocks.checkpointInput = undefined;
  });

  it('orders the exact retained packet, proof, signing, runner V3 and checkpoint with one-use cleanup', async () => {
    const custody = await retainedOwner();
    const signer = setupSigner();
    const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
      signer as never, custody,
    );
    const packet = await continuation.produce({} as never);
    await expect(continuation.executeApplication({ ...packet }, applicationInput() as never))
      .rejects.toThrow(/exact retained packet/);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex)).not.toThrow();
    expect(mocks.signArguments).toBeUndefined();
    const input = applicationInput();
    const deadline = performance.now() + 60_000;
    const application = await continuation.executeApplication(packet, input as never, deadline);
    expect(mocks.sequence).toEqual(['session', 'packet', 'mint', 'sign', 'runnerV3']);
    expect(mocks.signArguments?.[0]).toBe(custody.owner);
    expect(mocks.signArguments?.[1]).toBe(custody.requestSha256Hex);
    expect(mocks.signArguments?.[2]).toBe(packet);
    expect(mocks.signArguments?.[3]).toBe(mocks.mintSourceProof);
    expect(mocks.signArguments?.[4]).toBe(`0x${signer.publicKeyHex}`);
    expect(mocks.runnerInput).toEqual({
      ...input.applicationRunnerInput,
      mintSourceProofReceipt: mocks.innerMintSourceProof,
      ergoRecipientPublicKeyHex: `0x${signer.publicKeyHex}`,
      signedTransactions: mocks.signedTransactions,
    });
    expect(mocks.runnerInput?.mintSourceProofReceipt).toBe(mocks.innerMintSourceProof);
    expect(mocks.runnerInput?.signedTransactions).toBe(mocks.signedTransactions);
    expect(mocks.runnerDeadline).toBe(deadline);
    expect(mocks.setupSignerChecks).toContain('mint');
    expect(mocks.setupSignerChecks).toContain('sign');
    expect(mocks.runnerV3Calls).toBe(1);
    expect(mocks.runnerV2Calls).toBe(0);
    expect(mocks.runnerV2Assertions).toBe(0);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
      .toThrow(/live process custody/);
    expect(() => continuation.attestCheckpoint({ ...application }, rootInput().checkpointAdmission))
      .toThrow(/exact application stage/);
    const receipt = continuation.attestCheckpoint(application, rootInput().checkpointAdmission);
    expect(receipt.version).toBe(3);
    expect(receipt.applicationRunner.version).toBe(3);
    expect(receipt.applicationRunner).toBe(mocks.runner);
    expect(receipt.mintSourceProof).toBe(mocks.mintSourceProof);
    expect(receipt.checkpoint).toBe(mocks.checkpoint);
    expect(mocks.checkpointInput).toEqual({
      sourceNativeBlockHeight: 7, sourceNativeBlockHashHex: mocks.sourceNativeBlockHashHex,
      executionBlockHashHex: mocks.executionBlockHashHex, bridgeEventRootHex: mocks.bridgeEventRootHex,
      burnLeafCount: 1, admissionValidFromErgoHeight: '2000', admissionExpiresAtErgoHeight: '2064',
    });
    expect(mocks.sequence).toEqual(['session', 'packet', 'mint', 'sign', 'runnerV3', 'checkpoint', 'dispose']);
    expect(() => assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(receipt))
      .not.toThrow();
    expect(mocks.runnerV3Assertions).toBeGreaterThanOrEqual(3);
    expect(mocks.runnerV2Assertions).toBe(0);
    expect(() => assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance({ ...receipt }))
      .toThrow(/lacks process provenance/);
    expect(() => continuation.attestCheckpoint(application, rootInput().checkpointAdmission))
      .toThrow(/exact application stage/);
    await expect(continuation.executeApplication(packet, applicationInput() as never))
      .rejects.toThrow(/exact retained packet/);
    await expect(continuation.complete(packet, completionInput() as never)).rejects.toThrow(/exact retained packet/);
    expect(mocks.runnerV3Calls).toBe(1);
    continuation.dispose();
    expect(mocks.disposeCalls).toBe(1);
  });

  it.each(['unclaimed', 'clone', 'request', 'disposed'] as const)(
    'rejects %s custody before creating a packet session', async fault => {
      const custody = await retainedOwner(fault !== 'unclaimed');
      if (fault === 'disposed') disposeFrontierLabApplicationOwnerV1(custody.owner);
      const candidate = {
        owner: fault === 'clone' ? { ...custody.owner } : custody.owner,
        requestSha256Hex: fault === 'request' ? 'ff'.repeat(32) : custody.requestSha256Hex,
      };
      expect(() => createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        setupSigner() as never, candidate,
      )).toThrow(/not claimed|live process custody|exact request/);
      expect(mocks.createSessionCalls).toBe(0);
    },
  );

  it.each(['session', 'packet', 'dispose', 'revoked-before-packet', 'revoked-before-proof'] as const)(
    'closes fresh custody after %s failure without an application call', async fault => {
      const custody = await retainedOwner();
      if (fault === 'session') {
        mocks.sessionFailure = true;
        expect(() => createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
          setupSigner() as never, custody,
        )).toThrow(/injected session failure/);
      } else {
        const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
          setupSigner() as never, custody,
        );
        if (fault === 'dispose') {
          mocks.disposeFailure = true;
          expect(() => continuation.dispose()).toThrow(/injected dispose failure/);
        } else if (fault === 'packet' || fault === 'revoked-before-packet') {
          if (fault === 'packet') mocks.packetUnregistered = true;
          else disposeFrontierLabApplicationOwnerV1(custody.owner);
          await expect(continuation.produce({} as never)).rejects.toThrow(/provenance|live process custody/);
        } else {
          const packet = await continuation.produce({} as never);
          disposeFrontierLabApplicationOwnerV1(custody.owner);
          await expect(continuation.executeApplication(packet, applicationInput() as never))
            .rejects.toThrow(/live process custody/);
        }
        continuation.dispose();
        expect(mocks.disposeCalls).toBe(1);
      }
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
        .toThrow(/live process custody/);
      expect(mocks.sequence).not.toContain('mint');
      expect(mocks.runnerInput).toBeUndefined();
    },
  );

  it.each(['provenance', 'packet', 'target', 'receipt', 'inner-target'] as const)(
    'rejects mint proof %s drift before application execution and disposes fresh custody', async fault => {
      const custody = await retainedOwner();
      const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        setupSigner() as never, custody,
      );
      const packet = await continuation.produce({} as never);
      mocks.mintFault = fault;
      await expect(continuation.executeApplication(packet, applicationInput() as never))
        .rejects.toThrow(fault === 'provenance' ? /lacks process provenance/ : /differs from the retained packet or target/);
      expect(mocks.sequence).toEqual(['session', 'packet', 'mint', 'dispose']);
      expect(mocks.signArguments).toBeUndefined();
      expect(mocks.runnerInput).toBeUndefined();
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
        .toThrow(/live process custody/);
    },
  );

  it.each(['provenance', 'session-binding'] as const)(
    'closes fresh owner custody when constructor %s fails', async fault => {
      const custody = await retainedOwner();
      const signer = setupSigner();
      if (fault === 'provenance') mocks.setupSigners.delete(signer);
      else mocks.sessionBindingFailure = true;
      expect(() => createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        signer as never, custody,
      )).toThrow(fault === 'provenance' ? /setup signer lacks process provenance/ : /signer|admission|binding/i);
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
        .toThrow(/live process custody/);
      expect(mocks.disposeCalls).toBe(fault === 'provenance' ? 0 : 1);
      expect(mocks.signArguments).toBeUndefined();
      expect(mocks.runnerV2Calls + mocks.runnerV3Calls).toBe(0);
    },
  );

  it.each(['before-execution', 'during-proof', 'during-sign'] as const)(
    'rejects setup signer revocation %s without invoking either runner', async fault => {
      const custody = await retainedOwner();
      const signer = setupSigner();
      const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        signer as never, custody,
      );
      const packet = await continuation.produce({} as never);
      if (fault === 'before-execution') mocks.setupSigners.delete(signer);
      if (fault === 'during-proof') mocks.revokeSetupDuringProof = true;
      if (fault === 'during-sign') mocks.revokeSetupDuringSign = true;
      await expect(continuation.executeApplication(packet, applicationInput() as never))
        .rejects.toThrow(/setup signer lacks process provenance/);
      expect(mocks.sequence.filter(step => step === 'sign')).toHaveLength(fault === 'during-sign' ? 1 : 0);
      expect(mocks.runnerV2Calls + mocks.runnerV3Calls).toBe(0);
      expect(mocks.checkpoint).toBeUndefined();
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
        .toThrow(/live process custody/);
      continuation.dispose();
      expect(mocks.disposeCalls).toBe(1);
    },
  );

  it('keeps the constructor-bound packet admission key immutable through signing', async () => {
    const custody = await retainedOwner();
    const signer = setupSigner();
    const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
      signer as never, custody,
    );
    const packet = await continuation.produce({} as never);
    expect(Object.isFrozen(signer)).toBe(true);
    expect(Object.isFrozen(continuation.signer.ergoAdmissionPublicKeysHex)).toBe(true);
    expect(Reflect.set(signer, 'publicKeyHex', `02${'ff'.repeat(32)}`)).toBe(false);
    expect(Reflect.set(continuation.signer.ergoAdmissionPublicKeysHex, '0', 'ff'.repeat(33))).toBe(false);
    try {
      await continuation.complete(packet, completionInput() as never);
      expect(mocks.signArguments?.[4]).toBe(`0x${signer.publicKeyHex}`);
      expect(mocks.runnerInput?.ergoRecipientPublicKeyHex).toBe(`0x${signer.publicKeyHex}`);
      expect(continuation.signer.ergoAdmissionPublicKeysHex).toEqual([signer.publicKeyHex]);
    } finally {
      continuation.dispose();
    }
    expect(mocks.runnerV3Calls).toBe(1);
    expect(mocks.runnerV2Calls).toBe(0);
    expect(mocks.disposeCalls).toBe(1);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
      .toThrow(/live process custody/);
  });

  it.each(['sign', 'runner', 'downgrade', 'unknown-version', 'owner', 'recipient', 'runner-target'] as const)(
    'fails closed on fresh-owner %s failure without checkpoint or legacy fallback', async fault => {
      const custody = await retainedOwner();
      const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        setupSigner() as never, custody,
      );
      const packet = await continuation.produce({} as never);
      if (fault === 'sign') mocks.signFailure = new Error('injected signing failure');
      if (fault === 'runner') mocks.runnerFailure = new Error('injected runner failure');
      if (fault === 'downgrade') mocks.runnerVersion = 2;
      if (fault === 'unknown-version') mocks.runnerVersion = 4;
      if (fault === 'owner' || fault === 'recipient') {
        mocks.runnerIdentityFault = fault;
      }
      if (fault === 'runner-target') mocks.runnerTargetDrift = true;
      await expect(continuation.complete(packet, completionInput() as never)).rejects.toThrow(
        fault === 'sign' ? /injected signing failure/
          : fault === 'runner' ? /injected runner failure/
            : fault === 'runner-target' ? /different packet or mint proof/
              : /V3|version|owner|recipient|signed|binding/i,
      );
      expect(mocks.sequence).toEqual([
        'session', 'packet', 'mint', 'sign', ...(fault === 'sign' ? [] : ['runnerV3']), 'dispose',
      ]);
      expect(mocks.runnerV2Calls).toBe(0);
      expect(mocks.runnerV2Assertions).toBe(0);
      expect(mocks.runnerV3Calls).toBe(fault === 'sign' ? 0 : 1);
      expect(mocks.checkpoint).toBeUndefined();
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
        .toThrow(/live process custody/);
      await expect(continuation.executeApplication(packet, applicationInput() as never))
        .rejects.toThrow(/exact retained packet/);
      continuation.dispose();
      expect(mocks.disposeCalls).toBe(1);
    },
  );

  it.each(['runner-plan', 'execution-shape', 'completion-shape'] as const)(
    'does not sign after fresh-owner %s preflight failure', async fault => {
      const custody = await retainedOwner();
      const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        setupSigner() as never, custody,
      );
      const packet = await continuation.produce({} as never);
      if (fault === 'runner-plan') mocks.runnerPreflightFailure = new Error('injected runner preflight failure');
      const attempt = fault === 'completion-shape'
        ? continuation.complete(packet, { ...completionInput(), execute: () => undefined } as never)
        : continuation.executeApplication(packet, {
          ...applicationInput(), ...(fault === 'execution-shape' ? { execute: () => undefined } : {}),
        } as never);
      await expect(attempt).rejects.toThrow(fault === 'runner-plan' ? /injected runner preflight failure/ : /must contain exactly/);
      expect(mocks.sequence).toEqual(['session', 'packet', 'dispose']);
      expect(mocks.signArguments).toBeUndefined();
      expect(mocks.runnerV2Calls + mocks.runnerV3Calls).toBe(0);
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
        .toThrow(/live process custody/);
    },
  );

  it('rejects duplicate execution and running disposal without terminating the first signing call', async () => {
    const custody = await retainedOwner();
    const continuation = createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
      setupSigner() as never, custody,
    );
    const packet = await continuation.produce({} as never);
    let release!: () => void;
    mocks.signGate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { mocks.signStarted = resolve; });
    const first = continuation.executeApplication(packet, applicationInput() as never);
    try {
      await started;
      await expect(continuation.executeApplication(packet, applicationInput() as never))
        .rejects.toThrow(/exact retained packet/);
      await expect(continuation.complete(packet, completionInput() as never))
        .rejects.toThrow(/exact retained packet/);
      expect(() => continuation.dispose()).toThrow(/is running/);
      expect(mocks.disposeCalls).toBe(0);
      expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex)).not.toThrow();
      expect(mocks.sequence).toEqual(['session', 'packet', 'mint', 'sign']);
    } finally {
      release();
      // Always settle the in-flight call, including on an assertion failure.
      await first;
      continuation.dispose();
    }
    expect(mocks.sequence).toEqual(['session', 'packet', 'mint', 'sign', 'runnerV3', 'dispose']);
    expect(mocks.runnerV3Calls).toBe(1);
    expect(mocks.runnerV2Calls).toBe(0);
    expect(mocks.disposeCalls).toBe(1);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(custody.owner, custody.requestSha256Hex))
      .toThrow(/live process custody/);
  });

  it('orders one exact packet, mint, application burn and derived checkpoint', async () => {
    const receipt =
      await runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        rootInput() as never,
      );

    expect(mocks.sequence).toEqual([
      'session',
      'packet',
      'mint',
      'application-burn',
      'checkpoint',
      'dispose',
    ]);
    expect(mocks.runnerInput?.mintSourceProofReceipt)
      .toBe(mocks.innerMintSourceProof);
    expect(receipt.applicationRunner.version).toBe(2);
    expect(mocks.runnerV2Calls).toBe(1);
    expect(mocks.runnerV3Calls).toBe(0);
    expect(mocks.signArguments).toBeUndefined();
    expect(mocks.runnerPreflightCalls).toBe(2);
    expect(mocks.checkpointInput).toEqual({
      sourceNativeBlockHeight: 7,
      sourceNativeBlockHashHex: mocks.sourceNativeBlockHashHex,
      executionBlockHashHex: mocks.executionBlockHashHex,
      bridgeEventRootHex: mocks.bridgeEventRootHex,
      burnLeafCount: 1,
      admissionValidFromErgoHeight: '2000',
      admissionExpiresAtErgoHeight: '2064',
    });
    expect(receipt.packet.receipt).toBe(
      (mocks.packet as { receipt: object }).receipt,
    );
    expect(receipt.packet).not.toHaveProperty('portableReplayInput');
    expect(receipt.packet).not.toHaveProperty('replay');
    expect(receipt.mintSourceProof).toBe(mocks.mintSourceProof);
    expect(receipt.applicationRunner).toBe(mocks.runner);
    expect(receipt.checkpoint).toBe(mocks.checkpoint);
    expect(receipt.binding).toMatchObject({
      targetDescriptorDigestHex: mocks.targetDescriptorDigestHex,
      burnIdHex: mocks.burnIdHex,
      bridgeEventRootHex: mocks.bridgeEventRootHex,
    });
    expect(receipt.boundary).toMatchObject({
      applicationBurnReceiptBound: true,
      checkpointAttestationEstablished: true,
      sourceConsensusIndependentlyVerified: false,
      deterministicSourceFinalityEstablished: false,
      payoutAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
        receipt,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
        { ...receipt },
      )
    ).toThrow(/lacks process provenance/u);
  });

  it('caps an outer action deadline to the runner completion budget', async () => {
    const now = 1_000;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(now);
    try {
      await runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        rootInput() as never,
        now + 60 * 60_000,
      );

      expect(mocks.runnerDeadline).toBe(now + 45 * 60_000);
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects callback, mint-receipt and accessor input surfaces before custody', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3({
        ...rootInput(),
        execute: () => undefined,
      } as never),
    ).rejects.toThrow(/must contain exactly/u);
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3({
        ...rootInput(),
        applicationRunnerInput: {
          ...rootInput().applicationRunnerInput,
          mintSourceProofReceipt: Object.freeze({}),
        },
      } as never),
    ).rejects.toThrow(/must contain exactly/u);
    const accessorInput = rootInput();
    Object.defineProperty(accessorInput, 'checkpointAdmission', {
      enumerable: true,
      get: () => ({
        validFromErgoHeight: '2000',
        expiresAtErgoHeight: '2064',
      }),
    });
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        accessorInput as never,
      ),
    ).rejects.toThrow(/must be an own data property/u);
    expect(mocks.createSessionCalls).toBe(0);
  });

  it('rejects an invalid runner plan before creating packet custody', async () => {
    mocks.runnerPreflightFailure = new Error('injected runner preflight failure');

    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        rootInput() as never,
      ),
    ).rejects.toThrow(/injected runner preflight failure/u);

    expect(mocks.runnerPreflightCalls).toBe(1);
    expect(mocks.createSessionCalls).toBe(0);
    expect(mocks.sequence).toEqual([]);
  });

  it('closes retained custody when the process runner fails', async () => {
    mocks.runnerFailure = new Error('injected runner failure');
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        rootInput() as never,
      ),
    ).rejects.toThrow(/injected runner failure/u);
    expect(mocks.sequence).toEqual([
      'session',
      'packet',
      'mint',
      'application-burn',
      'dispose',
    ]);
    expect(mocks.checkpoint).toBeUndefined();
    expect(mocks.disposeCalls).toBe(1);
  });

  it('retains one exact packet for a higher-level static composition root', async () => {
    const continuation =
      createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        Object.freeze({}) as never,
      );
    try {
      const packet = await continuation.produce(Object.freeze({}) as never);
      expect(mocks.sequence).toEqual(['session', 'packet']);
      await expect(
        continuation.complete(
          Object.freeze({ ...packet }) as never,
          completionInput() as never,
        ),
      ).rejects.toThrow(/exact retained packet/u);

      const receipt = await continuation.complete(
        packet,
        completionInput() as never,
      );
      expect(receipt.packet.receipt).toBe(packet.receipt);
      expect(receipt.packet).not.toBe(packet);
      expect(mocks.sequence).toEqual([
        'session',
        'packet',
        'mint',
        'application-burn',
        'checkpoint',
        'dispose',
      ]);
      expect(mocks.disposeCalls).toBe(1);
      await expect(
        continuation.complete(packet, completionInput() as never),
      ).rejects.toThrow(/exact retained packet/u);
    } finally {
      continuation.dispose();
    }
    expect(mocks.disposeCalls).toBe(1);
  });

  it('retains the exact application stage until a later checkpoint attestation', async () => {
    const continuation =
      createSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointContinuationV3(
        Object.freeze({}) as never,
      );
    try {
      const packet = await continuation.produce(Object.freeze({}) as never);
      const application = await continuation.executeApplication(
        packet,
        applicationInput() as never,
      );
      expect(mocks.sequence).toEqual([
        'session',
        'packet',
        'mint',
        'application-burn',
      ]);
      expect(mocks.checkpoint).toBeUndefined();

      expect(() =>
        continuation.attestCheckpoint(
          Object.freeze({ ...application }) as never,
          rootInput().checkpointAdmission,
        )
      ).toThrow(/exact application stage/u);

      const receipt = continuation.attestCheckpoint(
        application,
        rootInput().checkpointAdmission,
      );
      expect(receipt.applicationRunner).toBe(application.applicationRunner);
      expect(mocks.sequence).toEqual([
        'session',
        'packet',
        'mint',
        'application-burn',
        'checkpoint',
        'dispose',
      ]);
    } finally {
      continuation.dispose();
    }
    expect(mocks.disposeCalls).toBe(1);
  });

  it('rejects runner target drift before checkpoint production', async () => {
    mocks.runnerTargetDrift = true;
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        rootInput() as never,
      ),
    ).rejects.toThrow(/targets a different packet or mint proof/u);
    expect(mocks.sequence).toEqual([
      'session',
      'packet',
      'mint',
      'application-burn',
      'dispose',
    ]);
    expect(mocks.checkpoint).toBeUndefined();
  });

  it.each([
    ['root', () => { mocks.checkpointRootDrift = true; }],
    ['application', () => { mocks.checkpointApplicationDrift = true; }],
  ])('rejects checkpoint %s drift from the process-proven burn', async (
    _label,
    mutate,
  ) => {
    mutate();
    await expect(
      runSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootV3(
        rootInput() as never,
      ),
    ).rejects.toThrow(/checkpoint differs from the process-proven application burn/u);
    expect(mocks.disposeCalls).toBe(1);
  });
});

function setupSigner() {
  const signer = Object.freeze({ publicKeyHex: `02${'51'.repeat(32)}` });
  mocks.setupSigners.add(signer);
  mocks.setupSigner = signer;
  return signer;
}

function rootInput() {
  return {
    ergoAdmissionSigner: Object.freeze({}),
    packetInput: Object.freeze({}),
    mintSourceProofInput: Object.freeze({}),
    applicationRunnerInput: {
      frontierSourceDirectory: 'C:/scratch/frontier',
      temporaryDirectoryRoot: 'C:/scratch',
      cargoDependencyCacheDirectory: 'C:/cargo-cache',
      cargoExecutablePath: 'C:/tools/cargo.exe',
      rustcExecutablePath: 'C:/tools/rustc.exe',
      gitExecutablePath: 'C:/tools/git.exe',
      offline: true as const,
    },
    checkpointAdmission: {
      validFromErgoHeight: '2000',
      expiresAtErgoHeight: '2064',
    },
  };
}

function completionInput() {
  const input = rootInput();
  return {
    mintSourceProofInput: input.mintSourceProofInput,
    applicationRunnerInput: input.applicationRunnerInput,
    checkpointAdmission: input.checkpointAdmission,
  };
}

function applicationInput() {
  const input = rootInput();
  return {
    mintSourceProofInput: input.mintSourceProofInput,
    applicationRunnerInput: input.applicationRunnerInput,
  };
}

function assertRegistered(
  registry: WeakSet<object>,
  value: unknown,
  label: string,
): void {
  if (value === null || typeof value !== 'object' || !registry.has(value)) {
    throw new Error(`${label} lacks process provenance`);
  }
}

function unprefixed(value: string): string {
  return value.toLowerCase().replace(/^0x/u, '');
}
