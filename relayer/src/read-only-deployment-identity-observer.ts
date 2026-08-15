import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Interface } from 'ethers';

import { validateSolidityBuildClosureArtifacts } from './consensus-source-baseline.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import { BRIDGE_ABI, SERG_ABI } from './sidechain-contract-abi.js';

const SOURCE_LOCK_PATH = 'sources/consensus-source-lock.json';
const BUILD_MANIFEST_PATH = 'solidity/compiled/build-manifest.json';
const BUILD_MANIFEST_SCHEMA = 'ergo-sidechain-bridge/solidity-build-closure/v1';
const PROFILE_SCHEMA = 'e2s.deployment-artifact-profile.v1';
const VIEW_SCHEMA = 'e2s.stable-deployment-identity-view.v1';
const CANDIDATE_SCHEMA = 'e2s.deployment-identity-candidate.v1';

const bridgeInterface = new Interface(BRIDGE_ABI);
const tokenInterface = new Interface(SERG_ABI);

const ARTIFACT_PROFILES = new WeakSet<object>();
const STABLE_VIEWS = new WeakSet<object>();
const CANDIDATES = new WeakSet<object>();
const SOURCE_PAIR_BINDINGS = new WeakMap<
  object,
  Readonly<{
    primary: ReadOnlyDeploymentIdentitySource;
    witness: ReadOnlyDeploymentIdentitySource;
    sourceIdsHex: readonly string[];
  }>
>();

export type DeploymentObservationNetworkScope = 'local-devnet' | 'public-testnet';

export interface DeploymentRuntimeArtifactIdentity {
  readonly contract: 'ErgoBridge' | 'SERG';
  readonly runtimeArtifactPath: string;
  readonly runtimeBytecodeHex: string;
  readonly runtimeByteLength: number;
  readonly runtimeBytecodeSha256Hex: string;
}

export interface DeploymentIdentityArtifactProfile {
  readonly schema: typeof PROFILE_SCHEMA;
  readonly buildManifestPath: typeof BUILD_MANIFEST_PATH;
  readonly buildManifestSha256Hex: string;
  readonly bridge: DeploymentRuntimeArtifactIdentity;
  readonly token: DeploymentRuntimeArtifactIdentity;
  readonly profileDigestHex: string;
}

export interface DeploymentIdentityBlock {
  readonly number: bigint;
  readonly hashHex: string;
}

export interface ReadOnlyDeploymentIdentitySource {
  getChainId(): Promise<bigint>;
  getBlockNumber(): Promise<bigint>;
  getBlockByNumber(blockNumber: bigint): Promise<DeploymentIdentityBlock>;
  getCode(address: string, block: DeploymentIdentityBlock): Promise<string>;
  call(address: string, dataHex: string, block: DeploymentIdentityBlock): Promise<string>;
}

export interface DeploymentIdentitySourcePair {
  readonly sourceIdsHex: readonly string[];
}

export interface StableDeploymentIdentityView {
  readonly schema: typeof VIEW_SCHEMA;
  readonly declaredNetworkScope: DeploymentObservationNetworkScope;
  readonly chainId: string;
  readonly tipHeight: string;
  readonly tipHashHex: string;
  readonly bridgeAddress: string;
  readonly tokenAddress: string;
  readonly bridgeRuntimeByteLength: number;
  readonly bridgeRuntimeBytecodeSha256Hex: string;
  readonly tokenRuntimeByteLength: number;
  readonly tokenRuntimeBytecodeSha256Hex: string;
  readonly bridgeTokenAddress: string;
  readonly bridgeOwnerAddress: string;
  readonly tokenOwnerAddress: string;
  readonly artifactProfileDigestHex: string;
  readonly buildManifestSha256Hex: string;
  readonly viewDigestHex: string;
}

