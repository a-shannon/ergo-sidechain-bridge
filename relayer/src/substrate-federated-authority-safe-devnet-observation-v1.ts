import { createHash } from 'node:crypto';

import { Interface, Transaction, getBytes } from 'ethers';

import {
  assertDeploymentIdentityCandidateProvenance,
  createDeploymentIdentitySourcePair,
  loadTrackedDeploymentIdentityArtifactProfile,
  observeMatchingDeploymentIdentityCandidate,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import {
  parseStrictJson,
} from './strict-json.js';
import {
  createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1,
  projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
  type SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
} from './relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-observation.v1' as const;

const LEGACY_MINT_DRY_RUN_RESULT_HEX = '0x010007b5';
const LEGACY_MINT_SELECTOR_HEX = '0xf28ee187';
const MAX_RPC_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_SNAPSHOT_ATTEMPTS = 8;
const SNAPSHOT_RETRY_DELAY_MS = 150;

const legacyMintInterface = new Interface([
  'function mintSERG(address recipient,uint256 amount,bytes32 ergoBoxId)',
]);

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

const STORAGE_LAYOUT_V1 = Object.freeze([
  Object.freeze({ pallet: 'Sudo', item: 'Key', keyHex: STORAGE_KEYS.sudo }),
  Object.freeze({
    pallet: 'BridgeCommitment',
    item: 'BridgeAddress',
    keyHex: STORAGE_KEYS.bridgeAddress,
  }),
  Object.freeze({
    pallet: 'BridgeCommitment',
    item: 'CurrentPegInProfile',
    keyHex: STORAGE_KEYS.currentPegInProfile,
  }),
  Object.freeze({
    pallet: 'BridgeCommitment',
    item: 'CurrentCausalPegInProfileV2',
    keyHex: STORAGE_KEYS.currentCausalPegInProfileV2,
  }),
  Object.freeze({
    pallet: 'BridgeCommitment',
    item: 'CurrentPooledReserveMintReservationProfileV4',
    keyHex: STORAGE_KEYS.currentPooledReserveProfileV4,
  }),
  Object.freeze({
    pallet: 'BridgeCommitment',
    item: 'CausalPegInEnforcementActivatedV2',
    keyHex: STORAGE_KEYS.causalEnforcementV2,
  }),
  Object.freeze({
    pallet: 'BridgeCommitment',
    item: 'PooledReserveMintReservationEnforcementActivatedV4',
    keyHex: STORAGE_KEYS.pooledReserveEnforcementV4,
  }),
]);

const OBSERVATIONS = new WeakSet<object>();
const SOURCE_PAIR_BINDINGS = new WeakMap<
  object,
  Readonly<{
    primary: AuthoritySafeRpcSource;
    witness: AuthoritySafeRpcSource;
    sourceIdsHex: readonly string[];
  }>
>();

export interface AuthoritySafeLegacyMintProbeV1 {
  readonly ethereumTransactionHashHex: string;
  readonly signedTransactionSha256Hex: string;
  readonly dryRunExtrinsicHex: string;
  readonly dryRunExtrinsicSha256Hex: string;
  readonly signerAddress: string;
  readonly bridgeAddress: string;
  readonly recipientAddress: string;
  readonly amount: string;
  readonly ergoBoxIdHex: string;
  readonly nonce: string;
  readonly chainId: string;
}

export interface SubstrateFederatedAuthoritySafeDevnetObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'isolated_two_node_runtime_observation';
  readonly target: Readonly<{
    readonly chainName: string;
    readonly chainId: string;
    readonly nativeGenesisHashHex: string;
    readonly nodeName: string;
    readonly nodeVersion: string;
    readonly runtimeCodeBytes: number;
    readonly runtimeCodeSha256Hex: string;
    readonly storageLayoutDigestHex: string;
    readonly bridgeAddress: string;
    readonly tokenAddress: string;
    readonly bridgeOwnerAddress: string;
  }>;
  readonly view: Readonly<{
    readonly nativeTipHeight: string;
    readonly nativeTipHashHex: string;
    readonly evmTipHashHex: string;
    readonly runtimeSpecName: string;
    readonly runtimeSpecVersion: number;
    readonly bridgeRuntimeByteLength: number;
    readonly bridgeRuntimeBytecodeSha256Hex: string;
    readonly tokenRuntimeByteLength: number;
    readonly tokenRuntimeBytecodeSha256Hex: string;
    readonly deploymentIdentityCandidateDigestHex: string;
    readonly viewDigestHex: string;
  }>;
  readonly sourceAgreement: Readonly<{
    readonly sourceCount: 2;
    readonly sourceIdsHex: readonly string[];
    readonly peerIds: readonly string[];
    readonly bothNodesConnected: true;
    readonly consensusDigestHex: string;
  }>;
  readonly legacyOwnerMintProbe: Readonly<{
    readonly ethereumTransactionHashHex: string;
    readonly signedTransactionSha256Hex: string;
    readonly dryRunExtrinsicSha256Hex: string;
    readonly signerAddress: string;
    readonly recipientAddress: string;
    readonly amount: string;
    readonly ergoBoxIdHex: string;
    readonly nonce: string;
    readonly resultHex: typeof LEGACY_MINT_DRY_RUN_RESULT_HEX;
  }>;
  readonly checks: Readonly<{
    readonly exactNativeGenesisObserved: true;
    readonly matchingNativeAndEvmTipsObserved: true;
    readonly exactRuntimeCodeObserved: true;
    readonly exactStorageLayoutPinVerified: true;
    readonly exactApplicationRuntimeObservedAtGenesisAndTip: true;
    readonly exactApplicationBindingsObservedAtGenesisAndTip: true;
    readonly typedLegacyMintQuarantineObservedAtGenesisAndTip: true;
    readonly sudoAbsentAtGenesisAndTip: true;
    readonly allPegInProfilesAbsentAtGenesisAndTip: true;
    readonly allPegInEnforcementAbsentAtGenesisAndTip: true;
    readonly directLegacyOwnerMintRejectedByRuntimePolicy: true;
  }>;
  readonly boundaries: Readonly<{
    readonly twoNodeRuntimeIdentityObserved: true;
    readonly independentSourceOriginsEstablished: true;
    readonly independentSourceAdministrationEstablished: false;
    readonly exactBinaryIdentityObserved: false;
    readonly exactGeneratedSpecAcceptanceObserved: false;
    readonly indirectOwnerMintBlockRejectionObserved: false;
    readonly sourceHistoryAuthenticated: false;
    readonly sourceFinalityAuthenticated: false;
    readonly federatedLaunchEligible: false;
    readonly mintAuthorized: false;
    readonly settlementAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly observationDigestHex: string;
}

export interface ObserveSubstrateFederatedAuthoritySafeDevnetV1Input {
  readonly bridgeRoot: string;
  readonly primaryRpcUrl: string;
  readonly witnessRpcUrl: string;
  readonly expectedChainName: string;
  readonly expectedChainId: bigint;
  readonly expectedNativeGenesisHashHex: string;
  readonly expectedNodeName: string;
  readonly expectedNodeVersion: string;
  readonly expectedRuntimeCodeBytes: number;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedStorageLayoutDigestHex: string;
  readonly bridgeAddress: string;
  readonly tokenAddress: string;
  readonly bridgeOwnerAddress: string;
  readonly signedLegacyOwnerMintTransactionHex: string;
}

interface AuthoritySafeSourcePair {
  readonly sourceIdsHex: readonly string[];
}

interface AuthoritySafeRpcSource {
  readonly canonicalOrigin: string;
  readonly sourceIdHex: string;
  request(method: AuthoritySafeRpcMethod, params: readonly unknown[]): Promise<unknown>;
}

type AuthoritySafeRpcMethod =
  | 'system_chain'
  | 'system_name'
  | 'system_version'
  | 'system_localPeerId'
  | 'system_health'
  | 'chain_getBlockHash'
  | 'chain_getHeader'
  | 'state_getRuntimeVersion'
  | 'state_getStorage'
  | 'eth_chainId'
  | 'eth_getBlockByNumber'
  | 'eth_getCode'
  | 'eth_getStorageAt'
  | 'eth_getTransactionCount'
  | 'system_dryRunAt';

interface AuthoritySafeNodeView {
  readonly chainName: string;
  readonly nodeName: string;
  readonly nodeVersion: string;
  readonly peerId: string;
  readonly peerCount: number;
  readonly nativeGenesisHashHex: string;
  readonly nativeTipHeight: string;
  readonly nativeTipHashHex: string;
  readonly evmTipHashHex: string;
  readonly runtimeSpecName: string;
  readonly runtimeSpecVersion: number;
  readonly runtimeCodeBytes: number;
  readonly runtimeCodeSha256Hex: string;
  readonly bridgeCodeGenesisSha256Hex: string;
  readonly bridgeCodeTipSha256Hex: string;
  readonly tokenCodeGenesisSha256Hex: string;
  readonly tokenCodeTipSha256Hex: string;
  readonly ownerMintResultHex: string;
  readonly viewDigestHex: string;
}

export async function observeSubstrateFederatedAuthoritySafeDevnetV1(
  input: Readonly<ObserveSubstrateFederatedAuthoritySafeDevnetV1Input>,
  classifySourceFailures = false,
): Promise<SubstrateFederatedAuthoritySafeDevnetObservationV1> {
  let sourceFailurePhase:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 =
      'source target observation input and source binding';
  try {
    const expected = normalizeExpectedTarget(input);
    const probe = buildAuthoritySafeLegacyMintProbeV1({
      signedTransactionHex: input.signedLegacyOwnerMintTransactionHex,
      expectedChainId: BigInt(expected.chainId),
      expectedBridgeAddress: expected.bridgeAddress,
      expectedBridgeOwnerAddress: expected.bridgeOwnerAddress,
    });
    const deploymentProfile = loadTrackedDeploymentIdentityArtifactProfile(
      input.bridgeRoot,
    );
    const deploymentSources = createDeploymentIdentitySourcePair({
      primaryRpcUrl: input.primaryRpcUrl,
      witnessRpcUrl: input.witnessRpcUrl,
    });
    const authoritySources = createAuthoritySafeSourcePair({
      primaryRpcUrl: input.primaryRpcUrl,
      witnessRpcUrl: input.witnessRpcUrl,
    });
    const sourceBinding = authoritySafeSourcePairBinding(authoritySources);

    let lastSnapshotError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
      try {
        sourceFailurePhase = 'source target deployment identity observation';
        const deploymentCandidate = await observeMatchingDeploymentIdentityCandidate({
          sources: deploymentSources,
          artifactProfile: deploymentProfile,
          networkScope: 'local-devnet',
          expectedChainId: BigInt(expected.chainId),
          bridgeAddress: expected.bridgeAddress,
          tokenAddress: expected.tokenAddress,
        });
        assertDeploymentIdentityCandidateProvenance(deploymentCandidate);
        sourceFailurePhase =
          'source target two-node observation finalization';
        const pendingViews = [
          observeAuthoritySafeNodeView(
            sourceBinding.primary,
            expected,
            deploymentCandidate,
            deploymentProfile,
            probe,
            classifySourceFailures,
          ),
          observeAuthoritySafeNodeView(
            sourceBinding.witness,
            expected,
            deploymentCandidate,
            deploymentProfile,
            probe,
            classifySourceFailures,
          ),
        ] as const;
        const views = classifySourceFailures
          ? await settleClassifiedAuthoritySafeNodeViews(pendingViews)
          : await Promise.all(pendingViews);
        return finalizeObservation(
          expected,
          deploymentCandidate,
          probe,
          authoritySources,
          views,
        );
      } catch (error) {
        const normalized = error instanceof Error
          ? error
          : new Error(String(error));
        if (
          !isRetryableSnapshotError(normalized)
          || attempt === MAX_SNAPSHOT_ATTEMPTS
        ) {
          throw normalized;
        }
        lastSnapshotError = normalized;
        await delay(SNAPSHOT_RETRY_DELAY_MS);
      }
    }
    throw lastSnapshotError
      ?? new Error('authority-safe observation did not complete');
  } catch (error) {
    if (!classifySourceFailures) throw error;
    throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
      sourceFailurePhase,
      error,
    );
  }
}

