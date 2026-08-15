import { createHash } from 'crypto';

import {
  observeAuthenticatedSpvTrackerFromDistinctNodeOrigins,
  validateAuthenticatedSpvTrackerDualObservationReport,
  type AuthenticatedSpvTrackerDualObservationReport,
  type AuthenticatedSpvTrackerNodeSourceFactory,
} from './authenticated-spv-tracker-dual-observation.js';
import {
  createBoundedAuthenticatedSpvTrackerReadOnlySource,
  normalizeRootReadOnlyNodeEndpoint,
  readMatchingAuthenticatedSpvTrackerNodeNetwork,
  type AuthenticatedSpvTrackerNodeSource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  decodeBoundedCollByteRegister,
  decodeCanonicalDlogSigmaPropRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import { encodeAuthenticatedSpvTrackerAvlRegister } from './spv-tracker-authenticated.js';

export const AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA =
  'e2s.authenticated-v2-stateful-check-readiness.v1';

const NON_MAINNET_ENVIRONMENTS = new Set([
  'local',
  'development',
  'devnet',
  'patched-devnet',
  'testnet',
]);
const EXPECTED_NODE_NETWORK_BY_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  local: 'local',
  development: 'development',
  devnet: 'devnet',
  'patched-devnet': 'devnet',
  testnet: 'testnet',
});
const MAX_ERGO_TREE_BYTES = 32 * 1024;
const MAX_REGISTER_BYTES = 32 * 1024;
const MAX_VAULT_PROVENANCE_BYTES = 4 * 1024;
const MAX_SERIALIZED_BOX_BYTES = 1024 * 1024;

export interface AuthenticatedV2StatefulCheckReadinessRequest {
  environment: string;
  primaryNodeUrl: string;
  witnessNodeUrl: string;
  trackerNftIdHex: string;
  trackerGenesisBoxIdHex: string;
  trackerErgoTreeHex: string;
  sidechainIdHex: string;
  duplicatePreventionBoxIdHex: string;
  duplicatePreventionNftIdHex: string;
  duplicatePreventionErgoTreeHex: string;
  vaultBoxIdHex: string;
  vaultErgoTreeHex: string;
  burnIdHex: string;
  payoutAmountNanoErg: number | string;
  minerFeeNanoErg: number | string;
}

export interface AuthenticatedV2CanonicalAsset {
  tokenIdHex: string;
  amount: string;
}

export interface AuthenticatedV2CanonicalBox {
  boxIdHex: string;
  transactionIdHex: string;
  outputIndex: number;
  creationHeight: number;
  valueNanoErg: number;
  ergoTreeHex: string;
  assets: readonly AuthenticatedV2CanonicalAsset[];
  additionalRegisters: Readonly<Record<string, string>>;
}

export interface AuthenticatedV2CanonicalBoxObservation {
  box: AuthenticatedV2CanonicalBox;
  sigmaSerializedHex: string;
  sigmaSerializedSha256Hex: string;
}

export interface AuthenticatedV2StateSnapshot {
  indexedHeight: number;
  fullHeight: number;
  bestHeader: {
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  };
}

export interface AuthenticatedV2StatefulCheckReadinessReport {
  schema: typeof AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA;
  reportDigestHex: string;
  status: 'AGREED';
  observedAt: string;
  request: {
    environment: string;
    primaryNodeOrigin: string;
    witnessNodeOrigin: string;
    trackerNftIdHex: string;
    trackerGenesisBoxIdHex: string;
    trackerErgoTreeHex: string;
    sidechainIdHex: string;
    duplicatePreventionBoxIdHex: string;
    duplicatePreventionNftIdHex: string;
    duplicatePreventionErgoTreeHex: string;
    vaultBoxIdHex: string;
    vaultErgoTreeHex: string;
    burnIdHex: string;
    payoutAmountNanoErg: number;
    minerFeeNanoErg: number;
    minimumRequiredVaultValueNanoErg: number;
  };
  trackerObservation: AuthenticatedSpvTrackerDualObservationReport;
  stableSnapshot: AuthenticatedV2StateSnapshot;
  trackerInput: AuthenticatedV2CanonicalBoxObservation;
  duplicatePrevention: AuthenticatedV2CanonicalBoxObservation & {
    counter: string;
    avl: {
      registerHex: string;
      digestHex: string;
      flags: number;
      insertEnabled: true;
      keyLength: 32;
      valueLength: 1;
    };
    authority: {
      registerHex: string;
      publicKeyHex: string;
    };
  };
  vault: AuthenticatedV2CanonicalBoxObservation & {
    depositIdHex: string;
    targetEvmAddressHex: string;
    amountNanoErg: string;
    provenanceHex: string;
  };
  agreement: {
    distinctOrigins: true;
    sameExplicitNonMainnetNetwork: true;
    completeTrackerReconstructionMatched: true;
    currentUnspentTrackerTipMatched: true;
    exactNormalizedInputsMatched: true;
    exactCanonicalInputBytesMatched: true;
    inputCreationHeightsWithinSnapshot: true;
    stableSnapshotAcrossExtraUtxoReads: true;
    trackerDupAndVaultBoxIdsDistinct: true;
  };
  boundary: {
    credentialFreeGetOnlyNodeRequests: true;
    configurationRead: false;
    environmentCredentialRead: false;
    runtimeDatabaseOpened: false;
    deploymentStateOpened: false;
    signerOrWalletMaterialRead: false;
    transactionConstructed: false;
    transactionCheckPerformed: false;
    transactionSigned: false;
    transactionSubmitted: false;
    transactionBroadcast: false;
    deploymentPerformed: false;
    independentNodeControlVerified: false;
    nodeAgreementProvesCanonicalConsensus: false;
    reportDigestAuthenticatesSources: false;
    settlementCandidateValidated: false;
    grandpaOrStarkVerifiedByErgo: false;
    r9RemainsFinalityAuthority: true;
    gate5Closed: false;
    productionReady: false;
  };
  authorization: {
    build: false;
    check: false;
    sign: false;
    submit: false;
    broadcast: false;
    deploy: false;
  };
}

interface ObservationOptions {
  createSource?: AuthenticatedSpvTrackerNodeSourceFactory;
  now?: () => Date;
}

type NormalizedRequest = AuthenticatedV2StatefulCheckReadinessReport['request'];

