import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildReadinessHandoffCommand,
  buildReadinessHandoffReport,
  buildReadinessHandoffValidationCommand,
  buildReadinessHandoffValidationReport,
  formatReadinessHandoffReportMarkdown,
  formatReadinessHandoffValidationReportMarkdown,
  validateReadinessHandoffReportJson,
  validateReadinessRuntimePrereqsJson,
} from './readiness-handoff.js';
import type {
  ReadinessHandoffReport,
} from './readiness-handoff.js';
import type {
  ReadinessRuntimePrereqsReport,
} from './readiness-runtime-prereqs.js';

const runtimePrereqsReport: ReadinessRuntimePrereqsReport = {
  status: 'READY',
  exitCode: 0,
  sourceCommit: 'abc1234',
  command:
    'npm run readiness:runtime-prereqs -- --triage-json ../evidence/readiness/readiness-triage.json --node-preflight-json ../evidence/readiness/node-preflight.json --anchor-preflight-json ../evidence/readiness/anchor-preflight.json',
  totalStructuralIssues: 4,
  nodeBackedIssueCount: 2,
  reviewerOrExternalIssueCount: 1,
  claimOrPublicationBoundaryIssueCount: 1,
  localEvidenceIssueCount: 0,
  localEvidenceIssues: [],
  localClosureStatus: 'external-or-live-required',
  localOnlyClosureIssueCount: 0,
  externalOrLiveClosureIssueCount: 4,
  manualTriageIssueCount: 0,
  localClosureSummary:
    'No local-only closure candidates remain; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers.',
  triageSource: {
    mode: 'json',
    target: '../evidence/readiness/readiness-triage.json',
  },
  nodeBackedIssues: [
    {
      lane: 'trustless-burn',
      issue: 'Burn inclusion proof: status must be linked before trustless burn evidence can pass',
    },
    {
      lane: 'benchmark',
      issue: 'Metric Table: Live batch settlement: status must be linked before benchmark evidence can pass',
    },
  ],
  reviewerOrExternalIssues: [
    {
      lane: 'security-review',
      issue: 'Review Classification: External reviewer organization or affiliation must be concrete',
    },
  ],
  nodePreflight: 'PASS',
  nodePreflightSource: {
    mode: 'json',
    target: '../evidence/readiness/node-preflight.json',
  },
  anchorPreflight: 'FAIL',
  anchorPreflightSource: {
    mode: 'json',
    target: '../evidence/readiness/anchor-preflight.json',
  },
  anchorPreflightSummary: {
    expectedRootMode: 'generic-diagnostic',
    anchorCount: 0,
    nodeEndpoint: 'http://127.0.0.1:9052',
  },
  nodeEndpoint: 'http://127.0.0.1:9052',
  nextActions: [
    'Collect node-backed/live-drill evidence for Gate 5 trustless burn and Gate 7 benchmark before changing claim/publication fields.',
    'Route reviewer/external blockers to human review material after the concrete runtime evidence exists.',
    'Do not unlock claim/publication fields until node-backed/live-drill and reviewer/external blockers are resolved.',
  ],
  boundary: {
    'Planning output only': 'yes',
    'Readiness triage JSON reused': 'yes',
    'Node preflight executed': 'no',
    'Node preflight JSON reused': 'yes',
    'Live node probe executed by runtime prerequisites': 'no',
    'Anchor preflight JSON reused': 'yes',
    'Non-mainnet node prerequisite available': 'yes',
    'Claim/publication fields unlocked': 'no',
    'ERGO_API_KEY read': 'no',
    'Auth header sent': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Anchor evidence row closure claimed': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
    'Public claim authorization granted': 'no',
    'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
  },
};

