import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  EIP0045_INITIAL_TRANSACTION_INGRESS_BYTES,
  buildEip0045BridgeValidityTrackerContextV1,
} from './bridge-validity-tracker-context-v1.js';
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
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  buildValiditySpvAdmissionV1,
} from './spv-tracker-validity-v1.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));

async function admissionFixture() {
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
      (length, index) => Buffer.alloc(length, 0x51 + index),
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
      key: Buffer.from(payload.extensionKeyHex, 'hex'),
      value: Buffer.from(payload.extensionValueHex, 'hex'),
    },
    {
      key: Buffer.from('0501', 'hex'),
      value: Buffer.from('bb'.repeat(32), 'hex'),
    },
  ], Buffer.from(payload.extensionKeyHex, 'hex'));
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const headerContext =
    buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight: 2_000,
    anchorContextIndex: 3,
    anchorExtensionRootHex: membership.root.toString('hex'),
  });
  const plan = buildValiditySpvAdmissionV1({
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
      idHex: headerContext.anchorHeader.id,
      height: headerContext.anchorHeader.height,
      extensionRootHex: headerContext.anchorHeader.extensionRootHex,
      contextIndex: headerContext.anchorContextIndex,
    },
    approvedSidechainIdHex: payload.checkpoint.sidechainIdHex,
    approvedTrustAnchorDigestHex: payload.trustedAnchorDigestHex,
    history: [],
    currentCounter: 0,
    currentLatestSidechainHeight:
      BigInt(payload.checkpoint.sidechainHeight) - 1n,
    currentStampHeight: 1_990,
    currentErgoHeight: 2_000,
  });
  return { plan, headerContext };
}

describe('EIP-0045 validity tracker ContextExtension V1', () => {
  it('round-trips all four exact variables with the AVL successor output', async () => {
    const { plan, headerContext } = await admissionFixture();
    const fixture = await buildEip0045BridgeValidityTrackerContextV1({
      plan,
      headerContext,
    });
    expect(fixture.contextExtension.keys).toEqual([0, 1, 2, 3]);
    expect(fixture.contextExtension.valueTypes).toEqual([
      'Coll[Coll[Byte]]',
      'Coll[Byte]',
      'Coll[Byte]',
      'Int',
    ]);
    expect(fixture.contextExtension.proofChunkLengths)
      .toEqual(EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES);
    expect(fixture.contextExtension.applicationPayloadBytes).toBe(654);
    expect(fixture.contextExtension.proofBundleBytes).toBeGreaterThan(8);
    expect(fixture.contextExtension.headerIndex).toBe(3);
    expect(fixture.contextExtension.serializedBytes)
      .toBe(223_720);
    expect(fixture.contextExtension.serializedBlake2b256Hex)
      .toBe('ce306f6495101470c3469011014bef166f481694e039204c8285f1fb5ac7d3f1');
    expect(fixture.prooflessTransactionBytes)
      .toBe(225_698);
    expect(fixture.prooflessTransactionHex)
      .toHaveLength(fixture.prooflessTransactionBytes * 2);
    expect(fixture.prooflessTransactionBytes)
      .toBeLessThanOrEqual(EIP0045_INITIAL_TRANSACTION_INGRESS_BYTES);
    expect(fixture.prooflessTransactionIdHex)
      .toBe(fixture.unsignedTransactionIdHex);
    expect(fixture.prooflessTransactionIdHex)
      .toBe('cfce96b87dfb0a64e17ace8269089d07e29a0b86c09da7a152885a92bd524f12');
    expect(fixture.eip12UnsignedTransaction.outputs[0].ergoTree)
      .toBe(EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX);
    expect(fixture.eip12UnsignedTransaction.outputs[0].additionalRegisters)
      .toEqual(plan.successorRegisters);
    expect(Object.keys(
      fixture.eip12UnsignedTransaction.outputs[0].additionalRegisters,
    )).toEqual(['R4', 'R5', 'R6', 'R7', 'R8', 'R9']);
    expect(fixture.trackerTransition).toMatchObject({
      trackerNftIdHex: plan.trackerNftIdHex,
      approvedTrustAnchorDigestHex:
        plan.approvedTrustAnchorDigestHex,
      inputRegisters: plan.inputRegisters,
      successorRegisters: plan.successorRegisters,
      currentErgoHeight: plan.currentErgoHeight,
      anchorHeader: plan.anchorHeader,
      provenance:
        'eip0045-validity-tracker-canonical-synthetic-header-context',
    });
    expect(fixture.eip12UnsignedTransaction.outputs[0].assets).toEqual([{
      tokenId: plan.trackerNftIdHex,
      amount: '1',
    }]);
    expect(fixture.wasmRoundTripEip12)
      .toEqual(fixture.eip12UnsignedTransaction);
    expect(fixture.boundaries).toEqual({
      serializationConformanceOnly: true,
      exactTrackerSuccessorIncluded: true,
      canonicalSyntheticHeaderIdsEstablished: true,
      minedHeaderEvidenceEstablished: false,
      signingPerformed: false,
      nodeCheckPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      profileActivated: false,
      gate5Closed: false,
      fundsAuthorityEstablished: false,
    });
  });

  it('rejects a non-integer header selector before serialization', async () => {
    const { plan, headerContext } = await admissionFixture();

    await expect(buildEip0045BridgeValidityTrackerContextV1({
      plan: {
        ...plan,
        contextExtension: {
          ...plan.contextExtension,
          headerIndex: 1.5,
        },
      },
      headerContext,
    })).rejects.toThrow('header index');
  });
});
