import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import blakejs from 'blakejs';
import { AbiCoder, Interface } from 'ethers';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const authorityProvenanceMocks = vi.hoisted(() => ({
  assertAuthority: vi.fn(),
  assertResult: vi.fn(),
}));

vi.mock('./native-verifier-execution-authority.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-verifier-execution-authority.js')
  >();
  return {
    ...actual,
    assertNativeVerifierExecutionAuthorityProvenance:
      authorityProvenanceMocks.assertAuthority,
    assertNativeVerifierExecutionAuthorityResultProvenance:
      authorityProvenanceMocks.assertResult,
  };
});

import {
  assertAuthorityBoundDeploymentLineageProvenance,
  createDeploymentLineageSourcePair,
  MAX_DEPLOYMENT_LINEAGE_OBSERVATION_MS,
  MAX_DEPLOYMENT_LINEAGE_RPC_BYTE_FIELD_BYTES,
  MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES,
  MAX_DEPLOYMENT_LINEAGE_RPC_TOTAL_RESPONSE_BYTES,
  MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS_PER_BLOCK,
  observeAuthorityBoundDeploymentLineage,
} from './authority-bound-deployment-lineage.js';
import {
  buildFrontierContractStateDeploymentLineageJoinCandidate,
} from './frontier-contract-state-deployment-lineage-join.js';
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import {
  buildNativeVerifiedBridgeCheckpoint,
  createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier,
  deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor,
  verifyNativeFinalizedBridgeCheckpoint,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeFinalizedBridgeCheckpointVerificationPayload,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_VERIFICATION_SCHEMA,
  buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate,
  deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex,
  normalizeNativeFinalizedPegInFrontierContractStateV1Request,
} from './native-finalized-peg-in-frontier-contract-state-v1.js';
import {
  deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex,
} from './native-finalized-peg-in-frontier-event-v1.js';
import {
  deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import type {
  NativeVerifierExecutionAuthority,
} from './native-verifier-execution-authority.js';
import {
  PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
  encodePegInRuntimeRecordV1ScaleHex,
} from './peg-in-runtime-state.js';
import {
  createDeploymentIdentitySourcePair,
  loadTrackedDeploymentIdentityArtifactProfile,
  observeMatchingDeploymentIdentityCandidate,
  type DeploymentIdentityArtifactProfile,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import {
  createReviewedDeploymentLineageProfile,
  INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_INPUT,
  type DeploymentLineageProfileV1,
} from './reviewed-deployment-lineage-profiles.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const FRONTIER_EVENT_VECTOR = JSON.parse(readFileSync(resolve(
  MODULE_DIRECTORY,
  '../test-vectors/native-finalized-peg-in-frontier-event-v1.json',
), 'utf8')) as {
  readonly request: Record<string, unknown>;
  readonly expected: Record<string, unknown>;
};
const profileInput = INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_INPUT;
const SERG_ADDRESS = profileInput.token.address;
const BRIDGE_ADDRESS = profileInput.bridge.address;
const DEPLOYER = address('50');
const USER = address('51');
const ZERO_ADDRESS = address('00');
const ERGO_BOX_ID = hash('52');
const SERG_DEPLOYMENT_TX_HASH = profileInput.token.deploymentTransactionHashHex;
const BRIDGE_DEPLOY_TX = profileInput.bridge.deploymentTransactionHashHex;
const OWNERSHIP_TX = hash('42');
const MINT_TX = hash('43');
const BURN_TX = hash('44');
const EXTRA_TX = hash('45');
const tokenInterface = new Interface([
  'function owner() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function mint(address,uint256)',
  'function burn(uint256)',
  'function transferOwnership(address)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event Approval(address indexed owner,address indexed spender,uint256 value)',
  'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)',
]);
const bridgeInterface = new Interface([
  'function owner() view returns (address)',
  'function sergToken() view returns (address)',
  'function processedPegIns(bytes32) view returns (bool)',
  'function mintSERG(address,uint256,bytes32)',
  'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)',
  'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)',
]);

let artifactProfile: DeploymentIdentityArtifactProfile;
let reviewedProfile: DeploymentLineageProfileV1;
let tokenCreationHex: string;
let bridgeCreationHex: string;

beforeAll(() => {
  artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);
  reviewedProfile = createReviewedDeploymentLineageProfile(profileInput);
  tokenCreationHex = `0x${readFileSync(resolve(BRIDGE_ROOT, 'solidity', 'compiled', 'SERG.bin'), 'utf8')}`;
  bridgeCreationHex = `0x${readFileSync(resolve(BRIDGE_ROOT, 'solidity', 'compiled', 'ErgoBridge.bin'), 'utf8')}`;
});

