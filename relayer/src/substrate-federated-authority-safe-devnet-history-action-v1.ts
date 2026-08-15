import { createHash } from 'node:crypto';

import { canonicalJson } from './strict-json.js';

export type SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1 =
  | 'chain_getBlockHash'
  | 'chain_getFinalizedHead'
  | 'chain_getHeader'
  | 'state_getStorage'
  | 'eth_getBlockByNumber'
  | 'eth_getCode';

export interface SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1 {
  readonly role: 'primary' | 'witness';
  readonly endpointIdentityDigestHex: string;
  request(
    method: SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1,
    params: readonly unknown[],
  ): Promise<unknown>;
}

export interface SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1 {
  readonly primaryRpc:
    Readonly<SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1>;
  readonly witnessRpc:
    Readonly<SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1>;
  readonly chain: Readonly<{
    readonly name: string;
    readonly id: string;
    readonly protocolId: string;
    readonly chainId: string;
    readonly generatedSpecSha256Hex: string;
  }>;
  readonly source: Readonly<{
    readonly frontierCommit: string;
    readonly frontierPatchSha256Hex: string;
    readonly runtimeCodeBytes: number;
    readonly runtimeCodeSha256Hex: string;
    readonly storageLayoutDigestHex: string;
  }>;
  readonly application: Readonly<{
    readonly bridgeAddress: string;
    readonly tokenAddress: string;
    readonly bridgeOwnerAddress: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
  }>;
  readonly observation: Readonly<{
    readonly nativeGenesisHashHex: string;
    readonly nativeTipHeight: string;
    readonly nativeTipHashHex: string;
    readonly evmTipHashHex: string;
    readonly observationDigestHex: string;
  }>;
}

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_REPORTED_FINALIZED_BLOCKS_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-reported-finalized-blocks.v1' as const;
export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_RUNTIME_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-runtime-history.v1' as const;
export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_APPLICATION_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-application-history.v1' as const;

const MAX_HISTORY_BLOCKS = 257;
const FINALITY_WAIT_MS = 30_000;
const FINALITY_RETRY_MS = 250;

type HistoryRpcSource = SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1;

interface SourceBlockView {
  readonly height: string;
  readonly nativeBlockHashHex: string;
  readonly nativeHeader: Readonly<Record<string, unknown>>;
  readonly executionBlockHashHex: string;
  readonly executionBlock: Readonly<Record<string, unknown>>;
  readonly runtimeCodeSha256Hex: string;
  readonly runtimeCodeBytes: number;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
}

export interface ReportedFinalityPathV1 {
  readonly role: 'primary' | 'witness';
  readonly headHeight: string;
  readonly headNativeBlockHashHex: string;
  readonly ancestryToAcceptedTip: readonly Readonly<{
    readonly height: string;
    readonly nativeBlockHashHex: string;
    readonly parentNativeBlockHashHex: string;
  }>[];
}

export interface SubstrateFederatedAuthoritySafeDevnetHistoryArtifactsV1 {
  readonly acceptanceReport: Uint8Array;
  readonly reportedFinalizedBlocksManifest: Uint8Array;
  readonly runtimeHistoryManifest: Uint8Array;
  readonly applicationHistoryManifest: Uint8Array;
}

export interface CollectedHistoryActionV1 {
  readonly target: Readonly<{
    readonly frontierCommit: string;
    readonly frontierPatchSha256Hex: string;
    readonly generatedSpecSha256Hex: string;
    readonly nativeGenesisHashHex: string;
    readonly acceptedNativeTipHashHex: string;
    readonly acceptedExecutionTipHashHex: string;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly storageLayoutDigestHex: string;
    readonly bridgeAddressHex: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenAddressHex: string;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
  }>;
  readonly interval: Readonly<{
    readonly genesisNativeBlockHashHex: string;
    readonly observedTipHeight: string;
    readonly observedTipNativeBlockHashHex: string;
    readonly observedTipExecutionBlockHashHex: string;
    readonly blockCount: number;
    readonly reportedFinality: readonly Readonly<ReportedFinalityPathV1>[];
  }>;
  readonly artifacts:
    Readonly<Omit<
      SubstrateFederatedAuthoritySafeDevnetHistoryArtifactsV1,
      'acceptanceReport'
    >>;
}

