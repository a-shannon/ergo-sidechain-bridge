# Isolated restore target

Command evidence: restore used a separate isolated restore database created from the source SQLite backup.

Result: restored snapshot was generated from the isolated restore target, not from a live relayer database.
