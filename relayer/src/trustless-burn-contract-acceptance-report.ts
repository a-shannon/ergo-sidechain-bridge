import {
  buildTrustlessBurnProofBundle,
  buildTrustlessTrackerValueHex,
  deriveTrustlessSpvTrackerKeyHex,
  evaluateTrustlessBurnContractAcceptance,
  type TrustlessBurnContractAcceptanceInput,
} from './trustless-burn-contract-acceptance.js';
import { sanitizeReportText } from './report-text-sanitizer.js';
import {
  validateTrustlessBurnInstanceBindingReportJson,
  type TrustlessBurnInstanceBindingReport,
  type TrustlessBurnInstanceIdentity,
} from './trustless-burn-instance-binding.js';
import {
  validateTrustlessBurnProofVector,
  type TrustlessBurnProofVectorFile,
} from './trustless-burn-proof-vector.js';
import type { TrustlessBurnLeafInput } from './trustless-burn-proof.js';

export interface TrustlessBurnContractAcceptanceReportInput {
  sourceCommit: string;
  command: string;
  candidateTarget: string;
  candidateMarkdown: string;
  instanceBindingJsonTarget: string;
  instanceBindingJson: unknown;
  proofVectorTarget: string;
  proofVectorJson: unknown;
  currentErgoHeight: number;
}

export interface TrustlessBurnContractAcceptanceCheck {
  check: string;
  status: 'pass' | 'blocked';
  detail: string;
}

export interface TrustlessBurnContractNegativeCaseResult {
  name: string;
  status: 'REJECTED' | 'BLOCKED';
  expectedError: string;
  observedErrors: string[];
}

