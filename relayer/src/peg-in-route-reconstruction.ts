/**
 * Reconstruct the complete Ergo-side peg-in route view from two bounded,
 * read-only sources. The result is suitable only for replacing a local cache;
 * it cannot create or restore peg-in lifecycle or mint authority.
 */

import {
  assessPegInRouteObservation,
  type AssessPegInRouteObservationInput,
  type PegInRouteObservationAssessment,
  type PegInRouteObservationBlocker,
  type PegInRouteObservationClassification,
} from './peg-in-route-observation.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

export const PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA =
  'e2s.peg-in-route-reconstruction.v1';

export const PEG_IN_ROUTE_RECONSTRUCTION_DIGEST_DOMAIN =
  'e2s.peg-in-route-reconstruction.digest.v1';
const validatedReconstructions = new WeakSet<object>();

type AssessmentPrimary =
  PegInRouteObservationAssessment['networkObservation']['primary'];

export interface PegInRouteReconstructionDeposit {
  readonly addressBoxIndex: number;
  readonly boxIdHex: string;
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly creationHeight: number;
  readonly valueNanoErg: string;
  readonly spentTransactionIdHex: string | null;
  readonly targetEvmAddressHex: string;
  readonly declaredAmountNanoErg: string;
  readonly signerMetadataHex: string;
  readonly depositorErgoTreeHex: string;
  readonly classification: 'refundable' | 'commit_pending' | 'committed' | 'refunded' | 'unresolved';
  readonly transition: null | Readonly<{
    spendingTransactionIdHex: string;
    inclusionHeight: number;
    inclusionBlockIdHex: string;
    confirmations: number;
    vaultBoxIdHex: string | null;
  }>;
}

export interface PegInRouteReconstructionLegacyRoute {
  readonly ordinal: number;
  readonly version: string;
  readonly address: string;
  readonly historyBoxIdsHex: readonly string[];
  readonly currentBoxIdsHex: readonly string[];
}

export interface PegInRouteReconstruction {
  readonly schema: typeof PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA;
  readonly observedAt: string;
  readonly reconstructionDigestHex: string;
  readonly manifest: Readonly<PegInRouteObservationAssessment['manifest']>;
  readonly routeBindings: Readonly<PegInRouteObservationAssessment['routeBindings']>;
  readonly network: Readonly<{
    networkId: string;
    snapshot: Readonly<AssessmentPrimary['snapshotAfter']>;
    anchorHeader: Readonly<AssessmentPrimary['anchorHeader']>;
  }>;
  readonly sources: Readonly<{ primary: string; witness: string }>;
  readonly observationDigestHex: string;
  readonly decision: Readonly<{
    classification: PegInRouteObservationClassification;
    observationConditionMet: boolean;
    blockers: readonly PegInRouteObservationBlocker[];
  }>;
  readonly activeHistory: readonly PegInRouteReconstructionDeposit[];
  readonly activeCurrentBoxIdsHex: readonly string[];
  readonly vaultHistoryBoxIdsHex: readonly string[];
  readonly vaultCurrentBoxIdsHex: readonly string[];
  readonly legacyRoutes: readonly PegInRouteReconstructionLegacyRoute[];
  readonly boundary: Readonly<{
    completeDualSourceErgoRouteView: true;
    localPersistenceIsReplaceableCache: true;
    observationConditionDoesNotAuthorizeMint: true;
    noPegInLifecycleAuthorityRestored: true;
    noSidechainMintStateInferred: true;
    noSigningSubmissionOrBroadcastAuthority: true;
    distinctOriginsDetectDisagreementButDoNotProveConsensus: true;
  }>;
}

export type PegInRouteReconstructionSemantic = Omit<
  PegInRouteReconstruction,
  'observedAt' | 'reconstructionDigestHex'
>;

export const PEG_IN_ROUTE_RECONSTRUCTION_BOUNDARY = deepFreeze({
  completeDualSourceErgoRouteView: true as const,
  localPersistenceIsReplaceableCache: true as const,
  observationConditionDoesNotAuthorizeMint: true as const,
  noPegInLifecycleAuthorityRestored: true as const,
  noSidechainMintStateInferred: true as const,
  noSigningSubmissionOrBroadcastAuthority: true as const,
  distinctOriginsDetectDisagreementButDoNotProveConsensus: true as const,
});

