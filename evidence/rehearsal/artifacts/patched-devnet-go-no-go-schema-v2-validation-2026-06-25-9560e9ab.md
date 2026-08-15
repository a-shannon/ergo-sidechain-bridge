# Patched Devnet Go/No-Go Schema V2 Validation Output - 2026-06-25 - 9560e9ab

Command:

```text
npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-schema-v2-2026-06-25-9560e9ab.json
```

Result:

```text
../evidence/rehearsal/artifacts/patched-devnet-go-no-go-schema-v2-2026-06-25-9560e9ab.json: PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization
```

Validation status: PASS
Exit code: 0

Boundary:

- Validates the safe prerequisite JSON shape and no-broadcast boundary.
- Requires `schemaVersion=2`.
- Requires `nodeConfigInspection=disabled`.
- Requires a disabled node config inspection warning row.
- Does not close Gate 3.
- Does not authorize live execution.
- Does not authorize transaction broadcast.
- Does not support release-claim escalation.
