import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import {
  parseCleanCheckoutCommandRows,
  validateCleanCheckoutEvidence,
} from './clean-checkout-evidence.js';

const commandRows = [
  ['npm ci', 'pass'],
  ['npm run check', 'pass'],
  ['npm run wasm:test', 'pass'],
  ['npm run release:gate', 'blocked with 0 structural issues'],
  ['git diff --check -- ergo-sidechain-bridge', 'pass'],
  ['secret/local path diff scan', 'no matches'],
  ['git status --short', 'clean'],
].map(([command, expected]) => `| ${command} | ${expected} | artifact://ci/${slug(command)}.log | linked |`).join('\n');

const workflowRows = [
  'Workflow file is tracked',
  'Node.js version is pinned',
  'npm cache uses relayer lockfile',
  'Rust wasm target is installed',
  'wasm-pack version is pinned',
  'npm ci runs before tests',
  'npm run check runs in CI',
  'npm run wasm:test runs in CI',
  'Final branch commit is identified',
].map(requirement => {
  const evidence = workflowEvidence(requirement);
  return `| ${requirement} | ${evidence} | linked |`;
}).join('\n');

const decisionRows = [
  ['Lockfile install is reproducible', 'required before release proposal'],
  ['WASM AVL builds from tracked source', 'required before release proposal'],
  ['TypeScript build is reproducible', 'required before release proposal'],
  ['Relayer tests pass', 'required before release proposal'],
  ['Rust WASM tests pass', 'required before release proposal'],
  ['No local runtime state is staged', 'publication blocked if runtime state is staged'],
  [
    'No local path or secret marker is staged',
    'publication blocked if local path or secret marker is staged',
  ],
  [
    'Release gate has zero structural issues',
    'publication blocked unless release gate has 0 structural issues',
  ],
].map(([decision, publicationImpact]) => decisionRow(decision, publicationImpact)).join('\n');