export interface DeploymentIdentityCandidate {
  readonly schema: typeof CANDIDATE_SCHEMA;
  readonly status: 'non_authorizing_candidate';
  readonly view: StableDeploymentIdentityView;
  readonly sourceAgreement: Readonly<{
    sourceCount: 2;
    sourceIdsHex: readonly string[];
    consensusDigestHex: string;
  }>;
  readonly authority: Readonly<{
    historicalOwnershipProved: false;
    historicalMintAbsenceProved: false;
    sidechainFinalityProved: false;
    mintAuthorized: false;
    settlementAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

export function loadTrackedDeploymentIdentityArtifactProfile(
  bridgeRoot: string,
): DeploymentIdentityArtifactProfile {
  const sourceLock = readJsonObject(resolve(bridgeRoot, SOURCE_LOCK_PATH), 'consensus source lock');
  const solidityBuild = sourceLock.solidityBuild;
  const validation = validateSolidityBuildClosureArtifacts(bridgeRoot, solidityBuild);
  if (validation.errors.length > 0) {
    throw new Error(`tracked Solidity build closure is invalid: ${validation.errors.join('; ')}`);
  }

  const manifestBytes = readRequiredFile(
    resolve(bridgeRoot, BUILD_MANIFEST_PATH),
    'Solidity build manifest',
  );
  const manifest = readJsonObjectFromBytes(manifestBytes, 'Solidity build manifest');
  if (manifest.schema !== BUILD_MANIFEST_SCHEMA) {
    throw new Error('Solidity build manifest schema is unsupported');
  }
  const contracts = requiredRecord(manifest.contracts, 'Solidity build manifest contracts');
  const bridge = loadRuntimeArtifactIdentity(
    bridgeRoot,
    contracts,
    'ErgoBridge',
    'compiled/ErgoBridge.runtime.bin',
    'solidity/compiled/ErgoBridge.runtime.bin',
  );
  const token = loadRuntimeArtifactIdentity(
    bridgeRoot,
    contracts,
    'SERG',
    'compiled/SERG.runtime.bin',
    'solidity/compiled/SERG.runtime.bin',
  );
  const binding = {
    schema: PROFILE_SCHEMA,
    buildManifestPath: BUILD_MANIFEST_PATH,
    buildManifestSha256Hex: sha256Hex(manifestBytes),
    bridge,
    token,
  } as const;
  const profile = Object.freeze({
    ...binding,
    profileDigestHex: sha256Canonical(binding),
  });
  ARTIFACT_PROFILES.add(profile);
  return profile;
}

export function createDeploymentIdentitySourcePair(input: {
  primaryRpcUrl: string;
  witnessRpcUrl: string;
}): DeploymentIdentitySourcePair {
  const primary = normalizeRpcOrigin(input.primaryRpcUrl, 'primary deployment-observation RPC');
  const witness = normalizeRpcOrigin(input.witnessRpcUrl, 'witness deployment-observation RPC');
  if (primary.canonicalOrigin === witness.canonicalOrigin) {
    throw new Error('deployment identity observation requires two distinct RPC origins');
  }
  const sourceIdsHex = Object.freeze([
    sourceId(primary.canonicalOrigin),
    sourceId(witness.canonicalOrigin),
  ].sort());
  const pair = Object.freeze({ sourceIdsHex });
  SOURCE_PAIR_BINDINGS.set(pair, Object.freeze({
    primary: createReadOnlyDeploymentIdentitySource(primary.rpcUrl),
    witness: createReadOnlyDeploymentIdentitySource(witness.rpcUrl),
    sourceIdsHex,
  }));
  return pair;
}

export async function observeStableDeploymentIdentityView(input: {
  source: ReadOnlyDeploymentIdentitySource;
  artifactProfile: DeploymentIdentityArtifactProfile;
  networkScope: DeploymentObservationNetworkScope;
  expectedChainId: bigint;
  bridgeAddress: string;
  tokenAddress: string;
}): Promise<StableDeploymentIdentityView> {
  assertDeploymentIdentityArtifactProfileProvenance(input.artifactProfile);
  assertNetworkScope(input.networkScope);
  const expectedChainId = positiveChainId(input.expectedChainId);
  if (expectedChainId === 1n) {
    throw new Error('deployment identity observation refuses Ethereum mainnet chain ID 1');
  }
  const bridgeAddress = canonicalAddress(input.bridgeAddress, 'bridge address');
  const tokenAddress = canonicalAddress(input.tokenAddress, 'token address');
  if (bridgeAddress === tokenAddress) {
    throw new Error('bridge and token addresses must be distinct');
  }

  const chainIdBefore = positiveChainId(await input.source.getChainId());
  if (chainIdBefore !== expectedChainId) {
    throw new Error('deployment observation chain ID does not match the explicit expected chain ID');
  }
  const tipHeightBefore = nonnegativeQuantity(
    await input.source.getBlockNumber(),
    'deployment observation tip height',
  );
  const tipBefore = await input.source.getBlockByNumber(tipHeightBefore);
  assertBlockIdentity(tipBefore, tipHeightBefore, 'initial deployment observation tip');

  const [bridgeCodeHex, tokenCodeHex, bridgeTokenResult, bridgeOwnerResult, tokenOwnerResult] =
    await Promise.all([
      input.source.getCode(bridgeAddress, tipBefore),
      input.source.getCode(tokenAddress, tipBefore),
      input.source.call(
        bridgeAddress,
        bridgeInterface.encodeFunctionData('sergToken'),
        tipBefore,
      ),
      input.source.call(
        bridgeAddress,
        bridgeInterface.encodeFunctionData('owner'),
        tipBefore,
      ),
      input.source.call(
        tokenAddress,
        tokenInterface.encodeFunctionData('owner'),
        tipBefore,
      ),
    ]);

  const bridgeRuntime = assertRuntimeMatchesArtifact(
    bridgeCodeHex,
    input.artifactProfile.bridge,
    'bridge',
  );
  const tokenRuntime = assertRuntimeMatchesArtifact(
    tokenCodeHex,
    input.artifactProfile.token,
    'token',
  );
  const bridgeTokenAddress = decodeAddressResult(bridgeTokenResult, 'bridge sergToken()');
  const bridgeOwnerAddress = decodeAddressResult(
    bridgeOwnerResult,
    'bridge owner()',
    true,
  );
  const tokenOwnerAddress = decodeAddressResult(tokenOwnerResult, 'token owner()');
  if (bridgeTokenAddress !== tokenAddress) {
    throw new Error('deployed bridge token binding does not match the explicit token address');
  }
  if (tokenOwnerAddress !== bridgeAddress) {
    throw new Error('deployed token owner is not the exact bridge address');
  }

  const tipHeightAfter = nonnegativeQuantity(
    await input.source.getBlockNumber(),
    'revalidated deployment observation tip height',
  );
  if (tipHeightAfter !== tipHeightBefore) {
    throw new Error('deployment observation tip height changed during the read-only snapshot');
  }
  const tipAfter = await input.source.getBlockByNumber(tipHeightAfter);
  assertBlockIdentity(tipAfter, tipHeightAfter, 'revalidated deployment observation tip');
  if (tipAfter.hashHex !== tipBefore.hashHex) {
    throw new Error('deployment observation tip hash changed at the same height');
  }
  const chainIdAfter = positiveChainId(await input.source.getChainId());
  if (chainIdAfter !== chainIdBefore) {
    throw new Error('deployment observation chain ID changed during the read-only snapshot');
  }

  const binding = {
    schema: VIEW_SCHEMA,
    declaredNetworkScope: input.networkScope,
    chainId: chainIdBefore.toString(),
    tipHeight: tipHeightBefore.toString(),
    tipHashHex: tipBefore.hashHex,
    bridgeAddress,
    tokenAddress,
    bridgeRuntimeByteLength: bridgeRuntime.byteLength,
    bridgeRuntimeBytecodeSha256Hex: bridgeRuntime.sha256Hex,
    tokenRuntimeByteLength: tokenRuntime.byteLength,
    tokenRuntimeBytecodeSha256Hex: tokenRuntime.sha256Hex,
    bridgeTokenAddress,
    bridgeOwnerAddress,
    tokenOwnerAddress,
    artifactProfileDigestHex: input.artifactProfile.profileDigestHex,
    buildManifestSha256Hex: input.artifactProfile.buildManifestSha256Hex,
  } as const;
  const view = Object.freeze({
    ...binding,
    viewDigestHex: sha256Canonical(binding),
  });
  STABLE_VIEWS.add(view);
  return view;
}

export async function observeMatchingDeploymentIdentityCandidate(input: {
  sources: DeploymentIdentitySourcePair;
  artifactProfile: DeploymentIdentityArtifactProfile;
  networkScope: DeploymentObservationNetworkScope;
  expectedChainId: bigint;
  bridgeAddress: string;
  tokenAddress: string;
}): Promise<DeploymentIdentityCandidate> {
  const sourceBinding = sourcePairBinding(input.sources);
  const observation = {
    artifactProfile: input.artifactProfile,
    networkScope: input.networkScope,
    expectedChainId: input.expectedChainId,
    bridgeAddress: input.bridgeAddress,
    tokenAddress: input.tokenAddress,
  } as const;
  const [primaryView, witnessView] = await Promise.all([
    observeStableDeploymentIdentityView({ source: sourceBinding.primary, ...observation }),
    observeStableDeploymentIdentityView({ source: sourceBinding.witness, ...observation }),
  ]);
  if (primaryView.viewDigestHex !== witnessView.viewDigestHex) {
    throw new Error('deployment identity RPC sources disagree on the stable deployment view');
  }
  const sourceIdsHex = Object.freeze([...sourceBinding.sourceIdsHex].sort());
  if (sourceIdsHex.length !== 2 || new Set(sourceIdsHex).size !== 2) {
    throw new Error('deployment identity observation requires exactly two distinct sources');
  }
  const consensusDigestHex = sha256Canonical({
    viewDigestHex: primaryView.viewDigestHex,
    sourceIdsHex,
  });
  const sourceAgreement = Object.freeze({
    sourceCount: 2 as const,
    sourceIdsHex,
    consensusDigestHex,
  });
  const authority = Object.freeze({
    historicalOwnershipProved: false as const,
    historicalMintAbsenceProved: false as const,
    sidechainFinalityProved: false as const,
    mintAuthorized: false as const,
    settlementAuthorized: false as const,
    reconciliationHoldReleaseAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  });
  const limitations = Object.freeze([
    'declared non-mainnet scope is explicit but not independently authenticated',
    'current stable RPC agreement is not sidechain finality',
    'current ownership does not prove historical ownership or mint absence',
    'deployment identity does not authorize mint, settlement, signing, submission, or broadcast',
  ]);
  const binding = {
    schema: CANDIDATE_SCHEMA,
    status: 'non_authorizing_candidate' as const,
    view: primaryView,
    sourceAgreement,
    authority,
    limitations,
  } as const;
  const candidate = Object.freeze({
    ...binding,
    candidateDigestHex: sha256Canonical(binding),
  });
  CANDIDATES.add(candidate);
  return candidate;
}

export function assertDeploymentIdentityCandidateProvenance(
  candidate: unknown,
): asserts candidate is DeploymentIdentityCandidate {
  if (typeof candidate !== 'object' || candidate === null || !CANDIDATES.has(candidate)) {
    throw new Error('deployment identity candidate provenance is missing');
  }
}

export function assertDeploymentIdentityArtifactProfileProvenance(
  profile: unknown,
): asserts profile is DeploymentIdentityArtifactProfile {
  if (typeof profile !== 'object' || profile === null || !ARTIFACT_PROFILES.has(profile)) {
    throw new Error('deployment identity artifact profile provenance is missing');
  }
}

function createReadOnlyDeploymentIdentitySource(
  rpcUrl: string,
): ReadOnlyDeploymentIdentitySource {
  let requestId = 0;
  async function request(method: string, params: readonly unknown[]): Promise<unknown> {
    const id = ++requestId;
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`read-only deployment RPC ${method} failed with HTTP ${response.status}`);
    }
    const body = requiredRecord(await response.json(), `read-only deployment RPC ${method} response`);
    if (body.id !== id || body.jsonrpc !== '2.0') {
      throw new Error(`read-only deployment RPC ${method} returned a mismatched envelope`);
    }
    if (body.error !== undefined || !Object.hasOwn(body, 'result')) {
      throw new Error(`read-only deployment RPC ${method} returned an error`);
    }
    return body.result;
  }