export async function collectSubstrateFederatedAuthoritySafeDevnetHistoryActionV1(
  context: Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
  >,
): Promise<Readonly<CollectedHistoryActionV1>> {
  const target = snapshotAcceptedTarget(context);
  const sources = Object.freeze([
    context.primaryRpc,
    context.witnessRpc,
  ] as const);
  if (
    sources[0].endpointIdentityDigestHex
      === sources[1].endpointIdentityDigestHex
  ) {
    throw new Error('authority-safe history RPC origins must be distinct');
  }
  const tipHeight = decimalHeight(
    context.observation.nativeTipHeight,
    'accepted observation tip height',
  );
  if (tipHeight + 1n > BigInt(MAX_HISTORY_BLOCKS)) {
    throw new Error(
      `authority-safe history exceeds the ${MAX_HISTORY_BLOCKS}-block V1 bound`,
    );
  }
  const reportedFinality = await waitForAcceptedTipFinality(
    sources,
    context,
    tipHeight,
  );
  const rows: SourceBlockView[] = [];
  let collectedBytes = 0;
  for (let height = 0n; height <= tipHeight; height += 1n) {
    const [primary, witness] = await Promise.all([
      collectBlockView(sources[0], context, height),
      collectBlockView(sources[1], context, height),
    ]);
    if (canonicalJson(primary) !== canonicalJson(witness)) {
      throw new Error(
        `authority-safe history origins disagree at height ${height}`,
      );
    }
    assertParentLink(rows.at(-1), primary);
    collectedBytes += Buffer.byteLength(canonicalJson(primary), 'utf8');
    if (collectedBytes > 64 * 1024 * 1024) {
      throw new Error('authority-safe history exceeds the snapshot byte budget');
    }
    rows.push(primary);
  }
  const finalRow = rows.at(-1)!;
  assertAcceptedTargetHistoryBinding(target, rows[0]!, finalRow);
  await assertHistoryStable(sources, context, rows);
  const artifacts = Object.freeze(buildArtifacts(
    target,
    rows,
    reportedFinality,
  ));
  return Object.freeze({
    target,
    interval: Object.freeze({
      genesisNativeBlockHashHex: rows[0]!.nativeBlockHashHex,
      observedTipHeight: tipHeight.toString(),
      observedTipNativeBlockHashHex: finalRow.nativeBlockHashHex,
      observedTipExecutionBlockHashHex: finalRow.executionBlockHashHex,
      blockCount: rows.length,
      reportedFinality,
    }),
    artifacts,
  });
}

function snapshotAcceptedTarget(
  context: Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
  >,
): Readonly<CollectedHistoryActionV1['target']> {
  return Object.freeze({
    frontierCommit: sha1(context.source.frontierCommit, 'Frontier commit'),
    frontierPatchSha256Hex: digest(
      context.source.frontierPatchSha256Hex,
      'Frontier patch',
    ),
    generatedSpecSha256Hex: digest(
      context.chain.generatedSpecSha256Hex,
      'accepted generated spec',
    ),
    nativeGenesisHashHex: digest(
      context.observation.nativeGenesisHashHex,
      'accepted native genesis',
    ),
    acceptedNativeTipHashHex: digest(
      context.observation.nativeTipHashHex,
      'accepted native tip',
    ),
    acceptedExecutionTipHashHex: digest(
      context.observation.evmTipHashHex,
      'accepted execution tip',
    ),
    sourceRuntimeCodeSha256Hex: digest(
      context.source.runtimeCodeSha256Hex,
      'source runtime',
    ),
    sourceRuntimeCodeBytes: positiveInteger(
      context.source.runtimeCodeBytes,
      'source runtime bytes',
    ),
    storageLayoutDigestHex: digest(
      context.source.storageLayoutDigestHex,
      'accepted storage layout',
    ),
    bridgeAddressHex: address(context.application.bridgeAddress, 'bridge'),
    tokenAddressHex: address(context.application.tokenAddress, 'token'),
    bridgeRuntimeCodeSha256Hex:
      digest(context.application.bridgeRuntimeCodeSha256Hex, 'bridge runtime'),
    bridgeRuntimeCodeBytes: positiveInteger(
      context.application.bridgeRuntimeCodeBytes,
      'bridge runtime bytes',
    ),
    tokenRuntimeCodeSha256Hex:
      digest(context.application.tokenRuntimeCodeSha256Hex, 'token runtime'),
    tokenRuntimeCodeBytes: positiveInteger(
      context.application.tokenRuntimeCodeBytes,
      'token runtime bytes',
    ),
  });
}

