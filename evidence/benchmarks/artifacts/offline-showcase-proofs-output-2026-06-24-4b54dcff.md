# Offline Showcase Proofs Output - 2026-06-24 - 4b54dcff

Command:

```powershell
npm run showcase:proofs
```

Result: PASS / exit code 0.

Normalized proof-size summary:

| Object | Size | Purpose |
|---|---:|---|
| Tracker key | 32 B | Sidechain block ID |
| Tracker value | 36 B | Event root plus anchor |
| Tracker get proof | 137 B | Membership proof |
| DUP lookup proof | 67 B | Non-membership proof |
| DUP insert proof | 67 B | State transition proof |
| AVL digest | 33 B | Committed tree root |
| Claim core | 109 B | Packed claim struct |
| Event root | 32 B | Burn commitment hash |

Command-reported proof objects:

- SPV tracker key and value.
- Bridge event root for the burn commitment.
- AVL tree digests.
- DUP lookup and insert proofs.
- SPV tracker membership proof.
- Packed claim core for batch settlement.
- Context extension variable layout.

Boundary:

- This is proof-object inspection for offline benchmark context.
- It is not a trustless burn completion report.
- It does not replace a completed trustless burn proof-vector validation.
