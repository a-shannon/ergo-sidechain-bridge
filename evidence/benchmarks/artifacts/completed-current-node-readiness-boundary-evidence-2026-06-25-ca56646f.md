# Completed Current Node Readiness Boundary Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:finality
```

Result: PASS / exit code 0.

Evidence:

- Node mempool acceptance is modeled as a distinct stage.
- Signing readiness and live broadcast remain outside offline benchmark scope.
- Live throughput claims require live readiness, broadcast policy, signing, and
  network reconfirmation checks.

Boundary:

- This is offline finality-model evidence.
- It does not authorize signing, submission, broadcast, or live settlement.
