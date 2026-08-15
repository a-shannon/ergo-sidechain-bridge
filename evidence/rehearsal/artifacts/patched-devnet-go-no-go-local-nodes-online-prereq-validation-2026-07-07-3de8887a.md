# Patched Devnet Local Nodes Online Prereq Validation Output - 2026-07-07 - 3de8887a

Command:

```text
npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json
```

Result:

```text
../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json: PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization
```

Validation status: PASS
Exit code: 0

Boundary:

- Validates the local patched-devnet prerequisite report schema and claim boundary.
- Confirms the patched Ergo devnet endpoint was reachable on loopback.
- Confirms the Frontier sidechain endpoint was reachable on loopback.
- Confirms runtime-state inspection, funding checks, and signer alignment were not captured in this no-secret diagnostic.
- Does not inspect secrets, mnemonics, node config secrets, private runtime databases, backup directories, or deployment-state files.
- Does not close Gate 3.
- Does not authorize live execution.
- Does not authorize transaction broadcast.
- Does not authorize transaction signing, submit, deploy, confirmation, or reconciliation.
- Does not support release-claim escalation.