describe('authority-bound deployment lineage', () => {
  it('reconstructs a bounded multi-block deployment, ownership, mint, and burn lineage', async () => {
    await withFixturePair({}, {}, async context => {
      const candidate = await context.observe();
      assertAuthorityBoundDeploymentLineageProvenance(candidate);
      expect(candidate.status).toBe('non_authorizing_candidate');
      expect(candidate.interval).toEqual({
        startHeight: '9',
        startBlockHashHex: hash('29'),
        terminalHeight: '15',
        terminalExecutionBlockHashHex: hash('35'),
        blockCount: 7,
      });
      expect(candidate.totals).toEqual({
        transactions: 5,
        receiptLogs: 6,
        relevantLogs: 6,
        tokenMints: 1,
        tokenBurns: 1,
        tokenMintedAmount: '100',
        tokenBurnedAmount: '40',
        bridgePegIns: 1,
        terminalTotalSupply: '60',
      });
      expect(candidate.blocks.map(block => block.tokenCodeState)).toEqual([
        'absent',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
      ]);
      expect(candidate.blocks.map(block => block.bridgeCodeState)).toEqual([
        'absent',
        'absent',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
        'reviewed-runtime',
      ]);
      expect(candidate.blocks.at(-1)?.tokenOwnerAddress).toBe(BRIDGE_ADDRESS);
      expect(candidate.blocks.at(-1)?.bridgeOwnerAddress).toBe(DEPLOYER);
      expect(Object.values(candidate.checks).every(value => value === true)).toBe(true);
      expect(Object.values(candidate.authority).every(value => value === false)).toBe(true);
      expect(candidate.limitations[0]).toMatch(/does not cryptographically prove receipt or state completeness/i);
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.blocks[0])).toBe(true);
    });
  });

  it('joins genuine same-process T19, T20A, and T20B candidates', async () => {
    await withFixturePair({}, {}, async context => {
      const lineageCandidate = await context.observe();
      const contractStateCandidate = buildLineageContractStateCandidate();
      const joined = buildFrontierContractStateDeploymentLineageJoinCandidate({
        contractStateCandidate,
        artifactProfile,
        deploymentIdentityCandidate: context.deploymentIdentityCandidate,
        deploymentLineageCandidate: lineageCandidate,
        reviewedProfile,
      });

      expect(joined.checks.sameProcessCandidateProvenanceVerified).toBe(true);
      expect(joined.target).toMatchObject({
        executionHeight: '13',
        executionBlockHashHex: hash('33'),
      });
      expect(joined.pegIn).toEqual({
        transactionHashHex: MINT_TX,
        transactionIndex: 0,
        globalEventIndex: 1,
        recipientHex: USER,
        amountNanoErg: '100',
        ergoBoxIdHex: ERGO_BOX_ID,
        processedPegIn: true,
      });
      expect(joined.contracts).toMatchObject({
        bridgeAddressHex: BRIDGE_ADDRESS,
        tokenAddressHex: SERG_ADDRESS,
        bridgeOwnerAddressHex: DEPLOYER,
        tokenOwnerAddressHex: BRIDGE_ADDRESS,
        bridgeTokenAddressHex: SERG_ADDRESS,
        tokenTotalSupply: '100',
      });
      expect(joined.authority).toMatchObject({
        nativeVerifierExecutionAuthenticated: false,
        preEventReplayAbsenceProved: false,
        committedVaultTransitionProved: false,
        mintAuthorized: false,
        gate5Closed: false,
        productionReady: false,
      });
    });
  });

  it('fails closed for forged same-process provenance and unknown reviewed profiles', async () => {
    await withFixturePair({}, {}, async context => {
      await expect(context.observe({
        deploymentIdentityCandidate: {
          ...context.deploymentIdentityCandidate,
        } as DeploymentIdentityCandidate,
      })).rejects.toThrow(/candidate provenance is missing/i);
      await expect(context.observe({
        reviewedProfile: { ...reviewedProfile } as DeploymentLineageProfileV1,
      })).rejects.toThrow(/profile provenance is missing/i);
      await expect(context.observe({
        nativeCheckpoint: { ...context.nativeCheckpoint } as NativeVerifiedBridgeCheckpoint,
      })).rejects.toThrow(/checkpoint provenance is missing/i);
      await expect(context.observe({
        nativeExecutionAuthority: {
          ...context.nativeExecutionAuthority,
        } as NativeVerifierExecutionAuthority,
      })).rejects.toThrow(/lacks source-refreshed authority/i);
      expect(() => createReviewedDeploymentLineageProfile({
        ...profileInput,
        profileId: 'unreviewed-profile-v1',
      })).toThrow(/digest is not source-reviewed/i);
    });
  });

  it('enforces reviewed genesis, GRANDPA, pre-deployment-parent, and bounded-interval semantics', () => {
    expect(() => createReviewedDeploymentLineageProfile({
      ...profileInput,
      sidechainIdHex: hash('99'),
    })).toThrow(/sidechain ID must equal the raw Substrate genesis/i);
    expect(() => createReviewedDeploymentLineageProfile({
      ...profileInput,
      nativeGrandpaTrust: {
        ...profileInput.nativeGrandpaTrust,
        authoritySetHashHex: hash('98'),
      },
    })).toThrow(/authority-set hash does not bind/i);
    expect(() => createReviewedDeploymentLineageProfile({
      ...profileInput,
      nativeGrandpaTrust: {
        ...profileInput.nativeGrandpaTrust,
        trustedAnchorDigestHex: hash('97'),
      },
    })).toThrow(/trust digest does not bind/i);
    expect(() => createReviewedDeploymentLineageProfile({
      ...profileInput,
      nativeGrandpaTrust: {
        ...profileInput.nativeGrandpaTrust,
        checkpointHeight: '10',
      },
    })).toThrow(/checkpoint must not be after/i);
    expect(() => createReviewedDeploymentLineageProfile({
      ...profileInput,
      interval: {
        ...profileInput.interval,
        terminalHeight: '10',
        terminalExecutionBlockHashHex: profileInput.token.deploymentBlockHashHex,
        maximumBlockCount: 2,
      },
    })).toThrow(/must include the bridge deployment/i);
    expect(() => createReviewedDeploymentLineageProfile({
      ...profileInput,
      declaredNetworkScope: 'public-testnet',
      interval: {
        ...profileInput.interval,
        terminalHeight: '4104',
        terminalExecutionBlockHashHex: hash('97'),
        maximumBlockCount: 4_096,
      },
    })).toThrow(/digest is not source-reviewed/i);
  });

  it('rejects a finalized checkpoint that does not bind the exact T19 terminal execution target', async () => {
    await withFixturePair({}, {}, async context => {
      const stale = await buildNativeCheckpoint({
        executionBlockHashHex: hash('36'),
      });
      await expect(context.observe({
        nativeCheckpoint: stale.checkpoint,
        nativeExecutionAuthority: stale.authority,
      }))
        .rejects.toThrow(/does not bind the reviewed terminal execution target/i);
      const wrongTrust = await buildNativeCheckpoint({
        trustCheckpointHashHex: hash('74'),
      });
      await expect(context.observe({
        nativeCheckpoint: wrongTrust.checkpoint,
        nativeExecutionAuthority: wrongTrust.authority,
      })).rejects.toThrow(/does not bind the reviewed terminal execution target/i);
      const wrongHeight = await buildNativeCheckpoint({ sidechainHeight: '14' });
      await expect(context.observe({
        nativeCheckpoint: wrongHeight.checkpoint,
        nativeExecutionAuthority: wrongHeight.authority,
      })).rejects.toThrow(/does not bind the reviewed terminal execution target/i);
    });
  });

  it('rejects a direct-process checkpoint without source-refreshed authority execution', async () => {
    await withFixturePair({}, {}, async context => {
      const direct = await buildNativeCheckpoint({ authorityBound: false });
      await expect(context.observe({
        nativeCheckpoint: direct.checkpoint,
        nativeExecutionAuthority: direct.authority,
      })).rejects.toThrow(/lacks source-refreshed authority/i);
    });
  });

  it.each([
    ['history gap', { parentGapHeight: 13 }, /parent-hash gap/i],
    ['pre-deployment code', { predeploymentTokenCode: true }, /exists before its reviewed deployment/i],
    ['runtime code drift', { tokenCodeDriftHeight: 14 }, /runtime code disappeared, changed, or reverted/i],
    ['wrong creation input', { wrongTokenCreationInput: true }, /exact reviewed creation/i],
    ['wrong creation receipt', { wrongBridgeContractAddress: true }, /exact reviewed creation/i],
    ['refetched creation transaction drift', { refetchedTokenDeploymentFrom: USER }, /exact reviewed creation/i],
    ['missing receipt', { missingReceiptHash: BURN_TX }, /receipt must be an object/i],
    ['failed receipt carrying relevant logs', { failedRelevantReceiptHash: MINT_TX }, /carrying relevant logs did not succeed/i],
    ['malformed relevant log', { malformedMintTransferLog: true }, /event log is malformed/i],
    ['duplicate log identity', { duplicateMintLogIdentity: true }, /repeats a log identity/i],
    ['owner event drift', { tokenOwnerStateDriftHeight: 12 }, /post-state disagrees/i],
    ['mint and PegIn drift', { pegInAmount: 99n }, /not paired one-to-one/i],
    ['supply drift', { supplyAtMint: 99n }, /totalSupply delta disagrees/i],
    ['replay-state drift', { processedPegInFalse: true }, /not retained in processedPegIns/i],
    ['duplicate PegIn box ID', { duplicatePegInBox: true }, /repeats a PegIn Ergo box ID/i],
    ['successful direct mint', { successfulTopLevelDirectMint: true }, /direct SERG\.mint call is forbidden/i],
    ['replaced pre-deployment parent', { replaceStartBlockCoherently: true }, /does not reach the exact terminal execution hash/i],
    ['oversized block transaction count', { oversizedBlockTransactionCount: true }, /block transaction count exceeds/i],
    ['oversized RPC response', { oversizedRpcResponse: true }, /response exceeds/i],
    ['oversized RPC byte field', { oversizedRpcByteField: true }, /input exceeds/i],
    ['indexed-log disagreement', { indexedLogMismatch: true }, /indexed logs disagree/i],
  ] as const)(
    'rejects %s',
    async (_label, mutation, expected) => {
      await withFixturePair(mutation, mutation, async context => {
        await expect(context.observe()).rejects.toThrow(expected);
      });
    },
  );

  it('rejects chain mismatch, source disagreement, terminal replacement, and rollback', async () => {
    await withFixturePair({ lineageChainId: 1338n }, { lineageChainId: 1338n }, async context => {
      await expect(context.observe()).rejects.toThrow(/chain ID differs/i);
    });
    await withFixturePair({ chainIdChangesOnRecheck: true }, { chainIdChangesOnRecheck: true }, async context => {
      await expect(context.observe()).rejects.toThrow(/chain ID changed/i);
    });
    await withFixturePair({}, { coherentExtraApproval: true }, async context => {
      await expect(context.observe()).rejects.toThrow(/sources disagree/i);
    });
    await withFixturePair({}, { burnCalldataDrift: true }, async context => {
      await expect(context.observe()).rejects.toThrow(/sources disagree/i);
    });
    await withFixturePair({ headBelowTerminalInitially: true }, { headBelowTerminalInitially: true }, async context => {
      await expect(context.observe()).rejects.toThrow(/does not cover/i);
    });
    await withFixturePair({ replaceTerminalOnRecheck: true }, { replaceTerminalOnRecheck: true }, async context => {
      await expect(context.observe()).rejects.toThrow(/terminal block changed/i);
    });
    await withFixturePair({ rollbackHeadOnRecheck: true }, { rollbackHeadOnRecheck: true }, async context => {
      await expect(context.observe()).rejects.toThrow(/rolled back below/i);
    });
  });

  it('accepts head advancement after the exact terminal block remains canonical', async () => {
    await withFixturePair({ advanceTipOnRecheck: true }, { advanceTipOnRecheck: true }, async context => {
      await expect(context.observe()).resolves.toMatchObject({
        authority: { historicalReceiptStateProofCompletenessProved: false },
        interval: { terminalHeight: '15' },
      });
    });
  });

  it('rejects cumulative RPC response bytes before retaining an unbounded receipt set', async () => {
    await withFixturePair({
      rpcResponsePaddingBytes:
        MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES - (128 * 1_024),
    }, {}, async context => {
      await expect(context.observe()).rejects.toThrow(
        new RegExp(`responses exceed ${MAX_DEPLOYMENT_LINEAGE_RPC_TOTAL_RESPONSE_BYTES} total bytes`, 'i'),
      );
    });
  });

  it('rejects concurrent reuse without resetting the active observation budget', async () => {
    await withFixturePair({}, {}, async context => {
      const first = context.observe();
      await expect(context.observe()).rejects.toThrow(/already has an active observation/i);
      await expect(first).resolves.toMatchObject({
        status: 'non_authorizing_candidate',
      });
    });
  });

  it('permits deterministic sequential reuse after both source budgets close', async () => {
    await withFixturePair({}, {}, async context => {
      const first = await context.observe();
      const second = await context.observe();
      expect(second.candidateDigestHex).toBe(first.candidateDigestHex);
      expect(second.sourceAgreement.viewAgreementDigestHex).toBe(
        first.sourceAgreement.viewAgreementDigestHex,
      );
    });
  });

  it('cleans up an aborted peer before failure-then-success reuse', async () => {
    await withFixturePair({ indexedLogMismatchOnce: true }, {}, async context => {
      await expect(context.observe()).rejects.toThrow(/indexed logs disagree/i);
      await expect(context.observe()).resolves.toMatchObject({
        status: 'non_authorizing_candidate',
      });
    });
  });

  it('rejects an operation that crosses its fixed observation deadline', async () => {
    await withFixturePair({}, {}, async context => {
      const startedAt = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
      try {
        const observation = context.observe();
        clock.mockReturnValue(startedAt + MAX_DEPLOYMENT_LINEAGE_OBSERVATION_MS + 1);
        await expect(observation).rejects.toThrow(/operation deadline/i);
      } finally {
        clock.mockRestore();
      }
    });
  });

  it('requires the same opaque credential-free origins used by the T19 candidate', async () => {
    await withFixturePair({}, {}, async context => {
      const third = await startRpcFixture({});
      try {
        const mismatchedSources = createDeploymentLineageSourcePair({
          primaryRpcUrl: context.primary.rpcUrl,
          witnessRpcUrl: third.rpcUrl,
        });
        await expect(context.observe({ sources: mismatchedSources }))
          .rejects.toThrow(/sources differ from the provenance-bound deployment identity/i);
      } finally {
        await third.close();
      }
      expect(() => createDeploymentLineageSourcePair({
        primaryRpcUrl: 'http://user:secret@127.0.0.1:8001',
        witnessRpcUrl: 'http://127.0.0.1:8002',
      })).toThrow(/must not include credentials/i);
    });
  });

  it('keeps the final candidate path read-only and on the fixed RPC method surface', async () => {
    await withFixturePair({}, {}, async context => {
      await context.observe();
      const allowed = new Set([
        'eth_blockNumber',
        'eth_call',
        'eth_chainId',
        'eth_getBlockByNumber',
        'eth_getCode',
        'eth_getLogs',
        'eth_getTransactionByHash',
        'eth_getTransactionReceipt',
      ]);
      expect(context.primary.methods.every(method => allowed.has(method))).toBe(true);
      expect(context.witness.methods.every(method => allowed.has(method))).toBe(true);
      expect(context.primary.methods.filter(
        method => method === 'eth_getTransactionReceipt',
      )).toHaveLength(5);
      expect(context.witness.methods.filter(
        method => method === 'eth_getTransactionReceipt',
      )).toHaveLength(5);
      expect(context.primary.methods).not.toContain('eth_sendRawTransaction');
      expect(context.witness.methods).not.toContain('eth_sendTransaction');
    });
  });
});

