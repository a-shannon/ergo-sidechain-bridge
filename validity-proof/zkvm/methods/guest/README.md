# Frozen V1 Source Boundary

This directory preserves the historical V1 guest entrypoint for review only.
It is not an active `risc0-build` method in the current workspace.

The canonical V1 `ProgramBinary`, image ID, exact source commit, and artifact
digest are bound by `../artifacts/bridge-validity-guest-v1.manifest`.
Compiling this entrypoint against the current evolving composition crates would
produce a different image and must not be presented as V1 compatibility.
