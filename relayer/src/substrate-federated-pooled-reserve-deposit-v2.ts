import {
  assertSubstrateFederatedPooledReserveDepositInputShape,
  buildSubstrateFederatedPooledReserveDepositCandidate,
  type BuildSubstrateFederatedPooledReserveDepositV1Input,
  type SubstrateFederatedPooledReserveDepositV1Packet,
} from './substrate-federated-pooled-reserve-deposit-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2,
} from './substrate-federated-settlement-family-jvm-compiler-v2.js';

export const SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V2_SCHEMA =
  'e2s.substrate-federated-pooled-reserve-deposit.v2' as const;
const packets = new WeakSet<object>();

export interface BuildSubstrateFederatedPooledReserveDepositV2Input
  extends Omit<BuildSubstrateFederatedPooledReserveDepositV1Input, 'familyBinding'> {
  readonly familyCompilerInput: Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV2Input>;
  readonly familyCompilerReceipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV2>;
}

export interface SubstrateFederatedPooledReserveDepositV2Packet
  extends Omit<SubstrateFederatedPooledReserveDepositV1Packet, 'schema' | 'version' | 'familyCompiler'> {
  readonly schema: typeof SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V2_SCHEMA;
  readonly version: 2;
  readonly familyCompiler: Readonly<{
    readonly trackerRequestDigestHex: string;
    readonly trackerReceiptDigestHex: string;
    readonly familyRequestDigestHex: string;
    readonly familyReceiptDigestHex: string;
    readonly compilerLockDigestHex: string;
  }>;
}

/** Complete unsigned deposit; canonical state, mint and transport remain separate. */
export async function buildSubstrateFederatedPooledReserveDepositV2(
  input: Readonly<BuildSubstrateFederatedPooledReserveDepositV2Input>,
): Promise<Readonly<SubstrateFederatedPooledReserveDepositV2Packet>> {
  assertSubstrateFederatedPooledReserveDepositInputShape(input, [
    'familyCompilerInput', 'familyCompilerReceipt',
  ]);
  const family = assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV2(
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
    schema: SUBSTRATE_FEDERATED_POOLED_RESERVE_DEPOSIT_V2_SCHEMA,
    version: 2 as const,
    ...candidate,
    familyCompiler: Object.freeze({
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

export function assertSubstrateFederatedPooledReserveDepositV2Packet(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedPooledReserveDepositV2Packet> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error('federated V2 deposit packet lacks process provenance');
  }
}
