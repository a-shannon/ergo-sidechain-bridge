import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from '../profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
} from '../substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedLocalDevnetGenesisConformanceV1,
  runSubstrateFederatedLocalDevnetGenesisCheckV1,
  type SubstrateFederatedLocalDevnetRewardDelayV1,
} from '../substrate-federated-local-devnet-genesis-conformance-v1.js';
import type {
  SubstrateFederatedSettlementFamilyV1Template,
} from '../substrate-federated-settlement-family-v1.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
} from '../substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from '../substrate-federated-tracker-compiler-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from '../substrate-federated-tracker-jvm-compiler-v1.js';

const PRIMARY_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_ORIGIN = 'http://127.0.0.1:9052';
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;

interface Arguments {
  readonly rewardDelay: SubstrateFederatedLocalDevnetRewardDelayV1;
  readonly genesisHeaderIdHex: string;
  readonly trackerBoxIdHex: string;
  readonly duplicatePreventionBoxIdHex: string;
  readonly pooledReserveBoxIdHex: string;
  readonly mnemonicEnvironmentVariable: string;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const rawMnemonic = process.env[args.mnemonicEnvironmentVariable];
  delete process.env[args.mnemonicEnvironmentVariable];
  const mnemonic = rawMnemonic?.trim();
  if (!mnemonic) {
    throw new Error('the selected synthetic mnemonic environment variable is empty');
  }

  const profile = buildSubstrateFederatedGenesisTargetProfileV1({
    profileIdHex: hash([
      'local-devnet-federated-genesis-conformance-v1',
      args.rewardDelay.toString(),
      args.genesisHeaderIdHex,
      args.trackerBoxIdHex,
      args.duplicatePreventionBoxIdHex,
      args.pooledReserveBoxIdHex,
    ].join('\0')),
    environment: 'patched-devnet',
    expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex: args.genesisHeaderIdHex,
    primaryNodeOrigin: PRIMARY_ORIGIN,
    primaryNodeIdentityDigestHex: hash('local-devnet-primary-node-process-v1'),
    primaryAdministrationIdentityDigestHex:
      hash('local-devnet-primary-synthetic-custody-v1'),
    witnessNodeOrigin: WITNESS_ORIGIN,
    witnessNodeIdentityDigestHex: hash('local-devnet-witness-node-process-v1'),
    witnessAdministrationIdentityDigestHex:
      hash('local-devnet-witness-observation-role-v1'),
    trackerGenesisBoxIdHex: args.trackerBoxIdHex,
    duplicatePreventionGenesisBoxIdHex: args.duplicatePreventionBoxIdHex,
    pooledReserveGenesisBoxIdHex: args.pooledReserveBoxIdHex,
  });
  await observeWithRetry(profile);

  const vector = JSON.parse(readFileSync(new URL(
    '../../test-vectors/substrate-federated-v1-tracker-admission.json',
    import.meta.url,
  ), 'utf8')) as any;
  const statement = vector.input.statement;
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
    template: {
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      source: contractSource('contracts/SPVTrackerSubstrateFederatedV1.es'),
    },
    trackerGenesisInputBoxIdHex: args.trackerBoxIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
    application: {
      sourceNetworkIdHex: statement.sourceNetworkIdHex,
      sidechainIdHex: statement.sidechainIdHex,
      bridgeAddressHex: statement.bridgeAddressHex,
      tokenAddressHex: statement.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: statement.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: statement.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: statement.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: statement.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: statement.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: statement.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: statement.runtimeProfileIdHex,
      settlementProfileIdHex: statement.settlementProfileIdHex,
    },
  });
  const trackerReceipt =
    await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
  const templates = familyTemplates();
  const familyReceipt =
    await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      trackerRequest,
      trackerReceipt,
      templates,
      duplicatePreventionGenesisInputBoxIdHex:
        args.duplicatePreventionBoxIdHex,
      pooledReserveGenesisInputBoxIdHex: args.pooledReserveBoxIdHex,
    });

  const constructionObservation = await observeWithRetry(profile);
  const plan = await buildSubstrateFederatedLocalDevnetGenesisConformanceV1({
    rewardDelay: args.rewardDelay,
    targetProfile: profile,
    observation: constructionObservation,
    trackerRequest,
    trackerReceipt,
    familyTemplates: templates,
    familyReceipt,
  });
  const report = await runSubstrateFederatedLocalDevnetGenesisCheckV1(
    plan,
    { mnemonic },
  );

  console.log(JSON.stringify(report, null, 2));
}

async function observeWithRetry(
  profile: Parameters<typeof observeSubstrateFederatedGenesisV1>[0],
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OBSERVATION_ATTEMPTS; attempt += 1) {
    try {
      return await observeSubstrateFederatedGenesisV1(profile);
    } catch (error) {
      lastError = error;
      if (attempt < OBSERVATION_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, OBSERVATION_RETRY_MS));
      }
    }
  }
  throw new Error(
    `dual-origin local devnet observation did not stabilize: ${String(lastError)}`,
  );
}

function familyTemplates() {
  return {
    duplicatePrevention: template(
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
    ),
    sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
    pooledReserve: template(
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
    ),
  };
}

function template(relativePath: string): SubstrateFederatedSettlementFamilyV1Template {
  return { relativePath, source: contractSource(relativePath) };
}

function contractSource(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error('local devnet genesis check arguments must be --name value pairs');
    }
    if (values.has(flag)) throw new Error(`duplicate argument ${flag}`);
    values.set(flag, value);
  }
  const allowed = new Set([
    '--reward-delay',
    '--genesis-header-id',
    '--tracker-box-id',
    '--duplicate-prevention-box-id',
    '--pooled-reserve-box-id',
    '--mnemonic-env',
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) throw new Error(`unknown argument ${flag}`);
  }
  return {
    rewardDelay: requiredRewardDelay(values, '--reward-delay'),
    genesisHeaderIdHex: requiredHex(values, '--genesis-header-id'),
    trackerBoxIdHex: requiredHex(values, '--tracker-box-id'),
    duplicatePreventionBoxIdHex:
      requiredHex(values, '--duplicate-prevention-box-id'),
    pooledReserveBoxIdHex: requiredHex(values, '--pooled-reserve-box-id'),
    mnemonicEnvironmentVariable: requiredEnvironmentName(values, '--mnemonic-env'),
  };
}

function requiredRewardDelay(
  values: ReadonlyMap<string, string>,
  flag: string,
): SubstrateFederatedLocalDevnetRewardDelayV1 {
  const value = values.get(flag);
  if (value !== '1' && value !== '720') {
    throw new Error(`${flag} must be exactly 1 or 720`);
  }
  return Number(value) as SubstrateFederatedLocalDevnetRewardDelayV1;
}

function requiredHex(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${flag} must be canonical lowercase 32-byte hex`);
  }
  return value;
}

function requiredEnvironmentName(
  values: ReadonlyMap<string, string>,
  flag: string,
): string {
  const value = values.get(flag);
  if (!value || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value)) {
    throw new Error(`${flag} must name an uppercase process environment variable`);
  }
  return value;
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

main().catch(error => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
