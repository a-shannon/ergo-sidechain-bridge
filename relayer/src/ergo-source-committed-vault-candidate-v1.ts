import { createHash } from 'node:crypto';

import {
  assertErgoCommittedVaultCurrentStateObservationV1Provenance,
  assertErgoCommittedVaultCurrentStatePortV1Provenance,
  normalizeErgoEip12BoxSnapshot,
  observeErgoCommittedVaultCurrentStateV1,
  type ErgoCanonicalEip12Box,
  type ErgoCommittedVaultCurrentStatePortV1,
} from './adapters/ergo-committed-vault-current-state.js';
import {
  assertErgoSignedTransactionSemanticsVerificationProvenance,
  verifyErgoSignedTransactionSemantics,
  type ErgoSignedTransactionSemanticOutput,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  assertErgoSourceConsensusCandidateV1Provenance,
  type ErgoSourceConsensusCandidateV1,
} from './ergo-source-consensus-candidate-v1.js';
import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
} from './ergo-settlement-core/ergo-encoding.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
  selectSubstrateGrandpaV1AssetProfile,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import {
  assertExactCommittedVaultV1,
  type CanonicalCommittedVaultV1,
  type PegInMintIntentV1,
} from './profiles/substrate-grandpa-v1/peg-in-committed-vault.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';

export const ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_SCHEMA =
  'e2s.ergo-source-committed-vault-candidate.v1' as const;
export const ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_STATUS =
  'non_authorizing_candidate' as const;
export const ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-source-committed-vault-candidate:v1' as const;
export const ERGO_SOURCE_COMMITTED_VAULT_TRANSACTION_SEMANTICS_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-source-committed-vault-transaction-semantics:v1' as const;

const CANDIDATES = new WeakSet<object>();
const NATIVE_ERG_ASSET_ID_HEX =
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex;

export interface ErgoCommittedVaultRouteV1 {
  readonly routeProfileId: 'committed-vault-v3';
  readonly sourceNetworkIdHex: string;
  readonly assetProfileId: string;
  readonly sourceLockErgoTreeHex: string;
  readonly vaultErgoTreeHex: string;
}

