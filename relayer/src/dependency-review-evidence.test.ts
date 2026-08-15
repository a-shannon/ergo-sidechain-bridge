import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import {
  parseDependencyScopeRows,
  validateDependencyReviewEvidence,
} from './dependency-review-evidence.js';

const commandRows = [
  'npm ci',
  'npm run check',
  'npm run wasm:test',
  'npm audit --omit=dev',
  'cargo tree --locked',
].map(command =>
  `| ${command} | artifact://dependency/${slug(command)}.log ${command} command output: PASS exit code 0 | linked |`,
).join('\n');

const scopeRows = [
  ['ergo-lib-wasm-nodejs', 'sigma-rust signer consensus and ContextExtension serialization'],
  ['sigma-rust ContextExtension serializer', 'signed bytes and TX ID consensus'],
  ['@fleet-sdk/core', 'transaction assembly API drift'],
  ['@fleet-sdk/common', 'shared transaction and address helpers'],
  ['@fleet-sdk/wallet', 'wallet helper fallback signing risk'],
  ['ergo_avltree_rust', 'AVL proof compatibility with JVM Scorex verifier'],
  ['better-sqlite3', 'native SQLite state and recovery risk'],
  ['blakejs', 'Blake2b commitment hashing and proof-root consistency risk'],
  ['ethers', 'EVM event and receipt interpretation risk'],
  ['wasm-pack and Rust toolchain', 'reproducible WASM AVL build'],
  ['Node.js / npm lockfile', 'reproducible npm ci lockfile install'],
].map(([dependency, reviewedRisk]) =>
  `| ${dependency} | tracked source | ${reviewedRisk} | artifact://dependency/${slug(dependency)}.md | linked |`,
).join('\n');

const triageRows = [
  'npm production dependencies',
  'npm dev and build toolchain',
  'Rust dependency tree',
  'Signer consensus dependency',
  'AVL proof dependency',
  'SQLite native dependency',
  'EVM event dependency',
  'Lockfile integrity',
].map(item => `| ${item} | audit and manual review | no open critical/high | artifact://dependency/${slug(item)}.log | linked |`).join('\n');

const signerFailClosedReleaseAction =
  'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md';
const signerUpstreamReleaseAction =
  'upstream signer release v0.30.0 validated with positive JVM golden vectors and live /transactions/check evidence';
const signerUpstreamRequiredEvidence =
  'artifact://dependency/completed-upstream-signer-release-v0.30.0-jvm-node-conformance.md upstream signer release version: v0.30.0 positive JVM golden vectors and live /transactions/check evidence';

const upgradeRows = [
  'Signer dependency upgrade decision',
  'Fleet SDK upgrade decision',
  'AVL dependency upgrade decision',
  'SQLite dependency upgrade decision',
  'EVM dependency upgrade decision',
  'Toolchain pinning decision',
].map(decision => {
  const releaseAction = decision === 'Signer dependency upgrade decision'
    ? signerFailClosedReleaseAction
    : 'keep pinned for this release';
  return `| ${decision} | artifact://dependency/${slug(decision)}.md | ${releaseAction} | linked |`;
}).join('\n');

function upgradeRowsWithSignerDecision(requiredEvidence: string, releaseAction: string): string {
  return upgradeRows.replace(
    `| Signer dependency upgrade decision | artifact://dependency/signer-dependency-upgrade-decision.md | ${signerFailClosedReleaseAction} | linked |`,
    `| Signer dependency upgrade decision | ${requiredEvidence} | ${releaseAction} | linked |`,
  );
}

