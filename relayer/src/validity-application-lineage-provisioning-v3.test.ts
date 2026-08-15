import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  CHECK_ONLY_COMMITTEE_THRESHOLD,
} from './committee-config.js';
import {
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  decodePegInSourceIntentV2Hex,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  derivePegInCausalLineageProfileV3,
  type PegInCausalLineageProfileV3Semantics,
} from './peg-in-causal-lineage-profile-v3.js';
import {
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
} from './spv-tracker-validity-v2.js';
import {
  compileValidityApplicationLineageInstanceV3,
  createPinnedValidityApplicationLineageCompilerV3,
  deriveValidityApplicationLineageFinalityPolicyIdV1Hex,
  deriveValidityApplicationLineageSourceCommitmentPolicyIdV1Hex,
  type ValidityApplicationLineageInstanceV3Candidate,
  type ValidityApplicationLineageProofBindingV3,
} from './validity-application-lineage-instance-v3.js';
import {
  assertValidityApplicationLineageProvisioningV3Packet,
  buildValidityApplicationLineageProvisioningV3,
  type BuildValidityApplicationLineageProvisioningV3Input,
} from './validity-application-lineage-provisioning-v3.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TEMPLATE_PATHS = {
  tracker: resolve(
    BRIDGE_ROOT,
    'contracts',
    'SPVTrackerValidityApplicationLineageV3.es',
  ),
  causalVault: resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainCausalVaultValidityApplicationV2.es',
  ),
  duplicatePrevention: resolve(
    BRIDGE_ROOT,
    'contracts',
    'DoubleUnlockPreventionValidityApplicationV2.es',
  ),
  sourceLock: resolve(
    BRIDGE_ROOT,
    'contracts',
    'MainChainLockCausalLineageV3.es',
  ),
} as const;
const TEMPLATES = Object.freeze({
  tracker: readFileSync(TEMPLATE_PATHS.tracker, 'utf8'),
  causalVault: readFileSync(TEMPLATE_PATHS.causalVault, 'utf8'),
  duplicatePrevention:
    readFileSync(TEMPLATE_PATHS.duplicatePrevention, 'utf8'),
  sourceLock: readFileSync(TEMPLATE_PATHS.sourceLock, 'utf8'),
});
const COMPILER_BATCH_JSON = readFileSync(resolve(
  BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'validity-application-lineage-compiler-v3.json',
), 'utf8');
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const DEPOSITOR_TREE = `0008cd02${'77'.repeat(32)}`;
const SOURCE_AMOUNT = '50000000';
const EXPECTED_TRANSACTION_IDS = [
  'e8cb72561665e939b28c09df5078e55f973c63897a62b8dd6769806e4912f6e3',
  'b17d9c9ac6b59b7597f29f9128798fc5873e57b7062c0037a72a8d265ee3a142',
  'ddd581bdfcb2cb0e7aab516df81b6f92f42a920af7a0b4e745389db3ee88cefc',
  '471c04369b16f7f2a37b6691db4587808eb8a57b7d3fc839f79ae803a87546d6',
] as const;
const EXPECTED_PROTECTED_BOX_IDS = [
  '20e56d29d1a38d271fd8e52b23ab5484e8f11f6bd81017515d8a96a9d592c156',
  'a832bd44a51a93b78f5889e989031d33fe3010743076888d7459f4b34c524997',
  '626ff14c57211d4a356704f0ebbd5a9ce9644a1a87ca1934624787c9ac2c2c6f',
  '0de39409783ebb0c222d3ed85a4c5ab480d2f25c92427f659a781f24dee6857d',
] as const;
const APPROVED_TRUST_ANCHOR_DIGEST_HEX = `0x${'aa'.repeat(32)}`;
const COMMITTEE = {
  publicKeys: CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  threshold: CHECK_ONLY_COMMITTEE_THRESHOLD,
} as const;
const PROOF_BINDING: ValidityApplicationLineageProofBindingV3 = {
  proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  approvedTrustAnchorDigestHex: APPROVED_TRUST_ANCHOR_DIGEST_HEX,
  programIdHex: `0x${EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX}`,
  verifierProfileIdHex:
    `0x${EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX}`,
};
const RUNTIME_BINDING = {
  bridgeRuntimeCodeSha256Hex: 'bb'.repeat(32),
  bridgeRuntimeCodeBytes: 4096,
  tokenRuntimeCodeSha256Hex: 'cc'.repeat(32),
  tokenRuntimeCodeBytes: 2048,
} as const;

