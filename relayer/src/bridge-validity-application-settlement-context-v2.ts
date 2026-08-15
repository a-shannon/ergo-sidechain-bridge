import { createHash } from 'crypto';

import blakejs from 'blakejs';

import { assertContextExtensionSafe } from './context-extension-guard.js';
import {
  decodeBridgeCausalApplicationBindingV2,
  decodeBridgeValidityApplicationPayloadV3,
  deriveBridgeCausalApplicationBindingV2DigestHex,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_SHA256_HEX,
} from './bridge-validity-tracker-contract-v1.js';
import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  extractFrontierBridgeEventRoot,
  type FrontierBridgeEventRootInput,
} from './frontier-bridge-event-root.js';
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  decodeApplicationValiditySpvTrackerValue,
  deriveApplicationValidityPayloadDigestHex,
  deriveApplicationValiditySpvTrackerKey,
  encodeApplicationValiditySpvTrackerAvlRegister,
} from './spv-tracker-validity-v2.js';
import { parseStrictJson } from './strict-json.js';
import {
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_CONTRACT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_BYTES,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_SHA256_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_CONTRACT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_BYTES,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_SHA256_HEX,
  buildValidityApplicationSettlementTxV2,
  type ValidityApplicationSettlementBoxV2,
} from './validity-application-settlement-tx-v2.js';
import {
  VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
  VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  buildValidityApplicationSettlementPlanV2,
  type ValidityApplicationSettlementProfileV2,
} from './validity-application-settlement-v2.js';
import { deriveEip0045ContractIdHex } from './bridge-validity-finality-statement-v2.js';

export const EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_CONTEXT_V2_SCHEMA =
  'e2s.bridge-validity-application-settlement-context.v2';
export const EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_FRONTIER_VECTOR_SHA256_HEX =
  '15059f17a6c81b16ac4861431fe375fcb1f3bfe8ecdd3cbcac92e4b60ee1edc4';

const TRACKER_CONTEXT_SCHEMA =
  'e2s.bridge-validity-application-tracker-context.v2';
const FRONTIER_VECTOR_SCHEMA =
  'e2s.frontier-bridge-event-root-application.vector.v2';
const FRONTIER_PEG_OUT_EVENT = 'PegOut(address,uint256,bytes)';
const FRONTIER_PEG_OUT_TOPIC =
  '0x22257318f701aff7be06ddd1ea71190b56ffc8c5c9431f202df9bf6d9bd25cf3';
const TARGET_BURN_EVENT_INDEX = 5;
const SOURCE_AMOUNT_NANO_ERG = 10_000_000n;
const SETUP_INPUT_BOX_ID_HEX = 'b1'.repeat(32);
const SOURCE_BOX_ID_HEX = 'b2'.repeat(32);
const SOURCE_RECIPIENT_ADDRESS_HEX = 'b5'.repeat(20);
const DUP_AVL_FLAGS = 0x0b;
const SYNTHETIC_FEE_FUNDING_ERGO_TREE_HEX = '10010100d17300';

export interface BuildEip0045BridgeValidityApplicationSettlementContextV2Input {
  readonly trackerContextBytes: Uint8Array;
  readonly contractIdentityBytes: Uint8Array;
  readonly frontierVectorBytes: Uint8Array;
}