export interface TrustlessBurnContractAcceptanceReport {
  schemaVersion: 1;
  status: 'PASS' | 'BLOCKED';
  exitCode: 0 | 1;
  command: string;
  sourceCommit: string;
  candidateTarget: string;
  instanceBindingJsonTarget: string;
  proofVectorTarget: string;
  currentErgoHeight: number;
  sidechainHeight: number;
  selectedNetwork: string;
  identity: TrustlessBurnInstanceIdentity;
  structuralIssues: number;
  sourceChecks: TrustlessBurnContractAcceptanceCheck[];
  positiveAcceptance: {
    accepted: boolean;
    errors: string[];
    derived: {
      trackerKeyHex: string;
      merkleRootHex: string;
      burnProofNodeCount: number;
      dupLookupProofLength: number;
      ergoAnchorHeight: number;
    };
  };
  negativeCases: TrustlessBurnContractNegativeCaseResult[];
  nextEvidence: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export function buildTrustlessBurnContractAcceptanceCommand(input: {
  sourceCommit: string;
  candidate: string;
  instanceBindingJson: string;
  proofVector: string;
  currentErgoHeight: number;
  out?: string;
  jsonOut?: string;
}): string {
  const parts = [
    'npm run trustless:contract-acceptance --',
    '--source-commit',
    sanitize(input.sourceCommit),
    '--candidate',
    sanitize(input.candidate),
    '--instance-binding-json',
    sanitize(input.instanceBindingJson),
    '--proof-vector',
    sanitize(input.proofVector),
    '--current-ergo-height',
    String(input.currentErgoHeight),
  ];
  if (input.out) parts.push('--out <contract-acceptance.md>');
  if (input.jsonOut) parts.push('--json-out <contract-acceptance.json>');
  return parts.join(' ');
}

export function buildTrustlessBurnContractAcceptanceReport(
  input: TrustlessBurnContractAcceptanceReportInput,
): TrustlessBurnContractAcceptanceReport {
  const bindingErrors = validateTrustlessBurnInstanceBindingReportJson(input.instanceBindingJson);
  const binding = isRecord(input.instanceBindingJson)
    ? input.instanceBindingJson as unknown as TrustlessBurnInstanceBindingReport
    : undefined;
  const identity = binding?.identity ?? emptyIdentity();
  const selectedNetwork = binding?.selectedNetwork ?? 'unknown non-mainnet';
  const vector = input.proofVectorJson as TrustlessBurnProofVectorFile;
  const vectorValidation = validateTrustlessBurnProofVector(vector);
  const sidechainHeight = extractNumericField(input.candidateMarkdown, 'sidechainHeight');
  const sourceChecks: TrustlessBurnContractAcceptanceCheck[] = [];

  addCheck(
    sourceChecks,
    'Instance binding JSON validates',
    bindingErrors.length === 0,
    `binding target ${input.instanceBindingJsonTarget}`,
    bindingErrors.join('; ') || 'instance binding JSON must validate before contract-equivalent acceptance',
  );
  addCheck(
    sourceChecks,
    'Proof vector validates',
    vectorValidation.ok,
    `proof vector target ${input.proofVectorTarget}`,
    vectorValidation.errors.join('; ') || 'proof vector must validate before contract-equivalent acceptance',
  );
  addCheck(
    sourceChecks,
    'Candidate sidechain height is available',
    Number.isSafeInteger(sidechainHeight) && sidechainHeight >= 0,
    `sidechainHeight ${sidechainHeight}`,
    'candidate must expose a non-negative sidechainHeight commitment field',
  );

  const targetLeaf = findTargetLeaf(vector);
  const bindingChecks = compareBindingToProofVector(identity, vector, targetLeaf);
  sourceChecks.push(...bindingChecks);

  const positiveInput = buildPositiveAcceptanceInput({
    identity,
    vector,
    targetLeaf,
    sidechainHeight,
    currentErgoHeight: input.currentErgoHeight,
  });
  const positive = positiveInput
    ? evaluateTrustlessBurnContractAcceptance(positiveInput)
    : undefined;
  const negativeCases = positiveInput
    ? buildNegativeCaseResults(positiveInput, identity.ergoAnchorHeight, sidechainHeight)
    : [];
  const positiveIssue = positive?.accepted === true ? 0 : 1;
  const negativeIssues = negativeCases.filter(test => test.status !== 'REJECTED').length;
  const sourceIssues = sourceChecks.filter(check => check.status === 'blocked').length;
  const structuralIssues = sourceIssues + positiveIssue + negativeIssues;
  const status = structuralIssues === 0 ? 'PASS' : 'BLOCKED';

  return {
    schemaVersion: 1,
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    command: sanitize(input.command),
    sourceCommit: sanitize(input.sourceCommit),
    candidateTarget: sanitize(input.candidateTarget),
    instanceBindingJsonTarget: sanitize(input.instanceBindingJsonTarget),
    proofVectorTarget: sanitize(input.proofVectorTarget),
    currentErgoHeight: input.currentErgoHeight,
    sidechainHeight,
    selectedNetwork: sanitize(selectedNetwork),
    identity,
    structuralIssues,
    sourceChecks,
    positiveAcceptance: {
      accepted: positive?.accepted === true,
      errors: positive?.errors ?? ['contract-equivalent acceptance input could not be built'],
      derived: positive?.derived ?? {
        trackerKeyHex: '',
        merkleRootHex: '',
        burnProofNodeCount: 0,
        dupLookupProofLength: 0,
        ergoAnchorHeight: -1,
      },
    },
    negativeCases,
    nextEvidence: buildNextEvidence(identity),
    boundary: buildBoundary(),
  };
}

export function formatTrustlessBurnContractAcceptanceMarkdown(
  report: TrustlessBurnContractAcceptanceReport,
): string {
  return [
    '# Gate 5 Local Contract-Equivalent Burn Acceptance',
    '',
    'This packet checks the current non-mainnet Gate 5 proof-vector instance against the local V2 trustless-burn contract predicate model.',
    'It is still local contract-equivalent evidence only: it does not execute the ErgoScript VM, does not prove mined on-chain acceptance, and does not close Gate 5.',
    '',
    '## Summary',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Status', report.status],
      ['Exit code', String(report.exitCode)],
      ['Source commit', report.sourceCommit],
      ['Selected network', report.selectedNetwork],
      ['Structural issues', String(report.structuralIssues)],
      ['Sidechain height', String(report.sidechainHeight)],
      ['Current Ergo height used for local predicate', String(report.currentErgoHeight)],
    ]),
    '',
    '## Source Targets',
    '',
    markdownTable([
      ['Target', 'Value'],
      ['Candidate', report.candidateTarget],
      ['Instance binding JSON', report.instanceBindingJsonTarget],
      ['Proof vector', report.proofVectorTarget],
    ]),
    '',
    '## Bound Instance Identity',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['sidechainId', report.identity.sidechainIdHex],
      ['sidechainTxHash', report.identity.sidechainTxHashHex],
      ['sidechainBlockHash', report.identity.sidechainBlockHashHex],
      ['eventIndex', String(report.identity.eventIndex)],
      ['bridgeEventRoot', report.identity.bridgeEventRootHex],
      ['ergoAnchorHeight', String(report.identity.ergoAnchorHeight)],
      ['burnId', report.identity.burnIdHex],
      ['duplicatePreventionKey', report.identity.duplicatePreventionKeyHex],
      ['recipientErgoTreeHash', report.identity.recipientErgoTreeHashHex],
      ['amountNanoErg', report.identity.amountNanoErg],
      ['assetId', report.identity.assetIdHex],
    ]),
    '',
    '## Source Checks',
    '',
    markdownTable([
      ['Check', 'Status', 'Detail'],
      ...report.sourceChecks.map(check => [check.check, check.status, check.detail]),
    ]),
    '',
    '## Positive Contract-Equivalent Acceptance',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Accepted', report.positiveAcceptance.accepted ? 'yes' : 'no'],
      ['Observed errors', report.positiveAcceptance.errors.length === 0 ? 'none' : report.positiveAcceptance.errors.join('; ')],
      ['Derived tracker key', report.positiveAcceptance.derived.trackerKeyHex],
      ['Derived Merkle root', report.positiveAcceptance.derived.merkleRootHex],
      ['Burn proof node count', String(report.positiveAcceptance.derived.burnProofNodeCount)],
      ['DUP lookup proof length', String(report.positiveAcceptance.derived.dupLookupProofLength)],
      ['Ergo anchor height', String(report.positiveAcceptance.derived.ergoAnchorHeight)],
    ]),
    '',
    '## Negative Contract-Equivalent Rejection Checks',
    '',
    markdownTable([
      ['Case', 'Status', 'Expected error', 'Observed errors'],
      ...report.negativeCases.map(test => [
        test.name,
        test.status,
        test.expectedError,
        test.observedErrors.join('; '),
      ]),
    ]),
    '',
    '## Next Evidence',
    '',
    ...report.nextEvidence.map(item => `- ${escapeMarkdownText(item)}`),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ...Object.entries(report.boundary),
    ]),
    '',
  ].join('\n');
}