export async function observeAuthenticatedV2StatefulCheckReadiness(
  request: AuthenticatedV2StatefulCheckReadinessRequest,
  options: ObservationOptions = {},
): Promise<AuthenticatedV2StatefulCheckReadinessReport> {
  const normalized = normalizeRequest(request);
  if (
    canonicalNodeOrigin(normalized.primaryNodeOrigin, 'primary Ergo node origin')
    === canonicalNodeOrigin(normalized.witnessNodeOrigin, 'witness Ergo node origin')
  ) {
    throw new Error('primary and witness Ergo observations must use distinct node origins');
  }
  const createSource = options.createSource ?? createBoundedAuthenticatedSpvTrackerReadOnlySource;
  const primarySource = createSource(normalized.primaryNodeOrigin);
  const witnessSource = createSource(normalized.witnessNodeOrigin);
  if (primarySource === witnessSource) {
    throw new Error('primary and witness Ergo observations require distinct source instances');
  }

  const sourceByOrigin = new Map<string, AuthenticatedSpvTrackerNodeSource>([
    [normalized.primaryNodeOrigin, primarySource],
    [normalized.witnessNodeOrigin, witnessSource],
  ]);
  const trackerObservation = await observeAuthenticatedSpvTrackerFromDistinctNodeOrigins({
    environment: normalized.environment,
    primaryNodeUrl: normalized.primaryNodeOrigin,
    witnessNodeUrl: normalized.witnessNodeOrigin,
    trackerNftIdHex: normalized.trackerNftIdHex,
    trackerGenesisBoxIdHex: normalized.trackerGenesisBoxIdHex,
    trackerErgoTreeHex: normalized.trackerErgoTreeHex,
    sidechainIdHex: normalized.sidechainIdHex,
  }, {
    createSource: endpoint => {
      const source = sourceByOrigin.get(endpoint);
      if (!source) throw new Error('dual tracker observer requested an unexpected node origin');
      return source;
    },
    now: options.now,
  });
  validateAuthenticatedSpvTrackerDualObservationReport(trackerObservation);
  assertDistinctInputBoxIds(
    trackerObservation.tracker.tipBoxIdHex,
    normalized.duplicatePreventionBoxIdHex,
    normalized.vaultBoxIdHex,
  );

  let primaryBudgetStarted = false;
  let witnessBudgetStarted = false;
  try {
    primarySource.beginAuthenticatedTrackerReconstruction?.();
    primaryBudgetStarted = Boolean(primarySource.beginAuthenticatedTrackerReconstruction);
    witnessSource.beginAuthenticatedTrackerReconstruction?.();
    witnessBudgetStarted = Boolean(witnessSource.beginAuthenticatedTrackerReconstruction);

    const expectedNetwork = EXPECTED_NODE_NETWORK_BY_ENVIRONMENT[normalized.environment];
    const networkBefore = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
      primarySource,
      witnessSource,
      expectedNetwork,
    );
    const [primaryBefore, witnessBefore] = await Promise.all([
      captureSnapshot(primarySource, 'primary pre-UTXO'),
      captureSnapshot(witnessSource, 'witness pre-UTXO'),
    ]);
    assertSnapshotsEqual(
      primaryBefore,
      witnessBefore,
      'primary and witness Ergo observations disagree before the extra UTXO reads',
    );
    assertTrackerTipMatchesSnapshot(trackerObservation, primaryBefore);

    const primaryBinaryReader = requireBinaryBoxReader(primarySource, 'primary');
    const witnessBinaryReader = requireBinaryBoxReader(witnessSource, 'witness');
    const trackerTipBoxIdHex = trackerObservation.tracker.tipBoxIdHex;
    const [
      primaryTrackerRaw,
      primaryTrackerBinary,
      primaryDupRaw,
      primaryDupBinary,
      primaryVaultRaw,
      primaryVaultBinary,
      witnessTrackerRaw,
      witnessTrackerBinary,
      witnessDupRaw,
      witnessDupBinary,
      witnessVaultRaw,
      witnessVaultBinary,
    ] = await Promise.all([
      primarySource.getBoxByIdOrNull(trackerTipBoxIdHex),
      primaryBinaryReader(trackerTipBoxIdHex),
      primarySource.getBoxByIdOrNull(normalized.duplicatePreventionBoxIdHex),
      primaryBinaryReader(normalized.duplicatePreventionBoxIdHex),
      primarySource.getBoxByIdOrNull(normalized.vaultBoxIdHex),
      primaryBinaryReader(normalized.vaultBoxIdHex),
      witnessSource.getBoxByIdOrNull(trackerTipBoxIdHex),
      witnessBinaryReader(trackerTipBoxIdHex),
      witnessSource.getBoxByIdOrNull(normalized.duplicatePreventionBoxIdHex),
      witnessBinaryReader(normalized.duplicatePreventionBoxIdHex),
      witnessSource.getBoxByIdOrNull(normalized.vaultBoxIdHex),
      witnessBinaryReader(normalized.vaultBoxIdHex),
    ]);
    const [primaryTrackerInput, witnessTrackerInput, primaryDup, witnessDup, primaryVault, witnessVault]
      = await Promise.all([
        normalizeTrackerInput(
          primaryTrackerRaw,
          primaryTrackerBinary,
          normalized,
          trackerObservation,
          primaryBefore.fullHeight,
          'primary tracker input',
        ),
        normalizeTrackerInput(
          witnessTrackerRaw,
          witnessTrackerBinary,
          normalized,
          trackerObservation,
          witnessBefore.fullHeight,
          'witness tracker input',
        ),
        normalizeDuplicatePreventionBox(
          primaryDupRaw,
          primaryDupBinary,
          normalized,
          trackerObservation.tracker.finalityAttestorSigmaPropRegisterHex,
          primaryBefore.fullHeight,
          'primary DUP box',
        ),
        normalizeDuplicatePreventionBox(
          witnessDupRaw,
          witnessDupBinary,
          normalized,
          trackerObservation.tracker.finalityAttestorSigmaPropRegisterHex,
          witnessBefore.fullHeight,
          'witness DUP box',
        ),
        normalizeVaultBox(
          primaryVaultRaw,
          primaryVaultBinary,
          normalized,
          primaryBefore.fullHeight,
          'primary vault box',
        ),
        normalizeVaultBox(
          witnessVaultRaw,
          witnessVaultBinary,
          normalized,
          witnessBefore.fullHeight,
          'witness vault box',
        ),
      ]);
    if (canonicalJson(primaryTrackerInput) !== canonicalJson(witnessTrackerInput)) {
      throw new Error('independent Ergo observations disagree on the normalized tracker input');
    }
    if (canonicalJson(primaryDup) !== canonicalJson(witnessDup)) {
      throw new Error('independent Ergo observations disagree on the normalized DUP box');
    }
    if (canonicalJson(primaryVault) !== canonicalJson(witnessVault)) {
      throw new Error('independent Ergo observations disagree on the normalized vault box');
    }

    const [primaryAfter, witnessAfter] = await Promise.all([
      captureSnapshot(primarySource, 'primary post-UTXO'),
      captureSnapshot(witnessSource, 'witness post-UTXO'),
    ]);
    assertSnapshotsEqual(
      primaryAfter,
      witnessAfter,
      'primary and witness Ergo observations disagree after the extra UTXO reads',
    );
    assertSnapshotsEqual(
      primaryBefore,
      primaryAfter,
      'Ergo snapshot changed during the extra UTXO reads',
    );
    const networkAfter = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
      primarySource,
      witnessSource,
      expectedNetwork,
    );
    if (networkBefore !== networkAfter || trackerObservation.sources.primary.network !== networkAfter) {
      throw new Error('Ergo node network identity changed during stateful-check readiness observation');
    }

    const trackerAuthorityKey = decodeCanonicalDlogSigmaPropRegister(
      trackerObservation.tracker.finalityAttestorSigmaPropRegisterHex,
      'tracker R9',
    );
    if (primaryDup.authority.publicKeyHex === trackerAuthorityKey) {
      throw new Error('DUP box R6 authority must be distinct from tracker R9 authority');
    }
    assertDistinctInputBoxIds(
      trackerObservation.tracker.tipBoxIdHex,
      primaryDup.box.boxIdHex,
      primaryVault.box.boxIdHex,
    );

    const withoutDigest: Omit<AuthenticatedV2StatefulCheckReadinessReport, 'reportDigestHex'> = {
      schema: AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA,
      status: 'AGREED',
      observedAt: trackerObservation.observedAt,
      request: normalized,
      trackerObservation,
      stableSnapshot: primaryBefore,
      trackerInput: primaryTrackerInput,
      duplicatePrevention: primaryDup,
      vault: primaryVault,
      agreement: {
        distinctOrigins: true,
        sameExplicitNonMainnetNetwork: true,
        completeTrackerReconstructionMatched: true,
        currentUnspentTrackerTipMatched: true,
        exactNormalizedInputsMatched: true,
        exactCanonicalInputBytesMatched: true,
        inputCreationHeightsWithinSnapshot: true,
        stableSnapshotAcrossExtraUtxoReads: true,
        trackerDupAndVaultBoxIdsDistinct: true,
      },
      boundary: {
        credentialFreeGetOnlyNodeRequests: true,
        configurationRead: false,
        environmentCredentialRead: false,
        runtimeDatabaseOpened: false,
        deploymentStateOpened: false,
        signerOrWalletMaterialRead: false,
        transactionConstructed: false,
        transactionCheckPerformed: false,
        transactionSigned: false,
        transactionSubmitted: false,
        transactionBroadcast: false,
        deploymentPerformed: false,
        independentNodeControlVerified: false,
        nodeAgreementProvesCanonicalConsensus: false,
        reportDigestAuthenticatesSources: false,
        settlementCandidateValidated: false,
        grandpaOrStarkVerifiedByErgo: false,
        r9RemainsFinalityAuthority: true,
        gate5Closed: false,
        productionReady: false,
      },
      authorization: {
        build: false,
        check: false,
        sign: false,
        submit: false,
        broadcast: false,
        deploy: false,
      },
    };
    const report = deepFreeze({
      ...withoutDigest,
      reportDigestHex: sha256Canonical(withoutDigest),
    });
    return await validateAuthenticatedV2StatefulCheckReadinessReport(report);
  } finally {
    if (witnessBudgetStarted) witnessSource.endAuthenticatedTrackerReconstruction?.();
    if (primaryBudgetStarted) primarySource.endAuthenticatedTrackerReconstruction?.();
  }
}

