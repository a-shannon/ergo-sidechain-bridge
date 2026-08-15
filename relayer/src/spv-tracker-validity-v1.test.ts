import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  buildEip0045BridgeValidityStatementV1,
  decodeBridgeValidityFinalityPayloadV2,
} from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
  buildEip0045BridgeValidityProofEnvelopeV1,
} from './bridge-validity-proof-envelope-v1.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  buildErgoExtensionMembershipProof,
} from './ergo-extension-membership.js';
import {
  VALIDITY_SPV_TRACKER_DOMAIN,
  VALIDITY_SPV_TRACKER_VALUE_LENGTH,
  buildValiditySpvAdmissionV1,
  buildValiditySpvTrackerGetProof,
  decodeValiditySpvTrackerValue,
  deriveValiditySpvTrackerKey,
} from './spv-tracker-validity-v1.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));

function fixture() {
  const applicationPayload =
    vector.expected.encodedPayloadHex as string;
  const payload = decodeBridgeValidityFinalityPayloadV2(applicationPayload);
  const statement = buildEip0045BridgeValidityStatementV1({
    chainDomainIdHex: vector.input.chainDomainIdHex,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    contractPropositionBytes:
      EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
    applicationPayload,
  });
  const envelope = buildEip0045BridgeValidityProofEnvelopeV1({
    proofChunks: EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.map(
      (length, index) => Buffer.alloc(length, 0x41 + index),
    ),
    applicationPayload,
    programIdHex: EIP0045_BRIDGE_VALIDITY_GUEST_PROGRAM_ID_HEX,
    profileIdHex: EIP0045_BRIDGE_VALIDITY_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement.encodedStatementHex,
    chainDomainIdHex: vector.input.chainDomainIdHex,
    contractPropositionBytes:
      EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
  });
  const membership = buildErgoExtensionMembershipProof([
    {
      key: Buffer.from('0101', 'hex'),
      value: Buffer.from('aa'.repeat(32), 'hex'),
    },
    {
      key: Buffer.from(payload.extensionKeyHex, 'hex'),
      value: Buffer.from(payload.extensionValueHex, 'hex'),
    },
  ], Buffer.from(payload.extensionKeyHex, 'hex'));

  return {
    payload,
    envelope,
    membership,
    input: {
      envelope,
      expectedEnvelope: {
        chainDomainIdHex: envelope.chainDomainIdHex,
        contractPropositionBytes:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
        rawSealDigestHex: envelope.rawSealDigestHex,
      },
      trackerNftIdHex: payload.trackerNftIdHex,
      extensionProofHex: membership.proof.toString('hex'),
      anchorHeader: {
        idHex: 'ab'.repeat(32),
        height: 997,
        extensionRootHex: membership.root.toString('hex'),
        contextIndex: 2,
      },
      approvedSidechainIdHex: payload.checkpoint.sidechainIdHex,
      approvedTrustAnchorDigestHex: payload.trustedAnchorDigestHex,
      history: [],
      currentCounter: 7,
      currentLatestSidechainHeight:
        BigInt(payload.checkpoint.sidechainHeight) - 1n,
      currentStampHeight: 990,
      currentErgoHeight: 1_000,
    },
  };
}

