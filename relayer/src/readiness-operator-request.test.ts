import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildReadinessHandoffCommand,
  buildReadinessHandoffReport,
} from './readiness-handoff.js';
import {
  buildReadinessOperatorRequestCommand,
  buildReadinessOperatorRequestReport,
  formatReadinessOperatorRequestMarkdown,
  validateReadinessOperatorRequestReportJson,
} from './readiness-operator-request.js';
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
  reviewerOrExternalIssueCount: 2,
  claimOrPublicationBoundaryIssueCount: 0,
  localEvidenceIssueCount: 0,
  localEvidenceIssues: [],
  localClosureStatus: 'external-or-live-required',
  localOnlyClosureIssueCount: 0,
  externalOrLiveClosureIssueCount: 4,
  manualTriageIssueCount: 0,
  localClosureSummary:
    'No local-only closure candidates remain; next progress requires non-mainnet/live evidence or external review.',
  triageSource: {
    mode: 'json',
    target: '../evidence/readiness/readiness-triage.json',
  },
  triageTargets: [
    {
      lane: 'security-review',
      target: '../evidence/security/gate4-prerequisite-map.md',
    },
    {
      lane: 'trustless-burn',
      target: '../evidence/trustless-burn/gate5-prerequisite-map.md',
    },
    {
      lane: 'committee-governance',
      target: '../evidence/governance/gate6-prerequisite-map.md',
    },
    {
      lane: 'benchmark',
      target: '../evidence/benchmarks/gate7-prerequisite-map.md',
    },
  ],
  nodeBackedIssues: [
    {
      lane: 'trustless-burn',
      issue: 'Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass',
    },
    {
      lane: 'benchmark',
      issue: 'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
    },
  ],
  reviewerOrExternalIssues: [
    {
      lane: 'security-review',
      issue: 'Review Classification: Final decision must be approve before security review evidence can pass',
    },
    {
      lane: 'committee-governance',
      issue: 'Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass',
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
    expectedRootMode: 'root-bound',
    anchorCount: 0,
    nodeEndpoint: 'http://127.0.0.1:9052',
  },
  nodeEndpoint: 'http://127.0.0.1:9052',
  nextActions: [
    'Collect node-backed/live-drill evidence and external reviewer decisions before changing claim/publication fields.',
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

describe('readiness operator request bundle', () => {
  it('distills a validated readiness handoff into compact operator and reviewer requests', () => {
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
    const report = buildReadinessOperatorRequestReport({
      command: buildReadinessOperatorRequestCommand({
        handoffJson: '../evidence/readiness/handoff.json',
        out: '../evidence/readiness/operator-request.md',
        jsonOut: '../evidence/readiness/operator-request.json',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });
    const markdown = formatReadinessOperatorRequestMarkdown(report);

    expect(report.status).toBe('REQUESTS_READY');
    expect(report.exitCode).toBe(0);
    expect(report.sourceCommit).toBe('abc1234');
    expect(report.localEvidenceRequestCount).toBe(0);
    expect(report.liveEvidenceRequestCount).toBe(2);
    expect(report.reviewerOrExternalRequestCount).toBe(2);
    expect(report.laneRequestCount).toBe(4);
    expect(report.operatorEvidenceInputCount).toBeGreaterThan(0);
    expect(report.laneRequests.map(request => request.laneLabel)).toEqual([
      'Trustless burn verification',
      'Benchmark and scaling evidence',
      'Independent security review',
      'Committee governance and key rotation',
    ]);
    expect(report.laneRequests[0].liveEvidenceRequests).toEqual([
      'Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass',
    ]);
    expect(report.laneRequests[0].triageTarget).toBe('../evidence/trustless-burn/gate5-prerequisite-map.md');
    expect(report.laneRequests[0].currentPrerequisiteMap).toBe(
      '../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md',
    );
    expect(report.laneRequests[0].supportingPackets).toEqual([
      '../evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-07-2401733f.md',
      '../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md',
      '../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md',
      '../evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-faf05c0b.md',
      '../evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-faf05c0b.md',
    ]);
    expect(report.laneRequests[1].supportingPackets).toEqual([
      '../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md',
      '../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-c2a52595.md',
      '../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-c2a52595.md',
    ]);
    expect(report.laneRequests[3].supportingPackets).toEqual([
      '../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.md',
      '../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-09-57a50625.md',
    ]);
    expect(report.laneRequests[0].reviewerOrExternalRequests).toEqual([]);
    expect(report.laneRequests[0].operatorEvidenceInputs).toContain(
      'Replacement-profile target-node packet: wait for a separately versioned, reviewed, and activated external-fee profile with application-bound source finality, global DUP cutover lineage, and exact chain-resident setup/admission UTXOs. Only that profile may produce stateful /transactions/check PASS plus exact unsigned/signed transaction identity after explicit non-mainnet local-signing/check approval. Legacy V1 cannot produce this packet; this is not submit, reconciliation, deployment, or broadcast approval.',
    );
    expect(report.laneRequests[2].reviewerOrExternalRequests).toEqual([
      'Review Classification: Final decision must be approve before security review evidence can pass',
    ]);
    expect(report.forbiddenInputs).toContain(
      'Do not send .env values, API keys, mnemonics, private keys, wallet material, or seed phrases.',
    );
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, key rotation, or state mutation performed']).toBe('no');
    expect(validateReadinessOperatorRequestReportJson(report)).toEqual([]);
    expect(markdown).toContain('# Bridge Readiness Operator Request Bundle');
    expect(markdown).toContain('| Source commit | abc1234 |');
    expect(markdown).toContain('| Node-backed or live evidence requests | 2 |');
    expect(markdown).toContain('| Trustless burn verification | 0 | 1 | 0 |');
    expect(markdown).toContain('| Triage target | ../evidence/trustless-burn/gate5-prerequisite-map.md |');
    expect(markdown).toContain('| Current prerequisite map | ../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-07-2401733f.md |');
    expect(markdown).toContain(
      '| Supporting packets | ../evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-07-2401733f.md<br>../evidence/trustless-burn/gate5-trustless-burn-execution-request-2026-07-07-4cb587fc.md<br>../evidence/trustless-burn/gate5-trustless-burn-spv-linked-candidate-2026-07-07-faf05c0b.md<br>../evidence/trustless-burn/gate5-trustless-burn-instance-binding-2026-07-07-faf05c0b.md<br>../evidence/trustless-burn/gate5-trustless-burn-instance-refresh-2026-07-07-faf05c0b.md |',
    );
    expect(markdown).toContain(
      '| Supporting packets | ../evidence/benchmarks/gate7-live-benchmark-review-packet-2026-07-09-e91f591c.md<br>../evidence/benchmarks/gate7-live-batch-capture-manifest-2026-07-09-c2a52595.md<br>../evidence/benchmarks/gate7-live-benchmark-execution-request-2026-07-09-c2a52595.md |',
    );
    expect(markdown).toContain(
      '| Supporting packets | ../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-handoff-2026-07-04-9fd9d7e1.md<br>../evidence/governance/phase010a-committee-governance-external-review-packet-2026-07-09-57a50625.md |',
    );
    expect(markdown).not.toContain('npm run settle:aggregate -- check-with-ingest');
    expect(markdown).toContain('Legacy V1 cannot produce this packet');
    expect(markdown).toContain('Do not send raw runtime databases');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('rejects request reports that flip no-closure or no-broadcast boundaries', () => {
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
    const report = buildReadinessOperatorRequestReport({
      command: buildReadinessOperatorRequestCommand({
        handoffJson: '../evidence/readiness/handoff.json',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });

    const errors = validateReadinessOperatorRequestReportJson({
      ...report,
      boundary: {
        ...report.boundary,
        'Evidence row closure claimed': 'yes',
        'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'yes',
      },
    });

    expect(errors).toContain('--operator-request-json report.boundary.Evidence row closure claimed must be no');
    expect(errors).toContain(
      '--operator-request-json report.boundary.Transaction broadcast, submit, deploy, key rotation, or state mutation performed must be no',
    );
  });

  it('rejects lane requests without exact prerequisite-map bindings', () => {
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
    const report = buildReadinessOperatorRequestReport({
      command: buildReadinessOperatorRequestCommand({
        handoffJson: '../evidence/readiness/handoff.json',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });

    const errors = validateReadinessOperatorRequestReportJson({
      ...report,
      laneRequests: report.laneRequests.map((request, index) => index === 0
        ? { ...request, currentPrerequisiteMap: '' }
        : request),
    });

    expect(errors).toContain('--operator-request-json report.laneRequests[0].currentPrerequisiteMap must be a non-empty string');
  });

  it('rejects lane requests that drop supporting packet links', () => {
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
    const report = buildReadinessOperatorRequestReport({
      command: buildReadinessOperatorRequestCommand({
        handoffJson: '../evidence/readiness/handoff.json',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });

    const errors = validateReadinessOperatorRequestReportJson({
      ...report,
      laneRequests: report.laneRequests.map((request, index) => index === 0
        ? { ...request, supportingPackets: [] }
        : request),
    });

    expect(errors).toContain('--operator-request-json report.laneRequests[0].supportingPackets must include at least one packet target');
  });

  it('rejects lane requests whose supporting packet links drift from the lane binding', () => {
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
    const report = buildReadinessOperatorRequestReport({
      command: buildReadinessOperatorRequestCommand({
        handoffJson: '../evidence/readiness/handoff.json',
      }),
      handoffReport: handoff,
      handoffSource: {
        mode: 'json',
        target: '../evidence/readiness/handoff.json',
      },
    });

    const errors = validateReadinessOperatorRequestReportJson({
      ...report,
      laneRequests: report.laneRequests.map((request, index) => index === 0
        ? { ...request, supportingPackets: ['../evidence/trustless-burn/wrong-packet.md'] }
        : request),
    });

    expect(errors).toContain('--operator-request-json report.laneRequests[0].supportingPackets must match the trustless-burn supporting packet list');
  });

  it('builds a bounded command label without echoing output contents', () => {
    expect(buildReadinessOperatorRequestCommand({
      handoffJson: '../evidence/readiness/handoff.json',
      out: '../evidence/readiness/operator-request.md',
      jsonOut: '../evidence/readiness/operator-request.json',
    })).toBe(
      'npm run readiness:operator-request -- --handoff-json ../evidence/readiness/handoff.json --out <request.md> --json-out <request.json>',
    );
  });

  it('writes guarded Markdown and JSON output from a handoff JSON target', () => {
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
    const handoffJson = `../evidence/readiness/tmp-readiness-handoff-operator-source-${process.pid}-${Date.now()}.json`;
    const out = `../evidence/readiness/tmp-readiness-operator-request-${process.pid}-${Date.now()}.md`;
    const jsonOut = `../evidence/readiness/tmp-readiness-operator-request-${process.pid}-${Date.now()}.json`;
    const handoffJsonPath = join(process.cwd(), handoffJson);
    const outPath = join(process.cwd(), out);
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      writeFileSync(handoffJsonPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-operator-request.ts',
          '--handoff-json',
          handoffJson,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('# Bridge Readiness Operator Request Bundle');
      expect(result.stdout).toContain('- readiness operator request JSON report written: ../evidence/readiness/');
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(existsSync(outPath)).toBe(true);
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('REQUESTS_READY');
      expect(written.handoffSource).toEqual({ mode: 'json', target: handoffJson });
      expect(written.localEvidenceRequestCount).toBe(0);
      expect(written.liveEvidenceRequestCount).toBe(2);
      expect(written.reviewerOrExternalRequestCount).toBe(2);
      expect(written.laneRequestCount).toBe(4);
      expect(written.boundary['Deployment state opened']).toBe('no');
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(handoffJsonPath, { force: true });
      rmSync(outPath, { force: true });
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('fails closed when the handoff JSON flips a guarded boundary', () => {
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
    const handoffJson = `../evidence/readiness/tmp-readiness-handoff-operator-invalid-${process.pid}-${Date.now()}.json`;
    const handoffJsonPath = join(process.cwd(), handoffJson);
    try {
      writeFileSync(
        handoffJsonPath,
        `${JSON.stringify({
          ...handoff,
          boundary: {
            ...handoff.boundary,
            'Evidence row closure claimed': 'yes',
          },
        }, null, 2)}\n`,
        'utf8',
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-operator-request.ts',
          '--handoff-json',
          handoffJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--handoff-json report.boundary.Evidence row closure claimed must be no');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(handoffJsonPath, { force: true });
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
