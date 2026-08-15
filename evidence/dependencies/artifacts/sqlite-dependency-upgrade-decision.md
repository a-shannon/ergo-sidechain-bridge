# SQLite Dependency Upgrade Decision

Decision: keep SQLite native dependency pinned.

Rationale: `better-sqlite3` affects state recovery and backup/restore operations. Upgrade requires native recovery evidence.