export function validateTrustlessBurnContractAcceptanceReportJson(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['--trustless-burn-contract-acceptance-json report must be an object'];
  if (value.schemaVersion !== 1) errors.push('--trustless-burn-contract-acceptance-json report.schemaVersion must be 1');
  if (value.status !== 'PASS' && value.status !== 'BLOCKED') {
    errors.push('--trustless-burn-contract-acceptance-json report.status must be PASS or BLOCKED');
  }
  if (value.status === 'PASS' && value.exitCode !== 0) {
    errors.push('--trustless-burn-contract-acceptance-json PASS report.exitCode must be 0');
  }
  if (value.status === 'BLOCKED' && value.exitCode !== 1) {
    errors.push('--trustless-burn-contract-acceptance-json BLOCKED report.exitCode must be 1');
  }
  for (const field of ['command', 'sourceCommit', 'candidateTarget', 'instanceBindingJsonTarget', 'proofVectorTarget', 'selectedNetwork']) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      errors.push(`--trustless-burn-contract-acceptance-json report.${field} must be a non-empty string`);
    }
  }
  if (typeof value.sourceCommit === 'string' && !/^[0-9a-f]{7,40}$/i.test(value.sourceCommit)) {
    errors.push('--trustless-burn-contract-acceptance-json report.sourceCommit must be a 7-40 character hex identifier');
  }
  if (!isNonNegativeSafeInteger(value.currentErgoHeight)) {
    errors.push('--trustless-burn-contract-acceptance-json report.currentErgoHeight must be a non-negative safe integer');
  }
  if (!isNonNegativeSafeInteger(value.sidechainHeight)) {
    errors.push('--trustless-burn-contract-acceptance-json report.sidechainHeight must be a non-negative safe integer');
  }
  if (!isNonNegativeSafeInteger(value.structuralIssues)) {
    errors.push('--trustless-burn-contract-acceptance-json report.structuralIssues must be a non-negative safe integer');
  }
  if (value.status === 'PASS' && value.structuralIssues !== 0) {
    errors.push('--trustless-burn-contract-acceptance-json PASS report.structuralIssues must be 0');
  }
  validateIdentity(value.identity, errors);
  validateChecks(value.sourceChecks, 'sourceChecks', errors);
  validatePositive(value.positiveAcceptance, errors);
  validateNegativeCases(value.negativeCases, errors);
  validateStringArray(value.nextEvidence, 'nextEvidence', errors);
  validateBoundary(value.boundary, errors);
  if (findLocalPathLeak(value)) {
    errors.push('--trustless-burn-contract-acceptance-json report must not serialize local absolute paths');
  }
  return errors;
}

