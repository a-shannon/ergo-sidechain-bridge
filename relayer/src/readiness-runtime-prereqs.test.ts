import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildReadinessRuntimePrereqsCommand,
  buildReadinessRuntimePrereqsReport,
  formatReadinessRuntimePrereqsReportMarkdown,
} from './readiness-runtime-prereqs.js';
import type { ReadinessNodePreflightReport } from './readiness-node-preflight.js';
import type { ReadinessTriageReport } from './readiness-triage.js';

const blockedNodeReport: ReadinessNodePreflightReport = {
  result: 'BLOCKED',
  exitCode: 1,
  command: 'npm run readiness:node-preflight --',
  nodeEndpoint: 'http://127.0.0.1:9052',
  reason: 'Ergo node readiness preflight blocked before all required non-mutating endpoints completed.',
  observedError: 'fetch failed; connect ECONNREFUSED 127.0.0.1:9052',
  checks: [],
  boundary: {
    'Ergo node request attempted': 'yes',
    'Node info endpoint reachable': 'no',
    'Node network identified as non-mainnet': 'no',
    'Header endpoint reachable': 'no',
    'Script compile endpoint reachable': 'no',
    'ERGO_API_KEY read': 'no',
    'Auth header sent': 'no',
    'Node wallet used': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
  },
};

const blockedTriageReport: ReadinessTriageReport = {
  status: 'BLOCKED',
  sourceCommit: 'abc1234',
  totalStructuralIssues: 4,
  lanes: [
    {
      lane: 'committee-governance',
      target: '../evidence/governance/current.md',
      label: '../evidence/governance/current.md',
      status: 'BLOCKED',
      validatorCompleted: true,
      errors: [
        'Rotation Plan: Identify old committee public keys: status must be linked',
        'Publication Rules: Governance-ready claim allowed must be yes before committee governance evidence can pass',
      ],
    },
    {
      lane: 'benchmark',
      target: '../evidence/benchmarks/current.md',
      label: '../evidence/benchmarks/current.md',
      status: 'BLOCKED',
      validatorCompleted: true,
      errors: [
        'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
        'Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass',
      ],
    },
  ],
  issues: [
    {
      lane: 'committee-governance',
      target: '../evidence/governance/current.md',
      category: 'node-backed-or-live-drill',
      issue: 'Rotation Plan: Identify old committee public keys: status must be linked',
    },
    {
      lane: 'committee-governance',
      target: '../evidence/governance/current.md',
      category: 'claim-or-publication-boundary',
      issue: 'Publication Rules: Governance-ready claim allowed must be yes before committee governance evidence can pass',
    },
    {
      lane: 'benchmark',
      target: '../evidence/benchmarks/current.md',
      category: 'node-backed-or-live-drill',
      issue: 'Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass',
    },
    {
      lane: 'benchmark',
      target: '../evidence/benchmarks/current.md',
      category: 'reviewer-or-external',
      issue: 'Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass',
    },
  ],
  categorySummaries: [
    {
      category: 'node-backed-or-live-drill',
      count: 2,
      meaning: 'Needs a concrete non-mainnet node-backed/live drill or real target binding; do not infer it from offline text',
    },
    {
      category: 'claim-or-publication-boundary',
      count: 1,
      meaning: 'Claim and publication fields should only flip after the underlying evidence categories are resolved',
    },
    {
      category: 'reviewer-or-external',
      count: 1,
      meaning: 'Needs human reviewer approval, external review evidence, or independent decision material',
    },
  ],
  localClosure: {
    status: 'external-or-live-required',
    localOnlyIssueCount: 0,
    externalOrLiveIssueCount: 4,
    manualTriageIssueCount: 0,
    summary:
      'No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers.',
  },
  boundary: {
    'Planning output only': 'yes',
    'Release gate PASS claimed': 'no',
    'Public claim authorization granted': 'no',
    'Evidence row closure claimed': 'no',
    'Runtime database or deployment state opened': 'no',
    'Transaction broadcast, deploy, key rotation, or state mutation performed': 'no',
  },
};