const reviewerRows = [
  'CI reviewer',
  'Security reviewer',
  'Maintainer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |`).join('\n');

const templateOnlyEvidence = '[Clean Checkout Evidence Template](clean-checkout-evidence-template.md), `npm run ci:validate`';
const candidatePublicationUpdateBindings =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Release gate structural issues = 0';

function cleanCheckoutEvidence(overrides: {
  commands?: string;
  workflows?: string;
  decisions?: string;
  reviewers?: string;
  releaseLevel?: string;
  ciProvider?: string;
  cleanGreen?: string;
  releaseSupported?: string;
  productionClaim?: string;
  testnetProductionCandidateClaim?: string;
  structuralIssues?: string;
  releaseNotesUpdated?: string;
  releaseNoteUpdates?: string;
  checklistUpdates?: string;
  reviewerDecisionSummary?: string;
} = {}): string {
  return `
# Completed Clean Checkout Evidence

## Run Classification

| Field | Value |
|---|---|
| Evidence name | clean checkout CI |
| Git commit | abc1234 |
| Branch | codex/bridge-prod-readiness |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| CI provider | ${overrides.ciProvider ?? 'GitHub Actions'} |
| Workflow | .github/workflows/relayer-checks.yml |
| Node version | 24 |
| Rust target | wasm32-unknown-unknown |
| wasm-pack version | 0.14.0 |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Required Commands

| Command | Expected result | Evidence | Status |
|---|---|---|---|
${overrides.commands ?? commandRows}

## CI Workflow Evidence

| Requirement | Workflow evidence | Status |
|---|---|---|
${overrides.workflows ?? workflowRows}

## Reproducibility Decisions

| Decision | Required evidence | Publication impact | Status |
|---|---|---|---|
${overrides.decisions ?? decisionRows}

## Publication Decision

| Field | Value |
|---|---|
| Clean checkout CI green | ${overrides.cleanGreen ?? 'yes'} |
| Release supported | ${overrides.releaseSupported ?? 'institutional reference'} |
| Production-ready claim allowed | ${overrides.productionClaim ?? 'no'} |
| Testnet production-candidate claim allowed | ${overrides.testnetProductionCandidateClaim ?? 'no'} |
| Release gate structural issues | ${overrides.structuralIssues ?? '0'} |
| Release notes updated | ${overrides.releaseNotesUpdated ?? 'yes'} |
| Required release-note updates | ${overrides.releaseNoteUpdates ?? 'artifact://ci/completed-gate-1-release-note-update-evidence.md Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0'} |
| Required checklist updates | ${overrides.checklistUpdates ?? 'artifact://ci/completed-gate-1-checklist-update-evidence.md Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0'} |
| Reviewer decision summary | ${overrides.reviewerDecisionSummary ?? 'Release supported = institutional reference; clean checkout CI green; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Release gate structural issues = 0'} |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('clean checkout evidence validation', () => {
  it('parses command rows', () => {
    const rows = parseCleanCheckoutCommandRows(cleanCheckoutEvidence());

    expect(rows[0]).toMatchObject({
      command: 'npm ci',
      status: 'linked',
    });
  });

  it('passes when clean checkout evidence is fully structured', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence());

    expect(result.status).toBe('PASS');
    expect(result.classification).toMatchObject({
      evidenceName: 'clean checkout CI',
      gitCommit: 'abc1234',
      branch: 'codex/bridge-prod-readiness',
      releaseLevel: 'institutional reference',
      ciProvider: 'GitHub Actions',
      workflow: '.github/workflows/relayer-checks.yml',
      nodeVersion: '24',
      rustTarget: 'wasm32-unknown-unknown',
      wasmPackVersion: '0.14.0',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.commandRows).toHaveLength(7);
    expect(result.message).toContain('7 command rows');
  });

  it('prints release-gate and claim boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-clean-checkout-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run ci:validate');
    expect(result.stdout).toContain('completed Clean Checkout Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --clean-checkout-evidence');
    expect(result.stdout).toContain('clean checkout validation target');
    expect(result.stdout).toContain('command-specific completed clean-checkout output evidence');
    expect(result.stdout).toContain('completed Gate 1 release-note update evidence');
    expect(result.stdout).toContain('completed Gate 1 checklist update evidence');
    expect(result.stdout).toContain('A standalone PASS does not close the release gate');
    expect(result.stdout).toContain('Production-ready claims remain blocked');
    expect(result.stdout).toContain('Clean checkout CI green = yes');
    expect(result.stdout).toContain('Release supported = production deployment candidate');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed = yes');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('Release notes updated = yes');
    expect(result.stdout).toContain(
      'does not install dependencies, sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('requires clean-checkout dates to use ISO calendar format', () => {
    const result = validateCleanCheckoutEvidence(
      cleanCheckoutEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Run Classification: Date must use YYYY-MM-DD');
  });

  it('requires clean-checkout Git commits to use commit SHA format', () => {
    const result = validateCleanCheckoutEvidence(
      cleanCheckoutEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Run Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate run classification and publication decision fields', () => {
    const result = validateCleanCheckoutEvidence(
      cleanCheckoutEvidence()
        .replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |')
        .replace('| Release supported | institutional reference |', '| Release supported | institutional reference |\n| Release supported | validated PoC |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Run Classification: Git commit: duplicate required field');
    expect(result.errors).toContain('Publication Decision: Release supported: duplicate required field');
  });

  it('blocks missing command evidence and pending rows', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: '| npm ci | pass | | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm run check: missing required row');
    expect(result.errors).toContain('Required Commands: npm ci: status must be linked before Gate 1 evidence can pass');
  });

  it('rejects duplicate required clean-checkout rows', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: `${commandRows}\n| npm ci | pass | artifact://ci/npm-ci-second.log | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm ci: duplicate required row');
  });

  it('requires command evidence to identify the checked command output', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run wasm:test | pass | artifact://ci/npm-run-wasm-test.log | linked |',
        '| npm run wasm:test | pass | artifact://ci/clean-checkout.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run wasm:test: evidence must identify npm run wasm:test output',
    );
  });

  it('rejects targetless command-output evidence for linked required commands', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | npm run check command output: PASS | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
  });

  it('rejects contradictory PASS command-output evidence for linked required commands', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/npm-run-check.log npm run check command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive pass, passed, or ok output',
    );
  });

  it('rejects PASS command evidence that keeps an exit-code placeholder', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/npm-run-check.log npm run check command output: PASS exit code 0/1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive pass, passed, or ok output',
    );
  });

  it('rejects contradictory clean-checkout row evidence outside PASS command rows', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate BLOCKED with 1 structural issue | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI validation BLOCKED with 1 structural issue | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/lockfile-install-is-reproducible.log npm ci lockfile reproducibility status FAILED | required before release proposal | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: workflow evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: required evidence must not include contradictory clean-checkout failure markers',
    );
  });

  it('rejects clean-checkout evidence with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 clean checkout validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        `| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate blocked with 0 structural issues; ${contradictoryEvidence} | linked |`,
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        `| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI; ${contradictoryEvidence} | linked |`,
      ),
      decisions: decisionRows.replace(
        decisionRow('Release gate has zero structural issues', 'publication blocked unless release gate has 0 structural issues'),
        `| Release gate has zero structural issues | artifact://ci/release-gate-has-zero-structural-issues.log release:gate Structural issues = 0; ${contradictoryEvidence} | publication blocked unless release gate has 0 structural issues | linked |`,
      ),
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; ${contradictoryEvidence}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; ${contradictoryEvidence}`,
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        `| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; ${contradictoryEvidence} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: workflow evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Release gate has zero structural issues: required evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not include contradictory clean-checkout failure markers',
    );
  });

  it('rejects clean-checkout evidence with structured failure fields', () => {
    const emptyStructuredFields = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate blocked with 0 structural issues; {"errors":[]} errorCount: 0 | linked |',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate blocked with 0 structural issues; errorCount: 1 | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI; {"errors":["CI evidence gap"]} | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Release gate has zero structural issues', 'publication blocked unless release gate has 0 structural issues'),
        '| Release gate has zero structural issues | artifact://ci/release-gate-has-zero-structural-issues.log release:gate Structural issues = 0; {"failures":{"releaseGate":"blocked"}} | publication blocked unless release gate has 0 structural issues | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; failureTotal: 1',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; {"errors":["checklist gap"]}',
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; failureTotal: 1 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: workflow evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Release gate has zero structural issues: required evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not include contradictory clean-checkout failure markers',
    );
  });

  it('rejects linked clean-checkout evidence with remaining issue markers', () => {
    const remainingIssues = 'command output: PASS exit code 0; Remaining issues: follow-up item pending';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        `| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate blocked with 0 structural issues; ${remainingIssues} | linked |`,
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        `| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI; ${remainingIssues} | linked |`,
      ),
      decisions: decisionRows.replace(
        decisionRow('Release gate has zero structural issues', 'publication blocked unless release gate has 0 structural issues'),
        `| Release gate has zero structural issues | artifact://ci/release-gate-has-zero-structural-issues.log release:gate Structural issues = 0; ${remainingIssues} | publication blocked unless release gate has 0 structural issues | linked |`,
      ),
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; ${remainingIssues}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; ${remainingIssues}`,
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        `| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; ${remainingIssues} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: workflow evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Release gate has zero structural issues: required evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not include contradictory clean-checkout failure markers',
    );
  });

  it('rejects linked clean-checkout evidence with open or known issue markers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate blocked with 0 structural issues; Open issues: unresolved release gate blocker | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI; Known issues: unresolved CI blocker | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Release gate has zero structural issues', 'publication blocked unless release gate has 0 structural issues'),
        '| Release gate has zero structural issues | artifact://ci/release-gate-has-zero-structural-issues.log release:gate Structural issues = 0; Open issues: unresolved structural blocker | publication blocked unless release gate has 0 structural issues | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; Known issues: unresolved release-note blocker',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; Open issues: unresolved checklist blocker',
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; Known issues: unresolved reviewer blocker |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: workflow evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Release gate has zero structural issues: required evidence must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not include contradictory clean-checkout failure markers',
    );
  });

  it('rejects linked clean-checkout evidence with bracketed unresolved count markers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log | linked |',
        '| npm run release:gate | blocked with 0 structural issues | artifact://ci/npm-run-release-gate.log npm run release:gate blocked with 0 structural issues; Open issues (1 unresolved) | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: evidence must not include contradictory clean-checkout failure markers',
    );
  });

  it.each([
    'artifact://',
    'artifact:// ',
    'artifact:// completed output',
    'artifact://completed output',
  ])(
    'rejects targetless artifact marker %s for linked required commands',
    targetlessArtifact => {
      const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
        commands: commandRows.replace(
          '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
          `| npm run check | pass | ${targetlessArtifact} npm run check output captured | linked |`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
      );
    },
  );

  it('rejects validation-target bindings as linked clean-checkout row evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | [clean checkout validation target](artifact://ci/npm-run-check.log) npm run check output captured | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | [clean checkout validation target](artifact://ci/npm-run-check-runs-in-ci.yml) npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | [clean checkout validation target](artifact://ci/lockfile-install-is-reproducible.log) npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        '[clean checkout validation target](artifact://ci/completed-gate-1-release-note-update-evidence.md) completed Gate 1 release-note update evidence',
      checklistUpdates:
        '[clean checkout validation target](artifact://ci/completed-gate-1-checklist-update-evidence.md) completed Gate 1 checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('accepts concrete clean-checkout evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://ci/validation/clean-checkout-validate-input.md';
    const validationTargetBinding = `clean checkout validation target ${validationTarget}`;
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        `| npm run check | pass | artifact://ci/npm-run-check.log; ${validationTargetBinding} | linked |`,
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        `| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI; ${validationTargetBinding} | linked |`,
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        `| Lockfile install is reproducible | artifact://ci/lockfile-install-is-reproducible.log; ${validationTargetBinding} | required before release proposal | linked |`,
      ),
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; ${validationTargetBinding}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0; ${validationTargetBinding}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects row-named generic artifact targets for linked clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/generic-npm-run-check.log npm run check output captured | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/generic-npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/generic-lockfile-install-is-reproducible.log npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/generic-completed-gate-1-release-note-update-evidence.md',
      checklistUpdates:
        'artifact://ci/generic-completed-gate-1-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete artifact targets for linked clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/placeholder-npm-run-check.log npm run check output captured | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/todo-npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/tbd-lockfile-install-is-reproducible.log npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/sample-evidence-completed-gate-1-release-note-update-evidence.md',
      checklistUpdates:
        'artifact://ci/example-evidence-completed-gate-1-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete Markdown evidence link targets for linked clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | [npm run check output](../evidence/ci/placeholder-npm-run-check.log) npm run check output captured | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | [workflow evidence](../evidence/ci/todo-npm-run-check-runs-in-ci.yml) npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | [lockfile decision](../evidence/ci/tbd-lockfile-install-is-reproducible.log) npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        '[completed Gate 1 release-note update evidence](../evidence/ci/sample-evidence-completed-gate-1-release-note-update-evidence.md)',
      checklistUpdates:
        '[completed Gate 1 checklist update evidence](../evidence/ci/example-evidence-completed-gate-1-checklist-update-evidence.md)',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects sample-domain artifact targets for linked clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/completed-sample-npm-run-check.log npm run check output captured | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/completed-example-workflow-npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/completed-template-lockfile-install-is-reproducible.log npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/completed-sample-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence',
      checklistUpdates:
        'artifact://ci/completed-example-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for linked clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/npm-run-check-mainnet-production-certified.log npm run check output captured | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci-testnet-production-candidate-approved.yml npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/lockfile-install-is-reproducible-mainnet-production-certified.log npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update-evidence-mainnet-production-certified.md completed Gate 1 release-note update evidence',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update-evidence-production-ready-approved.md completed Gate 1 checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each([
    'artifact://ci/fixture-npm-run-check.log',
    'artifact://ci/mock-npm-run-check.log',
    'artifact://ci/dummy-npm-run-check.log',
    'artifact://ci/fake-npm-run-check.log',
    'artifact://ci/stub-npm-run-check.log',
    'artifact://ci/testdata-npm-run-check.log',
    'artifact://ci/synthetic-npm-run-check.log',
    'artifact://ci/simulated-npm-run-check.log',
  ])('rejects fixture-style artifact marker %s for linked clean-checkout evidence', artifactTarget => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        `| npm run check | pass | ${artifactTarget} npm run check output captured | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
  });

  it.each([
    '[fixture](../evidence/ci/fixture-npm-run-check.log) npm run check output captured',
    '[mock](../evidence/ci/mock-npm-run-check.log) npm run check output captured',
    '[dummy](../evidence/ci/dummy-npm-run-check.log) npm run check output captured',
    '[fake](../evidence/ci/fake-npm-run-check.log) npm run check output captured',
    '[stub](../evidence/ci/stub-npm-run-check.log) npm run check output captured',
    '[testdata](../evidence/ci/testdata-npm-run-check.log) npm run check output captured',
    '[synthetic](../evidence/ci/synthetic-npm-run-check.log) npm run check output captured',
    '[simulated](../evidence/ci/simulated-npm-run-check.log) npm run check output captured',
  ])('rejects fixture-style Markdown link %s for linked clean-checkout evidence', markdownTarget => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        `| npm run check | pass | ${markdownTarget} | linked |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
  });

  it.each([
    {
      variant: 'raw',
      tmpCommandTarget: ['', 'tmp', 'npm-run-check.log'].join('/'),
      driveWorkflowTarget: ['C:', 'tmp', 'npm-run-check-ci.yml'].join('/'),
      homeDecisionTarget: ['', 'home', 'operator', 'lockfile-reproducibility.log'].join('/'),
      fileReleaseNoteTarget: ['file:', '', '', 'C:', 'tmp', 'gate-1-release-note-evidence.md'].join('/'),
      uncChecklistTarget: ['', '', 'share-name', 'gate-1-checklist-evidence.md'].join('/'),
    },
    {
      variant: 'encoded',
      tmpCommandTarget: '%2Ftmp%2Fnpm-run-check.log',
      driveWorkflowTarget: 'C%3A%2Ftmp%2Fnpm-run-check-ci.yml',
      homeDecisionTarget: '%2Fhome%2Foperator%2Flockfile-reproducibility.log',
      fileReleaseNoteTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-1-release-note-evidence.md',
      uncChecklistTarget: '%2F%2Fshare-name%2Fgate-1-checklist-evidence.md',
    },
    {
      variant: 'embedded encoded',
      tmpCommandTarget: 'artifact://ci/sourceTarget=%2Ftmp%2Fnpm-run-check.log',
      driveWorkflowTarget: 'artifact://ci/sourceTarget=C%3A%2Ftmp%2Fnpm-run-check-ci.yml',
      homeDecisionTarget: 'artifact://ci/sourceTarget=%2Fhome%2Foperator%2Flockfile-reproducibility.log',
      fileReleaseNoteTarget:
        'artifact://ci/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-1-release-note-evidence.md',
      uncChecklistTarget:
        'artifact://ci/sourceTarget=%2F%2Fshare-name%2Fgate-1-checklist-evidence.md',
    },
  ])(
    'rejects $variant local-only Markdown evidence link targets for linked clean-checkout evidence',
    ({
      tmpCommandTarget,
      driveWorkflowTarget,
      homeDecisionTarget,
      fileReleaseNoteTarget,
      uncChecklistTarget,
    }) => {
      const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
        commands: commandRows.replace(
          '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
          `| npm run check | pass | [npm run check output](${tmpCommandTarget}) npm run check output captured | linked |`,
        ),
        workflows: workflowRows.replace(
          '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
          `| npm run check runs in CI | [npm run check CI evidence](${driveWorkflowTarget}) npm run check runs in CI | linked |`,
        ),
        decisions: decisionRows.replace(
          decisionRow('Lockfile install is reproducible', 'required before release proposal'),
          `| Lockfile install is reproducible | [lockfile reproducibility evidence](${homeDecisionTarget}) | required before release proposal | linked |`,
        ),
        releaseNoteUpdates:
          `[completed Gate 1 release-note update evidence](${fileReleaseNoteTarget})`,
        checklistUpdates:
          `[completed Gate 1 checklist update evidence](${uncChecklistTarget})`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
      );
      expect(result.errors).toContain(
        'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('rejects runtime database targets for linked clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm run check | pass | artifact://ci/npm-run-check.log | linked |',
        '| npm run check | pass | artifact://ci/npm-run-check.sqlite | linked |',
      ),
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.db npm run check runs in CI | linked |',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/lockfile-install-is-reproducible.sqlite3 npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update-evidence.sqlite',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update-evidence.sqlite-wal',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('allows concrete clean-checkout targets that mention sample size or template removal', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        'artifact://ci/npm-run-check.log',
        'artifact://ci/sample-size-analysis-npm-run-check.log',
      ),
      workflows: workflowRows.replace(
        'artifact://ci/npm-run-check-runs-in-ci.yml',
        'artifact://ci/template-removal-audit-npm-run-check-runs-in-ci.yml',
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        '| Lockfile install is reproducible | artifact://ci/sample-size-analysis-lockfile-install-is-reproducible.log npm ci lockfile reproducibility | required before release proposal | linked |',
      ),
      releaseNoteUpdates:
        'artifact://ci/sample-size-analysis-completed-gate-1-release-note-update-evidence.md Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0',
      checklistUpdates:
        'artifact://ci/template-removal-audit-completed-gate-1-checklist-update-evidence.md Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact command expected results for clean-checkout safety checks', () => {
    const vagueCommands = commandRows
      .replace(
        '| npm run release:gate | blocked with 0 structural issues |',
        '| npm run release:gate | reviewed |',
      )
      .replace(
        '| git diff --check -- ergo-sidechain-bridge | pass |',
        '| git diff --check -- ergo-sidechain-bridge | reviewed |',
      )
      .replace(
        '| secret/local path diff scan | no matches |',
        '| secret/local path diff scan | reviewed |',
      )
      .replace('| git status --short | clean |', '| git status --short | reviewed |');
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: vagueCommands,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run release:gate: expected result must state blocked with zero structural issues',
    );
    expect(result.errors).toContain(
      'Required Commands: git diff --check -- ergo-sidechain-bridge: expected result must state pass, passed, or ok',
    );
    expect(result.errors).toContain(
      'Required Commands: secret/local path diff scan: expected result must state no local path or secret marker matches',
    );
    expect(result.errors).toContain(
      'Required Commands: git status --short: expected result must state clean/no output worktree status',
    );
  });

  it('requires workflow evidence markers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      workflows: '| Node.js version is pinned | workflow says node 24 | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('CI Workflow Evidence: Workflow file is tracked: missing required row');
    expect(result.errors).toContain('CI Workflow Evidence: Node.js version is pinned: linked status requires an evidence marker');
  });

  it('requires final branch workflow evidence to cite the classified branch and commit', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      workflows: workflowRows.replace(
        '| Final branch commit is identified | artifact://ci/final-branch-commit-is-identified.yml final branch codex/bridge-prod-readiness commit abc1234 | linked |',
        '| Final branch commit is identified | artifact://ci/final-branch-commit-is-identified.yml final branch evidence captured | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'CI Workflow Evidence: Final branch commit is identified: workflow evidence must mention Run Classification Branch',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: Final branch commit is identified: workflow evidence must mention Run Classification Git commit',
    );
  });

  it('rejects targetless command-output evidence for linked workflow rows', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      workflows: workflowRows.replace(
        '| npm run check runs in CI | artifact://ci/npm-run-check-runs-in-ci.yml npm run check runs in CI | linked |',
        '| npm run check runs in CI | npm run check command output: PASS runs in CI | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm run check runs in CI: linked status requires a completed artifact marker or non-template evidence link',
    );
  });

  it('requires workflow evidence to cite the exact workflow and toolchain facts', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      workflows: workflowRows
        .replace(
          '| Workflow file is tracked | artifact://ci/workflow-file-is-tracked.yml .github/workflows/relayer-checks.yml workflow run | linked |',
          '| Workflow file is tracked | artifact://ci/workflow-file-is-tracked.yml workflow run | linked |',
        )
        .replace(
          '| Node.js version is pinned | artifact://ci/node-js-version-is-pinned.yml setup-node node version 24 | linked |',
          '| Node.js version is pinned | artifact://ci/node-js-version-is-pinned.yml setup-node node version current | linked |',
        )
        .replace(
          '| npm cache uses relayer lockfile | artifact://ci/npm-cache-uses-relayer-lockfile.yml npm cache dependency-path relayer/package-lock.json | linked |',
          '| npm cache uses relayer lockfile | artifact://ci/npm-cache.yml npm cache enabled | linked |',
        )
        .replace(
          '| wasm-pack version is pinned | artifact://ci/wasm-pack-version-is-pinned.yml wasm-pack version 0.14.0 pinned | linked |',
          '| wasm-pack version is pinned | artifact://ci/wasm-pack-version-is-pinned.yml wasm-pack pinned | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'CI Workflow Evidence: Workflow file is tracked: workflow evidence must identify tracked relayer-checks workflow file',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: Node.js version is pinned: workflow evidence must mention Run Classification Node version',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: npm cache uses relayer lockfile: workflow evidence must identify relayer package-lock cache key',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: wasm-pack version is pinned: workflow evidence must mention Run Classification wasm-pack version',
    );
  });

  it('rejects clean-checkout evidence that only points to templates or bare validator commands', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      commands: commandRows.replace(
        '| npm ci | pass | artifact://ci/npm-ci.log | linked |',
        `| npm ci | pass | ${templateOnlyEvidence} | linked |`,
      ),
      workflows: workflowRows.replace(
        '| Workflow file is tracked | artifact://ci/workflow-file-is-tracked.yml .github/workflows/relayer-checks.yml workflow run | linked |',
        `| Workflow file is tracked | ${templateOnlyEvidence} | linked |`,
      ),
      decisions: decisionRows.replace(
        decisionRow('Lockfile install is reproducible', 'required before release proposal'),
        `| Lockfile install is reproducible | ${templateOnlyEvidence} | required before release proposal | linked |`,
      ),
      releaseNoteUpdates: templateOnlyEvidence,
      checklistUpdates: templateOnlyEvidence,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'CI Workflow Evidence: Workflow file is tracked: linked status requires a completed artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
  });

  it('rejects targetless command-output notes for Gate 1 publication updates', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        'completed Gate 1 release-note update evidence: npm run ci:validate command output: PASS',
      checklistUpdates:
        'completed Gate 1 checklist update evidence: npm run ci:validate command output: PASS',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Gate 1 release-note update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Gate 1 checklist update evidence with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('requires Gate 1-specific release-note and checklist update evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates: 'artifact://ci/release-notes-update.md',
      checklistUpdates: 'artifact://ci/release-checklist-update.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed Gate 1 release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must identify completed Gate 1 checklist update evidence',
    );
  });

  it('rejects Gate 1 publication update evidence kinds hidden inside longer draft labels', () => {
    const institutionalPublicationUpdateBindings =
      'Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        `artifact://ci/draft-completed-gate-1-release-note-update-evidence.md ${institutionalPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://ci/draft-completed-gate-1-checklist-update-evidence.md ${institutionalPublicationUpdateBindings}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed Gate 1 release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must identify completed Gate 1 checklist update evidence',
    );
  });

  it('accepts compatibility-normalized Gate 1 publication update evidence kinds', () => {
    const gateLabel = '\uFF27\uFF41\uFF54\uFF45';
    const gateNumber = '\uFF11';
    const institutionalPublicationUpdateBindings =
      'Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        `artifact://ci/completed-release-note-update.md completed ${gateLabel} ${gateNumber} release-note update evidence ${institutionalPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://ci/completed-checklist-update.md completed ${gateLabel} ${gateNumber} checklist update evidence ${institutionalPublicationUpdateBindings}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects reused Gate 1 publication update evidence targets', () => {
    const reusedPublicationTarget =
      'artifact://ci/completed-gate-1-publication-update-evidence.md';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        `${reusedPublicationTarget} completed Gate 1 release-note update evidence`,
      checklistUpdates:
        `${reusedPublicationTarget} completed Gate 1 checklist update evidence`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed Gate 1 evidence targets',
    );
  });

  it('rejects Gate 1 publication updates that approve mainnet or production-ready claims', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update.md completed Gate 1 release-note update evidence approves mainnet production deployment wording',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update.md completed Gate 1 checklist update evidence approves production-ready clean-checkout claim wording',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('rejects contradictory Gate 1 publication update evidence', () => {
    const contradictoryEvidence = 'ci validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update.md completed Gate 1 release-note update evidence ${contradictoryEvidence}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update.md completed Gate 1 checklist update evidence ${contradictoryEvidence}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory clean-checkout failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory clean-checkout failure markers',
    );
  });

  it('blocks Gate 1 publication updates that close structural issues without the exact binding', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update.md completed Gate 1 release-note update evidence structural issues 0',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update.md completed Gate 1 checklist update evidence zero structural issues',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Release gate structural issues = 0; textual or shorthand structural issue terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Release gate structural issues = 0; textual or shorthand structural issue terms are not accepted',
    );
  });

  it('accepts exact structural issue closure bindings in Gate 1 publication updates', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update.md completed Gate 1 release-note update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update.md completed Gate 1 checklist update evidence Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires reproducibility decisions', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      decisions: '| Lockfile install is reproducible | artifact://ci/npm-ci.log | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reproducibility Decisions: WASM AVL builds from tracked source: missing required row');
    expect(result.errors).toContain('Reproducibility Decisions: Lockfile install is reproducible: publication impact is required');
  });

  it('requires publication-blocking decisions for staged runtime and secret markers', () => {
    const vagueDecisions = decisionRows
      .replace(
        decisionRow('No local runtime state is staged', 'publication blocked if runtime state is staged'),
        decisionRow('No local runtime state is staged', 'reviewed'),
      )
      .replace(
        decisionRow(
          'No local path or secret marker is staged',
          'publication blocked if local path or secret marker is staged',
        ),
        decisionRow('No local path or secret marker is staged', 'reviewed'),
      )
      .replace(
        decisionRow(
          'Release gate has zero structural issues',
          'publication blocked unless release gate has 0 structural issues',
        ),
        decisionRow('Release gate has zero structural issues', 'release reviewed'),
      );
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      decisions: vagueDecisions,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reproducibility Decisions: No local runtime state is staged: publication impact must state publication/release is blocked if local runtime state is staged',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: No local path or secret marker is staged: publication impact must state publication/release is blocked if local path or secret marker is staged',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: Release gate has zero structural issues: publication impact must state publication/release is blocked unless release gate has zero structural issues',
    );
  });

  it('requires reproducibility decision evidence to cite the checked signal', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      decisions: decisionRows
        .replace(
          decisionRow('Lockfile install is reproducible', 'required before release proposal'),
          '| Lockfile install is reproducible | artifact://ci/reviewed.log | required before release proposal | linked |',
        )
        .replace(
          decisionRow(
            'No local path or secret marker is staged',
            'publication blocked if local path or secret marker is staged',
          ),
          '| No local path or secret marker is staged | artifact://ci/reviewed.log | publication blocked if local path or secret marker is staged | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reproducibility Decisions: Lockfile install is reproducible: evidence must identify lockfile or npm ci reproducibility',
    );
    expect(result.errors).toContain(
      'Reproducibility Decisions: No local path or secret marker is staged: evidence must identify local-path or secret-marker scan',
    );
  });

  it('rejects targetless command-output evidence for linked reproducibility decisions', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      decisions: decisionRows.replace(
        decisionRow('TypeScript build is reproducible', 'required before release proposal'),
        '| TypeScript build is reproducible | npm run check command output: PASS | required before release proposal | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reproducibility Decisions: TypeScript build is reproducible: linked status requires a completed artifact marker or non-template evidence link',
    );
  });

  it('blocks non-green CI evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      cleanGreen: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: clean checkout CI must be green before Gate 1 evidence can pass');
  });

  it('blocks structural release gate issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      structuralIssues: '1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: release gate structural issues must be 0 before Gate 1 evidence can pass');
  });

  it('requires exact numeric zero for release gate structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      structuralIssues: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: release gate structural issues must be 0 before Gate 1 evidence can pass');
  });

  it('blocks completed clean-checkout evidence that supports no release level', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseSupported: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not be none before Gate 1 evidence can pass',
    );
  });

  it('blocks release support above the clean-checkout release level', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'validated PoC',
      releaseSupported: 'institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not exceed Run Classification release level',
    );
  });

  it('requires production-candidate clean checkouts to carry exact release support', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate clean checkout requires exact Release supported = production deployment candidate',
    );
  });

  it('blocks production deployment candidate support without testnet production-candidate claim handling', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('blocks testnet production-candidate claims below production deployment candidate support', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claim handling: allowed; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: testnet production-candidate claim requires production deployment candidate support',
    );
  });

  it('allows production deployment candidate support only through explicit testnet-scoped claim handling', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence ${candidatePublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence ${candidatePublicationUpdateBindings}`,
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; clean checkout CI green; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact release and testnet candidate bindings in clean checkout publication updates', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence Release gate structural issues = 0',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence Release gate structural issues = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact production-ready denial bindings in clean checkout publication updates', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      releaseNoteUpdates:
        'artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence; Release supported = production deployment candidate; Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
      checklistUpdates:
        'artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence; Release supported = production deployment candidate; Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; clean checkout CI green; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
  });

  it('rejects clean checkout publication updates and reviewer summaries that keep decision placeholders', () => {
    const placeholderBindings =
      'Release supported = production deployment candidate/institutional reference; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Release gate structural issues = 0/1';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence ${placeholderBindings}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence ${placeholderBindings}`,
      reviewerDecisionSummary:
        'Release supported = production deployment candidate/institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no/yes; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes/no; Release gate structural issues = 0/1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release gate structural issues = 0',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release gate structural issues = 0',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release gate structural issues = 0',
    );
  });

  it('rejects clean checkout publication updates and reviewer summaries with contradictory exact decision bindings', () => {
    const contradictoryBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; ' +
      'Testnet production-candidate claim allowed = no; Release gate structural issues = 0';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence ${contradictoryBindings}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence ${contradictoryBindings}`,
      reviewerDecisionSummary:
        `clean checkout CI green; production-ready claim handling: Production-ready claim allowed = no; ${contradictoryBindings}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory clean-checkout decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory clean-checkout decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory clean-checkout decision bindings',
    );
  });

  it.each([
    ['pending', 'structural issues remain pending follow-up'],
    ['awaiting', 'structural issues awaiting follow-up'],
    ['waiting', 'structural issues waiting for follow-up'],
    ['deferred', 'structural issues deferred reviewer follow-up'],
  ])(
    'blocks reviewer decision summaries with exact zero structural issues plus %s structural issue prose',
    (_label, unresolvedPhrase) => {
      const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
        releaseLevel: 'production deployment candidate',
        releaseSupported: 'production deployment candidate',
        testnetProductionCandidateClaim: 'yes',
        reviewerDecisionSummary:
          'Release supported = production deployment candidate; clean checkout CI green; ' +
          'production-ready claim handling: Production-ready claim allowed = no; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; ' +
          `Release gate structural issues = 0; ${unresolvedPhrase}`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Publication Decision: Reviewer decision summary must not leave release gate structural issues open',
      );
    },
  );

  it('requires exact production-candidate release support in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'release supported: production deployment candidate; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact institutional-reference release support in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = yes binding in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: allowed; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = no binding in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: not allowed; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = no binding in clean checkout publication updates', () => {
    const contradictoryClaimBinding =
      'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Release gate structural issues = 0';
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseNoteUpdates:
        `artifact://ci/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence; ${contradictoryClaimBinding}`,
      checklistUpdates:
        `artifact://ci/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence; ${contradictoryClaimBinding}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact Production-ready claim allowed = no binding in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: not allowed; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('blocks production-ready claims even at production deployment candidate level', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      productionClaim: 'yes',
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; clean checkout CI green; production-ready claim handling: allowed; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: clean checkout evidence cannot allow production-ready claims');
  });

  it('requires reviewer decision summary to bound clean-checkout release claims', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary: 'clean checkout evidence reviewed',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires exact release-supported wording in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: not allowed; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('rejects non-structured support-release wording as release support', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      reviewerDecisionSummary:
        'reviewer supports production deployment candidate release; clean checkout CI green; ' +
        'production-ready claim handling: blocked; testnet production-candidate claim handling: allowed; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires reviewer decision summary to bind zero release-gate structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: not allowed; release gate structural issues reviewed',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires numeric zero for release-gate structural issues in reviewer summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: not allowed; release gate structural issues: none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires exact Release gate structural issues = 0 binding in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: not allowed; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release gate structural issues = 0',
    );
  });

  it('blocks reviewer decision summaries that overstate clean-checkout release support', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      releaseSupported: 'institutional reference',
      reviewerDecisionSummary:
        'release supported: production deployment candidate; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; Release gate structural issues = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: release support must match Release supported institutional reference',
    );
  });

  it('requires explicit production-ready claim handling in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claims blocked; testnet production-candidate claim handling: not allowed; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires explicit testnet production-candidate claim handling in reviewer decision summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claims blocked; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in clean-checkout summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim allowed: no; testnet production-candidate claim handling: not allowed; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in clean-checkout summaries', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claim allowed: no; release gate structural issues: 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  });

  it('blocks reviewer decision summaries that approve failed CI or structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; release gate structural issues: 0; reviewer supports failed clean checkout CI; reviewer allows release gate structural issues 2',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
  });

  it('blocks compatibility-normalized reviewer text that approves failed CI or structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Release gate structural issues = 0; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 \uFF46\uFF41\uFF49\uFF4C\uFF45\uFF44 \uFF43\uFF4C\uFF45\uFF41\uFF4E \uFF43\uFF48\uFF45\uFF43\uFF4B\uFF4F\uFF55\uFF54 CI; ' +
        'reviewer \uFF41\uFF4C\uFF4C\uFF4F\uFF57\uFF53 release gate structural issues 2',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 \uFF46\uFF41\uFF49\uFF4C\uFF45\uFF44 \uFF43\uFF4C\uFF45\uFF41\uFF4E \uFF43\uFF48\uFF45\uFF43\uFF4B\uFF4F\uFF55\uFF54 CI |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer \uFF50\uFF45\uFF52\uFF4D\uFF49\uFF54\uFF53 release gate structural issues 2 |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
    expect(result.errors).toContain('Reviewer Sign-Off: CI reviewer: notes must not approve failed CI');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
  });

  it('allows reviewer decision summaries and notes that explicitly deny clean-checkout blocker approval', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Release gate structural issues = 0; failed clean checkout CI not approved; ' +
        'release gate structural issues not approved; reviewer approved without release gate structural issues',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; failed clean checkout CI not approved |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; release gate structural issues not approved; reviewer approved without release gate structural issues |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer decision summaries and notes that approve absence of clean-checkout blockers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Release gate structural issues = 0; reviewer approved absence of failed clean checkout CI; ' +
        'reviewer approved absence of release gate structural issues',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer approved absence of failed clean checkout CI |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer approved absence of release gate structural issues |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
    expect(result.errors).not.toContain('Reviewer Sign-Off: CI reviewer: notes must not approve failed CI');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer decision summaries and notes that approve lack of clean-checkout blockers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Release gate structural issues = 0; reviewer approved lack of failed clean checkout CI; ' +
        'lack of release gate structural issues approved by reviewer',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; lack of failed clean checkout CI approved by reviewer |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer approved lack of release gate structural issues |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
    expect(result.errors).not.toContain('Reviewer Sign-Off: CI reviewer: notes must not approve failed CI');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer decision summaries and notes that approve lacking clean-checkout blockers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Release gate structural issues = 0; reviewer approved lacking failed clean checkout CI; ' +
        'lacking release gate structural issues approved by reviewer',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; lacking failed clean checkout CI approved by reviewer |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer approved lacking release gate structural issues |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
    expect(result.errors).not.toContain('Reviewer Sign-Off: CI reviewer: notes must not approve failed CI');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer decision summaries and notes that approve evidence lacks clean-checkout blockers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; clean checkout CI green; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Release gate structural issues = 0; reviewer approved evidence lacks failed clean checkout CI; ' +
        'evidence lacks release gate structural issues approved by reviewer',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; evidence lacks failed clean checkout CI approved by reviewer |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; reviewer approved evidence lacks release gate structural issues |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
    expect(result.errors).not.toContain('Reviewer Sign-Off: CI reviewer: notes must not approve failed CI');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
    expect(result.status).toBe('PASS');
  });

  it('requires reviewer sign-off decisions', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: '| CI reviewer | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: CI reviewer: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: CI reviewer: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: CI reviewer: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: CI reviewer: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| CI reviewer | reviewer-a | block | 2026-05-14 | clean checkout issue blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: decision must be approve before Gate 1 evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| Maintainer | reviewer-a | approve | May 14 2026 | clean checkout evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Maintainer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the run classification date', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-13 | clean checkout evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: Date must not be before Run Classification Date',
    );
  });

  it('requires reviewer notes to state concrete clean-checkout outcomes', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed clean checkout evidence |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete clean-checkout outcome',
    );
  });

  it('rejects reviewer notes with contradictory clean-checkout failure markers', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout CI green; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory clean-checkout failure markers',
    );
  });

  it('rejects reviewer notes that approve forbidden clean-checkout release claims', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout CI green; production-ready claim approved for release |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout CI green; mainnet deployment claim cleared |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | release gate structural issues accepted for publication |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not approve production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve mainnet deployment claims',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
  });

  it.each([
    ['pending', 'release gate structural issues remain pending follow-up'],
    ['awaiting', 'release gate structural issues awaiting follow-up'],
    ['waiting', 'release gate structural issues waiting on follow-up'],
    ['deferred', 'release gate structural issues deferred reviewer follow-up'],
  ])('rejects reviewer notes that leave release gate structural issues open: %s', (_label, unresolvedNote) => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        `| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted; ${unresolvedNote} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not leave release gate structural issues open',
    );
  });

  it('rejects reviewer notes with active approval verbs before failed CI and structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | reviewer supports failed clean checkout CI |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | reviewer allows release gate structural issues 1 |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not approve failed CI',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
  });

  it('rejects reviewer notes with grant-family approval terms before failed CI and structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout CI green; reviewer grants failed clean checkout CI |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout complete; reviewer granted release gate structural issues 2 |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not approve failed CI',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
  });

  it('rejects clean-checkout summaries and notes with certification-family approval terms for failed CI and structural issues', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; clean checkout CI green; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: not allowed; release gate structural issues: 0; ' +
        'failed clean checkout CI certified; release gate structural issues 2 recommended',
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout complete; reviewer certifies failed clean checkout CI |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | clean checkout complete; reviewer accredited release gate structural issues 2 |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve failed CI',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve release gate structural issues',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not approve failed CI',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve release gate structural issues',
    );
  });

  it('rejects reviewer notes that enable failed CI as clean-checkout evidence', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | reviewer enables failed clean checkout CI for gate 1 evidence |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not approve failed CI',
    );
  });

  it('rejects reviewer notes that contain forbidden clean-checkout claim wording', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows
        .replace(
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout CI green; production-ready release wording observed |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | clean checkout CI green; mainnet production release wording observed |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it('requires CI reviewer sign-off to match the run classification identity', () => {
    const result = validateCleanCheckoutEvidence(cleanCheckoutEvidence({
      reviewers: reviewerRows.replace(
        '| CI reviewer | reviewer-a | approve | 2026-05-14 | clean checkout evidence accepted |',
        '| CI reviewer | reviewer-b | approve | 2026-05-14 | clean checkout evidence accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: CI reviewer: name must match Run Classification Reviewer',
    );
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function decisionRow(decision: string, publicationImpact: string): string {
  return `| ${decision} | artifact://ci/${slug(decision)}.log | ${publicationImpact} | linked |`;
}

function workflowEvidence(requirement: string): string {
  const artifact = `artifact://ci/${slug(requirement)}.yml`;
  switch (requirement) {
    case 'Workflow file is tracked':
      return `${artifact} .github/workflows/relayer-checks.yml workflow run`;
    case 'Node.js version is pinned':
      return `${artifact} setup-node node version 24`;
    case 'npm cache uses relayer lockfile':
      return `${artifact} npm cache dependency-path relayer/package-lock.json`;
    case 'Rust wasm target is installed':
      return `${artifact} rust target wasm32-unknown-unknown installed`;
    case 'wasm-pack version is pinned':
      return `${artifact} wasm-pack version 0.14.0 pinned`;
    case 'npm ci runs before tests':
      return `${artifact} npm ci runs before npm run check and npm run wasm:test`;
    case 'npm run check runs in CI':
      return `${artifact} npm run check runs in CI`;
    case 'npm run wasm:test runs in CI':
      return `${artifact} npm run wasm:test runs in CI`;
    case 'Final branch commit is identified':
      return `${artifact} final branch codex/bridge-prod-readiness commit abc1234`;
    default:
      return artifact;
  }
}
