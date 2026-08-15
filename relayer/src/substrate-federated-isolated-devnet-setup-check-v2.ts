import { createHash } from 'node:crypto';

import { ngetDirect } from './ergo-helpers.js';
import { deriveUnsignedTransactionId } from './ergo-unsigned-transaction.js';
import {
  checkSignedTransaction,
  prepareLocalWasmRootCheckCandidates,
  type LocalWasmExactBytesSignedCheckCandidate,
  type SignedCheckSignerContext,
} from './fleet-signer.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import { snapshotStrictData } from './strict-data-snapshot.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import type {
  SubstrateFederatedGenesisObservationV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2RuntimeProvenance,
  reobserveSubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2,
  type SubstrateFederatedIsolatedDevnetSetupCheckRequestV2,
} from './substrate-federated-isolated-devnet-setup-check-request-v2.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RECEIPT_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-setup-check-receipt.v2' as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RECEIPT_V2';
const OBSERVED_INPUT_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OBSERVED_INPUT_SET_V2';
const OBSERVED_INPUT_BODY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_OBSERVED_INPUT_BODY_V2';
const CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RESPONSE_V2';
const SIGNED_CANDIDATE_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_SIGNED_CANDIDATE_SET_V2';
const REQUIRED_ROLES = [
  'tracker',
  'duplicate-prevention',
  'pooled-reserve',
] as const;
const ALLOWED_REWARD_DELAYS = [1, 720] as const;

type SetupRole = typeof REQUIRED_ROLES[number];
type RewardDelay = typeof ALLOWED_REWARD_DELAYS[number];

