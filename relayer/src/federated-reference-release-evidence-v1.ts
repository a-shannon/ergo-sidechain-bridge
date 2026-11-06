import { types } from 'node:util';
import { assertNoDuplicateJsonKeys, canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { validateSubstrateFederatedNativeTwoCycleResultV1 } from './substrate-federated-native-two-cycle-result-codec-v1.js';

export const FED_REFERENCE_EVIDENCE_SCHEMA_V1 = 'e2s.federated-reference-release-evidence.v1' as const;
export const FED_REFERENCE_PROFILE_V1 = 'substrate-federated-v1' as const;
export const FED_REFERENCE_PURPOSE_V1 = 'fed-reference-preparation' as const;
const DOMAIN = 'E2S_FEDERATED_REFERENCE_RELEASE_EVIDENCE_V1';
export const FED_REFERENCE_OPEN_OBLIGATIONS_V1 = Object.freeze([
  'canonical-one-use-launcher-graph', 'accumulated-state-recovery',
  'external-operator-reproduction', 'independent-operator-custody',
  'final-candidate-assurance-and-dependencies', 'real-external-fed7-acceptance',
] as const);
const MAX_BYTES = 64 * 1024;
const CLAIMS = Object.freeze({
  lifecycleEstablished: false, recoveryEstablished: false,
  independentOperatorCustodyEstablished: false, externalAcceptanceEstablished: false,
  releaseReadinessEstablished: false, productionReadinessEstablished: false,
  sourceFinalityEstablished: false, trustless: false, publicNetworkUsed: false, realFundsUsed: false,
});
export interface FederatedReferenceReleaseEvidenceV1 {
  readonly schema: typeof FED_REFERENCE_EVIDENCE_SCHEMA_V1;
  readonly version: 1;
  readonly settlementProfileId: typeof FED_REFERENCE_PROFILE_V1;
  readonly evidencePurpose: typeof FED_REFERENCE_PURPOSE_V1;
  readonly environment: 'synthetic-loopback';
  readonly candidate: Readonly<{ bridgeCommit: string; bridgeTree: string }>;
  readonly parentResult: Readonly<Record<string, unknown>> | null;
  readonly checks: Readonly<{ publicParentResultValidated: boolean }>;
  readonly openObligations: typeof FED_REFERENCE_OPEN_OBLIGATIONS_V1;
  readonly claims: typeof CLAIMS;
  readonly releaseStatus: 'BLOCKED';
  readonly receiptDigestHex: string;
}

// This version validates public receipt structure. It cannot close operational or external gates.
export function createFederatedReferenceReleaseEvidenceV1(
  candidate: Readonly<{ bridgeCommit: string; bridgeTree: string }>,
  parentResult: unknown = null,
): Readonly<FederatedReferenceReleaseEvidenceV1> {
  const clean = plainJson({ candidate, parentResult });
  const input = record(clean, ['candidate', 'parentResult']);
  const identity = record(input.candidate, ['bridgeCommit', 'bridgeTree']);
  hex(identity.bridgeCommit, 40); hex(identity.bridgeTree, 40);
  const parent = input.parentResult === null ? null : validateParent(input.parentResult, identity);
  const body = {
    schema: FED_REFERENCE_EVIDENCE_SCHEMA_V1, version: 1 as const,
    settlementProfileId: FED_REFERENCE_PROFILE_V1, evidencePurpose: FED_REFERENCE_PURPOSE_V1,
    environment: 'synthetic-loopback' as const,
    candidate: { bridgeCommit: identity.bridgeCommit as string, bridgeTree: identity.bridgeTree as string },
    parentResult: parent, checks: { publicParentResultValidated: parent !== null },
    openObligations: FED_REFERENCE_OPEN_OBLIGATIONS_V1, claims: CLAIMS, releaseStatus: 'BLOCKED' as const,
  };
  return Object.freeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, DOMAIN) });
}

export function validateFederatedReferenceReleaseEvidenceV1(value: unknown): Readonly<FederatedReferenceReleaseEvidenceV1> {
  const report = record(plainJson(value), [
    'schema', 'version', 'settlementProfileId', 'evidencePurpose', 'environment', 'candidate',
    'parentResult', 'checks', 'openObligations', 'claims', 'releaseStatus', 'receiptDigestHex',
  ]);
  const candidate = record(report.candidate, ['bridgeCommit', 'bridgeTree']);
  const expected = createFederatedReferenceReleaseEvidenceV1(candidate as unknown as { bridgeCommit: string; bridgeTree: string }, report.parentResult);
  if (canonicalJson(report) !== canonicalJson(expected)) throw new Error('FED reference report fields or canonical digest differ');
  return expected;
}

