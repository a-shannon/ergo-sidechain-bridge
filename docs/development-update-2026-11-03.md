# Ergo/Substrate bridge: development update, 3 November 2026

Preparation for the next local federated two-cycle run has passed its current
bounded checks. Independent review covers the selected source and dependency
reports, the native module inputs, the WASM package and the locked JVM classpath.
The fresh journal opens through the real StateTracker constructor and closes
successfully. The JVM check at this stage validates runtime metadata; it does
not execute the compiler or prove transaction acceptance.

The final launch review found another Windows environment gap. The parent
passed the profile directories to its worker but dropped the explicit
PowerShell module-cache path. That could recreate a cache inside the source
checkout at the next helper boundary. A direct Parent V3 test reproduced the
dropped value before the correction. The fix adds that one optional field to
the existing environment filter, keeping unrelated variables excluded and the
worker limits unchanged.

All 15 Parent V3 cases and two legacy integration cases pass locally after the
fix. TypeScript and the import checks also pass, and the exact change has an
independent source review. These results close the environment handoff; they
do not establish a successful native campaign.

The next step is operational admission of the exact source, configuration and
single-use launcher. The versioned entry starts a real parent, worker and Root
V2 execution. Its prerequisite checks are separate from permission to start.
The planned run must complete two consecutive deposit, mint, burn and
withdrawal cycles on the same fresh synthetic chain, retaining successor state
and replay history between them. Stopped-state recovery and the operator
rehearsal still follow that result.

The bridge remains an explicitly federated research reference. Two-cycle
runtime acceptance, recovery, operator/FED-7 evidence and external acceptance
remain open. No production-readiness or release claim follows from these local
checks. The STARK-based trustless upgrade remains a separate track.