export interface SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RECEIPT_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'PASS';
  readonly receiptDigestHex: string;
  readonly requestDigestHex: string;
  readonly sourceBindings:
    SubstrateFederatedIsolatedDevnetSetupCheckRequestV2['sourceBindings'];
  readonly target: SubstrateFederatedIsolatedDevnetSetupCheckRequestV2['target'];
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly networkPrefix: 16;
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeSha256Hex: string;
    readonly controlledInputErgoTreeSha256Hex: string;
    readonly signedCandidateSetDigestHex: string;
    readonly rewardDelayBlocks: RewardDelay;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly preSignObservation: SetupObservationReceipt;
  readonly preCheckObservation: SetupObservationReceipt;
  readonly orderedChecks: readonly SetupCheckReceipt[];
  readonly postCheckObservation: SetupObservationReceipt;
  readonly stages: Readonly<{
    readonly requestRevalidation: 'complete';
    readonly preSignReobservation: 'complete';
    readonly exactUnsignedIdentity: 'complete';
    readonly syntheticWasmRootSigning: 'complete';
    readonly preCheckReobservation: 'complete';
    readonly jvmNodeCheck: 'complete';
    readonly postCheckReobservation: 'complete';
    readonly submission: 'not-authorized';
    readonly broadcast: 'not-authorized';
    readonly confirmation: 'not-established';
  }>;
  readonly boundaries: Readonly<{
    readonly isolatedLoopbackCompatibilityOnly: true;
    readonly processProvenantRequestConsumed: true;
    readonly exactThreeTransactionsSigned: true;
    readonly signedTransactionBytesProducedInMemory: true;
    readonly signedTransactionBytesPersisted: false;
    readonly exactThreeJvmNodeChecksPassed: true;
    readonly nodeCheckDoesNotSpendInputs: true;
    readonly exactNodeRuntimeIdentityEstablished: false;
    readonly exactGenesisInputsStillUnspentAfterChecks: true;
    readonly receiptReplayCanAuthorizeSetup: false;
    readonly containsPrivateKeyOrMnemonic: false;
    readonly containsSignerCapability: false;
    readonly containsSignedTransactionBytes: false;
    readonly containsGenericTransport: false;
    readonly containsSubmissionCapability: false;
    readonly containsBroadcastCapability: false;
    readonly v1TestnetPromotionAccepted: false;
    readonly canonicalLineagesEstablished: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

interface SetupObservationReceipt {
  readonly reportDigestHex: string;
  readonly observedAt: string;
  readonly tipHeight: number;
  readonly tipHeaderIdHex: string;
  readonly genesisHeaderIdHex: string;
  readonly observedInputSetDigestHex: string;
  readonly exactGenesisInputsUnspent: true;
}

interface SetupCheckReceipt {
  readonly ordinal: 0 | 1 | 2;
  readonly role: SetupRole;
  readonly unsignedTransactionIdHex: string;
  readonly bytesToSignBlake2b256Hex: string;
  readonly signedTransactionIdHex: string;
  readonly signedTransactionCanonicalJsonSha256Hex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly nodeTransactionIdHex: string;
  readonly checkResponseSha256Hex: string;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
  readonly status: 'PASS';
}

export async function runSubstrateFederatedIsolatedDevnetSetupCheckV2(
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
  syntheticMnemonic: string,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2>> {
  const mnemonic = syntheticMnemonic.trim();
  if (!mnemonic) {
    throw new Error('isolated local setup-check synthetic mnemonic is empty');
  }
  await assertRuntimeRequest(request);
  const preSignObservation = await reobserveAndBind(
    request,
    'pre-sign',
  );
  assertRuntimeFresh(request);

  const headers = await ngetDirect(
    request.checkPolicy.stateContext.path,
    request.checkPolicy.stateContext.nodeOrigin,
  );
  const headerTip = validateHeaderChain(headers);
  assertObservationTipInHeaders(preSignObservation, headers);
  assertRuntimeFresh(request);

  const independentIds = await Promise.all(
    request.orderedIssuances.map(async issuance => ({
      role: issuance.role,
      transactionIdHex: fixedHex(
        await deriveUnsignedTransactionId(issuance.unsignedTransactionBody),
        32,
        `${issuance.role} independently derived transaction ID`,
      ),
    })),
  );
  for (let index = 0; index < request.orderedIssuances.length; index += 1) {
    const issuance = request.orderedIssuances[index]!;
    if (
      independentIds[index]?.role !== issuance.role
      || independentIds[index]?.transactionIdHex
        !== issuance.unsignedTransactionIdHex
    ) {
      throw new Error(
        `${issuance.role} independently derived transaction ID drifted`,
      );
    }
  }

  const batch = await prepareLocalWasmRootCheckCandidates({
    mnemonic,
    networkPrefix: request.checkPolicy.signingNetworkPrefix,
    headers,
    nodeOrigin: request.checkPolicy.nodeCheck.nodeOrigin,
    candidates: request.orderedIssuances.map(issuance => ({
      role: issuance.role,
      eip12Tx: issuance.unsignedTransactionBody,
      expectedTxId: issuance.unsignedTransactionIdHex,
    })),
  });
  assertSignerContext(batch, request, headerTip);
  const rewardDelay = assertSignerControlsExactInputTrees(
    batch.pubKeyHex,
    request.orderedIssuances,
  );
  assertPreparedCandidates(batch.candidates, request);
  assertRuntimeFresh(request);

  const preCheckObservation = await reobserveAndBind(
    request,
    'pre-check',
  );
  assertObservationProgression(
    preSignObservation,
    preCheckObservation,
    'pre-check',
  );
  assertRuntimeFresh(request);

  const orderedChecks: SetupCheckReceipt[] = [];
  for (let index = 0; index < request.orderedIssuances.length; index += 1) {
    const issuance = request.orderedIssuances[index]!;
    const prepared = batch.candidates[index]!;
    const checked = await checkSignedTransaction(
      prepared.signedCandidate,
      `isolated local ${issuance.role} setup check`,
      request.checkPolicy.nodeCheck.nodeOrigin,
    );
    if (checked === null) {
      throw new Error(
        `isolated local ${issuance.role} JVM node check failed`,
      );
    }
    const signedBytesDigestHex = fixedHex(
      checked.signedTransactionBytesSha256Hex,
      32,
      `${issuance.role} signed transaction bytes digest`,
    );
    const signedBytesLength = positiveSafeInteger(
      checked.signedTransactionBytesLength,
      `${issuance.role} signed transaction bytes length`,
    );
    if (
      checked.txId !== issuance.unsignedTransactionIdHex
      || checked.txId !== prepared.expectedTxId
      || checked.signedTransactionDigestHex
        !== prepared.signedCandidate.signedTransactionDigestHex
      || signedBytesDigestHex
        !== prepared.signedCandidate.signedTransactionBytesSha256Hex
      || signedBytesLength
        !== prepared.signedCandidate.signedTransactionBytesLength
      || canonicalJson(checked.signerContext)
        !== canonicalJson(prepared.signedCandidate.signerContext)
      || checked.checkerIdentity.nodeOrigin
        !== request.checkPolicy.nodeCheck.nodeOrigin
      || checked.checkerIdentity.path !== '/transactions/check'
      || checked.checkerIdentity.method !== 'POST'
      || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
    ) {
      throw new Error(
        `isolated local ${issuance.role} signer and JVM node receipt disagree`,
      );
    }
    orderedChecks.push(deepFreeze({
      ordinal: issuance.ordinal,
      role: issuance.role,
      unsignedTransactionIdHex: issuance.unsignedTransactionIdHex,
      bytesToSignBlake2b256Hex: issuance.bytesToSignBlake2b256Hex,
      signedTransactionIdHex: checked.txId,
      signedTransactionCanonicalJsonSha256Hex:
        checked.signedTransactionDigestHex,
      signedTransactionBytesSha256Hex: signedBytesDigestHex,
      signedTransactionBytesLength: signedBytesLength,
      nodeTransactionIdHex: checked.txId,
      checkResponseSha256Hex: sha256CanonicalJson({
        role: issuance.role,
        response: checked.checkResult,
      }, CHECK_RESPONSE_DIGEST_DOMAIN),
      checker: {
        nodeOrigin: checked.checkerIdentity.nodeOrigin,
        path: checked.checkerIdentity.path,
        method: checked.checkerIdentity.method,
        transportPolicy: checked.checkerIdentity.transportPolicy,
      },
      status: 'PASS' as const,
    }));
    assertRuntimeFresh(request);
  }

  const postCheckObservation = await reobserveAndBind(
    request,
    'post-check',
  );
  assertObservationProgression(
    preCheckObservation,
    postCheckObservation,
    'post-check',
  );
  await assertRuntimeRequest(request);

  const controlledInputErgoTreeHex =
    request.orderedIssuances[0]!.requiredInputErgoTreeHex;
  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RECEIPT_V2_SCHEMA,
    version: 2 as const,
    status: 'PASS' as const,
    requestDigestHex: request.requestDigestHex,
    sourceBindings: request.sourceBindings,
    target: request.target,
    signer: {
      derivation: 'wasm-root' as const,
      networkPrefix: 16 as const,
      publicKeyHex: fixedPublicKey(batch.pubKeyHex),
      p2pkErgoTreeSha256Hex: sha256Hex(
        Buffer.from(fixedVariableHex(batch.ergoTreeHex, 'signer P2PK ErgoTree'), 'hex'),
      ),
      controlledInputErgoTreeSha256Hex: sha256Hex(
        Buffer.from(controlledInputErgoTreeHex, 'hex'),
      ),
      signedCandidateSetDigestHex: signedCandidateSetDigest(orderedChecks),
      rewardDelayBlocks: rewardDelay,
      stateContextTipHeight: headerTip.height,
      stateContextTipIdHex: headerTip.idHex,
    },
    preSignObservation,
    preCheckObservation,
    orderedChecks: deepFreeze(orderedChecks),
    postCheckObservation,
    stages: fixedStages(),
    boundaries: fixedBoundaries(),
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  return validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
    receipt,
    request,
  );
}

export function validateSubstrateFederatedIsolatedDevnetSetupCheckReceiptV2(
  value: unknown,
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
): Readonly<SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2> {
  const candidate = snapshotStrictData(
    value,
    'isolated local setup-check receipt',
  ) as unknown as SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2;
  exactKeys(candidate as unknown as Record<string, unknown>, [
    'schema', 'version', 'status', 'receiptDigestHex', 'requestDigestHex',
    'sourceBindings', 'target', 'signer', 'preSignObservation',
    'preCheckObservation', 'orderedChecks', 'postCheckObservation', 'stages',
    'boundaries',
  ], 'isolated local setup-check receipt');
  const { receiptDigestHex, ...body } = candidate;
  if (
    candidate.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETUP_CHECK_RECEIPT_V2_SCHEMA
    || candidate.version !== 2
    || candidate.status !== 'PASS'
    || fixedHex(receiptDigestHex, 32, 'setup-check receipt digest')
      !== sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN)
    || candidate.requestDigestHex !== request.requestDigestHex
    || canonicalJson(candidate.sourceBindings)
      !== canonicalJson(request.sourceBindings)
    || canonicalJson(candidate.target) !== canonicalJson(request.target)
  ) {
    throw new Error(
      'isolated local setup-check receipt does not bind the exact request',
    );
  }
  const preSign = validateObservationReceipt(
    candidate.preSignObservation,
    'pre-sign receipt',
    request.target.genesisHeaderIdHex,
  );
  const preCheck = validateObservationReceipt(
    candidate.preCheckObservation,
    'pre-check receipt',
    request.target.genesisHeaderIdHex,
  );
  const postCheck = validateObservationReceipt(
    candidate.postCheckObservation,
    'post-check receipt',
    request.target.genesisHeaderIdHex,
  );
  assertObservationProgression(preSign, preCheck, 'receipt pre-check');
  assertObservationProgression(preCheck, postCheck, 'receipt post-check');
  validateChecks(candidate.orderedChecks, request);
  validateSignerReceipt(candidate.signer, request, candidate.orderedChecks);
  assertSignerObservationBinding(candidate.signer, preSign);
  if (
    canonicalJson(candidate.stages) !== canonicalJson(fixedStages())
    || canonicalJson(candidate.boundaries) !== canonicalJson(fixedBoundaries())
  ) {
    throw new Error(
      'isolated local setup-check receipt capability boundary drifted',
    );
  }
  return deepFreeze(candidate);
}

