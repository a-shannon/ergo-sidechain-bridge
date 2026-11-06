import {
  assertSubstrateFederatedPooledReserveDepositInputShape,
  buildSubstrateFederatedPooledReserveDepositCandidate,
  type BuildSubstrateFederatedPooledReserveDepositV1Input,
  type SubstrateFederatedPooledReserveDepositV1Packet,
} from './substrate-federated-pooled-reserve-deposit-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3,
} from './substrate-federated-settlement-family-jvm-compiler-v3.js';

export const SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V3_SCHEMA =
  'e2s.substrate-federated-pooled-reserve-deposit.v3' as const;
const packets = new WeakSet<object>();

export interface BuildSubstrateFederatedPooledReserveDepositV3Input
  extends Omit<BuildSubstrateFederatedPooledReserveDepositV1Input, 'familyBinding'> {
  readonly familyCompilerInput: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV3Input>;
  readonly familyCompilerReceipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3>;
}

export interface SubstrateFederatedPooledReserveDepositV3Packet
  extends Omit<SubstrateFederatedPooledReserveDepositV1Packet, 'schema' | 'version' | 'familyCompiler'> {
  readonly schema: typeof SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V3_SCHEMA;
  readonly version: 3;
  readonly familyCompiler: Readonly<{
    readonly trackerAnchorSelector: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3['trackerAnchorSelector'];
    readonly settlementLayout: SubstrateFederatedSettlementFamilyJvmCompilerReceiptV3['settlementLayout'];
    readonly trackerRequestDigestHex: string;
    readonly trackerReceiptDigestHex: string;
    readonly familyRequestDigestHex: string;
    readonly familyReceiptDigestHex: string;
    readonly compilerLockDigestHex: string;
  }>;
}

/** Complete unsigned deposit; canonical state, mint and transport remain separate. */
export async function buildSubstrateFederatedPooledReserveDepositV3(
  input: Readonly<BuildSubstrateFederatedPooledReserveDepositV3Input>,
): Promise<Readonly<SubstrateFederatedPooledReserveDepositV3Packet>> {
  assertSubstrateFederatedPooledReserveDepositInputShape(input, [
    'familyCompilerInput', 'familyCompilerReceipt',
  ]);
  const family = assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV3(
    input.familyCompilerReceipt, input.familyCompilerInput,
  );
  const candidate = await buildSubstrateFederatedPooledReserveDepositCandidate({
    sourceFundingInput: input.sourceFundingInput,
    reserveState: input.reserveState,
    sourceIntent: input.sourceIntent,
    depositorErgoTreeHex: input.depositorErgoTreeHex,
    creationHeights: input.creationHeights,
    fees: input.fees,
  }, family);
  const packet = Object.freeze({
    schema: SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V3_SCHEMA,
    version: 3 as const,
    ...candidate,
    familyCompiler: Object.freeze({
      trackerAnchorSelector: family.trackerAnchorSelector,
      settlementLayout: family.settlementLayout,
      trackerRequestDigestHex: family.trackerCompilerRequestDigestHex,
      trackerReceiptDigestHex: family.trackerCompilerReceiptDigestHex,
      familyRequestDigestHex: family.familyCompilerRequestDigestHex,
      familyReceiptDigestHex: family.receiptDigestHex,
      compilerLockDigestHex: family.compilerLockDigestHex,
    }),
    invariants: Object.freeze({ ...candidate.invariants, exactFederatedFamilyBound: true as const }),
  });
  packets.add(packet);
  return packet;
}

export function assertSubstrateFederatedPooledReserveDepositV3Packet(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedPooledReserveDepositV3Packet> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error('federated V3 deposit packet lacks process provenance');
  }
}
