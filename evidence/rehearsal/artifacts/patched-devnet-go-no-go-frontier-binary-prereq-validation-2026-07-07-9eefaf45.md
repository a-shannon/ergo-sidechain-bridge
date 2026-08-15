# Patched Devnet Frontier Binary Prereq Validation Output - 2026-07-07 - 9eefaf45

Command:

```text
npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-binary-prereq-2026-07-07-9eefaf45.json
```

Result:

```text
../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-binary-prereq-2026-07-07-9eefaf45.json: PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization
```

Validation status: PASS
Exit code: 0

Boundary:

- Validates the local patched-devnet prerequisite report schema and claim boundary.
- Confirms the configured Frontier binary is available and reports the expected executable version.
- Confirms the patched Ergo devnet and Frontier sidechain were offline at capture time.
- Confirms runtime-state inspection, funding checks, and signer alignment were not captured in this no-secret diagnostic.
- Does not inspect secrets, mnemonics, node config secrets, private runtime databases, backup directories, or deployment-state files.
- Does not close Gate 3.
- Does not authorize live execution.
- Does not authorize transaction broadcast.
- Does not authorize transaction signing, submit, deploy, confirmation, or reconciliation.
- Does not support release-claim escalation.
