export const PUBLIC_AUDIT_RELEASE_GATE_ARGS = [
  '--clean-checkout-evidence',
  '../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md',
  '--dependency-review-evidence',
  '../evidence/dependencies/completed-dependency-review-2026-05-31-2ba7c3fb.md',
  '--backup-restore-evidence',
  '../evidence/recovery/completed-backup-restore-2026-05-31-99e98fff.md',
  '--operator-readiness-evidence',
  '../evidence/operators/completed-operator-readiness-2026-06-04-9e3921cb.md',
  '--integration-evidence',
  '../evidence/integration/completed-external-integration-review-2026-06-04-9e3921cb.md',
  '--threat-model-evidence',
  '../docs/security-evidence-matrix.md',
] as const;

const PASS_SUMMARY =
  /^Release gate PASS: [0-9]+ pending evidence rows are resolved; Structural issues = 0\.$/;
const BLOCKED_CLEAN_SUMMARY =
  /^Release gate BLOCKED: [0-9]+\/[0-9]+ pending evidence rows still block publication; 0 structural issue\(s\)\.$/;

export interface PublicAuditReleaseGateResult {
  accepted: boolean;
  classification: 'PASS' | 'EXPECTED_BLOCKED' | 'INVALID';
  summary: string | null;
}

export function validatePublicAuditReleaseGateProcess(input: {
  exitCode: number | null;
  output: string;
}): PublicAuditReleaseGateResult {
  const summaries = input.output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('Release gate PASS:') || line.startsWith('Release gate BLOCKED:'));
  const summary = summaries.length === 1 ? summaries[0] : null;

  if (input.exitCode === 0 && summary !== null && PASS_SUMMARY.test(summary)) {
    return { accepted: true, classification: 'PASS', summary };
  }
  if (input.exitCode === 1 && summary !== null && BLOCKED_CLEAN_SUMMARY.test(summary)) {
    return { accepted: true, classification: 'EXPECTED_BLOCKED', summary };
  }
  return { accepted: false, classification: 'INVALID', summary };
}