async function assertRuntimeRequest(
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
): Promise<void> {
  await assertSubstrateFederatedIsolatedDevnetSetupCheckRequestV2RuntimeProvenance(
    request,
  );
  if (
    request.checkPolicy.stateContext.nodeOrigin
      !== request.checkPolicy.nodeCheck.nodeOrigin
    || request.checkPolicy.stateContext.method !== 'GET'
    || request.checkPolicy.stateContext.path !== '/blocks/lastHeaders/10'
    || request.checkPolicy.nodeCheck.method !== 'POST'
    || request.checkPolicy.nodeCheck.path !== '/transactions/check'
    || !request.checkPolicy.sameOriginRequired
    || request.checkPolicy.transportPolicy !== 'no-redirect-no-proxy'
    || request.checkPolicy.submissionEndpointPresent
    || request.checkPolicy.broadcastEndpointPresent
  ) {
    throw new Error('isolated local setup-check request policy is executable beyond check-only');
  }
  assertExactRoleOrder(request.orderedIssuances);
  assertRuntimeFresh(request);
}

function assertRuntimeFresh(
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
): void {
  const ageMs = Date.now() - Date.parse(request.target.observedAt);
  if (
    !Number.isFinite(ageMs)
    || ageMs < 0
    || ageMs > request.target.maximumObservationAgeMs
  ) {
    throw new Error('isolated local setup-check request expired during execution');
  }
}