function assertAcceptedTargetHistoryBinding(
  target: Readonly<CollectedHistoryActionV1['target']>,
  genesis: Readonly<SourceBlockView>,
  tip: Readonly<SourceBlockView>,
): void {
  if (genesis.nativeBlockHashHex !== target.nativeGenesisHashHex) {
    throw new Error('collected history genesis differs from the accepted target');
  }
  if (
    tip.nativeBlockHashHex !== target.acceptedNativeTipHashHex
    || tip.executionBlockHashHex !== target.acceptedExecutionTipHashHex
  ) {
    throw new Error('collected history does not end at the accepted target tip');
  }
  if (
    tip.runtimeCodeSha256Hex !== target.sourceRuntimeCodeSha256Hex
    || tip.runtimeCodeBytes !== target.sourceRuntimeCodeBytes
    || tip.bridgeRuntimeCodeSha256Hex !== target.bridgeRuntimeCodeSha256Hex
    || tip.bridgeRuntimeCodeBytes !== target.bridgeRuntimeCodeBytes
    || tip.tokenRuntimeCodeSha256Hex !== target.tokenRuntimeCodeSha256Hex
    || tip.tokenRuntimeCodeBytes !== target.tokenRuntimeCodeBytes
  ) {
    throw new Error('collected history tip code identity differs from the accepted target');
  }
}

async function waitForAcceptedTipFinality(
  sources: readonly HistoryRpcSource[],
  context: Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
  >,
  tipHeight: bigint,
): Promise<readonly Readonly<ReportedFinalityPathV1>[]> {
  const deadline = Date.now() + FINALITY_WAIT_MS;
  while (Date.now() < deadline) {
    let waitingForFinality = false;
    const paths: Readonly<ReportedFinalityPathV1>[] = [];
    for (const source of sources) {
      const finalizedHash = digest(
        await source.request('chain_getFinalizedHead', []),
        'reported finalized head',
      );
      const finalizedHeader = record(
        await source.request('chain_getHeader', [`0x${finalizedHash}`]),
        'reported finalized header',
      );
      const finalizedHeight = rpcHeight(
        finalizedHeader.number,
        'reported finalized height',
      );
      if (finalizedHeight < tipHeight) {
        waitingForFinality = true;
        continue;
      }
      if (finalizedHeight - tipHeight >= BigInt(MAX_HISTORY_BLOCKS)) {
        throw new Error(
          'reported finalized-head ancestry exceeds the bounded history profile',
        );
      }
      const acceptedTipHash = digest(
        await source.request('chain_getBlockHash', [nativeHeightParameter(tipHeight)]),
        'accepted observation tip recheck',
      );
      if (
        acceptedTipHash
          !== digest(context.observation.nativeTipHashHex, 'accepted tip')
      ) {
        throw new Error('accepted observation tip was replaced before history collection');
      }
      const ancestry: ReportedFinalityPathV1['ancestryToAcceptedTip'][number][] = [];
      let currentHash = finalizedHash;
      let currentHeader = finalizedHeader;
      let currentHeight = finalizedHeight;
      while (true) {
        const observedHeight = rpcHeight(
          currentHeader.number,
          'reported finalized ancestry height',
        );
        if (observedHeight !== currentHeight) {
          throw new Error('reported finalized ancestry height is not contiguous');
        }
        const parentHash = digest(
          currentHeader.parentHash,
          'reported finalized ancestry parent',
        );
        ancestry.push(Object.freeze({
          height: currentHeight.toString(),
          nativeBlockHashHex: currentHash,
          parentNativeBlockHashHex: parentHash,
        }));
        if (currentHeight === tipHeight) break;
        currentHash = parentHash;
        currentHeight -= 1n;
        currentHeader = record(
          await source.request('chain_getHeader', [`0x${currentHash}`]),
          'reported finalized ancestry header',
        );
      }
      if (currentHash !== acceptedTipHash) {
        throw new Error(
          'accepted observation tip is not an ancestor of the reported finalized head',
        );
      }
      paths.push(Object.freeze({
        role: source.role,
        headHeight: finalizedHeight.toString(),
        headNativeBlockHashHex: finalizedHash,
        ancestryToAcceptedTip: Object.freeze(ancestry),
      }));
    }
    if (!waitingForFinality) return Object.freeze(paths);
    await delay(FINALITY_RETRY_MS);
  }
  throw new Error('accepted tip did not reach reported finality');
}

