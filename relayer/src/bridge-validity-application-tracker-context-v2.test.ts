import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
  deriveBridgeCheckpointCommitmentHex,
} from './bridge-checkpoint-commitment.js';
import {
  decodeBridgeValidityApplicationPayloadV3,
  encodeBridgeValidityApplicationPayloadV3,
  encodeEip0045BridgeApplicationStatementV2,
} from './bridge-validity-application-statement-v2.js';
import {
  buildEip0045BridgeApplicationProofEnvelopeV2,
} from './bridge-validity-application-proof-envelope-v2.js';
import {
  EIP0045_APPLICATION_TRACKER_INITIAL_INGRESS_BYTES,
  buildEip0045BridgeApplicationTrackerContextV2,
} from './bridge-validity-application-tracker-context-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  decodeBridgeValidityFinalityPayloadV2,
} from './bridge-validity-finality-statement-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES,
} from './bridge-validity-proof-envelope-v1.js';
import {
  buildErgoExtensionMembershipProof,
} from './ergo-extension-membership.js';
import {
  buildBridgeValidityTrackerCanonicalHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  buildApplicationValiditySpvAdmissionV2,
} from './spv-tracker-validity-v2.js';

const finalityVector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/bridge-validity-finality-statement-v2.json',
    import.meta.url,
  ),
  'utf8',
));

async function admissionFixture() {
  const finalityBytes =
    Buffer.from(finalityVector.expected.encodedPayloadHex, 'hex');
  const checkpoint = Buffer.from(finalityBytes.subarray(76, 292));
  checkpoint.fill(0x22, 4, 36);
  checkpoint.copy(finalityBytes, 76);
  const checkpointCommitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(checkpoint),
    'hex',
  );
  checkpointCommitment.copy(finalityBytes, 292);
  Buffer.concat([
    checkpoint.subarray(108, 140),
    checkpointCommitment,
  ]).copy(finalityBytes, 590);
  const finality = decodeBridgeValidityFinalityPayloadV2(finalityBytes);
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityBytes,
    application: {
      sourceNetworkIdHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
      sidechainIdHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
      bridgeAddressHex: '33'.repeat(20),
      tokenAddressHex: '44'.repeat(20),
      settlementProfileIdHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
      causalProfileIdHex:
        EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
      bridgeRuntimeCodeSha256Hex: 'bb'.repeat(32),
      bridgeRuntimeCodeBytes: 4_096,
      tokenRuntimeCodeSha256Hex: 'cc'.repeat(32),
      tokenRuntimeCodeBytes: 2_048,
    },
  });
  expect(applicationPayload.subarray(701, 941).toString('hex'))
    .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX);
  const statement = encodeEip0045BridgeApplicationStatementV2({
    chainDomainIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    profileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    contractIdHex: EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
    applicationPayload,
  });
  const envelope = buildEip0045BridgeApplicationProofEnvelopeV2({
    proofChunks: EIP0045_BRIDGE_VALIDITY_PROOF_CHUNK_BYTES.map(
      (length, index) => Buffer.alloc(length, 0x61 + index),
    ),
    applicationPayload,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    profileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatement: statement,
    chainDomainIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    contractPropositionBytes:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  });
  const expected = {
    chainDomainIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    contractPropositionBytes:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
    rawSealDigestHex: envelope.rawSealDigestHex,
  };
  const membership = buildErgoExtensionMembershipProof([
    {
      key: Buffer.from('0201', 'hex'),
      value: Buffer.from('bb'.repeat(32), 'hex'),
    },
    {
      key: Buffer.from('0301', 'hex'),
      value: Buffer.from('dd'.repeat(32), 'hex'),
    },
    {
      key: Buffer.from(finality.extensionKeyHex, 'hex'),
      value: Buffer.from(finality.extensionValueHex, 'hex'),
    },
  ], Buffer.from(finality.extensionKeyHex, 'hex'));
  const wasmModule = await import('ergo-lib-wasm-nodejs');
  const wasm = wasmModule.default ?? wasmModule;
  const headerContext =
    buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
      currentHeight: 2_000,
      anchorContextIndex: 3,
      anchorExtensionRootHex: membership.root.toString('hex'),
    });
  const application =
    decodeBridgeValidityApplicationPayloadV3(applicationPayload).application;
  const plan = buildApplicationValiditySpvAdmissionV2({
    encodedStatement: statement,
    expectedContractIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
    trackerNftIdHex: finality.trackerNftIdHex,
    extensionProofHex: membership.proof.toString('hex'),
    suppliedAnchorTuple: {
      idHex: headerContext.anchorHeader.id,
      height: headerContext.anchorHeader.height,
      extensionRootHex: headerContext.anchorHeader.extensionRootHex,
      contextIndex: headerContext.anchorContextIndex,
    },
    expectedSourceNetworkIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    expectedSidechainIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    expectedTrustAnchorDigestHex: finality.trustedAnchorDigestHex,
    expectedApplicationBindingDigestHex:
      decodeBridgeValidityApplicationPayloadV3(applicationPayload)
        .applicationBindingDigestHex,
    expectedSettlementProfileIdHex:
      application.settlementProfileIdHex,
    expectedCausalProfileIdHex: application.causalProfileIdHex,
    history: [],
    currentCounter: 0,
    currentLatestSidechainHeight:
      BigInt(finality.checkpoint.sidechainHeight) - 1n,
    currentStampHeight: 1_990,
    currentErgoHeight: 2_000,
  });
  return { envelope, expected, plan, headerContext };
}

