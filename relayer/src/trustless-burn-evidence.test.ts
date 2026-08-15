import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  parseRequiredComponentRows,
  validateTrustlessBurnEvidence,
} from './trustless-burn-evidence.js';
import {
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
  getSpvTrackerDigest,
  toSpvTrackerHistoryEntry,
  type SpvTrackerEntry,
} from './spv-tracker.js';

const SIDECHAIN_ID = '1'.repeat(64);
const SIDECHAIN_HEADER_HASH = '2'.repeat(64);
const BURN_ID = '30fdd8b62a27a8848c2509f978fa6de5b0403e61673e16ff1fcc86a7af282d48';
const RECIPIENT_ERGO_TREE_HASH = '5'.repeat(64);
const SIDECHAIN_TX_HASH = '6'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '7'.repeat(64);
const DUP_KEY = BURN_ID;
const ASSET_ID = '0'.repeat(64);
const TRUSTLESS_BURN_LEAVES: TrustlessBurnLeafInput[] = [
  {
    sidechainIdHex: SIDECHAIN_ID,
    sidechainBlockHashHex: SIDECHAIN_BLOCK_HASH,
    burnIdHex: BURN_ID,
    sidechainTxHashHex: SIDECHAIN_TX_HASH,
    eventIndex: 0,
    recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
    amountNanoErg: '1000000',
    assetIdHex: ASSET_ID,
  },
  {
    sidechainIdHex: SIDECHAIN_ID,
    sidechainBlockHashHex: SIDECHAIN_BLOCK_HASH,
    burnIdHex: '36ce2d229ea2e54750c8b08c8577b487c1f2d27b43e3777e5bd1f8e569c08425',
    sidechainTxHashHex: 'a'.repeat(64),
    eventIndex: 1,
    recipientErgoTreeHashHex: 'b'.repeat(64),
    amountNanoErg: '2000000',
    assetIdHex: ASSET_ID,
  },
];
const TRUSTLESS_BURN_PROOF = buildTrustlessBurnInclusionProof(TRUSTLESS_BURN_LEAVES, BURN_ID);
const BRIDGE_EVENT_ROOT = TRUSTLESS_BURN_PROOF.bridgeEventRootHex;
const completedAnchorObservationReportTarget =
  'test-vectors/trustless-anchor-observation-report.json';
const completedSpvTrackerObservationReportTarget =
  'test-vectors/trustless-spv-tracker-observation-report.json';
const completedObservationReconciliationReportTarget =
  'test-vectors/trustless-observation-reconciliation-report.json';

const SPV_TRACKER_ENTRY: SpvTrackerEntry = {
  sidechainIdHex: SIDECHAIN_ID,
  sidechainHeight: 12345,
  sidechainHeaderHashHex: SIDECHAIN_HEADER_HASH,
  bridgeEventRootHex: BRIDGE_EVENT_ROOT,
  ergoAnchorHeight: 67890,
};
const SPV_TRACKER_SIDECHAIN_HEIGHT = Number(SPV_TRACKER_ENTRY.sidechainHeight);

const componentRows = [
  ['Sidechain commitment format', 'Stable, versioned, sidechain-specific commitment format'],
  ['Ergo extension-section anchoring', 'Commitment embedded under collision-safe 0x04xx extension keys'],
  ['Sidechain header/finality verifier', 'Ergo-verifiable sidechain header finality rule'],
  ['SPV relay contract or tracker', 'SPV relay with authenticated commitment history'],
  ['Burn commitment tree', 'Burn commitment tree using Blake2b-compatible hashing'],
  ['Burn inclusion proof', 'On-chain proof accepts only included burn events'],
  ['DUP settlement binding', 'DUP key binds settlement to the proved burn'],
  ['Reorg handling', 'Reorged sidechain commitments cannot release ERG'],
  ['Independent review', 'Independent consensus commitment proof and operator recovery review'],
].map(([component, property]) =>
  `| ${component} | ${property} | artifact://trustless-burn/completed-component-${slug(component)}.log${component === 'Ergo extension-section anchoring' ? `; Anchor observation report: ${completedAnchorObservationReportTarget}; Observation reconciliation report: ${completedObservationReconciliationReportTarget}` : ''}${component === 'SPV relay contract or tracker' ? `; SPV tracker observation report: ${completedSpvTrackerObservationReportTarget}; Observation reconciliation report: ${completedObservationReconciliationReportTarget}` : ''} | linked |`,
).join('\n');

const commitmentRows = [
  ['sidechainId', `${SIDECHAIN_ID} fixed-width sidechain identifier`],
  ['sidechainHeight', '12345'],
  ['sidechainHeaderHash', `${SIDECHAIN_HEADER_HASH} 32-byte sidechain header hash`],
  ['bridgeEventRoot', `${BRIDGE_EVENT_ROOT} 32-byte bridge event root`],
  ['ergoAnchorHeight', '67890'],
  ['commitmentPrefix', '0x04xx sidechain extension keyspace prefix'],
  ['hashFunction', 'Blake2b-256 compatible digest'],
  ['finalityRule', 'reviewed sidechain header finality rule'],
].map(([field, value]) => `| ${field} | ${value} | artifact://trustless-burn/completed-commitment-${slug(field)}.json | linked |`).join('\n');

const burnProofRows = [
  ['burnId', `${BURN_ID} burn identifier included in the proved leaf`],
  ['recipientErgoTreeHash', `${RECIPIENT_ERGO_TREE_HASH} binds the payout recipient to the proved leaf`],
  ['amountNanoErg', '1000000 binds the payout amount to the proved leaf'],
  ['sidechainTxHash', `${SIDECHAIN_TX_HASH} binds the source sidechain transaction hash`],
  ['sidechainBlockHash', `${SIDECHAIN_BLOCK_HASH} binds the source sidechain block hash`],
  ['eventIndex', '0 binds the burn event index in the block'],
  ['inclusionPath', 'verifies burn inclusion against the committed burn tree root'],
  ['duplicatePreventionKey', `${DUP_KEY} DUP duplicate-prevention key is derived from the burn identifier`],
  ['settlementTxBinding', 'settlement transaction payout recipient and amount are derived from the proof'],
].map(([field, binding]) => `| ${field} | ${binding} | artifact://trustless-burn/completed-burn-proof-${slug(field)}.json | linked |`).join('\n');

const validPositiveProofEvidence =
  `artifact://trustless-burn/completed-valid-burn-proof-acceptance.log; burnId ${BURN_ID}; ` +
  `bridgeEventRoot ${BRIDGE_EVENT_ROOT}; sidechainTxHash ${SIDECHAIN_TX_HASH}; ` +
  `sidechainBlockHash ${SIDECHAIN_BLOCK_HASH}; eventIndex 0; duplicatePreventionKey ${DUP_KEY}; ` +
  `burn proof inclusion accepted; DUP duplicate-prevention key inserted; ` +
  `settlement transaction binding matched; recipient ${RECIPIENT_ERGO_TREE_HASH}; amount 1000000 payout matched`;

function contractAcceptanceBoundary(): Record<string, 'yes' | 'no'> {
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

function contractAcceptanceReport(overrides: {
  bridgeEventRootHex?: string;
  negativeCaseStatus?: 'REJECTED' | 'BLOCKED';
} = {}): Record<string, unknown> {
  const bridgeEventRootHex = overrides.bridgeEventRootHex ?? BRIDGE_EVENT_ROOT;
  const negativeCaseStatus = overrides.negativeCaseStatus ?? 'REJECTED';
  return {
    schemaVersion: 1,
    status: 'PASS',
    exitCode: 0,
    command: 'npm run trustless:contract-acceptance -- --source-commit ace3896d',
    sourceCommit: 'ace3896d',
    candidateTarget: '../evidence/trustless-burn/completed-gate5-candidate.md',
    instanceBindingJsonTarget: '../evidence/trustless-burn/artifacts/completed-instance-binding.json',
    proofVectorTarget: 'test-vectors/trustless-burn-proof-v1-multi-leaf-recipient-tree.json',
    currentErgoHeight: 67900,
    sidechainHeight: 12345,
    selectedNetwork: 'local offline non-mainnet',
    identity: {
      sidechainIdHex: SIDECHAIN_ID,
      sidechainTxHashHex: SIDECHAIN_TX_HASH,
      sidechainBlockHashHex: SIDECHAIN_BLOCK_HASH,
      eventIndex: 0,
      bridgeEventRootHex,
      ergoAnchorHeight: 67890,
      burnIdHex: BURN_ID,
      duplicatePreventionKeyHex: DUP_KEY,
      recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
      amountNanoErg: '1000000',
      assetIdHex: ASSET_ID,
    },
    structuralIssues: 0,
    sourceChecks: [
      {
        check: 'Instance binding JSON validates',
        status: 'pass',
        detail: 'synthetic test binding target',
      },
    ],
    positiveAcceptance: {
      accepted: true,
      errors: [],
      derived: {
        trackerKeyHex: '9'.repeat(64),
        merkleRootHex: bridgeEventRootHex,
        burnProofNodeCount: 1,
        dupLookupProofLength: 0,
        ergoAnchorHeight: 67890,
      },
    },
    negativeCases: [
      'tracker-event-root-drift',
      'malformed-inclusion-path',
      'stale-ergo-anchor',
      'payout-value-drift',
      'recipient-tree-drift',
      'tracker-key-drift',
      'spent-dup-key',
      'bad-proof-side-byte',
    ].map(name => ({
      name,
      status: negativeCaseStatus,
      expectedError: `${name} expected rejection`,
      observedErrors: [`${name} expected rejection`],
    })),
    nextEvidence: ['local predicate packet remains prerequisite evidence only'],
    boundary: contractAcceptanceBoundary(),
  };
}

function localProofVector(overrides: {
  bridgeEventRootHex?: string;
  duplicatePreventionKeyHex?: string;
  recipientErgoTreeHashHex?: string;
  amountNanoErg?: string;
  proof?: TrustlessBurnMerkleProofStep[];
  negativeCases?: unknown;
  omitNegativeCases?: boolean;
  omitLeaf?: boolean;
  extra?: Record<string, unknown>;
  leafExtra?: Record<string, unknown>;
  negativeCaseExtra?: Record<string, unknown>;
} = {}): string {
  const negativeCases = trustlessBurnNegativeCases().map((negativeCase, index) => (
    index === 0 && overrides.negativeCaseExtra
      ? { ...negativeCase, ...overrides.negativeCaseExtra }
      : negativeCase
  ));
  const vector = {
    ...(overrides.omitLeaf
      ? {}
      : {
        leaf: {
          ...TRUSTLESS_BURN_LEAVES[0],
          ...(overrides.leafExtra ?? {}),
        },
      }),
    bridgeEventRootHex: overrides.bridgeEventRootHex ?? TRUSTLESS_BURN_PROOF.bridgeEventRootHex,
    proof: overrides.proof ?? TRUSTLESS_BURN_PROOF.proof,
    duplicatePreventionKeyHex: overrides.duplicatePreventionKeyHex ?? DUP_KEY,
    recipientErgoTreeHashHex: overrides.recipientErgoTreeHashHex ?? RECIPIENT_ERGO_TREE_HASH,
    amountNanoErg: overrides.amountNanoErg ?? '1000000',
    assetIdHex: ASSET_ID,
    ...(overrides.omitNegativeCases ? {} : { negativeCases: overrides.negativeCases ?? negativeCases }),
    ...(overrides.extra ?? {}),
  };

  return `\`\`\`json
${JSON.stringify(vector, null, 2)}
\`\`\``;
}

function localProofVectorReport(overrides: Record<string, unknown> = {}) {
  const negativeCaseResults = trustlessBurnNegativeCases().map(negativeCase => ({
    name: negativeCase.name,
    status: 'REJECTED',
    expectedErrors: negativeCase.expectedErrors,
    observedErrors: negativeCase.expectedErrors,
  }));

  return {
    schemaVersion: 1,
    command: 'trustless:proof-vector:validate',
    status: 'PASS',
    errors: [],
    boundary: {
      readOnly: true,
      localProofCoreOnly: true,
      gate5Closure: false,
      settlementReadiness: false,
      broadcastAuthorization: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    reports: [
      {
        label: 'test-vectors/trustless-burn-proof-v1-multi-leaf.json',
        status: 'PASS',
        message:
          'Trustless burn proof vector PASS: leafCount=2, proofNodes=1, gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.',
        errors: [],
        bridgeEventRootHex: BRIDGE_EVENT_ROOT,
        leafHashHex: TRUSTLESS_BURN_PROOF.leaf.leafHashHex,
        leafCount: TRUSTLESS_BURN_LEAVES.length,
        proofNodeCount: TRUSTLESS_BURN_PROOF.proof.length,
        negativeCaseResults,
        ...overrides,
      },
    ],
  };
}

function trustlessBurnNegativeCases() {
  const settlementBinding = {
    duplicatePreventionKeyHex: DUP_KEY,
    recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
    amountNanoErg: '1000000',
    assetIdHex: ASSET_ID,
  };

  return [
    {
      name: 'wrong-sidechain-id',
      leaf: {
        ...TRUSTLESS_BURN_LEAVES[0],
        sidechainIdHex: '2'.repeat(64),
      },
      settlementBinding,
      expectedErrors: ['burnId must equal derived sidechain event identity'],
    },
    {
      name: 'wrong-burn-id',
      leaf: {
        ...TRUSTLESS_BURN_LEAVES[0],
        burnIdHex: 'a'.repeat(64),
      },
      settlementBinding,
      expectedErrors: ['burnId must equal derived sidechain event identity'],
    },
    {
      name: 'wrong-event-index',
      leaf: {
        ...TRUSTLESS_BURN_LEAVES[0],
        eventIndex: 1,
      },
      settlementBinding,
      expectedErrors: ['burnId must equal derived sidechain event identity'],
    },
    {
      name: 'wrong-recipient',
      settlementBinding: {
        ...settlementBinding,
        recipientErgoTreeHashHex: '8'.repeat(64),
      },
      expectedErrors: ['settlement recipient must equal proved recipientErgoTreeHash'],
    },
    {
      name: 'wrong-amount',
      settlementBinding: {
        ...settlementBinding,
        amountNanoErg: '2000000',
      },
      expectedErrors: ['settlement amount must equal proved amountNanoErg'],
    },
    {
      name: 'wrong-duplicate-prevention-key',
      settlementBinding: {
        ...settlementBinding,
        duplicatePreventionKeyHex: '8'.repeat(64),
      },
      expectedErrors: ['duplicatePreventionKey must equal burnId'],
    },
    {
      name: 'wrong-bridge-event-root',
      settlementBinding: {
        ...settlementBinding,
        bridgeEventRootHex: 'a'.repeat(64),
      },
      expectedErrors: ['burn inclusion proof must resolve to bridgeEventRoot'],
    },
    {
      name: 'malformed-inclusion-path',
      settlementBinding: {
        ...settlementBinding,
        proof: [{ side: 'right', hashHex: 'a'.repeat(64) }],
      },
      expectedErrors: ['burn inclusion proof must resolve to bridgeEventRoot'],
    },
  ];
}

const positiveRows = [
  [
    'Valid burn proof acceptance',
    'accepted',
    validPositiveProofEvidence,
  ],
].map(([check, expected, evidence]) => `| ${check} | ${expected} | ${evidence} | linked |`).join('\n');

const localNegativeRowEvidenceFacts: Record<string, string> = {
  'Wrong sidechain ID':
    'negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity',
  'Wrong recipient':
    'negativeCase wrong-recipient observed error settlement recipient must equal proved recipientErgoTreeHash',
  'Wrong amount':
    'negativeCase wrong-amount observed error settlement amount must equal proved amountNanoErg',
  'Reused burn ID': [
    'negativeCase wrong-burn-id observed error burnId must equal derived sidechain event identity',
    'negativeCase wrong-event-index observed error burnId must equal derived sidechain event identity',
    'negativeCase wrong-duplicate-prevention-key observed error duplicatePreventionKey must equal burnId',
  ].join('; '),
  'Stale SPV tracker digest':
    'negativeCase wrong-bridge-event-root observed error burn inclusion proof must resolve to bridgeEventRoot',
  'Malformed inclusion path':
    'negativeCase malformed-inclusion-path observed error burn inclusion proof must resolve to bridgeEventRoot',
};

const negativeRows = [
  'Wrong sidechain ID',
  'Wrong recipient',
  'Wrong amount',
  'Reused burn ID',
  'Reorged sidechain block',
  'Unfinalized sidechain block',
  'Stale SPV tracker digest',
  'Wrong Ergo anchor height',
  'Malformed inclusion path',
  'Trusted-oracle fallback presented as trustless',
].map(check =>
  `| ${check} | rejected | artifact://trustless-burn/completed-negative-${slug(check)}.log; rejected burnId ${BURN_ID}${localNegativeRowEvidenceFacts[check] ? `; ${localNegativeRowEvidenceFacts[check]}` : ''} | linked |`,
).join('\n');

const reviewerRows = [
  'Protocol reviewer',
  'Security reviewer',
  'Operator reviewer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |`).join('\n');

const completedLocalProofVectorReportTarget =
  'test-vectors/trustless-burn-evidence-local-proof-vector-report.json';

function anchorObservationReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    command: 'trustless:anchor-observe',
    status: 'LINKED',
    reason: 'matching 0x0401 bridgeEventRoot observed',
    bridgeEventRootHex: BRIDGE_EVENT_ROOT,
    extensionKey: '0401',
    minHeight: 67890,
    maxHeight: 67890,
    observedAt: '2026-07-01T12:00:00.000Z',
    sourceLabel: 'provided public extension observation JSON',
    network: 'testnet',
    nodeUrl: 'https://ergo-node.invalid',
    commandLine: 'npm run trustless:anchor-observe -- --bridge-event-root <bridgeEventRoot> --observations-json <observations.json> --min-height 67890 --max-height 67890 --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    heightsScanned: 1,
    extensionReadsSucceeded: 1,
    extensionReadsFailed: 0,
    linkedAnchor: {
      key: '0401',
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: 67890,
      headerId: '7'.repeat(64),
    },
    readFailures: [],
    boundary: {
      readOnly: true,
      publicObservationInputOnly: true,
      deploymentStateOpened: false,
      runtimeDatabaseOpened: false,
      secretOrEnvironmentFileRead: false,
      signingOrWalletMaterialRead: false,
      transactionBroadcastOrMutation: false,
      gate5Closure: false,
      settlementReadiness: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    ...overrides,
  };
}

function spvTrackerObservationReport(overrides: Record<string, unknown> = {}) {
  const history = [toSpvTrackerHistoryEntry(SPV_TRACKER_ENTRY)];
  const expectedKeyHex = deriveSpvTrackerKey(SPV_TRACKER_ENTRY);
  const expectedValueHex = encodeSpvTrackerValue(SPV_TRACKER_ENTRY);
  const trackerDigestHex = getSpvTrackerDigest(history);

  return {
    schemaVersion: 1,
    command: 'trustless:spv-tracker-observe',
    status: 'LINKED',
    reason: 'SPV tracker history contains expected sidechain commitment entry',
    observedAt: '2026-07-02T12:00:00.000Z',
    sourceLabel: 'operator sanitized SPV tracker observation',
    network: 'testnet',
    nodeUrl: 'https://ergo-node.invalid',
    commandLine: 'npm run trustless:spv-tracker-observe -- --observation-json <observation.json> --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    trackerBox: {
      boxId: '4'.repeat(64),
      nftId: '5'.repeat(64),
    },
    expectedEntry: SPV_TRACKER_ENTRY,
    historyLength: 1,
    trackerDigestHex,
    rebuiltTrackerDigestHex: trackerDigestHex,
    expectedKeyHex,
    expectedValueHex,
    observedValueHex: expectedValueHex,
    proofDigestHex: trackerDigestHex,
    getProofHex:
      '0328f4f2ef4172093d2e6d5128e7ce0f035e240b98ff2014444dbc361da0f006610246bfd6977e3c170fa567da9fd95d79d3e0232c3da99a4dc4194910328789dbdbffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff3089254893ba812d1703febf2372a55757ab8a1aa3cd86c2cdcbd39544427dcc00010932000400',
    decodedValue: {
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: 67890,
    },
    sidechainFinality: {
      finalityRule: 'testnet rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations',
      sidechainBlockHeight: SPV_TRACKER_SIDECHAIN_HEIGHT,
      observedSidechainHeight: SPV_TRACKER_SIDECHAIN_HEIGHT + 12,
      requiredConfirmations: 12,
      observedConfirmations: 12,
      status: 'FINALIZED',
    },
    boundary: {
      readOnly: true,
      publicObservationInputOnly: true,
      deploymentStateOpened: false,
      runtimeDatabaseOpened: false,
      secretOrEnvironmentFileRead: false,
      signingOrWalletMaterialRead: false,
      nodeOrRpcRequestPerformed: false,
      transactionBroadcastOrMutation: false,
      gate5Closure: false,
      settlementReadiness: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    ...overrides,
  };
}

function observationReconciliationReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    command: 'trustless:observation-reconcile',
    status: 'LINKED',
    reason: 'anchor and SPV tracker observations share bridgeEventRoot and ergoAnchorHeight',
    observedAt: '2026-07-02T13:00:00.000Z',
    commandLine: 'npm run trustless:observation-reconcile -- --anchor-report-json <anchor-report.json> --spv-tracker-report-json <spv-tracker-report.json> --json-out <reconciliation-report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    anchorObservationReportTarget: completedAnchorObservationReportTarget,
    spvTrackerObservationReportTarget: completedSpvTrackerObservationReportTarget,
    anchorObservationStatus: 'LINKED',
    spvTrackerObservationStatus: 'LINKED',
    anchorBridgeEventRootHex: BRIDGE_EVENT_ROOT,
    spvBridgeEventRootHex: BRIDGE_EVENT_ROOT,
    reconciledBridgeEventRootHex: BRIDGE_EVENT_ROOT,
    anchorErgoAnchorHeight: 67890,
    spvErgoAnchorHeight: 67890,
    reconciledErgoAnchorHeight: 67890,
    checks: [
      {
        name: 'Bridge event root identity',
        status: 'PASS',
        detail: 'anchor and SPV tracker reports bind the same bridgeEventRoot',
      },
      {
        name: 'Ergo anchor height identity',
        status: 'PASS',
        detail: 'anchor and SPV tracker reports bind the same ergoAnchorHeight',
      },
    ],
    boundary: {
      readOnly: true,
      publicObservationInputsOnly: true,
      anchorObservationJsonReused: true,
      spvTrackerObservationJsonReused: true,
      nodeOrRpcRequestPerformed: false,
      deploymentStateOpened: false,
      runtimeDatabaseOpened: false,
      secretOrEnvironmentFileRead: false,
      signingOrWalletMaterialRead: false,
      transactionBroadcastOrMutation: false,
      gate5Closure: false,
      settlementReadiness: false,
      productionClaimSupport: false,
      testnetProductionCandidateClaimSupport: false,
    },
    ...overrides,
  };
}

