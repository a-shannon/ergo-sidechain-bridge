import { spawnSync } from 'child_process';

import { describe, expect, it } from 'vitest';

import {
  hasCompletedTechnicalAddendumChecklistUpdateEvidence,
  hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence,
  validateTechnicalAddendumEvidence,
} from './technical-addendum-evidence.js';

const commit = '8a206ecc';

function manual(overrides: {
  environment?: string;
  releaseGateStatus?: string;
  releaseSupported?: string;
  testnetClaimAllowed?: string;
  productionReadyAllowed?: string;
  mainnetAllowed?: string;
  manualUseStatus?: string;
  gateRows?: string;
  decisionRows?: string;
  claimWording?: string;
  reviewerSummary?: string;
  releaseNoteUpdates?: string;
  checklistUpdates?: string;
  reviewerRows?: string;
  securityBoundary?: string;
  operationalBoundary?: string;
} = {}): string {
  const gateRows = overrides.gateRows ?? manualGateRows();

  const decisionRows = overrides.decisionRows ?? [
    '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
    '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
    '| What blocks mainnet production-ready claims? | mainnet production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
    '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
    '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
    '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
    '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
    '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
  ].join('\n');

  const reviewerRows = overrides.reviewerRows ?? [
    '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
    '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
    '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate and no transaction broadcast boundary approved |',
  ].join('\n');

  return `# Testnet Production-Candidate Architecture Manual Evidence

## Manual Classification

| Field | Value |
|---|---|
| Manual name | Phase 007 gated architecture manual |
| Git commit | ${commit} |
| Release level | production deployment candidate |
| Environment | ${overrides.environment ?? 'testnet'} |
| Claim wording | ${overrides.claimWording ?? 'testnet production-candidate'} |
| Architecture owner | A. Shannon |
| Reviewer | A. Shannon |
| Date | 2026-05-20 |

## Architecture Scope

This manual covers SCS, MCL, DUP, SPVTracker, aggregate settlement, and the
relayer. Every architectural claim is tied to completed evidence and remains
testnet-scoped.

## Claim Boundary

| Field | Value |
|---|---|
| Production-ready claims allowed | no |
| Mainnet deployment claims allowed | no |
| Testnet production-candidate wording allowed | yes-after-release-gate-pass |
| Production-grade testnet wording allowed | yes-after-release-gate-pass |
| Release gate required before public claim | yes |
| Evidence completeness required | yes |

## Evidence Gate Map

| Gate | Required evidence | Artifact | Status | Claim boundary |
|---|---|---|---|---|
${gateRows}

## Architecture Decision Record

| Decision | Required position | Evidence | Status |
|---|---|---|---|
${decisionRows}

## Security Boundary

${overrides.securityBoundary ?? `The only allowed settlement signing path is ergo-lib-wasm-nodejs through
sigma-rust WASM. The ContextExtension guard remains fail-closed. node-wallet
signing is not the production path. Trustless burn, multisig, benchmark, and
review blockers remain bound to release-gate evidence.`}

## Operational Boundary

${overrides.operationalBoundary ?? `This manual performs no transaction broadcast. Live operations require explicit
approval, scoped BRIDGE_BROADCAST_ENABLED=true, readiness checks, and
release:gate evidence before any testnet claim is used.`}

## Publication Decision

| Field | Value |
|---|---|
| Manual use status | ${overrides.manualUseStatus ?? 'candidate claim support'} |
| Release supported | ${overrides.releaseSupported ?? 'production deployment candidate'} |
| Release gate status | ${overrides.releaseGateStatus ?? 'pass'} |
| Production-ready claim allowed | ${overrides.productionReadyAllowed ?? 'no'} |
| Mainnet deployment claim allowed | ${overrides.mainnetAllowed ?? 'no'} |
| Testnet production-candidate claim allowed | ${overrides.testnetClaimAllowed ?? 'yes-after-release-gate-pass'} |
| Release notes updated | yes |
| Required release-note updates | ${overrides.releaseNoteUpdates ?? 'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md'} |
| Required checklist updates | ${overrides.checklistUpdates ?? 'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md'} |
| Reviewer decision summary | ${overrides.reviewerSummary ?? 'Release supported = production deployment candidate; architecture manual evidence linked; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass'} |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${reviewerRows}
`;
}

function manualGateRows(): string {
  return [
    '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
  ].join('\n');
}