export async function validateAuthenticatedV2StatefulCheckReadinessReport(
  value: unknown,
): Promise<AuthenticatedV2StatefulCheckReadinessReport> {
  const report = record(value, 'stateful-check readiness report');
  exactKeys(report, [
    'schema',
    'reportDigestHex',
    'status',
    'observedAt',
    'request',
    'trackerObservation',
    'stableSnapshot',
    'trackerInput',
    'duplicatePrevention',
    'vault',
    'agreement',
    'boundary',
    'authorization',
  ], 'stateful-check readiness report');
  if (report.schema !== AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA) {
    throw new Error(`stateful-check readiness schema must be ${AUTHENTICATED_V2_STATEFUL_CHECK_READINESS_SCHEMA}`);
  }
  if (report.status !== 'AGREED') throw new Error('stateful-check readiness status must be AGREED');
  const reportDigestHex = fixedHex(report.reportDigestHex, 32, 'report digest');
  const observedAt = stringValue(report.observedAt, 'observedAt');
  if (new Date(observedAt).toISOString() !== observedAt) {
    throw new Error('observedAt must be canonical ISO-8601');
  }

  const requestValue = record(report.request, 'request');
  exactKeys(requestValue, [
    'environment',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
    'trackerNftIdHex',
    'trackerGenesisBoxIdHex',
    'trackerErgoTreeHex',
    'sidechainIdHex',
    'duplicatePreventionBoxIdHex',
    'duplicatePreventionNftIdHex',
    'duplicatePreventionErgoTreeHex',
    'vaultBoxIdHex',
    'vaultErgoTreeHex',
    'burnIdHex',
    'payoutAmountNanoErg',
    'minerFeeNanoErg',
    'minimumRequiredVaultValueNanoErg',
  ], 'request');
  const normalized = normalizeRequest({
    environment: requestValue.environment,
    primaryNodeUrl: requestValue.primaryNodeOrigin,
    witnessNodeUrl: requestValue.witnessNodeOrigin,
    trackerNftIdHex: requestValue.trackerNftIdHex,
    trackerGenesisBoxIdHex: requestValue.trackerGenesisBoxIdHex,
    trackerErgoTreeHex: requestValue.trackerErgoTreeHex,
    sidechainIdHex: requestValue.sidechainIdHex,
    duplicatePreventionBoxIdHex: requestValue.duplicatePreventionBoxIdHex,
    duplicatePreventionNftIdHex: requestValue.duplicatePreventionNftIdHex,
    duplicatePreventionErgoTreeHex: requestValue.duplicatePreventionErgoTreeHex,
    vaultBoxIdHex: requestValue.vaultBoxIdHex,
    vaultErgoTreeHex: requestValue.vaultErgoTreeHex,
    burnIdHex: requestValue.burnIdHex,
    payoutAmountNanoErg: requestValue.payoutAmountNanoErg,
    minerFeeNanoErg: requestValue.minerFeeNanoErg,
  });
  if (canonicalJson(normalized) !== canonicalJson(requestValue)) {
    throw new Error('request fields must use their canonical normalized values');
  }
  if (
    canonicalNodeOrigin(normalized.primaryNodeOrigin, 'primary Ergo node origin')
    === canonicalNodeOrigin(normalized.witnessNodeOrigin, 'witness Ergo node origin')
  ) {
    throw new Error('report primary and witness origins must be distinct');
  }

  const tracker = validateAuthenticatedSpvTrackerDualObservationReport(report.trackerObservation);
  if (tracker.observedAt !== observedAt || tracker.environment !== normalized.environment) {
    throw new Error('tracker observation identity does not match the outer report');
  }
  const trackerIdentityComparisons: Array<[unknown, unknown, string]> = [
    [
      tracker.sources.primary.endpointOrigin,
      canonicalNodeOrigin(normalized.primaryNodeOrigin, 'primary Ergo node origin'),
      'primary origin',
    ],
    [
      tracker.sources.witness.endpointOrigin,
      canonicalNodeOrigin(normalized.witnessNodeOrigin, 'witness Ergo node origin'),
      'witness origin',
    ],
    [tracker.tracker.nftIdHex, normalized.trackerNftIdHex, 'NFT id'],
    [tracker.tracker.genesisBoxIdHex, normalized.trackerGenesisBoxIdHex, 'genesis box id'],
    [tracker.tracker.sidechainIdHex, normalized.sidechainIdHex, 'sidechain id'],
    [
      tracker.tracker.ergoTreeSha256Hex,
      sha256Hex(Buffer.from(normalized.trackerErgoTreeHex, 'hex')),
      'ErgoTree digest',
    ],
    [tracker.tracker.ergoTreeBytes, normalized.trackerErgoTreeHex.length / 2, 'ErgoTree length'],
  ];
  for (const [actual, expected, field] of trackerIdentityComparisons) {
    if (actual !== expected) {
      throw new Error(`tracker observation ${field} does not match the explicit request`);
    }
  }

  const stableSnapshot = validateSnapshot(report.stableSnapshot, 'stable snapshot');
  assertTrackerTipMatchesSnapshot(tracker, stableSnapshot);

  const trackerInputValue = record(report.trackerInput, 'tracker input');
  exactKeys(trackerInputValue, [
    'box',
    'sigmaSerializedHex',
    'sigmaSerializedSha256Hex',
  ], 'tracker input');
  const trackerInput = await validateCanonicalBoxObservationReport(
    trackerInputValue,
    ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
    'tracker input',
  );
  validateTrackerInput(trackerInput.box, normalized, tracker, 'tracker input');
  assertBoxCreationHeightWithinSnapshot(trackerInput.box, stableSnapshot, 'tracker input');

  const duplicatePrevention = record(report.duplicatePrevention, 'duplicatePrevention');
  exactKeys(duplicatePrevention, [
    'box',
    'sigmaSerializedHex',
    'sigmaSerializedSha256Hex',
    'counter',
    'avl',
    'authority',
  ], 'duplicatePrevention');
  const dupObservation = await validateCanonicalBoxObservationReport(
    duplicatePrevention,
    ['R4', 'R5', 'R6'],
    'DUP box',
  );
  const dupBox = dupObservation.box;
  if (
    dupBox.boxIdHex !== normalized.duplicatePreventionBoxIdHex
    || dupBox.ergoTreeHex !== normalized.duplicatePreventionErgoTreeHex
  ) {
    throw new Error('DUP box identity does not match the explicit request');
  }
  assertExactSingleton(dupBox.assets, normalized.duplicatePreventionNftIdHex, 'DUP box');
  assertBoxCreationHeightWithinSnapshot(dupBox, stableSnapshot, 'DUP box');
  const counter = decodeCanonicalLongRegister(dupBox.additionalRegisters.R4, 'DUP box R4');
  if (counter < 0n || duplicatePrevention.counter !== counter.toString()) {
    throw new Error('DUP box counter does not match canonical nonnegative R4');
  }
  const decodedAvl = decodeCanonicalInsertAvl(dupBox.additionalRegisters.R5, 'DUP box R5');
  const avl = record(duplicatePrevention.avl, 'DUP avl');
  exactKeys(avl, [
    'registerHex', 'digestHex', 'flags', 'insertEnabled', 'keyLength', 'valueLength',
  ], 'DUP avl');
  if (
    avl.registerHex !== decodedAvl.registerHex
    || avl.digestHex !== decodedAvl.digestHex
    || avl.flags !== decodedAvl.flags
    || avl.insertEnabled !== true
    || avl.keyLength !== 32
    || avl.valueLength !== 1
  ) {
    throw new Error('DUP AVL metadata does not match canonical R5');
  }
  const authority = record(duplicatePrevention.authority, 'DUP authority');
  exactKeys(authority, ['registerHex', 'publicKeyHex'], 'DUP authority');
  const authorityKey = decodeCanonicalDlogSigmaPropRegister(dupBox.additionalRegisters.R6, 'DUP box R6');
  if (authority.registerHex !== dupBox.additionalRegisters.R6 || authority.publicKeyHex !== authorityKey) {
    throw new Error('DUP authority metadata does not match canonical R6');
  }
  const trackerAuthorityKey = decodeCanonicalDlogSigmaPropRegister(
    tracker.tracker.finalityAttestorSigmaPropRegisterHex,
    'tracker R9',
  );
  if (authorityKey === trackerAuthorityKey) {
    throw new Error('DUP box R6 authority must be distinct from tracker R9 authority');
  }

  const vault = record(report.vault, 'vault');
  exactKeys(vault, [
    'box',
    'sigmaSerializedHex',
    'sigmaSerializedSha256Hex',
    'depositIdHex',
    'targetEvmAddressHex',
    'amountNanoErg',
    'provenanceHex',
  ], 'vault');
  const vaultObservation = await validateCanonicalBoxObservationReport(
    vault,
    ['R4', 'R5', 'R6', 'R7'],
    'vault box',
  );
  const vaultBox = vaultObservation.box;
  if (vaultBox.boxIdHex !== normalized.vaultBoxIdHex || vaultBox.ergoTreeHex !== normalized.vaultErgoTreeHex) {
    throw new Error('vault box identity does not match the explicit request');
  }
  if (vaultBox.assets.length !== 0) throw new Error('vault box must be pure ERG');
  assertBoxCreationHeightWithinSnapshot(vaultBox, stableSnapshot, 'vault box');
  if (vaultBox.valueNanoErg < normalized.minimumRequiredVaultValueNanoErg) {
    throw new Error('vault box value is below the requested minimum');
  }
  const decodedVault = decodeVaultRegisters(vaultBox.additionalRegisters, 'vault box');
  if (
    vault.depositIdHex !== decodedVault.depositIdHex
    || vault.targetEvmAddressHex !== decodedVault.targetEvmAddressHex
    || vault.amountNanoErg !== decodedVault.amountNanoErg
    || vault.provenanceHex !== decodedVault.provenanceHex
  ) {
    throw new Error('vault metadata does not match canonical R4-R7');
  }

  assertDistinctInputBoxIds(tracker.tracker.tipBoxIdHex, dupBox.boxIdHex, vaultBox.boxIdHex);
  validateExactBooleanRecord(report.agreement, {
    distinctOrigins: true,
    sameExplicitNonMainnetNetwork: true,
    completeTrackerReconstructionMatched: true,
    currentUnspentTrackerTipMatched: true,
    exactNormalizedInputsMatched: true,
    exactCanonicalInputBytesMatched: true,
    inputCreationHeightsWithinSnapshot: true,
    stableSnapshotAcrossExtraUtxoReads: true,
    trackerDupAndVaultBoxIdsDistinct: true,
  }, 'agreement');
  validateExactBooleanRecord(report.boundary, {
    credentialFreeGetOnlyNodeRequests: true,
    configurationRead: false,
    environmentCredentialRead: false,
    runtimeDatabaseOpened: false,
    deploymentStateOpened: false,
    signerOrWalletMaterialRead: false,
    transactionConstructed: false,
    transactionCheckPerformed: false,
    transactionSigned: false,
    transactionSubmitted: false,
    transactionBroadcast: false,
    deploymentPerformed: false,
    independentNodeControlVerified: false,
    nodeAgreementProvesCanonicalConsensus: false,
    reportDigestAuthenticatesSources: false,
    settlementCandidateValidated: false,
    grandpaOrStarkVerifiedByErgo: false,
    r9RemainsFinalityAuthority: true,
    gate5Closed: false,
    productionReady: false,
  }, 'boundary');
  validateExactBooleanRecord(report.authorization, {
    build: false,
    check: false,
    sign: false,
    submit: false,
    broadcast: false,
    deploy: false,
  }, 'authorization');

  const { reportDigestHex: _discarded, ...withoutDigest } = report;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('stateful-check readiness report content does not match its report digest');
  }
  return deepFreeze(report as unknown as AuthenticatedV2StatefulCheckReadinessReport);
}