async function reobserveAndBind(
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
  label: string,
): Promise<Readonly<SetupObservationReceipt>> {
  const observation =
    await reobserveSubstrateFederatedIsolatedDevnetSetupCheckRequestV2(request);
  return bindObservation(request, observation, label);
}

function bindObservation(
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
  observation: Readonly<SubstrateFederatedGenesisObservationV1>,
  label: string,
): Readonly<SetupObservationReceipt> {
  if (
    observation.status !== 'AGREED'
    || observation.profile.profileIdHex !== request.target.profileIdHex
    || observation.profile.profileDigestHex !== request.target.profileDigestHex
    || observation.profile.environment !== request.target.environment
    || observation.target.network !== request.target.nodeReportedNetwork
    || observation.target.genesisHeaderIdHex !== request.target.genesisHeaderIdHex
    || observation.sources.primary.endpointOrigin
      !== request.target.primary.nodeOrigin
    || observation.sources.primary.sourceIdHex
      !== request.target.primary.sourceIdHex
    || observation.sources.witness.endpointOrigin
      !== request.target.witness.nodeOrigin
    || observation.sources.witness.sourceIdHex
      !== request.target.witness.sourceIdHex
    || !Object.values(observation.agreement).every(value => value === true)
    || observation.boundary.readOnlyNodeRequestsOnly !== true
    || observation.boundary.signerOrWalletMaterialRead !== false
    || observation.boundary.targetAcceptanceEstablished !== false
    || Object.values(observation.authorization).some(value => value !== false)
  ) {
    throw new Error(`isolated local ${label} observation target drifted`);
  }
  const observedAt = canonicalTimestamp(
    observation.observedAt,
    `${label} observation time`,
  );
  const ageMs = Date.now() - Date.parse(observedAt);
  if (
    ageMs < 0
    || ageMs > request.target.maximumObservationAgeMs
    || Date.parse(observedAt) < Date.parse(request.target.observedAt)
    || observation.target.tipHeight < request.target.preSetupAnchor.height
  ) {
    throw new Error(`isolated local ${label} observation is stale`);
  }

  const observedInputs = request.orderedIssuances.map(issuance => {
    const observationKey = issuance.role === 'duplicate-prevention'
      ? 'duplicatePrevention'
      : issuance.role === 'pooled-reserve'
        ? 'pooledReserve'
        : 'tracker';
    const observed = observation.boxes[observationKey];
    const unsignedBody = requireRecord(
      issuance.unsignedTransactionBody,
      `${issuance.role} unsigned transaction body`,
    );
    const inputs = unsignedBody.inputs;
    if (!Array.isArray(inputs) || inputs.length !== 1) {
      throw new Error(`isolated local ${issuance.role} input cardinality drifted`);
    }
    const expectedInput = requireRecord(
      inputs[0],
      `${issuance.role} unsigned input`,
    );
    const expectedExtension = requireRecord(
      expectedInput.extension,
      `${issuance.role} unsigned input extension`,
    );
    const { extension: _expectedExtension, ...expectedInputBox } = expectedInput;
    if (
      observed.role !== issuance.role
      || observed.box.boxId !== issuance.genesisInputBoxIdHex
      || observed.box.ergoTree !== issuance.requiredInputErgoTreeHex
      || Object.keys(expectedExtension).length !== 0
      || canonicalJson(observed.box) !== canonicalJson(expectedInputBox)
      || observed.checks.presentInCurrentUtxoView !== true
      || observed.checks.boxIdRecomputedFromJson !== true
      || observed.checks.sigmaBytesCanonical !== true
    ) {
      throw new Error(
        `isolated local ${label} ${issuance.role} input drifted`,
      );
    }
    return {
      ordinal: issuance.ordinal,
      role: issuance.role,
      boxIdHex: issuance.genesisInputBoxIdHex,
      sigmaSerializedSha256Hex: fixedHex(
        observed.sigmaSerializedSha256Hex,
        32,
        `${issuance.role} observed Sigma-box digest`,
      ),
      boxBodyDigestHex: sha256CanonicalJson(
        observed.box,
        OBSERVED_INPUT_BODY_DIGEST_DOMAIN,
      ),
    };
  });
  return deepFreeze({
    reportDigestHex: fixedHex(
      observation.reportDigestHex,
      32,
      `${label} observation report digest`,
    ),
    observedAt,
    tipHeight: positiveSafeInteger(
      observation.target.tipHeight,
      `${label} observation tip height`,
    ),
    tipHeaderIdHex: fixedHex(
      observation.target.tipHeaderIdHex,
      32,
      `${label} observation tip header ID`,
    ),
    genesisHeaderIdHex: request.target.genesisHeaderIdHex,
    observedInputSetDigestHex: sha256CanonicalJson(
      observedInputs,
      OBSERVED_INPUT_SET_DIGEST_DOMAIN,
    ),
    exactGenesisInputsUnspent: true as const,
  });
}

