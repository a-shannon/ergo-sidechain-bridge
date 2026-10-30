# Ergo/Substrate bridge: development update, 29 October 2026

A fresh Ergo node build now completes against the bridge's current source locks. Dependency resolution, update and assembly ran in one bounded build, producing a 78.4 MB JAR. A separate review checked the public build receipt and independently hashed the JAR to confirm they match.

This closes the current assembly blocker. The generated build has about 42,000 files; its full path inventory needed more space than the earlier capture limit allowed. The new build used a 16 MiB path-inventory limit while retaining the existing file-count, output-size and process controls.

The current builder is now connected in source through an explicit invocation format and the versioned parent, worker and Root V2 entry points. Local composed tests reject altered source, Maven, boot and LevelDB inputs before attempt creation. Those fixtures do not establish the full native process path; that is the next integration check.

The native journal prerequisite now passes on the pinned Node 24.14 runtime: a fresh journal opens through the real StateTracker constructor and closes successfully. The check verifies the installed native module, its loader paths and cache identities. It acquires no funds authority.

CI rebuilt the pinned Frontier and Ergo sources successfully and passed the Solidity dependency audit. Its public-audit job found a stale runtime-lock hash in eight process-seam test cases. The corrected fixture now passes all nine cases locally, including the bounded timeout case, with the original limits. Full CI remains a separate check.

The next source check exposed a Windows helper-environment defect: PowerShell could write its module cache into a source checkout when its AppData paths were omitted. Both affected environment builders now require explicit, validated profile and temporary directories. The direct checks and affected V1 consumers pass locally, together with TypeScript and import checks. A fresh native preflight and physical source/dependency capture remain the next integration boundary.

The next milestone is two consecutive deposit, mint, burn and withdrawal cycles on a fresh synthetic local chain, preserving successor state and replay history between cycles. Stopped-state recovery and the operator rehearsal follow from that result.

The bridge remains an explicitly federated reference and is not production-ready. External acceptance is pending. The STARK-based trustless upgrade remains a separate track.
