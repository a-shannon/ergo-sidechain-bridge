import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  contractState: vi.fn(),
  artifact: vi.fn(),
  identity: vi.fn(),
  lineage: vi.fn(),
  profile: vi.fn(),
}));

vi.mock('./native-finalized-peg-in-frontier-contract-state-v1.js', async importOriginal => ({
  ...await importOriginal<
    typeof import('./native-finalized-peg-in-frontier-contract-state-v1.js')
  >(),
  assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance:
    provenance.contractState,
}));
vi.mock('./read-only-deployment-identity-observer.js', async importOriginal => ({
  ...await importOriginal<typeof import('./read-only-deployment-identity-observer.js')>(),
  assertDeploymentIdentityArtifactProfileProvenance: provenance.artifact,
  assertDeploymentIdentityCandidateProvenance: provenance.identity,
}));
vi.mock('./authority-bound-deployment-lineage.js', async importOriginal => ({
  ...await importOriginal<typeof import('./authority-bound-deployment-lineage.js')>(),
  assertAuthorityBoundDeploymentLineageProvenance: provenance.lineage,
}));
vi.mock('./reviewed-deployment-lineage-profiles.js', async importOriginal => ({
  ...await importOriginal<typeof import('./reviewed-deployment-lineage-profiles.js')>(),
  assertReviewedDeploymentLineageProfileProvenance: provenance.profile,
}));

import {
  FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_SCHEMA,
  assertFrontierContractStateDeploymentLineageJoinCandidateProvenance,
  buildFrontierContractStateDeploymentLineageJoinCandidate,
} from './frontier-contract-state-deployment-lineage-join.js';
import type {
  AuthorityBoundDeploymentLineageCandidate,
} from './authority-bound-deployment-lineage.js';
import type {
  NativeFinalizedPegInFrontierContractStateV1ResultCandidate,
} from './native-finalized-peg-in-frontier-contract-state-v1.js';
import {
  loadTrackedDeploymentIdentityArtifactProfile,
  type DeploymentIdentityArtifactProfile,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import {
  createReviewedDeploymentLineageProfile,
  INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_INPUT,
  type DeploymentLineageProfileV1,
} from './reviewed-deployment-lineage-profiles.js';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hash = (byte: string): string => `0x${byte.repeat(32)}`;
const address = (byte: string): string => `0x${byte.repeat(20)}`;
const BRIDGE = address('22');
const TOKEN = address('21');
const DEPLOYER = address('50');
const USER = address('51');
const ZERO = address('00');
const BOX = hash('52');
const EVENT_BLOCK_HEIGHT = '13';
const EVENT_BLOCK_HASH = hash('33');
const EVENT_TX = hash('43');

let artifactProfile: DeploymentIdentityArtifactProfile;
let reviewedProfile: DeploymentLineageProfileV1;

beforeAll(() => {
  artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);
  reviewedProfile = createReviewedDeploymentLineageProfile(
    INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_INPUT,
  );
});

