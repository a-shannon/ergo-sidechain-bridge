# Fleet SDK Upgrade Decision

Decision: keep Fleet SDK dependencies pinned.

Rationale: `@fleet-sdk/core`, `@fleet-sdk/common`, and `@fleet-sdk/wallet` have transaction assembly and signer-boundary risk. Upgrade requires API drift review before claim escalation.