  return Object.freeze({
    async getChainId() {
      return rpcQuantity(await request('eth_chainId', []), 'deployment RPC chain ID');
    },
    async getBlockNumber() {
      return rpcQuantity(await request('eth_blockNumber', []), 'deployment RPC block number');
    },
    async getBlockByNumber(blockNumber: bigint) {
      const result = requiredRecord(
        await request('eth_getBlockByNumber', [rpcQuantityHex(blockNumber), false]),
        'deployment RPC block',
      );
      return Object.freeze({
        number: rpcQuantity(result.number, 'deployment RPC block number'),
        hashHex: fixedHex(result.hash, 32, 'deployment RPC block hash'),
      });
    },
    async getCode(address: string, block: DeploymentIdentityBlock) {
      return rpcBytes(
        await request('eth_getCode', [address, canonicalBlockSelector(block)]),
        'deployment RPC runtime code',
        true,
      );
    },
    async call(address: string, dataHex: string, block: DeploymentIdentityBlock) {
      return rpcBytes(
        await request('eth_call', [{ to: address, data: dataHex }, canonicalBlockSelector(block)]),
        'deployment RPC call result',
        false,
      );
    },
  });
}

function sourcePairBinding(pair: unknown): Readonly<{
  primary: ReadOnlyDeploymentIdentitySource;
  witness: ReadOnlyDeploymentIdentitySource;
  sourceIdsHex: readonly string[];
}> {
  if (typeof pair !== 'object' || pair === null) {
    throw new Error('deployment identity source-pair provenance is missing');
  }
  const binding = SOURCE_PAIR_BINDINGS.get(pair);
  if (!binding) throw new Error('deployment identity source-pair provenance is missing');
  return binding;
}