function componentsWithAnchorEvidence(evidence: string): string {
  return [
    ['Sidechain commitment format', 'Stable, versioned, sidechain-specific commitment format', 'artifact://trustless-burn/completed-component-sidechain-commitment-format.log'],
    ['Ergo extension-section anchoring', 'Commitment embedded under collision-safe 0x04xx extension keys', evidence],
    ['Sidechain header/finality verifier', 'Ergo-verifiable sidechain header finality rule', 'artifact://trustless-burn/completed-component-sidechain-header-finality-verifier.log'],
    ['SPV relay contract or tracker', 'SPV relay with authenticated commitment history', `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${completedSpvTrackerObservationReportTarget}; Observation reconciliation report: ${completedObservationReconciliationReportTarget}`],
    ['Burn commitment tree', 'Burn commitment tree using Blake2b-compatible hashing', 'artifact://trustless-burn/completed-component-burn-commitment-tree.log'],
    ['Burn inclusion proof', 'On-chain proof accepts only included burn events', 'artifact://trustless-burn/completed-component-burn-inclusion-proof.log'],
    ['DUP settlement binding', 'DUP key binds settlement to the proved burn', 'artifact://trustless-burn/completed-component-dup-settlement-binding.log'],
    ['Reorg handling', 'Reorged sidechain commitments cannot release ERG', 'artifact://trustless-burn/completed-component-reorg-handling.log'],
    ['Independent review', 'Independent consensus commitment proof and operator recovery review', 'artifact://trustless-burn/completed-component-independent-review.log'],
  ].map(([component, property, componentEvidence]) =>
    `| ${component} | ${property} | ${componentEvidence} | linked |`,
  ).join('\n');
}

function componentsWithSpvTrackerEvidence(evidence: string): string {
  return [
    ['Sidechain commitment format', 'Stable, versioned, sidechain-specific commitment format', 'artifact://trustless-burn/completed-component-sidechain-commitment-format.log'],
    ['Ergo extension-section anchoring', 'Commitment embedded under collision-safe 0x04xx extension keys', `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${completedAnchorObservationReportTarget}; Observation reconciliation report: ${completedObservationReconciliationReportTarget}`],
    ['Sidechain header/finality verifier', 'Ergo-verifiable sidechain header finality rule', 'artifact://trustless-burn/completed-component-sidechain-header-finality-verifier.log'],
    ['SPV relay contract or tracker', 'SPV relay with authenticated commitment history', evidence],
    ['Burn commitment tree', 'Burn commitment tree using Blake2b-compatible hashing', 'artifact://trustless-burn/completed-component-burn-commitment-tree.log'],
    ['Burn inclusion proof', 'On-chain proof accepts only included burn events', 'artifact://trustless-burn/completed-component-burn-inclusion-proof.log'],
    ['DUP settlement binding', 'DUP key binds settlement to the proved burn', 'artifact://trustless-burn/completed-component-dup-settlement-binding.log'],
    ['Reorg handling', 'Reorged sidechain commitments cannot release ERG', 'artifact://trustless-burn/completed-component-reorg-handling.log'],
    ['Independent review', 'Independent consensus commitment proof and operator recovery review', 'artifact://trustless-burn/completed-component-independent-review.log'],
  ].map(([component, property, componentEvidence]) =>
    `| ${component} | ${property} | ${componentEvidence} | linked |`,
  ).join('\n');
}

function componentsWithObservationEvidence(
  anchorEvidence: string,
  spvEvidence: string,
): string {
  return [
    ['Sidechain commitment format', 'Stable, versioned, sidechain-specific commitment format', 'artifact://trustless-burn/completed-component-sidechain-commitment-format.log'],
    ['Ergo extension-section anchoring', 'Commitment embedded under collision-safe 0x04xx extension keys', anchorEvidence],
    ['Sidechain header/finality verifier', 'Ergo-verifiable sidechain header finality rule', 'artifact://trustless-burn/completed-component-sidechain-header-finality-verifier.log'],
    ['SPV relay contract or tracker', 'SPV relay with authenticated commitment history', spvEvidence],
    ['Burn commitment tree', 'Burn commitment tree using Blake2b-compatible hashing', 'artifact://trustless-burn/completed-component-burn-commitment-tree.log'],
    ['Burn inclusion proof', 'On-chain proof accepts only included burn events', 'artifact://trustless-burn/completed-component-burn-inclusion-proof.log'],
    ['DUP settlement binding', 'DUP key binds settlement to the proved burn', 'artifact://trustless-burn/completed-component-dup-settlement-binding.log'],
    ['Reorg handling', 'Reorged sidechain commitments cannot release ERG', 'artifact://trustless-burn/completed-component-reorg-handling.log'],
    ['Independent review', 'Independent consensus commitment proof and operator recovery review', 'artifact://trustless-burn/completed-component-independent-review.log'],
  ].map(([component, property, componentEvidence]) =>
    `| ${component} | ${property} | ${componentEvidence} | linked |`,
  ).join('\n');
}

