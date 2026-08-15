import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Interface, keccak256 } from 'ethers';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertDeploymentIdentityCandidateProvenance,
  createDeploymentIdentitySourcePair,
  loadTrackedDeploymentIdentityArtifactProfile,
  observeMatchingDeploymentIdentityCandidate,
  type DeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';
import { BRIDGE_ABI, SERG_ABI } from './sidechain-contract-abi.js';
import {
  loadReviewedPegInMintRuntimeIdentity,
} from './sidechain-client.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const TSX_CLI = resolve(BRIDGE_ROOT, 'relayer', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const OBSERVER_CLI = resolve(MODULE_DIRECTORY, 'scripts', 'observe-deployment-identity.ts');
const BRIDGE_ADDRESS = `0x${'11'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'22'.repeat(20)}`;
const BRIDGE_OWNER = `0x${'33'.repeat(20)}`;
const OTHER_OWNER = `0x${'44'.repeat(20)}`;
const TIP_HASH = `0x${'aa'.repeat(32)}`;
const REORG_HASH = `0x${'bb'.repeat(32)}`;
const CHAIN_ID = 1337n;
const TIP_HEIGHT = 91n;
const bridgeInterface = new Interface(BRIDGE_ABI);
const tokenInterface = new Interface(SERG_ABI);

interface RpcFixtureOptions {
  readonly chainIds?: readonly bigint[];
  readonly tipHeights?: readonly bigint[];
  readonly tipHashes?: readonly string[];
  readonly bridgeCodeHex?: string;
  readonly tokenCodeHex?: string;
  readonly bridgeTokenAddress?: string;
  readonly bridgeOwnerAddress?: string;
  readonly tokenOwnerAddress?: string;
  readonly tokenOwnerResultHex?: string;
  readonly responseIdOffset?: number;
}

interface RpcFixture {
  readonly rpcUrl: string;
  readonly methods: string[];
  close(): Promise<void>;
}

let profile: DeploymentIdentityArtifactProfile;

beforeAll(() => {
  profile = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);
});