const passNodeReport: ReadinessNodePreflightReport = {
  ...blockedNodeReport,
  result: 'PASS',
  exitCode: 0,
  reason: 'Ergo node readiness preflight completed on testnet height 12345.',
  observedError: undefined,
  network: 'testnet',
  height: '12345',
  checks: [
    {
      name: 'Node info endpoint reachable',
      result: 'PASS',
      detail: 'network=testnet height=12345',
    },
  ],
  boundary: {
    ...blockedNodeReport.boundary,
    'Node info endpoint reachable': 'yes',
    'Node network identified as non-mainnet': 'yes',
    'Header endpoint reachable': 'yes',
    'Script compile endpoint reachable': 'yes',
  },
};

const blockedAnchorReport = {
  status: 'FAIL',
  exitCode: 1,
  expectedRoot: {
    mode: 'generic-diagnostic',
    status: 'WARN',
    provided: false,
    message: 'no bridgeEventRootHex provided; generic 0x0401 scan is diagnostic only and cannot satisfy readiness evidence',
  },
  node: {
    endpoint: 'http://127.0.0.1:9052',
    requestAttempted: true,
    currentHeight: 423032,
  },
  scanWindow: {
    minHeight: 422889,
    maxHeight: 423032,
    lookbackBlocks: 144,
    maxScanBlocks: 144,
    scannedBlocks: 144,
  },
  anchorScan: {
    anchorKey: '0401',
    anchorCount: 0,
  },
  checks: [
    {
      name: '0x0401 anchors (scanned 144 blocks)',
      status: 'FAIL',
      message: 'no 0x0401 anchor found in scan window',
    },
  ],
  boundary: {
    'Ergo node request attempted': 'yes',
    'Read-only Ergo node client': 'yes',
    'Node wallet used': 'no',
    'ERGO_API_KEY read': 'no',
    'Runtime database opened': 'no',
    'Deployment state opened': 'no',
    'Private key material serialized': 'no',
    'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
    'Evidence row closure claimed': 'no',
    'Release gate PASS claimed': 'no',
  },
} as const;

