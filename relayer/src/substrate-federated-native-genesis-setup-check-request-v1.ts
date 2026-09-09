import blakejs from 'blakejs';

import { createBoundedAuthenticatedSpvTrackerReadOnlySource } from './authenticated-spv-tracker-read-only-node-client.js';
import { toUnsignedTransactionJson } from './ergo-unsigned-transaction.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisNodeSource,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2,
  SubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';
import {
  validateObservedSubstrateFederatedGenesisV1,
  type ObservedSubstrateFederatedGenesisV1,
} from './substrate-federated-observed-genesis-v1.js';

export const SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA =
  'e2s.substrate-federated-native-genesis-setup-check-request.v1' as const;
const DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V1';
// These domains describe shared transaction data, not historical provisioning authority.
const BODY_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_UNSIGNED_BODY_V1';
const MATERIALIZED_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MATERIALIZED_TX_V1';
const OUTPUT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OUTPUT_BODY_V2';
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const MAX_AGE_MS = 60_000 as const;
const KEYS = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const ROLES = ['tracker', 'duplicate-prevention', 'pooled-reserve'] as const;
type Target = Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
type Compiled = Readonly<ObservedSubstrateFederatedGenesisV1>;

export interface SubstrateFederatedNativeGenesisSetupCheckRequestV1 extends Omit<
  SubstrateFederatedIsolatedDevnetSetupCheckRequestV2, 'schema' | 'version' | 'sourceBindings'
> {
  readonly schema: typeof SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA;
  readonly version: 1;
  readonly sourceBindings: Readonly<{
    compilerProfile: 'fed-native-height-zero-v1';
    nativeGenesisCandidateDigestHex: string;
    nativeGenesisIdentityDigestHex: string;
    familyIdHex: string;
    runtimeProfileIdHex: string;
    trackerCompilerRequestDigestHex: string;
    trackerCompilerReceiptDigestHex: string;
    familyCompilerRequestDigestHex: string;
    familyCompilerReceiptDigestHex: string;
    originalDiscoveryDigestHex: string;
    originalHistoryDigestHex: string;
    issuanceSetDigestHex: string;
    processBindingDigestHex: string;
    executionTargetIdentityDigestHex: string;
    freshObservationDigestHex: string;
    independentOperatorsEstablished: false;
    historicalReplayBaselineEstablished: false;
  }>;
}

interface Retained {
  readonly compiled: Compiled;
  readonly target: Target;
  readonly profile: Readonly<SubstrateFederatedGenesisTargetProfileV1>;
}
const requests = new WeakMap<object, Readonly<Retained>>();

/** Freeze a native FED request; no history approval, signing or funds authority is granted. */
export async function buildSubstrateFederatedNativeGenesisSetupCheckRequestV1(
  input: Readonly<{ compiled: Compiled; target: Target }>,
): Promise<Readonly<SubstrateFederatedNativeGenesisSetupCheckRequestV1>> {
  const { compiled, target } = input;
  const source = sourceBindings(compiled, target);
  const profile = makeProfile(compiled, target, source);
  const retained = Object.freeze({ compiled, target, profile });
  const assertCurrent = () => assertSourceUnchanged(retained, source);
  const orderedIssuances = await deriveIssuances(compiled, assertCurrent);
  assertCurrent();
  const observation = await freshObservation(retained, assertCurrent);
  assertCurrent();
  const body = freeze({
    schema: SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA,
    version: 1 as const,
    status: 'exact_non_executable_local_setup_check_request' as const,
    sourceBindings: { ...source, freshObservationDigestHex: observation.reportDigestHex },
    target: {
      sourceNetworkScope: 'isolated-devnet' as const,
      settlementNetworkScope: 'ergo-local-devnet' as const,
      environment: 'devnet' as const,
      nodeReportedNetwork: 'devnet' as const,
      genesisHeaderIdHex: profile.expectedGenesisHeaderIdHex,
      profileIdHex: profile.profileIdHex,
      profileDigestHex: profile.profileDigestHex,
      preSetupAnchor: {
        headerIdHex: compiled.discovery.target.tipHeaderIdHex,
        height: compiled.discovery.target.tipHeight,
      },
      observedAt: observation.observedAt,
      maximumObservationAgeMs: MAX_AGE_MS,
      primary: { nodeOrigin: PRIMARY, sourceIdHex: profile.sources.primary.sourceIdHex },
      witness: { nodeOrigin: WITNESS, sourceIdHex: profile.sources.witness.sourceIdHex },
    },
    checkPolicy: {
      signingNetworkPrefix: 16 as const,
      stateContext: { nodeOrigin: PRIMARY, method: 'GET' as const, path: '/blocks/lastHeaders/10' as const },
      nodeCheck: { nodeOrigin: PRIMARY, method: 'POST' as const, path: '/transactions/check' as const,
        transactionOrder: [...ROLES] },
      sameOriginRequired: true as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
      submissionEndpointPresent: false as const,
      broadcastEndpointPresent: false as const,
    },
    orderedIssuances,
    stages: {
      requestFreeze: 'complete' as const, unsignedBytes: 'complete' as const,
      signedBytes: 'absent' as const, jvmCheck: 'not-performed' as const,
      nodeCheck: 'not-performed' as const, submission: 'not-authorized' as const,
      broadcast: 'not-authorized' as const, confirmation: 'not-established' as const,
    },
    boundaries: {
      containsSignedTransactionBytes: false as const, containsPrivateKeyOrSignerMaterial: false as const,
      containsSignerCapability: false as const, containsJvmCheckerCapability: false as const,
      containsNodeClientOrTransportCapability: false as const, containsSubmissionCapability: false as const,
      containsBroadcastCapability: false as const, v1TestnetPromotionAccepted: false as const,
      targetNodeAcceptanceEstablished: false as const, setupTransactionsSigned: false as const,
      setupTransactionsSubmitted: false as const, setupTransactionsBroadcast: false as const,
      canonicalLineagesEstablished: false as const, profileActivated: false as const,
      fundsAuthorityEstablished: false as const, gate5Closed: false as const,
      trustlessStatusEstablished: false as const, productionReadinessEstablished: false as const,
    },
  });
  assertFresh(body.target.observedAt);
  const request = freeze({ ...body, requestDigestHex: sha256CanonicalJson(body, DOMAIN) });
  requests.set(request, retained);
  return request;
}

