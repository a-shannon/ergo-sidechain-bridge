import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeErgoKeySetDigest, computeFamilyId, hexToBytes } from './codecs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V1_ROOT = path.resolve(__dirname, '../..');
const WORKTREE_ROOT = path.resolve(V1_ROOT, '..');
const CONTRACTS_V1_DIR = path.join(V1_ROOT, 'contracts');
const JVM_SOURCE_PATH = path.join(V1_ROOT, 'jvm', 'BridgeJvmTool.java');

// Resolve SigmaState 6.0.2 runtime JARs (env override, v1/jvm Maven cache, worktree, or sibling checkout)
function resolveLockedRuntimeDir(): string {
  const candidates = [
    process.env.BRIDGE_SIGMA_JARS_DIR,
    path.join(V1_ROOT, 'jvm', 'target', 'dependency'),
    path.join(
      WORKTREE_ROOT,
      'relayer',
      'tools',
      'authenticated-v2-compiler',
      'target',
      'locked-runtime',
    ),
    path.resolve(
      WORKTREE_ROOT,
      '..',
      '..',
      'repository',
      'relayer',
      'tools',
      'authenticated-v2-compiler',
      'target',
      'locked-runtime',
    ),
  ].filter((v): v is string => Boolean(v));
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.includes('sigma-state'))) {
      return dir;
    }
  }
  throw new Error(
    `SigmaState 6.0.2 runtime JARs not found. Set BRIDGE_SIGMA_JARS_DIR or run: mvn -B -f v1/jvm/pom.xml dependency:copy-dependencies`,
  );
}

function ensureJvmClassesDir(): { classesDir: string; classpath: string } {
  const jarsDir = resolveLockedRuntimeDir();
  const srcBytes = fs.readFileSync(JVM_SOURCE_PATH);
  const srcHash = crypto.createHash('sha256').update(srcBytes).digest('hex').slice(0, 16);
  const classesDir =
    process.env.BRIDGE_V1_JVM_CLASSES_DIR ??
    path.join(os.tmpdir(), `ergo-bridge-v1-jvm-${srcHash}`);
  const classFile = path.join(
    classesDir,
    'org',
    'ergoplatform',
    'bridge',
    'v1',
    'BridgeJvmTool.class',
  );
  const hashMarkerFile = path.join(classesDir, '.src-sha256');
  const precompiledHashMatches =
    fs.existsSync(classFile) &&
    fs.existsSync(hashMarkerFile) &&
    fs.readFileSync(hashMarkerFile, 'utf8').trim() === srcHash;
  const needsCompile =
    !precompiledHashMatches &&
    (!fs.existsSync(classFile) ||
      fs.statSync(classFile).mtimeMs < fs.statSync(JVM_SOURCE_PATH).mtimeMs);
  if (needsCompile) {
    // Compile into a private staging dir first, then atomically copy to prevent concurrent races
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ergo-bridge-v1-javac-'));
    try {
      execFileSync('javac', ['-cp', path.join(jarsDir, '*'), '-d', stagingDir, JVM_SOURCE_PATH], {
        stdio: 'pipe',
      });
      fs.mkdirSync(path.dirname(classFile), { recursive: true });
      const stagedPkgDir = path.join(stagingDir, 'org', 'ergoplatform', 'bridge', 'v1');
      for (const file of fs.readdirSync(stagedPkgDir)) {
        fs.copyFileSync(path.join(stagedPkgDir, file), path.join(path.dirname(classFile), file));
      }
      fs.writeFileSync(hashMarkerFile, srcHash, 'utf8');
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }
  const sep = process.platform === 'win32' ? ';' : ':';
  return {
    classesDir,
    classpath: `${classesDir}${sep}${path.join(jarsDir, '*')}`,
  };
}

export interface CompiledContract {
  name: string;
  ergoTreeHex: string;
  contractIdHex: string;
  sha256Hex: string;
  byteLength: number;
  source: string;
}

export interface BridgeV1FamilyParams {
  networkPrefix: 0 | 16; // 0 = mainnet, 16 = testnet/devnet
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  bridgeAddressHex: string;
  tokenAddressHex: string;
  trackerNftIdHex: string;
  dupNftIdHex: string;
  reserveNftIdHex: string;
  committeePubKeysHex: string[];
  committeeThreshold: number;
  committeeEpoch: bigint;
  escapeTimeoutBlocks: number;
  minConfirmations: bigint;
  upgradeTimelockBlocks: bigint;
  maxAdmissionLagBlocks: bigint;
  /** Minimum peg-in deposit amount in nanoERG (defaults to 10_000_000n = 0.01 ERG) */
  minDepositNanoErg?: bigint;
  /** Minimum box age in blocks before zero-top-up permissionless rentRefresh (defaults to 525_600) */
  minRefreshAgeBlocks?: number;
}

export interface CompiledBridgeFamily {
  familyIdHex: string;
  ergoKeySetDigestHex: string;
  params: BridgeV1FamilyParams & {
    minDepositNanoErg: bigint;
    minRefreshAgeBlocks: number;
  };
  depositLock: CompiledContract;
  dup: CompiledContract;
  tracker: CompiledContract;
  reserve: CompiledContract;
}

function renderTemplate(templateName: string, replacements: Record<string, string>): string {
  const raw = fs
    .readFileSync(path.join(CONTRACTS_V1_DIR, templateName), 'utf8')
    .replace(/\r\n/g, '\n');
  let out = raw;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }
  const leftover = out.match(/BRIDGE_V1_[A-Z0-9_]+_PLACEHOLDER/);
  if (leftover) {
    throw new Error(`Unresolved placeholder ${leftover[0]} in ${templateName}`);
  }
  return out;
}