function buildPositiveAcceptanceInput(input: {
  identity: TrustlessBurnInstanceIdentity;
  vector: TrustlessBurnProofVectorFile;
  targetLeaf: TrustlessBurnLeafInput | undefined;
  sidechainHeight: number;
  currentErgoHeight: number;
}): TrustlessBurnContractAcceptanceInput | undefined {
  const recipientErgoTreeHex = input.vector.expected?.settlementBinding?.recipientErgoTreeHex;
  if (
    !input.targetLeaf ||
    !Array.isArray(input.vector.expected?.proof) ||
    typeof recipientErgoTreeHex !== 'string' ||
    !Number.isSafeInteger(input.sidechainHeight) ||
    input.sidechainHeight < 0
  ) {
    return undefined;
  }
  const proofBundleHex = buildTrustlessBurnProofBundle({
    sidechainHeight: input.sidechainHeight,
    proof: input.vector.expected.proof,
  });
  const trackerKeyHex = deriveTrustlessSpvTrackerKeyHex({
    sidechainIdHex: input.targetLeaf.sidechainIdHex,
    sidechainHeight: input.sidechainHeight,
    sidechainBlockHashHex: input.targetLeaf.sidechainBlockHashHex,
  });
  const trackerValueHex = buildTrustlessTrackerValueHex({
    bridgeEventRootHex: input.vector.expected.bridgeEventRootHex,
    ergoAnchorHeight: input.identity.ergoAnchorHeight,
  });
  return {
    leaf: input.targetLeaf,
    bridgeEventRootHex: input.vector.expected.bridgeEventRootHex,
    proofBundleHex,
    trackerKeyHex,
    trackerValueHex,
    recipientErgoTreeHex,
    payoutValueNanoErg: input.vector.expected.settlementBinding.amountNanoErg,
    currentErgoHeight: input.currentErgoHeight,
  };
}