describe('EIP-0045 application tracker ContextExtension V2', () => {
  it('round-trips the proof, 973-byte payload, selected header, and successor', async () => {
    const { envelope, expected, plan, headerContext } =
      await admissionFixture();
    const fixture =
      await buildEip0045BridgeApplicationTrackerContextV2({
        envelope,
        expected,
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
    expect(fixture.contextExtension.applicationPayloadBytes).toBe(973);
    expect(fixture.contextExtension.proofBundleBytes).toBeGreaterThan(8);
    expect(fixture.contextExtension.headerIndex).toBe(3);
    expect(fixture.prooflessTransactionBytes)
      .toBeLessThanOrEqual(EIP0045_APPLICATION_TRACKER_INITIAL_INGRESS_BYTES);
    expect(fixture.prooflessTransactionIdHex)
      .toBe(fixture.unsignedTransactionIdHex);
    expect(fixture.eip12UnsignedTransaction.outputs[0].ergoTree)
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX);
    expect(fixture.eip12UnsignedTransaction.outputs[0].additionalRegisters)
      .toEqual(plan.successorRegisters);
    expect(fixture.wasmRoundTripEip12)
      .toEqual(fixture.eip12UnsignedTransaction);
    expect(fixture.trackerTransition.applicationBindingHex)
      .toBe(EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX);
    expect(fixture.boundaries).toEqual({
      serializationConformanceOnly: true,
      exactTrackerSuccessorIncluded: true,
      exactContractPinnedApplicationProfileIncluded: true,
      selectedHeaderTupleIncluded: true,
      canonicalSyntheticHeaderIdsEstablished: true,
      proofValidityEstablishedByFixture: false,
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

  it('rejects caller expectation drift at the contract-profile boundary', async () => {
    const { envelope, expected, plan, headerContext } =
      await admissionFixture();
    await expect(buildEip0045BridgeApplicationTrackerContextV2({
      envelope,
      expected,
      plan: {
        ...plan,
        expectedSettlementProfileIdHex: '99'.repeat(32),
      },
      headerContext,
    })).rejects.toThrow('settlement profile');
  });

  it('rejects a different selected header tuple before JVM reduction', async () => {
    const { envelope, expected, plan, headerContext } =
      await admissionFixture();
    await expect(buildEip0045BridgeApplicationTrackerContextV2({
      envelope,
      expected,
      plan: {
        ...plan,
        suppliedAnchorTuple: {
          ...plan.suppliedAnchorTuple,
          contextIndex: 2,
        },
      },
      headerContext,
    })).rejects.toThrow('header context mismatch');
  });
});