function validateHeaderChain(value: unknown): Readonly<{
  height: number;
  idHex: string;
}> {
  if (!Array.isArray(value) || value.length !== 10) {
    throw new Error('isolated local setup-check requires exactly 10 headers');
  }
  const headers = value.map((entry, index) => {
    const header = requireRecord(entry, `setup-check header ${index}`);
    return {
      height: positiveSafeInteger(header.height, `setup-check header ${index} height`),
      idHex: fixedHex(header.id, 32, `setup-check header ${index} ID`),
      parentIdHex: fixedHex(
        header.parentId,
        32,
        `setup-check header ${index} parent ID`,
      ),
    };
  }).sort((left, right) => right.height - left.height);
  for (let index = 0; index < headers.length; index += 1) {
    if (
      headers[index]!.height !== headers[0]!.height - index
      || (index > 0
        && headers[index - 1]!.parentIdHex !== headers[index]!.idHex)
    ) {
      throw new Error(
        'isolated local setup-check headers are not one contiguous chain',
      );
    }
  }
  return Object.freeze({
    height: headers[0]!.height,
    idHex: headers[0]!.idHex,
  });
}

function assertObservationTipInHeaders(
  observation: Readonly<SetupObservationReceipt>,
  rawHeaders: unknown,
): void {
  const headers = (rawHeaders as unknown[]).map((entry, index) => {
    const header = requireRecord(entry, `setup-check header ${index}`);
    return {
      height: positiveSafeInteger(header.height, `setup-check header ${index} height`),
      idHex: fixedHex(header.id, 32, `setup-check header ${index} ID`),
    };
  });
  const exact = headers.find(header => header.height === observation.tipHeight);
  if (exact === undefined || exact.idHex !== observation.tipHeaderIdHex) {
    throw new Error(
      'isolated local pre-sign observation tip is absent from signer headers',
    );
  }
}

function assertSignerContext(
  batch: Readonly<{
    derivation: 'wasm-root';
    pubKeyHex: string;
    ergoTreeHex: string;
    stateContextTipHeight: number;
    stateContextTipIdHex: string;
  }>,
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
  headerTip: Readonly<{ height: number; idHex: string }>,
): void {
  if (
    batch.derivation !== 'wasm-root'
    || batch.stateContextTipHeight !== headerTip.height
    || batch.stateContextTipIdHex !== headerTip.idHex
    || request.checkPolicy.signingNetworkPrefix !== 16
  ) {
    throw new Error('isolated local setup-check signer context drifted');
  }
  const publicKeyHex = fixedPublicKey(batch.pubKeyHex);
  if (fixedVariableHex(batch.ergoTreeHex, 'signer P2PK ErgoTree')
    !== `0008cd${publicKeyHex}`) {
    throw new Error('isolated local setup-check signer P2PK identity drifted');
  }
}

