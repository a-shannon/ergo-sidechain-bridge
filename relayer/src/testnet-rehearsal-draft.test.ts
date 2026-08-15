import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastClaimEvidence,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';
import { buildTestnetRehearsalDraft } from './testnet-rehearsal-draft.js';

const NOW = new Date('2026-05-17T10:30:00.000Z');
const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const PEG_OUT_BURN_TX_ID_B = '9'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '2'.repeat(64);
const SIDECHAIN_BLOCK_HASH_B = 'a'.repeat(64);
const BRIDGE_EVENT_ROOT = '3'.repeat(64);
const EXPECTED_TX_ID = '4'.repeat(64);
const DEPLOYMENT_STATE_HASH = '5'.repeat(64);
const CONTRACT_ID = '6'.repeat(64);
const SINGLETON_ID = '7'.repeat(64);
const PEG_IN_EVENT_ID = '8'.repeat(64);

function aggregateEvidenceRecord(
  command = 'check-batch',
  claims: AggregateSettlementPrebroadcastClaimEvidence[] = [
    {
      burnTxHash: PEG_OUT_BURN_TX_ID,
      sidechainBlockHeight: 200,
      sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
      bridgeEventRootHex: BRIDGE_EVENT_ROOT,
      ergoAnchorHeight: 100,
    },
    {
      burnTxHash: PEG_OUT_BURN_TX_ID_B,
      sidechainBlockHeight: 201,
      sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH_B,
      bridgeEventRootHex: 'b'.repeat(64),
      ergoAnchorHeight: 101,
    },
  ],
): AggregateSettlementPrebroadcastEvidenceRecord {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T10:20:00.000Z',
    command,
    label: 'Aggregate settlement draft fixture',
    expectedTxId: EXPECTED_TX_ID,
    transactionCheckResponse: '',
    checkerIdentity: {
      ...TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
      nodeOrigin: 'http://localhost:9053',
    },
    settlementShape: {
      inputCount: 4,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 4, 4, 2],
      contextExtensionKeyCountsCsv: '0,4,4,2',
    },
    claims,
  });
}