function normalizeRequest(request: AuthenticatedV2StatefulCheckReadinessRequest): NormalizedRequest {
  const environment = stringValue(request.environment, 'environment').trim().toLowerCase();
  if (!NON_MAINNET_ENVIRONMENTS.has(environment)) {
    throw new Error('environment must be an explicit non-mainnet environment');
  }
  const payoutAmountNanoErg = positiveSafeInteger(
    request.payoutAmountNanoErg,
    'payout amount nanoERG',
  );
  const minerFeeNanoErg = positiveSafeInteger(request.minerFeeNanoErg, 'miner fee nanoERG');
  if (minerFeeNanoErg !== MINER_FEE) {
    throw new Error(`miner fee nanoERG must match the authenticated V2 builder fee ${MINER_FEE}`);
  }
  if (payoutAmountNanoErg > Number.MAX_SAFE_INTEGER - minerFeeNanoErg) {
    throw new Error('payout amount plus miner fee exceeds the JavaScript safe integer range');
  }
  return Object.freeze({
    environment,
    primaryNodeOrigin: normalizeRootReadOnlyNodeEndpoint(
      request.primaryNodeUrl,
      'primary Ergo node URL',
    ),
    witnessNodeOrigin: normalizeRootReadOnlyNodeEndpoint(
      request.witnessNodeUrl,
      'witness Ergo node URL',
    ),
    trackerNftIdHex: fixedHex(request.trackerNftIdHex, 32, 'tracker NFT id'),
    trackerGenesisBoxIdHex: fixedHex(
      request.trackerGenesisBoxIdHex,
      32,
      'tracker genesis box id',
    ),
    trackerErgoTreeHex: variableHex(request.trackerErgoTreeHex, MAX_ERGO_TREE_BYTES, 'tracker ErgoTree'),
    sidechainIdHex: fixedHex(request.sidechainIdHex, 32, 'sidechain id'),
    duplicatePreventionBoxIdHex: fixedHex(
      request.duplicatePreventionBoxIdHex,
      32,
      'DUP box id',
    ),
    duplicatePreventionNftIdHex: fixedHex(
      request.duplicatePreventionNftIdHex,
      32,
      'DUP NFT id',
    ),
    duplicatePreventionErgoTreeHex: variableHex(
      request.duplicatePreventionErgoTreeHex,
      MAX_ERGO_TREE_BYTES,
      'DUP ErgoTree',
    ),
    vaultBoxIdHex: fixedHex(request.vaultBoxIdHex, 32, 'vault box id'),
    vaultErgoTreeHex: variableHex(
      request.vaultErgoTreeHex,
      MAX_ERGO_TREE_BYTES,
      'vault ErgoTree',
    ),
    burnIdHex: fixedHex(request.burnIdHex, 32, 'burn id'),
    payoutAmountNanoErg,
    minerFeeNanoErg,
    minimumRequiredVaultValueNanoErg: payoutAmountNanoErg + minerFeeNanoErg,
  });
}

