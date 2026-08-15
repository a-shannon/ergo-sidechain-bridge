# Completed Current ContextExtension Count Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:benchmark
```

Result: PASS / exit code 0.

Evidence:

- ContextExtension Vars count is 15 for batch=1.
- ContextExtension Vars count is 58 for batch=10.
- ContextExtension Var count remains a batch-width scaling limit.

Boundary:

- This is offline benchmark evidence only.
- It does not prove live node mempool or signing acceptance.
