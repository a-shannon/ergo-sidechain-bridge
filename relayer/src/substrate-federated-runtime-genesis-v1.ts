import { createHash } from 'node:crypto';

import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { loadTrackedDeploymentIdentityArtifactProfile } from './read-only-deployment-identity-observer.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import {
  assertTrackedStorageLayouts,
  parseStrictJsonPreservingNumbers,
  stringifyJsonPreservingNumbers,
} from './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';
import {
  buildFederatedPooledReserveSourceProofProfileV1,
  encodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  type FederatedPooledReserveSourceProofProfileV1Input,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
} from './substrate-federated-settlement-family-jvm-compiler-v2.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';
import { SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX } from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import type { SubstrateFederatedTrackerApplicationBindingV1 } from './substrate-federated-tracker-compiler-v1.js';

const UINT64_MAX = (1n << 64n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
// The selected Frontier runtime dispatches these addresses before EVM code.
const PRECOMPILE_ADDRESSES = new Set([1, 2, 3, 4, 5, 1024, 1025]
  .map(value => value.toString(16).padStart(40, '0')));

export interface PrepareSubstrateFederatedGenesisV1Input {
  readonly bridgeRoot: string;
  readonly launchDomainHex: string;
  readonly evmChainId: string;
  readonly operatorAddressHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly runtimeWasm: Uint8Array;
  readonly expectedRuntimeWasmSha256Hex: string;
  readonly checkpointProfile: SubstrateFederatedCheckpointProfileV1Input;
  readonly mintProofProfile: FederatedPooledReserveSourceProofProfileV1Input;
  readonly endowments: readonly { readonly addressHex: string; readonly balance: string }[];
}

export interface SubstrateFederatedGenesisPreparationV1 {
  readonly schema: 'e2s.substrate-federated-genesis-preparation.v1';
  readonly launchDomainHex: string;
  readonly evmChainId: string;
  readonly operatorAddressHex: string;
  readonly application: Readonly<SubstrateFederatedTrackerApplicationBindingV1>;
  readonly checkpointProfile: ReturnType<typeof buildSubstrateFederatedCheckpointProfileV1>;
  readonly mintProofProfile: ReturnType<typeof buildFederatedPooledReserveSourceProofProfileV1>;
  readonly mintProofProfileScaleHex: string;
}

const preparations = new WeakMap<object, {
  readonly artifact: ReturnType<typeof loadTrackedDeploymentIdentityArtifactProfile>;
  readonly endowments: readonly { readonly addressHex: string; readonly balance: string }[];
}>();

/** Pre-genesis identities do not include a final spec, genesis hash or family ID. */
export function prepareSubstrateFederatedGenesisV1(input: PrepareSubstrateFederatedGenesisV1Input):
Readonly<SubstrateFederatedGenesisPreparationV1> {
  input = exact(input, ['bridgeRoot', 'launchDomainHex', 'evmChainId', 'operatorAddressHex',
    'bridgeAddressHex', 'tokenAddressHex', 'runtimeWasm', 'expectedRuntimeWasmSha256Hex',
    'checkpointProfile', 'mintProofProfile', 'endowments'], 'FED genesis preparation');
  const launchDomainHex = hex(input.launchDomainHex, 32, 'launch domain');
  const evmChainId = uint(input.evmChainId, UINT64_MAX, 'EVM chain ID');
  if (BigInt(evmChainId) <= 1n) throw new Error('FED genesis requires an isolated EVM chain ID');
  const operatorAddressHex = hex(input.operatorAddressHex, 20, 'operator');
  const bridgeAddressHex = hex(input.bridgeAddressHex, 20, 'bridge');
  const tokenAddressHex = hex(input.tokenAddressHex, 20, 'token');
  if (new Set([operatorAddressHex, bridgeAddressHex, tokenAddressHex]).size !== 3) {
    throw new Error('FED genesis operator, bridge and token must be distinct');
  }
  if (PRECOMPILE_ADDRESSES.has(bridgeAddressHex) || PRECOMPILE_ADDRESSES.has(tokenAddressHex)) {
    throw new Error('FED genesis application cannot occupy a runtime precompile address');
  }
  if (!(input.runtimeWasm instanceof Uint8Array) || input.runtimeWasm.length < 8
    || input.runtimeWasm.length > 16 * 1024 * 1024) {
    throw new Error('FED genesis runtime WASM is outside its byte bound');
  }
  const runtimeWasm = Buffer.from(input.runtimeWasm);
  if (!runtimeWasm.subarray(0, 8).equals(Buffer.from('0061736d01000000', 'hex'))) {
    throw new Error('FED genesis requires a WASM version-one module');
  }
  const sourceRuntimeCodeSha256Hex = sha256(runtimeWasm);
  if (sourceRuntimeCodeSha256Hex !== hex(input.expectedRuntimeWasmSha256Hex, 32, 'runtime WASM pin')) {
    throw new Error('FED genesis runtime WASM differs from its explicit pin');
  }
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1(input.checkpointProfile);
  const mintProofProfile = buildFederatedPooledReserveSourceProofProfileV1(input.mintProofProfile);
  if (mintProofProfile.verifierProfileIdHex !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX) {
    throw new Error('FED genesis requires the canonical source verifier');
  }
  if (mintProofProfile.signerPublicKeysHex.some(key =>
    (FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX as readonly string[]).includes(key))) {
    throw new Error('FED genesis rejects every static reference source key');
  }
  if (checkpointProfile.federationEpoch !== mintProofProfile.federationEpoch
    || checkpointProfile.sourceAttestationThreshold !== mintProofProfile.threshold
    || canonicalJson(checkpointProfile.sourceAttestationPublicKeysHex)
      !== canonicalJson(mintProofProfile.signerPublicKeysHex.map(key => key.slice(2)))) {
    throw new Error('FED genesis checkpoint and mint federations differ');
  }
  if (!Array.isArray(input.endowments) || input.endowments.length === 0 || input.endowments.length > 32) {
    throw new Error('FED genesis requires one to 32 explicit endowments');
  }
  const seen = new Set<string>();
  const endowments = input.endowments.map(item => {
    exact(item, ['addressHex', 'balance'], 'FED endowment');
    const addressHex = hex(item.addressHex, 20, 'endowment address');
    const balance = uint(item.balance, UINT128_MAX, 'endowment balance');
    if (balance === '0' || seen.has(addressHex) || addressHex === bridgeAddressHex || addressHex === tokenAddressHex) {
      throw new Error('FED genesis endowment is duplicate, empty or aliases application code');
    }
    seen.add(addressHex);
    return Object.freeze({ addressHex, balance });
  }).sort((a, b) => a.addressHex < b.addressHex ? -1 : a.addressHex > b.addressHex ? 1 : 0);
  if (!seen.has(operatorAddressHex)) throw new Error('FED genesis operator must have explicit fee funding');
  if (endowments.reduce((total, item) => total + BigInt(item.balance), 0n) > UINT128_MAX) {
    throw new Error('FED genesis total endowment exceeds native issuance bounds');
  }

  const artifact = loadTrackedDeploymentIdentityArtifactProfile(input.bridgeRoot);
  assertTrackedStorageLayouts(input.bridgeRoot);
  const sourceNetworkIdHex = sha256CanonicalJson({ scope: 'isolated-devnet', launchDomainHex, evmChainId },
    'E2S_FED_GENESIS_SOURCE_NETWORK_V1');
  const sidechainIdHex = sha256CanonicalJson({ sourceNetworkIdHex, bridgeAddressHex, tokenAddressHex },
    'E2S_FED_GENESIS_SIDECHAIN_V1');
  const applicationBytes = {
    bridgeAddressHex, tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: artifact.bridge.runtimeBytecodeSha256Hex,
    bridgeRuntimeCodeBytes: artifact.bridge.runtimeByteLength,
    tokenRuntimeCodeSha256Hex: artifact.token.runtimeBytecodeSha256Hex,
    tokenRuntimeCodeBytes: artifact.token.runtimeByteLength,
    sourceRuntimeCodeSha256Hex, sourceRuntimeCodeBytes: runtimeWasm.length,
  };
  const runtimeProfileIdHex = sha256CanonicalJson({ ...applicationBytes, operatorAddressHex,
    checkpointProfileIdHex: checkpointProfile.profileIdHex, mintProofProfileIdHex: mintProofProfile.proofProfileIdHex },
  'E2S_FED_GENESIS_RUNTIME_APPLICATION_V1');
  const settlementProfileIdHex = sha256CanonicalJson({ sourceNetworkIdHex, sidechainIdHex,
    settlementNetwork: 'ergo-local-devnet', family: 'substrate-federated-v1', asset: 'native-erg-v1' },
  'E2S_FED_GENESIS_SETTLEMENT_V1');
  const preparation = Object.freeze({
    schema: 'e2s.substrate-federated-genesis-preparation.v1' as const,
    launchDomainHex, evmChainId, operatorAddressHex,
    application: Object.freeze({ sourceNetworkIdHex, sidechainIdHex, ...applicationBytes,
      runtimeProfileIdHex, settlementProfileIdHex }),
    checkpointProfile, mintProofProfile,
    mintProofProfileScaleHex: encodeFederatedPooledReserveSourceProofProfileScaleV1Hex({
      federationEpoch: mintProofProfile.federationEpoch,
      threshold: mintProofProfile.threshold,
      signerPublicKeysHex: mintProofProfile.signerPublicKeysHex,
      maxValidityBlocks: mintProofProfile.maxValidityBlocks,
      verifierProfileIdHex: mintProofProfile.verifierProfileIdHex,
    }),
  });
  preparations.set(preparation, { artifact, endowments: Object.freeze(endowments) });
  return preparation;
}

/** Returns input for the selected node's typed loader, never mint or broadcast authority. */
export function buildSubstrateFederatedGenesisV1(input: Readonly<{
  preparation: Readonly<SubstrateFederatedGenesisPreparationV1>;
  familyCompilerInput: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input>;
  familyReceipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2>;
}>) {
  input = exact(input, ['preparation', 'familyCompilerInput', 'familyReceipt'], 'FED genesis build');
  const { preparation, familyReceipt } = input;
  const familyCompilerInput = exact(input.familyCompilerInput,
    ['trackerRequest', 'trackerReceipt', 'templates', 'duplicatePreventionGenesisInputBoxIdHex',
      'pooledReserveGenesisInputBoxIdHex'], 'FED genesis family input');
  const captured = preparations.get(preparation);
  if (!captured) throw new Error('FED genesis preparation lacks process provenance');
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(familyReceipt, familyCompilerInput);
  if (canonicalJson(familyCompilerInput.trackerRequest.application) !== canonicalJson(preparation.application)
    || canonicalJson(familyCompilerInput.trackerRequest.profile) !== canonicalJson(preparation.checkpointProfile)) {
    throw new Error('FED genesis compiled family differs from prepared application or federation');
  }
  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(familyReceipt.profile);
  const app = preparation.application;
  const runtimeProfileScaleHex = encodePooledReserveMintReservationRuntimeProfileV4ScaleHex({
    formatVersion: 4, lineageProfileIdHex: `0x${familyReceipt.profile.familyIdHex}`,
    sourceNetworkIdHex: `0x${family.sourceNetworkIdHex}`, sidechainIdHex: `0x${family.sidechainIdHex}`,
    bridgeAddressHex: `0x${family.bridgeAddressHex}`, tokenAddressHex: `0x${family.tokenAddressHex}`,
    bridgeRuntimeCodeSha256Hex: `0x${app.bridgeRuntimeCodeSha256Hex}`, bridgeRuntimeCodeBytes: app.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: `0x${app.tokenRuntimeCodeSha256Hex}`, tokenRuntimeCodeBytes: app.tokenRuntimeCodeBytes,
    settlementProfileIdHex: `0x${family.settlementProfileIdHex}`,
    ergoDepositFinalityPolicyIdHex: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
    sourceProofSystemIdHex: preparation.mintProofProfile.proofSystemIdHex,
    sourceProofProfileIdHex: preparation.mintProofProfile.proofProfileIdHex,
    activationHeight: '0', maxPendingBlocks: 64,
  });
  const runtimeProfile = decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(runtimeProfileScaleHex);
  const bridge = `0x${app.bridgeAddressHex}`;
  const token = `0x${app.tokenAddressHex}`;
  const operator = `0x${preparation.operatorAddressHex}`;
  const config = {
    system: {}, sudo: { key: null },
    balances: { balances: captured.endowments.map(item => [`0x${item.addressHex}`, rawUint(item.balance)]) },
    aura: { authorities: [] }, grandpa: { authorities: [] },
    transactionPayment: { multiplier: '1000000000000000000' },
    ethereum: {}, baseFee: { baseFeePerGas: '0x3b9aca00', elasticity: 125000 },
    evmChainId: { chainId: rawUint(preparation.evmChainId) },
    evm: { accounts: {
      [bridge]: { nonce: '0x1', balance: '0x0', code: byteArray(captured.artifact.bridge.runtimeBytecodeHex),
        storage: { [slot(0)]: addressWord(preparation.operatorAddressHex), [slot(3)]: addressWord(app.tokenAddressHex) } },
      [token]: { nonce: '0x1', balance: '0x0', code: byteArray(captured.artifact.token.runtimeBytecodeHex),
        storage: { [slot(3)]: shortString('Sidechain ERG'), [slot(4)]: shortString('sERG'), [slot(5)]: addressWord(app.bridgeAddressHex) } },
    } },
    manualSeal: { enable: true },
    bridgeCommitment: { legacyMintQuarantineAddress: bridge,
      pooledReserveMintGenesisV4: [operator, [...Buffer.from(runtimeProfileScaleHex.slice(2), 'hex')]] },
  };
  const genesisJson = stringifyJsonPreservingNumbers(config);
  return Object.freeze({
    schema: 'e2s.substrate-federated-typed-genesis-candidate.v1' as const,
    status: 'typed-genesis-candidate' as const,
    genesisJson, genesisJsonSha256Hex: sha256(Buffer.from(genesisJson)),
    runtimeProfile, runtimeProfileScaleHex,
    runtimeProfileIdHex: derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfile),
    familyIdHex: familyReceipt.profile.familyIdHex,
    sourceRuntimeCodeSha256Hex: app.sourceRuntimeCodeSha256Hex,
  });
}

