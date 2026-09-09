import {
  assertFederatedGenesisOperatorV1, signFederatedGenesisReservationV1,
  type FederatedGenesisOperatorV1,
} from '../../adapters/federated-genesis-operator-v1.js';
import { observeFederatedGenesisReservationTargetV1 } from '../../adapters/federated-genesis-target-observation-v1.js';
import {
  reserveFederatedNativeReservationAttemptV1, submitFederatedNativeReservationV1,
  sealFederatedNativeReservationV1, observeFederatedNativeReservationInclusionV1,
} from '../../adapters/federated-native-reservation-execution-v1.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4, encodePooledReserveMintReservationPendingV4ScaleHex,
} from '../../pooled-reserve-mint-reservation-runtime-state-v4.js';
import { blake2b } from 'blakejs';
import { assertOwnedFederatedGenesisDevnetTargetV1, type OwnedFederatedGenesisDevnetTargetV1 }
  from '../../substrate-federated-authority-safe-devnet-process-v1.js';
import {
  assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
  type SubstrateFederatedNativeGenesisMintSourceProofReceiptV1,
} from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import type { SubstrateFederatedNativeGenesisPegInMintReservationDraftV1 }
  from '../../substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  assertObservedSubstrateFederatedGenesisV1, type ObservedSubstrateFederatedGenesisV1,
} from '../../substrate-federated-observed-genesis-v1.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 }
  from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';

interface SigningInput {
  readonly operator: Readonly<FederatedGenesisOperatorV1>;
  readonly sourceSession: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
  readonly draft: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1>;
  readonly proof: Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1>;
  readonly compiled: Readonly<ObservedSubstrateFederatedGenesisV1>;
  readonly target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
  readonly frontierTarget: Readonly<OwnedFederatedGenesisDevnetTargetV1>;
  readonly expectedStorage: Readonly<Record<string, string>>;
  readonly expectedGenesisHashHex: string;
}

/** Caller must reobserve the owned target before transport. A signature is not acceptance. */
export async function signFrontierNativeProofBoundReservationV1(input: Readonly<SigningInput>) {
  return signCaptured(capture(input));
}

/** Owns one explicit local attempt. Inclusion remains observation, not mint authority. */
export async function executeFrontierNativeProofBoundReservationV1(input: Readonly<{
  signing: Readonly<SigningInput>;
  attemptDirectory: string;
  broadcastScope: 'fed-native-local-synthetic-reservation-only';
}>) {
  exact(input, ['signing', 'attemptDirectory', 'broadcastScope']);
  const { attemptDirectory, broadcastScope } = input;
  if (broadcastScope !== 'fed-native-local-synthetic-reservation-only') throw new Error('native reservation broadcast scope is absent');
  const retained = capture(input.signing);
  retained.assertCurrent();
  const { proof, operator } = retained.input;
  // This consumer seals the first native block, not an arbitrary-height reservation.
  const pending = encodePooledReserveMintReservationPendingV4ScaleHex({
    profileIdHex: proof.runtimeProfileIdHex, statementHex: proof.request.statementHex,
    statementIdHex: proof.mintReservationStatementIdHex, mintIdentityHex: proof.mintIdentityHex,
    sourceStatementBytesDigestHex: blake(Buffer.from(proof.request.statementHex.slice(2), 'hex')),
    sourceProofSystemIdHex: proof.request.runtimeProfile.sourceProofSystemIdHex,
    sourceProofProfileIdHex: proof.sourceProofProfileIdHex,
    sourceProofIssuedAtNativeHeight: proof.result.issuedAtNativeHeight,
    sourceProofRequestDigestHex: proof.requestDigestHex, sourceProofResultIdHex: proof.signatureVerification.resultIdHex,
    sourceProofDigestHex: blake(Buffer.concat([Buffer.from('E2S_POOLED_RESERVE_FEDERATED_SOURCE_PROOF_ENVELOPE_V1', 'ascii'),
      Buffer.from(proof.signatureVerification.resultIdHex.slice(2), 'hex'),
      Buffer.from(proof.signatureVerification.signatureSetDigestHex.slice(2), 'hex')])),
    reservedAtNativeHeight: '1', expiresAtNativeHeight: proof.result.expiresAtNativeHeight,
  });
  const keys = derivePooledReserveMintReservationRuntimeStorageKeysV4(proof.mintIdentityHex);
  const signed = await signCaptured(retained);
  const attempt = reserveFederatedNativeReservationAttemptV1(attemptDirectory, {
    genesisHashHex: signed.genesisHashHex, extrinsicHashHex: signed.extrinsicHashHex, signedExtrinsicHex: signed.signedExtrinsicHex,
  });
  // Keep the durable hold through any failure; reobserve both targets after signing and before transport.
  await retained.observe();
  const authorize = () => { retained.assertCurrent(); };
  await submitFederatedNativeReservationV1(attempt, authorize);
  retained.assertCurrent();
  const blockHashHex = await sealFederatedNativeReservationV1(attempt, authorize);
  retained.assertCurrent();
  const observed = await observeFederatedNativeReservationInclusionV1({ attempt, blockHashHex,
    expectedStorage: {
      [keys.runtimeCodeStorageKeyHex]: retained.input.expectedStorage[keys.runtimeCodeStorageKeyHex]!,
      [keys.currentProfileStorageKeyHex]: proof.runtimeProfileScaleHex, [keys.enforcementStorageKeyHex]: '0x01',
      [keys.pendingKeysStorageKeyHex]: `0x04${proof.mintIdentityHex.slice(2)}`,
      [keys.pendingReservationStorageKeyHex]: pending,
      [keys.consumedReservationStorageKeyHex]: null, [keys.invalidatedReservationStorageKeyHex]: null,
      '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b': null,
    }, operatorStorageKeyHex: operator.nativeFunding.storageKeyHex,
    originalOperatorAccountHex: operator.nativeFunding.accountInfoScaleHex,
  }, authorize);
  retained.assertCurrent();
  return Object.freeze({ ...observed, pendingReservationScaleHex: pending,
    sourceProofReceiptDigestHex: proof.receiptDigestHex, mintIdentityHex: proof.mintIdentityHex,
    runtimeProfileIdHex: proof.runtimeProfileIdHex, runtimeReservationObserved: true as const, mintExecuted: false as const });
}