let compiled: Readonly<ValidityApplicationLineageInstanceV3Candidate>;
let trackerGenesisInputBox: Eip12Box;
let duplicatePreventionGenesisInputBox: Eip12Box;
let sourceFundingBox: Eip12Box;

beforeAll(async () => {
  const funding = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [0, 1, 2].map(() => ({
      value: '100000000',
      ergoTree: GENESIS_TREE,
      assets: [],
      additionalRegisters: {},
      creationHeight: 111,
    })),
  }, 'application lineage V3 provisioning inputs');
  [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    sourceFundingBox,
  ] = funding.outputs;

  const semantics: PegInCausalLineageProfileV3Semantics = {
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    sourceLockTemplateSha256Hex: `0x${sha256(TEMPLATES.sourceLock)}`,
    validityTrackerTemplateSha256Hex: `0x${sha256(TEMPLATES.tracker)}`,
    causalVaultTemplateSha256Hex: `0x${sha256(TEMPLATES.causalVault)}`,
    duplicatePreventionTemplateSha256Hex:
      `0x${sha256(TEMPLATES.duplicatePrevention)}`,
    finalityPolicyIdHex:
      deriveValidityApplicationLineageFinalityPolicyIdV1Hex(PROOF_BINDING),
    proofSystemIdHex: PROOF_BINDING.proofSystemIdHex,
    proofProfileIdHex: PROOF_BINDING.proofProfileIdHex,
    sourceCommitmentPolicyIdHex:
      deriveValidityApplicationLineageSourceCommitmentPolicyIdV1Hex(COMMITTEE),
    profileRevision: '1',
    activationHeight: '0',
  };
  const lineage = await derivePegInCausalLineageProfileV3({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    semantics,
  });
  compiled = await compileValidityApplicationLineageInstanceV3({
    lineageCandidate: lineage,
    templates: TEMPLATES,
    runtimeBinding: RUNTIME_BINDING,
    proofBinding: PROOF_BINDING,
    committee: COMMITTEE,
    compiler:
      createPinnedValidityApplicationLineageCompilerV3(COMPILER_BATCH_JSON),
  });
});

