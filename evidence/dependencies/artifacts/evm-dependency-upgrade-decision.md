# EVM Dependency Upgrade Decision

Decision: keep EVM dependency pinned.

Rationale: `ethers` affects event, receipt, and log parsing. Upgrade requires event parsing review and audit triage.