async function collectBlockView(
  source: HistoryRpcSource,
  context: Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
  >,
  height: bigint,
): Promise<Readonly<SourceBlockView>> {
  const heightHex = quantity(height);
  const nativeBlockHashHex = digest(
    await source.request('chain_getBlockHash', [nativeHeightParameter(height)]),
    `native block ${height}`,
  );
  const [nativeHeaderRaw, executionBlockRaw, runtimeCodeRaw, bridgeCodeRaw,
    tokenCodeRaw] = await Promise.all([
    source.request('chain_getHeader', [`0x${nativeBlockHashHex}`]),
    source.request('eth_getBlockByNumber', [heightHex, false]),
    source.request('state_getStorage', [
      '0x3a636f6465',
      `0x${nativeBlockHashHex}`,
    ]),
    source.request('eth_getCode', [context.application.bridgeAddress, heightHex]),
    source.request('eth_getCode', [context.application.tokenAddress, heightHex]),
  ]);
  const nativeHeader = record(nativeHeaderRaw, `native header ${height}`);
  const executionBlock = record(executionBlockRaw, `execution block ${height}`);
  if (rpcHeight(nativeHeader.number, `native header ${height} number`) !== height) {
    throw new Error(`native header height differs at ${height}`);
  }
  if (
    rpcHeight(executionBlock.number, `execution block ${height} number`)
      !== height
  ) {
    throw new Error(`execution block height differs at ${height}`);
  }
  const executionBlockHashHex = digest(
    executionBlock.hash,
    `execution block ${height} hash`,
  );
  const runtimeCode = code(runtimeCodeRaw, `runtime code at ${height}`);
  const bridgeCode = code(bridgeCodeRaw, `bridge code at ${height}`);
  const tokenCode = code(tokenCodeRaw, `token code at ${height}`);
  if (height === 0n && (runtimeCode.length === 0 || bridgeCode.length === 0
    || tokenCode.length === 0)) {
    throw new Error('authority-safe archive genesis state is unavailable');
  }
  return Object.freeze({
    height: height.toString(),
    nativeBlockHashHex,
    nativeHeader: Object.freeze({ ...nativeHeader }),
    executionBlockHashHex,
    executionBlock: Object.freeze({ ...executionBlock }),
    runtimeCodeSha256Hex: sha256(runtimeCode),
    runtimeCodeBytes: runtimeCode.length,
    bridgeRuntimeCodeSha256Hex: sha256(bridgeCode),
    bridgeRuntimeCodeBytes: bridgeCode.length,
    tokenRuntimeCodeSha256Hex: sha256(tokenCode),
    tokenRuntimeCodeBytes: tokenCode.length,
  });
}

function assertParentLink(
  previous: SourceBlockView | undefined,
  current: SourceBlockView,
): void {
  if (previous === undefined) return;
  const nativeParent = digest(
    current.nativeHeader.parentHash,
    `native parent at ${current.height}`,
  );
  const executionParent = digest(
    current.executionBlock.parentHash,
    `execution parent at ${current.height}`,
  );
  if (
    nativeParent !== previous.nativeBlockHashHex
    || executionParent !== previous.executionBlockHashHex
  ) {
    throw new Error(`authority-safe history parent linkage failed at ${current.height}`);
  }
}

