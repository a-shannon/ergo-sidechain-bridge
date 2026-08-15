import { createHash } from 'crypto';

import blakejs from 'blakejs';

import {
  assertContextExtensionSafe,
} from './context-extension-guard.js';
import {
  EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
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
import {
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  decodeValiditySpvTrackerValue,
  deriveValiditySpvTrackerKey,
  encodeValiditySpvTrackerAvlRegister,
} from './spv-tracker-validity-v1.js';
import {
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  buildValiditySettlementTxV1,
  type ValiditySettlementBoxV1,
} from './validity-settlement-tx-v1.js';
import {
  VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  buildValiditySettlementPlanV1,
  deriveValiditySettlementProfileIdV1,
  type ValiditySettlementProfileV1,
} from './validity-settlement-v1.js';
import { parseStrictJson } from './strict-json.js';

export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTEXT_V1_SCHEMA =
  'e2s.bridge-validity-settlement-context.v1';
export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTRACTS_V1_SCHEMA =
  'e2s.bridge-validity-settlement-contracts.v1';
export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT =
  'f78deadd668f801e7fae3bc884283f79c6f484fa';
export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SOURCE_NETWORK_ID_HEX =
  '31'.repeat(32);
export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_DUP_NFT_ID_HEX =
  'a1'.repeat(32);
export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_ADMISSION_PROFILE_ID_HEX =
  '41'.repeat(32);
export const EIP0045_BRIDGE_VALIDITY_SETTLEMENT_PROFILE_ID_HEX =
  '72ae135aea3c9a29b1dc170c5b425fbd8b2d54c4338ca2f831be17438e0972ee';

const TRACKER_CONTEXT_SCHEMA = 'e2s.bridge-validity-tracker-context.v1';
const TARGET_BURN_EVENT_INDEX = 5;
const SOURCE_AMOUNT_NANO_ERG = 10_000_000n;
const SETUP_INPUT_BOX_ID_HEX = 'b1'.repeat(32);
const SOURCE_BOX_ID_HEX = 'b2'.repeat(32);
const BRIDGE_ADDRESS_HEX = 'b3'.repeat(20);
const TOKEN_ADDRESS_HEX = 'b4'.repeat(20);
const SOURCE_RECIPIENT_ADDRESS_HEX = 'b5'.repeat(20);
const DUP_AVL_FLAGS = 0x0b;
const SYNTHETIC_FEE_FUNDING_ERGO_TREE_HEX = '10010100d17300';

export interface BuildEip0045BridgeValiditySettlementContextV1Input {
  readonly trackerContextBytes: Uint8Array;
  readonly contractIdentityBytes: Uint8Array;
  readonly frontierVectorBytes: Uint8Array;
}

export interface Eip0045BridgeValiditySettlementContextV1 {
  readonly schema:
    typeof EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTEXT_V1_SCHEMA;
  readonly version: 1;
  readonly sourceBindings: {
    readonly trackerContextSha256Hex: string;
    readonly trackerProoflessTransactionIdHex: string;
    readonly trackerOutputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly trackerDigestHex: string;
    readonly contractIdentitySha256Hex: string;
    readonly frontierVectorSha256Hex: string;
    readonly frontierVectorSchema: string;
    readonly bridgeEventRootHex: string;
    readonly targetBurnIdHex: string;
    readonly targetEventIndex: typeof TARGET_BURN_EVENT_INDEX;
  };
  readonly profile: ValiditySettlementProfileV1;
  readonly profileIdHex: string;
  readonly contractIdentity: {
    readonly sigmaStateCommit:
      typeof EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT;
    readonly trackerContractIdHex: string;
    readonly trackerPropositionHex: string;
    readonly causalVaultContractIdHex: string;
    readonly causalVaultPropositionHex: string;
    readonly causalVaultTemplateSha256Hex: string;
    readonly causalVaultResolvedSourceSha256Hex: string;
    readonly causalVaultPropositionSha256Hex: string;
    readonly causalVaultPropositionBytes: number;
    readonly duplicatePreventionContractIdHex: string;
    readonly duplicatePreventionPropositionHex: string;
    readonly duplicatePreventionTemplateSha256Hex: string;
    readonly duplicatePreventionResolvedSourceSha256Hex: string;
    readonly duplicatePreventionPropositionSha256Hex: string;
    readonly duplicatePreventionPropositionBytes: number;
  };
  readonly settlementPlan: {
    readonly trackerKeyHex: string;
    readonly trackerInputDigestHex: string;
    readonly trackerAnchorHeaderIdHex: string;
    readonly trackerAnchorHeight: number;
    readonly duplicatePreventionKeyHex: string;
    readonly dupInputDigestHex: string;
    readonly dupOutputDigestHex: string;
    readonly burnLeafHex: string;
    readonly burnProof: readonly {
      readonly side: 'left' | 'right';
      readonly hashHex: string;
    }[];
    readonly recipientErgoTreeHex: string;
    readonly amountNanoErg: string;
    readonly currentErgoHeight: number;
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
  readonly dataInputBoxes: readonly [
    Readonly<Record<string, unknown>>,
  ];
  readonly inputBoxSigmaHex: readonly [string, string, string];
  readonly dataInputBoxSigmaHex: readonly [string];
  readonly contextExtensions: readonly [{
    readonly keys: readonly [0, 1, 2];
    readonly serializedHex: string;
    readonly serializedBlake2b256Hex: string;
  }, {
    readonly keys: readonly [0, 1, 2, 3];
    readonly serializedHex: string;
    readonly serializedBlake2b256Hex: string;
  }, {
    readonly keys: readonly [];
    readonly serializedHex: string;
    readonly serializedBlake2b256Hex: string;
  }];
  readonly eip12UnsignedTransaction: Readonly<Record<string, unknown>>;
  readonly wasmRoundTripEip12: Readonly<Record<string, unknown>>;
  readonly unsignedTransactionIdHex: string;
  readonly prooflessTransactionIdHex: string;
  readonly prooflessTransactionHex: string;
  readonly prooflessTransactionBytes: number;
  readonly boundaries: {
    readonly exactWp06aaTrackerSuccessorConsumed: true;
    readonly fullInputConjunctionReducedByFixture: false;
    readonly singletonSetupLineageEstablished: false;
    readonly bridgeEventRootFinalizedStateMembershipEstablished: false;
    readonly feeFundingAuthorizationEstablished: false;
    readonly signingPerformed: false;
    readonly nodeCheckPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly fundsAuthorityEstablished: false;
  };
}

let wasmPromise: Promise<any> | undefined;

async function getWasm(): Promise<any> {
  if (!wasmPromise) {
    wasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return wasmPromise;
}

export async function buildEip0045BridgeValiditySettlementContextV1(
  input: BuildEip0045BridgeValiditySettlementContextV1Input,
): Promise<Eip0045BridgeValiditySettlementContextV1> {
  const trackerSource = parseAsciiJsonSource(
    input.trackerContextBytes,
    'validity tracker context',
  );
  const contractSource = parseAsciiJsonSource(
    input.contractIdentityBytes,
    'validity settlement contract identity',
  );
  const frontierSource = parseAsciiJsonSource(
    input.frontierVectorBytes,
    'Frontier bridge-event-root vector',
  );
  const tracker = parseTrackerSource(trackerSource.value);
  const contracts = parseContractIdentity(contractSource.value);
  const trackerContextSha256Hex = trackerSource.sha256Hex;
  const contractIdentitySha256Hex = contractSource.sha256Hex;
  const frontierVectorSha256Hex = frontierSource.sha256Hex;
  const frontier = parseFrontierVector(frontierSource.value);
  const extraction = extractFrontierBridgeEventRoot(frontier.input);
  if (!extraction.commitment) {
    throw new Error('validity settlement Frontier vector must contain burns');
  }
  const trackerValue = decodeValiditySpvTrackerValue(tracker.trackerValueHex);
  if (
    extraction.commitment.bridgeEventRootHex
    !== trackerValue.bridgeEventRootHex
  ) {
    throw new Error('validity settlement Frontier root does not match the WP-06AA tracker value');
  }
  const target = extraction.burns.find(
    burn => burn.eventIndex === TARGET_BURN_EVENT_INDEX,
  );
  if (!target) {
    throw new Error('validity settlement target burn event index is absent');
  }
  const leaves = extraction.burns.map<TrustlessBurnLeafInput>(burn => ({
    sidechainIdHex: frontier.input.sidechainIdHex,
    sidechainBlockHashHex: frontier.input.executionBlockHashHex,
    burnIdHex: burn.burnIdHex,
    sidechainTxHashHex: burn.sidechainTxHashHex,
    eventIndex: burn.eventIndex,
    recipientErgoTreeHashHex: burn.recipientErgoTreeHashHex,
    amountNanoErg: burn.amountNanoErg,
    assetIdHex: VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  }));
  const burnProof = buildTrustlessBurnInclusionProof(leaves, target.burnIdHex);
  if (burnProof.bridgeEventRootHex !== trackerValue.bridgeEventRootHex) {
    throw new Error('validity settlement burn proof does not match the tracker event root');
  }

  const profile: ValiditySettlementProfileV1 = Object.freeze({
    formatVersion: 1,
    compatibilityProofSystemId: 1,
    minAnchorConfirmations: 10,
    sourceNetworkIdHex:
      EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SOURCE_NETWORK_ID_HEX,
    sidechainIdHex: frontier.input.sidechainIdHex,
    trackerNftIdHex: tracker.trackerNftIdHex,
    trackerContractIdHex:
      EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
    approvedTrustRootDigestHex: tracker.approvedTrustRootDigestHex,
    compatibilitySemanticProgramIdHex:
      trackerValue.compatibilitySemanticProgramIdHex,
    compatibilityVerifierProfileIdHex:
      trackerValue.compatibilityVerifierProfileIdHex,
    duplicatePreventionNftIdHex:
      EIP0045_BRIDGE_VALIDITY_SETTLEMENT_DUP_NFT_ID_HEX,
    admissionProfileIdHex:
      EIP0045_BRIDGE_VALIDITY_SETTLEMENT_ADMISSION_PROFILE_ID_HEX,
    zeroSourceAssetIdHex:
      VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  });
  const profileIdHex = deriveValiditySettlementProfileIdV1(profile);
  if (
    profileIdHex !== EIP0045_BRIDGE_VALIDITY_SETTLEMENT_PROFILE_ID_HEX
    || contracts.settlementProfileIdHex !== profileIdHex
  ) {
    throw new Error('validity settlement profile ID differs from the pinned contract identity');
  }
  const sidechainHeight = decodeCanonicalLongRegister(
    tracker.successorRegisters.R7,
    'validity tracker successor R7',
  );
  if (sidechainHeight < 0n) {
    throw new Error('validity tracker sidechain height must be nonnegative');
  }
  const expectedTrackerKeyHex = deriveValiditySpvTrackerKey({
    sidechainIdHex: profile.sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex: frontier.input.executionBlockHashHex,
  });
  if (expectedTrackerKeyHex !== tracker.trackerKeyHex) {
    throw new Error('validity settlement Frontier identity does not derive the WP-06AA tracker key');
  }
  const currentErgoHeight =
    trackerValue.anchorHeaderHeight + profile.minAnchorConfirmations;
  const plan = buildValiditySettlementPlanV1({
    profile,
    trackerHistory: [{
      key: tracker.trackerKeyHex,
      value: tracker.trackerValueHex,
    }],
    duplicatePreventionHistoryKeys: [],
    claim: {
      trackerIdentity: {
        sidechainHeight,
        executionBlockHashHex: frontier.input.executionBlockHashHex,
      },
      burnLeaf: burnProof.leaf,
      burnProof: burnProof.proof,
      recipientErgoTreeHex: target.recipientErgoTreeHex,
    },
    currentErgoHeight,
  });

  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: profile.sourceNetworkIdHex,
    sidechainIdHex: profile.sidechainIdHex,
    bridgeAddressHex: BRIDGE_ADDRESS_HEX,
    tokenAddressHex: TOKEN_ADDRESS_HEX,
    settlementProfileIdHex: profileIdHex,
    admissionProfileIdHex: profile.admissionProfileIdHex,
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
    profileIdHex,
    dupInputDigestHex: plan.dupInputDigestHex,
    sourceIntentHex,
  });
  const unsignedShape = buildValiditySettlementTxV1({
    deployed: {
      tracker: {
        nftIdHex: profile.trackerNftIdHex,
        ergoTreeHex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
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
      'validity settlement inputs',
    ),
    'EIP-0045 validity settlement V1',
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
      throw new Error('WASM changed the validity settlement unsigned transaction');
    }
    const contextExtensions = serializeInputExtensions(wasm, unsigned);
    unsignedId = unsigned.id();
    const unsignedTransactionIdHex = fixedHex(
      unsignedId.to_str(),
      32,
      'validity settlement unsigned transaction ID',
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
      'validity settlement proofless transaction ID',
    );
    const prooflessBytes = Buffer.from(proofless.sigma_serialize_bytes());
    if (
      prooflessTransactionIdHex !== unsignedTransactionIdHex
      || blake2b256Hex(prooflessBytes) !== unsignedTransactionIdHex
    ) {
      throw new Error('validity settlement proofless bytes and transaction IDs differ');
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
      schema: EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTEXT_V1_SCHEMA,
      version: 1 as const,
      sourceBindings: {
        trackerContextSha256Hex,
        trackerProoflessTransactionIdHex:
          tracker.trackerProoflessTransactionIdHex,
        trackerOutputBoxIdHex: trackerBox.boxId,
        trackerKeyHex: tracker.trackerKeyHex,
        trackerValueHex: tracker.trackerValueHex,
        trackerDigestHex: plan.trackerInputDigestHex,
        contractIdentitySha256Hex,
        frontierVectorSha256Hex,
        frontierVectorSchema: frontier.schema,
        bridgeEventRootHex: plan.bridgeEventRootHex,
        targetBurnIdHex: plan.burnLeaf.burnIdHex,
        targetEventIndex: TARGET_BURN_EVENT_INDEX,
      },
      profile,
      profileIdHex,
      contractIdentity: {
        sigmaStateCommit: contracts.sigmaStateCommit,
        trackerContractIdHex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_CONTRACT_ID_HEX,
        trackerPropositionHex:
          EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX,
        causalVaultContractIdHex: contracts.vault.contractIdHex,
        causalVaultPropositionHex: contracts.vault.propositionHex,
        causalVaultTemplateSha256Hex:
          contracts.vault.templateSha256Hex,
        causalVaultResolvedSourceSha256Hex:
          contracts.vault.resolvedSourceSha256Hex,
        causalVaultPropositionSha256Hex:
          contracts.vault.propositionSha256Hex,
        causalVaultPropositionBytes:
          contracts.vault.propositionBytes,
        duplicatePreventionContractIdHex:
          contracts.duplicatePrevention.contractIdHex,
        duplicatePreventionPropositionHex:
          contracts.duplicatePrevention.propositionHex,
        duplicatePreventionTemplateSha256Hex:
          contracts.duplicatePrevention.templateSha256Hex,
        duplicatePreventionResolvedSourceSha256Hex:
          contracts.duplicatePrevention.resolvedSourceSha256Hex,
        duplicatePreventionPropositionSha256Hex:
          contracts.duplicatePrevention.propositionSha256Hex,
        duplicatePreventionPropositionBytes:
          contracts.duplicatePrevention.propositionBytes,
      },
      settlementPlan: {
        trackerKeyHex: plan.trackerKeyHex,
        trackerInputDigestHex: plan.trackerInputDigestHex,
        trackerAnchorHeaderIdHex: plan.trackerAnchorHeaderIdHex,
        trackerAnchorHeight: plan.trackerAnchorHeight,
        duplicatePreventionKeyHex: plan.duplicatePreventionKeyHex,
        dupInputDigestHex: plan.dupInputDigestHex,
        dupOutputDigestHex: plan.dupOutputDigestHex,
        burnLeafHex: plan.burnLeaf.encodedLeafHex,
        burnProof: plan.burnProof,
        recipientErgoTreeHex: plan.recipientErgoTreeHex,
        amountNanoErg: plan.burnLeaf.amountNanoErg,
        currentErgoHeight,
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
        exactWp06aaTrackerSuccessorConsumed: true as const,
        fullInputConjunctionReducedByFixture: false as const,
        singletonSetupLineageEstablished: false as const,
        bridgeEventRootFinalizedStateMembershipEstablished: false as const,
        feeFundingAuthorizationEstablished: false as const,
        signingPerformed: false as const,
        nodeCheckPerformed: false as const,
        submissionPerformed: false as const,
        broadcastPerformed: false as const,
        profileActivated: false as const,
        gate5Closed: false as const,
        fundsAuthorityEstablished: false as const,
      },
    });
  } finally {
    prooflessId?.free?.();
    proofless?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

function parseTrackerSource(value: unknown) {
  const root = requiredRecord(value, 'validity tracker context');
  if (
    root.schema !== TRACKER_CONTEXT_SCHEMA
    || root.version !== 1
  ) {
    throw new Error('validity settlement requires a V1 validity tracker context');
  }
  const source = requiredRecord(root.sourceAdmission, 'tracker source admission');
  const transition = requiredRecord(root.trackerTransition, 'tracker transition');
  const boundaries = requiredRecord(root.boundaries, 'tracker boundaries');
  if (
    boundaries.exactTrackerSuccessorIncluded !== true
    || boundaries.profileActivated !== false
    || boundaries.gate5Closed !== false
    || boundaries.fundsAuthorityEstablished !== false
  ) {
    throw new Error('validity tracker context boundaries are incompatible with settlement conformance');
  }
  const eip12 = requiredRecord(
    root.eip12UnsignedTransaction,
    'tracker unsigned transaction',
  );
  const outputs = exactArray(eip12.outputs, 'tracker outputs');
  if (outputs.length !== 1) {
    throw new Error('validity tracker context must contain one successor output');
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
    throw new Error('validity tracker successor registers differ from its output');
  }
  const trackerNftIdHex = nonzeroFixedHex(
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
    throw new Error('validity tracker successor must preserve one exact NFT');
  }
  if (
    output.ergoTree
    !== EIP0045_BRIDGE_VALIDITY_TRACKER_PROPOSITION_BYTES_HEX
  ) {
    throw new Error('validity tracker successor proposition differs from WP-06AA');
  }
  const trackerDigestHex = fixedHex(
    source.successorDigestHex,
    33,
    'tracker successor digest',
  );
  if (
    successorRegisters.R5
    !== encodeValiditySpvTrackerAvlRegister(trackerDigestHex)
  ) {
    throw new Error('validity tracker successor R5 differs from its authenticated digest');
  }
  return Object.freeze({
    trackerKeyHex: fixedHex(source.trackerKeyHex, 32, 'tracker key'),
    trackerValueHex: fixedHex(source.trackerValueHex, 264, 'tracker value'),
    trackerNftIdHex,
    approvedTrustRootDigestHex: fixedHex(
      transition.approvedTrustAnchorDigestHex,
      32,
      'approved tracker trust root',
    ),
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
      'vault',
      'duplicatePrevention',
      'profileActivated',
      'nodeCheckPerformed',
      'fundsAuthorityEstablished',
      'gate5Closed',
    ],
    'validity settlement contract identity',
  );
  if (
    root.schema !== EIP0045_BRIDGE_VALIDITY_SETTLEMENT_CONTRACTS_V1_SCHEMA
    || root.version !== 1
  ) {
    throw new Error('validity settlement contract identity schema is unsupported');
  }
  if (
    root.sigmaStateCommit
      !== EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT
  ) {
    throw new Error('validity settlement contract identity SigmaState commit is unsupported');
  }
  if (
    root.profileActivated !== false
    || root.nodeCheckPerformed !== false
    || root.fundsAuthorityEstablished !== false
    || root.gate5Closed !== false
  ) {
    throw new Error('validity settlement contract identity boundaries are incompatible');
  }
  const parseRole = (role: 'vault' | 'duplicatePrevention') => {
    const record = exactRecord(
      root[role],
      [
        'templateSha256Hex',
        'resolvedSourceSha256Hex',
        'propositionBytes',
        'propositionSha256Hex',
        'propositionHex',
        'contractIdHex',
      ],
      `${role} contract identity`,
    );
    const templateSha256Hex = fixedHex(
      record.templateSha256Hex,
      32,
      `${role} template SHA-256`,
    );
    const resolvedSourceSha256Hex = fixedHex(
      record.resolvedSourceSha256Hex,
      32,
      `${role} resolved source SHA-256`,
    );
    const propositionHex = variableHex(
      record.propositionHex,
      `${role} proposition`,
    );
    const contractIdHex = fixedHex(
      record.contractIdHex,
      32,
      `${role} contract ID`,
    );
    if (
      blake2b256Hex(Buffer.from(propositionHex, 'hex')) !== contractIdHex
    ) {
      throw new Error(`${role} proposition does not match its contract ID`);
    }
    if (
      sha256Hex(Buffer.from(propositionHex, 'hex'))
      !== fixedHex(
        record.propositionSha256Hex,
        32,
        `${role} proposition SHA-256`,
      )
    ) {
      throw new Error(`${role} proposition does not match its SHA-256`);
    }
    if (
      exactSafeInt(record.propositionBytes, `${role} proposition bytes`)
      !== Buffer.from(propositionHex, 'hex').length
    ) {
      throw new Error(`${role} proposition byte count is inconsistent`);
    }
    return Object.freeze({
      templateSha256Hex,
      resolvedSourceSha256Hex,
      propositionBytes: Buffer.from(propositionHex, 'hex').length,
      propositionSha256Hex: fixedHex(
        record.propositionSha256Hex,
        32,
        `${role} proposition SHA-256`,
      ),
      propositionHex,
      contractIdHex,
    });
  };
  return Object.freeze({
    sigmaStateCommit:
      EIP0045_BRIDGE_VALIDITY_SETTLEMENT_SIGMA_STATE_COMMIT,
    settlementProfileIdHex: fixedHex(
      root.settlementProfileIdHex,
      32,
      'settlement profile ID',
    ),
    vault: parseRole('vault'),
    duplicatePrevention: parseRole('duplicatePrevention'),
  });
}

function parseFrontierVector(value: unknown): {
  readonly schema: string;
  readonly input: FrontierBridgeEventRootInput;
} {
  const root = exactRecord(
    value,
    ['schema', 'format', 'claimBoundary', 'input', 'expected'],
    'Frontier bridge-event-root vector',
  );
  const schema = exactString(root.schema, 'Frontier vector schema');
  if (schema !== 'e2s.frontier-bridge-event-root.vector.v1') {
    throw new Error('validity settlement requires the V1 Frontier vector');
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
  const input: FrontierBridgeEventRootInput = {
    sidechainIdHex: fixedHex(rawInput.sidechainIdHex, 32, 'Frontier sidechain ID'),
    executionBlockHashHex: fixedHex(
      rawInput.executionBlockHashHex,
      32,
      'Frontier execution block hash',
    ),
    bridgeAddress: exactString(rawInput.bridgeAddress, 'Frontier bridge address'),
    maxBurns: exactSafeInt(rawInput.maxBurns, 'Frontier max burns'),
    receipts: exactArray(rawInput.receipts, 'Frontier receipts') as
      FrontierBridgeEventRootInput['receipts'],
  };
  return Object.freeze({ schema, input });
}

function materializeTrackerOutputBox(
  wasm: any,
  eip12UnsignedTransaction: Readonly<Record<string, unknown>>,
  expectedTransactionIdHex: string,
): ValiditySettlementBoxV1 {
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
      throw new Error('tracker successor transaction ID differs from WP-06AA');
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
      JSON.parse(box.to_json()) as ValiditySettlementBoxV1,
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
  readonly profileIdHex: string;
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
        R6: encodeCollByteRegister(Buffer.from(input.profileIdHex, 'hex')),
      },
      creationHeight: input.currentErgoHeight - 1,
    }, {
      value: SOURCE_AMOUNT_NANO_ERG.toString(),
      ergoTree: input.causalVaultPropositionHex,
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(input.sourceIntentHex, 'hex')),
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
      'validity settlement setup transaction ID',
    );
    candidates = unsigned.output_candidates();
    if (candidates.len() !== 3) {
      throw new Error('validity settlement setup must contain three outputs');
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
        JSON.parse(boxes[0].to_json()) as ValiditySettlementBoxV1,
      ),
      causalVaultBox: deepFreeze(
        JSON.parse(boxes[1].to_json()) as ValiditySettlementBoxV1,
      ),
      feeFundingBox: deepFreeze(
        JSON.parse(boxes[2].to_json()) as ValiditySettlementBoxV1,
      ),
    });
  } finally {
    for (const box of boxes) box?.free?.();
    candidates?.free?.();
    unsignedId?.free?.();
    unsigned?.free?.();
  }
}