async function captureSnapshot(
  source: AuthenticatedSpvTrackerNodeSource,
  label: string,
): Promise<AuthenticatedV2StateSnapshot> {
  const progress = record(await source.getIndexedHeight(), `${label} index progress`);
  const indexedHeight = nonnegativeSafeInteger(progress.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeSafeInteger(progress.fullHeight, `${label} full height`);
  if (indexedHeight !== fullHeight) {
    throw new Error(`${label} extra index must be synchronized with full height`);
  }
  const rawHeader = record(await source.getBestHeader(), `${label} best header`);
  const extensionRootHex = rawHeader.extensionRoot === undefined
    ? undefined
    : fixedHex(rawHeader.extensionRoot, 32, `${label} best header extensionRoot`);
  const extensionHashHex = rawHeader.extensionHash === undefined
    ? undefined
    : fixedHex(rawHeader.extensionHash, 32, `${label} best header extensionHash`);
  if (
    extensionRootHex !== undefined
    && extensionHashHex !== undefined
    && extensionRootHex !== extensionHashHex
  ) {
    throw new Error(`${label} best header extension aliases disagree`);
  }
  const bestHeader = {
    idHex: fixedHex(rawHeader.id, 32, `${label} best header id`),
    parentIdHex: fixedHex(rawHeader.parentId, 32, `${label} best header parent id`),
    height: nonnegativeSafeInteger(rawHeader.height, `${label} best header height`),
    extensionRootHex: fixedHex(
      extensionRootHex ?? extensionHashHex,
      32,
      `${label} best header extension root`,
    ),
  };
  if (bestHeader.height !== fullHeight) {
    throw new Error(`${label} best header height must identify full height`);
  }
  return deepFreeze({ indexedHeight, fullHeight, bestHeader });
}

function validateSnapshot(value: unknown, label: string): AuthenticatedV2StateSnapshot {
  const snapshot = record(value, label);
  exactKeys(snapshot, ['indexedHeight', 'fullHeight', 'bestHeader'], label);
  const header = record(snapshot.bestHeader, `${label} best header`);
  exactKeys(header, ['idHex', 'parentIdHex', 'height', 'extensionRootHex'], `${label} best header`);
  const normalized: AuthenticatedV2StateSnapshot = {
    indexedHeight: nonnegativeSafeInteger(snapshot.indexedHeight, `${label} indexed height`),
    fullHeight: nonnegativeSafeInteger(snapshot.fullHeight, `${label} full height`),
    bestHeader: {
      idHex: fixedHex(header.idHex, 32, `${label} best header id`),
      parentIdHex: fixedHex(header.parentIdHex, 32, `${label} best header parent id`),
      height: nonnegativeSafeInteger(header.height, `${label} best header height`),
      extensionRootHex: fixedHex(header.extensionRootHex, 32, `${label} best header extension root`),
    },
  };
  if (
    normalized.indexedHeight !== normalized.fullHeight
    || normalized.bestHeader.height !== normalized.fullHeight
  ) {
    throw new Error(`${label} must identify one synchronized indexed/full/header height`);
  }
  return deepFreeze(normalized);
}

function assertSnapshotsEqual(
  left: AuthenticatedV2StateSnapshot,
  right: AuthenticatedV2StateSnapshot,
  message: string,
): void {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(message);
}

function assertTrackerTipMatchesSnapshot(
  tracker: AuthenticatedSpvTrackerDualObservationReport,
  snapshot: AuthenticatedV2StateSnapshot,
): void {
  if (
    tracker.tracker.observedTip.idHex !== snapshot.bestHeader.idHex
    || tracker.tracker.observedTip.parentIdHex !== snapshot.bestHeader.parentIdHex
    || tracker.tracker.observedTip.height !== snapshot.fullHeight
    || tracker.tracker.observedTip.extensionRootHex !== snapshot.bestHeader.extensionRootHex
  ) {
    throw new Error('tracker reconstruction snapshot does not match the extra UTXO read snapshot');
  }
}

function assertDistinctInputBoxIds(
  trackerTipBoxIdHex: string,
  duplicatePreventionBoxIdHex: string,
  vaultBoxIdHex: string,
): void {
  if (new Set([trackerTipBoxIdHex, duplicatePreventionBoxIdHex, vaultBoxIdHex]).size !== 3) {
    throw new Error('tracker tip, DUP, and vault box IDs must all be distinct');
  }
}

function requireBinaryBoxReader(
  source: AuthenticatedSpvTrackerNodeSource,
  label: string,
): (boxId: string) => Promise<unknown | null> {
  if (typeof source.getBoxBinaryByIdOrNull !== 'function') {
    throw new Error(`${label} Ergo source does not expose bounded canonical box bytes`);
  }
  return boxId => source.getBoxBinaryByIdOrNull!(boxId);
}

async function normalizeTrackerInput(
  value: unknown,
  binaryValue: unknown,
  request: NormalizedRequest,
  tracker: AuthenticatedSpvTrackerDualObservationReport,
  snapshotHeight: number,
  label: string,
): Promise<AuthenticatedV2CanonicalBoxObservation> {
  const registerNames = ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'] as const;
  const box = normalizeCanonicalBox(value, registerNames, label);
  assertBoxCreationHeightWithinHeight(box, snapshotHeight, label);
  validateTrackerInput(box, request, tracker, label);
  return normalizeCanonicalBoxObservation(value, binaryValue, registerNames, label, box);
}

function validateTrackerInput(
  box: AuthenticatedV2CanonicalBox,
  request: NormalizedRequest,
  tracker: AuthenticatedSpvTrackerDualObservationReport,
  label: string,
): void {
  if (box.boxIdHex !== tracker.tracker.tipBoxIdHex) {
    throw new Error(`${label} does not match the reconstructed tracker tip box ID`);
  }
  if (box.ergoTreeHex !== request.trackerErgoTreeHex) {
    throw new Error(`${label} ErgoTree does not match the requested exact tree`);
  }
  assertExactSingleton(box.assets, request.trackerNftIdHex, label);
  if (
    box.additionalRegisters.R5
      !== encodeAuthenticatedSpvTrackerAvlRegister(tracker.tracker.tipDigestHex)
  ) {
    throw new Error(`${label} R5 does not match the reconstructed tracker tip digest`);
  }
  if (decodeCollByteRegister(box.additionalRegisters.R6, `${label} R6`) !== request.sidechainIdHex) {
    throw new Error(`${label} R6 does not match the requested sidechain ID`);
  }
  if (
    box.additionalRegisters.R9
      !== tracker.tracker.finalityAttestorSigmaPropRegisterHex
  ) {
    throw new Error(`${label} R9 does not match the reconstructed finality authority`);
  }
}

async function normalizeDuplicatePreventionBox(
  value: unknown,
  binaryValue: unknown,
  request: NormalizedRequest,
  trackerAuthorityRegisterHex: string,
  snapshotHeight: number,
  label: string,
): Promise<AuthenticatedV2StatefulCheckReadinessReport['duplicatePrevention']> {
  const registerNames = ['R4', 'R5', 'R6'] as const;
  const box = normalizeCanonicalBox(value, registerNames, label);
  assertBoxCreationHeightWithinHeight(box, snapshotHeight, label);
  if (box.boxIdHex !== request.duplicatePreventionBoxIdHex) {
    throw new Error(`${label} does not match the requested exact box ID`);
  }
  if (box.ergoTreeHex !== request.duplicatePreventionErgoTreeHex) {
    throw new Error(`${label} ErgoTree does not match the requested exact tree`);
  }
  assertExactSingleton(box.assets, request.duplicatePreventionNftIdHex, label);
  const counter = decodeCanonicalLongRegister(box.additionalRegisters.R4, `${label} R4`);
  if (counter < 0n) throw new Error(`${label} R4 counter must be nonnegative`);
  const avl = decodeCanonicalInsertAvl(box.additionalRegisters.R5, `${label} R5`);
  const publicKeyHex = decodeCanonicalDlogSigmaPropRegister(
    box.additionalRegisters.R6,
    `${label} R6`,
  );
  const trackerAuthorityKey = decodeCanonicalDlogSigmaPropRegister(
    trackerAuthorityRegisterHex,
    'tracker R9',
  );
  if (publicKeyHex === trackerAuthorityKey) {
    throw new Error('DUP box R6 authority must be distinct from tracker R9 authority');
  }
  const observation = await normalizeCanonicalBoxObservation(
    value,
    binaryValue,
    registerNames,
    label,
    box,
  );
  return deepFreeze({
    ...observation,
    counter: counter.toString(),
    avl,
    authority: {
      registerHex: box.additionalRegisters.R6,
      publicKeyHex,
    },
  });
}

async function normalizeVaultBox(
  value: unknown,
  binaryValue: unknown,
  request: NormalizedRequest,
  snapshotHeight: number,
  label: string,
): Promise<AuthenticatedV2StatefulCheckReadinessReport['vault']> {
  const registerNames = ['R4', 'R5', 'R6', 'R7'] as const;
  const box = normalizeCanonicalBox(value, registerNames, label);
  assertBoxCreationHeightWithinHeight(box, snapshotHeight, label);
  if (box.boxIdHex !== request.vaultBoxIdHex) {
    throw new Error(`${label} does not match the requested exact box ID`);
  }
  if (box.ergoTreeHex !== request.vaultErgoTreeHex) {
    throw new Error(`${label} ErgoTree does not match the requested exact tree`);
  }
  if (box.assets.length !== 0) throw new Error(`${label} must be pure ERG`);
  if (box.valueNanoErg < request.minimumRequiredVaultValueNanoErg) {
    throw new Error(`${label} value is below the requested minimum`);
  }
  const decodedRegisters = decodeVaultRegisters(box.additionalRegisters, label);
  const observation = await normalizeCanonicalBoxObservation(
    value,
    binaryValue,
    registerNames,
    label,
    box,
  );
  return deepFreeze({
    ...observation,
    ...decodedRegisters,
  });
}

async function normalizeCanonicalBoxObservation(
  value: unknown,
  binaryValue: unknown,
  registerNames: readonly string[],
  label: string,
  box: AuthenticatedV2CanonicalBox,
): Promise<AuthenticatedV2CanonicalBoxObservation> {
  if (binaryValue === null) {
    throw new Error(`${label} canonical binary is not present as an unspent UTXO`);
  }
  const binaryResponse = record(binaryValue, `${label} canonical binary response`);
  const sigmaSerializedHex = variableHex(
    binaryResponse.bytes,
    MAX_SERIALIZED_BOX_BYTES,
    `${label} canonical binary bytes`,
  );
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(value));
  } catch (error: any) {
    throw new Error(
      `${label} JSON is not a canonical EIP-12 Ergo box with a valid derived box ID: `
      + `${error?.message ?? String(error)}`,
    );
  }
  try {
    const canonicalSerializedHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (canonicalSerializedHex !== sigmaSerializedHex) {
      throw new Error(`${label} JSON and canonical binary observations do not match`);
    }
    const canonicalBox = normalizeCanonicalBox(
      parsed.to_js_eip12(),
      registerNames,
      `${label} canonical JSON`,
    );
    if (canonicalJson(canonicalBox) !== canonicalJson(box)) {
      throw new Error(`${label} normalized JSON does not match its canonical EIP-12 box`);
    }
  } finally {
    parsed.free?.();
  }
  return deepFreeze({
    box,
    sigmaSerializedHex,
    sigmaSerializedSha256Hex: sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')),
  });
}