describe('readiness handoff', () => {
  it('turns runtime prerequisites into concrete operator and reviewer work packets without closing evidence', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
        out: '../evidence/readiness/handoff.md',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);

    expect(report.status).toBe('ACTION_REQUIRED');
    expect(report.exitCode).toBe(0);
    expect(report.sourceCommit).toBe('abc1234');
    expect(report.localOnlyClosureIssueCount).toBe(0);
    expect(report.localEvidenceRequests).toHaveLength(0);
    expect(report.liveEvidenceRequests).toHaveLength(2);
    expect(report.reviewerOrExternalRequests).toHaveLength(1);
    expect(report.reviewerOrExternalRequests[0]).toEqual({
      lane: 'security-review',
      laneLabel: 'Independent security review',
      issue: 'Review Classification: External reviewer organization or affiliation must be concrete',
    });
    expect(report.liveEvidenceRequests[0]).toEqual({
      lane: 'trustless-burn',
      laneLabel: 'Trustless burn verification',
      issue: 'Burn inclusion proof: status must be linked before trustless burn evidence can pass',
    });
    expect(report.lanePackets).toHaveLength(3);
    expect(report.lanePackets[0]).toEqual({
      lane: 'trustless-burn',
      laneLabel: 'Trustless burn verification',
      issueCount: 1,
      evidenceTemplate: '../docs/trustless-burn-verification-evidence-template.md',
      validatorCommand: 'npm run trustless:validate -- <completed-trustless-burn-evidence.md>',
      releaseGateFlag: '--trustless-burn-evidence <completed-trustless-burn-evidence.md>',
      triageTarget: '../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md',
      currentPrerequisiteMap: '../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md',
      nextOperatorStep:
        'Use the compact unsigned candidate PASS validation as the source-boundary handoff, then collect the requested non-mainnet proof-acceptance artifacts and run the trustless burn validator on the completed evidence document.',
      closureBoundary:
        'Candidate proof-vector or candidate settlement JSON alone does not close Gate 5; completed protocol evidence plus reviewer sign-off is still required.',
      operatorEvidenceInputs: [
        'Proof-path packet: sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path.',
        'Compact unsigned candidate packet: completed npm run trustless:unsigned-tx JSON at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-2026-07-07-faf05c0b.json plus validation report at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md showing contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no. This is terminal legacy V1 diagnostic evidence and cannot be promoted into a signed node-backed packet.',
        'Replacement-profile target-node packet: wait for a separately versioned, reviewed, and activated external-fee profile with application-bound source finality, global DUP cutover lineage, and exact chain-resident setup/admission UTXOs. Only that profile may produce stateful /transactions/check PASS plus exact unsigned/signed transaction identity after explicit non-mainnet local-signing/check approval. Legacy V1 cannot produce this packet; this is not submit, reconciliation, deployment, or broadcast approval.',
        'Anchor observation packet: sanitized public extension-observation JSON plus completed npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json> report target, with the observed 0x0401 bridgeEventRoot bound to the proof-path packet.',
        'SPV tracker observation packet: sanitized public observation JSON plus completed npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json> report target, with tracker key, value, and digest matched to the recomputed observation.',
        'Observation reconciliation packet: completed npm run trustless:observation-reconcile -- --anchor-report-json <completed-anchor-observation-report.json> --spv-tracker-report-json <completed-spv-tracker-observation-report.json> --json-out <completed-reconciliation-report.json> target; current command-specific reconciliation at ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.md shows the refreshed testnet anchor observation remains BLOCKED after 720 successful extension reads at heights 434811..435530 because no matching 0x0401 bridgeEventRoot was observed, while SPV tracker linked-local prerequisite evidence still matches the bridgeEventRoot without a linked testnet anchor height, so the next packet must produce a LINKED anchor observation and bind one shared bridgeEventRoot and Ergo anchor height across anchor, SPV, proof-vector, and settlement-binding evidence.',
        'Proof-vector validation packet: current local proof-vector report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json and validation report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-07-07-faf05c0b.md, plus current SPV-linked candidate at ../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md and compact unsigned transaction validation at ../evidence/trustless-burn/artifacts/completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md. Treat them as source-boundary local proof-core evidence only; they do not close Gate 5, prove anchoring or finality, authorize /transactions/check, settlement readiness, signing, submit, or broadcast.',
        'Execution request packet: current non-mainnet execution request at ../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md plus JSON at ../evidence/trustless-burn/artifacts/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.json, bound to the 2401733f prerequisite map, 2401733f operator packet, and the refreshed faf05c0b SPV-linked candidate, compact unsigned transaction, instance binding, and instance refresh chain. Treat it as an operator request only; it does not authorize signing, /transactions/check, submit, broadcast, Gate 5 closure, or production claims.',
        'Acceptance-boundary packet: positive proof acceptance evidence plus reviewer notes confirming no Gate 5 closure, no settlement readiness, no broadcast authorization, and no production claim support from local proof-core evidence alone.',
      ],
      requestedEvidence: [
        'Burn inclusion proof: status must be linked before trustless burn evidence can pass',
      ],
    });
    expect(report.lanePackets[1].validatorCommand).toBe('npm run benchmark:validate -- <completed-benchmark-evidence.md>');
    expect(report.lanePackets[2].validatorCommand).toBe('npm run security:validate -- <completed-independent-security-review.md>');
    expect(report.workPackages).toContainEqual({
      name: 'Local evidence cleanup',
      status: 'complete',
      issueCount: 0,
      action: 'No local-only closure candidates remain in the current triage.',
    });
    expect(report.workPackages).toContainEqual({
      name: 'Claim and publication boundary',
      status: 'blocked',
      issueCount: 1,
      action: 'Keep claim and publication fields blocked until runtime evidence and reviewer decisions resolve.',
    });
    expect(report.boundary['Runtime prerequisites JSON reused']).toBe('yes');
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, key rotation, or state mutation performed']).toBe('no');
    expect(markdown).toContain('# Bridge Readiness External Handoff');
    expect(markdown).toContain('| Runtime prerequisite result | READY |');
    expect(markdown).toContain('| Source commit | abc1234 |');
    expect(markdown).toContain('| Local-only issues | 0 |');
    expect(markdown).toContain('| Local evidence requests | 0 |');
    expect(markdown).toContain('## Local Evidence Requests');
    expect(markdown).toContain('| Non-mainnet or live drill evidence | action-required | 2 |');
    expect(markdown).toContain('## Lane Packets');
    expect(markdown).toContain('## Reviewer/External Decision Requests');
    expect(markdown).toContain(
      '| Trustless burn verification | 1 | ../docs/trustless-burn-verification-evidence-template.md | npm run trustless:validate -- <completed-trustless-burn-evidence.md> | --trustless-burn-evidence <completed-trustless-burn-evidence.md> |',
    );
    expect(markdown).toContain('Anchor observation packet: sanitized public extension-observation JSON');
    expect(markdown).toContain('Replacement-profile target-node packet: wait for a separately versioned');
    expect(markdown).toContain('application-bound source finality');
    expect(markdown).toContain('global DUP cutover lineage');
    expect(markdown).not.toContain('npm run settle:aggregate -- check-with-ingest');
    expect(markdown).toContain('npm run trustless:anchor-observe -- --bridge-event-root');
    expect(markdown).toContain('SPV tracker observation packet: sanitized public observation JSON');
    expect(markdown).toContain('Observation reconciliation packet: completed npm run trustless:observation-reconcile');
    expect(markdown).toContain('refreshed testnet anchor observation remains BLOCKED after 720 successful extension reads at heights 434811..435530');
    expect(markdown).toContain('Proof-vector validation packet: current local proof-vector report at ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-07-07-faf05c0b.json');
    expect(markdown).toContain('completed-local-trustless-compact-unsigned-tx-validation-2026-07-07-faf05c0b.md');
    expect(markdown).toContain('Candidate proof-vector or candidate settlement JSON alone does not close Gate 5');
    expect(markdown).toContain('| Trustless burn verification | Burn inclusion proof: status must be linked');
    expect(markdown).toContain('| Independent security review | Review Classification: External reviewer organization or affiliation must be concrete |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries the exact Gate 5 aggregate prebroadcast input for operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'trustless-burn',
            issue: 'Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass',
          },
        ],
        nextActions: [
          'Collect node-backed/live-drill evidence for Gate 5 trustless burn before changing claim/publication fields.',
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'trustless-burn');

    expect(packet?.operatorEvidenceInputs).toContain(
      'Replacement-profile target-node packet: wait for a separately versioned, reviewed, and activated external-fee profile with application-bound source finality, global DUP cutover lineage, and exact chain-resident setup/admission UTXOs. Only that profile may produce stateful /transactions/check PASS plus exact unsigned/signed transaction identity after explicit non-mainnet local-signing/check approval. Legacy V1 cannot produce this packet; this is not submit, reconciliation, deployment, or broadcast approval.',
    );
    expect(markdown).not.toContain('npm run settle:aggregate -- check-with-ingest');
    expect(markdown).toContain('Legacy V1 cannot produce this packet');
    expect(markdown).toContain('this is not submit, reconciliation, deployment, or broadcast approval');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries exact local evidence requests into lane packets before external routing', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        totalStructuralIssues: 2,
        nodeBackedIssueCount: 0,
        nodeBackedIssues: [],
        reviewerOrExternalIssueCount: 0,
        reviewerOrExternalIssues: [],
        claimOrPublicationBoundaryIssueCount: 0,
        localEvidenceIssueCount: 2,
        localEvidenceIssues: [
          {
            lane: 'security-review',
            issue: 'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
          },
          {
            lane: 'benchmark',
            issue: 'Metric Table: Proof size: status must be linked before benchmark evidence can pass',
          },
        ],
        localClosureStatus: 'local-evidence-work-available',
        localOnlyClosureIssueCount: 2,
        externalOrLiveClosureIssueCount: 0,
        localClosureSummary:
          '2 local-only closure candidates remain for the selected lanes; complete the local evidence targets before routing external work.',
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const validation = buildReadinessHandoffValidationReport({
      command: buildReadinessHandoffValidationCommand({
        handoffJson: '../evidence/readiness/handoff.json',
      }),
      handoffReport: report,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);

    expect(report.localEvidenceRequests).toEqual([
      {
        lane: 'security-review',
        laneLabel: 'Independent security review',
        issue: 'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
      },
      {
        lane: 'benchmark',
        laneLabel: 'Benchmark and scaling evidence',
        issue: 'Metric Table: Proof size: status must be linked before benchmark evidence can pass',
      },
    ]);
    expect(report.liveEvidenceRequests).toEqual([]);
    expect(report.reviewerOrExternalRequests).toEqual([]);
    expect(report.lanePackets).toHaveLength(2);
    expect(report.lanePackets[0]).toMatchObject({
      lane: 'security-review',
      issueCount: 1,
      requestedEvidence: [
        'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
      ],
    });
    expect(report.lanePackets[1]).toMatchObject({
      lane: 'benchmark',
      issueCount: 1,
      requestedEvidence: [
        'Metric Table: Proof size: status must be linked before benchmark evidence can pass',
      ],
    });
    expect(validation.status).toBe('PASS');
    expect(validation.localEvidenceRequestCount).toBe(2);
    expect(validation.liveEvidenceRequestCount).toBe(0);
    expect(validation.reviewerOrExternalRequestCount).toBe(0);
    expect(validation.laneCoverageIssueCount).toBe(2);
    expect(markdown).toContain('## Local Evidence Requests');
    expect(markdown).toContain('| Independent security review | Required Scope Coverage: ErgoScript contracts');
    expect(markdown).toContain('| Benchmark and scaling evidence | Metric Table: Proof size');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries exact Gate 4 external-review inputs for reviewer handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssueCount: 0,
        nodeBackedIssues: [],
        reviewerOrExternalIssueCount: 2,
        reviewerOrExternalIssues: [
          {
            lane: 'security-review',
            issue: 'Required scope coverage: ErgoScript contracts must be linked before Gate 4 evidence can pass',
          },
          {
            lane: 'security-review',
            issue: 'Reviewer Sign-Off: Lead reviewer decision must approve before Gate 4 evidence can pass',
          },
        ],
        triageTargets: [
          {
            lane: 'security-review',
            target: '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
          },
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'security-review');

    expect(report.liveEvidenceRequests).toEqual([]);
    expect(report.reviewerOrExternalRequests).toHaveLength(2);
    expect(packet).toMatchObject({
      lane: 'security-review',
      laneLabel: 'Independent security review',
      issueCount: 2,
      evidenceTemplate: '../docs/independent-security-review-evidence-template.md',
      validatorCommand: 'npm run security:validate -- <completed-independent-security-review.md>',
      releaseGateFlag: '--security-review-evidence <completed-independent-security-review.md>',
      triageTarget: '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
      currentPrerequisiteMap: '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
      operatorEvidenceInputs: [
        'External reviewer packet: concrete independent reviewer organization or affiliation, organization type, lead reviewer, review period, reviewed commit, release scope, and final decision fields.',
        'Scope and evidence packet: area-specific scope coverage, command evidence, lifecycle, recovery, batch settlement, dependency, Gate 5, Gate 6, Gate 7, and release-note/checklist evidence as applicable.',
        'Finding and negative-check packet: finding-class disposition, accepted-risk disposition, publication blocker closure, and question-specific negative security-review checks.',
        'Boundary confirmation: no audit approval, accepted-risk closure, production-ready claim, publication, deployment, signing, submit, broadcast, runtime DB read, or private deployment-state read from this handoff.',
      ],
    });
    expect(markdown).toContain('External reviewer packet: concrete independent reviewer organization or affiliation');
    expect(markdown).toContain('| Independent security review | 2 | ../docs/independent-security-review-evidence-template.md |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries exact live-batch Gate 7 inputs for benchmark operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'benchmark',
            issue: 'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
          },
        ],
        nextActions: [
          'Collect node-backed/live-drill evidence for Gate 7 benchmark before changing claim/publication fields.',
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'benchmark');

    expect(packet).toMatchObject({
      operatorEvidenceInputs: [
        'Legacy V1 quarantine packet: exact fee-from-backing invariant, disabled daemon/CLI/programmatic submit boundaries, and proof that approval, Expected transaction ID, local state, and broadcast settings cannot restore funds authority.',
        'Replacement-profile packet: reviewed external-fee profile identity, target-node acceptance, exact funds-authority transition, conservation evidence, and permanent retirement of every legacy route before any new live batch request.',
        'Metric-boundary packet: positive measurements with units for throughput, latency, build time, proof size, transaction size, inputs, outputs, context-extension Vars, and batch size; no production throughput or mainnet-grade claim approval.',
      ],
    });
    expect(markdown).toContain('Legacy V1 quarantine packet: exact fee-from-backing invariant');
    expect(markdown).toContain('Replacement-profile packet: reviewed external-fee profile identity');
    expect(markdown).not.toContain('BRIDGE_BROADCAST_ENABLED=true');
    expect(markdown).toContain('Metric-boundary packet: positive measurements with units');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries exact sanitized Gate 6 deployment-state inputs for operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'committee-governance',
            issue: 'Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass',
          },
          {
            lane: 'committee-governance',
            issue: 'Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass',
          },
        ],
        nextActions: [
          'Collect node-backed/live-drill evidence for Gate 6 committee governance before changing claim/publication fields.',
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'committee-governance');

    expect(packet).toMatchObject({
      operatorEvidenceInputs: [
        'Sanitized deployment-state reconciliation packet: network name or chain id, sidechain id, SCS NFT id, singleton box ids or hashes, governance contract hashes, old and new committee public key or hash identifiers, and npm run governance:reconcile:validate command output with exit code 0.',
        'Wrong-network negative evidence: sanitized rejected or blocked result that names the deployment-state target, expected network, observed mismatched network, stop condition, and npm run governance:reconcile:validate command output with exit code 0 without exposing private deployment-state content.',
        'Boundary confirmation: no .env values, secrets, mnemonics, private DB rows, private deployment-state file dumps, signing, key rotation, state mutation, deploy, submit, or broadcast.',
      ],
    });
    expect(markdown).toContain('- Operator evidence inputs:');
    expect(markdown).toContain('Sanitized deployment-state reconciliation packet: network name or chain id');
    expect(markdown).toContain('Wrong-network negative evidence: sanitized rejected or blocked result');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries the exact Gate 5 SPV tracker observation input for operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'trustless-burn',
            issue: 'Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass',
          },
        ],
        nextActions: [
          'Collect node-backed/live-drill evidence for Gate 5 trustless burn before changing claim/publication fields.',
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'trustless-burn');

    expect(packet?.operatorEvidenceInputs).toContain(
      'SPV tracker observation packet: sanitized public observation JSON plus completed npm run trustless:spv-tracker-observe -- --observation-json <sanitized-public-observation.json> --json-out <completed-report.json> report target, with tracker key, value, and digest matched to the recomputed observation.',
    );
    expect(markdown).toContain('SPV tracker observation packet: sanitized public observation JSON');
    expect(markdown).toContain('npm run trustless:spv-tracker-observe -- --observation-json');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries the exact Gate 5 anchor observation input for operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'trustless-burn',
            issue: 'Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass',
          },
        ],
        nextActions: [
          'Collect node-backed/live-drill evidence for Gate 5 trustless burn before changing claim/publication fields.',
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'trustless-burn');

    expect(packet?.operatorEvidenceInputs).toContain(
      'Anchor observation packet: sanitized public extension-observation JSON plus completed npm run trustless:anchor-observe -- --bridge-event-root <64hex|0401:64hex> --observations-json <sanitized-public-observations.json> --min-height <n> --max-height <n> --json-out <completed-report.json> report target, with the observed 0x0401 bridgeEventRoot bound to the proof-path packet.',
    );
    expect(markdown).toContain('Anchor observation packet: sanitized public extension-observation JSON');
    expect(markdown).toContain('npm run trustless:anchor-observe -- --bridge-event-root');
    expect(markdown).toContain('observed 0x0401 bridgeEventRoot bound to the proof-path packet');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries the current Gate 5 observation reconciliation input for operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'trustless-burn',
            issue: 'Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass',
          },
          {
            lane: 'trustless-burn',
            issue: 'Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass',
          },
        ],
        nextActions: [
          'Collect node-backed/live-drill evidence for Gate 5 trustless burn before changing claim/publication fields.',
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);
    const packet = report.lanePackets.find(entry => entry.lane === 'trustless-burn');

    expect(packet?.operatorEvidenceInputs).toContain(
      'Observation reconciliation packet: completed npm run trustless:observation-reconcile -- --anchor-report-json <completed-anchor-observation-report.json> --spv-tracker-report-json <completed-spv-tracker-observation-report.json> --json-out <completed-reconciliation-report.json> target; current command-specific reconciliation at ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.md shows the refreshed testnet anchor observation remains BLOCKED after 720 successful extension reads at heights 434811..435530 because no matching 0x0401 bridgeEventRoot was observed, while SPV tracker linked-local prerequisite evidence still matches the bridgeEventRoot without a linked testnet anchor height, so the next packet must produce a LINKED anchor observation and bind one shared bridgeEventRoot and Ergo anchor height across anchor, SPV, proof-vector, and settlement-binding evidence.',
    );
    expect(markdown).toContain('../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-09-a21efc0b.md');
    expect(markdown).toContain('one shared bridgeEventRoot and Ergo anchor height');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('binds lane packets to the current prerequisite maps for operator handoff', () => {
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssueCount: 3,
        nodeBackedIssues: [
          {
            lane: 'trustless-burn',
            issue: 'Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass',
          },
          {
            lane: 'committee-governance',
            issue: 'Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass',
          },
          {
            lane: 'benchmark',
            issue: 'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
          },
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);

    expect(report.lanePackets.map(packet => packet.currentPrerequisiteMap)).toEqual([
      '../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md',
      '../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-09-57a50625.md',
      '../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md',
      '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
    ]);
    expect(markdown).toContain('- Current prerequisite map: ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md');
    expect(markdown).toContain('- Current prerequisite map: ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-09-57a50625.md');
    expect(markdown).toContain('- Current prerequisite map: ../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md');
    expect(markdown).toContain('- Current prerequisite map: ../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md');
    expect(markdown).toContain('npm run governance:reconcile:validate');

    const errors = validateReadinessHandoffReportJson({
      ...report,
      lanePackets: [
        {
          ...report.lanePackets[0],
          currentPrerequisiteMap: '../evidence/readiness/stale-map.md',
        },
        ...report.lanePackets.slice(1),
      ],
    });

    expect(errors).toContain(
      '--handoff-json report.lanePackets[0].currentPrerequisiteMap must be ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md',
    );
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('binds runtime triage targets in handoff lane packets', () => {
    const runtimeReportWithTargets = {
      ...runtimePrereqsReport,
      nodeBackedIssueCount: 2,
      nodeBackedIssues: [
        {
          lane: 'committee-governance',
          issue: 'Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass',
        },
        {
          lane: 'benchmark',
          issue: 'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
        },
      ],
      triageTargets: [
        {
          lane: 'committee-governance',
          target: '../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-c5f1d257.md',
        },
        {
          lane: 'benchmark',
          target: '../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-c5f1d257.md',
        },
      ],
    } as ReadinessRuntimePrereqsReport & {
      triageTargets: Array<{ lane: 'committee-governance' | 'benchmark'; target: string }>;
    };
    const report = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: runtimeReportWithTargets,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const markdown = formatReadinessHandoffReportMarkdown(report);

    expect(report.lanePackets.map(packet => packet.triageTarget)).toEqual([
      '../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-c5f1d257.md',
      '../evidence/benchmarks/gate7-live-batch-prerequisite-map-2026-07-02-c5f1d257.md',
      '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
    ]);
    expect(report.lanePackets.map(packet => packet.currentPrerequisiteMap)).toEqual([
      '../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-09-57a50625.md',
      '../evidence/benchmarks/gate7-live-benchmark-prerequisite-map-2026-07-09-e91f591c.md',
      '../evidence/security/gate4-independent-security-review-prerequisite-map-2026-07-09-c6fea203.md',
    ]);
    expect(markdown).toContain(
      '- Triage target: ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-c5f1d257.md',
    );
    expect(markdown).toContain(
      '- Current prerequisite map: ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-09-57a50625.md',
    );

    const errors = validateReadinessHandoffReportJson({
      ...report,
      lanePackets: [
        {
          ...report.lanePackets[0],
          triageTarget: '../evidence/governance/stale-map.md',
        },
        ...report.lanePackets.slice(1),
      ],
    });

    expect(errors).toContain(
      '--handoff-json report.lanePackets[0].triageTarget must be ../evidence/governance/phase010a-committee-governance-prerequisite-map-2026-07-02-c5f1d257.md',
    );
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('builds a bounded command label without echoing output paths', () => {
    expect(buildReadinessHandoffCommand({
      runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      out: '../evidence/readiness/handoff.md',
      jsonOut: '../evidence/readiness/handoff.json',
    })).toBe(
      'npm run readiness:handoff -- --runtime-prereqs-json ../evidence/readiness/runtime-prereqs.json --out <report.md> --json-out <report.json>',
    );
  });

  it('validates generated lane-packet handoff reports without closing evidence', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const report = buildReadinessHandoffValidationReport({
      command: buildReadinessHandoffValidationCommand({
        handoffJson: '../evidence/readiness/handoff.json',
        jsonOut: '../evidence/readiness/handoff-validation.json',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });
    const markdown = formatReadinessHandoffValidationReportMarkdown(report);

    expect(report.status).toBe('PASS');
    expect(report.exitCode).toBe(0);
    expect(report.sourceCommit).toBe('abc1234');
    expect(report.liveEvidenceRequestCount).toBe(2);
    expect(report.localEvidenceRequestCount).toBe(0);
    expect(report.reviewerOrExternalRequestCount).toBe(1);
    expect(report.lanePacketCount).toBe(3);
    expect(report.laneCoverageIssueCount).toBe(3);
    expect(report.operatorInputChecklistCount).toBe(3);
    expect(report.operatorEvidenceInputCount).toBe(16);
    expect(report.laneSummaries[0].operatorEvidenceInputCount).toBe(9);
    expect(report.errors).toEqual([]);
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, key rotation, or state mutation performed']).toBe('no');
    expect(markdown).toContain('# Bridge Readiness Handoff Validation');
    expect(markdown).toContain('| Result | PASS |');
    expect(markdown).toContain('| Source commit | abc1234 |');
    expect(markdown).toContain('| Reviewer/external requests | 1 |');
    expect(markdown).toContain('| Local evidence requests | 0 |');
    expect(markdown).toContain('| Operator input checklists | 3 |');
    expect(markdown).toContain('| Operator evidence inputs | 16 |');
    expect(markdown).toContain('| Structural issues | 0 |');
    expect(markdown).toContain('| Trustless burn verification | 1 | 9 | ../docs/trustless-burn-verification-evidence-template.md |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('rejects handoff lane-packet coverage drift', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });

    const errors = validateReadinessHandoffReportJson({
      ...handoff,
      lanePackets: [
        {
          ...handoff.lanePackets[0],
          requestedEvidence: [],
        },
        handoff.lanePackets[1],
      ],
    });

    expect(errors).toContain('--handoff-json report.lanePackets[0].issueCount must equal requestedEvidence.length');
    expect(errors).toContain('--handoff-json report.lanePackets[0].requestedEvidence must match handoff requests for trustless-burn');
  });

  it('rejects Gate 6 operator input checklist drift', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport: {
        ...runtimePrereqsReport,
        nodeBackedIssues: [
          {
            lane: 'committee-governance',
            issue: 'Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass',
          },
          {
            lane: 'committee-governance',
            issue: 'Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass',
          },
        ],
      },
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const errors = validateReadinessHandoffReportJson({
      ...handoff,
      lanePackets: [
        {
          ...handoff.lanePackets[0],
          operatorEvidenceInputs: [],
        },
      ],
    });

    expect(errors).toContain('--handoff-json report.lanePackets[0].operatorEvidenceInputs must match the committee-governance operator input checklist');
  });

  it('returns a blocked validation report for malformed reportable lane packets', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const malformed = {
      ...handoff,
      lanePackets: [
        null,
        {
          ...handoff.lanePackets[0],
          issueCount: 'one',
        },
      ],
    } as unknown as ReadinessHandoffReport;
    const report = buildReadinessHandoffValidationReport({
      command: buildReadinessHandoffValidationCommand({
        handoffJson: '../evidence/readiness/handoff.json',
      }),
      handoffReport: malformed,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });
    const markdown = formatReadinessHandoffValidationReportMarkdown(report);

    expect(report.status).toBe('BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.lanePacketCount).toBe(2);
    expect(report.laneCoverageIssueCount).toBe(0);
    expect(report.errors).toContain('--handoff-json report.lanePackets[0] must be an object');
    expect(report.errors).toContain('--handoff-json report.lanePackets[1].issueCount must be a safe integer');
    expect(markdown).toContain('| Result | BLOCKED |');
    expect(markdown).toContain('| Structural issues |');
  });

  it('blocks handoff validation when the expected source commit does not match', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const report = buildReadinessHandoffValidationReport({
      command: buildReadinessHandoffValidationCommand({
        handoffJson: '../evidence/readiness/handoff.json',
        expectedSourceCommit: 'def5678',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
      expectedSourceCommit: 'def5678',
    });
    const markdown = formatReadinessHandoffValidationReportMarkdown(report);

    expect(report.status).toBe('BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.errors).toContain('--expected-source-commit must match handoff sourceCommit abc1234');
    expect(markdown).toContain('| Expected source commit | def5678 |');
    expect(markdown).toContain('- --expected-source-commit must match handoff sourceCommit abc1234');
  });

  it('rejects handoff reports that flip closure or broadcast boundaries', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });

    const errors = validateReadinessHandoffReportJson({
      ...handoff,
      boundary: {
        ...handoff.boundary,
        'Evidence row closure claimed': 'yes',
      },
    });

    expect(errors).toContain('--handoff-json report.boundary.Evidence row closure claimed must be no');
  });

  it('validates runtime prerequisite JSON and rejects unsafe boundary flips', () => {
    expect(validateReadinessRuntimePrereqsJson(runtimePrereqsReport)).toEqual([]);

    const errors = validateReadinessRuntimePrereqsJson({
      ...runtimePrereqsReport,
      boundary: {
        ...runtimePrereqsReport.boundary,
        'Evidence row closure claimed': 'yes',
      },
    });

    expect(errors).toContain('--runtime-prereqs-json report.boundary.Evidence row closure claimed must be no');
  });

  it('writes guarded Markdown and JSON handoff artifacts from a runtime prerequisites report', () => {
    const runtimeJson = `../evidence/readiness/tmp-runtime-prereqs-handoff-source-${process.pid}-${Date.now()}.json`;
    const out = `../evidence/readiness/tmp-readiness-handoff-${process.pid}-${Date.now()}.md`;
    const jsonOut = `../evidence/readiness/tmp-readiness-handoff-${process.pid}-${Date.now()}.json`;
    const runtimeJsonPath = join(process.cwd(), runtimeJson);
    const outPath = join(process.cwd(), out);
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      writeFileSync(runtimeJsonPath, `${JSON.stringify(runtimePrereqsReport, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-handoff.ts',
          '--runtime-prereqs-json',
          runtimeJson,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('# Bridge Readiness External Handoff');
      expect(result.stdout).toContain('- readiness handoff JSON report written: ../evidence/readiness/');
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(existsSync(outPath)).toBe(true);
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('ACTION_REQUIRED');
      expect(written.runtimePrereqsSource).toEqual({ mode: 'json', target: runtimeJson });
      expect(written.localOnlyClosureIssueCount).toBe(0);
      expect(written.localEvidenceRequests).toHaveLength(0);
      expect(written.liveEvidenceRequests).toHaveLength(2);
      expect(written.reviewerOrExternalRequests).toHaveLength(1);
      expect(written.lanePackets).toHaveLength(3);
      expect(written.lanePackets[0].releaseGateFlag).toBe('--trustless-burn-evidence <completed-trustless-burn-evidence.md>');
      expect(written.lanePackets[1].evidenceTemplate).toBe('../docs/performance-benchmark-evidence-template.md');
      expect(written.lanePackets[2].evidenceTemplate).toBe('../docs/independent-security-review-evidence-template.md');
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(runtimeJsonPath, { force: true });
      rmSync(outPath, { force: true });
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('writes guarded validation output for generated handoff artifacts', () => {
    const handoff = buildReadinessHandoffReport({
      command: buildReadinessHandoffCommand({
        runtimePrereqsJson: '../evidence/readiness/runtime-prereqs.json',
      }),
      runtimePrereqsReport,
      runtimePrereqsSource: {
        mode: 'json',
        target: '../evidence/readiness/runtime-prereqs.json',
      },
    });
    const handoffJson = `../evidence/readiness/tmp-readiness-handoff-source-${process.pid}-${Date.now()}.json`;
    const reportOut = `../evidence/readiness/tmp-readiness-handoff-validation-${process.pid}-${Date.now()}.md`;
    const jsonOut = `../evidence/readiness/tmp-readiness-handoff-validation-${process.pid}-${Date.now()}.json`;
    const handoffJsonPath = join(process.cwd(), handoffJson);
    const reportOutPath = join(process.cwd(), reportOut);
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      writeFileSync(handoffJsonPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-readiness-handoff.ts',
          handoffJson,
          '--expected-source-commit',
          'abc1234',
          '--report-out',
          reportOut,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('# Bridge Readiness Handoff Validation');
      expect(result.stdout).toContain('| Result | PASS |');
      expect(result.stdout).toContain('- readiness handoff validation JSON report written: ../evidence/readiness/');
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(existsSync(reportOutPath)).toBe(true);
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('PASS');
      expect(written.sourceCommit).toBe('abc1234');
      expect(written.expectedSourceCommit).toBe('abc1234');
      expect(written.handoffSource).toEqual({ mode: 'json', target: handoffJson });
      expect(written.localEvidenceRequestCount).toBe(0);
      expect(written.reviewerOrExternalRequestCount).toBe(1);
      expect(written.laneCoverageIssueCount).toBe(3);
      expect(written.operatorInputChecklistCount).toBe(3);
      expect(written.operatorEvidenceInputCount).toBe(16);
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(handoffJsonPath, { force: true });
      rmSync(reportOutPath, { force: true });
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('fails closed on malformed runtime prerequisites JSON input', () => {
    const runtimeJson = `../evidence/readiness/tmp-runtime-prereqs-handoff-malformed-${process.pid}-${Date.now()}.json`;
    const runtimeJsonPath = join(process.cwd(), runtimeJson);
    try {
      writeFileSync(runtimeJsonPath, '{"status":"READY","exitCode":0}\n', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-handoff.ts',
          '--runtime-prereqs-json',
          runtimeJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--runtime-prereqs-json report.command must be present');
      expect(result.stderr).toContain('--runtime-prereqs-json report.nodeBackedIssues must be an array');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(runtimeJsonPath, { force: true });
    }
  });

  it('fails closed when runtime prerequisites claim evidence closure', () => {
    const runtimeJson = `../evidence/readiness/tmp-runtime-prereqs-handoff-boundary-${process.pid}-${Date.now()}.json`;
    const runtimeJsonPath = join(process.cwd(), runtimeJson);
    try {
      writeFileSync(
        runtimeJsonPath,
        `${JSON.stringify({
          ...runtimePrereqsReport,
          boundary: {
            ...runtimePrereqsReport.boundary,
            'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'yes',
          },
        }, null, 2)}\n`,
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-handoff.ts',
          '--runtime-prereqs-json',
          runtimeJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        '--runtime-prereqs-json report.boundary.Transaction broadcast, submit, deploy, key rotation, or state mutation performed must be no',
      );
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(runtimeJsonPath, { force: true });
    }
  });
});

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