async function settleClassifiedAuthoritySafeNodeViews(
  pending: readonly [
    Promise<AuthoritySafeNodeView>,
    Promise<AuthoritySafeNodeView>,
  ],
): Promise<readonly [AuthoritySafeNodeView, AuthoritySafeNodeView]> {
  const [primary, witness] = await Promise.allSettled(pending);
  if (primary.status === 'fulfilled' && witness.status === 'fulfilled') {
    return [primary.value, witness.value];
  }

  const failures: Error[] = [];
  if (primary.status === 'rejected') {
    failures.push(normalizeNodeObservationFailure(primary.reason));
  }
  if (witness.status === 'rejected') {
    failures.push(normalizeNodeObservationFailure(witness.reason));
  }
  const nonRetryable = failures.filter(
    failure => !isRetryableSnapshotError(failure),
  );
  const deciding = nonRetryable.length > 0 ? nonRetryable : failures;
  if (deciding.length === 1) throw deciding[0];

  const aggregate = new AggregateError(
    deciding,
    'authority-safe node observations failed concurrently',
  );
  const phases = deciding.map(
    projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
  );
  const firstPhase = phases[0] ?? null;
  if (
    firstPhase !== null
    && phases.every(phase => phase === firstPhase)
  ) {
    throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
      firstPhase,
      aggregate,
    );
  }
  throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
    'source target two-node observation finalization',
    aggregate,
  );
}

