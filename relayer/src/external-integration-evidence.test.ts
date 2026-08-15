import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import {
  hasCompletedExternalIntegrationChecklistUpdateEvidence,
  hasCompletedExternalIntegrationReleaseNoteUpdateEvidence,
  parseEntryPointRows,
  parseFreshCheckoutCommandRows,
  validateExternalIntegrationEvidence,
} from './external-integration-evidence.js';

const entryPointRows = [
  ['README', 'Starts with status, blockers, and safe next steps', '[README](../README.md)'],
  ['Objective', 'Explains quality bar and publication gates', '[Ultimate Bridge Objective](ultimate-bridge-objective.md)'],
  ['Roadmap', 'Shows tracks, blockers, and current level', '[Ultimate Bridge Roadmap](ultimate-bridge-roadmap.md)'],
  ['Release checklist', 'Lists gates and pending evidence', '[Institutional Release Checklist](release-checklist.md)'],
  ['Contract/API reference', 'Maps contract registers and invariants', '[Contract And Relayer API Reference](contract-relayer-api-reference.md)'],
  ['Integration checklist', 'Lists configuration decisions and stop conditions', '[EVM Sidechain Integration Checklist](evm-integration-checklist.md)'],
  ['Developer walkthrough', 'Can be followed from a fresh checkout', '[Sidechain on Ergo in One Afternoon](sidechain-on-ergo-in-one-afternoon.md)'],
  ['Showcase', 'Explains proof objects, batching, lanes, and finality', '[EVM Developer Showcase](evm-developer-showcase.md)'],
  ['Runbooks', 'Cover deploy, monitor, pause, recover, rotate, rollback', '[Operator Runbooks](operator-runbooks.md)'],
].map(row =>
  `| ${row[0]} | ${row[1]} | ${row[2]}; artifact://integration/${integrationSlug(row[0])}-entrypoint-review.md completed entry-point review without private context | linked |`,
).join('\n');

const freshCheckoutRows = [
  'npm ci',
  'npm run check',
  'npm run wasm:test',
  'npm run showcase',
].map(command =>
  `| ${command} | artifact://integration/${integrationSlug(command)}.log ${command} fresh checkout commit abc1234 command output captured exit code 0 | linked |`,
).join('\n');

const decisionRows = [
  ['Which trust model applies today?', 'single signer / committee / trustless proof path'],
  ['Which signer path is allowed?', 'Local WASM signer; node-wallet signing is not production path'],
  ['How is broadcast enabled?', 'BRIDGE_BROADCAST_ENABLED=true only after readiness review'],
  ['Which path is still trusted-oracle?', 'Burn interpretation remains trusted-oracle until Phase 011 evidence'],
  ['Which sidechain commitment format is expected?', '0x04xx roadmap and current patched-devnet limit'],
  ['How are duplicate burns rejected?', 'DUP AVL proof and confirmation-time reconciliation'],
  ['How are batches bounded?', 'claim-core, context-extension, and unlock cap limits'],
  [
    'Which contract and relayer assumptions are stable?',
    'Contract/API reference maps registers, Var slots, transaction shapes, and integration invariants',
  ],
  ['What blocks scaling claims?', 'Missing completed benchmark evidence and live sharded settlement'],
  ['How is recovery performed?', 'Runbooks plus SQLite/AVL restore evidence'],
].map(([decision, requiredAnswer]) =>
  `| ${decision} | ${requiredAnswer} | artifact://integration/${integrationSlug(decision)}.md | linked |`,
).join('\n');

const explicitMainnetReadinessCorrection =
  'Mainnet production-ready/readiness claims remain forbidden/out of scope; only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence.';
const ambiguousMainnetReadinessCorrection = 'Mainnet needs production deployment candidate gates.';

const negativeRows = [
  ['The bridge is production-ready today', 'Blocked by release checklist and pending evidence.'],
  [
    'Testnet or patched-devnet success implies mainnet readiness',
    explicitMainnetReadinessCorrection,
  ],
  [
    'Node-wallet signing is acceptable for production',
    'Production path uses local WASM signing and blocks node-wallet signing.',
  ],
  ['Broadcast can happen implicitly', 'Broadcast requires explicit opt-in and readiness review.'],
  ['Current burn verification is trustless', 'Trustless burn verification remains Phase 011 evidence.'],
  ['FROST is the current committee implementation', 'Phase 010a uses atLeast(); FROST is deferred.'],
  [
    'Sharded lanes already prove full L1 parallel settlement',
    'SPVTracker remains a shared input until pre-ingest or tracker sharding.',
  ],
  [
    'Offline showcase output is live benchmark evidence',
    'Live lifecycle and benchmark evidence must be linked separately.',
  ],
].map(row => `| ${row[0]} | ${row[1]} | artifact://integration/${integrationSlug(row[0])}.md | linked |`).join('\n');

const reviewerRows = [
  'Integration reviewer',
  'Security reviewer',
  'Operator reviewer',
].map(role => `| ${role} | reviewer-a | approve | 2026-05-14 | external integration package accepted |`).join('\n');

const gate8ReleaseNoteUpdateEvidence =
  'artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence';
const gate8ChecklistUpdateEvidence =
  'artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence';
const gate8PrivateContextBinding = 'Private maintainer context used = no';
const gate8PublicReleaseBinding = 'Public institutional-reference release allowed = yes';
const gate8ProductionReadyDeniedBinding = 'Production-ready claim allowed = no';
const gate8ReleaseSupportedProductionCandidateBinding = 'Release supported = production deployment candidate';
const gate8TestnetCandidateAllowedBinding = 'Testnet production-candidate claim allowed = yes';
const gate8TestnetCandidateDeniedBinding = 'Testnet production-candidate claim allowed = no';
const gate8ReleaseNoteUpdateEvidenceWithPublicRelease =
  `${gate8ReleaseNoteUpdateEvidence} ${gate8PublicReleaseBinding}`;
const gate8ChecklistUpdateEvidenceWithPublicRelease =
  `${gate8ChecklistUpdateEvidence} ${gate8PublicReleaseBinding}`;
const gate8ReleaseNoteUpdateEvidenceWithRequiredBindings =
  `${gate8ReleaseNoteUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateDeniedBinding}`;
const gate8ChecklistUpdateEvidenceWithRequiredBindings =
  `${gate8ChecklistUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateDeniedBinding}`;

const publicationRows = [
  ['Public institutional-reference release allowed', 'yes'],
  ['Production-ready claim allowed', 'no'],
  ['Testnet production-candidate claim allowed', 'no'],
  ['Private maintainer context used', 'no'],
  ['Release notes updated', 'yes'],
  [
    'Required release-note updates',
    gate8ReleaseNoteUpdateEvidenceWithRequiredBindings,
  ],
  [
    'Required checklist updates',
    gate8ChecklistUpdateEvidenceWithRequiredBindings,
  ],
  [
    'Reviewer decision summary',
    'public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no',
  ],
].map(row => `| ${row[0]} | ${row[1]} |`).join('\n');

const templateOnlyEvidence = '[External Integration Review Template](external-integration-review-template.md), `npm run integration:validate`';

function integrationSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function integrationEvidence(overrides: {
  entryPoints?: string;
  freshCheckout?: string;
  decisions?: string;
  negatives?: string;
  reviewers?: string;
  releaseLevel?: string;
  reviewerType?: string;
  reviewerOrganization?: string;
  leadReviewer?: string;
  environment?: string;
  broadcastMode?: string;
  privateMaintainerContextUsed?: string;
  publicationRules?: string;
} = {}): string {
  return `
# Completed External Integration Review

## Review Classification

| Field | Value |
|---|---|
| Review name | integration review |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Reviewer type | ${overrides.reviewerType ?? 'exchange integration engineer'} |
| Reviewer organization | ${overrides.reviewerOrganization ?? 'external exchange engineering desk'} |
| Lead reviewer | ${overrides.leadReviewer ?? 'reviewer-a'} |
| Environment used | ${overrides.environment ?? 'clean checkout'} |
| Broadcast mode | ${overrides.broadcastMode ?? 'disabled'} |
| Private maintainer context used | ${overrides.privateMaintainerContextUsed ?? 'no'} |
| Date | 2026-05-14 |

## Required Entry Points

| Entry point | Required check | Evidence | Status |
|---|---|---|---|
${overrides.entryPoints ?? entryPointRows}

## Fresh Checkout Commands

\`\`\`powershell
npm ci
npm run check
npm run wasm:test
npm run showcase
\`\`\`

Command output: artifact://integration/fresh-checkout-commands.log

| Command | Evidence | Status |
|---|---|---|
${overrides.freshCheckout ?? freshCheckoutRows}

## Integration Decision Record

| Decision | Required answer | Evidence | Status |
|---|---|---|---|
${overrides.decisions ?? decisionRows}

## Negative Review Checks

| Misread | Expected correction | Evidence | Status |
|---|---|---|---|
${overrides.negatives ?? negativeRows}

## Publication Rules

| Field | Value |
|---|---|
${overrides.publicationRules ?? publicationRows}

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.reviewers ?? reviewerRows}
`;
}

