import { beforeEach, describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  route: vi.fn(),
  mint: vi.fn(),
}));

vi.mock('./peg-in-route-reconstruction.js', async importOriginal => ({
  ...await importOriginal<typeof import('./peg-in-route-reconstruction.js')>(),
  assertPegInRouteReconstructionProvenance: provenance.route,
}));
vi.mock('./frontier-mint-transition-deployment-lineage-join-v2.js', async importOriginal => ({
  ...await importOriginal<
    typeof import('./frontier-mint-transition-deployment-lineage-join-v2.js')
  >(),
  assertFrontierMintTransitionDeploymentLineageJoinV2CandidateProvenance:
    provenance.mint,
}));

import {
  PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA,
  PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_SCHEMA,
  PEG_IN_RUNTIME_RECORD_KEY_IDENTITY_V1_SCHEMA,
  assertPegInCommittedVaultMintEligibilityV1CandidateProvenance,
  buildPegInCommittedVaultMintEligibilityV1Candidate,
} from './peg-in-committed-vault-mint-eligibility-v1.js';
import { derivePegInFrontierContractStateStorageKeysV1 } from './peg-in-frontier-contract-state-v1.js';
import {
  PEG_IN_RUNTIME_RECORD_KEY_DOMAIN,
  derivePegInRuntimeRecordKeyV1Hex,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';

const unprefixed = (byte: string, bytes: number): string => byte.repeat(bytes * 2);
const prefixed = (byte: string, bytes: number): `0x${string}` =>
  `0x${unprefixed(byte, bytes)}`;
const BOX = unprefixed('1', 32);
const SIDECHAIN = prefixed('2', 32);
const BRIDGE = prefixed('3', 20);
const TOKEN = prefixed('4', 20);
const RECIPIENT = prefixed('5', 20);
const MANIFEST_DIGEST = unprefixed('6', 32);
const COMMIT_TX = unprefixed('7', 32);
const VAULT_BOX = unprefixed('8', 32);
const NATIVE_PROCESSED_KEY = deriveProcessedPegInRuntimeStorageKeyV1Hex({
  sidechainIdHex: SIDECHAIN,
  ergoBoxIdHex: `0x${BOX}`,
});
const EVM_PROCESSED_STORAGE_KEY = derivePegInFrontierContractStateStorageKeysV1({
  bridgeAddressHex: BRIDGE,
  tokenAddressHex: TOKEN,
  ergoBoxIdHex: `0x${BOX}`,
}).processedPegInStorageKeyHex;

describe('committed-vault PegIn mint eligibility V1', () => {
  beforeEach(() => {
    provenance.route.mockReset();
    provenance.mint.mockReset();
  });

  it('binds the observed committed vault to the existing V1 mint identity without authority', () => {
    const candidate = buildPegInCommittedVaultMintEligibilityV1Candidate(baseInput());

    expect(candidate.schema).toBe(PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_V1_SCHEMA);
    expect(candidate.status).toBe('non_authorizing_candidate');
    expect(candidate.asset).toEqual({
      sourceAsset: 'ERG',
      sourceAssetIdHex: prefixed('0', 32),
      amountUnit: 'nanoERG',
      amountNanoErg: '100',
    });
    expect(candidate.mintIdentity).toEqual({
      schema: PEG_IN_RUNTIME_RECORD_KEY_IDENTITY_V1_SCHEMA,
      domain: PEG_IN_RUNTIME_RECORD_KEY_DOMAIN,
      identityHex: derivePegInRuntimeRecordKeyV1Hex({
        sidechainIdHex: SIDECHAIN,
        ergoBoxIdHex: `0x${BOX}`,
      }),
      evmProcessedPegInKeyHex: `0x${BOX}`,
      nativeProcessedRecordStorageKeyHex: NATIVE_PROCESSED_KEY,
      evmProcessedPegInStorageKeyHex: EVM_PROCESSED_STORAGE_KEY,
    });
    expect(candidate.observedMint).toMatchObject({
      mintTransitionV1LineageDigestHex: prefixed('f', 32),
      mintTransitionLineageDigestHex: prefixed('a', 32),
    });
    expect(Object.values(candidate.checks).every(value => value === true)).toBe(true);
    expect(Object.values(candidate.authority).every(value => value === false)).toBe(true);
    expect(candidate.authority).toMatchObject({
      sourceDepositSidechainBindingProved: false,
      crossChainConsumptionBeforeMintProved: false,
      mintAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(candidate.candidateDigestHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(() => assertPegInCommittedVaultMintEligibilityV1CandidateProvenance(candidate))
      .not.toThrow();
    expect(() => assertPegInCommittedVaultMintEligibilityV1CandidateProvenance({
      ...candidate,
    })).toThrow(/provenance is missing/i);
  });

  it.each([
    ['unknown profile field', (input: any) => {
      input.profile.unreviewed = true;
    }, /unexpected fields/i],
    ['manifest digest', (input: any) => {
      input.ergoRoute.manifest.computedSha256Hex = unprefixed('a', 32);
    }, /profile does not match/i],
    ['route blocker', (input: any) => {
      input.ergoRoute.decision.blockers.push({ code: 'source_disagreement' });
    }, /unblocked exact Ergo route/i],
    ['missing source deposit', (input: any) => {
      input.ergoRoute.activeHistory[0].boxIdHex = unprefixed('a', 32);
    }, /exactly one observed source deposit/i],
    ['duplicate source deposit', (input: any) => {
      input.ergoRoute.activeHistory.push(structuredClone(input.ergoRoute.activeHistory[0]));
    }, /exactly one observed source deposit/i],
    ['refundable classification', (input: any) => {
      input.ergoRoute.activeHistory[0].classification = 'refundable';
    }, /not one confirmed vault commitment/i],
    ['pending classification', (input: any) => {
      input.ergoRoute.activeHistory[0].classification = 'commit_pending';
    }, /not one confirmed vault commitment/i],
    ['refunded classification', (input: any) => {
      input.ergoRoute.activeHistory[0].classification = 'refunded';
    }, /not one confirmed vault commitment/i],
    ['unresolved classification', (input: any) => {
      input.ergoRoute.activeHistory[0].classification = 'unresolved';
    }, /not one confirmed vault commitment/i],
    ['missing transition', (input: any) => {
      input.ergoRoute.activeHistory[0].transition = null;
    }, /not one confirmed vault commitment/i],
    ['spending transaction', (input: any) => {
      input.ergoRoute.activeHistory[0].spentTransactionIdHex = unprefixed('a', 32);
    }, /transaction identity is inconsistent/i],
    ['null spending transaction', (input: any) => {
      input.ergoRoute.activeHistory[0].spentTransactionIdHex = null;
    }, /transaction identity is inconsistent/i],
    ['transition transaction', (input: any) => {
      input.ergoRoute.activeHistory[0].transition.spendingTransactionIdHex =
        unprefixed('a', 32);
    }, /transaction identity is inconsistent/i],
    ['confirmation arithmetic', (input: any) => {
      input.ergoRoute.activeHistory[0].transition.confirmations = 10;
    }, /confirmation identity is insufficient/i],
    ['confirmation policy', (input: any) => {
      input.ergoRoute.routeBindings.commitConfirmations = 12;
    }, /confirmation identity is insufficient/i],
    ['live refund path', (input: any) => {
      input.ergoRoute.activeCurrentBoxIdsHex.push(BOX);
    }, /refund path remains live/i],
    ['vault history absence', (input: any) => {
      input.ergoRoute.vaultHistoryBoxIdsHex = [];
    }, /absent from vault history/i],
    ['vault history duplication', (input: any) => {
      input.ergoRoute.vaultHistoryBoxIdsHex.push(VAULT_BOX);
    }, /absent from vault history/i],
    ['vault current absence', (input: any) => {
      input.ergoRoute.vaultCurrentBoxIdsHex = [];
    }, /not currently unspent/i],
    ['vault current duplication', (input: any) => {
      input.ergoRoute.vaultCurrentBoxIdsHex.push(VAULT_BOX);
    }, /not currently unspent/i],
    ['declared amount', (input: any) => {
      input.ergoRoute.activeHistory[0].declaredAmountNanoErg = '99';
    }, /amount differs/i],
    ['recipient', (input: any) => {
      input.ergoRoute.activeHistory[0].targetEvmAddressHex = unprefixed('a', 20);
    }, /recipient differs/i],
    ['destination sidechain', (input: any) => {
      input.mintTransition.pegIn.sidechainIdHex = prefixed('a', 32);
    }, /exact T20C destination/i],
    ['destination bridge', (input: any) => {
      input.mintTransition.contracts.bridgeAddressHex = prefixed('a', 20);
    }, /exact T20C destination/i],
    ['destination token', (input: any) => {
      input.mintTransition.contracts.tokenAddressHex = prefixed('a', 20);
    }, /exact T20C destination/i],
    ['processed transition', (input: any) => {
      input.mintTransition.transition.parentProcessedPegIn = true;
    }, /replay or mint transition/i],
    ['supply delta', (input: any) => {
      input.mintTransition.transition.tokenTotalSupplyDelta = '99';
    }, /replay or mint transition/i],
    ['recipient balance delta', (input: any) => {
      input.mintTransition.transition.recipientBalanceDelta = '99';
    }, /replay or mint transition/i],
    ['native replay storage key', (input: any) => {
      input.mintTransition.transition.nativeProcessedRecordStorageKeyHex =
        `0x${'a'.repeat(160)}`;
    }, /native processed-record storage key drifted/i],
    ['EVM replay storage key', (input: any) => {
      input.mintTransition.transition.evmProcessedPegInStorageKeyHex =
        `0x${'00'.repeat(116)}`;
    }, /EVM processed-PegIn storage key drifted/i],
  ] as const)('rejects isolated %s drift', (_label, mutate, message) => {
    const input = structuredClone(baseInput());
    mutate(input);
    expect(() => buildPegInCommittedVaultMintEligibilityV1Candidate(input as never))
      .toThrow(message);
  });

  it('fails before correlation when either same-process provenance check rejects', () => {
    provenance.route.mockImplementationOnce(() => {
      throw new Error('route provenance is missing');
    });
    expect(() => buildPegInCommittedVaultMintEligibilityV1Candidate(baseInput()))
      .toThrow(/route provenance is missing/i);

    provenance.mint.mockImplementationOnce(() => {
      throw new Error('mint provenance is missing');
    });
    expect(() => buildPegInCommittedVaultMintEligibilityV1Candidate(baseInput()))
      .toThrow(/mint provenance is missing/i);
  });
});

function baseInput(): Parameters<
  typeof buildPegInCommittedVaultMintEligibilityV1Candidate
>[0] {
  return {
    profile: {
      schema: PEG_IN_COMMITTED_VAULT_MINT_ELIGIBILITY_PROFILE_V1_SCHEMA,
      profileId: 'ergo-testnet-frontier-v1',
      routeManifestSha256Hex: MANIFEST_DIGEST,
      ergoNetworkId: 'ergo-testnet',
      routeProfile: 'committed-vault-v3',
      settlementVaultProfileId:
        'main-chain-aggregate-unlock-trustless-v1-compatibility',
      sidechainIdHex: SIDECHAIN,
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      sourceAsset: 'ERG',
      sourceAssetIdHex: prefixed('0', 32),
      amountUnit: 'nanoERG',
    },
    ergoRoute: {
      observedAt: '2026-07-18T10:00:00.000Z',
      reconstructionDigestHex: unprefixed('a', 32),
      observationDigestHex: unprefixed('b', 32),
      manifest: {
        computedSha256Hex: MANIFEST_DIGEST,
        expectedSha256Hex: MANIFEST_DIGEST,
        profile: 'committed-vault-v3',
        settlementVaultProfileId:
          'main-chain-aggregate-unlock-trustless-v1-compatibility',
        manifestId: 'ergo-testnet-frontier-v1',
        sourceRevision: unprefixed('c', 20),
      },
      routeBindings: {
        commitConfirmations: 10,
        mainChainLockAddress: 'mcl-address',
        mainChainLockErgoTreeHex: `1008cd02${unprefixed('d', 32)}`,
        settlementVaultAddress: 'vault-address',
        settlementVaultErgoTreeHex: `1008cd02${unprefixed('e', 32)}`,
      },
      network: {
        networkId: 'ergo-testnet',
        snapshot: {
          fullHeight: 100,
          tip: { idHex: unprefixed('f', 32) },
        },
        anchorHeader: {
          height: 91,
          expectedIdHex: unprefixed('a', 32),
        },
      },
      decision: {
        observationConditionMet: true,
        blockers: [],
      },
      activeHistory: [{
        addressBoxIndex: 0,
        boxIdHex: BOX,
        transactionIdHex: unprefixed('b', 32),
        outputIndex: 0,
        creationHeight: 80,
        valueNanoErg: '100',
        spentTransactionIdHex: COMMIT_TX,
        targetEvmAddressHex: RECIPIENT.slice(2),
        declaredAmountNanoErg: '100',
        signerMetadataHex: '02',
        depositorErgoTreeHex: `1008cd02${unprefixed('c', 32)}`,
        classification: 'committed',
        transition: {
          spendingTransactionIdHex: COMMIT_TX,
          inclusionHeight: 90,
          inclusionBlockIdHex: unprefixed('d', 32),
          confirmations: 11,
          vaultBoxIdHex: VAULT_BOX,
        },
      }],
      activeCurrentBoxIdsHex: [],
      vaultHistoryBoxIdsHex: [VAULT_BOX],
      vaultCurrentBoxIdsHex: [VAULT_BOX],
    } as never,
    mintTransition: {
      v1CandidateDigestHex: prefixed('f', 32),
      candidateDigestHex: prefixed('a', 32),
      mintTransitionRequestDigestHex: prefixed('b', 32),
      contracts: {
        bridgeAddressHex: BRIDGE,
        tokenAddressHex: TOKEN,
      },
      pegIn: {
        sidechainIdHex: SIDECHAIN,
        ergoBoxIdHex: `0x${BOX}`,
        recipientHex: RECIPIENT,
        amountNanoErg: '100',
        processedPegIn: true,
        transactionHashHex: prefixed('c', 32),
        transactionIndex: 0,
        globalEventIndex: 1,
      },
      transition: {
        parentProcessedPegIn: false,
        postProcessedPegIn: true,
        tokenTotalSupplyDelta: '100',
        recipientBalanceDelta: '100',
        nativeProcessedRecordStorageKeyHex: NATIVE_PROCESSED_KEY,
        evmProcessedPegInStorageKeyHex: EVM_PROCESSED_STORAGE_KEY,
      },
      target: {
        eventNativeBlockHashHex: prefixed('d', 32),
        eventNativeHeight: '12',
        executionBlockHashHex: prefixed('e', 32),
        executionHeight: '12',
      },
    } as never,
  };
}
