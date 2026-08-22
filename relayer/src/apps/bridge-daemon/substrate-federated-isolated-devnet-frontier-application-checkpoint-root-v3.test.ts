import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  packetReceipts: new WeakSet<object>(),
  mintReceipts: new WeakSet<object>(),
  runnerReceipts: new WeakSet<object>(),
  checkpointReceipts: new WeakSet<object>(),
  sequence: [] as string[],
  disposeCalls: 0,
  createSessionCalls: 0,
  runnerFailure: null as Error | null,
  runnerTargetDrift: false,
  checkpointRootDrift: false,
  checkpointApplicationDrift: false,
  packet: undefined as object | undefined,
  innerMintSourceProof: undefined as object | undefined,
  mintSourceProof: undefined as object | undefined,
  runner: undefined as object | undefined,
  checkpoint: undefined as object | undefined,
  runnerInput: undefined as Record<string, unknown> | undefined,
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
        return Object.freeze({
          dispose: () => {
            mocks.disposeCalls += 1;
            mocks.sequence.push('dispose');
          },
          produce: async (_input: unknown) => {
            mocks.sequence.push('packet');
            const packet = Object.freeze({
              receipt: Object.freeze({
                receiptDigestHex: mocks.packetReceiptDigestHex,
                targetDescriptorDigestHex:
                  mocks.targetDescriptorDigestHex,
              }),
            });
            mocks.packetReceipts.add(packet);
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
                mocks.targetDescriptorDigestHex,
            });
            const mintSourceProof = Object.freeze({
              packetReceiptDigestHex: mocks.packetReceiptDigestHex,
              targetDescriptorDigestHex:
                mocks.targetDescriptorDigestHex,
              sourceProofReceiptDigestHex:
                mocks.innerMintReceiptDigestHex,
              sourceProof: innerMintSourceProof,
              receiptDigestHex: mocks.outerMintReceiptDigestHex,
            });
            mocks.innerMintSourceProof = innerMintSourceProof;
            mocks.mintReceipts.add(mintSourceProof);
            mocks.mintSourceProof = mintSourceProof;
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
    assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV2Provenance:
      (value: unknown) => assertRegistered(
        mocks.runnerReceipts,
        value,
        'application runner',
      ),
    runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV2:
      async (input: Record<string, unknown>) => {
        mocks.sequence.push('application-burn');
        mocks.runnerInput = input;
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
  beforeEach(() => {
    mocks.packetReceipts = new WeakSet<object>();
    mocks.mintReceipts = new WeakSet<object>();
    mocks.runnerReceipts = new WeakSet<object>();
    mocks.checkpointReceipts = new WeakSet<object>();
    mocks.sequence.length = 0;
    mocks.disposeCalls = 0;
    mocks.createSessionCalls = 0;
    mocks.runnerFailure = null;
    mocks.runnerTargetDrift = false;
    mocks.checkpointRootDrift = false;
    mocks.checkpointApplicationDrift = false;
    mocks.packet = undefined;
    mocks.innerMintSourceProof = undefined;
    mocks.mintSourceProof = undefined;
    mocks.runner = undefined;
    mocks.checkpoint = undefined;
    mocks.runnerInput = undefined;
    mocks.checkpointInput = undefined;
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
    expect(mocks.checkpointInput).toEqual({
      sourceNativeBlockHeight: 7,
      sourceNativeBlockHashHex: mocks.sourceNativeBlockHashHex,
      executionBlockHashHex: mocks.executionBlockHashHex,
      bridgeEventRootHex: mocks.bridgeEventRootHex,
      burnLeafCount: 1,
      admissionValidFromErgoHeight: '2000',
      admissionExpiresAtErgoHeight: '2064',
    });
    expect(receipt.packet).toBe(mocks.packet);
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
      expect(receipt.packet).toBe(packet);
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
