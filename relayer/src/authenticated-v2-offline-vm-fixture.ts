import { createHash } from 'crypto';

import {
  loadCanonicalAuthenticatedV2ContractTemplates,
  type AuthenticatedV2ContractTrees,
} from './authenticated-v2-canonical-contracts.js';
import {
  deriveAuthenticatedV2InitialBinding,
  initialBindingCompilerRunFromPinnedJvm,
} from './authenticated-v2-initial-binding.js';
import {
  compileResolvedAuthenticatedV2SourcesWithPinnedJvm,
} from './authenticated-v2-source-tree-conformance.js';
import { buildWasmSimplifiedUpcomingPreHeaderCarrier } from './ergo-upcoming-state-context.js';

const HEADER_COUNT = 10;
const HEADER_VERSION = 2;
const HEADER_N_BITS = 72_286_528;
const HEADER_DIFFICULTY = '1325481984';
const HEADER_SIZE = 219;
const HEADER_INTERVAL_MS = 120_000;
const HEADER_BASE_TIMESTAMP = 1_700_000_000_000;
const HEADER_MINER_PK =
  '0288114b0586efea9f86e4587f2071bc1c85fb77e15eba96b2769733e0daf57903';
const HEADER_W =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

export interface PinnedAuthenticatedV2VmTrees {
  trees: AuthenticatedV2ContractTrees;
  treeSha256: AuthenticatedV2ContractTrees;
  compilerIdentityDigestHex: string;
  sourceBaselineDigestHex: string;
  compilerPasses: 3;
  fixedPointVerified: true;
}

export interface SyntheticVmHeaderRecord {
  raw: Record<string, unknown>;
  id: string;
  parentId: string;
  height: number;
  extensionRootHex: string;
}

export interface SyntheticVmHeaderContext {
  stateContext: any;
  currentHeight: number;
  anchorHeader: SyntheticVmHeaderRecord;
  anchorContextIndex: number;
  headers: readonly SyntheticVmHeaderRecord[];
  provenance: 'deterministic-synthetic-header-context';
}

export interface RetainedSyntheticVmHeaderContext {
  currentHeight: number;
  anchorHeader: SyntheticVmHeaderRecord;
  anchorContextIndex: number;
  headers: readonly SyntheticVmHeaderRecord[];
  provenance: 'deterministic-synthetic-header-context';
}

export async function compilePinnedAuthenticatedV2VmTrees(input: {
  bridgeRoot: string;
  worktreeRoot: string;
  ergoSourcePath: string;
  trackerNftId: string;
  duplicatePreventionNftId: string;
}): Promise<PinnedAuthenticatedV2VmTrees> {
  const report = await deriveAuthenticatedV2InitialBinding({
    environment: 'local',
    trackerFundingBoxId: input.trackerNftId,
    dupVaultFundingBoxId: input.duplicatePreventionNftId,
  }, {
    templates: loadCanonicalAuthenticatedV2ContractTemplates(input.bridgeRoot),
    compile: async resolved => initialBindingCompilerRunFromPinnedJvm(
      await compileResolvedAuthenticatedV2SourcesWithPinnedJvm({
        resolved,
        bridgeRoot: input.bridgeRoot,
        worktreeRoot: input.worktreeRoot,
        ergoSourcePath: input.ergoSourcePath,
      }),
    ),
  });

  return Object.freeze({
    trees: Object.freeze({
      tracker: report.provisioningContracts.tracker.ergoTreeHex,
      unlock: report.provisioningContracts.unlock.ergoTreeHex,
      duplicatePrevention: report.provisioningContracts.duplicatePrevention.ergoTreeHex,
    }),
    treeSha256: Object.freeze({
      tracker: report.provisioningContracts.tracker.ergoTreeSha256Hex,
      unlock: report.provisioningContracts.unlock.ergoTreeSha256Hex,
      duplicatePrevention: report.provisioningContracts.duplicatePrevention.ergoTreeSha256Hex,
    }),
    compilerIdentityDigestHex: report.compiler.identityDigestHex,
    sourceBaselineDigestHex: report.compiler.sourceBaselineDigestHex,
    compilerPasses: report.dependencyBinding.compilerPasses,
    fixedPointVerified: report.dependencyBinding.fixedPointVerified,
  });
}

