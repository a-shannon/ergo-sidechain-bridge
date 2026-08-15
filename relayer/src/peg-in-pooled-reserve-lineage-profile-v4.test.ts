import { describe, expect, it } from 'vitest';

import {
  PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES,
  derivePegInCausalLineageProfileV3,
  type PegInCausalLineageProfileV3Semantics,
} from './peg-in-causal-lineage-profile-v3.js';
import {
  PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES,
  PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX,
  assertDerivedPegInPooledReserveLineageProfileV4Candidate,
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4,
  derivePegInPooledReserveLineageProfileV4IdHex,
  encodePegInPooledReserveLineageProfileV4Hex,
  type DerivePegInPooledReserveLineageProfileV4Input,
  type PegInPooledReserveLineageProfileV4,
  type PegInPooledReserveLineageProfileV4Semantics,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const GENESIS_TREE = `0008cd02${'11'.repeat(32)}`;
const EXPECTED_TRACKER_GENESIS_BOX_ID =
  '00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9';
const EXPECTED_DUP_GENESIS_BOX_ID =
  '667382038b0da5742442e04629d11ca4047a73ea98da1b21ba37e5bd8a4eb538';
const EXPECTED_VAULT_GENESIS_BOX_ID =
  'b7ca9a5aaac5b702dc9e21d6f3de0f8f7d23e3932d3ac018fd64316071cb21f8';
const EXPECTED_PROFILE_ID =
  '0x52c819429179952f252c66fc1f86b26ad941aa85e9e0b4ea6b25c30651775fcd';
const EXPECTED_V3_PROFILE_ID =
  '0x2c3c6df828a4b52abef4dc60ed8c68053f37791fa5596e55af7575dcda98f016';

const SEMANTICS: PegInPooledReserveLineageProfileV4Semantics = {
  sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
  sidechainIdHex: `0x${'22'.repeat(32)}`,
  bridgeAddressHex: `0x${'33'.repeat(20)}`,
  tokenAddressHex: `0x${'44'.repeat(20)}`,
  settlementProfileIdHex: `0x${'55'.repeat(32)}`,
  sourceLockTemplateSha256Hex: `0x${'66'.repeat(32)}`,
  validityTrackerTemplateSha256Hex: `0x${'77'.repeat(32)}`,
  settlementVaultTemplateSha256Hex: `0x${'88'.repeat(32)}`,
  duplicatePreventionTemplateSha256Hex: `0x${'99'.repeat(32)}`,
  sidechainFinalityPolicyIdHex: `0x${'aa'.repeat(32)}`,
  ergoDepositFinalityPolicyIdHex: `0x${'bb'.repeat(32)}`,
  proofSystemIdHex: `0x${'cc'.repeat(32)}`,
  proofProfileIdHex: `0x${'dd'.repeat(32)}`,
  sourceCommitmentPolicyIdHex: `0x${'ee'.repeat(32)}`,
  depositCommitmentStatePolicyIdHex: `0x${'ff'.repeat(32)}`,
  profileRevision: '1',
  activationHeight: '0',
};

const V3_SEMANTICS: PegInCausalLineageProfileV3Semantics = {
  sourceNetworkIdHex: SEMANTICS.sourceNetworkIdHex,
  sidechainIdHex: SEMANTICS.sidechainIdHex,
  bridgeAddressHex: SEMANTICS.bridgeAddressHex,
  tokenAddressHex: SEMANTICS.tokenAddressHex,
  settlementProfileIdHex: SEMANTICS.settlementProfileIdHex,
  sourceLockTemplateSha256Hex: SEMANTICS.sourceLockTemplateSha256Hex,
  validityTrackerTemplateSha256Hex: SEMANTICS.validityTrackerTemplateSha256Hex,
  causalVaultTemplateSha256Hex: SEMANTICS.settlementVaultTemplateSha256Hex,
  duplicatePreventionTemplateSha256Hex:
    SEMANTICS.duplicatePreventionTemplateSha256Hex,
  finalityPolicyIdHex: `0x${'aa'.repeat(32)}`,
  proofSystemIdHex: `0x${'bb'.repeat(32)}`,
  proofProfileIdHex: `0x${'cc'.repeat(32)}`,
  sourceCommitmentPolicyIdHex: `0x${'dd'.repeat(32)}`,
  profileRevision: SEMANTICS.profileRevision,
  activationHeight: SEMANTICS.activationHeight,
};

const EXPECTED_V3_ENCODED_PROFILE_HEX = [
  '0x03',
  '11'.repeat(32),
  '22'.repeat(32),
  '33'.repeat(20),
  '44'.repeat(20),
  '55'.repeat(32),
  EXPECTED_TRACKER_GENESIS_BOX_ID,
  EXPECTED_DUP_GENESIS_BOX_ID,
  '66'.repeat(32),
  '77'.repeat(32),
  '88'.repeat(32),
  '99'.repeat(32),
  'aa'.repeat(32),
  'bb'.repeat(32),
  'cc'.repeat(32),
  'dd'.repeat(32),
  '0000000000000001',
  '0000000000000000',
].join('');

async function genesisInputs(): Promise<
  readonly [Eip12Box, Eip12Box, Eip12Box]
> {
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
  }, 'pooled-reserve lineage profile V4 genesis fixture');
  return [funding.outputs[0], funding.outputs[1], funding.outputs[2]];
}

