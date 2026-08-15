# Completed Current Showcase Finality Output - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:finality
```

Result: PASS / exit code 0.

Mode reported by command: OFFLINE illustrative timing model, no node calls.

Command assumptions:

- Fast signal target: 2 seconds.
- Ordering block: 2 minutes.
- Finality depth: K = 10.

Single-claim settlement terminal status: finalized.

Batch settlement terminal status: finalized.

Suggested metrics reported by command:

- burnObservedMs.
- proofReadyMs.
- settlementSubmittedMs.
- mempoolAcceptedMs.
- fastInclusionSeenMs.
- orderingBlockIncludedMs.
- economicFinalityMs.

Boundary:

- Fast inclusion can drive progress bars, alerts, and operator UX.
- Ordering-block confirmation is the first canonical L1 inclusion point.
- Economic finality remains K ordering blocks deep for settlement accounting.
- Subblocks improve responsiveness; they do not remove the need for finality
  depth.