interface FixtureMutation {
  readonly chainId?: bigint;
  readonly lineageChainId?: bigint;
  readonly chainIdChangesOnRecheck?: boolean;
  readonly parentGapHeight?: number;
  readonly predeploymentTokenCode?: boolean;
  readonly tokenCodeDriftHeight?: number;
  readonly wrongTokenCreationInput?: boolean;
  readonly wrongBridgeContractAddress?: boolean;
  readonly refetchedTokenDeploymentFrom?: string;
  readonly missingReceiptHash?: string;
  readonly failedRelevantReceiptHash?: string;
  readonly malformedMintTransferLog?: boolean;
  readonly duplicateMintLogIdentity?: boolean;
  readonly tokenOwnerStateDriftHeight?: number;
  readonly pegInAmount?: bigint;
  readonly supplyAtMint?: bigint;
  readonly processedPegInFalse?: boolean;
  readonly duplicatePegInBox?: boolean;
  readonly successfulTopLevelDirectMint?: boolean;
  readonly coherentExtraApproval?: boolean;
  readonly burnCalldataDrift?: boolean;
  readonly oversizedBlockTransactionCount?: boolean;
  readonly oversizedRpcResponse?: boolean;
  readonly oversizedRpcByteField?: boolean;
  readonly indexedLogMismatch?: boolean;
  readonly indexedLogMismatchOnce?: boolean;
  readonly rpcResponsePaddingBytes?: number;
  readonly replaceTerminalOnRecheck?: boolean;
  readonly advanceTipOnRecheck?: boolean;
  readonly rollbackHeadOnRecheck?: boolean;
  readonly headBelowTerminalInitially?: boolean;
  readonly replaceStartBlockCoherently?: boolean;
}