async function deriveCandidate() {
  const [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = await genesisInputs();
  return derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    semantics: SEMANTICS,
  });
}

async function expectRoleBoxRejected(
  role: Exclude<keyof DerivePegInPooledReserveLineageProfileV4Input, 'semantics'>,
  box: Eip12Box,
  pattern: RegExp,
) {
  const [
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
  ] = await genesisInputs();
  await expect(derivePegInPooledReserveLineageProfileV4({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    settlementVaultGenesisInputBox,
    [role]: box,
    semantics: SEMANTICS,
  })).rejects.toThrow(pattern);
}

describe('peg-in pooled-reserve lineage profile V4', () => {
  it('derives all three singleton identities from exact validated genesis boxes', async () => {
    const candidate = await deriveCandidate();

    expect(PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES)
      .toBe(1 + 40 + (17 * 32) + 16);
    expect(PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES).toBe(601);
    expect(candidate.genesis.tracker.inputBox.boxId)
      .toBe(EXPECTED_TRACKER_GENESIS_BOX_ID);
    expect(candidate.genesis.duplicatePrevention.inputBox.boxId)
      .toBe(EXPECTED_DUP_GENESIS_BOX_ID);
    expect(candidate.genesis.settlementVault.inputBox.boxId)
      .toBe(EXPECTED_VAULT_GENESIS_BOX_ID);
    expect(candidate.profile.trackerGenesisInputBoxIdHex)
      .toBe(`0x${EXPECTED_TRACKER_GENESIS_BOX_ID}`);
    expect(candidate.profile.duplicatePreventionGenesisInputBoxIdHex)
      .toBe(`0x${EXPECTED_DUP_GENESIS_BOX_ID}`);
    expect(candidate.profile.settlementVaultGenesisInputBoxIdHex)
      .toBe(`0x${EXPECTED_VAULT_GENESIS_BOX_ID}`);
    expect(candidate.profile.settlementAssetIdHex)
      .toBe(PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_ERG_ASSET_ID_HEX);
    expect(candidate.genesis.tracker.singletonNftIdHex)
      .toBe(candidate.profile.trackerGenesisInputBoxIdHex);
    expect(candidate.genesis.duplicatePrevention.singletonNftIdHex)
      .toBe(candidate.profile.duplicatePreventionGenesisInputBoxIdHex);
    expect(candidate.genesis.settlementVault.singletonNftIdHex)
      .toBe(candidate.profile.settlementVaultGenesisInputBoxIdHex);
    expect(candidate.encodedProfileHex).toHaveLength(
      2 + (PEG_IN_POOLED_RESERVE_LINEAGE_PROFILE_V4_BYTES * 2),
    );
    expect(candidate.profileIdHex).toBe(EXPECTED_PROFILE_ID);
  });

  it('round-trips canonical bytes and preserves the domain-separated ID', async () => {
    const candidate = await deriveCandidate();
    const decoded = decodePegInPooledReserveLineageProfileV4Hex(
      candidate.encodedProfileHex,
    );

    expect(decoded).toEqual(candidate.profile);
    expect(encodePegInPooledReserveLineageProfileV4Hex(decoded))
      .toBe(candidate.encodedProfileHex);
    expect(derivePegInPooledReserveLineageProfileV4IdHex(decoded))
      .toBe(candidate.profileIdHex);
    expect(() => decodePegInPooledReserveLineageProfileV4Hex(
      candidate.encodedProfileHex.toUpperCase(),
    )).toThrow(/lowercase 0x-prefixed/);
    expect(() => decodePegInPooledReserveLineageProfileV4Hex(
      candidate.encodedProfileHex.slice(2),
    )).toThrow(/lowercase 0x-prefixed/);
  });

  it('changes the profile ID for every semantic and genesis field', async () => {
    const candidate = await deriveCandidate();
    const mutations: Array<
      [Exclude<keyof PegInPooledReserveLineageProfileV4, 'formatVersion'>, unknown]
    > = [
      ['sourceNetworkIdHex', `0x${'12'.repeat(32)}`],
      ['sidechainIdHex', `0x${'23'.repeat(32)}`],
      ['bridgeAddressHex', `0x${'34'.repeat(20)}`],
      ['tokenAddressHex', `0x${'45'.repeat(20)}`],
      ['settlementProfileIdHex', `0x${'56'.repeat(32)}`],
      ['trackerGenesisInputBoxIdHex', `0x${'67'.repeat(32)}`],
      ['duplicatePreventionGenesisInputBoxIdHex', `0x${'78'.repeat(32)}`],
      ['settlementVaultGenesisInputBoxIdHex', `0x${'89'.repeat(32)}`],
      ['sourceLockTemplateSha256Hex', `0x${'9a'.repeat(32)}`],
      ['validityTrackerTemplateSha256Hex', `0x${'ab'.repeat(32)}`],
      ['settlementVaultTemplateSha256Hex', `0x${'bc'.repeat(32)}`],
      ['duplicatePreventionTemplateSha256Hex', `0x${'cd'.repeat(32)}`],
      ['sidechainFinalityPolicyIdHex', `0x${'de'.repeat(32)}`],
      ['ergoDepositFinalityPolicyIdHex', `0x${'ef'.repeat(32)}`],
      ['proofSystemIdHex', `0x${'10'.repeat(32)}`],
      ['proofProfileIdHex', `0x${'20'.repeat(32)}`],
      ['sourceCommitmentPolicyIdHex', `0x${'30'.repeat(32)}`],
      ['depositCommitmentStatePolicyIdHex', `0x${'40'.repeat(32)}`],
      ['profileRevision', '2'],
      ['activationHeight', '1'],
    ];

    for (const [field, value] of mutations) {
      const mutated = {
        ...candidate.profile,
        [field]: value,
      } as PegInPooledReserveLineageProfileV4;
      expect(
        derivePegInPooledReserveLineageProfileV4IdHex(mutated),
        field,
      ).not.toBe(candidate.profileIdHex);
    }
  });

  it('rejects wrong versions, aliases, zero fields and non-canonical values', async () => {
    const candidate = await deriveCandidate();

    expect(() => encodePegInPooledReserveLineageProfileV4Hex({
      ...candidate.profile,
      formatVersion: 3,
    } as unknown as PegInPooledReserveLineageProfileV4))
      .toThrow(/format version must be exactly 4/);
    expect(() => encodePegInPooledReserveLineageProfileV4Hex({
      ...candidate.profile,
      bridgeAddressHex: candidate.profile.tokenAddressHex,
    })).toThrow(/must not alias/);

    const nonzeroHexFields: Array<
      Exclude<
        keyof PegInPooledReserveLineageProfileV4,
        | 'formatVersion'
        | 'settlementAssetIdHex'
        | 'profileRevision'
        | 'activationHeight'
      >
    > = [
      'sourceNetworkIdHex',
      'sidechainIdHex',
      'bridgeAddressHex',
      'tokenAddressHex',
      'settlementProfileIdHex',
      'trackerGenesisInputBoxIdHex',
      'duplicatePreventionGenesisInputBoxIdHex',
      'settlementVaultGenesisInputBoxIdHex',
      'sourceLockTemplateSha256Hex',
      'validityTrackerTemplateSha256Hex',
      'settlementVaultTemplateSha256Hex',
      'duplicatePreventionTemplateSha256Hex',
      'sidechainFinalityPolicyIdHex',
      'ergoDepositFinalityPolicyIdHex',
      'proofSystemIdHex',
      'proofProfileIdHex',
      'sourceCommitmentPolicyIdHex',
      'depositCommitmentStatePolicyIdHex',
    ];
    for (const field of nonzeroHexFields) {
      const bytes = field === 'bridgeAddressHex' || field === 'tokenAddressHex'
        ? 20
        : 32;
      expect(() => encodePegInPooledReserveLineageProfileV4Hex({
        ...candidate.profile,
        [field]: `0x${'00'.repeat(bytes)}`,
      }), field).toThrow(/must not be zero/);
    }
    expect(() => encodePegInPooledReserveLineageProfileV4Hex({
      ...candidate.profile,
      settlementAssetIdHex: `0x${'01'.repeat(32)}`,
    })).toThrow(/settlement asset must be native ERG/);
    expect(() => encodePegInPooledReserveLineageProfileV4Hex({
      ...candidate.profile,
      ergoDepositFinalityPolicyIdHex:
        candidate.profile.sidechainFinalityPolicyIdHex,
    })).toThrow(/finality policies must not alias/);

    for (const value of ['01', '00', '-1']) {
      expect(() => encodePegInPooledReserveLineageProfileV4Hex({
        ...candidate.profile,
        profileRevision: value,
      }), value).toThrow(/canonical decimal uint64|positive uint64/);
    }
    expect(() => encodePegInPooledReserveLineageProfileV4Hex({
      ...candidate.profile,
      activationHeight: '00',
    })).toThrow(/canonical decimal uint64/);
    expect(() => encodePegInPooledReserveLineageProfileV4Hex({
      ...candidate.profile,
      apparentContractIdHex: `0x${'ff'.repeat(32)}`,
    } as PegInPooledReserveLineageProfileV4)).toThrow(/must contain exactly/);
  });

  it('rejects every pairwise genesis alias and substituted box ID', async () => {
    const [tracker, duplicatePrevention, settlementVault] =
      await genesisInputs();
    const aliasedInputs = [
      {
        trackerGenesisInputBox: tracker,
        duplicatePreventionGenesisInputBox: tracker,
        settlementVaultGenesisInputBox: settlementVault,
      },
      {
        trackerGenesisInputBox: tracker,
        duplicatePreventionGenesisInputBox: duplicatePrevention,
        settlementVaultGenesisInputBox: tracker,
      },
      {
        trackerGenesisInputBox: tracker,
        duplicatePreventionGenesisInputBox: duplicatePrevention,
        settlementVaultGenesisInputBox: duplicatePrevention,
      },
    ];
    for (const inputs of aliasedInputs) {
      await expect(derivePegInPooledReserveLineageProfileV4({
        ...inputs,
        semantics: SEMANTICS,
      })).rejects.toThrow(/pairwise distinct/);
    }

    const rolesWithBoxes = [
      ['trackerGenesisInputBox', tracker],
      ['duplicatePreventionGenesisInputBox', duplicatePrevention],
      ['settlementVaultGenesisInputBox', settlementVault],
    ] as const;
    for (const [role, box] of rolesWithBoxes) {
      await expectRoleBoxRejected(
        role,
        { ...box, boxId: 'ff'.repeat(32) },
        /box id|boxId|calculated from box serialized bytes/i,
      );
    }
  });

  it('rejects token-bearing and register-bearing boxes in every role', async () => {
    const tokenFunding = await materializeUnsignedTransaction({
      inputs: [{ ...BASE_INPUT, extension: {} }],
      dataInputs: [],
      outputs: [
        {
          value: '100000000',
          ergoTree: GENESIS_TREE,
          assets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
          additionalRegisters: {},
          creationHeight: 111,
        },
        {
          value: '100000000',
          ergoTree: GENESIS_TREE,
          assets: [],
          additionalRegisters: {},
          creationHeight: 111,
        },
        {
          value: '100000000',
          ergoTree: GENESIS_TREE,
          assets: [],
          additionalRegisters: {},
          creationHeight: 111,
        },
      ],
    }, 'token-bearing pooled-reserve lineage profile V4 fixture');
    const registerFunding = await materializeUnsignedTransaction({
      inputs: [{ ...BASE_INPUT, extension: {} }],
      dataInputs: [],
      outputs: [
        {
          value: '100000000',
          ergoTree: GENESIS_TREE,
          assets: [],
          additionalRegisters: { R4: `0e20${'ab'.repeat(32)}` },
          creationHeight: 111,
        },
        {
          value: '100000000',
          ergoTree: GENESIS_TREE,
          assets: [],
          additionalRegisters: {},
          creationHeight: 111,
        },
        {
          value: '100000000',
          ergoTree: GENESIS_TREE,
          assets: [],
          additionalRegisters: {},
          creationHeight: 111,
        },
      ],
    }, 'register-bearing pooled-reserve lineage profile V4 fixture');
    const roles = [
      'trackerGenesisInputBox',
      'duplicatePreventionGenesisInputBox',
      'settlementVaultGenesisInputBox',
    ] as const;

    for (const role of roles) {
      await expectRoleBoxRejected(role, tokenFunding.outputs[0], /must be pure ERG/);
      await expectRoleBoxRejected(
        role,
        registerFunding.outputs[0],
        /must not carry registers/,
      );
    }
  });

  it('requires strict derivation and semantics objects', async () => {
    const [
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      settlementVaultGenesisInputBox,
    ] = await genesisInputs();

    await expect(derivePegInPooledReserveLineageProfileV4({
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      settlementVaultGenesisInputBox,
      semantics: {
        ...SEMANTICS,
        apparentContractIdHex: `0x${'ff'.repeat(32)}`,
      } as PegInPooledReserveLineageProfileV4Semantics,
    })).rejects.toThrow(/semantics must contain exactly/);
    await expect(derivePegInPooledReserveLineageProfileV4({
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      settlementVaultGenesisInputBox,
      semantics: SEMANTICS,
      apparentAuthority: true,
    } as DerivePegInPooledReserveLineageProfileV4Input))
      .rejects.toThrow(/derivation input must contain exactly/);
  });

  it('rejects accessor-backed derivation, semantics and profile fields', async () => {
    const [
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      settlementVaultGenesisInputBox,
    ] = await genesisInputs();
    const accessorInput = {
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      settlementVaultGenesisInputBox,
      get semantics() {
        return SEMANTICS;
      },
    };
    await expect(derivePegInPooledReserveLineageProfileV4(
      accessorInput as DerivePegInPooledReserveLineageProfileV4Input,
    )).rejects.toThrow(/fields must be own data properties/);

    const accessorSemantics = { ...SEMANTICS };
    Object.defineProperty(accessorSemantics, 'proofSystemIdHex', {
      enumerable: true,
      get: () => SEMANTICS.proofSystemIdHex,
    });
    await expect(derivePegInPooledReserveLineageProfileV4({
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      settlementVaultGenesisInputBox,
      semantics: accessorSemantics,
    })).rejects.toThrow(/fields must be own data properties/);

    const candidate = await deriveCandidate();
    const accessorProfile = { ...candidate.profile };
    Object.defineProperty(accessorProfile, 'settlementVaultGenesisInputBoxIdHex', {
      enumerable: true,
      get: () => candidate.profile.settlementVaultGenesisInputBoxIdHex,
    });
    expect(() => encodePegInPooledReserveLineageProfileV4Hex(
      accessorProfile,
    )).toThrow(/fields must be own data properties/);
  });

  it('deep-freezes candidates and rejects cloned or caller-built provenance', async () => {
    const candidate = await deriveCandidate();

    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.profile)).toBe(true);
    expect(Object.isFrozen(candidate.genesis)).toBe(true);
    expect(Object.isFrozen(candidate.genesis.tracker)).toBe(true);
    expect(Object.isFrozen(candidate.genesis.tracker.inputBox)).toBe(true);
    expect(Object.isFrozen(candidate.genesis.tracker.inputBox.assets)).toBe(true);
    expect(Object.isFrozen(
      candidate.genesis.tracker.inputBox.additionalRegisters,
    )).toBe(true);
    expect(Object.isFrozen(candidate.invariants)).toBe(true);
    expect(Object.isFrozen(candidate.boundaries)).toBe(true);
    expect(() => assertDerivedPegInPooledReserveLineageProfileV4Candidate(
      candidate,
    )).not.toThrow();
    expect(() => assertDerivedPegInPooledReserveLineageProfileV4Candidate(
      structuredClone(candidate),
    )).toThrow(/must be derived from complete validated EIP-12 genesis inputs/);
    expect(() => assertDerivedPegInPooledReserveLineageProfileV4Candidate({
      ...candidate,
    })).toThrow(/must be derived from complete validated EIP-12 genesis inputs/);
  });

  it('keeps every authority boundary false and exposes explicit invariants', async () => {
    const candidate = await deriveCandidate();

    expect(Object.values(candidate.boundaries)).toHaveLength(19);
    expect(Object.values(candidate.boundaries).every(value => value === false))
      .toBe(true);
    expect(candidate.invariants).toEqual({
      singletonIdsDerivedFromValidatedGenesisInputs: true,
      allGenesisInputsDistinct: true,
      canonicalSettlementVaultLineageRequired: true,
      nativeErgSettlementLaneBound: true,
      separateFinalityPoliciesBound: true,
      depositObservationIsNotMintAuthority: true,
      compiledContractIdentitiesExcludedFromProfile: true,
      localPersistenceIsNotAuthority: true,
    });
    expect(candidate.profile).not.toHaveProperty('sourceLockErgoTreeHashHex');
    expect(candidate.profile).not.toHaveProperty('settlementVaultErgoTreeHashHex');
    expect(candidate.profile).not.toHaveProperty('trackerContractIdHex');
    expect(candidate.profile).not.toHaveProperty('fundsAuthorityEstablished');
  });

  it('leaves the V3 canonical bytes and profile ID unchanged', async () => {
    const [trackerGenesisInputBox, duplicatePreventionGenesisInputBox] =
      await genesisInputs();
    const candidate = await derivePegInCausalLineageProfileV3({
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      semantics: V3_SEMANTICS,
    });

    expect(PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES).toBe(473);
    expect(candidate.encodedProfileHex).toBe(EXPECTED_V3_ENCODED_PROFILE_HEX);
    expect(candidate.profileIdHex).toBe(EXPECTED_V3_PROFILE_ID);
  });
});
