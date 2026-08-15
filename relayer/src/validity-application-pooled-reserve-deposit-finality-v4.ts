import blakejs from 'blakejs';

import {
  verifyPooledReserveCommitmentMembership,
} from './avl-bridge.js';
import {
  decodeAvlTreeRegisterDigest,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex,
  VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveDepositTransitionV4Packet,
  type ValidityApplicationPooledReserveDepositTransitionV4Packet,
} from './validity-application-pooled-reserve-deposit-transition-v4.js';
import type {
  Eip12Box,
  MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  normalizeEip12Box,
} from './unsigned-ergo-transaction.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_FINALITY_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-deposit-finality.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN =
  'E2S_PEG_IN_MINT_ID_V4' as const;

const candidates = new WeakSet<object>();
const MAX_FINALITY_HEADER_SEGMENT_LENGTH = 4_096;

export interface ValidityApplicationPooledReserveDepositHeaderV4 {
  readonly height: number;
  readonly headerIdHex: string;
  readonly parentHeaderIdHex: string;
}

export interface ValidityApplicationPooledReserveDepositFinalityViewV4 {
  readonly transaction: MaterializedUnsignedTransaction;
  readonly inclusion: {
    readonly height: number;
    readonly headerIdHex: string;
  };
  readonly canonicalHeaders:
    readonly ValidityApplicationPooledReserveDepositHeaderV4[];
  readonly canonicalTarget: {
    readonly height: number;
    readonly headerIdHex: string;
  };
  readonly currentTip: {
    readonly height: number;
    readonly headerIdHex: string;
  };
  readonly reserveState: {
    readonly sourceLock: Eip12Box | null;
    readonly reservePredecessor: Eip12Box | null;
    readonly canonicalReserveTip: Eip12Box | null;
    readonly depositMembershipProofHex: string;
  };
}

type NormalizedValidityApplicationPooledReserveDepositFinalityViewV4 =
  Omit<ValidityApplicationPooledReserveDepositFinalityViewV4, 'reserveState'>
  & {
    readonly reserveState: {
      readonly sourceLock: null;
      readonly reservePredecessor: null;
      readonly canonicalReserveTip: Eip12Box;
    };
  };

export interface ValidityApplicationPooledReserveDepositObservationQueryV4 {
  readonly transitionTxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly reservePredecessorBoxIdHex: string;
  readonly reserveSuccessorBoxIdHex: string;
}

export interface ValidityApplicationPooledReserveDepositObservationPortV4 {
  readonly sourceId: string;
  readonly origin: string;
  readonly readCanonicalDepositView: (
    query: Readonly<
      ValidityApplicationPooledReserveDepositObservationQueryV4
    >,
  ) => Promise<unknown>;
}

export interface BuildValidityApplicationPooledReserveDepositFinalityV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly depositTransition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>;
  readonly observationSources: readonly [
    ValidityApplicationPooledReserveDepositObservationPortV4,
    ValidityApplicationPooledReserveDepositObservationPortV4,
  ];
}