export function assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(
  value: unknown,
  target?: Target,
): asserts value is Readonly<SubstrateFederatedNativeGenesisSetupCheckRequestV1> {
  const retained = value !== null && typeof value === 'object' ? requests.get(value) : undefined;
  if (!retained) throw new Error('native FED setup request lacks process provenance');
  if (target !== undefined && target !== retained.target) {
    throw new Error('native FED setup request belongs to another target');
  }
  const request = value as Readonly<SubstrateFederatedNativeGenesisSetupCheckRequestV1>;
  const { requestDigestHex, ...body } = request;
  if (!Object.isFrozen(request) || request.schema !== SUBSTRATE_FEDERATED_NATIVE_GENESIS_SETUP_CHECK_REQUEST_V1_SCHEMA
    || request.version !== 1 || requestDigestHex !== sha256CanonicalJson(body, DOMAIN)) {
    throw new Error('native FED setup request identity drifted');
  }
  const { freshObservationDigestHex: _fresh, ...source } = request.sourceBindings;
  assertSourceUnchanged(retained, source);
  assertFresh(request.target.observedAt);
}

export async function assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance(
  value: unknown,
): Promise<void> {
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value);
  const retained = requests.get(value)!;
  const issuances = await deriveIssuances(retained.compiled,
    () => assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value));
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value);
  if (canonicalJson(issuances) !== canonicalJson(value.orderedIssuances)) {
    throw new Error('native FED setup request issuance bytes drifted');
  }
}

export async function reobserveSubstrateFederatedNativeGenesisSetupCheckRequestV1(
  value: unknown,
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value);
  await assertSubstrateFederatedNativeGenesisSetupCheckRequestV1RuntimeProvenance(value);
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value);
  const observation = await freshObservation(requests.get(value)!,
    () => assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value));
  assertSubstrateFederatedNativeGenesisSetupCheckRequestV1(value);
  return observation;
}

