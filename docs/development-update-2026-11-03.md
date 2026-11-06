# Ergo/Substrate bridge: development update, 3 November 2026

The native execution path now preserves the isolated PowerShell module-cache
path through both worker startup and WASM tool preparation. This closes two
environment gaps that could otherwise let helper processes use their default
cache location inside a source checkout.

The worker fix was followed by a composed regression test of the WASM
environment builder and build pipeline. Both canonical and lowercase spellings
of an explicit cache path were dropped before the correction; a caller without
that optional path retained its previous behavior. The WASM fix adds one entry
to the existing environment filter. Unrelated variables remain excluded, and
the locked tools, offline build settings and process limits are unchanged.

The affected WASM and parent regression suites, TypeScript and import checks
pass locally, and the exact source change has an independent review. Local
tests used the installed Vitest 4.1.11; the lock requires 4.1.12, so these
results do not close clean-checkout or hosted CI validation. The dependency
audit also remains open for follow-redirects 1.16.1.

One bounded native invocation ended in failure without a canonical two-cycle
result. Its public terminal records do not establish the underlying cause,
application entry or cleanup. That invocation is closed and will not be
repeated. The environment regression is established independently of that
failure.

The operational result still needed is two consecutive deposit, mint, burn and
withdrawal cycles on the same fresh synthetic chain, retaining successor state
and replay history between them. Any future invocation needs its own reviewed
inputs and admission. Stopped-state recovery and the operator rehearsal follow
a successful two-cycle result.

The bridge remains an explicitly federated research reference. Two-cycle
runtime acceptance, recovery, operator/FED-7 evidence and external acceptance
remain open. No production-readiness or release claim follows from these local
checks. The STARK-based trustless upgrade remains a separate track.