function assertSignerControlsExactInputTrees(
  publicKeyHexInput: string,
  issuances: readonly Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2
  >[],
): RewardDelay {
  const publicKeyHex = fixedPublicKey(publicKeyHexInput);
  const inputTrees = new Set(issuances.map(issuance => {
    const body = requireRecord(
      issuance.unsignedTransactionBody,
      `${issuance.role} unsigned transaction body`,
    );
    const inputs = body.inputs;
    if (!Array.isArray(inputs) || inputs.length !== 1) {
      throw new Error(`isolated local ${issuance.role} input cardinality drifted`);
    }
    const input = requireRecord(inputs[0], `${issuance.role} unsigned input`);
    if (input.ergoTree !== issuance.requiredInputErgoTreeHex) {
      throw new Error(`isolated local ${issuance.role} input ErgoTree drifted`);
    }
    return issuance.requiredInputErgoTreeHex;
  }));
  if (inputTrees.size !== 1) {
    throw new Error('isolated local setup-check inputs use different signer trees');
  }
  const [inputTree] = [...inputTrees];
  const matchingDelays = ALLOWED_REWARD_DELAYS.filter(delay =>
    deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, delay) === inputTree
  );
  if (matchingDelays.length !== 1) {
    throw new Error(
      'isolated local setup-check signer does not control the exact reward inputs',
    );
  }
  return matchingDelays[0]!;
}

function assertPreparedCandidates(
  candidates: readonly Readonly<{
    role: string;
    expectedTxId: string;
    signedCandidate: LocalWasmExactBytesSignedCheckCandidate;
  }>[],
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
): void {
  if (candidates.length !== REQUIRED_ROLES.length) {
    throw new Error('isolated local setup-check signed candidate count drifted');
  }
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const issuance = request.orderedIssuances[index]!;
    if (
      candidate.role !== issuance.role
      || candidate.expectedTxId !== issuance.unsignedTransactionIdHex
      || candidate.signedCandidate.txId !== issuance.unsignedTransactionIdHex
      || candidate.signedCandidate.nodeOrigin
        !== request.checkPolicy.nodeCheck.nodeOrigin
      || candidate.signedCandidate.signerContext.networkPrefix !== 16
      || fixedHex(
        candidate.signedCandidate.signedTransactionDigestHex,
        32,
        `${issuance.role} signed transaction object digest`,
      ) !== candidate.signedCandidate.signedTransactionDigestHex
      || fixedHex(
        candidate.signedCandidate.signedTransactionBytesSha256Hex,
        32,
        `${issuance.role} signed transaction bytes digest`,
      ) !== candidate.signedCandidate.signedTransactionBytesSha256Hex
      || positiveSafeInteger(
        candidate.signedCandidate.signedTransactionBytesLength,
        `${issuance.role} signed transaction bytes length`,
      ) !== candidate.signedCandidate.signedTransactionBytesLength
    ) {
      throw new Error(
        `isolated local ${issuance.role} signed candidate binding drifted`,
      );
    }
  }
}

function assertObservationProgression(
  previous: Readonly<SetupObservationReceipt>,
  current: Readonly<SetupObservationReceipt>,
  label: string,
): void {
  if (
    current.tipHeight < previous.tipHeight
    || Date.parse(current.observedAt) < Date.parse(previous.observedAt)
    || current.observedInputSetDigestHex !== previous.observedInputSetDigestHex
  ) {
    throw new Error(`isolated local ${label} observation regressed or drifted`);
  }
  if (
    current.tipHeight === previous.tipHeight
    && current.tipHeaderIdHex !== previous.tipHeaderIdHex
  ) {
    throw new Error(`isolated local ${label} observation replaced the same-height tip`);
  }
}