interface RpcFixture {
  readonly rpcUrl: string;
  readonly methods: string[];
  close(): Promise<void>;
}

interface FixtureContext {
  readonly primary: RpcFixture;
  readonly witness: RpcFixture;
  readonly deploymentIdentityCandidate: DeploymentIdentityCandidate;
  readonly nativeCheckpoint: NativeVerifiedBridgeCheckpoint;
  readonly nativeExecutionAuthority: NativeVerifierExecutionAuthority;
  observe(overrides?: Partial<Parameters<typeof observeAuthorityBoundDeploymentLineage>[0]>):
    ReturnType<typeof observeAuthorityBoundDeploymentLineage>;
}

async function withFixturePair(
  primaryMutation: FixtureMutation,
  witnessMutation: FixtureMutation,
  run: (context: FixtureContext) => Promise<void>,
): Promise<void> {
  const primary = await startRpcFixture(primaryMutation);
  const witness = await startRpcFixture(witnessMutation);
  try {
    const identitySources = createDeploymentIdentitySourcePair({
      primaryRpcUrl: primary.rpcUrl,
      witnessRpcUrl: witness.rpcUrl,
    });
    const deploymentIdentityCandidate = await observeMatchingDeploymentIdentityCandidate({
      sources: identitySources,
      artifactProfile,
      networkScope: 'local-devnet',
      expectedChainId: 1337n,
      bridgeAddress: BRIDGE_ADDRESS,
      tokenAddress: SERG_ADDRESS,
    });
    const native = await buildNativeCheckpoint();
    const sources = createDeploymentLineageSourcePair({
      primaryRpcUrl: primary.rpcUrl,
      witnessRpcUrl: witness.rpcUrl,
    });
    await run({
      primary,
      witness,
      deploymentIdentityCandidate,
      nativeCheckpoint: native.checkpoint,
      nativeExecutionAuthority: native.authority,
      observe(overrides = {}) {
        return observeAuthorityBoundDeploymentLineage({
          bridgeRoot: BRIDGE_ROOT,
          deploymentIdentityCandidate,
          artifactProfile,
          reviewedProfile,
          nativeCheckpoint: native.checkpoint,
          nativeExecutionAuthority: native.authority,
          sources,
          ...overrides,
        });
      },
    });
  } finally {
    await Promise.all([primary.close(), witness.close()]);
  }
}

async function startRpcFixture(mutation: FixtureMutation): Promise<RpcFixture> {
  const methods: string[] = [];
  const counters = new Map<string, number>();
  const world = buildWorld(mutation);
  const server = createServer((request, response) => {
    void handleRpc(request, response, mutation, world, methods, counters);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address() as AddressInfo;
  return Object.freeze({
    rpcUrl: `http://127.0.0.1:${bound.port}`,
    methods,
    async close() {
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close');
    },
  });
}

async function handleRpc(
  request: IncomingMessage,
  response: ServerResponse,
  mutation: FixtureMutation,
  world: ReturnType<typeof buildWorld>,
  methods: string[],
  counters: Map<string, number>,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
    jsonrpc: string;
    id: number;
    method: string;
    params: unknown[];
  };
  methods.push(body.method);
  const index = counters.get(body.method) ?? 0;
  counters.set(body.method, index + 1);
  try {
    const result = rpcResult(body.method, body.params, index, mutation, world);
    response.writeHead(200, { 'content-type': 'application/json' });
    const t20Started = (counters.get('eth_chainId') ?? 0) >= 3;
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result,
      ...(t20Started && mutation.rpcResponsePaddingBytes
        ? { padding: 'x'.repeat(mutation.rpcResponsePaddingBytes) }
        : {}),
    }));
  } catch (error) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32601, message: error instanceof Error ? error.message : String(error) },
    }));
  }
}

