import {
  PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION,
  assertPegInCausalAdmissionV2Bindings,
  blake2b256Hex,
  decodePegInCausalAdmissionStatementV2Hex,
  decodePegInSourceIntentV2Hex,
  derivePegInCausalAdmissionIdV2Hex,
  derivePegInCausalAdmissionProfileIdV2Hex,
  encodePegInConsumedAdmissionV3Hex,
  type PegInCausalAdmissionProfileV2,
  type PegInConsumedAdmissionV3,
} from './peg-in-causal-admission-v2.js';
import {
  PEG_IN_RUNTIME_RECORD_FORMAT_VERSION,
  assertPegInRuntimeRecordMatchesProfileGenerationV1,
  decodePegInRuntimeRecordV1ScaleHex,
  encodePegInRuntimeProfileV1ScaleHex,
  encodePegInRuntimeRecordV1ScaleHex,
  type PegInRuntimeProfileV1,
  type PegInRuntimeRecordV1,
} from './peg-in-runtime-state.js';

const UINT64_MAX = (1n << 64n) - 1n;

export interface PegInPendingCausalAdmissionV2 {
  readonly keyHex: string;
  readonly profileIdHex: string;
  readonly sourceIntentHex: string;
  readonly statementHex: string;
  readonly admissionIdHex: string;
  readonly admittedAtNativeHeight: string | number | bigint;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
}

export interface PegInCausalMintTransitionV2 {
  readonly admissionProfile: PegInCausalAdmissionProfileV2;
  readonly runtimeProfileV1: PegInRuntimeProfileV1;
  readonly parent: Readonly<{
    nativeBlockHashHex: string;
    nativeHeight: string | number | bigint;
    pendingAdmission: PegInPendingCausalAdmissionV2 | null;
    processedRecordScaleHex: string | null;
    consumedAdmissionV3Hex: string | null;
  }>;
  readonly event: Readonly<{
    nativeParentBlockHashHex: string;
    nativeHeight: string | number | bigint;
    executionBlockHashHex: string;
    executionHeight: string | number | bigint;
    transactionHashHex: string;
    transactionIndex: number;
    eventIndex: number;
    ergoBoxIdHex: string;
    tokenAddressHex: string;
    recipientAddressHex: string;
    amountNanoErg: string | number | bigint;
  }>;
  readonly post: Readonly<{
    pendingAdmission: PegInPendingCausalAdmissionV2 | null;
    processedRecordKeyHex: string;
    processedRecordScaleHex: string;
    consumedAdmissionKeyHex: string;
    consumedAdmissionV3Hex: string;
  }>;
}

/**
 * Validate the pure state relation required from a future runtime producer.
 * This function authenticates no trie root, source proof, finality proof, or
 * execution process and therefore grants no mint authority by itself.
 */
