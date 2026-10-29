# Ergo/Substrate bridge: development update, 29 October 2026

A fresh Ergo node build now completes against the bridge's current source locks. Dependency resolution, update and assembly ran in one bounded build, producing a 78.4 MB JAR. A separate review checked the public build receipt and independently hashed the JAR to confirm they match.

This closes the current assembly blocker. The generated build has about 42,000 files; its full path inventory needed more space than the earlier capture limit allowed. The new build used a 16 MiB path-inventory limit while retaining the existing file-count, output-size and process controls.

We're now connecting that builder to the bridge's execution path. The parent, worker and root must all select the current build explicitly and reject stale source locks before starting an attempt. The physical build is verified locally; that runtime integration is still in progress.

The next milestone is two consecutive deposit, mint, burn and withdrawal cycles on a fresh synthetic local chain, preserving successor state and replay history between cycles. Stopped-state recovery and the operator rehearsal follow from that result.

The bridge remains an explicitly federated reference and is not production-ready. External acceptance is pending. The STARK-based trustless upgrade remains a separate track.
