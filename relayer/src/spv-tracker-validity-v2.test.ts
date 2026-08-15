import { readFileSync } from 'fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  decodeBridgeValidityApplicationPayloadV3,
  encodeBridgeValidityApplicationPayloadV3,
  encodeEip0045BridgeApplicationStatementV2,
  type BridgeCausalApplicationBindingV2Input,
} from './bridge-validity-application-statement-v2.js';
import {
  buildEip0045BridgeValidityStatementV1,
} from './bridge-validity-finality-statement-v2.js';
import {
  buildErgoExtensionMembershipProof,
} from './ergo-extension-membership.js';
import {
  encodeValiditySpvTrackerValue,
  deriveValiditySpvTrackerKey,
} from './spv-tracker-validity-v1.js';
import {
  APPLICATION_VALIDITY_SPV_TRACKER_KEY_DOMAIN,
  APPLICATION_VALIDITY_SPV_TRACKER_PAYLOAD_DIGEST_DOMAIN,
  APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN,
  APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  buildApplicationValiditySpvAdmissionV2,
  buildApplicationValiditySpvTrackerGetProof,
  decodeApplicationValiditySpvTrackerValue,
  deriveApplicationValidityPayloadDigestHex,
  deriveApplicationValiditySpvTrackerKey,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';

const finalityVector = JSON.parse(readFileSync(
  new URL('../test-vectors/bridge-validity-finality-statement-v2.json', import.meta.url),
  'utf8',
));

const application = Object.freeze({
  sourceNetworkIdHex: 'aa'.repeat(32),
  sidechainIdHex: '11'.repeat(32),
  bridgeAddressHex: '22'.repeat(20),
  tokenAddressHex: '21'.repeat(20),
  settlementProfileIdHex: 'bb'.repeat(32),
  causalProfileIdHex: '80fb647618a990b24084ecceaa810822c14d2649c998908043b21120b07e67ee',
  bridgeRuntimeCodeSha256Hex:
    'ba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751',
  bridgeRuntimeCodeBytes: 4_104,
  tokenRuntimeCodeSha256Hex:
    '43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989',
  tokenRuntimeCodeBytes: 2_356,
}) satisfies BridgeCausalApplicationBindingV2Input;

const SYNTHETIC_APPLICATION_TRACKER_CONTRACT_ID = 'd6'.repeat(32);
const GOLDEN_TRACKER_KEY =
  '2046793acccb5f3c68a7ec0d9492feda55df2e93a58f8b2b68d018c1186a4cb1';
const GOLDEN_APPLICATION_PAYLOAD_DIGEST =
  '1d9bfdb9df93409245506119de2029f1bf7d7de98015edc4f8b6d6cc4852b0cf';
const GOLDEN_TRACKER_VALUE_DIGEST =
  '5f540cde992816efd7f8d1b8ace1ffeb1751b7631a58694711f65594adbd0994';
const GOLDEN_STATEMENT_DIGEST =
  'e833e8373adf11c2ec8a3b3eb6ddca64e830d06099a8cf4c3842fd259d5c522c';
const GOLDEN_EMPTY_DIGEST =
  'f9a5e8f6fc09e375536df15393c57666780088d1d2d23e82f35776205472e6f000';
const GOLDEN_SUCCESSOR_DIGEST =
  'c05b169c6fdde587658a4724de05e214d9f2514724e236c168209a237cf758a101';

function buildApplicationStatement(
  binding: BridgeCausalApplicationBindingV2Input = application,
  outer: Partial<{
    chainDomainIdHex: string;
    profileIdHex: string;
    programIdHex: string;
    contractIdHex: string;
  }> = {},
): Buffer {
  const applicationPayload = encodeBridgeValidityApplicationPayloadV3({
    finalityPayload: finalityVector.expected.encodedPayloadHex as string,
    application: binding,
  });
  return encodeEip0045BridgeApplicationStatementV2({
    chainDomainIdHex: binding.sourceNetworkIdHex,
    profileIdHex: EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    contractIdHex: SYNTHETIC_APPLICATION_TRACKER_CONTRACT_ID,
    applicationPayload,
    ...outer,
  });
}

function fixture() {
  const statement = buildApplicationStatement();
  const payload = decodeBridgeValidityApplicationPayloadV3(
    statement.subarray(159),
  );
  const membership = buildErgoExtensionMembershipProof([
    {
      key: Buffer.from('0101', 'hex'),
      value: Buffer.from('aa'.repeat(32), 'hex'),
    },
    {
      key: Buffer.from(payload.finality.extensionKeyHex, 'hex'),
      value: Buffer.from(payload.finality.extensionValueHex, 'hex'),
    },
  ], Buffer.from(payload.finality.extensionKeyHex, 'hex'));
  const input = {
    encodedStatement: statement,
    expectedContractIdHex: SYNTHETIC_APPLICATION_TRACKER_CONTRACT_ID,
    trackerNftIdHex: payload.finality.trackerNftIdHex,
    extensionProofHex: membership.proof.toString('hex'),
    suppliedAnchorTuple: {
      idHex: 'ab'.repeat(32),
      height: 997,
      extensionRootHex: membership.root.toString('hex'),
      contextIndex: 2,
    },
    expectedSourceNetworkIdHex: application.sourceNetworkIdHex,
    expectedSidechainIdHex: application.sidechainIdHex,
    expectedTrustAnchorDigestHex: payload.finality.trustedAnchorDigestHex,
    expectedApplicationBindingDigestHex:
      payload.applicationBindingDigestHex,
    expectedSettlementProfileIdHex: application.settlementProfileIdHex,
    expectedCausalProfileIdHex: application.causalProfileIdHex,
    history: [],
    currentCounter: 7,
    currentLatestSidechainHeight:
      BigInt(payload.finality.checkpoint.sidechainHeight) - 1n,
    currentStampHeight: 990,
    currentErgoHeight: 1_000,
  };
  return { input, membership, payload, statement };
}

function trackerValueDigestHex(valueHex: string): string {
  return Buffer.from(blakejs.blake2b(
    Buffer.from(valueHex, 'hex'),
    undefined,
    32,
  )).toString('hex');
}

function mutateByte(bytes: Buffer, offset: number, value?: number): Buffer {
  const changed = Buffer.from(bytes);
  changed[offset] = value ?? (changed[offset] ^ 0x80);
  return changed;
}

describe('application-bound SPV tracker V2', () => {
  it('pins the distinct key, 370-byte value, payload digest and AVL successor', () => {
    const { input, payload } = fixture();
    const plan = buildApplicationValiditySpvAdmissionV2(input);
    const decodedValue =
      decodeApplicationValiditySpvTrackerValue(plan.trackerValueHex);
    const valueBytes = Buffer.from(plan.trackerValueHex, 'hex');
    const domainBytes = Buffer.byteLength(
      APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN,
      'ascii',
    );

    expect(APPLICATION_VALIDITY_SPV_TRACKER_KEY_DOMAIN)
      .toBe('E2S_SPV_VALIDITY_APPLICATION_KEY_V2');
    expect(APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN)
      .toBe('E2S_SPV_VALIDITY_APPLICATION_VALUE_V2');
    expect(APPLICATION_VALIDITY_SPV_TRACKER_PAYLOAD_DIGEST_DOMAIN)
      .toBe('E2S_SPV_VALIDITY_APPLICATION_PAYLOAD_DIGEST_V2');
    expect(plan.trackerKeyHex).toBe(GOLDEN_TRACKER_KEY);
    expect(plan.applicationPayloadDigestHex)
      .toBe(GOLDEN_APPLICATION_PAYLOAD_DIGEST);
    expect(plan.statementDigestHex).toBe(GOLDEN_STATEMENT_DIGEST);
    expect(plan.inputDigestHex).toBe(GOLDEN_EMPTY_DIGEST);
    expect(plan.successorDigestHex).toBe(GOLDEN_SUCCESSOR_DIGEST);
    expect(trackerValueDigestHex(plan.trackerValueHex))
      .toBe(GOLDEN_TRACKER_VALUE_DIGEST);
    expect(valueBytes).toHaveLength(
      APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
    );
    expect(valueBytes.subarray(0, domainBytes).toString('ascii'))
      .toBe(APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN);
    expect(valueBytes[domainBytes]).toBe(0);
    expect([...valueBytes.subarray(domainBytes + 1, domainBytes + 5)])
      .toEqual([2, 1, 1, 0]);
    expect(valueBytes.readUInt32BE(138)).toBe(997);
    expect(valueBytes.readUInt32BE(174))
      .toBe(payload.finality.checkpoint.burnLeafCount);
    expect(decodedValue).toMatchObject({
      bridgeEventRootHex: payload.finality.checkpoint.bridgeEventRootHex,
      checkpointCommitmentHex: payload.finality.checkpointCommitmentHex,
      anchorHeaderIdHex: 'ab'.repeat(32),
      anchorHeaderHeight: 997,
      sidechainConsensusBlockHashHex:
        payload.finality.checkpoint.sidechainConsensusBlockHashHex,
      burnLeafCount: payload.finality.checkpoint.burnLeafCount,
      applicationBindingDigestHex: payload.applicationBindingDigestHex,
      settlementProfileIdHex: application.settlementProfileIdHex,
      causalProfileIdHex: application.causalProfileIdHex,
      applicationPayloadDigestHex: GOLDEN_APPLICATION_PAYLOAD_DIGEST,
      programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
      verifierProfileIdHex:
        EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    });
    expect(plan.inputRegisters.R9).toBe(plan.successorRegisters.R9);
    expect(plan.inputRegisters.R5).not.toBe(plan.successorRegisters.R5);
    expect(plan.boundaries).toEqual({
      statementCodecValidated: true,
      applicationBindingMatched: true,
      suppliedAnchorRootMembershipValidated: true,
      anchorHeaderTupleAuthenticated: false,
      expectedIdentitiesAuthorityEstablished: false,
      avlTransitionConstructed: true,
      proofTransportValidated: false,
      proofValidityEstablishedByPlanner: false,
      profileActivated: false,
      onChainAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('builds a stable membership proof while rejecting V1 cross-consumption', () => {
    const { input, payload } = fixture();
    const plan = buildApplicationValiditySpvAdmissionV2(input);
    const history = [{
      key: plan.trackerKeyHex,
      value: plan.trackerValueHex,
    }];
    const getProof = buildApplicationValiditySpvTrackerGetProof(history, {
      sidechainIdHex: payload.finality.checkpoint.sidechainIdHex,
      sidechainHeight: payload.finality.checkpoint.sidechainHeight,
      executionBlockHashHex:
        payload.finality.checkpoint.executionBlockHashHex,
    });
    expect(getProof.valueHex).toBe(plan.trackerValueHex);
    expect(getProof.digestHex).toBe(plan.successorDigestHex);
    expect(getApplicationValiditySpvTrackerDigest(history))
      .toBe(plan.successorDigestHex);
    expect(getProof.getProofHex.length).toBeGreaterThan(0);

    const v1Key = deriveValiditySpvTrackerKey({
      sidechainIdHex: payload.finality.checkpoint.sidechainIdHex,
      sidechainHeight: payload.finality.checkpoint.sidechainHeight,
      executionBlockHashHex:
        payload.finality.checkpoint.executionBlockHashHex,
    });
    expect(v1Key).not.toBe(plan.trackerKeyHex);

    const v1Value = encodeValiditySpvTrackerValue({
      bridgeEventRootHex: '11'.repeat(32),
      checkpointCommitmentHex: '12'.repeat(32),
      anchorHeaderIdHex: '13'.repeat(32),
      anchorHeaderHeight: 1,
      compatibilityStatementDigestHex: '14'.repeat(32),
      compatibilitySemanticProgramIdHex: '15'.repeat(32),
      compatibilityVerifierProfileIdHex: '16'.repeat(32),
      compatibilityPayloadDigestHex: '17'.repeat(32),
      compatibilityAggregateProofDigestHex: '18'.repeat(32),
    });
    expect(() => decodeApplicationValiditySpvTrackerValue(v1Value))
      .toThrow('must be exactly 370');

    const v1Statement = buildEip0045BridgeValidityStatementV1({
      chainDomainIdHex: finalityVector.input.chainDomainIdHex as string,
      profileIdHex: finalityVector.input.profileIdHex as string,
      programIdHex: finalityVector.input.programIdHex as string,
      contractPropositionBytes:
        finalityVector.input.contractPropositionBytesHex as string,
      applicationPayload:
        finalityVector.expected.encodedPayloadHex as string,
    });
    expect(() => buildApplicationValiditySpvAdmissionV2({
      ...input,
      encodedStatement: v1Statement.encodedStatementHex,
    })).toThrow('must be 1132 bytes');
  });

  it('rejects domain, discriminator, length, zero-field and numeric drift', () => {
    const plan = buildApplicationValiditySpvAdmissionV2(fixture().input);
    const value = Buffer.from(plan.trackerValueHex, 'hex');
    const discriminatorOffset =
      Buffer.byteLength(APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN, 'ascii')
      + 1;

    expect(() => decodeApplicationValiditySpvTrackerValue(
      mutateByte(value, 0).toString('hex'),
    )).toThrow('domain');
    for (const [offset, message] of [
      [discriminatorOffset, 'version'],
      [discriminatorOffset + 1, 'hash algorithm'],
      [discriminatorOffset + 2, 'source finality profile'],
      [discriminatorOffset + 3, 'flags'],
    ] as const) {
      expect(() => decodeApplicationValiditySpvTrackerValue(
        mutateByte(value, offset).toString('hex'),
      )).toThrow(message);
    }
    expect(() => decodeApplicationValiditySpvTrackerValue(
      value.subarray(0, value.length - 1).toString('hex'),
    )).toThrow('must be exactly 370');

    for (const offset of [42, 74, 106, 142, 178, 210, 242, 274, 306, 338]) {
      const changed = Buffer.from(value);
      changed.fill(0, offset, offset + 32);
      expect(() => decodeApplicationValiditySpvTrackerValue(
        changed.toString('hex'),
      )).toThrow('nonzero');
    }
    const invalidHeight = Buffer.from(value);
    invalidHeight.writeUInt32BE(0xffff_ffff, 138);
    expect(() => decodeApplicationValiditySpvTrackerValue(
      invalidHeight.toString('hex'),
    )).toThrow('nonnegative Int');
    const emptyBurnSet = Buffer.from(value);
    emptyBurnSet.writeUInt32BE(0, 174);
    expect(() => decodeApplicationValiditySpvTrackerValue(
      emptyBurnSet.toString('hex'),
    )).toThrow('burn count');
  });

  it('rejects every independently substituted outer or expected identity', () => {
    const { input } = fixture();
    const cases = [
      {
        label: 'contract',
        input: { ...input, expectedContractIdHex: '01'.repeat(32) },
      },
      {
        label: 'tracker NFT',
        input: { ...input, trackerNftIdHex: '02'.repeat(32) },
      },
      {
        label: 'source network',
        input: { ...input, expectedSourceNetworkIdHex: '03'.repeat(32) },
      },
      {
        label: 'sidechain',
        input: { ...input, expectedSidechainIdHex: '04'.repeat(32) },
      },
      {
        label: 'trust anchor',
        input: { ...input, expectedTrustAnchorDigestHex: '05'.repeat(32) },
      },
      {
        label: 'application-binding',
        input: {
          ...input,
          expectedApplicationBindingDigestHex: '06'.repeat(32),
        },
      },
      {
        label: 'settlement profile',
        input: { ...input, expectedSettlementProfileIdHex: '07'.repeat(32) },
      },
      {
        label: 'causal profile',
        input: { ...input, expectedCausalProfileIdHex: '08'.repeat(32) },
      },
    ];
    for (const testCase of cases) {
      expect(
        () => buildApplicationValiditySpvAdmissionV2(testCase.input),
        testCase.label,
      ).toThrow('does not match');
    }

    for (const [label, encodedStatement] of [
      ['verifier profile', buildApplicationStatement(application, {
        profileIdHex: 'b3'.repeat(32),
      })],
      ['guest program', buildApplicationStatement(application, {
        programIdHex: 'c4'.repeat(32),
      })],
      ['contract', buildApplicationStatement(application, {
        contractIdHex: 'd5'.repeat(32),
      })],
    ] as const) {
      expect(
        () => buildApplicationValiditySpvAdmissionV2({
          ...input,
          encodedStatement,
        }),
        label,
      ).toThrow('does not match');
    }
  });

  it('rejects a re-encoded statement for a different source application', () => {
    const { input } = fixture();
    const changedApplication = {
      ...application,
      bridgeAddressHex: '23'.repeat(20),
    };
    expect(() => buildApplicationValiditySpvAdmissionV2({
      ...input,
      encodedStatement: buildApplicationStatement(changedApplication),
    })).toThrow('application-binding digest');
  });

  it('keeps caller expectations and the supplied anchor tuple non-authoritative', () => {
    const { input } = fixture();
    const changedApplication = {
      ...application,
      bridgeAddressHex: '23'.repeat(20),
    };
    const changedStatement = buildApplicationStatement(changedApplication);
    const changedPayload = decodeBridgeValidityApplicationPayloadV3(
      changedStatement.subarray(159),
    );
    const changedAnchorIdHex = 'cd'.repeat(32);
    const plan = buildApplicationValiditySpvAdmissionV2({
      ...input,
      encodedStatement: changedStatement,
      expectedApplicationBindingDigestHex:
        changedPayload.applicationBindingDigestHex,
      suppliedAnchorTuple: {
        ...input.suppliedAnchorTuple,
        idHex: changedAnchorIdHex,
      },
    });

    expect(
      decodeApplicationValiditySpvTrackerValue(plan.trackerValueHex)
        .anchorHeaderIdHex,
    ).toBe(changedAnchorIdHex);
    expect(plan.boundaries.suppliedAnchorRootMembershipValidated).toBe(true);
    expect(plan.boundaries.anchorHeaderTupleAuthenticated).toBe(false);
    expect(plan.boundaries.expectedIdentitiesAuthorityEstablished).toBe(false);
  });

  it('rejects relaxed anchor, chronology, proof and history boundaries', () => {
    const { input } = fixture();
    const plan = buildApplicationValiditySpvAdmissionV2(input);
    const cases = [
      {
        label: 'extension root',
        input: {
          ...input,
          suppliedAnchorTuple: {
            ...input.suppliedAnchorTuple,
            extensionRootHex: 'cd'.repeat(32),
          },
        },
      },
      {
        label: 'header depth',
        input: {
          ...input,
          suppliedAnchorTuple: { ...input.suppliedAnchorTuple, height: 998 },
        },
      },
      {
        label: 'future anchor',
        input: {
          ...input,
          suppliedAnchorTuple: {
            ...input.suppliedAnchorTuple,
            height: 1_001,
          },
        },
      },
      {
        label: 'stamp',
        input: { ...input, currentStampHeight: 1_000 },
      },
      {
        label: 'sidechain height',
        input: {
          ...input,
          currentLatestSidechainHeight:
            fixture().payload.finality.checkpoint.sidechainHeight,
        },
      },
      {
        label: 'extension proof',
        input: { ...input, extensionProofHex: '00' },
      },
      {
        label: 'existing V2 key',
        input: {
          ...input,
          history: [{
            key: plan.trackerKeyHex,
            value: plan.trackerValueHex,
          }],
        },
      },
    ];
    for (const testCase of cases) {
      expect(
        () => buildApplicationValiditySpvAdmissionV2(testCase.input),
        testCase.label,
      ).toThrow();
    }

    expect(() => buildApplicationValiditySpvAdmissionV2({
      ...input,
      history: [
        { key: 'ef'.repeat(32), value: plan.trackerValueHex },
        { key: 'ef'.repeat(32), value: plan.trackerValueHex },
      ],
    })).toThrow('duplicate key');
    expect(() => deriveApplicationValidityPayloadDigestHex(
      finalityVector.expected.encodedPayloadHex as string,
    )).toThrow('must be exactly 973');
  });
});
