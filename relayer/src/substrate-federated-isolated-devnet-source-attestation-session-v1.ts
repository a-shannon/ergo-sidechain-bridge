import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  buildFederatedPooledReserveSourceProofProfileV1,
  type FederatedPooledReserveSourceProofProfileV1,
  type FederatedPooledReserveSourceProofProfileV1Input,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance,
  deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1,
  type SubstrateFederatedIsolatedDevnetLaunchStatementV1,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-source-attestation-session.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1 =
  3 as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1 =
  2 as const;

const BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_BINDING_V1';
const SESSIONS = new WeakSet<object>();

type SourceSigner = Readonly<{
  readonly privateKey: KeyObject;
  readonly publicKeyHex: string;
}>;

export interface CreateSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Input {
  readonly ergoAdmissionThreshold: number;
  readonly ergoAdmissionPublicKeysHex: readonly string[];
}

export interface SubstrateFederatedIsolatedDevnetSourceAttestationBindingV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA;
  readonly version: 1;
  readonly bindingDigestHex: string;
  readonly sourceAttestationThreshold:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1;
  readonly sourceAttestationPublicKeysHex: readonly string[];
  readonly checkpointFederationProfileIdHex: string;
  readonly checkpointSourceAttestationKeySetDigestHex: string;
  readonly federatedMintProfile:
    Readonly<FederatedPooledReserveSourceProofProfileV1>;
  readonly checks: Readonly<{
    readonly oneFreshPublicKeySetBindsBothDomains: true;
    readonly checkpointAndMintProfileDomainsRemainDistinct: true;
    readonly privateKeysExcludedFromBinding: true;
  }>;
  readonly boundaries: Readonly<{
    readonly processOwnedSyntheticCustodyOnly: true;
    readonly independentAttestorCustodyEstablished: false;
    readonly runtimeProviderCompiled: false;
    readonly runtimeProfileActivated: false;
    readonly sourceProofProduced: false;
    readonly mintReservationWritten: false;
    readonly mintExecuted: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1 {
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationBindingV1>;
  readonly signLaunchStatement: (
    statement: Readonly<
      SubstrateFederatedIsolatedDevnetLaunchStatementV1
    >,
  ) => readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly dispose: () => void;
}

export function createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1(
  input: Readonly<
    CreateSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Input
  >,
): Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1> {
  const record = exactRecord(
    input,
    ['ergoAdmissionPublicKeysHex', 'ergoAdmissionThreshold'],
    'isolated-devnet source-attestation session input',
  );
  let signers = Array.from(
    {
      length:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1,
    },
    sourceSigner,
  ).sort((left, right) => compareStrings(
    left.publicKeyHex,
    right.publicKeyHex,
  ));
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    maxAdmissionValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    sourceAttestationPublicKeysHex:
      signers.map(value => value.publicKeyHex),
    ergoAdmissionThreshold: record.ergoAdmissionThreshold as number,
    ergoAdmissionPublicKeysHex:
      record.ergoAdmissionPublicKeysHex as readonly string[],
  });
  const mintProfileInput = deepFreeze({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    threshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    signerPublicKeysHex:
      signers.map(value => `0x${value.publicKeyHex}`),
    maxValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    verifierProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  } satisfies FederatedPooledReserveSourceProofProfileV1Input);
  const federatedMintProfile =
    buildFederatedPooledReserveSourceProofProfileV1(mintProfileInput);
  if (
    checkpointProfile.sourceAttestationKeySetDigestHex
      === federatedMintProfile.sourceAttestationKeySetDigestHex
  ) {
    throw new Error('isolated-devnet source-attestation domains aliased');
  }
  const bindingBody = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA,
    version: 1 as const,
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    sourceAttestationPublicKeysHex:
      checkpointProfile.sourceAttestationPublicKeysHex,
    checkpointFederationProfileIdHex: checkpointProfile.profileIdHex,
    checkpointSourceAttestationKeySetDigestHex:
      checkpointProfile.sourceAttestationKeySetDigestHex,
    federatedMintProfile,
    checks: {
      oneFreshPublicKeySetBindsBothDomains: true as const,
      checkpointAndMintProfileDomainsRemainDistinct: true as const,
      privateKeysExcludedFromBinding: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const binding = deepFreeze({
    ...bindingBody,
    bindingDigestHex: sha256CanonicalJson(bindingBody, BINDING_DIGEST_DOMAIN),
  });
  let state: 'open' | 'disposed' = 'open';
  let launchSigned = false;
  const session = Object.freeze({
    binding,
    signLaunchStatement: (
      statement: Readonly<
        SubstrateFederatedIsolatedDevnetLaunchStatementV1
      >,
    ) => {
      assertOpen(state);
      if (launchSigned) {
        throw new Error('isolated-devnet launch attestation is already signed');
      }
      assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance(
        statement,
      );
      const federation = statement.target.federation;
      if (
        federation.sourceAttestationKeySetDigestHex
          !== binding.checkpointSourceAttestationKeySetDigestHex
        || federation.sourceAttestationThreshold
          !== binding.sourceAttestationThreshold
        || federation.federationProfileIdHex
          !== binding.checkpointFederationProfileIdHex
        || !sameStrings(
          federation.sourceAttestationPublicKeysHex,
          binding.sourceAttestationPublicKeysHex,
        )
      ) {
        throw new Error('isolated-devnet launch statement targets a different profile');
      }
      const digestHex =
        deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1({
          statementDigestHex: statement.statementDigestHex,
          sourceAttestationKeySetDigestHex:
            federation.sourceAttestationKeySetDigestHex,
          sourceAttestationThreshold: federation.sourceAttestationThreshold,
        });
      if (digestHex !== statement.attestationDigestHex) {
        throw new Error('isolated-devnet launch statement attestation digest drifted');
      }
      launchSigned = true;
      return signThreshold(signers, digestHex);
    },
    dispose: () => {
      if (state === 'open') {
        signers = [];
        state = 'disposed';
      }
    },
  });
  SESSIONS.add(session);
  return session;
}