function trustlessEvidence(overrides: {
  components?: string;
  commitments?: string;
  burnProofs?: string;
  positives?: string;
  negatives?: string;
  reviewers?: string;
  localProofVectorReportTarget?: string | null;
  releaseLevel?: string;
  environment?: string;
  broadcastMode?: string;
  trustPath?: string;
  implemented?: string;
  releaseSupported?: string | null;
  productionClaim?: string;
  testnetProductionCandidateClaim?: string;
  transitionalDisabled?: string;
  criticalHigh?: string;
  releaseNotesUpdated?: string;
  checklistUpdates?: string;
  releaseNoteUpdates?: string;
  reviewerDecisionSummary?: string;
} = {}): string {
  const implemented = overrides.implemented ?? 'yes';
  const testnetProductionCandidateClaim = overrides.testnetProductionCandidateClaim ?? 'no';
  const releaseLevel = overrides.releaseLevel ?? 'institutional reference';
  const releaseSupported = overrides.releaseSupported === undefined ? releaseLevel : overrides.releaseSupported;
  const criticalHigh = overrides.criticalHigh ?? '0';
  const publicationUpdateBindings = [
    ...(implemented === 'yes' ? ['Trustless burn verification implemented = yes'] : []),
    ...((overrides.productionClaim ?? 'no') === 'no' ? ['Production-ready claim allowed = no'] : []),
    ...(overrides.transitionalDisabled !== 'no'
      ? ['Transitional trusted burn path disabled = yes']
      : []),
    ...(releaseLevel === 'production deployment candidate'
      ? ['Release supported = production deployment candidate']
      : []),
    ...(testnetProductionCandidateClaim === 'yes' || testnetProductionCandidateClaim === 'no'
      ? [`Testnet production-candidate claim allowed = ${testnetProductionCandidateClaim}`]
      : []),
    ...(criticalHigh === '0' ? ['Critical/high findings open = 0'] : []),
  ];
  const defaultChecklistUpdates = [
    'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md',
    ...publicationUpdateBindings,
  ].join('; ');
  const defaultReleaseNoteUpdates = [
    'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md',
    ...publicationUpdateBindings,
  ].join('; ');

  return `
# Completed Trustless Burn Evidence

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | trustless burn proof rehearsal |
| Git commit | abc1234 |
| Release level | ${releaseLevel} |
| Environment | ${overrides.environment ?? 'testnet'} |
| Broadcast mode | ${overrides.broadcastMode ?? 'disabled'} |
| Trust path | ${overrides.trustPath ?? 'trustless burn proof path'} |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Required Components

| Component | Required property | Evidence | Status |
|---|---|---|---|
${overrides.components ?? componentRows}

## Commitment Format

| Field | Value or encoding | Evidence | Status |
|---|---|---|---|
${overrides.commitments ?? commitmentRows}

## Burn Proof Binding

| Field | Binding rule | Evidence | Status |
|---|---|---|---|
${overrides.burnProofs ?? burnProofRows}

## Local Proof Vector

${overrides.localProofVectorReportTarget === null ? '' : `Proof-vector validation report: ${overrides.localProofVectorReportTarget ?? completedLocalProofVectorReportTarget}\n\n`}
${localProofVector()}

## Positive Proof Acceptance

| Check | Expected result | Evidence | Status |
|---|---|---|---|
${overrides.positives ?? positiveRows}

## Negative Tests

| Check | Expected result | Evidence | Status |
|---|---|---|---|
${overrides.negatives ?? negativeRows}

## Publication Decision

| Field | Value |
|---|---|
| Trustless burn verification implemented | ${implemented} |
${releaseSupported === null ? '' : `| Release supported | ${releaseSupported} |\n`}| Production-ready claim allowed | ${overrides.productionClaim ?? 'no'} |
| Testnet production-candidate claim allowed | ${testnetProductionCandidateClaim} |
| Transitional trusted burn path disabled | ${overrides.transitionalDisabled ?? 'yes'} |
| Critical/high findings open | ${criticalHigh} |
| Release notes updated | ${overrides.releaseNotesUpdated ?? 'yes'} |
| Required release checklist updates | ${overrides.checklistUpdates ?? defaultChecklistUpdates} |
| Required release-note updates | ${overrides.releaseNoteUpdates ?? defaultReleaseNoteUpdates} |
| Reviewer decision summary | ${overrides.reviewerDecisionSummary ?? 'Release supported = institutional reference; Trustless burn verification implemented = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0'} |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('trustless burn evidence validation', () => {
  it('parses required component rows', () => {
    const rows = parseRequiredComponentRows(trustlessEvidence());

    expect(rows[0]).toMatchObject({
      component: 'Sidechain commitment format',
      status: 'linked',
    });
  });

  it('passes when trustless burn evidence is fully structured', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence());

    expect(result.status).toBe('PASS');
    expect(result.classification).toMatchObject({
      evidenceName: 'trustless burn proof rehearsal',
      gitCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      environment: 'testnet',
      broadcastMode: 'disabled',
      trustPath: 'trustless burn proof path',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.positiveRows).toHaveLength(1);
    expect(result.burnProofRows).toHaveLength(9);
    expect(result.message).toContain('1 positive proof acceptance row');
    expect(result.message).toContain('9 burn proof binding rows');
  });

  it('validates a linked structured local proof-vector report when present', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport(), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('PASS');
      expect(result.localProofVectorReportTarget).toBe(target);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose negative-case observations drift from the embedded vector', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport({
        negativeCaseResults: [
          {
            name: 'wrong-recipient',
            status: 'REJECTED',
            expectedErrors: ['settlement recipient must equal proved recipientErgoTreeHash'],
            observedErrors: ['settlement amount must equal proved amountNanoErg'],
          },
        ],
      });
      writeFileSync(join(process.cwd(), target), JSON.stringify(report, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: negativeCaseResults[wrong-recipient].observedErrors must match expectedErrors',
      );
      expect(result.errors).toContain('Local Proof Vector report: negativeCaseResults must include wrong-sidechain-id');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports without explicit testnet candidate claim denial', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      delete (report.boundary as Record<string, unknown>).testnetProductionCandidateClaimSupport;
      writeFileSync(join(process.cwd(), target), JSON.stringify(report, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.testnetProductionCandidateClaimSupport must be false',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('requires a linked anchor observation report when extension anchoring is linked', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentsWithAnchorEvidence(
        'artifact://trustless-burn/completed-extension-anchor.log; 0x0401 bridgeEventRoot observed',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Ergo extension-section anchoring: Anchor observation report target is required before linked extension anchoring can pass',
    );
  });

  it('validates a linked anchor observation report against commitment rows', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-anchor-report-'));
    const target = `${basename(outputDir)}/anchor-observation-report.json`;
    const reconciliationTarget = `${basename(outputDir)}/observation-reconciliation-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(anchorObservationReport(), null, 2));
      writeFileSync(
        join(process.cwd(), reconciliationTarget),
        JSON.stringify(observationReconciliationReport({
          anchorObservationReportTarget: target,
          spvTrackerObservationReportTarget: completedSpvTrackerObservationReportTarget,
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithObservationEvidence(
          `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${target}; Observation reconciliation report: ${reconciliationTarget}`,
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${completedSpvTrackerObservationReportTarget}; Observation reconciliation report: ${reconciliationTarget}`,
        ),
      }));

      expect(result.status).toBe('PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked anchor observation reports whose observed root or status cannot support anchoring', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-anchor-report-'));
    const target = `${basename(outputDir)}/anchor-observation-report.json`;
    try {
      writeFileSync(
        join(process.cwd(), target),
        JSON.stringify(anchorObservationReport({
          status: 'BLOCKED',
          bridgeEventRootHex: 'a'.repeat(64),
          linkedAnchor: {
            key: '0401',
            bridgeEventRootHex: 'a'.repeat(64),
            ergoAnchorHeight: 67890,
            headerId: '7'.repeat(64),
          },
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithAnchorEvidence(
          `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Anchor observation report: status must be LINKED');
      expect(result.errors).toContain(
        'Anchor observation report: bridgeEventRootHex must match Commitment Format bridgeEventRoot',
      );
      expect(result.errors).toContain(
        'Anchor observation report: linkedAnchor.bridgeEventRootHex must match Commitment Format bridgeEventRoot',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked anchor observation reports with unsafe boundaries', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-anchor-report-'));
    const target = `${basename(outputDir)}/anchor-observation-report.json`;
    try {
      const report = anchorObservationReport();
      (report.boundary as Record<string, unknown>).transactionBroadcastOrMutation = true;
      (report.boundary as Record<string, unknown>).gate5Closure = true;
      writeFileSync(join(process.cwd(), target), JSON.stringify(report, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithAnchorEvidence(
          `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Anchor observation report: boundary.transactionBroadcastOrMutation must be false');
      expect(result.errors).toContain('Anchor observation report: boundary.gate5Closure must be false');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe anchor observation report targets without leaking the requested path', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentsWithAnchorEvidence(
        'artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ../operator/private-key-anchor-observation-report.json',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join('\n')).toContain('<blocked JSON evidence target>');
    expect(result.errors.join('\n')).not.toContain('private-key-anchor-observation-report.json');
  });

  it('requires a linked SPV tracker observation report when the SPV tracker component is linked', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentsWithSpvTrackerEvidence(
        'artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV authenticated commitment history observed',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: SPV relay contract or tracker: SPV tracker observation report target is required before linked SPV tracker evidence can pass',
    );
  });

  it('validates a linked SPV tracker observation report against commitment rows', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-spv-tracker-report-'));
    const target = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    const reconciliationTarget = `${basename(outputDir)}/observation-reconciliation-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(spvTrackerObservationReport(), null, 2));
      writeFileSync(
        join(process.cwd(), reconciliationTarget),
        JSON.stringify(observationReconciliationReport({
          anchorObservationReportTarget: completedAnchorObservationReportTarget,
          spvTrackerObservationReportTarget: target,
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithObservationEvidence(
          `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${completedAnchorObservationReportTarget}; Observation reconciliation report: ${reconciliationTarget}`,
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${target}; Observation reconciliation report: ${reconciliationTarget}`,
        ),
      }));

      expect(result.status).toBe('PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked SPV tracker observation reports whose commitment fields drift', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-spv-tracker-report-'));
    const target = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    try {
      writeFileSync(
        join(process.cwd(), target),
        JSON.stringify(spvTrackerObservationReport({
          status: 'BLOCKED',
          expectedEntry: {
            ...SPV_TRACKER_ENTRY,
            bridgeEventRootHex: 'a'.repeat(64),
          },
          observedValueHex: `${'a'.repeat(64)}00010932`,
          decodedValue: {
            bridgeEventRootHex: 'a'.repeat(64),
            ergoAnchorHeight: 67890,
          },
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithSpvTrackerEvidence(
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('SPV tracker observation report: status must be LINKED');
      expect(result.errors).toContain(
        'SPV tracker observation report: expectedEntry.bridgeEventRootHex must match Commitment Format bridgeEventRoot',
      );
      expect(result.errors).toContain(
        'SPV tracker observation report: decodedValue.bridgeEventRootHex must match Commitment Format bridgeEventRoot',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked SPV tracker observation reports without finalized sidechain finality evidence', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-spv-tracker-report-'));
    const target = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    try {
      writeFileSync(
        join(process.cwd(), target),
        JSON.stringify(spvTrackerObservationReport({
          sidechainFinality: {
            finalityRule: 'testnet rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations',
            sidechainBlockHeight: SPV_TRACKER_SIDECHAIN_HEIGHT,
            observedSidechainHeight: SPV_TRACKER_SIDECHAIN_HEIGHT + 4,
            requiredConfirmations: 12,
            observedConfirmations: 4,
            status: 'UNFINALIZED',
          },
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithSpvTrackerEvidence(
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'SPV tracker observation report: sidechainFinality.observedConfirmations must be greater than or equal to requiredConfirmations',
      );
      expect(result.errors).toContain(
        'SPV tracker observation report: sidechainFinality.status must be FINALIZED',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked SPV tracker observation reports whose finality height drifts from the commitment', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-spv-tracker-report-'));
    const target = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    try {
      writeFileSync(
        join(process.cwd(), target),
        JSON.stringify(spvTrackerObservationReport({
          sidechainFinality: {
            finalityRule: 'testnet rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations',
            sidechainBlockHeight: SPV_TRACKER_SIDECHAIN_HEIGHT + 1,
            observedSidechainHeight: SPV_TRACKER_SIDECHAIN_HEIGHT + 20,
            requiredConfirmations: 12,
            observedConfirmations: 19,
            status: 'FINALIZED',
          },
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithSpvTrackerEvidence(
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'SPV tracker observation report: sidechainFinality.sidechainBlockHeight must match Commitment Format sidechainHeight',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked SPV tracker observation reports with unsafe boundaries', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-spv-tracker-report-'));
    const target = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    try {
      const report = spvTrackerObservationReport();
      (report.boundary as Record<string, unknown>).nodeOrRpcRequestPerformed = true;
      (report.boundary as Record<string, unknown>).gate5Closure = true;
      writeFileSync(join(process.cwd(), target), JSON.stringify(report, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithSpvTrackerEvidence(
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('SPV tracker observation report: boundary.nodeOrRpcRequestPerformed must be false');
      expect(result.errors).toContain('SPV tracker observation report: boundary.gate5Closure must be false');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe SPV tracker observation report targets without leaking the requested path', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentsWithSpvTrackerEvidence(
        'artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ../operator/private-key-spv-tracker-observation-report.json',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join('\n')).toContain('<blocked JSON evidence target>');
    expect(result.errors.join('\n')).not.toContain('private-key-spv-tracker-observation-report.json');
  });

  it('requires a linked observation reconciliation report when anchor and SPV tracker components are linked', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentsWithObservationEvidence(
        `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${completedAnchorObservationReportTarget}`,
        `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${completedSpvTrackerObservationReportTarget}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Observation reconciliation report target is required before linked anchor and SPV tracker evidence can pass',
    );
  });

  it('validates a linked observation reconciliation report against anchor, SPV, and commitment rows', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-observation-reconciliation-'));
    const anchorTarget = `${basename(outputDir)}/anchor-observation-report.json`;
    const spvTarget = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    const reconciliationTarget = `${basename(outputDir)}/observation-reconciliation-report.json`;
    try {
      writeFileSync(join(process.cwd(), anchorTarget), JSON.stringify(anchorObservationReport(), null, 2));
      writeFileSync(join(process.cwd(), spvTarget), JSON.stringify(spvTrackerObservationReport(), null, 2));
      writeFileSync(
        join(process.cwd(), reconciliationTarget),
        JSON.stringify(observationReconciliationReport({
          anchorObservationReportTarget: anchorTarget,
          spvTrackerObservationReportTarget: spvTarget,
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithObservationEvidence(
          `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${anchorTarget}; Observation reconciliation report: ${reconciliationTarget}`,
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${spvTarget}; Observation reconciliation report: ${reconciliationTarget}`,
        ),
      }));

      expect(result.status).toBe('PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks observation reconciliation reports that remain blocked or drift from commitment rows', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-observation-reconciliation-'));
    const anchorTarget = `${basename(outputDir)}/anchor-observation-report.json`;
    const spvTarget = `${basename(outputDir)}/spv-tracker-observation-report.json`;
    const reconciliationTarget = `${basename(outputDir)}/observation-reconciliation-report.json`;
    try {
      writeFileSync(join(process.cwd(), anchorTarget), JSON.stringify(anchorObservationReport(), null, 2));
      writeFileSync(join(process.cwd(), spvTarget), JSON.stringify(spvTrackerObservationReport(), null, 2));
      writeFileSync(
        join(process.cwd(), reconciliationTarget),
        JSON.stringify(observationReconciliationReport({
          status: 'BLOCKED',
          anchorObservationReportTarget: anchorTarget,
          spvTrackerObservationReportTarget: spvTarget,
          reconciledBridgeEventRootHex: 'a'.repeat(64),
          reconciledErgoAnchorHeight: 987654,
          checks: [
            {
              name: 'Bridge event root identity',
              status: 'BLOCKED',
              detail: 'anchor and SPV tracker roots differ',
            },
          ],
        }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentsWithObservationEvidence(
          `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${anchorTarget}; Observation reconciliation report: ${reconciliationTarget}`,
          `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${spvTarget}; Observation reconciliation report: ${reconciliationTarget}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Observation reconciliation report: status must be LINKED');
      expect(result.errors).toContain(
        'Observation reconciliation report: reconciledBridgeEventRootHex must match Commitment Format bridgeEventRoot',
      );
      expect(result.errors).toContain(
        'Observation reconciliation report: reconciledErgoAnchorHeight must match Commitment Format ergoAnchorHeight',
      );
      expect(result.errors).toContain('Observation reconciliation report: checks[0].status must be PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe observation reconciliation report targets without leaking the requested path', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentsWithObservationEvidence(
        `artifact://trustless-burn/completed-extension-anchor.log; Anchor observation report: ${completedAnchorObservationReportTarget}; Observation reconciliation report: ../operator/private-key-observation-reconciliation-report.json`,
        `artifact://trustless-burn/completed-component-spv-relay-contract-or-tracker.log; SPV tracker observation report: ${completedSpvTrackerObservationReportTarget}; Observation reconciliation report: ../operator/private-key-observation-reconciliation-report.json`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join('\n')).toContain('<blocked JSON evidence target>');
    expect(result.errors.join('\n')).not.toContain('private-key-observation-reconciliation-report.json');
  });

  it('forwards the linked proof-vector report target into release-gate validation', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-release-gate-trustless-burn-'));
    const proofVectorTarget = `${basename(outputDir)}/completed-local-proof-vector-report.json`;
    const evidenceTarget = `${basename(outputDir)}/completed-trustless-burn-evidence.md`;
    try {
      writeFileSync(join(process.cwd(), proofVectorTarget), JSON.stringify(localProofVectorReport(), null, 2));
      writeFileSync(join(process.cwd(), evidenceTarget), trustlessEvidence({
        localProofVectorReportTarget: proofVectorTarget,
      }));

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/release-gate.ts',
          '--trustless-burn-evidence',
          evidenceTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('Release gate BLOCKED:');
      expect(result.stdout).not.toContain(
        'actual trustless burn evidence validation must expose a linked Proof-vector validation report target',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks otherwise complete trustless burn evidence without a linked proof-vector report', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      localProofVectorReportTarget: null,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector report: Proof-vector validation report target is required before Gate 5 evidence can pass',
    );
  });

  it('blocks embedded local proof vectors with extra authority fields', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(
        localProofVector(),
        localProofVector({
          extra: {
            gate5Claim: true,
            productionReadyClaimSupport: 'yes',
            metadata: {
              mainnetReleaseApproval: 'greenlit',
            },
          },
        }),
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: unexpected field gate5Claim is not allowed in embedded local proof-core evidence',
    );
    expect(result.errors).toContain(
      'Local Proof Vector: unexpected field productionReadyClaimSupport is not allowed in embedded local proof-core evidence',
    );
    expect(result.errors).toContain(
      'Local Proof Vector: unexpected field metadata is not allowed in embedded local proof-core evidence',
    );
  });

  it('blocks embedded local proof-vector nested records with extra authority fields', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(
        localProofVector(),
        localProofVector({
          leafExtra: {
            productionReadyClaimSupport: 'yes',
          },
          negativeCaseExtra: {
            metadata: {
              mainnetReleaseApproval: 'greenlit',
            },
          },
        }),
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: leaf unexpected field productionReadyClaimSupport is not allowed in embedded local proof-core evidence',
    );
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id] unexpected field metadata is not allowed in embedded local proof-core evidence',
    );
  });

  it('blocks embedded local proof-vector negative cases with non-string expected errors', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(
        localProofVector(),
        localProofVector({
          negativeCaseExtra: {
            expectedErrors: [
              'burnId must equal derived sidechain event identity',
              { productionReadyClaimSupport: 'yes' },
            ],
          },
        }),
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id].expectedErrors[1] must be a non-empty proof-core error string',
    );
  });

  it('blocks linked local proof-vector reports that contain multiple proof-vector results', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          report.reports[0],
          {
            ...report.reports[0],
            label: 'test-vectors/unrelated-proof-vector.json',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: reports must include exactly one proof-vector result bound to the embedded Local Proof Vector',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose reports field is not an array', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...localProofVectorReport(),
        reports: {
          status: 'PASS',
        },
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: reports must be an array');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with top-level errors despite PASS status', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...localProofVectorReport(),
        errors: ['proof-vector validation previously reported a blocked result'],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: top-level errors must be empty for PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports without explicit top-level errors', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      delete (report as Record<string, unknown>).errors;
      writeFileSync(join(process.cwd(), target), JSON.stringify(report, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: top-level errors must be an empty array');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with non-array top-level errors', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...localProofVectorReport(),
        errors: 'proof-vector validation previously reported a blocked result',
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: top-level errors must be an empty array');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with unsafe local labels without reflecting them', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    const unsafeLabel = ['C:', 'tmp', 'proof-vector-report.json'].join('/');
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        label: unsafeLabel,
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result label must not contain local paths, URI schemes, secrets, or runtime-state references',
      );
      expect(result.errors.join('\n')).not.toContain(unsafeLabel);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with secret-bearing labels without reflecting them', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    const unsafeLabel = ['evidence', ['private', 'key'].join('-'), 'proof-vector-report.json'].join('/');
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        label: unsafeLabel,
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result label must not contain local paths, URI schemes, secrets, or runtime-state references',
      );
      expect(result.errors.join('\n')).not.toContain(unsafeLabel);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with additive authority boundary fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionReadyClaimSupport: true,
        },
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with top-level authority fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        productionReadyClaimSupport: true,
        metadata: {
          mainnetReleaseApproval: 'greenlit',
        },
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: top-level.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: top-level.metadata.mainnetReleaseApproval must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with neutral unexpected schema fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        operatorNote: 'local proof-core evidence only',
        boundary: {
          ...report.boundary,
          notes: 'read-only local validation',
        },
        reports: [
          {
            ...report.reports[0],
            observedAt: '2026-05-14T00:00:00Z',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: top-level unexpected field operatorNote is not allowed in proof-vector validation report',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary unexpected field notes is not allowed in proof-vector validation report',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result unexpected field observedAt is not allowed in proof-vector validation report',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with textual authority fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionReadyClaimSupport: 'yes',
        },
        reports: [
          {
            ...report.reports[0],
            broadcastAuthorization: 'enabled',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result broadcastAuthorization must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with authorization-synonym authority fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionReadyClaimSupport: 'authorized',
        },
        reports: [
          {
            ...report.reports[0],
            settlementReadiness: 'permitted',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result settlementReadiness must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with release approval authority aliases', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          main_network_release_approval: true,
        },
        reports: [
          {
            ...report.reports[0],
            goLiveApproval: 'yes',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.main_network_release_approval must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result goLiveApproval must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with launch approval authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionReadyClaimSupport: 'greenlit',
        },
        reports: [
          {
            ...report.reports[0],
            goLiveApproval: 'launched',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result goLiveApproval must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with pass-style authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          mainnetReleaseApproval: 'PASS',
        },
        reports: [
          {
            ...report.reports[0],
            goLiveApproval: 'accepted',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.mainnetReleaseApproval must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result goLiveApproval must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with deployment certification authority aliases', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          mainChainDeployment: 'certified',
        },
        reports: [
          {
            ...report.reports[0],
            releaseCertification: 'cleared',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.mainChainDeployment must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result releaseCertification must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with availability authority aliases', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          generalAvailability: 'complete',
        },
        reports: [
          {
            ...report.reports[0],
            marketReady: 'ok',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.generalAvailability must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result marketReady must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with active authority states', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          mainnetActivation: 'active',
        },
        reports: [
          {
            ...report.reports[0],
            productionOperational: 'operational',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.mainnetActivation must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result productionOperational must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with availability and production authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          mainnetAvailability: 'available',
          publicAvailability: 'GA',
        },
        reports: [
          {
            ...report.reports[0],
            releaseAudience: 'public',
            productionStatus: 'production',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.mainnetAvailability must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.publicAvailability must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result releaseAudience must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result productionStatus must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with publication authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          publicationStatus: 'published',
        },
        reports: [
          {
            ...report.reports[0],
            publicationReadiness: 'publishable',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.publicationStatus must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result publicationReadiness must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with candidate rollout authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          candidateReadiness: 'ready',
          rolloutStatus: 'enabled',
        },
        reports: [
          {
            ...report.reports[0],
            distributionStatus: 'listed',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.candidateReadiness must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.rolloutStatus must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result distributionStatus must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with public-use suitability authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          publicUseStatus: 'suitable',
          operatorUseEligibility: 'eligible',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalEndorsement: 'endorsed',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.publicUseStatus must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorUseEligibility must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalEndorsement must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with compliance qualification authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          complianceStatus: 'compliant',
          operatorQualification: 'qualified',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalAccreditation: 'accredited',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.complianceStatus must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorQualification must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalAccreditation must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with validation attestation authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionValidation: 'validated',
          operatorVerification: 'verified',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalAttestation: 'attested',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionValidation must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorVerification must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalAttestation must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with assurance sanction authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionAssurance: 'assured',
          operatorSanction: 'sanctioned',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalGuarantee: 'guaranteed',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionAssurance must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorSanction must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalGuarantee must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with clearance licensing authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          operatorClearance: 'cleared',
          productionLicense: 'licensed',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalEntitlement: 'entitled',
            publicRecognition: 'recognized',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorClearance must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionLicense must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalEntitlement must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result publicRecognition must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with waiver exemption authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          operatorWaiver: 'waived',
          productionExemption: 'exempted',
        },
        reports: [
          {
            ...report.reports[0],
            policyException: 'excepted',
            manualOverride: 'overridden',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorWaiver must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionExemption must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result policyException must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result manualOverride must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with audit review signoff authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionAudit: 'audited',
          operatorReview: 'reviewed',
        },
        reports: [
          {
            ...report.reports[0],
            securitySignoff: 'signed off',
            riskAcceptance: 'accepted',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionAudit must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorReview must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result securitySignoff must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result riskAcceptance must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with safety security trust authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          operatorSafety: 'safe',
          productionSecurity: 'secure',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalTrusted: 'trusted',
            releaseConfidence: 'confident',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorSafety must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionSecurity must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalTrusted must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result releaseConfidence must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with stability maturity authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionStability: 'stable',
          operatorReliability: 'reliable',
        },
        reports: [
          {
            ...report.reports[0],
            institutionalMaturity: 'mature',
            protocolRobustness: 'robust',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionStability must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.operatorReliability must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result institutionalMaturity must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result protocolRobustness must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with grade hardened proven authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          evidenceGrade: 'enterprise-grade',
          battleTested: 'battle-tested',
        },
        reports: [
          {
            ...report.reports[0],
            operatorHardened: 'hardened',
            productionProven: 'proven',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.evidenceGrade must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.battleTested must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result operatorHardened must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result productionProven must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with service-level authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          uptimeSla: 'met',
          serviceLevelObjective: 'satisfied',
        },
        reports: [
          {
            ...report.reports[0],
            operationalCoverage: 'covered',
            productionSlo: 'green',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.uptimeSla must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.serviceLevelObjective must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result operationalCoverage must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result productionSlo must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with risk and blocker authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          residualRisk: 'low',
          blockerStatus: 'resolved',
        },
        reports: [
          {
            ...report.reports[0],
            findingDisposition: 'closed',
            mitigationStatus: 'mitigated',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.residualRisk must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.blockerStatus must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result findingDisposition must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result mitigationStatus must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with neutral fields carrying authority values', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          notes: 'verified',
        },
        metadata: {
          summary: 'approved',
        },
        reports: [
          {
            ...report.reports[0],
            assessment: 'supported',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.notes must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: top-level.metadata must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result assessment must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose result message asserts contradictory authority', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            message: `${report.reports[0].message} Production deployment approved; Gate 5 closure supported; broadcast authorization enabled.`,
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must not assert production deployment, Gate 5 closure, settlement readiness, broadcast authorization, or claim support',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose result message adds non-canonical authority text', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            message: `${report.reports[0].message} Reviewed and accepted by release owner.`,
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must match canonical local proof-core boundary text',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with numeric authority fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionReadyClaimSupport: 1,
        },
        reports: [
          {
            ...report.reports[0],
            settlementReadiness: 1,
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result settlementReadiness must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with nested authority fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          productionReadyClaimSupport: { allowed: true },
        },
        reports: [
          {
            ...report.reports[0],
            broadcastAuthorization: ['approved'],
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result broadcastAuthorization must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with nested authority-key fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        boundary: {
          ...report.boundary,
          metadata: {
            productionReadyClaimSupport: true,
          },
        },
        reports: [
          {
            ...report.reports[0],
            observations: [
              {
                broadcastAuthorization: 'approved',
              },
            ],
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: boundary.metadata.productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result observations[0].broadcastAuthorization must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with incomplete proof-vector result structure', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            label: '',
            message: '',
            errors: undefined,
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: proof-vector result label is required');
      expect(result.errors).toContain('Local Proof Vector report: proof-vector result message is required');
      expect(result.errors).toContain('Local Proof Vector report: proof-vector result errors must be an empty array');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose result label is a blocked target placeholder', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            label: '<blocked JSON evidence target>',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result label must not be a blocked evidence target placeholder',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with additive authority result fields', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            productionReadyClaimSupport: true,
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result productionReadyClaimSupport must not be authority-affirming for local proof-core evidence',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with fractional leaf counts', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        leafCount: 2.5,
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: leafCount must be an integer');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with malformed hex fields and unsafe metrics', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        bridgeEventRootHex: 'not-hex',
        leafHashHex: 'f'.repeat(63),
        leafCount: Number.MAX_SAFE_INTEGER + 1,
        proofNodeCount: 1.5,
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: bridgeEventRootHex must be a 32-byte hex string');
      expect(result.errors).toContain('Local Proof Vector report: leafHashHex must be a 32-byte hex string');
      expect(result.errors).toContain('Local Proof Vector report: leafCount must be a safe integer');
      expect(result.errors).toContain('Local Proof Vector report: proofNodeCount must be an integer');
      expect(result.errors).toContain('Local Proof Vector report: proofNodeCount must be a safe integer');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose leaf count contradicts proof depth', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        leafCount: 3,
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: leafCount must match Local Proof Vector proof depth');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose message contradicts structured metrics', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            message:
              'Trustless burn proof vector PASS: leafCount=9, proofNodes=9, gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Local Proof Vector report: proof-vector result message must state leafCount=2');
      expect(result.errors).toContain('Local Proof Vector report: proof-vector result message must state proofNodes=1');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose message includes extra contradictory metrics', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            message: `${report.reports[0].message} Duplicate summary: leafCount=9, proofNodes=9.`,
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must not include contradictory leafCount values',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must not include contradictory proofNodes values',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports whose result message omits boundary markers', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      const report = localProofVectorReport();
      writeFileSync(join(process.cwd(), target), JSON.stringify({
        ...report,
        reports: [
          {
            ...report.reports[0],
            message: 'Trustless burn proof vector PASS.',
          },
        ],
      }, null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must state gate5Claim=false',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must state contractsChanged=false',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must state local proof-core evidence only',
      );
      expect(result.errors).toContain(
        'Local Proof Vector report: proof-vector result message must deny Gate 5 closure, settlement readiness, broadcast authorization, production claim support, and testnet production-candidate claim support',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports that do not match the embedded vector', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        bridgeEventRootHex: 'a'.repeat(64),
        proofNodeCount: 0,
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: bridgeEventRootHex must match Local Proof Vector bridgeEventRootHex',
      );
      expect(result.errors).toContain('Local Proof Vector report: proofNodeCount must match Local Proof Vector proof length');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked local proof-vector reports with a mismatched leaf hash', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-burn-evidence-report-'));
    const target = `${basename(outputDir)}/proof-vector-report.json`;
    try {
      writeFileSync(join(process.cwd(), target), JSON.stringify(localProofVectorReport({
        leafHashHex: 'f'.repeat(64),
      }), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        localProofVectorReportTarget: target,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Local Proof Vector report: leafHashHex must match Local Proof Vector canonical leaf hash',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe local proof-vector report targets without leaking the requested path', () => {
    const target = '../operator/private-key-proof-vector-report.json';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      localProofVectorReportTarget: target,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors.join('\n')).toContain('Local Proof Vector report: <blocked JSON evidence target>');
    expect(result.errors.join('\n')).not.toContain('private-key-proof-vector-report.json');
    expect(result.errors.join('\n')).not.toContain(process.cwd());
  });

  it('rejects trustless burn rows with contradictory failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 trustless burn validation BLOCKED with 1 structural issue';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `artifact://trustless-burn/completed-component-sidechain-commitment-format.log ${contradictoryEvidence}`,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        `artifact://trustless-burn/completed-commitment-sidechainid.json ${contradictoryEvidence}`,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        `artifact://trustless-burn/completed-burn-proof-burnid.json ${contradictoryEvidence}`,
      ),
      positives: positiveRows.replace(
        'burn proof inclusion accepted',
        `burn proof inclusion accepted ${contradictoryEvidence}`,
      ),
      negatives: negativeRows.replace(
        'negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity',
        `negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity ${contradictoryEvidence}`,
      ),
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md ${contradictoryEvidence}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md ${contradictoryEvidence}`,
      reviewers: reviewerRows.replace(
        'trustless burn proof accepted',
        `trustless burn proof accepted ${contradictoryEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not include contradictory trustless-burn failure markers',
    );
  });

  it('rejects trustless burn rows with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 trustless burn validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `artifact://trustless-burn/completed-component-sidechain-commitment-format.log ${contradictoryEvidence}`,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        `artifact://trustless-burn/completed-commitment-sidechainid.json ${contradictoryEvidence}`,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        `artifact://trustless-burn/completed-burn-proof-burnid.json ${contradictoryEvidence}`,
      ),
      positives: positiveRows.replace(
        'burn proof inclusion accepted',
        `burn proof inclusion accepted ${contradictoryEvidence}`,
      ),
      negatives: negativeRows.replace(
        'negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity',
        `negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity; ${contradictoryEvidence}`,
      ),
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md completed Gate 5 checklist update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Transitional trusted burn path disabled = yes; Testnet production-candidate claim allowed = no; Critical/high findings open = 0; ${contradictoryEvidence}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md completed Gate 5 release-note update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Transitional trusted burn path disabled = yes; Testnet production-candidate claim allowed = no; Critical/high findings open = 0; ${contradictoryEvidence}`,
      reviewers: reviewerRows.replace(
        'trustless burn proof accepted',
        `trustless burn proof accepted ${contradictoryEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not include contradictory trustless-burn failure markers',
    );
  });

  it.each([
    'structural issues = 0/1',
    'errors=0/1',
  ])('rejects trustless burn rows that keep result count placeholder %s', placeholder => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `artifact://trustless-burn/completed-component-sidechain-commitment-format.log command output: PASS ${placeholder}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: evidence must not include contradictory trustless-burn failure markers',
    );
  });

  it('rejects trustless burn rows with remaining issue markers', () => {
    const remainingIssues =
      'command output: PASS exit code 0; Remaining issues: follow-up item still open';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `artifact://trustless-burn/completed-component-sidechain-commitment-format.log ${remainingIssues}`,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        `artifact://trustless-burn/completed-commitment-sidechainid.json ${remainingIssues}`,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        `artifact://trustless-burn/completed-burn-proof-burnid.json ${remainingIssues}`,
      ),
      positives: positiveRows.replace(
        'burn proof inclusion accepted',
        `burn proof inclusion accepted ${remainingIssues}`,
      ),
      negatives: negativeRows.replace(
        'negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity',
        `negativeCase wrong-sidechain-id observed error burnId must equal derived sidechain event identity ${remainingIssues}`,
      ),
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md ${remainingIssues}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md ${remainingIssues}`,
      reviewers: reviewerRows.replace(
        'trustless burn proof accepted',
        `trustless burn proof accepted ${remainingIssues}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory trustless-burn failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not include contradictory trustless-burn failure markers',
    );
  });

  it.each([
    ['open', 'command output: PASS exit code 0; Open issues: unresolved proof-vector blocker'],
    ['known', 'command output: PASS exit code 0; Known issues: unresolved proof-vector blocker'],
  ])('rejects trustless burn rows with %s issue markers', (_label, issueMarker) => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `artifact://trustless-burn/completed-component-sidechain-commitment-format.log ${issueMarker}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: evidence must not include contradictory trustless-burn failure markers',
    );
  });

  it('blocks linked trustless burn evidence rows that approve trusted fallback paths', () => {
    const trustedFallbackApproval = 'trusted-oracle fallback accepted as trustless';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-burn-inclusion-proof.log',
        `artifact://trustless-burn/completed-component-burn-inclusion-proof.log ${trustedFallbackApproval}`,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-finalityrule.json',
        `artifact://trustless-burn/completed-commitment-finalityrule.json ${trustedFallbackApproval}`,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-settlementtxbinding.json',
        `artifact://trustless-burn/completed-burn-proof-settlementtxbinding.json ${trustedFallbackApproval}`,
      ),
      positives: positiveRows.replace(
        'settlement transaction binding matched',
        `settlement transaction binding matched; ${trustedFallbackApproval}`,
      ),
      negatives: negativeRows.replace(
        `artifact://trustless-burn/completed-negative-trusted-oracle-fallback-presented-as-trustless.log; rejected burnId ${BURN_ID}`,
        `artifact://trustless-burn/completed-negative-trusted-oracle-fallback-presented-as-trustless.log; rejected burnId ${BURN_ID}; ${trustedFallbackApproval}`,
      ),
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md ${trustedFallbackApproval}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md ${trustedFallbackApproval}`,
      reviewers: reviewerRows.replace(
        'trustless burn proof accepted',
        `trustless burn proof accepted; ${trustedFallbackApproval}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Burn inclusion proof: evidence must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Commitment Format: finalityRule: evidence must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: settlementTxBinding: evidence must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Negative Tests: Trusted-oracle fallback presented as trustless: evidence must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks reviewer approvals that put the approval term before trusted fallback paths', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0; approved trusted-oracle fallback',
      reviewers: reviewerRows.replace(
        'trustless burn proof accepted',
        'trustless burn proof accepted; approved trusted-oracle fallback',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks trusted fallback approvals written with active approval verbs', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0; reviewer supports trusted-oracle fallback',
      reviewers: [
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; reviewer supports trusted-oracle fallback |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; operator allows transitional trusted burn path |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks trusted fallback approvals written with base active approval verbs', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0; reviewer approve trusted-oracle fallback',
      reviewers: [
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; reviewer permit trusted-oracle fallback |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; operator authorize transitional trusted burn path |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks trusted fallback approvals written with grant-family approval terms', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0; reviewer grants trusted-oracle fallback',
      reviewers: [
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; reviewer grants trusted-oracle fallback |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; operator granted transitional trusted burn path |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks trusted fallback approvals written with clear-family approval terms', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0; reviewer clears trusted-oracle fallback',
      reviewers: [
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; reviewer clears trusted-oracle fallback |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; transitional trusted burn path cleared |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks trusted fallback approvals written with certification-family approval terms', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0; trusted-oracle fallback certified',
      reviewers: [
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; trusted-oracle fallback endorsed |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; transitional trusted burn path recommended |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks trusted fallback approvals with compatibility-normalized trusted fallback wording', () => {
    const trustedFallbackApproval =
      'reviewer grants \uFF54\uFF52\uFF55\uFF53\uFF54\uFF45\uFF44 \uFF46\uFF41\uFF4C\uFF4C\uFF42\uFF41\uFF43\uFF4B';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        `Critical/high findings open = 0; ${trustedFallbackApproval}`,
      reviewers: reviewerRows.replace(
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        `| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ${trustedFallbackApproval} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('accepts reviewer notes that explicitly deny trusted fallback approval', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; trusted-oracle fallback not approved; ' +
        'reviewer approved no trusted-oracle fallback; transitional trusted burn path not approved; ' +
        'reviewer approved no transitional trusted burn path',
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'trusted-oracle fallback not approved; reviewer approved no trusted-oracle fallback |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'transitional trusted burn path not approved; reviewer approved no transitional trusted burn path |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('accepts reviewer notes that approve absent trusted fallback paths', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; reviewer approved absence of trusted-oracle fallback; ' +
        'reviewer approved absent transitional trusted burn path',
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'reviewer approved absence of trusted-oracle fallback |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'reviewer approved absent transitional trusted burn path |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('accepts reviewer notes that approve absence of trusted fallback paths', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; absence of trusted-oracle fallback approved by reviewer; ' +
        'absence of transitional trusted burn path approved by reviewer',
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'absence of trusted-oracle fallback approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'absence of transitional trusted burn path approved by reviewer |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('accepts reviewer notes that approve lack of trusted fallback paths', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; lack of trusted-oracle fallback approved by reviewer; ' +
        'reviewer approved lack of transitional trusted burn path',
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'lack of trusted-oracle fallback approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'reviewer approved lack of transitional trusted burn path |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('accepts reviewer notes that approve lacking trusted fallback paths', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; lacking trusted-oracle fallback approved by reviewer; ' +
        'reviewer approved lacking transitional trusted burn path',
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'lacking trusted-oracle fallback approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'reviewer approved lacking transitional trusted burn path |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('accepts reviewer notes that approve evidence lacks trusted fallback paths', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; evidence lacks trusted-oracle fallback approved by reviewer; ' +
        'reviewer approved evidence lacks transitional trusted burn path',
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'evidence lacks trusted-oracle fallback approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; ' +
            'reviewer approved evidence lacks transitional trusted burn path |',
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve trusted fallback paths',
    );
  });

  it('blocks evidence when the local proof vector does not verify against the proof core', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        bridgeEventRootHex: 'c'.repeat(64),
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: burn inclusion proof must resolve to bridgeEventRoot',
    );
  });

  it('blocks evidence when the local proof vector uses an empty inclusion proof', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        proof: [],
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: proof must include at least one structured inclusion proof node',
    );
  });

  it('blocks evidence when the local proof vector uses non-object inclusion proof steps', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        proof: ['not-a-proof-step'] as unknown as TrustlessBurnMerkleProofStep[],
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: proof[0] must be an object with side and hashHex',
    );
  });

  it('blocks evidence when local proof vector negative cases use non-object proof steps', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        negativeCaseExtra: {
          settlementBinding: {
            duplicatePreventionKeyHex: DUP_KEY,
            recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
            amountNanoErg: '1000000',
            assetIdHex: ASSET_ID,
            proof: ['not-a-proof-step'],
          },
        },
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id].settlementBinding.proof[0] must be an object with side and hashHex',
    );
  });

  it('blocks evidence when local proof vector negative cases use empty proof overrides', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        negativeCaseExtra: {
          settlementBinding: {
            duplicatePreventionKeyHex: DUP_KEY,
            recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
            amountNanoErg: '1000000',
            assetIdHex: ASSET_ID,
            proof: [],
          },
        },
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id].settlementBinding.proof must include at least one structured proof step when provided',
    );
  });

  it('blocks evidence when local proof vector negative cases drift expected errors across checks', () => {
    const negativeCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            amountNanoErg: '2000000',
          },
          expectedErrors: ['settlement amount must equal proved amountNanoErg'],
        }
        : negativeCase,
    );
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence({
        negatives: negativeRows.replace(
          'negativeCase wrong-recipient observed error settlement recipient must equal proved recipientErgoTreeHash',
          'negativeCase wrong-recipient observed error settlement amount must equal proved amountNanoErg',
        ),
      }).replace(localProofVector(), localProofVector({ negativeCases })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-recipient].expectedErrors must contain exactly the required proof-core error: settlement recipient must equal proved recipientErgoTreeHash',
    );
  });

  it('blocks evidence when local proof vector negative cases observe extra proof-core errors', () => {
    const negativeCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            amountNanoErg: '2000000',
          },
        }
        : negativeCase,
    );
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-recipient] observed unexpected proof-core error: settlement amount must equal proved amountNanoErg',
    );
  });

  it('blocks evidence when local proof vectors add unknown negative case names', () => {
    const requiredNegativeCases = trustlessBurnNegativeCases();
    const negativeCases = [
      ...requiredNegativeCases,
      {
        ...requiredNegativeCases[0],
        name: 'operator-attestation-placeholder',
      },
    ];
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[operator-attestation-placeholder] unknown negative case name',
    );
  });

  it('blocks evidence when ordinary local proof vector negative cases carry stray proof or root overrides', () => {
    const proofOverrideCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            proof: TRUSTLESS_BURN_PROOF.proof,
          },
        }
        : negativeCase,
    );
    const proofOverrideResult = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases: proofOverrideCases })),
    );
    expect(proofOverrideResult.status).toBe('BLOCKED');
    expect(proofOverrideResult.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-recipient].settlementBinding.proof must not override the proof path for this negative case',
    );

    const rootOverrideCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-amount'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            bridgeEventRootHex: BRIDGE_EVENT_ROOT,
          },
        }
        : negativeCase,
    );
    const rootOverrideResult = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases: rootOverrideCases })),
    );
    expect(rootOverrideResult.status).toBe('BLOCKED');
    expect(rootOverrideResult.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-amount].settlementBinding.bridgeEventRootHex must not override bridgeEventRoot for this negative case',
    );
  });

  it('blocks evidence when local proof vector leaf overrides drift outside their negative case field', () => {
    const extraLeafDriftCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-sidechain-id' && negativeCase.leaf
        ? {
          ...negativeCase,
          leaf: {
            ...negativeCase.leaf,
            eventIndex: 9,
          },
        }
        : negativeCase,
    );
    const extraLeafDriftResult = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases: extraLeafDriftCases })),
    );
    expect(extraLeafDriftResult.status).toBe('BLOCKED');
    expect(extraLeafDriftResult.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id].leaf.eventIndex must match the positive leaf for this negative case',
    );

    const strayLeafCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-recipient'
        ? {
          ...negativeCase,
          leaf: TRUSTLESS_BURN_LEAVES[0],
        }
        : negativeCase,
    );
    const strayLeafResult = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases: strayLeafCases })),
    );
    expect(strayLeafResult.status).toBe('BLOCKED');
    expect(strayLeafResult.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-recipient].leaf must not override the positive leaf for this negative case',
    );
  });

  it('blocks evidence when wrong bridgeEventRoot cases mutate the proof path', () => {
    const negativeCases = trustlessBurnNegativeCases().map(negativeCase => {
      if (negativeCase.name !== 'wrong-bridge-event-root') return negativeCase;
      const settlementBinding = { ...negativeCase.settlementBinding } as Record<string, unknown>;
      delete settlementBinding.bridgeEventRootHex;
      return {
        ...negativeCase,
        settlementBinding: {
          ...settlementBinding,
          proof: [{ side: 'right', hashHex: 'a'.repeat(64) }],
        },
      };
    });
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-bridge-event-root].settlementBinding.bridgeEventRootHex must provide the wrong bridgeEventRoot override',
    );
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-bridge-event-root].settlementBinding.proof must not override the proof path; mutate bridgeEventRootHex instead',
    );
  });

  it('blocks evidence when malformed inclusion path cases use root drift instead of a mutated proof path', () => {
    const negativeCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'malformed-inclusion-path'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            bridgeEventRootHex: 'a'.repeat(64),
            proof: TRUSTLESS_BURN_PROOF.proof,
          },
        }
        : negativeCase,
    );
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({ negativeCases })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[malformed-inclusion-path].settlementBinding.proof must differ from the positive proof path',
    );
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[malformed-inclusion-path].settlementBinding.bridgeEventRootHex must not override bridgeEventRoot; mutate settlementBinding.proof instead',
    );
  });

  it('blocks evidence when local proof vector negative case proof steps omit hashHex', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        negativeCaseExtra: {
          settlementBinding: {
            duplicatePreventionKeyHex: DUP_KEY,
            recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
            amountNanoErg: '1000000',
            assetIdHex: ASSET_ID,
            proof: [{ side: 'right' }],
          },
        },
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id].settlementBinding.proof[0].hashHex must be a 32-byte hex string',
    );
  });

  it('blocks evidence when local proof vector negative case proof steps use invalid sides', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        negativeCaseExtra: {
          settlementBinding: {
            duplicatePreventionKeyHex: DUP_KEY,
            recipientErgoTreeHashHex: RECIPIENT_ERGO_TREE_HASH,
            amountNanoErg: '1000000',
            assetIdHex: ASSET_ID,
            proof: [{ side: 'center', hashHex: 'a'.repeat(64) }],
          },
        },
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-sidechain-id].settlementBinding.proof[0].side must be left or right',
    );
  });

  it('blocks evidence when the local proof vector omits structured negative cases', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        negativeCases: [],
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Local Proof Vector: negativeCases must include wrong-sidechain-id');
  });

  it('blocks evidence when the local proof vector omits the negativeCases array', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        omitNegativeCases: true,
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases must be an array of local negative proof cases',
    );
    expect(result.errors).toContain('Local Proof Vector: negativeCases must include wrong-sidechain-id');
  });

  it('blocks evidence instead of throwing when negative cases cannot bind to a positive leaf', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        omitLeaf: true,
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Local Proof Vector: leaf must be an object');
    expect(result.errors).toContain(
      'Local Proof Vector: positive proof leaf must be an object before negative proof cases can be evaluated',
    );
    expect(result.errors.some(error => error.includes('Cannot read properties'))).toBe(false);
  });

  it('blocks evidence when a local proof vector negative case does not fail closed', () => {
    const acceptingNegativeCases = trustlessBurnNegativeCases().map(negativeCase =>
      negativeCase.name === 'wrong-amount'
        ? {
          ...negativeCase,
          settlementBinding: {
            ...negativeCase.settlementBinding,
            amountNanoErg: '1000000',
          },
        }
        : negativeCase,
    );
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        negativeCases: acceptingNegativeCases,
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: negativeCases[wrong-amount] must be rejected by proof-core settlement binding',
    );
  });

  it('blocks evidence when the local proof vector diverges from burn binding rows', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace(localProofVector(), localProofVector({
        recipientErgoTreeHashHex: 'd'.repeat(64),
        amountNanoErg: '2000000',
      })),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Local Proof Vector: settlement recipient must equal proved recipientErgoTreeHash',
    );
    expect(result.errors).toContain('Local Proof Vector: settlement amount must equal proved amountNanoErg');
    expect(result.errors).toContain(
      'Local Proof Vector: recipientErgoTreeHashHex must match Burn Proof Binding recipientErgoTreeHash',
    );
    expect(result.errors).toContain(
      'Local Proof Vector: amountNanoErg must match Burn Proof Binding amountNanoErg',
    );
  });

  it('requires trustless burn evidence dates to use ISO calendar format', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Classification: Date must use YYYY-MM-DD');
  });

  it('requires trustless burn Git commits to use commit SHA format', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate evidence classification and publication decision fields', () => {
    const result = validateTrustlessBurnEvidence(
      trustlessEvidence()
        .replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |')
        .replace('| Production-ready claim allowed | no |', '| Production-ready claim allowed | no |\n| Production-ready claim allowed | yes |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Classification: Git commit: duplicate required field');
    expect(result.errors).toContain('Publication Decision: Production-ready claim allowed: duplicate required field');
  });

  it('blocks transitional trust paths before Gate 5 evidence can pass', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      trustPath: 'transitional trusted burn path',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Classification: Trust path must be trustless burn proof path before Gate 5 evidence can pass',
    );
  });

  it('blocks broadcast-enabled trustless burn proof evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      broadcastMode: 'enabled',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Classification: Broadcast mode must be one of disabled, dry-run',
    );
  });

  it('blocks unimplemented trustless burn verification', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      implemented: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Trustless burn verification implemented must be yes before Gate 5 evidence can pass',
    );
  });

  it('requires critical/high findings open to use exact numeric zero', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      criticalHigh: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: critical/high findings open must be 0 before Gate 5 evidence can pass',
    );
  });

  it('blocks missing component evidence and pending rows', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: '| Sidechain commitment format | reviewed | | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Components: Ergo extension-section anchoring: missing required row');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: status must be linked before Gate 5 evidence can pass',
    );
  });

  it('rejects duplicate required trustless-burn rows', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: `${componentRows}\n| Sidechain commitment format | Stable, versioned, sidechain-specific commitment format | artifact://trustless-burn/sidechain-commitment-second.log | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Components: Sidechain commitment format: duplicate required row');
  });

  it('requires required components to state component-specific trustless properties', () => {
    const vagueComponentRows = componentRows
      .replace(
        '| Sidechain commitment format | Stable, versioned, sidechain-specific commitment format |',
        '| Sidechain commitment format | reviewed and tested |',
      )
      .replace(
        '| Reorg handling | Reorged sidechain commitments cannot release ERG |',
        '| Reorg handling | reviewed and tested |',
      )
      .replace(
        '| Independent review | Independent consensus commitment proof and operator recovery review |',
        '| Independent review | reviewed and tested |',
      );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: vagueComponentRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: must state stable or versioned commitment format',
    );
    expect(result.errors).toContain(
      'Required Components: Reorg handling: must state reverted commitments cannot release ERG',
    );
    expect(result.errors).toContain(
      'Required Components: Independent review: must state independent review',
    );
  });

  it('blocks missing commitment fields', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      commitments: '| sidechainId | fixed-width | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Commitment Format: sidechainHeight: missing required row');
    expect(result.errors).toContain('Commitment Format: sidechainId: linked status requires an evidence marker');
  });

  it('requires trustless commitment values to name 0x04xx and Blake2b constraints', () => {
    const vagueCommitmentRows = commitmentRows
      .replace(
        '| commitmentPrefix | 0x04xx sidechain extension keyspace prefix |',
        '| commitmentPrefix | versioned prefix |',
      )
      .replace(
        '| hashFunction | Blake2b-256 compatible digest |',
        '| hashFunction | receipt-compatible digest |',
      );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      commitments: vagueCommitmentRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Commitment Format: commitmentPrefix: must mention the 0x04xx extension keyspace',
    );
    expect(result.errors).toContain(
      'Commitment Format: hashFunction: must mention Blake2b-compatible hashing',
    );
  });

  it('requires commitment cryptographic fields to include concrete values', () => {
    const vagueCommitmentRows = commitmentRows
      .replace(
        `| sidechainId | ${SIDECHAIN_ID} fixed-width sidechain identifier |`,
        '| sidechainId | fixed-width sidechain identifier |',
      )
      .replace(
        '| sidechainHeight | 12345 |',
        '| sidechainHeight | fixed-width sidechain height |',
      )
      .replace(
        `| sidechainHeaderHash | ${SIDECHAIN_HEADER_HASH} 32-byte sidechain header hash |`,
        `| sidechainHeaderHash | ${SIDECHAIN_HEADER_HASH} ${BRIDGE_EVENT_ROOT} 32-byte sidechain header hash |`,
      )
      .replace(
        `| bridgeEventRoot | ${BRIDGE_EVENT_ROOT} 32-byte bridge event root |`,
        '| bridgeEventRoot | 32-byte bridge event root |',
      )
      .replace(
        '| ergoAnchorHeight | 67890 |',
        '| ergoAnchorHeight | fixed-width Ergo anchor height |',
      );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      commitments: vagueCommitmentRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: value or encoding must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainHeight: value or encoding must be a non-negative integer',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainHeaderHash: value or encoding must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Commitment Format: bridgeEventRoot: value or encoding must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Commitment Format: ergoAnchorHeight: value or encoding must be a non-negative integer',
    );
  });

  it('blocks missing burn proof bindings', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      burnProofs: '| burnId | | artifact://trustless-burn/burn-id.json | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Burn Proof Binding: recipientErgoTreeHash: missing required row');
    expect(result.errors).toContain('Burn Proof Binding: burnId: binding rule is required');
  });

  it('requires burn proof bindings to be field-specific', () => {
    const vagueBurnProofRows = burnProofRows
      .replace(
        `| recipientErgoTreeHash | ${RECIPIENT_ERGO_TREE_HASH} binds the payout recipient to the proved leaf |`,
        '| recipientErgoTreeHash | bound to settlement payload |',
      )
      .replace(
        '| amountNanoErg | 1000000 binds the payout amount to the proved leaf |',
        '| amountNanoErg | bound to settlement payload |',
      )
      .replace(
        '| inclusionPath | verifies burn inclusion against the committed burn tree root |',
        '| inclusionPath | proof bytes accepted |',
      )
      .replace(
        `| duplicatePreventionKey | ${DUP_KEY} DUP duplicate-prevention key is derived from the burn identifier |`,
        '| duplicatePreventionKey | derived from proof |',
      )
      .replace(
        '| settlementTxBinding | settlement transaction payout recipient and amount are derived from the proof |',
        '| settlementTxBinding | proof output matches transaction |',
      );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      burnProofs: vagueBurnProofRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Burn Proof Binding: recipientErgoTreeHash: must bind the payout recipient',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: amountNanoErg: must bind the payout amount',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: inclusionPath: must describe inclusion or membership verification',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: inclusionPath: must bind to the committed burn tree or root',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: duplicatePreventionKey: must bind to duplicate prevention',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: duplicatePreventionKey: must bind duplicate prevention to the burn identifier',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: settlementTxBinding: must bind the settlement payout fields',
    );
  });

  it('requires burn proof binding fields to include concrete values', () => {
    const vagueBurnProofRows = burnProofRows
      .replace(
        `| burnId | ${BURN_ID} burn identifier included in the proved leaf |`,
        '| burnId | burn identifier included in the proved leaf |',
      )
      .replace(
        `| recipientErgoTreeHash | ${RECIPIENT_ERGO_TREE_HASH} binds the payout recipient to the proved leaf |`,
        '| recipientErgoTreeHash | binds the payout recipient to the proved leaf |',
      )
      .replace(
        '| amountNanoErg | 1000000 binds the payout amount to the proved leaf |',
        '| amountNanoErg | binds the payout amount to the proved leaf |',
      )
      .replace(
        `| sidechainTxHash | ${SIDECHAIN_TX_HASH} binds the source sidechain transaction hash |`,
        `| sidechainTxHash | ${SIDECHAIN_TX_HASH} ${SIDECHAIN_BLOCK_HASH} binds the source sidechain transaction hash |`,
      )
      .replace(
        `| sidechainBlockHash | ${SIDECHAIN_BLOCK_HASH} binds the source sidechain block hash |`,
        '| sidechainBlockHash | binds the source sidechain block hash |',
      )
      .replace(
        '| eventIndex | 0 binds the burn event index in the block |',
        '| eventIndex | binds the burn event index in the block |',
      )
      .replace(
        `| duplicatePreventionKey | ${DUP_KEY} DUP duplicate-prevention key is derived from the burn identifier |`,
        '| duplicatePreventionKey | DUP duplicate-prevention key is derived from the burn identifier |',
      );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      burnProofs: vagueBurnProofRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: binding rule must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: recipientErgoTreeHash: binding rule must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: amountNanoErg: binding rule must include exactly one non-negative integer',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: sidechainTxHash: binding rule must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: sidechainBlockHash: binding rule must include exactly one 32-byte hex value',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: eventIndex: binding rule must include exactly one non-negative integer',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: duplicatePreventionKey: binding rule must include exactly one 32-byte hex value',
    );
  });

  it('rejects zero-valued burn amounts before Gate 5 evidence can pass', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      burnProofs: burnProofRows.replace(
        '| amountNanoErg | 1000000 binds the payout amount to the proved leaf |',
        '| amountNanoErg | 0 binds the payout amount to the proved leaf |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Burn Proof Binding: amountNanoErg: binding rule must include a positive nanoERG amount',
    );
  });

  it('rejects burn amounts above the proof-core uint64 domain before Gate 5 evidence can pass', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      burnProofs: burnProofRows.replace(
        '| amountNanoErg | 1000000 binds the payout amount to the proved leaf |',
        '| amountNanoErg | 18446744073709551616 binds the payout amount to the proved leaf |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Burn Proof Binding: amountNanoErg: binding rule must fit uint64 amountNanoErg',
    );
  });

  it('requires positive proof acceptance evidence before Gate 5 can pass', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: '| Valid burn proof acceptance | accepted | | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass',
    );
  });

  it('requires positive proof acceptance evidence to cite accepted proof facts', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: '| Valid burn proof acceptance | reviewed | artifact://trustless-burn/accepted.log | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: expected result must state accepted, approved, passed, validated, or verified',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify accepted burn proof execution',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify accepted inclusion or membership proof',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify duplicate-prevention binding',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify settlement payout binding',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify the accepted burn ID',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify the accepted bridgeEventRoot commitment',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify settlement transaction binding',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify accepted recipient binding',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify accepted amount binding',
    );
  });

  it('rejects slash-delimited proof expected-result alternatives', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows.replace('| Valid burn proof acceptance | accepted |', '| Valid burn proof acceptance | accepted/rejected |'),
      negatives: negativeRows.replace(
        '| Trusted-oracle fallback presented as trustless | rejected |',
        '| Trusted-oracle fallback presented as trustless | rejected/accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: expected result must use one exact positive outcome without slash-delimited alternatives',
    );
    expect(result.errors).toContain(
      'Negative Tests: Trusted-oracle fallback presented as trustless: expected result must use one exact fail-closed outcome without slash-delimited alternatives',
    );
  });

  it('requires positive proof acceptance evidence to cite the concrete committed event root', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows.replace(`; bridgeEventRoot ${BRIDGE_EVENT_ROOT}`, ''),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must identify the accepted bridgeEventRoot commitment',
    );
  });

  it('requires positive proof acceptance evidence to match the committed burn instance values', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows
        .replace(`bridgeEventRoot ${BRIDGE_EVENT_ROOT}`, `bridgeEventRoot ${'9'.repeat(64)}`)
        .replace(`burnId ${BURN_ID}`, `burnId ${'a'.repeat(64)}`)
        .replace(`recipient ${RECIPIENT_ERGO_TREE_HASH}`, `recipient ${'b'.repeat(64)}`)
        .replace('amount 1000000', 'amount 2000000'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Commitment Format bridgeEventRoot',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding burnId',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding recipientErgoTreeHash',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding amountNanoErg',
    );
  });

  it('requires positive proof acceptance evidence to bind committed root and recipient values to their labels', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows
        .replace(
          `bridgeEventRoot ${BRIDGE_EVENT_ROOT}`,
          `bridgeEventRoot ${'9'.repeat(64)}; raw committed root ${BRIDGE_EVENT_ROOT}`,
        )
        .replace(
          `recipient ${RECIPIENT_ERGO_TREE_HASH}`,
          `recipient ${'b'.repeat(64)}; raw recipient hash ${RECIPIENT_ERGO_TREE_HASH}`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Commitment Format bridgeEventRoot',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding recipientErgoTreeHash',
    );
  });

  it('requires positive proof acceptance evidence to match the source burn proof instance bindings', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows
        .replace(`sidechainTxHash ${SIDECHAIN_TX_HASH}`, `sidechainTxHash ${'c'.repeat(64)}`)
        .replace(`sidechainBlockHash ${SIDECHAIN_BLOCK_HASH}`, `sidechainBlockHash ${'d'.repeat(64)}`)
        .replace('eventIndex 0', 'eventIndex 1')
        .replace(`duplicatePreventionKey ${DUP_KEY}`, `duplicatePreventionKey ${'e'.repeat(64)}`),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding sidechainTxHash',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding sidechainBlockHash',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding eventIndex',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: evidence must match Burn Proof Binding duplicatePreventionKey',
    );
  });

  it('blocks negative tests without evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: '| Wrong recipient | rejected | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Negative Tests: Wrong sidechain ID: missing required row');
    expect(result.errors).toContain('Negative Tests: Wrong recipient: linked status requires an evidence marker');
  });

  it('requires negative test expected results to fail closed', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows.replace(
        `| Trusted-oracle fallback presented as trustless | rejected | artifact://trustless-burn/completed-negative-trusted-oracle-fallback-presented-as-trustless.log; rejected burnId ${BURN_ID} | linked |`,
        `| Trusted-oracle fallback presented as trustless | reviewed | artifact://trustless-burn/completed-negative-trusted-oracle-fallback-presented-as-trustless.log; rejected burnId ${BURN_ID} | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Trusted-oracle fallback presented as trustless: expected result must state rejected, blocked, refused, or failed',
    );
  });

  it('requires negative-test evidence to cite the rejected burn proof fact', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows
        .replace(
          `| Wrong sidechain ID | rejected | artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; rejected burnId ${BURN_ID}; ${localNegativeRowEvidenceFacts['Wrong sidechain ID']} | linked |`,
          `| Wrong sidechain ID | rejected | artifact://trustless-burn/completed-rejected.log; rejected burnId ${BURN_ID} | linked |`,
        )
        .replace(
          `| Unfinalized sidechain block | rejected | artifact://trustless-burn/completed-negative-unfinalized-sidechain-block.log; rejected burnId ${BURN_ID} | linked |`,
          `| Unfinalized sidechain block | rejected | artifact://trustless-burn/completed-rejected.log; rejected burnId ${BURN_ID} | linked |`,
        )
        .replace(
          `| Trusted-oracle fallback presented as trustless | rejected | artifact://trustless-burn/completed-negative-trusted-oracle-fallback-presented-as-trustless.log; rejected burnId ${BURN_ID} | linked |`,
          `| Trusted-oracle fallback presented as trustless | rejected | artifact://trustless-burn/completed-rejected.log; rejected burnId ${BURN_ID} | linked |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must identify wrong sidechain ID rejection',
    );
    expect(result.errors).toContain(
      'Negative Tests: Unfinalized sidechain block: evidence must identify unfinalized sidechain block rejection',
    );
    expect(result.errors).toContain(
      'Negative Tests: Trusted-oracle fallback presented as trustless: evidence must identify trusted-oracle fallback rejection',
    );
  });

  it('requires linked negative-test evidence to cite a concrete rejected proof identifier', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows.replace(
        `| Wrong amount | rejected | artifact://trustless-burn/completed-negative-wrong-amount.log; rejected burnId ${BURN_ID}; ${localNegativeRowEvidenceFacts['Wrong amount']} | linked |`,
        '| Wrong amount | rejected | artifact://trustless-burn/completed-negative-wrong-amount.log; wrong amount rejected | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Wrong amount: evidence must include at least one concrete 32-byte rejected proof or burn identifier',
    );
  });

  it('requires local proof-core negative rows to cite the structured negative case and observed error', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows.replace(
        `| Wrong sidechain ID | rejected | artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; rejected burnId ${BURN_ID}; ${localNegativeRowEvidenceFacts['Wrong sidechain ID']} | linked |`,
        `| Wrong sidechain ID | rejected | artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; rejected burnId ${BURN_ID}; wrong sidechain ID rejected | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must cite Local Proof Vector negativeCase wrong-sidechain-id',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must cite observed Local Proof Vector negativeCase wrong-sidechain-id error',
    );
  });

  it('requires local proof-core negative rows to cite exact observed error strings', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows.replace(
        localNegativeRowEvidenceFacts['Wrong sidechain ID'],
        `${localNegativeRowEvidenceFacts['Wrong sidechain ID']} suffix`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: evidence must cite observed Local Proof Vector negativeCase wrong-sidechain-id error',
    );
  });

  it('requires reused burn ID evidence to cite local proof-core burn identity and DUP negative cases', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows.replace(
        /^\| Reused burn ID \| rejected \| .* \| linked \|$/m,
        `| Reused burn ID | rejected | artifact://trustless-burn/completed-negative-reused-burn-id.log; rejected burnId ${BURN_ID}; reused burn ID duplicate rejected | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Reused burn ID: evidence must cite Local Proof Vector negativeCase wrong-burn-id',
    );
    expect(result.errors).toContain(
      'Negative Tests: Reused burn ID: evidence must cite observed Local Proof Vector negativeCase wrong-burn-id error',
    );
    expect(result.errors).toContain(
      'Negative Tests: Reused burn ID: evidence must cite Local Proof Vector negativeCase wrong-event-index',
    );
    expect(result.errors).toContain(
      'Negative Tests: Reused burn ID: evidence must cite Local Proof Vector negativeCase wrong-duplicate-prevention-key',
    );
    expect(result.errors).toContain(
      'Negative Tests: Reused burn ID: evidence must cite observed Local Proof Vector negativeCase wrong-duplicate-prevention-key error',
    );
  });

  it('requires stale SPV tracker digest evidence to cite the local proof-core bridge-root negative case', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows.replace(
        /^\| Stale SPV tracker digest \| rejected \| .* \| linked \|$/m,
        `| Stale SPV tracker digest | rejected | artifact://trustless-burn/completed-negative-stale-spv-tracker-digest.log; rejected burnId ${BURN_ID}; stale SPV tracker digest rejected | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Tests: Stale SPV tracker digest: evidence must cite Local Proof Vector negativeCase wrong-bridge-event-root',
    );
    expect(result.errors).toContain(
      'Negative Tests: Stale SPV tracker digest: evidence must cite observed Local Proof Vector negativeCase wrong-bridge-event-root error',
    );
  });

  it('rejects linked trustless burn rows that only point to templates or bare validator commands', () => {
    const templateOnlyEvidence =
      '[Trustless Burn Verification Evidence Template](trustless-burn-verification-evidence-template.md), `npm run trustless:validate`';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        templateOnlyEvidence,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        templateOnlyEvidence,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        templateOnlyEvidence,
      ),
      positives: positiveRows.replace(
        validPositiveProofEvidence,
        validPositiveProofEvidence.replace(
          'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
          templateOnlyEvidence,
        ),
      ),
      negatives: negativeRows.replace(
        'artifact://trustless-burn/completed-negative-wrong-sidechain-id.log',
        templateOnlyEvidence,
      ),
      checklistUpdates: templateOnlyEvidence,
      releaseNoteUpdates: templateOnlyEvidence,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects row-named generic artifact targets for linked trustless burn rows', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        'artifact://trustless-burn/generic-sidechain-commitment-format.log',
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        'artifact://trustless-burn/generic-sidechainid.json',
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        'artifact://trustless-burn/generic-burnid.json',
      ),
      positives: positiveRows.replace(
        'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
        'artifact://trustless-burn/generic-valid-burn-proof-acceptance.log',
      ),
      negatives: negativeRows.replace(
        'artifact://trustless-burn/completed-negative-wrong-sidechain-id.log',
        'artifact://trustless-burn/generic-wrong-sidechain-id.log',
      ),
      checklistUpdates:
        'artifact://trustless-burn/generic-completed-gate-5-checklist-update-evidence.md',
      releaseNoteUpdates:
        'artifact://trustless-burn/generic-completed-gate-5-release-note-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects row-named sample trustless burn artifact targets for linked trustless burn rows', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        'artifact://trustless-burn/sample-trustless-component-sidechain-commitment-format.log',
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        'artifact://trustless-burn/sample-commitment-sidechainid.json',
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        'artifact://trustless-burn/sample-burn-proof-burnid.json',
      ),
      positives: positiveRows.replace(
        'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
        'artifact://trustless-burn/sample-positive-proof-valid-burn-proof-acceptance.log',
      ),
      negatives: negativeRows.replace(
        'artifact://trustless-burn/completed-negative-wrong-sidechain-id.log',
        'artifact://trustless-burn/sample-negative-test-wrong-sidechain-id.log',
      ),
      checklistUpdates:
        'artifact://trustless-burn/sample-checklist-update-completed-gate-5-checklist-update-evidence.md',
      releaseNoteUpdates:
        'artifact://trustless-burn/sample-release-note-update-completed-gate-5-release-note-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a completed Gate 5 checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed Gate 5 release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for linked trustless burn evidence', () => {
    const claimEscalatingPositiveProofEvidence = validPositiveProofEvidence.replace(
      'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
      'artifact://trustless-burn/completed-valid-burn-proof-acceptance-mainnet-production-certified.log',
    );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        'artifact://trustless-burn/completed-component-sidechain-commitment-format-testnet-production-candidate.log',
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        'artifact://trustless-burn/completed-commitment-sidechainid-production-ready-approved.json',
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        'artifact://trustless-burn/completed-burn-proof-burnid-mainnet-production-certified.json',
      ),
      positives: positiveRows.replace(validPositiveProofEvidence, claimEscalatingPositiveProofEvidence),
      negatives: negativeRows.replace(
        'artifact://trustless-burn/completed-negative-wrong-sidechain-id.log',
        'artifact://trustless-burn/completed-negative-wrong-sidechain-id-production-ready-approved.log',
      ),
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence-mainnet-production-certified.md',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence-production-ready-approved.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a completed Gate 5 checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed Gate 5 release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects targetless command-output notes for linked trustless burn proof rows', () => {
    const targetlessCommandOutput = 'npm run trustless:validate command output: PASS';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        targetlessCommandOutput,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        targetlessCommandOutput,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        targetlessCommandOutput,
      ),
      positives: positiveRows.replace(
        validPositiveProofEvidence,
        validPositiveProofEvidence.replace(
          'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
          targetlessCommandOutput,
        ),
      ),
      negatives: negativeRows.replace(
        `artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; rejected burnId ${BURN_ID}`,
        `${targetlessCommandOutput}; wrong sidechain ID rejected; rejected burnId ${BURN_ID}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects validation-target-only evidence for linked trustless burn rows', () => {
    const validationTargetPrefix = 'trustless burn validation target ';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `${validationTargetPrefix}artifact://trustless-burn/completed-component-sidechain-commitment-format.log`,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        `${validationTargetPrefix}artifact://trustless-burn/completed-commitment-sidechainid.json`,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        `${validationTargetPrefix}artifact://trustless-burn/completed-burn-proof-burnid.json`,
      ),
      positives: positiveRows.replace(
        validPositiveProofEvidence,
        `${validationTargetPrefix}${validPositiveProofEvidence}`,
      ),
      negatives: negativeRows.replace(
        `artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; rejected burnId ${BURN_ID}`,
        `${validationTargetPrefix}artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; wrong sidechain ID rejected; rejected burnId ${BURN_ID}`,
      ),
      checklistUpdates:
        `${validationTargetPrefix}artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md`,
      releaseNoteUpdates:
        `${validationTargetPrefix}artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Negative Tests: Wrong sidechain ID: linked status requires completed negative-test evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects separator-delimited validation-target-only evidence for linked trustless burn rows', () => {
    const validationTargetPrefix = 'trustless-burn-validation-target ';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `${validationTargetPrefix}artifact://trustless-burn/completed-component-sidechain-commitment-format.log`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('accepts concrete trustless burn evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://trustless-burn/validation/trustless-validate-input.md';
    const validationTargetBinding = `trustless burn validation target ${validationTarget}`;
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        `artifact://trustless-burn/completed-component-sidechain-commitment-format.log; ${validationTargetBinding}`,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        `artifact://trustless-burn/completed-commitment-sidechainid.json; ${validationTargetBinding}`,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        `artifact://trustless-burn/completed-burn-proof-burnid.json; ${validationTargetBinding}`,
      ),
      positives: positiveRows.replace(
        validPositiveProofEvidence,
        `${validPositiveProofEvidence}; ${validationTargetBinding}`,
      ),
      negatives: negativeRows.replace(
        `artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; rejected burnId ${BURN_ID}`,
        `artifact://trustless-burn/completed-negative-wrong-sidechain-id.log; wrong sidechain ID rejected; rejected burnId ${BURN_ID}; ${validationTargetBinding}`,
      ),
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md completed Gate 5 checklist update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0; ${validationTargetBinding}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md completed Gate 5 release-note update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0; ${validationTargetBinding}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects proof-vector report targets reused as linked trustless burn row evidence', () => {
    const proofVectorReportEvidence =
      `[proof-vector report](${completedLocalProofVectorReportTarget}) completed component evidence`;
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        proofVectorReportEvidence,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status must not reuse the Local Proof Vector report target as completed row evidence',
    );
  });

  it('rejects proof-vector report targets reused as trustless burn publication-update evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        `[proof-vector report](${completedLocalProofVectorReportTarget}) completed Gate 5 checklist update evidence`,
      releaseNoteUpdates:
        `[proof-vector report](${completedLocalProofVectorReportTarget}) completed Gate 5 release-note update evidence`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not reuse the Local Proof Vector report target as completed publication-update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not reuse the Local Proof Vector report target as completed publication-update evidence',
    );
  });

  it('rejects negated completion wording for concrete trustless burn evidence targets', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        'not completed artifact://trustless-burn/component-sidechain-commitment-format.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('accepts command-output context when linked trustless burn rows include a concrete evidence target', () => {
    const targetedCommandOutput =
      'npm run trustless:validate command output: PASS; artifact://trustless-burn/completed-component-sidechain-commitment-format.log';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        targetedCommandOutput,
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it.each([
    'artifact://',
    'artifact:// ',
    'artifact:// component evidence',
    'artifact://completed component evidence',
    'artifact://trustless-burn/trustless-burn-verification-evidence-template.md',
    'artifact://trustless-burn/generic-proof.log',
    'artifact://trustless-burn/placeholder-proof.log',
    'artifact://trustless-burn/example-proof.log',
    'artifact://trustless-burn/sample-proof.log',
    'artifact://trustless-burn/todo-proof.log',
    'artifact://trustless-burn/fixture-proof.log',
    'artifact://trustless-burn/mock-proof.log',
    'artifact://trustless-burn/dummy-proof.log',
    'artifact://trustless-burn/fake-proof.log',
    'artifact://trustless-burn/stub-proof.log',
    'artifact://trustless-burn/testdata-proof.log',
    'artifact://trustless-burn/completed-synthetic-proof.log',
    'artifact://trustless-burn/completed-simulated-proof.log',
    'artifact://trustless-burn/not-completed-proof.log',
    'artifact://trustless-burn/uncompleted-proof.log',
  ])(
    'rejects targetless or non-concrete artifact marker %s for linked trustless burn rows',
    targetlessArtifact => {
      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentRows.replace(
          'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
          targetlessArtifact,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
      );
    },
  );

  it.each([
    '[generic](artifact://trustless-burn/generic-proof.log)',
    '[template](artifact://trustless-burn/template-proof.log)',
    '[placeholder](artifact://trustless-burn/placeholder-proof.log)',
    '[sample](artifact://trustless-burn/sample-proof.log)',
    '[example](artifact://trustless-burn/example-proof.log)',
    '[todo](artifact://trustless-burn/todo-proof.log)',
    '[fixture](artifact://trustless-burn/fixture-proof.log)',
    '[mock](artifact://trustless-burn/mock-proof.log)',
    '[dummy](artifact://trustless-burn/dummy-proof.log)',
    '[fake](artifact://trustless-burn/fake-proof.log)',
    '[stub](artifact://trustless-burn/stub-proof.log)',
    '[testdata](artifact://trustless-burn/testdata-proof.log)',
    '[synthetic](artifact://trustless-burn/completed-synthetic-proof.log)',
    '[simulated](artifact://trustless-burn/completed-simulated-proof.log)',
    '[not completed](artifact://trustless-burn/not-completed-proof.log)',
    '[uncompleted](artifact://trustless-burn/uncompleted-proof.log)',
  ])(
    'rejects non-concrete Markdown artifact link %s for linked trustless burn rows',
    markdownArtifact => {
      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentRows.replace(
          'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
          markdownArtifact,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
      );
    },
  );

  it('accepts concrete Markdown artifact links for linked trustless burn rows', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        '[evidence](artifact://trustless-burn/completed-sidechain-commitment-format-20260514.log)',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects non-concrete Markdown evidence link targets for linked trustless burn rows', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        '[component evidence](../evidence/trustless-burn/placeholder-sidechain-commitment-format.log)',
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        '[commitment evidence](../evidence/trustless-burn/todo-sidechainid.json)',
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        '[burn proof evidence](../evidence/trustless-burn/tbd-burnid.json)',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    );
    expect(result.errors).toContain(
      'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it.each([
    {
      variant: 'raw',
      componentTarget: ['', 'tmp', 'completed-sidechain-commitment-format.log'].join('/'),
      commitmentTarget: ['file:', '', '', 'C:', 'tmp', 'completed-sidechainid.json'].join('/'),
      burnProofTarget: ['', '', 'operator-share', 'completed-burn-proof-burnid.json'].join('/'),
    },
    {
      variant: 'encoded',
      componentTarget: '%2Ftmp%2Fcompleted-sidechain-commitment-format.log',
      commitmentTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fcompleted-sidechainid.json',
      burnProofTarget: '%2F%2Foperator-share%2Fcompleted-burn-proof-burnid.json',
    },
    {
      variant: 'embedded encoded',
      componentTarget: 'artifact://trustless-burn/sourceTarget=%2Ftmp%2Fcompleted-sidechain-commitment-format.log',
      commitmentTarget:
        'artifact://trustless-burn/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fcompleted-sidechainid.json',
      burnProofTarget:
        'artifact://trustless-burn/sourceTarget=%2F%2Foperator-share%2Fcompleted-burn-proof-burnid.json',
    },
  ])(
    'rejects $variant local-only Markdown evidence link targets for linked trustless burn rows',
    ({ componentTarget, commitmentTarget, burnProofTarget }) => {
      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        components: componentRows.replace(
          'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
          `[component evidence](${componentTarget}) completed component evidence`,
        ),
        commitments: commitmentRows.replace(
          'artifact://trustless-burn/completed-commitment-sidechainid.json',
          `[commitment evidence](${commitmentTarget}) completed commitment evidence`,
        ),
        burnProofs: burnProofRows.replace(
          'artifact://trustless-burn/completed-burn-proof-burnid.json',
          `[burn proof evidence](${burnProofTarget}) completed burn-proof evidence`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
      );
      expect(result.errors).toContain(
        'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
      );
    },
  );

  it.each([
    {
      row: 'component secret Markdown target',
      overrides: () => ({
        components: componentRows.replace(
          'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
          '[component evidence](relayer/private-key-proof.md) completed component evidence',
        ),
      }),
      expectedError:
        'Required Components: Sidechain commitment format: linked status requires completed component evidence, a non-template evidence link, or an artifact marker',
    },
    {
      row: 'commitment mnemonic Markdown target',
      overrides: () => ({
        commitments: commitmentRows.replace(
          'artifact://trustless-burn/completed-commitment-sidechainid.json',
          '[commitment evidence](relayer/wallet-mnemonic-proof.json) completed commitment evidence',
        ),
      }),
      expectedError:
        'Commitment Format: sidechainId: linked status requires completed commitment evidence, a non-template evidence link, or an artifact marker',
    },
    {
      row: 'burn-proof runtime artifact target',
      overrides: () => ({
        burnProofs: burnProofRows.replace(
          'artifact://trustless-burn/completed-burn-proof-burnid.json',
          'artifact://trustless-burn/bridge-state-proof.sqlite',
        ),
      }),
      expectedError:
        'Burn Proof Binding: burnId: linked status requires completed burn-proof evidence, a non-template evidence link, or an artifact marker',
    },
  ])(
    'rejects sensitive or runtime evidence targets for linked trustless burn rows: $row',
    ({ overrides, expectedError }) => {
      const result = validateTrustlessBurnEvidence(trustlessEvidence(overrides()));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(expectedError);
    },
  );

  it('accepts concrete artifact names that mention sample size or template removal', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        'artifact://trustless-burn/completed-sample-size-analysis.log',
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        '[template removal audit](artifact://trustless-burn/completed-template-removal-audit.log)',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects generic positive proof artifacts even when proof facts are present', () => {
    const genericPositiveProofEvidence = validPositiveProofEvidence.replace(
      'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
      'artifact://trustless-burn/generic-proof.log',
    );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows.replace(
        validPositiveProofEvidence,
        genericPositiveProofEvidence,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('rejects Markdown generic positive proof artifacts even when proof facts are present', () => {
    const genericPositiveProofEvidence = validPositiveProofEvidence.replace(
      'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
      '[generic proof](artifact://trustless-burn/generic-proof.log)',
    );
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      positives: positiveRows.replace(
        validPositiveProofEvidence,
        genericPositiveProofEvidence,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Positive Proof Acceptance: Valid burn proof acceptance: linked status requires completed positive proof evidence, a non-template evidence link, or an artifact marker',
    );
  });

  it('validates linked contract-equivalent acceptance reports against Gate 5 positive proof rows', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-contract-acceptance-report-'));
    try {
      const target = `${basename(outputDir)}/completed-local-contract-acceptance.json`;
      writeFileSync(join(process.cwd(), target), JSON.stringify(contractAcceptanceReport(), null, 2));

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        positives: positiveRows.replace(
          validPositiveProofEvidence,
          `${validPositiveProofEvidence}; Contract-equivalent acceptance report: ${target}`,
        ),
      }));

      expect(result.status).toBe('PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('blocks linked contract-equivalent acceptance reports whose root drifts from Gate 5 rows', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-contract-acceptance-report-'));
    try {
      const target = `${basename(outputDir)}/completed-local-contract-acceptance.json`;
      writeFileSync(
        join(process.cwd(), target),
        JSON.stringify(contractAcceptanceReport({ bridgeEventRootHex: 'a'.repeat(64) }), null, 2),
      );

      const result = validateTrustlessBurnEvidence(trustlessEvidence({
        positives: positiveRows.replace(
          validPositiveProofEvidence,
          `${validPositiveProofEvidence}; Contract-equivalent acceptance report: ${target}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Contract-equivalent acceptance report: identity.bridgeEventRootHex must match Commitment Format bridgeEventRoot',
      );
      expect(result.errors).toContain(
        'Contract-equivalent acceptance report: positiveAcceptance.derived.merkleRootHex must match Commitment Format bridgeEventRoot',
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects targetless command-output notes for trustless burn publication update evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'completed Gate 5 checklist update evidence: npm run trustless:validate command output: PASS',
      releaseNoteUpdates:
        'completed Gate 5 release-note update evidence: npm run trustless:validate command output: PASS',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a completed Gate 5 checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed Gate 5 release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete Markdown artifact links for trustless burn publication update evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'completed Gate 5 checklist update evidence: [done](artifact://trustless-burn/completed-gate-5-checklist-update-evidence-generic.md)',
      releaseNoteUpdates:
        'completed Gate 5 release-note update evidence: [done](artifact://trustless-burn/completed-gate-5-release-note-update-evidence-placeholder.md)',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must include a completed Gate 5 checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed Gate 5 release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires Gate 5-specific checklist and release-note update evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates: 'artifact://trustless-burn/release-checklist-update.md',
      releaseNoteUpdates: 'artifact://trustless-burn/release-notes-update.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must identify completed Gate 5 checklist update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed Gate 5 release-note update evidence',
    );
  });

  it('rejects Gate 5 publication update evidence kinds hidden inside longer labels', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/gate-5-checklist.md draft completed Gate 5 checklist update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/gate-5-release-notes.md candidate completed Gate 5 release-note update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must identify completed Gate 5 checklist update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed Gate 5 release-note update evidence',
    );
  });

  it('accepts compatibility-normalized Gate 5 publication update evidence kinds', () => {
    const gateLabel = '\uFF27\uFF41\uFF54\uFF45';
    const gateNumber = '\uFF15';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        `artifact://trustless-burn/completed-checklist-update.md completed ${gateLabel} ${gateNumber} checklist update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-release-note-update.md completed ${gateLabel} ${gateNumber} release-note update evidence; Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects trustless burn publication updates that approve production claim escalation', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md mainnet production-ready launch accepted',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md production-ready trustless burn claim approved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain production-ready claim wording',
    );
  });

  it('rejects trustless burn publication updates that close trusted paths with prose-only terms', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md transitional trusted burn path disabled',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md trusted burn path blocked',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Transitional trusted burn path disabled = yes; prose-only trusted path closure is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Transitional trusted burn path disabled = yes; prose-only trusted path closure is not accepted',
    );
  });

  it('requires exact transitional trusted burn path binding in trustless burn publication updates', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; Trustless burn verification implemented = yes; Critical/high findings open = 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; Trustless burn verification implemented = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Transitional trusted burn path disabled = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Transitional trusted burn path disabled = yes',
    );
  });

  it('requires exact production-ready claim denial in trustless burn publication updates', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; Trustless burn verification implemented = yes; Release supported = production deployment candidate; Testnet production-candidate claim allowed = yes; Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; Trustless burn verification implemented = yes; Release supported = production deployment candidate; Testnet production-candidate claim allowed = yes; Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
  });

  it('rejects trustless burn publication updates that close findings with numeric shorthand', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md critical high findings closure 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md critical/high findings count 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
    );
  });

  it('accepts exact critical/high finding closure bindings in trustless burn publication updates', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact critical/high finding closure bindings in trustless burn publication updates', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md Trustless burn verification implemented = yes',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md Trustless burn verification implemented = yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
    );
  });

  it('requires exact trustless implementation and testnet-candidate bindings in trustless burn publication updates', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; Release supported = production deployment candidate; Critical/high findings open = 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; Release supported = production deployment candidate; Critical/high findings open = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Trustless burn verification implemented = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Trustless burn verification implemented = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact release support binding in production-candidate trustless burn publication updates', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      checklistUpdates:
        'artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; Trustless burn verification implemented = yes; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0',
      releaseNoteUpdates:
        'artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; Trustless burn verification implemented = yes; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
  });

  it('requires production-candidate trustless burn publication decisions to carry exact release support', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: null,
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: Release supported is required');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate evidence requires exact `Release supported = production deployment candidate`',
    );
  });

  it('rejects trustless burn publication evidence and reviewer summaries that keep decision placeholders', () => {
    const placeholderBindings =
      'Release supported = production deployment candidate/institutional reference; Trustless burn verification implemented = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Transitional trusted burn path disabled = yes/no; Critical/high findings open = 0/1';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; ${placeholderBindings}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; ${placeholderBindings}`,
      reviewerDecisionSummary:
        'Release supported = production deployment candidate/institutional reference; ' +
        'trustless burn verification implementation: Trustless burn verification implemented = yes/no; ' +
        'production-ready claim handling: Production-ready claim allowed = no/yes; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes/no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes/no; ' +
        'critical/high findings handling: Critical/high findings open = 0/1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Trustless burn verification implemented = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Trustless burn verification implemented = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Transitional trusted burn path disabled = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Transitional trusted burn path disabled = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0; textual or shorthand critical/high finding terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0',
    );
  });

  it('rejects contradictory exact trustless-burn decision bindings in publication evidence', () => {
    const contradictoryDecisionBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Trustless burn verification implemented = yes; Trustless burn verification implemented = no; ' +
      'Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
      'Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
      'Transitional trusted burn path disabled = yes; Transitional trusted burn path disabled = no; ' +
      'Critical/high findings open = 0; Critical/high findings open = 1';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; ${contradictoryDecisionBindings}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; ${contradictoryDecisionBindings}`,
      reviewerDecisionSummary:
        `release support: ${contradictoryDecisionBindings}; ` +
        'trustless burn verification implementation: Trustless burn verification implemented = yes; Trustless burn verification implemented = no; ' +
        'production-ready claim handling: Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Transitional trusted burn path disabled = no; ' +
        'critical/high findings handling: Critical/high findings open = 0; Critical/high findings open = 1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must not include contradictory trustless-burn decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory trustless-burn decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory trustless-burn decision bindings',
    );
  });

  it('rejects reused publication update evidence targets', () => {
    const reusedPublicationTarget =
      'artifact://trustless-burn/completed-gate-5-publication-update-evidence.md';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates: `${reusedPublicationTarget} completed Gate 5 checklist update evidence`,
      releaseNoteUpdates: `${reusedPublicationTarget} completed Gate 5 release-note update evidence`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: required release checklist updates and required release-note updates must use distinct completed Gate 5 evidence targets',
    );
  });

  it('rejects reused completed evidence targets across Gate 5 proof row families', () => {
    const sharedComponentTarget =
      'artifact://trustless-burn/completed-shared-component-commitment-evidence.log';
    const sharedProofTarget =
      'artifact://trustless-burn/completed-shared-burn-positive-evidence.log';
    const sharedPositiveProofEvidence = validPositiveProofEvidence.replace(
      'artifact://trustless-burn/completed-valid-burn-proof-acceptance.log',
      sharedProofTarget,
    );

    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      components: componentRows.replace(
        'artifact://trustless-burn/completed-component-sidechain-commitment-format.log',
        sharedComponentTarget,
      ),
      commitments: commitmentRows.replace(
        'artifact://trustless-burn/completed-commitment-sidechainid.json',
        sharedComponentTarget,
      ),
      burnProofs: burnProofRows.replace(
        'artifact://trustless-burn/completed-burn-proof-burnid.json',
        sharedProofTarget,
      ),
      positives: positiveRows.replace(validPositiveProofEvidence, sharedPositiveProofEvidence),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trustless burn evidence: completed evidence target artifact://trustless-burn/completed-shared-component-commitment-evidence.log is reused by Required Components: Sidechain commitment format and Commitment Format: sidechainId',
    );
    expect(result.errors).toContain(
      'Trustless burn evidence: completed evidence target artifact://trustless-burn/completed-shared-burn-positive-evidence.log is reused by Burn Proof Binding: burnId and Positive Proof Acceptance: Valid burn proof acceptance',
    );
  });

  it('rejects reused completed evidence targets within Gate 5 negative rows', () => {
    const sharedNegativeTarget =
      'artifact://trustless-burn/completed-shared-negative-proof-core-evidence.log';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      negatives: negativeRows
        .replace(
          'artifact://trustless-burn/completed-negative-wrong-sidechain-id.log',
          sharedNegativeTarget,
        )
        .replace(
          'artifact://trustless-burn/completed-negative-wrong-recipient.log',
          sharedNegativeTarget,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trustless burn evidence: completed evidence target artifact://trustless-burn/completed-shared-negative-proof-core-evidence.log is reused by Negative Tests: Wrong sidechain ID and Negative Tests: Wrong recipient',
    );
  });

  it('requires reviewer decision summary to bound trustless burn release claims', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary: 'trustless burn proof path reviewed',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires exact release-supported wording in reviewer decision summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires exact institutional-reference release support in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('requires exact Trustless burn verification implemented = yes binding in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: blocked; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes',
    );
  });

  it('requires explicit production-ready claim handling in reviewer decision summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claims reviewed; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires explicit testnet production-candidate claim handling in reviewer decision summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claims reviewed; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim allowed: no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires exact production-ready claim denial in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; Trustless burn verification implemented = yes; production-ready claim handling: blocked; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim allowed: no; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = yes binding in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      productionClaim: 'no',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: allowed; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = no binding in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = no binding in publication updates', () => {
    const contradictoryClaimBinding =
      'Trustless burn verification implemented = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Transitional trusted burn path disabled = yes; Critical/high findings open = 0';
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      checklistUpdates:
        `artifact://trustless-burn/completed-gate-5-checklist-update-evidence.md; ${contradictoryClaimBinding}`,
      releaseNoteUpdates:
        `artifact://trustless-burn/completed-gate-5-release-note-update-evidence.md; ${contradictoryClaimBinding}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-candidate release support in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      productionClaim: 'no',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'release supported: production deployment candidate; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires transitional trusted burn path handling rather than disabled shorthand in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings',
    );
  });

  it('requires transitional trusted burn path handling to be disabled explicitly in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: available; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed',
    );
  });

  it('requires exact Transitional trusted burn path disabled = yes binding in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes',
    );
  });

  it('blocks reviewer decision summaries that close transitional trusted burn path handling with no shorthand', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: no; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that include mainnet production-ready claims', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: mainnet production-ready launch; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks reviewer decision summaries that approve production-ready claim handling', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: approved; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that overstate release support', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'institutional reference',
      reviewerDecisionSummary:
        'release supported: production deployment candidate; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: release support must match Release supported institutional reference',
    );
  });

  it('blocks reviewer decision summaries that contradict testnet production-candidate claim handling', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      testnetProductionCandidateClaim: 'no',
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: allowed; transitional trusted burn path handling: disabled; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that leave critical or high findings open', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open: 1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting remediation'],
    ['waiting', 'waiting for remediation'],
    ['deferred', 'deferred to reviewer follow-up'],
  ])('blocks reviewer decision summaries with exact closed findings plus %s critical/high finding prose', (
    _label,
    blockerState,
  ) => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        `Critical/high findings open = 0; critical/high findings ${blockerState}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave critical/high findings open',
    );
  });

  it('blocks reviewer decision summaries with exact closed findings plus nonzero critical/high findings count', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; Trustless burn verification implemented = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'transitional trusted burn path handling: Transitional trusted burn path disabled = yes; ' +
        'Critical/high findings open = 0; critical/high findings count 1 unresolved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave critical/high findings open',
    );
  });

  it('blocks reviewer decision summaries that close critical or high findings with textual zero-like terms', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: disabled; critical/high findings open none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    );
  });

  it('requires exact critical/high findings open wording in reviewer decision summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; critical/high findings = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    );
  });

  it('requires exact Critical/high findings open = 0 binding in reviewer summaries', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: blocked; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; critical/high findings open: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0',
    );
  });

  it('rejects production-ready claims even for production deployment candidate evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      productionClaim: 'yes',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; trustless burn evidence can only support testnet production-candidate claims',
    );
  });

  it('requires production deployment candidate trustless burn evidence to be testnet-scoped', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Classification: production deployment candidate requires exact Evidence Classification Environment = testnet',
    );
  });

  it('blocks production deployment candidate evidence when testnet production-candidate claims are not allowed', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      productionClaim: 'no',
      testnetProductionCandidateClaim: 'no',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('blocks testnet production-candidate claims below production deployment candidate evidence', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'institutional reference',
      productionClaim: 'no',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'release supported: institutional reference; trustless burn verification implemented; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: blocked; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: testnet production-candidate claim requires production deployment candidate evidence',
    );
  });

  it('allows production deployment candidate evidence through the testnet production-candidate claim field', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      releaseLevel: 'production deployment candidate',
      productionClaim: 'no',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; Trustless burn verification implemented = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; transitional trusted burn path handling: Transitional trusted burn path disabled = yes; Critical/high findings open = 0',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires reviewer sign-off decisions', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: '| Protocol reviewer | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Protocol reviewer: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Protocol reviewer: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Protocol reviewer: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Protocol reviewer: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        '| Protocol reviewer | reviewer-a | block | 2026-05-14 | burn proof blocker blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: decision must be approve before Gate 5 evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        '| Security reviewer | reviewer-a | approve | May 14 2026 | trustless burn proof accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the evidence classification date', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-13 | trustless burn proof accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: Date must not be before Evidence Classification Date',
    );
  });

  it('requires reviewer notes to state concrete trustless-burn outcomes', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed Gate 5 evidence |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete trustless-burn outcome',
    );
  });

  it('rejects reviewer notes with production-ready or mainnet production claim wording', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows
        .replace(
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; production-ready claim approved |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; mainnet production release accepted |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting remediation'],
    ['waiting', 'waiting for remediation'],
    ['deferred', 'deferred to reviewer follow-up'],
  ])('rejects reviewer notes that approve trustless burn while leaving critical/high findings %s', (
    _label,
    blockerState,
  ) => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        `| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; critical/high findings ${blockerState} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not leave critical/high findings open',
    );
  });

  it('rejects reviewer notes with contradictory exact trustless-burn decision bindings', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted; Trustless burn verification implemented = yes; Trustless burn verification implemented = no |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: notes must not include contradictory trustless-burn decision bindings',
    );
  });

  it('requires protocol reviewer sign-off to match the evidence classification identity', () => {
    const result = validateTrustlessBurnEvidence(trustlessEvidence({
      reviewers: reviewerRows.replace(
        '| Protocol reviewer | reviewer-a | approve | 2026-05-14 | trustless burn proof accepted |',
        '| Protocol reviewer | reviewer-b | approve | 2026-05-14 | trustless burn proof accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Protocol reviewer: name must match Evidence Classification Reviewer',
    );
  });

  it('blocks unsafe validator CLI evidence targets without leaking the requested path', () => {
    const target = '../operator/private-key-trustless-burn.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-evidence.ts',
        target,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
    expect(result.stdout).toContain('<blocked evidence target>: evidence target BLOCKED:');
    expect(result.stdout).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(result.stdout).not.toContain(target);
    expect(result.stdout).not.toContain(process.cwd());
  });

  it('fails closed when validator CLI evidence targets are missing without leaking local paths', () => {
    const target = 'missing-trustless-burn-evidence.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-evidence.ts',
        target,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
    expect(result.stdout).toContain(`${target}: evidence target BLOCKED: 1 structural issue(s).`);
    expect(result.stdout).toContain(`${target}: evidence file could not be read`);
    expect(result.stdout).not.toContain(process.cwd());
  });

  it('reports validator CLI usage without parser stacks or local paths', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-evidence.ts',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage: npm run trustless:validate');
    expect(result.stderr).not.toContain('Error:');
    expect(result.stderr).not.toContain('src/scripts/validate-trustless-burn-evidence.ts');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('prints release-gate claim boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-trustless-burn-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
    expect(result.stdout).toContain('Usage: npm run trustless:validate');
    expect(result.stdout).toContain('completed Trustless Burn Verification Evidence Markdown');
    expect(result.stdout).toContain('trustless burn validation target');
    expect(result.stdout).toContain('Proof-vector validation report');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain(
      'does not sign, submit, reconcile, publish, push, broadcast, or open runtime databases',
    );
    expect(result.stdout).toContain('release:gate -- --trustless-burn-evidence');
    expect(result.stdout).toContain('A standalone PASS is not release authorization');
    expect(result.stdout).toContain('Trustless burn verification implemented = yes');
    expect(result.stdout).toContain('Transitional trusted burn path disabled = yes');
    expect(result.stdout).toContain('Critical/high findings open = 0');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed = yes');
    expect(result.stdout).toContain('Production-ready and mainnet claims remain blocked');
  });

  it('writes a sanitized trustless burn validation blocker report with issue groups', () => {
    const reportDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-report-'));
    const reportPath = join(reportDir, 'blocked-report.md');
    const reportTarget = `${reportDir.slice(process.cwd().length + 1).replace(/\\/g, '/')}/blocked-report.md`;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-trustless-burn-evidence.ts',
          '../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-25-8337cc67.md',
          '--report-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('Trustless burn evidence BLOCKED');
      expect(result.stdout).toContain('Wrote trustless burn validation report to --report-out target.');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('# Trustless Burn Evidence Validation Report');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Exit code | 1 |');
      expect(report).toContain('| Structural issues | 65 |');
      expect(report).toContain(
        '| Validated target | ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-25-8337cc67.md |',
      );
      expect(report).toContain('| Publication decision | 13 |');
      expect(report).toContain('| Required components | 9 |');
      expect(report).toContain('| Burn proof binding | 16 |');
      expect(report).toContain('| Negative tests | 10 |');
      expect(report).toContain(
        'does not authorize public claims, release claims, publishing, deployment, settlement, reconciliation, or transaction broadcast',
      );
      expect(report).toContain('| Transaction broadcast, submit, deploy, reconcile, or state mutation performed | no |');
      const windowsHomePrefix = ['C:', 'Users'].join(String.fromCharCode(92));
      expect(report).not.toContain(windowsHomePrefix);
      expect(report).not.toContain('privateKey');
      expect(report).not.toContain('mnemonic');
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it('keeps the validator CLI read-only and away from signer or broadcast surfaces', () => {
    const source = readFileSync(join(process.cwd(), 'src/scripts/validate-trustless-burn-evidence.ts'), 'utf8');

    expect(source).toContain('readEvidenceMarkdownTarget(target)');
    expect(source).toContain('validateTrustlessBurnEvidence(markdown)');
    expect(source.indexOf('readEvidenceMarkdownTarget(target)')).toBeLessThan(
      source.indexOf('validateTrustlessBurnEvidence(markdown)'),
    );
    expect(source).not.toContain('dotenv/config');
    expect(source).not.toContain('assertBroadcastAllowed');
    expect(source).not.toContain('submitTransaction');
    expect(source).not.toContain('signAndSubmit');
    expect(source).not.toContain('StateTracker');
    expect(source).not.toContain('ErgoClient');
  });

  it('blocks missing tables without throwing', () => {
    const result = validateTrustlessBurnEvidence('# Incomplete trustless burn evidence\n\n## Evidence Classification\n\nNo table yet.\n');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('## Required Components: table not found');
    expect(result.errors).toContain('## Commitment Format: table not found');
    expect(result.errors).toContain('## Burn Proof Binding: table not found');
    expect(result.errors).toContain('## Positive Proof Acceptance: missing required section');
    expect(result.errors).toContain('## Positive Proof Acceptance: table not found');
    expect(result.errors).toContain('## Negative Tests: table not found');
    expect(result.errors).toContain('## Reviewer Sign-Off: table not found');
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
