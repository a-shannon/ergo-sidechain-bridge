import {
  buildTestnetPrebroadcastDryRunFieldSummary,
  type TestnetPrebroadcastDryRunFieldSummary,
} from './testnet-prebroadcast-from-aggregate-json.js';
import {
  validateTestnetPreBroadcastEvidence,
  type TestnetPreBroadcastValidation,
} from './testnet-prebroadcast-evidence.js';

export interface TestnetPrebroadcastAssembleInput {
  aggregateRecord: unknown;
  aggregateJsonLinkTarget: string;
  evidencePackageName: string;
  date: string;
  operator: string;
  reviewer: string;
  gitCommit: string;
  sidechainNetwork: string;
  checkArtifact: string;
  wasmTestArtifact: string;
  readinessArtifact: string;
  statusArtifact: string;
  contextExtensionGuardResult: string;
  broadcastPolicyResult: string;
  cleanDeploymentStateEvidence: string;
  currentErgoHeight: string;
  currentSidechainHeight: string;
  pegInEventIdOrTxId: string;
  nonBroadcastArtifact: string;
  daemonApprovalPreparation?: string;
  releaseNotesUpdated?: 'yes' | 'no';
  pendingEvidenceRegisterUpdated?: 'yes' | 'no';
  followUpRecoveryDrillRequired?: 'yes' | 'no';
  stopConditionsDiscovered?: string;
  classification?: 'pass' | 'fail' | 'inconclusive';
}

export interface TestnetPrebroadcastAssembleReport {
  status: 'CREATED' | 'BLOCKED';
  message: string;
  errors: string[];
  markdown?: string;
  validation: TestnetPreBroadcastValidation;
  lines: string[];
}

export function assembleTestnetPrebroadcastEvidence(
  input: TestnetPrebroadcastAssembleInput,
): TestnetPrebroadcastAssembleReport {
  let dryRun: TestnetPrebroadcastDryRunFieldSummary;
  try {
    dryRun = buildTestnetPrebroadcastDryRunFieldSummary({
      record: input.aggregateRecord,
      aggregateJsonLinkTarget: input.aggregateJsonLinkTarget,
      pegInEventIdOrTxId: input.pegInEventIdOrTxId,
      daemonApprovalPreparation: input.daemonApprovalPreparation,
    });
  } catch (error: any) {
    const message = `testnet prebroadcast assemble BLOCKED: ${error?.message ?? String(error)}`;
    const validation: TestnetPreBroadcastValidation = {
      status: 'BLOCKED',
      errors: [error?.message ?? String(error)],
      message,
    };
    return {
      status: 'BLOCKED',
      message,
      errors: validation.errors,
      validation,
      lines: [message],
    };
  }

  const markdown = renderPrebroadcastEvidence(input, dryRun);
  const validation = validateTestnetPreBroadcastEvidence(markdown, {
    linkedAggregateSettlementEvidenceJsonRecords: [{
      target: input.aggregateJsonLinkTarget,
      record: input.aggregateRecord,
    }],
  });
  const status = validation.status === 'PASS' ? 'CREATED' : 'BLOCKED';
  const message = status === 'CREATED'
    ? 'testnet prebroadcast evidence CREATED'
    : `testnet prebroadcast evidence BLOCKED: ${validation.errors.length} structural issue(s)`;

  return {
    status,
    message,
    errors: validation.errors,
    markdown: status === 'CREATED' ? markdown : undefined,
    validation,
    lines: [
      message,
      `- validation: ${validation.status}`,
      '- scope: Markdown evidence assembly only; no signing, node query, submit, confirmation, or broadcast command executed.',
      ...validation.errors.map(error => `- ${error}`),
    ],
  };
}