function rpcResult(
  method: string,
  params: unknown[],
  index: number,
  mutation: FixtureMutation,
  world: ReturnType<typeof buildWorld>,
): unknown {
  switch (method) {
    case 'eth_chainId':
      if (mutation.oversizedRpcResponse && index >= 2) {
        return `0x${'1'.repeat(MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES)}`;
      }
      return quantity(index >= 2
        ? mutation.chainIdChangesOnRecheck && index >= 3
          ? 1338n
          : (mutation.lineageChainId ?? mutation.chainId ?? 1337n)
        : (mutation.chainId ?? 1337n));
    case 'eth_blockNumber':
      return quantity(mutation.headBelowTerminalInitially && index === 2
        ? 14n
        : index >= 3
        ? mutation.rollbackHeadOnRecheck
          ? 14n
          : mutation.advanceTipOnRecheck
            ? 16n
            : 15n
        : 15n);
    case 'eth_getBlockByNumber': {
      const height = Number(BigInt(String(params[0])));
      const block = structuredClone(world.blocks.get(height));
      if (!block) return null;
      if (height === 13 && mutation.parentGapHeight === 13) block.parentHash = hash('ff');
      if (height === 9 && mutation.replaceStartBlockCoherently) block.hash = hash('fd');
      if (height === 10 && mutation.replaceStartBlockCoherently) block.parentHash = hash('fd');
      if (height === 15 && mutation.replaceTerminalOnRecheck && index >= 9) block.hash = hash('fe');
      if (height === 9 && mutation.oversizedBlockTransactionCount) {
        block.transactions = Array.from(
          { length: MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS_PER_BLOCK + 1 },
          (_, transactionIndex) => ({
            hash: `0x${transactionIndex.toString(16).padStart(64, '0')}`,
            blockHash: block.hash,
            blockNumber: block.number,
            transactionIndex: quantity(BigInt(transactionIndex)),
            from: USER,
            to: SERG_ADDRESS,
            input: '0x',
          }),
        );
      }
      return block;
    }
    case 'eth_getTransactionByHash': {
      const hashHex = String(params[0]).toLowerCase();
      const transaction = structuredClone(world.transactions.get(hashHex) ?? null);
      if (
        transaction
        && hashHex === SERG_DEPLOYMENT_TX_HASH
        && mutation.refetchedTokenDeploymentFrom
      ) {
        transaction.from = mutation.refetchedTokenDeploymentFrom;
      }
      return transaction;
    }
    case 'eth_getTransactionReceipt': {
      const hashHex = String(params[0]).toLowerCase();
      if (hashHex === mutation.missingReceiptHash) return null;
      const receipt = structuredClone(world.receipts.get(hashHex) ?? null);
      if (receipt && hashHex === mutation.failedRelevantReceiptHash) receipt.status = '0x0';
      return receipt;
    }
    case 'eth_getLogs': {
      const filter = params[0] as { blockHash: string; address: string[] };
      const block = [...world.blocks.values()].find(candidate => candidate.hash === filter.blockHash);
      if (!block) return [];
      const addresses = new Set(filter.address.map(value => value.toLowerCase()));
      const logs = block.transactions.flatMap((transaction: { hash: string }) =>
        (world.receipts.get(transaction.hash)?.logs ?? []).filter(
          (log: { address: string }) => addresses.has(log.address),
        ));
      return (
        mutation.indexedLogMismatch
        || (mutation.indexedLogMismatchOnce && index === 4)
      ) && block.hash === hash('33')
        ? logs.slice(1)
        : logs;
    }
    case 'eth_getCode': {
      const addressValue = String(params[0]).toLowerCase();
      const height = world.heightByHash.get((params[1] as { blockHash: string }).blockHash)!;
      if (addressValue === SERG_ADDRESS) {
        if (height < 10) return mutation.predeploymentTokenCode
          ? artifactProfile.token.runtimeBytecodeHex
          : '0x';
        if (height === mutation.tokenCodeDriftHeight) {
          return `${artifactProfile.token.runtimeBytecodeHex.slice(0, -2)}00`;
        }
        return artifactProfile.token.runtimeBytecodeHex;
      }
      if (addressValue === BRIDGE_ADDRESS) {
        return height < 11 ? '0x' : artifactProfile.bridge.runtimeBytecodeHex;
      }
      return '0x';
    }
    case 'eth_call': {
      const call = params[0] as { to: string; data: string };
      const height = world.heightByHash.get((params[1] as { blockHash: string }).blockHash)!;
      return callResult(call.to.toLowerCase(), call.data.toLowerCase(), height, mutation);
    }
    default:
      throw new Error(`unsupported method ${method}`);
  }
}

function callResult(
  to: string,
  data: string,
  height: number,
  mutation: FixtureMutation,
): string {
  if (to === SERG_ADDRESS && data === tokenInterface.encodeFunctionData('owner')) {
    const owner = height < 12 ? DEPLOYER : BRIDGE_ADDRESS;
    return tokenInterface.encodeFunctionResult('owner', [
      height === mutation.tokenOwnerStateDriftHeight ? DEPLOYER : owner,
    ]);
  }
  if (to === SERG_ADDRESS && data === tokenInterface.encodeFunctionData('totalSupply')) {
    const supply = height < 13
      ? 0n
      : height === 13
        ? (mutation.supplyAtMint ?? 100n)
        : mutation.duplicatePegInBox && height === 15
          ? 70n
          : 60n;
    return tokenInterface.encodeFunctionResult('totalSupply', [supply]);
  }
  if (to === BRIDGE_ADDRESS && data === bridgeInterface.encodeFunctionData('owner')) {
    return bridgeInterface.encodeFunctionResult('owner', [DEPLOYER]);
  }
  if (to === BRIDGE_ADDRESS && data === bridgeInterface.encodeFunctionData('sergToken')) {
    return bridgeInterface.encodeFunctionResult('sergToken', [SERG_ADDRESS]);
  }
  if (to === BRIDGE_ADDRESS && data.startsWith(bridgeInterface.getFunction('processedPegIns')!.selector)) {
    return bridgeInterface.encodeFunctionResult('processedPegIns', [!mutation.processedPegInFalse]);
  }
  throw new Error(`unsupported eth_call ${to}:${data}`);
}

