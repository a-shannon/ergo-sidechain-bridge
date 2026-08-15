import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  type BigIntStats,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-contract-artifacts.v1' as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1';
const MAX_CONTRACT_BYTES = 128 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const REPORTS = new WeakSet<object>();

const CONTRACTS = Object.freeze({
  tracker: Object.freeze({
    relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
    sourceUrl: new URL(
      '../../contracts/SPVTrackerSubstrateFederatedV1.es',
      import.meta.url,
    ),
    expectedSha256Hex:
      '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852',
  }),
  duplicatePrevention: Object.freeze({
    relativePath:
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
    sourceUrl: new URL(
      '../../contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
      import.meta.url,
    ),
    expectedSha256Hex:
      'a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f',
  }),
  sourceLock: Object.freeze({
    relativePath: 'contracts/MainChainLockPooledReserveV6.es',
    sourceUrl: new URL(
      '../../contracts/MainChainLockPooledReserveV6.es',
      import.meta.url,
    ),
    expectedSha256Hex:
      'f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b',
  }),
  pooledReserve: Object.freeze({
    relativePath:
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
    sourceUrl: new URL(
      '../../contracts/MainChainPooledReserveValidityApplicationV6.es',
      import.meta.url,
    ),
    expectedSha256Hex:
      '44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5',
  }),
} as const);

type ContractRole = keyof typeof CONTRACTS;

interface ContractArtifactIdentityV1 {
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly sha256Hex: string;
}

export interface SubstrateFederatedIsolatedDevnetContractArtifactsV1 {
  readonly receipt: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA;
    readonly version: 1;
    readonly status: 'exact_reviewed_contract_templates_collected';
    readonly receiptDigestHex: string;
    readonly artifacts:
      Readonly<Record<ContractRole, Readonly<ContractArtifactIdentityV1>>>;
    readonly checks: Readonly<{
      readonly fixedRepositoryPathsOnly: true;
      readonly boundedRegularSingleLinkFilesOnly: true;
      readonly stableFileIdentityBeforeAndAfterRead: true;
      readonly strictUtf8AndLfOnlySource: true;
      readonly exactReviewedSha256Matched: true;
      readonly immutableSourceTextReturned: true;
    }>;
    readonly boundaries: Readonly<{
      readonly compilerExecuted: false;
      readonly targetNodeAcceptanceEstablished: false;
      readonly signingAuthorityEstablished: false;
      readonly submissionAuthorityEstablished: false;
      readonly broadcastAuthorityEstablished: false;
      readonly profileActivated: false;
      readonly fundsAuthorityEstablished: false;
      readonly gate5Closed: false;
      readonly trustlessStatusEstablished: false;
      readonly productionReadinessEstablished: false;
    }>;
  }>;
  readonly templates: Readonly<Record<ContractRole, string>>;
}

/** Collects only the four exact reviewed contract templates used by G1dI2. */
export function collectSubstrateFederatedIsolatedDevnetContractArtifactsV1():
  Readonly<SubstrateFederatedIsolatedDevnetContractArtifactsV1> {
  const entries = (Object.keys(CONTRACTS) as ContractRole[]).map(role => {
    const definition = CONTRACTS[role];
    const source = readStableContract(
      definition.sourceUrl,
      definition.expectedSha256Hex,
      definition.relativePath,
    );
    return [role, Object.freeze({
      source,
      identity: Object.freeze({
        relativePath: definition.relativePath,
        sizeBytes: Buffer.byteLength(source, 'utf8'),
        sha256Hex: definition.expectedSha256Hex,
      }),
    })] as const;
  });
  const artifacts = Object.freeze(Object.fromEntries(entries.map(
    ([role, value]) => [role, value.identity],
  )) as Record<ContractRole, Readonly<ContractArtifactIdentityV1>>);
  const templates = Object.freeze(Object.fromEntries(entries.map(
    ([role, value]) => [role, value.source],
  )) as Record<ContractRole, string>);
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CONTRACT_ARTIFACTS_V1_SCHEMA,
    version: 1 as const,
    status: 'exact_reviewed_contract_templates_collected' as const,
    artifacts,
    checks: {
      fixedRepositoryPathsOnly: true as const,
      boundedRegularSingleLinkFilesOnly: true as const,
      stableFileIdentityBeforeAndAfterRead: true as const,
      strictUtf8AndLfOnlySource: true as const,
      exactReviewedSha256Matched: true as const,
      immutableSourceTextReturned: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  const result = Object.freeze({ receipt, templates });
  REPORTS.add(result);
  return result;
}

export function assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetContractArtifactsV1> {
  if (value === null || typeof value !== 'object' || !REPORTS.has(value)) {
    throw new Error('isolated-devnet contract artifacts lack process provenance');
  }
  const result = value as SubstrateFederatedIsolatedDevnetContractArtifactsV1;
  const { receiptDigestHex, ...body } = result.receipt;
  if (
    sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex
  ) {
    throw new Error('isolated-devnet contract artifact receipt drifted');
  }
  for (const role of Object.keys(CONTRACTS) as ContractRole[]) {
    const source = result.templates[role];
    const identity = result.receipt.artifacts[role];
    if (
      typeof source !== 'string'
      || Buffer.byteLength(source, 'utf8') !== identity.sizeBytes
      || sha256(Buffer.from(source, 'utf8')) !== identity.sha256Hex
      || identity.relativePath !== CONTRACTS[role].relativePath
      || identity.sha256Hex !== CONTRACTS[role].expectedSha256Hex
    ) {
      throw new Error(`isolated-devnet ${role} contract artifact drifted`);
    }
  }
}

function readStableContract(
  url: URL,
  expectedSha256Hex: string,
  label: string,
): string {
  const path = fileURLToPath(url);
  const before = lstatSync(path, { bigint: true });
  if (
    !isStableSingleLinkFile(before)
    || realpathSync(path) !== path
    || before.size <= 0n
    || before.size > BigInt(MAX_CONTRACT_BYTES)
  ) {
    throw new Error(`${label} must be one bounded regular single-link file`);
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!sameStableFile(before, after) || BigInt(bytes.byteLength) !== before.size) {
    throw new Error(`${label} changed while it was read`);
  }
  let source: string;
  try {
    source = UTF8.decode(bytes);
  } catch {
    throw new Error(`${label} is not strict UTF-8`);
  }
  if (
    source.length === 0
    || source.includes('\r')
    || !source.endsWith('\n')
    || !Buffer.from(source, 'utf8').equals(bytes)
  ) {
    throw new Error(`${label} is not canonical LF-only UTF-8 source`);
  }
  if (sha256(bytes) !== expectedSha256Hex) {
    throw new Error(`${label} differs from the exact reviewed template`);
  }
  return source;
}

function isStableSingleLinkFile(stat: BigIntStats): boolean {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.dev > 0n
    && stat.ino > 0n;
}

function sameStableFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function falseBoundaries() {
  return Object.freeze({
    compilerExecuted: false as const,
    targetNodeAcceptanceEstablished: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