describe('validity application lineage provisioning V3', () => {
  it('builds a deterministic four-transaction packet with exact descendants', async () => {
    const first = await buildValidityApplicationLineageProvisioningV3(
      buildInput(),
    );
    const second = await buildValidityApplicationLineageProvisioningV3(
      buildInput(),
    );

    expect(second).toEqual(first);
    expect(Object.values(first.transactions).map(tx => tx.txId))
      .toEqual(EXPECTED_TRANSACTION_IDS);
    expect(Object.values(second.transactions).map(tx => tx.txId))
      .toEqual(EXPECTED_TRANSACTION_IDS);
    expect(new Set(
      Object.values(first.transactions).map(tx => tx.txId),
    ).size).toBe(4);

    const trackerTx = first.transactions.trackerIssuance;
    const dupTx = first.transactions.duplicatePreventionIssuance;
    expect(trackerTx.eip12Tx.inputs).toHaveLength(1);
    expect(dupTx.eip12Tx.inputs).toHaveLength(1);
    expect(trackerTx.eip12Tx.inputs[0].boxId)
      .toBe(trackerGenesisInputBox.boxId);
    expect(dupTx.eip12Tx.inputs[0].boxId)
      .toBe(duplicatePreventionGenesisInputBox.boxId);
    expect(first.boxes.tracker.assets).toEqual([{
      tokenId: trackerGenesisInputBox.boxId,
      amount: '1',
    }]);
    expect(first.boxes.duplicatePrevention.assets).toEqual([{
      tokenId: duplicatePreventionGenesisInputBox.boxId,
      amount: '1',
    }]);
    expect(first.boxes.duplicatePrevention.additionalRegisters.R5.slice(68, 70))
      .toBe('03');

    const sourceCreation = first.transactions.sourceLockCreation;
    const commitment = first.transactions.sourceCommitment;
    expect(sourceCreation.outputs).toHaveLength(4);
    expect(sourceCreation.outputs[0]).toEqual(first.boxes.sourceLock);
    expect(sourceCreation.outputs[1]).toEqual(first.boxes.sourceCommitmentFee);
    expect(sourceCreation.outputs.at(-1)?.ergoTree).toBe(MINER_FEE_TREE);
    expect(commitment.eip12Tx.inputs.map(box => box.boxId)).toEqual([
      first.boxes.sourceLock.boxId,
      first.boxes.sourceCommitmentFee.boxId,
    ]);
    expect(commitment.outputs).toHaveLength(2);
    expect(commitment.outputs[0]).toEqual(first.boxes.causalVault);
    expect(commitment.outputs[1].ergoTree).toBe(MINER_FEE_TREE);
    expect(first.boxes.sourceLock.value).toBe(SOURCE_AMOUNT);
    expect(first.boxes.causalVault.value).toBe(SOURCE_AMOUNT);
    expect([
      first.boxes.tracker.boxId,
      first.boxes.duplicatePrevention.boxId,
      first.boxes.sourceLock.boxId,
      first.boxes.causalVault.boxId,
    ]).toEqual(EXPECTED_PROTECTED_BOX_IDS);
    expect(first.boxes.causalVault.additionalRegisters.R5)
      .toContain(first.boxes.sourceLock.boxId);

    expect(Object.values(first.invariants).every(Boolean)).toBe(true);
    expect(Object.values(first.boundaries).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.transactions.sourceCommitment.eip12Tx.inputs))
      .toBe(true);
    expect(Object.isFrozen(first.boxes.causalVault.additionalRegisters))
      .toBe(true);
    expect(() => {
      (first.boxes.causalVault as { value: string }).value = '1';
    }).toThrow(TypeError);
    expect(() =>
      assertValidityApplicationLineageProvisioningV3Packet(first)
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationLineageProvisioningV3Packet(
        structuredClone(first),
      )
    ).toThrow(/built in this process/);
  });

  it('rejects decoded compiler candidates and genesis aliases', async () => {
    await expect(buildValidityApplicationLineageProvisioningV3({
      ...buildInput(),
      compiledInstance: structuredClone(compiled),
    })).rejects.toThrow(/same-process derived lineage profile/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...buildInput(),
      trackerGenesisInputBox: duplicatePreventionGenesisInputBox,
    })).rejects.toThrow(/must be distinct|tracker genesis input does not match/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...buildInput(),
      sourceFundingBox: trackerGenesisInputBox,
    })).rejects.toThrow(/must be distinct/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...buildInput(),
      trackerGenesisInputBox: {
        ...trackerGenesisInputBox,
        boxId: 'a1'.repeat(32),
      },
    })).rejects.toThrow(/differs from calculated|boxId does not match/);
  });

  it('snapshots the branded compiled instance exactly once', async () => {
    const canonical = buildInput();
    const decodedAlias = structuredClone(compiled);
    let reads = 0;
    const input = {
      ...canonical,
    } as Record<string, unknown>;
    Object.defineProperty(input, 'compiledInstance', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? compiled : decodedAlias;
      },
    });

    const packet = await buildValidityApplicationLineageProvisioningV3(
      input as unknown as BuildValidityApplicationLineageProvisioningV3Input,
    );
    expect(reads).toBe(1);
    expect(Object.values(packet.transactions).map(tx => tx.txId))
      .toEqual(EXPECTED_TRANSACTION_IDS);
  });

  it('accepts a second valid amount and recipient binding', async () => {
    const input = buildInput();
    const packet = await buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '40000000',
        recipientAddressHex: `0x${'88'.repeat(20)}`,
      },
    });
    const intent = decodePegInSourceIntentV2Hex(packet.sourceIntentHex);
    expect(intent.amountNanoErg).toBe('40000000');
    expect(intent.recipientAddressHex).toBe(`0x${'88'.repeat(20)}`);
    expect(packet.boxes.sourceLock.value).toBe('40000000');
    expect(packet.boxes.causalVault.value).toBe('40000000');
  });

  it.each([
    ['source network', 'sourceNetworkIdHex', `0x${'91'.repeat(32)}`],
    ['sidechain', 'sidechainIdHex', `0x${'92'.repeat(32)}`],
    ['bridge address', 'bridgeAddressHex', `0x${'93'.repeat(20)}`],
    ['token address', 'tokenAddressHex', `0x${'94'.repeat(20)}`],
    ['settlement profile', 'settlementProfileIdHex', `0x${'95'.repeat(32)}`],
    ['causal profile', 'admissionProfileIdHex', `0x${'96'.repeat(32)}`],
    ['source asset', 'sourceAssetIdHex', `0x${'97'.repeat(32)}`],
  ])('rejects source-intent %s drift', async (_label, field, value) => {
    const input = buildInput();
    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        [field]: value,
      },
    })).rejects.toThrow(/source intent .* does not match/);
  });

  it('rejects invalid amount, recipient, and source-intent shape', async () => {
    const input = buildInput();
    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      depositorErgoTreeHex: 'ff',
    })).rejects.toThrow(/valid ErgoTree|canonically serialized/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '999999',
      },
    })).rejects.toThrow(/below the minimum box value/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        recipientAddressHex: `0x${'00'.repeat(20)}`,
      },
    })).rejects.toThrow(/recipient .*must not be zero/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        unexpectedAuthority: true,
      } as PegInSourceIntentV2,
    })).rejects.toThrow(/unknown unexpectedAuthority/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      fees: null,
    } as unknown as BuildValidityApplicationLineageProvisioningV3Input))
      .rejects.toThrow(/fees must be an object/);
  });

  it('rejects underfunding, dust change, fractional fees, and timeout drift', async () => {
    const input = buildInput();
    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '99000000',
      },
    })).rejects.toThrow(/underfunded/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      sourceIntent: {
        ...input.sourceIntent,
        amountNanoErg: '97300000',
      },
    })).rejects.toThrow(/dust output/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      fees: {
        ...input.fees,
        trackerIssuanceNanoErg: 1.5,
      },
    })).rejects.toThrow(/exact integer/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      values: {
        ...input.values,
        trackerNanoErg: { valueOf: () => 2_000_000 },
      },
    } as BuildValidityApplicationLineageProvisioningV3Input))
      .rejects.toThrow(/integer string, number, or bigint/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      creationHeights: {
        ...input.creationHeights,
        sourceCommitment:
          input.creationHeights.sourceLockCreation + 10_000,
      },
    })).rejects.toThrow(/at or after the refund timeout/);
  });

  it('rejects backwards heights and unknown provisioning fields', async () => {
    const input = buildInput();
    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      creationHeights: {
        ...input.creationHeights,
        trackerIssuance: trackerGenesisInputBox.creationHeight - 1,
      },
    })).rejects.toThrow(/predates its genesis input/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      creationHeights: {
        ...input.creationHeights,
        sourceCommitment: input.creationHeights.sourceLockCreation - 1,
      },
    })).rejects.toThrow(/predates the source lock/);

    await expect(buildValidityApplicationLineageProvisioningV3({
      ...input,
      configuredTrackerId: compiled.genesis.trackerNftIdHex,
    } as BuildValidityApplicationLineageProvisioningV3Input))
      .rejects.toThrow(/unknown configuredTrackerId/);
  });
});