function normalizeNodeObservationFailure(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error('authority-safe node observation failed');
}

export function assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance(
  value: unknown,
): asserts value is SubstrateFederatedAuthoritySafeDevnetObservationV1 {
  if (typeof value !== 'object' || value === null || !OBSERVATIONS.has(value)) {
    throw new Error('authority-safe two-node observation provenance is missing');
  }
}

export function substrateFederatedAuthoritySafeStorageLayoutDigestV1(
  runtimeCodeSha256Hex: string,
): string {
  return sha256Canonical({
    schema: 'e2s.substrate-federated-authority-safe-storage-layout.v1',
    runtimeCodeSha256Hex: canonicalDigest(
      runtimeCodeSha256Hex,
      'storage-layout runtime code SHA-256',
    ),
    entries: STORAGE_LAYOUT_V1,
  });
}

export function buildAuthoritySafeLegacyMintProbeV1(input: {
  signedTransactionHex: string;
  expectedChainId: bigint;
  expectedBridgeAddress: string;
  expectedBridgeOwnerAddress: string;
}): Readonly<AuthoritySafeLegacyMintProbeV1> {
  const signedTransactionHex = canonicalBytesHex(
    input.signedTransactionHex,
    'signed legacy owner-mint transaction',
    16 * 1024,
  );
  const transaction = Transaction.from(signedTransactionHex);
  if (transaction.type !== 0 || transaction.signature === null) {
    throw new Error('owner-mint dry-run probe must be one signed legacy transaction');
  }
  const expectedChainId = positiveChainId(input.expectedChainId);
  if (transaction.chainId !== expectedChainId) {
    throw new Error('owner-mint dry-run transaction chain ID differs from the target');
  }
  const bridgeAddress = canonicalAddress(input.expectedBridgeAddress, 'bridge address');
  const ownerAddress = canonicalAddress(
    input.expectedBridgeOwnerAddress,
    'bridge owner address',
  );
  if (canonicalAddress(transaction.from, 'owner-mint signer') !== ownerAddress) {
    throw new Error('owner-mint dry-run transaction signer is not the exact bridge owner');
  }
  if (canonicalAddress(transaction.to, 'owner-mint target') !== bridgeAddress) {
    throw new Error('owner-mint dry-run transaction target is not the exact bridge');
  }
  if (transaction.value !== 0n) {
    throw new Error('owner-mint dry-run transaction must carry zero native value');
  }
  if (transaction.gasPrice === null || transaction.gasPrice <= 0n || transaction.gasLimit <= 0n) {
    throw new Error('owner-mint dry-run transaction gas fields are invalid');
  }
  if (!transaction.data.startsWith(LEGACY_MINT_SELECTOR_HEX)) {
    throw new Error('owner-mint dry-run transaction selector is not mintSERG');
  }
  const decoded = legacyMintInterface.decodeFunctionData(
    'mintSERG',
    transaction.data,
  );
  const recipientAddress = canonicalAddress(decoded[0], 'owner-mint recipient');
  const amount = BigInt(decoded[1]);
  const ergoBoxIdHex = canonicalHash(decoded[2], 'owner-mint Ergo box ID');
  if (recipientAddress === ZERO_ADDRESS || amount <= 0n || ergoBoxIdHex === ZERO_HASH) {
    throw new Error('owner-mint dry-run arguments must be nonzero');
  }

  const networkV = transaction.signature.networkV;
  if (networkV === null) {
    throw new Error('owner-mint dry-run transaction lacks an EIP-155 recovery ID');
  }
  const scaleTransaction = Buffer.concat([
    Buffer.from([0]),
    encodeU256(transaction.nonce),
    encodeU256(transaction.gasPrice),
    encodeU256(transaction.gasLimit),
    Buffer.from([0]),
    Buffer.from(getBytes(bridgeAddress)),
    encodeU256(transaction.value),
    encodeScaleBytes(Buffer.from(getBytes(transaction.data))),
    encodeUnsignedLittleEndian(networkV, 8),
    Buffer.from(getBytes(transaction.signature.r)),
    Buffer.from(getBytes(transaction.signature.s)),
  ]);
  const runtimeCall = Buffer.concat([
    Buffer.from([7, 0]),
    scaleTransaction,
  ]);
  const bareExtrinsic = Buffer.concat([Buffer.from([4]), runtimeCall]);
  const encodedExtrinsic = Buffer.concat([
    encodeCompactUnsigned(BigInt(bareExtrinsic.length)),
    bareExtrinsic,
  ]);
  const dryRunExtrinsicHex = `0x${encodedExtrinsic.toString('hex')}`;
  return Object.freeze({
    ethereumTransactionHashHex: canonicalHash(
      transaction.hash,
      'owner-mint transaction hash',
    ),
    signedTransactionSha256Hex: sha256Hex(Buffer.from(getBytes(signedTransactionHex))),
    dryRunExtrinsicHex,
    dryRunExtrinsicSha256Hex: sha256Hex(encodedExtrinsic),
    signerAddress: ownerAddress,
    bridgeAddress,
    recipientAddress,
    amount: amount.toString(),
    ergoBoxIdHex,
    nonce: transaction.nonce.toString(),
    chainId: expectedChainId.toString(),
  });
}