export function assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !SESSIONS.has(value)
  ) {
    throw new Error('isolated-devnet source-attestation session lacks provenance');
  }
}

function signThreshold(
  signers: readonly SourceSigner[],
  digestHex: string,
): readonly Readonly<
  SubstrateFederatedIsolatedDevnetLaunchSignatureV1
>[] {
  const normalizedDigestHex = digestHex.startsWith('0x')
    ? digestHex.slice(2)
    : digestHex;
  if (
    signers.length
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1
    || !/^[0-9a-f]{64}$/.test(normalizedDigestHex)
  ) {
    throw new Error('isolated-devnet source-attestation capability is invalid');
  }
  return deepFreeze(signers.slice(
    0,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
  ).map(value => ({
    signerPublicKeyHex: value.publicKeyHex,
    signatureHex: sign(
      null,
      Buffer.from(normalizedDigestHex, 'hex'),
      value.privateKey,
    ).toString('hex'),
  })));
}

function sourceSigner(): SourceSigner {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  });
  return Object.freeze({
    privateKey,
    publicKeyHex: Buffer.from(publicKeyDer).subarray(-32).toString('hex'),
  });
}

function falseBoundaries() {
  return Object.freeze({
    processOwnedSyntheticCustodyOnly: true as const,
    independentAttestorCustodyEstablished: false as const,
    runtimeProviderCompiled: false as const,
    runtimeProfileActivated: false as const,
    sourceProofProduced: false as const,
    mintReservationWritten: false as const,
    mintExecuted: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function assertOpen(state: 'open' | 'disposed'): void {
  if (state !== 'open') {
    throw new Error('isolated-devnet source-attestation session is disposed');
  }
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort(compareStrings);
  const fields = [...expected].sort(compareStrings);
  if (
    actual.length !== fields.length
    || actual.some((field, index) => field !== fields[index])
    || Object.values(descriptors).some(
      descriptor => !descriptor.enumerable || !('value' in descriptor),
    )
  ) {
    throw new Error(`${label} must contain exactly: ${fields.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