function loadRuntimeArtifactIdentity(
  bridgeRoot: string,
  contracts: Record<string, unknown>,
  contract: 'ErgoBridge' | 'SERG',
  expectedManifestPath: string,
  repositoryPath: string,
): DeploymentRuntimeArtifactIdentity {
  const contractRecord = requiredRecord(contracts[contract], `${contract} build record`);
  const runtime = requiredRecord(contractRecord.runtimeBytecode, `${contract} runtime record`);
  if (runtime.path !== expectedManifestPath) {
    throw new Error(`${contract} runtime artifact path is unsupported`);
  }
  const bytes = readRequiredFile(
    resolve(bridgeRoot, repositoryPath),
    `${contract} runtime artifact`,
  );
  const text = bytes.toString('utf8');
  if (!/^[0-9a-f]+$/.test(text) || text.length % 2 !== 0) {
    throw new Error(`${contract} runtime artifact is not canonical lowercase hex`);
  }
  const decoded = Buffer.from(text, 'hex');
  const identity = Object.freeze({
    contract,
    runtimeArtifactPath: repositoryPath,
    runtimeBytecodeHex: `0x${text}`,
    runtimeByteLength: positiveSafeInteger(runtime.bytecodeByteLength, `${contract} runtime length`),
    runtimeBytecodeSha256Hex: fixedHex(
      runtime.bytecodeSha256Hex,
      32,
      `${contract} runtime digest`,
    ),
  });
  if (
    decoded.length !== identity.runtimeByteLength
    || sha256Hex(decoded) !== identity.runtimeBytecodeSha256Hex
  ) {
    throw new Error(`${contract} runtime artifact does not match its build manifest identity`);
  }
  return identity;
}