function sourceBindings(compiled: Compiled, target: Target) {
  const { processBinding: process } = validateObservedSubstrateFederatedGenesisV1(compiled, target);
  if (target.primaryNodeOrigin !== PRIMARY || target.witnessNodeOrigin !== WITNESS
    || compiled.discovery.sources.primaryNodeOrigin !== PRIMARY
    || compiled.discovery.sources.witnessNodeOrigin !== WITNESS
    || compiled.discovery.target.network !== 'devnet') {
    throw new Error('native FED setup requires the exact fixed managed devnet origins');
  }
  if (compiled.issuance.greenfieldReplayBaselineEstablished !== false
    || compiled.issuance.targetNodeAcceptanceEstablished !== false
    || compiled.issuance.issuanceEstablished !== false) {
    throw new Error('native FED compiled issuance must remain non-authorizing');
  }
  const binding = {
    compilerProfile: 'fed-native-height-zero-v1' as const,
    nativeGenesisCandidateDigestHex: sha256CanonicalJson(compiled.candidate, `${DOMAIN}_CANDIDATE`),
    familyIdHex: compiled.candidate.familyIdHex,
    runtimeProfileIdHex: compiled.candidate.runtimeProfileIdHex,
    trackerCompilerRequestDigestHex: compiled.familyCompilerInput.trackerRequest.requestDigestHex,
    trackerCompilerReceiptDigestHex: compiled.familyCompilerInput.trackerReceipt.receiptDigestHex,
    familyCompilerRequestDigestHex: compiled.familyReceipt.familyCompilerRequestDigestHex,
    familyCompilerReceiptDigestHex: compiled.familyReceipt.receiptDigestHex,
    originalDiscoveryDigestHex: sha256CanonicalJson(compiled.discovery, `${DOMAIN}_DISCOVERY`),
    originalHistoryDigestHex: sha256CanonicalJson(compiled.history.receipt, `${DOMAIN}_HISTORY`),
    issuanceSetDigestHex: sha256CanonicalJson(compiled.issuance, `${DOMAIN}_ISSUANCE_SET`),
    processBindingDigestHex: process.processBindingDigestHex,
    executionTargetIdentityDigestHex: process.executionTargetIdentityDigestHex,
    independentOperatorsEstablished: false as const,
    historicalReplayBaselineEstablished: false as const,
  };
  return { ...binding, nativeGenesisIdentityDigestHex: sha256CanonicalJson(binding, `${DOMAIN}_IDENTITY`) };
}

function assertSourceUnchanged(retained: Retained, expected: ReturnType<typeof sourceBindings>): void {
  if (canonicalJson(sourceBindings(retained.compiled, retained.target)) !== canonicalJson(expected)) {
    throw new Error('native FED setup compiler or process binding drifted');
  }
}

function makeProfile(compiled: Compiled, target: Target, source: ReturnType<typeof sourceBindings>) {
  // Distinct declared role labels are not evidence of independent administration.
  const identity = (role: string, kind: string) => sha256CanonicalJson({
    processBindingDigestHex: source.processBindingDigestHex, role, kind,
  }, `${DOMAIN}_LOCAL_ROLE`);
  return buildSubstrateFederatedGenesisTargetProfileV1({
    profileIdHex: source.nativeGenesisIdentityDigestHex, environment: 'devnet', expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex: compiled.discovery.target.genesisHeaderIdHex,
    primaryNodeOrigin: target.primaryNodeOrigin, witnessNodeOrigin: target.witnessNodeOrigin,
    primaryNodeIdentityDigestHex: identity('primary', 'node'),
    primaryAdministrationIdentityDigestHex: identity('primary', 'administration'),
    witnessNodeIdentityDigestHex: identity('witness', 'node'),
    witnessAdministrationIdentityDigestHex: identity('witness', 'administration'),
    trackerGenesisBoxIdHex: compiled.discovery.genesisBoxIds.tracker,
    duplicatePreventionGenesisBoxIdHex: compiled.discovery.genesisBoxIds.duplicatePrevention,
    pooledReserveGenesisBoxIdHex: compiled.discovery.genesisBoxIds.pooledReserve,
  });
}

async function freshObservation(retained: Retained, assertCurrent: () => void) {
  assertCurrent();
  const observation = await observeSubstrateFederatedGenesisV1(retained.profile);
  assertCurrent();
  assertSubstrateFederatedGenesisObservationV1Provenance(retained.profile, observation);
  assertFresh(observation.observedAt);
  const anchor = retained.compiled.discovery.target;
  if (observation.target.tipHeight < anchor.tipHeight
    || (observation.target.tipHeight === anchor.tipHeight
      && observation.target.tipHeaderIdHex !== anchor.tipHeaderIdHex)) {
    throw new Error('native FED observation regressed or changed the captured anchor');
  }
  for (const key of KEYS) {
    if (canonicalJson(observation.boxes[key].box) !== canonicalJson(retained.compiled.discovery.genesisInputs[key])) {
      throw new Error(`native FED ${key} observed input body differs from compilation`);
    }
  }
  for (const origin of [PRIMARY, WITNESS]) {
    const source = createBoundedAuthenticatedSpvTrackerReadOnlySource(origin) as SubstrateFederatedGenesisNodeSource;
    source.beginAuthenticatedTrackerReconstruction?.();
    try {
      const ids = await source.getBlockHeaderIdsAtHeight(anchor.tipHeight);
      assertCurrent();
      if (ids[0] !== anchor.tipHeaderIdHex) {
        throw new Error('native FED captured anchor left the best chain');
      }
    } finally {
      source.endAuthenticatedTrackerReconstruction?.();
    }
  }
  assertFresh(observation.observedAt);
  return observation;
}

