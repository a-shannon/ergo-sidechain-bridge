/**
 * Compile ErgoScript contracts via the Ergo node API.
 * 
 * Reads .es files from contracts/, compiles each via /script/p2sAddress,
 * and saves the compiled output to contracts/compiled_contracts.json.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  CHECK_ONLY_COMMITTEE_THRESHOLD,
  createCommitteeConfigFromState,
  createCommitteeConfig,
  injectCommitteePlaceholders,
  type CommitteeConfig,
} from '../committee-config.js';
import {
  bindCompiledContractIdentity,
  deriveCompiledErgoTreeHashHex,
} from './compiled-contract-identity.js';
import {
  createContractsCheckNodeClient,
  type ContractCompilerClient,
} from './contracts-check-node-client.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerFixture,
} from '../substrate-federated-settlement-family-v1-fixture.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
} from '../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_PATH,
  buildSubstrateFederatedTrackerCompilerRequestV1,
  resolveSubstrateFederatedTrackerCompilerSourceV1,
  validatePinnedSubstrateFederatedTrackerCompilerFixtureV1,
} from '../substrate-federated-tracker-compiler-v1.js';
import {
  resolveSubstrateFederatedSettlementFamilyV1Sources,
  validateSubstrateFederatedSettlementFamilyV1CompilerBatch,
} from '../substrate-federated-settlement-family-v1.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = resolve(__dirname, '../../../contracts');
const OUTPUT_PATH = resolve(CONTRACTS_DIR, 'compiled_contracts.json');
const DEPLOYED_STATE_PATH = resolve(CONTRACTS_DIR, 'deployed_state.json');
const FEDERATED_TRACKER_FILENAME = 'SPVTrackerSubstrateFederatedV1.es';
const FEDERATED_TRACKER_VECTOR_PATH = resolve(
  CONTRACTS_DIR,
  '../relayer/test-vectors/substrate-federated-v1-tracker-admission.json',
);
const FEDERATED_TRACKER_IDENTITY_PATH = resolve(
  CONTRACTS_DIR,
  '../relayer/test-vectors/substrate-federated-v1-tracker-contract.json',
);
const FEDERATED_TRACKER_VECTOR_SHA256 =
  '87b1db594810e8e21f4132ed51ee929dde6a07cce9f690ec8bba2fc90c57f5be';
const FEDERATED_TRACKER_IDENTITY_SHA256 =
  '65bdfbb30e6dfcba087689761415600b92fadf945a795f6046176110332ae5cd';
type FederatedSettlementRole =
  | 'duplicatePrevention'
  | 'sourceLock'
  | 'pooledReserve';
const FEDERATED_SETTLEMENT_FAMILY_FILES = new Map<
string,
FederatedSettlementRole
>([
  ['DoubleUnlockPreventionSubstrateFederatedV1.es', 'duplicatePrevention'],
  ['MainChainLockPooledReserveV6.es', 'sourceLock'],
  ['MainChainPooledReserveValidityApplicationV6.es', 'pooledReserve'],
]);
const FEDERATED_SETTLEMENT_FAMILY_BATCH_PATH = resolve(
  CONTRACTS_DIR,
  '../relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json',
);
const CHECK_ONLY = process.argv.includes('--check') || process.argv.includes('--dry-run');
const CHECK_ONLY_TRACKER_NFT_ID = `${'0'.repeat(62)}01`;
const CHECK_ONLY_DUP_NFT_ID = `${'0'.repeat(62)}02`;
const CHECK_ONLY_SCS_NFT_ID = `${'0'.repeat(62)}03`;
const CHECK_ONLY_SETTLEMENT_VAULT_ERGOTREE = `0008cd02${'11'.repeat(32)}`;
const CHECK_ONLY_CAUSAL_SOURCE_NETWORK_ID = '33'.repeat(32);
const CHECK_ONLY_AUTHENTICATED_UNLOCK_HASH = 'aa'.repeat(32);

interface CompiledContract {
  name: string;
  sourceFile: string;
  address: string;
  ergoTreeHex: string;
  compiledAt: string;
}

const CONTRACT_FILES = [
  'SideChainState.es',
  'DoubleUnlockPrevention.es',
  'DoubleUnlockPreventionAggregate.es',
  'DoubleUnlockPreventionAuthenticated.es',
  'DoubleUnlockPreventionAggregateBatch.es',
  'SPVTracker.es',
  'SPVTrackerAuthenticated.es',
  FEDERATED_TRACKER_FILENAME,
  ...FEDERATED_SETTLEMENT_FAMILY_FILES.keys(),
  'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
  'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
  'MainChainLock.es',
  'MainChainCausalVaultV2.es',
  'DoubleUnlockPreventionCausalV2.es',
  'MainChainLockCausalV2.es',
  'MainChainUnlock.es',
  'MainChainAggregateUnlockTrustless.es',
  'MainChainAggregateUnlockAuthenticated.es',
  'MainChainAggregateUnlockBatch.es',
];

const AGGREGATE_UNLOCK_PLACEHOLDER_FILES = new Set([
  'MainChainAggregateUnlockBatch.es',
  'MainChainAggregateUnlockTrustless.es',
  'MainChainAggregateUnlockAuthenticated.es',
  'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
  'MainChainCausalVaultV2.es',
]);
const CAUSAL_CANDIDATE_FILES = new Set([
  'MainChainCausalVaultV2.es',
  'DoubleUnlockPreventionCausalV2.es',
  'MainChainLockCausalV2.es',
]);
const EXTERNAL_FEE_CANDIDATE_FILES = new Set([
  'MainChainAggregateUnlockAuthenticatedExternalFeeV1.es',
  'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
]);

function readJson(path: string): any {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function readPinnedJson(path: string, expectedSha256: string, label: string): any {
  const bytes = readFileSync(path);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(label + ' SHA-256 mismatch: ' + actualSha256);
  }
  return JSON.parse(bytes.toString('ascii'));
}

export function prepareCheckOnlyFederatedTrackerSource(rawSource: string): string {
  const vector = readPinnedJson(
    FEDERATED_TRACKER_VECTOR_PATH,
    FEDERATED_TRACKER_VECTOR_SHA256,
    'federated tracker vector',
  );
  const identity = readPinnedJson(
    FEDERATED_TRACKER_IDENTITY_PATH,
    FEDERATED_TRACKER_IDENTITY_SHA256,
    'federated tracker identity',
  );
  if (
    vector?.schema !== 'e2s.substrate-federated-v1-tracker-admission.golden-vector'
    || vector?.version !== 1
    || identity?.schema !== 'e2s.substrate-federated-v1-tracker-contract'
    || identity?.version !== 1
  ) {
    throw new Error('federated tracker check-only inputs have unsupported identities');
  }
  const profile = vector.input?.profile;
  const statement = vector.input?.statement;
  const tracker = vector.input?.tracker;
  const request = buildSubstrateFederatedTrackerCompilerRequestV1({
    template: {
      relativePath: SUBSTRATE_FEDERATED_TRACKER_TEMPLATE_PATH,
      source: rawSource,
    },
    trackerGenesisInputBoxIdHex: tracker?.trackerNftIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(profile),
    application: {
      sourceNetworkIdHex: statement?.sourceNetworkIdHex,
      sidechainIdHex: statement?.sidechainIdHex,
      bridgeAddressHex: statement?.bridgeAddressHex,
      tokenAddressHex: statement?.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: statement?.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: statement?.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: statement?.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: statement?.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: statement?.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: statement?.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: statement?.runtimeProfileIdHex,
      settlementProfileIdHex: statement?.settlementProfileIdHex,
    },
  });
  validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
    request,
    contractIdentity: identity,
  });
  return resolveSubstrateFederatedTrackerCompilerSourceV1(request);
}

let federatedSettlementCheckOnly:
ReturnType<typeof loadCheckOnlyFederatedSettlementFamily> | undefined;

function loadCheckOnlyFederatedSettlementFamily() {
  const request =
    buildSubstrateFederatedSettlementFamilyV1CompilerFixture();
  const compilerBatchJson = readFileSync(
    FEDERATED_SETTLEMENT_FAMILY_BATCH_PATH,
    'ascii',
  );
  const identity =
    validateSubstrateFederatedSettlementFamilyV1CompilerBatch({
      request,
      compilerBatchJson,
    });
  const sources =
    resolveSubstrateFederatedSettlementFamilyV1Sources(request);
  return Object.freeze({ request, identity, sources });
}

export function prepareCheckOnlyFederatedSettlementFamilySource(
  filename: string,
  rawSource: string,
): string {
  const role = FEDERATED_SETTLEMENT_FAMILY_FILES.get(filename);
  if (role === undefined) {
    throw new Error('unknown federated settlement-family contract');
  }
  federatedSettlementCheckOnly ??= loadCheckOnlyFederatedSettlementFamily();
  const contract = federatedSettlementCheckOnly.request.contracts.find(
    candidate => candidate.role === role,
  );
  if (contract === undefined) {
    throw new Error('federated settlement-family compiler request is incomplete');
  }
  const templateSha256 = createHash('sha256')
    .update(Buffer.from(rawSource, 'utf8'))
    .digest('hex');
  if (templateSha256 !== contract.templateSha256Hex) {
    throw new Error(
      role + ' federated settlement template SHA-256 mismatch: '
        + templateSha256,
    );
  }
  return federatedSettlementCheckOnly.sources[role];
}

let committeeConfigPromise: Promise<CommitteeConfig> | null = null;

async function resolveCommitteeConfig(): Promise<CommitteeConfig> {
  if (committeeConfigPromise) return committeeConfigPromise;

  committeeConfigPromise = (async () => {
    if (CHECK_ONLY) {
      return createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, CHECK_ONLY_COMMITTEE_THRESHOLD);
    }

    const envPubKeyInput =
      process.env.COMMITTEE_PUBKEY_HEXES?.trim() ||
      process.env.COMMITTEE_PUBKEY_HEX?.trim();
    const deployed = readJson(DEPLOYED_STATE_PATH);
    const statePubKey = typeof deployed?.relayer?.publicKey === 'string'
      ? deployed.relayer.publicKey.trim().toLowerCase()
      : undefined;

    if (envPubKeyInput || deployed?.committee || statePubKey) {
      return createCommitteeConfigFromState(statePubKey ?? '', deployed);
    }

    {
      const { getSignerKeys } = await import('../fleet-signer.js');
      return createCommitteeConfigFromState((await getSignerKeys()).pubKeyHex.toLowerCase(), deployed);
    }
  })();

  return committeeConfigPromise;
}

async function prepareSource(
  filename: string,
  rawSource: string,
  compiledThisRun: Readonly<Record<string, CompiledContract>>,
): Promise<string | null> {
  let source = rawSource;

  if (filename === FEDERATED_TRACKER_FILENAME) {
    if (!CHECK_ONLY) {
      console.warn('   ' + filename + ' is a non-deployed federated candidate and is check-only.');
      console.warn('   Skipping - federated tracker compilation cannot mutate deployment output.');
      return null;
    }
    return prepareCheckOnlyFederatedTrackerSource(rawSource);
  }

  if (FEDERATED_SETTLEMENT_FAMILY_FILES.has(filename)) {
    if (!CHECK_ONLY) {
      console.warn('   ' + filename + ' is a non-deployed federated candidate and is check-only.');
      console.warn('   Skipping - federated settlement compilation cannot mutate deployment output.');
      return null;
    }
    return prepareCheckOnlyFederatedSettlementFamilySource(
      filename,
      rawSource,
    );
  }

  if (
    !CHECK_ONLY
    && (CAUSAL_CANDIDATE_FILES.has(filename)
      || EXTERNAL_FEE_CANDIDATE_FILES.has(filename))
  ) {
    console.warn(`   ${filename} is a non-deployed candidate and is check-only.`);
    console.warn('   Skipping - candidate compilation cannot mutate compiled deployment output.');
    return null;
  }

  if (filename === 'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es') {
    const unlockTree =
      compiledThisRun.MainChainAggregateUnlockAuthenticatedExternalFeeV1?.ergoTreeHex;
    if (!unlockTree) {
      throw new Error(
        'DoubleUnlockPreventionAuthenticatedExternalFeeV1 requires its unlock ErgoTree from the same compile run',
      );
    }
    const unlockHash = deriveCompiledErgoTreeHashHex(
      unlockTree,
      'external-fee unlock compiled ErgoTree',
    );
    source = source
      .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', CHECK_ONLY_TRACKER_NFT_ID)
      .replaceAll(
        'AUTHENTICATED_EXTERNAL_FEE_UNLOCK_HASH_PLACEHOLDER',
        unlockHash,
      );
  }

  if (filename === 'DoubleUnlockPreventionAuthenticated.es') {
    if (CHECK_ONLY) {
      source = source
        .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', CHECK_ONLY_TRACKER_NFT_ID)
        .replaceAll('AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER', CHECK_ONLY_AUTHENTICATED_UNLOCK_HASH);
    } else {
      const deployed = readJson(DEPLOYED_STATE_PATH);
      const trackerNftId =
        process.env.TRACKER_AUTHENTICATED_NFT_ID?.trim() ||
        deployed?.spvTrackerAuthenticated?.nftId;
      const unlockHash = process.env.AUTHENTICATED_UNLOCK_ERGOTREE_HASH?.trim();
      if (!trackerNftId || !unlockHash) {
        console.warn('   DoubleUnlockPreventionAuthenticated.es requires the V2 tracker NFT and unlock ErgoTree hash.');
        console.warn('   Requires TRACKER_AUTHENTICATED_NFT_ID and AUTHENTICATED_UNLOCK_ERGOTREE_HASH');
        console.warn('   Skipping - dummy trust bindings are never written outside --check mode.');
        return null;
      }
      source = source
        .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', trackerNftId)
        .replaceAll('AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER', unlockHash);
    }
  }

  if (filename === 'DoubleUnlockPreventionCausalV2.es') {
    const causalVaultTree = compiledThisRun.MainChainCausalVaultV2?.ergoTreeHex;
    if (!causalVaultTree) {
      throw new Error(
        'DoubleUnlockPreventionCausalV2 requires MainChainCausalVaultV2 from the same compile run',
      );
    }
    const causalVaultHash = deriveCompiledErgoTreeHashHex(
      causalVaultTree,
      'causal vault compiled ErgoTree',
    );
    source = source
      .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', CHECK_ONLY_TRACKER_NFT_ID)
      .replaceAll('CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER', causalVaultHash);
  }

  if (
    source.includes('COMMITTEE_SIGMAPROP_PLACEHOLDERS') ||
    source.includes('COMMITTEE_PK_HEX_PLACEHOLDER') ||
    source.includes('COMMITTEE_THRESHOLD_PLACEHOLDER')
  ) {
    const committee = await resolveCommitteeConfig();
    source = injectCommitteePlaceholders(source, committee);
  }

  if (
    source.includes('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER') ||
    source.includes('CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER')
  ) {
    const causalVaultTree = compiledThisRun.MainChainCausalVaultV2?.ergoTreeHex;
    if (!causalVaultTree) {
      throw new Error(
        'MainChainLockCausalV2 requires MainChainCausalVaultV2 from the same compile run',
      );
    }
    source = source
      .replaceAll('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER', causalVaultTree)
      .replaceAll(
        'CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER',
        CHECK_ONLY_CAUSAL_SOURCE_NETWORK_ID,
      );
  }

  if (source.includes('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER')) {
    if (CHECK_ONLY) {
      source = source.replaceAll(
        'SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER',
        CHECK_ONLY_SETTLEMENT_VAULT_ERGOTREE,
      );
    } else {
      const deployed = readJson(DEPLOYED_STATE_PATH);
      const settlementVaultTree =
        process.env.SETTLEMENT_VAULT_ERGOTREE_HEX?.trim() ||
        deployed?.mainChainAggregateUnlockTrustless?.ergoTreeHex;
      if (!settlementVaultTree) {
        console.warn('   MainChainLock.es requires the canonical V2 settlement-vault ErgoTree.');
        console.warn('   Requires: mainChainAggregateUnlockTrustless.ergoTreeHex in deployed_state.json');
        console.warn('   (or SETTLEMENT_VAULT_ERGOTREE_HEX)');
        console.warn('   Skipping - will not compile an unrestricted MainChainLock committee path.');
        return null;
      }
      source = source.replaceAll(
        'SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER',
        settlementVaultTree,
      );
    }
  }

  if (filename !== 'MainChainUnlock.es' && !AGGREGATE_UNLOCK_PLACEHOLDER_FILES.has(filename)) return source;

  if (AGGREGATE_UNLOCK_PLACEHOLDER_FILES.has(filename)) {
    if (CHECK_ONLY) {
      source = source
        .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', CHECK_ONLY_TRACKER_NFT_ID)
        .replaceAll('DUP_NFT_ID_PLACEHOLDER', CHECK_ONLY_DUP_NFT_ID);
      return source;
    }
    // Non-check mode: require real NFT IDs from deployed_state or env
    const deployed = readJson(DEPLOYED_STATE_PATH);
    const authenticated = filename === 'MainChainAggregateUnlockAuthenticated.es';
    const trackerNftId = authenticated
      ? process.env.TRACKER_AUTHENTICATED_NFT_ID?.trim() || deployed?.spvTrackerAuthenticated?.nftId
      : process.env.TRACKER_NFT_ID?.trim() || deployed?.spvTracker?.nftId;
    // Batch and trustless aggregate unlock contracts authenticate different
    // DUP singletons, so keep their NFT sources explicit.
    const dupNftId = filename === 'MainChainAggregateUnlockBatch.es'
      ? process.env.DUP_AGGREGATE_BATCH_NFT_ID?.trim() || deployed?.doubleUnlockPreventionAggregateBatch?.nftId
      : authenticated
        ? process.env.DUP_AUTHENTICATED_NFT_ID?.trim() || deployed?.doubleUnlockPreventionAuthenticated?.nftId
        : process.env.DUP_AGGREGATE_NFT_ID?.trim() || deployed?.doubleUnlockPreventionAggregate?.nftId;
    if (!trackerNftId || !dupNftId) {
      const trackerSource = authenticated
        ? 'spvTrackerAuthenticated.nftId'
        : 'spvTracker.nftId';
      const trackerEnv = authenticated
        ? 'TRACKER_AUTHENTICATED_NFT_ID'
        : 'TRACKER_NFT_ID';
      const dupSource = filename === 'MainChainAggregateUnlockBatch.es'
        ? 'doubleUnlockPreventionAggregateBatch.nftId'
        : authenticated
          ? 'doubleUnlockPreventionAuthenticated.nftId'
          : 'doubleUnlockPreventionAggregate.nftId';
      const dupEnv = filename === 'MainChainAggregateUnlockBatch.es'
        ? 'DUP_AGGREGATE_BATCH_NFT_ID'
        : authenticated
          ? 'DUP_AUTHENTICATED_NFT_ID'
          : 'DUP_AGGREGATE_NFT_ID';
      console.warn(`   ${filename} has NFT placeholders but no real NFT IDs available.`);
      console.warn(`   Requires: ${trackerSource} + ${dupSource} in deployed_state.json`);
      console.warn(`   (or ${trackerEnv} + ${dupEnv} env vars)`);
      console.warn('   Skipping — will not write dummy NFT IDs to compiled_contracts.json.');
      console.warn('   Keeping previous compiled entry, if present.');
      return null;
    }
    source = source
      .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', trackerNftId)
      .replaceAll('DUP_NFT_ID_PLACEHOLDER', dupNftId);
    return source;
  }

  // MainChainUnlock: needs real SCS NFT from deployed_state
  if (!source.includes('SCS_NFT_ID_PLACEHOLDER')) return source;

  if (CHECK_ONLY) {
    return source.replace('SCS_NFT_ID_PLACEHOLDER', CHECK_ONLY_SCS_NFT_ID);
  }

  const deployed = readJson(DEPLOYED_STATE_PATH);
  const scsNftId = deployed?.sideChainState?.nftId;
  if (!scsNftId) {
    console.warn('   MainChainUnlock has SCS_NFT_ID_PLACEHOLDER but deployed_state.json has no sideChainState.nftId');
    console.warn('   Keeping previous compiled MainChainUnlock entry, if present.');
    return null;
  }

  return source.replace('SCS_NFT_ID_PLACEHOLDER', scsNftId);
}

async function main() {
  let client: ContractCompilerClient;
  if (CHECK_ONLY) {
    client = createContractsCheckNodeClient(
      process.env.ERGO_NODE_URL ?? 'http://127.0.0.1:9052',
    );
  } else {
    await import('dotenv/config');
    const { ErgoClient } = await import('../ergo-client.js');
    client = new ErgoClient();
  }

  // Verify node is reachable
  try {
    const info = await client.getInfo();
    console.log(`🟢 Connected to Ergo node — Height: ${info.fullHeight}`);
  } catch (err) {
    console.error('❌ Cannot connect to the configured Ergo compiler node');
    console.error('   Run start_node.bat first.');
    process.exit(1);
  }

  const compiled: Record<string, CompiledContract> = CHECK_ONLY ? {} : readJson(OUTPUT_PATH);
  const compiledThisRun: Record<string, CompiledContract> = {};
  const failures: string[] = [];

  for (const filename of CONTRACT_FILES) {
    const filePath = resolve(CONTRACTS_DIR, filename);
    const source = await prepareSource(
      filename,
      readFileSync(filePath, 'utf-8'),
      compiledThisRun,
    );
    const name = filename.replace('.es', '');

    console.log(`\n📝 Compiling ${filename}...`);

    if (source === null) {
      continue;
    }

    try {
      const result = await client.compileContract(source);
      const identity = bindCompiledContractIdentity(
        result.address,
        result.ergoTreeHex,
        `${filename} compiled contract`,
      );
      if (filename === FEDERATED_TRACKER_FILENAME) {
        const frozen = readPinnedJson(
          FEDERATED_TRACKER_IDENTITY_PATH,
          FEDERATED_TRACKER_IDENTITY_SHA256,
          'federated tracker identity',
        );
        if (identity.ergoTreeHex !== frozen.propositionHex) {
          throw new Error(
            'federated tracker compiled ErgoTree differs from the frozen identity',
          );
        }
      }
      const federatedSettlementRole =
        FEDERATED_SETTLEMENT_FAMILY_FILES.get(filename);
      if (federatedSettlementRole !== undefined) {
        federatedSettlementCheckOnly ??=
          loadCheckOnlyFederatedSettlementFamily();
        const frozen = federatedSettlementCheckOnly.identity
          .contracts[federatedSettlementRole].receipt;
        if (identity.ergoTreeHex !== frozen.propositionHex) {
          throw new Error(
            federatedSettlementRole
              + ' compiled ErgoTree differs from the frozen federated identity',
          );
        }
      }
      compiled[name] = {
        name,
        sourceFile: filename,
        address: identity.address,
        ergoTreeHex: identity.ergoTreeHex,
        compiledAt: new Date().toISOString(),
      };
      compiledThisRun[name] = compiled[name];
      console.log(`   ✅ Address: ${result.address}`);
      console.log(`   ✅ ErgoTree: ${result.ergoTreeHex.substring(0, 40)}...`);
    } catch (err: any) {
      failures.push(name);
      console.error(`   ❌ Compilation FAILED: ${err.response?.data?.detail ?? err.message}`);
      console.error(`   💡 Check the ErgoScript syntax in ${filename}`);
      if (compiled[name]) {
        console.error(`   Keeping previous compiled ${name} entry`);
      }
      // Continue with other contracts without deleting previous entries
    }
  }

  if (CHECK_ONLY) {
    if (failures.length > 0) {
      throw new Error(`contract compile check failed for: ${failures.join(', ')}`);
    }
    console.log(`\n✅ Compile check passed. No files written.`);
    return;
  }

  // Save compiled output
  const outputPath = OUTPUT_PATH;
  writeFileSync(OUTPUT_PATH, JSON.stringify(compiled, null, 2));
  console.log(`\n💾 Saved to ${outputPath}`);
  console.log(`   Compiled: ${Object.keys(compiled).length}/${CONTRACT_FILES.length}`);
}

const executedAsScript = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executedAsScript) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