function validateCommitteeKeysAndThreshold(pubKeysHex: string[], threshold: number): string[] {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > pubKeysHex.length) {
    throw new Error(`Invalid committee threshold ${threshold}/${pubKeysHex.length}`);
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawPk of pubKeysHex) {
    const bytes = hexToBytes(rawPk, 33);
    // Reject identity point (00..00) and require canonical compressed SEC1 prefix 0x02 or 0x03
    if (bytes[0] !== 0x02 && bytes[0] !== 0x03) {
      throw new Error(`Committee pubkey must have compressed secp256k1 prefix 0x02 or 0x03`);
    }
    if (bytes.slice(1).every((b) => b === 0)) {
      throw new Error('Committee pubkey x-coordinate must be non-zero');
    }
    const lower = rawPk.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate committee pubkey detected: ${lower}`);
    }
    seen.add(lower);
    normalized.push(lower);
  }
  return normalized;
}

function formatCommitteeSigmaProps(pubKeysHex: string[], threshold: number): string {
  const normalized = validateCommitteeKeysAndThreshold(pubKeysHex, threshold);
  return normalized
    .map((pk) => `proveDlog(decodePoint(fromBase16("${pk}")))`)
    .join(',\n    ');
}

export function compileSourcesJvm(
  networkPrefix: 0 | 16,
  units: Array<{ name: string; source: string }>,
): CompiledContract[] {
  const { classpath } = ensureJvmClassesDir();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ergo-bridge-v1-compile-'));
  try {
    const filePaths = units.map((u) => {
      const p = path.join(tmpDir, `${u.name}.es`);
      fs.writeFileSync(p, u.source, 'utf8');
      return p;
    });
    const stdout = execFileSync(
      'java',
      [
        '-cp',
        classpath,
        'org.ergoplatform.bridge.v1.BridgeJvmTool',
        'compile-batch',
        String(networkPrefix),
        ...filePaths,
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length !== units.length) {
      throw new Error(`Expected ${units.length} JVM compile results, got ${lines.length}`);
    }
    return lines.map((line, i) => {
      const parsed = JSON.parse(line) as {
        ok: boolean;
        ergoTreeHex?: string;
        contractIdHex?: string;
        sha256Hex?: string;
        byteLength?: number;
        error?: string;
      };
      if (!parsed.ok || !parsed.ergoTreeHex || !parsed.contractIdHex || !parsed.sha256Hex) {
        throw new Error(`Failed compiling ${units[i].name}: ${parsed.error ?? 'unknown error'}`);
      }
      return {
        name: units[i].name,
        ergoTreeHex: parsed.ergoTreeHex,
        contractIdHex: parsed.contractIdHex,
        sha256Hex: parsed.sha256Hex,
        byteLength: parsed.byteLength ?? parsed.ergoTreeHex.length / 2,
        source: units[i].source,
      };
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function compileBridgeV1Family(params: BridgeV1FamilyParams): CompiledBridgeFamily {
  const minDepositNanoErg = params.minDepositNanoErg ?? 10_000_000n;
  const minRefreshAgeBlocks = params.minRefreshAgeBlocks ?? 525_600;

  // Parameter safety invariants ([M-4])
  if (!Number.isInteger(params.escapeTimeoutBlocks) || params.escapeTimeoutBlocks <= 0) {
    throw new Error('escapeTimeoutBlocks must be a positive integer');
  }
  if (minDepositNanoErg < 1_000_000n) {
    throw new Error('minDepositNanoErg must be >= 1_000_000 nanoERG');
  }
  if (!Number.isInteger(minRefreshAgeBlocks) || minRefreshAgeBlocks < 0) {
    throw new Error('minRefreshAgeBlocks must be a non-negative integer');
  }
  if (params.maxAdmissionLagBlocks < 0n) {
    throw new Error('maxAdmissionLagBlocks must be >= 0');
  }
  if (params.minConfirmations <= params.maxAdmissionLagBlocks) {
    throw new Error(
      `minConfirmations (${params.minConfirmations}) must exceed maxAdmissionLagBlocks (${params.maxAdmissionLagBlocks}) to guarantee >= 1 real confirmation`,
    );
  }
  if (params.upgradeTimelockBlocks <= params.maxAdmissionLagBlocks) {
    throw new Error(
      `upgradeTimelockBlocks (${params.upgradeTimelockBlocks}) must exceed maxAdmissionLagBlocks (${params.maxAdmissionLagBlocks}) to guarantee a non-zero timelock`,
    );
  }
  const nfts = [
    params.trackerNftIdHex.toLowerCase(),
    params.dupNftIdHex.toLowerCase(),
    params.reserveNftIdHex.toLowerCase(),
  ];
  if (new Set(nfts).size !== 3) {
    throw new Error('trackerNftId, dupNftId, and reserveNftId must be pairwise distinct');
  }

  const normalizedPubKeys = validateCommitteeKeysAndThreshold(
    params.committeePubKeysHex,
    params.committeeThreshold,
  );
  const familyIdHex = computeFamilyId(params);
  const ergoKeySetDigestHex = computeErgoKeySetDigest(
    params.committeeThreshold,
    normalizedPubKeys,
  );

  const commonEntries: Array<[string, string]> = [
    ['BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER', params.sourceNetworkIdHex.toLowerCase()],
    ['BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER', params.sidechainIdHex.toLowerCase()],
    ['BRIDGE_V1_BRIDGE_ADDRESS_PLACEHOLDER', params.bridgeAddressHex.toLowerCase().replace(/^0x/, '')],
    ['BRIDGE_V1_TOKEN_ADDRESS_PLACEHOLDER', params.tokenAddressHex.toLowerCase().replace(/^0x/, '')],
    ['BRIDGE_V1_FAMILY_ID_PLACEHOLDER', familyIdHex],
    ['BRIDGE_V1_RESERVE_NFT_ID_PLACEHOLDER', params.reserveNftIdHex.toLowerCase()],
    ['BRIDGE_V1_DUP_NFT_ID_PLACEHOLDER', params.dupNftIdHex.toLowerCase()],
    ['BRIDGE_V1_TRACKER_NFT_ID_PLACEHOLDER', params.trackerNftIdHex.toLowerCase()],
    ['BRIDGE_V1_ESCAPE_TIMEOUT_PLACEHOLDER', String(params.escapeTimeoutBlocks)],
    ['BRIDGE_V1_MIN_DEPOSIT_NANOERG_PLACEHOLDER', `${minDepositNanoErg}L`],
    ['BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER', String(minRefreshAgeBlocks)],
    ['BRIDGE_V1_MIN_CONFIRMATIONS_PLACEHOLDER', `${params.minConfirmations}L`],
    ['BRIDGE_V1_ERGO_KEY_SET_DIGEST_PLACEHOLDER', ergoKeySetDigestHex],
    ['BRIDGE_V1_COMMITTEE_EPOCH_PLACEHOLDER', `${params.committeeEpoch}L`],
    ['BRIDGE_V1_UPGRADE_TIMELOCK_BLOCKS_PLACEHOLDER', `${params.upgradeTimelockBlocks}L`],
    ['BRIDGE_V1_MAX_ADMISSION_LAG_PLACEHOLDER', `${params.maxAdmissionLagBlocks}L`],
    ['BRIDGE_V1_COMMITTEE_THRESHOLD_PLACEHOLDER', String(params.committeeThreshold)],
    [
      'BRIDGE_V1_COMMITTEE_SIGMAPROPS_PLACEHOLDER',
      formatCommitteeSigmaProps(normalizedPubKeys, params.committeeThreshold),
    ],
  ];
  const common: Record<string, string> = Object.fromEntries(commonEntries);

  // Stage 1: compile DepositLock, Dup, Tracker in a single JVM batch
  const stage1 = compileSourcesJvm(params.networkPrefix, [
    { name: 'BridgeDepositLock', source: renderTemplate('BridgeDepositLock.es', common) },
    { name: 'BridgeDup', source: renderTemplate('BridgeDup.es', common) },
    { name: 'BridgeTracker', source: renderTemplate('BridgeTracker.es', common) },
  ]);
  const [depositLock, dup, tracker] = stage1;

  // Stage 2: compile Reserve binding exact DepositLock and Dup contract IDs
  const reserveSource = renderTemplate('BridgeReserve.es', {
    ...common,
    BRIDGE_V1_DUP_CONTRACT_ID_PLACEHOLDER: dup.contractIdHex,
    BRIDGE_V1_DEPOSIT_LOCK_CONTRACT_ID_PLACEHOLDER: depositLock.contractIdHex,
  });
  const [reserve] = compileSourcesJvm(params.networkPrefix, [
    { name: 'BridgeReserve', source: reserveSource },
  ]);

  return {
    familyIdHex,
    ergoKeySetDigestHex,
    params: {
      ...params,
      committeePubKeysHex: normalizedPubKeys,
      minDepositNanoErg,
      minRefreshAgeBlocks,
    },
    depositLock,
    dup,
    tracker,
    reserve,
  };
}

/**
 * Compile a successor BridgeTracker contract for a rotated committee epoch.
 * BridgeDup and BridgeReserve remain 100% untouched.
 */
export function compileRotatedTracker(
  base: CompiledBridgeFamily,
  nextCommittee: {
    pubKeysHex: string[];
    threshold: number;
    epoch: bigint;
    upgradeTimelockBlocks?: bigint;
    maxAdmissionLagBlocks?: bigint;
    minRefreshAgeBlocks?: number;
  },
): { tracker: CompiledContract; ergoKeySetDigestHex: string } {
  const normalizedPubKeys = validateCommitteeKeysAndThreshold(
    nextCommittee.pubKeysHex,
    nextCommittee.threshold,
  );
  const timelock = nextCommittee.upgradeTimelockBlocks ?? base.params.upgradeTimelockBlocks;
  const maxLag = nextCommittee.maxAdmissionLagBlocks ?? base.params.maxAdmissionLagBlocks;
  const minRefresh = nextCommittee.minRefreshAgeBlocks ?? base.params.minRefreshAgeBlocks;
  if (maxLag < 0n) {
    throw new Error(`Rotated maxAdmissionLagBlocks (${maxLag}) must be >= 0`);
  }
  if (!Number.isInteger(minRefresh) || minRefresh < 0) {
    throw new Error(`Rotated minRefreshAgeBlocks (${minRefresh}) must be a non-negative integer`);
  }
  if (timelock <= maxLag) {
    throw new Error(`Rotated upgradeTimelockBlocks (${timelock}) must exceed maxAdmissionLagBlocks (${maxLag})`);
  }
  const ergoKeySetDigestHex = computeErgoKeySetDigest(
    nextCommittee.threshold,
    normalizedPubKeys,
  );
  const src = renderTemplate('BridgeTracker.es', {
    BRIDGE_V1_TRACKER_NFT_ID_PLACEHOLDER: base.params.trackerNftIdHex.toLowerCase(),
    BRIDGE_V1_FAMILY_ID_PLACEHOLDER: base.familyIdHex,
    BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER: base.params.sourceNetworkIdHex.toLowerCase(),
    BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER: base.params.sidechainIdHex.toLowerCase(),
    BRIDGE_V1_ERGO_KEY_SET_DIGEST_PLACEHOLDER: ergoKeySetDigestHex,
    BRIDGE_V1_COMMITTEE_EPOCH_PLACEHOLDER: `${nextCommittee.epoch}L`,
    BRIDGE_V1_UPGRADE_TIMELOCK_BLOCKS_PLACEHOLDER: `${timelock}L`,
    BRIDGE_V1_MAX_ADMISSION_LAG_PLACEHOLDER: `${maxLag}L`,
    BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER: String(minRefresh),
    BRIDGE_V1_COMMITTEE_THRESHOLD_PLACEHOLDER: String(nextCommittee.threshold),
    BRIDGE_V1_COMMITTEE_SIGMAPROPS_PLACEHOLDER: formatCommitteeSigmaProps(
      normalizedPubKeys,
      nextCommittee.threshold,
    ),
  });
  const [tracker] = compileSourcesJvm(base.params.networkPrefix, [
    { name: `BridgeTracker_epoch${nextCommittee.epoch}`, source: src },
  ]);
  return { tracker, ergoKeySetDigestHex };
}

export function renderStarkTrackerSource(
  base: CompiledBridgeFamily,
  stark: {
    programIdHex: string;
    profileIdHex: string;
    maxAdmissionLagBlocks?: bigint;
    minRefreshAgeBlocks?: number;
  },
): string {
  const maxLag = stark.maxAdmissionLagBlocks ?? base.params.maxAdmissionLagBlocks;
  const minRefresh = stark.minRefreshAgeBlocks ?? base.params.minRefreshAgeBlocks;
  if (maxLag < 0n) {
    throw new Error(`STARK maxAdmissionLagBlocks (${maxLag}) must be >= 0`);
  }
  if (!Number.isInteger(minRefresh) || minRefresh < 0) {
    throw new Error(`STARK minRefreshAgeBlocks (${minRefresh}) must be a non-negative integer`);
  }
  return renderTemplate('BridgeTrackerStark.es', {
    BRIDGE_V1_TRACKER_NFT_ID_PLACEHOLDER: base.params.trackerNftIdHex.toLowerCase(),
    BRIDGE_V1_FAMILY_ID_PLACEHOLDER: base.familyIdHex,
    BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER: base.params.sourceNetworkIdHex.toLowerCase(),
    BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER: base.params.sidechainIdHex.toLowerCase(),
    BRIDGE_V1_STARK_PROGRAM_ID_PLACEHOLDER: stark.programIdHex.toLowerCase(),
    BRIDGE_V1_STARK_PROFILE_ID_PLACEHOLDER: stark.profileIdHex.toLowerCase(),
    BRIDGE_V1_MAX_ADMISSION_LAG_PLACEHOLDER: `${maxLag}L`,
    BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER: String(minRefresh),
  });
}

// ============================================================================
// SigmaState 6.0.2 JVM Transaction Verification Batch Runner
// ============================================================================

export interface JvmVerifyCase {
  id: string;
  height: number;
  txBytesHex: string;
  inputBoxesBytesHex: string[];
  dataBoxesBytesHex?: string[];
}

export interface JvmVerifyInputResult {
  index: number;
  passed: boolean;
  cost: number;
  error: string | null;
}

export interface JvmVerifyResult {
  id: string;
  ok: boolean;
  txId?: string;
  messageToSignHex?: string;
  totalCost?: number;
  allPassed: boolean;
  inputs?: JvmVerifyInputResult[];
  error?: string;
}

export function verifyTransactionsJvm(cases: JvmVerifyCase[]): JvmVerifyResult[] {
  const { classpath } = ensureJvmClassesDir();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ergo-bridge-v1-verify-'));
  try {
    const reqPath = path.join(tmpDir, 'batch.tsv');
    const lines = cases.map((c) =>
      [
        c.id,
        String(c.height),
        c.txBytesHex,
        c.inputBoxesBytesHex.join(','),
        (c.dataBoxesBytesHex ?? []).join(','),
      ].join('\t'),
    );
    fs.writeFileSync(reqPath, `${lines.join('\n')}\n`, 'utf8');
    const stdout = execFileSync(
      'java',
      ['-cp', classpath, 'org.ergoplatform.bridge.v1.BridgeJvmTool', 'verify-batch', reqPath],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as JvmVerifyResult);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
