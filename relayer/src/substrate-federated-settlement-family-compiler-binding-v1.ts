import { sha256CanonicalJson } from './strict-json.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyV1Identity,
  type SubstrateFederatedSettlementFamilyV1Identity,
  type SubstrateFederatedSettlementFamilyV1Profile,
} from './substrate-federated-settlement-family-v1.js';

export const SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_COMPILER_BINDING_V1_SCHEMA =
  'e2s.substrate-federated-settlement-family-compiler-binding.v1' as const;

const BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_COMPILER_BINDING_V1';
const CONTRACT_ROLES = [
  'duplicatePrevention',
  'sourceLock',
  'pooledReserve',
] as const;
const bindings = new WeakSet<object>();

type ContractRole = typeof CONTRACT_ROLES[number];

export interface SubstrateFederatedSettlementFamilyCompilerContractV1 {
  readonly resolvedSourceSha256Hex: string;
  readonly propositionHex: string;
  readonly contractIdHex: string;
}

export interface SubstrateFederatedSettlementFamilyCompilerBindingV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_COMPILER_BINDING_V1_SCHEMA;
  readonly version: 1;
  readonly bindingDigestHex: string;
  readonly provenance: Readonly<{
    readonly kind: 'validated-frozen-batch' | 'same-process-pinned-jvm';
    readonly digestHex: string;
  }>;
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  readonly contracts: Readonly<Record<
    ContractRole,
    Readonly<SubstrateFederatedSettlementFamilyCompilerContractV1>
  >>;
  readonly checks: Readonly<{
    readonly sameProcessCompilerProvenanceVerified: true;
    readonly exactProfileBound: true;
    readonly exactContractSetBound: true;
  }>;
  readonly boundaries: Readonly<{
    readonly targetNodeAcceptanceEstablished: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export function bindSubstrateFederatedSettlementFamilyCompilerIdentityV1(
  identity: Readonly<SubstrateFederatedSettlementFamilyV1Identity>,
): Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1> {
  assertSubstrateFederatedSettlementFamilyV1Identity(identity);
  return createBinding({
    provenance: {
      kind: 'validated-frozen-batch',
      digestHex: identity.compilerBatchSha256Hex,
    },
    profile: identity.profile,
    contracts: {
      duplicatePrevention:
        identity.contracts.duplicatePrevention.receipt,
      sourceLock: identity.contracts.sourceLock.receipt,
      pooledReserve: identity.contracts.pooledReserve.receipt,
    },
  });
}

export function bindSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
  input: Readonly<{
    readonly receipt:
      Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
    readonly expectedInput:
      Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input>;
  }>,
): Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1> {
  assertExactKeys(input, [
    'receipt',
    'expectedInput',
  ], 'federated settlement-family JVM compiler binding input');
  const receipt = assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
    input.receipt,
    input.expectedInput,
  );
  return createBinding({
    provenance: {
      kind: 'same-process-pinned-jvm',
      digestHex: receipt.receiptDigestHex,
    },
    profile: receipt.profile,
    contracts: receipt.contracts,
  });
}

export function assertSubstrateFederatedSettlementFamilyCompilerBindingV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedSettlementFamilyCompilerBindingV1
> {
  if (value === null || typeof value !== 'object' || !bindings.has(value)) {
    throw new Error(
      'federated settlement-family compiler binding lacks same-process provenance',
    );
  }
}

function createBinding(input: Readonly<{
  readonly provenance:
    SubstrateFederatedSettlementFamilyCompilerBindingV1['provenance'];
  readonly profile: Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  readonly contracts: Readonly<Record<
    ContractRole,
    Readonly<SubstrateFederatedSettlementFamilyCompilerContractV1>
  >>;
}>): Readonly<SubstrateFederatedSettlementFamilyCompilerBindingV1> {
  const contracts = Object.fromEntries(CONTRACT_ROLES.map(role => {
    const contract = input.contracts[role];
    return [role, {
      resolvedSourceSha256Hex: fixedHex(
        contract.resolvedSourceSha256Hex,
        32,
        `${role} resolved source SHA-256`,
      ),
      propositionHex: variableHex(
        contract.propositionHex,
        `${role} proposition`,
      ),
      contractIdHex: fixedHex(
        contract.contractIdHex,
        32,
        `${role} contract ID`,
      ),
    }];
  })) as Record<ContractRole, Readonly<
    SubstrateFederatedSettlementFamilyCompilerContractV1
  >>;
  const body = deepFreeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_COMPILER_BINDING_V1_SCHEMA,
    version: 1 as const,
    provenance: {
      kind: input.provenance.kind,
      digestHex: fixedHex(
        input.provenance.digestHex,
        32,
        'federated settlement-family compiler provenance digest',
      ),
    },
    profile: structuredClone(input.profile),
    contracts,
    checks: {
      sameProcessCompilerProvenanceVerified: true as const,
      exactProfileBound: true as const,
      exactContractSetBound: true as const,
    },
    boundaries: {
      targetNodeAcceptanceEstablished: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  const binding = deepFreeze({
    ...body,
    bindingDigestHex: sha256CanonicalJson(body, BINDING_DIGEST_DOMAIN),
  });
  bindings.add(binding);
  return binding;
}

function fixedHex(value: string, bytes: number, label: string): string {
  const normalized = value.toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of lowercase hex`);
  }
  return normalized;
}

function variableHex(value: string, label: string): string {
  const normalized = value.toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty even-length lowercase hex`);
  }
  return normalized;
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields are invalid`);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