function assertRuntimeMatchesArtifact(
  observedCodeHex: string,
  artifact: DeploymentRuntimeArtifactIdentity,
  label: string,
): { byteLength: number; sha256Hex: string } {
  const codeHex = rpcBytes(observedCodeHex, `${label} observed runtime code`, false);
  if (codeHex !== artifact.runtimeBytecodeHex) {
    throw new Error(`${label} deployed runtime code does not match the tracked build artifact`);
  }
  const decoded = Buffer.from(codeHex.slice(2), 'hex');
  const identity = { byteLength: decoded.length, sha256Hex: sha256Hex(decoded) };
  if (
    identity.byteLength !== artifact.runtimeByteLength
    || identity.sha256Hex !== artifact.runtimeBytecodeSha256Hex
  ) {
    throw new Error(`${label} deployed runtime identity does not match the build manifest`);
  }
  return identity;
}

function decodeAddressResult(value: unknown, label: string, allowZero = false): string {
  const encoded = rpcBytes(value, `${label} result`, false);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(encoded)) {
    throw new Error(`${label} result must be one canonically ABI-encoded address`);
  }
  return canonicalAddress(`0x${encoded.slice(-40)}`, `${label} address`, allowZero);
}

function assertBlockIdentity(
  block: DeploymentIdentityBlock,
  expectedNumber: bigint,
  label: string,
): void {
  if (block.number !== expectedNumber) throw new Error(`${label} number does not match its request`);
  fixedHex(block.hashHex, 32, `${label} hash`);
}

