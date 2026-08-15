# Completed Current DUP Insert Proof Size Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:proofs
```

Result: PASS / exit code 0.

Evidence:

- DUP AVL lookup proof size is 67 B.
- DUP AVL insert-proof size is 67 B in the proof inspector.
- Batch benchmark reports DUP insert proof size up to 70 B at batch=10.

Boundary:

- This is offline proof-object inspection.
- It does not replace live or trustless burn verification evidence.