const reviewerRows = [
  'Dependency reviewer',
  'Security reviewer',
  'Maintainer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | dependency risk accepted |`).join('\n');

const templateOnlyEvidence = '[Dependency Review Evidence Template](dependency-review-evidence-template.md), `npm run dependency:validate`';
const failClosedDependencyPublicationUpdateBindings =
  'Release supported = institutional reference; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0; Upstream signer blocker resolved = no';
const resolvedCandidateDependencyPublicationUpdateBindings =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high vulnerabilities open = 0; Upstream signer blocker resolved = yes';

function dependencyEvidence(overrides: {
  commands?: string;
  scopes?: string;
  triage?: string;
  upgrades?: string;
  reviewers?: string;
  releaseLevel?: string;
  environment?: string;
  lockfilesReviewed?: string;
  releaseSupported?: string;
  productionClaim?: string;
  testnetProductionCandidateClaim?: string;
  criticalHigh?: string;
  upstreamResolved?: string;
  releaseNotesUpdated?: string;
  releaseNoteUpdates?: string;
  checklistUpdates?: string;
  reviewerDecisionSummary?: string;
} = {}): string {
  return `
# Completed Dependency Review Evidence

## Review Classification

| Field | Value |
|---|---|
| Review name | dependency review |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Environment | ${overrides.environment ?? 'clean checkout'} |
| Lockfiles reviewed | ${overrides.lockfilesReviewed ?? 'yes'} |
| Reviewer | reviewer-a |
| Date | 2026-05-14 |

## Required Commands

| Command | Evidence | Status |
|---|---|---|
${overrides.commands ?? commandRows}

## Dependency Scope

| Dependency | Source | Reviewed risk | Evidence | Status |
|---|---|---|---|---|
${overrides.scopes ?? scopeRows}

## Vulnerability Triage

| Triage item | Tool or review method | Findings | Evidence | Status |
|---|---|---|---|---|
${overrides.triage ?? triageRows}

## Upgrade And Pinning Decision

| Decision | Required evidence | Release action | Status |
|---|---|---|---|
${overrides.upgrades ?? upgradeRows}

## Publication Decision

| Field | Value |
|---|---|
| Release supported | ${overrides.releaseSupported ?? 'institutional reference'} |
| Production-ready claim allowed | ${overrides.productionClaim ?? 'no'} |
| Testnet production-candidate claim allowed | ${overrides.testnetProductionCandidateClaim ?? 'no'} |
| Critical/high vulnerabilities open | ${overrides.criticalHigh ?? '0'} |
| Upstream signer blocker resolved | ${overrides.upstreamResolved ?? 'no'} |
| Release notes updated | ${overrides.releaseNotesUpdated ?? 'yes'} |
| Required release-note updates | ${overrides.releaseNoteUpdates ?? `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}`} |
| Required checklist updates | ${overrides.checklistUpdates ?? `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}`} |
| Reviewer decision summary | ${overrides.reviewerDecisionSummary ?? 'Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0'} |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('dependency review evidence validation', () => {
  it('parses dependency scope rows', () => {
    const rows = parseDependencyScopeRows(dependencyEvidence());

    expect(rows[0]).toMatchObject({
      dependency: 'ergo-lib-wasm-nodejs',
      status: 'linked',
    });
  });

  it('passes when dependency review evidence is fully structured', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence());

    expect(result.status).toBe('PASS');
    expect(result.scopeRows).toHaveLength(11);
    expect(result.classification).toMatchObject({
      gitCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      environment: 'clean checkout',
      lockfilesReviewed: 'yes',
      reviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.message).toContain('11 dependency rows');
  });

  it('prints fail-closed release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-dependency-review-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run dependency:validate');
    expect(result.stdout).toContain('completed Dependency Review Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --dependency-review-evidence');
    expect(result.stdout).toContain('dependency review validation target');
    expect(result.stdout).toContain('command-specific completed dependency command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('fail-closed signer');
    expect(result.stdout).toContain('Critical/high vulnerabilities open = 0');
    expect(result.stdout).toContain('Upstream signer blocker resolved = yes');
    expect(result.stdout).toContain(
      'Production-ready and testnet production-candidate claims remain blocked until upstream signer release is validated',
    );
    expect(result.stdout).toContain(
      'does not install, upgrade, sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('requires dependency review dates to use ISO calendar format', () => {
    const result = validateDependencyReviewEvidence(
      dependencyEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Date must use YYYY-MM-DD');
  });

  it('requires dependency review Git commits to use commit SHA format', () => {
    const result = validateDependencyReviewEvidence(
      dependencyEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate review classification and publication decision fields', () => {
    const result = validateDependencyReviewEvidence(
      dependencyEvidence()
        .replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |')
        .replace('| Release supported | institutional reference |', '| Release supported | institutional reference |\n| Release supported | validated PoC |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Git commit: duplicate required field');
    expect(result.errors).toContain('Publication Decision: Release supported: duplicate required field');
  });

  it('blocks missing command artifacts', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: '| npm run check | local output | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm ci: missing required row');
    expect(result.errors).toContain('Required Commands: npm run check: linked status requires an evidence marker');
  });

  it('rejects duplicate required dependency-review rows', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: `${commandRows}\n| npm ci | artifact://dependency/npm-ci-second.log | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Commands: npm ci: duplicate required row');
  });

  it('requires linked command evidence to identify the exact dependency command output', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        '| npm audit --omit=dev | artifact://dependency/npm-audit-omit-dev.log npm audit --omit=dev command output: PASS exit code 0 | linked |',
        '| npm audit --omit=dev | artifact://dependency/reviewed.log command output: PASS exit code 0 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm audit --omit=dev: evidence must identify npm audit --omit=dev output',
    );
  });

  it('rejects dependency command evidence that keeps an exit-code placeholder', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        '| npm run check | artifact://dependency/npm-run-check.log npm run check command output: PASS exit code 0 | linked |',
        '| npm run check | artifact://dependency/npm-run-check.log npm run check command output: PASS exit code 0/1 | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive dependency command output',
    );
  });

  it('rejects contradictory dependency command output evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        'npm run check command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive dependency command output',
    );
  });

  it('rejects contradictory linked dependency row evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/ergo-lib-wasm-nodejs.md ERROR validation failed',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/npm-production-dependencies.log validation BLOCKED with 1 structural issue',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/fleet-sdk-upgrade-decision.md status FAILED',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
    );
  });

  it('rejects dependency review evidence with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 dependency review validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        `npm run check command output: PASS exit code 0; ${contradictoryEvidence}`,
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        `artifact://dependency/ergo-lib-wasm-nodejs.md ${contradictoryEvidence}`,
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        `artifact://dependency/npm-production-dependencies.log ${contradictoryEvidence}`,
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        `artifact://dependency/fleet-sdk-upgrade-decision.md ${contradictoryEvidence}`,
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${contradictoryEvidence}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${contradictoryEvidence}`,
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; ${contradictoryEvidence} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
    );
  });

  it('rejects dependency review evidence with structured failure fields', () => {
    const emptyStructuredFields = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        'npm run check command output: PASS exit code 0; {"errors":[]} errorCount: 0',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        'npm run check command output: PASS exit code 0; errorCount: 1',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/ergo-lib-wasm-nodejs.md {"errors":["dependency scope gap"]}',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/npm-production-dependencies.log {"failures":{"triage":"blocked"}}',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/fleet-sdk-upgrade-decision.md failureTotal: 1',
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; {"errors":["release-note gap"]}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; {"failures":{"checklist":"blocked"}}`,
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; failureTotal: 1 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must contain internally positive dependency command output',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
    );
  });

  it('rejects linked dependency evidence with remaining issue markers', () => {
    const remainingIssues = 'command output: PASS exit code 0; Remaining issues: follow-up item pending';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        `npm run check command output: PASS exit code 0; Remaining issues: follow-up item pending`,
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        `artifact://dependency/ergo-lib-wasm-nodejs.md ${remainingIssues}`,
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        `artifact://dependency/npm-production-dependencies.log ${remainingIssues}`,
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        `artifact://dependency/fleet-sdk-upgrade-decision.md ${remainingIssues}`,
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${remainingIssues}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${remainingIssues}`,
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; ${remainingIssues} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
    );
  });

  it('rejects linked dependency evidence with singular remaining issue markers', () => {
    const remainingIssue = 'command output: PASS exit code 0; Remaining issue: follow-up pending';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        'npm run check command output: PASS exit code 0; Remaining issue: follow-up pending',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        `artifact://dependency/ergo-lib-wasm-nodejs.md ${remainingIssue}`,
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        `artifact://dependency/npm-production-dependencies.log ${remainingIssue}`,
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        `artifact://dependency/fleet-sdk-upgrade-decision.md ${remainingIssue}`,
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${remainingIssue}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${remainingIssue}`,
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; ${remainingIssue} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
    );
  });

  it('rejects linked dependency evidence with open or known issue markers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        'npm run check command output: PASS exit code 0; Open issues: unresolved dependency command blocker',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/ergo-lib-wasm-nodejs.md command output: PASS exit code 0; Known issues: unresolved dependency scope blocker',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/npm-production-dependencies.log command output: PASS exit code 0; Open issues: unresolved triage blocker',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/fleet-sdk-upgrade-decision.md command output: PASS exit code 0; Known issues: unresolved upgrade blocker',
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; Open issues: unresolved release-note blocker`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; Known issues: unresolved checklist blocker`,
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; Open issues: unresolved reviewer blocker |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
    );
  });

  it('rejects linked dependency evidence with open or pending vulnerability markers', () => {
    for (const vulnerabilityMarker of [
      'Open vulnerabilities: unresolved dependency blocker',
      'Pending vulnerabilities: unresolved dependency blocker',
    ]) {
      const result = validateDependencyReviewEvidence(dependencyEvidence({
        commands: commandRows.replace(
          'npm run check command output: PASS exit code 0',
          `npm run check command output: PASS exit code 0; ${vulnerabilityMarker}`,
        ),
        scopes: scopeRows.replace(
          'artifact://dependency/ergo-lib-wasm-nodejs.md',
          `artifact://dependency/ergo-lib-wasm-nodejs.md command output: PASS exit code 0; ${vulnerabilityMarker}`,
        ),
        triage: triageRows.replace(
          'artifact://dependency/npm-production-dependencies.log',
          `artifact://dependency/npm-production-dependencies.log command output: PASS exit code 0; ${vulnerabilityMarker}`,
        ),
        upgrades: upgradeRows.replace(
          'artifact://dependency/fleet-sdk-upgrade-decision.md',
          `artifact://dependency/fleet-sdk-upgrade-decision.md command output: PASS exit code 0; ${vulnerabilityMarker}`,
        ),
        releaseNoteUpdates:
          `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${vulnerabilityMarker}`,
        checklistUpdates:
          `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${vulnerabilityMarker}`,
        reviewers: reviewerRows.replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          `| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; ${vulnerabilityMarker} |`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Commands: npm run check: evidence must not include contradictory dependency failure markers',
      );
      expect(result.errors).toContain(
        'Dependency Scope: ergo-lib-wasm-nodejs: evidence must not include contradictory dependency failure markers',
      );
      expect(result.errors).toContain(
        'Vulnerability Triage: npm production dependencies: evidence must not include contradictory dependency failure markers',
      );
      expect(result.errors).toContain(
        'Upgrade And Pinning Decision: Fleet SDK upgrade decision: required evidence must not include contradictory dependency failure markers',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
      );
      expect(result.errors).toContain(
        'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
      );
    }
  });

  it('allows linked dependency evidence with explicit no issue markers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'npm run check command output: PASS exit code 0',
        'npm run check command output: PASS exit code 0; Open issues: 0',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/ergo-lib-wasm-nodejs.md command output: PASS exit code 0; Known issues: none',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/npm-production-dependencies.log command output: PASS exit code 0; Open issues: no',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/fleet-sdk-upgrade-decision.md command output: PASS exit code 0; Known issues: n/a',
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; Open issues: 0`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; Known issues: none`,
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; Open issues: no |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('rejects contradictory dependency publication update evidence', () => {
    const contradictoryEvidence = 'dependency validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${contradictoryEvidence}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${contradictoryEvidence}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
  });

  it('blocks linked rows backed only by templates or bare validator commands', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace('artifact://dependency/npm-ci.log', templateOnlyEvidence),
      scopes: scopeRows.replace('artifact://dependency/ergo-lib-wasm-nodejs.md', templateOnlyEvidence),
      triage: triageRows.replace('artifact://dependency/npm-production-dependencies.log', templateOnlyEvidence),
      upgrades: upgradeRows.replace('artifact://dependency/signer-dependency-upgrade-decision.md', templateOnlyEvidence),
      releaseNoteUpdates: templateOnlyEvidence,
      checklistUpdates: templateOnlyEvidence,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects targetless command-output notes for linked dependency scope rows', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'npm run dependency:validate command output: PASS; ergo-lib-wasm-nodejs signer dependency reviewed',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects targetless command-output notes for publication update evidence fields', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates: 'completed dependency review release-note evidence: npm run dependency:validate command output: PASS',
      checklistUpdates: 'completed dependency review checklist update evidence: npm run dependency:validate command output: PASS',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects validation-target-only evidence for linked dependency review rows', () => {
    const validationTargetLabel = 'dependency review validation target';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log npm ci command output: PASS exit code 0',
        `[${validationTargetLabel}](artifact://dependency/npm-ci.log) npm ci command output: PASS exit code 0`,
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        `[${validationTargetLabel}](artifact://dependency/ergo-lib-wasm-nodejs.md) ergo-lib-wasm-nodejs signer dependency reviewed`,
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        `[${validationTargetLabel}](artifact://dependency/npm-production-dependencies.log)`,
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/signer-dependency-upgrade-decision.md',
        `[${validationTargetLabel}](artifact://dependency/signer-dependency-upgrade-decision.md)`,
      ),
      releaseNoteUpdates:
        `[${validationTargetLabel}](artifact://dependency/completed-dependency-review-release-note-evidence.md)`,
      checklistUpdates:
        `[${validationTargetLabel}](artifact://dependency/completed-dependency-review-checklist-update-evidence.md)`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('accepts concrete dependency evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://dependency/validation/dependency-validate-input.md';
    const validationTargetBinding = `dependency review validation target ${validationTarget}`;
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log npm ci command output: PASS exit code 0',
        `artifact://dependency/npm-ci.log npm ci command output: PASS exit code 0; ${validationTargetBinding}`,
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        `artifact://dependency/ergo-lib-wasm-nodejs.md; ${validationTargetBinding}`,
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        `artifact://dependency/npm-production-dependencies.log; ${validationTargetBinding}`,
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/signer-dependency-upgrade-decision.md',
        `artifact://dependency/signer-dependency-upgrade-decision.md; ${validationTargetBinding}`,
      ),
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${validationTargetBinding}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}; ${validationTargetBinding}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects targetless artifact markers for dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        'artifact://',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact:// completed ergo-lib-wasm-nodejs signer dependency evidence',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact:// ',
      ),
      releaseNoteUpdates: 'artifact:// completed dependency review release-note evidence',
      checklistUpdates: 'artifact:// completed dependency review checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects row-named generic artifact targets for dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        'artifact://dependency/generic-npm-ci.log',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/generic-ergo-lib-wasm-nodejs.md',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/generic-npm-production-dependencies.log',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/generic-fleet-sdk-upgrade-decision.md',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects sample-domain artifact targets for dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        'artifact://dependency/completed-sample-npm-ci.log',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/completed-sample-ergo-lib-wasm-nodejs.md',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/completed-sample-vulnerability-triage.log',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/completed-sample-fleet-sdk-upgrade-decision.md',
      ),
      releaseNoteUpdates: 'artifact://dependency/completed-sample-dependency-review-release-note-evidence.md',
      checklistUpdates: 'artifact://dependency/completed-example-dependency-review-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        'artifact://dependency/npm-ci-mainnet-production-certified.log',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/ergo-lib-wasm-nodejs-testnet-production-candidate-approved.md',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/npm-production-dependencies-mainnet-release-certified.log',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/fleet-sdk-upgrade-decision-production-ready-approved.md',
      ),
      releaseNoteUpdates: 'artifact://dependency/completed-dependency-review-release-note-evidence-mainnet-production-certified.md',
      checklistUpdates: 'artifact://dependency/completed-dependency-review-checklist-update-evidence-production-ready-approved.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete artifact targets for dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        'artifact://dependency/placeholder-npm-ci.log',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/todo-ergo-lib-wasm-nodejs.md',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/tbd-npm-production-dependencies.log',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/sample-evidence-fleet-sdk-upgrade-decision.md',
      ),
      releaseNoteUpdates: 'artifact://dependency/example-evidence-completed-dependency-review-release-note-evidence.md',
      checklistUpdates: 'artifact://dependency/placeholder-completed-dependency-review-checklist-update-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete Markdown evidence link targets for dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        '[npm ci output](../evidence/dependency/placeholder-npm-ci.log)',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        '[ergo-lib-wasm-nodejs evidence](../evidence/dependency/todo-ergo-lib-wasm-nodejs.md)',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        '[npm production dependencies triage](../evidence/dependency/tbd-npm-production-dependencies.log)',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        '[Fleet SDK upgrade decision](../evidence/dependency/sample-evidence-fleet-sdk-upgrade-decision.md)',
      ),
      releaseNoteUpdates: '[completed dependency review release-note evidence](../evidence/dependency/example-evidence-completed-dependency-review-release-note-evidence.md)',
      checklistUpdates: '[completed dependency review checklist update evidence](../evidence/dependency/placeholder-completed-dependency-review-checklist-update-evidence.md)',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each([
    'artifact://dependency/fixture-npm-ci.log',
    'artifact://dependency/mock-npm-ci.log',
    'artifact://dependency/dummy-npm-ci.log',
    'artifact://dependency/fake-npm-ci.log',
    'artifact://dependency/stub-npm-ci.log',
    'artifact://dependency/testdata-npm-ci.log',
    'artifact://dependency/synthetic-npm-ci.log',
    'artifact://dependency/simulated-npm-ci.log',
  ])('rejects fixture-style artifact marker %s for dependency review evidence', artifactTarget => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace('artifact://dependency/npm-ci.log', artifactTarget),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each([
    '[fixture](../evidence/dependency/fixture-npm-ci.log)',
    '[mock](../evidence/dependency/mock-npm-ci.log)',
    '[dummy](../evidence/dependency/dummy-npm-ci.log)',
    '[fake](../evidence/dependency/fake-npm-ci.log)',
    '[stub](../evidence/dependency/stub-npm-ci.log)',
    '[testdata](../evidence/dependency/testdata-npm-ci.log)',
    '[synthetic](../evidence/dependency/synthetic-npm-ci.log)',
    '[simulated](../evidence/dependency/simulated-npm-ci.log)',
  ])('rejects fixture-style Markdown link %s for dependency review evidence', markdownTarget => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace('artifact://dependency/npm-ci.log', markdownTarget),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it.each([
    {
      variant: 'raw',
      tmpCommandTarget: ['', 'tmp', 'dependency-npm-ci.log'].join('/'),
      driveScopeTarget: ['C:', 'tmp', 'ergo-lib-wasm-nodejs-evidence.md'].join('/'),
      homeTriageTarget: ['', 'home', 'operator', 'npm-production-dependencies.log'].join('/'),
      varUpgradeTarget: ['', 'var', 'bridge', 'fleet-sdk-upgrade-decision.md'].join('/'),
      fileReleaseNoteTarget: ['file:', '', '', 'C:', 'tmp', 'dependency-release-note-evidence.md'].join('/'),
      uncChecklistTarget: ['', '', 'share-name', 'dependency-checklist-evidence.md'].join('/'),
    },
    {
      variant: 'encoded',
      tmpCommandTarget: '%2Ftmp%2Fdependency-npm-ci.log',
      driveScopeTarget: 'C%3A%2Ftmp%2Fergo-lib-wasm-nodejs-evidence.md',
      homeTriageTarget: '%2Fhome%2Foperator%2Fnpm-production-dependencies.log',
      varUpgradeTarget: '%2Fvar%2Fbridge%2Ffleet-sdk-upgrade-decision.md',
      fileReleaseNoteTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fdependency-release-note-evidence.md',
      uncChecklistTarget: '%2F%2Fshare-name%2Fdependency-checklist-evidence.md',
    },
    {
      variant: 'embedded encoded',
      tmpCommandTarget: 'artifact://dependency/sourceTarget=%2Ftmp%2Fdependency-npm-ci.log',
      driveScopeTarget: 'artifact://dependency/sourceTarget=C%3A%2Ftmp%2Fergo-lib-wasm-nodejs-evidence.md',
      homeTriageTarget: 'artifact://dependency/sourceTarget=%2Fhome%2Foperator%2Fnpm-production-dependencies.log',
      varUpgradeTarget: 'artifact://dependency/sourceTarget=%2Fvar%2Fbridge%2Ffleet-sdk-upgrade-decision.md',
      fileReleaseNoteTarget:
        'artifact://dependency/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fdependency-release-note-evidence.md',
      uncChecklistTarget: 'artifact://dependency/sourceTarget=%2F%2Fshare-name%2Fdependency-checklist-evidence.md',
    },
  ])(
    'rejects $variant local-only Markdown evidence link targets for dependency review evidence',
    ({
      tmpCommandTarget,
      driveScopeTarget,
      homeTriageTarget,
      varUpgradeTarget,
      fileReleaseNoteTarget,
      uncChecklistTarget,
    }) => {
      const result = validateDependencyReviewEvidence(dependencyEvidence({
        commands: commandRows.replace(
          'artifact://dependency/npm-ci.log',
          `[npm ci output](${tmpCommandTarget}) npm ci command output: PASS exit code 0`,
        ),
        scopes: scopeRows.replace(
          'artifact://dependency/ergo-lib-wasm-nodejs.md',
          `[ergo-lib-wasm-nodejs evidence](${driveScopeTarget})`,
        ),
        triage: triageRows.replace(
          'artifact://dependency/npm-production-dependencies.log',
          `[npm production dependencies triage](${homeTriageTarget})`,
        ),
        upgrades: upgradeRows.replace(
          'artifact://dependency/fleet-sdk-upgrade-decision.md',
          `[Fleet SDK upgrade decision](${varUpgradeTarget})`,
        ),
        releaseNoteUpdates:
          `[completed dependency review release-note evidence](${fileReleaseNoteTarget})`,
        checklistUpdates:
          `[completed dependency review checklist update evidence](${uncChecklistTarget})`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('rejects runtime database targets for linked dependency review evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        '[npm ci output](../evidence/dependency/npm-ci.sqlite) npm ci command output: PASS exit code 0',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        '[ergo-lib-wasm-nodejs evidence](../evidence/dependency/ergo-lib-wasm-nodejs.sqlite3)',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        '[npm production dependencies triage](../evidence/dependency/npm-production-dependencies.db)',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        '[Fleet SDK upgrade decision](../evidence/dependency/fleet-sdk-upgrade-decision.sqlite)',
      ),
      releaseNoteUpdates:
        '[completed dependency review release-note evidence](../evidence/dependency/bridge-state-dependency-review-release-note.sqlite)',
      checklistUpdates:
        '[completed dependency review checklist update evidence](../evidence/dependency/completed-dependency-review-checklist-update-evidence.sqlite-wal)',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Commands: npm ci: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Fleet SDK upgrade decision: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('allows concrete dependency evidence targets that mention sample size or template removal', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      commands: commandRows.replace(
        'artifact://dependency/npm-ci.log',
        'artifact://dependency/sample-size-analysis-npm-ci.log',
      ),
      scopes: scopeRows.replace(
        'artifact://dependency/ergo-lib-wasm-nodejs.md',
        'artifact://dependency/template-removal-audit-ergo-lib-wasm-nodejs.md',
      ),
      triage: triageRows.replace(
        'artifact://dependency/npm-production-dependencies.log',
        'artifact://dependency/sample-size-analysis-npm-production-dependencies.log',
      ),
      upgrades: upgradeRows.replace(
        'artifact://dependency/fleet-sdk-upgrade-decision.md',
        'artifact://dependency/template-removal-audit-fleet-sdk-upgrade-decision.md',
      ),
      releaseNoteUpdates:
        `artifact://dependency/sample-size-analysis-completed-dependency-review-release-note-evidence.md completed dependency review release-note evidence; ${failClosedDependencyPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://dependency/template-removal-audit-completed-dependency-review-checklist-update-evidence.md completed dependency review checklist update evidence; ${failClosedDependencyPublicationUpdateBindings}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('blocks pending dependency scope rows', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      scopes: '| ergo-lib-wasm-nodejs | relayer/package.json | signer risk | | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Dependency Scope: sigma-rust ContextExtension serializer: missing required row');
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: status must be linked before dependency review evidence can pass',
    );
  });

  it('requires dependency scope risks to be dependency-specific', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      scopes: scopeRows.replace(
        '| @fleet-sdk/core | tracked source | transaction assembly API drift | artifact://dependency/fleet-sdk-core.md | linked |',
        '| @fleet-sdk/core | tracked source | reviewed critical risk | artifact://dependency/fleet-sdk-core.md | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dependency Scope: @fleet-sdk/core: reviewed risk must mention transaction assembly or API drift risk',
    );
  });

  it('requires dependency scope evidence to cite the reviewed dependency', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      scopes: scopeRows
        .replace(
          '| ergo-lib-wasm-nodejs | tracked source | sigma-rust signer consensus and ContextExtension serialization | artifact://dependency/ergo-lib-wasm-nodejs.md | linked |',
          '| ergo-lib-wasm-nodejs | tracked source | sigma-rust signer consensus and ContextExtension serialization | artifact://dependency/reviewed.md | linked |',
        )
        .replace(
          '| better-sqlite3 | tracked source | native SQLite state and recovery risk | artifact://dependency/better-sqlite3.md | linked |',
          '| better-sqlite3 | tracked source | native SQLite state and recovery risk | artifact://dependency/reviewed.md | linked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Dependency Scope: ergo-lib-wasm-nodejs: evidence must identify ergo-lib-wasm-nodejs signer dependency',
    );
    expect(result.errors).toContain(
      'Dependency Scope: better-sqlite3: evidence must identify better-sqlite3',
    );
  });

  it('requires vulnerability triage evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      triage: '| npm production dependencies | npm audit | | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Vulnerability Triage: npm dev and build toolchain: missing required row');
    expect(result.errors).toContain('Vulnerability Triage: npm production dependencies: findings are required');
    expect(result.errors).toContain('Vulnerability Triage: npm production dependencies: linked status requires an evidence marker');
  });

  it('requires linked vulnerability triage rows to state zero open critical/high findings', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      triage: triageRows.replace(
        '| npm production dependencies | audit and manual review | no open critical/high | artifact://dependency/npm-production-dependencies.log | linked |',
        '| npm production dependencies | audit and manual review | reviewed dependencies | artifact://dependency/npm-production-dependencies.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires explicit zero open critical/high findings',
    );
  });

  it('rejects contradictory positive critical or high counts in linked vulnerability triage', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      triage: triageRows.replace(
        '| npm production dependencies | audit and manual review | no open critical/high | artifact://dependency/npm-production-dependencies.log | linked |',
        '| npm production dependencies | audit and manual review | no open critical/high; 1 high vulnerability remains open | artifact://dependency/npm-production-dependencies.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status cannot include positive critical/high finding counts',
    );
  });

  it('rejects ambiguous critical or high count placeholders in linked vulnerability triage', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      triage: triageRows.replace(
        '| npm production dependencies | audit and manual review | no open critical/high | artifact://dependency/npm-production-dependencies.log | linked |',
        '| npm production dependencies | audit and manual review | Critical/high vulnerabilities open = 0/1 | artifact://dependency/npm-production-dependencies.log | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Vulnerability Triage: npm production dependencies: linked status requires explicit zero open critical/high findings',
    );
  });

  it('requires upgrade and pinning decisions', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upgrades: '| Signer dependency upgrade decision | no artifact | keep pinned | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Upgrade And Pinning Decision: Fleet SDK upgrade decision: missing required row');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: linked status requires an evidence marker',
    );
  });

  it('requires signer dependency release action to state a complete upstream or fail-closed path', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream release reviewed but node agreement missing and production claim status not stated',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: release action must state either upstream signer release with a concrete release identifier and JVM/node golden-vector or /transactions/check evidence, or explicit fail-closed guard/blocker rationale with production-ready and testnet production-candidate claims blocked',
    );
  });

  it('requires fail-closed signer release actions to cite ContextExtension guard evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked for this release; testnet production-candidate claims blocked for this release',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: fail-closed release action must cite ContextExtension guard evidence and production-ready plus testnet production-candidate claim blocking evidence',
    );
  });

  it('requires fail-closed signer release actions to block testnet production-candidate claims', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked for this release; guard evidence artifact://dependency/context-extension-guard-evidence.md',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: fail-closed release action must state that testnet production-candidate claims remain blocked',
    );
  });

  it('rejects upstream signer resolution mixed with fail-closed blocker wording', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release v0.30.0 validated with positive JVM golden vectors and live /transactions/check evidence; keep pinned with fail-closed blocker rationale until deployment',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved conflicts with fail-closed signer blocker wording',
    );
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: upstream signer release action must not include fail-closed signer blocker wording',
    );
  });

  it('rejects generic upstream signer release wording without concrete release and conformance artifacts', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release validated with JVM conformance evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: release action must state either upstream signer release with a concrete release identifier and JVM/node golden-vector or /transactions/check evidence, or explicit fail-closed guard/blocker rationale with production-ready and testnet production-candidate claims blocked',
    );
  });

  it('rejects ambiguous upstream signer release identifiers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release tag: latest validated with positive JVM golden vectors and live /transactions/check evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
    );
  });

  it('rejects ambiguous upstream signer conformance evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release v0.30.0 reviewed with JVM golden vectors evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
    );
  });

  it('rejects upstream signer resolution when required evidence is only a completed artifact target', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRowsWithSignerDecision(
        'artifact://dependency/completed-third-party-review.md',
        signerUpstreamReleaseAction,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: required evidence must link completed upstream signer release and JVM/node conformance evidence',
    );
  });

  it('rejects upstream signer resolution when release action and required evidence bind different releases', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRowsWithSignerDecision(
        'artifact://dependency/completed-upstream-signer-release-v0.30.0-jvm-node-conformance.md upstream signer release version: v0.30.0 positive JVM golden vectors and live /transactions/check evidence',
        'upstream signer release version: v0.31.0 validated with positive JVM golden vectors and live /transactions/check evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Upgrade And Pinning Decision: Signer dependency upgrade decision: release action release identifier must match required evidence release identifier',
    );
  });

  it('accepts upstream signer resolution with concrete release identifier and conformance artifacts', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      releaseNoteUpdates:
        'artifact://dependency/completed-dependency-review-release-note-evidence.md Release supported = institutional reference; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0; Upstream signer blocker resolved = yes',
      checklistUpdates:
        'artifact://dependency/completed-dependency-review-checklist-update-evidence.md Release supported = institutional reference; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0; Upstream signer blocker resolved = yes',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('rejects upstream signer resolution without a concrete release identifier', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release validated with positive JVM golden vectors and live /transactions/check evidence',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
    );
  });

  it('blocks critical or high vulnerabilities', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      criticalHigh: '1 high',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: critical/high vulnerabilities open must be 0 before dependency review evidence can pass',
    );
  });

  it('requires exact numeric zero for critical or high vulnerabilities', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      criticalHigh: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: critical/high vulnerabilities open must be 0 before dependency review evidence can pass',
    );
  });

  it('requires dependency review publication update evidence to identify release-note and checklist updates', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates: 'artifact://dependency/release-notes-update.md',
      checklistUpdates: 'artifact://dependency/checklist-update.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed dependency review release-note evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must identify completed dependency review checklist update evidence',
    );
  });

  it('rejects dependency publication update evidence kinds hidden inside longer labels', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `artifact://dependency/release-notes-update.md draft completed dependency review release-note evidence; ${failClosedDependencyPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://dependency/checklist-update.md candidate completed dependency review checklist update evidence; ${failClosedDependencyPublicationUpdateBindings}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must identify completed dependency review release-note evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must identify completed dependency review checklist update evidence',
    );
  });

  it('accepts compatibility-normalized dependency publication update evidence kinds', () => {
    const dependencyLabel = '\uFF44\uFF45\uFF50\uFF45\uFF4E\uFF44\uFF45\uFF4E\uFF43\uFF59';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `artifact://dependency/completed-release-note-update.md completed ${dependencyLabel} review release-note evidence ${failClosedDependencyPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://dependency/completed-checklist-update.md completed ${dependencyLabel} review checklist update evidence ${failClosedDependencyPublicationUpdateBindings}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('blocks dependency review publication updates that close vulnerabilities with numeric shorthand', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        'artifact://dependency/completed-dependency-review-release-note-evidence.md critical high vulnerability closure 0',
      checklistUpdates:
        'artifact://dependency/completed-dependency-review-checklist-update-evidence.md critical high vulnerability count 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high vulnerabilities open = 0; textual or shorthand critical/high vulnerability terms are not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact numeric Critical/high vulnerabilities open = 0; textual or shorthand critical/high vulnerability terms are not accepted',
    );
  });

  it('accepts exact critical/high vulnerability closure bindings in dependency publication updates', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${failClosedDependencyPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${failClosedDependencyPublicationUpdateBindings}`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact fail-closed dependency claim bindings in publication updates', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        'artifact://dependency/completed-dependency-review-release-note-evidence.md Critical/high vulnerabilities open = 0',
      checklistUpdates:
        'artifact://dependency/completed-dependency-review-checklist-update-evidence.md Critical/high vulnerabilities open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = institutional reference',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = institutional reference',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Upstream signer blocker resolved = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Upstream signer blocker resolved = no',
    );
  });

  it('rejects dependency review publication updates and reviewer summaries that keep decision placeholders', () => {
    const placeholderBindings =
      'Release supported = institutional reference/production deployment candidate; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = no/yes; Critical/high vulnerabilities open = 0/1; Upstream signer blocker resolved = no/yes';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${placeholderBindings}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${placeholderBindings}`,
      reviewerDecisionSummary:
        'Release supported = institutional reference/production deployment candidate; upstream signer blocker handling: Upstream signer blocker resolved = no/yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no/yes; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no/yes; Critical/high vulnerabilities open = 0/1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release supported = institutional reference',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release supported = institutional reference',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Critical/high vulnerabilities open = 0',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Critical/high vulnerabilities open = 0',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Upstream signer blocker resolved = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Upstream signer blocker resolved = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical/high vulnerabilities open = 0',
    );
  });

  it('rejects contradictory exact dependency decision bindings in publication updates and reviewer summaries', () => {
    const contradictoryBindings =
      `${failClosedDependencyPublicationUpdateBindings}; Release supported = production deployment candidate; ` +
      'Critical/high vulnerabilities open = 1; Upstream signer blocker resolved = yes';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${contradictoryBindings}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${contradictoryBindings}`,
      reviewerDecisionSummary:
        'Release supported = institutional reference; Release supported = production deployment candidate; ' +
        'upstream signer blocker handling: Upstream signer blocker resolved = no; Upstream signer blocker resolved = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high vulnerabilities open = 0; Critical/high vulnerabilities open = 1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory dependency decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory dependency decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory dependency decision bindings',
    );
  });

  it('blocks dependency review publication updates that reuse one completed evidence target', () => {
    const reusedPublicationUpdateTarget =
      'artifact://dependency/completed-dependency-review-publication-update-evidence.md';
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        `${reusedPublicationUpdateTarget} completed dependency review release-note evidence`,
      checklistUpdates:
        `${reusedPublicationUpdateTarget} completed dependency review checklist update evidence`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: required release-note updates and required checklist updates must use distinct completed dependency review evidence targets',
    );
  });

  it('blocks dependency review publication updates that approve mainnet or production-ready claims', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseNoteUpdates:
        'artifact://dependency/completed-dependency-review-release-note-evidence.md approves mainnet production deployment wording',
      checklistUpdates:
        'artifact://dependency/completed-dependency-review-checklist-update-evidence.md approves production-ready dependency claim wording',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('blocks completed dependency review evidence that supports no release level', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseSupported: 'none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not be none before dependency review evidence can pass',
    );
  });

  it('blocks release support above the dependency-review release level', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'validated PoC',
      releaseSupported: 'institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Release supported must not exceed Review Classification release level',
    );
  });

  it('requires production-candidate dependency reviews to carry exact release support', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate dependency review requires exact Release supported = production deployment candidate',
    );
  });

  it('blocks production deployment candidate support while the exact upstream signer blocker remains unresolved', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      upstreamResolved: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Upstream signer blocker resolved = yes',
    );
  });

  it('blocks production deployment candidate support without the exact testnet production-candidate claim binding', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      upstreamResolved: 'yes',
      testnetProductionCandidateClaim: 'no',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires production deployment candidate dependency reviews to be testnet-scoped', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'clean checkout',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: production deployment candidate requires Environment testnet',
    );
  });

  it('blocks production-ready claims without production evidence and signer resolution', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      productionClaim: 'yes',
      releaseLevel: 'institutional reference',
      upstreamResolved: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: production-ready claim requires production deployment candidate evidence');
    expect(result.errors).toContain('Publication Decision: production-ready claim requires upstream signer blocker resolved');
  });

  it('always blocks mainnet production-ready claims after signer resolution', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      releaseSupported: 'production deployment candidate',
      productionClaim: 'yes',
      upstreamResolved: 'yes',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden',
    );
  });

  it('validates the separate testnet production-candidate claim field', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      testnetProductionCandidateClaim: 'maybe',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Testnet production-candidate claim allowed must be one of yes, no',
    );
  });

  it('blocks testnet production-candidate claims while signer evidence is fail-closed', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      testnetProductionCandidateClaim: 'yes',
      releaseSupported: 'institutional reference',
      upstreamResolved: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: testnet production-candidate claim requires production deployment candidate support',
    );
    expect(result.errors).toContain(
      'Publication Decision: testnet production-candidate claim requires upstream signer blocker resolved',
    );
  });

  it('allows testnet production-candidate claims after concrete upstream signer resolution', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      upstreamResolved: 'yes',
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${resolvedCandidateDependencyPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${resolvedCandidateDependencyPublicationUpdateBindings}`,
      reviewerDecisionSummary:
        'Release supported = production deployment candidate; upstream signer blocker handling: resolved; production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high vulnerabilities open = 0',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
  });

  it('requires exact Testnet production-candidate claim allowed = yes binding in production-candidate reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      upstreamResolved: 'yes',
      reviewerDecisionSummary:
        'release supported: production deployment candidate; upstream signer blocker handling: resolved; production-ready claim handling: blocked; ' +
        'testnet production-candidate claim handling: allowed; Critical/high vulnerabilities open = 0',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact Testnet production-candidate claim allowed = no binding in fail-closed reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: blocked; testnet production-candidate claim handling: blocked; Critical/high vulnerabilities open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact Production-ready claim allowed = no binding in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact institutional-reference release support in fail-closed reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = institutional reference',
    );
  });

  it('requires exact production-candidate release support in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      releaseSupported: 'production deployment candidate',
      upstreamResolved: 'yes',
      testnetProductionCandidateClaim: 'yes',
      releaseNoteUpdates:
        `artifact://dependency/completed-dependency-review-release-note-evidence.md ${resolvedCandidateDependencyPublicationUpdateBindings}`,
      checklistUpdates:
        `artifact://dependency/completed-dependency-review-checklist-update-evidence.md ${resolvedCandidateDependencyPublicationUpdateBindings}`,
      reviewerDecisionSummary:
        'release supported: production deployment candidate; upstream signer blocker handling: Upstream signer blocker resolved = yes; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes; Critical/high vulnerabilities open = 0',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('blocks reviewer decision summaries that contradict dependency testnet claim handling', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      testnetProductionCandidateClaim: 'no',
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: allowed; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('requires explicit testnet production-candidate claim handling in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('requires exact release-supported wording in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('requires explicit production-ready claim handling in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claims blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('requires explicit testnet production-candidate claim handling when plural claim shorthand is used', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claims blocked; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in dependency summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim allowed: no; testnet production-candidate claim handling: blocked; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in dependency summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim allowed: no; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('blocks reviewer decision summaries that leave critical or high vulnerabilities open', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open 1',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high vulnerabilities must be numeric 0',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting remediation'],
    ['waiting', 'waiting for remediation'],
    ['deferred', 'deferred to reviewer follow-up'],
  ])('blocks reviewer decision summaries with exact closed vulnerabilities plus %s critical/high vulnerability prose', (
    _label,
    blockerState,
  ) => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        `Critical/high vulnerabilities open = 0; critical/high vulnerabilities ${blockerState}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave critical/high vulnerabilities open',
    );
  });

  it('blocks reviewer decision summaries with exact closed vulnerabilities plus nonzero critical/high vulnerability count', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high vulnerabilities open = 0; critical/high vulnerabilities count 1 unresolved',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave critical/high vulnerabilities open',
    );
  });

  it('blocks reviewer decision summaries that close vulnerabilities with textual zero-like terms', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open none',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high vulnerabilities must be numeric 0',
    );
  });

  it('requires exact critical/high vulnerabilities open wording in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities = 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: critical/high vulnerabilities must be numeric 0',
    );
  });

  it('requires exact Critical/high vulnerabilities open = 0 binding in reviewer decision summaries', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release supported: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open 0',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Critical/high vulnerabilities open = 0',
    );
  });

  it('blocks reviewer decision summaries that approve dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open 0; reviewer supports unresolved upstream signer blocker; reviewer allows open high vulnerabilities; reviewer supports candidate support with fail-closed signer blocker',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high vulnerabilities',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve fail-closed signer blocker as candidate support',
    );
  });

  it('blocks reviewer decision summaries that endorse dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'release support: institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical/high vulnerabilities open 0; reviewer certifies unresolved upstream signer blocker; reviewer recommends open high vulnerabilities; reviewer accredits candidate support with fail-closed signer blocker',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high vulnerabilities',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve fail-closed signer blocker as candidate support',
    );
  });

  it('blocks compatibility-normalized reviewer text that approves dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high vulnerabilities open = 0; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 unresolved upstream signer blocker; ' +
        'reviewer \uFF41\uFF4C\uFF4C\uFF4F\uFF57\uFF53 open high vulnerabilities; ' +
        'reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 candidate support with fail-closed signer blocker',
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 unresolved upstream signer blocker |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer \uFF41\uFF4C\uFF4C\uFF4F\uFF57\uFF53 open high vulnerabilities |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve open critical/high vulnerabilities',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not approve fail-closed signer blocker as candidate support',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
  });

  it('allows reviewer decision summaries that explicitly deny dependency blocker approval', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary:
        'Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
        'Critical/high vulnerabilities open = 0; reviewer approved no unresolved upstream signer blocker; ' +
        'reviewer approved no open critical/high vulnerabilities; open high vulnerabilities not approved; ' +
        'reviewer approved without open critical/high vulnerabilities; fail-closed signer blocker not approved for candidate support',
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('blocks production deployment candidate support in Publication Decision when environment is not testnet', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'staging',
      releaseSupported: 'production deployment candidate',
      testnetProductionCandidateClaim: 'yes',
      upstreamResolved: 'yes',
      upgrades: upgradeRowsWithSignerDecision(signerUpstreamRequiredEvidence, signerUpstreamReleaseAction),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires exact Review Classification Environment = testnet',
    );
  });

  it('requires upstream signer resolution to cite upstream release and JVM conformance evidence', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
    );
  });

  it('rejects upstream signer resolution when conformance evidence is described as missing', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release available; JVM conformance evidence missing; live /transactions/check not validated',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
    );
  });

  it('rejects upstream signer resolution when conformance evidence is only partially or not-yet validated', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      upstreamResolved: 'yes',
      upgrades: upgradeRows.replace(
        'keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/context-extension-guard-evidence.md',
        'upstream signer release v1.2.3 available; JVM/node conformance not fully validated; live /transactions/check not yet verified; guard evidence artifact://dependency/context-extension-guard-evidence.md',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
    );
  });

  it('requires reviewer decision summary to bound dependency release claims', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewerDecisionSummary: 'dependency risk reviewed for institutional reference',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  });

  it('requires reviewer sign-off decisions', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: '| Dependency reviewer | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Dependency reviewer: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Dependency reviewer: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Dependency reviewer: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Dependency reviewer: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Dependency reviewer | reviewer-a | block | 2026-05-14 | critical dependency risk blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: decision must be approve before dependency review evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Maintainer | reviewer-a | approve | May 14 2026 | dependency risk accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Maintainer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the review classification date', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-13 | dependency risk accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: Date must not be before Review Classification Date',
    );
  });

  it('requires reviewer notes to state concrete dependency-risk outcomes', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed dependency evidence |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete dependency-risk outcome',
    );
  });

  it('rejects reviewer notes with contradictory dependency failure markers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory dependency failure markers',
    );
  });

  it('rejects reviewer notes that approve unresolved dependency release blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; unresolved upstream signer blocker approved for testnet production-candidate support |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; open high vulnerability accepted for release |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; production-ready dependency wording approved for publication |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve production-ready claim wording',
    );
  });

  it.each([
    ['pending', 'pending reviewer follow-up'],
    ['awaiting', 'awaiting remediation'],
    ['waiting', 'waiting for remediation'],
    ['deferred', 'deferred to reviewer follow-up'],
  ])('rejects reviewer notes that leave critical/high vulnerabilities %s', (_label, blockerState) => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; critical/high vulnerabilities ${blockerState} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not leave critical/high vulnerabilities open',
    );
  });

  it('rejects reviewer notes that approve dependency blockers with active verbs', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk guarded; reviewer supports unresolved upstream signer blocker |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk validated; reviewer allows open high vulnerabilities |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
  });

  it('rejects reviewer notes that use grant-family approvals for dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk guarded; reviewer grants unresolved upstream signer blocker |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk validated; reviewer granted open high vulnerabilities |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk guarded; production-ready dependency wording granted for publication |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Maintainer: notes must not approve production-ready claim wording',
    );
  });

  it('allows reviewer notes that explicitly deny dependency blocker approval', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved no unresolved upstream signer blocker |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved no open critical/high vulnerabilities; open high vulnerabilities not approved; reviewer approved without open critical/high vulnerabilities |',
        )
        .replace(
          '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Maintainer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; fail-closed signer blocker not approved for candidate support |',
        ),
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve absence of dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved absence of unresolved upstream signer blocker |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved absence of open critical/high vulnerabilities |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve lack of dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; lack of unresolved upstream signer blocker approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved lack of open critical/high vulnerabilities |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve lacking dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; lacking unresolved upstream signer blocker approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved lacking open critical/high vulnerabilities |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
    expect(result.status).toBe('PASS');
  });

  it('allows reviewer notes that approve evidence lacks dependency blockers', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; evidence lacks unresolved upstream signer blocker approved by reviewer |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; reviewer approved evidence lacks open critical/high vulnerabilities |',
        ),
    }));

    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not approve unresolved signer blockers',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not approve open critical/high vulnerabilities',
    );
    expect(result.status).toBe('PASS');
  });

  it('rejects reviewer notes that contain forbidden dependency claim wording', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows
        .replace(
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; production-ready release wording observed |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted; mainnet production release wording observed |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it('requires dependency reviewer sign-off to match the review classification identity', () => {
    const result = validateDependencyReviewEvidence(dependencyEvidence({
      reviewers: reviewerRows.replace(
        '| Dependency reviewer | reviewer-a | approve | 2026-05-14 | dependency risk accepted |',
        '| Dependency reviewer | reviewer-b | approve | 2026-05-14 | dependency risk accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Dependency reviewer: name must match Review Classification Reviewer',
    );
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