async function validateCanonicalBoxObservationReport(
  value: unknown,
  registerNames: readonly string[],
  label: string,
): Promise<AuthenticatedV2CanonicalBoxObservation> {
  const observation = record(value, label);
  const box = validateCanonicalBoxReport(observation.box, registerNames, label);
  const sigmaSerializedHex = variableHex(
    observation.sigmaSerializedHex,
    MAX_SERIALIZED_BOX_BYTES,
    `${label} canonical binary bytes`,
  );
  const sigmaSerializedSha256Hex = fixedHex(
    observation.sigmaSerializedSha256Hex,
    32,
    `${label} canonical binary digest`,
  );
  if (sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')) !== sigmaSerializedSha256Hex) {
    throw new Error(`${label} canonical binary digest does not match its bytes`);
  }
  return normalizeCanonicalBoxObservation(
    canonicalBoxToEip12Json(box),
    { bytes: sigmaSerializedHex },
    registerNames,
    label,
    box,
  );
}

function canonicalBoxToEip12Json(box: AuthenticatedV2CanonicalBox): Record<string, unknown> {
  return {
    boxId: box.boxIdHex,
    transactionId: box.transactionIdHex,
    index: box.outputIndex,
    value: box.valueNanoErg,
    ergoTree: box.ergoTreeHex,
    assets: box.assets.map(asset => ({
      tokenId: asset.tokenIdHex,
      amount: asset.amount,
    })),
    additionalRegisters: { ...box.additionalRegisters },
    creationHeight: box.creationHeight,
  };
}