describe('readiness runtime prerequisites', () => {
  it('stops at node preflight when node-backed evidence still needs a non-mainnet node', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs --',
      triageReport: blockedTriageReport,
      nodePreflightReport: blockedNodeReport,
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(report.status).toBe('BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.nodeBackedIssueCount).toBe(2);
    expect(report.localClosureStatus).toBe('external-or-live-required');
    expect(report.localOnlyClosureIssueCount).toBe(0);
    expect(report.nextActions[0]).toContain('Start or configure a non-mainnet Ergo node');
    expect(report.nextActions[0]).toContain('npm run readiness:node-preflight --');
    expect(report.nextActions.join('\n')).toContain('No local-only closure candidates remain');
    expect(markdown).toContain('| Node-backed/live-drill issues | 2 |');
    expect(markdown).toContain('| Local-only closure status | External Or Live Required |');
    expect(markdown).toContain('| Local-only closure issues | 0 |');
    expect(markdown).toContain('| Node preflight | BLOCKED |');
    expect(markdown).not.toContain('Governance-ready claim allowed = yes');
    expect(markdown).not.toContain('Release supported = production deployment candidate');
    expect(markdown).toContain('| Claim/publication fields unlocked | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, key rotation, or state mutation performed | no |');
  });

  it('lists exact node-backed blockers so the next runtime action is concrete', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs --',
      triageReport: blockedTriageReport,
      nodePreflightReport: blockedNodeReport,
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(markdown).toContain('## Node-Backed/Live Drill Blockers');
    expect(markdown).toContain('| Lane | Issue |');
    expect(markdown).toContain(
      '| Gate 6 committee governance | Rotation Plan: Identify old committee public keys: status must be linked |',
    );
    expect(markdown).toContain(
      '| Gate 7 benchmark | Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass |',
    );
    expect(markdown).not.toContain('Governance-ready claim allowed must be yes');
  });

  it('lists exact local evidence blockers before handoff routing', () => {
    const localTriageReport: ReadinessTriageReport = {
      ...blockedTriageReport,
      totalStructuralIssues: 5,
      issues: [
        ...blockedTriageReport.issues,
        {
          lane: 'security-review',
          target: '../evidence/security/current.md',
          category: 'local-evidence',
          issue: 'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
        },
      ],
      categorySummaries: [
        ...blockedTriageReport.categorySummaries,
        {
          category: 'local-evidence',
          count: 1,
          meaning: 'Can usually move with offline command output, structured Markdown, or completed artifact links',
        },
      ],
      localClosure: {
        status: 'local-evidence-work-available',
        localOnlyIssueCount: 1,
        externalOrLiveIssueCount: 4,
        manualTriageIssueCount: 0,
        summary:
          '1 local-only closure candidate remains for the selected lanes; complete the local evidence target before routing external work.',
      },
    };
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs --',
      triageReport: localTriageReport,
      nodePreflightReport: passNodeReport,
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(report.localEvidenceIssueCount).toBe(1);
    expect(report.localEvidenceIssues).toEqual([
      {
        lane: 'security-review',
        issue: 'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
      },
    ]);
    expect(report.localClosureStatus).toBe('local-evidence-work-available');
    expect(markdown).toContain('## Local Evidence Blockers');
    expect(markdown).toContain(
      '| Gate 4 independent security review | Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass |',
    );
    expect(markdown).toContain('| Local evidence issues | 1 |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('carries the exact triage lane targets for downstream operator handoff', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs --',
      triageReport: blockedTriageReport,
      nodePreflightReport: passNodeReport,
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(report.triageTargets).toEqual([
      {
        lane: 'committee-governance',
        target: '../evidence/governance/current.md',
      },
      {
        lane: 'benchmark',
        target: '../evidence/benchmarks/current.md',
      },
    ]);
    expect(markdown).toContain('## Triage Lane Targets');
    expect(markdown).toContain('| Gate 6 committee governance | ../evidence/governance/current.md |');
    expect(markdown).toContain('| Gate 7 benchmark | ../evidence/benchmarks/current.md |');
  });

  it('routes to lane evidence commands only after node preflight passes', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs --',
      triageReport: blockedTriageReport,
      nodePreflightReport: passNodeReport,
    });

    expect(report.status).toBe('READY');
    expect(report.exitCode).toBe(0);
    expect(report.nextActions[0]).toContain('Collect node-backed/live-drill evidence');
    expect(report.nextActions.join('\n')).toContain('Gate 6 committee governance');
    expect(report.nextActions.join('\n')).toContain('Gate 7 benchmark');
    expect(report.nextActions.join('\n')).toContain('No local-only closure candidates remain');
    expect(report.nextActions.join('\n')).toContain(
      'Do not unlock claim/publication fields until node-backed/live-drill and reviewer/external blockers are resolved.',
    );
    expect(report.nextActions.join('\n')).not.toContain('local-evidence,');
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(report.boundary['Release gate PASS claimed']).toBe('no');
  });

  it('builds a bounded command label without echoing output paths', () => {
    expect(buildReadinessRuntimePrereqsCommand({
      nodeUrl: 'http://127.0.0.1:9052',
      explicitNodeUrl: true,
      out: '../evidence/readiness/runtime-prereqs.md',
    })).toBe('npm run readiness:runtime-prereqs -- --node-url http://127.0.0.1:9052 --out <report.md>');
  });

  it('builds a bounded command label for reused node preflight JSON evidence', () => {
    expect(buildReadinessRuntimePrereqsCommand({
      nodeUrl: 'http://127.0.0.1:9052',
      explicitNodeUrl: false,
      triageJson: '../evidence/readiness/readiness-triage.json',
      nodePreflightJson: '../evidence/readiness/node-preflight.json',
      anchorPreflightJson: '../evidence/readiness/anchor-preflight.json',
      jsonOut: '../evidence/readiness/runtime-prereqs.json',
    })).toBe('npm run readiness:runtime-prereqs -- --triage-json ../evidence/readiness/readiness-triage.json --node-preflight-json ../evidence/readiness/node-preflight.json --anchor-preflight-json ../evidence/readiness/anchor-preflight.json --json-out <report.json>');
  });

  it('records reused triage JSON provenance without changing blocker counts', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs -- --triage-json ../evidence/readiness/readiness-triage.json',
      triageReport: blockedTriageReport,
      triageSource: {
        mode: 'json',
        target: '../evidence/readiness/readiness-triage.json',
      },
      nodePreflightReport: passNodeReport,
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(report.status).toBe('READY');
    expect(report.sourceCommit).toBe('abc1234');
    expect(report.totalStructuralIssues).toBe(4);
    expect(report.localClosureStatus).toBe('external-or-live-required');
    expect(report.triageSource).toEqual({
      mode: 'json',
      target: '../evidence/readiness/readiness-triage.json',
    });
    expect(report.boundary['Readiness triage JSON reused']).toBe('yes');
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(markdown).toContain('default or JSON-backed readiness triage');
    expect(markdown).toContain('| Readiness triage source | json report: ../evidence/readiness/readiness-triage.json |');
    expect(markdown).toContain('| Source commit | abc1234 |');
    expect(markdown).toContain('| Local-only closure status | External Or Live Required |');
    expect(markdown).toContain('| Readiness triage JSON reused | yes |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('records reused node preflight JSON provenance without unlocking release claims', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command: 'npm run readiness:runtime-prereqs -- --node-preflight-json ../evidence/readiness/node-preflight.json',
      triageReport: blockedTriageReport,
      nodePreflightReport: passNodeReport,
      nodePreflightSource: {
        mode: 'json',
        target: '../evidence/readiness/node-preflight.json',
      },
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(report.status).toBe('READY');
    expect(report.nodePreflightSource).toEqual({
      mode: 'json',
      target: '../evidence/readiness/node-preflight.json',
    });
    expect(report.boundary['Node preflight JSON reused']).toBe('yes');
    expect(report.boundary['Live node probe executed by runtime prerequisites']).toBe('no');
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(markdown).toContain('| Node preflight source | json report: ../evidence/readiness/node-preflight.json |');
    expect(markdown).toContain('| Node preflight JSON reused | yes |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('records reused anchor preflight JSON provenance without claiming anchor closure', () => {
    const report = buildReadinessRuntimePrereqsReport({
      command:
        'npm run readiness:runtime-prereqs -- --node-preflight-json ../evidence/readiness/node-preflight.json --anchor-preflight-json ../evidence/readiness/anchor-preflight.json',
      triageReport: blockedTriageReport,
      nodePreflightReport: passNodeReport,
      nodePreflightSource: {
        mode: 'json',
        target: '../evidence/readiness/node-preflight.json',
      },
      anchorPreflightReport: blockedAnchorReport,
      anchorPreflightSource: {
        mode: 'json',
        target: '../evidence/readiness/anchor-preflight.json',
      },
    });
    const markdown = formatReadinessRuntimePrereqsReportMarkdown(report);

    expect(report.status).toBe('READY');
    expect(report.anchorPreflight).toBe('FAIL');
    expect(report.anchorPreflightSource).toEqual({
      mode: 'json',
      target: '../evidence/readiness/anchor-preflight.json',
    });
    expect(report.anchorPreflightSummary).toEqual({
      expectedRootMode: 'generic-diagnostic',
      anchorCount: 0,
      nodeEndpoint: 'http://127.0.0.1:9052',
    });
    expect(report.boundary['Anchor preflight JSON reused']).toBe('yes');
    expect(report.boundary['Anchor evidence row closure claimed']).toBe('no');
    expect(report.boundary['Evidence row closure claimed']).toBe('no');
    expect(markdown).toContain('| Anchor preflight | FAIL |');
    expect(markdown).toContain('| Anchor preflight source | json report: ../evidence/readiness/anchor-preflight.json |');
    expect(markdown).toContain('| Anchor count | 0 |');
    expect(markdown).toContain('| Anchor expected root mode | generic-diagnostic |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('writes guarded JSON output for runtime prerequisite routing without closing evidence', () => {
    const jsonOut = `../evidence/readiness/tmp-runtime-prereqs-output-${process.pid}-${Date.now()}.json`;
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--node-url',
          'http://127.0.0.1:1',
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('# Bridge Readiness Runtime Prerequisites');
      expect(result.stdout).toContain('- runtime prerequisites JSON report written: ../evidence/readiness/');
      expect(result.stderr).toBe('');
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('BLOCKED');
      expect(written.nodePreflight).toBe('BLOCKED');
      expect(written.localClosureStatus).toBe('external-or-live-required');
      expect(written.localOnlyClosureIssueCount).toBe(0);
      expect(written.localEvidenceIssues.length).toBe(0);
      expect(written.nodeBackedIssues.length).toBeGreaterThan(0);
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(written.boundary['Transaction broadcast, submit, deploy, key rotation, or state mutation performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('reuses guarded node preflight JSON input for runtime prerequisite routing', () => {
    const triageJson = `../evidence/readiness/tmp-readiness-triage-source-${process.pid}-${Date.now()}.json`;
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-source-${process.pid}-${Date.now()}.json`;
    const anchorPreflightJson = `../evidence/readiness/tmp-anchor-preflight-source-${process.pid}-${Date.now()}.json`;
    const jsonOut = `../evidence/readiness/tmp-runtime-prereqs-from-node-${process.pid}-${Date.now()}.json`;
    const triageJsonPath = join(process.cwd(), triageJson);
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    const anchorPreflightJsonPath = join(process.cwd(), anchorPreflightJson);
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      writeFileSync(triageJsonPath, `${JSON.stringify(blockedTriageReport, null, 2)}\n`, 'utf8');
      writeFileSync(nodePreflightJsonPath, `${JSON.stringify(passNodeReport, null, 2)}\n`, 'utf8');
      writeFileSync(anchorPreflightJsonPath, `${JSON.stringify(blockedAnchorReport, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--triage-json',
          triageJson,
          '--node-preflight-json',
          nodePreflightJson,
          '--anchor-preflight-json',
          anchorPreflightJson,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('# Bridge Readiness Runtime Prerequisites');
      expect(result.stdout).toContain('--triage-json ../evidence/readiness/');
      expect(result.stdout).toContain('--node-preflight-json ../evidence/readiness/');
      expect(result.stdout).toContain('--anchor-preflight-json ../evidence/readiness/');
      expect(result.stdout).toContain('| Readiness triage JSON reused | yes |');
      expect(result.stdout).toContain('| Node preflight | PASS |');
      expect(result.stdout).toContain('| Node preflight JSON reused | yes |');
      expect(result.stdout).toContain('| Anchor preflight | FAIL |');
      expect(result.stdout).toContain('| Anchor preflight JSON reused | yes |');
      expect(result.stderr).toBe('');
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('READY');
      expect(written.sourceCommit).toBe('abc1234');
      expect(written.triageSource).toEqual({ mode: 'json', target: triageJson });
      expect(written.localClosureStatus).toBe('external-or-live-required');
      expect(written.localOnlyClosureIssueCount).toBe(0);
      expect(written.localEvidenceIssues).toEqual([]);
      expect(written.nextActions.join('\n')).not.toContain('local-evidence,');
      expect(written.nodePreflight).toBe('PASS');
      expect(written.nodePreflightSource).toEqual({ mode: 'json', target: nodePreflightJson });
      expect(written.anchorPreflight).toBe('FAIL');
      expect(written.anchorPreflightSource).toEqual({ mode: 'json', target: anchorPreflightJson });
      expect(written.anchorPreflightSummary.anchorCount).toBe(0);
      expect(written.boundary['Readiness triage JSON reused']).toBe('yes');
      expect(written.boundary['Node preflight JSON reused']).toBe('yes');
      expect(written.boundary['Anchor preflight JSON reused']).toBe('yes');
      expect(written.boundary['Live node probe executed by runtime prerequisites']).toBe('no');
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(triageJsonPath, { force: true });
      rmSync(nodePreflightJsonPath, { force: true });
      rmSync(anchorPreflightJsonPath, { force: true });
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('fails closed on malformed node preflight JSON input', () => {
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-malformed-${process.pid}-${Date.now()}.json`;
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    try {
      writeFileSync(nodePreflightJsonPath, '{"result":"PASS","exitCode":0}\n', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--node-preflight-json',
          nodePreflightJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--node-preflight-json report.command must be present');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(nodePreflightJsonPath, { force: true });
    }
  });

  it('fails closed on malformed readiness triage JSON input', () => {
    const triageJson = `../evidence/readiness/tmp-readiness-triage-malformed-${process.pid}-${Date.now()}.json`;
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-source-${process.pid}-${Date.now()}.json`;
    const triageJsonPath = join(process.cwd(), triageJson);
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    try {
      writeFileSync(triageJsonPath, '{"status":"BLOCKED","totalStructuralIssues":1}\n', 'utf8');
      writeFileSync(nodePreflightJsonPath, `${JSON.stringify(passNodeReport, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--triage-json',
          triageJson,
          '--node-preflight-json',
          nodePreflightJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--triage-json report.lanes must be an array');
      expect(result.stderr).toContain('--triage-json report.localClosure must be an object');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(triageJsonPath, { force: true });
      rmSync(nodePreflightJsonPath, { force: true });
    }
  });

  it('fails closed when readiness triage localClosure counts drift from structural issues', () => {
    const triageJson = `../evidence/readiness/tmp-readiness-triage-local-closure-drift-${process.pid}-${Date.now()}.json`;
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-source-${process.pid}-${Date.now()}.json`;
    const triageJsonPath = join(process.cwd(), triageJson);
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    try {
      writeFileSync(
        triageJsonPath,
        `${JSON.stringify({
          ...blockedTriageReport,
          localClosure: {
            ...blockedTriageReport.localClosure,
            externalOrLiveIssueCount: 3,
          },
        }, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(nodePreflightJsonPath, `${JSON.stringify(passNodeReport, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--triage-json',
          triageJson,
          '--node-preflight-json',
          nodePreflightJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--triage-json report.localClosure issue counts must equal report.totalStructuralIssues');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(triageJsonPath, { force: true });
      rmSync(nodePreflightJsonPath, { force: true });
    }
  });

  it('fails closed when readiness triage localClosure hides local-only issue categories', () => {
    const triageJson = `../evidence/readiness/tmp-readiness-triage-local-closure-category-${process.pid}-${Date.now()}.json`;
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-source-${process.pid}-${Date.now()}.json`;
    const triageJsonPath = join(process.cwd(), triageJson);
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    try {
      writeFileSync(
        triageJsonPath,
        `${JSON.stringify({
          ...blockedTriageReport,
          issues: blockedTriageReport.issues.map((issue, index) =>
            index === 0 ? { ...issue, category: 'local-evidence' } : issue,
          ),
        }, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(nodePreflightJsonPath, `${JSON.stringify(passNodeReport, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--triage-json',
          triageJson,
          '--node-preflight-json',
          nodePreflightJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        '--triage-json report.localClosure.localOnlyIssueCount must equal local-only issue categories',
      );
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(triageJsonPath, { force: true });
      rmSync(nodePreflightJsonPath, { force: true });
    }
  });

  it('fails closed when readiness triage localClosure status drifts from issue buckets', () => {
    const triageJson = `../evidence/readiness/tmp-readiness-triage-local-closure-status-${process.pid}-${Date.now()}.json`;
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-source-${process.pid}-${Date.now()}.json`;
    const triageJsonPath = join(process.cwd(), triageJson);
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    try {
      writeFileSync(
        triageJsonPath,
        `${JSON.stringify({
          ...blockedTriageReport,
          issues: blockedTriageReport.issues.map((issue, index) =>
            index === 0 ? { ...issue, category: 'local-evidence' } : issue,
          ),
          localClosure: {
            ...blockedTriageReport.localClosure,
            status: 'external-or-live-required',
            localOnlyIssueCount: 1,
            externalOrLiveIssueCount: 3,
          },
        }, null, 2)}\n`,
        'utf8',
      );
      writeFileSync(nodePreflightJsonPath, `${JSON.stringify(passNodeReport, null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--triage-json',
          triageJson,
          '--node-preflight-json',
          nodePreflightJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--triage-json report.localClosure.status must match issue-count buckets');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(triageJsonPath, { force: true });
      rmSync(nodePreflightJsonPath, { force: true });
    }
  });

  it('fails closed on malformed anchor preflight JSON input', () => {
    const nodePreflightJson = `../evidence/readiness/tmp-node-preflight-source-${process.pid}-${Date.now()}.json`;
    const anchorPreflightJson = `../evidence/readiness/tmp-anchor-preflight-malformed-${process.pid}-${Date.now()}.json`;
    const nodePreflightJsonPath = join(process.cwd(), nodePreflightJson);
    const anchorPreflightJsonPath = join(process.cwd(), anchorPreflightJson);
    try {
      writeFileSync(nodePreflightJsonPath, `${JSON.stringify(passNodeReport, null, 2)}\n`, 'utf8');
      writeFileSync(anchorPreflightJsonPath, '{"status":"FAIL","exitCode":1}\n', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-runtime-prereqs.ts',
          '--node-preflight-json',
          nodePreflightJson,
          '--anchor-preflight-json',
          anchorPreflightJson,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--anchor-preflight-json report.expectedRoot must be an object');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(nodePreflightJsonPath, { force: true });
      rmSync(anchorPreflightJsonPath, { force: true });
    }
  });
});
