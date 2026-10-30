/** Synthetic construction only; compiler provenance is not canonical state authority. */
import {
  assertSubstrateFederatedBurnSettlementInputShape,
  buildSubstrateFederatedBurnSettlementCandidate,
  type BuildSubstrateFederatedBurnSettlementV1Input,
  type SubstrateFederatedBurnSettlementV1Packet,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
} from './substrate-federated-settlement-family-jvm-compiler-v2.js';

export const SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V2_SCHEMA =
  'e2s.substrate-federated-burn-settlement.v2' as const;
const packets = new WeakSet<object>();

export interface BuildSubstrateFederatedBurnSettlementV2Input
  extends Omit<BuildSubstrateFederatedBurnSettlementV1Input, 'familyIdentity'> {
  readonly familyCompilerInput: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input>;
  readonly familyCompilerReceipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2>;
}

export interface SubstrateFederatedBurnSettlementV2Packet
  extends Omit<SubstrateFederatedBurnSettlementV1Packet, 'schema' | 'version'> {
  readonly schema: typeof SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V2_SCHEMA;
  readonly version: 2;
  readonly trackerCompilerRequestDigestHex: string;
  readonly trackerCompilerReceiptDigestHex: string;
  readonly familyCompilerRequestDigestHex: string;
  readonly familyCompilerReceiptDigestHex: string;
  readonly compilerLockDigestHex: string;
}

export async function buildSubstrateFederatedBurnSettlementV2(
  input: BuildSubstrateFederatedBurnSettlementV2Input,
): Promise<Readonly<SubstrateFederatedBurnSettlementV2Packet>> {
  assertSubstrateFederatedBurnSettlementInputShape(input, [
    'familyCompilerInput', 'familyCompilerReceipt',
  ]);
  const { familyCompilerInput, familyCompilerReceipt } = input;
  // This assertion also authenticates the exact V2 tracker request/receipt and
  // re-derives all dependent family sources. Copies and V1 receipts cannot pass.
  const family = assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(
    familyCompilerReceipt, familyCompilerInput,
  );
  const candidate = await buildSubstrateFederatedBurnSettlementCandidate({
    trackerState: input.trackerState,
    reserveState: input.reserveState,
    duplicatePreventionState: input.duplicatePreventionState,
    feeFundingInput: input.feeFundingInput,
    claim: input.claim,
    currentErgoHeight: input.currentErgoHeight,
    creationHeight: input.creationHeight,
    feeNanoErg: input.feeNanoErg,
  }, {
    profile: family.profile,
    pooledReserveTreeHex: family.contracts.pooledReserve.propositionHex,
    duplicatePreventionTreeHex: family.contracts.duplicatePrevention.propositionHex,
  });
  const packet = Object.freeze({
    schema: SUBSTRATE_FEDERATED_BURN_SETTLEMENT_V2_SCHEMA,
    version: 2 as const,
    trackerCompilerRequestDigestHex: family.trackerCompilerRequestDigestHex,
    trackerCompilerReceiptDigestHex: family.trackerCompilerReceiptDigestHex,
    familyCompilerRequestDigestHex: family.familyCompilerRequestDigestHex,
    familyCompilerReceiptDigestHex: family.receiptDigestHex,
    compilerLockDigestHex: family.compilerLockDigestHex,
    ...candidate,
    invariants: Object.freeze({
      ...candidate.invariants, federatedAuthorityProfileBound: true as const,
    }),
  });
  packets.add(packet);
  return packet;
}

export function assertSubstrateFederatedBurnSettlementV2Packet(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedBurnSettlementV2Packet> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error('federated V2 burn-settlement packet lacks process provenance');
  }
}
