# Release Gate Backup Restore Consumption

- Command: `npm run release:gate -- --clean-checkout-evidence ../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md --dependency-review-evidence ../evidence/dependencies/completed-dependency-review-2026-05-31-2ba7c3fb.md --backup-restore-evidence ../evidence/recovery/completed-backup-restore-2026-05-31-99e98fff.md`
- Working directory: `relayer`
- Result: expected BLOCKED because unrelated release-gate rows remain open.
- Exit code: 1
- Structural issues: 0
- Output summary: `Release gate BLOCKED: 11/14 pending evidence rows still block publication; 0 structural issue(s).`
- Backup-restore evidence target consumed: `../evidence/recovery/completed-backup-restore-2026-05-31-99e98fff.md`