function buildWorld(mutation: FixtureMutation) {
  const blocks = new Map<number, any>();
  const transactions = new Map<string, any>();
  const receipts = new Map<string, any>();
  const heightByHash = new Map<string, number>();
  const hashes = new Map<number, string>([
    [9, hash('29')],
    [10, hash('30')],
    [11, hash('31')],
    [12, hash('32')],
    [13, hash('33')],
    [14, hash('34')],
    [15, hash('35')],
    [16, hash('36')],
  ]);
  for (let height = 9; height <= 16; height += 1) {
    const blockHash = hashes.get(height)!;
    blocks.set(height, {
      number: quantity(BigInt(height)),
      hash: blockHash,
      parentHash: height === 9 ? hash('28') : hashes.get(height - 1),
      transactions: [],
    });
    heightByHash.set(blockHash, height);
  }
  const addTransaction = (input: {
    hashHex: string;
    height: number;
    from: string;
    to: string | null;
    data: string;
    contractAddress?: string | null;
    logs?: any[];
  }) => {
    const block = blocks.get(input.height)!;
    const transactionIndex = block.transactions.length;
    const transaction = {
      hash: input.hashHex,
      blockHash: block.hash,
      blockNumber: block.number,
      transactionIndex: quantity(BigInt(transactionIndex)),
      from: input.from,
      to: input.to,
      input: input.data,
    };
    const logs = (input.logs ?? []).map((log, logIndex) => ({
      ...log,
      transactionHash: input.hashHex,
      blockHash: block.hash,
      blockNumber: block.number,
      transactionIndex: quantity(BigInt(transactionIndex)),
      logIndex: quantity(BigInt(logIndex)),
      removed: false,
    }));
    const receipt = {
      transactionHash: input.hashHex,
      blockHash: block.hash,
      blockNumber: block.number,
      transactionIndex: quantity(BigInt(transactionIndex)),
      status: '0x1',
      contractAddress: input.contractAddress ?? null,
      logs,
    };
    block.transactions.push(transaction);
    transactions.set(input.hashHex, transaction);
    receipts.set(input.hashHex, receipt);
  };

  addTransaction({
    hashHex: SERG_DEPLOYMENT_TX_HASH,
    height: 10,
    from: DEPLOYER,
    to: null,
    data: mutation.wrongTokenCreationInput ? `${tokenCreationHex}00` : tokenCreationHex,
    contractAddress: SERG_ADDRESS,
    logs: [eventLog(tokenInterface, 'OwnershipTransferred', [ZERO_ADDRESS, DEPLOYER], SERG_ADDRESS)],
  });
  addTransaction({
    hashHex: BRIDGE_DEPLOY_TX,
    height: 11,
    from: DEPLOYER,
    to: null,
    data: `${bridgeCreationHex}${AbiCoder.defaultAbiCoder().encode(['address'], [SERG_ADDRESS]).slice(2)}`,
    contractAddress: mutation.wrongBridgeContractAddress ? address('99') : BRIDGE_ADDRESS,
    logs: [eventLog(bridgeInterface, 'OwnershipTransferred', [ZERO_ADDRESS, DEPLOYER], BRIDGE_ADDRESS)],
  });
  addTransaction({
    hashHex: OWNERSHIP_TX,
    height: 12,
    from: DEPLOYER,
    to: SERG_ADDRESS,
    data: tokenInterface.encodeFunctionData('transferOwnership', [BRIDGE_ADDRESS]),
    logs: [eventLog(tokenInterface, 'OwnershipTransferred', [DEPLOYER, BRIDGE_ADDRESS], SERG_ADDRESS)],
  });
  const mintTransfer = eventLog(tokenInterface, 'Transfer', [ZERO_ADDRESS, USER, 100n], SERG_ADDRESS);
  if (mutation.malformedMintTransferLog) mintTransfer.data = '0x01';
  addTransaction({
    hashHex: MINT_TX,
    height: 13,
    from: DEPLOYER,
    to: BRIDGE_ADDRESS,
    data: bridgeInterface.encodeFunctionData('mintSERG', [USER, 100n, ERGO_BOX_ID]),
    logs: [
      mintTransfer,
      eventLog(bridgeInterface, 'PegIn', [USER, mutation.pegInAmount ?? 100n, ERGO_BOX_ID], BRIDGE_ADDRESS),
    ],
  });
  if (mutation.duplicateMintLogIdentity) {
    const mintReceipt = receipts.get(MINT_TX)!;
    mintReceipt.logs.push(structuredClone(mintReceipt.logs[0]));
  }
  addTransaction({
    hashHex: BURN_TX,
    height: 14,
    from: USER,
    to: SERG_ADDRESS,
    data: mutation.oversizedRpcByteField
      ? `0x${'01'.repeat(MAX_DEPLOYMENT_LINEAGE_RPC_BYTE_FIELD_BYTES + 1)}`
      : mutation.successfulTopLevelDirectMint
        ? tokenInterface.encodeFunctionData('mint', [USER, 40n])
        : mutation.burnCalldataDrift
          ? '0x12345678'
          : tokenInterface.encodeFunctionData('burn', [40n]),
    logs: [eventLog(tokenInterface, 'Transfer', [USER, ZERO_ADDRESS, 40n], SERG_ADDRESS)],
  });
  if (mutation.duplicatePegInBox) {
    addTransaction({
      hashHex: EXTRA_TX,
      height: 15,
      from: DEPLOYER,
      to: BRIDGE_ADDRESS,
      data: bridgeInterface.encodeFunctionData('mintSERG', [USER, 10n, ERGO_BOX_ID]),
      logs: [
        eventLog(tokenInterface, 'Transfer', [ZERO_ADDRESS, USER, 10n], SERG_ADDRESS),
        eventLog(bridgeInterface, 'PegIn', [USER, 10n, ERGO_BOX_ID], BRIDGE_ADDRESS),
      ],
    });
  }
  if (mutation.coherentExtraApproval) {
    addTransaction({
      hashHex: EXTRA_TX,
      height: 15,
      from: USER,
      to: SERG_ADDRESS,
      data: '0x095ea7b3',
      logs: [eventLog(tokenInterface, 'Approval', [USER, BRIDGE_ADDRESS, 1n], SERG_ADDRESS)],
    });
  }
  return { blocks, transactions, receipts, heightByHash };
}

function eventLog(
  contractInterface: Interface,
  eventName: string,
  values: readonly unknown[],
  contractAddress: string,
) {
  const encoded = contractInterface.encodeEventLog(contractInterface.getEvent(eventName)!, values);
  return {
    address: contractAddress,
    topics: encoded.topics,
    data: encoded.data,
  };
}

