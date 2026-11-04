# Ergo/Substrate bridge: development update, 4 November 2026

Since the [29 October checkpoint](development-update-2026-10-29.md), the
federated Ergo/Substrate bridge reference has validated build inputs and local
runtime components for its next integration run. The aim is an engineering base for
teams that want Ergo settlement with familiar Substrate/EVM execution tools.

The Solidity and relayer toolchains now select the patched redirect dependency.
Their scoped dependency audits pass. The Solidity contracts were rebuilt in an
isolated checkout: all ten ABI, bytecode, metadata and storage-layout artifacts
are unchanged. The build manifest and current source locks bind the new
dependency identities.

The retained WASM package was built and its source-lock tests checked at the
earlier checkpoint. The current lock refresh binds the revised process runner
while preserving those JavaScript and WASM bytes. Historical receipts retain
their original identities.

The SQLite addon was rebuilt from source, and a real StateTracker opened and
closed a fresh diagnostic database under Node 24.14 / ABI 137. A later
same-parent check combined that constructor with the retained WASM assertions,
current environment checks and physical node-build input checks. Those local
results received independent review; they do not establish campaign execution.

The [Linux source rebuild](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/41782411024/job/126416767547)
passes the LAB reservation tests, native proof-verifier checks and both patched
node builds. The Linux job includes `cstdint` explicitly for the RocksDB 8.1.1
header that previously stopped compilation. The current SPV lock also binds the
reviewed producer sources while preserving the JavaScript and WASM artifact
bytes. The separate Java runtime inspection checks its pinned toolchain and
classpath; it does not compile or execute a new JVM result.

This checkpoint also adds optional caller cancellation to the bounded process
runner. The HTTP isolation test passes its own abort signal and awaits the same
completion during cleanup. On Windows, cancellation uses the existing Job
Object channel; an unverified process-tree exit keeps ownership pending.
Cancellation cannot turn a late successful exit into a successful test.

The [subsequent CI run](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/41850770352)
passed the Solidity audit and failed in an Ergo mining test. The subsequent
source check identified a fixture ordering race: its separate application
probe could receive an event before the
candidate generator consumed it. The fixture now waits for the generator's
actual readiness within the same three-second budget before requesting one
candidate. Production mining guards are unchanged.

The complete corrected actor suite passes all 31 tests locally. Two new cases
control delivery of real application events; removing the readiness wait or
duplicating the candidate request makes the corresponding checks fail. The
cumulative Ergo patch and current source locks bind the tested bytes, while
historical locks retain their original identities. This deterministic local
evidence does not identify the hosted run's exact mailbox schedule.

Windows CI still expired at the isolated HTTP test's ten-second outer deadline.
The local matched diagnostics passed. Caller cancellation preserves process
ownership; the hosted timeout cause remains unresolved. Child, test and cleanup
deadlines remain unchanged, and CI on the next published head is a separate
validation result.

The operational milestone ahead is still two complete deposit, mint, burn and
withdrawal cycles on the same fresh synthetic chain, carrying successor state
and replay history between cycles. Stopped-state recovery, operator/FED-7
evidence and external acceptance remain open. The earlier native invocation
stays closed; its failure cause is unestablished.

The reference remains explicitly federated. The STARK-based trustless upgrade
is a separate track, and production readiness has not been established. The
[current development PR](https://github.com/a-shannon/ergo-sidechain-bridge/pull/7)
contains the source changes; it is not a release or an accepted deployment.