function completedPrebroadcastEvidence(
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  jsonTarget = 'aggregate-check.json',
  extraJsonTargets: string[] = [],
): string {
  const selectedClaim = record.claims[0];
  const burnSet = record.claims.map(claim => claim.burnTxHash).join(',');
  const aggregateJsonLinks = [
    `[aggregate JSON](${jsonTarget})`,
    ...extraJsonTargets.map(target => `[aggregate JSON](${target})`),
  ].join(' ');
  return `
# Completed Testnet Pre-Broadcast Dry Run

## Scope Statement

- Evidence package name: fresh-testnet-prebroadcast-2026-05-17
- Date: 2026-05-17
- Operator: operator-a
- Reviewer: reviewer-a
- Git commit: abc1234
- Environment: testnet
- Ergo node network: testnet
- Sidechain network: patched-devnet
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled
- Gate 3 closure claimed: no
- Testnet production-candidate claim allowed: no
- Mainnet production-ready claim allowed: no

## Required Command Artifacts

- \`npm run check\` artifact: artifact://prebroadcast/check.log
- \`npm run wasm:test\` artifact: artifact://prebroadcast/wasm-test.log
- \`npm run demo:readiness\` artifact: artifact://prebroadcast/demo-readiness.log
- \`npm run status\` artifact: artifact://prebroadcast/status.log
- ContextExtension guard result: artifact://prebroadcast/context-extension-guard.log ContextExtension guard sigma-rust/JVM conformance fail-closed behavior
- Broadcast policy result: artifact://prebroadcast/broadcast-policy.log Broadcast policy PASS: broadcast disabled by BRIDGE_BROADCAST_ENABLED=false
- Clean deployment state evidence: artifact://prebroadcast/clean-deployment-state.json clean deployment state deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; singleton inventory=${SINGLETON_ID}
- Current Ergo height: 100 artifact://prebroadcast/current-ergo-height.log
- Current sidechain height: 201 artifact://prebroadcast/current-sidechain-height.log

## Dry-Run Settlement Shape

- Peg-in event ID or TX ID: ${PEG_IN_EVENT_ID} artifact://prebroadcast/peg-in-event.log
- Peg-out burn TX ID: ${selectedClaim.burnTxHash} artifact://prebroadcast/peg-out-burn.log
- Sidechain block height: ${selectedClaim.sidechainBlockHeight}
- Sidechain block hash: ${selectedClaim.sidechainHeaderHashHex ?? SIDECHAIN_BLOCK_HASH} artifact://prebroadcast/sidechain-block.log
- Bridge event root: ${selectedClaim.bridgeEventRootHex ?? BRIDGE_EVENT_ROOT} artifact://prebroadcast/bridge-event-root.log
- Bridge event roots: ${record.claims.map(claim => claim.bridgeEventRootHex).join(',')} artifact://prebroadcast/bridge-event-roots.log
- Ergo anchor height: ${selectedClaim.ergoAnchorHeight ?? 100}
- Aggregate claim count: ${record.claimCount}
- Input count: ${record.settlementShape.inputCount}
- Output count: ${record.settlementShape.outputCount}
- ContextExtension key counts per input: ${record.settlementShape.contextExtensionKeyCountsCsv}
- \`/transactions/check\` result: PASS ${aggregateJsonLinks} artifact://prebroadcast/transactions-check.log
- Expected transaction ID: ${record.transactionCheck.expectedTxId} artifact://prebroadcast/expected-tx.log
- Daemon approval preparation: artifact://prebroadcast/daemon-approval-prep.log approval file version 2 runtime context binding ergoNodeUrl sidechainRpcUrl sidechainWsUrl deployedStateHash mode batch active approval window non-mainnet networks npm run settle:aggregate -- check-batch ${record.claims.map(claim => claim.burnTxHash).join(' ')} checkEvidence artifact://prebroadcast/check.log completed approval evidence target Expected transaction ID ${record.transactionCheck.expectedTxId} ordered burn set ${burnSet}

## Non-Broadcast Attestation

- \`BRIDGE_BROADCAST_ENABLED\` state at start: unset artifact://prebroadcast/broadcast-state-start.log
- \`BRIDGE_BROADCAST_ENABLED\` state at end: false artifact://prebroadcast/broadcast-state-end.log
- Live broadcast approval recorded: no artifact://prebroadcast/live-approval-absent.log
- Submit command attempted: no artifact://prebroadcast/submit-not-attempted.log
- Mempool transaction observed: no artifact://prebroadcast/mempool-absence.log
- Local DUP confirmed-history mutation performed: no artifact://prebroadcast/dup-history-no-mutation.log
- Local SPV/AVL confirmed-history mutation performed: no artifact://prebroadcast/spv-avl-history-no-mutation.log
- Runtime state files staged: no artifact://prebroadcast/git-status-runtime-not-staged.log

## Lifecycle Linkage Guidance

Fresh testnet lifecycle: publication blocker pending until a live lifecycle package exists.
Settlement submit evidence: blocker pending until user explicit live broadcast approval and submitted transaction ID evidence exist.
Confirmation evidence: unchecked blocker pending until live confirmation evidence exists.
Reconciliation evidence: unchecked blocker pending until live reconciliation evidence exists.
The next live rehearsal must capture submitted transaction ID, confirmation evidence, and reconciliation evidence before any Gate 3 closure.

## Publication Control

- Release notes updated for this dry-run package: yes
- Pending Evidence Register updated for this dry-run package: yes
- Gate 3 checklist row closed by this package: no
- Production-ready claim allowed by this package: no
- Testnet production-candidate claim allowed by this package: no

## Reviewer Sign-Off

- Classification: pass
- Stop conditions discovered: none
- Follow-up live rehearsal required: yes
- Follow-up recovery drill required: yes
- Reviewer: reviewer-a
- Date: 2026-05-17
`;
}