describe('Frontier contract-state deployment-lineage join', () => {
  it('joins one authenticated event-block post-state to T19/T20A without authority', () => {
    const candidate = buildFrontierContractStateDeploymentLineageJoinCandidate(baseInput());

    expect(candidate.schema).toBe(FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_SCHEMA);
    expect(candidate.target.executionHeight).toBe(EVENT_BLOCK_HEIGHT);
    expect(candidate.target.executionBlockHashHex).toBe(EVENT_BLOCK_HASH);
    expect(candidate.contracts.tokenTotalSupply).toBe('100');
    expect(candidate.pegIn).toMatchObject({
      transactionHashHex: EVENT_TX,
      globalEventIndex: 1,
      recipientHex: USER,
      amountNanoErg: '100',
      ergoBoxIdHex: BOX,
      processedPegIn: true,
    });
    expect(Object.values(candidate.checks).every(value => value === true)).toBe(true);
    expect(Object.values(candidate.authority).every(value => value === false)).toBe(true);
    expect(candidate.candidateDigestHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.authority)).toBe(true);
    expect(() => assertFrontierContractStateDeploymentLineageJoinCandidateProvenance(candidate))
      .not.toThrow();
  });

  it('keeps the authenticated event block distinct from the exact T19/T20A terminal', () => {
    const candidate = buildFrontierContractStateDeploymentLineageJoinCandidate(baseInput());
    expect(candidate.target.executionHeight).toBe('13');
    expect(baseLineage().interval.terminalHeight).toBe('15');
    expect(baseIdentity().view.tipHeight).toBe('15');
    expect(baseLineage().totals.terminalTotalSupply).toBe('60');
    expect(candidate.contracts.tokenTotalSupply).toBe('100');
  });

  it.each([
    ['artifact code', (input: MutableInput) => {
      input.contractStateCandidate.contractState.bridgeRuntimeCodeSha256Hex = hash('99');
    }, /tracked artifact profile/i],
    ['token artifact code', (input: MutableInput) => {
      input.contractStateCandidate.contractState.tokenRuntimeCodeSha256Hex = hash('99');
    }, /tracked artifact profile/i],
    ['T19 address', (input: MutableInput) => {
      input.deploymentIdentityCandidate.view.bridgeAddress = address('99');
    }, /T19 deployment identity/i],
    ['T19 token address', (input: MutableInput) => {
      input.deploymentIdentityCandidate.view.tokenAddress = address('99');
    }, /T19 deployment identity/i],
    ['T19 terminal', (input: MutableInput) => {
      input.deploymentIdentityCandidate.view.tipHeight = '14';
    }, /T19 observation does not match/i],
    ['T19 later fork', (input: MutableInput) => {
      input.deploymentIdentityCandidate.view.tipHeight = '16';
      input.deploymentIdentityCandidate.view.tipHashHex = hash('36');
    }, /T19 observation does not match/i],
    ['T19 terminal hash', (input: MutableInput) => {
      input.deploymentIdentityCandidate.view.tipHashHex = hash('99');
    }, /T19 observation does not match/i],
    ['T19 bridge token binding', (input: MutableInput) => {
      input.deploymentIdentityCandidate.view.bridgeTokenAddress = address('99');
    }, /T19 deployment identity/i],
    ['T20A block supply', (input: MutableInput) => {
      input.deploymentLineageCandidate.blocks[0].tokenTotalSupply = '99';
    }, /exact T20A execution block/i],
    ['T20A bridge owner', (input: MutableInput) => {
      input.deploymentLineageCandidate.blocks[0].bridgeOwnerAddress = address('99');
    }, /exact T20A execution block/i],
    ['T20A token owner', (input: MutableInput) => {
      input.deploymentLineageCandidate.blocks[0].tokenOwnerAddress = address('99');
    }, /exact T20A execution block/i],
    ['T20A bridge code state', (input: MutableInput) => {
      input.deploymentLineageCandidate.blocks[0].bridgeCodeState = 'absent';
    }, /exact T20A execution block/i],
    ['T20A token code identity', (input: MutableInput) => {
      input.deploymentLineageCandidate.deployments.token.runtimeBytecodeSha256Hex = hash('99');
    }, /exact T20A execution block/i],
    ['T20A profile digest', (input: MutableInput) => {
      input.deploymentLineageCandidate.reviewedProfileDigestHex = hash('99');
    }, /exact T20A execution block/i],
    ['trust root', (input: MutableInput) => {
      input.contractStateCandidate.trustAnchorDigestHex = hash('99');
    }, /reviewed trust lineage/i],
    ['missing PegIn', (input: MutableInput) => {
      input.deploymentLineageCandidate.blocks[0].events =
        input.deploymentLineageCandidate.blocks[0].events.filter((event: { kind: string }) =>
          event.kind !== 'bridge_peg_in');
    }, /exactly one authenticated PegIn/i],
    ['duplicate mint', (input: MutableInput) => {
      input.deploymentLineageCandidate.blocks[0].events.push(
        structuredClone(input.deploymentLineageCandidate.blocks[0].events[0]),
      );
    }, /exactly one paired mint/i],
    ['wrong event index', (input: MutableInput) => {
      input.contractStateCandidate.eventVerification.event.globalEventIndex = 2;
    }, /exactly one authenticated PegIn/i],
    ['wrong event recipient', (input: MutableInput) => {
      input.contractStateCandidate.eventVerification.event.recipientHex = address('99');
    }, /exactly one authenticated PegIn/i],
    ['wrong event amount', (input: MutableInput) => {
      input.contractStateCandidate.eventVerification.event.amountNanoErg = '99';
    }, /exactly one authenticated PegIn/i],
    ['wrong event box', (input: MutableInput) => {
      input.contractStateCandidate.eventVerification.event.ergoBoxIdHex = hash('99');
    }, /exactly one authenticated PegIn/i],
  ] as const)('rejects %s drift', (_label, mutate, message) => {
    const input = mutableInput();
    mutate(input);
    expect(() => buildFrontierContractStateDeploymentLineageJoinCandidate(
      input as unknown as Parameters<
        typeof buildFrontierContractStateDeploymentLineageJoinCandidate
      >[0],
    )).toThrow(message);
  });

  it('fails before binding when same-process provenance rejects', () => {
    provenance.contractState.mockImplementationOnce(() => {
      throw new Error('candidate provenance is missing');
    });
    expect(() => buildFrontierContractStateDeploymentLineageJoinCandidate(baseInput()))
      .toThrow(/candidate provenance is missing/i);
  });

  it('rejects cloned join output as unprovenanced', () => {
    const candidate = buildFrontierContractStateDeploymentLineageJoinCandidate(baseInput());
    expect(() => assertFrontierContractStateDeploymentLineageJoinCandidateProvenance({
      ...candidate,
    })).toThrow(/join provenance is missing/i);
  });
});