function buildNegativeCaseResults(
  positiveInput: TrustlessBurnContractAcceptanceInput,
  ergoAnchorHeight: number,
  sidechainHeight: number,
): TrustlessBurnContractNegativeCaseResult[] {
  const staleAnchorHeight = Math.max(0, ergoAnchorHeight + 9);
  const malformedProofBundle = buildTrustlessBurnProofBundle({
    sidechainHeight,
    proof: [{ side: 'right', hashHex: 'aa'.repeat(32) }],
  });
  const badSideBundle = Buffer.from(positiveInput.proofBundleHex, 'hex');
  if (badSideBundle.length > 24) badSideBundle[24] = 2;
  const cases: Array<{
    name: string;
    expectedError: string;
    input: TrustlessBurnContractAcceptanceInput;
  }> = [
    {
      name: 'tracker-event-root-drift',
      expectedError: 'burn inclusion proof must resolve to bridgeEventRoot',
      input: {
        ...positiveInput,
        trackerValueHex: buildTrustlessTrackerValueHex({
          bridgeEventRootHex: 'aa'.repeat(32),
          ergoAnchorHeight,
        }),
      },
    },
    {
      name: 'malformed-inclusion-path',
      expectedError: 'burn inclusion proof must resolve to bridgeEventRoot',
      input: { ...positiveInput, proofBundleHex: malformedProofBundle },
    },
    {
      name: 'stale-ergo-anchor',
      expectedError: 'Ergo anchor height must satisfy minimum confirmations',
      input: { ...positiveInput, currentErgoHeight: staleAnchorHeight },
    },
    {
      name: 'payout-value-drift',
      expectedError: 'payout value must equal proved amountNanoErg',
      input: { ...positiveInput, payoutValueNanoErg: '1999999' },
    },
    {
      name: 'recipient-tree-drift',
      expectedError: 'leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane',
      input: { ...positiveInput, recipientErgoTreeHex: `0008cd02${'55'.repeat(32)}` },
    },
    {
      name: 'tracker-key-drift',
      expectedError: 'leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane',
      input: { ...positiveInput, trackerKeyHex: 'bb'.repeat(32) },
    },
    {
      name: 'spent-dup-key',
      expectedError: 'DUP key must not already be spent',
      input: { ...positiveInput, dupKeyAlreadySpent: true },
    },
    {
      name: 'bad-proof-side-byte',
      expectedError: 'burn proof side bytes must be 0 or 1',
      input: { ...positiveInput, proofBundleHex: badSideBundle.toString('hex') },
    },
  ];
  return cases.map(test => {
    const result = evaluateTrustlessBurnContractAcceptance(test.input);
    return {
      name: test.name,
      status: !result.accepted && result.errors.includes(test.expectedError) ? 'REJECTED' : 'BLOCKED',
      expectedError: test.expectedError,
      observedErrors: result.errors,
    };
  });
}

function compareBindingToProofVector(
  identity: TrustlessBurnInstanceIdentity,
  vector: TrustlessBurnProofVectorFile,
  targetLeaf: TrustlessBurnLeafInput | undefined,
): TrustlessBurnContractAcceptanceCheck[] {
  const checks: TrustlessBurnContractAcceptanceCheck[] = [];
  const expected = vector.expected;
  addCheck(checks, 'Target proof-vector leaf is present', targetLeaf !== undefined, `burnId ${vector.targetBurnIdHex}`, 'proof vector target leaf must be present');
  if (!targetLeaf || !expected) return checks;
  const comparisons: Array<[string, unknown, unknown]> = [
    ['sidechainId', identity.sidechainIdHex, targetLeaf.sidechainIdHex],
    ['sidechainTxHash', identity.sidechainTxHashHex, targetLeaf.sidechainTxHashHex],
    ['sidechainBlockHash', identity.sidechainBlockHashHex, targetLeaf.sidechainBlockHashHex],
    ['eventIndex', identity.eventIndex, targetLeaf.eventIndex],
    ['bridgeEventRoot', identity.bridgeEventRootHex, expected.bridgeEventRootHex],
    ['burnId', identity.burnIdHex, targetLeaf.burnIdHex],
    ['duplicatePreventionKey', identity.duplicatePreventionKeyHex, expected.settlementBinding?.duplicatePreventionKeyHex],
    ['recipientErgoTreeHash', identity.recipientErgoTreeHashHex, expected.settlementBinding?.recipientErgoTreeHashHex],
    ['amountNanoErg', identity.amountNanoErg, String(expected.settlementBinding?.amountNanoErg ?? '')],
    ['assetId', identity.assetIdHex, expected.settlementBinding?.assetIdHex],
  ];
  for (const [field, actual, expectedValue] of comparisons) {
    addCheck(
      checks,
      `Instance ${field} matches proof vector`,
      actual === expectedValue,
      `${field} ${actual}`,
      `${field} must match proof vector value ${String(expectedValue)}`,
    );
  }
  return checks;
}

function findTargetLeaf(vector: TrustlessBurnProofVectorFile): TrustlessBurnLeafInput | undefined {
  return Array.isArray(vector.leaves)
    ? vector.leaves.find(leaf => leaf.burnIdHex === vector.targetBurnIdHex)
    : undefined;
}