function buildInput(): BuildValidityApplicationLineageProvisioningV3Input {
  return {
    compiledInstance: compiled,
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    sourceFundingBox,
    sourceIntent: sourceIntent(),
    depositorErgoTreeHex: DEPOSITOR_TREE,
    values: {
      trackerNanoErg: '2000000',
      duplicatePreventionNanoErg: '2000000',
    },
    fees: {
      trackerIssuanceNanoErg: MINER_FEE,
      duplicatePreventionIssuanceNanoErg: MINER_FEE,
      sourceLockCreationNanoErg: MINER_FEE,
      sourceCommitmentNanoErg: MINER_FEE,
    },
    creationHeights: {
      trackerIssuance: 112,
      duplicatePreventionIssuance: 112,
      sourceLockCreation: 112,
      sourceCommitment: 113,
    },
  };
}

function sourceIntent(): PegInSourceIntentV2 {
  return {
    formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
    sidechainIdHex: `0x${'22'.repeat(32)}`,
    bridgeAddressHex: `0x${'33'.repeat(20)}`,
    tokenAddressHex: `0x${'44'.repeat(20)}`,
    settlementProfileIdHex: `0x${'55'.repeat(32)}`,
    admissionProfileIdHex: compiled.lineageProfileIdHex,
    sourceAssetIdHex: `0x${'00'.repeat(32)}`,
    amountNanoErg: SOURCE_AMOUNT,
    recipientAddressHex: `0x${'66'.repeat(20)}`,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
