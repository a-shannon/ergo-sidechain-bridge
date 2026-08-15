# SQLite WAL backup

Command evidence: SQLite backup copy was created for the local offline drill.

Result: no WAL or SHM file was present for the synthetic source state; matched-set handling was reviewed and restore used the copied SQLite database.