function buildNextEvidence(identity: TrustlessBurnInstanceIdentity): string[] {
  return [
    `Use this local predicate-model packet only as prerequisite evidence for burnId ${identity.burnIdHex}.`,
    'Next useful step is real non-broadcast ErgoScript VM acceptance for the same proof bundle, or a formal decision that the ContextExtension serialization blocker prevents live settlement evaluation until upstream conformance is resolved.',
    'Do not mark Gate 5 closed until mined 0x04 anchoring, Ergo-verifiable finality, on-chain proof acceptance, DUP insertion/replay rejection, stale/reorg rejection, and independent review are all captured.',
  ];
}

function buildBoundary(): Record<string, 'yes' | 'no'> {
  return {
    'Contract-equivalent local predicate model evaluated': 'yes',
    'Current Gate 5 non-mainnet instance reused': 'yes',
    'Positive proof bundle checked by local predicate model': 'yes',
    'Negative predicate cases checked locally': 'yes',
    'Secret or environment file read': 'no',
    'Wallet recovery material or private key read': 'no',
    'Runtime database opened': 'no',
    'Private deployment state opened': 'no',
    'Node or RPC request performed': 'no',
    'ErgoScript VM execution performed': 'no',
    'On-chain proof acceptance claimed': 'no',
    'Mined Ergo anchor claimed': 'no',
    'Sidechain finality claimed': 'no',
    'DUP insertion on-chain claimed': 'no',
    'Transaction check performed': 'no',
    'Expected transaction ID claimed': 'no',
    'Transaction signing performed or authorized': 'no',
    'Transaction submit or broadcast performed or authorized': 'no',
    'Gate 5 trustless-burn evidence claimed complete': 'no',
    'Release gate PASS claimed': 'no',
    'Testnet production-candidate claim support': 'no',
    'Production-ready claim support': 'no',
    'Mainnet-grade evidence linked': 'no',
  };
}

function addCheck(
  checks: TrustlessBurnContractAcceptanceCheck[],
  check: string,
  ok: boolean,
  passDetail: string,
  blockedDetail: string,
): void {
  checks.push({
    check: sanitize(check),
    status: ok ? 'pass' : 'blocked',
    detail: sanitize(ok ? passDetail : blockedDetail),
  });
}

function validateIdentity(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--trustless-burn-contract-acceptance-json report.identity must be an object');
    return;
  }
  for (const field of [
    'sidechainIdHex',
    'sidechainTxHashHex',
    'sidechainBlockHashHex',
    'bridgeEventRootHex',
    'burnIdHex',
    'duplicatePreventionKeyHex',
    'recipientErgoTreeHashHex',
    'assetIdHex',
  ]) {
    if (!isHex32(value[field])) {
      errors.push(`--trustless-burn-contract-acceptance-json report.identity.${field} must be a 32-byte hex string`);
    }
  }
  if (!isNonNegativeSafeInteger(value.eventIndex)) {
    errors.push('--trustless-burn-contract-acceptance-json report.identity.eventIndex must be a non-negative safe integer');
  }
  if (!isNonNegativeSafeInteger(value.ergoAnchorHeight)) {
    errors.push('--trustless-burn-contract-acceptance-json report.identity.ergoAnchorHeight must be a non-negative safe integer');
  }
  if (typeof value.amountNanoErg !== 'string' || !/^[1-9][0-9]*$/.test(value.amountNanoErg)) {
    errors.push('--trustless-burn-contract-acceptance-json report.identity.amountNanoErg must be a positive decimal string');
  }
}