export function parseFederatedReferenceReleaseEvidenceV1(text: string): Readonly<FederatedReferenceReleaseEvidenceV1> {
  const value = parseFederatedReferenceJsonV1(text);
  const report = validateFederatedReferenceReleaseEvidenceV1(value);
  if (text !== `${canonicalJson(report)}\n`) throw new Error('FED reference report must use canonical JSON and one LF');
  return report;
}

export function parseFederatedReferenceJsonV1(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('FED reference JSON exceeds bounded size');
  assertNoDuplicateJsonKeys(text);
  return plainJson(JSON.parse(text));
}

function validateParent(value: unknown, candidate: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const parent = record(value, [
    'schema', 'version', 'status', 'configSha256Hex', 'bridgeCommit', 'bridgeTree',
    'pathIdentityDigestHex', 'toolIdentityDigestHex', 'result', 'checks', 'boundaries', 'receiptDigestHex',
  ]);
  if (parent.schema !== 'e2s.substrate-federated-native-two-cycle-terminal.v1' || parent.version !== 1
    || parent.status !== 'two_cycle_local_synthetic_execution_completed') throw new Error('FED public parent result identity differs');
  for (const key of ['configSha256Hex', 'pathIdentityDigestHex', 'toolIdentityDigestHex', 'receiptDigestHex']) hex(parent[key], 64);
  if (parent.bridgeCommit !== candidate.bridgeCommit || parent.bridgeTree !== candidate.bridgeTree) throw new Error('FED public parent candidate differs');
  const checks = record(parent.checks, [
    'startRecordedBeforeWorkerLaunch', 'workerExitedCleanlyWithoutOutput', 'workerTransportValidated',
    'repositoryAndToolsRevalidatedAfterRootCleanup', 'terminalArtifactCreatedOnce',
  ]);
  if (Object.values(checks).some(value => value !== true)) throw new Error('FED public parent checks differ');
  const boundaries = record(parent.boundaries, [
    'localSyntheticExecutionOnly', 'trustedHostAndCachesRequired', 'parentRuntimeAttestedBeforeInitialTsxLoad',
    'independentOperatorCustodyEstablished', 'releaseReadinessEstablished', 'productionReadinessEstablished',
  ]);
  if (boundaries.localSyntheticExecutionOnly !== true || boundaries.trustedHostAndCachesRequired !== true
    || Object.entries(boundaries).some(([key, value]) => !['localSyntheticExecutionOnly', 'trustedHostAndCachesRequired'].includes(key) && value !== false)) {
    throw new Error('FED public parent boundaries differ');
  }
  validateSubstrateFederatedNativeTwoCycleResultV1(parent.result);
  const { receiptDigestHex, ...body } = parent;
  if (receiptDigestHex !== sha256CanonicalJson(body, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_TERMINAL_V1')) throw new Error('FED public parent canonical digest differs');
  return Object.freeze(parent);
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('FED reference record required');
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new Error('FED reference record keys differ');
  return result;
}
function hex(value: unknown, length: number): void {
  if (typeof value !== 'string' || value.length !== length || !/^[0-9a-f]+$/u.test(value)) throw new Error('FED reference lowercase identity differs');
}

// Inspect descriptors only after rejecting proxies; never execute an input getter or toJSON.
function plainJson(value: unknown): unknown {
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (current: unknown, depth: number): void => {
    if (++nodes > 4096 || depth > 32) throw new Error('FED reference JSON graph exceeds bounded size');
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return;
    if (typeof current === 'number' && Number.isSafeInteger(current)) return;
    if (typeof current !== 'object' || types.isProxy(current)) throw new Error('FED reference plain JSON required');
    if (seen.has(current)) throw new Error('FED reference JSON graph aliases or cycles');
    seen.add(current);
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('FED reference plain JSON prototype differs');
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    for (const key of keys) {
      if (typeof key !== 'string' || key === 'toJSON') throw new Error('FED reference JSON property differs');
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value') || (!descriptor.enumerable && !(array && key === 'length'))) throw new Error('FED reference JSON accessor or hidden field');
      if (array && key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)) throw new Error('FED reference JSON array property differs');
      if (key !== 'length' || !array) visit(descriptor.value, depth + 1);
    }
    if (array && keys.length !== (current as unknown[]).length + 1) throw new Error('FED reference JSON array has holes');
  };
  visit(value, 0);
  const text = canonicalJson(value);
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('FED reference JSON exceeds bounded size');
  return JSON.parse(text);
}