function renderPrebroadcastEvidence(
  input: TestnetPrebroadcastAssembleInput,
  dryRun: TestnetPrebroadcastDryRunFieldSummary,
): string {
  const releaseNotesUpdated = input.releaseNotesUpdated ?? 'no';
  const pendingEvidenceRegisterUpdated = input.pendingEvidenceRegisterUpdated ?? 'no';
  const followUpRecoveryDrillRequired = input.followUpRecoveryDrillRequired ?? 'yes';
  const stopConditionsDiscovered = input.stopConditionsDiscovered ?? 'none';
  const classification = input.classification ?? 'pass';
  const dryRunLines = dryRun.lines.map(line =>
    line.startsWith('- Ergo anchor height: ')
      ? `- Ergo anchor height: ${String(dryRun.fields['Ergo anchor height']).split(/\s+/)[0]}`
      : line,
  );

  return `# Testnet Pre-Broadcast Dry-Run Evidence

## Scope Statement

- Evidence package name: ${input.evidencePackageName}
- Date: ${input.date}
- Operator: ${input.operator}
- Reviewer: ${input.reviewer}
- Git commit: ${input.gitCommit}
- Environment: testnet
- Ergo node network: testnet
- Sidechain network: ${input.sidechainNetwork}
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled
- Gate 3 closure claimed: no
- Testnet production-candidate claim allowed: no
- Mainnet production-ready claim allowed: no

## Required Command Artifacts

- \`npm run check\` artifact: ${input.checkArtifact}
- \`npm run wasm:test\` artifact: ${input.wasmTestArtifact}
- \`npm run demo:readiness\` artifact: ${input.readinessArtifact}
- \`npm run status\` artifact: ${input.statusArtifact}
- ContextExtension guard result: ${input.contextExtensionGuardResult}
- Broadcast policy result: ${input.broadcastPolicyResult}
- Clean deployment state evidence: ${input.cleanDeploymentStateEvidence}
- Current Ergo height: ${input.currentErgoHeight}
- Current sidechain height: ${input.currentSidechainHeight}

## Dry-Run Settlement Shape

${dryRunLines.join('\n')}

## Non-Broadcast Attestation

- \`BRIDGE_BROADCAST_ENABLED\` state at start: unset ${input.nonBroadcastArtifact}
- \`BRIDGE_BROADCAST_ENABLED\` state at end: unset ${input.nonBroadcastArtifact}
- Live broadcast approval recorded: no ${input.nonBroadcastArtifact}
- Submit command attempted: no ${input.nonBroadcastArtifact}
- Mempool transaction observed: no ${input.nonBroadcastArtifact}
- Local DUP confirmed-history mutation performed: no ${input.nonBroadcastArtifact}
- Local SPV/AVL confirmed-history mutation performed: no ${input.nonBroadcastArtifact}
- Runtime state files staged: no ${input.nonBroadcastArtifact}

## Lifecycle Linkage Guidance

- Fresh testnet lifecycle: publication blocker pending until a separate live lifecycle package exists.
- Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.
- Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.
- Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.
- The blocking note must state that this dry-run was captured but live submit, confirmation, and reconciliation are pending user explicit live broadcast approval.
- The required next evidence is a separate live testnet rehearsal with reviewer approval, user explicit live broadcast approval, submitted transaction ID, confirmation evidence, and reconciliation evidence.
- These incomplete live lifecycle rows remain publication blockers.

## Publication Control

- Release notes updated for this dry-run package: ${releaseNotesUpdated}
- Pending Evidence Register updated for this dry-run package: ${pendingEvidenceRegisterUpdated}
- Gate 3 checklist row closed by this package: no
- Production-ready claim allowed by this package: no
- Testnet production-candidate claim allowed by this package: no

## Reviewer Sign-Off

- Classification: ${classification}
- Stop conditions discovered: ${stopConditionsDiscovered}
- Follow-up live rehearsal required: yes
- Follow-up recovery drill required: ${followUpRecoveryDrillRequired}
- Reviewer: ${input.reviewer}
- Date: ${input.date}
`;
}
