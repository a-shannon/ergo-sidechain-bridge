import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
} from '../../ergo-settlement-core/ergo-encoding.js';
import type {
  BoxLike,
} from '../../ergo-settlement-core/settlement-transaction.js';
import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  buildTrustlessSingleLeafAggregateUnlockExtension,
} from './authenticated-settlement-plan.js';
import {
  AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY,
  AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLAN_SCHEMA,
  AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS,
  assertAuthenticatedSettlementExternalFeePlanProvenance,
  type AuthenticatedSettlementExternalFeePlan,
} from './authenticated-settlement-external-fee-plan.js';
import {
  decodeCanonicalDlogSigmaPropRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-settlement-policy.js';
import {
  encodeAuthenticatedSpvTrackerAvlRegister,
} from './spv-tracker-authenticated.js';

export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_SCHEMA =
  'e2s.authenticated-settlement-external-fee-packet.v1' as const;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_DIGEST_DOMAIN =
  'e2s.authenticated-settlement-external-fee-packet.v1' as const;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MIN = 1_000_000n;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MAX = 2_100_000n;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MIN_BOX_VALUE = 1_000_000n;

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKETS = new WeakSet<object>();
const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_BOUNDARIES = {
  reviewedContractRegistryBound: false,
  liveInputBoxesRevalidated: false,
  externalFeeSpendabilityEstablished: false,
  contractCompiledAndVmAccepted: false,
  targetNodeAccepted: false,
  replayCutoverEstablished: false,
  legacyRoutesDisabled: false,
  finalityAuthorityReplaced: false,
  signingAuthorized: false,
  submissionAuthorized: false,
  broadcastAuthorized: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
} as const;

export interface AuthenticatedExternalFeeTrackerContractIdentity {
  nftId: string;
  ergoTreeHex: string;
}

export interface AuthenticatedExternalFeeDupContractIdentity {
  nftId: string;
  ergoTreeHex: string;
}

export interface AuthenticatedExternalFeeVaultContractIdentity {
  ergoTreeHex: string;
}

export interface AuthenticatedSettlementExternalFeeContractIdentities {
  spvTrackerAuthenticated: AuthenticatedExternalFeeTrackerContractIdentity;
  doubleUnlockPreventionAuthenticatedExternalFee:
    AuthenticatedExternalFeeDupContractIdentity;
  mainChainAggregateUnlockAuthenticatedExternalFee:
    AuthenticatedExternalFeeVaultContractIdentity;
}

export interface BuildAuthenticatedSettlementExternalFeePacketInput {
  contractIdentities: AuthenticatedSettlementExternalFeeContractIdentities;
  plan: AuthenticatedSettlementExternalFeePlan;
  trackerBox: BoxLike;
  duplicatePreventionBox: BoxLike;
  vaultBox: BoxLike;
  externalFeeBox: BoxLike;
  recipientErgoTreeHex: string;
  creationHeight: number;
  minerFee?: number | string | bigint;
}

export interface AuthenticatedSettlementExternalFeeInput {
  boxId: string;
  extension: Record<string, string>;
}

export interface AuthenticatedSettlementExternalFeeOutput {
  value: string;
  ergoTree: string;
  assets: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
  creationHeight: number;
}

export interface AuthenticatedSettlementExternalFeeUnsignedTx {
  inputs: [
    AuthenticatedSettlementExternalFeeInput,
    AuthenticatedSettlementExternalFeeInput,
    AuthenticatedSettlementExternalFeeInput,
  ];
  dataInputs: [{ boxId: string }];
  outputs: AuthenticatedSettlementExternalFeeOutput[];
}

export interface AuthenticatedSettlementExternalFeeBoxBinding {
  boxId: string;
  valueNanoErg: string;
  ergoTreeHex: string;
  assets: Array<{ tokenId: string; amount: string }>;
  additionalRegisters: Record<string, string>;
  creationHeight: number;
}

export interface AuthenticatedSettlementExternalFeePacket {
  schema: typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_SCHEMA;
  plan: AuthenticatedSettlementExternalFeePlan;
  contractCompatibility:
    typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY;
  proofSemantics: typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS;
  contractIdentities: AuthenticatedSettlementExternalFeeContractIdentities;
  inputBindings: {
    trackerDataInput: AuthenticatedSettlementExternalFeeBoxBinding;
    duplicatePrevention: AuthenticatedSettlementExternalFeeBoxBinding;
    vault: AuthenticatedSettlementExternalFeeBoxBinding;
    externalFee: AuthenticatedSettlementExternalFeeBoxBinding;
  };
  valueBinding: {
    payoutNanoErg: string;
    vaultInputNanoErg: string;
    vaultSuccessorNanoErg: string;
    minerFeeNanoErg: string;
  };
  boundaries: {
    reviewedContractRegistryBound: false;
    liveInputBoxesRevalidated: false;
    externalFeeSpendabilityEstablished: false;
    contractCompiledAndVmAccepted: false;
    targetNodeAccepted: false;
    replayCutoverEstablished: false;
    legacyRoutesDisabled: false;
    finalityAuthorityReplaced: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    trustlessStatusEstablished: false;
    productionReadinessEstablished: false;
  };
  unsignedTx: AuthenticatedSettlementExternalFeeUnsignedTx;
  packetDigestHex: string;
}

export function buildAuthenticatedSettlementExternalFeePacket(
  input: BuildAuthenticatedSettlementExternalFeePacketInput,
): AuthenticatedSettlementExternalFeePacket {
  assertExactKeys(input, [
    'contractIdentities',
    'plan',
    'trackerBox',
    'duplicatePreventionBox',
    'vaultBox',
    'externalFeeBox',
    'recipientErgoTreeHex',
    'creationHeight',
  ], ['minerFee'], 'external-fee settlement packet input');
  if (!input.externalFeeBox) {
    throw new Error('externalFeeBox is required');
  }
  assertExternalFeePlan(input.plan);
  assertAuthenticatedSettlementExternalFeePlanProvenance(input.plan);

  const contractIdentities = normalizeContractIdentities(input.contractIdentities);
  const trackerBinding = bindBox(input.trackerBox, 'trackerBox');
  const dupBinding = bindBox(input.duplicatePreventionBox, 'duplicatePreventionBox');
  const vaultBinding = bindBox(input.vaultBox, 'vaultBox');
  const feeBinding = bindBox(input.externalFeeBox, 'externalFeeBox');
  assertDistinctBoxIds([
    trackerBinding.boxId,
    dupBinding.boxId,
    vaultBinding.boxId,
    feeBinding.boxId,
  ]);

  const creationHeight = positiveSafeInteger(input.creationHeight, 'creationHeight');
  const minerFee = positiveErgoLong(input.minerFee ?? MINER_FEE, 'miner fee');
  if (
    minerFee < AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MIN
    || minerFee > AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MAX
  ) {
    throw new Error(
      `miner fee must be between ${AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MIN}`
      + ` and ${AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MAX} nanoERG`,
    );
  }

  validateTracker(
    input.trackerBox,
    trackerBinding,
    contractIdentities.spvTrackerAuthenticated,
    input.plan,
  );
  const dupState = validateDup(
    input.duplicatePreventionBox,
    dupBinding,
    contractIdentities.doubleUnlockPreventionAuthenticatedExternalFee,
    input.plan,
  );
  validateDistinctAuthorities(input.trackerBox, input.duplicatePreventionBox);
  const vaultRegisters = validateVault(
    input.vaultBox,
    vaultBinding,
    contractIdentities.mainChainAggregateUnlockAuthenticatedExternalFee,
  );
  validateExternalFee(
    feeBinding,
    minerFee,
    contractIdentities,
  );

  const claim = input.plan.claims[0];
  if (!claim) {
    throw new Error('external-fee settlement requires exactly one claim');
  }
  const payout = positiveErgoLong(
    claim.claim.pegOut.amount,
    'external-fee settlement payout',
  );
  const vaultValue = BigInt(vaultBinding.valueNanoErg);
  if (vaultValue < payout) {
    throw new Error(
      `external-fee settlement vault value ${vaultValue} does not cover payout ${payout}`,
    );
  }
  const vaultSuccessor = vaultValue - payout;
  if (
    vaultSuccessor > 0n
    && vaultSuccessor < AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MIN_BOX_VALUE
  ) {
    throw new Error(
      `external-fee settlement vault residual ${vaultSuccessor} is below minimum box value`
    );
  }

  const recipientErgoTreeHex = normalizeFixedHex(
    input.recipientErgoTreeHex,
    36,
    'recipient ErgoTree',
  );
  const dupIdentity =
    contractIdentities.doubleUnlockPreventionAuthenticatedExternalFee;
  const vaultIdentity =
    contractIdentities.mainChainAggregateUnlockAuthenticatedExternalFee;
  const outputs: AuthenticatedSettlementExternalFeeOutput[] = [
    {
      value: dupBinding.valueNanoErg,
      ergoTree: dupIdentity.ergoTreeHex,
      assets: [{ tokenId: dupIdentity.nftId, amount: '1' }],
      additionalRegisters: {
        R4: encodeLongRegister(dupState.counter + 1n),
        R5: encodeAvlTreeRegister(
          Buffer.from(input.plan.dupOutputDigestHex, 'hex'),
          dupState.flags,
          1,
        ),
        R6: dupState.authorityRegister,
      },
      creationHeight,
    },
    {
      value: payout.toString(),
      ergoTree: recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight,
    },
  ];
  if (vaultSuccessor > 0n) {
    outputs.push({
      value: vaultSuccessor.toString(),
      ergoTree: vaultIdentity.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight,
    });
  }
  outputs.push({
    value: minerFee.toString(),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });

  const packetWithoutDigest = {
    schema: AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_SCHEMA,
    plan: structuredClone(input.plan),
    contractCompatibility:
      AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY,
    proofSemantics: AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS,
    contractIdentities,
    inputBindings: {
      trackerDataInput: trackerBinding,
      duplicatePrevention: dupBinding,
      vault: vaultBinding,
      externalFee: feeBinding,
    },
    valueBinding: {
      payoutNanoErg: payout.toString(),
      vaultInputNanoErg: vaultValue.toString(),
      vaultSuccessorNanoErg: vaultSuccessor.toString(),
      minerFeeNanoErg: minerFee.toString(),
    },
    boundaries: { ...AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_BOUNDARIES },
    unsignedTx: {
      inputs: [
        {
          boxId: dupBinding.boxId,
          extension: structuredClone(input.plan.dupV1Extension),
        },
        {
          boxId: vaultBinding.boxId,
          extension: buildTrustlessSingleLeafAggregateUnlockExtension({
            claim,
            recipientErgoTreeHex,
            insertProofHex: input.plan.dupProofs.insert_proof_hex,
          }),
        },
        {
          boxId: feeBinding.boxId,
          extension: {},
        },
      ],
      dataInputs: [{ boxId: trackerBinding.boxId }],
      outputs,
    } satisfies AuthenticatedSettlementExternalFeeUnsignedTx,
  };
  const packet: AuthenticatedSettlementExternalFeePacket = {
    ...packetWithoutDigest,
    packetDigestHex: packetDigest(packetWithoutDigest),
  };
  assertAuthenticatedSettlementExternalFeePacketIntegrity(packet);
  const frozen = deepFreeze(packet);
  AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKETS.add(frozen);
  return frozen;
}

export function assertAuthenticatedSettlementExternalFeePacketProvenance(
  value: unknown,
): asserts value is AuthenticatedSettlementExternalFeePacket {
  if (
    value === null
    || typeof value !== 'object'
    || !AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKETS.has(value)
  ) {
    throw new Error(
      'external-fee settlement packet was not built in this process',
    );
  }
}

/**
 * This candidate family is intentionally not executable. A later activation
 * packet must establish every currently false authority boundary under a
 * separately reviewed type and constructor.
 */
export function assertAuthenticatedSettlementExternalFeePacketForExecution(
  value: unknown,
): never {
  assertAuthenticatedSettlementExternalFeePacketProvenance(value);
  assertAuthenticatedSettlementExternalFeePacketIntegrity(value);
  throw new Error(
    'external-fee settlement packet is non-authorizing: reviewed registry,'
    + ' live inputs, fee spendability, VM/node acceptance, replay cutover,'
    + ' legacy-route disablement, finality, signing, submission, broadcast,'
    + ' and funds authority remain unestablished',
  );
}

/**
 * Reconstructs the packet's deterministic shape for diagnostics and persisted
 * evidence checks. This assertion is not an authority boundary: callers that
 * can reach execution must also require the same-process provenance assertion
 * above.
 */
export function assertAuthenticatedSettlementExternalFeePacketIntegrity(
  packet: AuthenticatedSettlementExternalFeePacket,
): void {
  assertExactKeys(packet, [
    'schema',
    'plan',
    'contractCompatibility',
    'proofSemantics',
    'contractIdentities',
    'inputBindings',
    'valueBinding',
    'boundaries',
    'unsignedTx',
    'packetDigestHex',
  ], [], 'external-fee settlement packet');
  if (packet.schema !== AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_SCHEMA) {
    throw new Error('external-fee settlement packet schema is unsupported');
  }
  assertExternalFeePlan(packet.plan);
  if (
    packet.contractCompatibility
      !== AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY
  ) {
    throw new Error('external-fee settlement packet contract compatibility is unsupported');
  }
  if (packet.proofSemantics !== AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS) {
    throw new Error('external-fee settlement packet proof semantics are unsupported');
  }
  const normalizedContracts = normalizeContractIdentities(packet.contractIdentities);
  assertCanonicalValueEquals(
    packet.contractIdentities,
    normalizedContracts,
    'external-fee settlement packet contract identities are not canonical',
  );

  const { unsignedTx, inputBindings, valueBinding } = packet;
  assertExactKeys(inputBindings, [
    'trackerDataInput',
    'duplicatePrevention',
    'vault',
    'externalFee',
  ], [], 'external-fee settlement packet input bindings');
  assertExactKeys(valueBinding, [
    'payoutNanoErg',
    'vaultInputNanoErg',
    'vaultSuccessorNanoErg',
    'minerFeeNanoErg',
  ], [], 'external-fee settlement packet value binding');
  assertExactKeys(
    packet.boundaries,
    Object.keys(AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_BOUNDARIES),
    [],
    'external-fee settlement packet boundaries',
  );
  assertCanonicalValueEquals(
    packet.boundaries,
    AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_BOUNDARIES,
    'external-fee settlement packet boundaries must remain non-authorizing',
  );
  const canonicalBindings = {
    trackerDataInput: canonicalizeBinding(
      inputBindings.trackerDataInput,
      'trackerDataInput binding',
    ),
    duplicatePrevention: canonicalizeBinding(
      inputBindings.duplicatePrevention,
      'duplicatePrevention binding',
    ),
    vault: canonicalizeBinding(inputBindings.vault, 'vault binding'),
    externalFee: canonicalizeBinding(
      inputBindings.externalFee,
      'externalFee binding',
    ),
  };
  assertCanonicalValueEquals(
    inputBindings,
    canonicalBindings,
    'external-fee settlement packet input bindings are not canonical',
  );
  assertExactKeys(
    unsignedTx,
    ['inputs', 'dataInputs', 'outputs'],
    [],
    'external-fee settlement unsigned transaction',
  );
  if (
    !Array.isArray(unsignedTx.inputs)
    || !Array.isArray(unsignedTx.dataInputs)
    || !Array.isArray(unsignedTx.outputs)
  ) {
    throw new Error('external-fee settlement transaction collections must be arrays');
  }
  if (unsignedTx.inputs.length !== 3) {
    throw new Error('external-fee settlement packet must contain exactly three inputs');
  }
  unsignedTx.inputs.forEach((input, index) => {
    assertExactKeys(
      input,
      ['boxId', 'extension'],
      [],
      `external-fee settlement input ${index}`,
    );
    normalizeFixedHex(input.boxId, 32, `external-fee settlement input ${index} boxId`);
  });
  if (
    unsignedTx.inputs[0].boxId !== inputBindings.duplicatePrevention.boxId
    || unsignedTx.inputs[1].boxId !== inputBindings.vault.boxId
    || unsignedTx.inputs[2].boxId !== inputBindings.externalFee.boxId
  ) {
    throw new Error('external-fee settlement packet input order or binding changed');
  }
  if (
    unsignedTx.dataInputs.length !== 1
    || unsignedTx.dataInputs[0].boxId !== inputBindings.trackerDataInput.boxId
  ) {
    throw new Error('external-fee settlement packet tracker data-input binding changed');
  }
  assertExactKeys(
    unsignedTx.dataInputs[0],
    ['boxId'],
    [],
    'external-fee settlement tracker data input',
  );
  assertDistinctBoxIds([
    inputBindings.trackerDataInput.boxId,
    inputBindings.duplicatePrevention.boxId,
    inputBindings.vault.boxId,
    inputBindings.externalFee.boxId,
  ]);

  const minerFee = positiveErgoLong(valueBinding.minerFeeNanoErg, 'bound miner fee');
  if (valueBinding.minerFeeNanoErg !== minerFee.toString()) {
    throw new Error('external-fee settlement packet miner fee is not canonical');
  }
  if (
    minerFee < AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MIN
    || minerFee > AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MINER_FEE_MAX
  ) {
    throw new Error('external-fee settlement packet miner fee is outside the supported range');
  }
  validateTracker(
    boxFromBinding(canonicalBindings.trackerDataInput),
    canonicalBindings.trackerDataInput,
    normalizedContracts.spvTrackerAuthenticated,
    packet.plan,
  );
  const dupState = validateDup(
    boxFromBinding(canonicalBindings.duplicatePrevention),
    canonicalBindings.duplicatePrevention,
    normalizedContracts.doubleUnlockPreventionAuthenticatedExternalFee,
    packet.plan,
  );
  validateDistinctAuthorities(
    boxFromBinding(canonicalBindings.trackerDataInput),
    boxFromBinding(canonicalBindings.duplicatePrevention),
  );
  const vaultRegisters = validateVault(
    boxFromBinding(canonicalBindings.vault),
    canonicalBindings.vault,
    normalizedContracts.mainChainAggregateUnlockAuthenticatedExternalFee,
  );
  validateExternalFee(
    canonicalBindings.externalFee,
    minerFee,
    normalizedContracts,
  );
  if (BigInt(inputBindings.externalFee.valueNanoErg) !== minerFee) {
    throw new Error('external-fee settlement packet fee input value drifted');
  }
  if (inputBindings.externalFee.assets.length !== 0) {
    throw new Error('external-fee settlement packet fee input acquired tokens');
  }

  const payout = positiveErgoLong(valueBinding.payoutNanoErg, 'bound payout');
  const vaultInput = positiveErgoLong(
    valueBinding.vaultInputNanoErg,
    'bound vault input',
  );
  const vaultSuccessor = nonnegativeErgoLong(
    valueBinding.vaultSuccessorNanoErg,
    'bound vault successor',
  );
  if (
    valueBinding.payoutNanoErg !== payout.toString()
    || valueBinding.vaultInputNanoErg !== vaultInput.toString()
    || valueBinding.vaultSuccessorNanoErg !== vaultSuccessor.toString()
  ) {
    throw new Error('external-fee settlement packet value binding is not canonical');
  }
  const claim = packet.plan.claims[0];
  const claimAmount = positiveErgoLong(
    claim.claim.pegOut.amount,
    'external-fee settlement claim amount',
  );
  if (payout !== claimAmount) {
    throw new Error('external-fee settlement packet payout does not match the claim');
  }
  if (vaultInput !== BigInt(canonicalBindings.vault.valueNanoErg)) {
    throw new Error('external-fee settlement packet vault input binding drifted');
  }
  if (vaultInput - payout !== vaultSuccessor) {
    throw new Error('external-fee settlement packet vault delta is not the payout');
  }
  const expectedOutputCount = vaultSuccessor === 0n ? 3 : 4;
  if (unsignedTx.outputs.length !== expectedOutputCount) {
    throw new Error('external-fee settlement packet vault-successor topology changed');
  }
  const canonicalOutputs = unsignedTx.outputs.map((output, index) =>
    canonicalizeOutput(output, `external-fee settlement output ${index}`));
  const creationHeight = canonicalOutputs[0].creationHeight;
  if (canonicalOutputs.some(output => output.creationHeight !== creationHeight)) {
    throw new Error('external-fee settlement packet output creation heights diverged');
  }
  const recipientErgoTreeHex = canonicalOutputs[1].ergoTree;
  const expectedVaultExtension =
    buildTrustlessSingleLeafAggregateUnlockExtension({
      claim,
      recipientErgoTreeHex,
      insertProofHex: packet.plan.dupProofs.insert_proof_hex,
    });
  assertHexRecordEquals(
    unsignedTx.inputs[0].extension,
    packet.plan.dupV1Extension,
    'external-fee settlement DUP input extension changed',
  );
  assertHexRecordEquals(
    unsignedTx.inputs[1].extension,
    expectedVaultExtension,
    'external-fee settlement vault input extension changed',
  );
  assertHexRecordEquals(
    unsignedTx.inputs[2].extension,
    {},
    'external-fee settlement fee input extension changed',
  );

  const dupIdentity =
    normalizedContracts.doubleUnlockPreventionAuthenticatedExternalFee;
  const expectedOutputs: AuthenticatedSettlementExternalFeeOutput[] = [
    {
      value: canonicalBindings.duplicatePrevention.valueNanoErg,
      ergoTree: dupIdentity.ergoTreeHex,
      assets: [{ tokenId: dupIdentity.nftId, amount: '1' }],
      additionalRegisters: {
        R4: encodeLongRegister(dupState.counter + 1n),
        R5: encodeAvlTreeRegister(
          Buffer.from(packet.plan.dupOutputDigestHex, 'hex'),
          dupState.flags,
          1,
        ),
        R6: dupState.authorityRegister,
      },
      creationHeight,
    },
    {
      value: payout.toString(),
      ergoTree: recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight,
    },
  ];
  if (vaultSuccessor > 0n) {
    expectedOutputs.push({
      value: vaultSuccessor.toString(),
      ergoTree:
        normalizedContracts
          .mainChainAggregateUnlockAuthenticatedExternalFee.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight,
    });
  }
  expectedOutputs.push({
    value: minerFee.toString(),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
  assertCanonicalValueEquals(
    canonicalOutputs,
    expectedOutputs,
    'external-fee settlement packet deterministic outputs changed',
  );
  if (
    vaultSuccessor > 0n
    && (
      vaultSuccessor < AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_MIN_BOX_VALUE
      || BigInt(canonicalOutputs[2].value) !== vaultSuccessor
      || canonicalOutputs[2].ergoTree
        !== normalizedContracts.mainChainAggregateUnlockAuthenticatedExternalFee.ergoTreeHex
    )
  ) {
    throw new Error('external-fee settlement packet vault successor changed');
  }

  const inputTotal =
    BigInt(inputBindings.duplicatePrevention.valueNanoErg)
    + vaultInput
    + minerFee;
  const outputTotal = canonicalOutputs.reduce(
    (sum, output) => sum + BigInt(output.value),
    0n,
  );
  if (inputTotal !== outputTotal) {
    throw new Error('external-fee settlement packet does not conserve ERG');
  }

  const { packetDigestHex: _digest, ...withoutDigest } = packet;
  if (normalizeFixedHex(packet.packetDigestHex, 32, 'packet digest')
      !== packetDigest(withoutDigest)) {
    throw new Error('external-fee settlement packet digest does not match');
  }
}

function assertExternalFeePlan(
  plan: AuthenticatedSettlementExternalFeePlan,
): void {
  if (!plan || plan.schema !== AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLAN_SCHEMA) {
    throw new Error('external-fee settlement requires a versioned external-fee plan');
  }
  if (
    plan.contractCompatibility
      !== AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY
  ) {
    throw new Error(
      'external-fee settlement requires authenticated-external-fee-v1 compatibility',
    );
  }
  if (plan.proofSemantics !== AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS) {
    throw new Error('external-fee settlement requires frozen authenticated-V2 proof semantics');
  }
  assertExactKeys(plan, [
    'schema',
    'trackerInputDigestHex',
    'trackerOutputDigestHex',
    'trackerIngests',
    'claims',
    'dupProofs',
    'dupInputDigestHex',
    'dupOutputDigestHex',
    'dupV1Extension',
    'requiresBatchedDupContract',
    'contractCompatibility',
    'proofSemantics',
    'warnings',
  ], [], 'external-fee settlement plan');
  if (
    !Array.isArray(plan.claims)
    || !Array.isArray(plan.trackerIngests)
    || !Array.isArray(plan.warnings)
  ) {
    throw new Error('external-fee settlement plan collections must be arrays');
  }
  if (
    plan.claims.length !== 1
    || plan.trackerIngests.length !== 0
    || plan.warnings.length !== 0
    || plan.requiresBatchedDupContract !== false
    || plan.trackerInputDigestHex !== plan.trackerOutputDigestHex
  ) {
    throw new Error('external-fee settlement requires one read-only tracker claim');
  }
  normalizeFixedHex(plan.trackerInputDigestHex, 33, 'external-fee tracker input digest');
  normalizeFixedHex(plan.dupInputDigestHex, 33, 'external-fee DUP input digest');
  normalizeFixedHex(plan.dupOutputDigestHex, 33, 'external-fee DUP output digest');
  assertExactKeys(plan.dupProofs, [
    'lookup_proofs_hex',
    'insert_proof_hex',
    'new_digest_hex',
  ], [], 'external-fee settlement DUP proofs');
  if (
    !Array.isArray(plan.dupProofs.lookup_proofs_hex)
    || plan.dupProofs.lookup_proofs_hex.length !== 1
  ) {
    throw new Error('external-fee settlement requires one DUP lookup proof');
  }
  const claim = plan.claims[0];
  const lookupProofHex = normalizeNonemptyHex(
    plan.dupProofs.lookup_proofs_hex[0],
    'external-fee DUP lookup proof',
  );
  const insertProofHex = normalizeNonemptyHex(
    plan.dupProofs.insert_proof_hex,
    'external-fee DUP insert proof',
  );
  if (
    normalizeFixedHex(
      plan.dupProofs.new_digest_hex,
      33,
      'external-fee DUP proof successor digest',
    ) !== plan.dupOutputDigestHex
    || lookupProofHex !== claim.dupLookupProofHex
  ) {
    throw new Error('external-fee settlement DUP proof bindings changed');
  }
  assertHexRecordEquals(
    plan.dupV1Extension,
    {
      '0': encodeCollByteRegister(Buffer.from(lookupProofHex, 'hex')),
      '1': encodeCollByteRegister(
        Buffer.from(
          normalizeFixedHex(
            claim.duplicatePreventionKeyHex,
            32,
            'external-fee duplicate-prevention key',
          ),
          'hex',
        ),
      ),
      '2': encodeCollByteRegister(Buffer.from(insertProofHex, 'hex')),
    },
    'external-fee settlement DUP extension does not match its proofs',
  );
}

function validateTracker(
  box: BoxLike,
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  identity: AuthenticatedExternalFeeTrackerContractIdentity,
  plan: AuthenticatedSettlementExternalFeePlan,
): void {
  if (binding.ergoTreeHex !== identity.ergoTreeHex) {
    throw new Error('external-fee tracker box ErgoTree does not match contract identity');
  }
  assertSingletonToken(binding, identity.nftId, 'external-fee tracker box');
  const expectedRegister = encodeAuthenticatedSpvTrackerAvlRegister(
    plan.trackerInputDigestHex,
  );
  if (requiredRegister(box, 'R5', 'external-fee tracker box') !== expectedRegister) {
    throw new Error('external-fee tracker box R5 does not match the plan input digest');
  }
  const sidechainId = decodeCollByteRegister(
    requiredRegister(box, 'R6', 'external-fee tracker box'),
    'external-fee tracker box R6',
  );
  if (sidechainId !== plan.claims[0].claim.trackerIdentity.sidechainIdHex.toLowerCase()) {
    throw new Error('external-fee tracker box R6 does not match the claim sidechain ID');
  }
}

function validateDup(
  box: BoxLike,
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  identity: AuthenticatedExternalFeeDupContractIdentity,
  plan: AuthenticatedSettlementExternalFeePlan,
): { counter: bigint; flags: number; authorityRegister: string } {
  if (binding.ergoTreeHex !== identity.ergoTreeHex) {
    throw new Error('external-fee DUP box ErgoTree does not match contract identity');
  }
  assertSingletonToken(binding, identity.nftId, 'external-fee DUP box');
  const register = decodeCanonicalDupAvlRegister(
    requiredRegister(box, 'R5', 'external-fee DUP box'),
    'external-fee DUP box R5',
  );
  if (register.digestHex !== plan.dupInputDigestHex) {
    throw new Error('external-fee DUP box R5 does not match the plan input digest');
  }
  const counter = decodeCanonicalLongRegister(
    requiredRegister(box, 'R4', 'external-fee DUP box'),
    'external-fee DUP box R4',
  );
  if (counter < 0n || counter >= ERGO_POSITIVE_LONG_MAX) {
    throw new Error('external-fee DUP counter cannot be incremented');
  }
  return {
    counter,
    flags: register.flags,
    authorityRegister: requiredRegister(box, 'R6', 'external-fee DUP box'),
  };
}

function validateDistinctAuthorities(trackerBox: BoxLike, dupBox: BoxLike): void {
  const trackerAuthority = decodeCanonicalDlogSigmaPropRegister(
    requiredRegister(trackerBox, 'R9', 'external-fee tracker box'),
    'external-fee tracker box R9',
  );
  const dupAuthority = decodeCanonicalDlogSigmaPropRegister(
    requiredRegister(dupBox, 'R6', 'external-fee DUP box'),
    'external-fee DUP box R6',
  );
  if (trackerAuthority === dupAuthority) {
    throw new Error(
      'external-fee settlement requires distinct tracker and DUP authority propositions',
    );
  }
}

function validateVault(
  box: BoxLike,
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  identity: AuthenticatedExternalFeeVaultContractIdentity,
): Record<string, string> {
  if (binding.ergoTreeHex !== identity.ergoTreeHex) {
    throw new Error('external-fee vault ErgoTree does not match contract identity');
  }
  if (binding.assets.length !== 0) {
    throw new Error('external-fee vault must be pure ERG');
  }
  return {
    R4: requiredRegister(box, 'R4', 'external-fee vault'),
    R5: requiredRegister(box, 'R5', 'external-fee vault'),
    R6: requiredRegister(box, 'R6', 'external-fee vault'),
    R7: requiredRegister(box, 'R7', 'external-fee vault'),
  };
}

function validateExternalFee(
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  minerFee: bigint,
  identities: AuthenticatedSettlementExternalFeeContractIdentities,
): void {
  if (binding.assets.length !== 0) {
    throw new Error('externalFeeBox must be pure ERG with no tokens');
  }
  if (BigInt(binding.valueNanoErg) !== minerFee) {
    throw new Error(`externalFeeBox value must equal the selected miner fee ${minerFee}`);
  }
  const protectedTrees = new Set([
    identities.spvTrackerAuthenticated.ergoTreeHex,
    identities.doubleUnlockPreventionAuthenticatedExternalFee.ergoTreeHex,
    identities.mainChainAggregateUnlockAuthenticatedExternalFee.ergoTreeHex,
  ]);
  if (protectedTrees.has(binding.ergoTreeHex)) {
    throw new Error('externalFeeBox must not use a protected bridge contract ErgoTree');
  }
}

function normalizeContractIdentities(
  identities: AuthenticatedSettlementExternalFeeContractIdentities,
): AuthenticatedSettlementExternalFeeContractIdentities {
  if (
    !identities?.spvTrackerAuthenticated
    || !identities.doubleUnlockPreventionAuthenticatedExternalFee
    || !identities.mainChainAggregateUnlockAuthenticatedExternalFee
  ) {
    throw new Error('all external-fee settlement contract identities are required');
  }
  assertExactKeys(identities, [
    'spvTrackerAuthenticated',
    'doubleUnlockPreventionAuthenticatedExternalFee',
    'mainChainAggregateUnlockAuthenticatedExternalFee',
  ], [], 'external-fee settlement contract identities');
  assertExactKeys(
    identities.spvTrackerAuthenticated,
    ['nftId', 'ergoTreeHex'],
    [],
    'external-fee tracker contract identity',
  );
  assertExactKeys(
    identities.doubleUnlockPreventionAuthenticatedExternalFee,
    ['nftId', 'ergoTreeHex'],
    [],
    'external-fee DUP contract identity',
  );
  assertExactKeys(
    identities.mainChainAggregateUnlockAuthenticatedExternalFee,
    ['ergoTreeHex'],
    [],
    'external-fee vault contract identity',
  );
  const normalized = {
    spvTrackerAuthenticated: {
      nftId: normalizeFixedHex(
        identities.spvTrackerAuthenticated.nftId,
        32,
        'tracker contract NFT ID',
      ),
      ergoTreeHex: normalizeNonemptyHex(
        identities.spvTrackerAuthenticated.ergoTreeHex,
        'tracker contract ErgoTree',
      ),
    },
    doubleUnlockPreventionAuthenticatedExternalFee: {
      nftId: normalizeFixedHex(
        identities.doubleUnlockPreventionAuthenticatedExternalFee.nftId,
        32,
        'external-fee DUP contract NFT ID',
      ),
      ergoTreeHex: normalizeNonemptyHex(
        identities.doubleUnlockPreventionAuthenticatedExternalFee.ergoTreeHex,
        'external-fee DUP contract ErgoTree',
      ),
    },
    mainChainAggregateUnlockAuthenticatedExternalFee: {
      ergoTreeHex: normalizeNonemptyHex(
        identities.mainChainAggregateUnlockAuthenticatedExternalFee.ergoTreeHex,
        'external-fee vault contract ErgoTree',
      ),
    },
  };
  const nftIds = [
    normalized.spvTrackerAuthenticated.nftId,
    normalized.doubleUnlockPreventionAuthenticatedExternalFee.nftId,
  ];
  if (
    nftIds.some(nftId => /^0+$/.test(nftId))
    || new Set(nftIds).size !== nftIds.length
  ) {
    throw new Error(
      'external-fee settlement tracker and DUP NFT identities must be distinct and nonzero',
    );
  }
  const contractTrees = [
    normalized.spvTrackerAuthenticated.ergoTreeHex,
    normalized.doubleUnlockPreventionAuthenticatedExternalFee.ergoTreeHex,
    normalized.mainChainAggregateUnlockAuthenticatedExternalFee.ergoTreeHex,
  ];
  if (new Set(contractTrees).size !== contractTrees.length) {
    throw new Error('external-fee settlement contract ErgoTrees must be distinct');
  }
  if (contractTrees.includes(MINER_FEE_TREE)) {
    throw new Error(
      'external-fee settlement contract ErgoTrees must not equal the miner-fee tree',
    );
  }
  return normalized;
}

function bindBox(
  box: BoxLike,
  label: string,
): AuthenticatedSettlementExternalFeeBoxBinding {
  if (!box) throw new Error(`${label} is required`);
  const registerRecord = requireRecord(
    box.additionalRegisters ?? {},
    `${label} additionalRegisters`,
  );
  if (!Array.isArray(box.assets ?? [])) {
    throw new Error(`${label} assets must be an array`);
  }
  const additionalRegisters = Object.fromEntries(
    Object.entries(registerRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        normalizeNonemptyHex(value as string, `${label} ${key}`),
      ]),
  );
  return {
    boxId: normalizeFixedHex(box.boxId, 32, `${label} boxId`),
    valueNanoErg: positiveErgoLong(box.value, `${label} value`).toString(),
    ergoTreeHex: normalizeNonemptyHex(box.ergoTree, `${label} ErgoTree`),
    assets: (box.assets ?? []).map((asset, index) => {
      assertExactKeys(
        asset,
        ['tokenId', 'amount'],
        [],
        `${label} assets[${index}]`,
      );
      return {
        tokenId: normalizeFixedHex(
          asset.tokenId,
          32,
          `${label} assets[${index}] token ID`,
        ),
        amount: positiveErgoLong(
          asset.amount,
          `${label} assets[${index}] amount`,
        ).toString(),
      };
    }),
    additionalRegisters,
    creationHeight: positiveSafeInteger(box.creationHeight, `${label} creationHeight`),
  };
}

function canonicalizeBinding(
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  label: string,
): AuthenticatedSettlementExternalFeeBoxBinding {
  assertExactKeys(binding, [
    'boxId',
    'valueNanoErg',
    'ergoTreeHex',
    'assets',
    'additionalRegisters',
    'creationHeight',
  ], [], label);
  return bindBox(boxFromBinding(binding), label);
}

function canonicalizeOutput(
  output: AuthenticatedSettlementExternalFeeOutput,
  label: string,
): AuthenticatedSettlementExternalFeeOutput {
  assertExactKeys(output, [
    'value',
    'ergoTree',
    'assets',
    'additionalRegisters',
    'creationHeight',
  ], [], label);
  if (!Array.isArray(output.assets)) {
    throw new Error(`${label} assets must be an array`);
  }
  const assets = output.assets.map((asset, index) => {
    assertExactKeys(asset, ['tokenId', 'amount'], [], `${label} assets[${index}]`);
    return {
      tokenId: normalizeFixedHex(
        asset.tokenId,
        32,
        `${label} assets[${index}] token ID`,
      ),
      amount: positiveErgoLong(
        asset.amount,
        `${label} assets[${index}] amount`,
      ).toString(),
    };
  });
  return {
    value: positiveErgoLong(output.value, `${label} value`).toString(),
    ergoTree: normalizeNonemptyHex(output.ergoTree, `${label} ErgoTree`),
    assets,
    additionalRegisters: canonicalizeHexRecord(
      output.additionalRegisters,
      `${label} additionalRegisters`,
    ),
    creationHeight: positiveSafeInteger(
      output.creationHeight,
      `${label} creationHeight`,
    ),
  };
}

function boxFromBinding(
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
): BoxLike {
  return {
    boxId: binding.boxId,
    value: binding.valueNanoErg,
    ergoTree: binding.ergoTreeHex,
    assets: binding.assets,
    additionalRegisters: binding.additionalRegisters,
    creationHeight: binding.creationHeight,
  };
}

function assertSingletonToken(
  binding: AuthenticatedSettlementExternalFeeBoxBinding,
  expectedTokenId: string,
  label: string,
): void {
  if (
    binding.assets.length !== 1
    || binding.assets[0].tokenId !== expectedTokenId
    || binding.assets[0].amount !== '1'
  ) {
    throw new Error(`${label} must contain exactly the configured singleton token`);
  }
}

function decodeCanonicalDupAvlRegister(
  registerHex: string,
  label: string,
): { digestHex: string; flags: number } {
  const clean = normalizeNonemptyHex(registerHex, label);
  if (
    clean.length !== 76
    || clean.slice(0, 2) !== '64'
    || clean.slice(70, 72) !== '20'
    || clean.slice(72) !== '0101'
  ) {
    throw new Error(`${label} must be a canonical AvlTree register`);
  }
  const flags = Number.parseInt(clean.slice(68, 70), 16);
  if ((flags & 0x01) === 0) {
    throw new Error(`${label} must permit append-only inserts`);
  }
  return { digestHex: clean.slice(2, 68), flags };
}

function requiredRegister(box: BoxLike, name: string, label: string): string {
  const value = box.additionalRegisters?.[name];
  if (!value) throw new Error(`${label} missing ${name}`);
  return normalizeNonemptyHex(value, `${label} ${name}`);
}

function assertDistinctBoxIds(boxIds: string[]): void {
  if (new Set(boxIds).size !== boxIds.length) {
    throw new Error('tracker, DUP, vault and external fee boxes must be distinct');
  }
}

function canonicalizeHexRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = requireRecord(value, label);
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [
        key,
        normalizeNonemptyHex(nested as string, `${label} ${key}`),
      ]),
  );
}