function baseInput() {
  return {
    contractStateCandidate: baseContractStateCandidate(),
    artifactProfile,
    deploymentIdentityCandidate: baseIdentity(),
    deploymentLineageCandidate: baseLineage(),
    reviewedProfile,
  };
}

type MutableInput = ReturnType<typeof mutableInput>;

function mutableInput() {
  return structuredClone(baseInput()) as unknown as {
    contractStateCandidate: any;
    artifactProfile: any;
    deploymentIdentityCandidate: any;
    deploymentLineageCandidate: any;
    reviewedProfile: any;
  };
}

function baseContractStateCandidate(): NativeFinalizedPegInFrontierContractStateV1ResultCandidate {
  return {
    requestDigestHex: hash('70'),
    trustAnchorDigestHex: reviewedProfile.nativeGrandpaTrust.trustedAnchorDigestHex,
    contractState: {
      bridgeAddressHex: BRIDGE,
      tokenAddressHex: TOKEN,
      bridgeRuntimeCodeSha256Hex: `0x${artifactProfile.bridge.runtimeBytecodeSha256Hex}`,
      bridgeRuntimeCodeBytes: artifactProfile.bridge.runtimeByteLength.toString(),
      tokenRuntimeCodeSha256Hex: `0x${artifactProfile.token.runtimeBytecodeSha256Hex}`,
      tokenRuntimeCodeBytes: artifactProfile.token.runtimeByteLength.toString(),
      bridgeOwnerAddressHex: DEPLOYER,
      tokenOwnerAddressHex: BRIDGE,
      bridgeTokenAddressHex: TOKEN,
      bridgePaused: false,
      tokenTotalSupply: '100',
      processedPegIn: true,
    },
    eventVerification: {
      executionIdentity: {
        target: {
          nativeBlockHashHex: hash('73'),
          nativeHeight: '113',
          stateRootHex: hash('74'),
        },
        execution: {
          executionHeight: EVENT_BLOCK_HEIGHT,
          executionBlockHashHex: EVENT_BLOCK_HASH,
        },
        record: {
          sidechainIdHex: reviewedProfile.sidechainIdHex,
        },
      },
      event: {
        transactionHashHex: EVENT_TX,
        transactionIndex: 0,
        globalEventIndex: 1,
        recipientHex: USER,
        amountNanoErg: '100',
        ergoBoxIdHex: BOX,
      },
    },
  } as unknown as NativeFinalizedPegInFrontierContractStateV1ResultCandidate;
}

