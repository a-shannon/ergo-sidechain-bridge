import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
  type BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput,
  type SubstrateFederatedSettlementFamilyV1CompilerRequest,
} from './substrate-federated-settlement-family-v1.js';

const BRIDGE_ROOT = resolve(import.meta.dirname, '..', '..');
const TRACKER_IDENTITY_PATH =
  'relayer/test-vectors/substrate-federated-v1-tracker-contract.json';
const TRACKER_IDENTITY_SHA256 =
  '65bdfbb30e6dfcba087689761415600b92fadf945a795f6046176110332ae5cd';
const CONTRACT_PATHS = Object.freeze({
  duplicatePrevention:
    'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  sourceLock: 'contracts/MainChainLockPooledReserveV6.es',
  pooledReserve:
    'contracts/MainChainPooledReserveValidityApplicationV6.es',
} as const);

let fixture:
Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest> | undefined;

export function buildSubstrateFederatedSettlementFamilyV1CompilerFixture():
Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest> {
  fixture ??= buildSubstrateFederatedSettlementFamilyV1CompilerRequest(
    buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput(),
  );
  return fixture;
}

export function buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput():
BuildSubstrateFederatedSettlementFamilyV1CompilerRequestInput {
  const trackerIdentity = readPinnedTrackerIdentity();
  return {
    templates: {
      duplicatePrevention: readTemplate('duplicatePrevention'),
      sourceLock: readTemplate('sourceLock'),
      pooledReserve: readTemplate('pooledReserve'),
    },
    duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
    pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
    tracker: {
      contractIdHex: trackerIdentity.contractIdHex,
      templateSourceSha256Hex: trackerIdentity.templateSourceSha256Hex,
      trackerNftIdHex: trackerIdentity.trackerNftIdHex,
      sourceNetworkIdHex: trackerIdentity.application.sourceNetworkIdHex,
      sidechainIdHex: trackerIdentity.application.sidechainIdHex,
      bridgeAddressHex: trackerIdentity.application.bridgeAddressHex,
      tokenAddressHex: trackerIdentity.application.tokenAddressHex,
      runtimeProfileIdHex: trackerIdentity.application.runtimeProfileIdHex,
      settlementProfileIdHex:
        trackerIdentity.application.settlementProfileIdHex,
      federationProfileIdHex: trackerIdentity.federationProfileIdHex,
      sourceAttestationKeySetDigestHex:
        trackerIdentity.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold:
        trackerIdentity.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex:
        trackerIdentity.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: trackerIdentity.ergoAdmissionThreshold,
      federationEpoch: trackerIdentity.federationEpoch,
    },
  };
}

function readTemplate(role: keyof typeof CONTRACT_PATHS) {
  const relativePath = CONTRACT_PATHS[role];
  return Object.freeze({
    relativePath,
    source: readFileSync(resolve(BRIDGE_ROOT, relativePath), 'utf8'),
  });
}

function readPinnedTrackerIdentity(): TrackerIdentity {
  const bytes = readFileSync(resolve(BRIDGE_ROOT, TRACKER_IDENTITY_PATH));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== TRACKER_IDENTITY_SHA256) {
    throw new Error('federated tracker contract identity SHA-256 drifted');
  }
  const value = JSON.parse(bytes.toString('ascii')) as TrackerIdentity;
  if (
    value.schema !== 'e2s.substrate-federated-v1-tracker-contract'
    || value.version !== 1
  ) {
    throw new Error('federated tracker contract identity is unsupported');
  }
  return value;
}

interface TrackerIdentity {
  readonly schema: 'e2s.substrate-federated-v1-tracker-contract';
  readonly version: 1;
  readonly templateSourceSha256Hex: string;
  readonly contractIdHex: string;
  readonly trackerNftIdHex: string;
  readonly application: {
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly runtimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
  };
  readonly federationProfileIdHex: string;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly federationEpoch: string;
}