describe('read-only deployment identity observer', () => {
  it('loads the exact tracked runtime artifacts through the validated Solidity closure', () => {
    expect(profile.schema).toBe('e2s.deployment-artifact-profile.v1');
    expect(profile.buildManifestPath).toBe('solidity/compiled/build-manifest.json');
    expect(profile.bridge.runtimeArtifactPath).toBe('solidity/compiled/ErgoBridge.runtime.bin');
    expect(profile.token.runtimeArtifactPath).toBe('solidity/compiled/SERG.runtime.bin');
    expect(profile.bridge.runtimeBytecodeHex).toBe(
      `0x${readFileSync(resolve(BRIDGE_ROOT, profile.bridge.runtimeArtifactPath), 'utf8')}`,
    );
    expect(profile.token.runtimeBytecodeHex).toBe(
      `0x${readFileSync(resolve(BRIDGE_ROOT, profile.token.runtimeArtifactPath), 'utf8')}`,
    );
    expect(profile.profileDigestHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives both active mint runtime hashes from the validated tracked artifacts', () => {
    const identity = loadReviewedPegInMintRuntimeIdentity(BRIDGE_ROOT);

    expect(identity).toEqual({
      bridgeCodeHashHex:
        keccak256(profile.bridge.runtimeBytecodeHex).slice(2),
      sergCodeHashHex:
        keccak256(profile.token.runtimeBytecodeHex).slice(2),
    });
  });

  it('emits one non-authorizing candidate from two stable agreeing RPC origins', async () => {
    const primary = await startRpcFixture();
    const witness = await startRpcFixture();
    try {
      const sources = createDeploymentIdentitySourcePair({
        primaryRpcUrl: primary.rpcUrl,
        witnessRpcUrl: witness.rpcUrl,
      });
      const candidate = await observeMatchingDeploymentIdentityCandidate({
        sources,
        artifactProfile: profile,
        networkScope: 'local-devnet',
        expectedChainId: CHAIN_ID,
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
      });

      assertDeploymentIdentityCandidateProvenance(candidate);
      expect(candidate.status).toBe('non_authorizing_candidate');
      expect(candidate.view).toMatchObject({
        declaredNetworkScope: 'local-devnet',
        chainId: CHAIN_ID.toString(),
        tipHeight: TIP_HEIGHT.toString(),
        tipHashHex: TIP_HASH.slice(2),
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        bridgeTokenAddress: TOKEN_ADDRESS,
        bridgeOwnerAddress: BRIDGE_OWNER,
        tokenOwnerAddress: BRIDGE_ADDRESS,
        bridgeRuntimeBytecodeSha256Hex: profile.bridge.runtimeBytecodeSha256Hex,
        tokenRuntimeBytecodeSha256Hex: profile.token.runtimeBytecodeSha256Hex,
      });
      expect(candidate.sourceAgreement.sourceCount).toBe(2);
      expect(new Set(candidate.sourceAgreement.sourceIdsHex).size).toBe(2);
      expect(Object.values(candidate.authority).every(value => value === false)).toBe(true);
      expect(candidate.limitations).toContain('current stable RPC agreement is not sidechain finality');
      expect(primary.methods.sort()).toEqual(expectedMethods());
      expect(witness.methods.sort()).toEqual(expectedMethods());
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('runs the config-free CLI end to end against two local read-only origins', async () => {
    const primary = await startRpcFixture();
    const witness = await startRpcFixture();
    try {
      const result = await runCli([
        TSX_CLI,
        OBSERVER_CLI,
        '--primary-rpc-url', primary.rpcUrl,
        '--witness-rpc-url', witness.rpcUrl,
        '--bridge-address', BRIDGE_ADDRESS,
        '--token-address', TOKEN_ADDRESS,
        '--expected-chain-id', CHAIN_ID.toString(),
        '--network-scope', 'local-devnet',
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toBe('');
      const candidate = JSON.parse(result.stdout) as {
        status?: unknown;
        view?: { declaredNetworkScope?: unknown };
        authority?: Record<string, unknown>;
      };
      expect(candidate.status).toBe('non_authorizing_candidate');
      expect(candidate.view?.declaredNetworkScope).toBe('local-devnet');
      expect(Object.values(candidate.authority ?? {}).every(value => value === false)).toBe(true);
      expect(primary.methods.sort()).toEqual(expectedMethods());
      expect(witness.methods.sort()).toEqual(expectedMethods());
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('requires two credential-free distinct RPC origins', () => {
    expect(() => createDeploymentIdentitySourcePair({
      primaryRpcUrl: 'http://127.0.0.1:8545',
      witnessRpcUrl: 'http://127.0.0.1:8545/',
    })).toThrow(/distinct RPC origins/i);
    expect(() => createDeploymentIdentitySourcePair({
      primaryRpcUrl: 'http://user:pass@127.0.0.1:8545',
      witnessRpcUrl: 'http://127.0.0.1:9545',
    })).toThrow(/must not include credentials/i);
    expect(() => createDeploymentIdentitySourcePair({
      primaryRpcUrl: 'http://127.0.0.1:8545/rpc',
      witnessRpcUrl: 'http://127.0.0.1:9545',
    })).toThrow(/without path, query, or fragment/i);
  });

  it('rejects chain identity drift and Ethereum mainnet scope', async () => {
    await expectObservationFailure(
      { chainIds: [CHAIN_ID + 1n] },
      {},
      /chain ID does not match/i,
    );
    await expectObservationFailure(
      { chainIds: [CHAIN_ID, CHAIN_ID + 1n] },
      {},
      /chain ID changed/i,
    );

    const primary = await startRpcFixture({ chainIds: [1n] });
    const witness = await startRpcFixture({ chainIds: [1n] });
    try {
      const sources = createDeploymentIdentitySourcePair({
        primaryRpcUrl: primary.rpcUrl,
        witnessRpcUrl: witness.rpcUrl,
      });
      await expect(observeMatchingDeploymentIdentityCandidate({
        sources,
        artifactProfile: profile,
        networkScope: 'public-testnet',
        expectedChainId: 1n,
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
      })).rejects.toThrow(/refuses Ethereum mainnet chain ID 1/i);
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('rejects a moving tip and a same-height tip replacement', async () => {
    await expectObservationFailure(
      { tipHeights: [TIP_HEIGHT, TIP_HEIGHT + 1n] },
      {},
      /tip height changed/i,
    );
    await expectObservationFailure(
      { tipHashes: [TIP_HASH, REORG_HASH] },
      {},
      /tip hash changed/i,
    );
  });

  it.each(['bridge', 'token'] as const)(
    'rejects %s runtime code drift from the tracked manifest',
    async label => {
      const options = label === 'bridge'
        ? { bridgeCodeHex: `${profile.bridge.runtimeBytecodeHex.slice(0, -2)}00` }
        : { tokenCodeHex: `${profile.token.runtimeBytecodeHex.slice(0, -2)}00` };
      await expectObservationFailure(
        options,
        options,
        new RegExp(`${label} deployed runtime code`, 'i'),
      );
    },
  );

  it('rejects the wrong bridge token binding and token mint owner', async () => {
    await expectObservationFailure(
      { bridgeTokenAddress: OTHER_OWNER },
      {},
      /bridge token binding/i,
    );
    await expectObservationFailure(
      { tokenOwnerAddress: OTHER_OWNER },
      {},
      /token owner is not the exact bridge/i,
    );
  });

  it('records a renounced bridge owner without interpreting it as approval', async () => {
    const zeroAddress = `0x${'00'.repeat(20)}`;
    const primary = await startRpcFixture({ bridgeOwnerAddress: zeroAddress });
    const witness = await startRpcFixture({ bridgeOwnerAddress: zeroAddress });
    try {
      const sources = createDeploymentIdentitySourcePair({
        primaryRpcUrl: primary.rpcUrl,
        witnessRpcUrl: witness.rpcUrl,
      });
      const candidate = await observeMatchingDeploymentIdentityCandidate({
        sources,
        artifactProfile: profile,
        networkScope: 'local-devnet',
        expectedChainId: CHAIN_ID,
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
      });
      expect(candidate.view.bridgeOwnerAddress).toBe(zeroAddress);
      expect(Object.values(candidate.authority).every(value => value === false)).toBe(true);
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('rejects two individually stable sources that disagree on current ownership', async () => {
    await expectObservationFailure(
      {},
      { bridgeOwnerAddress: OTHER_OWNER },
      /sources disagree/i,
    );
  });

  it('rejects mismatched RPC envelopes and malformed ABI address results', async () => {
    await expectObservationFailure(
      { responseIdOffset: 1 },
      {},
      /mismatched envelope/i,
    );
    await expectObservationFailure(
      { tokenOwnerResultHex: '0x01' },
      {},
      /token owner\(\) result must be one canonically ABI-encoded address/i,
    );
  });

  it('rejects forged artifact-profile and source-pair values', async () => {
    const primary = await startRpcFixture();
    const witness = await startRpcFixture();
    try {
      const sources = createDeploymentIdentitySourcePair({
        primaryRpcUrl: primary.rpcUrl,
        witnessRpcUrl: witness.rpcUrl,
      });
      await expect(observeMatchingDeploymentIdentityCandidate({
        sources,
        artifactProfile: { ...profile },
        networkScope: 'local-devnet',
        expectedChainId: CHAIN_ID,
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
      })).rejects.toThrow(/artifact profile provenance is missing/i);
      await expect(observeMatchingDeploymentIdentityCandidate({
        sources: { sourceIdsHex: sources.sourceIdsHex },
        artifactProfile: profile,
        networkScope: 'local-devnet',
        expectedChainId: CHAIN_ID,
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
      })).rejects.toThrow(/source-pair provenance is missing/i);
    } finally {
      await Promise.all([primary.close(), witness.close()]);
    }
  });

  it('keeps the observer and CLI out of runtime state, signing, and submission modules', () => {
    const observerSource = readFileSync(
      resolve(MODULE_DIRECTORY, 'read-only-deployment-identity-observer.ts'),
      'utf8',
    );
    const cliSource = readFileSync(
      resolve(MODULE_DIRECTORY, 'scripts', 'observe-deployment-identity.ts'),
      'utf8',
    );
    const combined = `${observerSource}\n${cliSource}`;
    for (const forbidden of [
      /process\.env/,
      /deployed_state/i,
      /StateTracker/,
      /SidechainClient/,
      /JsonRpcSigner/,
      /Wallet\b/,
      /sendTransaction/,
      /broadcastTransaction/,
      /\.agent/,
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
    expect(observerSource).toContain("request('eth_getCode'");
    expect(observerSource).toContain("request('eth_call'");
    expect(observerSource).not.toContain("request('eth_getLogs'");
    expect(observerSource).not.toContain("request('eth_sendRawTransaction'");
  });
});

async function expectObservationFailure(
  primaryOptions: RpcFixtureOptions,
  witnessOptions: RpcFixtureOptions,
  expected: RegExp,
): Promise<void> {
  const primary = await startRpcFixture(primaryOptions);
  const witness = await startRpcFixture(witnessOptions);
  try {
    const sources = createDeploymentIdentitySourcePair({
      primaryRpcUrl: primary.rpcUrl,
      witnessRpcUrl: witness.rpcUrl,
    });
    await expect(observeMatchingDeploymentIdentityCandidate({
      sources,
      artifactProfile: profile,
      networkScope: 'local-devnet',
      expectedChainId: CHAIN_ID,
      bridgeAddress: BRIDGE_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
    })).rejects.toThrow(expected);
  } finally {
    await Promise.all([primary.close(), witness.close()]);
  }
}

async function startRpcFixture(options: RpcFixtureOptions = {}): Promise<RpcFixture> {
  const methods: string[] = [];
  const counters = new Map<string, number>();
  const server = createServer((request, response) => {
    void handleRpcFixture(request, response, options, methods, counters);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return Object.freeze({
    rpcUrl: `http://127.0.0.1:${address.port}`,
    methods,
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
    const result = rpcResult(body.method, body.params, options, index);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id + (options.responseIdOffset ?? 0),
      result,
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
  options: RpcFixtureOptions,
  index: number,
): unknown {
  switch (method) {
    case 'eth_chainId':
      return quantity(sequenceValue(options.chainIds, index, CHAIN_ID));
    case 'eth_blockNumber':
      return quantity(sequenceValue(options.tipHeights, index, TIP_HEIGHT));
    case 'eth_getBlockByNumber': {
      const blockNumber = BigInt(String(params[0]));
      return {
        number: quantity(blockNumber),
        hash: sequenceValue(options.tipHashes, index, TIP_HASH),
      };
    }
    case 'eth_getCode': {
      assertCanonicalBlockSelector(params[1], options);
      const address = String(params[0]).toLowerCase();
      if (address === BRIDGE_ADDRESS) return options.bridgeCodeHex ?? profile.bridge.runtimeBytecodeHex;
      if (address === TOKEN_ADDRESS) return options.tokenCodeHex ?? profile.token.runtimeBytecodeHex;
      return '0x';
    }
    case 'eth_call': {
      assertCanonicalBlockSelector(params[1], options);
      const call = params[0] as { to?: unknown; data?: unknown };
      const to = String(call.to).toLowerCase();
      const data = String(call.data).toLowerCase();
      if (to === BRIDGE_ADDRESS && data === bridgeInterface.encodeFunctionData('sergToken')) {
        return encodedAddress(options.bridgeTokenAddress ?? TOKEN_ADDRESS);
      }
      if (to === BRIDGE_ADDRESS && data === bridgeInterface.encodeFunctionData('owner')) {
        return encodedAddress(options.bridgeOwnerAddress ?? BRIDGE_OWNER);
      }
      if (to === TOKEN_ADDRESS && data === tokenInterface.encodeFunctionData('owner')) {
        return options.tokenOwnerResultHex
          ?? encodedAddress(options.tokenOwnerAddress ?? BRIDGE_ADDRESS);
      }
      throw new Error('unsupported fixture call');
    }
    default:
      throw new Error(`unsupported fixture method ${method}`);
  }
}

function expectedMethods(): string[] {
  return [
    'eth_blockNumber',
    'eth_blockNumber',
    'eth_call',
    'eth_call',
    'eth_call',
    'eth_chainId',
    'eth_chainId',
    'eth_getBlockByNumber',
    'eth_getBlockByNumber',
    'eth_getCode',
    'eth_getCode',
  ].sort();
}

function assertCanonicalBlockSelector(value: unknown, options: RpcFixtureOptions): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('fixture requires an EIP-1898 block selector');
  }
  const selector = value as { blockHash?: unknown; requireCanonical?: unknown };
  if (
    selector.blockHash !== sequenceValue(options.tipHashes, 0, TIP_HASH)
    || selector.requireCanonical !== true
  ) {
    throw new Error('fixture requires the exact canonical tip hash selector');
  }
}

function sequenceValue<T>(values: readonly T[] | undefined, index: number, fallback: T): T {
  if (!values || values.length === 0) return fallback;
  return values[Math.min(index, values.length - 1)]!;
}

function quantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function encodedAddress(address: string): string {
  return `0x${'00'.repeat(12)}${address.slice(2).toLowerCase()}`;
}

async function runCli(args: readonly string[]): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawn(process.execPath, args, {
    cwd: resolve(BRIDGE_ROOT, 'relayer'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
  const [exitCode] = await once(child, 'close') as [number | null];
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  };
}
