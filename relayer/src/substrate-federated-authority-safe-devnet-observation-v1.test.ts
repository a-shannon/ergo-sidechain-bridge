import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Interface, Transaction, Wallet, getBytes, keccak256, toUtf8Bytes } from 'ethers';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  loadTrackedDeploymentIdentityArtifactProfile,
  type DeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';
import { BRIDGE_ABI, SERG_ABI } from './sidechain-contract-abi.js';
import {
  assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance,
  buildAuthoritySafeLegacyMintProbeV1,
  observeSubstrateFederatedAuthoritySafeDevnetV1,
  substrateFederatedAuthoritySafeStorageLayoutDigestV1,
  type ObserveSubstrateFederatedAuthoritySafeDevnetV1Input,
} from './substrate-federated-authority-safe-devnet-observation-v1.js';
import {
  projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
  type SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
} from './relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const CHAIN_ID = 42n;
const CHAIN_NAME = 'Bridge Federated Authority-Safe Target';
const NODE_NAME = 'Frontier Node';
const NODE_VERSION = '0.0.0-test';
const BRIDGE_ADDRESS = `0x${'06'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'07'.repeat(20)}`;
const RECIPIENT_ADDRESS = `0x${'08'.repeat(20)}`;
const ERGO_BOX_ID_HEX = `0x${'09'.repeat(32)}`;
const NATIVE_GENESIS_HASH_HEX = `0x${'11'.repeat(32)}`;
const NATIVE_TIP_HASH_HEX = `0x${'22'.repeat(32)}`;
const EVM_TIP_HASH_HEX = `0x${'33'.repeat(32)}`;
const TIP_HEIGHT = 5n;
const RUNTIME_CODE_HEX = '0x01020304';
const RUNTIME_CODE_SHA256_HEX =
  '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';
const STORAGE_LAYOUT_DIGEST_HEX =
  '024816a411ac4765b88f66b733392da1802af8311161dfe70e866cf6c7a16880';
const DIRECT_OWNER_MINT_REJECTION_HEX = '0x010007b5';
const PRIMARY_PEER_ID = '12D3KooWEA5RoFzpj4FnSxSUVgGHKAK4LpQxQ8w2XL9J4SKhujVP';
const WITNESS_PEER_ID = '12D3KooWEA5RoFzpj4FnSxSUVgGHKAK4LpQxQ8w2XL9J4SKhujVQ';
const bridgeInterface = new Interface(BRIDGE_ABI);
const tokenInterface = new Interface(SERG_ABI);
const legacyMintInterface = new Interface([
  'function mintSERG(address recipient,uint256 amount,bytes32 ergoBoxId)',
]);
const ownerWallet = deterministicWallet('authority-safe-owner-observation-v1');
const otherWallet = deterministicWallet('authority-safe-other-observation-v1');

const STORAGE_KEYS = Object.freeze({
  sudo: '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b',
  bridgeAddress:
    '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45',
  currentPegInProfile:
    '0xaf86fef4216ac2bcd1c592b204011ad0d4e9ffac40246e76bb00b9031373d2c3',
  currentCausalPegInProfileV2:
    '0xaf86fef4216ac2bcd1c592b204011ad0a429af194416082f5009fdf71f22761e',
  currentPooledReserveProfileV4:
    '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde',
  causalEnforcementV2:
    '0xaf86fef4216ac2bcd1c592b204011ad0a913a559be365cacd68b07ebf9b92d3a',
  pooledReserveEnforcementV4:
    '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1',
  runtimeCode: '0x3a636f6465',
});

interface RpcRequest {
  readonly method: string;
  readonly params: readonly unknown[];
}

interface RpcFixtureOptions {
  readonly peerId?: string;
  readonly shouldHavePeers?: boolean;
  readonly runtimeCodeHex?: string;
  readonly bridgeRuntimeCodeHex?: string;
  readonly directOwnerMintResultHex?: string;
  readonly sudoValue?: string | null;
  readonly activeProfileValue?: string | null;
  readonly evmBlockNumber?: bigint;
  readonly failMethod?: string;
  readonly unstableTip?: boolean;
}

interface RpcFixture {
  readonly rpcUrl: string;
  readonly methods: string[];
  readonly requests: RpcRequest[];
  close(): Promise<void>;
}

let profile: DeploymentIdentityArtifactProfile;
let expectedDryRunExtrinsicHex: string;

beforeAll(async () => {
  profile = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);
  expectedDryRunExtrinsicHex = buildProbe(await signLegacyOwnerMint()).dryRunExtrinsicHex;
});

