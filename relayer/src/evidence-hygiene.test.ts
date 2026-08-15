import { describe, expect, it } from 'vitest';

import {
  hasConditionalValidationApprovalMarker,
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';

describe('evidence hygiene validation', () => {
  it('passes ordinary evidence prose and redacted secret placeholders', () => {
    const result = validateEvidenceHygiene(
      [
        'Completed command output is linked as artifact://evidence/run.log.',
        'Operator confirmed .env contents were not pasted.',
        'signing key: redacted',
        'signing_' + 'key=<redacted>',
        'mnemonic' + '=<redacted>',
        'WALLET_' + 'MNEMONIC' + '=<redacted>',
        'BRIDGE_' + 'SIGNING_' + 'KEY=<redacted>',
        'CI_ACCESS_' + 'TOKEN=[redacted]',
        'RUN_SESSION_' + 'TOKEN=<redacted>',
        'GITHUB_' + 'TOKEN=<redacted>',
        'NPM_' + 'TOKEN=[redacted]',
        'AWS_' + 'ACCESS_' + 'KEY_' + 'ID=redacted',
        'AWS_' + 'SECRET_' + 'ACCESS_' + 'KEY=<redacted>',
        'SLACK_' + 'WEBHOOK_' + 'URL=[redacted]',
        '"GITHUB_' + 'TOKEN": "redacted"',
        '"WALLET_' + 'MNEMONIC": "redacted"',
        '"AWS_' + 'SECRET_' + 'ACCESS_' + 'KEY": "<redacted>"',
        '"SLACK_' + 'WEBHOOK_' + 'URL": "[redacted]"',
        'OIDC_' + 'JWT=redacted',
        'SECRET_' + 'KEY=[redacted]',
        'SECRET=<redacted>',
        'Authorization: ' + 'Bearer ' + 'redacted',
        'Authorization: ' + 'Basic ' + '<redacted>',
        'Proxy-Authorization: ' + 'Bearer ' + '[redacted]',
        'X-API-Key: <redacted>',
        'X-Auth-Token: [redacted]',
        'Redacted DSN: postgres://bridge:redacted@db.invalid/state',
        'Redacted remote URL: https://redacted@ci.example.invalid/run',
        'Cook' + 'ie: ' + '[redacted]',
        'client_' + 'secret=<redacted>',
        'SQLite backup is local operator state, not consensus.',
        'Evidence excludes secrets, runtime databases, and diagnostic dumps.',
        'Clean scan artifact: artifact://ci/no-local-runtime-state-is-staged.log',
        'Endpoint checked: /transactions/check',
      ].join('\n'),
      'Evidence',
    );

    expect(result).toEqual([]);
  });

  it('blocks local paths, workspace identifiers, and secret assignments', () => {
    const result = validateEvidenceHygiene(
      [
        `Log path: ${['C:', 'Users', 'alice', 'bridge', 'run.log'].join('\\')}`,
        `Temp path: ${['D:', 'tmp', 'bridge-prod-worktree', 'run.log'].join('\\')}`,
        `Slash path: ${['E:', 'tmp', 'bridge-prod-worktree', 'run.log'].join('/')}`,
        `UNC path: ${['', '', 'build-host', 'share', 'bridge', 'run.log'].join('\\')}`,
        'POSIX path: /tmp/bridge-prod-worktree/evidence/run.log',
        'Artifact URL: file:///' + ['C:', 'tmp', 'bridge-prod-worktree', 'run.log'].join('/'),
        `Workspace: ${'ANTI' + 'GRAVITY'}`,
        `Runtime file: secrets.${'dlog'}`,
        ['-----BEGIN', 'OPENSSH', 'KEY-----'].join(' '),
        ['-----BEGIN', 'PGP', 'KEY', 'BLOCK-----'].join(' '),
        ['-----BEGIN', 'SENSITIVE', 'KEY-----'].join(' '),
        'Runtime DB artifact: artifact://restore/state.sqlite',
        'Runtime WAL artifact: evidence/state.sqlite-wal',
        'Runtime SHM link: [state](evidence/state.sqlite-shm)',
        'Deployment state artifact: artifact://deploy/deployed_state.json',
        'Diagnostic dump artifact: evidence/diagnostic-dump.zip',
        'Runtime state artifact: evidence/runtime-state.json',
        'Absolute security claim: user funds are safe and the bridge is risk-free',
        'Run URL: https://ci.example.invalid/run/123?access_' + 'token=' + 'abc123',
        'Remote URL: https://ci-user:' + 'abc123' + '@ci.example.invalid/run/123',
        'Token URL: https://' + 'abc123' + '@ci.example.invalid/run/123',
        'Database URL: postgres://bridge:' + 'abc123' + '@db.invalid/state',
        'Artifact URL: artifact://release/run.log?client_' + 'secret=' + 'abc123',
        'Relative evidence link: ../evidence/run.md#api_' + 'key=' + 'abc123',
        'Bare evidence link: evidence/run.md?refresh_' + 'token=' + 'abc123',
        'Markdown evidence link: [run](evidence/run.md?auth_' + 'token=' + 'abc123)',
        'Authorization: ' + 'Bearer ' + 'abc123',
        'Authorization: ' + 'Basic ' + 'abc123',
        'Authorization: ' + 'Token ' + 'abc123',
        'Proxy-Authorization: ' + 'Bearer ' + 'abc123',
        'X-API-Key: ' + 'abc123',
        'X-Auth-Token: ' + 'abc123',
        'X-Access-Token: ' + 'abc123',
        'Cook' + 'ie: ' + 'session=abc123',
        'client_' + 'secret=' + 'abc123',
        'pass' + 'word=' + 'abc123',
        'WALLET_' + 'MNEMONIC' + '=' + 'abandon abandon abandon',
        'BRIDGE_' + 'SIGNING_' + 'KEY=' + 'abc123',
        'ERGO_NODE_API_' + 'KEY=' + 'abc123',
        'CI_ACCESS_' + 'TOKEN=' + 'abc123',
        'REVIEW_CLIENT_' + 'SECRET=' + 'abc123',
        'RUN_SESSION_' + 'TOKEN=' + 'abc123',
        'CI_BEARER_' + 'TOKEN=' + 'abc123',
        'GITHUB_' + 'TOKEN=' + 'abc123',
        'NPM_' + 'TOKEN=' + 'abc123',
        'AWS_' + 'ACCESS_' + 'KEY_' + 'ID=' + 'abc123',
        'AWS_' + 'SECRET_' + 'ACCESS_' + 'KEY=' + 'abc123',
        'SLACK_' + 'WEBHOOK_' + 'URL=' + 'https://hooks.example.invalid/token',
        '"GITHUB_' + 'TOKEN": "' + 'abc123' + '"',
        '"WALLET_' + 'MNEMONIC": "' + 'abandon abandon abandon' + '"',
        '"AWS_' + 'SECRET_' + 'ACCESS_' + 'KEY": "' + 'abc123' + '"',
        '"SLACK_' + 'WEBHOOK_' + 'URL": "https://hooks.example.invalid/token"',
        'OIDC_' + 'JWT=' + 'abc123',
        'SECRET_' + 'KEY=' + 'abc123',
        'SECRET=' + 'abc123',
        'signing_' + 'key=' + 'abc123',
        'mnemonic' + ' = abandon abandon abandon',
      ].join('\n'),
      'Evidence',
    );

    expect(result).toContain('Evidence: evidence hygiene must not contain local Windows absolute paths');
    expect(result).toContain('Evidence: evidence hygiene must not contain local POSIX absolute paths');
    expect(result).toContain('Evidence: evidence hygiene must not contain local file URLs');
    expect(result).toContain('Evidence: evidence hygiene must not contain local workspace identifiers');
    expect(result).toContain('Evidence: evidence hygiene must not contain secret dlog references');
    expect(result).toContain('Evidence: evidence hygiene must not contain key material block markers');
    expect(result).toContain(
      'Evidence: evidence hygiene must not contain runtime database, deployment-state, or diagnostic dump artifacts',
    );
    expect(result).toContain('Evidence: evidence hygiene must not contain absolute security wording');
    expect(result).toContain('Evidence: evidence hygiene must not contain credential-bearing URLs or evidence links');
    expect(result).toContain(
      'Evidence: evidence hygiene must not contain Authorization, Cookie, or API-key credential headers',
    );
    expect(result).toContain(
      'Evidence: evidence hygiene must not contain mnemonic, signing-key, secret-key, seed, or API-key assignments',
    );
    expect(result).toContain(
      'Evidence: evidence hygiene must not contain password, client-secret, secret, JWT, generic token, cloud access-key, or webhook-url assignments',
    );
  });

  it('detects plural structured validation failure totals', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; errors=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; failures: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; issues: ["missing release row"]')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; structuralIssues: ["missing release row"]')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; errorsTotal=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; failures_total: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; issuesTotal=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; issue_count: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; structuralIssuesTotal=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; structural_issue_count: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; exitCode=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; exit_status: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; processExitCode: 3')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; "errors": "1"')).toBe(true);
    expect(hasStructuredValidationFailureMarker("command output PASS; 'failures_total'='2'")).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; exitCode="1"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; errors=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; failures: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; issues: []')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; structuralIssues: []')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; errorsTotal=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; failures_total: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; issuesTotal=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; issue_count: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; structuralIssuesTotal=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; structural_issue_count: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; exitCode=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; exit_status: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; processExitCode: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; "errors": "0"')).toBe(false);
    expect(hasStructuredValidationFailureMarker("command output PASS; 'failures_total'='0'")).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; exitCode="0"')).toBe(false);
  });

  it('detects structured boolean validation failure markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; success=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; passed: false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; ok = no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validation_success=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; gate.passed: no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; failed=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; failure: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; error = true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; "success": "false"')).toBe(true);
    expect(hasStructuredValidationFailureMarker("command output PASS; 'failed'='true'")).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; success=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; passed: yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; ok = true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validation_success=yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; gate.passed: true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; failed=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; failure: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; error = false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; hasNoFailures=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; disableBroadcast=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; broadcast_blocked=true')).toBe(false);
  });

  it('detects structured string validation failure markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="failed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker("command output PASS; validator.status='errored'")).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; command_result: "error"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome=blocked')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; run.verdict: failed')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="passed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker("command output PASS; validator.status='ok'")).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; command_result: "success"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome=completed')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; run.verdict: pass')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; status=blocked')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; releaseGateStatus=BLOCKED')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; claimStatus=blocked')).toBe(false);
  });

  it('detects conditional validation approval markers', () => {
    expect(hasConditionalValidationApprovalMarker('command output PASS; runOutcome="approval required"')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation approved with conditions')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation qualified approval')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation accepted subject to reviewer sign-off')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation pass subject to security review')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation requires reviewer sign-off')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation awaiting reviewer sign-off')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation pending approval')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval remains pending')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review is deferred')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off stays open')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was outstanding')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval is still pending')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review still pending')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off currently open')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval now deferred')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval not yet complete')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review not yet approved')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off not yet received')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not yet granted')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval has not been completed')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review has not been approved')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off has not been received')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has not been granted')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval remains incomplete')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review is unapproved')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off remains unreceived')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval remains ungranted')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval is unfinalized')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval incomplete')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review unapproved')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off unreceived')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval ungranted')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval unfinalized')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval denied')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review is rejected')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off refused')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval declined')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was denied')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has been rejected')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval revoked')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review is withdrawn')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off rescinded')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval voided')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was revoked')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has been invalidated')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval expired')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review is stale')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off lapsed')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval outdated')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was obsolete')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has expired')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has been superseded')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval failed')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review is unsuccessful')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off aborted')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval canceled')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was cancelled')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has failed')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has been aborted')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval did not pass')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation subject to reviewer approval')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation blocked until security review')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation gated on reviewer sign-off')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation approval outstanding')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation missing reviewer sign-off')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation contingent on reviewer approval')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation conditioned on security review')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation approval to follow')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation reviewer sign-off tbd')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval scheduled')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review planned')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; benchmark validation reviewer sign-off forthcoming')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval upcoming')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review later')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval post-release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review after release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review future release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval next milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review future milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval subsequent release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review following release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval subsequent milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval slated for next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review queued for following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval delayed until next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review postponed to following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval shifted to next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review rescheduled for following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval tabled until next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review held for following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval shelved until next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review shelved for following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval held over to next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review suspended until following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval paused until next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval bumped to next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review slipped until following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval punted to next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review backlogged for following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval on hold until next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review parked until following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval put off until next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval pushed back to next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review moved to following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation reviewer approval carried over to next release')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review rolled over to following milestone')).toBe(true);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release notes validation approved')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approved without conditions')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation no approval required')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation no pending approval')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval is not pending')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review was not deferred')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation sign-off does not stay open')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was not outstanding')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval is not still pending')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not still pending')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation sign-off currently not open')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not now deferred')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation no not-yet approval blocker')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not-yet marker absent')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not required')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not required')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has not been denied')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was not rejected')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not denied')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not approval denied')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has not been revoked')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was not withdrawn')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not rescinded')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not approval revoked')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has not expired')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval was not stale')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not lapsed')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not approval expired')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has not failed')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review was not unsuccessful')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation reviewer sign-off not aborted')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has not been cancelled')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not approval failed')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval did pass')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval has been granted')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval remains approved')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval is complete')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval is finalized')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval approved')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval complete')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval finalized')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation no approval incomplete')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not incomplete')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not subject to reviewer approval')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not blocked until security review')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation no missing reviewer sign-off')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not contingent on reviewer approval')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation not conditioned on security review')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not tbd')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not scheduled')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not planned')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation sign-off not forthcoming')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not upcoming')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not later')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not post-release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not after release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not future release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not next milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not future milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not subsequent release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not following release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not subsequent milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not slated for next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not queued for following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not delayed until next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not postponed to following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not shifted to next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not rescheduled for following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not tabled until next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not held for following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation security review held with completed minutes')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not shelved until next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not held over to next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not suspended until following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not paused until next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not bumped to next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not slipped until following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not punted to next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not backlogged for following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not on hold until next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not parked until following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not put off until next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not pushed back to next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not moved to following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation approval not carried over to next release')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('command output PASS; release validation review not rolled over to following milestone')).toBe(false);
    expect(hasConditionalValidationApprovalMarker('explicit live broadcast approval required before use')).toBe(false);
  });

  it('detects structured validity failure markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; valid=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationValid=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validator.valid: no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerified=no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; command.validated: false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; invalid=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationInvalid: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationOutcome="invalid"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationResult: "not valid"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; valid=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationValid=yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validator.valid: true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerified=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; command.validated: yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; invalid=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationInvalid: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationOutcome="valid"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationResult: "verified"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; claimValid=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; broadcastVerified=false')).toBe(false);
  });

  it('detects structured incomplete or skipped validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; completed=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationCompleted=no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandSkipped=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkSkipped: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; timedOut=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationTimedOut: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandTimeout=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="skipped"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="timed out"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validatorResult="cancelled"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="aborted"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; completed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationCompleted=yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandSkipped=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkSkipped: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; timedOut=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationTimedOut: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandTimeout=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="completed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="not skipped"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; retrySkipped=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; broadcastTimedOut=false')).toBe(false);
  });

  it('detects structured partial validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; partial=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationPartial: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; partiallyCompleted=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="partial"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="partially complete"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="partial"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; partial=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationPartial: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; partiallyCompleted=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="complete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="completed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="complete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; partialProofsAllowed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; partialContextAvailable=false')).toBe(false);
  });

  it('detects structured pending validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationPending=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandPending: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="pending"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="awaiting"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="deferred"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="unresolved"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationPending=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandPending: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="complete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="completed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="resolved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; pendingValidationAllowed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; pendingEvidenceContext=false')).toBe(false);
  });

  it('detects structured planned validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationPlanned=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandScheduled: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="not started"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="todo"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="tbd"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="not initiated"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationPlanned=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandScheduled: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="complete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="completed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="initiated"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; plannedValidationAllowed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; scheduledReviewContext=false')).toBe(false);
  });

  it('detects structured review-required validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationReviewRequired=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandApprovalRequired: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkFollowUpRequired=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="needs review"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="approval required"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="follow-up required"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationReviewRequired=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandApprovalRequired: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkFollowUpRequired=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="reviewed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="follow-up closed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; releaseGateRequired=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewRequiredBeforeBroadcast=true')).toBe(false);
  });

  it('detects structured conditional validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationConditional=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandProvisional: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkTentative=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="conditional"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="provisional"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="approved with conditions"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation accepted subject to reviewer sign-off')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation pass subject to security review')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation requires reviewer sign-off')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation awaiting reviewer sign-off')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval remains pending')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review is deferred')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off stays open')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was outstanding')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval is still pending')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review still pending')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off currently open')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval now deferred')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval not yet complete')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review not yet approved')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off not yet received')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval not yet granted')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval has not been completed')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review has not been approved')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off has not been received')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has not been granted')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval remains incomplete')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review is unapproved')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off remains unreceived')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval remains ungranted')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval is unfinalized')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval incomplete')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review unapproved')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off unreceived')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval ungranted')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval unfinalized')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval denied')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review is rejected')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off refused')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval declined')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was denied')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has been rejected')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval revoked')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review is withdrawn')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off rescinded')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval voided')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was revoked')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has been invalidated')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval expired')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review is stale')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off lapsed')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval outdated')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was obsolete')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has expired')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has been superseded')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval failed')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review is unsuccessful')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off aborted')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval canceled')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was cancelled')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has failed')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has been aborted')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval did not pass')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation subject to reviewer approval')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation blocked until security review')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation gated on reviewer sign-off')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation approval outstanding')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation missing reviewer sign-off')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation contingent on reviewer approval')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation conditioned on security review')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation approval to follow')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation reviewer sign-off tbd')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval scheduled')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review planned')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmark validation reviewer sign-off forthcoming')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval upcoming')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review later')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval post-release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review after release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review future release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval next milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review future milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval subsequent release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review following release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval subsequent milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval slated for next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review queued for following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval delayed until next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review postponed to following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval shifted to next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review rescheduled for following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval tabled until next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review held for following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval shelved until next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review shelved for following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval held over to next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review suspended until following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval paused until next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval bumped to next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review slipped until following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval punted to next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review backlogged for following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval on hold until next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review parked until following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval put off until next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval pushed back to next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review moved to following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release notes validation reviewer approval carried over to next release')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review rolled over to following milestone')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationConditional=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandProvisional: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkTentative=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="unconditional"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="final"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval remains approved')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval is complete')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval is finalized')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval approved')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval complete')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval finalized')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation no approval incomplete')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval not incomplete')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has not been denied')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was not rejected')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval not denied')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation not approval denied')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has not been revoked')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was not withdrawn')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval not rescinded')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation not approval revoked')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has not expired')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval was not stale')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval not lapsed')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation not approval expired')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has not failed')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation security review was not unsuccessful')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation reviewer sign-off not aborted')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval has not been cancelled')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation not approval failed')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; release validation approval did pass')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; conditionalClaimAllowed=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; conditionBoundaryDocumented=true')).toBe(false);
  });

  it('detects structured waived or bypassed validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationWaived=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandBypassed: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkIgnored=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="waived"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="suppressed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="bypassed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationWaived=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandBypassed: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkIgnored=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="enforced"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="checked"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="not bypassed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; waiverPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bypassProtectionEnabled=true')).toBe(false);
  });

  it('detects structured flaky or retry-only validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationFlaky=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandUnstable: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="flaky"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="unstable"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="intermittent"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="retry required"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRetryRequired=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationFlaky=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandUnstable: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="stable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="deterministic"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="repeatable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; retryPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; retrySkipped=false')).toBe(false);
  });

  it('detects structured expected-failure or quarantined validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationExpectedFailure=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandAllowedFailure: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkKnownFailure=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationQuarantined=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandXfail: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="expected failure"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="allowed failure"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="known failure"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="quarantined"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationExpectedFailure=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandAllowedFailure: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkKnownFailure=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationQuarantined=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandXfail: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; expectedFailureCasesCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; quarantinePolicyDocumented=true')).toBe(false);
  });

  it('detects structured overridden or force-passed validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationOverride=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandOverridden: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkForcePassed=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationManualOverride=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="overridden"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="manual override"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="force passed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="operator override"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationOverride=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandOverridden: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkForcePassed=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationManualOverride=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="enforced"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; overridePolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; forcePassProtectionEnabled=true')).toBe(false);
  });

  it('detects structured inconclusive or unverified validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationInconclusive=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandIndeterminate: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkUnknown=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationUnverified=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandUnconfirmed: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="inconclusive"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="undetermined"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="unknown"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandResult="unverified"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationInconclusive=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandIndeterminate: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkUnknown=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationUnverified=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandUnconfirmed: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="verified"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="confirmed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unknownRiskDocumented=true')).toBe(false);
  });

  it('detects structured warning or degraded validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; warnings=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; warningCount: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationWarning=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandDegraded: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkSoftFailed=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="warning"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="degraded"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="soft fail"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; warnings=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; warningCount: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationWarning=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandDegraded: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkSoftFailed=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="clean"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="nominal"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; warningPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; degradedModeDisabled=true')).toBe(false);
  });

  it('detects structured exception or crash validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; exceptions=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; exceptionCount: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationException=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandCrashed: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; panic=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; traceback: true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="crashed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="panic"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; exceptions=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; exceptionCount: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationException=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandCrashed: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; panic=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; traceback: false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="stable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; exceptionPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; crashDumpCollectionDisabled=true')).toBe(false);
  });

  it('detects structured stale or expired validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; stale=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; expired: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; outdated=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStale=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandExpired: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; gateSuperseded=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="stale"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="outdated"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; stale=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; expired: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; outdated=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStale=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandExpired: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="fresh"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="current"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; staleSingletonRecoveryEvidence=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; expiredEvidencePolicyDocumented=true')).toBe(false);
  });

  it('detects structured regression or downgrade validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; regressions=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; regressionCount: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRegressed=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkDowngraded: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runWorsened=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="regressed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="downgraded"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="worse"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; regressions=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; regressionCount: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRegressed=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkDowngraded: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runWorsened=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="improved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="stable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; regressionSuitePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; downgradeRiskDocumented=true')).toBe(false);
  });

  it('detects structured rejected or unapproved validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRejected=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkDenied: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalUnapproved=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewUnapproved: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditUnaudited=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="rejected"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="denied"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalStatus="unapproved"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRejected=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkDenied: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalUnapproved=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewUnapproved: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditUnaudited=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationStatus="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="accepted"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalStatus="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unapprovedClaimBlocked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; rejectedMainnetClaimBlocked=true')).toBe(false);
  });

  it('detects structured unsafe or insecure validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationUnsafe=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkInsecure: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; gateCompromised=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditUnsafe: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; safetyStatus="unsafe"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="insecure"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runOutcome="compromised"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationUnsafe=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkInsecure: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; gateCompromised=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditUnsafe: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; safetyStatus="safe"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkVerdict="secure"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unsafeClaimBlocked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; insecurePathDisabled=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; compromisedPathBlocked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; safetyPolicyDocumented=true')).toBe(false);
  });

  it('detects structured security-risk validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationVulnerable=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; securityExploitable: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; riskHighRisk=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditCriticalRisk: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; securityStatus="vulnerable"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; riskStatus="high risk"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; severityStatus="critical"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationVulnerable=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; securityExploitable: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; riskHighRisk=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditCriticalRisk: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; securityStatus="cleared"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; riskStatus="low"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; severityStatus="low"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; vulnerabilityTriaged=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; riskMitigationDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; criticalFindingsOpen=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; highRiskPathDisabled=true')).toBe(false);
  });

  it('detects structured integrity or tamper validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; validationTampered=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactCorrupt: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; proofForged=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditFabricated: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; integrityStatus="corrupt"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactStatus="tampered"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; proofVerdict="forged"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationTampered=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactCorrupt: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; proofForged=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditFabricated: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; integrityStatus="intact"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactStatus="verified"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; proofVerdict="valid"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; tamperCheckPassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; corruptionRiskDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; forgeryRiskMitigated=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; integrityPolicyDocumented=true')).toBe(false);
  });

  it('detects structured signature or authenticity validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; signatureInvalid=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; signerMismatch: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactUnauthentic=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationUnauthenticated: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; signatureStatus="invalid"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; signerVerdict="mismatched"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; authenticityStatus="unauthenticated"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; signatureInvalid=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; signerMismatch: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactUnauthentic=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationUnauthenticated: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; signatureStatus="valid"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; signerVerdict="matched"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; authenticityStatus="verified"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; signaturePolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; signatureReviewComplete=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; signerRotationCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; authenticityEvidenceLinked=true')).toBe(false);
  });

  it('detects structured revoked or withdrawn validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalRevoked=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; attestationWithdrawn: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; certificationRescinded=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewVoided: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; certificationStatus="revoked"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; attestationVerdict="withdrawn"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalOutcome="rescinded"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalRevoked=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; attestationWithdrawn: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; certificationRescinded=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewVoided: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; certificationStatus="active"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; attestationVerdict="accepted"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalOutcome="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; revocationPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; withdrawalProcedureCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalRenewalScheduled=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; certificationRotationCovered=true')).toBe(false);
  });

  it('detects structured policy or compliance validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; policyViolation=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; complianceViolation: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationNoncompliant=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditOutOfPolicy: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; complianceStatus="noncompliant"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; policyStatus="out of policy"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditVerdict="non-compliant"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; policyViolation=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; complianceViolation: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationNoncompliant=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditOutOfPolicy: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; complianceStatus="compliant"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; policyStatus="within policy"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditVerdict="compliant"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; policyViolationDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; complianceReviewComplete=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; policyExceptionRejected=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; complianceEvidenceLinked=true')).toBe(false);
  });

  it('detects structured target or provenance drift validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; targetDrift=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingDiverged: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceDesynced=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkpointOutOfSync: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetStatus="drifted"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingVerdict="diverged"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceOutcome="out of sync"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetDrift=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingDiverged: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceDesynced=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkpointOutOfSync: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetStatus="matched"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingVerdict="aligned"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceOutcome="in sync"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetDriftReviewed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceDriftPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingDriftMitigated=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkpointSyncEvidenceLinked=true')).toBe(false);
  });

  it('detects structured binding or linkage validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; targetUnbound=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingUnlinked: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceUnmapped=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkpointDetached: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; sourceOrphaned=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingStatus="unlinked"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceOutcome="orphaned"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetUnbound=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingUnlinked: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceUnmapped=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkpointDetached: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; sourceOrphaned=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingStatus="linked"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; provenanceOutcome="mapped"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unlinkedTargetScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; detachedCheckpointCaseDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; orphanedSourceNegativeCasePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; bindingLinkEvidencePresent=true')).toBe(false);
  });

  it('detects structured conflict or inconsistency validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewConflict=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationContradictory: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditInconsistent=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; releaseStatus="conflicting"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome="contradictory"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; readinessVerdict="inconsistent"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewConflict=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationContradictory: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; auditInconsistent=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; releaseStatus="consistent"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome="aligned"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; readinessVerdict="non-contradictory"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; conflictPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; contradictoryScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; inconsistencyNegativeCasePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; consistencyEvidenceLinked=true')).toBe(false);
  });

  it('detects structured connectivity or availability validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; nodeReachable=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; rpcConnected: no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; dependencyAvailable=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; serviceResponsive: no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; networkStatus="unreachable"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; rpcOutcome="disconnected"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; endpointVerdict="unavailable"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; nodeReachable=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; rpcConnected: yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; dependencyAvailable=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; serviceResponsive: yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; networkStatus="reachable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; rpcOutcome="connected"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; endpointVerdict="available"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; offlineGateDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unreachableScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; dependencyUnavailableNegativeCasePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; disconnectedServiceRecoveryEvidenceLinked=true')).toBe(false);
  });

  it('detects structured capacity or quota validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; capacityExceeded=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; quotaExceeded: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; resourceExhausted=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; rateLimited: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmarkStatus="over limit"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; quotaOutcome="exceeded"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; resourceVerdict="exhausted"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; capacityExceeded=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; quotaExceeded: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; resourceExhausted=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; rateLimited: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; benchmarkStatus="within limit"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; quotaOutcome="not exceeded"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; resourceVerdict="available"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; capacityPlanningDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; quotaExceededNegativeCasePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; rateLimitPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; resourceExhaustionRecoveryEvidenceLinked=true')).toBe(false);
  });

  it('detects structured malformed artifact validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; jsonMalformed=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; schemaMalformed: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reportTruncated=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; transcriptUnreadable: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactStatus="malformed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reportOutcome="truncated"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; transcriptVerdict="unreadable"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; jsonMalformed=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; schemaMalformed: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reportTruncated=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; transcriptUnreadable: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactStatus="well formed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reportOutcome="complete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; transcriptVerdict="readable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; malformedArtifactNegativeCasePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; truncationPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unreadableTranscriptRecoveryEvidenceLinked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; schemaMalformedCaseCovered=true')).toBe(false);
  });

  it('detects structured fixture or synthetic artifact validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; fixtureEvidence=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; syntheticArtifact: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; mockedOutput=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; simulatedReport: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactStatus="synthetic"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; evidenceKind="fixture"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="placeholder"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; fixtureEvidence=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; syntheticArtifact: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; mockedOutput=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; simulatedReport: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactStatus="concrete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; evidenceKind="completed run"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="concrete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; sampleCount=3')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; templateRemovalAudit=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; mocknetEvidenceLinked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; syntheticNegativeCasePassed=true')).toBe(false);
  });

  it('detects structured duplicate or ambiguous evidence-target validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; duplicateTarget=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reusedEvidence: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; sharedOutput=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; ambiguousArtifact: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; genericReport=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; evidenceStatus="reused"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="ambiguous"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="generic"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; duplicateTarget=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reusedEvidence: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; sharedOutput=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; ambiguousArtifact: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; genericReport=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; evidenceStatus="distinct"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="specific"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="concrete"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; duplicateScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; deduplicationEvidenceLinked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; sharedCheckpointInvariant=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; genericDecoderTestPassed=true')).toBe(false);
  });

  it('detects structured private or local evidence-target validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; privateTarget=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; localOnlyEvidence: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; redactedReport=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runtimeStateArtifact: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; secretBearingOutput=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; credentialBearingJson: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="redacted"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="local only"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; privateTarget=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; localOnlyEvidence: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; redactedReport=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runtimeStateArtifact: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; secretBearingOutput=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; credentialBearingJson: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="public"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="release evidence"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; privateDisclosureChecked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; localOnlyTargetRejected=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runtimeStateNotSerialized=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; secretScanningEvidenceLinked=true')).toBe(false);
  });

  it('detects structured non-public evidence-target validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; confidentialTarget=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; restrictedEvidence: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; nonPublicReport=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; internalOnlyArtifact: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; personalDataOutput=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; userProfileJson: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="restricted"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="confidential"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; confidentialTarget=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; restrictedEvidence: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; nonPublicReport=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; internalOnlyArtifact: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; personalDataOutput=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; userProfileJson: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="public"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="shareable"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; confidentialityPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; restrictedScopeRejected=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; nonPublicClaimBlocked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; internalReviewEvidenceLinked=true')).toBe(false);
  });

  it('detects structured unreviewed or unattested evidence-target validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; unreviewedEvidence=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; unauditedArtifact: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; unsignedProof=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; unattestedTarget: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; unverifiedReport=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; unconfirmedJson: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="unattested"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="unreviewed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; unreviewedEvidence=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unauditedArtifact: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unsignedProof=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unattestedTarget: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unverifiedReport=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unconfirmedJson: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetVerdict="attested"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactKind="reviewed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unreviewedScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unsignedProofNegativeCasePassed=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unverifiedClaimBlocked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reviewEvidenceLinked=true')).toBe(false);
  });

  it('detects structured authorization or permission validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; authorizationDenied=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; permissionDenied: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; accessForbidden=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validatorUnauthorized: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; authorizationStatus="unauthorized"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; permissionVerdict="denied"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; accessOutcome="forbidden"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; authorizationDenied=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; permissionDenied: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; accessForbidden=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validatorUnauthorized: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; authorizationStatus="authorized"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; permissionVerdict="granted"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; accessOutcome="allowed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; unauthorizedAccessChecked=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; permissionDeniedScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; accessControlPolicyDocumented=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; authorizationEvidenceLinked=true')).toBe(false);
  });

  it('detects structured paused or suspended validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; releasePaused=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; gateSuspended: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validatorHalted=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationDeactivated: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkStatus="paused"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; releaseVerdict="suspended"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalOutcome="halted"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; releasePaused=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; gateSuspended: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validatorHalted=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationDeactivated: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkStatus="active"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; releaseVerdict="approved"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; approvalOutcome="running"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; broadcastMode="disabled"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; transitionalTrustedBurnPathDisabled=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; pauseScenarioCovered=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; haltProcedureDocumented=true')).toBe(false);
  });

  it('detects structured not-run validation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; commandExecuted=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRan=no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; notRun=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationNotExecuted: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; executionStatus="not run"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; runResult="not executed"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandOutcome="not invoked"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandExecuted=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationRan=yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; notRun=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationNotExecuted: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; executionStatus="executed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; runResult="completed"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; commandOutcome="invoked"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; broadcastNotExecuted=false')).toBe(false);
  });

  it('detects structured missing evidence target markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactPresent=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetFound=no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; outputAvailable=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; fileExists=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactPresent=0')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetFound: "0"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; outputAvailable=0')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; evidenceMissing=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; missingArtifact: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; transcriptStatus="not found"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; reportResult="absent"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; proofOutcome="unavailable"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactPresent=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetFound=yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; outputAvailable=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; fileExists=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; artifactPresent=1')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; targetFound: "1"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; outputAvailable=1')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; evidenceMissing=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; missingArtifact: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; transcriptStatus="found"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; reportResult="present"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; proofOutcome="available"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; missingBeforePublication=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; claimArtifactPresent=false')).toBe(false);
  });

  it('detects structured mismatch and violation markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatches=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatch_count: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; discrepanciesTotal=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; defects: ["bad row"]')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; violations: {"row":"bad"}')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatch=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationViolation: yes')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationResult="mismatched"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome="discrepancy"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatches=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatch_count: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; discrepanciesTotal=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; defects: []')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; violations: {}')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatch=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationViolation: no')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationResult="matched"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome="consistent"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; expectedMismatch=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; mismatchTolerance=true')).toBe(false);
  });

  it('detects structured missing required row markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; missingFields=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; missing_rows: 2')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredItemsMissing=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; required_field_missing=true')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; omittedRows: ["Gate 3 publication row"]')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; omissions: {"row":"missing"}')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; omissionCount=1')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationResult="missing required row"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome="omitted required field"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; missingFields=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; missing_rows: 0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredItemsMissing=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; required_field_missing=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; omittedRows: []')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; omissions: {}')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; omissionCount=0')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; validationResult="all required rows present"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; checkOutcome="required fields present"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; missingBeforePublication=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; missingContextAllowed=true')).toBe(false);
  });

  it('detects required evidence item presence failure markers', () => {
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredRowsPresent=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; required_fields_found: no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredArtifactsAvailable=false')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; allRequiredSectionsPresent=no')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredRowsPresent=0')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; required_fields_found: "0"')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredArtifactsAvailable=0')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; allRequiredSectionsPresent=0')).toBe(true);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredRowsPresent=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; required_fields_found: yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredArtifactsAvailable=true')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; allRequiredSectionsPresent=yes')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredRowsPresent=1')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; required_fields_found: "1"')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredArtifactsAvailable=1')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; allRequiredSectionsPresent=1')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; requiredContextPresent=false')).toBe(false);
    expect(hasStructuredValidationFailureMarker('command output PASS; operatorRequiredPresence=false')).toBe(false);
  });

  it('detects unresolved issue markers while allowing explicit closures', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining issues: follow-up pending')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining issues')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: unresolved signer blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining blockers: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining follow-ups: release checklist update')).toBe(true);
    expect(hasUnresolvedIssueMarker('- Remaining issues:')).toBe(true);
    expect(hasUnresolvedIssueMarker('- Remaining benchmark blockers:')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known issues: unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Outstanding issues: unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending issues: unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unresolved issues: signer blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Blocking issues: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open blockers: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unresolved follow-ups: release checklist update')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open findings: unresolved security review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending findings: unresolved security review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open vulnerabilities: unresolved dependency blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending vulnerability: unresolved dependency blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open benchmark blockers: unresolved benchmark blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending governance blockers: unresolved key-rotation blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issue = unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known issues - unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open findings - unresolved security review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending governance blockers - unresolved key-rotation blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining benchmark blockers - unresolved benchmark blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues \u2013 unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved review blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: 0; issue count 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings: none; findings total 2 outstanding')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining benchmark blockers: 0; benchmark blocker count 1 pending')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open vulnerabilities: no; vulnerability total 1 remaining')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: 0; 1 unresolved issue')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings: none; 2 outstanding findings')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open benchmark blockers: 0; 1 pending benchmark blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings 2 outstanding')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending vulnerabilities 1 remaining')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 issue unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 findings outstanding')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 vulnerability remaining')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues (1 unresolved)')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings [2 outstanding]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending vulnerabilities (1 remaining)')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unresolved issue count: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open vulnerability total = 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending blocker count: 2')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issue count > 0')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings total >= 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending blockers count above zero')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; "openIssues": 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; open_findings=2')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; pendingBlockers: 3')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; issuesOpen: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; findingsOutstanding=2')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; blockerCountPending: 3')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; "openIssues": true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; hasOpenFindings=true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; blockerCountPending: yes')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; "openIssues": ["approval blocker"]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; open_findings=[security blocker]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; pendingBlockers: {"id":"G3"}')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: ["approval blocker"]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings: {"id":"S1"}')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: false positive approval blocker pending')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining issues: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining blockers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining follow-ups: no')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no remaining issues')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; zero remaining blockers')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; without remaining follow-ups')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no remaining issues; Open issues: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known issues = 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Outstanding issues: no')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending issues: n/a')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Unresolved issues: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Blocking issues: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open blockers: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Unresolved follow-ups: no')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open findings: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending findings: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open vulnerabilities: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending vulnerability: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open benchmark blockers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending governance blockers: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining issues - none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open findings - none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending governance blockers - 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open vulnerabilities - n/a')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues \u2014 none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: n/a')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open issues')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: 0; issue count 0 unresolved')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: 0; 0 unresolved issues')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; 0 findings unresolved')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues (0 unresolved)')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Unresolved issue count: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open vulnerability total = 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending blocker count: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issue count = 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings total = none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; "openIssues": 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; open_findings=none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; pendingBlockers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; issuesOpen: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; findingsOutstanding=none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; blockerCountPending: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; "openIssues": false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; hasOpenFindings=no')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; hasNoOpenIssues: true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; "openIssues": []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; open_findings=[]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; pendingBlockers: {}')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings: {}')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open issues: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Known findings = false; validation PASS')).toBe(false);
  });

  it('detects active or residual unresolved issue markers while allowing explicit closures', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Active issues: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Residual blockers: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Active findings - security blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Residual vulnerabilities = dependency blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Active issues 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 residual findings')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; activeIssues: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; residualBlockers: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Active issues: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Residual blockers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no active issues')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; activeIssues: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; residualBlockers: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; activeApprovalWindow: true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; residualRiskDocumented=true')).toBe(false);
  });

  it('detects unaddressed, unclosed, or unmitigated issue markers while allowing explicit closures', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Unaddressed issues: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unclosed blockers: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unmitigated findings - security blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unmitigated vulnerabilities = dependency blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unaddressed issues 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 unmitigated vulnerabilities')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; unaddressedIssues: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; unclosedBlockers: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unaddressed issues: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Unclosed blockers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no unmitigated vulnerabilities')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unaddressedIssues: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unclosedBlockers: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unaddressedScenarioCovered=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unmitigatedRiskDocumented=true')).toBe(false);
  });

  it('detects unremediated, unfixed, or unpatched issue markers while allowing explicit closures', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Unremediated findings: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unfixed blockers: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unpatched vulnerabilities - dependency blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unremediated issues 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 unpatched vulnerabilities')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; unremediatedFindings: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; unfixedBlockers: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; unpatchedVulnerabilities: [CVE-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Unremediated findings: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Unfixed blockers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no unpatched vulnerabilities')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unremediatedFindings: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unfixedBlockers: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unpatchedVulnerabilities: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; patchManagementReviewed=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; remediationPlanLinked=true')).toBe(false);
  });

  it('detects open incident or risk markers while allowing accepted-risk and closure wording', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open incidents: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending critical incidents - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open risks: production claim blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining risks 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open incidents')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; criticalIncidentsOpen: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; risksOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openRisks: [risk-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open incidents: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending critical incidents: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open risks')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; criticalIncidentsOpen: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; risksOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openRisks: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedRisks: [risk-1]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Accepted risks reflected in release notes = yes')).toBe(false);
  });

  it('detects open defect, gap, violation, or regression markers while allowing review context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open defects: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending policy violations - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining validation gaps: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open regressions 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open defects')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openGaps: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; defectsOpen: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; violationsOpen: [policy-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open defects: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending policy violations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open gaps')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openGaps: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; defectsOpen: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; violationsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; gapAnalysisCompleted=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; policyViolationsReviewed=true')).toBe(false);
  });

  it('detects open action item, task, or todo markers while allowing closure context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open action items: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending tasks - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining work items: checklist update')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open todos 1 unresolved')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open action items')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openActionItems: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; tasksOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openTodos: [todo-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open action items: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending tasks: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open action items')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openActionItems: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; tasksOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openTodos: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; actionItemsClosed=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; taskListReviewed=true')).toBe(false);
  });

  it('detects open escalation markers while allowing bounded escalation context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open escalations: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending escalated items - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining escalations: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open escalations')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openEscalations: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; escalationsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; escalationPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open escalations: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending escalations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open escalations')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openEscalations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; escalationsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; escalationPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; escalationsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; incident escalation is actionable')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; claim escalation false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; claim escalation remains false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; escalationPathDocumented=true')).toBe(false);
  });

  it('detects open handoff markers while allowing bounded handoff context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open handoffs: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending handoffs - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining handoffs: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open handoffs')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openHandoffs: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; handoffsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; handoffPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open handoffs: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending handoffs: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open handoffs')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openHandoffs: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; handoffsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; handoffPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; handoffsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; approval-gated live-preflight handoff')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; explicit live approval handoff preserved')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; next handoff requires reviewer approval')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; handoffProvenanceLinked=true')).toBe(false);
  });

  it('detects open authorization or permission markers while allowing denied authorization context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open authorizations: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending permissions - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining authorizations: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open permissions')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openAuthorizations: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; permissionsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; authorizationPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open authorizations: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending permissions: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open authorizations')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openAuthorizations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; permissionsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; authorizationPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; permissionsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; broadcast authorization false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; not broadcast authorization')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; this report does not authorize broadcast')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; authorization boundary preserved')).toBe(false);
  });

  it('detects open clearance or consent markers while allowing denied consent context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open clearances: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending consent - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining clearances: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open consents')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openClearances: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; consentsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; consentPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open clearances: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending consent: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open clearances')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openClearances: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; consentsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; consentPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; consentsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; broadcast consent false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; not broadcast consent')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; this report does not consent to broadcast')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; clearance boundary preserved')).toBe(false);
  });

  it('detects open exception, waiver, or deviation markers while allowing policy context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open exceptions: release waiver')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending waivers - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining deviations: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open waivers')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openExceptions: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; waiversOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; deviationsOpen: [deviation-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open exceptions: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending waivers: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open deviations')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openExceptions: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; waiversOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; deviationsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; waiverPolicyDocumented=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; exceptionPolicyDocumented=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; approvedWaivers: [waiver-1]')).toBe(false);
  });

  it('detects open limitation, caveat, or constraint markers while allowing documented context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open limitations: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending caveats - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining constraints: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open limitations')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openLimitations: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; caveatsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; constraintsOpen: [constraint-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open limitations: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending caveats: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open constraints')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openLimitations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; caveatsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; constraintsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedLimitations: [trusted-oracle path]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedConstraints: [testnet only]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; limitationPolicyReviewed=true')).toBe(false);
  });

  it('detects open remediation, mitigation, or corrective-action markers while allowing documented context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open remediations: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending mitigations - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining corrective actions: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open remediations')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openRemediations: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; mitigationsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; correctiveActionsOpen: [action-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open remediations: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending mitigations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open corrective actions')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openRemediations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; mitigationsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; correctiveActionsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedMitigations: [circuit breaker]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedRemediations: [docs-only follow-up]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; mitigationPolicyReviewed=true')).toBe(false);
  });

  it('detects open question, unknown, or uncertainty markers while allowing documented context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open questions: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Known unknowns: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining uncertainties: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open questions')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openQuestions: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; unknownsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; uncertaintiesOpen: [uncertainty-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open questions: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Known unknowns: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open uncertainties')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openQuestions: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; unknownsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; uncertaintiesOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedQuestions: [reviewer Q&A]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedUncertainties: [testnet-only scope]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; questionPolicyReviewed=true')).toBe(false);
  });

  it('detects open concern, reservation, or objection markers while allowing documented context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open concerns: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending reservations - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining objections: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open concerns')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openConcerns: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; reservationsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; objectionsOpen: [objection-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open concerns: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending reservations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open objections')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openConcerns: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; reservationsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; objectionsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedConcerns: [timeout tradeoff]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedReservations: [testnet-only scope]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; concernPolicyReviewed=true')).toBe(false);
  });

  it('detects open prerequisite, dependency, or requirement markers while allowing documented context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open prerequisites: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending dependencies - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining requirements: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open prerequisites')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openRequirements: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; dependenciesOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; prerequisitesOpen: [prerequisite-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open prerequisites: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending dependencies: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open requirements')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openRequirements: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; dependenciesOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; prerequisitesOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedPrerequisites: [release gate pass]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedDependencies: [testnet signer review]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; requirementsReviewed=true')).toBe(false);
  });

  it('detects pending review markers while allowing completed review context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending review: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open reviews - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining reviews: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending reviews')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewPending: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewsPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openReviews: [review-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending review: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open reviews: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending reviews')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewPending: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewsPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openReviews: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewEvidenceLinked=true')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewedAt=2026-06-22T10:00:00Z')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; dependencyReviewCompleted=true')).toBe(false);
    expect(
      hasUnresolvedIssueMarker(
        'command output PASS; External security review: release impact evidence target artifact://release/security-review.md',
      ),
    ).toBe(false);
  });

  it('detects pending ownership or assignment markers while allowing completed owner context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending ownership: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open evidence owners: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining reviewer assignments: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending owners')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 open assignment')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; ownershipPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; assignmentsOpen: [reviewer-assignment]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending ownership: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open evidence owners: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending owners')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; ownershipPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; assignmentsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; ownerStatus="assigned"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedOwner: A. Shannon')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; ownershipPolicyDocumented=true')).toBe(false);
  });

  it('detects pending responsibility or accountability markers while allowing completed context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending responsibility: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open accountabilities: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining reviewer responsibilities: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending responsibilities')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 open accountability')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; responsibilityPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; accountabilitiesOpen: [operator-checklist]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending responsibility: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open accountabilities: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending responsibilities')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; responsibilityPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; accountabilitiesOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; responsibilityStatus="accepted"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedResponsibilities: [operator checklist]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; accountabilityPolicyDocumented=true')).toBe(false);
  });

  it('detects pending decision markers while allowing completed decision context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending decision: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open decisions - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining decisions: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending decisions')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; decisionPending: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; decisionsPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openDecisions: [decision-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending decision: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open decisions: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending decisions')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; decisionPending: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; decisionsPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openDecisions: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Release Decision: public release allowed = yes')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Publication Decision: Reviewer decision summary')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; reviewerDecisionSummaryLinked=true')).toBe(false);
  });

  it('detects pending approval markers while allowing completed approval context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending approval: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open approvals - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining approvals: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open signer approvals: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending reviewer approval - follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining operator approvals: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending approvals')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; approvalPending: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; approvalsPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openApprovals: [approval-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending approval: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open approvals: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open signer approvals: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending reviewer approval: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending approvals')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; approvalPending: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; approvalsPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openApprovals: []')).toBe(false);
    expect(
      hasUnresolvedIssueMarker('command output PASS; active approval window approvedAt 2026-05-16T12:00:00Z'),
    ).toBe(false);
    expect(
      hasUnresolvedIssueMarker(
        `command output PASS; deployedStateHash ${'5'.repeat(64)} active approval window approvedAt 2026-05-16T12:00:00Z`,
      ),
    ).toBe(false);
    expect(
      hasUnresolvedIssueMarker('command output PASS; completed approval evidence target artifact://daemon/approval.json'),
    ).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedApprovals: [security reviewer]')).toBe(false);
  });

  it('detects pending acceptance or endorsement markers while allowing completed context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending acceptance: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open operator acceptances: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining release endorsements: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending acceptances')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 open endorsement')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptancePending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; endorsementsOpen: [endorsement-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending acceptance: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open operator acceptances: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending acceptances')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptancePending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; endorsementsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptanceStatus="accepted"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedEndorsements: [operator checklist]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptanceCriteriaDocumented=true')).toBe(false);
  });

  it('detects pending acknowledgment markers while allowing completed context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending acknowledgment: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open operator acknowledgements: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining release acknowledgments: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending acknowledgements')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; acknowledgmentPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; acknowledgementsOpen: [ack-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending acknowledgment: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open operator acknowledgements: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending acknowledgments')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acknowledgmentPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acknowledgementsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acknowledgmentStatus="complete"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedAcknowledgments: [operator checklist]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acknowledgmentPolicyDocumented=true')).toBe(false);
  });

  it('detects pending confirmation or observation markers while allowing completed context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending confirmation: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open settlement confirmations: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining post-submit observations: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending confirmations')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 open observation')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; confirmationPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; observationsOpen: [observation-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending confirmation: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open settlement confirmations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending confirmations')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; confirmationPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; observationsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; confirmationStatus="confirmed"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedObservations: [post-submit evidence]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; observationPolicyDocumented=true')).toBe(false);
  });

  it('detects pending provenance or binding markers while allowing completed context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending provenance: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open target bindings: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining release provenance: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending bindings')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 1 open provenance')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; provenancePending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; bindingsOpen: [binding-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending provenance: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open target bindings: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending provenance')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; provenancePending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; bindingsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; provenanceStatus="bound"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedBindings: [target-map]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; provenancePolicyDocumented=true')).toBe(false);
  });

  it('detects open attestation or sign-off markers while allowing documented approval context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Open attestations: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending sign-offs - reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining attestations: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 open sign-offs')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; openAttestations: 1')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; attestationsOpen: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; signOffsOpen: [signoff-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open attestations: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending sign-offs: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no open sign-offs')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; openAttestations: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; attestationsOpen: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; signOffsOpen: []')).toBe(false);
    expect(
      hasUnresolvedIssueMarker('command output PASS; active approval window approvedAt 2026-05-16T12:00:00Z'),
    ).toBe(false);
    expect(
      hasUnresolvedIssueMarker('command output PASS; completed approval evidence target artifact://daemon/approval.json'),
    ).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedApprovals: [security reviewer]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; acceptedAttestations: [operator checklist]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; signOffPolicyReviewed=true')).toBe(false);
  });

  it('detects pending certification markers while allowing completed certification context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending certification: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open release certifications: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining operator certifications: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending certifications')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; certificationPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; certificationsOpen: [certification-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending certification: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open release certifications: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending certifications')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; certificationPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; certificationsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; certificationStatus="active"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; documentedCertifications: [operator checklist]')).toBe(false);
  });

  it('detects pending audit or assessment markers while allowing completed audit context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending audit: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open security assessments: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining external audits: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending assessments')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; auditPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; assessmentsOpen: [assessment-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; penetrationTestsOpen: [pentest-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending audit: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open security assessments: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending audits')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; auditPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; assessmentsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; auditStatus="complete"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedSecurityAssessment: [external report]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; auditTrailLinked=true')).toBe(false);
  });

  it('detects pending validation or verification markers while allowing completed validation context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending validation: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open proof verifications: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining command validations: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending verifications')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; validationPending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; verificationsOpen: [verification-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending validation: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open proof verifications: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending validations')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; validationPending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; verificationsOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; validationStatus="complete"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedValidation: [release gate]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; release notes validation target artifact://release/notes.md')).toBe(false);
  });

  it('detects pending signature markers while allowing completed signature context', () => {
    expect(hasUnresolvedIssueMarker('command output PASS; Pending signature: release blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Open operator signatures: reviewer follow-up')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Remaining release signatures: checklist blocker')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; 2 pending signatures')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; signaturePending: true')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; signaturesOpen: [signature-1]')).toBe(true);
    expect(hasUnresolvedIssueMarker('command output PASS; Pending signature: none')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; Open operator signatures: 0')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; no pending signatures')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; signaturePending: false')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; signaturesOpen: []')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; signatureStatus="valid"')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; completedSignatures: [operator checklist]')).toBe(false);
    expect(hasUnresolvedIssueMarker('command output PASS; signaturePolicyDocumented=true')).toBe(false);
  });
});