function assertHexRecordEquals(
  actual: unknown,
  expected: Record<string, string>,
  message: string,
): void {
  const actualRecord = requireRecord(actual, message);
  assertExactKeys(actualRecord, Object.keys(expected), [], message);
  const canonicalActual = canonicalizeHexRecord(actualRecord, message);
  const canonicalExpected = canonicalizeHexRecord(expected, message);
  assertCanonicalValueEquals(canonicalActual, canonicalExpected, message);
}

function assertCanonicalValueEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(jsonSafe(actual)) !== JSON.stringify(jsonSafe(expected))) {
    throw new Error(message);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: unknown,
  required: string[],
  optional: string[],
  label: string,
): void {
  const record = requireRecord(value, label);
  const actual = Object.keys(record).sort();
  const requiredSet = new Set(required);
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter(key => !Object.hasOwn(record, key));
  const unexpected = actual.filter(key => !allowed.has(key));
  if (
    requiredSet.size !== required.length
    || missing.length !== 0
    || unexpected.length !== 0
  ) {
    throw new Error(
      `${label} must contain required keys ${[...required].sort().join(', ')}`
      + (
        optional.length > 0
          ? ` and only optional keys ${[...optional].sort().join(', ')}`
          : ' and no additional keys'
      ),
    );
  }
}

function normalizeFixedHex(value: string, bytes: number, label: string): string {
  const clean = normalizeNonemptyHex(value, label);
  if (clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes`);
  }
  return clean;
}

function normalizeNonemptyHex(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be nonempty even-length hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be nonempty even-length hex`);
  }
  return clean.toLowerCase();
}

function positiveErgoLong(
  value: number | string | bigint,
  label: string,
): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be supplied as an exact integer`);
  }
  if (typeof value === 'string' && !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer`);
  }
  const amount = BigInt(value);
  if (amount <= 0n || amount > ERGO_POSITIVE_LONG_MAX) {
    throw new Error(`${label} must fit a positive Ergo Long`);
  }
  return amount;
}

function nonnegativeErgoLong(value: string, label: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer`);
  }
  const amount = BigInt(value);
  if (amount > ERGO_POSITIVE_LONG_MAX) {
    throw new Error(`${label} must fit a nonnegative Ergo Long`);
  }
  return amount;
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function packetDigest(value: unknown): string {
  return sha256CanonicalJson(
    jsonSafe(value),
    AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PACKET_DIGEST_DOMAIN,
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { 'e2s:bigint': value.toString() };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, jsonSafe(nested)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