describe('Substrate federated authority-safe devnet observation V1', () => {
  it('builds one exact signed legacy owner-mint dry-run probe and rejects identity drift', async () => {
    const signed = await signLegacyOwnerMint();
    const probe = buildProbe(signed);

    expect(probe).toMatchObject({
      signerAddress: ownerWallet.address.toLowerCase(),
      bridgeAddress: BRIDGE_ADDRESS,
      recipientAddress: RECIPIENT_ADDRESS,
      amount: '1000000000',
      ergoBoxIdHex: ERGO_BOX_ID_HEX,
      nonce: '0',
      chainId: CHAIN_ID.toString(),
    });
    expect(probe.ethereumTransactionHashHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(probe.dryRunExtrinsicHex).toMatch(/^0x[0-9a-f]+$/);
    expect(probe.dryRunExtrinsicSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(substrateFederatedAuthoritySafeStorageLayoutDigestV1(
      RUNTIME_CODE_SHA256_HEX,
    )).toBe(STORAGE_LAYOUT_DIGEST_HEX);

    const transaction = Transaction.from(signed);
    const decoded = decodeLegacyMintDryRunExtrinsic(probe.dryRunExtrinsicHex);
    expect(decoded).toEqual({
      version: 4,
      palletIndex: 7,
      callIndex: 0,
      transactionVariant: 0,
      nonce: BigInt(transaction.nonce),
      gasPrice: transaction.gasPrice,
      gasLimit: transaction.gasLimit,
      actionVariant: 0,
      targetAddress: BRIDGE_ADDRESS,
      value: transaction.value,
      dataHex: transaction.data,
      networkV: transaction.signature?.networkV,
      rHex: transaction.signature?.r.toLowerCase(),
      sHex: transaction.signature?.s.toLowerCase(),
    });

    const wrongSigner = await signLegacyOwnerMint({ wallet: otherWallet });
    expect(() => buildProbe(wrongSigner)).toThrow(/signer is not the exact bridge owner/i);

    const wrongTarget = await signLegacyOwnerMint({ to: TOKEN_ADDRESS });
    expect(() => buildProbe(wrongTarget)).toThrow(/target is not the exact bridge/i);

    const wrongChain = await signLegacyOwnerMint({ chainId: CHAIN_ID + 1n });
    expect(() => buildProbe(wrongChain)).toThrow(/chain ID differs from the target/i);
  });

  it('joins two connected loopback origins into one non-authorizing runtime observation', async () => {
    const primary = await startRpcFixture({
      peerId: PRIMARY_PEER_ID,
      shouldHavePeers: false,
    });
    const witness = await startRpcFixture({ peerId: WITNESS_PEER_ID });
    try {
      const observation = await observeSubstrateFederatedAuthoritySafeDevnetV1(
        await observationInput(primary.rpcUrl, witness.rpcUrl),
      );
      const primaryCompatibilityRequestCount = primary.requests.length;
      const witnessCompatibilityRequestCount = witness.requests.length;
      const classified = await observeSubstrateFederatedAuthoritySafeDevnetV1(
        await observationInput(primary.rpcUrl, witness.rpcUrl),
        true,
      );

      assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance(observation);
      assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance(classified);
      expect(classified).toEqual(observation);
      expect(observation.status).toBe('isolated_two_node_runtime_observation');
      expect(observation.target).toMatchObject({
        chainName: CHAIN_NAME,
        chainId: CHAIN_ID.toString(),
        nativeGenesisHashHex: NATIVE_GENESIS_HASH_HEX,
        storageLayoutDigestHex: STORAGE_LAYOUT_DIGEST_HEX,
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        bridgeOwnerAddress: ownerWallet.address.toLowerCase(),
      });
      expect(observation.sourceAgreement.sourceCount).toBe(2);
      expect(observation.sourceAgreement.peerIds).toEqual(
        [PRIMARY_PEER_ID, WITNESS_PEER_ID].sort(),
      );
      expect(observation.checks.directLegacyOwnerMintRejectedByRuntimePolicy).toBe(true);
      expect(observation.checks.exactStorageLayoutPinVerified).toBe(true);
      expect(observation.legacyOwnerMintProbe.resultHex).toBe(
        DIRECT_OWNER_MINT_REJECTION_HEX,
      );
      expect(observation.boundaries).toMatchObject({
        twoNodeRuntimeIdentityObserved: true,
        independentSourceOriginsEstablished: true,
        independentSourceAdministrationEstablished: false,
        exactBinaryIdentityObserved: false,
        exactGeneratedSpecAcceptanceObserved: false,
        indirectOwnerMintBlockRejectionObserved: false,
        sourceHistoryAuthenticated: false,
        sourceFinalityAuthenticated: false,
        federatedLaunchEligible: false,
        mintAuthorized: false,
        settlementAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      });
      expect(primary.methods.filter(method => method === 'system_dryRunAt')).toHaveLength(2);
      expect(witness.methods.filter(method => method === 'system_dryRunAt')).toHaveLength(2);
      expect([...primary.methods, ...witness.methods]).not.toContain('author_submitExtrinsic');
      expect([...primary.methods, ...witness.methods]).not.toContain('eth_sendRawTransaction');
      assertExactRpcRequestClosure(
        primary.requests.slice(0, primaryCompatibilityRequestCount),
      );
      assertExactRpcRequestClosure(
        primary.requests.slice(primaryCompatibilityRequestCount),
      );
      assertExactRpcRequestClosure(
        witness.requests.slice(0, witnessCompatibilityRequestCount),
      );
      assertExactRpcRequestClosure(
        witness.requests.slice(witnessCompatibilityRequestCount),
      );
      expect(() => assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance({
        ...observation,
      })).toThrow(/provenance is missing/i);
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it.each([
    [
      'runtime code drift',
      { runtimeCodeHex: '0x01020305' },
      /runtime code differs from the explicit pin/i,
      'source target node identity and runtime validation',
    ],
    [
      'bridge application code drift',
      { bridgeRuntimeCodeHex: '0x01' },
      /genesis bridge runtime code differs from the tracked artifact/i,
      'source target application identity validation',
    ],
    [
      'a populated Sudo key',
      { sudoValue: '0x01' },
      /Sudo key must remain absent/i,
      'source target top-trie policy observation',
    ],
    [
      'an active peg-in profile',
      { activeProfileValue: '0x01' },
      /profile or enforcement state must remain absent/i,
      'source target top-trie policy observation',
    ],
    [
      'a weaker direct owner-mint result',
      { directOwnerMintResultHex: '0x00' },
      /was not rejected with Custom\(181\)/i,
      'source target owner-mint quarantine validation',
    ],
    [
      'an inconsistent EVM block height',
      { evmBlockNumber: TIP_HEIGHT + 1n },
      /EVM tip height differs from the deployment snapshot/i,
      'source target native and EVM tip observation',
    ],
    [
      'a deployment identity RPC failure',
      { failMethod: 'eth_blockNumber' },
      /read-only deployment RPC eth_blockNumber returned an error/i,
      'source target deployment identity observation',
    ],
    [
      'a node snapshot RPC failure',
      { failMethod: 'system_chain' },
      /fixture forced system_chain failure/i,
      'source target node RPC snapshot observation',
    ],
    [
      'a tip replacement during revalidation',
      { unstableTip: true },
      /native tip changed at the observed height/i,
      'source target tip stability observation',
    ],
  ] as const)(
    'rejects %s',
    async (_label, options, expected, expectedPhase) => {
      await expectObservationFailure(options, {}, expected);
      await expectObservationFailurePhase(options, {}, expectedPhase);
    },
    15_000,
  );

  it('rejects two origins that expose the same peer identity', async () => {
    await expectObservationFailure(
      { peerId: PRIMARY_PEER_ID },
      { peerId: PRIMARY_PEER_ID },
      /must expose distinct peer identities/i,
    );
    await expectObservationFailurePhase(
      { peerId: PRIMARY_PEER_ID },
      { peerId: PRIMARY_PEER_ID },
      'source target two-node observation finalization',
    );
  });

  it.each([
    [
      { unstableTip: true },
      { runtimeCodeHex: '0x01020305' },
    ],
    [
      { runtimeCodeHex: '0x01020305' },
      { unstableTip: true },
    ],
  ] as const)(
    'deterministically lets a non-retryable node failure dominate a concurrent retryable failure',
    async (primaryOptions, witnessOptions) => {
      await expectObservationFailurePhase(
        primaryOptions,
        witnessOptions,
        'source target node identity and runtime validation',
      );
    },
  );

  it('classifies differing concurrent non-retryable failures as a bounded two-node conflict', async () => {
    await expectObservationFailurePhase(
      { runtimeCodeHex: '0x01020305' },
      { bridgeRuntimeCodeHex: '0x01' },
      'source target two-node observation finalization',
    );
  });

  it('preserves homogeneous retryable node failures through the bounded retry policy', async () => {
    const primary = await startRpcFixture({
      peerId: PRIMARY_PEER_ID,
      unstableTip: true,
    });
    const witness = await startRpcFixture({
      peerId: WITNESS_PEER_ID,
      unstableTip: true,
    });
    try {
      const failure = await observeSubstrateFederatedAuthoritySafeDevnetV1(
        await observationInput(primary.rpcUrl, witness.rpcUrl),
        true,
      ).then(() => undefined, error => error as unknown);

      expect(failure).toBeInstanceOf(AggregateError);
      expect(
        projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
          failure,
        ),
      ).toBe('source target tip stability observation');
      const nested = (failure as AggregateError).errors;
      expect(nested).toHaveLength(2);
      for (const nodeFailure of nested) {
        expect(nodeFailure).toBeInstanceOf(Error);
        expect((nodeFailure as Error).message).toMatch(
          /native tip changed at the observed height/i,
        );
        expect(
          projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
            nodeFailure,
          ),
        ).toBe('source target tip stability observation');
      }
      expect(
        primary.methods.filter(method => method === 'system_dryRunAt'),
      ).toHaveLength(8);
      expect(
        witness.methods.filter(method => method === 'system_dryRunAt'),
      ).toHaveLength(8);
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  }, 10_000);

  it('does not retain authority after a rejected snapshot and can recover cleanly', async () => {
    const primaryOptions: {
      peerId: string;
      activeProfileValue: string | null;
    } = {
      peerId: PRIMARY_PEER_ID,
      activeProfileValue: '0x01',
    };
    const primary = await startRpcFixture(primaryOptions);
    const witness = await startRpcFixture({ peerId: WITNESS_PEER_ID });
    try {
      const input = await observationInput(primary.rpcUrl, witness.rpcUrl);
      await expect(observeSubstrateFederatedAuthoritySafeDevnetV1(input)).rejects.toThrow(
        /profile or enforcement state must remain absent/i,
      );

      primaryOptions.activeProfileValue = null;
      const recovered = await observeSubstrateFederatedAuthoritySafeDevnetV1(input);
      assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance(recovered);
      expect(recovered.checks.allPegInProfilesAbsentAtGenesisAndTip).toBe(true);
      expect(recovered.boundaries.mintAuthorized).toBe(false);
      expect(recovered.boundaries.broadcastAuthorized).toBe(false);
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('rejects non-loopback, TLS, and duplicate RPC origins before observation', async () => {
    const signed = await signLegacyOwnerMint();
    const base = await observationInput(
      'http://127.0.0.1:9944',
      'http://127.0.0.1:9955',
      signed,
    );
    await expect(observeSubstrateFederatedAuthoritySafeDevnetV1({
      ...base,
      primaryRpcUrl: 'https://127.0.0.1:9944',
    })).rejects.toThrow(/plain HTTP on an isolated loopback endpoint/i);
    await expect(observeSubstrateFederatedAuthoritySafeDevnetV1({
      ...base,
      primaryRpcUrl: 'http://192.0.2.1:9944',
    })).rejects.toThrow(/isolated loopback endpoint/i);
    await expect(observeSubstrateFederatedAuthoritySafeDevnetV1({
      ...base,
      witnessRpcUrl: base.primaryRpcUrl,
    })).rejects.toThrow(/distinct RPC origins/i);
    await expect(observeSubstrateFederatedAuthoritySafeDevnetV1({
      ...base,
      expectedStorageLayoutDigestHex: '0'.repeat(64),
    })).rejects.toThrow(/storage-layout digest differs from the source-locked layout/i);
  });

  it('classifies input binding only when source-failure projection is requested', async () => {
    const signed = await signLegacyOwnerMint();
    const input = {
      ...await observationInput(
        'http://127.0.0.1:9944',
        'http://127.0.0.1:9955',
        signed,
      ),
      expectedStorageLayoutDigestHex: '0'.repeat(64),
    };
    const compatibilityFailure =
      await observeSubstrateFederatedAuthoritySafeDevnetV1(input)
        .then(() => undefined, error => error as unknown);
    expect(
      projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
        compatibilityFailure,
      ),
    ).toBeNull();

    const classifiedFailure =
      await observeSubstrateFederatedAuthoritySafeDevnetV1(input, true)
        .then(() => undefined, error => error as unknown);
    expect(
      projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
        classifiedFailure,
      ),
    ).toBe('source target observation input and source binding');
  });
});

async function expectObservationFailure(
  primaryOptions: RpcFixtureOptions,
  witnessOptions: RpcFixtureOptions,
  expected: RegExp,
): Promise<void> {
  const primary = await startRpcFixture({ peerId: PRIMARY_PEER_ID, ...primaryOptions });
  const witness = await startRpcFixture({ peerId: WITNESS_PEER_ID, ...witnessOptions });
  try {
    await expect(observeSubstrateFederatedAuthoritySafeDevnetV1(
      await observationInput(primary.rpcUrl, witness.rpcUrl),
    )).rejects.toThrow(expected);
  } finally {
    await Promise.all([primary.close(), witness.close()]);
  }
}

async function expectObservationFailurePhase(
  primaryOptions: RpcFixtureOptions,
  witnessOptions: RpcFixtureOptions,
  expectedPhase: SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
): Promise<void> {
  const primary = await startRpcFixture({ peerId: PRIMARY_PEER_ID, ...primaryOptions });
  const witness = await startRpcFixture({ peerId: WITNESS_PEER_ID, ...witnessOptions });
  try {
    const failure = await observeSubstrateFederatedAuthoritySafeDevnetV1(
      await observationInput(primary.rpcUrl, witness.rpcUrl),
      true,
    ).then(() => undefined, error => error as unknown);
    expect(failure).toBeInstanceOf(Error);
    expect(
      projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
        failure,
      ),
    ).toBe(expectedPhase);
  } finally {
    await Promise.all([primary.close(), witness.close()]);
  }
}

async function observationInput(
  primaryRpcUrl: string,
  witnessRpcUrl: string,
  signedLegacyOwnerMintTransactionHex?: string,
): Promise<ObserveSubstrateFederatedAuthoritySafeDevnetV1Input> {
  return {
    bridgeRoot: BRIDGE_ROOT,
    primaryRpcUrl,
    witnessRpcUrl,
    expectedChainName: CHAIN_NAME,
    expectedChainId: CHAIN_ID,
    expectedNativeGenesisHashHex: NATIVE_GENESIS_HASH_HEX,
    expectedNodeName: NODE_NAME,
    expectedNodeVersion: NODE_VERSION,
    expectedRuntimeCodeBytes: (RUNTIME_CODE_HEX.length - 2) / 2,
    expectedRuntimeCodeSha256Hex: RUNTIME_CODE_SHA256_HEX,
    expectedStorageLayoutDigestHex: STORAGE_LAYOUT_DIGEST_HEX,
    bridgeAddress: BRIDGE_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
    bridgeOwnerAddress: ownerWallet.address.toLowerCase(),
    signedLegacyOwnerMintTransactionHex:
      signedLegacyOwnerMintTransactionHex ?? await signLegacyOwnerMint(),
  };
}

function buildProbe(signedTransactionHex: string) {
  return buildAuthoritySafeLegacyMintProbeV1({
    signedTransactionHex,
    expectedChainId: CHAIN_ID,
    expectedBridgeAddress: BRIDGE_ADDRESS,
    expectedBridgeOwnerAddress: ownerWallet.address,
  });
}

async function signLegacyOwnerMint(options: Readonly<{
  wallet?: Wallet;
  to?: string;
  chainId?: bigint;
}> = {}): Promise<string> {
  return (options.wallet ?? ownerWallet).signTransaction({
    type: 0,
    chainId: options.chainId ?? CHAIN_ID,
    nonce: 0,
    gasPrice: 1n,
    gasLimit: 1_000_000n,
    to: options.to ?? BRIDGE_ADDRESS,
    value: 0n,
    data: legacyMintInterface.encodeFunctionData('mintSERG', [
      RECIPIENT_ADDRESS,
      1_000_000_000n,
      ERGO_BOX_ID_HEX,
    ]),
  });
}

function deterministicWallet(domain: string): Wallet {
  return new Wallet(keccak256(toUtf8Bytes(domain)));
}

async function startRpcFixture(options: RpcFixtureOptions): Promise<RpcFixture> {
  const methods: string[] = [];
  const requests: RpcRequest[] = [];
  const counters = new Map<string, number>();
  const server = createServer((request, response) => {
    void handleRpcFixture(request, response, options, methods, requests, counters);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return Object.freeze({
    rpcUrl: `http://127.0.0.1:${address.port}`,
    methods,
    requests,
    async close() {
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close');
    },
  });
}

async function handleRpcFixture(
  request: IncomingMessage,
  response: ServerResponse,
  options: RpcFixtureOptions,
  methods: string[],
  requests: RpcRequest[],
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
  requests.push(Object.freeze({
    method: body.method,
    params: Object.freeze(body.params),
  }));
  const methodIndex = counters.get(body.method) ?? 0;
  counters.set(body.method, methodIndex + 1);
  try {
    if (options.failMethod === body.method) {
      throw new Error(`fixture forced ${body.method} failure`);
    }
    const result = rpcResult(body.method, body.params, options, methodIndex);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
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
  options: RpcFixtureOptions,
  methodIndex: number,
): unknown {
  switch (method) {
    case 'eth_chainId':
      return quantity(CHAIN_ID);
    case 'eth_blockNumber':
      return quantity(TIP_HEIGHT);
    case 'eth_getBlockByNumber':
      assertExact(params[0], quantity(TIP_HEIGHT), 'EVM block height');
      assertExact(params[1], false, 'EVM block transaction-detail flag');
      return {
        number: quantity(
          methodIndex % 3 === 2 ? (options.evmBlockNumber ?? TIP_HEIGHT) : TIP_HEIGHT,
        ),
        hash: EVM_TIP_HASH_HEX,
      };
    case 'eth_getCode': {
      const address = String(params[0]).toLowerCase();
      assertCodeBlockSelector(params[1]);
      if (address === BRIDGE_ADDRESS) {
        if (
          params[1] === '0x0'
          && options.bridgeRuntimeCodeHex !== undefined
        ) {
          return options.bridgeRuntimeCodeHex;
        }
        return profile.bridge.runtimeBytecodeHex;
      }
      if (address === TOKEN_ADDRESS) return profile.token.runtimeBytecodeHex;
      return '0x';
    }
    case 'eth_call': {
      assertCanonicalTipSelector(params[1]);
      const call = params[0] as { to?: unknown; data?: unknown };
      const to = String(call.to).toLowerCase();
      const data = String(call.data).toLowerCase();
      if (to === BRIDGE_ADDRESS && data === bridgeInterface.encodeFunctionData('sergToken')) {
        return encodedAddress(TOKEN_ADDRESS);
      }
      if (to === BRIDGE_ADDRESS && data === bridgeInterface.encodeFunctionData('owner')) {
        return encodedAddress(ownerWallet.address);
      }
      if (to === TOKEN_ADDRESS && data === tokenInterface.encodeFunctionData('owner')) {
        return encodedAddress(BRIDGE_ADDRESS);
      }
      throw new Error('unsupported fixture call');
    }
    case 'system_chain':
      return CHAIN_NAME;
    case 'system_name':
      return NODE_NAME;
    case 'system_version':
      return NODE_VERSION;
    case 'system_localPeerId':
      return options.peerId ?? PRIMARY_PEER_ID;
    case 'system_health':
      return {
        peers: 1,
        isSyncing: false,
        shouldHavePeers: options.shouldHavePeers ?? true,
      };
    case 'chain_getBlockHash': {
      if (params[0] === 0) return NATIVE_GENESIS_HASH_HEX;
      assertExact(params[0], quantity(TIP_HEIGHT), 'native block-hash height');
      if (options.unstableTip && methodIndex % 3 === 2) {
        return `0x${'44'.repeat(32)}`;
      }
      return NATIVE_TIP_HASH_HEX;
    }
    case 'chain_getHeader':
      assertExact(params[0], NATIVE_TIP_HASH_HEX, 'native header hash');
      return { number: quantity(TIP_HEIGHT) };
    case 'state_getRuntimeVersion':
      assertExact(params[0], NATIVE_TIP_HASH_HEX, 'runtime-version block hash');
      return { specName: 'frontier-template', specVersion: 100 };
    case 'state_getStorage': {
      if (![NATIVE_GENESIS_HASH_HEX, NATIVE_TIP_HASH_HEX].includes(String(params[1]))) {
        throw new Error('native storage read must bind genesis or the exact tip hash');
      }
      return stateStorageResult(String(params[0]).toLowerCase(), options);
    }
    case 'eth_getStorageAt':
      assertCodeBlockSelector(params[2]);
      return evmStorageResult(
        String(params[0]).toLowerCase(),
        String(params[1]).toLowerCase(),
      );
    case 'eth_getTransactionCount':
      assertExact(
        String(params[0]).toLowerCase(),
        ownerWallet.address.toLowerCase(),
        'owner nonce account',
      );
      assertExact(params[1], quantity(TIP_HEIGHT), 'owner nonce block height');
      return '0x0';
    case 'system_dryRunAt':
      assertExact(params[0], expectedDryRunExtrinsicHex, 'owner-mint dry-run extrinsic');
      assertExact(params[1], NATIVE_TIP_HASH_HEX, 'owner-mint dry-run block hash');
      return options.directOwnerMintResultHex ?? DIRECT_OWNER_MINT_REJECTION_HEX;
    default:
      throw new Error(`unsupported fixture method ${method}`);
  }
}

function stateStorageResult(key: string, options: RpcFixtureOptions): string | null {
  if (key === STORAGE_KEYS.runtimeCode) return options.runtimeCodeHex ?? RUNTIME_CODE_HEX;
  if (key === STORAGE_KEYS.sudo) return options.sudoValue ?? null;
  if (key === STORAGE_KEYS.bridgeAddress) return BRIDGE_ADDRESS;
  if (key === STORAGE_KEYS.currentPegInProfile) return options.activeProfileValue ?? null;
  return null;
}

function evmStorageResult(address: string, slot: string): string {
  if (address === BRIDGE_ADDRESS && slot === '0x0') return addressWord(ownerWallet.address);
  if (address === BRIDGE_ADDRESS && slot === '0x3') return addressWord(TOKEN_ADDRESS);
  if (address === TOKEN_ADDRESS && slot === '0x5') return addressWord(BRIDGE_ADDRESS);
  throw new Error('unsupported fixture storage request');
}

function addressWord(address: string): string {
  return `0x${'00'.repeat(12)}${address.toLowerCase().slice(2)}`;
}

function encodedAddress(address: string): string {
  return addressWord(address);
}

function quantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function assertCodeBlockSelector(value: unknown): void {
  if (value === '0x0' || value === quantity(TIP_HEIGHT)) return;
  assertCanonicalTipSelector(value);
}

function assertCanonicalTipSelector(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('fixture requires an exact EIP-1898 tip selector');
  }
  const selector = value as { blockHash?: unknown; requireCanonical?: unknown };
  assertExact(selector.blockHash, EVM_TIP_HASH_HEX, 'EIP-1898 block hash');
  assertExact(selector.requireCanonical, true, 'EIP-1898 canonicality flag');
}

function assertExact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} differs from the exact fixture binding`);
  }
}

function assertExactRpcRequestClosure(actual: readonly RpcRequest[]): void {
  const canonicalTipSelector = {
    blockHash: EVM_TIP_HASH_HEX,
    requireCanonical: true,
  } as const;
  const expected: RpcRequest[] = [];
  const add = (method: string, params: readonly unknown[], count = 1): void => {
    for (let index = 0; index < count; index += 1) expected.push({ method, params });
  };

  add('eth_chainId', [], 3);
  add('eth_blockNumber', [], 2);
  add('eth_getBlockByNumber', [quantity(TIP_HEIGHT), false], 3);
  add('eth_getCode', [BRIDGE_ADDRESS, canonicalTipSelector]);
  add('eth_getCode', [TOKEN_ADDRESS, canonicalTipSelector]);
  add('eth_call', [{
    to: BRIDGE_ADDRESS,
    data: bridgeInterface.encodeFunctionData('sergToken'),
  }, canonicalTipSelector]);
  add('eth_call', [{
    to: BRIDGE_ADDRESS,
    data: bridgeInterface.encodeFunctionData('owner'),
  }, canonicalTipSelector]);
  add('eth_call', [{
    to: TOKEN_ADDRESS,
    data: tokenInterface.encodeFunctionData('owner'),
  }, canonicalTipSelector]);

  add('chain_getBlockHash', [quantity(TIP_HEIGHT)], 2);
  add('chain_getBlockHash', [0]);
  add('chain_getHeader', [NATIVE_TIP_HASH_HEX]);
  add('system_chain', []);
  add('system_name', []);
  add('system_version', []);
  add('system_localPeerId', []);
  add('system_health', []);
  add('state_getRuntimeVersion', [NATIVE_TIP_HASH_HEX]);
  add('state_getStorage', [STORAGE_KEYS.runtimeCode, NATIVE_TIP_HASH_HEX]);

  for (const address of [BRIDGE_ADDRESS, TOKEN_ADDRESS]) {
    add('eth_getCode', [address, '0x0']);
    add('eth_getCode', [address, quantity(TIP_HEIGHT)]);
  }
  add('eth_getStorageAt', [BRIDGE_ADDRESS, '0x0', '0x0']);
  add('eth_getStorageAt', [BRIDGE_ADDRESS, '0x0', quantity(TIP_HEIGHT)]);
  add('eth_getStorageAt', [BRIDGE_ADDRESS, '0x3', '0x0']);
  add('eth_getStorageAt', [BRIDGE_ADDRESS, '0x3', quantity(TIP_HEIGHT)]);
  add('eth_getStorageAt', [TOKEN_ADDRESS, '0x5', '0x0']);
  add('eth_getStorageAt', [TOKEN_ADDRESS, '0x5', quantity(TIP_HEIGHT)]);
  add('eth_getTransactionCount', [ownerWallet.address.toLowerCase(), quantity(TIP_HEIGHT)]);
  add('system_dryRunAt', [expectedDryRunExtrinsicHex, NATIVE_TIP_HASH_HEX]);

  const topTrieKeys = [
    STORAGE_KEYS.sudo,
    STORAGE_KEYS.bridgeAddress,
    STORAGE_KEYS.currentPegInProfile,
    STORAGE_KEYS.currentCausalPegInProfileV2,
    STORAGE_KEYS.currentPooledReserveProfileV4,
    STORAGE_KEYS.causalEnforcementV2,
    STORAGE_KEYS.pooledReserveEnforcementV4,
  ];
  for (const blockHashHex of [NATIVE_GENESIS_HASH_HEX, NATIVE_TIP_HASH_HEX]) {
    for (const keyHex of topTrieKeys) {
      add('state_getStorage', [keyHex, blockHashHex]);
    }
  }

  const requestKey = (request: RpcRequest): string => JSON.stringify([
    request.method,
    request.params,
  ]);
  expect(actual.map(requestKey).sort()).toEqual(expected.map(requestKey).sort());
}

function decodeLegacyMintDryRunExtrinsic(value: string) {
  const bytes = Buffer.from(getBytes(value));
  const outerLength = readCompact(bytes, 0);
  let offset = outerLength.nextOffset;
  if (outerLength.value !== BigInt(bytes.length - offset)) {
    throw new Error('dry-run extrinsic outer SCALE length is inconsistent');
  }
  const readByte = (label: string): number => {
    if (offset >= bytes.length) throw new Error(`${label} is truncated`);
    return bytes[offset++]!;
  };
  const readBytes = (length: number, label: string): Buffer => {
    const end = offset + length;
    if (end > bytes.length) throw new Error(`${label} is truncated`);
    const result = bytes.subarray(offset, end);
    offset = end;
    return result;
  };
  const readLittleEndian = (length: number, label: string): bigint => {
    const encoded = readBytes(length, label);
    let result = 0n;
    for (let index = encoded.length - 1; index >= 0; index -= 1) {
      result = (result << 8n) | BigInt(encoded[index]!);
    }
    return result;
  };

  const version = readByte('extrinsic version');
  const palletIndex = readByte('Ethereum pallet index');
  const callIndex = readByte('Ethereum call index');
  const transactionVariant = readByte('Ethereum transaction variant');
  const nonce = readLittleEndian(32, 'legacy nonce');
  const gasPrice = readLittleEndian(32, 'legacy gas price');
  const gasLimit = readLittleEndian(32, 'legacy gas limit');
  const actionVariant = readByte('legacy action variant');
  const targetAddress = `0x${readBytes(20, 'legacy call target').toString('hex')}`;
  const nativeValue = readLittleEndian(32, 'legacy native value');
  const dataLength = readCompact(bytes, offset);
  offset = dataLength.nextOffset;
  if (dataLength.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('legacy call data length is outside the test bound');
  }
  const dataHex = `0x${readBytes(Number(dataLength.value), 'legacy call data').toString('hex')}`;
  const networkV = readLittleEndian(8, 'legacy network recovery ID');
  const rHex = `0x${readBytes(32, 'legacy signature r').toString('hex')}`;
  const sHex = `0x${readBytes(32, 'legacy signature s').toString('hex')}`;
  if (offset !== bytes.length) throw new Error('dry-run extrinsic contains trailing bytes');

  return {
    version,
    palletIndex,
    callIndex,
    transactionVariant,
    nonce,
    gasPrice,
    gasLimit,
    actionVariant,
    targetAddress,
    value: nativeValue,
    dataHex,
    networkV,
    rHex,
    sHex,
  };
}

function readCompact(
  bytes: Buffer,
  offset: number,
): Readonly<{ value: bigint; nextOffset: number }> {
  if (offset >= bytes.length) throw new Error('SCALE compact value is truncated');
  const mode = bytes[offset]! & 0b11;
  if (mode === 0) {
    return { value: BigInt(bytes[offset]! >> 2), nextOffset: offset + 1 };
  }
  if (mode === 1) {
    if (offset + 2 > bytes.length) throw new Error('two-byte SCALE compact value is truncated');
    return {
      value: BigInt(bytes.readUInt16LE(offset) >> 2),
      nextOffset: offset + 2,
    };
  }
  if (mode === 2) {
    if (offset + 4 > bytes.length) throw new Error('four-byte SCALE compact value is truncated');
    return {
      value: BigInt(bytes.readUInt32LE(offset) >>> 2),
      nextOffset: offset + 4,
    };
  }
  throw new Error('large-integer SCALE compact mode is outside the probe bound');
}