export interface Eip0045BridgeValidityApplicationSettlementContextV2 {
  readonly schema:
    typeof EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_CONTEXT_V2_SCHEMA;
  readonly version: 2;
  readonly sourceBindings: {
    readonly trackerContextSha256Hex: string;
    readonly trackerProoflessTransactionIdHex: string;
    readonly trackerOutputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly trackerDigestHex: string;
    readonly applicationPayloadHex: string;
    readonly applicationPayloadBytes: 973;
    readonly applicationPayloadBlake2b256Hex: string;
    readonly contractIdentitySha256Hex: string;
    readonly frontierVectorSha256Hex: string;
    readonly frontierVectorNormalizedLfSha256Hex: string;
    readonly publicFrontierRootVectorProvenanceMatched: boolean;
    readonly frontierVectorSchema: typeof FRONTIER_VECTOR_SCHEMA;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly targetBurnIdHex: string;
    readonly targetEventIndex: typeof TARGET_BURN_EVENT_INDEX;
  };
  readonly profile: ValidityApplicationSettlementProfileV2;
  readonly settlementProfileIdHex: string;
  readonly contractIdentity: {
    readonly schema:
      typeof VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA;
    readonly sigmaStateCommit:
      typeof VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT;
    readonly trackerContractIdHex: string;
    readonly trackerPropositionHex: string;
    readonly settlementProfileIdHex: string;
    readonly causalProfileIdHex: string;
    readonly applicationBindingDigestHex: string;
    readonly causalVault: ParsedContractRole;
    readonly duplicatePrevention: ParsedContractRole;
  };
  readonly settlementPlan: {
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly trackerInputDigestHex: string;
    readonly trackerAnchorHeaderIdHex: string;
    readonly trackerAnchorHeight: number;
    readonly duplicatePreventionKeyHex: string;
    readonly dupInputDigestHex: string;
    readonly dupOutputDigestHex: string;
    readonly burnLeafHex: string;
    readonly leafCount: number;
    readonly burnProof: readonly {
      readonly side: 'left' | 'right';
      readonly hashHex: string;
    }[];
    readonly recipientErgoTreeHex: string;
    readonly amountNanoErg: string;
    readonly applicationBindingDigestHex: string;
    readonly applicationPayloadDigestHex: string;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
    readonly currentErgoHeight: number;
  };
  readonly compatibility: {
    readonly v1TrackerContractIdHex:
      typeof EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX;
    readonly v1TrackerPropositionSha256Hex:
      typeof EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_SHA256_HEX;
    readonly v1TrackerPropositionHex: string;
  };
  readonly setup: {
    readonly unsignedTransactionIdHex: string;
    readonly sourceIntentHex: string;
    readonly sourceBoxIdHex: string;
  };
  readonly inputBoxes: readonly [
    Readonly<Record<string, unknown>>,
    Readonly<Record<string, unknown>>,
    Readonly<Record<string, unknown>>,
  ];
  readonly dataInputBoxes: readonly [Readonly<Record<string, unknown>>];
  readonly inputBoxSigmaHex: readonly [string, string, string];
  readonly dataInputBoxSigmaHex: readonly [string];
  readonly contextExtensions: readonly [
    SerializedExtension<readonly [0, 1, 2]>,
    SerializedExtension<readonly [0, 1, 2, 3]>,
    SerializedExtension<readonly []>,
  ];
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly wasmRoundTripEip12: Readonly<Record<string, unknown>>;
  readonly unsignedTransactionIdHex: string;
  readonly prooflessTransactionIdHex: string;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly boundaries: {
    readonly localSerializationFixtureOnly: true;
    readonly exactWp06adTrackerContextConsumed: true;
    readonly applicationPayloadCrossCheckedOffChain: true;
    readonly exactContractIdentityReceiptConsumed: true;
    readonly frontierRootAndCountMatchedTracker: true;
    readonly canonicalBurnPathValidatedByPlanner: true;
    readonly payloadOrReceiptTransportedToSettlement: false;
    readonly publicFrontierRootVectorProvenanceMatched: boolean;
    readonly fullInputConjunctionReducedByFixture: false;
    readonly singletonSetupLineageEstablished: false;
    readonly bridgeEventRootFinalizedStateMembershipEstablished: false;
    readonly feeFundingAuthorizationEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly proofValidityEstablishedInPayoutTransaction: false;
    readonly nodeCheckPerformed: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

interface SerializedExtension<TKeys extends readonly number[]> {
  readonly keys: TKeys;
  readonly serializedHex: string;
  readonly serializedBlake2b256Hex: string;
}

interface ParsedContractRole {
  readonly templateSha256Hex: string;
  readonly resolvedSourceSha256Hex: string;
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly propositionHex: string;
  readonly contractIdHex: string;
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildEip0045BridgeValidityApplicationSettlementContextV2(
  input: BuildEip0045BridgeValidityApplicationSettlementContextV2Input,
): Promise<Eip0045BridgeValidityApplicationSettlementContextV2> {
  const trackerSource = parseAsciiJsonSource(
    input.trackerContextBytes,
    'application validity tracker context',
  );
  const contractSource = parseAsciiJsonSource(
    input.contractIdentityBytes,
    'application settlement contract identity',
  );
  const frontierSource = parseAsciiJsonSource(
    input.frontierVectorBytes,
    'Frontier bridge-event-root vector',
  );
  const tracker = parseTrackerSource(trackerSource.value);
  const contracts = parseContractIdentity(contractSource.value);
  const frontier = parseFrontierVector(frontierSource.value);
  const publicFrontierRootVectorProvenanceMatched =
    frontierSource.normalizedLfSha256Hex
    === EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_FRONTIER_VECTOR_SHA256_HEX;

  const extraction = extractFrontierBridgeEventRoot(frontier.input);
  if (!extraction.commitment) {
    throw new Error('application settlement Frontier vector must contain burns');
  }
  assertFrontierExpected(extraction, frontier.expected);
  const payload =
    decodeBridgeValidityApplicationPayloadV3(tracker.applicationPayloadHex);
  const trackerValue =
    decodeApplicationValiditySpvTrackerValue(tracker.trackerValueHex);
  assertPayloadAndTrackerBindings(tracker, trackerValue, payload);
  if (
    extraction.commitment.bridgeEventRootHex
    !== trackerValue.bridgeEventRootHex
  ) {
    throw new Error(
      'application settlement Frontier root does not match the WP-06AD tracker value',
    );
  }
  if (extraction.commitment.leaves.length !== trackerValue.burnLeafCount) {
    throw new Error(
      'application settlement Frontier burn count does not match the WP-06AD tracker value',
    );
  }
  if (
    frontier.input.sidechainIdHex
      !== payload.finality.checkpoint.sidechainIdHex
    || frontier.input.executionBlockHashHex
      !== payload.finality.checkpoint.executionBlockHashHex
  ) {
    throw new Error(
      'application settlement Frontier block identity does not match the WP-06AD payload',
    );
  }

  const target = extraction.burns.find(
    burn => burn.eventIndex === TARGET_BURN_EVENT_INDEX,
  );
  if (!target) {
    throw new Error('application settlement target burn event index is absent');
  }
  const leaves = extraction.burns.map<TrustlessBurnLeafInput>(burn => ({
    sidechainIdHex: frontier.input.sidechainIdHex,
    sidechainBlockHashHex: frontier.input.executionBlockHashHex,
    burnIdHex: burn.burnIdHex,
    sidechainTxHashHex: burn.sidechainTxHashHex,
    eventIndex: burn.eventIndex,
    recipientErgoTreeHashHex: burn.recipientErgoTreeHashHex,
    amountNanoErg: burn.amountNanoErg,
    assetIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  }));
  const burnProof =
    buildTrustlessBurnInclusionProof(leaves, target.burnIdHex);
  if (
    burnProof.bridgeEventRootHex !== trackerValue.bridgeEventRootHex
    || burnProof.leafCount !== trackerValue.burnLeafCount
  ) {
    throw new Error(
      'application settlement burn proof does not match the tracker commitment',
    );
  }

  const application = payload.application;
  const profile: ValidityApplicationSettlementProfileV2 = Object.freeze({
    formatVersion: 2,
    minAnchorConfirmations: 10,
    sourceNetworkIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: frontier.input.sidechainIdHex,
    trackerNftIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
    trackerContractIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
    trackerPropositionBytesHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
    approvedTrustRootDigestHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
    applicationBindingHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
    applicationBindingDigestHex:
      deriveBridgeCausalApplicationBindingV2DigestHex(
        EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      ),
    settlementProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
    causalProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    verifierProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    duplicatePreventionNftIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX,
    zeroSourceAssetIdHex:
      VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX,
  });
  if (
    contracts.settlementProfileIdHex !== profile.settlementProfileIdHex
    || contracts.causalProfileIdHex !== profile.causalProfileIdHex
    || contracts.applicationBindingDigestHex
      !== profile.applicationBindingDigestHex
  ) {
    throw new Error(
      'application settlement contract receipt does not bind the exact V2 profile',
    );
  }
  const sidechainHeight = decodeCanonicalLongRegister(
    tracker.successorRegisters.R7,
    'application tracker successor R7',
  );
  if (sidechainHeight <= 0n) {
    throw new Error('application tracker sidechain height must be positive');
  }
  const expectedTrackerKeyHex = deriveApplicationValiditySpvTrackerKey({
    sidechainIdHex: profile.sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex: frontier.input.executionBlockHashHex,
  });
  if (expectedTrackerKeyHex !== tracker.trackerKeyHex) {
    throw new Error(
      'application settlement Frontier identity does not derive the WP-06AD tracker key',
    );
  }
  const currentErgoHeight =
    trackerValue.anchorHeaderHeight + profile.minAnchorConfirmations;
  const plan = buildValidityApplicationSettlementPlanV2({
    profile,
    trackerHistory: [{
      key: tracker.trackerKeyHex,
      value: tracker.trackerValueHex,
    }],
    trackerTree: {
      digestHex: tracker.trackerDigestHex,
      keyLength: 32,
      valueLength: 370,
      flags: 1,
    },
    applicationPayloadHex: tracker.applicationPayloadHex,
    duplicatePreventionHistoryKeys: [],
    claim: {
      trackerIdentity: {
        sidechainHeight,
        executionBlockHashHex: frontier.input.executionBlockHashHex,
      },
      burnLeaf: burnProof.leaf,
      leafIndex: burnProof.leafIndex,
      leafCount: burnProof.leafCount,
      burnProof: burnProof.proof,
      recipientErgoTreeHex: target.recipientErgoTreeHex,
    },
    currentErgoHeight,
  });

  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: profile.sourceNetworkIdHex,
    sidechainIdHex: profile.sidechainIdHex,
    bridgeAddressHex: application.bridgeAddressHex,
    tokenAddressHex: application.tokenAddressHex,
    settlementProfileIdHex: plan.settlementProfileIdHex,
    admissionProfileIdHex: profile.causalProfileIdHex,
    sourceAssetIdHex: profile.zeroSourceAssetIdHex,
    amountNanoErg: SOURCE_AMOUNT_NANO_ERG,
    recipientAddressHex: SOURCE_RECIPIENT_ADDRESS_HEX,
  }).slice(2);
  const wasm = await getWasm();
  const trackerBox = materializeTrackerOutputBox(
    wasm,
    tracker.eip12UnsignedTransaction,
    tracker.trackerProoflessTransactionIdHex,
  );
  const setup = materializeSetupBoxes(wasm, {
    currentErgoHeight,
    duplicatePreventionNftIdHex:
      profile.duplicatePreventionNftIdHex,
    duplicatePreventionPropositionHex:
      contracts.duplicatePrevention.propositionHex,
    causalVaultPropositionHex: contracts.vault.propositionHex,
    settlementProfileIdHex: plan.settlementProfileIdHex,
    dupInputDigestHex: plan.dupInputDigestHex,
    sourceIntentHex,
  });
  const unsignedShape = buildValidityApplicationSettlementTxV2({
    deployed: {
      tracker: {
        nftIdHex: profile.trackerNftIdHex,
        ergoTreeHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
      },
      duplicatePrevention: {
        nftIdHex: profile.duplicatePreventionNftIdHex,
        ergoTreeHex: contracts.duplicatePrevention.propositionHex,
      },
      causalVault: {
        ergoTreeHex: contracts.vault.propositionHex,
      },
    },
    plan,
    trackerBox,
    duplicatePreventionBox: setup.duplicatePreventionBox,
    causalVaultBox: setup.causalVaultBox,
    feeFundingBox: setup.feeFundingBox,
    creationHeight: currentErgoHeight,
    minerFee: MINER_FEE,
  });
  const eip12UnsignedTransaction = canonicalEip12(unsignedShape);
  assertContextExtensionSafe(
    exactArray(
      eip12UnsignedTransaction.inputs,
      'application settlement inputs',
    ),
    'EIP-0045 application settlement V2',
    4,
  );

  let unsigned: any;
  let unsignedId: any;
  let proofless: any;
  let prooflessId: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    const wasmRoundTripEip12 = deepFreeze(
      unsigned.to_js_eip12(),
    ) as Readonly<Record<string, unknown>>;
    if (
      canonicalJson(wasmRoundTripEip12)
      !== canonicalJson(eip12UnsignedTransaction)
    ) {
      throw new Error(
        'WASM changed the application settlement unsigned transaction',
      );
    }
    const contextExtensions = serializeInputExtensions(wasm, unsigned);
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = fixedHex(
      unsignedId.to_str(),
      32,
      'application settlement unsigned transaction ID',
    );
    unsignedId.free?.();
    unsignedId = undefined;
    const consumedUnsigned = unsigned;
    unsigned = undefined;
    proofless = wasm.Transaction.from_unsigned_tx(
      consumedUnsigned,
      [new Uint8Array(), new Uint8Array(), new Uint8Array()],
    );
    prooflessId = proofless.id();
    const prooflessTransactionIdHex = fixedHex(
      prooflessId.to_str(),
      32,
      'application settlement proofless transaction ID',
    );
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error(
        'application settlement proofless bytes and transaction IDs differ',
      );
    }
    const inputBoxes = [
      deepFreeze(setup.duplicatePreventionBox as unknown as Record<string, unknown>),
      deepFreeze(setup.causalVaultBox as unknown as Record<string, unknown>),
      deepFreeze(setup.feeFundingBox as unknown as Record<string, unknown>),
    ] as const;
    const dataInputBoxes = [
      deepFreeze(trackerBox as unknown as Record<string, unknown>),
    ] as const;
    return deepFreeze({
      schema:
        EIP0045_BRIDGE_VALIDITY_APPLICATION_SETTLEMENT_CONTEXT_V2_SCHEMA,
      version: 2 as const,
      sourceBindings: {
        trackerContextSha256Hex: trackerSource.sha256Hex,
        trackerProoflessTransactionIdHex:
          tracker.trackerProoflessTransactionIdHex,
        trackerOutputBoxIdHex: trackerBox.boxId,
        trackerKeyHex: tracker.trackerKeyHex,
        trackerValueHex: tracker.trackerValueHex,
        trackerDigestHex: plan.trackerInputDigestHex,
        applicationPayloadHex: tracker.applicationPayloadHex,
        applicationPayloadBytes: 973 as const,
        applicationPayloadBlake2b256Hex:
          deriveApplicationValidityPayloadDigestHex(
            tracker.applicationPayloadHex,
          ),
        contractIdentitySha256Hex: contractSource.sha256Hex,
        frontierVectorSha256Hex: frontierSource.sha256Hex,
        frontierVectorNormalizedLfSha256Hex:
          frontierSource.normalizedLfSha256Hex,
        publicFrontierRootVectorProvenanceMatched,
        frontierVectorSchema: FRONTIER_VECTOR_SCHEMA,
        bridgeEventRootHex: trackerValue.bridgeEventRootHex,
        burnLeafCount: trackerValue.burnLeafCount,
        targetBurnIdHex: plan.burnLeaf.burnIdHex,
        targetEventIndex: TARGET_BURN_EVENT_INDEX,
      },
      profile,
      settlementProfileIdHex: plan.settlementProfileIdHex,
      contractIdentity: {
        schema:
          VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA,
        sigmaStateCommit:
          VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT,
        trackerContractIdHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
        trackerPropositionHex:
          EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
        settlementProfileIdHex: contracts.settlementProfileIdHex,
        causalProfileIdHex: contracts.causalProfileIdHex,
        applicationBindingDigestHex:
          contracts.applicationBindingDigestHex,
        causalVault: contracts.vault,
        duplicatePrevention: contracts.duplicatePrevention,
      },
      settlementPlan: {
        trackerKeyHex: plan.trackerKeyHex,
        trackerValueHex: plan.trackerValueHex,
        trackerInputDigestHex: plan.trackerInputDigestHex,
        trackerAnchorHeaderIdHex: plan.trackerValue.anchorHeaderIdHex,
        trackerAnchorHeight: plan.trackerValue.anchorHeaderHeight,
        duplicatePreventionKeyHex: plan.duplicatePreventionKeyHex,
        dupInputDigestHex: plan.dupInputDigestHex,
        dupOutputDigestHex: plan.dupOutputDigestHex,
        burnLeafHex: plan.burnLeaf.encodedLeafHex,
        leafCount: plan.leafCount,
        burnProof: plan.burnProof,
        recipientErgoTreeHex: plan.recipientErgoTreeHex,
        amountNanoErg: plan.burnLeaf.amountNanoErg,
        applicationBindingDigestHex:
          plan.profile.applicationBindingDigestHex,
        applicationPayloadDigestHex:
          plan.applicationPayloadDigestHex,
        programIdHex: plan.profile.programIdHex,
        verifierProfileIdHex: plan.profile.verifierProfileIdHex,
        currentErgoHeight,
      },
      compatibility: {
        v1TrackerContractIdHex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
        v1TrackerPropositionSha256Hex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_SHA256_HEX,
        v1TrackerPropositionHex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
      },
      setup: {
        unsignedTransactionIdHex: setup.unsignedTransactionIdHex,
        sourceIntentHex,
        sourceBoxIdHex: SOURCE_BOX_ID_HEX,
      },
      inputBoxes,
      dataInputBoxes,
      inputBoxSigmaHex: [
        serializeBox(wasm, inputBoxes[0]),
        serializeBox(wasm, inputBoxes[1]),
        serializeBox(wasm, inputBoxes[2]),
      ],
      dataInputBoxSigmaHex: [
        serializeBox(wasm, dataInputBoxes[0]),
      ],
      contextExtensions,
      eip12UnsignedTransaction,
      wasmRoundTripEip12,
      unsignedTransactionIdHex,
      prooflessTransactionIdHex,
      prooflessTransactionHex: prooflessBytes.toString('hex'),
      prooflessTransactionBytes: prooflessBytes.length,
      boundaries: {
        localSerializationFixtureOnly: true as const,
        exactWp06adTrackerContextConsumed: true as const,
        applicationPayloadCrossCheckedOffChain: true as const,
        exactContractIdentityReceiptConsumed: true as const,
        frontierRootAndCountMatchedTracker: true as const,
        canonicalBurnPathValidatedByPlanner: true as const,
        payloadOrReceiptTransportedToSettlement: false as const,
        publicFrontierRootVectorProvenanceMatched,
        fullInputConjunctionReducedByFixture: false as const,
        singletonSetupLineageEstablished: false as const,
        bridgeEventRootFinalizedStateMembershipEstablished: false as const,
        feeFundingAuthorizationEstablished: false as const,
        profileActivated: false as const,
        targetNodeAcceptanceEstablished: false as const,
        proofValidityEstablishedInPayoutTransaction: false as const,
        nodeCheckPerformed: false as const,
        signingPerformed: false as const,
        submissionPerformed: false as const,
        broadcastPerformed: false as const,
        fundsAuthorityEstablished: false as const,
        gate5Closed: false as const,
      },
    });
  } finally {
    prooflessId?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

function assertPayloadAndTrackerBindings(
  tracker: ReturnType<typeof parseTrackerSource>,
  trackerValue: ReturnType<typeof decodeApplicationValiditySpvTrackerValue>,
  payload: ReturnType<typeof decodeBridgeValidityApplicationPayloadV3>,
): void {
  const exact = [
    [
      tracker.trackerNftIdHex,
      VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX,
      'tracker NFT',
    ],
    [
      tracker.approvedTrustRootDigestHex,
      VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX,
      'approved trust root',
    ],
    [
      tracker.applicationBindingHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
      'tracker application binding',
    ],
    [
      trackerValue.applicationBindingDigestHex,
      payload.applicationBindingDigestHex,
      'application-binding digest',
    ],
    [
      trackerValue.applicationPayloadDigestHex,
      deriveApplicationValidityPayloadDigestHex(
        tracker.applicationPayloadHex,
      ),
      'application payload digest',
    ],
    [
      trackerValue.bridgeEventRootHex,
      payload.finality.checkpoint.bridgeEventRootHex,
      'tracker/payload bridge-event root',
    ],
    [
      String(trackerValue.burnLeafCount),
      String(payload.finality.checkpoint.burnLeafCount),
      'tracker/payload burn count',
    ],
    [
      trackerValue.checkpointCommitmentHex,
      payload.finality.checkpointCommitmentHex,
      'tracker/payload checkpoint commitment',
    ],
    [
      payload.application.sourceNetworkIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
      'application source network',
    ],
    [
      payload.application.sidechainIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
      'application sidechain',
    ],
    [
      payload.application.settlementProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
      'application settlement profile',
    ],
    [
      payload.application.causalProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
      'application causal profile',
    ],
  ] as const;
  for (const [actual, expected, label] of exact) {
    if (actual !== expected) {
      throw new Error(`${label} does not match the exact WP-06AD context`);
    }
  }
}

function parseTrackerSource(value: unknown) {
  const root = requiredRecord(value, 'application validity tracker context');
  if (
    root.schema !== TRACKER_CONTEXT_SCHEMA
    || root.version !== 2
  ) {
    throw new Error(
      'application settlement requires the V2 application tracker context family',
    );
  }
  const source = requiredRecord(root.sourceAdmission, 'tracker source admission');
  const transition = requiredRecord(root.trackerTransition, 'tracker transition');
  const context = requiredRecord(root.contextExtension, 'tracker context extension');
  const boundaries = requiredRecord(root.boundaries, 'tracker boundaries');
  if (
    boundaries.serializationConformanceOnly !== true
    || boundaries.exactTrackerSuccessorIncluded !== true
    || boundaries.exactContractPinnedApplicationProfileIncluded !== true
    || boundaries.profileActivated !== false
    || boundaries.proofValidityEstablishedByFixture !== false
    || boundaries.signingPerformed !== false
    || boundaries.nodeCheckPerformed !== false
    || boundaries.submissionPerformed !== false
    || boundaries.broadcastPerformed !== false
    || boundaries.gate5Closed !== false
    || boundaries.fundsAuthorityEstablished !== false
  ) {
    throw new Error(
      'application tracker context boundaries are incompatible with settlement serialization',
    );
  }
  if (context.applicationPayloadBytes !== 973) {
    throw new Error(
      'application tracker context must declare the exact 973-byte payload',
    );
  }
  const eip12Values = exactRecord(
    context.eip12Values,
    ['0', '1', '2', '3'],
    'application tracker ContextExtension values',
  );
  const applicationPayloadHex = decodeCollByteRegister(
    variableHex(eip12Values['1'], 'application tracker payload constant'),
    'application tracker payload constant',
  );
  if (
    Buffer.from(applicationPayloadHex, 'hex').length !== 973
    || encodeCollByteRegister(Buffer.from(applicationPayloadHex, 'hex'))
      !== eip12Values['1']
  ) {
    throw new Error(
      'application tracker payload must be canonical exact 973-byte Coll[Byte]',
    );
  }
  const eip12 = requiredRecord(
    root.eip12UnsignedTransaction,
    'tracker unsigned transaction',
  );
  const trackerInputs = exactArray(eip12.inputs, 'tracker inputs');
  if (trackerInputs.length !== 1) {
    throw new Error('application tracker context must contain one input');
  }
  const trackerInput = requiredRecord(trackerInputs[0], 'tracker input');
  const trackerInputExtension = exactRecord(
    trackerInput.extension,
    ['0', '1', '2', '3'],
    'tracker input ContextExtension',
  );
  if (canonicalJson(trackerInputExtension) !== canonicalJson(eip12Values)) {
    throw new Error(
      'application tracker ContextExtension values differ from its unsigned transaction',
    );
  }
  const outputs = exactArray(eip12.outputs, 'tracker outputs');
  if (outputs.length !== 1) {
    throw new Error('application tracker context must contain one successor output');
  }
  const output = requiredRecord(outputs[0], 'tracker successor output');
  const successorRegisters = exactRegisters(
    transition.successorRegisters,
    ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
    'tracker successor registers',
  );
  const outputRegisters = exactRegisters(
    output.additionalRegisters,
    ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
    'tracker output registers',
  );
  if (canonicalJson(successorRegisters) !== canonicalJson(outputRegisters)) {
    throw new Error('application tracker registers differ from its output');
  }
  const trackerNftIdHex = fixedHex(
    transition.trackerNftIdHex,
    32,
    'tracker NFT ID',
  );
  const assets = exactArray(output.assets, 'tracker successor assets');
  const token = assets.length === 1
    ? requiredRecord(assets[0], 'tracker successor token')
    : undefined;
  if (
    !token
    || token.tokenId !== trackerNftIdHex
    || String(token.amount) !== '1'
  ) {
    throw new Error('application tracker successor must preserve one exact NFT');
  }
  if (
    output.ergoTree
    !== EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX
  ) {
    throw new Error(
      'application tracker successor proposition differs from WP-06AD',
    );
  }
  const trackerDigestHex = fixedHex(
    source.successorDigestHex,
    33,
    'tracker successor digest',
  );
  if (
    successorRegisters.R5
    !== encodeApplicationValiditySpvTrackerAvlRegister(trackerDigestHex)
  ) {
    throw new Error(
      'application tracker successor R5 differs from its authenticated digest',
    );
  }
  assertCanonicalCollByte(
    successorRegisters.R6,
    EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
    'application tracker successor R6',
  );
  const approvedTrustRootDigestHex = fixedHex(
    transition.approvedTrustAnchorDigestHex,
    32,
    'approved tracker trust root',
  );
  assertCanonicalCollByte(
    successorRegisters.R9,
    approvedTrustRootDigestHex,
    'application tracker successor R9',
  );
  return Object.freeze({
    trackerKeyHex: fixedHex(source.trackerKeyHex, 32, 'tracker key'),
    trackerValueHex: fixedHex(source.trackerValueHex, 370, 'tracker value'),
    trackerDigestHex,
    trackerNftIdHex,
    approvedTrustRootDigestHex,
    applicationBindingHex: fixedHex(
      transition.applicationBindingHex,
      240,
      'tracker application binding',
    ),
    applicationPayloadHex,
    successorRegisters,
    trackerProoflessTransactionIdHex: fixedHex(
      root.prooflessTransactionIdHex,
      32,
      'tracker proofless transaction ID',
    ),
    eip12UnsignedTransaction: deepFreeze(eip12),
  });
}

function parseContractIdentity(value: unknown) {
  const root = exactRecord(
    value,
    [
      'schema',
      'version',
      'sigmaStateCommit',
      'settlementProfileIdHex',
      'causalProfileIdHex',
      'applicationBindingDigestHex',
      'vault',
      'duplicatePrevention',
      'profileActivated',
      'nodeCheckPerformed',
      'fundsAuthorityEstablished',
      'gate5Closed',
    ],
    'application settlement contract identity',
  );
  if (
    root.schema !== VALIDITY_APPLICATION_SETTLEMENT_V2_CONTRACT_IDENTITY_SCHEMA
    || root.version !== 2
  ) {
    throw new Error(
      'application settlement contract identity schema is unsupported',
    );
  }
  if (
    root.sigmaStateCommit
    !== VALIDITY_APPLICATION_SETTLEMENT_V2_SIGMA_STATE_COMMIT
  ) {
    throw new Error(
      'application settlement contract identity SigmaState commit is unsupported',
    );
  }
  if (
    root.profileActivated !== false
    || root.nodeCheckPerformed !== false
    || root.fundsAuthorityEstablished !== false
    || root.gate5Closed !== false
  ) {
    throw new Error(
      'application settlement contract identity boundaries are incompatible',
    );
  }
  const vault = parseContractRole(root.vault, 'vault');
  const duplicatePrevention = parseContractRole(
    root.duplicatePrevention,
    'duplicatePrevention',
  );
  assertExactContractRole(
    vault,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_BYTES,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_PROPOSITION_SHA256_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_VAULT_CONTRACT_ID_HEX,
    'vault',
  );
  assertExactContractRole(
    duplicatePrevention,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_BYTES,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_PROPOSITION_SHA256_HEX,
    VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_CONTRACT_ID_HEX,
    'duplicate prevention',
  );
  return Object.freeze({
    settlementProfileIdHex: fixedHex(
      root.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    causalProfileIdHex: fixedHex(
      root.causalProfileIdHex,
      32,
      'causal profile ID',
    ),
    applicationBindingDigestHex: fixedHex(
      root.applicationBindingDigestHex,
      32,
      'application-binding digest',
    ),
    vault,
    duplicatePrevention,
  });
}

function parseContractRole(value: unknown, label: string): ParsedContractRole {
  const record = exactRecord(
    value,
    [
      'templateSha256Hex',
      'resolvedSourceSha256Hex',
      'propositionBytes',
      'propositionSha256Hex',
      'propositionHex',
      'contractIdHex',
    ],
    `${label} contract identity`,
  );
  const propositionHex = variableHex(
    record.propositionHex,
    `${label} proposition`,
  );
  const propositionBytes =
    exactSafeInt(record.propositionBytes, `${label} proposition bytes`);
  if (propositionBytes !== propositionHex.length / 2) {
    throw new Error(`${label} proposition byte count is inconsistent`);
  }
  const propositionSha256Hex = fixedHex(
    record.propositionSha256Hex,
    32,
    `${label} proposition SHA-256`,
  );
  const contractIdHex = fixedHex(
    record.contractIdHex,
    32,
    `${label} contract ID`,
  );
  if (
    sha256Hex(Buffer.from(propositionHex, 'hex')) !== propositionSha256Hex
    || deriveEip0045ContractIdHex(Buffer.from(propositionHex, 'hex'))
      !== contractIdHex
  ) {
    throw new Error(`${label} proposition identity is inconsistent`);
  }
  return Object.freeze({
    templateSha256Hex: fixedHex(
      record.templateSha256Hex,
      32,
      `${label} template SHA-256`,
    ),
    resolvedSourceSha256Hex: fixedHex(
      record.resolvedSourceSha256Hex,
      32,
      `${label} resolved source SHA-256`,
    ),
    propositionBytes,
    propositionSha256Hex,
    propositionHex,
    contractIdHex,
  });
}

function assertExactContractRole(
  role: ParsedContractRole,
  propositionHex: string,
  propositionBytes: number,
  propositionSha256Hex: string,
  contractIdHex: string,
  label: string,
): void {
  if (
    role.propositionHex !== propositionHex
    || role.propositionBytes !== propositionBytes
    || role.propositionSha256Hex !== propositionSha256Hex
    || role.contractIdHex !== contractIdHex
  ) {
    throw new Error(
      `${label} contract identity is not the exact regenerated WP-06AE V2 identity`,
    );
  }
}

function parseFrontierVector(value: unknown): {
  readonly input: FrontierBridgeEventRootInput;
  readonly expected: {
    readonly burnCount: number;
    readonly eventIndexes: readonly number[];
    readonly burnIdHexes: readonly string[];
    readonly recipientErgoTreeHashHexes: readonly string[];
    readonly leafHashHexes: readonly string[];
    readonly bridgeEventRootHex: string;
  };
} {
  const root = exactRecord(
    value,
    ['schema', 'format', 'claimBoundary', 'input', 'expected'],
    'Frontier bridge-event-root vector',
  );
  if (root.schema !== FRONTIER_VECTOR_SCHEMA) {
    throw new Error(
      'application settlement requires the application-bound V2 Frontier root vector',
    );
  }
  const format = exactRecord(
    root.format,
    ['pegOutEvent', 'pegOutTopic'],
    'Frontier vector format',
  );
  if (
    format.pegOutEvent !== FRONTIER_PEG_OUT_EVENT
    || format.pegOutTopic !== FRONTIER_PEG_OUT_TOPIC
  ) {
    throw new Error('application settlement Frontier event format is unsupported');
  }
  const claimBoundary = exactRecord(
    root.claimBoundary,
    [
      'deterministicExtractionOnly',
      'finalityProven',
      'onChainAcceptanceProven',
      'gate5Closed',
    ],
    'Frontier vector claim boundary',
  );
  if (
    claimBoundary.deterministicExtractionOnly !== true
    || claimBoundary.finalityProven !== false
    || claimBoundary.onChainAcceptanceProven !== false
    || claimBoundary.gate5Closed !== false
  ) {
    throw new Error(
      'application settlement Frontier claim boundary is incompatible',
    );
  }
  const rawInput = exactRecord(
    root.input,
    [
      'sidechainIdHex',
      'executionBlockHashHex',
      'bridgeAddress',
      'maxBurns',
      'receipts',
    ],
    'Frontier vector input',
  );
  const rawExpected = exactRecord(
    root.expected,
    [
      'burnCount',
      'eventIndexes',
      'burnIdHexes',
      'recipientErgoTreeHashHexes',
      'leafHashHexes',
      'bridgeEventRootHex',
    ],
    'Frontier vector expected result',
  );
  const eventIndexes = exactArray(
    rawExpected.eventIndexes,
    'Frontier expected event indexes',
  ).map((item, index) =>
    exactSafeInt(item, `Frontier expected event index ${index}`));
  const burnIdHexes = exactArray(
    rawExpected.burnIdHexes,
    'Frontier expected burn IDs',
  ).map((item, index) =>
    fixedHex(item, 32, `Frontier expected burn ID ${index}`));
  const recipientErgoTreeHashHexes = exactArray(
    rawExpected.recipientErgoTreeHashHexes,
    'Frontier expected recipient hashes',
  ).map((item, index) =>
    fixedHex(item, 32, `Frontier expected recipient hash ${index}`));
  const leafHashHexes = exactArray(
    rawExpected.leafHashHexes,
    'Frontier expected leaf hashes',
  ).map((item, index) =>
    fixedHex(item, 32, `Frontier expected leaf hash ${index}`));
  return Object.freeze({
    input: {
      sidechainIdHex: fixedHex(
        rawInput.sidechainIdHex,
        32,
        'Frontier sidechain ID',
      ),
      executionBlockHashHex: fixedHex(
        rawInput.executionBlockHashHex,
        32,
        'Frontier execution block hash',
      ),
      bridgeAddress:
        exactString(rawInput.bridgeAddress, 'Frontier bridge address'),
      maxBurns: exactSafeInt(rawInput.maxBurns, 'Frontier max burns'),
      receipts: exactArray(
        rawInput.receipts,
        'Frontier receipts',
      ) as FrontierBridgeEventRootInput['receipts'],
    },
    expected: Object.freeze({
      burnCount: exactSafeInt(
        rawExpected.burnCount,
        'Frontier expected burn count',
      ),
      eventIndexes: Object.freeze(eventIndexes),
      burnIdHexes: Object.freeze(burnIdHexes),
      recipientErgoTreeHashHexes:
        Object.freeze(recipientErgoTreeHashHexes),
      leafHashHexes: Object.freeze(leafHashHexes),
      bridgeEventRootHex: fixedHex(
        rawExpected.bridgeEventRootHex,
        32,
        'Frontier expected bridge-event root',
      ),
    }),
  });
}

function assertFrontierExpected(
  extraction: ReturnType<typeof extractFrontierBridgeEventRoot>,
  expected: ReturnType<typeof parseFrontierVector>['expected'],
): void {
  if (!extraction.commitment) {
    throw new Error('Frontier vector expected comparison requires burns');
  }
  const actual = {
    burnCount: extraction.burns.length,
    eventIndexes: extraction.burns.map(burn => burn.eventIndex),
    burnIdHexes: extraction.burns.map(burn => burn.burnIdHex),
    recipientErgoTreeHashHexes:
      extraction.burns.map(burn => burn.recipientErgoTreeHashHex),
    leafHashHexes:
      extraction.commitment.leaves.map(leaf => leaf.leafHashHex),
    bridgeEventRootHex: extraction.commitment.bridgeEventRootHex,
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      'Frontier vector expected result does not match extracted receipt semantics',
    );
  }
}

function materializeTrackerOutputBox(
  wasm: any,
  eip12UnsignedTransaction: Readonly<Record<string, unknown>>,
  expectedTransactionIdHex: string,
): ValidityApplicationSettlementBoxV2 {
  let unsigned: any;
  let transactionId: any;
  let candidates: any;
  let candidate: any;
  let box: any;
  try {
    unsigned = wasm.UnsignedTransaction.from_json(
      JSON.stringify(eip12UnsignedTransaction),
    );
    transactionId = unsigned.id();
    if (transactionId.to_str() !== expectedTransactionIdHex) {
      throw new Error(
        'tracker successor transaction ID differs from WP-06AD',
      );
    }
    candidates = unsigned.output_candidates();
    if (candidates.len() !== 1) {
      throw new Error('tracker source transaction must contain one output');
    }
    candidate = candidates.get(0);
    box = wasm.ErgoBox.from_box_candidate(candidate, transactionId, 0);
    candidate = undefined;
    transactionId = undefined;
    return deepFreeze(
      JSON.parse(box.to_json()) as ValidityApplicationSettlementBoxV2,
    );
  } finally {
    box?.free?.();
    candidate?.free?.();
    candidates?.free?.();
    transactionId?.free?.();
    unsigned?.free?.();
  }
}

function materializeSetupBoxes(wasm: any, input: {
  readonly currentErgoHeight: number;
  readonly duplicatePreventionNftIdHex: string;
  readonly duplicatePreventionPropositionHex: string;
  readonly causalVaultPropositionHex: string;
  readonly settlementProfileIdHex: string;
  readonly dupInputDigestHex: string;
  readonly sourceIntentHex: string;
}) {
  const setupShape = {
    inputs: [{ boxId: SETUP_INPUT_BOX_ID_HEX, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: '1000000',
      ergoTree: input.duplicatePreventionPropositionHex,
      assets: [{
        tokenId: input.duplicatePreventionNftIdHex,
        amount: '1',
      }],
      additionalRegisters: {
        R4: encodeLongRegister(0),
        R5: encodeAvlTreeRegister(
          Buffer.from(input.dupInputDigestHex, 'hex'),
          DUP_AVL_FLAGS,
          1,
        ),
        R6: encodeCollByteRegister(
          Buffer.from(input.settlementProfileIdHex, 'hex'),
        ),
      },
      creationHeight: input.currentErgoHeight - 1,
    }, {
      value: SOURCE_AMOUNT_NANO_ERG.toString(),
      ergoTree: input.causalVaultPropositionHex,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(
          Buffer.from(input.sourceIntentHex, 'hex'),
        ),
        R5: encodeCollByteRegister(Buffer.from(SOURCE_BOX_ID_HEX, 'hex')),
      },
      creationHeight: input.currentErgoHeight - 1,
    }, {
      value: String(MINER_FEE),
      ergoTree: SYNTHETIC_FEE_FUNDING_ERGO_TREE_HEX,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.currentErgoHeight - 1,
    }],
  };
  let unsigned: any;
  let unsignedId: any;
  let candidates: any;
  const boxes: any[] = [];
  try {
    unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(setupShape));
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = fixedHex(
      unsignedId.to_str(),
      32,
      'application settlement setup transaction ID',
    );
    candidates = unsigned.output_candidates();
    if (candidates.len() !== 3) {
      throw new Error(
        'application settlement setup must contain three outputs',
      );
    }
    for (let index = 0; index < 3; index += 1) {
      const candidate = candidates.get(index);
      const txId = wasm.TxId.from_str(unsignedTransactionIdHex);
      const box = wasm.ErgoBox.from_box_candidate(candidate, txId, index);
      boxes.push(box);
    }
    return Object.freeze({
      unsignedTransactionIdHex,
      duplicatePreventionBox: deepFreeze(
        JSON.parse(boxes[0].to_json()) as ValidityApplicationSettlementBoxV2,
      ),
      causalVaultBox: deepFreeze(
        JSON.parse(boxes[1].to_json()) as ValidityApplicationSettlementBoxV2,
      ),
      feeFundingBox: deepFreeze(
        JSON.parse(boxes[2].to_json()) as ValidityApplicationSettlementBoxV2,
      ),
    });
  } finally {
    for (const box of boxes) box?.free?.();
    candidates?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

function canonicalEip12(
  input: ReturnType<typeof buildValidityApplicationSettlementTxV2>,
) {
  return deepFreeze({
    inputs: input.inputs.map(entry => ({
      boxId: entry.boxId,
      extension: entry.extension,
    })),
    dataInputs: input.dataInputs.map(entry => ({ boxId: entry.boxId })),
    outputs: input.outputs.map(output => ({
      ...output,
      assets: output.assets.map(asset => ({
        tokenId: asset.tokenId,
        amount: String(asset.amount),
      })),
    })),
  }) as Readonly<Record<string, unknown>>;
}

function serializeInputExtensions(
  wasm: any,
  unsigned: any,
): Eip0045BridgeValidityApplicationSettlementContextV2['contextExtensions'] {
  const inputs = unsigned.inputs();
  const results: Array<SerializedExtension<readonly number[]>> = [];
  try {
    for (let index = 0; index < inputs.len(); index += 1) {
      const item = inputs.get(index);
      const extension = item.extension();
      try {
        const keys = [...extension.keys()];
        const expected =
          index === 0 ? [0, 1, 2]
          : index === 1 ? [0, 1, 2, 3]
          : [];
        if (
          keys.length !== expected.length
          || keys.some((key, keyIndex) => key !== expected[keyIndex])
        ) {
          throw new Error(
            `application settlement input ${index} ContextExtension keys differ`,
          );
        }
        const serialized = Buffer.from(extension.sigma_serialize_bytes());
        results.push(Object.freeze({
          keys: Object.freeze(keys),
          serializedHex: serialized.toString('hex'),
          serializedBlake2b256Hex: blake2b256Hex(serialized),
        }));
      } finally {
        extension.free?.();
        item.free?.();
      }
    }
  } finally {
    inputs.free?.();
  }
  return Object.freeze(results) as
    Eip0045BridgeValidityApplicationSettlementContextV2['contextExtensions'];
}

function serializeBox(
  wasm: any,
  boxJson: Readonly<Record<string, unknown>>,
): string {
  const box = wasm.ErgoBox.from_json(JSON.stringify(boxJson));
  try {
    return Buffer.from(box.sigma_serialize_bytes()).toString('hex');
  } finally {
    box.free?.();
  }
}

function assertCanonicalCollByte(
  registerHex: string,
  expectedPayloadHex: string,
  label: string,
): void {
  const decoded = decodeCollByteRegister(registerHex, label);
  if (
    decoded !== expectedPayloadHex
    || encodeCollByteRegister(Buffer.from(decoded, 'hex')) !== registerHex
  ) {
    throw new Error(`${label} is not the expected canonical Coll[Byte]`);
  }
}

function exactRegisters(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, string>> {
  const record = requiredRecord(value, label);
  const actualKeys = Object.keys(record).sort();
  if (canonicalJson(actualKeys) !== canonicalJson([...keys].sort())) {
    throw new Error(`${label} must contain exactly ${keys.join(', ')}`);
  }
  return Object.freeze(Object.fromEntries(
    keys.map(key => [key, variableHex(record[key], `${label} ${key}`)]),
  ));
}

function parseAsciiJsonSource(
  bytes: Uint8Array,
  label: string,
): {
  readonly value: unknown;
  readonly sha256Hex: string;
  readonly normalizedLfSha256Hex: string;
} {
  const buffer = Buffer.from(bytes);
  if (buffer.length === 0 || buffer.some(byte => byte > 0x7f)) {
    throw new Error(`${label} must be non-empty ASCII JSON`);
  }
  const text = buffer.toString('ascii');
  const normalizedLf = Buffer.from(text.replace(/\r\n/g, '\n'), 'ascii');
  return Object.freeze({
    value: parseStrictJson(text, label),
    sha256Hex: sha256Hex(buffer),
    normalizedLfSha256Hex: sha256Hex(normalizedLf),
  });
}

function requiredRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, any> {
  const record = requiredRecord(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} must contain exactly ${keys.join(', ')}`);
  }
  return record;
}

function exactArray(value: unknown, label: string): any[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function exactSafeInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