async function deriveIssuances(compiled: Compiled, assertCurrent: () => void) {
  const imported = await import('ergo-lib-wasm-nodejs');
  assertCurrent();
  const wasm = imported.default ?? imported;
  if (compiled.issuance.orderedTransactions.length !== 3) {
    throw new Error('native FED setup requires exactly three ordered issuances');
  }
  return compiled.issuance.orderedTransactions.map(({ role, transaction }, index):
    Readonly<SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2> => {
    const key = KEYS[index]!;
    const input = transaction.eip12Tx.inputs[0];
    if (role !== key || transaction.eip12Tx.inputs.length !== 1 || transaction.eip12Tx.dataInputs.length !== 0
      || !input || Object.keys(input.extension).length !== 0) {
      throw new Error('native FED issuance role or input shape differs');
    }
    const { extension: _extension, ...inputBox } = input;
    if (canonicalJson(inputBox) !== canonicalJson(compiled.discovery.genesisInputs[key])) {
      throw new Error(`native FED ${key} issuance input differs from compilation`);
    }
    let unsigned: any;
    let proofless: any;
    let id: any;
    let candidates: any;
    try {
      unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(toUnsignedTransactionJson(transaction.eip12Tx)));
      id = unsigned.id();
      if (id.to_str() !== transaction.txId) throw new Error('native FED unsigned transaction ID differs from WASM');
      candidates = unsigned.output_candidates();
      const outputs = [];
      for (let i = 0; i < candidates.len(); i++) {
        const candidate = candidates.get(i);
        const box = wasm.ErgoBox.from_box_candidate(candidate, id, i);
        try { outputs.push(box.to_js_eip12()); } finally { box.free(); candidate.free(); }
      }
      if (canonicalJson(outputs) !== canonicalJson(transaction.outputs)) {
        throw new Error('native FED predicted outputs differ from WASM');
      }
      const state = transaction.outputs[0];
      if (!state || state.index !== 0 || state.creationHeight !== compiled.issuance.creationHeight
        || state.assets.length !== 1 || state.assets[0]!.tokenId !== input.boxId || state.assets[0]!.amount !== '1') {
        throw new Error('native FED singleton state identity differs');
      }
      const consumed = unsigned;
      unsigned = undefined;
      proofless = wasm.Transaction.from_unsigned_tx(consumed, [new Uint8Array()]);
      const bytes = Buffer.from(proofless.sigma_serialize_bytes());
      const digest = Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex');
      if (digest !== transaction.txId) throw new Error('native FED bytes-to-sign differ from transaction ID');
      const identity = {
        ordinal: index as 0 | 1 | 2, role: ROLES[index]!, genesisInputBoxIdHex: input.boxId,
        requiredInputErgoTreeHex: input.ergoTree, unsignedTransactionIdHex: transaction.txId,
        unsignedTransactionBody: structuredClone(transaction.eip12Tx) as unknown as Readonly<Record<string, unknown>>,
        unsignedTransactionBodyDigestHex: sha256CanonicalJson(transaction.eip12Tx, BODY_DOMAIN),
        materializedTransactionDigestHex: sha256CanonicalJson(transaction, MATERIALIZED_DOMAIN),
        bytesToSignHex: bytes.toString('hex'), bytesToSignBytes: bytes.length, bytesToSignBlake2b256Hex: digest,
        predictedStateOutput: { boxIdHex: state.boxId, transactionIdHex: state.transactionId,
          index: 0 as const, creationHeight: state.creationHeight, bodyDigestHex: sha256CanonicalJson(state, OUTPUT_DOMAIN) },
      };
      return freeze({ ...identity,
        provisioningIdentityDigestHex: sha256CanonicalJson(identity, `${DOMAIN}_ISSUANCE_IDENTITY`) });
    } finally {
      candidates?.free(); id?.free(); proofless?.free(); unsigned?.free();
    }
  });
}

function assertFresh(observedAt: string): void {
  const time = Date.parse(observedAt);
  const age = Date.now() - time;
  if (!Number.isSafeInteger(time) || age < 0 || age > MAX_AGE_MS) {
    throw new Error('native FED setup request exceeded its fixed freshness window');
  }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