describe('SPVTrackerValidityV1 transition planner', () => {
  it('binds the proof, approved trust root, 0x0401 anchor and exact successor', () => {
    const { input, payload } = fixture();
    const plan = buildValiditySpvAdmissionV1(input);

    expect(VALIDITY_SPV_TRACKER_DOMAIN).toBe('E2S_SPV_VALIDITY_V1');
    expect(plan.trackerNftIdHex).toBe(payload.trackerNftIdHex);
    expect(plan.approvedTrustAnchorDigestHex)
      .toBe(payload.trustedAnchorDigestHex);
    expect(plan.encodedPayloadHex).toBe(payload.encodedPayloadHex);
    expect(plan.checkpointCommitmentHex)
      .toBe(payload.checkpointCommitmentHex);
    expect(plan.extensionValueHex).toBe(payload.extensionValueHex);
    expect(plan.trackerKeyHex).toBe(deriveValiditySpvTrackerKey({
      sidechainIdHex: payload.checkpoint.sidechainIdHex,
      sidechainHeight: payload.checkpoint.sidechainHeight,
      executionBlockHashHex: payload.checkpoint.executionBlockHashHex,
    }));
    expect(plan.trackerValueHex).toHaveLength(
      VALIDITY_SPV_TRACKER_VALUE_LENGTH * 2,
    );
    expect(plan.inputDigestHex).toHaveLength(66);
    expect(plan.successorDigestHex).toHaveLength(66);
    expect(plan.successorDigestHex).not.toBe(plan.inputDigestHex);
    expect(plan.avlInsertProofHex.length).toBeGreaterThan(0);
    expect(plan.proofBundleHex).toBe(
      `${Buffer.from(
        BigInt(plan.extensionProofHex.length / 2)
          .toString(16)
          .padStart(16, '0'),
        'hex',
      ).toString('hex')}${plan.extensionProofHex}${plan.avlInsertProofHex}`,
    );
    expect(Object.keys(plan.inputRegisters)).toEqual([
      'R4', 'R5', 'R6', 'R7', 'R8', 'R9',
    ]);
    expect(Object.keys(plan.successorRegisters)).toEqual([
      'R4', 'R5', 'R6', 'R7', 'R8', 'R9',
    ]);
    expect(plan.successorRegisters.R9).toBe(plan.inputRegisters.R9);
    expect(plan.contextExtension.headerIndex).toBe(2);
    expect(plan.contextExtension.proofChunksHex)
      .toEqual(plan.proofChunksHex);
    expect(plan.boundaries).toEqual({
      proofTransportValidated: true,
      proofValidityEstablishedByPlanner: false,
      localAnchorMembershipValidated: true,
      profileActivated: false,
      nodeCheckPerformed: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('rejects independently relaxed fund-authorizing bindings', () => {
    const { input } = fixture();
    const cases = [
      {
        label: 'tracker NFT',
        input: { ...input, trackerNftIdHex: '01'.repeat(32) },
      },
      {
        label: 'sidechain allowlist',
        input: { ...input, approvedSidechainIdHex: '02'.repeat(32) },
      },
      {
        label: 'approved trust anchor',
        input: {
          ...input,
          approvedTrustAnchorDigestHex: '04'.repeat(32),
        },
      },
      {
        label: 'extension root',
        input: {
          ...input,
          anchorHeader: {
            ...input.anchorHeader,
            extensionRootHex: '03'.repeat(32),
          },
        },
      },
      {
        label: 'anchor depth',
        input: {
          ...input,
          anchorHeader: { ...input.anchorHeader, contextIndex: 1 },
        },
      },
      {
        label: 'monotonic sidechain height',
        input: {
          ...input,
          currentLatestSidechainHeight:
            input.envelope.consumerAbi.applicationPayloadHex.length > 0
              ? decodeBridgeValidityFinalityPayloadV2(
                input.envelope.consumerAbi.applicationPayloadHex,
              ).checkpoint.sidechainHeight
              : '0',
        },
      },
      {
        label: 'proof bytes',
        input: {
          ...input,
          extensionProofHex:
            `${input.extensionProofHex.slice(0, -2)}ff`,
        },
      },
    ];

    for (const testCase of cases) {
      expect(
        () => buildValiditySpvAdmissionV1(testCase.input),
        testCase.label,
      ).toThrow();
    }
  });

  it('rejects an envelope bound to the legacy 85-byte consumer', () => {
    const { input } = fixture();

    expect(() => buildValiditySpvAdmissionV1({
      ...input,
      expectedEnvelope: {
        ...input.expectedEnvelope,
        contractPropositionBytes: '00',
      },
    })).toThrow('expected binding mismatch');
  });

  it('strictly decodes an existing 264-byte value and builds its V1 get proof', () => {
    const { input } = fixture();
    const admission = buildValiditySpvAdmissionV1(input);
    const proof = buildValiditySpvTrackerGetProof(
      [{ key: admission.trackerKeyHex, value: admission.trackerValueHex }],
      {
        sidechainIdHex: input.approvedSidechainIdHex,
        sidechainHeight: admission.sidechainHeight,
        executionBlockHashHex:
          decodeBridgeValidityFinalityPayloadV2(
            input.envelope.consumerAbi.applicationPayloadHex,
          ).checkpoint.executionBlockHashHex,
      },
    );
    const value = decodeValiditySpvTrackerValue(proof.valueHex);

    expect(proof.keyHex).toBe(admission.trackerKeyHex);
    expect(proof.digestHex).toHaveLength(66);
    expect(value.bridgeEventRootHex).toHaveLength(64);
    expect(value.anchorHeaderHeight).toBe(input.anchorHeader.height);
    expect(value.compatibilityProofSystemId).toBe(1);
    expect(() => decodeValiditySpvTrackerValue(`${proof.valueHex}00`))
      .toThrow(/264/);
    const unsupported = Buffer.from(proof.valueHex, 'hex');
    unsupported.writeUInt32BE(2, 100);
    expect(() => decodeValiditySpvTrackerValue(unsupported.toString('hex')))
      .toThrow(/proof-system ID/);
  });
});
