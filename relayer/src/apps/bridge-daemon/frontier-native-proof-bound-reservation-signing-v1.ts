import {
  assertFederatedGenesisOperatorV1, signFederatedGenesisReservationV1,
  type FederatedGenesisOperatorV1,
} from '../../adapters/federated-genesis-operator-v1.js';
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
  readonly genesisHashHex: string;
  readonly nonce: number;
}

/** Caller must reobserve the owned target before transport. A signature is not acceptance. */
export function signFrontierNativeProofBoundReservationV1(input: Readonly<SigningInput>) {
  const fields = ['operator', 'sourceSession', 'draft', 'proof', 'compiled', 'target', 'genesisHashHex', 'nonce'];
  if (input === null || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
    || Object.getOwnPropertyNames(input).length !== fields.length || Object.getOwnPropertySymbols(input).length !== 0
    || fields.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value');
    })) throw new Error('native reservation composition requires exact own-data fields');
  const { operator, sourceSession, draft, proof, compiled, target, genesisHashHex, nonce } = input;
  const assertCurrent = () => {
    assertFederatedGenesisOperatorV1(operator);
    assertObservedSubstrateFederatedGenesisV1(compiled, target);
    assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1(proof, sourceSession, draft);
    if (compiled.preparation.operatorAddressHex !== operator.addressHex
      || compiled.preparation.launchDomainHex !== operator.launchDomainHex
      || compiled.candidate.genesisJsonSha256Hex !== proof.genesisJsonSha256Hex
      || compiled.candidate.runtimeProfileScaleHex !== proof.runtimeProfileScaleHex
      || compiled.candidate.runtimeProfileIdHex !== proof.runtimeProfileIdHex) {
      throw new Error('native reservation proof differs from retained operator or genesis');
    }
  };
  assertCurrent();
  const signed = signFederatedGenesisReservationV1(operator, { genesisHashHex, nonce,
    statementHex: proof.request.statementHex, sourceProofEnvelopeScaleHex: proof.sourceProofEnvelopeScaleHex });
  assertCurrent();
  return Object.freeze({ ...signed, sourceProofReceiptDigestHex: proof.receiptDigestHex,
    mintIdentityHex: proof.mintIdentityHex, runtimeProfileIdHex: proof.runtimeProfileIdHex,
    runtimeReservationEstablished: false as const, mintExecuted: false as const, broadcastAuthorized: false as const });
}