/**
 * Builds a deterministic sigma-rust state context for local VM reduction only.
 * The fixture is parent-linked and structurally valid for the WASM parser, but
 * its header IDs and PoW are not consensus evidence and must never be described
 * as mined-header or live-chain acceptance.
 */
export function buildDeterministicSyntheticVmHeaderContext(
  wasm: any,
  input: {
    currentHeight: number;
    anchorContextIndex: number;
    anchorExtensionRootHex: string;
  },
): SyntheticVmHeaderContext {
  if (!Number.isSafeInteger(input.currentHeight) || input.currentHeight < HEADER_COUNT) {
    throw new Error(`synthetic VM current height must be at least ${HEADER_COUNT}`);
  }
  if (
    !Number.isSafeInteger(input.anchorContextIndex)
    || input.anchorContextIndex < 0
    || input.anchorContextIndex >= HEADER_COUNT
  ) {
    throw new Error(`synthetic VM anchor context index must be between 0 and ${HEADER_COUNT - 1}`);
  }
  const anchorExtensionRootHex = fixedHex(
    input.anchorExtensionRootHex,
    32,
    'synthetic VM anchor extension root',
  );
  const ids = Array.from(
    { length: HEADER_COUNT + 2 },
    (_, index) => fixtureHash(`authenticated-v2-vm-header-id-${index}`),
  );
  const headers = Array.from({ length: HEADER_COUNT }, (_, index) => {
    const height = input.currentHeight - index - 1;
    const extensionRootHex = index === input.anchorContextIndex
      ? anchorExtensionRootHex
      : fixtureHash(`authenticated-v2-vm-extension-root-${index}`);
    const raw: Record<string, unknown> = {
      extensionId: fixtureHash(`authenticated-v2-vm-extension-id-${index}`),
      difficulty: HEADER_DIFFICULTY,
      votes: '000000',
      timestamp: HEADER_BASE_TIMESTAMP - index * HEADER_INTERVAL_MS,
      size: HEADER_SIZE,
      stateRoot: `00${fixtureHash(`authenticated-v2-vm-state-root-${index}`)}`,
      height,
      nBits: HEADER_N_BITS,
      version: HEADER_VERSION,
      id: ids[index + 1],
      adProofsRoot: fixtureHash(`authenticated-v2-vm-ad-proofs-root-${index}`),
      transactionsRoot: fixtureHash(`authenticated-v2-vm-transactions-root-${index}`),
      extensionHash: extensionRootHex,
      powSolutions: {
        pk: HEADER_MINER_PK,
        w: HEADER_W,
        n: '000100000580a91b',
        d: 0,
      },
      adProofsId: fixtureHash(`authenticated-v2-vm-ad-proofs-id-${index}`),
      transactionsId: fixtureHash(`authenticated-v2-vm-transactions-id-${index}`),
      parentId: ids[index + 2],
    };
    return {
      raw,
      id: ids[index + 1],
      parentId: ids[index + 2],
      height,
      extensionRootHex,
    };
  });

  const parsed = headers.map((header, index) => {
    const value = wasm.BlockHeader.from_json(JSON.stringify(header.raw));
    const expectedId = wasm.BlockId.from_str(header.id);
    if (!value.id().equals(expectedId)) {
      throw new Error(`sigma-rust changed synthetic VM header ${index} identity`);
    }
    return value;
  });
  const blockHeaders = new wasm.BlockHeaders(parsed[0]);
  for (let index = 1; index < parsed.length; index += 1) blockHeaders.add(parsed[index]);
  const preHeaderCarrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0].raw),
  ));

  return Object.freeze({
    stateContext: new wasm.ErgoStateContext(
      wasm.PreHeader.from_block_header(preHeaderCarrier),
      blockHeaders,
      wasm.Parameters.default_parameters(),
    ),
    currentHeight: input.currentHeight,
    anchorHeader: headers[input.anchorContextIndex],
    anchorContextIndex: input.anchorContextIndex,
    headers: Object.freeze(headers),
    provenance: 'deterministic-synthetic-header-context' as const,
  });
}