function canonicalEip12(input: ReturnType<typeof buildValiditySettlementTxV1>) {
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

function serializeInputExtensions(wasm: any, unsigned: any) {
  const inputs = unsigned.inputs();
  const results: Array<{
    keys: readonly number[];
    serializedHex: string;
    serializedBlake2b256Hex: string;
  }> = [];
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
          throw new Error(`validity settlement input ${index} ContextExtension keys differ`);
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
  return Object.freeze(results) as Eip0045BridgeValiditySettlementContextV1['contextExtensions'];
}

function serializeBox(wasm: any, boxJson: Readonly<Record<string, unknown>>): string {
  const box = wasm.ErgoBox.from_json(JSON.stringify(boxJson));
  try {
    return Buffer.from(box.sigma_serialize_bytes()).toString('hex');
  } finally {
    box.free?.();
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
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
    throw new Error(`${label} must contain exactly ${keys.join(', ')}`);
  }
  return record;
}

function parseAsciiJsonSource(
  value: Uint8Array,
  label: string,
): { readonly value: unknown; readonly sha256Hex: string } {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new Error(`${label} bytes must be a non-empty Uint8Array`);
  }
  const bytes = Buffer.from(value);
  if (bytes.some(byte => byte > 0x7f)) {
    throw new Error(`${label} bytes must be ASCII`);
  }
  const parsed = parseStrictJson(bytes.toString('ascii'), `${label} bytes`);
  return Object.freeze({
    value: parsed,
    sha256Hex: sha256Hex(bytes),
  });
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
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
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

function nonzeroFixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = fixedHex(value, bytes, label);
  if (normalized === '00'.repeat(bytes)) {
    throw new Error(`${label} must be nonzero`);
  }
  return normalized;
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
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