function validateSignerReceipt(
  value: unknown,
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
  checks: readonly SetupCheckReceipt[],
): void {
  const signer = exactRecord(value, [
    'derivation', 'networkPrefix', 'publicKeyHex', 'p2pkErgoTreeSha256Hex',
    'controlledInputErgoTreeSha256Hex', 'signedCandidateSetDigestHex',
    'rewardDelayBlocks',
    'stateContextTipHeight', 'stateContextTipIdHex',
  ], 'setup-check signer receipt');
  const publicKeyHex = fixedPublicKey(signer.publicKeyHex);
  const rewardDelayBlocks = signer.rewardDelayBlocks as RewardDelay;
  const p2pkErgoTreeHex = `0008cd${publicKeyHex}`;
  const controlledInputErgoTreeHex = ALLOWED_REWARD_DELAYS.includes(
    rewardDelayBlocks,
  )
    ? deriveDevnetRewardErgoTreeHexForDelay(
      publicKeyHex,
      rewardDelayBlocks,
    )
    : '';
  if (
    signer.derivation !== 'wasm-root'
    || signer.networkPrefix !== 16
    || !ALLOWED_REWARD_DELAYS.includes(rewardDelayBlocks)
    || publicKeyHex !== signer.publicKeyHex
    || signer.p2pkErgoTreeSha256Hex !== sha256Hex(
      Buffer.from(p2pkErgoTreeHex, 'hex'),
    )
    || signer.controlledInputErgoTreeSha256Hex !== sha256Hex(
      Buffer.from(controlledInputErgoTreeHex, 'hex'),
    )
    || request.orderedIssuances.some(issuance =>
      issuance.requiredInputErgoTreeHex !== controlledInputErgoTreeHex)
    || signer.signedCandidateSetDigestHex !== signedCandidateSetDigest(checks)
    || positiveSafeInteger(signer.stateContextTipHeight, 'signer context height')
      !== signer.stateContextTipHeight
    || fixedHex(signer.stateContextTipIdHex, 32, 'signer context tip ID')
      !== signer.stateContextTipIdHex
    || signer.stateContextTipHeight < request.target.preSetupAnchor.height
  ) {
    throw new Error('isolated local setup-check signer receipt is invalid');
  }
}

function signedCandidateSetDigest(
  checks: readonly SetupCheckReceipt[],
): string {
  return sha256CanonicalJson(checks.map(check => ({
    ordinal: check.ordinal,
    role: check.role,
    unsignedTransactionIdHex: check.unsignedTransactionIdHex,
    signedTransactionIdHex: check.signedTransactionIdHex,
    signedTransactionCanonicalJsonSha256Hex:
      check.signedTransactionCanonicalJsonSha256Hex,
    signedTransactionBytesSha256Hex:
      check.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: check.signedTransactionBytesLength,
  })), SIGNED_CANDIDATE_SET_DIGEST_DOMAIN);
}

function validateObservationReceipt(
  value: unknown,
  label: string,
  expectedGenesisHeaderIdHex: string,
): SetupObservationReceipt {
  const observation = exactRecord(value, [
    'reportDigestHex', 'observedAt', 'tipHeight', 'tipHeaderIdHex',
    'genesisHeaderIdHex', 'observedInputSetDigestHex',
    'exactGenesisInputsUnspent',
  ], label);
  fixedHex(observation.reportDigestHex, 32, `${label} report digest`);
  canonicalTimestamp(observation.observedAt, `${label} time`);
  positiveSafeInteger(observation.tipHeight, `${label} tip height`);
  fixedHex(observation.tipHeaderIdHex, 32, `${label} tip ID`);
  fixedHex(observation.genesisHeaderIdHex, 32, `${label} genesis ID`);
  fixedHex(
    observation.observedInputSetDigestHex,
    32,
    `${label} input-set digest`,
  );
  if (observation.exactGenesisInputsUnspent !== true) {
    throw new Error(`${label} does not retain exact unspent inputs`);
  }
  if (observation.genesisHeaderIdHex !== expectedGenesisHeaderIdHex) {
    throw new Error(`${label} genesis identity drifted`);
  }
  return observation as unknown as SetupObservationReceipt;
}

function assertSignerObservationBinding(
  signer: SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2['signer'],
  preSign: Readonly<SetupObservationReceipt>,
): void {
  const heightDelta = signer.stateContextTipHeight - preSign.tipHeight;
  if (
    heightDelta < 0
    || heightDelta > 9
    || (
      heightDelta === 0
      && signer.stateContextTipIdHex !== preSign.tipHeaderIdHex
    )
  ) {
    throw new Error(
      'isolated local setup-check signer context does not bind the pre-sign observation',
    );
  }
}