function createAuthoritySafeSourcePair(input: {
  primaryRpcUrl: string;
  witnessRpcUrl: string;
}): AuthoritySafeSourcePair {
  const primary = createAuthoritySafeRpcSource(input.primaryRpcUrl, 'primary');
  const witness = createAuthoritySafeRpcSource(input.witnessRpcUrl, 'witness');
  if (primary.canonicalOrigin === witness.canonicalOrigin) {
    throw new Error('authority-safe observation requires two distinct RPC origins');
  }
  const sourceIdsHex = Object.freeze([
    primary.sourceIdHex,
    witness.sourceIdHex,
  ].sort());
  const pair = Object.freeze({ sourceIdsHex });
  SOURCE_PAIR_BINDINGS.set(pair, Object.freeze({ primary, witness, sourceIdsHex }));
  return pair;
}

function authoritySafeSourcePairBinding(pair: AuthoritySafeSourcePair): Readonly<{
  primary: AuthoritySafeRpcSource;
  witness: AuthoritySafeRpcSource;
  sourceIdsHex: readonly string[];
}> {
  const binding = SOURCE_PAIR_BINDINGS.get(pair);
  if (binding === undefined) {
    throw new Error('authority-safe source-pair provenance is missing');
  }
  return binding;
}

function createAuthoritySafeRpcSource(
  rawUrl: string,
  role: 'primary' | 'witness',
): AuthoritySafeRpcSource {
  const label = `${role} authority-safe RPC`;
  const urlErrors = validateReadOnlyNodeUrl(rawUrl, label);
  if (urlErrors.length > 0) {
    throw new Error(urlErrors.join('; '));
  }
  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.protocol !== 'http:') {
    throw new Error(`${label} must use plain HTTP on an isolated loopback endpoint`);
  }
  if (!new Set(['127.0.0.1', 'localhost', '[::1]']).has(parsedUrl.hostname.toLowerCase())) {
    throw new Error(`${label} must use an isolated loopback endpoint`);
  }
  const rpcUrl = parsedUrl.toString();
  const canonicalOrigin = parsedUrl.origin;
  let requestId = 0;
  return Object.freeze({
    canonicalOrigin,
    sourceIdHex: sha256Canonical({ role, canonicalOrigin }),
    async request(method: AuthoritySafeRpcMethod, params: readonly unknown[]): Promise<unknown> {
      const id = ++requestId;
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`${role} authority-safe RPC ${method} failed with HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_RPC_RESPONSE_BYTES) {
        throw new Error(`${role} authority-safe RPC ${method} response exceeds the byte limit`);
      }
      const text = bytes.toString('utf8');
      const body = record(
        parseStrictJson(text, `${role} authority-safe RPC ${method} response`),
        `${role} authority-safe RPC ${method} response`,
      );
      if (body.jsonrpc !== '2.0' || body.id !== id) {
        throw new Error(`${role} authority-safe RPC ${method} returned a mismatched envelope`);
      }
      if (body.error !== undefined) {
        throw new Error(
          `${role} authority-safe RPC ${method} failed: ${JSON.stringify(body.error)}`,
        );
      }
      return body.result;
    },
  });
}

async function observeAuthoritySafeNodeView(
  source: AuthoritySafeRpcSource,
  expected: ReturnType<typeof normalizeExpectedTarget>,
  deploymentCandidate: DeploymentIdentityCandidate,
  deploymentProfile: ReturnType<typeof loadTrackedDeploymentIdentityArtifactProfile>,
  probe: AuthoritySafeLegacyMintProbeV1,
  classifySourceFailures: boolean,
): Promise<AuthoritySafeNodeView> {
  let sourceFailurePhase:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 =
      'source target native and EVM tip observation';
  try {
    const nativeTipHeight = BigInt(deploymentCandidate.view.tipHeight);
    const nativeTipHashHex = canonicalHash(
      await source.request('chain_getBlockHash', [toQuantityHex(nativeTipHeight)]),
      'native tip hash',
    );
    const nativeGenesisHashHex = canonicalHash(
      await source.request('chain_getBlockHash', [0]),
      'native genesis hash',
    );
    if (nativeGenesisHashHex !== expected.nativeGenesisHashHex) {
      throw new Error(
        'authority-safe native genesis hash differs from the explicit pin: '
        + `observed ${nativeGenesisHashHex}, expected ${expected.nativeGenesisHashHex}`,
      );
    }
    const nativeHeader = record(
      await source.request('chain_getHeader', [nativeTipHashHex]),
      'authority-safe native header',
    );
    if (rpcQuantity(nativeHeader.number, 'native header height') !== nativeTipHeight) {
      throw new Error('authority-safe native header height differs from the deployment snapshot');
    }
    const evmBlock = record(
      await source.request('eth_getBlockByNumber', [toQuantityHex(nativeTipHeight), false]),
      'authority-safe EVM block',
    );
    if (rpcQuantity(evmBlock.number, 'authority-safe EVM tip height') !== nativeTipHeight) {
      throw new Error('authority-safe EVM tip height differs from the deployment snapshot');
    }
    const evmTipHashHex = canonicalHash(evmBlock.hash, 'authority-safe EVM tip hash');
    if (evmTipHashHex.slice(2) !== deploymentCandidate.view.tipHashHex) {
      throw new Error('authority-safe EVM tip differs from the deployment snapshot');
    }

  sourceFailurePhase = 'source target node RPC snapshot observation';
  const [
    chainNameRaw,
    nodeNameRaw,
    nodeVersionRaw,
    peerIdRaw,
    healthRaw,
    runtimeVersionRaw,
    runtimeCodeRaw,
    chainIdRaw,
    bridgeCodeGenesisRaw,
    bridgeCodeTipRaw,
    tokenCodeGenesisRaw,
    tokenCodeTipRaw,
    bridgeOwnerGenesisRaw,
    bridgeOwnerTipRaw,
    bridgeTokenGenesisRaw,
    bridgeTokenTipRaw,
    tokenOwnerGenesisRaw,
    tokenOwnerTipRaw,
    ownerNonceRaw,
    ownerMintResultRaw,
  ] = await Promise.all([
    source.request('system_chain', []),
    source.request('system_name', []),
    source.request('system_version', []),
    source.request('system_localPeerId', []),
    source.request('system_health', []),
    source.request('state_getRuntimeVersion', [nativeTipHashHex]),
    source.request('state_getStorage', [STORAGE_KEYS.runtimeCode, nativeTipHashHex]),
    source.request('eth_chainId', []),
    source.request('eth_getCode', [expected.bridgeAddress, '0x0']),
    source.request('eth_getCode', [expected.bridgeAddress, toQuantityHex(nativeTipHeight)]),
    source.request('eth_getCode', [expected.tokenAddress, '0x0']),
    source.request('eth_getCode', [expected.tokenAddress, toQuantityHex(nativeTipHeight)]),
    source.request('eth_getStorageAt', [expected.bridgeAddress, '0x0', '0x0']),
    source.request('eth_getStorageAt', [
      expected.bridgeAddress,
      '0x0',
      toQuantityHex(nativeTipHeight),
    ]),
    source.request('eth_getStorageAt', [expected.bridgeAddress, '0x3', '0x0']),
    source.request('eth_getStorageAt', [
      expected.bridgeAddress,
      '0x3',
      toQuantityHex(nativeTipHeight),
    ]),
    source.request('eth_getStorageAt', [expected.tokenAddress, '0x5', '0x0']),
    source.request('eth_getStorageAt', [
      expected.tokenAddress,
      '0x5',
      toQuantityHex(nativeTipHeight),
    ]),
    source.request('eth_getTransactionCount', [
      expected.bridgeOwnerAddress,
      toQuantityHex(nativeTipHeight),
    ]),
    source.request('system_dryRunAt', [probe.dryRunExtrinsicHex, nativeTipHashHex]),
  ]);

  sourceFailurePhase = 'source target node identity validation';
  const chainName = exactString(chainNameRaw, 'authority-safe chain name');
  const nodeName = exactString(nodeNameRaw, 'authority-safe node name');
  const nodeVersion = exactString(nodeVersionRaw, 'authority-safe node version');
  const peerId = canonicalPeerId(peerIdRaw);

  sourceFailurePhase = 'source target peer health validation';
  const health = record(healthRaw, 'authority-safe node health');
  const peerCount = safeInteger(health.peers, 'authority-safe peer count');
  if (typeof health.shouldHavePeers !== 'boolean') {
    throw new Error('authority-safe node health lacks a canonical peer-policy hint');
  }
  if (health.isSyncing !== false || peerCount < 1) {
    throw new Error('authority-safe node is not a connected stable peer');
  }

  sourceFailurePhase = 'source target node identity validation';
  if (
    chainName !== expected.chainName
    || nodeName !== expected.nodeName
    || nodeVersion !== expected.nodeVersion
  ) {
    throw new Error('authority-safe node identity differs from the explicit pins');
  }

  sourceFailurePhase = 'source target EVM chain identity validation';
  if (rpcQuantity(chainIdRaw, 'authority-safe EVM chain ID') !== BigInt(expected.chainId)) {
    throw new Error('authority-safe EVM chain ID differs from the explicit pin');
  }

  sourceFailurePhase = 'source target runtime version validation';
  const runtimeVersion = record(runtimeVersionRaw, 'authority-safe runtime version');
  const runtimeSpecName = exactString(runtimeVersion.specName, 'runtime spec name');
  const runtimeSpecVersion = safeInteger(runtimeVersion.specVersion, 'runtime spec version');

  sourceFailurePhase = 'source target runtime code validation';
  const runtimeCode = canonicalBytesHex(
    runtimeCodeRaw,
    'authority-safe runtime code',
    MAX_RPC_RESPONSE_BYTES,
  );
  const runtimeCodeBytes = (runtimeCode.length - 2) / 2;
  const runtimeCodeSha256Hex = sha256Hex(Buffer.from(getBytes(runtimeCode)));
  if (
    runtimeCodeBytes !== expected.runtimeCodeBytes
    || runtimeCodeSha256Hex !== expected.runtimeCodeSha256Hex
  ) {
    throw new Error('authority-safe runtime code differs from the explicit pin');
  }

  sourceFailurePhase = 'source target application identity validation';
  const bridgeCodeGenesis = observedRuntimeCode(
    bridgeCodeGenesisRaw,
    deploymentProfile.bridge.runtimeByteLength,
    deploymentProfile.bridge.runtimeBytecodeSha256Hex,
    'genesis bridge',
  );
  const bridgeCodeTip = observedRuntimeCode(
    bridgeCodeTipRaw,
    deploymentProfile.bridge.runtimeByteLength,
    deploymentProfile.bridge.runtimeBytecodeSha256Hex,
    'tip bridge',
  );
  const tokenCodeGenesis = observedRuntimeCode(
    tokenCodeGenesisRaw,
    deploymentProfile.token.runtimeByteLength,
    deploymentProfile.token.runtimeBytecodeSha256Hex,
    'genesis token',
  );
  const tokenCodeTip = observedRuntimeCode(
    tokenCodeTipRaw,
    deploymentProfile.token.runtimeByteLength,
    deploymentProfile.token.runtimeBytecodeSha256Hex,
    'tip token',
  );
  assertAddressWord(bridgeOwnerGenesisRaw, expected.bridgeOwnerAddress, 'genesis bridge owner');
  assertAddressWord(bridgeOwnerTipRaw, expected.bridgeOwnerAddress, 'tip bridge owner');
  assertAddressWord(bridgeTokenGenesisRaw, expected.tokenAddress, 'genesis bridge token');
  assertAddressWord(bridgeTokenTipRaw, expected.tokenAddress, 'tip bridge token');
  assertAddressWord(tokenOwnerGenesisRaw, expected.bridgeAddress, 'genesis token owner');
  assertAddressWord(tokenOwnerTipRaw, expected.bridgeAddress, 'tip token owner');

  sourceFailurePhase = 'source target owner-mint quarantine validation';
  if (rpcQuantity(ownerNonceRaw, 'owner-mint nonce').toString() !== probe.nonce) {
    throw new Error('owner-mint dry-run nonce differs from the exact target account nonce');
  }
  const ownerMintResultHex = canonicalBytesHex(
    ownerMintResultRaw,
    'owner-mint dry-run result',
    64,
  );
  if (ownerMintResultHex !== LEGACY_MINT_DRY_RUN_RESULT_HEX) {
    throw new Error('direct legacy owner mint was not rejected with Custom(181)');
  }

  sourceFailurePhase = 'source target top-trie policy observation';
  await assertAuthoritySafeTopTrie(
    source,
    expected.bridgeAddress,
    nativeGenesisHashHex,
    nativeTipHashHex,
  );
  sourceFailurePhase = 'source target tip stability observation';
  const revalidatedTipHashHex = canonicalHash(
    await source.request('chain_getBlockHash', [toQuantityHex(nativeTipHeight)]),
    'revalidated native tip hash',
  );
  if (revalidatedTipHashHex !== nativeTipHashHex) {
    throw new Error('authority-safe native tip changed at the observed height');
  }

  const sharedBinding = {
    chainName,
    nodeName,
    nodeVersion,
    nativeGenesisHashHex,
    nativeTipHeight: nativeTipHeight.toString(),
    nativeTipHashHex,
    evmTipHashHex,
    runtimeSpecName,
    runtimeSpecVersion,
    runtimeCodeBytes,
    runtimeCodeSha256Hex,
    bridgeCodeGenesisSha256Hex: bridgeCodeGenesis.sha256Hex,
    bridgeCodeTipSha256Hex: bridgeCodeTip.sha256Hex,
    tokenCodeGenesisSha256Hex: tokenCodeGenesis.sha256Hex,
    tokenCodeTipSha256Hex: tokenCodeTip.sha256Hex,
    ownerMintResultHex,
  } as const;
    return Object.freeze({
      ...sharedBinding,
      peerId,
      peerCount,
      viewDigestHex: sha256Canonical(sharedBinding),
    });
  } catch (error) {
    if (!classifySourceFailures) throw error;
    throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
      sourceFailurePhase,
      error,
    );
  }
}

async function assertAuthoritySafeTopTrie(
  source: AuthoritySafeRpcSource,
  bridgeAddress: string,
  genesisHashHex: string,
  tipHashHex: string,
): Promise<void> {
  for (const blockHashHex of [genesisHashHex, tipHashHex]) {
    const values = await Promise.all([
      source.request('state_getStorage', [STORAGE_KEYS.sudo, blockHashHex]),
      source.request('state_getStorage', [STORAGE_KEYS.bridgeAddress, blockHashHex]),
      source.request('state_getStorage', [STORAGE_KEYS.currentPegInProfile, blockHashHex]),
      source.request('state_getStorage', [
        STORAGE_KEYS.currentCausalPegInProfileV2,
        blockHashHex,
      ]),
      source.request('state_getStorage', [
        STORAGE_KEYS.currentPooledReserveProfileV4,
        blockHashHex,
      ]),
      source.request('state_getStorage', [STORAGE_KEYS.causalEnforcementV2, blockHashHex]),
      source.request('state_getStorage', [
        STORAGE_KEYS.pooledReserveEnforcementV4,
        blockHashHex,
      ]),
    ]);
    if (values[0] !== null) {
      throw new Error('authority-safe Sudo key must remain absent');
    }
    if (canonicalBytesHex(values[1], 'typed quarantine address', 32) !== bridgeAddress) {
      throw new Error('authority-safe typed quarantine address differs from the bridge');
    }
    if (values.slice(2).some(value => value !== null)) {
      throw new Error('authority-safe peg-in profile or enforcement state must remain absent');
    }
  }
}

function finalizeObservation(
  target: ReturnType<typeof normalizeExpectedTarget>,
  deploymentCandidate: DeploymentIdentityCandidate,
  probe: AuthoritySafeLegacyMintProbeV1,
  pair: AuthoritySafeSourcePair,
  views: readonly [AuthoritySafeNodeView, AuthoritySafeNodeView],
): SubstrateFederatedAuthoritySafeDevnetObservationV1 {
  assertDeploymentIdentityCandidateProvenance(deploymentCandidate);
  const binding = authoritySafeSourcePairBinding(pair);
  const [primary, witness] = views;
  if (primary.viewDigestHex !== witness.viewDigestHex) {
    throw new Error('authority-safe primary and witness disagree on the runtime view');
  }
  const peerIds = Object.freeze([primary.peerId, witness.peerId].sort());
  if (new Set(peerIds).size !== 2) {
    throw new Error('authority-safe primary and witness must expose distinct peer identities');
  }
  if (
    binding.sourceIdsHex.length !== 2
    || new Set(binding.sourceIdsHex).size !== 2
    || binding.sourceIdsHex.some(id => !pair.sourceIdsHex.includes(id))
  ) {
    throw new Error('authority-safe source identity binding is invalid');
  }
  const sourceIdsHex = Object.freeze([...binding.sourceIdsHex]);
  const consensusDigestHex = sha256Canonical({
    viewDigestHex: primary.viewDigestHex,
    deploymentIdentityCandidateDigestHex: deploymentCandidate.candidateDigestHex,
    ownerMintEthereumTransactionHashHex: probe.ethereumTransactionHashHex,
    ownerMintDryRunExtrinsicSha256Hex: probe.dryRunExtrinsicSha256Hex,
    sourceIdsHex,
    peerIds,
  });
  const sourceAgreement = Object.freeze({
    sourceCount: 2 as const,
    sourceIdsHex,
    peerIds,
    bothNodesConnected: true as const,
    consensusDigestHex,
  });
  const view = Object.freeze({
    nativeTipHeight: primary.nativeTipHeight,
    nativeTipHashHex: primary.nativeTipHashHex,
    evmTipHashHex: primary.evmTipHashHex,
    runtimeSpecName: primary.runtimeSpecName,
    runtimeSpecVersion: primary.runtimeSpecVersion,
    bridgeRuntimeByteLength: (deploymentCandidate.view.bridgeRuntimeByteLength),
    bridgeRuntimeBytecodeSha256Hex:
      deploymentCandidate.view.bridgeRuntimeBytecodeSha256Hex,
    tokenRuntimeByteLength: deploymentCandidate.view.tokenRuntimeByteLength,
    tokenRuntimeBytecodeSha256Hex:
      deploymentCandidate.view.tokenRuntimeBytecodeSha256Hex,
    deploymentIdentityCandidateDigestHex: deploymentCandidate.candidateDigestHex,
    viewDigestHex: primary.viewDigestHex,
  });
  const legacyOwnerMintProbe = Object.freeze({
    ethereumTransactionHashHex: probe.ethereumTransactionHashHex,
    signedTransactionSha256Hex: probe.signedTransactionSha256Hex,
    dryRunExtrinsicSha256Hex: probe.dryRunExtrinsicSha256Hex,
    signerAddress: probe.signerAddress,
    recipientAddress: probe.recipientAddress,
    amount: probe.amount,
    ergoBoxIdHex: probe.ergoBoxIdHex,
    nonce: probe.nonce,
    resultHex: LEGACY_MINT_DRY_RUN_RESULT_HEX,
  });
  const checks = Object.freeze({
    exactNativeGenesisObserved: true as const,
    matchingNativeAndEvmTipsObserved: true as const,
    exactRuntimeCodeObserved: true as const,
    exactStorageLayoutPinVerified: true as const,
    exactApplicationRuntimeObservedAtGenesisAndTip: true as const,
    exactApplicationBindingsObservedAtGenesisAndTip: true as const,
    typedLegacyMintQuarantineObservedAtGenesisAndTip: true as const,
    sudoAbsentAtGenesisAndTip: true as const,
    allPegInProfilesAbsentAtGenesisAndTip: true as const,
    allPegInEnforcementAbsentAtGenesisAndTip: true as const,
    directLegacyOwnerMintRejectedByRuntimePolicy: true as const,
  });
  const boundaries = Object.freeze({
    twoNodeRuntimeIdentityObserved: true as const,
    independentSourceOriginsEstablished: true as const,
    independentSourceAdministrationEstablished: false as const,
    exactBinaryIdentityObserved: false as const,
    exactGeneratedSpecAcceptanceObserved: false as const,
    indirectOwnerMintBlockRejectionObserved: false as const,
    sourceHistoryAuthenticated: false as const,
    sourceFinalityAuthenticated: false as const,
    federatedLaunchEligible: false as const,
    mintAuthorized: false as const,
    settlementAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    profileActivated: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
  const unsigned = {
    schema: SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    status: 'isolated_two_node_runtime_observation' as const,
    target,
    view,
    sourceAgreement,
    legacyOwnerMintProbe,
    checks,
    boundaries,
  };
  const observation = Object.freeze({
    ...unsigned,
    observationDigestHex: sha256Canonical(unsigned),
  });
  OBSERVATIONS.add(observation);
  return observation;
}

function normalizeExpectedTarget(
  input: Readonly<ObserveSubstrateFederatedAuthoritySafeDevnetV1Input>,
) {
  const chainId = positiveChainId(input.expectedChainId);
  if (chainId === 1n) {
    throw new Error('authority-safe local target refuses Ethereum mainnet chain ID 1');
  }
  const runtimeCodeBytes = safeInteger(
    input.expectedRuntimeCodeBytes,
    'expected runtime code byte length',
  );
  if (runtimeCodeBytes === 0 || runtimeCodeBytes > 4 * 1024 * 1024) {
    throw new Error('expected runtime code byte length is outside the bounded range');
  }
  const bridgeAddress = canonicalAddress(input.bridgeAddress, 'bridge address');
  const tokenAddress = canonicalAddress(input.tokenAddress, 'token address');
  const bridgeOwnerAddress = canonicalAddress(
    input.bridgeOwnerAddress,
    'bridge owner address',
  );
  if (new Set([bridgeAddress, tokenAddress, bridgeOwnerAddress]).size !== 3) {
    throw new Error('authority-safe application identities must be pairwise distinct');
  }
  const runtimeCodeSha256Hex = canonicalDigest(
    input.expectedRuntimeCodeSha256Hex,
    'expected runtime code SHA-256',
  );
  const storageLayoutDigestHex = canonicalDigest(
    input.expectedStorageLayoutDigestHex,
    'expected storage-layout digest',
  );
  if (
    storageLayoutDigestHex
    !== substrateFederatedAuthoritySafeStorageLayoutDigestV1(runtimeCodeSha256Hex)
  ) {
    throw new Error('expected storage-layout digest differs from the source-locked layout');
  }
  return Object.freeze({
    chainName: boundedString(input.expectedChainName, 'expected chain name', 128),
    chainId: chainId.toString(),
    nativeGenesisHashHex: canonicalHash(
      input.expectedNativeGenesisHashHex,
      'expected native genesis hash',
    ),
    nodeName: boundedString(input.expectedNodeName, 'expected node name', 128),
    nodeVersion: boundedString(input.expectedNodeVersion, 'expected node version', 128),
    runtimeCodeBytes,
    runtimeCodeSha256Hex,
    storageLayoutDigestHex,
    bridgeAddress,
    tokenAddress,
    bridgeOwnerAddress,
  });
}

function observedRuntimeCode(
  value: unknown,
  expectedBytes: number,
  expectedSha256Hex: string,
  label: string,
): Readonly<{ byteLength: number; sha256Hex: string }> {
  const code = canonicalBytesHex(value, `${label} runtime code`, 64 * 1024);
  const byteLength = (code.length - 2) / 2;
  const digestHex = sha256Hex(Buffer.from(getBytes(code)));
  if (byteLength !== expectedBytes || digestHex !== expectedSha256Hex) {
    throw new Error(`${label} runtime code differs from the tracked artifact`);
  }
  return Object.freeze({ byteLength, sha256Hex: digestHex });
}

function assertAddressWord(value: unknown, expectedAddress: string, label: string): void {
  const word = canonicalBytesHex(value, label, 32);
  if (word !== `0x${'00'.repeat(12)}${expectedAddress.slice(2)}`) {
    throw new Error(`${label} differs from the exact application binding`);
  }
}

function encodeU256(value: bigint | number): Buffer {
  return encodeUnsignedLittleEndian(BigInt(value), 32);
}

function encodeScaleBytes(value: Buffer): Buffer {
  return Buffer.concat([encodeCompactUnsigned(BigInt(value.length)), value]);
}

function encodeCompactUnsigned(value: bigint): Buffer {
  if (value < 0n) {
    throw new Error('SCALE compact value cannot be negative');
  }
  if (value < 64n) {
    return Buffer.from([Number(value << 2n)]);
  }
  if (value < 16_384n) {
    return encodeUnsignedLittleEndian((value << 2n) | 1n, 2);
  }
  if (value < 1_073_741_824n) {
    return encodeUnsignedLittleEndian((value << 2n) | 2n, 4);
  }
  throw new Error('SCALE compact value exceeds the supported probe bound');
}

function encodeUnsignedLittleEndian(value: bigint, bytes: number): Buffer {
  if (value < 0n) {
    throw new Error('unsigned integer cannot be negative');
  }
  const output = Buffer.alloc(bytes);
  let remaining = value;
  for (let index = 0; index < bytes; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new Error('unsigned integer exceeds its canonical width');
  }
  return output;
}

function isRetryableSnapshotError(error: Error): boolean {
  if (error instanceof AggregateError) {
    const failures = error.errors.map(normalizeNodeObservationFailure);
    return failures.length > 0 && failures.every(isRetryableSnapshotError);
  }
  return /tip|snapshot|sources disagree|height changed/i.test(error.message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function canonicalAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be one canonical EVM address`);
  }
  return value.toLowerCase();
}