function approvalFile(burnTxHashes: string[]): Record<string, unknown> {
  const burnSet = burnTxHashes.join(',');
  const checkCommand = `npm run settle:aggregate -- check-batch ${burnTxHashes.join(' ')}`;
  return {
    version: 2,
    createdAt: '2026-05-17T10:00:00Z',
    environment: 'testnet',
    ergoNodeNetwork: 'testnet',
    ergoNodeUrl: 'http://localhost:9053',
    sidechainNetwork: 'patched-devnet',
    sidechainRpcUrl: 'http://localhost:8545',
    sidechainWsUrl: 'ws://localhost:9944',
    deployedStateHash: DEPLOYMENT_STATE_HASH,
    approvals: [{
      mode: 'batch',
      burnTxHashes,
      bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, 'b'.repeat(64)].slice(0, burnTxHashes.length),
      expectedTxId: EXPECTED_TX_ID,
      approvedAt: '2026-05-17T10:05:00Z',
      expiresAt: '2026-05-17T11:05:00Z',
      evidence:
        `artifact://approval/reviewer.log completed approval evidence target mode batch ` +
        `non-broadcast Expected transaction ID ${EXPECTED_TX_ID} ordered burn set ${burnSet}`,
      checkEvidence:
        `artifact://prebroadcast/check.log ${checkCommand} mode batch non-broadcast PASS ` +
        `Expected transaction ID ${EXPECTED_TX_ID} ` +
        `ordered burn set ${burnSet}`,
      checkEvidenceJson: 'aggregate-check.json',
      checkCommand,
    }],
  };
}

function writeFixture(
  dir: string,
  record: AggregateSettlementPrebroadcastEvidenceRecord,
  approvals?: Record<string, unknown>,
  extraRecords: Array<{ target: string; record: AggregateSettlementPrebroadcastEvidenceRecord }> = [],
): { prebroadcastTarget: string; approvalsPath?: string } {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(record, null, 2));
  for (const extraRecord of extraRecords) {
    writeFileSync(join(dir, extraRecord.target), JSON.stringify(extraRecord.record, null, 2));
  }
  writeFileSync(
    join(dir, 'completed.md'),
    completedPrebroadcastEvidence(record, 'aggregate-check.json', extraRecords.map(extraRecord => extraRecord.target)),
  );
  if (approvals) {
    writeFileSync(join(dir, 'approvals.json'), JSON.stringify(approvals, null, 2));
  }
  return {
    prebroadcastTarget: `${basename(dir)}/completed.md`,
    approvalsPath: approvals ? `${basename(dir)}/approvals.json` : undefined,
  };
}

