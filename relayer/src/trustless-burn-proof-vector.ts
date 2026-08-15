import {
  buildTrustlessBurnCommitment,
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnInclusionProof,
  validateTrustlessBurnInclusionProofEnvelope,
  verifyTrustlessBurnSettlementBinding,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import { readEvidenceJsonTarget } from './evidence-json-target-path.js';
import blakejs from 'blakejs';

export interface TrustlessBurnNegativeProofCase {
  name: string;
  leaf?: TrustlessBurnLeafInput;
  settlementBinding: {
    bridgeEventRootHex?: string;
    proof?: TrustlessBurnMerkleProofStep[];
    duplicatePreventionKeyHex: string;
    recipientErgoTreeHashHex: string;
    amountNanoErg: string | number | bigint;
    assetIdHex?: string;
  };
  expectedErrors: string[];
}

export interface TrustlessBurnNegativeProofBase {
  leaf: TrustlessBurnLeafInput;
  bridgeEventRootHex: string;
  proof: TrustlessBurnMerkleProofStep[];
}

export interface TrustlessBurnProofVectorFile {
  schema: string;
  gate5Claim: boolean;
  contractsChanged: boolean;
  leaves: TrustlessBurnLeafInput[];
  targetBurnIdHex: string;
  expected: {
    encodedLeafHex: string;
    leafHashHex: string;
    bridgeEventRootHex: string;
    leafIndex: number;
    leafCount: number;
    proof: TrustlessBurnMerkleProofStep[];
    settlementBinding: {
      duplicatePreventionKeyHex: string;
      recipientErgoTreeHex?: string;
      recipientErgoTreeHashHex: string;
      amountNanoErg: string | number | bigint;
      assetIdHex?: string;
      ok: boolean;
    };
  };
  negativeCases: TrustlessBurnNegativeProofCase[];
  compat?: {
    legacyAggregateRootHex?: string;
    liveAggregateSettlementStillUsesLegacyRoot?: boolean;
  };
}

export interface TrustlessBurnProofVectorValidation {
  ok: boolean;
  errors: string[];
  bridgeEventRootHex: string;
  leafHashHex: string;
  negativeCaseResults: TrustlessBurnNegativeProofCaseResult[];
}

export interface TrustlessBurnProofVectorTargetValidation {
  label: string;
  status: 'PASS' | 'BLOCKED';
  message: string;
  errors: string[];
  bridgeEventRootHex?: string;
  leafHashHex?: string;
  leafCount?: number;
  proofNodeCount?: number;
  negativeCaseResults?: TrustlessBurnNegativeProofCaseResult[];
}

export interface TrustlessBurnNegativeProofCaseResult {
  name: string;
  status: 'REJECTED' | 'BLOCKED';
  expectedErrors: string[];
  observedErrors: string[];
}

export interface TrustlessBurnNegativeProofCaseEvaluation {
  errors: string[];
  results: TrustlessBurnNegativeProofCaseResult[];
}

const TRUSTLESS_BURN_VECTOR_SCHEMA = 'e2s.trustless-burn-proof.vector.v1';
const REQUIRED_NEGATIVE_CASE_NAMES = [
  'wrong-sidechain-id',
  'wrong-burn-id',
  'wrong-event-index',
  'wrong-recipient',
  'wrong-amount',
  'wrong-duplicate-prevention-key',
  'wrong-bridge-event-root',
  'malformed-inclusion-path',
];
const REQUIRED_NEGATIVE_CASE_NAME_SET = new Set(REQUIRED_NEGATIVE_CASE_NAMES);
const REQUIRED_NEGATIVE_CASE_EXPECTED_ERRORS: Record<string, string> = {
  'wrong-sidechain-id': 'burnId must equal derived sidechain event identity',
  'wrong-burn-id': 'burnId must equal derived sidechain event identity',
  'wrong-event-index': 'burnId must equal derived sidechain event identity',
  'wrong-recipient': 'settlement recipient must equal proved recipientErgoTreeHash',
  'wrong-amount': 'settlement amount must equal proved amountNanoErg',
  'wrong-duplicate-prevention-key': 'duplicatePreventionKey must equal burnId',
  'wrong-bridge-event-root': 'burn inclusion proof must resolve to bridgeEventRoot',
  'malformed-inclusion-path': 'burn inclusion proof must resolve to bridgeEventRoot',
};
const NEGATIVE_CASE_LEAF_OVERRIDE_FIELDS: Record<string, keyof TrustlessBurnLeafInput> = {
  'wrong-sidechain-id': 'sidechainIdHex',
  'wrong-burn-id': 'burnIdHex',
  'wrong-event-index': 'eventIndex',
};
const TRUSTLESS_BURN_LEAF_FIELDS: Array<keyof TrustlessBurnLeafInput> = [
  'sidechainIdHex',
  'sidechainBlockHashHex',
  'burnIdHex',
  'sidechainTxHashHex',
  'eventIndex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
];
const TRUSTLESS_BURN_LEAF_FIELD_SET = new Set<string>(TRUSTLESS_BURN_LEAF_FIELDS);
const PROOF_VECTOR_TOP_LEVEL_FIELDS = new Set([
  'schema',
  'gate5Claim',
  'contractsChanged',
  'leaves',
  'targetBurnIdHex',
  'expected',
  'negativeCases',
  'compat',
]);
const PROOF_VECTOR_EXPECTED_FIELDS = new Set([
  'encodedLeafHex',
  'leafHashHex',
  'bridgeEventRootHex',
  'leafIndex',
  'leafCount',
  'proof',
  'settlementBinding',
]);
const PROOF_VECTOR_EXPECTED_SETTLEMENT_BINDING_FIELDS = new Set([
  'duplicatePreventionKeyHex',
  'recipientErgoTreeHex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
  'ok',
]);
const PROOF_VECTOR_NEGATIVE_SETTLEMENT_BINDING_FIELDS = new Set([
  'bridgeEventRootHex',
  'proof',
  'duplicatePreventionKeyHex',
  'recipientErgoTreeHashHex',
  'amountNanoErg',
  'assetIdHex',
]);
const PROOF_VECTOR_NEGATIVE_CASE_FIELDS = new Set([
  'name',
  'leaf',
  'settlementBinding',
  'expectedErrors',
]);
const PROOF_VECTOR_COMPAT_FIELDS = new Set([
  'legacyAggregateRootHex',
  'liveAggregateSettlementStillUsesLegacyRoot',
]);
const PROOF_VECTOR_PROOF_STEP_FIELDS = new Set([
  'side',
  'hashHex',
]);
const PROOF_STEP_HASH_HEX_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;

export function validateTrustlessBurnProofVector(
  vector: TrustlessBurnProofVectorFile,
): TrustlessBurnProofVectorValidation {
  const errors: string[] = [];
  let bridgeEventRootHex = '';
  let leafHashHex = '';
  let negativeCaseResults: TrustlessBurnNegativeProofCaseResult[] = [];

  if (!isRecord(vector)) {
    return blocked(['vector must be an object'], bridgeEventRootHex, leafHashHex);
  }

  validateProofVectorUnexpectedFields(errors, vector);

  if (vector.schema !== TRUSTLESS_BURN_VECTOR_SCHEMA) {
    errors.push(`schema must be ${TRUSTLESS_BURN_VECTOR_SCHEMA}`);
  }
  if (vector.gate5Claim !== false) {
    errors.push('gate5Claim must remain false for local proof vectors');
  }
  if (vector.contractsChanged !== false) {
    errors.push('contractsChanged must remain false for this local proof vector');
  }
  if (!Array.isArray(vector.leaves) || vector.leaves.length === 0) {
    errors.push('leaves must contain at least one burn leaf');
  }
  if (typeof vector.targetBurnIdHex !== 'string' || vector.targetBurnIdHex.trim().length === 0) {
    errors.push('targetBurnIdHex is required');
  }
  if (!isRecord(vector.expected)) {
    errors.push('expected must be an object');
  }

  if (errors.length > 0) {
    return blocked(errors, bridgeEventRootHex, leafHashHex);
  }

  try {
    const commitment = buildTrustlessBurnCommitment(vector.leaves);
    const proof = buildTrustlessBurnInclusionProof(vector.leaves, vector.targetBurnIdHex);
    bridgeEventRootHex = proof.bridgeEventRootHex;
    leafHashHex = proof.leaf.leafHashHex;

    compareString(errors, 'expected.bridgeEventRootHex', proof.bridgeEventRootHex, vector.expected.bridgeEventRootHex);
    compareString(errors, 'expected.bridgeEventRootHex', commitment.bridgeEventRootHex, vector.expected.bridgeEventRootHex);
    compareString(errors, 'expected.encodedLeafHex', proof.leaf.encodedLeafHex, vector.expected.encodedLeafHex);
    compareString(errors, 'expected.leafHashHex', proof.leaf.leafHashHex, vector.expected.leafHashHex);
    compareNumber(errors, 'expected.leafIndex', proof.leafIndex, vector.expected.leafIndex);
    compareNumber(errors, 'expected.leafCount', proof.leafCount, vector.expected.leafCount);
    compareProof(errors, proof.proof, vector.expected.proof);
    const envelope = validateTrustlessBurnInclusionProofEnvelope({
      bridgeEventRootHex: vector.expected.bridgeEventRootHex,
      leaf: proof.leaf,
      leafIndex: vector.expected.leafIndex,
      leafCount: vector.expected.leafCount,
      proof: vector.expected.proof,
    });
    errors.push(...envelope.errors.map(error => `expected.inclusionProof: ${error}`));

    const settlementBinding = vector.expected.settlementBinding;
    if (!isRecord(settlementBinding)) {
      errors.push('expected.settlementBinding must be an object');
    } else {
      if (settlementBinding.ok !== true) {
        errors.push('expected.settlementBinding.ok must be true');
      }
      validateRecipientErgoTreePreimage(errors, settlementBinding);
      const settlement = verifyTrustlessBurnSettlementBinding({
        leaf: proof.leaf,
        bridgeEventRootHex: proof.bridgeEventRootHex,
        proof: proof.proof,
        duplicatePreventionKeyHex: settlementBinding.duplicatePreventionKeyHex,
        recipientErgoTreeHashHex: settlementBinding.recipientErgoTreeHashHex,
        amountNanoErg: settlementBinding.amountNanoErg,
        assetIdHex: settlementBinding.assetIdHex,
      });
      if (settlement.ok !== settlementBinding.ok) {
        errors.push('expected.settlementBinding.ok must match proof-core settlement result');
      }
      errors.push(...settlement.errors.map(error => `expected.settlementBinding: ${error}`));
    }

    const negativeCaseEvaluation = evaluateTrustlessBurnNegativeProofCases(vector.negativeCases, proof);
    errors.push(...negativeCaseEvaluation.errors);
    negativeCaseResults = negativeCaseEvaluation.results;
    validateLegacyCompat(errors, vector.compat, proof.bridgeEventRootHex);
  } catch (err: any) {
    errors.push(`vector computation failed: ${err?.message ?? String(err)}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    bridgeEventRootHex,
    leafHashHex,
    negativeCaseResults,
  };
}

function validateRecipientErgoTreePreimage(
  errors: string[],
  settlementBinding: TrustlessBurnProofVectorFile['expected']['settlementBinding'],
): void {
  if (settlementBinding.recipientErgoTreeHex === undefined) return;
  const clean = settlementBinding.recipientErgoTreeHex.startsWith('0x')
    ? settlementBinding.recipientErgoTreeHex.slice(2)
    : settlementBinding.recipientErgoTreeHex;
  if (!/^[0-9a-fA-F]{72}$/.test(clean)) {
    errors.push('expected.settlementBinding.recipientErgoTreeHex must be a 36-byte hex ErgoTree');
    return;
  }
  const hash = Buffer.from(blakejs.blake2b(Buffer.from(clean, 'hex'), undefined, 32)).toString('hex');
  if (hash !== settlementBinding.recipientErgoTreeHashHex) {
    errors.push('expected.settlementBinding.recipientErgoTreeHex must hash to recipientErgoTreeHashHex');
  }
}

export function validateTrustlessBurnProofVectorTarget(
  target: string,
): TrustlessBurnProofVectorTargetValidation {
  const read = readEvidenceJsonTarget(target, '--proof-vector');
  if (read.errors.length > 0) {
    return blockedTarget(read.label, read.errors);
  }

  const validation = validateTrustlessBurnProofVector(read.json as TrustlessBurnProofVectorFile);
  const errors = [...validation.errors];
  const vector = read.json as Partial<TrustlessBurnProofVectorFile>;
  const expected = isRecord(vector.expected) ? vector.expected : undefined;
  const leafCount = typeof expected?.leafCount === 'number' ? expected.leafCount : undefined;
  const proofNodeCount = Array.isArray(expected?.proof) ? expected.proof.length : undefined;

  if (leafCount !== undefined && leafCount < 2) {
    errors.push('expected.leafCount must be at least 2 for evidence-ready local inclusion proof validation');
  }
  if (proofNodeCount !== undefined && proofNodeCount === 0) {
    errors.push('expected.proof must include at least one structured inclusion proof node');
  }

  if (errors.length > 0) {
    return blockedTarget(read.label, errors, validation, leafCount, proofNodeCount);
  }

  return {
    label: read.label,
    status: 'PASS',
    message:
      `Trustless burn proof vector PASS: leafCount=${leafCount}, proofNodes=${proofNodeCount}, ` +
      'gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, ' +
      'settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.',
    errors: [],
    bridgeEventRootHex: validation.bridgeEventRootHex,
    leafHashHex: validation.leafHashHex,
    leafCount,
    proofNodeCount,
    negativeCaseResults: validation.negativeCaseResults,
  };
}

export function validateTrustlessBurnNegativeProofCases(
  negativeCases: unknown,
  proof: TrustlessBurnNegativeProofBase | TrustlessBurnInclusionProof,
): string[] {
  return evaluateTrustlessBurnNegativeProofCases(negativeCases, proof).errors;
}

export function evaluateTrustlessBurnNegativeProofCases(
  negativeCases: unknown,
  proof: TrustlessBurnNegativeProofBase | TrustlessBurnInclusionProof,
): TrustlessBurnNegativeProofCaseEvaluation {
  const errors: string[] = [];
  const results: TrustlessBurnNegativeProofCaseResult[] = [];
  const positiveLeaf = isRecord(proof.leaf) ? proof.leaf as unknown as TrustlessBurnLeafInput : undefined;
  if (!Array.isArray(negativeCases)) {
    errors.push('negativeCases must be an array of local negative proof cases');
    for (const requiredName of REQUIRED_NEGATIVE_CASE_NAMES) {
      errors.push(`negativeCases must include ${requiredName}`);
    }
    return { errors, results };
  }
  if (positiveLeaf === undefined) {
    errors.push('positive proof leaf must be an object before negative proof cases can be evaluated');
  }

  const seenNames = new Set<string>();
  for (let index = 0; index < negativeCases.length; index += 1) {
    const entry = negativeCases[index] as unknown;
    if (!isRecord(entry)) {
      errors.push(`negativeCases[${index}] must be an object`);
      continue;
    }

    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const label = name || String(index);
    if (name.length === 0) {
      errors.push(`negativeCases[${index}].name is required`);
    } else if (!REQUIRED_NEGATIVE_CASE_NAME_SET.has(name)) {
      errors.push(`negativeCases[${label}] unknown negative case name`);
    } else if (seenNames.has(name)) {
      errors.push(`negativeCases[${label}] duplicate negative case name`);
    } else {
      seenNames.add(name);
    }

    const expectedErrors: string[] = [];
    if (Array.isArray(entry.expectedErrors)) {
      entry.expectedErrors.forEach((error, errorIndex) => {
        if (typeof error !== 'string' || error.trim().length === 0) {
          errors.push(
            `negativeCases[${label}].expectedErrors[${errorIndex}] must be a non-empty proof-core error string`,
          );
          return;
        }
        expectedErrors.push(error);
      });
    }
    if (expectedErrors.length === 0) {
      errors.push(`negativeCases[${label}].expectedErrors must contain at least one expected proof-core error`);
    }
    validateRequiredNegativeCaseExpectedError(errors, label, name, expectedErrors);

    if (!isRecord(entry.settlementBinding)) {
      errors.push(`negativeCases[${label}].settlementBinding must be an object`);
      continue;
    }

    const settlementBinding = entry.settlementBinding as Partial<TrustlessBurnNegativeProofCase['settlementBinding']>;
    const leafOverride = positiveLeaf === undefined
      ? undefined
      : validateNegativeCaseLeafOverride(errors, label, name, entry.leaf, positiveLeaf);
    const leaf = leafOverride ?? positiveLeaf;
    const proofOverride = validateNegativeProofCaseProofOverride(errors, label, settlementBinding.proof);
    if (name === 'wrong-bridge-event-root') {
      validateWrongBridgeEventRootNegativeCase(
        errors,
        label,
        settlementBinding,
        proofOverride,
        proof.bridgeEventRootHex,
      );
    }
    if (name === 'malformed-inclusion-path') {
      validateMalformedInclusionPathNegativeCase(errors, label, settlementBinding, proofOverride, proof.proof);
    }
    validateOrdinaryNegativeCaseOverrideScope(errors, label, name, settlementBinding);
    if (leaf === undefined) continue;
    const settlement = verifyTrustlessBurnSettlementBinding({
      leaf,
      bridgeEventRootHex: typeof settlementBinding.bridgeEventRootHex === 'string'
        ? settlementBinding.bridgeEventRootHex
        : proof.bridgeEventRootHex,
      proof: proofOverride ?? proof.proof,
      duplicatePreventionKeyHex: settlementBinding.duplicatePreventionKeyHex as string,
      recipientErgoTreeHashHex: settlementBinding.recipientErgoTreeHashHex as string,
      amountNanoErg: settlementBinding.amountNanoErg as string | number | bigint,
      ...(typeof settlementBinding.assetIdHex === 'string' ? { assetIdHex: settlementBinding.assetIdHex } : {}),
    });

    if (settlement.ok) {
      errors.push(`negativeCases[${label}] must be rejected by proof-core settlement binding`);
    }
    results.push({
      name,
      status: settlement.ok ? 'BLOCKED' : 'REJECTED',
      expectedErrors,
      observedErrors: settlement.errors,
    });
    for (const expectedError of expectedErrors) {
      if (!settlement.errors.includes(expectedError)) {
        errors.push(`negativeCases[${label}] expected error not observed: ${expectedError}`);
      }
    }
    for (const observedError of settlement.errors) {
      if (!expectedErrors.includes(observedError)) {
        errors.push(`negativeCases[${label}] observed unexpected proof-core error: ${observedError}`);
      }
    }
  }

  for (const requiredName of REQUIRED_NEGATIVE_CASE_NAMES) {
    if (!seenNames.has(requiredName)) {
      errors.push(`negativeCases must include ${requiredName}`);
    }
  }

  return { errors, results };
}

function validateRequiredNegativeCaseExpectedError(
  errors: string[],
  label: string,
  name: string,
  expectedErrors: string[],
): void {
  const requiredExpectedError = REQUIRED_NEGATIVE_CASE_EXPECTED_ERRORS[name];
  if (requiredExpectedError === undefined) return;
  if (expectedErrors.length !== 1 || expectedErrors[0] !== requiredExpectedError) {
    errors.push(
      `negativeCases[${label}].expectedErrors must contain exactly the required proof-core error: ${requiredExpectedError}`,
    );
  }
}

function validateNegativeProofCaseProofOverride(
  errors: string[],
  label: string,
  proofOverride: unknown,
): TrustlessBurnMerkleProofStep[] | undefined {
  if (proofOverride === undefined) return undefined;
  if (!Array.isArray(proofOverride)) {
    errors.push(`negativeCases[${label}].settlementBinding.proof must be an array when provided`);
    return undefined;
  }
  if (proofOverride.length === 0) {
    errors.push(`negativeCases[${label}].settlementBinding.proof must include at least one structured proof step when provided`);
  }

  proofOverride.forEach((step, stepIndex) => {
    if (!isRecord(step)) {
      errors.push(`negativeCases[${label}].settlementBinding.proof[${stepIndex}] must be an object with side and hashHex`);
      return;
    }
    if (step.side !== 'left' && step.side !== 'right') {
      errors.push(`negativeCases[${label}].settlementBinding.proof[${stepIndex}].side must be left or right`);
    }
    if (typeof step.hashHex !== 'string' || !PROOF_STEP_HASH_HEX_PATTERN.test(step.hashHex.trim())) {
      errors.push(`negativeCases[${label}].settlementBinding.proof[${stepIndex}].hashHex must be a 32-byte hex string`);
    }
  });

  return proofOverride as TrustlessBurnMerkleProofStep[];
}

function validateWrongBridgeEventRootNegativeCase(
  errors: string[],
  label: string,
  settlementBinding: Partial<TrustlessBurnNegativeProofCase['settlementBinding']>,
  proofOverride: TrustlessBurnMerkleProofStep[] | undefined,
  positiveBridgeEventRootHex: string,
): void {
  const rootOverride = typeof settlementBinding.bridgeEventRootHex === 'string'
    ? settlementBinding.bridgeEventRootHex.trim()
    : '';
  if (rootOverride.length === 0) {
    errors.push(
      `negativeCases[${label}].settlementBinding.bridgeEventRootHex must provide the wrong bridgeEventRoot override`,
    );
  } else if (normalizeProofHashHex(rootOverride) === normalizeProofHashHex(positiveBridgeEventRootHex)) {
    errors.push(
      `negativeCases[${label}].settlementBinding.bridgeEventRootHex must differ from the positive bridgeEventRoot`,
    );
  }
  if (proofOverride !== undefined) {
    errors.push(
      `negativeCases[${label}].settlementBinding.proof must not override the proof path; mutate bridgeEventRootHex instead`,
    );
  }
}

function validateMalformedInclusionPathNegativeCase(
  errors: string[],
  label: string,
  settlementBinding: Partial<TrustlessBurnNegativeProofCase['settlementBinding']>,
  proofOverride: TrustlessBurnMerkleProofStep[] | undefined,
  positiveProof: TrustlessBurnMerkleProofStep[],
): void {
  if (settlementBinding.bridgeEventRootHex !== undefined) {
    errors.push(
      `negativeCases[${label}].settlementBinding.bridgeEventRootHex must not override bridgeEventRoot; mutate settlementBinding.proof instead`,
    );
  }
  if (proofOverride === undefined) {
    errors.push(
      `negativeCases[${label}].settlementBinding.proof must provide the malformed inclusion path override`,
    );
    return;
  }
  if (proofStepsEqual(proofOverride, positiveProof)) {
    errors.push(`negativeCases[${label}].settlementBinding.proof must differ from the positive proof path`);
  }
}

function validateOrdinaryNegativeCaseOverrideScope(
  errors: string[],
  label: string,
  name: string,
  settlementBinding: Partial<TrustlessBurnNegativeProofCase['settlementBinding']>,
): void {
  if (!REQUIRED_NEGATIVE_CASE_NAME_SET.has(name)) return;
  if (name === 'wrong-bridge-event-root' || name === 'malformed-inclusion-path') return;
  if (settlementBinding.bridgeEventRootHex !== undefined) {
    errors.push(
      `negativeCases[${label}].settlementBinding.bridgeEventRootHex must not override bridgeEventRoot for this negative case`,
    );
  }
  if (settlementBinding.proof !== undefined) {
    errors.push(
      `negativeCases[${label}].settlementBinding.proof must not override the proof path for this negative case`,
    );
  }
}

function validateNegativeCaseLeafOverride(
  errors: string[],
  label: string,
  name: string,
  leafOverride: unknown,
  positiveLeaf: TrustlessBurnLeafInput,
): TrustlessBurnLeafInput | undefined {
  if (!REQUIRED_NEGATIVE_CASE_NAME_SET.has(name)) {
    return isRecord(leafOverride) ? leafOverride as unknown as TrustlessBurnLeafInput : undefined;
  }

  const allowedField = NEGATIVE_CASE_LEAF_OVERRIDE_FIELDS[name];
  if (allowedField === undefined) {
    if (leafOverride !== undefined) {
      errors.push(`negativeCases[${label}].leaf must not override the positive leaf for this negative case`);
    }
    return undefined;
  }

  if (leafOverride === undefined) {
    errors.push(`negativeCases[${label}].leaf must provide the ${allowedField} override`);
    return undefined;
  }
  if (!isRecord(leafOverride)) {
    errors.push(`negativeCases[${label}].leaf must be an object`);
    return undefined;
  }

  for (const field of TRUSTLESS_BURN_LEAF_FIELDS) {
    if (field === allowedField) continue;
    if (!leafFieldValueMatches(leafOverride[field], positiveLeaf[field])) {
      errors.push(`negativeCases[${label}].leaf.${field} must match the positive leaf for this negative case`);
    }
  }
  if (leafFieldValueMatches(leafOverride[allowedField], positiveLeaf[allowedField])) {
    errors.push(`negativeCases[${label}].leaf.${allowedField} must differ from the positive leaf`);
  }

  return leafOverride as unknown as TrustlessBurnLeafInput;
}

function leafFieldValueMatches(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'string' && PROOF_STEP_HASH_HEX_PATTERN.test(expected)) {
    return normalizeProofHashHex(actual) === normalizeProofHashHex(expected);
  }
  return String(actual) === String(expected);
}

function validateProofVectorUnexpectedFields(
  errors: string[],
  vector: TrustlessBurnProofVectorFile,
): void {
  validateUnexpectedProofVectorFields(errors, '', vector, PROOF_VECTOR_TOP_LEVEL_FIELDS);

  if (Array.isArray(vector.leaves)) {
    vector.leaves.forEach((leaf, index) => {
      validateUnexpectedProofVectorFields(errors, `leaves[${index}]`, leaf, TRUSTLESS_BURN_LEAF_FIELD_SET);
    });
  }

  if (isRecord(vector.expected)) {
    validateUnexpectedProofVectorFields(errors, 'expected', vector.expected, PROOF_VECTOR_EXPECTED_FIELDS);
    validateProofVectorStepUnexpectedFields(errors, 'expected.proof', vector.expected.proof);
    validateUnexpectedProofVectorFields(
      errors,
      'expected.settlementBinding',
      vector.expected.settlementBinding,
      PROOF_VECTOR_EXPECTED_SETTLEMENT_BINDING_FIELDS,
    );
  }

  if (Array.isArray(vector.negativeCases)) {
    vector.negativeCases.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const name = typeof entry.name === 'string' && entry.name.trim().length > 0
        ? entry.name.trim()
        : String(index);
      validateUnexpectedProofVectorFields(errors, `negativeCases[${name}]`, entry, PROOF_VECTOR_NEGATIVE_CASE_FIELDS);
      validateUnexpectedProofVectorFields(errors, `negativeCases[${name}].leaf`, entry.leaf, TRUSTLESS_BURN_LEAF_FIELD_SET);
      validateUnexpectedProofVectorFields(
        errors,
        `negativeCases[${name}].settlementBinding`,
        entry.settlementBinding,
        PROOF_VECTOR_NEGATIVE_SETTLEMENT_BINDING_FIELDS,
      );
      if (isRecord(entry.settlementBinding)) {
        validateProofVectorStepUnexpectedFields(
          errors,
          `negativeCases[${name}].settlementBinding.proof`,
          entry.settlementBinding.proof,
        );
      }
    });
  }

  validateUnexpectedProofVectorFields(errors, 'compat', vector.compat, PROOF_VECTOR_COMPAT_FIELDS);
}

function validateProofVectorStepUnexpectedFields(
  errors: string[],
  label: string,
  proof: unknown,
): void {
  if (!Array.isArray(proof)) return;
  proof.forEach((step, index) => {
    validateUnexpectedProofVectorFields(errors, `${label}[${index}]`, step, PROOF_VECTOR_PROOF_STEP_FIELDS);
  });
}

function validateUnexpectedProofVectorFields(
  errors: string[],
  label: string,
  value: unknown,
  allowedFields: Set<string>,
): void {
  if (!isRecord(value)) return;
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      const prefix = label.length > 0 ? `${label} ` : '';
      errors.push(`${prefix}unexpected field ${field} is not allowed in proof-vector input`);
    }
  }
}

function validateLegacyCompat(
  errors: string[],
  compat: TrustlessBurnProofVectorFile['compat'],
  bridgeEventRootHex: string,
): void {
  if (compat === undefined) return;
  if (compat.liveAggregateSettlementStillUsesLegacyRoot !== true) {
    errors.push('compat.liveAggregateSettlementStillUsesLegacyRoot must stay true until aggregate settlement migrates');
  }

  const legacyAggregateRootHex = typeof compat.legacyAggregateRootHex === 'string'
    ? compat.legacyAggregateRootHex.trim()
    : '';
  if (!/^[0-9a-f]{64}$/i.test(legacyAggregateRootHex)) {
    errors.push(
      'compat.legacyAggregateRootHex must be a concrete 32-byte legacy aggregate root while aggregate settlement still uses legacy root',
    );
    return;
  }
  if (legacyAggregateRootHex.toLowerCase() === bridgeEventRootHex.toLowerCase()) {
    errors.push('compat.legacyAggregateRootHex must remain distinct from the trustless bridgeEventRoot');
  }
}

function compareString(errors: string[], field: string, actual: string, expected: unknown): void {
  if (typeof expected !== 'string' || actual.toLowerCase() !== expected.toLowerCase()) {
    errors.push(`${field} must match proof-core output`);
  }
}

function compareNumber(errors: string[], field: string, actual: number, expected: unknown): void {
  if (expected !== actual) {
    errors.push(`${field} must match proof-core output`);
  }
}

function compareProof(
  errors: string[],
  actual: TrustlessBurnMerkleProofStep[],
  expected: unknown,
): void {
  if (!Array.isArray(expected) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push('expected.proof must match proof-core output');
  }
}

function proofStepsEqual(actual: unknown[], expected: TrustlessBurnMerkleProofStep[]): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((step, index) => {
    if (!isRecord(step)) return false;
    const expectedStep = expected[index];
    return step.side === expectedStep.side
      && normalizeProofHashHex(step.hashHex) === normalizeProofHashHex(expectedStep.hashHex);
  });
}

function normalizeProofHashHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

function blocked(
  errors: string[],
  bridgeEventRootHex: string,
  leafHashHex: string,
  negativeCaseResults: TrustlessBurnNegativeProofCaseResult[] = [],
): TrustlessBurnProofVectorValidation {
  return {
    ok: false,
    errors,
    bridgeEventRootHex,
    leafHashHex,
    negativeCaseResults,
  };
}

function blockedTarget(
  label: string,
  errors: string[],
  validation?: TrustlessBurnProofVectorValidation,
  leafCount?: number,
  proofNodeCount?: number,
): TrustlessBurnProofVectorTargetValidation {
  return {
    label,
    status: 'BLOCKED',
    message: `Trustless burn proof vector BLOCKED: ${errors.length} structural issue(s).`,
    errors,
    ...(validation?.bridgeEventRootHex ? { bridgeEventRootHex: validation.bridgeEventRootHex } : {}),
    ...(validation?.leafHashHex ? { leafHashHex: validation.leafHashHex } : {}),
    ...(leafCount !== undefined ? { leafCount } : {}),
    ...(proofNodeCount !== undefined ? { proofNodeCount } : {}),
    ...(validation?.negativeCaseResults.length ? { negativeCaseResults: validation.negativeCaseResults } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