function canonicalHash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be one canonical 32-byte hash`);
  }
  return value.toLowerCase();
}

function canonicalDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be one lowercase SHA-256 digest`);
  }
  return value;
}

function canonicalBytesHex(value: unknown, label: string, maxBytes: number): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)
    || (value.length - 2) / 2 > maxBytes
  ) {
    throw new Error(`${label} must be bounded canonical byte hex`);
  }
  return value.toLowerCase();
}

function canonicalPeerId(value: unknown): string {
  if (typeof value !== 'string' || !/^12D3KooW[1-9A-HJ-NP-Za-km-z]{44}$/.test(value)) {
    throw new Error('authority-safe peer ID is not a canonical Ed25519 libp2p identity');
  }
  return value;
}

function positiveChainId(value: bigint): bigint {
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('authority-safe chain ID is outside the supported range');
  }
  return value;
}

function rpcQuantity(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new Error(`${label} must be one canonical RPC quantity`);
  }
  return BigInt(value);
}

function toQuantityHex(value: bigint): string {
  if (value < 0n) {
    throw new Error('RPC quantity cannot be negative');
  }
  return `0x${value.toString(16)}`;
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be one nonnegative safe integer`);
  }
  return value;
}

function exactString(value: unknown, label: string): string {
  return boundedString(value, label, 256);
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maxLength
    || value.trim() !== value
  ) {
    throw new Error(`${label} must be one bounded nonempty string`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256Hex(Buffer.from(JSON.stringify(value), 'utf8'));
}

const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;
const ZERO_HASH = `0x${'00'.repeat(32)}`;