describe('testnet rehearsal draft', () => {
  it('blocks unsafe CLI JSON output targets before reading draft inputs', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-draft.ts',
        '--prebroadcast',
        'missing-prebroadcast.md',
        '--approvals',
        'missing-approvals.json',
        '--json-out',
        jsonOutTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(jsonOutTarget);
    expect(result.stderr).not.toContain('missing-prebroadcast.md');
    expect(result.stderr).not.toContain('missing-approvals.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('blocks unsafe CLI Markdown output targets before reading draft inputs', () => {
    const outTarget = '../operator/private-key-draft.md';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-draft.ts',
        '--prebroadcast',
        'missing-prebroadcast.md',
        '--approvals',
        'missing-approvals.json',
        '--out',
        outTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain('missing-prebroadcast.md');
    expect(result.stderr).not.toContain('missing-approvals.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI output guards before draft input reads', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-draft.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceOutputPath } from '../evidence-output-path.js'");
    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = buildTestnetRehearsalDraft({');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const report = buildTestnetRehearsalDraft({'),
    );
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = buildTestnetRehearsalDraft({'),
    );
  });

  it('creates a quarantine-aware rehearsal draft from a matched batch preflight', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-draft-'));
    try {
      const record = aggregateEvidenceRecord();
      const burnTxHashes = record.claims.map(claim => claim.burnTxHash);
      const targets = writeFixture(dir, record, approvalFile(burnTxHashes));

      const report = buildTestnetRehearsalDraft({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: targets.approvalsPath!,
        doctorArtifact: 'artifact://prebroadcast/doctor.log',
        preflightArtifact: 'artifact://prebroadcast/rehearsal-preflight.log',
        operator: 'operator-a',
        reviewer: 'reviewer-a',
        gitCommit: 'abc1234',
        now: NOW,
      });

      expect(report.status).toBe('CREATED');
      expect(report.executionStatus).toBe('QUARANTINED');
      expect(report.errors).toEqual([]);
      expect(report.targetBindings).toEqual({
        prebroadcast: targets.prebroadcastTarget,
        approvals: targets.approvalsPath,
        doctorArtifact: 'artifact://prebroadcast/doctor.log',
        preflightArtifact: 'artifact://prebroadcast/rehearsal-preflight.log',
      });
      expect(report.plannedCommands).toEqual([
        {
          label: 'historical-check-provenance',
          phase: 'historical-evidence',
          command:
            `ARCHIVED legacy V1 check-batch provenance for ${PEG_OUT_BURN_TX_ID},${PEG_OUT_BURN_TX_ID_B}; ` +
            'the executable check command is physically removed',
          broadcastCommand: false,
          stateMutationCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: false,
          reportAuthorizesExecution: false,
        },
        {
          label: 'legacy-v1-quarantine-check',
          phase: 'offline-verification',
          command: 'npm run demo:readiness',
          broadcastCommand: false,
          stateMutationCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: false,
          reportAuthorizesExecution: false,
        },
        {
          label: 'legacy-v1-submit-quarantine',
          phase: 'blocked-live-settlement',
          command: `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`,
          broadcastCommand: false,
          stateMutationCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: false,
          reportAuthorizesExecution: false,
        },
        {
          label: 'historical-post-submit-confirm-reconcile',
          phase: 'historical-reconciliation',
          command: `npm run settle:aggregate -- confirm-batch <settlementTxId> ${PEG_OUT_BURN_TX_ID} ${PEG_OUT_BURN_TX_ID_B}`,
          broadcastCommand: false,
          stateMutationCommand: true,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: true,
          reportAuthorizesExecution: false,
        },
        {
          label: 'historical-post-submit-read-only-observe',
          phase: 'historical-reconciliation',
          command:
            `npm run rehearsal:post-submit:observe -- --expected-tx-id ${EXPECTED_TX_ID} --submitted-tx-id <submittedTxId> ` +
            `--burn-tx-id ${PEG_OUT_BURN_TX_ID} --burn-tx-id ${PEG_OUT_BURN_TX_ID_B} ` +
            '--submission-artifact <artifact://.../submit.log> --confirmation-artifact <artifact://.../confirmation.log> ' +
            '--finality-evidence-artifact <artifact://.../finality.log> ' +
            '--reconciliation-artifact <artifact://.../reconciliation.log> --submission-timestamp <YYYY-MM-DDTHH:mm:ssZ> ' +
            '--first-observed-mempool-height <height> --confirmations-required <n> --fee-nanoerg <feeNanoErg> ' +
            '--failed-event-queue <status> --manual-repair-performed <yes|no> --live-preflight-report <live-preflight.json> ' +
            '[--spv-tracker-nft-id <spvTrackerNftId>] [--aggregate-dup-nft-id <aggregateDupNftId>] ' +
            '--json-out <post-submit-observe.json> --out <post-submit-observe-companion.md>',
          broadcastCommand: false,
          stateMutationCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: true,
          reportAuthorizesExecution: false,
        },
        {
          label: 'offline-assembly',
          phase: 'offline-assembly',
          command:
            'npm run rehearsal:assemble -- --draft <completed-live-rehearsal-draft.md> --live-preflight <live-preflight.json> ' +
            '--fresh-checkpoint <fresh-testnet-checkpoint.json> [--failed-broadcast <failed-broadcast-row.md>] ' +
            '[--reorg-recovery <reorg-stale-singleton-row.md>] --post-submit <post-submit-observe.json> ' +
            '--out <assembled-live-rehearsal-candidate.md> --json-out <assembled-live-rehearsal-candidate.json>',
          broadcastCommand: false,
          stateMutationCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: true,
          reportAuthorizesExecution: false,
        },
        {
          label: 'final-validation-transcript',
          phase: 'final-validation',
          command:
            'npm run rehearsal:validate -- --transcript <artifact://.../rehearsal-validate.log> ' +
            '--assembly-report-json <assembled-live-rehearsal-candidate.json> --live-preflight-json <live-preflight.json> ' +
            '--post-submit-observe-json <post-submit-observe.json> ' +
            '--fresh-checkpoint-json <fresh-testnet-checkpoint.json> ' +
            '--recovery-observe-json <failed-broadcast-observe.json> --recovery-observe-json <reorg-stale-singleton-observe.json> ' +
            '<completed-live-rehearsal.md>',
          broadcastCommand: false,
          stateMutationCommand: false,
          requiresExplicitLiveBroadcastApproval: false,
          requiresCompletedSubmitEvidence: true,
          reportAuthorizesExecution: false,
        },
      ]);
      expect(report.markdown).toContain('| Fresh testnet lifecycle | publication blocker |');
      expect(report.markdown).toContain(`BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`);
      expect(report.markdown).not.toContain('npm run settle:aggregate -- submit');
      expect(report.markdown).not.toMatch(/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/);
      expect(report.markdown).toContain('historical-check-provenance');
      expect(report.markdown).toContain(`npm run settle:aggregate -- confirm-batch <settlementTxId> ${PEG_OUT_BURN_TX_ID} ${PEG_OUT_BURN_TX_ID_B}`);
      expect(report.markdown).toContain('This draft was generated from a validated pre-broadcast package');
      expect(report.markdown).toContain('this draft contains no executable submit command');
      expect(report.markdown).toContain('- Settlement profile ID: legacy-aggregate-v1');
      expect(report.markdown).toContain('- Profile activation status: QUARANTINED');
      expect(report.markdown).toContain('- Evidence purpose: historical-diagnostics');
      expect(report.markdown).toContain('- Activation evidence target: none');
      expect(report.markdown).toContain('- Activation ID: none');
      expect(report.markdown).toContain('legacy-v1-submit-quarantine');
      expect(report.markdown).toContain('broadcast command: no; report authorizes execution: no');
      expect(report.markdown).toContain('a reviewed and activated, separately versioned external-fee profile plus permanent legacy-route retirement');
      expect(report.markdown).toContain(`- Expected transaction ID: ${EXPECTED_TX_ID}`);
      expect(report.markdown).toContain(`- Bridge event roots: ${BRIDGE_EVENT_ROOT},${'b'.repeat(64)}`);
      expect(report.markdown).toContain('Bridge event roots is authoritative for batch approval binding');
      expect(report.markdown).toContain(
        `Expected transaction ID boundary: ${EXPECTED_TX_ID} is diagnostic V1 check output and cannot become submit authority`,
      );
      expect(report.markdown).not.toContain('BRIDGE_BROADCAST_ENABLED=true');
      expect(report.markdown).toContain(
        'Historical submitted transaction ID: <required only for an exact transaction proven submitted before quarantine>',
      );
      expect(report.markdown).toContain('- Recipient payout box IDs: <pending payout box IDs>');
      expect(report.markdown).toContain('Historical post-submit observe output shape: <pending only for a pre-quarantine submitted transaction');
      expect(report.markdown).toContain(
        `npm run rehearsal:post-submit:observe -- --expected-tx-id ${EXPECTED_TX_ID} --submitted-tx-id <submittedTxId> --burn-tx-id ${PEG_OUT_BURN_TX_ID} --burn-tx-id ${PEG_OUT_BURN_TX_ID_B}`,
      );
      expect(report.markdown).toContain('--live-preflight-report <live-preflight.json>');
      expect(report.markdown).toContain('--json-out <post-submit-observe.json>');
      expect(report.markdown).toContain('--out <post-submit-observe-companion.md>');
      expect(report.markdown).toContain('Required timing: run only for an exact historical transaction proven submitted before quarantine');
      expect(report.markdown).toContain('Read-only boundary: this command observes the node and SQLite state only; it does not sign, submit, confirm, reconcile, approve, or broadcast transactions.');
      expect(report.markdown).toContain('SPV tracker successor output OUTPUTS(0), Aggregate DUP successor output OUTPUTS(1), positional recipient payout binding, and canonical miner fee output.');
      expect(report.markdown).toContain(
        'Assembly input: include the resulting structured post-submit observe JSON report as the rehearsal:assemble --post-submit source target',
      );
      expect(report.markdown).toContain('Markdown output is companion human-readable evidence only.');
      expect(report.markdown).toContain(
        'Authorization boundary: reviewer approval, user approval, an Expected transaction ID, a local status, or a broadcast setting cannot override the quarantine.',
      );
      expect(report.markdown).toContain('Production-ready claim allowed by this rehearsal: no');
      expect(report.markdown).toContain('Testnet production-candidate claim allowed by this rehearsal: no');
      expect(report.markdown).toContain('- Classification: inconclusive');
      expect(report.markdown).toContain('corrected external-fee profile activation, legacy-route retirement, target-node acceptance');
      expect(report.markdown).not.toContain('- Classification: pass');
      expect(report.lines.join('\n')).toContain('does not authorize broadcast');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks shell-unsafe target bindings before exposing planned commands', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal draft-'));
    try {
      const record = aggregateEvidenceRecord();
      const burnTxHashes = record.claims.map(claim => claim.burnTxHash);
      const targets = writeFixture(dir, record, approvalFile(burnTxHashes));

      const report = buildTestnetRehearsalDraft({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: targets.approvalsPath!,
        doctorArtifact: 'artifact://prebroadcast/doctor.log',
        preflightArtifact: 'artifact://prebroadcast/rehearsal-preflight.log',
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.plannedCommands).toBeUndefined();
      expect(report.errors).toContain(
        'Draft targetBindings.prebroadcast: <blocked draft target> must not contain whitespace or shell metacharacters',
      );
      expect(report.errors).toContain(
        'Draft targetBindings.approvals: <blocked draft target> must not contain whitespace or shell metacharacters',
      );
      expect(report.targetBindings).toEqual({
        prebroadcast: '<blocked draft target>',
        approvals: '<blocked draft target>',
        doctorArtifact: 'artifact://prebroadcast/doctor.log',
        preflightArtifact: 'artifact://prebroadcast/rehearsal-preflight.log',
      });
      expect(serialized).toContain('<blocked draft target>');
      expect(serialized).not.toContain(basename(dir));
      expect(serialized).not.toContain(targets.prebroadcastTarget);
      expect(serialized).not.toContain(targets.approvalsPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks draft creation when rehearsal preflight approval binding is missing', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-draft-'));
    try {
      const targets = writeFixture(dir, aggregateEvidenceRecord());

      const report = buildTestnetRehearsalDraft({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: `${basename(dir)}/missing-approvals.json`,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors.join('\n')).toContain('could not be resolved');
      expect(report.lines.join('\n')).toContain('keep broadcast disabled');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses prebroadcast targets that resolve outside the bridge without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-draft-'));
    const external = mkdtempSync(join(tmpdir(), 'rehearsal-draft-prebroadcast-'));
    try {
      const record = aggregateEvidenceRecord();
      const burnTxHashes = record.claims.map(claim => claim.burnTxHash);
      writeFixture(external, record);
      const targets = writeFixture(dir, record, approvalFile(burnTxHashes));
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = buildTestnetRehearsalDraft({
        prebroadcastTarget: `${basename(dir)}/link-out/completed.md`,
        approvalsPath: targets.approvalsPath!,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.targetBindings?.prebroadcast).toBe('<blocked evidence target>');
      expect(report.errors).toContain(
        '<blocked evidence target>: refusing to read evidence paths outside the bridge repository',
      );
      expect(serialized).toContain('<blocked evidence target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('completed.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('blocks multi-package drafts until per-package live evidence binding exists', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-rehearsal-draft-'));
    try {
      const record = aggregateEvidenceRecord();
      const burnTxHashes = record.claims.map(claim => claim.burnTxHash);
      const targets = writeFixture(
        dir,
        record,
        approvalFile(burnTxHashes),
        [{ target: 'aggregate-check-copy.json', record }],
      );

      const report = buildTestnetRehearsalDraft({
        prebroadcastTarget: targets.prebroadcastTarget,
        approvalsPath: targets.approvalsPath!,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.markdown).toBeUndefined();
      expect(report.errors).toContain(
        'Draft: multiple linked aggregate settlement JSON records are not supported by the live rehearsal draft; generate one rehearsal draft per package until per-package live evidence binding is implemented',
      );
      expect(report.lines.join('\n')).toContain('per-package live evidence binding');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
