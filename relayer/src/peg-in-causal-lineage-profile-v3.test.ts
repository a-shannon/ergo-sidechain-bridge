import { describe, expect, it } from 'vitest';

import {
  PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES,
  PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_FORMAT_VERSION,
  assertDerivedPegInCausalLineageProfileV3Candidate,
  decodePegInCausalLineageProfileV3Hex,
  derivePegInCausalLineageProfileV3,
  derivePegInCausalLineageProfileV3IdHex,
  encodePegInCausalLineageProfileV3Hex,
  type PegInCausalLineageProfileV3,
  type PegInCausalLineageProfileV3Semantics,
} from './peg-in-causal-lineage-profile-v3.js';
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
const EXPECTED_PROFILE_ID =
  '0x2c3c6df828a4b52abef4dc60ed8c68053f37791fa5596e55af7575dcda98f016';

const SEMANTICS: PegInCausalLineageProfileV3Semantics = {
  sourceNetworkIdHex: `0x${'11'.repeat(32)}`,
  sidechainIdHex: `0x${'22'.repeat(32)}`,
  bridgeAddressHex: `0x${'33'.repeat(20)}`,
  tokenAddressHex: `0x${'44'.repeat(20)}`,
  settlementProfileIdHex: `0x${'55'.repeat(32)}`,
  sourceLockTemplateSha256Hex: `0x${'66'.repeat(32)}`,
  validityTrackerTemplateSha256Hex: `0x${'77'.repeat(32)}`,
  causalVaultTemplateSha256Hex: `0x${'88'.repeat(32)}`,
  duplicatePreventionTemplateSha256Hex: `0x${'99'.repeat(32)}`,
  finalityPolicyIdHex: `0x${'aa'.repeat(32)}`,
  proofSystemIdHex: `0x${'bb'.repeat(32)}`,
  proofProfileIdHex: `0x${'cc'.repeat(32)}`,
  sourceCommitmentPolicyIdHex: `0x${'dd'.repeat(32)}`,
  profileRevision: '1',
  activationHeight: '0',
};

async function genesisInputs(): Promise<readonly [Eip12Box, Eip12Box]> {
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
  }, 'causal lineage profile V3 genesis fixture');
  return [funding.outputs[0], funding.outputs[1]];
}

async function deriveCandidate() {
  const [trackerGenesisInputBox, duplicatePreventionGenesisInputBox] =
    await genesisInputs();
  return derivePegInCausalLineageProfileV3({
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    semantics: SEMANTICS,
  });
}

