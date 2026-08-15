# npm audit --omit=dev

Command evidence: `npm audit --omit=dev`.

Critical/high policy result: PASS. The production audit review found 0 critical and 0 high vulnerabilities. Two moderate `ws` advisories are present through `ethers`; they are recorded as a non-candidate blocker note and do not permit production-ready or testnet production-candidate wording.

Threshold check: `npm audit --omit=dev --audit-level=high` passed for the critical/high gate.