function buildLineageContractStateCandidate() {
  const stateRootHex = hash('62');
  const header = substrateHeader({
    parentHashHex: hash('59'),
    height: 13,
    stateRootHex,
  });
  const record = {
    formatVersion: 1 as const,
    sidechainIdHex: reviewedProfile.sidechainIdHex,
    bridgeAddress: BRIDGE_ADDRESS,
    profileRevision: '1',
    profileActivationHeight: '1',
    ergoBoxIdHex: ERGO_BOX_ID,
    recipientAddress: USER,
    amountNanoErg: '100',
    sidechainHeight: '13',
    executionBlockHashHex: hash('33'),
    transactionHashHex: MINT_TX,
    eventIndex: 1,
  };
  const recordScaleHex = encodePegInRuntimeRecordV1ScaleHex(record);
  const eventRequest = structuredClone(FRONTIER_EVENT_VECTOR.request);
  const executionRequest = eventRequest.executionIdentityRequest as Record<string, unknown>;
  executionRequest.trustAnchor = {
    sidechainIdHex: reviewedProfile.sidechainIdHex,
    checkpointHashHex: reviewedProfile.nativeGrandpaTrust.checkpointHashHex,
    checkpointNumber: reviewedProfile.nativeGrandpaTrust.checkpointHeight,
    grandpaSetId: reviewedProfile.nativeGrandpaTrust.grandpaSetId,
    authorityListScaleHex: reviewedProfile.nativeGrandpaTrust.authorityListScaleHex,
  };
  executionRequest.targetNativeBlockHashHex = header.hashHex;
  executionRequest.targetHeaderScaleHex = header.scaleHex;
  executionRequest.linkedGrandpaProofs = [];
  executionRequest.checkpointTailHeadersScaleHex = [header.scaleHex];
  executionRequest.finalityProofScaleHex = '0x01';
  executionRequest.runtimeStateProofNodesHex = ['0x02'];
  const executionStatement = executionRequest.statement as Record<string, unknown>;
  executionStatement.ergoBoxIdHex = ERGO_BOX_ID;
  executionStatement.expectedRecordScaleHex = recordScaleHex;

  const keys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: SERG_ADDRESS,
    ergoBoxIdHex: ERGO_BOX_ID,
  });
  const request = normalizeNativeFinalizedPegInFrontierContractStateV1Request({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    eventRequest,
    statement: {
      schema: PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
      bridgeAddressHex: BRIDGE_ADDRESS,
      tokenAddressHex: SERG_ADDRESS,
      ...keys,
      bridgeRuntimeCodeSha256Hex: `0x${artifactProfile.bridge.runtimeBytecodeSha256Hex}`,
      bridgeRuntimeCodeBytes: artifactProfile.bridge.runtimeByteLength.toString(),
      tokenRuntimeCodeSha256Hex: `0x${artifactProfile.token.runtimeBytecodeSha256Hex}`,
      tokenRuntimeCodeBytes: artifactProfile.token.runtimeByteLength.toString(),
    },
  });

  // The Rust vector owns proof-byte semantics. This fixture only composes real TS provenance brands.
  const eventVerification = structuredClone(FRONTIER_EVENT_VECTOR.expected);
  eventVerification.trustAnchorDigestHex = reviewedProfile.nativeGrandpaTrust.trustedAnchorDigestHex;
  const executionVerification = eventVerification.executionIdentity as Record<string, unknown>;
  executionVerification.trustAnchorDigestHex =
    reviewedProfile.nativeGrandpaTrust.trustedAnchorDigestHex;
  executionVerification.target = {
    nativeBlockHashHex: header.hashHex,
    nativeHeight: '13',
    stateRootHex,
  };
  executionVerification.authority = {
    finalitySigningSetId: reviewedProfile.nativeGrandpaTrust.grandpaSetId,
    finalitySigningAuthorityListScaleHex:
      reviewedProfile.nativeGrandpaTrust.authorityListScaleHex,
    finalitySigningAuthoritySetHashHex:
      reviewedProfile.nativeGrandpaTrust.authoritySetHashHex,
    transitionCount: 0,
    linkedAncestryVerified: true,
  };
  executionVerification.finality = {
    horizonHashHex: header.hashHex,
    horizonHeight: '13',
    canonicalJustificationScaleHex: '0x01',
    verified: true,
  };
  const runtimeState = executionVerification.runtimeState as Record<string, unknown>;
  runtimeState.recordStorageKeyHex = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: reviewedProfile.sidechainIdHex,
    ergoBoxIdHex: ERGO_BOX_ID,
  });
  runtimeState.recordStorageValueScaleHex = recordScaleHex;
  runtimeState.proofNodeCount = 1;
  runtimeState.proofBytes = 1;
  executionVerification.record = {
    formatVersion: 1,
    sidechainIdHex: reviewedProfile.sidechainIdHex,
    bridgeAddressHex: BRIDGE_ADDRESS,
    profileRevision: '1',
    profileActivationHeight: '1',
    ergoBoxIdHex: ERGO_BOX_ID,
    recipientHex: USER,
    amountNanoErg: '100',
    sidechainHeight: '13',
    executionBlockHashHex: hash('33'),
    transactionHashHex: MINT_TX,
    eventIndex: 1,
  };
  executionVerification.execution = {
    executionBlockHashHex: hash('33'),
    executionHeight: '13',
    evmStateRootHex: hash('64'),
    transactionRootHex: hash('65'),
    ommersHashHex: hash('66'),
    transactionCount: 1,
    ommerCount: 0,
    recordTransactionHashHex: MINT_TX,
    recordTransactionIndex: 0,
  };
  executionVerification.requestDigestHex =
    deriveNativeFinalizedPegInFrontierExecutionIdentityV1ExactRequestDigestHex(
      Buffer.from(JSON.stringify(request.eventRequest.executionIdentityRequest), 'utf8'),
    );

  const receiptState = eventVerification.receiptState as Record<string, unknown>;
  receiptState.receiptCount = 1;
  receiptState.transactionStatusCount = 1;
  receiptState.proofNodeCount = 1;
  receiptState.proofBytes = 1;
  eventVerification.event = {
    transactionHashHex: MINT_TX,
    transactionIndex: 0,
    transactionLogIndex: 1,
    globalEventIndex: 1,
    receiptType: 'legacy',
    receiptStatusCode: 1,
    bridgeAddressHex: BRIDGE_ADDRESS,
    eventSignatureTopicHex:
      (FRONTIER_EVENT_VECTOR.expected.event as Record<string, unknown>)
        .eventSignatureTopicHex,
    recipientHex: USER,
    amountNanoErg: '100',
    ergoBoxIdHex: ERGO_BOX_ID,
  };
  eventVerification.requestDigestHex =
    deriveNativeFinalizedPegInFrontierEventV1ExactRequestDigestHex(
      Buffer.from(JSON.stringify(request.eventRequest), 'utf8'),
    );
  delete eventVerification.status;

  const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
  const proofNodeCount = request.eventRequest.executionIdentityRequest
    .runtimeStateProofNodesHex.length;
  const proofBytes = request.eventRequest.executionIdentityRequest
    .runtimeStateProofNodesHex.reduce((total, node) => total + (node.length - 2) / 2, 0);
  return buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate({
    requestBytes,
    trustedAnchorDigestHex: reviewedProfile.nativeGrandpaTrust.trustedAnchorDigestHex,
    verification: {
      schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_VERIFICATION_SCHEMA,
      status: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
      requestDigestHex:
        deriveNativeFinalizedPegInFrontierContractStateV1ExactRequestDigestHex(requestBytes),
      trustAnchorDigestHex: reviewedProfile.nativeGrandpaTrust.trustedAnchorDigestHex,
      eventVerification,
      contractState: {
        stateRootHex,
        bridgeAddressHex: BRIDGE_ADDRESS,
        tokenAddressHex: SERG_ADDRESS,
        bridgeAccountCodeStorageKeyHex: request.statement.bridgeAccountCodeStorageKeyHex,
        bridgeRuntimeCodeSha256Hex: request.statement.bridgeRuntimeCodeSha256Hex,
        bridgeRuntimeCodeBytes: request.statement.bridgeRuntimeCodeBytes,
        tokenAccountCodeStorageKeyHex: request.statement.tokenAccountCodeStorageKeyHex,
        tokenRuntimeCodeSha256Hex: request.statement.tokenRuntimeCodeSha256Hex,
        tokenRuntimeCodeBytes: request.statement.tokenRuntimeCodeBytes,
        bridgeOwnerStorageKeyHex: request.statement.bridgeOwnerStorageKeyHex,
        bridgeOwnerAddressHex: DEPLOYER,
        bridgeConfigurationStorageKeyHex: request.statement.bridgeConfigurationStorageKeyHex,
        bridgeTokenAddressHex: SERG_ADDRESS,
        bridgePaused: false,
        processedPegInStorageKeyHex: request.statement.processedPegInStorageKeyHex,
        processedPegIn: true,
        tokenTotalSupplyStorageKeyHex: request.statement.tokenTotalSupplyStorageKeyHex,
        tokenTotalSupply: '100',
        tokenOwnerStorageKeyHex: request.statement.tokenOwnerStorageKeyHex,
        tokenOwnerAddressHex: BRIDGE_ADDRESS,
        proofNodeCount,
        proofBytes,
        verified: true,
      },
      boundary: {
        ...(eventVerification.boundary as Record<string, unknown>),
        evmCodeStateVerified: true,
        evmStorageStateVerified: true,
        nativeVerifierExecutionAuthenticated: false,
        daemonAdmissionAuthorized: false,
      },
    },
  });
}

function substrateHeader(input: {
  readonly parentHashHex: string;
  readonly height: number;
  readonly stateRootHex: string;
}) {
  if (!Number.isSafeInteger(input.height) || input.height < 0 || input.height >= 64) {
    throw new Error('test header height is outside single-byte compact range');
  }
  const bytes = Buffer.concat([
    Buffer.from(input.parentHashHex.slice(2), 'hex'),
    Buffer.from([input.height << 2]),
    Buffer.from(input.stateRootHex.slice(2), 'hex'),
    Buffer.from(hash('63').slice(2), 'hex'),
    Buffer.from([0]),
  ]);
  return {
    hashHex: `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`,
    scaleHex: `0x${bytes.toString('hex')}`,
  };
}