describe('technical addendum evidence validation', () => {
  it('passes a fully gated testnet architecture manual evidence document', () => {
    const result = validateTechnicalAddendumEvidence(manual());

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.classification).toMatchObject({
      manualName: 'Phase 007 gated architecture manual',
      gitCommit: '8a206ecc',
      releaseLevel: 'production deployment candidate',
      environment: 'testnet',
      claimWording: 'testnet production-candidate',
      architectureOwner: 'A. Shannon',
      reviewer: 'A. Shannon',
      date: '2026-05-20',
    });
    expect(result.claimBoundary).toMatchObject({
      productionReadyClaimsAllowed: 'no',
      mainnetDeploymentClaimsAllowed: 'no',
      testnetProductionCandidateWordingAllowed: 'yes-after-release-gate-pass',
      productionGradeTestnetWordingAllowed: 'yes-after-release-gate-pass',
      releaseGateRequiredBeforePublicClaim: 'yes',
      evidenceCompletenessRequired: 'yes',
    });
  });

  it('prints addendum claim and release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-technical-addendum-evidence.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run addendum:validate');
    expect(result.stdout).toContain('completed Technical Addendum Evidence Markdown');
    expect(result.stdout).toContain('release:gate -- --technical-addendum-evidence');
    expect(result.stdout).toContain('technical addendum validation target');
    expect(result.stdout).toContain('completed artifact evidence');
    expect(result.stdout).toContain('concrete release:gate PASS output with Structural issues = 0');
    expect(result.stdout).toContain('A standalone PASS does not authorize public claims');
    expect(result.stdout).toContain('release:gate PASS with all required evidence rows');
    expect(result.stdout).toContain('Structural issues = 0');
    expect(result.stdout).toContain('Manual use status = candidate claim support');
    expect(result.stdout).toContain('Release supported = production deployment candidate');
    expect(result.stdout).toContain('Release gate status = pass');
    expect(result.stdout).toContain('Production-ready claim allowed = no');
    expect(result.stdout).toContain('Mainnet deployment claim allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claim allowed = yes-after-release-gate-pass');
    expect(result.stdout).toContain('Release notes updated = yes');
    expect(result.stdout).not.toContain('zero structural issues');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, broadcast, or open runtime databases',
    );
  });

  it('rejects production-candidate support when release-gate pass evidence is only a decision artifact', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        '| What blocks mainnet production-ready claims? | mainnet production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Architecture Decision Record: What must pass before testnet production-candidate wording?: Evidence must include concrete release:gate PASS output with Structural issues = 0',
    );
  });

  it('rejects production-candidate support when release-gate pass evidence uses narrative structural issue wording', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        '| What blocks mainnet production-ready claims? | mainnet production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS zero structural issues artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Architecture Decision Record: What must pass before testnet production-candidate wording?: Evidence must include concrete release:gate PASS output with Structural issues = 0',
    );
  });

  it('rejects production-candidate support when release-gate pass evidence keeps a PASS/CANDIDATE placeholder', () => {
    const result = validateTechnicalAddendumEvidence(
      manual().replace(
        'release:gate PASS Structural issues = 0',
        'release:gate PASS/CANDIDATE Structural issues = 0',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Architecture Decision Record: What must pass before testnet production-candidate wording?: Evidence must include concrete release:gate PASS output with Structural issues = 0',
    );
  });

  it('rejects production-candidate support when manual use status remains draft', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      manualUseStatus: 'draft',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: production deployment candidate support requires Manual use status candidate claim support',
    );
  });

  it('rejects missing required gate-map rows', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Fresh testnet lifecycle: missing required row');
  });

  it('rejects targetless architecture gate evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | command output: PASS | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
  });

  it('rejects row-named generic artifact targets for linked technical addendum evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/generic-completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/generic-completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/generic-completed-phase007-release-note-update.md',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/generic-completed-phase007-checklist-update.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must include completed artifact target or non-template evidence link');
  });

  it('rejects row-named sample addendum artifact targets for linked technical addendum evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/sample-addendum-gate-clean-checkout-ci-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/sample-architecture-decision-release-level.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/sample-phase007-release-note-update-evidence.md',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/sample-checklist-update-phase007-evidence.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must include completed artifact target or non-template evidence link');
  });

  it('rejects claim-escalating artifact targets for linked technical addendum evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows()
        .replace(
          'artifact://addendum/completed-clean-checkout-evidence.md',
          'artifact://addendum/completed-clean-checkout-evidence-testnet-production-candidate-certified.md',
        ),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision-production-ready-endorsed.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision-node-wallet-production-path-approved.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass-testnet-production-candidate-claims-allowed-before-release-gate-pass.md; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization-bridge-broadcast-enabled-true-transaction-broadcast-approved.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update-mainnet-production-certified.md',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update-production-ready-endorsed.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: Which signer path is allowed?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What must pass before testnet production-candidate wording?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: How is live broadcast authorized?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must include completed artifact target or non-template evidence link');
  });

  it('rejects validation-target bindings as linked technical addendum row evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | [technical addendum validation target](artifact://addendum/completed-clean-checkout-evidence.md) completed technical addendum gate evidence for Clean checkout CI | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | [technical addendum validation target](artifact://addendum/completed-release-level-decision.md) completed technical addendum decision evidence for What release level does this manual describe? | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        '[technical addendum validation target](artifact://addendum/completed-phase007-release-note-update.md) completed Phase 007 release-note update evidence',
      checklistUpdates:
        '[technical addendum validation target](artifact://addendum/completed-phase007-checklist-update.md) completed Phase 007 checklist update evidence',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must include completed artifact target or non-template evidence link');
  });

  it('accepts concrete technical addendum evidence before validation-target bindings', () => {
    const validationTarget = 'artifact://addendum/validation/technical-addendum-validate-input.md';
    const validationTargetBinding = `technical addendum validation target ${validationTarget}`;
    const result = validateTechnicalAddendumEvidence(
      manual()
        .replace(
          '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          `| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md; ${validationTargetBinding} | linked | testnet-only; production-ready blocked; mainnet blocked |`,
        )
        .replace(
          '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
          `| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md; ${validationTargetBinding} | linked |`,
        )
        .replace(
          'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md',
          `completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md; ${validationTargetBinding}`,
        )
        .replace(
          'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md',
          `completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md; ${validationTargetBinding}`,
        ),
    );

    expect(result.status).toBe('PASS');
  });

  it('rejects reused Phase 007 publication update evidence targets', () => {
    const reusedPublicationTarget =
      'artifact://addendum/completed-phase007-publication-update-evidence.md';
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        `completed Phase 007 release-note update evidence ${reusedPublicationTarget}`,
      checklistUpdates:
        `completed Phase 007 checklist update evidence ${reusedPublicationTarget}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed Phase 007 evidence targets',
    );
  });

  it('rejects Phase 007 publication update evidence kinds hidden inside longer draft labels', () => {
    expect(hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence(
      'artifact://addendum/draft-completed-phase-007-release-note-update-evidence.md',
    )).toBe(false);
    expect(hasCompletedTechnicalAddendumChecklistUpdateEvidence(
      'artifact://addendum/draft-completed-phase-007-checklist-update-evidence.md',
    )).toBe(false);
  });

  it('rejects publication decision rows whose Phase 007 evidence kind is hidden inside a longer draft label', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'draft completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md',
      checklistUpdates:
        'candidate completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must include completed Phase 007 release-note update evidence',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must include completed Phase 007 checklist update evidence',
    );
  });

  it('requires exact release-gate status bindings in publication updates', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md release gate passed',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md release gate status pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release gate status = pass; prose-only release-gate pass wording is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release gate status = pass; prose-only release-gate pass wording is not accepted',
    );
  });

  it('accepts exact release-gate status bindings in publication updates', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md Release gate status = pass',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md Release gate status = pass',
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires exact testnet production-candidate claim bindings in publication updates', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md testnet production-candidate claim handling allowed',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md allowed testnet production-candidate claim closure',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass; prose-only testnet production-candidate claim wording is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass; prose-only testnet production-candidate claim wording is not accepted',
    );
  });

  it('accepts exact testnet production-candidate claim bindings in publication updates', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md Release gate status = pass; Testnet production-candidate claim allowed = yes-after-release-gate-pass',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md Release gate status = pass; Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects non-concrete artifact targets for linked technical addendum evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/placeholder-completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/tbd-completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/sample-evidence-completed-phase007-release-note-update.md',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/example-evidence-completed-phase007-checklist-update.md',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must include completed artifact target or non-template evidence link');
  });

  it('rejects non-concrete markdown link targets for linked technical addendum evidence', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | [completed clean checkout evidence](../evidence/addendum/placeholder-completed-clean-checkout-evidence.md) | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | [completed release-level decision evidence](../evidence/addendum/todo-completed-release-level-decision.md) | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
  });

  it.each([
    'artifact://addendum/fixture-completed-clean-checkout-evidence.md',
    'artifact://addendum/mock-completed-clean-checkout-evidence.md',
    'artifact://addendum/dummy-completed-clean-checkout-evidence.md',
    'artifact://addendum/fake-completed-clean-checkout-evidence.md',
    'artifact://addendum/stub-completed-clean-checkout-evidence.md',
    'artifact://addendum/testdata-completed-clean-checkout-evidence.md',
    'artifact://addendum/completed-synthetic-clean-checkout-evidence.md',
    'artifact://addendum/completed-simulated-clean-checkout-evidence.md',
  ])('rejects fixture-style or synthetic artifact marker %s for linked technical addendum evidence', artifactTarget => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        'artifact://addendum/completed-clean-checkout-evidence.md',
        artifactTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link',
    );
  });

  it.each([
    '[fixture](../evidence/addendum/fixture-completed-clean-checkout-evidence.md)',
    '[mock](../evidence/addendum/mock-completed-clean-checkout-evidence.md)',
    '[dummy](../evidence/addendum/dummy-completed-clean-checkout-evidence.md)',
    '[fake](../evidence/addendum/fake-completed-clean-checkout-evidence.md)',
    '[stub](../evidence/addendum/stub-completed-clean-checkout-evidence.md)',
    '[testdata](../evidence/addendum/testdata-completed-clean-checkout-evidence.md)',
    '[synthetic](../evidence/addendum/completed-synthetic-clean-checkout-evidence.md)',
    '[simulated](../evidence/addendum/completed-simulated-clean-checkout-evidence.md)',
  ])('rejects fixture-style or synthetic Markdown link %s for linked technical addendum evidence', markdownTarget => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        'artifact://addendum/completed-clean-checkout-evidence.md',
        markdownTarget,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link',
    );
  });

  it.each([
    {
      variant: 'raw',
      tmpGateTarget: ['', 'tmp', 'completed-clean-checkout-evidence.md'].join('/'),
      driveDecisionTarget: ['C:', 'tmp', 'completed-release-level-decision.md'].join('/'),
      fileReleaseNoteTarget: ['file:', '', '', 'C:', 'tmp', 'completed-phase007-release-note-update.md'].join('/'),
      uncChecklistTarget: ['', '', 'share-name', 'completed-phase007-checklist-update.md'].join('/'),
    },
    {
      variant: 'encoded',
      tmpGateTarget: '%2Ftmp%2Fcompleted-clean-checkout-evidence.md',
      driveDecisionTarget: 'C%3A%2Ftmp%2Fcompleted-release-level-decision.md',
      fileReleaseNoteTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fcompleted-phase007-release-note-update.md',
      uncChecklistTarget: '%2F%2Fshare-name%2Fcompleted-phase007-checklist-update.md',
    },
    {
      variant: 'embedded encoded',
      tmpGateTarget: 'artifact://addendum/sourceTarget=%2Ftmp%2Fcompleted-clean-checkout-evidence.md',
      driveDecisionTarget:
        'artifact://addendum/sourceTarget=C%3A%2Ftmp%2Fcompleted-release-level-decision.md',
      fileReleaseNoteTarget:
        'artifact://addendum/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fcompleted-phase007-release-note-update.md',
      uncChecklistTarget:
        'artifact://addendum/sourceTarget=%2F%2Fshare-name%2Fcompleted-phase007-checklist-update.md',
    },
  ])(
    'rejects $variant local-only markdown link targets for linked technical addendum evidence',
    ({ tmpGateTarget, driveDecisionTarget, fileReleaseNoteTarget, uncChecklistTarget }) => {
      const result = validateTechnicalAddendumEvidence(manual({
        gateRows: [
          `| Clean checkout CI | final branch reproducibility | [completed clean checkout evidence](${tmpGateTarget}) | linked | testnet-only; production-ready blocked; mainnet blocked |`,
          '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        ].join('\n'),
        decisionRows: [
          `| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | [completed release-level decision evidence](${driveDecisionTarget}) | linked |`,
          '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
          [
            '| What blocks mainnet',
            'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
          ].join(' '),
          '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
          '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
          '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
          '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
          '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
        ].join('\n'),
        releaseNoteUpdates:
          `completed Phase 007 release-note update evidence [completed Phase 007 release-note update evidence](${fileReleaseNoteTarget})`,
        checklistUpdates:
          `completed Phase 007 checklist update evidence [completed Phase 007 checklist update evidence](${uncChecklistTarget})`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link');
      expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link');
      expect(result.errors).toContain('Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link');
      expect(result.errors).toContain('Publication Decision: Required checklist updates must include completed artifact target or non-template evidence link');
    },
  );

  it.each([
    {
      row: 'gate-map secret Markdown target',
      overrides: () => ({
        gateRows: manualGateRows().replace(
          'artifact://addendum/completed-clean-checkout-evidence.md',
          '[completed clean checkout evidence](relayer/private-key-addendum.md)',
        ),
      }),
      expectedError: 'Evidence Gate Map: Clean checkout CI: Artifact must include completed evidence target or non-template evidence link',
    },
    {
      row: 'decision mnemonic Markdown target',
      overrides: () => ({
        decisionRows: [
          '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | [completed release-level decision evidence](relayer/wallet-mnemonic-addendum.md) | linked |',
          '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
          [
            '| What blocks mainnet',
            'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
          ].join(' '),
          '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
          '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
          '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
          '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
          '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
        ].join('\n'),
      }),
      expectedError:
        'Architecture Decision Record: What release level does this manual describe?: Evidence must include completed evidence target or non-template evidence link',
    },
    {
      row: 'publication runtime artifact target',
      overrides: () => ({
        releaseNoteUpdates:
          'completed Phase 007 release-note update evidence artifact://addendum/bridge-state-phase007-release-note-update.sqlite',
      }),
      expectedError:
        'Publication Decision: Required release-note updates must include completed artifact target or non-template evidence link',
    },
  ])(
    'rejects sensitive or runtime targets for linked technical addendum evidence: $row',
    ({ overrides, expectedError }) => {
      const result = validateTechnicalAddendumEvidence(manual(overrides()));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(expectedError);
    },
  );

  it('accepts concrete technical addendum artifact names that mention sample size or template removal', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/sample-size-analysis-completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/template-removal-audit-completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims are forbidden and production-ready claims are blocked | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects linked technical addendum evidence with contradictory failure markers', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility validation BLOCKED with 1 structural issue | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only validation BLOCKED with 1 structural issue | artifact://addendum/completed-release-level-decision.md command output: PASS exit code 0 validation BLOCKED with 1 structural issue | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims and production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0 validation BLOCKED with 1 structural issue',
    }).replace(
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary validation BLOCKED with 1 structural issue |',
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Required evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Required position must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Reviewer Sign-Off: Architecture owner: notes must not include contradictory technical addendum failure markers');
  });

  it('rejects linked technical addendum evidence with remaining issue markers', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility; Remaining issues: unresolved clean checkout blocker | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0; Remaining issues: unresolved clean checkout artifact blocker | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only; Remaining issues: unresolved release-level blocker | artifact://addendum/completed-release-level-decision.md command output: PASS exit code 0; Remaining issues: unresolved release-level evidence blocker | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims and production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0; Remaining issues: unresolved release-note update blocker',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0; Remaining issues: unresolved checklist update blocker',
    }).replace(
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; Remaining issues: unresolved reviewer blocker |',
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Required evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Required position must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Reviewer Sign-Off: Architecture owner: notes must not include contradictory technical addendum failure markers');
  });

  it('rejects linked technical addendum evidence with singular remaining issue markers', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility; Remaining issue: follow-up pending | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0; Remaining issue: follow-up pending | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only; Remaining issue: follow-up pending | artifact://addendum/completed-release-level-decision.md command output: PASS exit code 0; Remaining issue: follow-up pending | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims and production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0; Remaining issue: follow-up pending',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0; Remaining issue: follow-up pending',
    }).replace(
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; Remaining issue: follow-up pending |',
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Required evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Required position must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Reviewer Sign-Off: Architecture owner: notes must not include contradictory technical addendum failure markers');
  });

  it('rejects linked technical addendum evidence with open or known issue markers', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: [
        '| Clean checkout CI | final branch reproducibility; Open issues: unresolved clean checkout blocker | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0; Known issues: unresolved clean checkout artifact blocker | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ].join('\n'),
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only; Open issues: unresolved release-level blocker | artifact://addendum/completed-release-level-decision.md command output: PASS exit code 0; Known issues: unresolved release-level evidence blocker | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        [
          '| What blocks mainnet',
          'production-ready claims? | mainnet deployment claims and production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        ].join(' '),
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0; Open issues: unresolved release-note update blocker',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0; Known issues: unresolved checklist update blocker',
    }).replace(
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
      '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; Open issues: unresolved reviewer blocker |',
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Required evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Required position must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required release-note updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Publication Decision: Required checklist updates must not include contradictory technical addendum failure markers');
    expect(result.errors).toContain('Reviewer Sign-Off: Architecture owner: notes must not include contradictory technical addendum failure markers');
  });

  it('rejects linked technical addendum evidence with structured failure fields', () => {
    for (const marker of [
      'errors=[technical addendum drift]',
      'failureTotal=1',
    ]) {
      const result = validateTechnicalAddendumEvidence(manual({
        gateRows: [
          `| Clean checkout CI | final branch reproducibility; ${marker} | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0; ${marker} | linked | testnet-only; production-ready blocked; mainnet blocked |`,
          '| Fresh testnet lifecycle | completed live rehearsal evidence | artifact://addendum/completed-live-rehearsal-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence | artifact://addendum/completed-signer-conformance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Trustless burn verification | completed trustless burn evidence | artifact://addendum/completed-trustless-burn-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Committee governance | completed committee/key-rotation evidence | artifact://addendum/completed-governance-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Operator readiness | completed operator readiness evidence | artifact://addendum/completed-operator-readiness-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Benchmark and scaling evidence | completed benchmark evidence | artifact://addendum/completed-benchmark-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Independent security review | completed independent security review evidence | artifact://addendum/completed-security-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| External integration review | completed external integration review evidence | artifact://addendum/completed-integration-review-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
          '| Release notes | completed production deployment candidate release notes | artifact://addendum/completed-release-notes-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        ].join('\n'),
        decisionRows: [
          `| What release level does this manual describe? | production deployment candidate for testnet-scoped use only; ${marker} | artifact://addendum/completed-release-level-decision.md command output: PASS exit code 0; ${marker} | linked |`,
          '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
          [
            '| What blocks mainnet',
            'production-ready claims? | mainnet deployment claims and production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
          ].join(' '),
          '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
          '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
          '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
          '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
          '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
        ].join('\n'),
        releaseNoteUpdates:
          `completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0; Release gate status = pass; Testnet production-candidate claim allowed = yes-after-release-gate-pass; ${marker}`,
        checklistUpdates:
          `completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0; Release gate status = pass; Testnet production-candidate claim allowed = yes-after-release-gate-pass; ${marker}`,
      }).replace(
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        `| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; ${marker} |`,
      ));

      expect(result.status, marker).toBe('BLOCKED');
      expect(result.errors, marker).toContain('Evidence Gate Map: Clean checkout CI: Required evidence must not include contradictory technical addendum failure markers');
      expect(result.errors, marker).toContain('Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers');
      expect(result.errors, marker).toContain('Architecture Decision Record: What release level does this manual describe?: Required position must not include contradictory technical addendum failure markers');
      expect(result.errors, marker).toContain('Architecture Decision Record: What release level does this manual describe?: Evidence must not include contradictory technical addendum failure markers');
      expect(result.errors, marker).toContain('Publication Decision: Required release-note updates must not include contradictory technical addendum failure markers');
      expect(result.errors, marker).toContain('Publication Decision: Required checklist updates must not include contradictory technical addendum failure markers');
      expect(result.errors, marker).toContain('Reviewer Sign-Off: Architecture owner: notes must not include contradictory technical addendum failure markers');
    }

    const success = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Clean checkout CI | final branch reproducibility; errors=[] failureTotal=0 | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0; errors=[] failureTotal=0 | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0; Release gate status = pass; Testnet production-candidate claim allowed = yes-after-release-gate-pass; errors=[] failureTotal=0',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0; Release gate status = pass; Testnet production-candidate claim allowed = yes-after-release-gate-pass; errors=[] failureTotal=0',
    }));

    expect(success.status).toBe('PASS');
  });

  it('allows technical addendum evidence that explicitly reports no open or known issues', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Clean checkout CI | final branch reproducibility; Open issues: 0 | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0; Known issues: none | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ),
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md command output: PASS exit code 0; Open issues: no',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md command output: PASS exit code 0; Known issues: n/a',
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('rejects technical addendum evidence with zero issue closures plus leading nonzero unresolved counts', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Clean checkout CI | final branch reproducibility; Open issues: 0; 1 unresolved issue | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Gate Map: Clean checkout CI: Required evidence must not include contradictory technical addendum failure markers',
    );
  });

  it('rejects technical addendum evidence that keeps an exit-code placeholder', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS exit code 0/1 | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers',
    );
  });

  it('rejects technical addendum evidence with compatibility-normalized failure markers', () => {
    const contradictoryEvidence =
      'command output: PASS exit code 0 technical addendum validation\uFF1ABLOCKED with \uFF11 structural issue';
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        `| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md ${contradictoryEvidence} | linked | testnet-only; production-ready blocked; mainnet blocked |`,
      ),
      releaseNoteUpdates:
        `completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md ${contradictoryEvidence}`,
      checklistUpdates:
        `completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md ${contradictoryEvidence}`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory technical addendum failure markers',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory technical addendum failure markers',
    );
  });

  it('rejects technical addendum evidence that keeps structural issue count placeholders', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      gateRows: manualGateRows().replace(
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md | linked | testnet-only; production-ready blocked; mainnet blocked |',
        '| Clean checkout CI | final branch reproducibility | artifact://addendum/completed-clean-checkout-evidence.md command output: PASS structural issues = 0/1 | linked | testnet-only; production-ready blocked; mainnet blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Evidence Gate Map: Clean checkout CI: Artifact must not include contradictory technical addendum failure markers',
    );
  });

  it('rejects production-ready or mainnet deployment approval', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      productionReadyAllowed: 'yes',
      mainnetAllowed: 'yes',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: Production-ready claim allowed must be no');
    expect(result.errors).toContain('Publication Decision: Mainnet deployment claim allowed must be no');
  });

  it('rejects publication updates that smuggle mainnet or production-ready claims', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md approves mainnet production deployment wording',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md approves production-ready release claim wording',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not contain production-ready claim wording',
    );
  });

  it('rejects reviewer summaries that use production-ready claim-blocked shorthand', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; production ready claims are blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention production-ready claim handling',
    );
  });

  it('requires exact release-supported wording in reviewer decision summaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support: production deployment candidate; architecture manual evidence linked; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  });

  it('rejects reviewer summaries with placeholder tails on required decision bindings', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate/testnet-only; architecture manual evidence linked; production-ready claim handling: Production-ready claim allowed = no/yes; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass/no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('requires exact production-ready claim denial in reviewer decision summaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; production-ready claim handling blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  });

  it('requires exact testnet production-candidate claim allowance in reviewer decision summaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling allowed after release gate pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('rejects reviewer summaries that use testnet production-candidate claim-allowed shorthand', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; production-ready claim handling: Production-ready claim allowed = no; testnet production candidate claims are allowed after release gate pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must mention testnet production-candidate claim handling',
    );
  });

  it('rejects publication updates with placeholder tails on release-gate and claim bindings', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        'completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md; Release gate status = pass/fail; Testnet production-candidate claim allowed = yes-after-release-gate-pass/no',
      checklistUpdates:
        'completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md; Release gate status = pass/fail; Testnet production-candidate claim allowed = yes-after-release-gate-pass/no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Release gate status = pass; prose-only release-gate pass wording is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Release gate status = pass; prose-only release-gate pass wording is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass; prose-only testnet production-candidate claim wording is not accepted',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass; prose-only testnet production-candidate claim wording is not accepted',
    );
  });

  it('rejects contradictory exact technical addendum decision bindings in publication evidence', () => {
    const contradictoryDecisionBindings =
      'Release supported = production deployment candidate; Release supported = institutional reference; ' +
      'Release gate status = pass; Release gate status = fail; ' +
      'Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
      'Mainnet deployment claim allowed = no; Mainnet deployment claim allowed = yes; ' +
      'Testnet production-candidate claim allowed = yes-after-release-gate-pass; Testnet production-candidate claim allowed = no';
    const result = validateTechnicalAddendumEvidence(manual({
      releaseNoteUpdates:
        `completed Phase 007 release-note update evidence artifact://addendum/completed-phase007-release-note-update.md; ${contradictoryDecisionBindings}`,
      checklistUpdates:
        `completed Phase 007 checklist update evidence artifact://addendum/completed-phase007-checklist-update.md; ${contradictoryDecisionBindings}`,
      reviewerSummary:
        `release support: ${contradictoryDecisionBindings}; architecture manual evidence linked; ` +
        'production-ready claim handling: Production-ready claim allowed = no; Production-ready claim allowed = yes; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; Testnet production-candidate claim allowed = no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Required release-note updates must not include contradictory technical addendum decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Required checklist updates must not include contradictory technical addendum decision bindings',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not include contradictory technical addendum decision bindings',
    );
  });

  it('rejects reviewer summaries that approve node-wallet as the production signer path', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; production ready claims are blocked; testnet production candidate claims are allowed after release gate pass; signer path approves node-wallet as the production path',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: node-wallet must not be approved as the production signer path',
    );
  });

  it('rejects architecture decision rows that approve node-wallet as the production signer path', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed and node-wallet is approved as the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        '| What blocks mainnet production-ready claims? | mainnet production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Architecture Decision Record: Which signer path is allowed?: node-wallet must be explicitly excluded as the production signer path',
    );
  });

  it('rejects reviewer summaries that treat broadcast enablement as transaction broadcast approval', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; production ready claims are blocked; testnet production candidate claims are allowed after release gate pass; BRIDGE_BROADCAST_ENABLED=true authorizes transaction broadcast',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
  });

  it('rejects reviewer summaries with copula approval terms around forbidden architecture boundaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        'node-wallet production path is authorized; global BRIDGE_BROADCAST_ENABLED=true broadcast is cleared; ' +
        'testnet production-candidate claims are authorized before release gate pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: node-wallet must not be approved as the production signer path',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claims require release gate pass before public claim',
    );
  });

  it('rejects reviewer summaries with endorsed forbidden architecture boundaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        'node-wallet production path is certified; global BRIDGE_BROADCAST_ENABLED=true broadcast is recommended; ' +
        'testnet production-candidate claims are accredited before release gate pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: node-wallet must not be approved as the production signer path',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claims require release gate pass before public claim',
    );
  });

  it('rejects reviewer summaries with compatibility-normalized forbidden architecture approval wording', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        '\uFF4E\uFF4F\uFF44\uFF45\uFF0D\uFF57\uFF41\uFF4C\uFF4C\uFF45\uFF54 production path is \uFF41\uFF55\uFF54\uFF48\uFF4F\uFF52\uFF49\uFF5A\uFF45\uFF44; ' +
        'BRIDGE_BROADCAST_ENABLED=true \uFF41\uFF55\uFF54\uFF48\uFF4F\uFF52\uFF49\uFF5A\uFF45\uFF53 transaction broadcast; ' +
        'testnet production candidate claims are \uFF41\uFF55\uFF54\uFF48\uFF4F\uFF52\uFF49\uFF5A\uFF45\uFF44 before release gate pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: node-wallet must not be approved as the production signer path',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claims require release gate pass before public claim',
    );
  });

  it('rejects architecture decision rows that treat broadcast enablement as transaction broadcast approval', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        '| What blocks mainnet production-ready claims? | mainnet production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence before wording is used | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and authorizes transaction broadcast | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Architecture Decision Record: How is live broadcast authorized?: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
  });

  it('accepts reviewer summaries that require scoped approval before broadcast enablement', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence; no transaction broadcast is authorized by this manual',
    }));

    expect(result.status).toBe('PASS');
  });

  it('rejects reviewer summaries that allow testnet production-candidate claims before release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'release support production deployment candidate; architecture manual evidence linked; production ready claims are blocked; testnet production candidate claims are allowed before release gate pass',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claims require release gate pass before public claim',
    );
  });

  it('rejects architecture decision rows that allow testnet production-candidate claims before release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      decisionRows: [
        '| What release level does this manual describe? | production deployment candidate for testnet-scoped use only | artifact://addendum/completed-release-level-decision.md | linked |',
        '| Which signer path is allowed? | ergo-lib-wasm-nodejs sigma-rust WASM signer is allowed; node-wallet is not the production path | artifact://addendum/completed-signer-path-decision.md | linked |',
        '| What blocks mainnet production-ready claims? | mainnet production-ready claims are forbidden and out of scope | artifact://addendum/completed-mainnet-blocker-decision.md | linked |',
        '| What must pass before testnet production-candidate wording? | release:gate must pass with all gates completed evidence, but testnet production candidate claims are allowed before release gate pass | release:gate PASS Structural issues = 0 artifact://addendum/completed-release-gate-pass.log; completed release gate decision evidence artifact://addendum/completed-release-gate-decision.md | linked |',
        '| Which trustless-burn limitation remains? | trusted-oracle burn limitation remains until Phase 011 trustless burn evidence | artifact://addendum/completed-trustless-burn-limitation.md | linked |',
        '| How is live broadcast authorized? | BRIDGE_BROADCAST_ENABLED=true requires explicit approval and scoped shell evidence | artifact://addendum/completed-broadcast-authorization.md | linked |',
        '| How are recovery and rollback evidenced? | recovery runbooks plus SQLite/AVL restore evidence and rollback evidence | artifact://addendum/completed-recovery-decision.md | linked |',
        '| How are benchmark and scaling claims bounded? | benchmark evidence and live sharded settlement evidence bound scaling claims | artifact://addendum/completed-benchmark-decision.md | linked |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Architecture Decision Record: What must pass before testnet production-candidate wording?: testnet production-candidate claims require release gate pass before public claim',
    );
  });

  it('rejects reviewer sign-off notes that approve node-wallet as the production signer path', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate approved and node-wallet is the production signer path |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not approve node-wallet as the production signer path',
    );
  });

  it('rejects reviewer sign-off notes that treat broadcast enablement as transaction broadcast approval', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate approved and BRIDGE_BROADCAST_ENABLED=true authorizes transaction broadcast |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not treat BRIDGE_BROADCAST_ENABLED=true as transaction broadcast approval',
    );
  });

  it('rejects reviewer sign-off notes that allow testnet production-candidate claims before release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate approved and testnet production candidate claims are allowed before release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must require release gate pass before testnet production-candidate claims',
    );
  });

  it('rejects reviewer evidence that leaves testnet claim approval pending release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        'testnet production-candidate claim approval pending release gate pass',
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate reviewed; testnet production-candidate claim approval pending release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave testnet production-candidate claim approval pending release gate pass',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not leave testnet production-candidate claim approval pending release gate pass',
    );
  });

  it('rejects reviewer evidence that leaves testnet claim approval awaiting release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        'testnet production-candidate claim approval awaiting release gate pass',
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate reviewed; testnet production-candidate claim approval awaiting release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave testnet production-candidate claim approval pending release gate pass',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not leave testnet production-candidate claim approval pending release gate pass',
    );
  });

  it('rejects reviewer evidence that leaves testnet claim approval waiting for release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        'testnet production-candidate claim approval waiting for release gate pass',
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate reviewed; testnet production-candidate claim approval waiting on release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Decision: Reviewer decision summary must not leave testnet production-candidate claim approval pending release gate pass',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must not leave testnet production-candidate claim approval pending release gate pass',
    );
  });

  it('rejects reviewer sign-off notes that approve forbidden architecture boundaries before naming them', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; approved node-wallet production signer path |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved; approved global BRIDGE_BROADCAST_ENABLED=true broadcast |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate approved; approved testnet production-candidate claims before release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Architecture owner: notes must not approve node-wallet as the production signer path',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not treat BRIDGE_BROADCAST_ENABLED=true as transaction broadcast approval',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must require release gate pass before testnet production-candidate claims',
    );
  });

  it('rejects reviewer sign-off notes with compatibility-normalized forbidden architecture approval wording', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual reviewed for gated testnet claim boundary; \uFF41\uFF50\uFF50\uFF52\uFF4F\uFF56\uFF45 \uFF4E\uFF4F\uFF44\uFF45\uFF0D\uFF57\uFF41\uFF4C\uFF4C\uFF45\uFF54 production signer path |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary reviewed and blocked mainnet wording preserved; \uFF50\uFF45\uFF52\uFF4D\uFF49\uFF54 global BRIDGE_BROADCAST_ENABLED=true broadcast |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate boundary reviewed; \uFF43\uFF4C\uFF45\uFF41\uFF52 testnet production candidate claims before release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Architecture owner: notes must not approve node-wallet as the production signer path',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not treat BRIDGE_BROADCAST_ENABLED=true as transaction broadcast approval',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must require release gate pass before testnet production-candidate claims',
    );
  });

  it('rejects reviewer sign-off notes with base active verbs before forbidden architecture boundaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual reviewed for gated testnet claim boundary; approve node-wallet production signer path |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary reviewed and blocked mainnet wording preserved; permit global BRIDGE_BROADCAST_ENABLED=true broadcast |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate boundary reviewed; clear testnet production-candidate claims before release gate pass |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Architecture owner: notes must not approve node-wallet as the production signer path',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not treat BRIDGE_BROADCAST_ENABLED=true as transaction broadcast approval',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Operator reviewer: notes must require release gate pass before testnet production-candidate claims',
    );
  });

  it('accepts reviewer text that approves evidence lacks forbidden architecture boundaries', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerSummary:
        'Release supported = production deployment candidate; architecture manual evidence linked; ' +
        'production-ready claim handling: Production-ready claim allowed = no; ' +
        'testnet production-candidate claim handling: Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
        'evidence lacks node-wallet production signer path approved by reviewer; ' +
        'reviewer approved evidence lacks global BRIDGE_BROADCAST_ENABLED=true broadcast',
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; evidence lacks node-wallet production signer path approved by reviewer |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved; reviewer approved evidence lacks global BRIDGE_BROADCAST_ENABLED=true broadcast |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate and no transaction broadcast boundary approved |',
      ].join('\n'),
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary: node-wallet must not be approved as the production signer path',
    );
    expect(result.errors).not.toContain(
      'Publication Decision: Reviewer decision summary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Architecture owner: notes must not approve node-wallet as the production signer path',
    );
    expect(result.errors).not.toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not treat BRIDGE_BROADCAST_ENABLED=true as transaction broadcast approval',
    );
  });

  it('rejects reviewer sign-off notes with production-ready or mainnet production claim wording', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      reviewerRows: [
        '| Architecture owner | A. Shannon | approve | 2026-05-20 | architecture manual approved for gated testnet claim boundary; production-ready architecture manual claim approved |',
        '| Security reviewer | A. Shannon | approve | 2026-05-20 | claim boundary approved and blocked mainnet wording preserved; mainnet production deployment claim accepted |',
        '| Operator reviewer | A. Shannon | approve | 2026-05-20 | release gate and no transaction broadcast boundary approved |',
      ].join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Architecture owner: notes must not contain production-ready claim wording',
    );
    expect(result.errors).toContain(
      'Reviewer Sign-Off: Security reviewer: notes must not contain mainnet production claim wording',
    );
  });

  it('rejects security boundaries that approve node-wallet after stating the required exclusion', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      securityBoundary:
        'The allowed settlement signing path is ergo-lib-wasm-nodejs through sigma-rust WASM. The ContextExtension guard remains fail-closed. node-wallet signing is not the production path. node-wallet is the production signer path.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Security Boundary: node-wallet must not be approved as the production signer path',
    );
  });

  it('rejects operational boundaries that treat broadcast enablement as transaction broadcast approval', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      operationalBoundary:
        'This manual performs no transaction broadcast. Live operations require explicit approval, scoped BRIDGE_BROADCAST_ENABLED=true, readiness checks, and release:gate evidence before any testnet claim is used. BRIDGE_BROADCAST_ENABLED=true authorizes transaction broadcast.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operational Boundary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
  });

  it('rejects operational boundaries that allow testnet production-candidate claims before release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      operationalBoundary:
        'This manual performs no transaction broadcast. Live operations require explicit approval, scoped BRIDGE_BROADCAST_ENABLED=true, readiness checks, and release:gate evidence before any testnet claim is used. testnet production candidate claims are allowed before release gate pass.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operational Boundary: testnet production-candidate claims require release gate pass before public claim',
    );
  });

  it('rejects production deployment candidate support outside testnet', () => {
    const result = validateTechnicalAddendumEvidence(manual({ environment: 'patched devnet' }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Manual Classification: production deployment candidate support requires Environment testnet');
    expect(result.errors).toContain('Publication Decision: production deployment candidate support requires Environment testnet');
  });

  it('rejects testnet claim support before release gate pass', () => {
    const result = validateTechnicalAddendumEvidence(manual({
      releaseGateStatus: 'blocked',
      testnetClaimAllowed: 'no',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Publication Decision: Release gate status must be pass');
    expect(result.errors).toContain('Publication Decision: Testnet production-candidate claim allowed must be yes-after-release-gate-pass');
  });
});