function canonicalBlockSelector(block: DeploymentIdentityBlock): Readonly<{
  blockHash: string;
  requireCanonical: true;
}> {
  return Object.freeze({
    blockHash: `0x${fixedHex(block.hashHex, 32, 'deployment block selector hash')}`,
    requireCanonical: true,
  });
}

function assertNetworkScope(value: string): asserts value is DeploymentObservationNetworkScope {
  if (value !== 'local-devnet' && value !== 'public-testnet') {
    throw new Error('deployment observation network scope must be local-devnet or public-testnet');
  }
}

function normalizeRpcOrigin(raw: string, label: string): {
  rpcUrl: string;
  canonicalOrigin: string;
} {
  const validation = validateReadOnlyNodeUrl(raw, label);
  if (validation.length > 0) throw new Error(validation.join('; '));
  const parsed = new URL(raw);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTP(S) origin without path, query, or fragment`);
  }
  const port = parsed.port || (parsed.protocol === 'http:' ? '80' : '443');
  return {
    rpcUrl: parsed.toString(),
    canonicalOrigin: `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${port}`,
  };
}

function sourceId(canonicalOrigin: string): string {
  return sha256Canonical({
    schema: 'e2s.deployment-identity-source.v1',
    canonicalOrigin,
  });
}

function canonicalAddress(value: unknown, label: string, allowZero = false): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 20-byte hex address`);
  }
  const normalized = value.toLowerCase();
  if (!allowZero && normalized === `0x${'00'.repeat(20)}`) {
    throw new Error(`${label} must not be zero`);
  }
  return normalized;
}

function rpcQuantity(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`${label} must be a canonical JSON-RPC quantity`);
  }
  return BigInt(value);
}

function rpcQuantityHex(value: bigint): string {
  return `0x${nonnegativeQuantity(value, 'JSON-RPC quantity').toString(16)}`;
}

function rpcBytes(value: unknown, label: string, allowEmpty: boolean): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error(`${label} must be even-length hex bytes`);
  }
  const normalized = value.toLowerCase();
  if (!allowEmpty && normalized === '0x') throw new Error(`${label} must not be empty`);
  return normalized;
}

function positiveChainId(value: bigint): bigint {
  if (typeof value !== 'bigint' || value <= 0n) {
    throw new Error('deployment observation chain ID must be a positive integer');
  }
  return value;
}

function nonnegativeQuantity(value: bigint, label: string): bigint {
  if (typeof value !== 'bigint' || value < 0n) throw new Error(`${label} must be nonnegative`);
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, byteLength: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!new RegExp(`^[0-9a-fA-F]{${byteLength * 2}}$`).test(clean)) {
    throw new Error(`${label} must be ${byteLength} bytes of hex`);
  }
  return clean.toLowerCase();
}

function readJsonObject(path: string, label: string): Record<string, unknown> {
  return readJsonObjectFromBytes(readRequiredFile(path, label), label);
}

function readRequiredFile(path: string, label: string): Buffer {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${label} could not be read`);
  }
}

function readJsonObjectFromBytes(bytes: Buffer, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  return requiredRecord(parsed, label);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical deployment identity cannot encode non-finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(
      key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
    ).join(',')}}`;
  }
  throw new Error(`canonical deployment identity cannot encode ${typeof value}`);
}