export function pegInRouteReconstructionDigestHex(
  semantic: PegInRouteReconstructionSemantic,
): string {
  return sha256CanonicalJson(
    semantic,
    PEG_IN_ROUTE_RECONSTRUCTION_DIGEST_DOMAIN,
  );
}

export async function reconstructPegInRouteFromDistinctSources(
  input: AssessPegInRouteObservationInput,
): Promise<PegInRouteReconstruction> {
  const assessment = await assessPegInRouteObservation(input);
  const primary = assessment.networkObservation.primary;
  const witness = assessment.networkObservation.witness;

  if (
    !assessment.networkObservation.exactObservationAgreement
    || !primary.stable
    || !witness.stable
    || primary.observationDigestHex !== witness.observationDigestHex
  ) {
    throw new Error('peg-in route reconstruction requires one exact stable dual-source view');
  }
  const snapshots = [
    primary.snapshotBefore,
    primary.snapshotAfter,
    witness.snapshotBefore,
    witness.snapshotAfter,
  ];
  const snapshotIdentity = canonicalJson(snapshots[0]);
  if (snapshots.some(snapshot => canonicalJson(snapshot) !== snapshotIdentity)) {
    throw new Error('peg-in route reconstruction sources were captured out of order');
  }

  const semantic = canonicalizeReconstructionSemantic({
    schema: PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA as typeof PEG_IN_ROUTE_RECONSTRUCTION_SCHEMA,
    manifest: clone(assessment.manifest),
    routeBindings: clone(assessment.routeBindings),
    network: {
      networkId: assessment.networkObservation.networkId,
      snapshot: clone(primary.snapshotAfter),
      anchorHeader: clone(primary.anchorHeader),
    },
    sources: {
      primary: primary.sourceId,
      witness: witness.sourceId,
    },
    observationDigestHex: primary.observationDigestHex,
    decision: {
      classification: assessment.decision.classification,
      observationConditionMet: assessment.decision.observationConditionMet,
      blockers: clone(assessment.decision.blockers),
    },
    activeHistory: clone(primary.activeHistory) as PegInRouteReconstructionDeposit[],
    activeCurrentBoxIdsHex: [...primary.activeCurrentBoxIdsHex],
    vaultHistoryBoxIdsHex: [...primary.vaultHistoryBoxIdsHex],
    vaultCurrentBoxIdsHex: [...primary.vaultCurrentBoxIdsHex],
    legacyRoutes: clone(primary.legacyRoutes) as PegInRouteReconstructionLegacyRoute[],
    boundary: PEG_IN_ROUTE_RECONSTRUCTION_BOUNDARY,
  });
  const reconstruction = deepFreeze<PegInRouteReconstruction>({
    ...semantic,
    observedAt: assessment.generatedAt,
    reconstructionDigestHex: pegInRouteReconstructionDigestHex(semantic),
  });
  validatedReconstructions.add(reconstruction);
  return reconstruction;
}

export function assertPegInRouteReconstructionProvenance(
  value: unknown,
): asserts value is PegInRouteReconstruction {
  if (
    !value
    || typeof value !== 'object'
    || !validatedReconstructions.has(value)
  ) {
    throw new Error('peg-in route reconstruction provenance is missing');
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalizeReconstructionSemantic(
  semantic: PegInRouteReconstructionSemantic,
): PegInRouteReconstructionSemantic {
  return {
    ...semantic,
    activeHistory: [...semantic.activeHistory].sort((left, right) => (
      left.addressBoxIndex - right.addressBoxIndex
      || left.boxIdHex.localeCompare(right.boxIdHex)
    )),
    activeCurrentBoxIdsHex: [...semantic.activeCurrentBoxIdsHex].sort(),
    vaultHistoryBoxIdsHex: [...semantic.vaultHistoryBoxIdsHex].sort(),
    vaultCurrentBoxIdsHex: [...semantic.vaultCurrentBoxIdsHex].sort(),
    legacyRoutes: semantic.legacyRoutes
      .map(route => ({
        ...route,
        historyBoxIdsHex: [...route.historyBoxIdsHex].sort(),
        currentBoxIdsHex: [...route.currentBoxIdsHex].sort(),
      }))
      .sort((left, right) => left.ordinal - right.ordinal),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