function normalizeCanonicalBox(
  value: unknown,
  registerNames: readonly string[],
  label: string,
): AuthenticatedV2CanonicalBox {
  if (value === null) throw new Error(`${label} is not present as an unspent UTXO`);
  const raw = record(value, label);
  if (raw.spentTransactionId !== undefined && raw.spentTransactionId !== null) {
    throw new Error(`${label} must be currently unspent`);
  }
  if (raw.spendingProof !== undefined && raw.spendingProof !== null) {
    throw new Error(`${label} must not expose a spending proof while currently unspent`);
  }
  if (!Array.isArray(raw.assets)) throw new Error(`${label} assets must be an array`);
  const assets = raw.assets.map((asset, index) => normalizeRawAsset(asset, `${label} asset ${index}`));
  if (new Set(assets.map(asset => asset.tokenIdHex)).size !== assets.length) {
    throw new Error(`${label} assets must not contain duplicate token IDs`);
  }
  const registers = record(raw.additionalRegisters, `${label} registers`);
  exactKeys(registers, registerNames, `${label} registers`);
  const additionalRegisters: Record<string, string> = {};
  for (const name of registerNames) {
    additionalRegisters[name] = variableHex(registers[name], MAX_REGISTER_BYTES, `${label} ${name}`);
  }
  return deepFreeze({
    boxIdHex: fixedHex(raw.boxId, 32, `${label} id`),
    transactionIdHex: fixedHex(raw.transactionId, 32, `${label} transaction id`),
    outputIndex: nonnegativeSafeInteger(raw.index, `${label} output index`),
    creationHeight: nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`),
    valueNanoErg: positiveSafeInteger(raw.value, `${label} value`),
    ergoTreeHex: variableHex(raw.ergoTree, MAX_ERGO_TREE_BYTES, `${label} ErgoTree`),
    assets: Object.freeze(assets),
    additionalRegisters: Object.freeze(additionalRegisters),
  });
}

function validateCanonicalBoxReport(
  value: unknown,
  registerNames: readonly string[],
  label: string,
): AuthenticatedV2CanonicalBox {
  const box = record(value, label);
  exactKeys(box, [
    'boxIdHex',
    'transactionIdHex',
    'outputIndex',
    'creationHeight',
    'valueNanoErg',
    'ergoTreeHex',
    'assets',
    'additionalRegisters',
  ], label);
  if (!Array.isArray(box.assets)) throw new Error(`${label} assets must be an array`);
  const assets = box.assets.map((asset, index) => normalizeReportAsset(asset, `${label} asset ${index}`));
  if (new Set(assets.map(asset => asset.tokenIdHex)).size !== assets.length) {
    throw new Error(`${label} assets must not contain duplicate token IDs`);
  }
  const registers = record(box.additionalRegisters, `${label} registers`);
  exactKeys(registers, registerNames, `${label} registers`);
  const additionalRegisters: Record<string, string> = {};
  for (const name of registerNames) {
    additionalRegisters[name] = variableHex(registers[name], MAX_REGISTER_BYTES, `${label} ${name}`);
  }
  return deepFreeze({
    boxIdHex: fixedHex(box.boxIdHex, 32, `${label} id`),
    transactionIdHex: fixedHex(box.transactionIdHex, 32, `${label} transaction id`),
    outputIndex: nonnegativeSafeInteger(box.outputIndex, `${label} output index`),
    creationHeight: nonnegativeSafeInteger(box.creationHeight, `${label} creation height`),
    valueNanoErg: positiveSafeInteger(box.valueNanoErg, `${label} value`),
    ergoTreeHex: variableHex(box.ergoTreeHex, MAX_ERGO_TREE_BYTES, `${label} ErgoTree`),
    assets: Object.freeze(assets),
    additionalRegisters: Object.freeze(additionalRegisters),
  });
}

function normalizeRawAsset(value: unknown, label: string): AuthenticatedV2CanonicalAsset {
  const asset = record(value, label);
  exactKeys(asset, ['tokenId', 'amount'], label);
  return Object.freeze({
    tokenIdHex: fixedHex(asset.tokenId, 32, `${label} token id`),
    amount: canonicalPositiveIntegerString(asset.amount, `${label} amount`),
  });
}

function normalizeReportAsset(value: unknown, label: string): AuthenticatedV2CanonicalAsset {
  const asset = record(value, label);
  exactKeys(asset, ['tokenIdHex', 'amount'], label);
  return Object.freeze({
    tokenIdHex: fixedHex(asset.tokenIdHex, 32, `${label} token id`),
    amount: canonicalPositiveIntegerString(asset.amount, `${label} amount`),
  });
}

function assertExactSingleton(
  assets: readonly AuthenticatedV2CanonicalAsset[],
  expectedNftIdHex: string,
  label: string,
): void {
  if (assets.length !== 1) throw new Error(`${label} must contain exactly one expected NFT`);
  if (assets[0].tokenIdHex !== expectedNftIdHex) {
    throw new Error(`${label} NFT ID does not match the expected NFT`);
  }
  if (assets[0].amount !== '1') throw new Error(`${label} NFT amount must be 1`);
}

function assertBoxCreationHeightWithinSnapshot(
  box: AuthenticatedV2CanonicalBox,
  snapshot: AuthenticatedV2StateSnapshot,
  label: string,
): void {
  assertBoxCreationHeightWithinHeight(box, snapshot.fullHeight, label);
}

function assertBoxCreationHeightWithinHeight(
  box: AuthenticatedV2CanonicalBox,
  snapshotHeight: number,
  label: string,
): void {
  if (box.creationHeight > snapshotHeight) {
    throw new Error(`${label} creation height exceeds the stable snapshot height`);
  }
}

function decodeCanonicalInsertAvl(registerHex: string, label: string) {
  const clean = variableHex(registerHex, 38, label);
  if (clean.length !== 76 || !clean.startsWith('64')) {
    throw new Error(`${label} must be a canonical AvlTree register`);
  }
  if (clean.slice(70, 72) !== '20' || clean.slice(72) !== '0101') {
    throw new Error(`${label} must use 32-byte keys and one-byte values`);
  }
  const flags = Number.parseInt(clean.slice(68, 70), 16);
  if ((flags & 0x01) === 0) throw new Error(`${label} must permit append-only inserts`);
  return Object.freeze({
    registerHex: clean,
    digestHex: clean.slice(2, 68),
    flags,
    insertEnabled: true as const,
    keyLength: 32 as const,
    valueLength: 1 as const,
  });
}

function decodeVaultRegisters(registers: Readonly<Record<string, string>>, label: string) {
  const depositIdHex = decodeCollByteRegister(registers.R4, `${label} R4`);
  if (depositIdHex.length !== 64) throw new Error(`${label} R4 must contain exactly 32 bytes`);
  const targetEvmAddressHex = decodeCollByteRegister(registers.R5, `${label} R5`);
  if (targetEvmAddressHex.length !== 40) throw new Error(`${label} R5 must contain exactly 20 bytes`);
  const amount = decodeCanonicalLongRegister(registers.R6, `${label} R6`);
  if (amount <= 0n) throw new Error(`${label} R6 must contain a positive canonical Long`);
  const provenanceHex = decodeBoundedCollByteRegister(
    registers.R7,
    `${label} R7`,
    MAX_VAULT_PROVENANCE_BYTES,
  );
  if (provenanceHex.length === 0) throw new Error(`${label} R7 must contain nonempty bounded bytes`);
  return Object.freeze({
    depositIdHex,
    targetEvmAddressHex,
    amountNanoErg: amount.toString(),
    provenanceHex,
  });
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = stringValue(value, label);
  if (normalized.length !== bytes * 2 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return normalized;
}

function variableHex(value: unknown, maxBytes: number, label: string): string {
  const normalized = stringValue(value, label);
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || normalized.length > maxBytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty canonical lowercase hex within ${maxBytes} bytes`);
  }
  return normalized;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const normalized = typeof value === 'string'
    ? canonicalPositiveIntegerString(value, label)
    : value;
  const number = typeof normalized === 'string' ? Number(normalized) : normalized;
  if (!Number.isSafeInteger(number) || Number(number) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(number);
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function canonicalPositiveIntegerString(value: unknown, label: string): string {
  const normalized = typeof value === 'number'
    ? (Number.isSafeInteger(value) ? String(value) : '')
    : value;
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${label} must be a canonical positive integer`);
  }
  const parsed = BigInt(normalized);
  if (parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds the positive signed Long range`);
  }
  return normalized;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function exactKeys(value: Record<string, any>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields do not match the canonical schema`);
  }
}

function validateExactBooleanRecord(
  value: unknown,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  const actual = record(value, label);
  exactKeys(actual, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) throw new Error(`${label}.${key} must be ${expectedValue}`);
  }
}

function sha256Canonical(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalJson(value), 'utf8'));
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
