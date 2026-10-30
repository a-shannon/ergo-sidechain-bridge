import {
  tracker_application_v2_empty_digest,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  encodeAvlTreeRegister, encodeCollByteRegister, encodeIntRegister, encodeLongRegister,
} from './ergo-encoding.js';
import {
  materializeSubstrateFederatedSingletonIssuanceV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  revalidateSubstrateFederatedGenesisBoxObservationV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import type { SubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV2,
  type SubstrateFederatedTrackerJvmCompilerReceiptV2,
} from './substrate-federated-tracker-jvm-compiler-v2.js';
import type { Eip12Box, MaterializedUnsignedTransaction } from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_TRACKER_V2_GENESIS_SCHEMA =
  'e2s.substrate-federated-tracker-v2-genesis' as const;

const TRACKER_VALUE = 10_000_000n;
const ISSUANCE_FEE = 1_100_000n;
const GENESIS_CANDIDATES = new WeakSet<object>();

export interface BuildSubstrateFederatedTrackerV2GenesisInput {
  readonly targetProfile: Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly observation: Readonly<SubstrateFederatedGenesisObservationV1>;
  readonly compilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
  readonly compilerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV2>;
}

export interface SubstrateFederatedTrackerV2Genesis {
  readonly schema: typeof SUBSTRATE_FEDERATED_TRACKER_V2_GENESIS_SCHEMA;
  readonly version: 2;
  readonly anchorSelector: 'absolute-ergo-header-height';
  readonly targetProfileDigestHex: string;
  readonly observationDigestHex: string;
  readonly compilerRequestDigestHex: string;
  readonly compilerReceiptDigestHex: string;
  readonly genesisInputBoxIdHex: string;
  readonly trackerNftIdHex: string;
  readonly contract: SubstrateFederatedTrackerJvmCompilerReceiptV2['contract'];
  readonly target: SubstrateFederatedGenesisObservationV1['target'];
  readonly transaction: Readonly<MaterializedUnsignedTransaction>;
  readonly trackerBox: Readonly<Eip12Box>;
  readonly trackerBoxSigmaHex: string;
  readonly genesisInputBoxSigmaHex: string;
  readonly boundaries: Readonly<{
    readonly genesisObservationRevalidated: true;
    readonly constructionOnly: true;
    readonly revalidationRequiredBeforeSigning: true;
    readonly nodeCheckPerformed: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

export function assertSubstrateFederatedTrackerV2Genesis(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedTrackerV2Genesis> {
  if (value === null || typeof value !== 'object'
    || !GENESIS_CANDIDATES.has(value) || !Object.isFrozen(value)) {
    throw new Error('substrate federated tracker V2 genesis provenance is missing');
  }
}

/** Unsigned tracker-only issuance, not a settlement-family registration or cutover. */
export async function buildSubstrateFederatedTrackerV2Genesis(
  input: BuildSubstrateFederatedTrackerV2GenesisInput,
): Promise<Readonly<SubstrateFederatedTrackerV2Genesis>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',')
      !== 'compilerReceipt,compilerRequest,observation,targetProfile') {
    throw new Error('tracker V2 genesis requires only exact observation and compiler inputs');
  }
  // All four objects are provenance-bound and deeply frozen. Capture references
  // before awaiting so replacement of caller properties cannot change the join.
  const { targetProfile, observation, compilerRequest, compilerReceipt } = input;
  assertSubstrateFederatedGenesisObservationV1Provenance(targetProfile, observation);
  const receipt = assertSubstrateFederatedTrackerJvmCompilerReceiptV2(
    compilerReceipt, compilerRequest,
  );
  const source = observation.boxes.tracker;
  if (compilerRequest.trackerNftIdHex !== source.box.boxId
    || compilerRequest.trackerNftIdHex !== targetProfile.genesisBoxIds.tracker) {
    throw new Error('tracker V2 compiler NFT differs from the observed genesis input');
  }
  const creationHeight = observation.target.tipHeight + 1;
  if (!Number.isSafeInteger(creationHeight) || creationHeight < 1
    || creationHeight > 0x7fffffff) {
    throw new Error('tracker V2 genesis creation height exceeds the signed Int range');
  }
  // Recheck exact JSON/Sigma bytes, not chain currentness or consensus. The
  // operational consumer must fetch current inputs again before signing.
  await revalidateSubstrateFederatedGenesisBoxObservationV1(
    source, compilerRequest.trackerNftIdHex, 'tracker', observation.target.tipHeight,
  );
  const registers = {
    R4: encodeCollByteRegister(Buffer.from(compilerRequest.profile.profileIdHex, 'hex')),
    R5: encodeAvlTreeRegister(Buffer.from(tracker_application_v2_empty_digest(), 'hex'), 1, 370),
    R6: encodeCollByteRegister(Buffer.from(compilerRequest.application.sidechainIdHex, 'hex')),
    R7: encodeLongRegister(0n),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(compilerRequest.profile.ergoAdmissionKeySetDigestHex, 'hex')),
  };
  // This shared primitive emits singleton transactions only; it does not
  // construct a V1 compiler receipt, family, generation or runtime profile.
  const transaction = await materializeSubstrateFederatedSingletonIssuanceV1({
    label: 'federated tracker V2 genesis issuance',
    genesisInput: source.box,
    expectedNftIdHex: compilerRequest.trackerNftIdHex,
    propositionHex: receipt.contract.propositionHex,
    registers,
    singletonValue: TRACKER_VALUE,
    fee: ISSUANCE_FEE,
    creationHeight,
  });
  const trackerBox = transaction.outputs[0]!;
  const module = await import('ergo-lib-wasm-nodejs');
  const wasm = module.default ?? module;
  const handle = wasm.ErgoBox.from_json(JSON.stringify(trackerBox));
  let trackerBoxSigmaHex: string;
  try {
    trackerBoxSigmaHex = Buffer.from(handle.sigma_serialize_bytes()).toString('hex');
  } finally { handle.free(); }
  const result = deepFreeze({
    schema: SUBSTRATE_FEDERATED_TRACKER_V2_GENESIS_SCHEMA,
    version: 2 as const,
    anchorSelector: compilerRequest.anchorSelector,
    targetProfileDigestHex: targetProfile.profileDigestHex,
    observationDigestHex: observation.reportDigestHex,
    compilerRequestDigestHex: compilerRequest.requestDigestHex,
    compilerReceiptDigestHex: receipt.receiptDigestHex,
    genesisInputBoxIdHex: source.box.boxId,
    trackerNftIdHex: compilerRequest.trackerNftIdHex,
    contract: receipt.contract,
    target: observation.target,
    transaction,
    trackerBox,
    trackerBoxSigmaHex,
    genesisInputBoxSigmaHex: source.sigmaSerializedHex,
    boundaries: {
      genesisObservationRevalidated: true as const,
      constructionOnly: true as const,
      revalidationRequiredBeforeSigning: true as const,
      nodeCheckPerformed: false as const,
      targetNodeAcceptanceEstablished: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
    },
  });
  GENESIS_CANDIDATES.add(result);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