function baseIdentity(): DeploymentIdentityCandidate {
  return {
    candidateDigestHex: 'identity-candidate-digest',
    view: {
      chainId: reviewedProfile.evmChainId,
      tipHeight: reviewedProfile.interval.terminalHeight,
      tipHashHex: reviewedProfile.interval.terminalExecutionBlockHashHex.slice(2),
      bridgeAddress: BRIDGE,
      tokenAddress: TOKEN,
      bridgeRuntimeByteLength: artifactProfile.bridge.runtimeByteLength,
      bridgeRuntimeBytecodeSha256Hex: artifactProfile.bridge.runtimeBytecodeSha256Hex,
      tokenRuntimeByteLength: artifactProfile.token.runtimeByteLength,
      tokenRuntimeBytecodeSha256Hex: artifactProfile.token.runtimeBytecodeSha256Hex,
      bridgeTokenAddress: TOKEN,
      bridgeOwnerAddress: DEPLOYER,
      tokenOwnerAddress: BRIDGE,
      artifactProfileDigestHex: artifactProfile.profileDigestHex,
      buildManifestSha256Hex: artifactProfile.buildManifestSha256Hex,
    },
  } as unknown as DeploymentIdentityCandidate;
}

function baseLineage(): AuthorityBoundDeploymentLineageCandidate {
  return {
    candidateDigestHex: hash('71'),
    deploymentIdentityCandidateDigestHex: 'identity-candidate-digest',
    artifactProfileDigestHex: artifactProfile.profileDigestHex,
    reviewedProfileDigestHex: reviewedProfile.profileDigestHex,
    nativeFinalityStatementDigestHex: hash('72'),
    interval: {
      startHeight: reviewedProfile.interval.startHeight,
      startBlockHashHex: reviewedProfile.interval.startBlockHashHex,
      terminalHeight: reviewedProfile.interval.terminalHeight,
      terminalExecutionBlockHashHex: reviewedProfile.interval.terminalExecutionBlockHashHex,
      blockCount: reviewedProfile.interval.maximumBlockCount,
    },
    deployments: {
      bridge: {
        address: BRIDGE,
        runtimeBytecodeSha256Hex: artifactProfile.bridge.runtimeBytecodeSha256Hex,
      },
      token: {
        address: TOKEN,
        runtimeBytecodeSha256Hex: artifactProfile.token.runtimeBytecodeSha256Hex,
      },
    },
    blocks: [
      {
        height: EVENT_BLOCK_HEIGHT,
        hashHex: EVENT_BLOCK_HASH,
        bridgeOwnerAddress: DEPLOYER,
        tokenOwnerAddress: BRIDGE,
        tokenTotalSupply: '100',
        bridgeCodeState: 'reviewed-runtime',
        tokenCodeState: 'reviewed-runtime',
        events: [
          {
            kind: 'token_transfer',
            blockHeight: EVENT_BLOCK_HEIGHT,
            blockHashHex: EVENT_BLOCK_HASH,
            transactionHashHex: EVENT_TX,
            transactionIndex: 0,
            logIndex: 0,
            fromAddress: ZERO,
            toAddress: USER,
            amount: '100',
          },
          {
            kind: 'bridge_peg_in',
            blockHeight: EVENT_BLOCK_HEIGHT,
            blockHashHex: EVENT_BLOCK_HASH,
            transactionHashHex: EVENT_TX,
            transactionIndex: 0,
            logIndex: 1,
            toAddress: USER,
            amount: '100',
            ergoBoxIdHex: BOX,
          },
        ],
      },
      {
        height: reviewedProfile.interval.terminalHeight,
        hashHex: reviewedProfile.interval.terminalExecutionBlockHashHex,
        bridgeOwnerAddress: DEPLOYER,
        tokenOwnerAddress: BRIDGE,
        tokenTotalSupply: '60',
        bridgeCodeState: 'reviewed-runtime',
        tokenCodeState: 'reviewed-runtime',
        events: [],
      },
    ],
    totals: {
      terminalTotalSupply: '60',
    },
  } as unknown as AuthorityBoundDeploymentLineageCandidate;
}
