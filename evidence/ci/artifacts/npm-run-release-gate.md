# npm run release:gate Evidence

Command: `npm.cmd run release:gate`

Result: blocked with 0 structural issues, exit code 1 accepted for pending evidence.

Summary:
- Release gate reported 14 of 14 pending evidence rows still blocking publication.
- Release gate reported 0 structural issues.
- This is the expected state before completed evidence rows are linked.
- Follow-up command `npm.cmd run release:gate -- --clean-checkout-evidence ../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md` reported 13 of 14 pending evidence rows still blocking publication and 0 structural issues.