describe('peg-in causal lineage profile V3', () => {
  it('derives singleton identities from exact validated genesis boxes', async () => {
    const candidate = await deriveCandidate();

    expect(candidate.genesis.tracker.inputBox.boxId)
      .toBe(EXPECTED_TRACKER_GENESIS_BOX_ID);
    expect(candidate.genesis.duplicatePrevention.inputBox.boxId)
      .toBe(EXPECTED_DUP_GENESIS_BOX_ID);
    expect(candidate.profile.trackerGenesisInputBoxIdHex)
      .toBe(`0x${EXPECTED_TRACKER_GENESIS_BOX_ID}`);
    expect(candidate.profile.duplicatePreventionGenesisInputBoxIdHex)
      .toBe(`0x${EXPECTED_DUP_GENESIS_BOX_ID}`);
    expect(candidate.genesis.tracker.singletonNftIdHex)
      .toBe(candidate.profile.trackerGenesisInputBoxIdHex);
    expect(candidate.genesis.duplicatePrevention.singletonNftIdHex)
      .toBe(candidate.profile.duplicatePreventionGenesisInputBoxIdHex);
    expect(candidate.encodedProfileHex).toHaveLength(
      2 + (PEG_IN_CAUSAL_LINEAGE_PROFILE_V3_BYTES * 2),
    );
    expect(candidate.profileIdHex).toBe(EXPECTED_PROFILE_ID);
    expect(candidate.profile).not.toHaveProperty('sourceLockErgoTreeHashHex');
    expect(candidate.profile).not.toHaveProperty('vaultErgoTreeHashHex');
    expect(candidate.profile).not.toHaveProperty('trackerContractIdHex');
    expect(candidate.profile).not.toHaveProperty('duplicatePreventionContractIdHex');
  });

  it('round-trips the exact canonical profile and preserves its domain ID', async () => {
    const candidate = await deriveCandidate();
    const decoded = decodePegInCausalLineageProfileV3Hex(
      candidate.encodedProfileHex,
    );

    expect(decoded).toEqual(candidate.profile);
    expect(encodePegInCausalLineageProfileV3Hex(decoded))
      .toBe(candidate.encodedProfileHex);
    expect(derivePegInCausalLineageProfileV3IdHex(decoded))
      .toBe(candidate.profileIdHex);
    expect(() => decodePegInCausalLineageProfileV3Hex(
      candidate.encodedProfileHex.toUpperCase(),
    )).toThrow(/lowercase 0x-prefixed/);
    expect(() => assertDerivedPegInCausalLineageProfileV3Candidate(candidate))
      .not.toThrow();
    expect(() => assertDerivedPegInCausalLineageProfileV3Candidate(
      structuredClone(candidate),
    )).toThrow(/must be derived from complete validated EIP-12 genesis inputs/);
  });

  it('changes the profile ID for every semantic role and lineage identity', async () => {
    const candidate = await deriveCandidate();
    const mutations: Array<[keyof PegInCausalLineageProfileV3, unknown]> = [
      ['sourceNetworkIdHex', `0x${'12'.repeat(32)}`],
      ['sidechainIdHex', `0x${'23'.repeat(32)}`],
      ['bridgeAddressHex', `0x${'34'.repeat(20)}`],
      ['tokenAddressHex', `0x${'45'.repeat(20)}`],
      ['settlementProfileIdHex', `0x${'56'.repeat(32)}`],
      ['trackerGenesisInputBoxIdHex', `0x${'67'.repeat(32)}`],
      ['duplicatePreventionGenesisInputBoxIdHex', `0x${'78'.repeat(32)}`],
      ['sourceLockTemplateSha256Hex', `0x${'89'.repeat(32)}`],
      ['validityTrackerTemplateSha256Hex', `0x${'9a'.repeat(32)}`],
      ['causalVaultTemplateSha256Hex', `0x${'ab'.repeat(32)}`],
      ['duplicatePreventionTemplateSha256Hex', `0x${'bc'.repeat(32)}`],
      ['finalityPolicyIdHex', `0x${'cd'.repeat(32)}`],
      ['proofSystemIdHex', `0x${'de'.repeat(32)}`],
      ['proofProfileIdHex', `0x${'ef'.repeat(32)}`],
      ['sourceCommitmentPolicyIdHex', `0x${'10'.repeat(32)}`],
      ['profileRevision', '2'],
      ['activationHeight', '1'],
    ];

    for (const [field, value] of mutations) {
      const mutated = {
        ...candidate.profile,
        [field]: value,
      } as PegInCausalLineageProfileV3;
      expect(
        derivePegInCausalLineageProfileV3IdHex(mutated),
        field,
      ).not.toBe(candidate.profileIdHex);
    }
  });

  it('rejects non-canonical, aliased or zero profile fields', async () => {
    const candidate = await deriveCandidate();

    expect(() => encodePegInCausalLineageProfileV3Hex({
      ...candidate.profile,
      formatVersion: 2,
    } as unknown as PegInCausalLineageProfileV3))
      .toThrow(/format version must be exactly 3/);
    expect(() => encodePegInCausalLineageProfileV3Hex({
      ...candidate.profile,
      bridgeAddressHex: candidate.profile.tokenAddressHex,
    })).toThrow(/must not alias/);
    expect(() => encodePegInCausalLineageProfileV3Hex({
      ...candidate.profile,
      finalityPolicyIdHex: `0x${'00'.repeat(32)}`,
    })).toThrow(/finality policy ID must not be zero/);
    expect(() => encodePegInCausalLineageProfileV3Hex({
      ...candidate.profile,
      trackerGenesisInputBoxIdHex:
        candidate.profile.duplicatePreventionGenesisInputBoxIdHex,
    })).toThrow(/genesis inputs must be distinct/);
    expect(() => encodePegInCausalLineageProfileV3Hex({
      ...candidate.profile,
      profileRevision: '01',
    })).toThrow(/canonical decimal uint64/);
    expect(() => encodePegInCausalLineageProfileV3Hex({
      ...candidate.profile,
      apparentContractIdHex: `0x${'ee'.repeat(32)}`,
    } as PegInCausalLineageProfileV3)).toThrow(/must contain exactly/);
  });

  it('rejects substituted, reused and token-bearing genesis inputs', async () => {
    const [trackerGenesisInputBox, duplicatePreventionGenesisInputBox] =
      await genesisInputs();

    await expect(derivePegInCausalLineageProfileV3({
      trackerGenesisInputBox: {
        ...trackerGenesisInputBox,
        boxId: 'ff'.repeat(32),
      },
      duplicatePreventionGenesisInputBox,
      semantics: SEMANTICS,
    })).rejects.toThrow(/box id|boxId|calculated from box serialized bytes/i);
    await expect(derivePegInCausalLineageProfileV3({
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox: trackerGenesisInputBox,
      semantics: SEMANTICS,
    })).rejects.toThrow(/genesis inputs must be distinct/);

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
          value: '200000000',
          ergoTree: GENESIS_TREE,
          assets: [],
          additionalRegisters: {},
          creationHeight: 111,
        },
      ],
    }, 'token-bearing causal lineage profile V3 genesis fixture');
    await expect(derivePegInCausalLineageProfileV3({
      trackerGenesisInputBox: tokenFunding.outputs[0],
      duplicatePreventionGenesisInputBox,
      semantics: SEMANTICS,
    })).rejects.toThrow(/must be pure ERG/);
    await expect(derivePegInCausalLineageProfileV3({
      trackerGenesisInputBox,
      duplicatePreventionGenesisInputBox,
      semantics: {
        ...SEMANTICS,
        apparentContractIdHex: `0x${'ee'.repeat(32)}`,
      } as PegInCausalLineageProfileV3Semantics,
    })).rejects.toThrow(/semantics must contain exactly/);
  });

  it('keeps every execution and funds authority boundary false', async () => {
    const candidate = await deriveCandidate();

    expect(Object.values(candidate.boundaries)).toHaveLength(14);
    expect(Object.values(candidate.boundaries).every(value => value === false))
      .toBe(true);
    expect(candidate.invariants).toEqual({
      singletonIdsDerivedFromValidatedGenesisInputs: true,
      compiledContractIdentitiesExcludedFromProfile: true,
      localPersistenceIsNotAuthority: true,
    });
  });
});