export interface ValidityApplicationPooledReserveDepositFinalityV4Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_FINALITY_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly ergoDepositFinalityPolicyIdHex: string;
  readonly mintIdentityHex: string;
  readonly transitionTxIdHex: string;
  readonly sourceLockBoxIdHex: string;
  readonly depositCommitmentHex: string;
  readonly finality: {
    readonly inclusionHeight: number;
    readonly inclusionHeaderIdHex: string;
    readonly requiredSuccessorDepth: number;
    readonly targetHeight: number;
    readonly targetHeaderIdHex: string;
    readonly currentCanonicalTipHeight: number;
    readonly currentCanonicalTipHeaderIdHex: string;
  };
  readonly observations: {
    readonly sourceIds: readonly [string, string];
    readonly origins: readonly [string, string];
    readonly eachSourceStableBeforeAndAfter: true;
    readonly sourcesAgreeExactly: true;
    readonly exactTransitionBytesObserved: true;
    readonly canonicalTargetObservedAtRequiredDepth: true;
    readonly sourceAndPredecessorAbsent: true;
    readonly canonicalReserveDescendantPresentAndDepositRetained: true;
  };
  readonly boundaries: {
    readonly finalityObservationCandidateConstructed: true;
    readonly localMintEligibilityConditionMet: false;
    readonly transactionToBlockInclusionEstablished: false;
    readonly observationSourceRegistryAuthenticated: false;
    readonly mintAuthorized: false;
    readonly localPersistenceConsulted: false;
    readonly immediatePreMintRevalidationRequired: true;
    readonly immediatePreMintRevalidationCompleted: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly checkerAuthorityEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

interface PortSnapshot {
  readonly sourceId: string;
  readonly origin: string;
  readonly port: ValidityApplicationPooledReserveDepositObservationPortV4;
  readonly read: (
    query: Readonly<
      ValidityApplicationPooledReserveDepositObservationQueryV4
    >,
  ) => Promise<unknown>;
}

export async function buildValidityApplicationPooledReserveDepositFinalityV4(
  input: BuildValidityApplicationPooledReserveDepositFinalityV4Input,
): Promise<
  Readonly<ValidityApplicationPooledReserveDepositFinalityV4Candidate>
> {
  assertExactDataObject(input, [
    'compiledInstance',
    'depositTransition',
    'observationSources',
  ], 'pooled-reserve deposit-finality input');
  const compiled = input.compiledInstance;
  const transition = input.depositTransition;
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(compiled);
  assertValidityApplicationPooledReserveDepositTransitionV4Packet(transition);
  if (transition.lineageProfileIdHex !== compiled.lineageProfileIdHex) {
    throw new Error(
      'pooled-reserve deposit transition does not match the compiled profile',
    );
  }
  const policy = compiled.ergoDepositFinalityPolicy;
  const derivedPolicyIdHex =
    deriveValidityApplicationPooledReserveErgoDepositFinalityPolicyIdV1Hex({
      version: policy.version,
      requiredSuccessorDepth: policy.requiredSuccessorDepth,
      blockIdentityAndAncestryRequired:
        policy.blockIdentityAndAncestryRequired,
      divergentRpcAction: policy.divergentRpcAction,
      reorgAction: policy.reorgAction,
    });
  if (derivedPolicyIdHex !== policy.policyIdHex) {
    throw new Error('compiled Ergo-deposit-finality policy ID is inconsistent');
  }
  const requiredSuccessorDepth = positiveSafeInteger(
    policy.requiredSuccessorDepth,
    'required successor depth',
  );

  assertExactArray(input.observationSources, 2, 'observation sources');
  // Capture every capability and identity before the first asynchronous read.
  const ports = input.observationSources.map((port, index) =>
    snapshotPort(port, index)
  ) as [PortSnapshot, PortSnapshot];
  if (ports[0].sourceId === ports[1].sourceId) {
    throw new Error('observation source IDs must be distinct');
  }
  if (ports[0].origin === ports[1].origin) {
    throw new Error('observation source origins must be distinct');
  }

  const query = deepFreeze({
    transitionTxIdHex: canonicalHex(
      transition.transactions.reserveTransition.txId,
      'transition transaction ID',
    ),
    sourceLockBoxIdHex: canonicalHex(
      transition.boxes.sourceLock.boxId,
      'source-lock box ID',
    ),
    reservePredecessorBoxIdHex: canonicalHex(
      transition.boxes.reservePredecessor.boxId,
      'reserve predecessor box ID',
    ),
    reserveSuccessorBoxIdHex: canonicalHex(
      transition.boxes.reserveSuccessor.boxId,
      'reserve successor box ID',
    ),
  });

  const beforeRaw = await Promise.all(ports.map(
    snapshot => snapshot.read.call(snapshot.port, query),
  ));
  const before = await Promise.all(beforeRaw.map((view, index) =>
    normalizeView(
      view,
      compiled,
      transition,
      requiredSuccessorDepth,
      `observation source ${index + 1} before view`,
    )
  )) as [
    Readonly<NormalizedValidityApplicationPooledReserveDepositFinalityViewV4>,
    Readonly<NormalizedValidityApplicationPooledReserveDepositFinalityViewV4>,
  ];
  const afterRaw = await Promise.all(ports.map(
    snapshot => snapshot.read.call(snapshot.port, query),
  ));
  ports.forEach((snapshot, index) =>
    assertPortUnchanged(snapshot, index)
  );
  const after = await Promise.all(afterRaw.map((view, index) =>
    normalizeView(
      view,
      compiled,
      transition,
      requiredSuccessorDepth,
      `observation source ${index + 1} after view`,
    )
  )) as [
    Readonly<NormalizedValidityApplicationPooledReserveDepositFinalityViewV4>,
    Readonly<NormalizedValidityApplicationPooledReserveDepositFinalityViewV4>,
  ];

  const beforeCanonical = before.map(canonicalJson);
  const afterCanonical = after.map(canonicalJson);
  for (let index = 0; index < 2; index += 1) {
    if (beforeCanonical[index] !== afterCanonical[index]) {
      throw new Error(`observation source ${index + 1} changed during read`);
    }
  }
  if (beforeCanonical[0] !== beforeCanonical[1]) {
    throw new Error('observation sources disagree on canonical deposit state');
  }

  const agreed = before[0];
  const targetHeight = checkedHeightAdd(
    agreed.inclusion.height,
    requiredSuccessorDepth,
    'Ergo-deposit-finality target height',
  );
  const targetHeader = agreed.canonicalHeaders[requiredSuccessorDepth];
  if (
    targetHeader === undefined
    || targetHeader.height !== targetHeight
  ) {
    throw new Error('canonical header segment omits the finality target');
  }
  const mintIdentityHex = blake2b256Hex(Buffer.concat([
    Buffer.from(
      VALIDITY_APPLICATION_POOLED_RESERVE_PEG_IN_MINT_ID_V4_DOMAIN,
      'ascii',
    ),
    fixedHexBytes(compiled.lineageProfileIdHex, 'lineage profile ID'),
    fixedHexBytes(transition.boxes.sourceLock.boxId, 'source-lock box ID'),
    fixedHexBytes(transition.depositCommitmentHex, 'deposit commitment'),
  ]));

  const result = deepFreeze({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_FINALITY_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: compiled.lineageProfileIdHex,
    ergoDepositFinalityPolicyIdHex: policy.policyIdHex,
    mintIdentityHex,
    transitionTxIdHex: query.transitionTxIdHex,
    sourceLockBoxIdHex: query.sourceLockBoxIdHex,
    depositCommitmentHex: transition.depositCommitmentHex,
    finality: {
      inclusionHeight: agreed.inclusion.height,
      inclusionHeaderIdHex: agreed.inclusion.headerIdHex,
      requiredSuccessorDepth,
      targetHeight,
      targetHeaderIdHex: targetHeader.headerIdHex,
      currentCanonicalTipHeight: agreed.currentTip.height,
      currentCanonicalTipHeaderIdHex: agreed.currentTip.headerIdHex,
    },
    observations: {
      sourceIds: [ports[0].sourceId, ports[1].sourceId] as const,
      origins: [ports[0].origin, ports[1].origin] as const,
      eachSourceStableBeforeAndAfter: true as const,
      sourcesAgreeExactly: true as const,
      exactTransitionBytesObserved: true as const,
      canonicalTargetObservedAtRequiredDepth: true as const,
      sourceAndPredecessorAbsent: true as const,
      canonicalReserveDescendantPresentAndDepositRetained: true as const,
    },
    boundaries: {
      finalityObservationCandidateConstructed: true as const,
      localMintEligibilityConditionMet: false as const,
      transactionToBlockInclusionEstablished: false as const,
      observationSourceRegistryAuthenticated: false as const,
      mintAuthorized: false as const,
      localPersistenceConsulted: false as const,
      immediatePreMintRevalidationRequired: true as const,
      immediatePreMintRevalidationCompleted: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      checkerAuthorityEstablished: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  candidates.add(result);
  return result;
}

export function assertValidityApplicationPooledReserveDepositFinalityV4Candidate(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveDepositFinalityV4Candidate
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve deposit-finality candidate was not built in this process',
    );
  }
}

function snapshotPort(
  value: unknown,
  index: number,
): PortSnapshot {
  const label = `observation source ${index + 1}`;
  assertExactDataObject(value, [
    'sourceId',
    'origin',
    'readCanonicalDepositView',
  ], label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const sourceId = nonemptyCanonicalString(
    descriptors.sourceId?.value,
    `${label} ID`,
  );
  const origin = nonemptyCanonicalString(
    descriptors.origin?.value,
    `${label} origin`,
  );
  const read = descriptors.readCanonicalDepositView?.value;
  if (typeof read !== 'function') {
    throw new Error(`${label} read method must be a function data property`);
  }
  return Object.freeze({
    sourceId,
    origin,
    port: value as unknown as
      ValidityApplicationPooledReserveDepositObservationPortV4,
    read,
  });
}

function assertPortUnchanged(snapshot: PortSnapshot, index: number): void {
  const label = `observation source ${index + 1}`;
  const descriptors = Object.getOwnPropertyDescriptors(snapshot.port);
  if (
    descriptors.sourceId?.value !== snapshot.sourceId
    || descriptors.origin?.value !== snapshot.origin
    || descriptors.readCanonicalDepositView?.value !== snapshot.read
  ) {
    throw new Error(`${label} capability or identity changed during read`);
  }
}

async function normalizeView(
  value: unknown,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  transition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>,
  requiredSuccessorDepth: number,
  label: string,
): Promise<
  Readonly<NormalizedValidityApplicationPooledReserveDepositFinalityViewV4>
> {
  assertExactDataObject(value, [
    'transaction',
    'inclusion',
    'canonicalHeaders',
    'canonicalTarget',
    'currentTip',
    'reserveState',
  ], label);
  const record = value as Record<string, unknown>;
  assertDeepExactDataShape(
    record.transaction,
    transition.transactions.reserveTransition,
    `${label} transaction`,
  );
  if (
    canonicalJson(record.transaction)
    !== canonicalJson(transition.transactions.reserveTransition)
  ) {
    throw new Error(`${label} transaction does not match the deposit transition`);
  }

  assertExactDataObject(record.inclusion, [
    'height',
    'headerIdHex',
  ], `${label} inclusion`);
  const inclusion = record.inclusion as Record<string, unknown>;
  const inclusionHeight = nonnegativeSafeInteger(
    inclusion.height,
    `${label} inclusion height`,
  );
  const inclusionHeaderIdHex = canonicalHex(
    inclusion.headerIdHex,
    `${label} inclusion header ID`,
  );

  if (!Array.isArray(record.canonicalHeaders)) {
    throw new Error(`${label} canonical headers must be an array`);
  }
  if (record.canonicalHeaders.length === 0) {
    throw new Error(`${label} canonical headers cannot be empty`);
  }
  if (
    record.canonicalHeaders.length > MAX_FINALITY_HEADER_SEGMENT_LENGTH
  ) {
    throw new Error(
      `${label} canonical header segment exceeds the ${MAX_FINALITY_HEADER_SEGMENT_LENGTH}-header bound`,
    );
  }
  assertExactArray(
    record.canonicalHeaders,
    record.canonicalHeaders.length,
    `${label} canonical headers`,
  );
  const canonicalHeaders = record.canonicalHeaders.map((header, index) => {
    assertExactDataObject(header, [
      'height',
      'headerIdHex',
      'parentHeaderIdHex',
    ], `${label} canonical headers[${index}]`);
    const fields = header as Record<string, unknown>;
    return {
      height: nonnegativeSafeInteger(
        fields.height,
        `${label} canonical headers[${index}] height`,
      ),
      headerIdHex: canonicalHex(
        fields.headerIdHex,
        `${label} canonical headers[${index}] ID`,
      ),
      parentHeaderIdHex: canonicalHex(
        fields.parentHeaderIdHex,
        `${label} canonical headers[${index}] parent ID`,
      ),
    };
  });
  const firstHeader = canonicalHeaders[0];
  if (
    firstHeader.height !== inclusionHeight
    || firstHeader.headerIdHex !== inclusionHeaderIdHex
  ) {
    throw new Error(`${label} header segment does not start at inclusion`);
  }
  for (let index = 1; index < canonicalHeaders.length; index += 1) {
    const previous = canonicalHeaders[index - 1];
    const current = canonicalHeaders[index];
    if (
      current.height !== checkedHeightAdd(
        previous.height,
        1,
        `${label} canonical header height`,
      )
      || current.parentHeaderIdHex !== previous.headerIdHex
    ) {
      throw new Error(`${label} canonical header ancestry is not direct`);
    }
  }

  assertExactDataObject(record.currentTip, [
    'height',
    'headerIdHex',
  ], `${label} current tip`);
  const currentTip = record.currentTip as Record<string, unknown>;
  const tipHeight = nonnegativeSafeInteger(
    currentTip.height,
    `${label} current tip height`,
  );
  const tipHeaderIdHex = canonicalHex(
    currentTip.headerIdHex,
    `${label} current tip header ID`,
  );
  assertExactDataObject(record.canonicalTarget, [
    'height',
    'headerIdHex',
  ], `${label} canonical target`);
  const canonicalTarget = record.canonicalTarget as Record<string, unknown>;
  const canonicalTargetHeight = nonnegativeSafeInteger(
    canonicalTarget.height,
    `${label} canonical target height`,
  );
  const canonicalTargetHeaderIdHex = canonicalHex(
    canonicalTarget.headerIdHex,
    `${label} canonical target header ID`,
  );
  const targetHeight = checkedHeightAdd(
    inclusionHeight,
    requiredSuccessorDepth,
    `${label} finality target height`,
  );
  if (tipHeight < targetHeight) {
    throw new Error(`${label} has insufficient successor depth`);
  }
  const expectedHeaderCount = checkedHeightAdd(
    tipHeight - inclusionHeight,
    1,
    `${label} canonical header count`,
  );
  if (canonicalHeaders.length !== expectedHeaderCount) {
    throw new Error(
      `${label} canonical header segment must run from inclusion through the current tip`,
    );
  }
  const targetHeader = canonicalHeaders[requiredSuccessorDepth];
  const observedTipHeader = canonicalHeaders[canonicalHeaders.length - 1];
  if (
    targetHeader === undefined
    || targetHeader.height !== targetHeight
    || canonicalTargetHeight !== targetHeight
    || canonicalTargetHeaderIdHex !== targetHeader.headerIdHex
    || observedTipHeader.height !== tipHeight
    || observedTipHeader.headerIdHex !== tipHeaderIdHex
  ) {
    throw new Error(
      `${label} canonical finality target does not match the current view`,
    );
  }

  assertExactDataObject(record.reserveState, [
    'sourceLock',
    'reservePredecessor',
    'canonicalReserveTip',
    'depositMembershipProofHex',
  ], `${label} reserve state`);
  const reserveState = record.reserveState as Record<string, unknown>;
  if (reserveState.sourceLock !== null) {
    throw new Error(`${label} still reports the source lock unspent`);
  }
  if (reserveState.reservePredecessor !== null) {
    throw new Error(`${label} still reports the reserve predecessor unspent`);
  }
  if (reserveState.canonicalReserveTip === null) {
    throw new Error(`${label} does not report a canonical reserve descendant`);
  }
  const membershipProofHex = canonicalVariableHex(
    reserveState.depositMembershipProofHex,
    `${label} deposit membership proof`,
  );
  const canonicalReserveTip = await normalizeCanonicalReserveTip(
    reserveState.canonicalReserveTip,
    compiled,
    transition,
    label,
  );
  const reserveDigestHex = decodeAvlTreeRegisterDigest(
    canonicalReserveTip.additionalRegisters.R5,
    `${label} canonical reserve tip R5`,
  );
  const membership = verifyPooledReserveCommitmentMembership(
    reserveDigestHex,
    transition.boxes.sourceLock.boxId,
    transition.depositCommitmentHex,
    membershipProofHex,
  );
  if (
    membership.digest_hex !== reserveDigestHex
    || membership.value_hex !== transition.depositCommitmentHex
  ) {
    throw new Error(
      `${label} deposit membership result does not match the reserve state`,
    );
  }

  return deepFreeze({
    transaction: cloneCanonical(
      record.transaction,
    ) as MaterializedUnsignedTransaction,
    inclusion: {
      height: inclusionHeight,
      headerIdHex: inclusionHeaderIdHex,
    },
    canonicalHeaders,
    canonicalTarget: {
      height: canonicalTargetHeight,
      headerIdHex: canonicalTargetHeaderIdHex,
    },
    currentTip: {
      height: tipHeight,
      headerIdHex: tipHeaderIdHex,
    },
    reserveState: {
      sourceLock: null,
      reservePredecessor: null,
      canonicalReserveTip,
    },
  });
}

async function normalizeCanonicalReserveTip(
  value: unknown,
  compiled:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  transition:
    Readonly<ValidityApplicationPooledReserveDepositTransitionV4Packet>,
  label: string,
): Promise<Eip12Box> {
  const reserveLabel = `${label} canonical reserve tip`;
  assertExactDataObject(value, [
    'boxId',
    'value',
    'ergoTree',
    'assets',
    'additionalRegisters',
    'creationHeight',
    'transactionId',
    'index',
  ], reserveLabel);
  const record = value as Record<string, unknown>;
  assertExactArray(record.assets, 1, `${reserveLabel} assets`);
  assertExactDataObject(record.assets[0], [
    'tokenId',
    'amount',
  ], `${reserveLabel} assets[0]`);
  assertExactDataObject(record.additionalRegisters, [
    'R4',
    'R5',
    'R6',
  ], `${reserveLabel} registers`);

  const reserve = await normalizeEip12Box(
    cloneCanonical(record),
    reserveLabel,
  );
  const expectedNftIdHex = fixedHexBytes(
    compiled.genesis.settlementVaultNftIdHex,
    'pooled-reserve NFT ID',
  ).toString('hex');
  if (
    reserve.ergoTree
      !== compiled.contracts.pooledReserve.receipt.propositionHex
    || reserve.assets.length !== 1
    || reserve.assets[0].tokenId !== expectedNftIdHex
    || reserve.assets[0].amount !== '1'
  ) {
    throw new Error(
      `${reserveLabel} does not carry the exact pooled-reserve contract and singleton NFT`,
    );
  }

  const expectedProfileIdHex = fixedHexBytes(
    compiled.lineageProfileIdHex,
    'lineage profile ID',
  ).toString('hex');
  const observedProfileIdHex = decodeCollByteRegister(
    reserve.additionalRegisters.R4,
    `${reserveLabel} R4`,
  );
  const expectedProfileRegister = encodeCollByteRegister(
    Buffer.from(expectedProfileIdHex, 'hex'),
  );
  if (
    observedProfileIdHex !== expectedProfileIdHex
    || reserve.additionalRegisters.R4 !== expectedProfileRegister
  ) {
    throw new Error(`${reserveLabel} has the wrong lineage profile`);
  }

  const digestHex = decodeAvlTreeRegisterDigest(
    reserve.additionalRegisters.R5,
    `${reserveLabel} R5`,
  );
  const expectedAvlRegister = encodeAvlTreeRegister(
    Buffer.from(digestHex, 'hex'),
    VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
    VALIDITY_APPLICATION_POOLED_RESERVE_DEPOSIT_VALUE_LENGTH,
  );
  if (reserve.additionalRegisters.R5 !== expectedAvlRegister) {
    throw new Error(`${reserveLabel} has the wrong deposit-state AVL shape`);
  }

  const liability = decodeCanonicalLongRegister(
    reserve.additionalRegisters.R6,
    `${reserveLabel} R6`,
  );
  if (liability < 0n) {
    throw new Error(`${reserveLabel} liability cannot be negative`);
  }
  const reserveValue = canonicalPositiveAmount(
    reserve.value,
    `${reserveLabel} value`,
  );
  if (liability > reserveValue) {
    throw new Error(`${reserveLabel} liability exceeds its ERG value`);
  }
  const protectedReserveSeed = canonicalPositiveAmount(
    transition.reserveState.protectedReserveSeedNanoErg,
    'protected pooled-reserve seed',
  );
  if (reserveValue - liability !== protectedReserveSeed) {
    throw new Error(
      `${reserveLabel} does not preserve the reviewed free-reserve seed`,
    );
  }

  return deepFreeze(reserve);
}

function assertDeepExactDataShape(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      throw new Error(`${label} must be an array`);
    }
    assertExactArray(actual, expected.length, label);
    expected.forEach((item, index) =>
      assertDeepExactDataShape(actual[index], item, `${label}[${index}]`)
    );
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assertExactDataObject(actual, Object.keys(expected), label);
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    for (const key of Object.keys(expectedRecord)) {
      assertDeepExactDataShape(
        actualRecord[key],
        expectedRecord[key],
        `${label}.${key}`,
      );
    }
    return;
  }
  if (actual !== expected) {
    throw new Error(`${label} does not match the reviewed transition`);
  }
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const requiredKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== requiredKeys.length
    || actualKeys.some((key, index) => key !== requiredKeys[index])
  ) {
    throw new Error(`${label} contains unknown, aliased, or missing fields`);
  }
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
  }
}