describe('external integration evidence validation', () => {
  it('parses required entry point rows', () => {
    const rows = parseEntryPointRows(integrationEvidence());

    expect(rows[0]).toMatchObject({
      entryPoint: 'README',
      status: 'linked',
    });
  });

  it('parses per-command fresh-checkout evidence rows', () => {
    const rows = parseFreshCheckoutCommandRows(integrationEvidence());

    expect(rows[2]).toMatchObject({
      command: 'npm run wasm:test',
      status: 'linked',
    });
  });

  it('passes when integration review evidence is fully structured', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence());

    expect(result.status).toBe('PASS');
    expect(result.entryPointRows).toHaveLength(9);
    expect(result.freshCheckoutRows).toHaveLength(4);
    expect(result.classification).toMatchObject({
      releaseLevel: 'institutional reference',
      reviewerType: 'exchange integration engineer',
      reviewerOrganization: 'external exchange engineering desk',
      gitCommit: 'abc1234',
      environmentUsed: 'clean checkout',
      broadcastMode: 'disabled',
      privateMaintainerContextUsed: 'no',
      leadReviewer: 'reviewer-a',
      date: '2026-05-14',
    });
    expect(result.publicationDecision).toMatchObject({
      publicInstitutionalReferenceReleaseAllowed: 'yes',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
      privateMaintainerContextUsed: 'no',
      releaseNotesUpdated: 'yes',
    });
    expect(result.message).toContain('9 entry points');
    expect(result.message).toContain('4 fresh-checkout commands');
  });

  it('prints integration claim and release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-external-integration-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run integration:validate');
    expect(result.stdout).toContain('completed External Integration Review Markdown');
    expect(result.stdout).toContain('release:gate -- --integration-evidence');
    expect(result.stdout).toContain('integration validation target');
    expect(result.stdout).toContain('command-specific integration command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('A standalone PASS does not authorize public claims');
    expect(result.stdout).toContain('Public institutional-reference or testnet production-candidate wording requires release:gate PASS');
    expect(result.stdout).toContain('Structural issues = 0');
    expect(result.stdout).toContain('Public institutional-reference release allowed = yes');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain(
      'Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews',
    );
    expect(result.stdout).toContain('Private maintainer context used = no');
    expect(result.stdout).toContain('Release notes updated = yes');
    expect(result.stdout).not.toContain('zero structural issues');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('rejects validator target bindings as linked integration row evidence', () => {
    const validationTargetEvidence =
      '[integration validation target](artifact://integration/completed-external-integration-review.md)';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        `${validationTargetEvidence} completed entry-point review without private context`,
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-ci.log npm ci fresh checkout commit abc1234 command output captured exit code 0',
        `${validationTargetEvidence} npm ci fresh checkout commit abc1234 command output captured exit code 0`,
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        `${validationTargetEvidence} completed integration decision evidence`,
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        `${validationTargetEvidence} completed negative review correction evidence`,
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence',
          '[integration validation target](artifact://integration/completed-gate-8-integration-release-note-update-evidence.md) completed Gate 8 integration release-note update evidence',
        )
        .replace(
          'artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence',
          '[integration validation target](artifact://integration/completed-gate-8-integration-checklist-update-evidence.md) completed Gate 8 checklist update evidence',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm ci: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('accepts concrete integration evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://integration/validation/integration-validate-input.md';
    const validationTargetBinding = `integration validation target ${validationTarget}`;
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        `[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; ${validationTargetBinding}`,
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-ci.log npm ci fresh checkout commit abc1234 command output captured exit code 0',
        `artifact://integration/npm-ci.log npm ci fresh checkout commit abc1234 command output captured exit code 0; ${validationTargetBinding}`,
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        `artifact://integration/which-trust-model-applies-today.md; ${validationTargetBinding}`,
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        `artifact://integration/the-bridge-is-production-ready-today.md; ${validationTargetBinding}`,
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence',
          `artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence; ${validationTargetBinding}`,
        )
        .replace(
          'artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence',
          `artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence; ${validationTargetBinding}`,
        ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires integration review dates to use ISO calendar format', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace('| Date | 2026-05-14 |', '| Date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Date must use YYYY-MM-DD');
  });

  it('requires integration review Git commits to use commit SHA format', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects duplicate integration review classification fields', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Git commit: duplicate required field');
  });

  it('blocks pending entry points before Gate 8 evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: '| README | Starts with status | [README](../README.md) | pending |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Entry Points: Objective: missing required row');
    expect(result.errors).toContain('Required Entry Points: README: status must be linked before Gate 8 evidence can pass');
  });

  it('requires completed entry-point review evidence beyond the entrypoint document link', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        '[README](../README.md)',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
  });

  it('rejects generic entry-point artifacts that do not identify entry-point review without private context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        'artifact://integration/reviewed.log',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
  });

  it('rejects duplicate required external-integration rows', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: `${entryPointRows}\n| README | Starts with status, blockers, and safe next steps | [README](../README.md) | linked |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Entry Points: README: duplicate required row');
  });

  it('blocks linked decisions without evidence markers', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      decisions: '| Which signer path is allowed? | Local WASM signer | | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Integration Decision Record: Which trust model applies today?: missing required row');
    expect(result.errors).toContain('Integration Decision Record: Which signer path is allowed?: linked status requires evidence');
  });

  it('requires fresh-checkout command output evidence', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence()
        .replace('npm run wasm:test\n', '')
        .replace('Command output: artifact://integration/fresh-checkout-commands.log\n', '')
        .replace('| npm run wasm:test | artifact://integration/npm-run-wasm-test.log npm run wasm:test fresh checkout commit abc1234 command output captured exit code 0 | linked |\n', ''),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Fresh Checkout Commands: missing required command npm run wasm:test');
    expect(result.errors).toContain('Fresh Checkout Commands: npm run wasm:test: missing required row');
  });

  it('requires fresh-checkout evidence to identify each command output', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run wasm:test | artifact://integration/npm-run-wasm-test.log npm run wasm:test fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run wasm:test | artifact://integration/fresh-checkout-commands.log shared fresh checkout commit abc1234 command output captured exit code 0 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run wasm:test: evidence must identify npm run wasm:test output',
    );
  });

  it('requires fresh-checkout linked rows to contain completed evidence markers', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run showcase | artifact://integration/npm-run-showcase.log npm run showcase fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run showcase | npm run showcase reviewed fresh checkout commit abc1234 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run showcase: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
  });

  it('rejects targetless fresh-checkout command output evidence', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
  });

  it('blocks pending fresh-checkout command rows before Gate 8 evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured | pending |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: status must be linked before Gate 8 evidence can pass',
    );
  });

  it('requires fresh-checkout command evidence to state exit code 0 output', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must include command output with exit code 0',
    );
  });

  it('requires fresh-checkout command evidence to include explicit exit code 0 output', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured success | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must include command output with exit code 0',
    );
  });

  it('rejects fresh-checkout command evidence that keeps an exit-code placeholder', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0/1 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must include command output with exit code 0',
    );
  });

  it('rejects contradictory fresh-checkout command PASS output', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must contain internally positive command output with exit code 0',
    );
  });

  it('rejects contradictory linked integration row evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context validation BLOCKED with 1 structural issue',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/which-trust-model-applies-today.md ERROR validation failed',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/the-bridge-is-production-ready-today.md status FAILED',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must not include contradictory external-integration failure markers',
    );
  });

  it('rejects linked external-integration evidence with compatibility-normalized failure markers', () => {
    const normalizedFailure = 'command output: PASS exit code 0 validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        `artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; ${normalizedFailure}`,
      ),
      freshCheckout: freshCheckoutRows.replace(
        'npm run check fresh checkout commit abc1234 command output captured exit code 0',
        'npm run check fresh checkout commit abc1234 command output captured exit code 0; validation\uFF1A\uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        `artifact://integration/which-trust-model-applies-today.md ${normalizedFailure}`,
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        `artifact://integration/the-bridge-is-production-ready-today.md ${normalizedFailure}`,
      ),
      publicationRules: publicationRows
        .replace(
          gate8ReleaseNoteUpdateEvidence,
          `${gate8ReleaseNoteUpdateEvidence} ${normalizedFailure}`,
        )
        .replace(
          gate8ChecklistUpdateEvidence,
          `${gate8ChecklistUpdateEvidence} ${normalizedFailure}`,
        ),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; ${normalizedFailure} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory external-integration failure markers',
    );
  });

  it('rejects linked external-integration evidence with structured failure fields', () => {
    const emptyStructuredFields = validateExternalIntegrationEvidence(integrationEvidence({
      freshCheckout: freshCheckoutRows.replace(
        'npm run check fresh checkout commit abc1234 command output captured exit code 0',
        'npm run check fresh checkout commit abc1234 command output captured exit code 0; {"errors":[]} errorCount: 0',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; {"errors":["entry point gap"]}',
      ),
      freshCheckout: freshCheckoutRows.replace(
        'npm run check fresh checkout commit abc1234 command output captured exit code 0',
        'npm run check fresh checkout commit abc1234 command output captured exit code 0; errorCount: 1',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/which-trust-model-applies-today.md {"failures":{"trust-model":"blocked"}}',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/the-bridge-is-production-ready-today.md failureTotal: 1',
      ),
      publicationRules: publicationRows
        .replace(
          gate8ReleaseNoteUpdateEvidence,
          `${gate8ReleaseNoteUpdateEvidence} {"errors":["release-note gap"]}`,
        )
        .replace(
          gate8ChecklistUpdateEvidence,
          `${gate8ChecklistUpdateEvidence} {"failures":{"checklist":"blocked"}}`,
        ),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; errorCount: 1 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must contain internally positive command output with exit code 0',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory external-integration failure markers',
    );
  });

  it('rejects linked external-integration evidence with remaining issue markers', () => {
    const remainingIssues = 'command output: PASS exit code 0; Remaining issues: follow-up item pending';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        `artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; ${remainingIssues}`,
      ),
      freshCheckout: freshCheckoutRows.replace(
        'npm run check fresh checkout commit abc1234 command output captured exit code 0',
        `npm run check fresh checkout commit abc1234 command output captured exit code 0; Remaining issues: follow-up item pending`,
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        `artifact://integration/which-trust-model-applies-today.md ${remainingIssues}`,
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        `artifact://integration/the-bridge-is-production-ready-today.md ${remainingIssues}`,
      ),
      publicationRules: publicationRows
        .replace(
          gate8ReleaseNoteUpdateEvidence,
          `${gate8ReleaseNoteUpdateEvidence} ${remainingIssues}`,
        )
        .replace(
          gate8ChecklistUpdateEvidence,
          `${gate8ChecklistUpdateEvidence} ${remainingIssues}`,
        ),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        `| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; ${remainingIssues} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory external-integration failure markers',
    );
  });

  it('rejects linked external-integration evidence with open or known issue markers', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; Open issues: unresolved entrypoint blocker',
      ),
      freshCheckout: freshCheckoutRows.replace(
        'npm run check fresh checkout commit abc1234 command output captured exit code 0',
        'npm run check fresh checkout commit abc1234 command output captured exit code 0; Known issues: unresolved checkout blocker',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/which-trust-model-applies-today.md command output: PASS exit code 0; Open issues: unresolved decision blocker',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/the-bridge-is-production-ready-today.md command output: PASS exit code 0; Known issues: unresolved negative-check blocker',
      ),
      publicationRules: publicationRows
        .replace(
          gate8ReleaseNoteUpdateEvidence,
          `${gate8ReleaseNoteUpdateEvidence} Open issues: unresolved release-note blocker`,
        )
        .replace(
          gate8ChecklistUpdateEvidence,
          `${gate8ChecklistUpdateEvidence} Known issues: unresolved checklist blocker`,
        ),
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; Open issues: unresolved reviewer blocker |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory external-integration failure markers',
    );
  });

  it('rejects linked external-integration evidence with zero issue closures plus nonzero unresolved counts', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        'artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; Open issues: 0; issue count 1 unresolved',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not include contradictory external-integration failure markers',
    );
  });

  it('requires fresh-checkout command evidence to identify clean checkout context', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check command output captured exit code 0 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must identify fresh checkout or clean checkout context',
    );
  });

  it('requires fresh-checkout command evidence to identify the reviewed commit', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout command output captured exit code 0 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must identify the fresh checkout Git commit',
    );
  });

  it('requires fresh-checkout command evidence to match the review classification commit', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0 | linked |',
        '| npm run check | artifact://integration/npm-run-check.log npm run check fresh checkout commit def5678 command output captured exit code 0 | linked |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must match Review Classification Git commit abc1234',
    );
  });

  it('rejects generic integration decision answers', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      decisions: decisionRows.replace(
        '| Which trust model applies today? | single signer / committee / trustless proof path | artifact://integration/which-trust-model-applies-today.md | linked |',
        '| Which trust model applies today? | documented answer | artifact://integration/which-trust-model-applies-today.md | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: required answer must state single signer, committee, trustless proof path, or the current trust model',
    );
  });

  it('requires integration decision evidence to identify each decision category', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      decisions: decisionRows
        .replace(
          'artifact://integration/which-signer-path-is-allowed.md',
          'artifact://integration/reviewed.md',
        )
        .replace(
          'artifact://integration/how-is-recovery-performed.md',
          'artifact://integration/reviewed.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Integration Decision Record: Which signer path is allowed?: evidence must identify signer-path decision evidence',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: How is recovery performed?: evidence must identify recovery decision evidence',
    );
  });

  it('blocks linked rows backed only by templates or bare validator commands', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        templateOnlyEvidence,
      ),
      decisions: decisionRows.replace('artifact://integration/which-trust-model-applies-today.md', templateOnlyEvidence),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        templateOnlyEvidence,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
  });

  it('blocks targetless command-output notes on linked review evidence rows', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        '[README](../README.md); completed entry-point review without private context npm run integration:validate command output: PASS',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'trust-model decision evidence npm run integration:validate command output: PASS',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'production-readiness blocker correction npm run integration:validate command output: PASS',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
  });

  it('blocks linked integration evidence rows that admit private maintainer context', () => {
    const privateContext = 'private maintainer context used: yes';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        `[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context; ${privateContext}`,
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0',
        `artifact://integration/npm-run-check.log npm run check fresh checkout commit abc1234 command output captured exit code 0; ${privateContext}`,
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        `artifact://integration/which-trust-model-applies-today.md; ${privateContext}`,
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        `artifact://integration/the-bridge-is-production-ready-today.md; ${privateContext}`,
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence',
          `artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence; ${privateContext}`,
        )
        .replace(
          'artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence',
          `artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence; ${privateContext}`,
        ),
      reviewers: reviewerRows.replace(
        'external integration package accepted',
        `external integration package accepted; ${privateContext}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('requires exact private-context binding in reviewer decision summaries that mention private context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        'public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no',
        'public institutional-reference release allowed = yes; production-ready claim handling: blocked; ' +
          'testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; ' +
          'private maintainer context absent',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Private maintainer context used = no',
    );
  });

  it('rejects targetless artifact markers on linked integration evidence rows', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        'artifact://',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact:// completed trust-model decision evidence',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact:// ',
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md',
          'artifact:// completed',
        )
        .replace(
          'artifact://integration/gate-8-checklist.md',
          'artifact:// ',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects row-named generic artifact targets for linked integration evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        'artifact://integration/generic-readme-entrypoint-review.md',
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-run-check.log',
        'artifact://integration/generic-npm-run-check.log',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/generic-which-trust-model-applies-today.md',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/generic-the-bridge-is-production-ready-today.md',
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md',
          'artifact://integration/generic-gate-8-release-notes.md',
        )
        .replace(
          'artifact://integration/gate-8-checklist.md',
          'artifact://integration/generic-gate-8-checklist.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects row-named sample integration artifact targets for linked integration evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        'artifact://integration/sample-integration-entrypoint-readme.md',
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-run-check.log',
        'artifact://integration/sample-fresh-checkout-npm-run-check.log',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/sample-integration-decision-which-trust-model-applies-today.md',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/sample-negative-review-the-bridge-is-production-ready-today.md',
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md',
          'artifact://integration/sample-release-note-update-gate-8-release-notes.md',
        )
        .replace(
          'artifact://integration/gate-8-checklist.md',
          'artifact://integration/sample-checklist-update-gate-8-checklist.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects claim-escalating artifact targets for linked integration evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        'artifact://integration/readme-entrypoint-review-testnet-production-candidate-approved.md',
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-run-check.log',
        'artifact://integration/npm-run-check-production-ready-wording-approved.log',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/which-trust-model-applies-today-mainnet-production-certified.md',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/the-bridge-is-production-ready-today-production-ready-claim-approved.md',
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md',
          'artifact://integration/completed-gate-8-integration-release-note-update-evidence-mainnet-production-certified.md',
        )
        .replace(
          'artifact://integration/gate-8-checklist.md',
          'artifact://integration/completed-gate-8-checklist-update-evidence-production-ready-claim-approved.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete artifact targets for linked integration evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        'artifact://integration/placeholder-readme-entrypoint-review.md',
      ),
      freshCheckout: freshCheckoutRows.replace(
        'artifact://integration/npm-run-check.log',
        'artifact://integration/todo-npm-run-check.log',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/tbd-which-trust-model-applies-today.md',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        'artifact://integration/sample-evidence-the-bridge-is-production-ready-today.md',
      ),
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md',
          'artifact://integration/example-evidence-gate-8-release-notes.md',
        )
        .replace(
          'artifact://integration/gate-8-checklist.md',
          'artifact://integration/placeholder-gate-8-checklist.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Fresh Checkout Commands: npm run check: linked status requires an artifact marker or non-template evidence link for completed command output',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects non-concrete markdown evidence link targets for linked integration evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        '[README](../README.md); [entry-point review evidence](../evidence/integration/placeholder-readme-entrypoint-review.md) completed entry-point review without private context',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        '[trust model decision evidence](../evidence/integration/todo-which-trust-model-applies-today.md)',
      ),
      negatives: negativeRows.replace(
        'artifact://integration/the-bridge-is-production-ready-today.md',
        '[production-readiness blocker correction evidence](../evidence/integration/example-evidence-the-bridge-is-production-ready-today.md)',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
    );
    expect(result.errors).toContain(
      'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
    );
  });

  it.each([
    'artifact://integration/fixture-readme-entrypoint-review.md',
    'artifact://integration/mock-readme-entrypoint-review.md',
    'artifact://integration/dummy-readme-entrypoint-review.md',
    'artifact://integration/fake-readme-entrypoint-review.md',
    'artifact://integration/stub-readme-entrypoint-review.md',
    'artifact://integration/testdata-readme-entrypoint-review.md',
    'artifact://integration/synthetic-readme-entrypoint-review.md',
    'artifact://integration/simulated-readme-entrypoint-review.md',
  ])('rejects fixture-style artifact marker %s for linked integration evidence', artifactTarget => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        artifactTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
  });

  it.each([
    '[fixture](artifact://integration/fixture-readme-entrypoint-review.md)',
    '[mock](artifact://integration/mock-readme-entrypoint-review.md)',
    '[dummy](artifact://integration/dummy-readme-entrypoint-review.md)',
    '[fake](artifact://integration/fake-readme-entrypoint-review.md)',
    '[stub](artifact://integration/stub-readme-entrypoint-review.md)',
    '[testdata](artifact://integration/testdata-readme-entrypoint-review.md)',
    '[synthetic](artifact://integration/synthetic-readme-entrypoint-review.md)',
    '[simulated](artifact://integration/simulated-readme-entrypoint-review.md)',
  ])('rejects fixture-style Markdown link %s for linked integration evidence', markdownTarget => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
        `[README](../README.md); ${markdownTarget} completed entry-point review without private context`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
    );
  });

  it.each([
    {
      variant: 'raw',
      tmpReviewTarget: ['', 'tmp', 'external-integration-review.log'].join('/'),
      driveFreshCheckoutTarget: ['C:', 'tmp', 'npm-run-check.log'].join('/'),
      homeDecisionTarget: ['', 'home', 'operator', 'trust-model-evidence.md'].join('/'),
      varNegativeTarget: ['', 'var', 'bridge', 'production-ready-correction-evidence.md'].join('/'),
      fileReleaseNoteTarget: ['file:', '', '', 'C:', 'tmp', 'gate-8-release-note-evidence.md'].join('/'),
      uncChecklistTarget: ['', '', 'share-name', 'gate-8-checklist-evidence.md'].join('/'),
    },
    {
      variant: 'encoded',
      tmpReviewTarget: '%2Ftmp%2Fexternal-integration-review.log',
      driveFreshCheckoutTarget: 'C%3A%2Ftmp%2Fnpm-run-check.log',
      homeDecisionTarget: '%2Fhome%2Foperator%2Ftrust-model-evidence.md',
      varNegativeTarget: '%2Fvar%2Fbridge%2Fproduction-ready-correction-evidence.md',
      fileReleaseNoteTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-8-release-note-evidence.md',
      uncChecklistTarget: '%2F%2Fshare-name%2Fgate-8-checklist-evidence.md',
    },
    {
      variant: 'embedded encoded',
      tmpReviewTarget: 'artifact://integration/sourceTarget=%2Ftmp%2Fexternal-integration-review.log',
      driveFreshCheckoutTarget: 'artifact://integration/sourceTarget=C%3A%2Ftmp%2Fnpm-run-check.log',
      homeDecisionTarget: 'artifact://integration/sourceTarget=%2Fhome%2Foperator%2Ftrust-model-evidence.md',
      varNegativeTarget:
        'artifact://integration/sourceTarget=%2Fvar%2Fbridge%2Fproduction-ready-correction-evidence.md',
      fileReleaseNoteTarget:
        'artifact://integration/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fgate-8-release-note-evidence.md',
      uncChecklistTarget: 'artifact://integration/sourceTarget=%2F%2Fshare-name%2Fgate-8-checklist-evidence.md',
    },
  ])(
    'rejects $variant local-only markdown evidence link targets for linked integration evidence',
    ({
      tmpReviewTarget,
      driveFreshCheckoutTarget,
      homeDecisionTarget,
      varNegativeTarget,
      fileReleaseNoteTarget,
      uncChecklistTarget,
    }) => {
      const result = validateExternalIntegrationEvidence(integrationEvidence({
        entryPoints: entryPointRows.replace(
          '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
          `[README](../README.md); [entry-point review evidence](${tmpReviewTarget}) completed entry-point review without private context`,
        ),
        freshCheckout: freshCheckoutRows.replace(
          'artifact://integration/npm-run-check.log',
          `[fresh checkout log](${driveFreshCheckoutTarget})`,
        ),
        decisions: decisionRows.replace(
          'artifact://integration/which-trust-model-applies-today.md',
          `[trust model decision evidence](${homeDecisionTarget})`,
        ),
        negatives: negativeRows.replace(
          'artifact://integration/the-bridge-is-production-ready-today.md',
          `[production-readiness blocker correction evidence](${varNegativeTarget})`,
        ),
        publicationRules: publicationRows
          .replace(
            'artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence',
            `[Gate 8 release-note evidence](${fileReleaseNoteTarget}) completed Gate 8 integration release-note update evidence`,
          )
          .replace(
            'artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence',
            `[Gate 8 checklist evidence](${uncChecklistTarget}) completed Gate 8 checklist update evidence`,
          ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Required Entry Points: README: linked status requires completed entry-point review evidence beyond the entrypoint document link',
      );
      expect(result.errors).toContain(
        'Fresh Checkout Commands: npm run check: linked status requires an artifact marker or non-template evidence link for completed command output',
      );
      expect(result.errors).toContain(
        'Integration Decision Record: Which trust model applies today?: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Negative Review Checks: The bridge is production-ready today: linked status requires completed correction evidence with an artifact marker or non-template evidence link',
      );
      expect(result.errors).toContain(
        'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(result.errors).toContain(
        'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    },
  );

  it('rejects sensitive or runtime markdown evidence link targets for linked integration evidence', () => {
    for (const target of [
      'relayer/private-key-review.md',
      'relayer/wallet-mnemonic-review.md',
      'relayer/bridge-state-review.sqlite',
    ]) {
      const result = validateExternalIntegrationEvidence(integrationEvidence({
        entryPoints: entryPointRows.replace(
          '[README](../README.md); artifact://integration/readme-entrypoint-review.md completed entry-point review without private context',
          `[README](../README.md); [entry-point review evidence](${target}) completed entry-point review without private context`,
        ),
      }));

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Required Entry Points: README: linked status requires completed integration evidence with an artifact marker or non-template evidence link',
      );
    }
  });

  it('accepts concrete integration artifact names that mention sample size or template removal', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      entryPoints: entryPointRows.replace(
        'artifact://integration/readme-entrypoint-review.md',
        'artifact://integration/sample-size-analysis-readme-entrypoint-review.md',
      ),
      decisions: decisionRows.replace(
        'artifact://integration/which-trust-model-applies-today.md',
        'artifact://integration/template-removal-audit-which-trust-model-applies-today.md',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects contradictory integration publication update evidence', () => {
    const contradictoryEvidence = 'integration validation PASS exit code 0 validation BLOCKED with 1 structural issue';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          'artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence',
          `artifact://integration/gate-8-release-notes.md completed Gate 8 integration release-note update evidence ${contradictoryEvidence}`,
        )
        .replace(
          'artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence',
          `artifact://integration/gate-8-checklist.md completed Gate 8 checklist update evidence ${contradictoryEvidence}`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory external-integration failure markers',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory external-integration failure markers',
    );
  });

  it('blocks unknown classification values', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production',
      reviewerType: 'marketing',
      environment: 'mainnet',
      broadcastMode: 'maybe',
      privateMaintainerContextUsed: 'maybe',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Release level must be one of validated PoC, institutional reference, production deployment candidate',
    );
    expect(result.errors).toContain(
      'Review Classification: Reviewer type must be one of maintainer, independent engineer, exchange integration engineer',
    );
    expect(result.errors).toContain(
      'Review Classification: Environment used must be one of clean checkout, local offline, patched devnet, testnet',
    );
    expect(result.errors).toContain('Review Classification: Broadcast mode must be one of disabled, dry-run, enabled');
    expect(result.errors).toContain('Review Classification: Private maintainer context used must be one of yes, no');
  });

  it('blocks maintainer self-review before Gate 8 evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewerType: 'maintainer',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Reviewer type must be independent engineer or exchange integration engineer before Gate 8 evidence can pass',
    );
  });

  it('blocks enabled broadcast mode for external integration review evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      broadcastMode: 'enabled',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Broadcast mode must be disabled or dry-run before Gate 8 evidence can pass',
    );
  });

  it('requires production deployment candidate classifications to be testnet-scoped', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'patched devnet',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: production deployment candidate classification must be testnet-scoped for Gate 8 evidence',
    );
  });

  it('blocks missing reviewer affiliation and private maintainer context before Gate 8 evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence({
        privateMaintainerContextUsed: 'yes',
      }).replace('| Reviewer organization | external exchange engineering desk |\n', ''),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Review Classification: Reviewer organization is required');
    expect(result.errors).toContain(
      'Review Classification: Private maintainer context used must be no before Gate 8 evidence can pass',
    );
  });

  it('rejects generic reviewer organization placeholders', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewerOrganization: 'external',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Review Classification: Reviewer organization must identify a concrete external organization or affiliation',
    );
  });

  it('requires negative review corrections', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      negatives: '| The bridge is production-ready today | | [Release checklist](release-checklist.md) | linked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Review Checks: Testnet or patched-devnet success implies mainnet readiness: missing required row',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: expected correction is required',
    );
  });

  it('rejects ambiguous mainnet-readiness negative-review corrections', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      negatives: negativeRows.replace(
        explicitMainnetReadinessCorrection,
        ambiguousMainnetReadinessCorrection,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Review Checks: Testnet or patched-devnet success implies mainnet readiness: expected correction must state that mainnet production-ready/readiness claims are forbidden or out of scope and only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
    );
  });

  it('requires linked negative review evidence before Gate 8 evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      negatives: [
        '| The bridge is production-ready today | corrected by release checklist | | linked |',
        '| Testnet or patched-devnet success implies mainnet readiness | corrected by release checklist | [Release checklist](release-checklist.md) | pending |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Review Checks: Node-wallet signing is acceptable for production: missing required row',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: linked status requires evidence',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: Testnet or patched-devnet success implies mainnet readiness: status must be linked before Gate 8 evidence can pass',
    );
  });

  it('rejects generic negative-review corrections', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      negatives: negativeRows.replace(
        '| Current burn verification is trustless | Trustless burn verification remains Phase 011 evidence. | artifact://integration/current-burn-verification-is-trustless.md | linked |',
        '| Current burn verification is trustless | corrected by release checklist | artifact://integration/current-burn-verification-is-trustless.md | linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Review Checks: Current burn verification is trustless: expected correction must state that trustless burn verification remains Phase 011 evidence',
    );
  });

  it('rejects targetless mainnet-readiness corrections without complete testnet-scoped evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      negatives: negativeRows.replace(
        explicitMainnetReadinessCorrection,
        'Mainnet production-ready/readiness remains forbidden; production deployment candidate claims can be evaluated.',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Review Checks: Testnet or patched-devnet success implies mainnet readiness: expected correction must state that mainnet production-ready/readiness claims are forbidden or out of scope and only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
    );
  });

  it('requires negative-review evidence to cite the corrected misread', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      negatives: negativeRows
        .replace(
          'artifact://integration/the-bridge-is-production-ready-today.md',
          'artifact://integration/corrected.md',
        )
        .replace(
          'artifact://integration/offline-showcase-output-is-live-benchmark-evidence.md',
          'artifact://integration/corrected.md',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Negative Review Checks: The bridge is production-ready today: evidence must identify production-readiness blocker correction',
    );
    expect(result.errors).toContain(
      'Negative Review Checks: Offline showcase output is live benchmark evidence: evidence must identify live benchmark evidence correction',
    );
  });

  it('requires reviewer sign-off decisions', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: '| Integration reviewer | | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Reviewer Sign-Off: Integration reviewer: name is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Integration reviewer: decision must be approve or block');
    expect(result.errors).toContain('Reviewer Sign-Off: Integration reviewer: date is required');
    expect(result.errors).toContain('Reviewer Sign-Off: Integration reviewer: notes are required');
  });

  it('requires reviewer sign-offs to approve before evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | block | 2026-05-14 | integration instructions blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: decision must be approve before Gate 8 evidence can pass',
    );
  });

  it('requires reviewer sign-off dates to use ISO calendar format', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Security reviewer | reviewer-a | approve | May 14 2026 | external integration package accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Reviewer Sign-Off: Security reviewer: Date must use YYYY-MM-DD');
  });

  it('requires reviewer sign-off dates to be on or after the review classification date', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-13 | external integration package accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: Date must not be before Review Classification Date',
    );
  });

  it('requires integration reviewer sign-off to match the review classification identity', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-b | approve | 2026-05-14 | external integration package accepted |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: name must match Review Classification Lead reviewer',
    );
  });

  it('requires reviewer notes to state concrete external-integration outcomes', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed without private context |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must state a concrete external-integration outcome',
    );
  });

  it('rejects reviewer notes with contradictory external-integration failure markers', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; validation BLOCKED with 1 structural issue |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not include contradictory external-integration failure markers',
    );
  });

  it('rejects reviewer notes with production-ready or mainnet claim wording', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows
        .replace(
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; production-ready package claim approved |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; mainnet production release accepted |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it('rejects reviewer notes with active approval verbs for private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows
        .replace(
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package verified; reviewer supports private maintainer context |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package validated; reviewer allows private maintainer context |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not admit private maintainer context',
    );
  });

  it('rejects reviewer notes with compatibility-normalized private maintainer context approval wording', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; reviewer \uFF53\uFF55\uFF50\uFF50\uFF4F\uFF52\uFF54\uFF53 \uFF50\uFF52\uFF49\uFF56\uFF41\uFF54\uFF45 \uFF4D\uFF41\uFF49\uFF4E\uFF54\uFF41\uFF49\uFF4E\uFF45\uFF52 \uFF43\uFF4F\uFF4E\uFF54\uFF45\uFF58\uFF54 |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('rejects reviewer notes with grant-family approval terms for private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows
        .replace(
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package verified; reviewer grants private maintainer context |',
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package validated; reviewer granted private maintainer context |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not admit private maintainer context',
    );
  });

  it('rejects reviewer notes that approve private maintainer context despite blocked wording', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; private maintainer context blocked; private maintainer context is authorized |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it.each([
    ['pending', 'remains pending reviewer follow-up', 'remains pending review'],
    ['awaiting', 'awaiting reviewer follow-up', 'awaiting review'],
    ['waiting', 'waiting for reviewer follow-up', 'waiting for review'],
    ['deferred', 'deferred to reviewer follow-up', 'deferred to reviewer follow-up'],
  ])('blocks reviewer notes that approve integration while leaving public release or private context %s', (
    _label,
    publicReleaseState,
    privateContextState,
  ) => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows
        .replace(
          '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          `| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; public institutional-reference release ${publicReleaseState} |`,
        )
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
          `| Security reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; private maintainer context ${privateContextState} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not leave public institutional-reference release unresolved',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not leave private maintainer context unresolved',
    );
  });

  it('accepts reviewer notes that approve the absence of private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; reviewer approved no private maintainer context |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('accepts reviewer notes that approve absent private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; reviewer approved absent private maintainer context |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('accepts reviewer notes that approve absence of private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; absence of private maintainer context approved by reviewer |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('accepts reviewer notes that approve lack of private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; lack of private maintainer context approved by reviewer |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('accepts reviewer notes that approve lacking private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; lacking private maintainer context approved by reviewer |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('accepts reviewer notes that approve evidence lacks private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; evidence lacks private maintainer context approved by reviewer |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('accepts reviewer notes that explicitly deny private maintainer context use', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      reviewers: reviewerRows.replace(
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted |',
        '| Integration reviewer | reviewer-a | approve | 2026-05-14 | external integration package accepted; reviewer confirmed not used private maintainer context |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Integration reviewer: notes must not admit private maintainer context',
    );
  });

  it('requires publication rules before Gate 8 evidence can pass', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace('| Public institutional-reference release allowed | yes |', '| Public institutional-reference release allowed | no |')
        .replace('| Release notes updated | yes |', '| Release notes updated | no |')
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          '| Required release-note updates | release notes reviewed |',
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          '| Required checklist updates | checklist reviewed |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Public institutional-reference release allowed must be yes before Gate 8 evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Rules: Release notes updated must be yes before Gate 8 evidence can pass',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 8 integration release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 8 checklist update evidence',
    );
  });

  it('rejects targetless command-output notes for Gate 8 publication update evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          '| Required release-note updates | completed Gate 8 integration release-note update evidence: npm run integration:validate command output: PASS |',
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          '| Required checklist updates | completed Gate 8 checklist update evidence: npm run integration:validate command output: PASS |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  });

  it('rejects Gate 8 publication update evidence kinds hidden inside longer draft labels', () => {
    expect(hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(
      'artifact://integration/draft-completed-gate-8-integration-release-note-update-evidence.md',
    )).toBe(false);
    expect(hasCompletedExternalIntegrationChecklistUpdateEvidence(
      'artifact://integration/draft-completed-gate-8-checklist-update-evidence.md',
    )).toBe(false);
  });

  it('rejects Gate 8 publication update evidence kinds hidden inside longer labels during validation', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | artifact://integration/completed-gate-8-release-notes-update.md draft completed Gate 8 integration release-note update evidence ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateDeniedBinding} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | artifact://integration/completed-gate-8-checklist-update.md candidate completed Gate 8 checklist update evidence ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateDeniedBinding} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include completed Gate 8 integration release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include completed Gate 8 checklist update evidence',
    );
  });

  it('rejects Gate 8 publication updates that approve mainnet or production-ready claims', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} approves mainnet production deployment wording |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} approves production-ready integration claim wording |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('rejects Gate 8 publication updates that deny private context with prose-only terms', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithPublicRelease} no private maintainer context |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithPublicRelease} private maintainer context unused |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Private maintainer context used = no; prose-only private-context denial is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Private maintainer context used = no; prose-only private-context denial is not accepted',
    );
  });

  it('rejects Gate 8 publication updates that approve public release with prose-only terms', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${gate8PrivateContextBinding} public institutional-reference release allowed |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${gate8PrivateContextBinding} reviewer permits public institutional-reference release |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must use exact Public institutional-reference release allowed = yes; prose-only public release approval is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must use exact Public institutional-reference release allowed = yes; prose-only public release approval is not accepted',
    );
  });

  it('requires exact public institutional-reference release allowance in Gate 8 publication-update fields', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${gate8PrivateContextBinding} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${gate8PrivateContextBinding} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Public institutional-reference release allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Public institutional-reference release allowed = yes',
    );
  });

  it('blocks Gate 8 publication updates with exact public release allowance plus pending public release prose', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings}; public institutional-reference release remains pending reviewer follow-up |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings}; public institutional-reference release remains pending checklist follow-up |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not leave public institutional-reference release unresolved',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not leave public institutional-reference release unresolved',
    );
  });

  it('requires exact private maintainer context denial in Gate 8 publication-update fields', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithPublicRelease} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithPublicRelease} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Private maintainer context used = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Private maintainer context used = no',
    );
  });

  it('requires exact production-ready claim denial in Gate 8 publication-update fields', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8TestnetCandidateDeniedBinding} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8TestnetCandidateDeniedBinding} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Production-ready claim allowed = no',
    );
  });

  it('requires exact testnet production-candidate denial in institutional-reference publication updates', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Testnet production-candidate claim allowed = no',
    );
  });

  it('rejects Gate 8 publication updates and reviewer summaries that keep decision placeholders', () => {
    const placeholderBindings =
      'Private maintainer context used = no/yes; Public institutional-reference release allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = no/yes';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${placeholderBindings} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${placeholderBindings} |`,
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | public institutional-reference release allowed = yes/no; private maintainer context used = no/yes; production-ready claim handling: Production-ready claim allowed = no/yes; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no/yes |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Private maintainer context used = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Private maintainer context used = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Public institutional-reference release allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Public institutional-reference release allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Testnet production-candidate claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Private maintainer context used = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include Testnet production-candidate claim allowed = no',
    );
  });

  it('accepts exact private-context, public-release, and testnet-denial bindings in Gate 8 publication updates', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence());

    expect(result.status).toBe('PASS');
  });

  it('rejects Gate 8 publication updates that reuse one completed evidence target', () => {
    const reusedPublicationUpdateTarget =
      'artifact://integration/completed-gate-8-integration-release-note-update-evidence-completed-gate-8-checklist-update-evidence.md';
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${reusedPublicationUpdateTarget} completed Gate 8 integration release-note update evidence ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${reusedPublicationUpdateTarget} completed Gate 8 checklist update evidence ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates and Required checklist updates must use distinct completed Gate 8 integration evidence targets',
    );
  });

  it('requires explicit testnet production-candidate publication handling for candidate-grade evidence', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Testnet production-candidate claim allowed must be yes for production deployment candidate evidence',
    );
  });

  it('passes candidate-grade evidence only when testnet production-candidate handling is explicit', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRows
        .replace(
          '| Testnet production-candidate claim allowed | no |',
          '| Testnet production-candidate claim allowed | yes |',
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          `| Reviewer decision summary | ${gate8ReleaseSupportedProductionCandidateBinding}; public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes |`,
        )
        .replace(
          gate8ReleaseNoteUpdateEvidenceWithRequiredBindings,
          `${gate8ReleaseNoteUpdateEvidence} ${gate8ReleaseSupportedProductionCandidateBinding} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateAllowedBinding}`,
        )
        .replace(
          gate8ChecklistUpdateEvidenceWithRequiredBindings,
          `${gate8ChecklistUpdateEvidence} ${gate8ReleaseSupportedProductionCandidateBinding} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateAllowedBinding}`,
        ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.publicationDecision).toMatchObject({
      testnetProductionCandidateClaimAllowed: 'yes',
    });
  });

  it('requires exact release support in candidate-grade publication updates and reviewer summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRows
        .replace(
          '| Testnet production-candidate claim allowed | no |',
          '| Testnet production-candidate claim allowed | yes |',
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes |',
        )
        .replace(
          gate8ReleaseNoteUpdateEvidenceWithRequiredBindings,
          `${gate8ReleaseNoteUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateAllowedBinding}`,
        )
        .replace(
          gate8ChecklistUpdateEvidenceWithRequiredBindings,
          `${gate8ChecklistUpdateEvidence} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} ${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateAllowedBinding}`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('requires exact testnet production-candidate claim allowance in candidate-grade reviewer summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRows
        .replace(
          '| Testnet production-candidate claim allowed | no |',
          '| Testnet production-candidate claim allowed | yes |',
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling allowed by complete evidence |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires exact testnet production-candidate claim denial in institutional-reference reviewer summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked by this review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include Testnet production-candidate claim allowed = no',
    );
  });

  it('requires exact production-ready claim denial in reviewer summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        'production-ready claim handling: Production-ready claim allowed = no',
        'production-ready claim handling: blocked',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact testnet production-candidate claim binding in candidate-grade publication updates', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRows
        .replace(
          '| Testnet production-candidate claim allowed | no |',
          '| Testnet production-candidate claim allowed | yes |',
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes |',
        )
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${gate8ReleaseSupportedProductionCandidateBinding} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${gate8ReleaseSupportedProductionCandidateBinding} ${gate8PrivateContextBinding} ${gate8PublicReleaseBinding} |`,
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must include exact Testnet production-candidate claim allowed = yes',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must include exact Testnet production-candidate claim allowed = yes',
    );
  });

  it('blocks reviewer decision summaries that contradict testnet production-candidate integration claims', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      publicationRules: publicationRows
        .replace(
          '| Testnet production-candidate claim allowed | no |',
          '| Testnet production-candidate claim allowed | yes |',
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: testnet production-candidate claim handling must be allowed when the field is yes',
    );
  });

  it('rejects contradictory exact external-integration decision bindings in publication updates and reviewer summaries', () => {
    const contradictoryBindings =
      `${gate8PrivateContextBinding} ${gate8PublicReleaseBinding}; Public institutional-reference release allowed = no; ` +
      `${gate8ProductionReadyDeniedBinding} ${gate8TestnetCandidateDeniedBinding}`;
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows
        .replace(
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidenceWithRequiredBindings} |`,
          `| Required release-note updates | ${gate8ReleaseNoteUpdateEvidence} ${contradictoryBindings} |`,
        )
        .replace(
          `| Required checklist updates | ${gate8ChecklistUpdateEvidenceWithRequiredBindings} |`,
          `| Required checklist updates | ${gate8ChecklistUpdateEvidence} ${contradictoryBindings} |`,
        )
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | Public institutional-reference release allowed = yes; Public institutional-reference release allowed = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Required release-note updates must not include contradictory external-integration decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Rules: Required checklist updates must not include contradictory external-integration decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not include contradictory external-integration decision bindings',
    );
  });

  it('blocks reviewer decision summaries that allow testnet production-candidate claims when the field is no', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim not allowed by this review; testnet production-candidate claim handling allowed |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: testnet production-candidate claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that admit private maintainer context', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked; private maintainer context used: yes |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: private maintainer context must be absent or explicitly no',
    );
  });

  it('blocks reviewer decision summaries that approve private maintainer context despite blocked wording', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked; private maintainer context blocked; private maintainer context is authorized |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: private maintainer context must be absent or explicitly no',
    );
  });

  it('blocks reviewer decision summaries that certify private maintainer context despite blocked wording', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked; private maintainer context blocked; private maintainer context certified |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: private maintainer context must be absent or explicitly no',
    );
  });

  it('blocks reviewer decision summaries that endorse private maintainer context despite blocked wording', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked; private maintainer context blocked; private maintainer context endorsed; private context recommended; private maintainer context accredited |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: private maintainer context must be absent or explicitly no',
    );
  });

  it('rejects unsafe Gate 8 publication decisions', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      releaseLevel: 'production deployment candidate',
      publicationRules: publicationRows
        .replace('| Production-ready claim allowed | no |', '| Production-ready claim allowed | yes |')
        .replace('| Private maintainer context used | no |', '| Private maintainer context used | yes |')
        .replace(
          '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
          '| Reviewer decision summary | reviewed |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: external integration review cannot allow production-ready claims',
    );
    expect(result.errors).toContain(
      'Publication Rules: Private maintainer context used must be no before Gate 8 evidence can pass',
    );
    expect(result.errors).toContain('Publication Rules: Private maintainer context used must match Review Classification');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention public institutional-reference release, production-ready claim handling, and testnet production-candidate claim handling',
    );
  });

  it('blocks reviewer decision summaries that approve production-ready integration claims', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim allowed by this review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
    );
  });

  it('blocks reviewer decision summaries that approve mainnet release-readiness while preserving claim handling', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked; reviewer clears mainnet release-readiness claims |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('blocks reviewer decision summaries that recommend mainnet release-readiness claims', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim handling blocked; reviewer recommends mainnet release-readiness claims; production ready wording accredited',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('does not treat reviewer decision summaries that approve no mainnet release-readiness claims as approvals', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; reviewer approved no mainnet release-readiness claims |',
      ),
    }));

    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('does not treat reviewer decision summaries that approve lack of mainnet release-readiness claims as approvals', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; lack of mainnet release-readiness claims approved by reviewer |',
      ),
    }));

    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('does not treat reviewer decision summaries that approve lacking mainnet release-readiness claims as approvals', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; lacking mainnet release-readiness claims approved by reviewer |',
      ),
    }));

    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('does not treat reviewer decision summaries that approve evidence lacks mainnet release-readiness claims as approvals', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; evidence lacks mainnet release-readiness claims approved by reviewer |',
      ),
    }));

    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('does not treat reviewer decision summaries that approve evidence lacks private maintainer context as admissions', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; Private maintainer context used = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; evidence lacks private maintainer context approved by reviewer |',
      ),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary: private maintainer context must be absent or explicitly no',
    );
    expect(result.errors).not.toContain(
      'Publication Rules: Reviewer decision summary must use exact Private maintainer context used = no',
    );
  });

  it.each([
    ['pending', 'remains pending review'],
    ['awaiting', 'awaiting review'],
    ['waiting', 'waiting for review'],
    ['deferred', 'deferred to reviewer follow-up'],
  ])('blocks reviewer decision summaries with exact no private context plus %s private context prose', (_label, blockerState) => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        `| Reviewer decision summary | public institutional-reference release allowed = yes; Private maintainer context used = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; private maintainer context ${blockerState} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not leave private maintainer context unresolved',
    );
  });

  it.each([
    ['pending', 'remains pending reviewer follow-up'],
    ['awaiting', 'awaiting reviewer follow-up'],
    ['waiting', 'waiting for reviewer follow-up'],
    ['deferred', 'deferred to reviewer follow-up'],
  ])('blocks reviewer decision summaries with exact public release allowance plus %s public release prose', (_label, blockerState) => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        `| Reviewer decision summary | Public institutional-reference release allowed = yes; Private maintainer context used = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; public institutional-reference release ${blockerState} |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must not leave public institutional-reference release unresolved',
    );
  });

  it('requires actionable production-ready claim handling in reviewer decision summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim reviewed; testnet production-candidate claim handling blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention public institutional-reference release, production-ready claim handling, and testnet production-candidate claim handling',
    );
  });

  it('requires production-ready claim handling rather than claim-allowed shorthand in integration summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim not allowed by this review; testnet production-candidate claim handling blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention public institutional-reference release, production-ready claim handling, and testnet production-candidate claim handling',
    );
  });

  it('requires actionable testnet production-candidate claim handling in reviewer decision summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim not allowed by this review; testnet production-candidate claims reviewed |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention public institutional-reference release, production-ready claim handling, and testnet production-candidate claim handling',
    );
  });

  it('requires testnet production-candidate claim handling rather than claim-allowed shorthand in integration summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: blocked; testnet production-candidate claim blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must mention public institutional-reference release, production-ready claim handling, and testnet production-candidate claim handling',
    );
  });

  it('blocks reviewer decision summaries that contradict public integration release handling', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release blocked; production-ready claim not allowed by this review |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
  });

  it('rejects compatibility-normalized blockers in public integration release reviewer summaries', () => {
    const compatibilityBlocked = String.fromCodePoint(0xff42, 0xff4c, 0xff4f, 0xff43, 0xff4b, 0xff45, 0xff44);
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        `| Reviewer decision summary | Public institutional-reference release allowed = yes; public institutional reference release ${compatibilityBlocked}; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
  });

  it('requires public institutional-reference release approval to bind the release subject', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release reviewed; entry-point package support confirmed; production-ready claim handling: blocked; testnet production-candidate claim handling blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
  });

  it('rejects reviewer summaries that use broad institutional-reference approval verbs instead of exact release allowance', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | reviewer permits public institutional-reference release; production-ready claim handling: blocked; testnet production-candidate claim handling blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
  });

  it('requires exact public institutional-reference release allowance in reviewer summaries', () => {
    const result = validateExternalIntegrationEvidence(integrationEvidence({
      publicationRules: publicationRows.replace(
        '| Reviewer decision summary | public institutional-reference release allowed = yes; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no |',
        '| Reviewer decision summary | public institutional-reference release handling: allowed; production-ready claim handling: blocked; testnet production-candidate claim handling blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
  });

  it('requires publication rules to be tabular guard input', () => {
    const result = validateExternalIntegrationEvidence(
      integrationEvidence().replace(
        `| Field | Value |
|---|---|
${publicationRows}`,
        '- Keep blockers visible.',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Rules: table not found');
  });

  it('blocks missing tables without throwing', () => {
    const result = validateExternalIntegrationEvidence('# Incomplete review\n\n## Review Classification\n\nNo table yet.\n');

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('## Required Entry Points: table not found');
    expect(result.errors).toContain('## Integration Decision Record: table not found');
    expect(result.errors).toContain('## Negative Review Checks: table not found');
    expect(result.errors).toContain('## Publication Rules: missing required section');
    expect(result.errors).toContain('## Reviewer Sign-Off: table not found');
  });
});