/**
 * Extends one retained deterministic header window without replacing its
 * admitted anchor. This helper is deliberately exact-depth: the retained
 * anchor must become the oldest header in the ten-header settlement window.
 */
export function buildContinuedDeterministicSyntheticVmHeaderContext(
  wasm: any,
  input: {
    priorContext: RetainedSyntheticVmHeaderContext;
    targetCurrentHeight: number;
  },
): SyntheticVmHeaderContext {
  assertRetainedSyntheticHeaderContext(input.priorContext);
  if (
    !Number.isSafeInteger(input.targetCurrentHeight)
    || input.targetCurrentHeight <= input.priorContext.currentHeight
  ) {
    throw new Error('continued synthetic VM target height must advance the retained context');
  }

  const prior = input.priorContext;
  const anchorDepth = input.targetCurrentHeight - prior.anchorHeader.height;
  if (anchorDepth !== HEADER_COUNT) {
    throw new Error(`continued synthetic VM anchor depth must equal ${HEADER_COUNT}`);
  }
  const retainedHeaders = prior.headers.slice(0, prior.anchorContextIndex + 1);
  const newHeaderCount = input.targetCurrentHeight - prior.currentHeight;
  if (newHeaderCount + retainedHeaders.length !== HEADER_COUNT) {
    throw new Error('continued synthetic VM window cannot retain the exact admitted anchor');
  }

  const priorTip = retainedHeaders[0];
  const priorTipTimestamp = Number(priorTip.raw.timestamp);
  if (!Number.isSafeInteger(priorTipTimestamp) || priorTipTimestamp < 0) {
    throw new Error('retained synthetic VM tip timestamp is invalid');
  }
  let parentId = priorTip.id;
  const ascendingNewHeaders: SyntheticVmHeaderRecord[] = [];
  for (let height = prior.currentHeight; height < input.targetCurrentHeight; height += 1) {
    const id = fixtureHash(
      `authenticated-v2-vm-continuation-${prior.anchorHeader.id}-${height}`,
    );
    const extensionRootHex = fixtureHash(
      `authenticated-v2-vm-continuation-extension-${prior.anchorHeader.id}-${height}`,
    );
    const raw: Record<string, unknown> = {
      extensionId: fixtureHash(
        `authenticated-v2-vm-continuation-extension-id-${prior.anchorHeader.id}-${height}`,
      ),
      difficulty: HEADER_DIFFICULTY,
      votes: '000000',
      timestamp: priorTipTimestamp + (height - priorTip.height) * HEADER_INTERVAL_MS,
      size: HEADER_SIZE,
      stateRoot: `00${fixtureHash(
        `authenticated-v2-vm-continuation-state-root-${prior.anchorHeader.id}-${height}`,
      )}`,
      height,
      nBits: HEADER_N_BITS,
      version: HEADER_VERSION,
      id,
      adProofsRoot: fixtureHash(
        `authenticated-v2-vm-continuation-ad-proofs-root-${prior.anchorHeader.id}-${height}`,
      ),
      transactionsRoot: fixtureHash(
        `authenticated-v2-vm-continuation-transactions-root-${prior.anchorHeader.id}-${height}`,
      ),
      extensionHash: extensionRootHex,
      powSolutions: {
        pk: HEADER_MINER_PK,
        w: HEADER_W,
        n: '000100000580a91b',
        d: 0,
      },
      adProofsId: fixtureHash(
        `authenticated-v2-vm-continuation-ad-proofs-id-${prior.anchorHeader.id}-${height}`,
      ),
      transactionsId: fixtureHash(
        `authenticated-v2-vm-continuation-transactions-id-${prior.anchorHeader.id}-${height}`,
      ),
      parentId,
    };
    ascendingNewHeaders.push({
      raw,
      id,
      parentId,
      height,
      extensionRootHex,
    });
    parentId = id;
  }

  const headers = [
    ...ascendingNewHeaders.reverse(),
    ...retainedHeaders,
  ];
  assertSyntheticHeaderWindow(headers, input.targetCurrentHeight);
  const anchorContextIndex = headers.length - 1;
  if (headers[anchorContextIndex] !== prior.anchorHeader) {
    throw new Error('continued synthetic VM context replaced the retained anchor capability');
  }

  const parsed = headers.map((header, index) => {
    const value = wasm.BlockHeader.from_json(JSON.stringify(header.raw));
    const expectedId = wasm.BlockId.from_str(header.id);
    if (!value.id().equals(expectedId)) {
      throw new Error(`sigma-rust changed continued synthetic VM header ${index} identity`);
    }
    return value;
  });
  const blockHeaders = new wasm.BlockHeaders(parsed[0]);
  for (let index = 1; index < parsed.length; index += 1) blockHeaders.add(parsed[index]);
  const preHeaderCarrier = wasm.BlockHeader.from_json(JSON.stringify(
    buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0].raw),
  ));

  return Object.freeze({
    stateContext: new wasm.ErgoStateContext(
      wasm.PreHeader.from_block_header(preHeaderCarrier),
      blockHeaders,
      wasm.Parameters.default_parameters(),
    ),
    currentHeight: input.targetCurrentHeight,
    anchorHeader: prior.anchorHeader,
    anchorContextIndex,
    headers: Object.freeze(headers),
    provenance: 'deterministic-synthetic-header-context' as const,
  });
}