export interface ErgoSourceCommittedVaultCandidateV1 {
  readonly schema: typeof ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_SCHEMA;
  readonly status: typeof ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_STATUS;
  readonly consensus: Readonly<{
    sourceConsensusCandidateDigestHex: string;
    sourceNetworkIdHex: string;
    selectedTipHeaderIdHex: string;
    targetHeaderIdHex: string;
    confirmations: number;
    requiredConfirmations: number;
  }>;
  readonly route: Readonly<{
    routeProfileId: 'committed-vault-v3';
    sourceLockErgoTreeHex: string;
    sourceLockErgoTreeSha256Hex: string;
    vaultErgoTreeHex: string;
    vaultErgoTreeSha256Hex: string;
  }>;
  readonly transition: Readonly<{
    transactionIdHex: string;
    transactionSigmaDigestHex: string;
    transactionSemanticsDigestHex: string;
    sourceBoxIdHex: string;
    sourceBoxContentDigestHex: string;
    sourceInputIndex: number;
    sourceInputCount: 1;
    vaultBoxIdHex: string;
    vaultOutputIndex: 0;
    currentStateObservationDigestHex: string;
  }>;
  readonly settlement: Readonly<{
    assetProfileId: string;
    asset: 'ERG';
    assetIdHex: string;
    amountUnit: 'nanoERG';
    amountNanoErg: string;
    recipientH160Hex: string;
    depositorErgoTreeSha256Hex: string;
  }>;
  readonly checks: Readonly<{
    sourceConsensusCandidateProvenanceVerified: true;
    exactSignedTransactionBytesReparsed: true;
    exactRefundableSourceBoxBytesBound: true;
    exactSourceReferencedOnceAsSpendingInput: true;
    exactConfiguredVaultOutputZeroBound: true;
    freshSourceAbsentBeforeAndAfterVaultReads: true;
    freshVaultStableBeforeAndAfterSourceRecheck: true;
    currentVaultMatchesAuthenticatedTransactionOutput: true;
    exactNativeErgAmountRecipientAndRouteBound: true;
  }>;
  readonly authority: Readonly<{
    checkpointExternallyAuthenticated: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    sourceRpcAcceptedAsConsensus: false;
    routeProfileExternallyReviewedAndActivated: false;
    sourceDepositSidechainBindingProved: false;
    sourceTransactionExecutionValidated: false;
    historicalConsumptionBeforeMintProved: false;
    persistedReceiptAcceptedAsAuthority: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

export interface BuildErgoSourceCommittedVaultCandidateV1Input {
  readonly sourceConsensusCandidate:
    Readonly<ErgoSourceConsensusCandidateV1>;
  readonly signedCommitmentTransaction: unknown;
  readonly refundableSourceBox: unknown;
  readonly currentStatePort:
    Readonly<ErgoCommittedVaultCurrentStatePortV1>;
  readonly route: ErgoCommittedVaultRouteV1;
}

/**
 * Compose exact signed transaction semantics with a fresh point-in-time UTXO
 * observation. The result remains evidence only and cannot authorize mint.
 */
export async function buildErgoSourceCommittedVaultCandidateV1(
  input: BuildErgoSourceCommittedVaultCandidateV1Input,
): Promise<Readonly<ErgoSourceCommittedVaultCandidateV1>> {
  const snapshot = exactDataObject(input, [
    'sourceConsensusCandidate',
    'signedCommitmentTransaction',
    'refundableSourceBox',
    'currentStatePort',
    'route',
  ], 'Ergo source committed-vault candidate input');
  const sourceConsensusCandidate = snapshot.sourceConsensusCandidate;
  const currentStatePort = snapshot.currentStatePort;
  assertErgoSourceConsensusCandidateV1Provenance(sourceConsensusCandidate);
  assertErgoCommittedVaultCurrentStatePortV1Provenance(currentStatePort);
  const route = normalizeRoute(snapshot.route);
  if (
    route.sourceNetworkIdHex
      !== sourceConsensusCandidate.branchSet.sourceNetworkIdHex
    || route.sourceNetworkIdHex !== currentStatePort.sourceNetworkIdHex
  ) {
    throw new Error('Ergo committed-vault route source network binding mismatch');
  }

  const [semantics, refundableSourceBox] = await Promise.all([
    verifyErgoSignedTransactionSemantics({
      expectedTransaction: snapshot.signedCommitmentTransaction,
      expectedTransactionIdHex:
        sourceConsensusCandidate.transaction.commitmentTxIdHex,
      expectedTransactionSigmaDigestHex:
        sourceConsensusCandidate.transaction.transactionSigmaDigestHex,
    }),
    normalizeErgoEip12BoxSnapshot(
      snapshot.refundableSourceBox,
      'Ergo refundable source box',
    ),
  ]);
  assertErgoSignedTransactionSemanticsVerificationProvenance(semantics);
  const intent = deriveIntentFromRefundableSource(refundableSourceBox, route);
  const sourceInputIndices = semantics.inputBoxIdsHex
    .map((boxIdHex, index) => ({ boxIdHex, index }))
    .filter(inputBox => inputBox.boxIdHex === intent.sourceBoxIdHex)
    .map(inputBox => inputBox.index);
  if (sourceInputIndices.length !== 1) {
    throw new Error(
      'signed commitment transaction must reference the exact source once as a spending input',
    );
  }
  if (semantics.dataInputBoxIdsHex.includes(intent.sourceBoxIdHex)) {
    throw new Error('refundable source must not also appear as a data input');
  }
  const vaultOutput = semantics.outputs[0];
  if (vaultOutput === undefined) {
    throw new Error('signed commitment transaction has no OUTPUTS(0) vault');
  }
  assertExactCommittedVaultRegisterSet(
    vaultOutput.additionalRegisters,
    'signed commitment transaction vault',
  );
  const canonicalVaultOutput = semanticOutputToCommittedVault(vaultOutput);
  const vaultBoxIdHex = assertExactCommittedVaultV1(
    intent,
    canonicalVaultOutput,
    route.vaultErgoTreeHex,
  );

  const currentState = await observeErgoCommittedVaultCurrentStateV1({
    port: currentStatePort,
    sourceBoxIdHex: intent.sourceBoxIdHex,
    vaultBoxIdHex,
  });
  assertErgoCommittedVaultCurrentStateObservationV1Provenance(currentState);
  assertExactCommittedVaultRegisterSet(
    currentState.currentVaultBox.additionalRegisters,
    'current committed vault',
  );
  assertExactCommittedVaultV1(
    intent,
    currentBoxToCommittedVault(currentState.currentVaultBox),
    route.vaultErgoTreeHex,
  );
  if (
    canonicalJson(semanticOutputToEip12(vaultOutput))
      !== canonicalJson(currentState.currentVaultBox)
  ) {
    throw new Error(
      'current committed vault does not match the authenticated transaction output',
    );
  }

  const body = {
    schema: ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_SCHEMA,
    status: ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_STATUS,
    consensus: {
      sourceConsensusCandidateDigestHex:
        sourceConsensusCandidate.candidateDigestHex,
      sourceNetworkIdHex: route.sourceNetworkIdHex,
      selectedTipHeaderIdHex:
        sourceConsensusCandidate.branchSet.selectedTipHeaderIdHex,
      targetHeaderIdHex: sourceConsensusCandidate.targetHeader.headerIdHex,
      confirmations: sourceConsensusCandidate.targetHeader.confirmations,
      requiredConfirmations:
        sourceConsensusCandidate.targetHeader.requiredConfirmations,
    },
    route: {
      routeProfileId: route.routeProfileId,
      sourceLockErgoTreeHex: route.sourceLockErgoTreeHex,
      sourceLockErgoTreeSha256Hex:
        sha256HexBytes(route.sourceLockErgoTreeHex),
      vaultErgoTreeHex: route.vaultErgoTreeHex,
      vaultErgoTreeSha256Hex: sha256HexBytes(route.vaultErgoTreeHex),
    },
    transition: {
      transactionIdHex: semantics.transactionIdHex,
      transactionSigmaDigestHex: semantics.transactionSigmaDigestHex,
      transactionSemanticsDigestHex: sha256CanonicalJson(
        semantics,
        ERGO_SOURCE_COMMITTED_VAULT_TRANSACTION_SEMANTICS_V1_DIGEST_DOMAIN,
      ),
      sourceBoxIdHex: intent.sourceBoxIdHex,
      sourceBoxContentDigestHex: sha256CanonicalJson(refundableSourceBox),
      sourceInputIndex: sourceInputIndices[0]!,
      sourceInputCount: 1 as const,
      vaultBoxIdHex,
      vaultOutputIndex: 0 as const,
      currentStateObservationDigestHex: currentState.observationDigestHex,
    },
    settlement: {
      assetProfileId: intent.assetProfileId,
      asset: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.asset,
      assetIdHex: NATIVE_ERG_ASSET_ID_HEX,
      amountUnit: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.amountUnit,
      amountNanoErg: intent.amountNanoErg.toString(),
      recipientH160Hex: intent.targetH160Hex,
      depositorErgoTreeSha256Hex:
        sha256HexBytes(intent.depositorErgoTreeHex!),
    },
    checks: {
      sourceConsensusCandidateProvenanceVerified: true as const,
      exactSignedTransactionBytesReparsed: true as const,
      exactRefundableSourceBoxBytesBound: true as const,
      exactSourceReferencedOnceAsSpendingInput: true as const,
      exactConfiguredVaultOutputZeroBound: true as const,
      freshSourceAbsentBeforeAndAfterVaultReads: true as const,
      freshVaultStableBeforeAndAfterSourceRecheck: true as const,
      currentVaultMatchesAuthenticatedTransactionOutput: true as const,
      exactNativeErgAmountRecipientAndRouteBound: true as const,
    },
    authority: {
      checkpointExternallyAuthenticated: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      sourceRpcAcceptedAsConsensus: false as const,
      routeProfileExternallyReviewedAndActivated: false as const,
      sourceDepositSidechainBindingProved: false as const,
      sourceTransactionExecutionValidated: false as const,
      historicalConsumptionBeforeMintProved: false as const,
      persistedReceiptAcceptedAsAuthority: false as const,
      mintAuthorized: false as const,
      daemonAdmissionAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The source-consensus checkpoint and complete competing-branch knowledge remain external open assumptions.',
      'The static source-lock and committed-vault route profile is binding input and is not activated or accepted as funds authority.',
      'The fresh UTXO reads are point-in-time evidence from one configured source, not authenticated Ergo consensus.',
      'The V1 deposit registers bind source, recipient, amount and depositor but do not encode the sidechain ID.',
      'Signed-input membership does not independently validate transaction execution or the source state transition.',
      'Current source absence and vault presence do not establish historical ordering before a sidechain mint.',
      'No persistence row, receipt field, caller boolean, mint, daemon, signer, submitter or broadcaster is connected.',
    ] as const,
  };
  const candidate = deepFreeze({
    ...body,
    candidateDigestHex: sha256CanonicalJson(
      body,
      ERGO_SOURCE_COMMITTED_VAULT_CANDIDATE_V1_DIGEST_DOMAIN,
    ),
  });
  CANDIDATES.add(candidate);
  return candidate;
}

export function assertErgoSourceCommittedVaultCandidateV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoSourceCommittedVaultCandidateV1> {
  if (typeof value !== 'object' || value === null || !CANDIDATES.has(value)) {
    throw new Error(
      'Ergo source committed-vault candidate was not produced by the V1 builder',
    );
  }
}

function normalizeRoute(value: unknown): ErgoCommittedVaultRouteV1 {
  const raw = exactDataObject(value, [
    'assetProfileId',
    'routeProfileId',
    'sourceNetworkIdHex',
    'sourceLockErgoTreeHex',
    'vaultErgoTreeHex',
  ], 'Ergo committed-vault route');
  if (raw.routeProfileId !== 'committed-vault-v3') {
    throw new Error('Ergo committed-vault route profile is unsupported');
  }
  const assetProfile = selectSubstrateGrandpaV1AssetProfile(raw.assetProfileId);
  return Object.freeze({
    routeProfileId: 'committed-vault-v3',
    sourceNetworkIdHex: fixedHex(
      raw.sourceNetworkIdHex,
      32,
      'Ergo committed-vault route source network ID',
    ),
    assetProfileId: assetProfile.assetProfileId,
    sourceLockErgoTreeHex: variableHex(
      raw.sourceLockErgoTreeHex,
      'Ergo committed-vault route source-lock ErgoTree',
    ),
    vaultErgoTreeHex: variableHex(
      raw.vaultErgoTreeHex,
      'Ergo committed-vault route vault ErgoTree',
    ),
  });
}

function deriveIntentFromRefundableSource(
  box: Readonly<ErgoCanonicalEip12Box>,
  route: ErgoCommittedVaultRouteV1,
): PegInMintIntentV1 {
  if (box.ergoTree.toLowerCase() !== route.sourceLockErgoTreeHex) {
    throw new Error('refundable source box uses another route ErgoTree');
  }
  if (box.assets.length !== 0) {
    throw new Error('refundable source box must contain only native ERG');
  }
  const registerKeys = Object.keys(box.additionalRegisters).sort();
  if (canonicalJson(registerKeys) !== canonicalJson(['R4', 'R5', 'R6', 'R7'])) {
    throw new Error('refundable source box must contain exactly R4-R7');
  }
  const targetH160Hex = decodeCollByteRegister(
    box.additionalRegisters.R4!,
    'refundable source R4',
  );
  if (targetH160Hex.length !== 40) {
    throw new Error('refundable source R4 must contain a 20-byte recipient');
  }
  const amountNanoErg = BigInt(box.value);
  if (
    decodeCanonicalLongRegister(
      box.additionalRegisters.R5!,
      'refundable source R5',
    ) !== amountNanoErg
  ) {
    throw new Error('refundable source R5 must equal the source box value');
  }
  const signerMetadataHex = decodeCollByteRegister(
    box.additionalRegisters.R6!,
    'refundable source R6',
  );
  if (!/^(?:02|03)[0-9a-f]{64}$/.test(signerMetadataHex)) {
    throw new Error('refundable source R6 must contain one compressed public key');
  }
  const depositorErgoTreeHex = decodeCollByteRegister(
    box.additionalRegisters.R7!,
    'refundable source R7',
  );
  if (depositorErgoTreeHex.length === 0) {
    throw new Error('refundable source R7 depositor ErgoTree must not be empty');
  }
  return Object.freeze({
    assetProfileId: route.assetProfileId,
    sourceBoxIdHex: box.boxId.toLowerCase(),
    targetH160Hex,
    amountNanoErg,
    depositorErgoTreeHex,
  });
}

function semanticOutputToCommittedVault(
  output: Readonly<ErgoSignedTransactionSemanticOutput>,
): CanonicalCommittedVaultV1 {
  return Object.freeze({
    boxIdHex: output.boxIdHex,
    valueNanoErg: BigInt(output.valueNanoErg),
    ergoTreeHex: output.ergoTreeHex,
    tokenCount: output.assets.length,
    registers: Object.freeze({
      R4: output.additionalRegisters.R4,
      R5: output.additionalRegisters.R5,
      R6: output.additionalRegisters.R6,
      R7: output.additionalRegisters.R7,
    }),
  });
}

function assertExactCommittedVaultRegisterSet(
  registers: Readonly<Record<string, string>>,
  label: string,
): void {
  const actual = Object.keys(registers).sort();
  if (canonicalJson(actual) !== canonicalJson(['R4', 'R5', 'R6', 'R7'])) {
    throw new Error(`${label} must contain exactly R4-R7`);
  }
}

function currentBoxToCommittedVault(
  box: Readonly<{
    boxId: string;
    value: string;
    ergoTree: string;
    assets: readonly unknown[];
    additionalRegisters: Readonly<Record<string, string>>;
  }>,
): CanonicalCommittedVaultV1 {
  return Object.freeze({
    boxIdHex: box.boxId,
    valueNanoErg: BigInt(box.value),
    ergoTreeHex: box.ergoTree,
    tokenCount: box.assets.length,
    registers: Object.freeze({
      R4: box.additionalRegisters.R4,
      R5: box.additionalRegisters.R5,
      R6: box.additionalRegisters.R6,
      R7: box.additionalRegisters.R7,
    }),
  });
}

function semanticOutputToEip12(
  output: Readonly<ErgoSignedTransactionSemanticOutput>,
): Record<string, unknown> {
  return {
    boxId: output.boxIdHex,
    value: output.valueNanoErg,
    ergoTree: output.ergoTreeHex,
    assets: output.assets.map(asset => ({
      tokenId: asset.tokenIdHex,
      amount: asset.amount,
    })),
    additionalRegisters: { ...output.additionalRegisters },
    creationHeight: output.creationHeight,
    transactionId: output.transactionIdHex,
    index: output.outputIndex,
  };
}

function exactDataObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, any> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  }
  const snapshot: Record<string, any> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  return clean.toLowerCase();
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function sha256HexBytes(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