export function assertPegInCausalMintTransitionV2(
  transition: PegInCausalMintTransitionV2,
): void {
  const profileIdHex = derivePegInCausalAdmissionProfileIdV2Hex(
    transition.admissionProfile,
  );
  encodePegInRuntimeProfileV1ScaleHex(transition.runtimeProfileV1);

  const parentHashHex = normalizeHex(
    transition.parent.nativeBlockHashHex,
    32,
    'parent native block hash',
    true,
  );
  const eventParentHashHex = normalizeHex(
    transition.event.nativeParentBlockHashHex,
    32,
    'event native parent block hash',
    true,
  );
  const parentHeight = normalizeUint64(
    transition.parent.nativeHeight,
    'parent native height',
  );
  const eventHeight = normalizeUint64(
    transition.event.nativeHeight,
    'event native height',
  );
  if (eventParentHashHex !== parentHashHex || eventHeight !== parentHeight + 1n) {
    throw new Error('peg-in mint transition is not the direct native child of its parent');
  }
  if (transition.parent.pendingAdmission === null) {
    throw new Error('peg-in mint transition has no causal admission in parent state');
  }
  if (
    transition.parent.processedRecordScaleHex !== null
    || transition.parent.consumedAdmissionV3Hex !== null
  ) {
    throw new Error('peg-in mint transition parent already contains replay or consumption state');
  }
  if (transition.post.pendingAdmission !== null) {
    throw new Error('peg-in mint transition retained its pending admission after mint');
  }

  const pending = transition.parent.pendingAdmission;
  const admittedAtHeight = normalizeUint64(
    pending.admittedAtNativeHeight,
    'admitted-at native height',
  );
  const admissionActivationHeight = normalizeUint64(
    transition.admissionProfile.activationHeight,
    'admission profile activation height',
  );
  if (
    admittedAtHeight < admissionActivationHeight
    || admittedAtHeight > parentHeight
  ) {
    throw new Error('causal admission was not active and present before the mint block');
  }
  if (normalizeHex(pending.profileIdHex, 32, 'pending profile ID', true) !== profileIdHex) {
    throw new Error('pending admission profile ID drifted');
  }
  if (
    normalizeHex(pending.proofSystemIdHex, 32, 'pending proof-system ID', true)
      !== normalizeHex(
        transition.admissionProfile.proofSystemIdHex,
        32,
        'admission profile proof-system ID',
        true,
      )
    || normalizeHex(pending.proofProfileIdHex, 32, 'pending proof profile ID', true)
      !== normalizeHex(
        transition.admissionProfile.proofProfileIdHex,
        32,
        'admission profile proof profile ID',
        true,
      )
  ) {
    throw new Error('pending admission proof identity drifted from the active profile');
  }

  const sourceIntent = decodePegInSourceIntentV2Hex(pending.sourceIntentHex);
  const statement = decodePegInCausalAdmissionStatementV2Hex(pending.statementHex);
  assertPegInCausalAdmissionV2Bindings({
    profile: transition.admissionProfile,
    sourceIntent,
    statement,
  });
  const admissionIdHex = derivePegInCausalAdmissionIdV2Hex(statement);
  if (
    normalizeHex(pending.admissionIdHex, 32, 'pending admission ID', true)
    !== admissionIdHex
  ) {
    throw new Error('pending admission ID does not match its statement bytes');
  }
  const replayIdentityHex = normalizeHex(
    statement.legacyMintIdentityHex,
    32,
    'legacy mint identity',
    true,
  );
  if (
    normalizeHex(pending.keyHex, 32, 'pending admission key', true)
      !== replayIdentityHex
    || normalizeHex(
      transition.post.processedRecordKeyHex,
      32,
      'post processed-record key',
      true,
    ) !== replayIdentityHex
    || normalizeHex(
      transition.post.consumedAdmissionKeyHex,
      32,
      'post consumed-admission key',
      true,
    ) !== replayIdentityHex
  ) {
    throw new Error('causal transition does not preserve the V1 replay identity');
  }

  if (
    normalizeHex(transition.runtimeProfileV1.sidechainIdHex, 32, 'runtime sidechain ID', true)
      !== normalizeHex(sourceIntent.sidechainIdHex, 32, 'source-intent sidechain ID', true)
    || normalizeHex(transition.runtimeProfileV1.bridgeAddress, 20, 'runtime bridge address', true)
      !== normalizeHex(sourceIntent.bridgeAddressHex, 20, 'source-intent bridge address', true)
  ) {
    throw new Error('V1 runtime profile does not match the causal admission destination');
  }
  if (
    normalizeHex(transition.event.ergoBoxIdHex, 32, 'event Ergo box ID', true)
      !== normalizeHex(statement.sourceBoxIdHex, 32, 'statement source box ID', true)
    || normalizeHex(transition.event.tokenAddressHex, 20, 'event token address', true)
      !== normalizeHex(sourceIntent.tokenAddressHex, 20, 'source-intent token address', true)
    || normalizeHex(
      transition.event.recipientAddressHex,
      20,
      'event recipient address',
      true,
    ) !== normalizeHex(sourceIntent.recipientAddressHex, 20, 'intent recipient address', true)
    || normalizeUint64(transition.event.amountNanoErg, 'event amount', true)
      !== normalizeUint64(sourceIntent.amountNanoErg, 'source-intent amount', true)
  ) {
    throw new Error('PegIn event fields do not match the causal source intent');
  }

  const executionBlockHashHex = normalizeHex(
    transition.event.executionBlockHashHex,
    32,
    'execution block hash',
    true,
  );
  const executionHeight = normalizeUint64(
    transition.event.executionHeight,
    'execution height',
  );
  const transactionHashHex = normalizeHex(
    transition.event.transactionHashHex,
    32,
    'transaction hash',
    true,
  );
  const expectedRecord: PegInRuntimeRecordV1 = {
    formatVersion: PEG_IN_RUNTIME_RECORD_FORMAT_VERSION,
    sidechainIdHex: sourceIntent.sidechainIdHex,
    bridgeAddress: sourceIntent.bridgeAddressHex,
    profileRevision: transition.runtimeProfileV1.profileRevision,
    profileActivationHeight: transition.runtimeProfileV1.activationHeight,
    ergoBoxIdHex: statement.sourceBoxIdHex,
    recipientAddress: sourceIntent.recipientAddressHex,
    amountNanoErg: sourceIntent.amountNanoErg,
    sidechainHeight: executionHeight,
    executionBlockHashHex,
    transactionHashHex,
    eventIndex: transition.event.eventIndex,
  };
  assertPegInRuntimeRecordMatchesProfileGenerationV1(
    expectedRecord,
    transition.runtimeProfileV1,
  );
  const expectedRecordScaleHex = encodePegInRuntimeRecordV1ScaleHex(expectedRecord);
  if (transition.post.processedRecordScaleHex !== expectedRecordScaleHex) {
    throw new Error('post-state V1 processed record does not match the causal mint event');
  }
  const decodedRecord = decodePegInRuntimeRecordV1ScaleHex(
    transition.post.processedRecordScaleHex,
  );
  assertPegInRuntimeRecordMatchesProfileGenerationV1(
    decodedRecord,
    transition.runtimeProfileV1,
  );

  const sourceIntentIdHex = normalizeHex(
    statement.sourceIntentIdHex,
    32,
    'source intent ID',
    true,
  );
  const expectedConsumed: PegInConsumedAdmissionV3 = {
    formatVersion: PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION,
    admissionIdHex,
    sourceIntentIdHex,
    legacyMintIdentityHex: replayIdentityHex,
    nativeParentBlockHashHex: eventParentHashHex,
    nativeMintHeight: eventHeight,
    executionBlockHashHex,
    executionHeight,
    transactionHashHex,
    transactionIndex: transition.event.transactionIndex,
    eventIndex: transition.event.eventIndex,
    processedRecordBlake2b256Hex: blake2b256Hex(expectedRecordScaleHex),
  };
  const expectedConsumedHex = encodePegInConsumedAdmissionV3Hex(expectedConsumed);
  if (transition.post.consumedAdmissionV3Hex !== expectedConsumedHex) {
    throw new Error('post-state consumed admission V3 does not match the causal mint transition');
  }
}

function normalizeHex(
  value: string,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a hexadecimal string`);
  }
  const raw = value.startsWith('0x') ? value.slice(2) : value;
  if (raw.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  if (nonzero && /^0+$/.test(raw)) {
    throw new Error(`${label} must not be zero`);
  }
  return `0x${raw.toLowerCase()}`;
}

function normalizeUint64(
  value: string | number | bigint,
  label: string,
  positive = false,
): bigint {
  let normalized: bigint;
  if (typeof value === 'bigint') {
    normalized = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} number must be a safe integer`);
    }
    normalized = BigInt(value);
  } else if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
    normalized = BigInt(value);
  } else {
    throw new Error(`${label} must be a canonical decimal uint64`);
  }
  if (
    normalized < 0n
    || normalized > UINT64_MAX
    || (positive && normalized === 0n)
  ) {
    throw new Error(`${label} must be a ${positive ? 'positive ' : ''}uint64`);
  }
  return normalized;
}
