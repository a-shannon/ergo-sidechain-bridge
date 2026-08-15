# Patched Devnet Go/No-Go Schema Boundary Validation Output - 2026-06-25 - c5db9d67

Command:

```text
npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-schema-boundary-2026-06-25-c5db9d67.json
```

Result:

```text
../evidence/rehearsal/artifacts/patched-devnet-go-no-go-schema-boundary-2026-06-25-c5db9d67.json: PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization
```

Validation status: PASS
Exit code: 0

Boundary:

- Validates the safe prerequisite JSON shape and no-broadcast boundary.
- Requires `nodeConfigInspection=disabled`.
- Requires a disabled node config inspection warning row.
- Does not close Gate 3.
- Does not authorize live execution.
- Does not authorize transaction broadcast.
- Does not support release-claim escalation.