async function buildNativeCheckpoint(overrides: {
  executionBlockHashHex?: string;
  trustCheckpointHashHex?: string;
  sidechainHeight?: string;
  authorityBound?: boolean;
} = {}): Promise<Readonly<{
  checkpoint: NativeVerifiedBridgeCheckpoint;
  authority: NativeVerifierExecutionAuthority;
}>> {
  const trust = reviewedProfile.nativeGrandpaTrust;
  const request: NativeFinalizedBridgeCheckpointRequest = {
    schema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
    trustAnchor: {
      sidechainIdHex: reviewedProfile.sidechainIdHex,
      checkpointHashHex: overrides.trustCheckpointHashHex
        ?? trust.checkpointHashHex,
      checkpointNumber: trust.checkpointHeight,
      grandpaSetId: trust.grandpaSetId,
      authorityListScaleHex: trust.authorityListScaleHex,
    },
    targetNativeBlockHashHex: hash('60'),
    targetHeaderScaleHex: '0x0102',
    linkedGrandpaProofs: [{ ancestryHeadersScaleHex: ['0x0304'], proofScaleHex: '0x0506' }],
    checkpointTailHeadersScaleHex: ['0x0708'],
    finalityProofScaleHex: '0x090a',
    runtimeStateProofNodesHex: ['0x0b0c'],
  };
  const commitment = {
    sidechainIdHex: reviewedProfile.sidechainIdHex,
    sidechainHeight: overrides.sidechainHeight
      ?? reviewedProfile.interval.terminalHeight,
    executionBlockHashHex: overrides.executionBlockHashHex
      ?? reviewedProfile.interval.terminalExecutionBlockHashHex,
    bridgeEventRootHex: hash('61'),
    burnLeafCount: 1,
  };
  const trustedAnchorDigestHex =
    deriveNativeGrandpaTrustAnchorDigestFromTrustAnchor(request.trustAnchor);
  const signingAuthorityList = '0x0801';
  const verification: NativeFinalizedBridgeCheckpointVerificationPayload = {
    schema: 'e2s.native-finalized-bridge-checkpoint-verification.v2',
    status: 'NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT',
    requestDigestHex: blake2b256Hex(Buffer.from(JSON.stringify(request), 'utf8')),
    trustAnchorDigestHex: trustedAnchorDigestHex,
    target: {
      nativeBlockHashHex: request.targetNativeBlockHashHex,
      nativeHeight: commitment.sidechainHeight,
      stateRootHex: hash('62'),
    },
    authority: {
      finalitySigningSetId: '8',
      finalitySigningAuthorityListScaleHex: signingAuthorityList,
      finalitySigningAuthoritySetHashHex: authoritySetHash(signingAuthorityList),
      transitionCount: 1,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex: hash('63'),
      horizonHeight: '16',
      canonicalJustificationScaleHex: '0x0d0e',
      verified: true,
    },
    runtimeState: {
      storageKeyHex: '0xaf86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5',
      storageValueScaleHex: commitmentScaleHex(commitment),
      proofNodeCount: 1,
      proofBytes: 2,
      verified: true,
    },
    commitment,
    boundary: {
      sidechainFinalityVerified: true,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    },
  };
  const encoded = Buffer.from(JSON.stringify(verification), 'utf8').toString('base64');
  const script = `const c=[];process.stdin.on('data',x=>c.push(x));process.stdin.on('end',()=>{JSON.parse(Buffer.concat(c));process.stdout.write(Buffer.from('${encoded}','base64'));});`;
  const executableArgs = ['-e', script, '--'];
  const executableSha256Hex = `0x${createHash('sha256').update(readFileSync(process.execPath)).digest('hex')}`;
  const authority = {
    declaration: {
      profileId: 'inert-lineage-authority-v1',
      attestationId: 'inert-lineage-attestation-v1',
      policyId: 'inert-lineage-policy-v1',
      executionPolicySha256: '11'.repeat(32),
      policyEpoch: 1,
      launcherPath: process.execPath,
      verifierExecutablePath: process.execPath,
      codecExecutablePath: process.execPath,
      verifierExecutableSha256Hex: executableSha256Hex,
      codecExecutableSha256Hex: executableSha256Hex,
      codecExecutableInvocationSha256Hex: {
        encodeHeaders: hash('71'),
        inspectWarpProof: hash('72'),
        inspectFinalityProof: hash('73'),
      },
    },
    async execute() {
      return {
        stdout: Buffer.from(JSON.stringify(verification), 'utf8'),
        profileId: 'inert-lineage-authority-v1',
        attestationId: 'inert-lineage-attestation-v1',
        policyId: 'inert-lineage-policy-v1',
        executionPolicySha256: '11'.repeat(32),
        policyEpoch: 1,
        operation: 'verify-checkpoint' as const,
        boundary: {
          sourceOwnedAttestorLockReloaded: true as const,
          sourceOwnedAttestorLockRevalidatedAfterExecution: true as const,
          reviewedTrustRootsRequired: true as const,
          exactPolicyValidatedAfterReload: true as const,
          exactPolicyRevalidatedAfterExecution: true as const,
          brokerAuthorityModeRequested: true as const,
          directProcessAllowed: false as const,
          executionAdmissionGranted: false as const,
          settlementAuthorityGranted: false as const,
          gate5Closed: false as const,
          productionReady: false as const,
        },
      };
    },
  } as unknown as NativeVerifierExecutionAuthority;
  const verified = overrides.authorityBound === false
    ? await verifyNativeFinalizedBridgeCheckpoint({
      executablePath: process.execPath,
      expectedExecutableSha256Hex: executableSha256Hex,
      expectedExecutableInvocationSha256Hex: deriveExecutableInvocationSha256Hex(
        executableSha256Hex,
        [...executableArgs, '--trusted-anchor-digest', trustedAnchorDigestHex],
      ),
      executableArgs,
      timeoutMs: 2_000,
      trustedAnchorDigestHex,
      request,
    })
    : await createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier(
      authority,
    ).verify({ trustedAnchorDigestHex, request });
  return Object.freeze({
    checkpoint: buildNativeVerifiedBridgeCheckpoint(verified),
    authority,
  });
}

function authoritySetHash(authorityListScaleHex: string): string {
  return blake2b256Hex(Buffer.concat([
    Buffer.from('E2S_GRANDPA_AUTHORITY_SET_V1', 'utf8'),
    Buffer.from(authorityListScaleHex.slice(2), 'hex'),
  ]));
}

function commitmentScaleHex(value: {
  sidechainIdHex: string;
  sidechainHeight: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
}): string {
  const height = Buffer.alloc(8);
  height.writeBigUInt64LE(BigInt(value.sidechainHeight));
  const count = Buffer.alloc(4);
  count.writeUInt32LE(value.burnLeafCount);
  return `0x${Buffer.concat([
    Buffer.from([1]),
    Buffer.from(value.sidechainIdHex.slice(2), 'hex'),
    height,
    Buffer.from(value.executionBlockHashHex.slice(2), 'hex'),
    Buffer.from(value.bridgeEventRootHex.slice(2), 'hex'),
    count,
  ]).toString('hex')}`;
}

function blake2b256Hex(value: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex')}`;
}

function quantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function hash(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function address(byte: string): string {
  return `0x${byte.repeat(20)}`;
}