function assertExactArray(
  value: unknown,
  expectedLength: number,
  label: string,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${label} must contain exactly ${expectedLength} entries`);
  }
  const keys = Object.keys(value);
  if (
    keys.length !== expectedLength
    || keys.some((key, index) => key !== String(index))
  ) {
    throw new Error(`${label} cannot contain sparse or extra fields`);
  }
}

function canonicalHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
  return value;
}

function canonicalVariableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be nonempty canonical lowercase hex`);
  }
  return value;
}

function fixedHexBytes(value: unknown, label: string): Buffer {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 32-byte hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`${label} must be canonical 32-byte lowercase hex`);
  }
  return Buffer.from(clean, 'hex');
}

function nonemptyCanonicalString(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.trim() !== value
  ) {
    throw new Error(`${label} must be a nonempty canonical string`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function positiveSafeInteger(
  value: string | number | bigint,
  label: string,
): number {
  let parsed: bigint;
  try {
    if (
      typeof value === 'number'
      && (!Number.isSafeInteger(value) || value <= 0)
    ) {
      throw new Error();
    }
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be a positive safe integer`);
  }
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(parsed);
}

function canonicalPositiveAmount(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal amount`);
  }
  return BigInt(value);
}

function checkedHeightAdd(
  height: number,
  increment: number,
  label: string,
): number {
  const result = height + increment;
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${label} exceeds the safe integer range`);
  }
  return result;
}

function cloneCanonical(value: unknown): unknown {
  return JSON.parse(canonicalJson(value)) as unknown;
}

function canonicalJson(value: unknown): string {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('canonical observation contains an unsafe number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`canonical observation cannot contain ${typeof value}`);
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
