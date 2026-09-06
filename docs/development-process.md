# Bridge Development Process

The deliverable is a working, reproducible Ergo-settled sidechain reference.
The [execution plan](../phases/bridge-execution-plan.md) owns the queue;
this document defines how a delivery batch is selected, verified and closed.
It supplements the repository and workspace safety instructions.

## Start From The Consumer

For each batch, name the executable result before selecting files:

`producer -> changed behavior -> deciding consumer -> acceptance evidence`

Normally change one to four runtime files plus their direct tests. A batch can
implement authorization, durable reservation and transport together while
keeping those capabilities separate. Do not turn each internal capability,
receipt or helper into a separate delivery milestone by default.

Before adding a module or envelope, identify the authority, lifetime, version
or persistence boundary that requires it and the consumer that will use it.
A forwarding layer without such a boundary is not a deliverable. Do not remove
existing security boundaries merely to reduce file counts.

At each checkpoint report what a caller can now execute, what remains a
fixture and the next unconnected consumer. Version numbers and test counts
are evidence identifiers, not measures of product completion.

## Select Checks By Changed Behavior

Record this compact map in the task handoff before expensive validation:

| Changed operation or invariant | Deciding test / runtime | Reused evidence and its unchanged inputs | Invalidation trigger |
|---|---|---|---|
| Exact function, branch, identity or shared-state transition | Named cases and exact configuration | Prior result, scope and source/artifact pins | Changed consumer, bytes, state, toolchain, authority or external fact |

An import graph discovers possible consumers; it does not prove that every
test importing a large module needs replay. Inspect the affected operations
and shared state before narrowing. Unknown impact requires broader coverage.
Changes to disposal, concurrency, errors or shared state include the affected
legacy routes, not only the new happy path.

Evidence bound to a whole-file, build or artifact digest still requires that
exact identity. Semantic test selection does not waive an evidence producer's
pin checks or turn changed artifacts into unchanged ones.

Run checks in this order when applicable:

1. Type checking and cheap static import/capability guards for changed imports.
2. Pure and component tests, including isolated negative cases.
3. Real signing, persistence and composed lifecycle tests for affected joins.
4. Pinned VM/node/campaign checks when their exact deciding inputs changed.
5. Independent review of stable bytes, followed by targeted fixes and rechecks.
6. Exact staged/range publication guards and promotion checks when due.

Use the cadence planner with the explicit path set, risk and phase. After a
failure, retain the earlier result and reason; rerun the smallest invalidated
closure. A passing isolated replay does not erase a failed broad run. Never
increase timeouts, skip cases or lower predicates merely to obtain green.

## Prepare Only What A Test Uses

Keep detailed field negatives near the smallest deciding consumer. Retain
composed positives and negatives for provenance, retained inputs, signing,
disposal, concurrency, persistence and other cross-component obligations.
Similar checks at different authority boundaries are not automatically duplicates.

Static, immutable compiler preparation may be shared only within a verified
input closure and the producer's actual process-provenance rules. Prepare a
profile on demand, once per required scope; do not compile unrelated profiles
in a global hook for a narrow test selection.

Never cache or restore sessions, private custody, claimed handles, authorizations,
journals, target observations or node-check results as new authority. Fresh
synthetic signers and signer-bound compilation remain fresh where required.

Measure preparation calls and time separately from test execution and teardown.
Use the next due run for measurement where possible. Claim a percentage speedup
only from matched repeated runs; deterministic reductions in unused preparation
can be reported without inventing a runtime speedup. Preserve test inventory,
assertions, mutants and differential coverage; add no skips.

Keep fixed-port or shared-environment tests serial. Parallelize only proven
resource-disjoint groups. A separate runner/CI scheduling change needs its own
resource map, negative selection tests and complete milestone verification.
Current required hosted jobs remain required until that change is reviewed.

## Work In Parallel Without Splitting Authority

Keep one integration owner and at most two bounded agents. Use one worker for
an independent deliverable and one reviewer when needed; no agent waits open
without a concrete task. Give each a disjoint path set and stop condition.
Do not delegate the immediate blocking decision and then repeat its analysis.

Preparation can precede runtime dependencies. For example, a V2 withdrawal
planner can be wired and tested against synthetic state while tracker admission
is implemented. Its actual stateful acceptance still needs canonical inputs.
The main owner integrates changes serially and checks the combined identities.

Group fresh-node execution around a new executable milestone. Confirm fee
funding before freezing a bounded tracker anchor. Do not insert funding-only
or checker-only campaigns between already-verified components. Preserve unique
campaign custody, exact authorization, fresh state and terminal-attempt holds.

## Keep The Queue Small

The execution plan contains current state, blockers, the dependency graph and
the next few executable batches. Move completed specifications to a linked
checkpoint archive without deleting obligations or evidence limits. Old next
actions do not become a second queue.

Keep one short active handoff per investigation; link preserved predecessors.
Update it at deciding milestones, not after every command. Separate maintenance
failures from product failures. Repeated unrelated cleanup failures require a
bounded maintenance task, not permission bypasses or repeated deletion attempts.

## September 2026 Audit Baseline

At V170 the setup session has 3,079 lines and its provisioning suite 2,881.
The active plan had grown to 1,037 lines, including 821 lines now archived.
The 16-file direct-import closure took 761.56 seconds: 1,034 cases passed and
one static import allowlist failed. The corrected isolated guard passed in
2.97 seconds. This supports running cheap capability checks before the heavy
closure; it does not make the rest of that closure redundant.

The provisioning global hook prepares four tracker/family compiler pairs even
for focused selections. The first performance batch will remove unused eager
preparation, keep process-owned provenance and fresh signer-bound fixtures, and
measure the change. Compiler caching, blanket parallelism and reduced hosted
CI are separate decisions, not assumed improvements.

The delivery audit also identifies two missing joins: V2 checker to admission
authority, and the actual V3 campaign caller to that lifecycle. Withdrawal
construction can proceed independently; canonical withdrawal and operational
two-way recovery cannot be claimed before their real consumers run.