function exact<T>(value: T, keys: string[], label: string): Readonly<T> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} requires exact plain fields`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some(key => typeof key !== 'string')
    || ownKeys.sort().join(',') !== [...keys].sort().join(',')
    || Object.values(descriptors).some(descriptor => !descriptor.enumerable || !('value' in descriptor))) {
    throw new Error(`${label} requires exact plain fields`);
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, descriptors[key]!.value]))) as Readonly<T>;
}
function hex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value) || /^0+$/.test(value)) {
    throw new Error(`${label} requires nonzero lowercase unprefixed hex`);
  }
  return value;
}
function uint(value: unknown, max: bigint, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > max) {
    throw new Error(`${label} requires a canonical bounded unsigned integer`);
  }
  return value;
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function byteArray(value: string): number[] { return [...Buffer.from(value.replace(/^0x/, ''), 'hex')]; }
function slot(value: number): string { return `0x${value.toString(16).padStart(64, '0')}`; }
function addressWord(value: string): string { return `0x${value.padStart(64, '0')}`; }
function shortString(value: string): string {
  const bytes = Buffer.from(value, 'ascii');
  return `0x${bytes.toString('hex').padEnd(62, '0')}${(bytes.length * 2).toString(16).padStart(2, '0')}`;
}
function rawUint(value: string): unknown { return parseStrictJsonPreservingNumbers(value, 'genesis integer'); }
