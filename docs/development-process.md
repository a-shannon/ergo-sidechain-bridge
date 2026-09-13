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

## Keep The Working Context Small

Read the applicable instructions at startup. Within the same continuing task,
retain their exact path and SHA-256 once read; check for drift before relying
on them again. Read changed instructions before acting. A fingerprint detects
change; it does not replace reading a new source or any required startup step.

- Start source navigation with named files, symbols and line ranges. Expand
  only at a concrete unresolved producer, consumer or invariant. Narrow a
  truncated read instead of repeating the complete file.
- Batch independent searches and return the deciding matches, exit codes,
  counts and failures. Set an output budget before each tool call; retrieve
  additional source or diagnostics only when needed to assess the result.
- Keep the active handoff to current state, exact pins, the validation
  dependency map, holds and the next action. Preserve completed detail in a
  linked archive rather than loading it on every continuation.
- Give a subagent only its question, owned paths, requirements, exact review
  handle and stop condition. Use a fresh bounded context instead of copying
  the full conversation when the task is independent. Do not ask two agents
  to explore or run the same closure.
- Route routine mapping and test inventory to bounded read-only work with
  lightweight or medium reasoning. Keep signing, transport, protocol and
  claim-boundary review at the risk-appropriate reasoning level. The main
  owner integrates and verifies the result before committing.
- Reuse green validation only under the unchanged input and state conditions
  below. Concise output and summaries never replace exact-source independent
  review, isolated negatives, artifact checks or publication guards.

Report deterministic reductions in loaded bytes or duplicated work separately
from measured runtime or account usage. Do not claim a token saving percentage
without matched measurements.

## Select Models At Each Batch Boundary

At the end of every coherent batch, the integration owner assesses the next
batch from the execution plan. Record one compact decision in the active
handoff beside the validation map: next consumer and owned paths, risk and
unresolved uncertainty, worker/reviewer models and reasoning, selection reason,
and the concrete condition requiring escalation. Reassess before delegation if
the scope, available models or evidence changes. Do not create another queue.

Use hosted agents only; local model execution is excluded from this workflow.
Use these initial routes for agent-assisted work, then adjust from evidence:

| Work | Initial model and reasoning |
|---|---|
| Read-only mapping, test inventory, or bounded implementation with clear requirements and low impact | GPT-5.6 Terra, medium |
| Signing, transaction construction, transport, evidence or protocol boundaries; independent review of those changes | GPT-5.6 Sol, high |
| Unresolved architecture, conflicting evidence across boundaries, or a critical problem the bounded route cannot resolve | GPT-6 Astra, high; extra-high only for a named unresolved problem |

Keep the main integration role on Astra when configured for that role. It owns
the overall plan, security context, final diff, checks and commit decision.
Delegate only a concrete independent deliverable with bounded context; keep at
most two subagents active and avoid repeating their exploration. A small batch
may stay with the main owner. Independent review remains a separate context
that inspects the exact candidate and requirements.

Judge adequacy from supported findings, applicable negative checks and review
results. Unsupported conclusions, a missed invariant, conflicting evidence or
unresolved cross-boundary impact require reassessment before promotion. Escalate
the unresolved question with exact evidence; do not restart completed work or
retry the same inadequate assignment unchanged. Model choice never waives a
required check or makes an unreviewed result authoritative.

Select supported subagent models directly where authorized. Confirm the actual
main model from explicit configuration when available; otherwise record it as
unverified. If the main role needs a different model and no supported control
can change it, request the exact model and reasoning from the user at the batch
boundary, explaining the unresolved work. Do not invent a switch or use a new
task or self-message as a workaround. Report a pending gate if budget cannot
cover it; no automatic credit redemption or reduced acceptance criteria.

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

Source checkouts and locked dependency caches may also be reused after exact
source validation. Fresh campaign custody and chain state do not require a new
source directory. Path remapping alone does not prove cross-root build
reproducibility: compare the produced runtime bytes before carrying a build pin
to another root. A mismatch requires diagnosis, not a weaker comparison or an
unreviewed replacement pin.

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

The provisioning suite now prepares static tracker/family compiler pairs only
inside the groups that use them. A selected fresh-custody V2 positive prepares
no static pair and one fresh signer-bound pair. Matched single runs took 62.70
seconds before and 16.29 seconds after this change; this is not a repeated-run
percentage benchmark. All 114 ordinary cases pass, with the two existing
optional-node cases unexecuted. The full file still prepares its four required
static pairs once and all 53 fresh signer-bound pairs separately. Test bodies,
negative cases and timeouts are preserved; static reuse remains suite-scoped,
not per-case. Compiler caching, blanket parallelism and reduced hosted CI are
separate decisions, not assumed improvements.

At that baseline, the delivery audit identified two missing joins: V2 checker to admission
authority, and the actual V3 campaign caller to that lifecycle. Withdrawal
construction can proceed independently; canonical withdrawal and operational
two-way recovery cannot be claimed before their real consumers run.