function assertRetainedSyntheticHeaderContext(
  context: RetainedSyntheticVmHeaderContext,
): void {
  if (
    !context
    || context.provenance !== 'deterministic-synthetic-header-context'
    || !Number.isSafeInteger(context.currentHeight)
    || context.headers.length !== HEADER_COUNT
    || !Number.isSafeInteger(context.anchorContextIndex)
    || context.anchorContextIndex < 0
    || context.anchorContextIndex >= HEADER_COUNT
  ) {
    throw new Error('retained synthetic VM header context is invalid');
  }
  assertSyntheticHeaderWindow(context.headers, context.currentHeight);
  if (context.anchorHeader !== context.headers[context.anchorContextIndex]) {
    throw new Error('retained synthetic VM anchor must reference its exact header entry');
  }
}

function assertSyntheticHeaderWindow(
  headers: readonly SyntheticVmHeaderRecord[],
  currentHeight: number,
): void {
  if (headers.length !== HEADER_COUNT) {
    throw new Error(`synthetic VM header window must contain ${HEADER_COUNT} headers`);
  }
  const ids = new Set<string>();
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const raw = header?.raw;
    const expectedHeight = currentHeight - index - 1;
    if (
      !header
      || fixedHex(header.id, 32, `synthetic VM header ${index} id`) !== header.id
      || fixedHex(header.parentId, 32, `synthetic VM header ${index} parent`) !== header.parentId
      || fixedHex(
        header.extensionRootHex,
        32,
        `synthetic VM header ${index} extension root`,
      ) !== header.extensionRootHex
      || header.height !== expectedHeight
      || raw.id !== header.id
      || raw.parentId !== header.parentId
      || raw.height !== header.height
      || raw.extensionHash !== header.extensionRootHex
    ) {
      throw new Error(`synthetic VM header ${index} normalized identity is inconsistent`);
    }
    if (ids.has(header.id)) throw new Error('synthetic VM header IDs must be unique');
    ids.add(header.id);
    if (
      index + 1 < headers.length
      && header.parentId !== headers[index + 1].id
    ) {
      throw new Error(`synthetic VM header ${index} is not parent-linked`);
    }
  }
}

function fixtureHash(label: string): string {
  return createHash('sha256').update(label, 'utf8').digest('hex');
}

function fixedHex(value: string, expectedBytes: number, label: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length !== expectedBytes * 2 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be ${expectedBytes} bytes of hex`);
  }
  return clean.toLowerCase();
}