function validateChecks(
  value: unknown,
  request: Readonly<SubstrateFederatedIsolatedDevnetSetupCheckRequestV2>,
): void {
  if (!Array.isArray(value) || value.length !== REQUIRED_ROLES.length) {
    throw new Error('isolated local setup-check receipt must contain three checks');
  }
  for (let index = 0; index < value.length; index += 1) {
    const check = exactRecord(value[index], [
      'ordinal', 'role', 'unsignedTransactionIdHex',
      'bytesToSignBlake2b256Hex', 'signedTransactionIdHex',
      'signedTransactionCanonicalJsonSha256Hex',
      'signedTransactionBytesSha256Hex', 'signedTransactionBytesLength',
      'nodeTransactionIdHex', 'checkResponseSha256Hex', 'checker', 'status',
    ], `setup-check receipt check ${index}`);
    const issuance = request.orderedIssuances[index]!;
    const checker = exactRecord(check.checker, [
      'nodeOrigin', 'path', 'method', 'transportPolicy',
    ], `setup-check receipt checker ${index}`);
    if (
      check.ordinal !== issuance.ordinal
      || check.role !== issuance.role
      || check.unsignedTransactionIdHex !== issuance.unsignedTransactionIdHex
      || check.bytesToSignBlake2b256Hex
        !== issuance.bytesToSignBlake2b256Hex
      || check.signedTransactionIdHex !== issuance.unsignedTransactionIdHex
      || check.nodeTransactionIdHex !== issuance.unsignedTransactionIdHex
      || fixedHex(
        check.signedTransactionCanonicalJsonSha256Hex,
        32,
        `${issuance.role} signed object digest`,
      ) !== check.signedTransactionCanonicalJsonSha256Hex
      || fixedHex(
        check.signedTransactionBytesSha256Hex,
        32,
        `${issuance.role} signed bytes digest`,
      ) !== check.signedTransactionBytesSha256Hex
      || positiveSafeInteger(
        check.signedTransactionBytesLength,
        `${issuance.role} signed bytes length`,
      ) !== check.signedTransactionBytesLength
      || fixedHex(
        check.checkResponseSha256Hex,
        32,
        `${issuance.role} check response digest`,
      ) !== check.checkResponseSha256Hex
      || checker.nodeOrigin !== request.checkPolicy.nodeCheck.nodeOrigin
      || checker.path !== '/transactions/check'
      || checker.method !== 'POST'
      || checker.transportPolicy !== 'no-redirect-no-proxy'
      || check.status !== 'PASS'
    ) {
      throw new Error(
        `isolated local ${issuance.role} setup-check receipt is invalid`,
      );
    }
  }
}

function assertExactRoleOrder(
  issuances: readonly Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckIssuanceV2
  >[],
): void {
  if (
    issuances.length !== REQUIRED_ROLES.length
    || issuances.some((issuance, index) =>
      issuance.ordinal !== index
      || issuance.role !== REQUIRED_ROLES[index])
  ) {
    throw new Error('isolated local setup-check role order drifted');
  }
}

function fixedStages(): SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2['stages'] {
  return deepFreeze({
    requestRevalidation: 'complete' as const,
    preSignReobservation: 'complete' as const,
    exactUnsignedIdentity: 'complete' as const,
    syntheticWasmRootSigning: 'complete' as const,
    preCheckReobservation: 'complete' as const,
    jvmNodeCheck: 'complete' as const,
    postCheckReobservation: 'complete' as const,
    submission: 'not-authorized' as const,
    broadcast: 'not-authorized' as const,
    confirmation: 'not-established' as const,
  });
}

function fixedBoundaries(): SubstrateFederatedIsolatedDevnetSetupCheckReceiptV2['boundaries'] {
  return deepFreeze({
    isolatedLoopbackCompatibilityOnly: true as const,
    processProvenantRequestConsumed: true as const,
    exactThreeTransactionsSigned: true as const,
    signedTransactionBytesProducedInMemory: true as const,
    signedTransactionBytesPersisted: false as const,
    exactThreeJvmNodeChecksPassed: true as const,
    nodeCheckDoesNotSpendInputs: true as const,
    exactNodeRuntimeIdentityEstablished: false as const,
    exactGenesisInputsStillUnspentAfterChecks: true as const,
    receiptReplayCanAuthorizeSetup: false as const,
    containsPrivateKeyOrMnemonic: false as const,
    containsSignerCapability: false as const,
    containsSignedTransactionBytes: false as const,
    containsGenericTransport: false as const,
    containsSubmissionCapability: false as const,
    containsBroadcastCapability: false as const,
    v1TestnetPromotionAccepted: false as const,
    canonicalLineagesEstablished: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function exactRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Record<K, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  exactKeys(value as Record<string, unknown>, keys, label);
  return value as Record<K, any>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function fixedVariableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function fixedPublicKey(value: unknown): string {
  if (
    typeof value !== 'string'
    || !/^(?:02|03)[0-9a-f]{64}$/u.test(value)
  ) {
    throw new Error(
      'isolated local setup-check public key must be compressed secp256k1 hex',
    );
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return value;
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