function validateChecks(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`--trustless-burn-contract-acceptance-json report.${field} must be a non-empty array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`--trustless-burn-contract-acceptance-json report.${field}[${index}] must be an object`);
      continue;
    }
    if (typeof item.check !== 'string' || item.check.trim().length === 0) {
      errors.push(`--trustless-burn-contract-acceptance-json report.${field}[${index}].check must be a non-empty string`);
    }
    if (item.status !== 'pass' && item.status !== 'blocked') {
      errors.push(`--trustless-burn-contract-acceptance-json report.${field}[${index}].status must be pass or blocked`);
    }
    if (typeof item.detail !== 'string' || item.detail.trim().length === 0) {
      errors.push(`--trustless-burn-contract-acceptance-json report.${field}[${index}].detail must be a non-empty string`);
    }
  }
}

function validatePositive(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('--trustless-burn-contract-acceptance-json report.positiveAcceptance must be an object');
    return;
  }
  if (typeof value.accepted !== 'boolean') {
    errors.push('--trustless-burn-contract-acceptance-json report.positiveAcceptance.accepted must be boolean');
  }
  validateStringArray(value.errors, 'positiveAcceptance.errors', errors, { allowEmpty: true });
  if (!isRecord(value.derived)) {
    errors.push('--trustless-burn-contract-acceptance-json report.positiveAcceptance.derived must be an object');
  }
}

function validateNegativeCases(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('--trustless-burn-contract-acceptance-json report.negativeCases must be a non-empty array');
    return;
  }
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`--trustless-burn-contract-acceptance-json report.negativeCases[${index}] must be an object`);
      continue;
    }
    if (typeof item.name !== 'string' || item.name.trim().length === 0) {
      errors.push(`--trustless-burn-contract-acceptance-json report.negativeCases[${index}].name must be a non-empty string`);
    }
    if (item.status !== 'REJECTED' && item.status !== 'BLOCKED') {
      errors.push(`--trustless-burn-contract-acceptance-json report.negativeCases[${index}].status must be REJECTED or BLOCKED`);
    }
    if (typeof item.expectedError !== 'string' || item.expectedError.trim().length === 0) {
      errors.push(`--trustless-burn-contract-acceptance-json report.negativeCases[${index}].expectedError must be a non-empty string`);
    }
    validateStringArray(item.observedErrors, `negativeCases[${index}].observedErrors`, errors);
  }
}

function validateStringArray(
  value: unknown,
  field: string,
  errors: string[],
  options: { allowEmpty?: boolean } = {},
): void {
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.some(entry => typeof entry !== 'string' || (!options.allowEmpty && entry.trim().length === 0))
  ) {
    errors.push(`--trustless-burn-contract-acceptance-json report.${field} must be a${options.allowEmpty ? '' : ' non-empty'} string array`);
  }
}

function validateBoundary(value: unknown, errors: string[]): void {
  const expected = buildBoundary();
  if (!isRecord(value)) {
    errors.push('--trustless-burn-contract-acceptance-json report.boundary must be an object');
    return;
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      errors.push(`--trustless-burn-contract-acceptance-json report.boundary.${field} must be ${expectedValue}`);
    }
  }
}

function extractNumericField(markdown: string, field: string): number {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|`, 'im'));
  const numberMatch = match?.[1]?.match(/\b([0-9]+)\b/);
  return numberMatch ? Number(numberMatch[1]) : Number.NaN;
}

function markdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  return [
    markdownTableRow(header),
    markdownTableRow(header.map(() => '---')),
    ...body.map(markdownTableRow),
  ].join('\n');
}

function markdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeMarkdownTableCell).join(' | ')} |`;
}

function escapeMarkdownTableCell(value: string): string {
  return escapeMarkdownText(value).replace(/\|/g, '\\|');
}

function escapeMarkdownText(value: string): string {
  return sanitize(value).replace(/\r?\n/g, '<br>');
}

function sanitize(value: string): string {
  return sanitizeReportText(value).trim();
}

function emptyIdentity(): TrustlessBurnInstanceIdentity {
  return {
    sidechainIdHex: '',
    sidechainTxHashHex: '',
    sidechainBlockHashHex: '',
    eventIndex: -1,
    bridgeEventRootHex: '',
    ergoAnchorHeight: -1,
    burnIdHex: '',
    duplicatePreventionKeyHex: '',
    recipientErgoTreeHashHex: '',
    amountNanoErg: '',
    assetIdHex: '',
    proofVectorTarget: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex32(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function findLocalPathLeak(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /\b[A-Za-z]:[\\/]/.test(value) || /file:\/\/\//i.test(value) || /\\\\[^\\]/.test(value)
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const leaked = findLocalPathLeak(item);
      if (leaked) return leaked;
    }
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const leaked = findLocalPathLeak(item);
      if (leaked) return leaked;
    }
  }
  return undefined;
}