async function assertHistoryStable(
  sources: readonly HistoryRpcSource[],
  context: Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
  >,
  rows: readonly SourceBlockView[],
): Promise<void> {
  for (const row of rows) {
    const height = BigInt(row.height);
    const [primary, witness] = await Promise.all([
      collectBlockView(sources[0], context, height),
      collectBlockView(sources[1], context, height),
    ]);
    if (canonicalJson(primary) !== canonicalJson(witness)) {
      throw new Error(
        `authority-safe history origins disagree during recheck at height ${row.height}`,
      );
    }
    if (canonicalJson(primary) !== canonicalJson(row)) {
      throw new Error(`authority-safe history changed at height ${row.height}`);
    }
  }
}

function buildArtifacts(
  target: Readonly<CollectedHistoryActionV1['target']>,
  rows: readonly SourceBlockView[],
  reportedFinality: readonly Readonly<ReportedFinalityPathV1>[],
): Omit<
  SubstrateFederatedAuthoritySafeDevnetHistoryArtifactsV1,
  'acceptanceReport'
> {
  const common = {
    target,
    firstHeight: '0',
    lastHeight: rows.at(-1)!.height,
  };
  return {
    reportedFinalizedBlocksManifest: canonicalBytes({
      schema:
        SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_REPORTED_FINALIZED_BLOCKS_V1_SCHEMA,
      version: 1,
      ...common,
      finalityAuthority: 'two-owned-node-rpc-reported',
      reportedFinality,
      blocks: rows.map(row => ({
        height: row.height,
        nativeBlockHashHex: row.nativeBlockHashHex,
        nativeHeader: row.nativeHeader,
        executionBlockHashHex: row.executionBlockHashHex,
        executionBlock: row.executionBlock,
      })),
    }),
    runtimeHistoryManifest: canonicalBytes({
      schema:
        SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_RUNTIME_HISTORY_V1_SCHEMA,
      version: 1,
      ...common,
      states: rows.map(row => ({
        height: row.height,
        nativeBlockHashHex: row.nativeBlockHashHex,
        runtimeCodeSha256Hex: row.runtimeCodeSha256Hex,
        runtimeCodeBytes: row.runtimeCodeBytes,
      })),
    }),
    applicationHistoryManifest: canonicalBytes({
      schema:
        SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_APPLICATION_HISTORY_V1_SCHEMA,
      version: 1,
      ...common,
      bridgeAddressHex: target.bridgeAddressHex,
      tokenAddressHex: target.tokenAddressHex,
      states: rows.map(row => ({
        height: row.height,
        executionBlockHashHex: row.executionBlockHashHex,
        bridgeRuntimeCodeSha256Hex: row.bridgeRuntimeCodeSha256Hex,
        bridgeRuntimeCodeBytes: row.bridgeRuntimeCodeBytes,
        tokenRuntimeCodeSha256Hex: row.tokenRuntimeCodeSha256Hex,
        tokenRuntimeCodeBytes: row.tokenRuntimeCodeBytes,
      })),
    }),
  };
}

function canonicalBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value), 'utf8');
}

function code(value: unknown, label: string): Buffer {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(value)) {
    throw new Error(`${label} is not canonical lowercase byte hex`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0x)?[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} is not canonical lowercase 32-byte hex`);
  }
  return value.startsWith('0x') ? value.slice(2) : value;
}

function address(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0x)?[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} address is not canonical lowercase 20-byte hex`);
  }
  return value.startsWith('0x') ? value.slice(2) : value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rpcHeight(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)) {
    throw new Error(`${label} is not a canonical RPC quantity`);
  }
  return BigInt(value);
}

function decimalHeight(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} is not a canonical decimal height`);
  }
  return BigInt(value);
}

function quantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function nativeHeightParameter(value: bigint): number | string {
  return value === 0n ? 0 : quantity(value);
}

function sha1(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} is not canonical lowercase SHA-1 hex`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}
