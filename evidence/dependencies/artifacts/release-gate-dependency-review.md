# release:gate Dependency Review Consumption

Command evidence: `npm run release:gate -- --clean-checkout-evidence ../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md --dependency-review-evidence ../evidence/dependencies/completed-dependency-review-2026-05-31-2ba7c3fb.md`.

Result: expected blocked state with 0 structural issues. The release gate reported 12 of 14 publication evidence rows still unresolved and consumed the Gate 4 fail-closed dependency review without adding a structural issue.