function capture(input: Readonly<SigningInput>) {
  const fields = ['operator', 'sourceSession', 'draft', 'proof', 'compiled', 'target', 'frontierTarget', 'expectedStorage', 'expectedGenesisHashHex'];
  exact(input, fields);
  exact(input.expectedStorage, Object.getOwnPropertyNames(input.expectedStorage));
  input = Object.freeze({ ...input, expectedStorage: Object.freeze({ ...input.expectedStorage }) });
  const { operator, sourceSession, draft, proof, compiled, target, frontierTarget, expectedStorage, expectedGenesisHashHex } = input;
  const assertCurrent = () => {
    assertFederatedGenesisOperatorV1(operator);
    assertObservedSubstrateFederatedGenesisV1(compiled, target);
    assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1(proof, sourceSession, draft);
    assertOwnedFederatedGenesisDevnetTargetV1(frontierTarget);
    if (compiled.preparation.operatorAddressHex !== operator.addressHex
      || compiled.preparation.launchDomainHex !== operator.launchDomainHex
      || compiled.candidate.genesisJsonSha256Hex !== proof.genesisJsonSha256Hex
      || compiled.candidate.runtimeProfileScaleHex !== proof.runtimeProfileScaleHex
      || compiled.candidate.runtimeProfileIdHex !== proof.runtimeProfileIdHex
      || frontierTarget.genesisJsonSha256Hex !== compiled.candidate.genesisJsonSha256Hex
      || frontierTarget.primaryRpcUrl !== 'http://127.0.0.1:19955'
      || frontierTarget.witnessRpcUrl !== 'http://127.0.0.1:19956') {
      throw new Error('native reservation proof differs from retained operator or genesis');
    }
  };
  const observe = async () => {
    assertCurrent();
    const result = await observeFederatedGenesisReservationTargetV1({ expectedStorage, expectedGenesisHashHex,
      sourceRuntimeCodeSha256Hex: compiled.preparation.application.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: compiled.preparation.application.sourceRuntimeCodeBytes,
      runtimeProfileScaleHex: compiled.candidate.runtimeProfileScaleHex,
      operatorStorageKeyHex: operator.nativeFunding.storageKeyHex,
      operatorAccountInfoHex: operator.nativeFunding.accountInfoScaleHex,
    });
    assertCurrent();
    return result;
  };
  return { input, assertCurrent, observe };
}

function exact(input: unknown, fields: readonly string[]): void {
  if (input === null || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertyNames(input).length !== fields.length || Object.getOwnPropertySymbols(input).length !== 0
    || fields.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })) throw new Error('native reservation composition requires exact own-data fields');
}

async function signCaptured(retained: ReturnType<typeof capture>) {
  const { operator, proof } = retained.input;
  const { genesisHashHex, nonce } = await retained.observe();
  const signed = signFederatedGenesisReservationV1(operator, { genesisHashHex, nonce,
    statementHex: proof.request.statementHex, sourceProofEnvelopeScaleHex: proof.sourceProofEnvelopeScaleHex });
  retained.assertCurrent();
  return Object.freeze({ ...signed, sourceProofReceiptDigestHex: proof.receiptDigestHex,
    mintIdentityHex: proof.mintIdentityHex, runtimeProfileIdHex: proof.runtimeProfileIdHex,
    runtimeReservationEstablished: false as const, mintExecuted: false as const, broadcastAuthorized: false as const });
}

function blake(bytes: Buffer): string { return `0x${Buffer.from(blake2b(bytes, undefined, 32)).toString('hex')}`; }
