import { spawnSync } from 'child_process';

import { describe, expect, it as vitestIt } from 'vitest';

import {
  parseRequiredEvidenceRows,
  REQUIRED_DISALLOWED_CLAIMS,
  REQUIRED_EVIDENCE_CLASSES,
  REQUIRED_OPERATOR_AREAS,
  REQUIRED_SIGNOFF_ROLES,
  REQUIRED_TRUST_ASSUMPTIONS,
  validateReleaseNotes,
} from './release-notes-evidence.js';
import { REQUIRED_PENDING_EVIDENCE_ROWS } from './release-gate.js';

interface ReleaseNotesTestShard {
  index: number;
  count: number;
}

const releaseNotesTestShard = parseReleaseNotesTestShard(
  process.env.RELEASE_NOTES_TEST_SHARD,
);
let releaseNotesTestOrdinal = 0;

function parseReleaseNotesTestShard(raw: string | undefined): ReleaseNotesTestShard | undefined {
  if (!raw) return undefined;
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(raw);
  if (!match) {
    throw new Error(`RELEASE_NOTES_TEST_SHARD must use index/count; got ${raw}`);
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (index > count) {
    throw new Error(`RELEASE_NOTES_TEST_SHARD index must not exceed count; got ${raw}`);
  }
  return { index, count };
}

function shouldRunReleaseNotesTest(): boolean {
  const ordinal = releaseNotesTestOrdinal;
  releaseNotesTestOrdinal += 1;
  if (!releaseNotesTestShard) return true;
  return ordinal % releaseNotesTestShard.count === releaseNotesTestShard.index - 1;
}

function releaseNotesIt(...args: Parameters<typeof vitestIt>): ReturnType<typeof vitestIt> {
  const target = shouldRunReleaseNotesTest() ? vitestIt : vitestIt.skip;
  return target(...args);
}

type ReleaseNotesEachRunner = (
  name: string | Function,
  fn: (...args: any[]) => unknown,
  options?: Parameters<typeof vitestIt>[2],
) => void;

function releaseNotesItEach(
  cases: Parameters<typeof vitestIt.each>[0],
): ReleaseNotesEachRunner {
  return (name, fn, options): void => {
    for (const testCase of cases as unknown as readonly unknown[]) {
      const target = shouldRunReleaseNotesTest() ? vitestIt : vitestIt.skip;
      const each = target.each(
        [testCase] as unknown as Parameters<typeof vitestIt.each>[0],
      ) as unknown as ReleaseNotesEachRunner;
      each(name, fn, options);
    }
  };
}

const it = Object.assign(releaseNotesIt, vitestIt, {
  each: releaseNotesItEach,
}) as typeof vitestIt;

const evidenceRowDetails = new Map<string, [string, string, string]>([
  ['Clean checkout CI', ['linked', 'artifact://release/ci.log npm run ci:validate command output evidence exit code 0', 'required for public release']],
  ['Local devnet lifecycle rehearsal', ['blocker', 'artifact://release/devnet-blocker.md', 'blocks public release']],
  ['Testnet lifecycle rehearsal', ['blocker', 'artifact://release/testnet-blocker.md', 'blocks public release']],
  ['Failed broadcast phantom AVL recovery drill evidence', ['pending', '', 'blocks public release']],
  ['Reorged burn and stale singleton recovery drill evidence', ['pending', '', 'blocks public release']],
  ['ContextExtension signer resolution or guard', ['linked', 'artifact://release/context-extension.log ContextExtension signer guard fail-closed evidence', 'fail-closed guard remains active until upstream signer resolution']],
  ['Signer dependency conformance or fail-closed release decision evidence', ['blocker', '', 'blocks production-ready claims']],
  ['Broadcast gate evidence', ['linked', 'artifact://release/broadcast.log npm run demo:readiness broadcast policy command output evidence exit code 0', 'broadcast remains opt-in']],
  ['SQLite/AVL backup-restore evidence', ['pending', '', 'blocks public release']],
  ['Operator readiness evidence', ['pending', '', 'blocks institutional release claims']],
  ['Committee governance and key-rotation evidence', ['blocker', '', 'blocks production-ready claims']],
  ['Threat model and evidence matrix', ['linked', '[matrix](../docs/security-evidence-matrix.md) npm run threat-model:validate command output evidence exit code 0', 'required for release notes']],
  ['Dependency risk review evidence', ['pending', '', 'blocks public release']],
  ['Independent security review', ['pending', '', 'blocks public release']],
  ['Trustless burn verification evidence', ['blocker', '', 'blocks production-ready claims']],
  ['Single, batch, and sharded benchmark evidence', ['pending', '', 'blocks scaling claims']],
  ['External integration package review', ['pending', '', 'blocks public institutional-reference release']],
  ['Technical addendum architecture manual', ['blocker', '', 'blocks controlled testnet architecture claims']],
]);

const evidenceRows = REQUIRED_EVIDENCE_CLASSES.map(evidenceClass => {
  const details = evidenceRowDetails.get(evidenceClass);
  if (!details) throw new Error(`Missing release-note fixture for required evidence class: ${evidenceClass}`);

  return `| ${[evidenceClass, ...details].join(' | ')} |`;
}).join('\n');

const assumptionRows = REQUIRED_TRUST_ASSUMPTIONS
  .map(assumption => `| ${assumption} | documented | artifact://release/${slug(assumption)}.md | limits release claims |`)
  .join('\n');

const productionClaimBlockers = new Set([
  'Trustless burn verification path',
  'Committee governance and key-rotation drill',
  'Single, batch, and sharded benchmark evidence',
]);

const blockerRows = REQUIRED_PENDING_EVIDENCE_ROWS
  .map(row => [
    row.gate,
    row.item,
    row.unresolvedStatus,
    `Resolve with artifact://release/blockers/${slug(row.item)}.md evidence covering ${row.requiredResolutionTerms.join(', ')}`,
    productionClaimBlockers.has(row.item) ? 'yes' : 'no',
  ])
  .map(row => `| ${row.join(' | ')} |`)
  .join('\n');

function requiredBlockerRow(item: string): string {
  const row = REQUIRED_PENDING_EVIDENCE_ROWS.find(candidate => candidate.item === item);
  if (!row) throw new Error(`Unknown required evidence row: ${item}`);

  return `| ${[
    row.gate,
    row.item,
    row.unresolvedStatus,
    `Resolve with artifact://release/blockers/${slug(row.item)}.md evidence covering ${row.requiredResolutionTerms.join(', ')}`,
    productionClaimBlockers.has(row.item) ? 'yes' : 'no',
  ].join(' | ')} |`;
}

function requiredBlockerRowOmitting(item: string, omittedTerms: string[]): string {
  const row = REQUIRED_PENDING_EVIDENCE_ROWS.find(candidate => candidate.item === item);
  if (!row) throw new Error(`Unknown required evidence row: ${item}`);

  const terms = row.requiredResolutionTerms.filter(term => !omittedTerms.includes(term));
  return `| ${[
    row.gate,
    row.item,
    row.unresolvedStatus,
    `Resolve with artifact://release/blockers/${slug(row.item)}.md evidence covering ${terms.join(', ')}`,
    productionClaimBlockers.has(row.item) ? 'yes' : 'no',
  ].join(' | ')} |`;
}

function requiredBlockerRowReusingPublicationUpdateTarget(
  item: string,
  releaseNoteTerm: string,
  checklistTerm: string,
): string {
  const reusedTarget = `artifact://release/publication-updates/${slug(item)}-publication-update.md`;
  return requiredBlockerRow(item).replace(
    / \| (yes|no) \|$/,
    `; ${reusedTarget} ${releaseNoteTerm}; ${reusedTarget} ${checklistTerm} | $1 |`,
  );
}

function isReleaseNoteUpdateTerm(term: string): boolean {
  return /release-note update evidence|release-note updates/i.test(term);
}

function isChecklistUpdateTerm(term: string): boolean {
  return /checklist update evidence|checklist updates/i.test(term);
}

function isDistinctPublicationUpdateTargetTerm(term: string): boolean {
  if (/external review/i.test(term)) return false;
  return (
    /distinct completed/i.test(term) &&
    /update evidence targets/i.test(term) &&
    (/release-note\/checklist/i.test(term) || /checklist\/release-note/i.test(term))
  );
}

function isDistinctLinkedEvidenceTargetTerm(term: string): boolean {
  return /distinct completed evidence targets across linked/i.test(term);
}

function isPublicationUpdateContradictionTerm(term: string): boolean {
  return /internally non-contradictory/i.test(term) && /publication-update/i.test(term);
}

function isReviewerSignoffTerm(term: string): boolean {
  return /\bsign-off\b/i.test(term);
}

function isReviewerDecisionSummaryTerm(term: string): boolean {
  return /reviewer decision summary/i.test(term);
}

function isReleaseSupportTerm(term: string): boolean {
  return /\brelease support(?:ed)?\b/i.test(term);
}

function isProductionReadyClaimDeniedTerm(term: string): boolean {
  return term === 'Production-ready claim allowed = no';
}

function isProductionReadyClaimHandlingTerm(term: string): boolean {
  return term === 'production-ready claim handling' ||
    term === 'production-ready claim handling with exact `Production-ready claim allowed = no`';
}

function isTestnetProductionCandidateClaimAllowedTerm(term: string): boolean {
  return term === 'Testnet production-candidate claim allowed = yes';
}

function isTestnetProductionCandidateClaimHandlingTerm(term: string): boolean {
  return term.startsWith('testnet production-candidate claim handling');
}

function isReleaseNotesUpdatedTerm(term: string): boolean {
  return term === 'Release notes updated = yes';
}

function isZeroOpenDecisionTerm(term: string): boolean {
  return /^(Critical\/high .* open|Publication blockers|Open .* blockers|Critical incidents open) = 0$/.test(term);
}

function isRehearsalBroadcastBoundaryTerm(term: string): boolean {
  return /^Broadcast (mode at (start|end) disabled|disabled in all shells)$/.test(term);
}

function isBroadcastDisabledOrDryRunTerm(term: string): boolean {
  return term === 'broadcast mode disabled or dry-run';
}

function isLiveRehearsalTemplateTerm(term: string): boolean {
  return term === 'Live Rehearsal Evidence Template';
}

function isRehearsalValidateCommandTerm(term: string): boolean {
  return term === 'npm run rehearsal:validate';
}

const TESTNET_LIFECYCLE_TERMS = new Set([
  'Rehearsal Assembly Evidence',
  'structured assembly report JSON target binding',
  'Assembly status: post-submit evidence included',
  'completed Draft source target',
  'completed External-fee live-preflight source target',
  'completed Post-submit source target',
  'recovery source targets when recovery rows pass',
  '`External-fee live-preflight artifact` completed PASS output',
  'matching External-fee live-preflight Expected transaction ID',
  'Post-submit fragment: included',
  'Post-submit External-fee live-preflight JSON binding status GO with runtimeBroadcastEnabled false and pre-submit boundary preserved',
  'Fresh checkpoint source target',
  'Fresh checkpoint lifecycle status remains publication blocker',
  'Fresh checkpoint Expected transaction ID matches dry-run',
  'Fresh checkpoint deployed-state hash matches clean deployment state',
  'Fresh checkpoint singleton freshness fresh ageSeconds and maxAgeSeconds 900',
  'Fresh checkpoint live anchor observations prove /info-bound observedAt/nodeHeight freshness and 0x0401 bridgeEventRootHex at each Ergo anchor height',
  'Fresh checkpoint boundary does not authorize broadcast, close Gate 3, replace live submit/confirmation/reconciliation, or support release claim escalation',
  'Session Metadata Ergo node network testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording',
  'Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network',
  'Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
  'Fresh testnet lifecycle artifact cites peg-in event ID or TX ID',
  'Fresh testnet lifecycle artifact cites peg-out burn TX ID',
  'Fresh testnet lifecycle artifact cites sidechain block hash',
  'Fresh testnet lifecycle artifact cites bridge event root',
  'Fresh testnet lifecycle artifact cites Expected transaction ID',
  'Fresh testnet lifecycle artifact cites submitted transaction ID',
  'Fresh testnet lifecycle artifact cites singleton checkpoint observedAt ISO UTC',
  'Fresh testnet lifecycle artifact cites singleton checkpoint maxAgeSeconds 900',
  'Fresh testnet lifecycle artifact cites singleton checkpoint ageSeconds',
  'Fresh testnet lifecycle artifact cites singleton checkpoint freshness fresh',
  'rehearsal:external-fee-live-preflight producer',
  'distinct rehearsal:external-fee-live-preflight transcript/report',
  'rehearsal:external-fee-live-preflight PASS output',
  'external-fee live-preflight JSON report completed structured evidence',
  'external-fee live-preflight input target',
  'external-fee live-preflight approvals file target',
  'external-fee live-preflight target binding names the completed live rehearsal target',
  'Settlement profile ID = authenticated-external-fee-v1',
  'Profile activation status = ACTIVATED',
  'Evidence purpose = gate3-lifecycle-closure',
  'Legacy V1 transport = quarantined',
  'Activation evidence target',
  'npm run rehearsal:post-submit:observe',
  'distinct rehearsal:post-submit:observe transcript/report',
  'rehearsal:post-submit:observe PASS output',
  'rehearsal:post-submit:observe --json-out structured report',
  'SPV tracker successor output OUTPUTS(0)',
  'Aggregate DUP successor output OUTPUTS(1)',
  'positional recipient payout binding',
  'canonical miner fee output',
]);

function isTestnetLifecycleTerm(term: string): boolean {
  return TESTNET_LIFECYCLE_TERMS.has(term);
}

const LOCAL_DEVNET_LIFECYCLE_ITEM = 'Fresh local devnet lifecycle run';

const LOCAL_DEVNET_LIFECYCLE_TERMS = new Set([
  'Session Metadata Environment local devnet',
  'ContextExtension guard result identifies ContextExtension guard',
  'sigma-rust/JVM conformance coverage',
  'fail-closed behavior',
  'clean deployment state evidence',
  'contract IDs',
  'concrete 32-byte deployment-state hash or digest',
  'concrete 32-byte contract ID',
  'concrete 32-byte singleton inventory identifier',
  'Current Ergo height starts with non-negative integer',
  'Current Ergo height includes completed node/RPC height artifact marker or non-template evidence link',
  'Current sidechain height starts with non-negative integer',
  'Current sidechain height includes completed node/RPC height artifact marker or non-template evidence link',
  'broadcast reviewer approval names Session Metadata Reviewer',
  'user explicit live broadcast approval',
  'broadcast reviewer approval cites Expected transaction ID',
  '`BRIDGE_BROADCAST_ENABLED=true` scoped-shell evidence',
  'scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true',
  'intended shell scope is limited',
  'readiness command output evidence',
  'broadcast policy output evidence',
  'live settlement readiness output evidence',
  'Live settlement signing output',
  '`npm run demo:readiness` output evidence',
  'broadcast network reconfirmation cites Node URL',
  'broadcast network reconfirmation names Session Metadata Ergo node network',
  'broadcast network reconfirmation names Session Metadata Sidechain network',
  'peg-in evidence cites peg-in event ID or TX ID',
  'peg-out burn evidence cites peg-out burn TX ID',
  'anchor evidence cites sidechain block hash',
  'anchor evidence cites bridge event root',
  'anchor evidence cites Ergo anchor height',
  '`/transactions/check` PASS output evidence',
  'settlement check evidence cites Expected transaction ID',
  'positive miner feeNanoErg amount',
  'settlement submit evidence cites submitted transaction ID',
  'confirmation evidence cites submitted transaction ID',
  'reconciliation evidence cites submitted successor and burn values',
  'submitted DUP successor box ID',
  'submitted SPV tracker successor box ID',
  'recipient payout box ID',
  'reconciliation evidence cites peg-out burn TX ID',
]);

function isLocalDevnetLifecycleTerm(term: string): boolean {
  return LOCAL_DEVNET_LIFECYCLE_TERMS.has(term);
}

const RECOVERY_DRILL_TERMS = new Set([
  'failed broadcast',
  'does not insert phantom DUP or AVL history',
  'failed-broadcast evidence cites Expected transaction ID',
  'failed-broadcast evidence cites peg-out burn TX ID',
  'failed-broadcast evidence includes aggregate settlement attempt bound to Expected transaction ID',
  'failed-broadcast evidence includes peg-out state bound to peg-out burn TX ID',
  'reorged burns',
  'stale singleton boxes',
  'reorged-burn evidence cites peg-out burn TX ID',
  'stale-singleton evidence cites singleton inventory identifier',
  'npm run rehearsal:recovery-observe:validate',
  'recovery-observe JSON validation PASS',
  'structured recovery observation PASS evidence',
  'completed observation artifact',
  'sourceBindings',
  'live-read-only-node source',
  'read-only state-tracker source',
  'runtime path not serialized',
  '`observationBoundary` with read-only node/state observation',
  'signing/broadcast/submit/repair/state mutation/reconciliation/Gate 3 closure/claim escalation all false',
]);

function isRecoveryDrillTerm(term: string): boolean {
  return RECOVERY_DRILL_TERMS.has(term);
}

const BACKUP_RESTORE_ITEM = 'Backup-restore or reconstructibility drill';

const BACKUP_RESTORE_TERMS = new Set([
  'Backup Restore Evidence Template',
  'npm run backup:validate',
  'SQLite restore',
  'command-specific evidence',
  'local SQLite snapshots',
  'npm run backup:snapshot',
  'local snapshot comparison',
  'npm run backup:compare',
  'distinct pre-backup and restored JSON artifacts',
  'restored snapshot generated after pre-backup snapshot',
  'backup:snapshot schema metadata',
  'snapshotSchemaVersions',
  'measured snapshot value formats',
  'snapshot evidenceRows match measured values',
  'state-specific consistency evidence',
  'state evidence cites measured pre-backup/restored values',
  'restore target isolation or reviewer approval',
  'completed reviewer approval evidence',
  'live or runtime restore target review evidence',
  'rollback plan evidence',
  'DUP AVL rebuild',
  'SPV tracker rebuild',
  'anchor preservation',
  'DUP singleton digest comparison or incident classification',
  'SPV tracker singleton digest comparison or incident classification',
  'concrete DUP singleton ID or digest',
  'concrete SPV tracker singleton ID or digest',
  'boundary-specific reconstructibility evidence',
  'boundary-specific reconstructibility checks',
  'stop-condition classifications',
  'condition-specific stop-condition evidence',
  'reviewer sign-off',
  'internally non-contradictory reviewer notes',
  'restore operator sign-off matches drill classification',
  'restore operator sign-off date is not before drill classification Date',
  'production-ready claim handling with exact `Production-ready claim allowed by this drill: no`',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`',
  'completed Gate 3 backup-restore release-note update evidence',
  'completed Gate 3 backup-restore checklist update evidence',
  'distinct completed Gate 3 backup-restore release-note/checklist update evidence targets',
  'backup-restore git hygiene evidence',
  'git status --short',
  'git diff --check',
  'no staged runtime artifacts',
]);

function isBackupRestoreTerm(term: string): boolean {
  return BACKUP_RESTORE_TERMS.has(term);
}

function isIsoDateTerm(term: string): boolean {
  return term === 'ISO Date';
}

function isReleaseLevelProductionCandidateTerm(term: string): boolean {
  return term === 'Release level = production deployment candidate';
}

function isEnvironmentTestnetTerm(term: string): boolean {
  return term === 'Environment = testnet';
}

function isNonEmptyReviewerTerm(term: string): boolean {
  return term === 'non-empty reviewer';
}

const CLEAN_CHECKOUT_ITEM = 'Green CI on the final branch';

const CLEAN_CHECKOUT_TERMS = new Set([
  'Clean Checkout Evidence Template',
  'npm run ci:validate',
  'completed clean checkout evidence',
  'clean checkout validation target',
  'command-specific clean-checkout output evidence',
  'npm ci',
  'npm run check',
  'npm run wasm:test',
  'Release gate structural issues = 0',
  'git hygiene',
  'CI workflow evidence',
  'workflow fact-specific evidence',
  'final branch commit identity',
  'distinct completed evidence targets across linked command/workflow/decision rows',
  'CI reviewer sign-off matches run classification',
  'CI reviewer sign-off date is not before run classification Date',
  'Production-ready claim allowed = no',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
  'reviewer decision summary',
  'release support with exact `Release supported = production deployment candidate`',
  'clean checkout CI green',
  'production-ready claim handling with exact `Production-ready claim allowed = no`',
  'internally non-contradictory clean checkout reviewer notes',
  'completed Gate 1 release-note update evidence',
  'completed Gate 1 checklist update evidence',
  'distinct completed Gate 1 release-note/checklist update evidence targets',
  'internally non-contradictory Gate 1 publication-update evidence',
]);

function isCleanCheckoutTerm(term: string): boolean {
  return CLEAN_CHECKOUT_TERMS.has(term);
}

const DEPENDENCY_FAIL_CLOSED_TERMS = new Set([
  'Dependency Review Evidence Template',
  'npm run dependency:validate',
  'dependency review validation target',
  'fail-closed guard/blocker rationale',
  'explicit fail-closed guard/blocker release-action evidence',
  'completed ContextExtension guard evidence',
  'production-ready claims blocked until upstream signer release is validated',
  'testnet production-candidate claims blocked until upstream signer release is validated',
  'production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`',
  'release support with exact `Release supported = institutional reference`',
  'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = no`',
  'upstream signer blocker handling with exact `Upstream signer blocker resolved = no`',
  'production-ready claim handling with exact `Production-ready claim allowed = no`',
  'no positive critical/high finding counts',
  'dependency reviewer notes that keep signer and vulnerability boundaries',
  'internally non-contradictory dependency reviewer notes',
]);

function isDependencyFailClosedTerm(term: string): boolean {
  return DEPENDENCY_FAIL_CLOSED_TERMS.has(term);
}

const TECHNICAL_ADDENDUM_TERMS = new Set([
  'Testnet Production-Candidate Architecture Manual Template',
  'npm run addendum:validate',
  'completed technical addendum evidence',
  'technical addendum validation target',
  'Environment testnet',
  'structured Manual Classification with non-empty manual name',
  'controlled testnet or production-grade testnet claim wording',
  'non-empty Architecture owner',
  'Manual use status = candidate claim support',
  'Release gate status = pass',
  'concrete `release:gate PASS` output with Structural issues = 0 in the architecture decision evidence for testnet production-candidate wording',
  'Mainnet deployment claim allowed = no',
  'Testnet production-candidate claim allowed = yes-after-release-gate-pass',
  'architecture manual evidence',
  'structured gate-map rows',
  'gate-specific evidence',
  'completed artifact evidence',
  'bounded claim boundaries',
  'distinct completed evidence targets across linked or passed gate-map and architecture-decision rows',
  'architecture-decision rows with decision-specific positions and completed evidence',
  'actionable reviewer notes that keep claim, signer, and broadcast boundaries',
  'Architecture owner sign-off matching Manual Classification Architecture owner',
  'Security reviewer sign-off matching Manual Classification Reviewer',
  'reviewer sign-off dates not before Manual Classification Date',
  'internally non-contradictory technical addendum reviewer notes',
  'release support with exact `Release supported = production deployment candidate`',
  'signer path',
  'ergo-lib-wasm-nodejs',
  'sigma-rust',
  'node-wallet is not the production path',
  'completed Phase 007 release-note update evidence',
  'completed Phase 007 checklist update evidence',
  'distinct completed Phase 007 release-note/checklist update evidence targets',
  'internally non-contradictory Phase 007 publication-update evidence',
]);

function isTechnicalAddendumTerm(term: string): boolean {
  return TECHNICAL_ADDENDUM_TERMS.has(term);
}

const EXTERNAL_INTEGRATION_REVIEW_TERMS = new Set([
  'External Integration Review Template',
  'npm run integration:validate',
  'fresh reviewer',
  'required entry points',
  'completed external integration evidence',
  'integration validation target',
  'completed entry-point review evidence beyond document links',
  'integration decision record',
  'decision-specific evidence',
  'negative review checks',
  'per-command fresh checkout command output evidence',
  'per-command fresh checkout exit code 0 output evidence',
  'per-command fresh or clean checkout context evidence',
  'per-command fresh checkout commit identity',
  'docs',
  'without private maintainer context',
  'specific reviewer organization or affiliation',
  'Private maintainer context used = no',
  'enabled broadcast mode blocked for Gate 8',
  'public institutional-reference release decision',
  'Public institutional-reference release allowed = yes',
  'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
  'Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews',
  'blocked or allowed testnet production-candidate claim handling bound to that field',
  'reviewer notes that do not approve production-ready or mainnet production wording',
  'internally non-contradictory external integration reviewer notes',
  'mainnet release-readiness claims remain forbidden or out of scope',
  'only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
]);

function isExternalIntegrationReviewTerm(term: string): boolean {
  return EXTERNAL_INTEGRATION_REVIEW_TERMS.has(term);
}

const SECURITY_REVIEW_TERMS = new Set([
  'Independent Security Review Evidence Template',
  'npm run security:validate',
  'completed independent security review evidence',
  'security review validation target',
  'required scope coverage',
  'required evidence package',
  'item-specific evidence-package artifact links',
  'finding disposition',
  'required negative review checks',
  'question-specific negative-check evidence',
  'relayer signing',
  'AVL proof generation',
  'sidechain finality',
  'operator recovery',
  'dependency risk',
  'external reviewer organization type',
  'specific external security reviewer organization or affiliation',
  'ISO review period',
  'final security decision handling with exact `Final decision = approve`',
  'critical/high finding closure with exact `Critical/high findings open = 0`',
  'publication blocker closure with exact `Publication blockers = 0`',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
  'accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
  'accepted-risk checklist updates',
  'accepted-risk release-note updates',
  'completed Gate 4 accepted-risk checklist update evidence',
  'completed Gate 4 accepted-risk release-note update evidence',
  'release support with exact `Release supported = production deployment candidate`',
  'area-specific risk-focus notes',
  'lead reviewer binding',
  'reviewer notes that keep finding and accepted-risk boundaries',
  'internally non-contradictory security reviewer notes',
]);

function isSecurityReviewTerm(term: string): boolean {
  return SECURITY_REVIEW_TERMS.has(term);
}

const TRUSTLESS_BURN_TERMS = new Set([
  'Trustless Burn Verification Evidence Template',
  'completed trustless burn evidence',
  'sidechain commitment',
  'SPV relay',
  'burn inclusion proof',
  'DUP binding',
  'Local Proof Vector evidence validated by `trustless-burn-proof.ts`',
  'linked completed `Proof-vector validation report` JSON target consumed by `npm run trustless:validate`',
  'Proof-vector validation report target is not reused as completed row or publication-update evidence',
  'structured fail-closed local negative cases in the checked proof vector',
  'local proof-core negative rows citing matching `negativeCase` names and observed proof-core rejection strings',
  'positive proof acceptance evidence',
  'instance-specific positive proof evidence',
  'positive proof instance values match commitment and burn binding rows',
  'bridgeEventRoot',
  'concrete 32-byte commitment and burn identifiers',
  'numeric heights and indices',
  'positive amountNanoErg burn amount',
  'component-specific trustless properties',
  'completed row evidence that is not a `trustless burn validation target` / `validated target` binding',
  'internally non-contradictory component, commitment, burn-proof, positive-proof, negative-test, publication-update, and reviewer row payloads',
  'negative tests',
  'instance-specific negative proof evidence',
  'concrete 32-byte rejected proof or burn identifiers',
  'unfinalized sidechain block rejection',
  'independent review',
  'reviewer notes that keep claim/protocol boundaries and do not approve trusted fallback wording',
  'release support with exact `Release supported = production deployment candidate`',
  'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
  'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
  'critical/high finding closure with exact `Critical/high findings open = 0`',
  'publication-update fields must include exact `Trustless burn verification implemented = yes` when trustless burn verification is implemented',
  'publication-update fields must include exact `Release supported = production deployment candidate` when Gate 5 `Release level = production deployment candidate`',
  'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
  'publication-update fields must include exact `Testnet production-candidate claim allowed = yes` when the testnet candidate claim is allowed',
  'publication-update fields must include exact `Transitional trusted burn path disabled = yes` when Gate 5 `Transitional trusted burn path disabled = yes`',
  'publication-update fields must include exact `Critical/high findings open = 0` when Gate 5 `Critical/high findings open = 0`',
]);

function isTrustlessBurnTerm(term: string): boolean {
  return TRUSTLESS_BURN_TERMS.has(term);
}

const BENCHMARK_TERMS = new Set([
  'Performance Benchmark Evidence Template',
  'npm run benchmark:validate',
  'completed benchmark evidence',
  'benchmark validation target',
  'command-specific benchmark command output evidence',
  'single settlement',
  'sharded lanes',
  'positive numeric benchmark measurements',
  'positive cost-relevant counts',
  'exactly one positive cost count per key',
  'scenario-specific metric evidence',
  'scenario-specific single/batch/sharded metric evidence',
  'live batch evidence',
  'user explicit live broadcast approval evidence',
  'Expected transaction ID binding',
  'scoped BRIDGE_BROADCAST_ENABLED=true evidence',
  'post-enable demo:readiness PASS evidence',
  'Broadcast policy PASS evidence',
  'Live settlement signing PASS evidence',
  'broadcast network reconfirmation evidence',
  'concrete 32-byte live batch transaction identifier',
  'statement-specific sharded-lane evidence',
  'structured Benchmark Classification with 7-40 character Git commit',
  'Benchmark Classification Environment testnet',
  'Trust path trustless burn proof path',
  'benchmark environment metadata',
  'structured benchmark claims boundary arrays with all required allowed and blocked claims',
  'sample counts bound by metric evidence',
  'cost-relevant counts bound by metric evidence',
  'concrete bottleneck scaling limits',
  'bottleneck-specific completed evidence with impact and next action',
  'linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence',
  'production-ready benchmark claims are always blocked for mainnet',
  'production throughput claims remain blocked for Gate 7 evidence',
  'scaling-claim allowance with exact `Scaling claims allowed = yes`',
  'production throughput claim handling with exact `Production throughput claim allowed = no`',
  'exact `Mainnet-grade evidence linked = no`',
  'release support with exact `Release supported = production deployment candidate`',
  'measured single/batch/sharded evidence',
  'production-ready claim handling with exact `Production-ready claim allowed = no`',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
  'open benchmark blocker handling with exact `Open benchmark blockers = 0`',
  'actionable benchmark reviewer notes that keep the publication claim boundary and do not approve broader benchmark throughput or full parallel L1 settlement wording',
  'internally non-contradictory benchmark reviewer notes',
  'internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence',
]);

function isBenchmarkTerm(term: string): boolean {
  return BENCHMARK_TERMS.has(term);
}

const GOVERNANCE_TERMS = new Set([
  'Committee Governance Evidence Template',
  'npm run governance:validate',
  'completed committee governance evidence',
  'governance validation target',
  'key rotation',
  'command-specific governance command evidence',
  'concrete public key/hash identifiers',
  'disjoint old/new committee identifiers',
  'committee threshold policy',
  'distinct completed evidence targets across linked scope, command, rotation, positive, and negative rows',
  'step-specific rotation evidence',
  'step-specific rotation facts',
  'positive new-committee operation evidence',
  'threshold-specific positive signer identifiers',
  'declared new-committee positive signer identifiers',
  'negative signer identifiers',
  'member-loss',
  'incident drills',
  'structured Drill Classification with 7-40 character Git commit',
  'governance model identifying committee or multisig governance',
  'threshold at least 2',
  'member count at least 3',
  'threshold lower than member count',
  'enabled broadcast mode blocked for Gate 6',
  'governance-ready claim handling with exact `Governance-ready claim allowed = yes`',
  'open governance blocker handling with exact `Open governance blockers = 0`',
  'production-ready claim handling with exact `Production-ready claim allowed = no`',
  'actionable reviewer notes that keep governance boundaries and do not approve open blockers or single-signer fallback',
  'internally non-contradictory governance reviewer notes',
  'governance owner sign-off matches drill classification',
  'governance owner sign-off date is not before drill classification Date',
  'completed Gate 6 governance release-note update evidence',
  'completed Gate 6 governance checklist update evidence',
  'distinct completed Gate 6 governance release-note/checklist update evidence targets',
  'internally non-contradictory governance publication-update evidence',
  'external review evidence must include exact `Governance-ready claim allowed = yes` binding',
  'external review evidence must include exact `Release supported = production deployment candidate` binding',
  'external review evidence must include exact `Testnet production-candidate claim allowed = yes` binding',
  'distinct completed Gate 6 governance external review evidence target from release-note/checklist update evidence targets',
]);

function isGovernanceTerm(term: string): boolean {
  return GOVERNANCE_TERMS.has(term);
}

const OPERATOR_READINESS_TERMS = new Set([
  'Operator Readiness Evidence Template',
  'npm run operator:validate',
  'completed operator readiness evidence',
  'linked runbook coverage',
  'runbook evidence cells state stop-condition and verification-command checks',
  'command-specific operator command evidence',
  'recovery drills',
  'operational decisions',
  'decision-specific operational evidence',
  'distinct completed evidence targets across linked runbook, command, drill, and decision rows',
  'completed row evidence that is not an `operator readiness validation target` / `validated target` binding',
  'structured Readiness Classification with 7-40 character Git commit',
  'Operator type = external operator or exchange operations reviewer',
  'enabled broadcast mode blocked for Gate 6 operator readiness evidence',
  'production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`',
  'release support with exact `Release supported = production deployment candidate`',
  'operator-ready claim handling with exact `Operator-ready claim allowed = yes`',
  'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
  'production-ready claim handling with exact `Production-ready claim allowed = no`',
  'critical incident closure with exact `Critical incidents open = 0`',
  'actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement',
  'internally non-contradictory operator reviewer notes',
  'runbook operator sign-off matches readiness classification',
  'runbook operator sign-off date is not before readiness classification Date',
  'completed operator-readiness release-note update evidence',
  'completed operator-readiness checklist update evidence',
  'distinct completed operator-readiness release-note/checklist update evidence targets',
  'internally non-contradictory operator-readiness publication-update evidence',
]);

function isOperatorReadinessTerm(term: string): boolean {
  return OPERATOR_READINESS_TERMS.has(term);
}

function isRehearsalClaimBoundaryTerm(term: string): boolean {
  return /^(Production-ready|Testnet production-candidate) claim allowed by this rehearsal: no$/.test(term);
}

function isProductionCandidateEnvironmentTerm(term: string): boolean {
  return /^production deployment candidate (support requires exact `Environment` value `testnet`|classification requires Environment used = testnet)$/.test(term);
}

function isProductionCandidateClaimPrerequisiteTerm(term: string): boolean {
  return /^production deployment candidate (support|evidence) requires .*testnet production-candidate claim allowed/i.test(term);
}

const distinctPublicationUpdateTargetCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isDistinctPublicationUpdateTargetTerm)
    .map(term => ({ item: row.item, term })),
);

const publicationUpdateTargetReuseCases = distinctPublicationUpdateTargetCases
  .map(({ item }) => {
    const row = REQUIRED_PENDING_EVIDENCE_ROWS.find(candidate => candidate.item === item);
    if (!row) throw new Error(`Unknown required evidence row: ${item}`);

    return {
      item,
      releaseNoteTerm: row.requiredResolutionTerms.find(isReleaseNoteUpdateTerm),
      checklistTerm: row.requiredResolutionTerms.find(isChecklistUpdateTerm),
    };
  })
  .filter((row): row is { item: string; releaseNoteTerm: string; checklistTerm: string } =>
    row.releaseNoteTerm !== undefined && row.checklistTerm !== undefined,
  );

const distinctLinkedEvidenceTargetCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isDistinctLinkedEvidenceTargetTerm)
    .map(term => ({ item: row.item, term })),
);

const publicationUpdateContradictionCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isPublicationUpdateContradictionTerm)
    .map(term => ({ item: row.item, term })),
);

const reviewerSignoffCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isReviewerSignoffTerm)
    .map(term => ({ item: row.item, term })),
);

const reviewerDecisionSummaryCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isReviewerDecisionSummaryTerm)
    .map(term => ({ item: row.item, term })),
);

const releaseSupportRowCases = REQUIRED_PENDING_EVIDENCE_ROWS
  .map(row => ({
    item: row.item,
    terms: row.requiredResolutionTerms.filter(isReleaseSupportTerm),
  }))
  .filter(({ terms }) => terms.length > 0);

const productionReadyClaimDeniedCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isProductionReadyClaimDeniedTerm)
    .map(term => ({ item: row.item, term })),
);

const productionReadyClaimHandlingCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isProductionReadyClaimHandlingTerm)
    .map(term => ({ item: row.item, term })),
);

const testnetProductionCandidateClaimAllowedCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isTestnetProductionCandidateClaimAllowedTerm)
    .map(term => ({ item: row.item, term })),
);

const testnetProductionCandidateClaimHandlingCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isTestnetProductionCandidateClaimHandlingTerm)
    .map(term => ({ item: row.item, term })),
);

const productionCandidateEnvironmentCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isProductionCandidateEnvironmentTerm)
    .map(term => ({ item: row.item, term })),
);

const productionCandidateClaimPrerequisiteCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isProductionCandidateClaimPrerequisiteTerm)
    .map(term => ({ item: row.item, term })),
);

const releaseNotesUpdatedCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isReleaseNotesUpdatedTerm)
    .map(term => ({ item: row.item, term })),
);

const zeroOpenDecisionCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isZeroOpenDecisionTerm)
    .map(term => ({ item: row.item, term })),
);

const rehearsalBroadcastBoundaryCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isRehearsalBroadcastBoundaryTerm)
    .map(term => ({ item: row.item, term })),
);

const broadcastDisabledOrDryRunCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isBroadcastDisabledOrDryRunTerm)
    .map(term => ({ item: row.item, term })),
);

const liveRehearsalTemplateCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isLiveRehearsalTemplateTerm)
    .map(term => ({ item: row.item, term })),
);

const rehearsalValidateCommandCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isRehearsalValidateCommandTerm)
    .map(term => ({ item: row.item, term })),
);

const testnetLifecycleCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isTestnetLifecycleTerm)
    .map(term => ({ item: row.item, term })),
);

const localDevnetLifecycleCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.item === LOCAL_DEVNET_LIFECYCLE_ITEM
    ? row.requiredResolutionTerms
        .filter(isLocalDevnetLifecycleTerm)
        .map(term => ({ item: row.item, term }))
    : [],
);

const recoveryDrillCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isRecoveryDrillTerm)
    .map(term => ({ item: row.item, term })),
);

const backupRestoreCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.item === BACKUP_RESTORE_ITEM
    ? row.requiredResolutionTerms
        .filter(isBackupRestoreTerm)
        .map(term => ({ item: row.item, term }))
    : [],
);

const isoDateCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isIsoDateTerm)
    .map(term => ({ item: row.item, term })),
);

const releaseLevelProductionCandidateCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isReleaseLevelProductionCandidateTerm)
    .map(term => ({ item: row.item, term })),
);

const environmentTestnetCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isEnvironmentTestnetTerm)
    .map(term => ({ item: row.item, term })),
);

const nonEmptyReviewerCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isNonEmptyReviewerTerm)
    .map(term => ({ item: row.item, term })),
);

const cleanCheckoutCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.item === CLEAN_CHECKOUT_ITEM
    ? row.requiredResolutionTerms
        .filter(isCleanCheckoutTerm)
        .map(term => ({ item: row.item, term }))
    : [],
);

const dependencyFailClosedCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isDependencyFailClosedTerm)
    .map(term => ({ item: row.item, term })),
);

const technicalAddendumCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isTechnicalAddendumTerm)
    .map(term => ({ item: row.item, term })),
);

const externalIntegrationReviewCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isExternalIntegrationReviewTerm)
    .map(term => ({ item: row.item, term })),
);

function externalIntegrationTermsToOmit(term: string): string[] {
  return term === 'Public institutional-reference release allowed = yes'
    ? [
        term,
        'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
      ]
    : [term];
}

const securityReviewCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isSecurityReviewTerm)
    .map(term => ({ item: row.item, term })),
);

const trustlessBurnCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isTrustlessBurnTerm)
    .map(term => ({ item: row.item, term })),
);

const benchmarkCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isBenchmarkTerm)
    .map(term => ({ item: row.item, term })),
);

const governanceCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isGovernanceTerm)
    .map(term => ({ item: row.item, term })),
);

const operatorReadinessCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isOperatorReadinessTerm)
    .map(term => ({ item: row.item, term })),
);

const rehearsalClaimBoundaryCases = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(row =>
  row.requiredResolutionTerms
    .filter(isRehearsalClaimBoundaryTerm)
    .map(term => ({ item: row.item, term })),
);

function checkedRequiredBlockerRow(item: string): string {
  const row = REQUIRED_PENDING_EVIDENCE_ROWS.find(candidate => candidate.item === item);
  if (!row) throw new Error(`Unknown required evidence row: ${item}`);

  return `| ${[
    row.gate,
    row.item,
    'Checked',
    `Completed with artifact://release/blockers/${slug(row.item)}.log evidence covering ${row.requiredResolutionTerms.join(', ')}`,
    'no',
  ].join(' | ')} |`;
}

function requiredResolutionTermsWithPublicationUpdateTargets(
  row: typeof REQUIRED_PENDING_EVIDENCE_ROWS[number],
): string {
  const terms = row.requiredResolutionTerms.join(', ');
  const publicationUpdateTargets = publicationUpdateTargetFacts(row);
  return publicationUpdateTargets.length > 0
    ? `${terms}; ${publicationUpdateTargets.join('; ')}`
    : terms;
}

function publicationUpdateTargetFacts(row: typeof REQUIRED_PENDING_EVIDENCE_ROWS[number]): string[] {
  if (!row.requiredResolutionTerms.some(isDistinctPublicationUpdateTargetTerm)) return [];

  const releaseNoteTerm = row.requiredResolutionTerms.find(isReleaseNoteUpdateTerm);
  const checklistTerm = row.requiredResolutionTerms.find(isChecklistUpdateTerm);
  if (!releaseNoteTerm || !checklistTerm) return [];

  return [
    `artifact://release/publication-updates/${slug(row.item)}-release-note-update.md ${releaseNoteTerm}`,
    `artifact://release/publication-updates/${slug(row.item)}-checklist-update.md ${checklistTerm}`,
  ];
}

function linkedExternalIntegrationEvidenceRow(): string {
  return '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; external integration package review evidence linked |';
}

const TESTNET_LIFECYCLE_SUBMITTED_TX_ID = 'a'.repeat(64);
const TESTNET_LIFECYCLE_DEPLOYED_STATE_HASH = '1'.repeat(64);
const testnetLifecycleValidationFacts =
  `confirmation policy met PASS confirmationsRequired=1 confirmationsObserved=1 ` +
  `observed confirmation count greater than or equal to required confirmation count ` +
  `submitted transaction ID ${TESTNET_LIFECYCLE_SUBMITTED_TX_ID} ` +
  `completed finality evidence artifact://release/completed-finality-testnet.md`;
const testnetLifecycleLivePreflightFacts =
  `reviewer approval evidence artifact://release/reviewer-approval.md ` +
  `user explicit live broadcast approval evidence artifact://release/user-approval.md ` +
  `approvals file artifact://release/approvals.json Expected transaction ID ${TESTNET_LIFECYCLE_SUBMITTED_TX_ID} ` +
  `Settlement profile ID = authenticated-external-fee-v1 Profile activation status = ACTIVATED ` +
  `Evidence purpose = gate3-lifecycle-closure Legacy V1 transport = quarantined ` +
  `Activation evidence target = artifact://release/completed-testnet-settlement-profile-activation.json ` +
  `--json-out artifact://release/external-fee-live-preflight.json ` +
  `external-fee live-preflight JSON report completed structured evidence artifact://release/external-fee-live-preflight.json ` +
  `scoped shell BRIDGE_BROADCAST_ENABLED=true scope limited ` +
  `npm run demo:readiness Broadcast policy PASS Live settlement signing PASS ` +
  `Node URL http://127.0.0.1:9053 Ergo node network testnet Sidechain network non-mainnet`;
const testnetLifecycleAssemblyReportFacts =
  `--json-out artifact://release/rehearsal-assembly-report.json ` +
  `assembly report JSON completed structured evidence artifact://release/rehearsal-assembly-report.json ` +
  `assembly report target artifact://release/rehearsal-assembly-report.json`;
const testnetLifecycleAssemblyReportEvidence =
  'npm run rehearsal:assemble command output: artifact://release/rehearsal-assemble.log PASS exit code 0 ' +
  `${testnetLifecycleAssemblyReportFacts}`;
const testnetLifecyclePostSubmitObserveFacts =
  `--json-out artifact://release/post-submit-observe.json ` +
  `post-submit observe JSON report completed structured evidence artifact://release/post-submit-observe.json ` +
  `submitted transaction ID ${TESTNET_LIFECYCLE_SUBMITTED_TX_ID} ` +
  `Expected transaction ID ${TESTNET_LIFECYCLE_SUBMITTED_TX_ID} ` +
  `SPV tracker successor output OUTPUTS(0) ` +
  `Aggregate DUP successor output OUTPUTS(1) ` +
  `positional recipient payout binding canonical miner fee output`;
const testnetLifecyclePostSubmitObserveEvidence =
  'npm run rehearsal:post-submit:observe command output: artifact://release/post-submit-observe.log PASS exit code 0 ' +
  `${testnetLifecyclePostSubmitObserveFacts}`;
const testnetLifecycleFreshCheckpointFacts =
  `--json-out artifact://release/fresh-testnet-checkpoint.json ` +
  `fresh checkpoint JSON report completed structured evidence artifact://release/fresh-testnet-checkpoint.json ` +
  `fresh checkpoint target artifact://release/fresh-testnet-checkpoint.json ` +
  `Fresh checkpoint Expected transaction ID ${TESTNET_LIFECYCLE_SUBMITTED_TX_ID} ` +
  `Fresh checkpoint deployed-state hash ${TESTNET_LIFECYCLE_DEPLOYED_STATE_HASH} ` +
  `Fresh checkpoint singleton freshness fresh ageSeconds 60 maxAgeSeconds 900 ` +
  `Fresh checkpoint live anchor observations prove /info-bound observedAt nodeHeight and 0x0401 bridgeEventRootHex matching ` +
  `sourceBindings.heightEvidence mode live-read-only-sources readOnlyErgoNodeClient true ` +
  `readOnlySidechainRpcClient true nodeAuthHeader not-used operations /info,EVM getBlockNumber broadcastEnabled false ` +
  `sourceBindings.singletonCheckpoint mode live-read-only-node readOnlyNodeClient true nodeAuthHeader not-used ` +
  `operations /info,singleton boxes,mempool/unconfirmed lookup,confirmed transaction lookup ` +
  `sourceBindings.anchorObservations mode live-read-only-node readOnlyNodeClient true nodeAuthHeader not-used ` +
  `operations /info,Ergo extension fields,0x0401 bridgeEventRoot matching ` +
  `Fresh checkpoint boundary broadcast false live submit false confirmation false reconciliation false ` +
  `Gate 3 closure false claim escalation false`;
const testnetLifecycleFreshCheckpointEvidence =
  'npm run rehearsal:fresh-testnet-check command output: artifact://release/fresh-testnet-checkpoint.log PASS exit code 0 ' +
  `${testnetLifecycleFreshCheckpointFacts}`;
const completedTestnetLifecycleEvidenceLink =
  'artifact://release/completed-live-rehearsal-testnet.md; ' +
  'npm run rehearsal:validate command output: artifact://release/live-rehearsal-validation.log PASS exit code 0 ' +
  `${testnetLifecycleValidationFacts} validated target artifact://release/completed-live-rehearsal-testnet.md; ` +
  `${testnetLifecycleAssemblyReportEvidence}; ` +
  'npm run rehearsal:external-fee-live-preflight command output: artifact://release/external-fee-live-preflight.log PASS exit code 0 ' +
  `${testnetLifecycleLivePreflightFacts} external-fee live-preflight target artifact://release/completed-live-rehearsal-testnet.md; ` +
  `${testnetLifecycleFreshCheckpointEvidence}; ` +
  testnetLifecyclePostSubmitObserveEvidence;
const pluralDirectoryTestnetLifecycleEvidenceLink =
  'artifact://evidence/live-rehearsals/completed-testnet-rehearsal.md; ' +
  'npm run rehearsal:validate command output: artifact://release/live-rehearsal-validation.log PASS exit code 0 ' +
  `${testnetLifecycleValidationFacts} validated target artifact://evidence/live-rehearsals/completed-testnet-rehearsal.md; ` +
  `${testnetLifecycleAssemblyReportEvidence}; ` +
  'npm run rehearsal:external-fee-live-preflight command output: artifact://release/external-fee-live-preflight.log PASS exit code 0 ' +
  `${testnetLifecycleLivePreflightFacts} external-fee live-preflight target artifact://evidence/live-rehearsals/completed-testnet-rehearsal.md; ` +
  `${testnetLifecycleFreshCheckpointEvidence}; ` +
  testnetLifecyclePostSubmitObserveEvidence;
const targetlessValidationTestnetLifecycleEvidenceLink =
  'artifact://release/completed-live-rehearsal-testnet.md; npm run rehearsal:validate command output: PASS exit code 0 ' +
  `${testnetLifecycleValidationFacts} validated target artifact://release/completed-live-rehearsal-testnet.md; ` +
  `${testnetLifecycleAssemblyReportEvidence}; ` +
  'npm run rehearsal:external-fee-live-preflight command output: artifact://release/external-fee-live-preflight.log PASS exit code 0 ' +
  `${testnetLifecycleLivePreflightFacts} external-fee live-preflight target artifact://release/completed-live-rehearsal-testnet.md; ` +
  `${testnetLifecycleFreshCheckpointEvidence}; ` +
  testnetLifecyclePostSubmitObserveEvidence;
const sameTargetValidationTestnetLifecycleEvidenceLink =
  'artifact://release/completed-live-rehearsal-testnet.md; npm run rehearsal:validate command output: artifact://release/completed-live-rehearsal-testnet.md PASS exit code 0 ' +
  `${testnetLifecycleValidationFacts} validated target artifact://release/completed-live-rehearsal-testnet.md; ` +
  `${testnetLifecycleAssemblyReportEvidence}; ` +
  'npm run rehearsal:external-fee-live-preflight command output: artifact://release/external-fee-live-preflight.log PASS exit code 0 ' +
  `${testnetLifecycleLivePreflightFacts} external-fee live-preflight target artifact://release/completed-live-rehearsal-testnet.md; ` +
  `${testnetLifecycleFreshCheckpointEvidence}; ` +
  testnetLifecyclePostSubmitObserveEvidence;
const testnetLifecycleProductionDecisionBoundary =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; ' +
  'Testnet production-candidate claim allowed = yes; production candidate evidence linked; ' +
  'Ergo node network testnet; Sidechain network patched-devnet';
const linkedProductionTestnetLifecycleEvidenceRow =
  `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | ${testnetLifecycleProductionDecisionBoundary} |`;

const RECOVERY_EXPECTED_TX_ID = 'd'.repeat(64);
const RECOVERY_BURN_TX_ID = 'e'.repeat(64);
const RECOVERY_SINGLETON_ID = 'f'.repeat(64);
const failedBroadcastRecoveryObserveTarget = 'artifact://release/failed-broadcast-recovery-observe.json';
const reorgRecoveryObserveTarget = 'artifact://release/reorg-stale-singleton-recovery-observe.json';
const recoveryObserveSourceBindingEvidence =
  'sourceBindings.node sourceType live-read-only-node readOnly true noAuthHeader true no runtime paths ' +
  'sourceBindings.state sourceType read-only-state-tracker readOnly true runtimePathSerialized false no runtime paths';
const recoveryObserveBoundaryEvidence =
  'observationBoundary read-only node/state observation signing false broadcast false submit false repair false ' +
  'state mutation false reconciliation false Gate 3 closure false claim escalation false';
const failedBroadcastRecoveryObserveEvidence =
  'npm run rehearsal:recovery-observe command output: artifact://release/failed-broadcast-recovery-observe.log PASS exit code 0 ' +
  `--kind failed-broadcast-phantom-avl --json-out ${failedBroadcastRecoveryObserveTarget} ` +
  `structured recovery observation PASS evidence completed observation artifact ${failedBroadcastRecoveryObserveTarget} ` +
  `${recoveryObserveSourceBindingEvidence} ${recoveryObserveBoundaryEvidence} ` +
  `failed-broadcast-phantom-avl Expected transaction ID ${RECOVERY_EXPECTED_TX_ID} ` +
  `peg-out burn TX ID ${RECOVERY_BURN_TX_ID} no phantom AVL history no phantom DUP history ` +
  'no confirmed chain presence no mempool presence; ' +
  'npm run rehearsal:recovery-observe:validate command output: artifact://release/failed-broadcast-recovery-observe-validate.log PASS exit code 0 ' +
  `recovery-observe JSON validation PASS recovery-observe validation target ${failedBroadcastRecoveryObserveTarget} ` +
  'failed-broadcast-phantom-avl';
const reorgRecoveryObserveEvidence =
  'npm run rehearsal:recovery-observe command output: artifact://release/reorg-stale-singleton-recovery-observe.log PASS exit code 0 ' +
  `--kind reorged-burn-stale-singleton --json-out ${reorgRecoveryObserveTarget} ` +
  `structured recovery observation PASS evidence completed observation artifact ${reorgRecoveryObserveTarget} ` +
  `${recoveryObserveSourceBindingEvidence} ${recoveryObserveBoundaryEvidence} ` +
  `reorged-burn-stale-singleton peg-out burn TX ID ${RECOVERY_BURN_TX_ID} ` +
  `singleton inventory identifier ${RECOVERY_SINGLETON_ID} recoverable stale singleton candidate; ` +
  'npm run rehearsal:recovery-observe:validate command output: artifact://release/reorg-stale-singleton-recovery-observe-validate.log PASS exit code 0 ' +
  `recovery-observe JSON validation PASS recovery-observe validation target ${reorgRecoveryObserveTarget} ` +
  'reorged-burn-stale-singleton';
const failedBroadcastRecoveryProductionDecisionBoundary =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; ' +
  'Testnet production-candidate claim allowed = yes; failed broadcast phantom AVL recovery evidence linked';
const reorgRecoveryProductionDecisionBoundary =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; ' +
  'Testnet production-candidate claim allowed = yes; reorged burn and stale singleton recovery evidence linked';

function linkedFailedBroadcastRecoveryEvidenceRow(
  evidence = failedBroadcastRecoveryObserveEvidence,
): string {
  return `| Failed broadcast phantom AVL recovery drill evidence | linked | ${evidence} | ${failedBroadcastRecoveryProductionDecisionBoundary} |`;
}

function linkedReorgRecoveryEvidenceRow(evidence = reorgRecoveryObserveEvidence): string {
  return `| Reorged burn and stale singleton recovery drill evidence | linked | ${evidence} | ${reorgRecoveryProductionDecisionBoundary} |`;
}

const cleanCheckoutProductionDecisionBoundary =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; ' +
  'Testnet production-candidate claim allowed = yes; Release gate structural issues = 0; clean checkout CI evidence linked';
const threatModelProductionDecisionBoundary =
  'Release supported = production deployment candidate; Production-ready claim allowed = no; ' +
  'Testnet production-candidate claim allowed = yes; threat model and evidence matrix evidence linked';
const technicalAddendumProductionDecisionBoundary =
  'Release supported = production deployment candidate; Release gate status = pass; ' +
  'release:gate PASS output with Structural issues = 0; Production-ready claim allowed = no; ' +
  'Mainnet deployment claim allowed = no; Testnet production-candidate claim allowed = yes-after-release-gate-pass; ' +
  'technical addendum architecture manual evidence linked';

const linkedProductionEvidenceRows = evidenceRows
  .split('\n')
  .map(row => {
    const [evidenceClass] = row.slice(1, -1).split('|').map(cell => cell.trim());
    const linkOrArtifact =
      evidenceClass === 'External integration package review'
        ? `artifact://release/${slug(evidenceClass)}.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0`
        : evidenceClass === 'Clean checkout CI'
          ? `artifact://release/${slug(evidenceClass)}.log npm run ci:validate command output evidence exit code 0`
        : evidenceClass === 'ContextExtension signer resolution or guard'
          ? `artifact://release/${slug(evidenceClass)}.log ContextExtension upstream signer resolution boundary evidence`
        : evidenceClass === 'SQLite/AVL backup-restore evidence'
          ? `artifact://release/${slug(evidenceClass)}.log npm run backup:validate command output evidence exit code 0`
        : evidenceClass === 'Broadcast gate evidence'
          ? `artifact://release/${slug(evidenceClass)}.log npm run demo:readiness broadcast policy command output evidence exit code 0`
        : evidenceClass === 'Testnet lifecycle rehearsal'
          ? completedTestnetLifecycleEvidenceLink
        : evidenceClass === 'Independent security review'
          ? `artifact://release/${slug(evidenceClass)}.log npm run security:validate command output evidence exit code 0`
        : evidenceClass === 'Trustless burn verification evidence'
          ? `artifact://release/${slug(evidenceClass)}.log npm run trustless:validate command output evidence exit code 0`
        : evidenceClass === 'Committee governance and key-rotation evidence'
          ? `artifact://release/${slug(evidenceClass)}.log command-specific governance command output evidence exit code 0`
        : evidenceClass === 'Operator readiness evidence'
          ? `artifact://release/${slug(evidenceClass)}.log command-specific operator command output evidence exit code 0`
        : evidenceClass === 'Single, batch, and sharded benchmark evidence'
          ? `artifact://release/${slug(evidenceClass)}.log command-specific benchmark command output evidence exit code 0`
        : evidenceClass === 'Threat model and evidence matrix'
          ? `artifact://release/${slug(evidenceClass)}.log npm run threat-model:validate command output evidence exit code 0`
        : evidenceClass === 'Dependency risk review evidence'
          ? `artifact://release/${slug(evidenceClass)}.log npm run dependency:validate command output evidence exit code 0`
        : evidenceClass === 'Technical addendum architecture manual'
          ? `artifact://release/${slug(evidenceClass)}.log npm run addendum:validate command output evidence exit code 0`
        : evidenceClass === 'Failed broadcast phantom AVL recovery drill evidence'
          ? failedBroadcastRecoveryObserveEvidence
        : evidenceClass === 'Reorged burn and stale singleton recovery drill evidence'
          ? reorgRecoveryObserveEvidence
        : `artifact://release/${slug(evidenceClass)}.log`;
    const publicationEffect =
      evidenceClass === 'Signer dependency conformance or fail-closed release decision evidence'
        ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked'
        : evidenceClass === 'Clean checkout CI'
          ? cleanCheckoutProductionDecisionBoundary
        : evidenceClass === 'ContextExtension signer resolution or guard'
          ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; ContextExtension upstream signer resolution boundary evidence linked'
        : evidenceClass === 'SQLite/AVL backup-restore evidence'
          ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; backup-restore evidence linked'
        : evidenceClass === 'Broadcast gate evidence'
          ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Broadcast remains opt-in = yes; broadcast gate evidence linked'
        : evidenceClass === 'Independent security review'
          ? 'Release supported = production deployment candidate; Final decision = approve; Critical/high findings open = 0; Publication blockers = 0; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; independent security review evidence linked'
        : evidenceClass === 'Trustless burn verification evidence'
          ? 'Trustless burn verification implemented = yes; Release supported = production deployment candidate; Transitional trusted burn path disabled = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; trustless burn verification evidence linked'
        : evidenceClass === 'Committee governance and key-rotation evidence'
          ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Governance-ready claim allowed = yes; Open governance blockers = 0; committee governance and key-rotation evidence linked'
        : evidenceClass === 'Operator readiness evidence'
          ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Operator-ready claim allowed = yes; Critical incidents open = 0; operator readiness evidence linked'
        : evidenceClass === 'Single, batch, and sharded benchmark evidence'
          ? 'Release supported = production deployment candidate; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; measured benchmark evidence linked'
        : evidenceClass === 'External integration package review'
          ? 'Release supported = production deployment candidate; Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; external integration package review evidence linked'
        : evidenceClass === 'Threat model and evidence matrix'
          ? threatModelProductionDecisionBoundary
        : evidenceClass === 'Dependency risk review evidence'
          ? 'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high vulnerabilities open = 0; dependency risk review evidence linked'
        : evidenceClass === 'Technical addendum architecture manual'
          ? technicalAddendumProductionDecisionBoundary
        : evidenceClass === 'Testnet lifecycle rehearsal'
          ? testnetLifecycleProductionDecisionBoundary
        : evidenceClass === 'Failed broadcast phantom AVL recovery drill evidence'
          ? failedBroadcastRecoveryProductionDecisionBoundary
        : evidenceClass === 'Reorged burn and stale singleton recovery drill evidence'
          ? reorgRecoveryProductionDecisionBoundary
        : 'production candidate evidence linked';
    return `| ${evidenceClass} | linked | ${linkOrArtifact} | ${publicationEffect} |`;
  })
  .join('\n');

const checkedProductionBlockerRows = REQUIRED_PENDING_EVIDENCE_ROWS
  .map(row =>
    `| ${row.gate} | ${row.item} | Checked | artifact://release/${slug(row.item)}.log covering ${requiredResolutionTermsWithPublicationUpdateTargets(row)} | no |`,
  )
  .join('\n');

const operatorRowDetails = new Map<string, [string, string]>([
  ['Deployment state', ['verify deployed singleton state with runbook', 'stop on deployment state mismatch']],
  ['Broadcast enablement', ['follow broadcast enable/disable runbook', 'disable broadcast on mismatch']],
  ['SQLite/AVL backup restore', ['run SQLite/AVL backup restore verification', 'stop on backup restore mismatch']],
  ['Monitoring and alerting', ['monitor status and alert channels', 'stop on monitoring alert mismatch']],
  ['Incident response', ['follow incident response triage runbook', 'pause on incident response mismatch']],
]);

const operatorRows = REQUIRED_OPERATOR_AREAS.map(area => {
  const details = operatorRowDetails.get(area);
  if (!details) throw new Error(`Missing release-note fixture for required operator area: ${area}`);

  return `| ${[area, ...details].join(' | ')} |`;
}).join('\n');

const signoffNotes = new Map<string, string>([
  ['Maintainer', 'maintainer approved release decision, scope, blockers, and publication claim control'],
  ['Security reviewer', 'security reviewer approved trust assumptions, claims, blockers, and evidence controls'],
  ['Operator reviewer', 'operator reviewer approved operator impact, runbooks, blockers, and readiness controls'],
]);

const signoffRows = REQUIRED_SIGNOFF_ROLES.map(role => {
  const notes = signoffNotes.get(role);
  if (!notes) throw new Error(`Missing release-note fixture for required sign-off role: ${role}`);
  const name = role === 'Maintainer' ? 'maintainer-a' : 'reviewer-a';

  return `| ${role} | ${name} | approve | 2026-05-14 | ${notes} |`;
}).join('\n');

const disallowedChecks = REQUIRED_DISALLOWED_CLAIMS.map(check => `- [x] ${check}`).join('\n');

const templateOnlyEvidence = '[Release Notes Template](release-notes-template.md), `npm run release-notes:validate`';

function releaseNotes(overrides: {
  releaseLevel?: string;
  decision?: string;
  evidence?: string;
  assumptions?: string;
  blockers?: string;
  claims?: string;
  operatorImpact?: string;
  signoffs?: string;
  disallowed?: string;
  scope?: string;
} = {}): string {
  return `
# Completed Release Notes

## Release Classification

| Field | Value |
|---|---|
| Release name | institutional reference rc |
| Git commit | abc1234 |
| Release level | ${overrides.releaseLevel ?? 'institutional reference'} |
| Decision | ${overrides.decision ?? 'blocked'} |
| Decision owner | maintainer-a |
| Decision date | 2026-05-14 |

## Scope Statement

${overrides.scope ?? '> This release is not a production-ready bridge claim. It is published only at the release level stated above, with the blockers and trust assumptions listed in these notes.'}

## Required Evidence

| Evidence class | Status | Link or artifact | Publication effect |
|---|---|---|---|
${overrides.evidence ?? evidenceRows}

## Trust Assumptions

| Assumption | Current status | Evidence | Release impact |
|---|---|---|---|
${overrides.assumptions ?? assumptionRows}

## Publication Blockers

| Gate | Blocker | Status | Required resolution | Scoped out? |
|---|---|---|---|---|
${overrides.blockers ?? blockerRows}

## Allowed Claims

| Claim | Evidence link | Allowed wording |
|---|---|---|
${overrides.claims ?? '| local guard evidence | artifact://release/local-guards.log | guarded locally, pending live evidence |'}

## Disallowed Claims Check

${overrides.disallowed ?? disallowedChecks}

## Operator Impact

| Area | Required operator action | Stop condition |
|---|---|---|
${overrides.operatorImpact ?? operatorRows}

## Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
${overrides.signoffs ?? signoffRows}
`;
}

describe('release notes validation', () => {
  it('prints release decision and release-gate boundaries in validator CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-release-notes.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run release-notes:validate');
    expect(result.stdout).toContain('completed Release Notes Markdown');
    expect(result.stdout).toContain('release-notes validation target');
    expect(result.stdout).toContain('command-specific completed release-notes command output evidence');
    expect(result.stdout).toContain('Release gate structural issues = 0');
    expect(result.stdout).toContain('completed release notes document target');
    expect(result.stdout).toContain('validation log, transcript, CI run, or workflow artifact');
    expect(result.stdout).toContain('Production-ready claims allowed = no');
    expect(result.stdout).toContain('Testnet production-candidate claims allowed');
    expect(result.stdout).toContain('Unresolved publication blockers');
    expect(result.stdout).toContain(
      'does not sign, submit, publish, push, deploy, broadcast, or open runtime databases',
    );
  });

  it('parses required evidence rows', () => {
    const rows = parseRequiredEvidenceRows(releaseNotes());

    expect(rows[0]).toMatchObject({
      evidenceClass: 'Clean checkout CI',
      status: 'linked',
    });
  });

  it('passes when release notes are structured and blockers are explicit', () => {
    const result = validateReleaseNotes(releaseNotes());

    expect(result.status).toBe('PASS');
    expect(result.classification).toMatchObject({
      releaseName: 'institutional reference rc',
      gitCommit: 'abc1234',
      releaseLevel: 'institutional reference',
      decision: 'blocked',
      decisionOwner: 'maintainer-a',
      decisionDate: '2026-05-14',
    });
    expect(result.evidenceRows).toHaveLength(REQUIRED_EVIDENCE_CLASSES.length);
    expect(result.blockerRows).toHaveLength(REQUIRED_PENDING_EVIDENCE_ROWS.length);
  });

  it('rejects release-note row evidence with contradictory failure markers', () => {
    const contradictoryEvidence = 'command output: PASS exit code 0 release notes validation BLOCKED with 1 structural issue';
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        'artifact://release/ci.log',
        `artifact://release/ci.log ${contradictoryEvidence}`,
      ),
      assumptions: assumptionRows.replace(
        'artifact://release/trusted-oracle-burn-interpretation.md',
        `artifact://release/trusted-oracle-burn-interpretation.md ${contradictoryEvidence}`,
      ),
      blockers: blockerRows.replace(
        'artifact://release/blockers/green-ci-on-the-final-branch.md',
        `artifact://release/blockers/green-ci-on-the-final-branch.md ${contradictoryEvidence}`,
      ),
      claims: `| local guard evidence | artifact://release/local-guards.log ${contradictoryEvidence} | guarded locally, pending live evidence |`,
      operatorImpact: operatorRows.replace(
        'verify deployed singleton state with runbook',
        `verify deployed singleton state with runbook ${contradictoryEvidence}`,
      ),
      signoffs: signoffRows.replace(
        'maintainer approved release decision, scope, blockers, and publication claim control',
        `maintainer approved release decision, scope, blockers, and publication claim control ${contradictoryEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required resolution must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: required operator action must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: notes must not include contradictory release-note failure markers',
    );
  });

  it('rejects release-note row evidence with compatibility-normalized contradictory failure markers', () => {
    const contradictoryEvidence = 'command output: PASS exit code 0 release notes validation\uFF1ABLOCKED with \uFF11 structural issue';
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        'artifact://release/ci.log',
        `artifact://release/ci.log ${contradictoryEvidence}`,
      ),
      blockers: blockerRows.replace(
        'artifact://release/blockers/green-ci-on-the-final-branch.md',
        `artifact://release/blockers/green-ci-on-the-final-branch.md ${contradictoryEvidence}`,
      ),
      signoffs: signoffRows.replace(
        'maintainer approved release decision, scope, blockers, and publication claim control',
        `maintainer approved release decision, scope, blockers, and publication claim control ${contradictoryEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required resolution must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: notes must not include contradictory release-note failure markers',
    );
  });

  it('rejects release-note row evidence with conditional approval outcome markers', () => {
    for (const contradictoryEvidence of [
      'command output: PASS exit code 0 release notes validation runOutcome="approval required"',
      'command output: PASS exit code 0 release notes validation runOutcome="approved with conditions"',
      'command output: PASS exit code 0 release notes validation status="qualified approval"',
      'command output: PASS exit code 0 release notes validation approved with conditions',
      'command output: PASS exit code 0 release notes validation qualified approval',
      'command output: PASS exit code 0 release notes validation accepted subject to reviewer sign-off',
      'command output: PASS exit code 0 release notes validation pass subject to security review',
      'command output: PASS exit code 0 release notes validation requires reviewer sign-off',
      'command output: PASS exit code 0 release notes validation awaiting reviewer sign-off',
      'command output: PASS exit code 0 release notes validation pending approval',
      'command output: PASS exit code 0 release notes validation reviewer approval remains pending',
      'command output: PASS exit code 0 release notes validation security review is deferred',
      'command output: PASS exit code 0 release notes validation reviewer sign-off stays open',
      'command output: PASS exit code 0 release notes validation approval was outstanding',
      'command output: PASS exit code 0 release notes validation reviewer approval is still pending',
      'command output: PASS exit code 0 release notes validation security review still pending',
      'command output: PASS exit code 0 release notes validation reviewer sign-off currently open',
      'command output: PASS exit code 0 release notes validation approval now deferred',
      'command output: PASS exit code 0 release notes validation reviewer approval not yet complete',
      'command output: PASS exit code 0 release notes validation security review not yet approved',
      'command output: PASS exit code 0 release notes validation reviewer sign-off not yet received',
      'command output: PASS exit code 0 release notes validation approval not yet granted',
      'command output: PASS exit code 0 release notes validation reviewer approval has not been completed',
      'command output: PASS exit code 0 release notes validation security review has not been approved',
      'command output: PASS exit code 0 release notes validation reviewer sign-off has not been received',
      'command output: PASS exit code 0 release notes validation approval has not been granted',
      'command output: PASS exit code 0 release notes validation reviewer approval remains incomplete',
      'command output: PASS exit code 0 release notes validation security review is unapproved',
      'command output: PASS exit code 0 release notes validation reviewer sign-off remains unreceived',
      'command output: PASS exit code 0 release notes validation approval remains ungranted',
      'command output: PASS exit code 0 release notes validation approval is unfinalized',
      'command output: PASS exit code 0 release notes validation reviewer approval incomplete',
      'command output: PASS exit code 0 release notes validation security review unapproved',
      'command output: PASS exit code 0 release notes validation reviewer sign-off unreceived',
      'command output: PASS exit code 0 release notes validation approval ungranted',
      'command output: PASS exit code 0 release notes validation approval unfinalized',
      'command output: PASS exit code 0 release notes validation reviewer approval denied',
      'command output: PASS exit code 0 release notes validation security review is rejected',
      'command output: PASS exit code 0 release notes validation reviewer sign-off refused',
      'command output: PASS exit code 0 release notes validation approval declined',
      'command output: PASS exit code 0 release notes validation approval was denied',
      'command output: PASS exit code 0 release notes validation approval has been rejected',
      'command output: PASS exit code 0 release notes validation reviewer approval revoked',
      'command output: PASS exit code 0 release notes validation security review is withdrawn',
      'command output: PASS exit code 0 release notes validation reviewer sign-off rescinded',
      'command output: PASS exit code 0 release notes validation approval voided',
      'command output: PASS exit code 0 release notes validation approval was revoked',
      'command output: PASS exit code 0 release notes validation approval has been invalidated',
      'command output: PASS exit code 0 release notes validation reviewer approval expired',
      'command output: PASS exit code 0 release notes validation security review is stale',
      'command output: PASS exit code 0 release notes validation reviewer sign-off lapsed',
      'command output: PASS exit code 0 release notes validation approval outdated',
      'command output: PASS exit code 0 release notes validation approval was obsolete',
      'command output: PASS exit code 0 release notes validation approval has expired',
      'command output: PASS exit code 0 release notes validation approval has been superseded',
      'command output: PASS exit code 0 release notes validation reviewer approval failed',
      'command output: PASS exit code 0 release notes validation security review is unsuccessful',
      'command output: PASS exit code 0 release notes validation reviewer sign-off aborted',
      'command output: PASS exit code 0 release notes validation approval canceled',
      'command output: PASS exit code 0 release notes validation approval was cancelled',
      'command output: PASS exit code 0 release notes validation approval has failed',
      'command output: PASS exit code 0 release notes validation approval has been aborted',
      'command output: PASS exit code 0 release notes validation approval did not pass',
      'command output: PASS exit code 0 release notes validation subject to reviewer approval',
      'command output: PASS exit code 0 release notes validation blocked until security review',
      'command output: PASS exit code 0 release notes validation gated on reviewer sign-off',
      'command output: PASS exit code 0 release notes validation approval outstanding',
      'command output: PASS exit code 0 release notes validation missing reviewer sign-off',
      'command output: PASS exit code 0 release notes validation contingent on reviewer approval',
      'command output: PASS exit code 0 release notes validation conditioned on security review',
      'command output: PASS exit code 0 release notes validation approval to follow',
      'command output: PASS exit code 0 release notes validation reviewer sign-off tbd',
      'command output: PASS exit code 0 release notes validation reviewer approval scheduled',
      'command output: PASS exit code 0 release notes validation security review planned',
      'command output: PASS exit code 0 release notes validation reviewer sign-off forthcoming',
      'command output: PASS exit code 0 release notes validation reviewer approval upcoming',
      'command output: PASS exit code 0 release notes validation security review later',
      'command output: PASS exit code 0 release notes validation reviewer approval post-release',
      'command output: PASS exit code 0 release notes validation security review after release',
      'command output: PASS exit code 0 release notes validation reviewer approval next release',
      'command output: PASS exit code 0 release notes validation security review future release',
      'command output: PASS exit code 0 release notes validation reviewer approval next milestone',
      'command output: PASS exit code 0 release notes validation security review future milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval subsequent release',
      'command output: PASS exit code 0 release notes validation security review following release',
      'command output: PASS exit code 0 release notes validation reviewer approval subsequent milestone',
      'command output: PASS exit code 0 release notes validation security review following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval slated for next release',
      'command output: PASS exit code 0 release notes validation security review queued for following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval delayed until next release',
      'command output: PASS exit code 0 release notes validation security review postponed to following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval shifted to next release',
      'command output: PASS exit code 0 release notes validation security review rescheduled for following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval tabled until next release',
      'command output: PASS exit code 0 release notes validation security review held for following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval shelved until next release',
      'command output: PASS exit code 0 release notes validation security review shelved for following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval held over to next release',
      'command output: PASS exit code 0 release notes validation security review suspended until following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval paused until next release',
      'command output: PASS exit code 0 release notes validation reviewer approval bumped to next release',
      'command output: PASS exit code 0 release notes validation security review slipped until following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval punted to next release',
      'command output: PASS exit code 0 release notes validation security review backlogged for following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval on hold until next release',
      'command output: PASS exit code 0 release notes validation security review parked until following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval put off until next release',
      'command output: PASS exit code 0 release notes validation reviewer approval pushed back to next release',
      'command output: PASS exit code 0 release notes validation security review moved to following milestone',
      'command output: PASS exit code 0 release notes validation reviewer approval carried over to next release',
      'command output: PASS exit code 0 release notes validation security review rolled over to following milestone',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${contradictoryEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  }, 30_000);

  it('rejects release-note row evidence with structured failure fields', () => {
    const emptyStructuredFields = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        'artifact://release/ci.log',
        'artifact://release/ci.log {"errors":[]} errorCount: 0',
      ),
    }));

    expect(emptyStructuredFields.status).toBe('PASS');
    expect(emptyStructuredFields.errors).toEqual([]);

    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        'artifact://release/ci.log',
        'artifact://release/ci.log errorCount: 1',
      ),
      assumptions: assumptionRows.replace(
        'artifact://release/trusted-oracle-burn-interpretation.md',
        'artifact://release/trusted-oracle-burn-interpretation.md {"errors":["assumption gap"]}',
      ),
      blockers: blockerRows.replace(
        'artifact://release/blockers/green-ci-on-the-final-branch.md',
        'artifact://release/blockers/green-ci-on-the-final-branch.md {"failures":{"resolution":"blocked"}}',
      ),
      claims: '| local guard evidence | artifact://release/local-guards.log failureTotal: 1 | guarded locally, pending live evidence |',
      operatorImpact: operatorRows.replace(
        'verify deployed singleton state with runbook',
        'verify deployed singleton state with runbook {"errors":["operator gap"]}',
      ),
      signoffs: signoffRows.replace(
        'maintainer approved release decision, scope, blockers, and publication claim control',
        'maintainer approved release decision, scope, blockers, and publication claim control failureTotal: 1',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required resolution must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: required operator action must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: notes must not include contradictory release-note failure markers',
    );
  });

  it('rejects release-note claim rows with contradictory exact decision bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        'artifact://release/blockers/green-ci-on-the-final-branch.md',
        'artifact://release/blockers/green-ci-on-the-final-branch.md; ' +
          'Release supported = production deployment candidate; Release supported = draft;',
      ),
      claims:
        '| local guard evidence | artifact://release/local-guards.log local guard evidence completed; ' +
        'Production-ready claim allowed = no; Production-ready claim allowed = yes | guarded locally; ' +
        'Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required resolution must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: allowed wording must not include contradictory release-note decision bindings',
    );
  });

  it('rejects release-note claim rows with compatibility-normalized contradictory decision bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        'artifact://release/blockers/green-ci-on-the-final-branch.md',
        'artifact://release/blockers/green-ci-on-the-final-branch.md; ' +
          'Release supported = production deployment candidate; Release supported \uFF1D draft;',
      ),
      claims:
        '| local guard evidence | artifact://release/local-guards.log local guard evidence completed; ' +
        'Production-ready claim allowed = no; Production-ready claim allowed \uFF1D yes | guarded locally; ' +
        'Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed \uFF1D no |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required resolution must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: allowed wording must not include contradictory release-note decision bindings',
    );
  });

  it('rejects release-note trust assumptions with contradictory exact decision bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows
        .replace(
          'artifact://release/trusted-oracle-burn-interpretation.md',
          'artifact://release/trusted-oracle-burn-interpretation.md; ' +
            'Production-ready claim allowed = no; Production-ready claim allowed = yes',
        )
        .replace(
          'limits release claims',
          'limits release claims; Testnet production-candidate claim allowed = yes; ' +
            'Testnet production-candidate claim allowed = no',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: release impact must not include contradictory release-note decision bindings',
    );
  });

  it('rejects release-note operator and sign-off rows with contradictory exact decision bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      operatorImpact: operatorRows
        .replace(
          'verify deployed singleton state with runbook',
          'verify deployed singleton state with runbook; Critical incidents open = 0; Critical incidents open = 1',
        )
        .replace(
          'stop on deployment state mismatch',
          'stop on deployment state mismatch; Open benchmark blockers = 0; Open benchmark blockers = 1',
        ),
      signoffs: signoffRows.replace(
        'maintainer approved release decision, scope, blockers, and publication claim control',
        'maintainer approved release decision, scope, blockers, and publication claim control; ' +
          'Release supported = institutional reference; Release supported = draft',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: required operator action must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: stop condition must not include contradictory release-note decision bindings',
    );
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: notes must not include contradictory release-note decision bindings',
    );
  });

  it('rejects release-note row evidence with remaining issue markers', () => {
    const remainingIssueEvidence = 'command output: PASS exit code 0 Remaining issues: unresolved release-note blocker';
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        'artifact://release/ci.log',
        `artifact://release/ci.log ${remainingIssueEvidence}`,
      ),
      assumptions: assumptionRows.replace(
        'artifact://release/trusted-oracle-burn-interpretation.md',
        `artifact://release/trusted-oracle-burn-interpretation.md ${remainingIssueEvidence}`,
      ),
      blockers: blockerRows.replace(
        'artifact://release/blockers/green-ci-on-the-final-branch.md',
        `artifact://release/blockers/green-ci-on-the-final-branch.md ${remainingIssueEvidence}`,
      ),
      claims: `| local guard evidence | artifact://release/local-guards.log ${remainingIssueEvidence} | guarded locally, pending live evidence |`,
      operatorImpact: operatorRows.replace(
        'verify deployed singleton state with runbook',
        `verify deployed singleton state with runbook ${remainingIssueEvidence}`,
      ),
      signoffs: signoffRows.replace(
        'maintainer approved release decision, scope, blockers, and publication claim control',
        `maintainer approved release decision, scope, blockers, and publication claim control ${remainingIssueEvidence}`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required resolution must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: required operator action must not include contradictory release-note failure markers',
    );
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: notes must not include contradictory release-note failure markers',
    );
  });

  it('rejects release-note row evidence with open or known issue markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open issues: unresolved release-note blocker',
      'command output: PASS exit code 0 Known issues: unresolved release-note blocker',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with active or residual issue markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Active issues: release-note blocker',
      'command output: PASS exit code 0 Residual blockers: release-note blocker',
      'command output: PASS exit code 0 activeFindings: [release-note-finding]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with unaddressed or unmitigated issue markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Unaddressed issues: release-note blocker',
      'command output: PASS exit code 0 Unmitigated risks: release-note blocker',
      'command output: PASS exit code 0 unmitigatedRisks: [release-note-risk]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with unremediated or unpatched issue markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Unremediated findings: release-note blocker',
      'command output: PASS exit code 0 Unpatched defects: release-note blocker',
      'command output: PASS exit code 0 unpatchedDefects: [release-note-defect]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open incident or risk markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open incidents: release-note blocker',
      'command output: PASS exit code 0 Pending risks: release-note blocker',
      'command output: PASS exit code 0 openRisks: [release-note-risk]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open defect or gap markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open defects: release-note blocker',
      'command output: PASS exit code 0 Remaining gaps: release-note blocker',
      'command output: PASS exit code 0 gapsOpen: [release-note-gap]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open action item or task markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open action items: release-note blocker',
      'command output: PASS exit code 0 Remaining tasks: release-note blocker',
      'command output: PASS exit code 0 tasksOpen: [release-note-task]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open escalation markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open escalations: release-note blocker',
      'command output: PASS exit code 0 Pending escalated actions: release-note blocker',
      'command output: PASS exit code 0 escalationsOpen: [release-note-escalation]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open handoff markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open handoffs: release-note blocker',
      'command output: PASS exit code 0 Remaining handoffs: release-note blocker',
      'command output: PASS exit code 0 handoffsOpen: [release-note-handoff]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open authorization markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open authorizations: release-note blocker',
      'command output: PASS exit code 0 Pending permissions: release-note blocker',
      'command output: PASS exit code 0 authorizationsOpen: [release-note-auth]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open clearance markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open clearances: release-note blocker',
      'command output: PASS exit code 0 Pending consent: release-note blocker',
      'command output: PASS exit code 0 consentsOpen: [release-note-consent]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open exception or waiver markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open exceptions: release-note waiver',
      'command output: PASS exit code 0 Remaining deviations: release-note blocker',
      'command output: PASS exit code 0 waiversOpen: [release-note-waiver]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open limitation or caveat markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open limitations: release-note blocker',
      'command output: PASS exit code 0 Pending caveats: release-note blocker',
      'command output: PASS exit code 0 constraintsOpen: [release-note-constraint]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open remediation or mitigation markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open remediations: release-note blocker',
      'command output: PASS exit code 0 Pending mitigations: release-note blocker',
      'command output: PASS exit code 0 correctiveActionsOpen: [release-note-action]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open question or unknown markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open questions: release-note blocker',
      'command output: PASS exit code 0 Remaining uncertainties: release-note blocker',
      'command output: PASS exit code 0 unknownsOpen: [release-note-unknown]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open attestation or sign-off markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open attestations: release-note blocker',
      'command output: PASS exit code 0 Pending sign-offs: release-note blocker',
      'command output: PASS exit code 0 signOffsOpen: [release-note-signoff]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open concern or reservation markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Open concerns: release-note blocker',
      'command output: PASS exit code 0 Pending reservations: release-note blocker',
      'command output: PASS exit code 0 objectionsOpen: [release-note-objection]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with open prerequisite or dependency markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending prerequisites: release-note blocker',
      'command output: PASS exit code 0 Remaining requirements: release-note blocker',
      'command output: PASS exit code 0 dependenciesOpen: [release-note-dependency]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending review markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending review: release-note blocker',
      'command output: PASS exit code 0 Open reviews - release-note blocker',
      'command output: PASS exit code 0 openReviews: [release-note-review]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending decision markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending decision: release-note blocker',
      'command output: PASS exit code 0 Open decisions - release-note blocker',
      'command output: PASS exit code 0 decisionsPending: true',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending approval markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending approval: release-note blocker',
      'command output: PASS exit code 0 Open signer approvals: release-note blocker',
      'command output: PASS exit code 0 Pending reviewer approval - release-note blocker',
      'command output: PASS exit code 0 approvalsPending: true',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending certification markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending certification: release-note blocker',
      'command output: PASS exit code 0 Open release certifications: release-note blocker',
      'command output: PASS exit code 0 certificationsOpen: [release-note-certification]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending audit or assessment markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending audit: release-note blocker',
      'command output: PASS exit code 0 Open security assessments: release-note blocker',
      'command output: PASS exit code 0 assessmentsOpen: [release-note-assessment]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending validation or verification markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending validation: release-note blocker',
      'command output: PASS exit code 0 Open proof verifications: release-note blocker',
      'command output: PASS exit code 0 verificationsOpen: [release-note-verification]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending signature markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending signature: release-note blocker',
      'command output: PASS exit code 0 Open operator signatures: release-note blocker',
      'command output: PASS exit code 0 signaturesOpen: [release-note-signature]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending acceptance or endorsement markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending acceptance: release-note blocker',
      'command output: PASS exit code 0 Open operator acceptances: release-note blocker',
      'command output: PASS exit code 0 endorsementsOpen: [release-note-endorsement]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending acknowledgment markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending acknowledgment: release-note blocker',
      'command output: PASS exit code 0 Open operator acknowledgements: release-note blocker',
      'command output: PASS exit code 0 acknowledgementsOpen: [release-note-ack]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending ownership or assignment markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending ownership: release-note blocker',
      'command output: PASS exit code 0 Open evidence owners: release-note blocker',
      'command output: PASS exit code 0 Remaining reviewer assignments: release-note blocker',
      'command output: PASS exit code 0 assignmentsOpen: [release-note-reviewer]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending responsibility or accountability markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending responsibility: release-note blocker',
      'command output: PASS exit code 0 Open accountabilities: release-note blocker',
      'command output: PASS exit code 0 Remaining reviewer responsibilities: release-note blocker',
      'command output: PASS exit code 0 accountabilitiesOpen: [release-note-reviewer]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending confirmation or observation markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending confirmation: release-note blocker',
      'command output: PASS exit code 0 Open settlement confirmations: release-note blocker',
      'command output: PASS exit code 0 Remaining post-submit observations: release-note blocker',
      'command output: PASS exit code 0 observationsOpen: [release-note-observation]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence with pending provenance or binding markers', () => {
    for (const issueEvidence of [
      'command output: PASS exit code 0 Pending provenance: release-note blocker',
      'command output: PASS exit code 0 Open target bindings: release-note blocker',
      'command output: PASS exit code 0 Remaining release provenance: release-note blocker',
      'command output: PASS exit code 0 bindingsOpen: [release-note-binding]',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          'artifact://release/ci.log',
          `artifact://release/ci.log ${issueEvidence}`,
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: evidence must not include contradictory release-note failure markers',
      );
    }
  });

  it('rejects release-note row evidence that only cites release-note validation targets', () => {
    const checkedGreenCiRow = checkedRequiredBlockerRow('Green CI on the final branch');
    const validationTargetGreenCiRow = checkedGreenCiRow.replace(
      'Completed with artifact://release/blockers/green-ci-on-the-final-branch.log evidence',
      '[release-notes validation target](artifact://release/blockers/green-ci-on-the-final-branch.log) ' +
        'completed publication blocker evidence',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | [release-notes validation target](artifact://release/ci.log) completed release-note evidence for Clean checkout CI | required for public release |',
      ),
      assumptions: assumptionRows.replace(
        '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
        '| Trusted-oracle burn interpretation | documented | [release-notes validation target](artifact://release/trusted-oracle-burn-interpretation.md) completed release-note trust assumption evidence for Trusted-oracle burn interpretation | limits release claims |',
      ),
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        validationTargetGreenCiRow,
      ),
      claims:
        '| local guard evidence | [release-notes validation target](artifact://release/local-guards.log) completed release-note claim-boundary evidence for local guard evidence | guarded locally, pending live evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('blocks the blank template shape', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: '| Clean checkout CI | pending / linked / blocker | | |',
      assumptions: '| Trusted-oracle burn interpretation | | | |',
      blockers: '| | | | | yes / no |',
      claims: '| | | |',
      operatorImpact: '| Deployment state | | |',
      signoffs: '| Maintainer | | approve / block | | |',
      disallowed: disallowedChecks.replace('- [x] No absolute security claim.', '- [ ] No absolute security claim.'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: Local devnet lifecycle rehearsal: missing required row');
    expect(result.errors).toContain('Trust Assumptions: Trusted-oracle burn interpretation: current status is required');
    expect(result.errors).toContain('Publication Blockers: non-production release notes must copy unresolved checklist blockers');
    expect(result.errors).toContain('Operator Impact: Deployment state: required operator action is required');
    expect(result.errors).toContain('Sign-Off: Maintainer: name is required');
    expect(result.errors).toContain('Disallowed Claims Check: "No absolute security claim." must be checked');
  });

  it('requires every claim guard checklist row to be checked', () => {
    const claimGuard = 'No backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild claim without linked backup-restore evidence.';
    const result = validateReleaseNotes(releaseNotes({
      disallowed: disallowedChecks.replace(`- [x] ${claimGuard}`, `- [ ] ${claimGuard}`),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(`Disallowed Claims Check: "${claimGuard}" must be checked`);
  });

  it('rejects row-named non-concrete artifact targets for linked release-note evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/placeholder-clean-checkout-ci.log | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects row-named sample-domain artifact targets for release-note evidence rows', () => {
    const checkedGreenCiRow = checkedRequiredBlockerRow('Green CI on the final branch');
    const sampleGreenCiRow = checkedGreenCiRow.replace(
      'artifact://release/blockers/green-ci-on-the-final-branch.log',
      'artifact://release/sample-publication-blocker-green-ci-on-the-final-branch.log',
    );

    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/sample-required-evidence-clean-checkout-ci.log | required for public release |',
      ),
      assumptions: assumptionRows.replace(
        '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
        '| Trusted-oracle burn interpretation | documented | artifact://release/sample-trust-assumption-trusted-oracle-burn-interpretation.md | limits release claims |',
      ),
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        sampleGreenCiRow,
      ),
      claims:
        '| local guard evidence | artifact://release/sample-allowed-claim-local-guard-evidence.log | guarded locally, pending live evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it.each([
    'artifact://release/fixture-clean-checkout-ci.log',
    'artifact://release/mock-clean-checkout-ci.log',
    'artifact://release/dummy-clean-checkout-ci.log',
    'artifact://release/fake-clean-checkout-ci.log',
    'artifact://release/stub-clean-checkout-ci.log',
    'artifact://release/testdata-clean-checkout-ci.log',
    'artifact://release/synthetic-clean-checkout-ci.log',
    'artifact://release/simulated-clean-checkout-ci.log',
  ])('rejects fixture-style artifact marker %s for linked release-note evidence', artifactTarget => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        `| Clean checkout CI | linked | ${artifactTarget} | required for public release |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it.each([
    '[fixture](../evidence/release/fixture-clean-checkout-ci.log)',
    '[mock](../evidence/release/mock-clean-checkout-ci.log)',
    '[dummy](../evidence/release/dummy-clean-checkout-ci.log)',
    '[fake](../evidence/release/fake-clean-checkout-ci.log)',
    '[stub](../evidence/release/stub-clean-checkout-ci.log)',
    '[testdata](../evidence/release/testdata-clean-checkout-ci.log)',
    '[synthetic](../evidence/release/synthetic-clean-checkout-ci.log)',
    '[simulated](../evidence/release/simulated-clean-checkout-ci.log)',
  ])('rejects fixture-style Markdown link %s for linked release-note evidence', markdownTarget => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        `| Clean checkout CI | linked | ${markdownTarget} | required for public release |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it.each([
    {
      variant: 'raw',
      evidenceTarget: ['', 'tmp', 'release-ci.log'].join('/'),
      assumptionTarget: ['C:', 'tmp', 'trusted-oracle-burn-interpretation.md'].join('/'),
      blockerTarget: ['file:', '', '', 'C:', 'tmp', 'green-ci-on-the-final-branch.log'].join('/'),
      claimTarget: ['', '', 'share-name', 'local-guards.log'].join('/'),
    },
    {
      variant: 'encoded',
      evidenceTarget: '%2Ftmp%2Frelease-ci.log',
      assumptionTarget: 'C%3A%2Ftmp%2Ftrusted-oracle-burn-interpretation.md',
      blockerTarget: 'file%3A%2F%2F%2FC%3A%2Ftmp%2Fgreen-ci-on-the-final-branch.log',
      claimTarget: '%2F%2Fshare-name%2Flocal-guards.log',
    },
    {
      variant: 'embedded encoded',
      evidenceTarget: 'artifact://release/sourceTarget=%2Ftmp%2Frelease-ci.log',
      assumptionTarget: 'artifact://release/sourceTarget=C%3A%2Ftmp%2Ftrusted-oracle-burn-interpretation.md',
      blockerTarget:
        'artifact://release/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fgreen-ci-on-the-final-branch.log',
      claimTarget: 'artifact://release/sourceTarget=%2F%2Fshare-name%2Flocal-guards.log',
    },
  ])(
    'rejects $variant local-only evidence targets in release-note evidence rows',
    ({ evidenceTarget, assumptionTarget, blockerTarget, claimTarget }) => {
      const checkedGreenCiRow = checkedRequiredBlockerRow('Green CI on the final branch');
      const localOnlyGreenCiRow = checkedGreenCiRow.replace(
        'Completed with artifact://release/blockers/green-ci-on-the-final-branch.log evidence',
        `Completed with [green CI evidence](${blockerTarget}) evidence`,
      );

      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
          `| Clean checkout CI | linked | [clean checkout CI evidence](${evidenceTarget}) | required for public release |`,
        ),
        assumptions: assumptionRows.replace(
          '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
          `| Trusted-oracle burn interpretation | documented | [trusted-oracle burn interpretation evidence](${assumptionTarget}) | limits release claims |`,
        ),
        blockers: blockerRows.replace(
          requiredBlockerRow('Green CI on the final branch'),
          localOnlyGreenCiRow,
        ),
        claims:
          `| local guard evidence | [local guard evidence](${claimTarget}) | guarded locally, pending live evidence |`,
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
      );
      expect(result.errors).toContain(
        'Trust Assumptions: Trusted-oracle burn interpretation: evidence must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
      );
      expect(result.errors).toContain(
        'Publication Blockers: Green CI on the final branch: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
      );
      expect(result.errors).toContain(
        'Allowed Claims: local guard evidence: evidence link must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
      );
    },
  );

  it('rejects sensitive or runtime targets in release-note evidence rows', () => {
    for (const target of [
      'relayer/private-key.md',
      'relayer/wallet-mnemonic.md',
      'relayer/bridge-state.sqlite',
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        evidence: evidenceRows.replace(
          '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
          `| Clean checkout CI | linked | [clean checkout CI evidence](${target}) npm run ci:validate command output evidence exit code 0 | required for public release |`,
        ),
      }));

      expect(result.status, target).toBe('BLOCKED');
      expect(result.errors, target).toContain(
        'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
      );
    }
  });

  it('allows concrete release-note evidence targets that mention sample size', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/sample-size-analysis-clean-checkout-ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
      ),
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires disallowed-claim checks to cover mainnet spelling variants', () => {
    const expandedMainnetClaimGuard =
      'No forbidden mainnet-scoped claim: mainnet, main-net, main net, main network, or main chain paired with forbidden production-ready, production-candidate, go-live, general availability, generally available, or production launch wording; production-candidate language is testnet-only.';
    const legacyMainnetClaimGuard =
      'No mainnet production-ready claim; production-candidate language is testnet-only.';
    const result = validateReleaseNotes(releaseNotes({
      disallowed: disallowedChecks.replace(expandedMainnetClaimGuard, legacyMainnetClaimGuard),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(`Disallowed Claims Check: "${expandedMainnetClaimGuard}" must be checked`);
  });

  it('requires disallowed-claim checks to cover production-readiness wording', () => {
    const expandedProductionReadyClaimGuard =
      'No unqualified production-ready or production-readiness claim.';
    const legacyProductionReadyClaimGuard = 'No unqualified production-ready claim.';
    const result = validateReleaseNotes(releaseNotes({
      disallowed: disallowedChecks.replace(expandedProductionReadyClaimGuard, legacyProductionReadyClaimGuard),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(`Disallowed Claims Check: "${expandedProductionReadyClaimGuard}" must be checked`);
  });

  it('requires release notes to track Gate 8 external integration evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows
        .split('\n')
        .filter(row => !row.includes('External integration package review'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: External integration package review: missing required row');
  });

  it('requires release notes to track Gate 2 technical addendum evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows
        .split('\n')
        .filter(row => !row.includes('Technical addendum architecture manual'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: Technical addendum architecture manual: missing required row');
  });

  it('requires release notes to track Gate 6 committee governance evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows
        .split('\n')
        .filter(row => !row.includes('Committee governance and key-rotation evidence'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: Committee governance and key-rotation evidence: missing required row');
  });

  it('requires release notes to track Gate 3 recovery drill evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows
        .split('\n')
        .filter(row => !row.includes('Failed broadcast phantom AVL recovery drill evidence'))
        .filter(row => !row.includes('Reorged burn and stale singleton recovery drill evidence'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: Failed broadcast phantom AVL recovery drill evidence: missing required row');
    expect(result.errors).toContain('Required Evidence: Reorged burn and stale singleton recovery drill evidence: missing required row');
  });

  it('requires release notes to track Gate 4 signer dependency evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows
        .split('\n')
        .filter(row => !row.includes('Signer dependency conformance or fail-closed release decision evidence'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: Signer dependency conformance or fail-closed release decision evidence: missing required row');
  });

  it('requires non-production release notes to copy every checklist blocker row', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .split('\n')
        .filter(row => !row.includes('Fresh Ergo testnet lifecycle run'))
        .join('\n'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: missing required blocker row',
    );
  });

  it('requires blocked release decisions while unscoped publication blockers remain', () => {
    const result = validateReleaseNotes(releaseNotes({
      decision: 'proposed',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Release Classification: Decision must be blocked while unscoped publication blockers remain',
    );
  });

  it('rejects institutional-reference release notes that scope out institutional blockers', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Green CI on the final branch'),
          requiredBlockerRow('Green CI on the final branch').replace('| no |', '| yes |'),
        )
        .replace(
          requiredBlockerRow('External integration package review'),
          requiredBlockerRow('External integration package review').replace('| no |', '| yes |'),
        )
        .replace(
          requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
          requiredBlockerRow('Signer dependency conformance or fail-closed release decision').replace('| no |', '| yes |'),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: institutional reference release cannot scope out this required blocker',
    );
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: institutional reference release cannot scope out this required blocker',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: institutional reference release cannot scope out this required blocker',
    );
  });

  it('rejects validated-PoC release notes that scope out minimum PoC evidence blockers', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'validated PoC',
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Green CI on the final branch'),
          requiredBlockerRow('Green CI on the final branch').replace('| no |', '| yes |'),
        )
        .replace(
          requiredBlockerRow('Fresh local devnet lifecycle run'),
          requiredBlockerRow('Fresh local devnet lifecycle run').replace('| no |', '| yes |'),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: validated PoC release cannot scope out this required blocker',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: validated PoC release cannot scope out this required blocker',
    );
  });

  it('rejects duplicate required rows in release-note evidence tables', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: `${evidenceRows}\n| Clean checkout CI | linked | artifact://release/ci-second.log | duplicate evidence |`,
      assumptions: `${assumptionRows}\n| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-second.md | duplicate assumption |`,
      operatorImpact: `${operatorRows}\n| Deployment state | follow runbook | stop on mismatch |`,
      signoffs: `${signoffRows}\n| Maintainer | reviewer-b | approve | 2026-05-14 | release notes duplicate signoff reviewed |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Required Evidence: Clean checkout CI: duplicate required row');
    expect(result.errors).toContain('Trust Assumptions: Trusted-oracle burn interpretation: duplicate required row');
    expect(result.errors).toContain('Operator Impact: Deployment state: duplicate required row');
    expect(result.errors).toContain('Sign-Off: Maintainer: duplicate required row');
  });

  it('rejects duplicate release classification fields', () => {
    const result = validateReleaseNotes(
      releaseNotes().replace('| Git commit | abc1234 |', '| Git commit | abc1234 |\n| Git commit | def5678 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Release Classification: Git commit: duplicate required field');
  });

  it('blocks absolute security wording in release names', () => {
    const result = validateReleaseNotes(
      releaseNotes().replace('| Release name | institutional reference rc |', '| Release name | funds-safe bridge release |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Release Classification: Release name: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks production-oriented release names below production deployment candidate level', () => {
    const result = validateReleaseNotes(
      releaseNotes().replace('| Release name | institutional reference rc |', '| Release name | exchange-grade mainnet bridge |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Release Classification: Release name: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks compact production-oriented release names below production deployment candidate level', () => {
    for (const wording of [
      'prodready bridge',
      'productioncandidate bridge',
      'productiongrade bridge',
      'prodgrade bridge',
      'readyforproduction bridge',
    ]) {
      const result = validateReleaseNotes(
        releaseNotes().replace('| Release name | institutional reference rc |', `| Release name | ${wording} |`),
      );

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        'Release Classification: Release name: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
      );
    }
  });

  it('blocks unqualified production-ready allowed claims even with production candidate evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| bridge readiness | artifact://release/bridge-readiness.log bridge readiness claim | production-ready bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: bridge readiness: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks compact unqualified production-ready allowed claims even with production candidate evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| bridge readiness | artifact://release/bridge-readiness.log bridge readiness claim | prodready bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: bridge readiness: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks compact production-grade wording even when testnet evidence is otherwise complete', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| compact production grade | artifact://release/compact-production-grade.log compact production grade claim | productiongrade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: compact production grade: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('requires canonical production-grade testnet public wording', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | testnet production-grade bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: allowed wording must use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('requires canonical testnet production-candidate release-name wording', () => {
    const result = validateReleaseNotes(
      releaseNotes({
        releaseLevel: 'production deployment candidate',
        decision: 'proposed',
        evidence: linkedProductionEvidenceRows,
        blockers: checkedProductionBlockerRows,
      }).replace(
        '| Release name | institutional reference rc |',
        '| Release name | production-candidate testnet release |',
      ),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Release Classification: Release name: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks mainnet production-ready allowed claims even with production candidate evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| mainnet readiness | artifact://release/mainnet-readiness.log mainnet readiness claim | mainnet production-ready bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: mainnet readiness: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks mainnet production claims hidden in allowed claim evidence links', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims:
        '| bridge readiness | artifact://release/bridge-readiness.log bridge readiness claim for mainnet go-live | bridge readiness evidence package |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: bridge readiness: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('requires production candidate evidence for testnet production claims hidden in evidence links', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims:
        '| bridge readiness | artifact://release/bridge-readiness.log bridge readiness claim for testnet production-candidate | bridge readiness evidence package |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: bridge readiness: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks spaced or hyphenated mainnet production candidate allowed claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| main net readiness | artifact://release/main-net-readiness.log main net readiness claim | main-net production-candidate bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: main net readiness: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks main network and main chain production candidate allowed claims', () => {
    const mainNetwork = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| main network readiness | artifact://release/main-network-readiness.log main network readiness claim | main network production-candidate bridge |',
    }));
    const mainChain = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| main chain readiness | artifact://release/main-chain-readiness.log main chain readiness claim | main chain production-candidate bridge |',
    }));

    expect(mainNetwork.status).toBe('BLOCKED');
    expect(mainNetwork.errors).toContain(
      'Allowed Claims: main network readiness: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
    expect(mainChain.status).toBe('BLOCKED');
    expect(mainChain.errors).toContain(
      'Allowed Claims: main chain readiness: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('requires evidence for spaced or hyphenated testnet production candidate allowed claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| test net production candidate | artifact://release/test-net-production-candidate.log test net production candidate claim | test-net production candidate bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: test net production candidate: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks testnet production-grade allowed claims without upstream signer conformance evidence', () => {
    const failClosedSignerEvidence = linkedProductionEvidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-conformance-or-fail-closed-release-decision-evidence.log | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: failClosedSignerEvidence,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: testnet production-candidate claims require upstream signer conformance evidence',
    );
  });

  it('treats negative upstream signer conformance wording as blocker evidence', () => {
    const negativeSignerEvidence = linkedProductionEvidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-conformance-or-fail-closed-release-decision-evidence.log | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; JVM/node conformance evidence missing; fail-closed signer guard remains active |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: negativeSignerEvidence,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: testnet production-candidate claims require upstream signer conformance evidence',
    );
  });

  it('treats partially or not-yet validated upstream signer wording as blocker evidence', () => {
    const negativeSignerEvidence = linkedProductionEvidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-conformance-or-fail-closed-release-decision-evidence.log | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/partial-signer.log | production candidate evidence linked; Upstream signer blocker resolved = yes; JVM/node conformance not fully validated; live /transactions/check not yet verified |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: negativeSignerEvidence,
      blockers: checkedProductionBlockerRows,
      scope: '> Testnet-only production candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: testnet production-candidate claims require upstream signer conformance evidence',
    );
  });

  it('blocks testnet production-grade allowed claims unless required publication blockers are checked', () => {
    const blockersWithOpenTestnetLifecycle = REQUIRED_PENDING_EVIDENCE_ROWS
      .map(row =>
        row.item === 'Fresh Ergo testnet lifecycle run'
          ? requiredBlockerRow(row.item)
          : checkedRequiredBlockerRow(row.item),
      )
      .join('\n');
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: blockersWithOpenTestnetLifecycle,
      scope: '> Testnet-only production candidate evidence package with every evidence row linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: testnet production-candidate claims require checked publication blockers: Fresh Ergo testnet lifecycle run',
    );
  });

  it('requires checked publication blockers to link resolution evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        '| Gate 1 | Green CI on the final branch | Checked | CI resolved locally | no |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row requires a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects checked publication blockers whose command output has no evidence target', () => {
    const row = REQUIRED_PENDING_EVIDENCE_ROWS.find(candidate => candidate.item === 'Green CI on the final branch');
    if (!row) throw new Error('test fixture missing Gate 1 row');

    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        `| ${row.gate} | ${row.item} | Checked | Completed evidence covers ${row.requiredResolutionTerms.join(', ')}. Green CI on the final branch \`npm run ci:validate\` command output: PASS. | no |`,
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('blocks absolute security wording in publication blocker required resolutions', () => {
    const blocker = requiredBlockerRow('Green CI on the final branch');
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        blocker,
        blocker.replace('evidence covering', 'evidence covering user funds are safe,'),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks production claim wording in publication blocker names', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | mainnet production-ready launch blocker | Pending evidence | artifact://release/blockers/custody-review.log evidence covering custody operations review | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: mainnet production-ready launch blocker: blocker name: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks testnet production-candidate wording in publication blocker names', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | testnet production-candidate publication review | Pending evidence | artifact://release/blockers/testnet-production-candidate-review.log evidence covering reviewer scope | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: testnet production-candidate publication review: blocker name: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks production-grade testnet wording in publication blocker names', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | production-grade testnet publication review | Pending evidence | artifact://release/blockers/production-grade-testnet-review.log evidence covering reviewer scope | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: production-grade testnet publication review: blocker name: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('rejects checked publication blockers that only link a template and validator command', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh local devnet lifecycle run'),
        '| Gate 3 | Fresh local devnet lifecycle run | Checked | Link completed [Live Rehearsal Evidence Template](live-rehearsal-template.md) evidence validated with `npm run rehearsal:validate`. | no |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('requires unresolved required blocker rows to keep structured resolution targets', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        '| Gate 5 | Trustless burn verification path | Open blocker | Complete proof path. | yes |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row requires a link, command, or artifact marker',
    );
  });

  it('requires custom unresolved publication blockers to keep structured resolution targets', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | Custody operations review | Pending evidence | Document custody operational review before release. | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Custody operations review: unresolved publication blocker requires a link, command, or artifact marker',
    );
  });

  it('rejects checked custom publication blockers with only target evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | Custody operations review | Checked | Completed custody review evidence artifact://release/custody-review.log. | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Custody operations review: Checked custom publication blocker requires structured resolution evidence: validator output, release-notes blocker review with Publication blocker resolved = yes, or reviewer decision with Reviewer decision = approve and Publication blocker resolved = yes; target-only evidence is not enough',
    );
  });

  it('rejects checked custom publication blockers with narrative reviewer resolution evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | Custody operations review | Checked | Reviewer decision artifact://release/custody-reviewer-decision.log: publication blocker resolved and approved for institutional-reference release. | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Custody operations review: Checked custom publication blocker requires structured resolution evidence: validator output, release-notes blocker review with Publication blocker resolved = yes, or reviewer decision with Reviewer decision = approve and Publication blocker resolved = yes; target-only evidence is not enough',
    );
  });

  it('rejects checked custom publication blockers with placeholder reviewer bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | Custody operations review | Checked | Reviewer decision artifact://release/custody-reviewer-decision.log: Reviewer decision = approve/reject, Publication blocker resolved = yes/no, institutional-reference release remains claim-bounded. | no |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Custody operations review: Checked custom publication blocker requires structured resolution evidence: validator output, release-notes blocker review with Publication blocker resolved = yes, or reviewer decision with Reviewer decision = approve and Publication blocker resolved = yes; target-only evidence is not enough',
    );
  });

  it('accepts checked custom publication blockers with reviewer resolution evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}
| Gate 9 | Custody operations review | Checked | Reviewer decision artifact://release/custody-reviewer-decision.log: Reviewer decision = approve, Publication blocker resolved = yes, institutional-reference release remains claim-bounded. | no |`,
    }));

    expect(result.status).toBe('PASS');
  });

  it('requires unresolved required blocker rows to keep checklist-canonical status', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Trustless burn verification path'),
          requiredBlockerRow('Trustless burn verification path')
            .replace('| Open blocker |', '| Pending evidence |'),
        )
        .replace(
          requiredBlockerRow('Fresh local devnet lifecycle run'),
          requiredBlockerRow('Fresh local devnet lifecycle run')
            .replace('| Pending evidence |', '| Open blocker |'),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: unresolved required blocker row must use Open blocker status until checked',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: unresolved required blocker row must use Pending evidence status until checked',
    );
  });

  it('requires copied publication blockers to preserve row-specific resolution terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Backup-restore or reconstructibility drill'),
          requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
            'command-specific evidence',
            'local SQLite snapshots',
            'npm run backup:snapshot',
            'local snapshot comparison',
            'npm run backup:compare',
            'distinct pre-backup and restored JSON artifacts',
            'restored snapshot generated after pre-backup snapshot',
            'backup:snapshot schema metadata',
            'measured snapshot value formats',
            'snapshot evidenceRows match measured values',
            'state-specific consistency evidence',
            'state evidence cites measured pre-backup/restored values',
            'stop-condition classifications',
            'condition-specific stop-condition evidence',
            'reviewer sign-off',
            'restore operator sign-off matches drill classification',
            'restore operator sign-off date is not before drill classification Date',
            'production-ready claim handling with exact `Production-ready claim allowed by this drill: no`',
            'completed Gate 3 backup-restore release-note update evidence',
            'completed Gate 3 backup-restore checklist update evidence',
            'git status --short',
            'git diff --check',
            'no staged runtime artifacts',
          ]),
        )
        .replace(
          requiredBlockerRow('Independent security review report'),
          requiredBlockerRowOmitting('Independent security review report', [
            'required scope coverage',
            'required evidence package',
            'item-specific evidence-package artifact links',
            'finding disposition',
            'required negative review checks',
            'dependency risk',
            'final security decision handling with exact `Final decision = approve`',
            'critical/high finding closure with exact `Critical/high findings open = 0`',
            'publication blocker closure with exact `Publication blockers = 0`',
            'Production-ready claim allowed = no',
            'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
            'accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
          ]),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: command-specific evidence, local SQLite snapshots, npm run backup:snapshot, local snapshot comparison, npm run backup:compare, distinct pre-backup and restored JSON artifacts, restored snapshot generated after pre-backup snapshot, backup:snapshot schema metadata, measured snapshot value formats, snapshot evidenceRows match measured values, state-specific consistency evidence, state evidence cites measured pre-backup/restored values, stop-condition classifications, condition-specific stop-condition evidence, reviewer sign-off, restore operator sign-off matches drill classification, restore operator sign-off date is not before drill classification Date, production-ready claim handling with exact `Production-ready claim allowed by this drill: no`, completed Gate 3 backup-restore release-note update evidence, completed Gate 3 backup-restore checklist update evidence, git status --short, git diff --check, no staged runtime artifacts',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: required scope coverage, required evidence package, item-specific evidence-package artifact links, finding disposition, required negative review checks, dependency risk, final security decision handling with exact `Final decision = approve`, critical/high finding closure with exact `Critical/high findings open = 0`, publication blocker closure with exact `Publication blockers = 0`, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
    );
  });

  it('requires copied backup-restore blockers to preserve restore operator identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'restore operator sign-off matches drill classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: restore operator sign-off matches drill classification',
    );
  });

  it('requires copied backup-restore blockers to preserve restore operator date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'restore operator sign-off date is not before drill classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: restore operator sign-off date is not before drill classification Date',
    );
  });

  it('requires copied backup-restore blockers to preserve reviewer approval evidence for reviewed restore targets', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'reviewer approval evidence',
          'completed reviewer approval evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: reviewer approval evidence, completed reviewer approval evidence',
    );
  });

  it('requires copied backup-restore blockers to preserve reconstructibility checks and git hygiene evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'boundary-specific reconstructibility checks',
          'backup-restore git hygiene evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: boundary-specific reconstructibility checks, backup-restore git hygiene evidence',
    );
  });

  it('requires copied backup-restore blockers to preserve explicit production-ready claim denial', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'production-ready claim handling with exact `Production-ready claim allowed by this drill: no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: production-ready claim handling with exact `Production-ready claim allowed by this drill: no`',
    );
  });

  it('requires copied backup-restore blockers to preserve testnet production-candidate claim denial', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`',
    );
  });

  it('requires copied backup-restore blockers to preserve DUP and SPV singleton comparisons separately', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'DUP singleton digest comparison or incident classification',
          'SPV tracker singleton digest comparison or incident classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: DUP singleton digest comparison or incident classification, SPV tracker singleton digest comparison or incident classification',
    );
  });

  it('requires copied backup-restore blockers to preserve snapshot evidenceRows matching measured values', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'snapshot evidenceRows match measured values',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: snapshot evidenceRows match measured values',
    );
  });

  it('requires copied backup-restore blockers to preserve measured state evidence values', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Backup-restore or reconstructibility drill'),
        requiredBlockerRowOmitting('Backup-restore or reconstructibility drill', [
          'state evidence cites measured pre-backup/restored values',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Backup-restore or reconstructibility drill: required blocker row resolution must mention row-specific evidence terms: state evidence cites measured pre-backup/restored values',
    );
  });

  it('requires copied trustless burn blockers to preserve positive proof instance value matching', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'positive proof instance values match commitment and burn binding rows',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: positive proof instance values match commitment and burn binding rows',
    );
  });

  it('requires copied Gate 3 live rehearsal blockers to preserve disabled broadcast boundaries', () => {
    const liveRehearsalItems = [
      'Fresh local devnet lifecycle run',
      'Fresh Ergo testnet lifecycle run',
      'Failed broadcast / phantom AVL recovery drill',
      'Reorged burn and stale singleton recovery drill',
    ];

    for (const item of liveRehearsalItems) {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [
            'Broadcast mode at start disabled',
            'Broadcast mode at end disabled',
            'Broadcast disabled in all shells',
          ]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: Broadcast mode at start disabled, Broadcast mode at end disabled, Broadcast disabled in all shells`,
      );
    }
  });

  it('requires copied Gate 3 recovery blockers to preserve identifier bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Failed broadcast / phantom AVL recovery drill'),
          requiredBlockerRowOmitting('Failed broadcast / phantom AVL recovery drill', [
            'failed-broadcast evidence cites Expected transaction ID',
            'failed-broadcast evidence cites peg-out burn TX ID',
          ]),
        )
        .replace(
          requiredBlockerRow('Reorged burn and stale singleton recovery drill'),
          requiredBlockerRowOmitting('Reorged burn and stale singleton recovery drill', [
            'reorged-burn evidence cites peg-out burn TX ID',
            'stale-singleton evidence cites singleton inventory identifier',
          ]),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Failed broadcast / phantom AVL recovery drill: required blocker row resolution must mention row-specific evidence terms: failed-broadcast evidence cites Expected transaction ID, failed-broadcast evidence cites peg-out burn TX ID',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Reorged burn and stale singleton recovery drill: required blocker row resolution must mention row-specific evidence terms: reorged-burn evidence cites peg-out burn TX ID, stale-singleton evidence cites singleton inventory identifier',
    );
  });

  it('requires copied Gate 3 fresh lifecycle blockers to preserve positive miner fee evidence', () => {
    const freshLifecycleItems = [
      'Fresh local devnet lifecycle run',
      'Fresh Ergo testnet lifecycle run',
    ];

    for (const item of freshLifecycleItems) {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [
            'positive miner feeNanoErg amount',
          ]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: positive miner feeNanoErg amount`,
      );
    }
  });

  it('requires copied Gate 3 fresh lifecycle blockers to preserve reconciliation binding evidence', () => {
    const freshLifecycleItems = [
      'Fresh local devnet lifecycle run',
      'Fresh Ergo testnet lifecycle run',
    ];

    for (const item of freshLifecycleItems) {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [
            'reconciliation evidence cites submitted successor and burn values',
            'submitted DUP successor box ID',
            'submitted SPV tracker successor box ID',
            'recipient payout box ID',
            'reconciliation evidence cites peg-out burn TX ID',
          ]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: reconciliation evidence cites submitted successor and burn values, submitted DUP successor box ID, submitted SPV tracker successor box ID, recipient payout box ID, reconciliation evidence cites peg-out burn TX ID`,
      );
    }
  });

  it('requires copied Gate 3 testnet lifecycle blockers to preserve post-submit observe output-shape evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
        requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
          'npm run rehearsal:post-submit:observe',
          'distinct rehearsal:post-submit:observe transcript/report',
          'rehearsal:post-submit:observe PASS output',
          'same submitted/Expected transaction ID',
          'SPV tracker successor output OUTPUTS(0)',
          'Aggregate DUP successor output OUTPUTS(1)',
          'positional recipient payout binding',
          'canonical miner fee output',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: npm run rehearsal:post-submit:observe, distinct rehearsal:post-submit:observe transcript/report, rehearsal:post-submit:observe PASS output, same submitted/Expected transaction ID, SPV tracker successor output OUTPUTS(0), Aggregate DUP successor output OUTPUTS(1), positional recipient payout binding, canonical miner fee output',
    );
  });

  it('requires copied Gate 3 fresh lifecycle blockers to preserve pre-broadcast dry-run bindings', () => {
    const freshLifecycleItems = [
      'Fresh local devnet lifecycle run',
      'Fresh Ergo testnet lifecycle run',
    ];

    for (const item of freshLifecycleItems) {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [
            'peg-in evidence cites peg-in event ID or TX ID',
            'peg-out burn evidence cites peg-out burn TX ID',
            'anchor evidence cites sidechain block hash',
            'anchor evidence cites bridge event root',
            'anchor evidence cites Ergo anchor height',
            'settlement check evidence cites Expected transaction ID',
          ]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: peg-in evidence cites peg-in event ID or TX ID, peg-out burn evidence cites peg-out burn TX ID, anchor evidence cites sidechain block hash, anchor evidence cites bridge event root, anchor evidence cites Ergo anchor height, settlement check evidence cites Expected transaction ID`,
      );
    }
  });

  it('requires copied Gate 3 testnet lifecycle blockers to preserve negated network variants', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
        requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
          'not on testnet',
          'not on the testnet',
          'not using testnet',
          'not connected to testnet',
          'no testnet',
          'without testnet',
          'without the testnet',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: not on testnet, not on the testnet, not using testnet, not connected to testnet, no testnet, without testnet, without the testnet',
    );
  });

  it('requires copied Gate 3 testnet lifecycle blockers to preserve mainnet exclusion wording', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
        requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
          'Session Metadata Ergo node network testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: Session Metadata Ergo node network testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording',
    );
  });

  it('requires copied Gate 3 testnet lifecycle blockers to preserve sidechain scope wording', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
        requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
          'Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network',
          'Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network, Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
    );
  });

  it('requires copied Gate 3 fresh lifecycle blockers to preserve submitted transaction bindings', () => {
    const freshLifecycleItems = [
      'Fresh local devnet lifecycle run',
      'Fresh Ergo testnet lifecycle run',
    ];

    for (const item of freshLifecycleItems) {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [
            'settlement submit evidence cites submitted transaction ID',
            'confirmation evidence cites submitted transaction ID',
          ]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: settlement submit evidence cites submitted transaction ID, confirmation evidence cites submitted transaction ID`,
      );
    }
  });

  it('requires copied Gate 3 testnet lifecycle blockers to preserve full lifecycle artifact bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
        requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
          'Fresh testnet lifecycle artifact cites peg-in event ID or TX ID',
          'Fresh testnet lifecycle artifact cites peg-out burn TX ID',
          'Fresh testnet lifecycle artifact cites sidechain block hash',
          'Fresh testnet lifecycle artifact cites bridge event root',
          'Fresh testnet lifecycle artifact cites Expected transaction ID',
          'Fresh testnet lifecycle artifact cites submitted transaction ID',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: Fresh testnet lifecycle artifact cites peg-in event ID or TX ID, Fresh testnet lifecycle artifact cites peg-out burn TX ID, Fresh testnet lifecycle artifact cites sidechain block hash, Fresh testnet lifecycle artifact cites bridge event root, Fresh testnet lifecycle artifact cites Expected transaction ID, Fresh testnet lifecycle artifact cites submitted transaction ID',
    );
  });

  it('requires copied Gate 3 testnet lifecycle blockers to preserve confirmation policy bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
        requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
          'required confirmation count',
          'confirmation policy met',
          'confirmation policy met cites confirmationsRequired',
          'confirmation policy met cites confirmationsObserved',
          'confirmation policy met cites submitted transaction ID',
          'observed confirmation count greater than or equal to required confirmation count',
          'confirmation policy met links completed finality evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: required confirmation count, confirmation policy met, confirmation policy met cites confirmationsRequired, confirmation policy met cites confirmationsObserved, confirmation policy met cites submitted transaction ID, observed confirmation count greater than or equal to required confirmation count, confirmation policy met links completed finality evidence',
    );
  });

  it('requires copied Gate 3 live rehearsal blockers to preserve explicit production claim denials', () => {
    const liveRehearsalItems = [
      'Fresh local devnet lifecycle run',
      'Fresh Ergo testnet lifecycle run',
      'Failed broadcast / phantom AVL recovery drill',
      'Reorged burn and stale singleton recovery drill',
    ];

    for (const item of liveRehearsalItems) {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [
            'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
            'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
          ]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: production-ready claim handling with exact \`Production-ready claim allowed by this rehearsal: no\`, testnet production-candidate claim handling with exact \`Testnet production-candidate claim allowed by this rehearsal: no\``,
      );
    }
  });

  it('requires copied publication blockers to preserve release-note evidence terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Green CI on the final branch'),
          requiredBlockerRowOmitting('Green CI on the final branch', [
            'workflow fact-specific evidence',
            'final branch commit identity',
            'CI reviewer sign-off matches run classification',
            'CI reviewer sign-off date is not before run classification Date',
            'Production-ready claim allowed = no',
            'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
            'reviewer decision summary',
            'release support with exact `Release supported = production deployment candidate`',
            'clean checkout CI green',
            'production-ready claim handling with exact `Production-ready claim allowed = no`',
            'completed Gate 1 release-note update evidence',
            'completed Gate 1 checklist update evidence',
          ]),
        )
        .replace(
          requiredBlockerRow('Fresh local devnet lifecycle run'),
          '| Gate 3 | Fresh local devnet lifecycle run | Pending evidence | Resolve with artifact://release/blockers/fresh-local-devnet-lifecycle-run.md evidence covering Live Rehearsal Evidence Template, peg-in, peg-out, anchor, settlement check, submit, confirmation, reconciliation, npm run rehearsal:validate | no |',
        )
        .replace(
          requiredBlockerRow('Independent security review report'),
          requiredBlockerRowOmitting('Independent security review report', [
            'Production-ready claim allowed = no',
            'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
            'accepted-risk release-note updates',
          ]),
        )
        .replace(
          requiredBlockerRow('Trustless burn verification path'),
          requiredBlockerRowOmitting('Trustless burn verification path', [
            'reviewer decision summary',
            'release support with exact `Release supported = production deployment candidate`',
            'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
            'Production-ready claim allowed = no',
            'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
            'production-ready claim handling with exact `Production-ready claim allowed = no`',
            'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
            'critical/high finding closure with exact `Critical/high findings open = 0`',
            'production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`',
            'Release notes updated = yes',
            'completed Gate 5 release-note update evidence',
            'completed Gate 5 checklist update evidence',
          ]),
        )
        .replace(
          requiredBlockerRow('Committee governance and key-rotation drill'),
            requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
            'committee threshold policy',
            'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
            'Production-ready claim allowed = no',
            'Testnet production-candidate claim allowed = yes',
            'Governance-ready claim allowed = yes',
            'Open governance blockers = 0',
            'Release notes updated = yes',
            'reviewer decision summary',
            'release support with exact `Release supported = production deployment candidate`',
            'governance-ready claim handling',
            'production-ready claim handling with exact `Production-ready claim allowed = no`',
            'testnet production-candidate claim handling',
            'open governance blocker handling',
            'governance owner sign-off date is not before drill classification Date',
            'completed Gate 6 governance release-note update evidence',
            'completed Gate 6 governance checklist update evidence',
            'external review evidence must include exact `Governance-ready claim allowed = yes` binding',
            'external review evidence must include exact `Release supported = production deployment candidate` binding',
            'external review evidence must include exact `Testnet production-candidate claim allowed = yes` binding',
          ]),
        )
        .replace(
          requiredBlockerRow('Operator readiness evidence'),
          requiredBlockerRowOmitting('Operator readiness evidence', [
            'command-specific operator command evidence',
            'decision-specific operational evidence',
            'production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`',
            'Production-ready claim allowed = no',
            'production-ready claim handling with exact `Production-ready claim allowed = no`',
            'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
            'reviewer decision summary',
            'runbook operator sign-off date is not before readiness classification Date',
            'completed operator-readiness release-note update evidence',
            'completed operator-readiness checklist update evidence',
          ]),
        )
        .replace(
          requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
          requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
            'scenario-specific metric evidence',
            'exactly one positive cost count per key',
            'live batch evidence',
            'concrete 32-byte live batch transaction identifier',
            'sharded-lane evidence',
            'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
            'production-ready benchmark claims are always blocked for mainnet',
            'production-ready claim handling with exact `Production-ready claim allowed = no`',
            'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
            'reviewer decision summary',
            'benchmark owner sign-off date is not before benchmark classification Date',
            'completed Gate 7 benchmark release-note update evidence',
            'completed Gate 7 benchmark checklist update evidence',
          ]),
        )
        .replace(
          requiredBlockerRow('External integration package review'),
          requiredBlockerRowOmitting('External integration package review', [
            'required entry points',
            'integration decision record',
            'decision-specific evidence',
            'negative review checks',
            'per-command fresh checkout exit code 0 output evidence',
            'without private maintainer context',
            'Private maintainer context used = no',
            'public institutional-reference release decision',
            'production-ready claim handling with exact `Production-ready claim allowed = no`',
            'Production-ready claim allowed = no',
            'Testnet production-candidate claim allowed',
            'blocked or allowed testnet production-candidate claim handling bound to that field',
            'reviewer decision summary',
            'integration reviewer sign-off matches review classification',
            'integration reviewer sign-off date is not before review classification Date',
            'completed Gate 8 integration release-note update evidence',
            'completed Gate 8 checklist update evidence',
          ]),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    const gate1Error = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(gate1Error).toBeDefined();
    expect(gate1Error).toContain('workflow fact-specific evidence');
    expect(gate1Error).toContain('final branch commit identity');
    expect(gate1Error).toContain('CI reviewer sign-off matches run classification');
    expect(gate1Error).toContain('Production-ready claim allowed = no');
    expect(gate1Error).toContain(
      'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
    );
    expect(gate1Error).toContain('release support with exact `Release supported = production deployment candidate`');
    expect(gate1Error).toContain('production-ready claim handling with exact `Production-ready claim allowed = no`');
    expect(gate1Error).toContain('completed Gate 1 release-note update evidence');
    expect(gate1Error).toContain('completed Gate 1 checklist update evidence');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining(
        'Publication Blockers: Fresh local devnet lifecycle run: required blocker row resolution must mention row-specific evidence terms:',
      ),
      expect.stringContaining('positive miner feeNanoErg amount'),
      expect.stringContaining('completed Gate 3 checklist update evidence'),
    ]));
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, accepted-risk release-note updates',
    );
    const trustlessError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(trustlessError).toContain('reviewer decision summary');
    expect(trustlessError).toContain('release support with exact `Release supported = production deployment candidate`');
    expect(trustlessError).toContain('trustless burn implementation handling with exact `Trustless burn verification implemented = yes`');
    expect(trustlessError).toContain('production-ready claim handling with exact `Production-ready claim allowed = no`');
    expect(trustlessError).toContain('testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`');
    expect(trustlessError).toContain('completed Gate 5 release-note update evidence');
    expect(trustlessError).toContain('completed Gate 5 checklist update evidence');
    const governanceError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(governanceError).toContain('committee threshold policy');
    expect(governanceError).toContain('completed Gate 6 governance release-note update evidence');
    expect(governanceError).toContain('completed Gate 6 governance checklist update evidence');
    const operatorError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(operatorError).toContain('command-specific operator command evidence');
    expect(operatorError).toContain('Production-ready claim allowed = no');
    expect(operatorError).toContain('production-ready claim handling with exact `Production-ready claim allowed = no`');
    expect(operatorError).toContain('testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`');
    expect(operatorError).toContain('completed operator-readiness release-note update evidence');
    expect(operatorError).toContain('completed operator-readiness checklist update evidence');
    const benchmarkError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(benchmarkError).toBeDefined();
    expect(benchmarkError).toContain('exactly one positive cost count per key');
    expect(benchmarkError).toContain('scenario-specific metric evidence');
    expect(benchmarkError).toContain(
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
    expect(benchmarkError).toContain('reviewer decision summary');
    expect(benchmarkError).toContain('completed Gate 7 benchmark release-note update evidence');
    expect(benchmarkError).toContain('completed Gate 7 benchmark checklist update evidence');
    const integrationError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(integrationError).toBeDefined();
    expect(integrationError).toContain('required entry points');
    expect(integrationError).toContain('integration decision record');
    expect(integrationError).toContain('decision-specific evidence');
    expect(integrationError).toContain('negative review checks');
    expect(integrationError).toContain('production-ready claim handling with exact `Production-ready claim allowed = no`');
    expect(integrationError).toContain('reviewer decision summary');
    expect(integrationError).toContain('completed Gate 8 integration release-note update evidence');
    expect(integrationError).toContain('completed Gate 8 checklist update evidence');
  });

  it('covers every copied publication-update blocker row with a distinct target regression case', () => {
    const rowsRequiringPublicationUpdates = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => {
        const hasReleaseNoteUpdate = row.requiredResolutionTerms.some(isReleaseNoteUpdateTerm);
        const hasChecklistUpdate = row.requiredResolutionTerms.some(isChecklistUpdateTerm);
        return hasReleaseNoteUpdate && hasChecklistUpdate;
      })
      .map(row => row.item);

    expect(distinctPublicationUpdateTargetCases.map(({ item }) => item)).toEqual(
      rowsRequiringPublicationUpdates,
    );
  });

  it.each(distinctPublicationUpdateTargetCases)(
    'requires copied $item blockers to preserve distinct publication update targets',
    ({ item, term }) => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow(item),
        requiredBlockerRowOmitting(item, [term]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
    );
    },
  );

  it.each(publicationUpdateTargetReuseCases)(
    'rejects copied $item blockers that reuse one publication-update evidence target',
    ({ item, releaseNoteTerm, checklistTerm }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowReusingPublicationUpdateTarget(item, releaseNoteTerm, checklistTerm),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: release-note/checklist publication-update evidence targets must be distinct`,
      );
    },
  );

  it('covers every copied blocker row with linked-evidence target separation', () => {
    const rowsRequiringLinkedEvidenceTargets = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isDistinctLinkedEvidenceTargetTerm))
      .map(row => row.item);

    expect(distinctLinkedEvidenceTargetCases.map(({ item }) => item)).toEqual(
      rowsRequiringLinkedEvidenceTargets,
    );
  });

  it.each(distinctLinkedEvidenceTargetCases)(
    'requires copied $item blockers to preserve linked evidence target separation',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, externalIntegrationTermsToOmit(term)),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      const blockerError = result.errors.find(error =>
        error.startsWith(
          `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms:`,
        ),
      );
      expect(blockerError).toContain(term);
    },
  );

  it('covers every copied blocker row with publication-update contradiction evidence', () => {
    const rowsRequiringPublicationUpdateContradictionEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isPublicationUpdateContradictionTerm))
      .map(row => row.item);

    expect(publicationUpdateContradictionCases.map(({ item }) => item)).toEqual(
      rowsRequiringPublicationUpdateContradictionEvidence,
    );
  });

  it.each(publicationUpdateContradictionCases)(
    'requires copied $item blockers to preserve publication-update contradiction evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, externalIntegrationTermsToOmit(term)),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      const blockerError = result.errors.find(error =>
        error.startsWith(
          `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms:`,
        ),
      );
      expect(blockerError).toContain(term);
    },
  );

  it('covers every copied blocker row with reviewer sign-off evidence', () => {
    const rowsRequiringReviewerSignoffEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isReviewerSignoffTerm))
      .map(row => row.item);

    expect([...new Set(reviewerSignoffCases.map(({ item }) => item))]).toEqual(
      rowsRequiringReviewerSignoffEvidence,
    );
  });

  it.each(reviewerSignoffCases)(
    'requires copied $item blockers to preserve reviewer sign-off evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, externalIntegrationTermsToOmit(term)),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      const blockerError = result.errors.find(error =>
        error.startsWith(
          `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms:`,
        ),
      );
      expect(blockerError).toContain(term);
    },
  );

  it('covers every copied blocker row with reviewer decision summary evidence', () => {
    const rowsRequiringReviewerDecisionSummaryEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isReviewerDecisionSummaryTerm))
      .map(row => row.item);

    expect(reviewerDecisionSummaryCases.map(({ item }) => item)).toEqual(
      rowsRequiringReviewerDecisionSummaryEvidence,
    );
  });

  it.each(reviewerDecisionSummaryCases)(
    'requires copied $item blockers to preserve reviewer decision summary evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, externalIntegrationTermsToOmit(term)),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      const blockerError = result.errors.find(error =>
        error.startsWith(
          `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms:`,
        ),
      );
      expect(blockerError).toContain(term);
    },
  );

  it('covers every copied blocker row with release support evidence', () => {
    const rowsRequiringReleaseSupportEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isReleaseSupportTerm))
      .map(row => row.item);

    expect(releaseSupportRowCases.map(({ item }) => item)).toEqual(
      rowsRequiringReleaseSupportEvidence,
    );
  });

  it.each(releaseSupportRowCases)(
    'requires copied $item blockers to preserve release support evidence',
    ({ item, terms }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, terms),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${terms.join(', ')}`,
      );
    },
  );

  it('covers every copied blocker row with production-ready claim denial evidence', () => {
    const rowsRequiringProductionReadyClaimDenial = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isProductionReadyClaimDeniedTerm))
      .map(row => row.item);

    expect(productionReadyClaimDeniedCases.map(({ item }) => item)).toEqual(
      rowsRequiringProductionReadyClaimDenial,
    );
  });

  it.each(productionReadyClaimDeniedCases)(
    'requires copied $item blockers to preserve production-ready claim denial evidence',
    ({ item, term }) => {
      const exactProductionReadyClaimHandlingTerm =
        'production-ready claim handling with exact `Production-ready claim allowed = no`';
      const row = REQUIRED_PENDING_EVIDENCE_ROWS.find(candidate => candidate.item === item);
      const omittedTerms = term === 'Production-ready claim allowed = no' &&
        row?.requiredResolutionTerms.includes(exactProductionReadyClaimHandlingTerm)
        ? [term, exactProductionReadyClaimHandlingTerm]
        : [term];
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, omittedTerms),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      const blockerError = result.errors.find(error =>
        error.startsWith(
          `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms:`,
        ),
      );
      for (const omittedTerm of omittedTerms) {
        expect(blockerError).toContain(omittedTerm);
      }
    },
  );

  it('covers every copied blocker row with production-ready claim handling evidence', () => {
    const rowsRequiringProductionReadyClaimHandling = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isProductionReadyClaimHandlingTerm))
      .map(row => row.item);

    expect(productionReadyClaimHandlingCases.map(({ item }) => item)).toEqual(
      rowsRequiringProductionReadyClaimHandling,
    );
  });

  it.each(productionReadyClaimHandlingCases)(
    'requires copied $item blockers to preserve production-ready claim handling evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with testnet production-candidate claim allowance evidence', () => {
    const rowsRequiringTestnetProductionCandidateClaimAllowance = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isTestnetProductionCandidateClaimAllowedTerm))
      .map(row => row.item);

    expect(testnetProductionCandidateClaimAllowedCases.map(({ item }) => item)).toEqual(
      rowsRequiringTestnetProductionCandidateClaimAllowance,
    );
  });

  it.each(testnetProductionCandidateClaimAllowedCases)(
    'requires copied $item blockers to preserve testnet production-candidate claim allowance evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with testnet production-candidate claim handling evidence', () => {
    const rowsRequiringTestnetProductionCandidateClaimHandling = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isTestnetProductionCandidateClaimHandlingTerm))
      .map(row => row.item);

    expect(testnetProductionCandidateClaimHandlingCases.map(({ item }) => item)).toEqual(
      rowsRequiringTestnetProductionCandidateClaimHandling,
    );
  });

  it.each(testnetProductionCandidateClaimHandlingCases)(
    'requires copied $item blockers to preserve testnet production-candidate claim handling evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with production candidate environment evidence', () => {
    const rowsRequiringProductionCandidateEnvironment = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isProductionCandidateEnvironmentTerm))
      .map(row => row.item);

    expect([...new Set(productionCandidateEnvironmentCases.map(({ item }) => item))]).toEqual(
      rowsRequiringProductionCandidateEnvironment,
    );
  });

  it.each(productionCandidateEnvironmentCases)(
    'requires copied $item blockers to preserve production candidate environment evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with production candidate claim prerequisite evidence', () => {
    const rowsRequiringProductionCandidateClaimPrerequisite = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isProductionCandidateClaimPrerequisiteTerm))
      .map(row => row.item);

    expect([...new Set(productionCandidateClaimPrerequisiteCases.map(({ item }) => item))]).toEqual(
      rowsRequiringProductionCandidateClaimPrerequisite,
    );
  });

  it.each(productionCandidateClaimPrerequisiteCases)(
    'requires copied $item blockers to preserve production candidate claim prerequisite evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with release notes updated evidence', () => {
    const rowsRequiringReleaseNotesUpdatedEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isReleaseNotesUpdatedTerm))
      .map(row => row.item);

    expect(releaseNotesUpdatedCases.map(({ item }) => item)).toEqual(
      rowsRequiringReleaseNotesUpdatedEvidence,
    );
  });

  it.each(releaseNotesUpdatedCases)(
    'requires copied $item blockers to preserve release notes updated evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with zero-open decision evidence', () => {
    const rowsRequiringZeroOpenDecisionEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isZeroOpenDecisionTerm))
      .map(row => row.item);

    expect([...new Set(zeroOpenDecisionCases.map(({ item }) => item))]).toEqual(
      rowsRequiringZeroOpenDecisionEvidence,
    );
  });

  it.each(zeroOpenDecisionCases)(
    'requires copied $item blockers to preserve zero-open decision evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with rehearsal broadcast boundary evidence', () => {
    const rowsRequiringRehearsalBroadcastBoundaries = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isRehearsalBroadcastBoundaryTerm))
      .map(row => row.item);

    expect([...new Set(rehearsalBroadcastBoundaryCases.map(({ item }) => item))]).toEqual(
      rowsRequiringRehearsalBroadcastBoundaries,
    );
  });

  it.each(rehearsalBroadcastBoundaryCases)(
    'requires copied $item blockers to preserve rehearsal broadcast boundary evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with broadcast disabled or dry-run evidence', () => {
    const rowsRequiringBroadcastDisabledOrDryRun = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isBroadcastDisabledOrDryRunTerm))
      .map(row => row.item);

    expect(broadcastDisabledOrDryRunCases.map(({ item }) => item)).toEqual(
      rowsRequiringBroadcastDisabledOrDryRun,
    );
  });

  it.each(broadcastDisabledOrDryRunCases)(
    'requires copied $item blockers to preserve broadcast disabled or dry-run evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with live rehearsal template evidence', () => {
    const rowsRequiringLiveRehearsalTemplate = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isLiveRehearsalTemplateTerm))
      .map(row => row.item);

    expect(liveRehearsalTemplateCases.map(({ item }) => item)).toEqual(
      rowsRequiringLiveRehearsalTemplate,
    );
  });

  it.each(liveRehearsalTemplateCases)(
    'requires copied $item blockers to preserve live rehearsal template evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with rehearsal validate command evidence', () => {
    const rowsRequiringRehearsalValidateCommand = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isRehearsalValidateCommandTerm))
      .map(row => row.item);

    expect(rehearsalValidateCommandCases.map(({ item }) => item)).toEqual(
      rowsRequiringRehearsalValidateCommand,
    );
  });

  it.each(rehearsalValidateCommandCases)(
    'requires copied $item blockers to preserve rehearsal validate command evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with testnet lifecycle evidence', () => {
    const rowsRequiringTestnetLifecycleEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isTestnetLifecycleTerm))
      .map(row => row.item);

    expect([...new Set(testnetLifecycleCases.map(({ item }) => item))]).toEqual(
      rowsRequiringTestnetLifecycleEvidence,
    );
  });

  it.each(testnetLifecycleCases)(
    'requires copied $item blockers to preserve testnet lifecycle evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with local devnet lifecycle evidence', () => {
    expect([...new Set(localDevnetLifecycleCases.map(({ item }) => item))]).toEqual([
      LOCAL_DEVNET_LIFECYCLE_ITEM,
    ]);
    expect(localDevnetLifecycleCases.map(({ term }) => term)).toEqual([
      ...LOCAL_DEVNET_LIFECYCLE_TERMS,
    ]);
  });

  it.each(localDevnetLifecycleCases)(
    'requires copied $item blockers to preserve local devnet lifecycle evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with recovery-drill evidence', () => {
    const rowsRequiringRecoveryDrillEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isRecoveryDrillTerm))
      .map(row => row.item);

    expect([...new Set(recoveryDrillCases.map(({ item }) => item))]).toEqual(
      rowsRequiringRecoveryDrillEvidence,
    );
  });

  it.each(recoveryDrillCases)(
    'requires copied $item blockers to preserve recovery-drill evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with backup-restore evidence', () => {
    expect([...new Set(backupRestoreCases.map(({ item }) => item))]).toEqual([
      BACKUP_RESTORE_ITEM,
    ]);
    expect(backupRestoreCases.map(({ term }) => term)).toEqual([
      ...BACKUP_RESTORE_TERMS,
    ]);
  });

  it.each(backupRestoreCases)(
    'requires copied $item blockers to preserve backup-restore evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with ISO date evidence', () => {
    const rowsRequiringIsoDate = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isIsoDateTerm))
      .map(row => row.item);

    expect(isoDateCases.map(({ item }) => item)).toEqual(rowsRequiringIsoDate);
  });

  it.each(isoDateCases)(
    'requires copied $item blockers to preserve ISO date evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with production-candidate release level evidence', () => {
    const rowsRequiringProductionCandidateReleaseLevel = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isReleaseLevelProductionCandidateTerm))
      .map(row => row.item);

    expect(releaseLevelProductionCandidateCases.map(({ item }) => item)).toEqual(
      rowsRequiringProductionCandidateReleaseLevel,
    );
  });

  it.each(releaseLevelProductionCandidateCases)(
    'requires copied $item blockers to preserve production-candidate release level evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with testnet environment evidence', () => {
    const rowsRequiringTestnetEnvironment = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isEnvironmentTestnetTerm))
      .map(row => row.item);

    expect(environmentTestnetCases.map(({ item }) => item)).toEqual(
      rowsRequiringTestnetEnvironment,
    );
  });

  it.each(environmentTestnetCases)(
    'requires copied $item blockers to preserve testnet environment evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with non-empty reviewer evidence', () => {
    const rowsRequiringNonEmptyReviewer = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isNonEmptyReviewerTerm))
      .map(row => row.item);

    expect(nonEmptyReviewerCases.map(({ item }) => item)).toEqual(
      rowsRequiringNonEmptyReviewer,
    );
  });

  it.each(nonEmptyReviewerCases)(
    'requires copied $item blockers to preserve non-empty reviewer evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with clean-checkout evidence', () => {
    expect([...new Set(cleanCheckoutCases.map(({ item }) => item))]).toEqual([
      CLEAN_CHECKOUT_ITEM,
    ]);
    expect(cleanCheckoutCases.map(({ term }) => term)).toEqual([
      ...CLEAN_CHECKOUT_TERMS,
    ]);
  });

  it.each(cleanCheckoutCases)(
    'requires copied $item blockers to preserve clean-checkout evidence',
    ({ item, term }) => {
      const exactProductionReadyClaimHandlingTerm =
        'production-ready claim handling with exact `Production-ready claim allowed = no`';
      const exactProductionReadyPublicationUpdateTerm =
        'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked';
      const omittedTerms = term === 'Production-ready claim allowed = no'
        ? [term, exactProductionReadyPublicationUpdateTerm, exactProductionReadyClaimHandlingTerm]
        : [term];
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, omittedTerms),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${omittedTerms.join(', ')}`,
      );
    },
  );

  it('covers every copied blocker row with dependency fail-closed evidence', () => {
    const rowsRequiringDependencyFailClosedEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isDependencyFailClosedTerm))
      .map(row => row.item);

    expect([...new Set(dependencyFailClosedCases.map(({ item }) => item))]).toEqual(
      rowsRequiringDependencyFailClosedEvidence,
    );
  });

  it.each(dependencyFailClosedCases)(
    'requires copied $item blockers to preserve dependency fail-closed evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with technical addendum evidence', () => {
    const rowsRequiringTechnicalAddendumEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isTechnicalAddendumTerm))
      .map(row => row.item);

    expect([...new Set(technicalAddendumCases.map(({ item }) => item))]).toEqual(
      rowsRequiringTechnicalAddendumEvidence,
    );
  });

  it.each(technicalAddendumCases)(
    'requires copied $item blockers to preserve technical addendum evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with external integration evidence', () => {
    const rowsRequiringExternalIntegrationEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isExternalIntegrationReviewTerm))
      .map(row => row.item);

    expect([...new Set(externalIntegrationReviewCases.map(({ item }) => item))]).toEqual(
      rowsRequiringExternalIntegrationEvidence,
    );
  });

  it.each(externalIntegrationReviewCases)(
    'requires copied $item blockers to preserve external integration evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, externalIntegrationTermsToOmit(term)),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      const blockerError = result.errors.find(error =>
        error.startsWith(
          `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms:`,
        ),
      );
      expect(blockerError).toContain(term);
    },
  );

  it('covers every copied blocker row with security review evidence', () => {
    const rowsRequiringSecurityReviewEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isSecurityReviewTerm))
      .map(row => row.item);

    expect([...new Set(securityReviewCases.map(({ item }) => item))]).toEqual(
      rowsRequiringSecurityReviewEvidence,
    );
  });

  it.each(securityReviewCases)(
    'requires copied $item blockers to preserve security review evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with trustless burn evidence', () => {
    const rowsRequiringTrustlessBurnEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isTrustlessBurnTerm))
      .map(row => row.item);

    expect([...new Set(trustlessBurnCases.map(({ item }) => item))]).toEqual(
      rowsRequiringTrustlessBurnEvidence,
    );
  });

  it.each(trustlessBurnCases)(
    'requires copied $item blockers to preserve trustless burn evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with benchmark evidence', () => {
    const rowsRequiringBenchmarkEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isBenchmarkTerm))
      .map(row => row.item);

    expect([...new Set(benchmarkCases.map(({ item }) => item))]).toEqual(
      rowsRequiringBenchmarkEvidence,
    );
  });

  it.each(benchmarkCases)(
    'requires copied $item blockers to preserve benchmark evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with governance evidence', () => {
    const rowsRequiringGovernanceEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isGovernanceTerm))
      .map(row => row.item);

    expect([...new Set(governanceCases.map(({ item }) => item))]).toEqual(
      rowsRequiringGovernanceEvidence,
    );
  });

  it.each(governanceCases)(
    'requires copied $item blockers to preserve governance evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with operator-readiness evidence', () => {
    const rowsRequiringOperatorReadinessEvidence = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isOperatorReadinessTerm))
      .map(row => row.item);

    expect([...new Set(operatorReadinessCases.map(({ item }) => item))]).toEqual(
      rowsRequiringOperatorReadinessEvidence,
    );
  });

  it.each(operatorReadinessCases)(
    'requires copied $item blockers to preserve operator-readiness evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('covers every copied blocker row with rehearsal claim boundary evidence', () => {
    const rowsRequiringRehearsalClaimBoundaries = REQUIRED_PENDING_EVIDENCE_ROWS
      .filter(row => row.requiredResolutionTerms.some(isRehearsalClaimBoundaryTerm))
      .map(row => row.item);

    expect([...new Set(rehearsalClaimBoundaryCases.map(({ item }) => item))]).toEqual(
      rowsRequiringRehearsalClaimBoundaries,
    );
  });

  it.each(rehearsalClaimBoundaryCases)(
    'requires copied $item blockers to preserve rehearsal claim boundary evidence',
    ({ item, term }) => {
      const result = validateReleaseNotes(releaseNotes({
        blockers: blockerRows.replace(
          requiredBlockerRow(item),
          requiredBlockerRowOmitting(item, [term]),
        ),
      }));

      expect(result.status).toBe('BLOCKED');
      expect(result.errors).toContain(
        `Publication Blockers: ${item}: required blocker row resolution must mention row-specific evidence terms: ${term}`,
      );
    },
  );

  it('requires copied Gate 1 blockers to preserve CI reviewer identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'CI reviewer sign-off matches run classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: CI reviewer sign-off matches run classification',
    );
  });

  it('requires copied Gate 1 blockers to preserve CI reviewer date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'CI reviewer sign-off date is not before run classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: CI reviewer sign-off date is not before run classification Date',
    );
  });

  it('requires copied Gate 1 blockers to preserve zero release-gate structural issues', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'Release gate structural issues = 0',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: Release gate structural issues = 0',
    );
  });

  it('requires copied Gate 1 blockers to preserve structured row integrity evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'distinct completed evidence targets across linked command/workflow/decision rows',
          'internally non-contradictory Gate 1 publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: distinct completed evidence targets across linked command/workflow/decision rows, internally non-contradictory Gate 1 publication-update evidence',
    );
  });

  it('requires copied Gate 1 blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'release support with exact `Release supported = production deployment candidate`',
          'clean checkout CI green',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = production deployment candidate`, clean checkout CI green, production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 1 blockers to preserve exact testnet-candidate claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 1 blockers to preserve exact production-candidate support prerequisites', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Green CI on the final branch'),
        requiredBlockerRowOmitting('Green CI on the final branch', [
          'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: required blocker row resolution must mention row-specific evidence terms: production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 2 blockers to preserve release-gate PASS and publication-update evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Technical addendum architecture manual'),
        requiredBlockerRowOmitting('Technical addendum architecture manual', [
          'concrete `release:gate PASS` output with Structural issues = 0 in the architecture decision evidence for testnet production-candidate wording',
          'internally non-contradictory Phase 007 publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Technical addendum architecture manual: required blocker row resolution must mention row-specific evidence terms: concrete `release:gate PASS` output with Structural issues = 0 in the architecture decision evidence for testnet production-candidate wording, internally non-contradictory Phase 007 publication-update evidence',
    );
  });

  it('requires copied Gate 2 blockers to preserve exact release-support binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Technical addendum architecture manual'),
        requiredBlockerRowOmitting('Technical addendum architecture manual', [
          'release support with exact `Release supported = production deployment candidate`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Technical addendum architecture manual: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = production deployment candidate`',
    );
  });

  it('requires copied Gate 4 blockers to preserve zero publication blockers', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'publication blocker closure with exact `Publication blockers = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: publication blocker closure with exact `Publication blockers = 0`',
    );
  });

  it('requires copied Gate 4 blockers to preserve exact final decision handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'final security decision handling with exact `Final decision = approve`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: final security decision handling with exact `Final decision = approve`',
    );
  });

  it('requires copied Gate 4 blockers to preserve exact publication blocker closure', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'publication blocker closure with exact `Publication blockers = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: publication blocker closure with exact `Publication blockers = 0`',
    );
  });

  it('requires copied Gate 4 blockers to preserve exact testnet-candidate claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 4 blockers to preserve exact production-candidate support prerequisites', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 4 blockers to preserve exact critical finding closure', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'critical/high finding closure with exact `Critical/high findings open = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: critical/high finding closure with exact `Critical/high findings open = 0`',
    );
  });

  it('requires copied Gate 4 blockers to preserve exact accepted-risk release-note handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
    );
  });

  it('requires copied live rehearsal blockers to preserve reviewer identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Fresh local devnet lifecycle run'),
          requiredBlockerRowOmitting('Fresh local devnet lifecycle run', [
            'reviewer sign-off matches session metadata',
          ]),
        )
        .replace(
          requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
          requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
            'reviewer sign-off matches session metadata',
          ]),
        )
        .replace(
          requiredBlockerRow('Failed broadcast / phantom AVL recovery drill'),
          requiredBlockerRowOmitting('Failed broadcast / phantom AVL recovery drill', [
            'reviewer sign-off matches session metadata',
          ]),
        )
        .replace(
          requiredBlockerRow('Reorged burn and stale singleton recovery drill'),
          requiredBlockerRowOmitting('Reorged burn and stale singleton recovery drill', [
            'reviewer sign-off matches session metadata',
          ]),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off matches session metadata',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off matches session metadata',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Failed broadcast / phantom AVL recovery drill: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off matches session metadata',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Reorged burn and stale singleton recovery drill: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off matches session metadata',
    );
  });

  it('requires copied live rehearsal blockers to preserve reviewer date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows
        .replace(
          requiredBlockerRow('Fresh local devnet lifecycle run'),
          requiredBlockerRowOmitting('Fresh local devnet lifecycle run', [
            'reviewer sign-off date is not before session metadata Date',
          ]),
        )
        .replace(
          requiredBlockerRow('Fresh Ergo testnet lifecycle run'),
          requiredBlockerRowOmitting('Fresh Ergo testnet lifecycle run', [
            'reviewer sign-off date is not before session metadata Date',
          ]),
        )
        .replace(
          requiredBlockerRow('Failed broadcast / phantom AVL recovery drill'),
          requiredBlockerRowOmitting('Failed broadcast / phantom AVL recovery drill', [
            'reviewer sign-off date is not before session metadata Date',
          ]),
        )
        .replace(
          requiredBlockerRow('Reorged burn and stale singleton recovery drill'),
          requiredBlockerRowOmitting('Reorged burn and stale singleton recovery drill', [
            'reviewer sign-off date is not before session metadata Date',
          ]),
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off date is not before session metadata Date',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Fresh Ergo testnet lifecycle run: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off date is not before session metadata Date',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Failed broadcast / phantom AVL recovery drill: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off date is not before session metadata Date',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Reorged burn and stale singleton recovery drill: required blocker row resolution must mention row-specific evidence terms: reviewer sign-off date is not before session metadata Date',
    );
  });

  it('requires copied Gate 4 blockers to preserve external reviewer organization type', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', ['external reviewer organization type']),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: external reviewer organization type',
    );
  });

  it('requires copied Gate 4 blockers to preserve ISO review period', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', ['ISO review period']),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: ISO review period',
    );
  });

  it('requires copied Gate 4 blockers to preserve lead reviewer identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'lead reviewer sign-off matches classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: lead reviewer sign-off matches classification',
    );
  });

  it('requires copied Gate 4 blockers to preserve lead reviewer date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'lead reviewer sign-off date is not before review classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: lead reviewer sign-off date is not before review classification Date',
    );
  });

  it('requires copied Gate 4 blockers to preserve explicit independent-review approval facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'final security decision handling with exact `Final decision = approve`',
          'critical/high finding closure with exact `Critical/high findings open = 0`',
          'accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: final security decision handling with exact `Final decision = approve`, critical/high finding closure with exact `Critical/high findings open = 0`, accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
    );
  });

  it('requires copied Gate 4 blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'critical/high finding closure with exact `Critical/high findings open = 0`',
          'release support with exact `Release supported = production deployment candidate`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'critical/high findings',
          'accepted risks',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: critical/high finding closure with exact `Critical/high findings open = 0`, release support with exact `Release supported = production deployment candidate`, production-ready claim handling with exact `Production-ready claim allowed = no`, critical/high findings',
    );
  });

  it('requires copied Gate 4 blockers to bind production-ready handling to exact denial', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRow('Independent security review report').replace(
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'production-ready claim handling; Production-ready claim allowed = no',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms: production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 4 blockers to preserve structured security row and accepted-risk publication invariants', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Independent security review report'),
        requiredBlockerRowOmitting('Independent security review report', [
          'distinct completed evidence targets across linked scope, evidence-package, finding, and negative-check rows',
          'lead reviewer binding',
          'reviewer notes that keep finding and accepted-risk boundaries',
          'completed Gate 4 accepted-risk checklist update evidence',
          'completed Gate 4 accepted-risk release-note update evidence',
          'internally non-contradictory security publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    const securityError = result.errors.find(error =>
      error.startsWith('Publication Blockers: Independent security review report: required blocker row resolution must mention row-specific evidence terms:'),
    );
    expect(securityError).toContain('distinct completed evidence targets across linked scope, evidence-package, finding, and negative-check rows');
    expect(securityError).toContain('lead reviewer binding');
    expect(securityError).toContain('reviewer notes that keep finding and accepted-risk boundaries');
    expect(securityError).toContain('completed Gate 4 accepted-risk checklist update evidence');
    expect(securityError).toContain('completed Gate 4 accepted-risk release-note update evidence');
    expect(securityError).toContain('internally non-contradictory security publication-update evidence');
  });

  it('requires copied Gate 4 signer dependency blockers to preserve dependency reviewer identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'dependency reviewer sign-off matches classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: dependency reviewer sign-off matches classification',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve upstream signer release validation', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'upstream signer release validation',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: upstream signer release validation',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve JVM/node conformance evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'JVM/node conformance evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: JVM/node conformance evidence',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve explicit fail-closed release-action evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'explicit fail-closed guard/blocker release-action evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: explicit fail-closed guard/blocker release-action evidence',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve completed dependency-review release-note update evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'completed dependency-review release-note update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: completed dependency-review release-note update evidence',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve vulnerability triage evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'vulnerability triage',
          'internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: vulnerability triage, internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve no positive critical/high finding counts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'no positive critical/high finding counts',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: no positive critical/high finding counts',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'upstream signer blocker handling with exact `Upstream signer blocker resolved = no`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: upstream signer blocker handling with exact `Upstream signer blocker resolved = no`, production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve explicit fail-closed publication decision facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'Production-ready claim allowed = no',
          'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
          'Critical/high vulnerabilities open = 0',
          'Release notes updated = yes',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: Production-ready claim allowed = no, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, Critical/high vulnerabilities open = 0, Release notes updated = yes, production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve exact institutional-reference release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'release support with exact `Release supported = institutional reference`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = institutional reference`',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve exact testnet-candidate denial handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = no`',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve exact unresolved upstream signer blocker handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'upstream signer blocker handling with exact `Upstream signer blocker resolved = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: upstream signer blocker handling with exact `Upstream signer blocker resolved = no`',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve exact production-candidate prerequisite bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve dependency boundary and publication-update invariants', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'completed ContextExtension guard evidence',
          'positive JVM golden vectors',
          'production-ready claims blocked until upstream signer release is validated',
          'testnet production-candidate claims blocked until upstream signer release is validated',
          'internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence',
          'dependency reviewer notes that keep signer and vulnerability boundaries',
          'internally non-contradictory dependency publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: completed ContextExtension guard evidence, positive JVM golden vectors, production-ready claims blocked until upstream signer release is validated, testnet production-candidate claims blocked until upstream signer release is validated, internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence, dependency reviewer notes that keep signer and vulnerability boundaries, internally non-contradictory dependency publication-update evidence',
    );
  });

  it('requires copied Gate 4 signer dependency blockers to preserve dependency reviewer date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Signer dependency conformance or fail-closed release decision'),
        requiredBlockerRowOmitting('Signer dependency conformance or fail-closed release decision', [
          'dependency reviewer sign-off date is not before review classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Signer dependency conformance or fail-closed release decision: required blocker row resolution must mention row-specific evidence terms: dependency reviewer sign-off date is not before review classification Date',
    );
  });

  it('requires copied Gate 5 blockers to preserve protocol reviewer identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'protocol reviewer sign-off matches evidence classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: protocol reviewer sign-off matches evidence classification',
    );
  });

  it('requires copied Gate 5 blockers to preserve protocol reviewer date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'protocol reviewer sign-off date is not before evidence classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: protocol reviewer sign-off date is not before evidence classification Date',
    );
  });

  it('requires copied Gate 5 blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'release support with exact `Release supported = production deployment candidate`',
          'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
          'Production-ready claim allowed = no',
          'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
          'critical/high finding closure with exact `Critical/high findings open = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = production deployment candidate`, trustless burn implementation handling with exact `Trustless burn verification implemented = yes`, Production-ready claim allowed = no, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`, transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`, critical/high finding closure with exact `Critical/high findings open = 0`, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact release-support binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'release support with exact `Release supported = production deployment candidate`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = production deployment candidate`',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact publication-update field bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'publication-update fields must include exact `Trustless burn verification implemented = yes` when trustless burn verification is implemented',
          'publication-update fields must include exact `Release supported = production deployment candidate` when Gate 5 `Release level = production deployment candidate`',
          'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
          'publication-update fields must include exact `Testnet production-candidate claim allowed = yes` when the testnet candidate claim is allowed',
          'publication-update fields must include exact `Transitional trusted burn path disabled = yes` when Gate 5 `Transitional trusted burn path disabled = yes`',
          'publication-update fields must include exact `Critical/high findings open = 0` when Gate 5 `Critical/high findings open = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: publication-update fields must include exact `Trustless burn verification implemented = yes` when trustless burn verification is implemented, publication-update fields must include exact `Release supported = production deployment candidate` when Gate 5 `Release level = production deployment candidate`, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, publication-update fields must include exact `Testnet production-candidate claim allowed = yes` when the testnet candidate claim is allowed, publication-update fields must include exact `Transitional trusted burn path disabled = yes` when Gate 5 `Transitional trusted burn path disabled = yes`, publication-update fields must include exact `Critical/high findings open = 0` when Gate 5 `Critical/high findings open = 0`',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact implementation handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact testnet-candidate claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact testnet-candidate prerequisite binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact transitional-path handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
    );
  });

  it('requires copied Gate 5 blockers to preserve exact critical finding closure', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'critical/high finding closure with exact `Critical/high findings open = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: critical/high finding closure with exact `Critical/high findings open = 0`',
    );
  });

  it('requires copied Gate 5 blockers to preserve explicit publication decision facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRowOmitting('Trustless burn verification path', [
          'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
          'Production-ready claim allowed = no',
          'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
          'critical/high finding closure with exact `Critical/high findings open = 0`',
          'Release notes updated = yes',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required blocker row resolution must mention row-specific evidence terms: trustless burn implementation handling with exact `Trustless burn verification implemented = yes`, Production-ready claim allowed = no, testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`, transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`, critical/high finding closure with exact `Critical/high findings open = 0`, publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked, Release notes updated = yes',
    );
  });

  it('blocks copied Gate 5 blockers that approve trusted fallback paths while preserving required terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; reviewer clears trusted-oracle fallback | yes |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
  });

  it('blocks compatibility-normalized Gate 5 trusted fallback approvals', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; reviewer \uFF43\uFF4C\uFF45\uFF41\uFF52\uFF53 trusted-oracle fallback | yes |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve governance owner identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'governance owner sign-off matches drill classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: governance owner sign-off matches drill classification',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve governance owner date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'governance owner sign-off date is not before drill classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: governance owner sign-off date is not before drill classification Date',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'release support with exact `Release supported = production deployment candidate`',
          'governance-ready claim handling with exact `Governance-ready claim allowed = yes`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'open governance blocker handling with exact `Open governance blockers = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    const governanceError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(governanceError).toContain('release support with exact `Release supported = production deployment candidate`');
    expect(governanceError).toContain('governance-ready claim handling with exact `Governance-ready claim allowed = yes`');
    expect(governanceError).toContain('production-ready claim handling with exact `Production-ready claim allowed = no`');
    expect(governanceError).toContain('open governance blocker handling with exact `Open governance blockers = 0`');
  });

  it('requires copied Gate 6 governance blockers to preserve exact testnet-candidate claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve exact testnet-candidate prerequisite binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve rotation facts and completed external review evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'step-specific rotation facts',
          'completed Gate 6 governance external review evidence',
          'external review evidence must include exact `Governance-ready claim allowed = yes` binding',
          'distinct completed Gate 6 governance external review evidence target from release-note/checklist update evidence targets',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: step-specific rotation facts, completed Gate 6 governance external review evidence, external review evidence must include exact `Governance-ready claim allowed = yes` binding, distinct completed Gate 6 governance external review evidence target from release-note/checklist update evidence targets',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve declared new-committee positive signer identifiers', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'declared new-committee positive signer identifiers',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: declared new-committee positive signer identifiers',
    );
  });

  it('requires copied Gate 6 governance blockers to preserve explicit governance readiness facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRowOmitting('Committee governance and key-rotation drill', [
          'governance-ready claim handling with exact `Governance-ready claim allowed = yes`',
          'open governance blocker handling with exact `Open governance blockers = 0`',
          'Release notes updated = yes',
          'external review evidence must include exact `Governance-ready claim allowed = yes` binding',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required blocker row resolution must mention row-specific evidence terms: governance-ready claim handling with exact `Governance-ready claim allowed = yes`, open governance blocker handling with exact `Open governance blockers = 0`, Release notes updated = yes, external review evidence must include exact `Governance-ready claim allowed = yes` binding',
    );
  });

  it('blocks copied Gate 6 governance blockers that approve single-signer fallback while preserving required terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; reviewer approves single-signer governance and supports open governance blockers | yes |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
  });

  it('blocks copied Gate 6 governance blockers with certification-family fallback approvals', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; reviewer certifies single-signer governance and recommends open governance blockers | yes |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'critical incident closure with exact `Critical incidents open = 0`',
          'operator-ready claim handling with exact `Operator-ready claim allowed = yes`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'critical incidents',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    const operatorError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(operatorError).toContain('critical incident closure with exact `Critical incidents open = 0`');
    expect(operatorError).toContain('operator-ready claim handling with exact `Operator-ready claim allowed = yes`');
    expect(operatorError).toContain('production-ready claim handling with exact `Production-ready claim allowed = no`');
  });

  it('requires copied Gate 6 operator blockers to preserve exact release-support binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'release support with exact `Release supported = production deployment candidate`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = production deployment candidate`',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve exact testnet-candidate claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve exact candidate prerequisite bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve structured readiness classification facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'structured Readiness Classification with 7-40 character Git commit',
          'Release level = production deployment candidate',
          'Environment = testnet',
          'Operator type = external operator or exchange operations reviewer',
          'non-empty reviewer',
          'ISO Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: structured Readiness Classification with 7-40 character Git commit, Release level = production deployment candidate, Environment = testnet, Operator type = external operator or exchange operations reviewer, non-empty reviewer, ISO Date',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve row integrity boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'completed operator readiness evidence',
          'operator readiness validation target',
          'internally positive command output',
          'distinct completed evidence targets across linked runbook, command, drill, and decision rows',
          'completed row evidence that is not an `operator readiness validation target` / `validated target` binding',
          'actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement',
          'Release notes updated = yes',
          'internally non-contradictory operator-readiness publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: completed operator readiness evidence, operator readiness validation target, internally positive command output, distinct completed evidence targets across linked runbook, command, drill, and decision rows, completed row evidence that is not an `operator readiness validation target` / `validated target` binding, Release notes updated = yes, actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement, internally non-contradictory operator-readiness publication-update evidence',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve exact operator-ready approval handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'operator-ready claim handling with exact `Operator-ready claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: operator-ready claim handling with exact `Operator-ready claim allowed = yes`',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve zero critical incidents', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'critical incident closure with exact `Critical incidents open = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: critical incident closure with exact `Critical incidents open = 0`',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve runbook operator identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'runbook operator sign-off matches readiness classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: runbook operator sign-off matches readiness classification',
    );
  });

  it('requires copied Gate 6 operator blockers to preserve runbook operator date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Operator readiness evidence'),
        requiredBlockerRowOmitting('Operator readiness evidence', [
          'runbook operator sign-off date is not before readiness classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Operator readiness evidence: required blocker row resolution must mention row-specific evidence terms: runbook operator sign-off date is not before readiness classification Date',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve benchmark owner identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'benchmark owner sign-off matches benchmark classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: benchmark owner sign-off matches benchmark classification',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve benchmark owner date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'benchmark owner sign-off date is not before benchmark classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: benchmark owner sign-off date is not before benchmark classification Date',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve production throughput claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'production throughput claims remain blocked for Gate 7 evidence',
          'production throughput claim handling with exact `Production throughput claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: production throughput claims remain blocked for Gate 7 evidence, production throughput claim handling with exact `Production throughput claim allowed = no`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact scaling-claim allowance', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'scaling-claim allowance with exact `Scaling claims allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: scaling-claim allowance with exact `Scaling claims allowed = yes`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact testnet-candidate claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact testnet-candidate prerequisite binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact production-throughput claim handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'production throughput claim handling with exact `Production throughput claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: production throughput claim handling with exact `Production throughput claim allowed = no`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact open-blocker handling', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'open benchmark blocker handling with exact `Open benchmark blockers = 0`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: open benchmark blocker handling with exact `Open benchmark blockers = 0`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact mainnet-grade evidence binding', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'exact `Mainnet-grade evidence linked = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: exact `Mainnet-grade evidence linked = no`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'release support with exact `Release supported = production deployment candidate`',
          'measured single/batch/sharded evidence',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: release support with exact `Release supported = production deployment candidate`, measured single/batch/sharded evidence, production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve explicit benchmark publication decision facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'scaling-claim allowance with exact `Scaling claims allowed = yes`',
          'Production-ready claim allowed = no',
          'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
          'production throughput claim handling with exact `Production throughput claim allowed = no`',
          'exact `Mainnet-grade evidence linked = no`',
          'open benchmark blocker handling with exact `Open benchmark blockers = 0`',
          'Release notes updated = yes',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    const benchmarkError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(benchmarkError).toContain('scaling-claim allowance with exact `Scaling claims allowed = yes`');
    expect(benchmarkError).toContain('testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`');
    expect(benchmarkError).toContain('production throughput claim handling with exact `Production throughput claim allowed = no`');
    expect(benchmarkError).toContain('exact `Mainnet-grade evidence linked = no`');
    expect(benchmarkError).toContain('open benchmark blocker handling with exact `Open benchmark blockers = 0`');
    expect(benchmarkError).toContain('Release notes updated = yes');
  });

  it('requires copied Gate 7 benchmark blockers to preserve scenario-specific single batch and sharded metrics', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'scenario-specific single/batch/sharded metric evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: scenario-specific single/batch/sharded metric evidence',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve positive measurement terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'positive numeric benchmark measurements',
          'positive cost-relevant counts',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: positive numeric benchmark measurements, positive cost-relevant counts',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve canonical cost counts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'exactly one positive cost count per key',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: exactly one positive cost count per key',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve structured benchmark classification facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'structured Benchmark Classification with 7-40 character Git commit',
          'Benchmark Classification Environment testnet',
          'Trust path trustless burn proof path',
          'non-empty reviewer',
          'ISO Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: structured Benchmark Classification with 7-40 character Git commit, Benchmark Classification Environment testnet, Trust path trustless burn proof path, non-empty reviewer, ISO Date',
    );
  });

  it('requires copied Gate 7 benchmark blockers to preserve row integrity and live-boundary evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRowOmitting('Single, batch, and sharded benchmark evidence', [
          'command-specific benchmark command output evidence',
          'distinct completed evidence targets across linked command/metric/sharded-lane/bottleneck rows',
          'statement-specific sharded-lane evidence',
          'bottleneck-specific completed evidence with impact and next action',
          'linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence',
          'actionable benchmark reviewer notes that keep the publication claim boundary and do not approve broader benchmark throughput or full parallel L1 settlement wording',
          'internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required blocker row resolution must mention row-specific evidence terms: command-specific benchmark command output evidence, distinct completed evidence targets across linked command/metric/sharded-lane/bottleneck rows, statement-specific sharded-lane evidence, bottleneck-specific completed evidence with impact and next action, linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence, actionable benchmark reviewer notes that keep the publication claim boundary and do not approve broader benchmark throughput or full parallel L1 settlement wording, internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence',
    );
  });

  it('blocks copied Gate 7 benchmark blockers that approve production throughput while preserving required terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; reviewer approves production throughput claims and clears full parallel L1 settlement | yes |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('blocks copied Gate 7 benchmark blockers with certification-family throughput approvals', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; reviewer certifies production throughput claims and accredits full parallel L1 settlement | yes |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('accepts copied blocker resolutions that explicitly deny fallback and throughput approvals', () => {
    const blockersWithDeniedApprovals = blockerRows
      .replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; trusted fallback not approved; reviewer approved no trusted fallback | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; open governance blockers not approved; reviewer approved no open governance blockers; ' +
            'single signer fallback not approved; reviewer approved no single signer fallback | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; production throughput claims not approved; reviewer approved no production throughput claims; ' +
            'full parallel L1 settlement not approved; reviewer approved no full parallel L1 settlement | yes |',
        ),
      );

    const result = validateReleaseNotes(releaseNotes({ blockers: blockersWithDeniedApprovals }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('accepts copied blocker resolutions that approve absent fallback and throughput contexts', () => {
    const blockersWithAbsentApprovals = blockerRows
      .replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; reviewer approved absence of trusted fallback; ' +
            'absence of trusted oracle fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; reviewer approved absent open governance blockers; ' +
            'absence of single signer fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; reviewer approved absent production throughput claims; ' +
            'absence of full parallel L1 settlement approved by reviewer | yes |',
        ),
      );

    const result = validateReleaseNotes(releaseNotes({ blockers: blockersWithAbsentApprovals }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('accepts copied blocker resolutions that approve lack of fallback and throughput contexts', () => {
    const blockersWithLackApprovals = blockerRows
      .replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; reviewer approved lack of trusted fallback; ' +
            'lack of trusted oracle fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; reviewer approved lack of open governance blockers; ' +
            'lack of single signer fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; reviewer approved lack of production throughput claims; ' +
            'lack of full parallel L1 settlement approved by reviewer | yes |',
        ),
      );

    const result = validateReleaseNotes(releaseNotes({ blockers: blockersWithLackApprovals }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('accepts copied blocker resolutions that approve lacking fallback and throughput contexts', () => {
    const blockersWithLackingApprovals = blockerRows
      .replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; reviewer approved lacking trusted fallback; ' +
            'lacking trusted oracle fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; reviewer approved lacking open governance blockers; ' +
            'lacking single signer fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; reviewer approved lacking production throughput claims; ' +
            'lacking full parallel L1 settlement approved by reviewer | yes |',
        ),
      );

    const result = validateReleaseNotes(releaseNotes({ blockers: blockersWithLackingApprovals }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('accepts copied blocker resolutions that approve evidence lacks fallback and throughput contexts', () => {
    const blockersWithLacksApprovals = blockerRows
      .replace(
        requiredBlockerRow('Trustless burn verification path'),
        requiredBlockerRow('Trustless burn verification path').replace(
          ' | yes |',
          '; reviewer approved evidence lacks trusted fallback; ' +
            'evidence lacks trusted oracle fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Committee governance and key-rotation drill'),
        requiredBlockerRow('Committee governance and key-rotation drill').replace(
          ' | yes |',
          '; reviewer approved evidence lacks open governance blockers; ' +
            'evidence lacks single signer fallback approved by reviewer | yes |',
        ),
      )
      .replace(
        requiredBlockerRow('Single, batch, and sharded benchmark evidence'),
        requiredBlockerRow('Single, batch, and sharded benchmark evidence').replace(
          ' | yes |',
          '; reviewer approved evidence lacks production throughput claims; ' +
            'evidence lacks full parallel L1 settlement approved by reviewer | yes |',
        ),
      );

    const result = validateReleaseNotes(releaseNotes({ blockers: blockersWithLacksApprovals }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
    );
    expect(result.errors).not.toContain(
      'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
    );
  });

  it('requires copied Gate 8 blockers to preserve integration reviewer identity consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'integration reviewer sign-off matches review classification',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: integration reviewer sign-off matches review classification',
    );
  });

  it('requires copied Gate 8 blockers to preserve completed entry-point review evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'completed entry-point review evidence beyond document links',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: completed entry-point review evidence beyond document links',
    );
  });

  it('requires copied Gate 8 blockers to preserve fresh or clean checkout context evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'per-command fresh or clean checkout context evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: per-command fresh or clean checkout context evidence',
    );
  });

  it('requires copied Gate 8 blockers to preserve fresh checkout commit identity', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'per-command fresh checkout commit identity',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: per-command fresh checkout commit identity',
    );
  });

  it('requires copied Gate 8 blockers to preserve integration reviewer date consistency', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'integration reviewer sign-off date is not before review classification Date',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: integration reviewer sign-off date is not before review classification Date',
    );
  });

  it('requires copied Gate 8 blockers to preserve actionable reviewer decision summary terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'public institutional-reference release decision',
          'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: public institutional-reference release decision, public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`, production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 8 blockers to bind production-ready handling to exact denial', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRow('External integration package review').replace(
          'production-ready claim handling with exact `Production-ready claim allowed = no`',
          'production-ready claim handling; Production-ready claim allowed = no',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: production-ready claim handling with exact `Production-ready claim allowed = no`',
    );
  });

  it('requires copied Gate 8 blockers to bind public release handling to exact approval', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRow('External integration package review').replace(
          'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
          'public institutional-reference release handling; Public institutional-reference release allowed = yes',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
    );
  });

  it('requires copied Gate 8 blockers to preserve public institutional reference release approval', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'Public institutional-reference release allowed = yes',
          'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    const integrationError = result.errors.find(error =>
      error.startsWith(
        'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms:',
      ),
    );
    expect(integrationError).toContain('Public institutional-reference release allowed = yes');
  });

  it('requires copied Gate 8 blockers to preserve structured row integrity evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'distinct completed evidence targets across linked entry-point, fresh-checkout, decision, and negative-review rows',
          'internally non-contradictory linked entry-point, decision, negative-review, fresh-checkout, and publication-update evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: distinct completed evidence targets across linked entry-point, fresh-checkout, decision, and negative-review rows, internally non-contradictory linked entry-point, decision, negative-review, fresh-checkout, and publication-update evidence',
    );
  });

  it('requires copied Gate 8 blockers to preserve testnet and mainnet claim boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRowOmitting('External integration package review', [
          'Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews',
          'reviewer notes that do not approve production-ready or mainnet production wording',
          'mainnet release-readiness claims remain forbidden or out of scope',
          'only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
        ]),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required blocker row resolution must mention row-specific evidence terms: Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews, reviewer notes that do not approve production-ready or mainnet production wording, mainnet release-readiness claims remain forbidden or out of scope, only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
    );
  });

  it('blocks copied Gate 8 blockers that approve mainnet release-readiness while preserving required terms', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRow('External integration package review').replace(
          ' | no |',
          '; reviewer clears mainnet release-readiness claims | no |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required resolution must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('blocks copied Gate 8 blockers with certification-family mainnet claim approvals', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        requiredBlockerRow('External integration package review').replace(
          ' | no |',
          '; reviewer certifies mainnet release-readiness claims and accredits production ready wording | no |',
        ),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: External integration package review: required resolution must not approve mainnet release-readiness or production-ready wording',
    );
  });

  it('requires linked evidence rows to include evidence markers', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | CI passed locally | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a link, command, or artifact marker',
    );
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects linked evidence rows that only point to a template and validator command', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | [Clean Checkout Evidence Template](clean-checkout-evidence-template.md), `npm run ci:validate` | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects linked evidence rows whose command output has no evidence target', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | Clean checkout CI `npm run ci:validate` command output: PASS | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects linked evidence rows with schemeless artifact targets', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://completed | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects linked evidence rows that point to explicitly incomplete artifacts', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/not-completed-clean-checkout-ci.log | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects completed evidence targets that carry forbidden production-ready claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/mainnet-production-ready-ci.log | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('rejects completed evidence targets that carry testnet production-candidate claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/testnet-production-candidate-ci.log | required for public release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('blocks absolute security wording in required evidence publication effects', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/ci.log | user funds are safe |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: absolute security wording is not allowed in release notes',
    );
  });

  it('requires linked evidence rows to identify the evidence class', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows
        .replace(
          '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
          '| Clean checkout CI | linked | artifact://release/reviewed.log | required for public release |',
        )
        .replace(
          '| Broadcast gate evidence | linked | artifact://release/broadcast.log npm run demo:readiness broadcast policy command output evidence exit code 0 | broadcast remains opt-in |',
          '| Broadcast gate evidence | linked | artifact://release/reviewed.log | broadcast remains opt-in |',
        )
        .replace(
          '| Signer dependency conformance or fail-closed release decision evidence | blocker |  | blocks production-ready claims |',
          '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/reviewed.log | blocks production-ready claims |',
        )
        .replace(
          '| Failed broadcast phantom AVL recovery drill evidence | pending |  | blocks public release |',
          '| Failed broadcast phantom AVL recovery drill evidence | linked | artifact://release/reviewed.log | blocks public release |',
        )
        .replace(
          '| Reorged burn and stale singleton recovery drill evidence | pending |  | blocks public release |',
          '| Reorged burn and stale singleton recovery drill evidence | linked | artifact://release/reviewed.log | blocks public release |',
        )
        .replace(
          '| Committee governance and key-rotation evidence | blocker |  | blocks production-ready claims |',
          '| Committee governance and key-rotation evidence | linked | artifact://release/reviewed.log | blocks production-ready claims |',
        )
        .replace(
          '| External integration package review | pending |  | blocks public institutional-reference release |',
          '| External integration package review | linked | artifact://release/reviewed.log | blocks public institutional-reference release |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: evidence must identify clean checkout CI',
    );
    expect(result.errors).toContain(
      'Required Evidence: Broadcast gate evidence: evidence must identify broadcast gate evidence',
    );
    expect(result.errors).toContain(
      'Required Evidence: Signer dependency conformance or fail-closed release decision evidence: evidence must identify signer dependency conformance or fail-closed release decision',
    );
    expect(result.errors).toContain(
      'Required Evidence: Failed broadcast phantom AVL recovery drill evidence: evidence must identify failed broadcast phantom AVL recovery drill',
    );
    expect(result.errors).toContain(
      'Required Evidence: Reorged burn and stale singleton recovery drill evidence: evidence must identify reorged burn or stale singleton recovery drill',
    );
    expect(result.errors).toContain(
      'Required Evidence: Committee governance and key-rotation evidence: evidence must identify committee governance or key-rotation evidence',
    );
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: evidence must identify external integration package review',
    );
  });

  it('requires linked Gate 7 benchmark evidence rows to preserve command output exit-code evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Single, batch, and sharded benchmark evidence | pending |  | blocks scaling claims |',
        '| Single, batch, and sharded benchmark evidence | linked | artifact://release/benchmark-evidence.log | measured benchmark evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention command-specific benchmark command output with exit code 0',
    );
  });

  it('requires linked Gate 7 benchmark evidence rows to preserve publication decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Single, batch, and sharded benchmark evidence | pending |  | blocks scaling claims |',
        '| Single, batch, and sharded benchmark evidence | linked | artifact://release/benchmark-evidence.log command-specific benchmark command output evidence exit code 0 | measured benchmark evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention Release supported = production deployment candidate, Scaling claims allowed = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Production throughput claim allowed = no, Mainnet-grade evidence linked = no, and Open benchmark blockers = 0',
    );
  });

  it('rejects Gate 7 benchmark rows that keep the testnet production-candidate placeholder', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Single, batch, and sharded benchmark evidence | pending |  | blocks scaling claims |',
        '| Single, batch, and sharded benchmark evidence | linked | artifact://release/benchmark-evidence.log command-specific benchmark command output evidence exit code 0 | Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes/no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; measured benchmark evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention Release supported = production deployment candidate, Scaling claims allowed = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Production throughput claim allowed = no, Mainnet-grade evidence linked = no, and Open benchmark blockers = 0',
    );
  });

  it('rejects Gate 7 benchmark rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Single, batch, and sharded benchmark evidence | pending |  | blocks scaling claims |',
        '| Single, batch, and sharded benchmark evidence | linked | artifact://release/benchmark-evidence.log command-specific benchmark command output evidence exit code 0 | Scaling claims allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes; Production throughput claim allowed = no/yes; Mainnet-grade evidence linked = no/yes; Open benchmark blockers = 0/1; measured benchmark evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention Release supported = production deployment candidate, Scaling claims allowed = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Production throughput claim allowed = no, Mainnet-grade evidence linked = no, and Open benchmark blockers = 0',
    );
  });

  it('rejects Gate 7 benchmark rows with contradictory exact decision bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Single, batch, and sharded benchmark evidence | pending |  | blocks scaling claims |',
        '| Single, batch, and sharded benchmark evidence | linked | artifact://release/benchmark-evidence.log command-specific benchmark command output evidence exit code 0 | Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; measured benchmark evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Single, batch, and sharded benchmark evidence: publication effect must not include contradictory release-note decision bindings',
    );
  });

  it('requires linked Gate 6 governance evidence rows to preserve command output exit-code evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Committee governance and key-rotation evidence | blocker |  | blocks production-ready claims |',
        '| Committee governance and key-rotation evidence | linked | artifact://release/governance-evidence.log | committee governance and key-rotation evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention command-specific governance command output with exit code 0',
    );
  });

  it('requires linked Gate 6 governance evidence rows to preserve publication decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Committee governance and key-rotation evidence | blocker |  | blocks production-ready claims |',
        '| Committee governance and key-rotation evidence | linked | artifact://release/governance-evidence.log command-specific governance command output evidence exit code 0 | committee governance and key-rotation evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Governance-ready claim allowed = yes, and Open governance blockers = 0',
    );
  });

  it('rejects Gate 6 governance evidence rows that keep claim allowance placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Committee governance and key-rotation evidence | blocker |  | blocks production-ready claims |',
        '| Committee governance and key-rotation evidence | linked | artifact://release/governance-evidence.log command-specific governance command output evidence exit code 0 | Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes/no; Governance-ready claim allowed = yes/no; Open governance blockers = 0; committee governance and key-rotation evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Governance-ready claim allowed = yes, and Open governance blockers = 0',
    );
  });

  it('rejects Gate 6 governance evidence rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Committee governance and key-rotation evidence | blocker |  | blocks production-ready claims |',
        '| Committee governance and key-rotation evidence | linked | artifact://release/governance-evidence.log command-specific governance command output evidence exit code 0 | Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes; Governance-ready claim allowed = yes; Open governance blockers = 0/1; committee governance and key-rotation evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Governance-ready claim allowed = yes, and Open governance blockers = 0',
    );
  });

  it('requires linked Gate 6 operator readiness evidence rows to preserve command output exit-code evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Operator readiness evidence | pending |  | blocks institutional release claims |',
        '| Operator readiness evidence | linked | artifact://release/operator-readiness-evidence.log | operator readiness evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Operator readiness evidence: linked evidence must mention command-specific operator command output with exit code 0',
    );
  });

  it('requires linked Gate 6 operator readiness evidence rows to preserve operator claim boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Operator readiness evidence | pending |  | blocks institutional release claims |',
        '| Operator readiness evidence | linked | artifact://release/operator-readiness-evidence.log command-specific operator command output evidence exit code 0 | operator readiness evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Operator readiness evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Operator-ready claim allowed = yes, and Critical incidents open = 0',
    );
  });

  it('rejects Gate 6 operator readiness evidence rows that keep claim allowance placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Operator readiness evidence | pending |  | blocks institutional release claims |',
        '| Operator readiness evidence | linked | artifact://release/operator-readiness-evidence.log command-specific operator command output evidence exit code 0 | Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes/no; Operator-ready claim allowed = yes/no; Critical incidents open = 0; operator readiness evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Operator readiness evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Operator-ready claim allowed = yes, and Critical incidents open = 0',
    );
  });

  it('rejects Gate 6 operator readiness evidence rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Operator readiness evidence | pending |  | blocks institutional release claims |',
        '| Operator readiness evidence | linked | artifact://release/operator-readiness-evidence.log command-specific operator command output evidence exit code 0 | Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes; Operator-ready claim allowed = yes; Critical incidents open = 0/1; operator readiness evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Operator readiness evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Operator-ready claim allowed = yes, and Critical incidents open = 0',
    );
  });

  it('requires linked Gate 2 technical addendum rows to preserve addendum validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Technical addendum architecture manual | blocker |  | blocks controlled testnet architecture claims |',
        '| Technical addendum architecture manual | linked | artifact://release/technical-addendum-evidence.log | technical addendum architecture manual evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Technical addendum architecture manual: linked evidence must mention addendum:validate command output with exit code 0',
    );
  });

  it('requires linked Gate 2 technical addendum rows to preserve release-gate claim boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Technical addendum architecture manual | blocker |  | blocks controlled testnet architecture claims |',
        '| Technical addendum architecture manual | linked | artifact://release/technical-addendum-evidence.log npm run addendum:validate command output evidence exit code 0 | technical addendum architecture manual evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Technical addendum architecture manual: linked evidence must mention Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('rejects linked Gate 2 technical addendum rows with placeholder claim-boundary bindings', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Technical addendum architecture manual | blocker |  | blocks controlled testnet architecture claims |',
        '| Technical addendum architecture manual | linked | artifact://release/technical-addendum-evidence.log npm run addendum:validate command output evidence exit code 0 | Release gate status = pass/fail; release:gate PASS output with Structural issues = 0/1; Production-ready claim allowed = no/yes; Mainnet deployment claim allowed = no/yes; Testnet production-candidate claim allowed = yes-after-release-gate-pass/no; technical addendum architecture manual evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Technical addendum architecture manual: linked evidence must mention Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('rejects linked Gate 2 technical addendum rows with release-gate PASS/CANDIDATE placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Technical addendum architecture manual | blocker |  | blocks controlled testnet architecture claims |',
        '| Technical addendum architecture manual | linked | artifact://release/technical-addendum-evidence.log npm run addendum:validate command output evidence exit code 0 | Release gate status = pass; release:gate PASS/CANDIDATE output with Structural issues = 0; Production-ready claim allowed = no; Mainnet deployment claim allowed = no; Testnet production-candidate claim allowed = yes-after-release-gate-pass; technical addendum architecture manual evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Technical addendum architecture manual: linked evidence must mention Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('requires linked Gate 2 technical addendum rows to report structural issues with numeric zero', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Technical addendum architecture manual | blocker |  | blocks controlled testnet architecture claims |',
        '| Technical addendum architecture manual | linked | artifact://release/technical-addendum-evidence.log npm run addendum:validate command output evidence exit code 0 | Release gate status = pass; release:gate PASS output with zero structural issues; Production-ready claim allowed = no; Mainnet deployment claim allowed = no; Testnet production-candidate claim allowed = yes-after-release-gate-pass; technical addendum architecture manual evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Technical addendum architecture manual: linked evidence must mention Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('requires linked Gate 4 independent security review rows to preserve security validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Independent security review | pending |  | blocks public release |',
        '| Independent security review | linked | artifact://release/security-review-evidence.log | independent security review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Independent security review: linked evidence must mention security:validate command output with exit code 0',
    );
  });

  it('requires linked Gate 4 independent security review rows to preserve reviewer decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Independent security review | pending |  | blocks public release |',
        '| Independent security review | linked | artifact://release/security-review-evidence.log npm run security:validate command output evidence exit code 0 | independent security review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Independent security review: linked evidence must mention Final decision = approve, Critical/high findings open = 0, Publication blockers = 0, and Production-ready claim allowed = no',
    );
  });

  it('rejects Gate 4 independent security review rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Independent security review | pending |  | blocks public release |',
        '| Independent security review | linked | artifact://release/security-review-evidence.log npm run security:validate command output evidence exit code 0 | Final decision = approve/reject; Critical/high findings open = 0/1; Publication blockers = 0/1; Production-ready claim allowed = no/yes; independent security review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Independent security review: linked evidence must mention Final decision = approve, Critical/high findings open = 0, Publication blockers = 0, and Production-ready claim allowed = no',
    );
  });

  it('requires linked Gate 4 dependency risk rows to preserve dependency validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Dependency risk review evidence | pending |  | blocks public release |',
        '| Dependency risk review evidence | linked | artifact://release/dependency-risk-evidence.log | dependency risk review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Dependency risk review evidence: linked evidence must mention dependency:validate command output with exit code 0',
    );
  });

  it('requires linked Gate 4 dependency risk rows to preserve publication decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Dependency risk review evidence | pending |  | blocks public release |',
        '| Dependency risk review evidence | linked | artifact://release/dependency-risk-evidence.log npm run dependency:validate command output evidence exit code 0 | dependency risk review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Dependency risk review evidence: linked evidence must mention Production-ready claim allowed = no and Critical/high vulnerabilities open = 0',
    );
  });

  it('rejects Gate 4 dependency risk rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Dependency risk review evidence | pending |  | blocks public release |',
        '| Dependency risk review evidence | linked | artifact://release/dependency-risk-evidence.log npm run dependency:validate command output evidence exit code 0 | Production-ready claim allowed = no/yes; Critical/high vulnerabilities open = 0/1; dependency risk review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Dependency risk review evidence: linked evidence must mention Production-ready claim allowed = no and Critical/high vulnerabilities open = 0',
    );
  });

  it('requires linked Gate 5 trustless burn evidence rows to preserve trustless validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Trustless burn verification evidence | blocker |  | blocks production-ready claims |',
        '| Trustless burn verification evidence | linked | artifact://release/trustless-burn-evidence.log | trustless burn verification evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Trustless burn verification evidence: linked evidence must mention trustless:validate command output with exit code 0',
    );
  });

  it('requires linked Gate 5 trustless burn evidence rows to preserve publication decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Trustless burn verification evidence | blocker |  | blocks production-ready claims |',
        '| Trustless burn verification evidence | linked | artifact://release/trustless-burn-evidence.log npm run trustless:validate command output evidence exit code 0 | trustless burn verification evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Trustless burn verification evidence: linked evidence must mention Release supported = production deployment candidate, Trustless burn verification implemented = yes, Transitional trusted burn path disabled = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Critical/high findings open = 0',
    );
  });

  it('rejects Gate 5 trustless burn rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Trustless burn verification evidence | blocker |  | blocks production-ready claims |',
        '| Trustless burn verification evidence | linked | artifact://release/trustless-burn-evidence.log npm run trustless:validate command output evidence exit code 0 | Trustless burn verification implemented = yes/no; Transitional trusted burn path disabled = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes/no; Critical/high findings open = 0/1; trustless burn verification evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Trustless burn verification evidence: linked evidence must mention Release supported = production deployment candidate, Trustless burn verification implemented = yes, Transitional trusted burn path disabled = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Critical/high findings open = 0',
    );
  });

  it('requires linked Clean Checkout CI rows to preserve ci validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
        '| Clean checkout CI | linked | artifact://release/ci.log | clean checkout CI evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked evidence must mention ci:validate command output with exit code 0',
    );
  });

  it('requires linked production-candidate Clean Checkout CI rows to preserve exact decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        cleanCheckoutProductionDecisionBoundary,
        'Release supported = production deployment candidate/draft; Production-ready claim allowed = no/yes; ' +
          'Testnet production-candidate claim allowed = yes/no; Release gate structural issues = 0/1; clean checkout CI evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Clean checkout CI: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Release gate structural issues = 0',
    );
  });

  it('requires linked production-candidate independent security rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Final decision = approve; Critical/high findings open = 0; Publication blockers = 0; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; independent security review evidence linked',
        'Final decision = approve; Critical/high findings open = 0; Publication blockers = 0; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; independent security review evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Independent security review: linked production-candidate evidence must mention Release supported = production deployment candidate, Final decision = approve, Critical/high findings open = 0, Publication blockers = 0, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires linked production-candidate dependency risk rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high vulnerabilities open = 0; dependency risk review evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high vulnerabilities open = 0; dependency risk review evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Dependency risk review evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Critical/high vulnerabilities open = 0',
    );
  });

  it('requires linked production-candidate operator rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Operator-ready claim allowed = yes; Critical incidents open = 0; operator readiness evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Operator-ready claim allowed = yes; Critical incidents open = 0; operator readiness evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Operator readiness evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Operator-ready claim allowed = yes, and Critical incidents open = 0',
    );
  });

  it('requires linked production-candidate governance rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Governance-ready claim allowed = yes; Open governance blockers = 0; committee governance and key-rotation evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Governance-ready claim allowed = yes; Open governance blockers = 0; committee governance and key-rotation evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Governance-ready claim allowed = yes, and Open governance blockers = 0',
    );
  });

  it('requires linked production-candidate trustless burn rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Trustless burn verification implemented = yes; Release supported = production deployment candidate; Transitional trusted burn path disabled = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; trustless burn verification evidence linked',
        'Trustless burn verification implemented = yes; Transitional trusted burn path disabled = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; trustless burn verification evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Trustless burn verification evidence: linked evidence must mention Release supported = production deployment candidate, Trustless burn verification implemented = yes, Transitional trusted burn path disabled = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Critical/high findings open = 0',
    );
  });

  it('requires linked production-candidate benchmark rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; measured benchmark evidence linked',
        'Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; measured benchmark evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention Release supported = production deployment candidate, Scaling claims allowed = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Production throughput claim allowed = no, Mainnet-grade evidence linked = no, and Open benchmark blockers = 0',
    );
  });

  it('requires linked production-candidate external integration rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; external integration package review evidence linked',
        'Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; external integration package review evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked production-candidate evidence must mention Release supported = production deployment candidate, Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires linked production-candidate threat model rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        threatModelProductionDecisionBoundary,
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; threat model and evidence matrix evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Threat model and evidence matrix: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires linked production-candidate technical addendum rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        technicalAddendumProductionDecisionBoundary,
        'Release gate status = pass; release:gate PASS output with Structural issues = 0; Production-ready claim allowed = no; Mainnet deployment claim allowed = no; Testnet production-candidate claim allowed = yes-after-release-gate-pass; technical addendum architecture manual evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Technical addendum architecture manual: linked production-candidate evidence must mention Release supported = production deployment candidate, Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  });

  it('requires linked production-candidate testnet lifecycle rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        testnetLifecycleProductionDecisionBoundary,
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Ergo node network testnet, and Sidechain network patched-devnet or another non-mainnet sidechain network',
    );
  });

  it('requires linked production-candidate recovery rows to preserve exact release support', () => {
    for (const { boundary, weakBoundary, evidenceClass } of [
      {
        boundary: failedBroadcastRecoveryProductionDecisionBoundary,
        weakBoundary:
          'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; failed broadcast phantom AVL recovery evidence linked',
        evidenceClass: 'Failed broadcast phantom AVL recovery drill evidence',
      },
      {
        boundary: reorgRecoveryProductionDecisionBoundary,
        weakBoundary:
          'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; reorged burn and stale singleton recovery evidence linked',
        evidenceClass: 'Reorged burn and stale singleton recovery drill evidence',
      },
    ]) {
      const result = validateReleaseNotes(releaseNotes({
        releaseLevel: 'production deployment candidate',
        decision: 'proposed',
        evidence: linkedProductionEvidenceRows.replace(boundary, weakBoundary),
        blockers: checkedProductionBlockerRows,
        scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
        claims:
          '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
      }));

      expect(result.status, evidenceClass).toBe('BLOCKED');
      expect(result.errors, evidenceClass).toContain(
        `Required Evidence: ${evidenceClass}: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes`,
      );
    }
  });

  it('requires linked production-candidate backup-restore evidence rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; backup-restore evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; backup-restore evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: SQLite/AVL backup-restore evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
    );
  });

  it('requires linked production-candidate broadcast gate rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Broadcast remains opt-in = yes; broadcast gate evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Broadcast remains opt-in = yes; broadcast gate evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Broadcast gate evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Broadcast remains opt-in = yes',
    );
  });

  it('requires linked production-candidate ContextExtension signer rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; ContextExtension upstream signer resolution boundary evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; ContextExtension upstream signer resolution boundary evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: ContextExtension signer resolution or guard: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and ContextExtension signer guard or upstream signer resolution boundary',
    );
  });

  it('requires linked production-candidate signer dependency rows to preserve exact release support', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows.replace(
        'Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked',
        'Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked',
      ),
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims:
        '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Signer dependency conformance or fail-closed release decision evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and upstream signer conformance evidence',
    );
  });

  it('requires linked backup-restore evidence rows to preserve backup validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| SQLite/AVL backup-restore evidence | pending |  | blocks public release |',
        '| SQLite/AVL backup-restore evidence | linked | artifact://release/backup-restore-evidence.log | SQLite/AVL backup-restore evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: SQLite/AVL backup-restore evidence: linked evidence must mention backup:validate command output with exit code 0',
    );
  });

  it('requires linked ContextExtension signer evidence rows to preserve the guard boundary', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| ContextExtension signer resolution or guard | linked | artifact://release/context-extension.log ContextExtension signer guard fail-closed evidence | fail-closed guard remains active until upstream signer resolution |',
        '| ContextExtension signer resolution or guard | linked | artifact://release/context-extension.log | ContextExtension guard evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: ContextExtension signer resolution or guard: linked evidence must mention fail-closed ContextExtension signer guard or upstream signer resolution boundary',
    );
  });

  it('requires linked signer dependency evidence rows to preserve conformance or fail-closed decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Signer dependency conformance or fail-closed release decision evidence | blocker |  | blocks production-ready claims |',
        '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-evidence.log | signer dependency conformance evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Signer dependency conformance or fail-closed release decision evidence: linked evidence must mention upstream signer conformance evidence or fail-closed signer release decision boundary',
    );
  });

  it('rejects fail-closed signer dependency rows that keep decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Signer dependency conformance or fail-closed release decision evidence | blocker |  | blocks production-ready claims |',
        '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-evidence.log | Release supported = institutional reference; Production-ready claim allowed = no/yes; Upstream signer blocker resolved = no/yes; fail-closed signer dependency release decision remains active |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Signer dependency conformance or fail-closed release decision evidence: linked evidence must mention upstream signer conformance evidence or fail-closed signer release decision boundary',
    );
  });

  it('requires linked broadcast gate evidence rows to preserve demo readiness policy output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Broadcast gate evidence | linked | artifact://release/broadcast.log npm run demo:readiness broadcast policy command output evidence exit code 0 | broadcast remains opt-in |',
        '| Broadcast gate evidence | linked | artifact://release/broadcast.log | broadcast gate evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Broadcast gate evidence: linked evidence must mention demo:readiness broadcast policy command output with exit code 0',
    );
  });

  it('requires linked threat-model evidence rows to preserve threat-model validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| Threat model and evidence matrix | linked | [matrix](../docs/security-evidence-matrix.md) npm run threat-model:validate command output evidence exit code 0 | required for release notes |',
        '| Threat model and evidence matrix | linked | [matrix](../docs/security-evidence-matrix.md) | threat model evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Threat model and evidence matrix: linked evidence must mention threat-model:validate command output with exit code 0',
    );
  });

  it('requires linked Gate 8 evidence rows to preserve fresh reviewer and private-context facts', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log | blocks public institutional-reference release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention fresh reviewer and private maintainer context used = no',
    );
  });

  it('requires linked Gate 8 evidence rows to preserve fresh checkout commit identity', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer private maintainer context used = no | blocks public institutional-reference release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention fresh checkout commit identity matching Release Classification Git commit abc1234',
    );
  });

  it('requires linked Gate 8 evidence rows to preserve explicit fresh-checkout exit code output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout commit abc1234 | blocks public institutional-reference release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention fresh-checkout command output with exit code 0',
    );
  });

  it('rejects linked Gate 8 evidence rows that keep a fresh-checkout exit-code placeholder', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0/1 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; external integration evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention fresh-checkout command output with exit code 0',
    );
  });

  it('requires linked Gate 8 evidence rows to preserve integration validation output', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0 fresh checkout commit abc1234 | external integration evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention integration:validate command output with exit code 0',
    );
  });

  it('requires linked Gate 8 evidence rows to preserve publication decision boundaries', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | external integration evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and exact Testnet production-candidate claim allowed = yes or no',
    );
  });

  it('requires linked Gate 8 evidence rows to preserve exact private-context denial', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; docs without private maintainer context; fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; external integration package review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and exact Testnet production-candidate claim allowed = yes or no',
    );
  });

  it('rejects Gate 8 evidence rows that keep the testnet production-candidate placeholder', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes/no; external integration package review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and exact Testnet production-candidate claim allowed = yes or no',
    );
  });

  it('rejects Gate 8 evidence rows that keep the inverse testnet production-candidate placeholder', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no/yes; external integration package review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and exact Testnet production-candidate claim allowed = yes or no',
    );
  });

  it('rejects Gate 8 evidence rows that keep publication decision placeholders', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer private maintainer context used = no/yes fresh checkout command output exit code 0 fresh checkout commit abc1234 npm run integration:validate command output evidence exit code 0 | Public institutional-reference release allowed = yes/no; Production-ready claim allowed = no/yes; Testnet production-candidate claim allowed = yes; external integration package review evidence linked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention fresh reviewer and private maintainer context used = no',
    );
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and exact Testnet production-candidate claim allowed = yes or no',
    );
  });

  it('requires linked Gate 8 evidence rows to match the release classification commit', () => {
    const result = validateReleaseNotes(releaseNotes({
      evidence: evidenceRows.replace(
        '| External integration package review | pending |  | blocks public institutional-reference release |',
        '| External integration package review | linked | artifact://release/external-integration-evidence.log fresh reviewer; private maintainer context used = no; fresh checkout commit def5678 | blocks public institutional-reference release |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: External integration package review: linked evidence must mention fresh checkout commit identity matching Release Classification Git commit abc1234',
    );
  });

  it('requires trust assumptions to be backed by structured evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows.replace('artifact://release/trusted-oracle-burn-interpretation.md', 'documented'),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must be a link, command, or artifact marker',
    );
  });

  it('requires trust assumption evidence to identify the assumption', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows
        .replace(
          '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
          '| Trusted-oracle burn interpretation | documented | artifact://release/reviewed.md | limits release claims |',
        )
        .replace(
          '| Local SQLite/AVL recovery | documented | artifact://release/local-sqlite-avl-recovery.md | limits release claims |',
          '| Local SQLite/AVL recovery | documented | artifact://release/reviewed.md | limits release claims |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must identify trusted-oracle burn interpretation',
    );
    expect(result.errors).toContain(
      'Trust Assumptions: Local SQLite/AVL recovery: evidence must identify local SQLite/AVL recovery',
    );
  });

  it('rejects trust assumptions and claims backed only by templates or bare validator commands', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows.replace(
        'artifact://release/trusted-oracle-burn-interpretation.md',
        templateOnlyEvidence,
      ),
      claims: `| local guard evidence | ${templateOnlyEvidence} | guarded locally, pending live evidence |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('rejects trust assumptions and claims whose command output has no evidence target', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows.replace(
        'artifact://release/trusted-oracle-burn-interpretation.md',
        'Trusted-oracle burn interpretation `npm run trustless:validate` command output: PASS',
      ),
      claims: '| local guard evidence | local guard evidence `npm run release:gate` command output: PASS | guarded locally, pending live evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: evidence must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence',
    );
  });

  it('blocks absolute security wording in trust assumption status and impact', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows.replace(
        '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
        '| Trusted-oracle burn interpretation | documented and funds are safe | artifact://release/trusted-oracle-burn-interpretation.md | no fund loss is possible |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks production-oriented wording in non-production trust assumption impact', () => {
    const result = validateReleaseNotes(releaseNotes({
      assumptions: assumptionRows.replace(
        '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
        '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | exchange-grade mainnet release supported |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('requires allowed claim evidence to identify the claim', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| local guard evidence | artifact://release/reviewed.log | guarded locally, pending live evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must identify the allowed claim',
    );
  });

  it('rejects allowed claim evidence links that negate the claim', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| local guard evidence | artifact://release/not-local-guard-evidence.log not local guard evidence claim | guarded locally, pending live evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: local guard evidence: evidence link must not negate the allowed claim',
    );
  });

  it('blocks production-oriented claims below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| production launch | artifact://release/claim.log | production-ready mainnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: production launch: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks absolute security wording in allowed claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| absolute security claim | artifact://release/absolute-security-claim.log | bridge is risk-free with no vulnerabilities and cannot lose funds |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: absolute security claim: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks funds-safe and lossless wording in allowed claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| funds safety claim | artifact://release/funds-safety-claim.log | user funds are safe, no fund loss is possible, and the bridge is lossless |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: funds safety claim: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks ready-for-production wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| release readiness claim | artifact://release/release-readiness-claim.log | ready for production bridge remains pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: release readiness claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks deployment-ready and exchange-ready wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| deployment readiness claim | artifact://release/deployment-readiness-claim.log | deployment-ready exchange-ready bridge remains pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: deployment readiness claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks go-live, general availability, and production launch wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| go live launch claim | artifact://release/go-live-launch-claim.log | go-live general availability and production launch remain pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: go live launch claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks exchange-grade and institutional-grade wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| exchange grade claim | artifact://release/exchange-grade-claim.log | exchange-grade institutional-grade bridge remains pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: exchange grade claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks enterprise-grade and enterprise-ready wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| enterprise readiness claim | artifact://release/enterprise-readiness-claim.log | enterprise-grade enterprise-ready bridge remains pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: enterprise readiness claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks market-ready, launch-ready, and institutional-ready wording below production deployment candidate level', () => {
    const market = validateReleaseNotes(releaseNotes({
      claims: '| market readiness claim | artifact://release/market-readiness-claim.log | market-ready launch-ready bridge remains pending production evidence |',
    }));
    const institutional = validateReleaseNotes(releaseNotes({
      claims: '| institutional readiness claim | artifact://release/institutional-readiness-claim.log | institutional-ready bridge remains pending production evidence |',
    }));

    expect(market.status).toBe('BLOCKED');
    expect(market.errors).toContain(
      'Allowed Claims: market readiness claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
    expect(institutional.status).toBe('BLOCKED');
    expect(institutional.errors).toContain(
      'Allowed Claims: institutional readiness claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks production-grade and bank-grade wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| production grade claim | artifact://release/production-grade-claim.log | production-grade bank-grade bridge remains pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: production grade claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks abbreviated prod-ready, prod-candidate, and prod-grade wording below production deployment candidate level', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| prod readiness claim | artifact://release/prod-readiness-claim.log | prod-ready prod-candidate prod-grade bridge remains pending production evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: prod readiness claim: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks throughput and scaling claims without linked benchmark evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| throughput claim | artifact://release/throughput-claim.log | measured throughput and scaling remain pending benchmark evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: throughput claim: throughput, latency, TPS, tx/s, transaction-per-second, or scaling wording requires linked benchmark evidence',
    );
  });

  it('blocks transaction-per-second benchmark claims without linked benchmark evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| transaction rate claim | artifact://release/transaction-rate-claim.log | transactions per second and tx/s claims remain pending benchmark evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: transaction rate claim: throughput, latency, TPS, tx/s, transaction-per-second, or scaling wording requires linked benchmark evidence',
    );
  });

  it('allows throughput claims when benchmark evidence is linked', () => {
    const benchmarkEvidenceLinked = evidenceRows.replace(
      '| Single, batch, and sharded benchmark evidence | pending |  | blocks scaling claims |',
      '| Single, batch, and sharded benchmark evidence | linked | artifact://release/benchmark-evidence.log command-specific benchmark command output evidence exit code 0 | Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no; Open benchmark blockers = 0; measured benchmark evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: benchmarkEvidenceLinked,
      claims: '| throughput claim | artifact://release/throughput-claim.log | measured throughput and scaling remain bounded by benchmark evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: throughput claim: throughput, latency, TPS, tx/s, transaction-per-second, or scaling wording requires linked benchmark evidence',
    );
  });

  it('blocks trustless burn claims without linked trustless burn evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| trustless burn claim | artifact://release/trustless-burn-claim.log | SPV burn inclusion proof remains pending trustless burn evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: trustless burn claim: trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment wording requires linked trustless burn evidence',
    );
  });

  it('blocks burn verification and phantom burn trust-minimization claims without linked trustless burn evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims:
        '| burn verification claim | artifact://release/burn-verification-claim.log | ' +
        'burn verification limitations are resolved and phantom burn trust minimization is complete for reviewers |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: burn verification claim: trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment wording requires linked trustless burn evidence',
    );
  });

  it('allows trustless burn claims when trustless burn evidence is linked', () => {
    const trustlessBurnEvidenceLinked = evidenceRows.replace(
      '| Trustless burn verification evidence | blocker |  | blocks production-ready claims |',
      '| Trustless burn verification evidence | linked | artifact://release/trustless-burn-evidence.log npm run trustless:validate command output evidence exit code 0 | Trustless burn verification implemented = yes; Transitional trusted burn path disabled = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; trustless burn verification evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: trustlessBurnEvidenceLinked,
      claims: '| trustless burn claim | artifact://release/trustless-burn-claim.log | SPV burn inclusion proof remains bounded by trustless burn evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: trustless burn claim: trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment wording requires linked trustless burn evidence',
    );
  });

  it('blocks trusted-burn completion claims without linked trustless burn evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| trusted burn completion claim | artifact://release/trusted-burn-completion-claim.log | trusted burn verification is solved and trusted-oracle fallback removed pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: trusted burn completion claim: trusted burn verification, trusted-oracle burn, or oracle-fallback completion wording requires linked trustless burn evidence',
    );
  });

  it('allows trusted-burn completion claims when trustless burn evidence is linked', () => {
    const trustlessBurnEvidenceLinked = evidenceRows.replace(
      '| Trustless burn verification evidence | blocker |  | blocks production-ready claims |',
      '| Trustless burn verification evidence | linked | artifact://release/trustless-burn-evidence.log npm run trustless:validate command output evidence exit code 0 | Trustless burn verification implemented = yes; Transitional trusted burn path disabled = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; trustless burn verification evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: trustlessBurnEvidenceLinked,
      claims: '| trusted burn completion claim | artifact://release/trusted-burn-completion-claim.log | trusted burn verification is solved and trusted-oracle fallback removed by trustless burn evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: trusted burn completion claim: trusted burn verification, trusted-oracle burn, or oracle-fallback completion wording requires linked trustless burn evidence',
    );
  });

  it('blocks committee governance claims without linked committee governance evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| governance claim | artifact://release/governance-claim.log | committee governance and key-rotation remain pending governance evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: governance claim: committee governance, key-rotation, threshold, or multisig wording requires linked committee governance evidence',
    );
  });

  it('allows committee governance claims when committee governance evidence is linked', () => {
    const governanceEvidenceLinked = evidenceRows.replace(
      '| Committee governance and key-rotation evidence | blocker |  | blocks production-ready claims |',
      '| Committee governance and key-rotation evidence | linked | artifact://release/governance-evidence.log command-specific governance command output evidence exit code 0 | Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Governance-ready claim allowed = yes; Open governance blockers = 0; committee governance and key-rotation evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: governanceEvidenceLinked,
      claims: '| governance claim | artifact://release/governance-claim.log | committee governance and key-rotation remain bounded by governance evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: governance claim: committee governance, key-rotation, threshold, or multisig wording requires linked committee governance evidence',
    );
  });

  it('blocks threat-model claims without linked threat-model evidence', () => {
    const threatModelEvidencePending = evidenceRows.replace(
      '| Threat model and evidence matrix | linked | [matrix](../docs/security-evidence-matrix.md) npm run threat-model:validate command output evidence exit code 0 | required for release notes |',
      '| Threat model and evidence matrix | pending |  | blocks threat-model claims |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: threatModelEvidencePending,
      claims: '| threat model claim | artifact://release/threat-model-claim.log | threat model, evidence matrix, risk-class, and attack-chain mitigations remain pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: threat model claim: threat model, evidence matrix, risk-class, attack-chain, or mitigation wording requires linked threat-model/evidence-matrix evidence',
    );
  });

  it('allows threat-model claims when threat-model evidence is linked', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| threat model claim | artifact://release/threat-model-claim.log | threat model, evidence matrix, risk-class, and attack-chain mitigations remain bounded by evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: threat model claim: threat model, evidence matrix, risk-class, attack-chain, or mitigation wording requires linked threat-model/evidence-matrix evidence',
    );
  });

  it('blocks ContextExtension guard claims without linked ContextExtension guard evidence', () => {
    const contextExtensionEvidencePending = evidenceRows
      .replace(
        '| ContextExtension signer resolution or guard | linked | artifact://release/context-extension.log ContextExtension signer guard fail-closed evidence | fail-closed guard remains active until upstream signer resolution |',
        '| ContextExtension signer resolution or guard | pending |  | blocks ContextExtension guard claims |',
      )
      .replace(
        '| Signer dependency conformance or fail-closed release decision evidence | blocker |  | blocks production-ready claims |',
        '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer-decision.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; fail-closed signer dependency release decision remains active |',
      );
    const result = validateReleaseNotes(releaseNotes({
      evidence: contextExtensionEvidencePending,
      claims: '| context extension guard claim | artifact://release/context-extension-guard-claim.log | ContextExtension signer guard and fail-closed signer resolution remain pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: context extension guard claim: ContextExtension signer guard, fail-closed guard, or signer resolution wording requires linked ContextExtension signer guard evidence',
    );
  });

  it('allows ContextExtension guard claims when ContextExtension guard evidence is linked', () => {
    const signerDependencyEvidenceLinked = evidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | blocker |  | blocks production-ready claims |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer-decision.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; fail-closed signer dependency release decision remains active |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: signerDependencyEvidenceLinked,
      claims: '| context extension guard claim | artifact://release/context-extension-guard-claim.log | ContextExtension signer guard and fail-closed signer resolution remain bounded by guard evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: context extension guard claim: ContextExtension signer guard, fail-closed guard, or signer resolution wording requires linked ContextExtension signer guard evidence',
    );
  });

  it('blocks signer dependency claims without linked signer dependency evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| signer dependency claim | artifact://release/signer-dependency-claim.log | ContextExtension signer consensus remains pending upstream signer evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: signer dependency claim: signer dependency, ContextExtension, sigma-rust, or upstream signer wording requires linked signer dependency evidence',
    );
  });

  it('allows signer dependency claims when signer dependency evidence is linked', () => {
    const signerDependencyEvidenceLinked = evidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | blocker |  | blocks production-ready claims |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer-decision.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; fail-closed signer dependency release decision remains active |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: signerDependencyEvidenceLinked,
      claims: '| signer dependency claim | artifact://release/signer-dependency-claim.log | ContextExtension signer consensus remains bounded by upstream signer evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: signer dependency claim: signer dependency, ContextExtension, sigma-rust, or upstream signer wording requires linked signer dependency evidence',
    );
  });

  it('blocks broadcast gate claims without linked broadcast gate evidence', () => {
    const broadcastGateEvidencePending = evidenceRows.replace(
      '| Broadcast gate evidence | linked | artifact://release/broadcast.log npm run demo:readiness broadcast policy command output evidence exit code 0 | broadcast remains opt-in |',
      '| Broadcast gate evidence | pending |  | blocks unsafe broadcast claims |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: broadcastGateEvidencePending,
      claims: '| broadcast gate claim | artifact://release/broadcast-gate-claim.log | broadcast opt-in policy and transaction broadcast surface remain pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: broadcast gate claim: broadcast, broadcast gate, broadcast opt-in, or transaction broadcast wording requires linked broadcast gate evidence',
    );
  });

  it('allows broadcast gate claims when broadcast gate evidence is linked', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| broadcast gate claim | artifact://release/broadcast-gate-claim.log | broadcast opt-in policy and transaction broadcast surface remain bounded by broadcast evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: broadcast gate claim: broadcast, broadcast gate, broadcast opt-in, or transaction broadcast wording requires linked broadcast gate evidence',
    );
  });

  it('blocks dependency-risk claims without linked dependency risk review evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| dependency risk claim | artifact://release/dependency-risk-claim.log | dependency risk register, toolchain pinning, package-lock.json, Cargo.lock, and vulnerability triage remain pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: dependency risk claim: dependency risk, dependency register, toolchain, lockfile, supply-chain, or vulnerability-triage wording requires linked dependency risk review evidence',
    );
  });

  it('allows dependency-risk claims when dependency risk review evidence is linked', () => {
    const dependencyRiskEvidenceLinked = evidenceRows.replace(
      '| Dependency risk review evidence | pending |  | blocks public release |',
      '| Dependency risk review evidence | linked | artifact://release/dependency-risk-evidence.log npm run dependency:validate command output evidence exit code 0 | Production-ready claim allowed = no; Critical/high vulnerabilities open = 0; dependency risk review evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: dependencyRiskEvidenceLinked,
      claims: '| dependency risk claim | artifact://release/dependency-risk-claim.log | dependency risk register and toolchain pinning remain bounded by dependency risk evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: dependency risk claim: dependency risk, dependency register, toolchain, lockfile, supply-chain, or vulnerability-triage wording requires linked dependency risk review evidence',
    );
  });

  it('blocks operator readiness claims without linked operator readiness evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| operator readiness claim | artifact://release/operator-readiness-claim.log | operator-ready runbooks remain pending operator readiness evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: operator readiness claim: operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring wording requires linked operator readiness evidence',
    );
  });

  it('blocks operationally-ready wording without linked operator readiness evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| ops readiness claim | artifact://release/ops-readiness-claim.log | bridge is operationally ready and ops-ready for exchange teams |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: ops readiness claim: operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring wording requires linked operator readiness evidence',
    );
  });

  it('allows operator readiness claims when operator readiness evidence is linked', () => {
    const operatorReadinessEvidenceLinked = evidenceRows.replace(
      '| Operator readiness evidence | pending |  | blocks institutional release claims |',
      '| Operator readiness evidence | linked | artifact://release/operator-readiness-evidence.log command-specific operator command output evidence exit code 0 | operator readiness evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: operatorReadinessEvidenceLinked,
      claims: '| operator readiness claim | artifact://release/operator-readiness-claim.log | operator-ready runbooks remain bounded by operator readiness evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: operator readiness claim: operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring wording requires linked operator readiness evidence',
    );
  });

  it('blocks external integration claims without linked external integration evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| external integration claim | artifact://release/external-integration-claim.log | external reviewer fresh checkout remains pending external integration evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: external integration claim: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence',
    );
  });

  it('blocks public release wording without linked external integration evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| public release claim | artifact://release/public-release-claim.log | public release and publication-ready evidence remains pending external integration review |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: public release claim: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence',
    );
  });

  it('blocks third-party integrator readiness wording without linked external integration evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| integrator readiness claim | artifact://release/integrator-readiness-claim.log | third-party integrator-ready and partner-ready package remains pending external review |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: integrator readiness claim: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence',
    );
  });

  it('blocks safe-to-publish wording without linked external integration evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| publication approval claim | artifact://release/publication-approval-claim.log | release candidate is safe to publish and publication approved for external teams |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: publication approval claim: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence',
    );
  });

  it('allows external integration claims when external integration evidence is linked', () => {
    const externalIntegrationEvidenceLinked = evidenceRows.replace(
      '| External integration package review | pending |  | blocks public institutional-reference release |',
      linkedExternalIntegrationEvidenceRow(),
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: externalIntegrationEvidenceLinked,
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        checkedRequiredBlockerRow('External integration package review'),
      ),
      claims: '| external integration claim | artifact://release/external-integration-claim.log | external reviewer fresh checkout remains bounded by external integration evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: external integration claim: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence',
    );
  });

  it('allows public release wording when external integration evidence is linked', () => {
    const externalIntegrationEvidenceLinked = evidenceRows.replace(
      '| External integration package review | pending |  | blocks public institutional-reference release |',
      linkedExternalIntegrationEvidenceRow(),
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: externalIntegrationEvidenceLinked,
      blockers: blockerRows.replace(
        requiredBlockerRow('External integration package review'),
        checkedRequiredBlockerRow('External integration package review'),
      ),
      claims: '| public release claim | artifact://release/public-release-claim.log | public release and publication-ready wording remains bounded by external integration evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: public release claim: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence',
    );
  });

  it('blocks external integration claims while the Gate 8 publication blocker remains unchecked', () => {
    const externalIntegrationEvidenceLinked = evidenceRows.replace(
      '| External integration package review | pending |  | blocks public institutional-reference release |',
      linkedExternalIntegrationEvidenceRow(),
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: externalIntegrationEvidenceLinked,
      claims: '| external integration claim | artifact://release/external-integration-claim.log | external reviewer fresh checkout remains bounded by external integration evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: external integration claim: external integration wording requires Gate 8 publication blocker Checked',
    );
  });

  it('blocks backup-restore claims without linked backup-restore evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| backup restore claim | artifact://release/backup-restore-claim.log | SQLite/WAL restore reconstructibility remains pending backup evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: backup restore claim: backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild wording requires linked backup-restore evidence',
    );
  });

  it('blocks disaster recovery and state recovery claims without linked backup-restore evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| disaster recovery claim | artifact://release/disaster-recovery-claim.log | disaster recovery verified and state recovery ready pending drill evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: disaster recovery claim: backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild wording requires linked backup-restore evidence',
    );
  });

  it('allows backup-restore claims when backup-restore evidence is linked', () => {
    const backupRestoreEvidenceLinked = evidenceRows.replace(
      '| SQLite/AVL backup-restore evidence | pending |  | blocks public release |',
      '| SQLite/AVL backup-restore evidence | linked | artifact://release/backup-restore-evidence.log npm run backup:validate command output evidence exit code 0 | SQLite/AVL backup-restore evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: backupRestoreEvidenceLinked,
      claims: '| backup restore claim | artifact://release/backup-restore-claim.log | SQLite/WAL restore reconstructibility remains bounded by backup evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: backup restore claim: backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild wording requires linked backup-restore evidence',
    );
  });

  it('blocks security review claims without linked independent security review evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| security review claim | artifact://release/security-review-claim.log | security review and critical/high finding disposition remain pending independent review evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: security review claim: security review, audit, finding disposition, critical/high, assessment, or penetration-test wording requires linked independent security review evidence',
    );
  });

  it('blocks security assessment and pentest claims without linked independent security review evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| security assessment claim | artifact://release/security-assessment-claim.log | security assessment and penetration test are complete pending final signoff |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: security assessment claim: security review, audit, finding disposition, critical/high, assessment, or penetration-test wording requires linked independent security review evidence',
    );
  });

  it('allows security review claims when independent security review evidence is linked', () => {
    const securityReviewEvidenceLinked = evidenceRows.replace(
      '| Independent security review | pending |  | blocks public release |',
      '| Independent security review | linked | artifact://release/security-review-evidence.log npm run security:validate command output evidence exit code 0 | Final decision = approve; Critical/high findings open = 0; Publication blockers = 0; Production-ready claim allowed = no; independent security review evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: securityReviewEvidenceLinked,
      claims: '| security review claim | artifact://release/security-review-claim.log | security review and critical/high finding disposition remain bounded by independent review evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: security review claim: security review, audit, finding disposition, critical/high, assessment, or penetration-test wording requires linked independent security review evidence',
    );
  });

  it('blocks failed-broadcast recovery claims without linked failed-broadcast recovery evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| failed broadcast claim | artifact://release/failed-broadcast-claim.log | failed broadcast recovery prevents phantom AVL and phantom DUP history pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: failed broadcast claim: failed broadcast, phantom AVL, or phantom DUP wording requires linked failed-broadcast recovery evidence',
    );
  });

  it('blocks linked failed-broadcast recovery evidence without recovery-observe JSON validation', () => {
    const failedBroadcastEvidenceLinked = evidenceRows.replace(
      '| Failed broadcast phantom AVL recovery drill evidence | pending |  | blocks public release |',
      '| Failed broadcast phantom AVL recovery drill evidence | linked | artifact://release/failed-broadcast-evidence.log | failed broadcast phantom AVL recovery evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: failedBroadcastEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Failed broadcast phantom AVL recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with failed-broadcast-phantom-avl observation JSON',
    );
  });

  it('rejects linked failed-broadcast recovery evidence when validation PASS keeps a PASS/CANDIDATE placeholder', () => {
    const placeholderRecoveryObserveEvidence = failedBroadcastRecoveryObserveEvidence.replace(
      'recovery-observe JSON validation PASS recovery-observe validation target',
      'recovery-observe JSON validation PASS/CANDIDATE recovery-observe validation target',
    );
    const failedBroadcastEvidenceLinked = evidenceRows.replace(
      '| Failed broadcast phantom AVL recovery drill evidence | pending |  | blocks public release |',
      linkedFailedBroadcastRecoveryEvidenceRow(placeholderRecoveryObserveEvidence),
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: failedBroadcastEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Failed broadcast phantom AVL recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with failed-broadcast-phantom-avl observation JSON',
    );
  });

  it('blocks failed-broadcast recovery claims when linked evidence lacks recovery-observe JSON validation', () => {
    const failedBroadcastEvidenceLinked = evidenceRows.replace(
      '| Failed broadcast phantom AVL recovery drill evidence | pending |  | blocks public release |',
      '| Failed broadcast phantom AVL recovery drill evidence | linked | artifact://release/failed-broadcast-evidence.log | failed broadcast phantom AVL recovery evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: failedBroadcastEvidenceLinked,
      claims: '| failed broadcast claim | artifact://release/failed-broadcast-claim.log | failed broadcast recovery prevents phantom AVL and phantom DUP history bounded by evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: failed broadcast claim: failed broadcast, phantom AVL, or phantom DUP wording requires linked failed-broadcast recovery evidence with validated recovery-observe JSON',
    );
  });

  it('allows failed-broadcast recovery claims when failed-broadcast recovery-observe evidence is validated', () => {
    const failedBroadcastEvidenceLinked = evidenceRows.replace(
      '| Failed broadcast phantom AVL recovery drill evidence | pending |  | blocks public release |',
      linkedFailedBroadcastRecoveryEvidenceRow(),
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: failedBroadcastEvidenceLinked,
      claims: '| failed broadcast claim | artifact://release/failed-broadcast-claim.log | failed broadcast recovery prevents phantom AVL and phantom DUP history bounded by evidence |',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Required Evidence: Failed broadcast phantom AVL recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with failed-broadcast-phantom-avl observation JSON',
    );
    expect(result.errors).not.toContain(
      'Allowed Claims: failed broadcast claim: failed broadcast, phantom AVL, or phantom DUP wording requires linked failed-broadcast recovery evidence',
    );
  });

  it('blocks reorged-burn recovery claims without linked reorg recovery evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| reorg recovery claim | artifact://release/reorg-recovery-claim.log | reorged burn and stale singleton recovery remain pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: reorg recovery claim: reorged burn or stale singleton wording requires linked reorg/stale-singleton recovery evidence',
    );
  });

  it('blocks linked reorg recovery evidence without recovery-observe JSON validation', () => {
    const reorgRecoveryEvidenceLinked = evidenceRows.replace(
      '| Reorged burn and stale singleton recovery drill evidence | pending |  | blocks public release |',
      '| Reorged burn and stale singleton recovery drill evidence | linked | artifact://release/reorg-recovery-evidence.log | reorged burn and stale singleton recovery evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: reorgRecoveryEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Reorged burn and stale singleton recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with reorged-burn-stale-singleton observation JSON',
    );
  });

  it('blocks reorged-burn recovery claims when linked evidence lacks recovery-observe JSON validation', () => {
    const reorgRecoveryEvidenceLinked = evidenceRows.replace(
      '| Reorged burn and stale singleton recovery drill evidence | pending |  | blocks public release |',
      '| Reorged burn and stale singleton recovery drill evidence | linked | artifact://release/reorg-recovery-evidence.log | reorged burn and stale singleton recovery evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: reorgRecoveryEvidenceLinked,
      claims: '| reorg recovery claim | artifact://release/reorg-recovery-claim.log | reorged burn and stale singleton recovery remain bounded by evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: reorg recovery claim: reorged burn or stale singleton wording requires linked reorg/stale-singleton recovery evidence with validated recovery-observe JSON',
    );
  });

  it('allows reorged-burn recovery claims when reorg recovery-observe evidence is validated', () => {
    const reorgRecoveryEvidenceLinked = evidenceRows.replace(
      '| Reorged burn and stale singleton recovery drill evidence | pending |  | blocks public release |',
      linkedReorgRecoveryEvidenceRow(),
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: reorgRecoveryEvidenceLinked,
      claims: '| reorg recovery claim | artifact://release/reorg-recovery-claim.log | reorged burn and stale singleton recovery remain bounded by evidence |',
    }));

    expect(result.status).toBe('PASS');
    expect(result.errors).not.toContain(
      'Required Evidence: Reorged burn and stale singleton recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with reorged-burn-stale-singleton observation JSON',
    );
    expect(result.errors).not.toContain(
      'Allowed Claims: reorg recovery claim: reorged burn or stale singleton wording requires linked reorg/stale-singleton recovery evidence',
    );
  });

  it('blocks clean-checkout claims without linked clean-checkout evidence', () => {
    const cleanCheckoutEvidencePending = evidenceRows.replace(
      '| Clean checkout CI | linked | artifact://release/ci.log npm run ci:validate command output evidence exit code 0 | required for public release |',
      '| Clean checkout CI | pending |  | blocks public release |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: cleanCheckoutEvidencePending,
      claims: '| clean checkout claim | artifact://release/clean-checkout-claim.log | clean checkout CI green on final branch remains pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: clean checkout claim: clean checkout, CI, final branch, or workflow wording requires linked clean-checkout evidence',
    );
  });

  it('allows clean-checkout claims when clean-checkout evidence is linked', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| clean checkout claim | artifact://release/clean-checkout-claim.log | clean checkout CI green on final branch remains bounded by evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: clean checkout claim: clean checkout, CI, final branch, or workflow wording requires linked clean-checkout evidence',
    );
  });

  it('blocks local devnet lifecycle claims without linked local devnet lifecycle evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| local devnet lifecycle claim | artifact://release/local-devnet-lifecycle-claim.log | local devnet lifecycle remains pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: local devnet lifecycle claim: local devnet lifecycle wording requires linked local devnet lifecycle evidence',
    );
  });

  it('allows local devnet lifecycle claims when local devnet lifecycle evidence is linked', () => {
    const localDevnetEvidenceLinked = evidenceRows.replace(
      '| Local devnet lifecycle rehearsal | blocker | artifact://release/devnet-blocker.md | blocks public release |',
      '| Local devnet lifecycle rehearsal | linked | artifact://release/local-devnet-lifecycle-evidence.log | local devnet lifecycle evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: localDevnetEvidenceLinked,
      claims: '| local devnet lifecycle claim | artifact://release/local-devnet-lifecycle-claim.log | local devnet lifecycle remains bounded by evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: local devnet lifecycle claim: local devnet lifecycle wording requires linked local devnet lifecycle evidence',
    );
  });

  it('blocks testnet lifecycle claims without validated completed live rehearsal evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| testnet lifecycle claim | artifact://release/testnet-lifecycle-claim.log | testnet lifecycle remains pending evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet lifecycle claim: testnet lifecycle wording requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects generic linked artifacts for testnet lifecycle claims', () => {
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      '| Testnet lifecycle rehearsal | linked | artifact://release/testnet-lifecycle-evidence.log | testnet lifecycle evidence linked; Ergo node network testnet |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
      claims: '| testnet lifecycle claim | artifact://release/testnet-lifecycle-claim.log | testnet lifecycle remains bounded by evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet lifecycle claim: testnet lifecycle wording requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('allows testnet lifecycle claims when completed live rehearsal evidence is validated', () => {
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | testnet lifecycle evidence linked; Ergo node network testnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
      claims: '| testnet lifecycle claim | artifact://release/testnet-lifecycle-claim.log | testnet lifecycle remains bounded by evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: testnet lifecycle claim: testnet lifecycle wording requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects linked testnet lifecycle evidence when rehearsal validation PASS carries failed finality facts', () => {
    const contradictoryValidationEvidence = completedTestnetLifecycleEvidenceLink.replace(
      'confirmation policy met PASS',
      'confirmation policy met FAIL observed confirmation count below required confirmation count previous run confirmation policy met PASS',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${contradictoryValidationEvidence} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects linked testnet lifecycle evidence when finality PASS keeps a PASS/CANDIDATE placeholder', () => {
    const placeholderFinalityEvidence = completedTestnetLifecycleEvidenceLink.replace(
      'confirmation policy met PASS',
      'confirmation policy met PASS/CANDIDATE',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${placeholderFinalityEvidence} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects linked testnet lifecycle evidence when live-preflight PASS carries failed readiness facts', () => {
    const contradictoryLivePreflightEvidence = completedTestnetLifecycleEvidenceLink.replace(
      'Broadcast policy PASS Live settlement signing PASS',
      'Broadcast policy FAIL stale shell state before approval Broadcast policy PASS Live settlement signing PASS',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${contradictoryLivePreflightEvidence} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:external-fee-live-preflight PASS output with structured JSON target binding, the same Expected transaction ID, and an activated external-fee settlement profile',
    );
  });

  it('rejects a legacy V1 live-preflight PASS transcript as Gate 3 evidence', () => {
    const legacyLivePreflightEvidence = completedTestnetLifecycleEvidenceLink.replace(
      'npm run rehearsal:external-fee-live-preflight',
      'npm run rehearsal:live-preflight',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${legacyLivePreflightEvidence} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({ evidence: testnetEvidenceLinked }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:external-fee-live-preflight PASS output with structured JSON target binding, the same Expected transaction ID, and an activated external-fee settlement profile',
    );
  });

  it('requires linked testnet lifecycle evidence to include validated completed live rehearsal evidence', () => {
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      '| Testnet lifecycle rehearsal | linked | artifact://release/testnet-lifecycle-evidence.log | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('requires linked testnet lifecycle evidence to include assembly report JSON evidence', () => {
    const evidenceWithoutAssemblyReport = completedTestnetLifecycleEvidenceLink.replace(
      `; ${testnetLifecycleAssemblyReportEvidence}`,
      '',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutAssemblyReport} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:assemble PASS output with structured assembly report JSON evidence',
    );
  });

  it('requires linked testnet lifecycle evidence to include live-preflight structured JSON evidence', () => {
    const evidenceWithoutStructuredJsonLivePreflight = completedTestnetLifecycleEvidenceLink
      .replace('--json-out artifact://release/external-fee-live-preflight.json ', '')
      .replace(
        'external-fee live-preflight JSON report completed structured evidence artifact://release/external-fee-live-preflight.json ',
        '',
      );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutStructuredJsonLivePreflight} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:external-fee-live-preflight PASS output with structured JSON target binding, the same Expected transaction ID, and an activated external-fee settlement profile',
    );
  });

  it('requires linked testnet lifecycle evidence to include post-submit observe output-shape binding', () => {
    const evidenceWithoutPostSubmitObserve = completedTestnetLifecycleEvidenceLink.replace(
      `; ${testnetLifecyclePostSubmitObserveEvidence}`,
      '',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutPostSubmitObserve} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:post-submit:observe PASS output with structured JSON output-shape binding',
    );
  });

  it('requires linked testnet lifecycle evidence to include post-submit observe structured JSON evidence', () => {
    const evidenceWithoutStructuredJsonPostSubmitObserve = completedTestnetLifecycleEvidenceLink
      .replace('--json-out artifact://release/post-submit-observe.json ', '')
      .replace(
        'post-submit observe JSON report completed structured evidence artifact://release/post-submit-observe.json ',
        '',
      );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutStructuredJsonPostSubmitObserve} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:post-submit:observe PASS output with structured JSON output-shape binding',
    );
  });

  it('requires linked testnet lifecycle evidence to include fresh-checkpoint structured JSON provenance', () => {
    const evidenceWithoutFreshCheckpoint = completedTestnetLifecycleEvidenceLink.replace(
      `; ${testnetLifecycleFreshCheckpointEvidence}`,
      '',
    );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutFreshCheckpoint} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
    );
  });

  it('requires linked testnet lifecycle fresh-checkpoint evidence to expose sourceBindings provenance', () => {
    const evidenceWithoutSourceBindings = completedTestnetLifecycleEvidenceLink
      .replace(
        'sourceBindings.heightEvidence mode live-read-only-sources readOnlyErgoNodeClient true ' +
          'readOnlySidechainRpcClient true nodeAuthHeader not-used operations /info,EVM getBlockNumber broadcastEnabled false ',
        '',
      )
      .replace(
        'sourceBindings.singletonCheckpoint mode live-read-only-node readOnlyNodeClient true nodeAuthHeader not-used ' +
          'operations /info,singleton boxes,mempool/unconfirmed lookup,confirmed transaction lookup ',
        '',
      )
      .replace(
        'sourceBindings.anchorObservations mode live-read-only-node readOnlyNodeClient true nodeAuthHeader not-used ' +
          'operations /info,Ergo extension fields,0x0401 bridgeEventRoot matching ',
        '',
      );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutSourceBindings} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
    );
  });

  it('requires linked testnet lifecycle fresh-checkpoint evidence to expose read-only source binding details', () => {
    const weakSourceBindings = completedTestnetLifecycleEvidenceLink
      .replace(
        'sourceBindings.heightEvidence mode live-read-only-sources readOnlyErgoNodeClient true ' +
          'readOnlySidechainRpcClient true nodeAuthHeader not-used operations /info,EVM getBlockNumber broadcastEnabled false ',
        'sourceBindings.heightEvidence provenance ',
      )
      .replace(
        'sourceBindings.singletonCheckpoint mode live-read-only-node readOnlyNodeClient true nodeAuthHeader not-used ' +
          'operations /info,singleton boxes,mempool/unconfirmed lookup,confirmed transaction lookup ',
        'sourceBindings.singletonCheckpoint provenance ',
      )
      .replace(
        'sourceBindings.anchorObservations mode live-read-only-node readOnlyNodeClient true nodeAuthHeader not-used ' +
          'operations /info,Ergo extension fields,0x0401 bridgeEventRoot matching ',
        'sourceBindings.anchorObservations provenance ',
      );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${weakSourceBindings} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
    );
  });

  it('requires linked testnet lifecycle fresh-checkpoint evidence to bind freshness and non-broadcast boundary facts', () => {
    const weakFreshCheckpointFacts = completedTestnetLifecycleEvidenceLink
      .replace(`Fresh checkpoint Expected transaction ID ${TESTNET_LIFECYCLE_SUBMITTED_TX_ID} `, '')
      .replace(`Fresh checkpoint deployed-state hash ${TESTNET_LIFECYCLE_DEPLOYED_STATE_HASH} `, '')
      .replace('Fresh checkpoint singleton freshness fresh ageSeconds 60 maxAgeSeconds 900 ', '')
      .replace(
        'Fresh checkpoint live anchor observations prove /info-bound observedAt nodeHeight and 0x0401 bridgeEventRootHex matching ',
        '',
      )
      .replace(
        'Fresh checkpoint boundary broadcast false live submit false confirmation false reconciliation false ' +
          'Gate 3 closure false claim escalation false',
        '',
      );
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${weakFreshCheckpointFacts} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
    );
  });

  it('accepts live-rehearsals directory targets as validated completed testnet lifecycle evidence', () => {
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${pluralDirectoryTestnetLifecycleEvidenceLink} | testnet lifecycle evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
      claims: '| testnet lifecycle claim | artifact://release/testnet-lifecycle-claim.log | testnet lifecycle remains bounded by evidence |',
    }));

    expect(result.errors).not.toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
    expect(result.errors).not.toContain(
      'Allowed Claims: testnet lifecycle claim: testnet lifecycle wording requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('blocks generic lifecycle claims without linked lifecycle evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| lifecycle claim | artifact://release/lifecycle-claim.log | peg-in peg-out confirmation reconciliation remains pending lifecycle evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: lifecycle claim: peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation wording requires linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('blocks end-to-end and round-trip lifecycle claims without linked lifecycle evidence', () => {
    const result = validateReleaseNotes(releaseNotes({
      claims: '| end-to-end lifecycle claim | artifact://release/end-to-end-lifecycle-claim.log | end-to-end round-trip full lifecycle verified pending rehearsal evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: end-to-end lifecycle claim: peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation wording requires linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('blocks generic lifecycle claims when only local devnet lifecycle evidence is linked', () => {
    const localDevnetEvidenceLinked = evidenceRows.replace(
      '| Local devnet lifecycle rehearsal | blocker | artifact://release/devnet-blocker.md | blocks public release |',
      '| Local devnet lifecycle rehearsal | linked | artifact://release/local-devnet-lifecycle-evidence.log | local devnet lifecycle evidence linked |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: localDevnetEvidenceLinked,
      claims: '| lifecycle claim | artifact://release/lifecycle-claim.log | peg-in peg-out confirmation reconciliation remains bounded by lifecycle evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: lifecycle claim: generic lifecycle wording must be explicitly scoped to local devnet or testnet unless local devnet lifecycle evidence is linked and completed live testnet lifecycle evidence is validated',
    );
  });

  it('blocks generic lifecycle claims when only generic testnet lifecycle evidence is linked', () => {
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      '| Testnet lifecycle rehearsal | linked | artifact://release/testnet-lifecycle-evidence.log | testnet lifecycle evidence linked; Ergo node network testnet |',
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
      claims: '| lifecycle claim | artifact://release/lifecycle-claim.log | peg-in peg-out confirmation reconciliation remains bounded by lifecycle evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: lifecycle claim: peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation wording requires linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('blocks generic lifecycle claims when only completed live testnet lifecycle evidence is validated', () => {
    const testnetEvidenceLinked = evidenceRows.replace(
      '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | testnet lifecycle evidence linked; Ergo node network testnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      evidence: testnetEvidenceLinked,
      claims: '| lifecycle claim | artifact://release/lifecycle-claim.log | peg-in peg-out confirmation reconciliation remains bounded by lifecycle evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: lifecycle claim: generic lifecycle wording must be explicitly scoped to local devnet or testnet unless local devnet lifecycle evidence is linked and completed live testnet lifecycle evidence is validated',
    );
  });

  it('allows generic lifecycle claims when local devnet evidence is linked and completed live testnet evidence is validated', () => {
    const lifecycleEvidenceLinked = evidenceRows
      .replace(
        '| Local devnet lifecycle rehearsal | blocker | artifact://release/devnet-blocker.md | blocks public release |',
        '| Local devnet lifecycle rehearsal | linked | artifact://release/local-devnet-lifecycle-evidence.log | local devnet lifecycle evidence linked |',
      )
      .replace(
        '| Testnet lifecycle rehearsal | blocker | artifact://release/testnet-blocker.md | blocks public release |',
        `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | testnet lifecycle evidence linked; Ergo node network testnet |`,
      );
    const result = validateReleaseNotes(releaseNotes({
      evidence: lifecycleEvidenceLinked,
      claims: '| lifecycle claim | artifact://release/lifecycle-claim.log | peg-in peg-out confirmation reconciliation remains bounded by lifecycle evidence |',
    }));

    expect(result.errors).not.toContain(
      'Allowed Claims: lifecycle claim: generic lifecycle wording must be explicitly scoped to local devnet or testnet unless local devnet lifecycle evidence is linked and completed live testnet lifecycle evidence is validated',
    );
  });

  it('requires production candidates to link every evidence row and resolve blockers', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: SQLite/AVL backup-restore evidence: production deployment candidate requires linked evidence',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: production deployment candidate requires Checked status',
    );
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: production deployment candidate blockers cannot be scoped out',
    );
  });

  it('requires production candidates to keep required blocker rows visible', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      blockers: '',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Trustless burn verification path: missing required blocker row',
    );
  });

  it('rejects duplicate publication blocker rows for the same checklist blocker', () => {
    const duplicate = REQUIRED_PENDING_EVIDENCE_ROWS.find(
      row => row.item === 'Fresh local devnet lifecycle run',
    );
    if (!duplicate) throw new Error('test fixture missing required blocker row');

    const duplicatedRow = [
      duplicate.gate,
      duplicate.item,
      'Checked',
      `artifact://release/blockers/${slug(duplicate.item)}.log`,
      'no',
    ];

    const result = validateReleaseNotes(releaseNotes({
      blockers: `${blockerRows}\n| ${duplicatedRow.join(' | ')} |`,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: duplicate blocker row',
    );
  });

  it('requires checked publication blockers to have linked required evidence rows', () => {
    const result = validateReleaseNotes(releaseNotes({
      blockers: blockerRows.replace(
        requiredBlockerRow('Fresh local devnet lifecycle run'),
        checkedRequiredBlockerRow('Fresh local devnet lifecycle run'),
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Fresh local devnet lifecycle run: Checked blocker requires linked Required Evidence: Local devnet lifecycle rehearsal',
    );
  });

  it('requires canonical release-note table headers', () => {
    const result = validateReleaseNotes(
      releaseNotes()
        .replace(
          '| Evidence class | Status | Link or artifact | Publication effect |',
          '| Evidence class | Status | Link or artifact |',
        )
        .replace('| Role | Name | Decision | Date | Notes |', '| Role | Name | Decision | Date |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: table header must be Evidence class | Status | Link or artifact | Publication effect',
    );
    expect(result.errors).toContain('Sign-Off: table header must be Role | Name | Decision | Date | Notes');
  });

  it('passes current testnet production evidence without retired V1 preflight or prep-bundle authority', () => {
    expect(completedTestnetLifecycleEvidenceLink).not.toContain('npm run rehearsal:preflight');
    expect(completedTestnetLifecycleEvidenceLink).not.toContain('npm run rehearsal:prep-bundle');

    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/allowed-claim-evidence.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('rejects testnet lifecycle evidence whose positive command segment carries compatibility-normalized bare blockers', () => {
    const blockedValidationEvidenceLink = completedTestnetLifecycleEvidenceLink.replace(
      'npm run rehearsal:validate command output: artifact://release/live-rehearsal-validation.log PASS exit code 0',
      'npm run rehearsal:validate command output: artifact://release/live-rehearsal-validation.log PASS exit code 0 \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24',
    );
    const blockedValidationEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${blockedValidationEvidenceLink} | ${testnetLifecycleProductionDecisionBoundary} |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: blockedValidationEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/allowed-claim-evidence.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects generic testnet lifecycle artifacts for testnet production claims', () => {
    const genericTestnetLifecycleEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      '| Testnet lifecycle rehearsal | linked | artifact://release/testnet-lifecycle-rehearsal.log | production candidate evidence linked; Ergo node network testnet |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: genericTestnetLifecycleEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects testnet production claims without fresh-checkpoint structured JSON provenance', () => {
    const evidenceWithoutFreshCheckpoint = completedTestnetLifecycleEvidenceLink.replace(
      `; ${testnetLifecycleFreshCheckpointEvidence}`,
      '',
    );
    const missingFreshCheckpointEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutFreshCheckpoint} | production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: missingFreshCheckpointEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
    );
  });

  it('rejects testnet production claims without assembly report JSON evidence', () => {
    const evidenceWithoutAssemblyReport = completedTestnetLifecycleEvidenceLink.replace(
      `; ${testnetLifecycleAssemblyReportEvidence}`,
      '',
    );
    const missingAssemblyReportEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${evidenceWithoutAssemblyReport} | production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: missingAssemblyReportEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:assemble PASS output with structured assembly report JSON evidence',
    );
  });

  it('rejects testnet lifecycle evidence when rehearsal validation output is not a distinct artifact', () => {
    for (const evidenceLink of [
      targetlessValidationTestnetLifecycleEvidenceLink,
      sameTargetValidationTestnetLifecycleEvidenceLink,
    ]) {
      const unboundValidationEvidence = linkedProductionEvidenceRows.replace(
        linkedProductionTestnetLifecycleEvidenceRow,
        `| Testnet lifecycle rehearsal | linked | ${evidenceLink} | production candidate evidence linked; Ergo node network testnet |`,
      );
      const result = validateReleaseNotes(releaseNotes({
        releaseLevel: 'production deployment candidate',
        scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
        evidence: unboundValidationEvidence,
        blockers: checkedProductionBlockerRows,
        claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
      }));

      expect(result.status, evidenceLink).toBe('BLOCKED');
      expect(result.errors, evidenceLink).toContain(
        'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
      );
    }
  });

  it('rejects testnet lifecycle evidence when rehearsal validation confirmations do not meet the threshold', () => {
    const insufficientConfirmationEvidenceLink = completedTestnetLifecycleEvidenceLink.replace(
      'confirmationsRequired=1 confirmationsObserved=1',
      'confirmationsRequired=2 confirmationsObserved=1',
    );
    const insufficientConfirmationEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${insufficientConfirmationEvidenceLink} | production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: insufficientConfirmationEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects testnet lifecycle evidence when rehearsal validation confirmations are unsafe integers', () => {
    const unsafeConfirmationEvidenceLink = completedTestnetLifecycleEvidenceLink.replace(
      'confirmationsRequired=1 confirmationsObserved=1',
      'confirmationsRequired=9007199254740993 confirmationsObserved=9007199254740993',
    );
    const unsafeConfirmationEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${unsafeConfirmationEvidenceLink} | production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: unsafeConfirmationEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  });

  it('rejects testnet lifecycle evidence when live-preflight target does not match the validated completed rehearsal target', () => {
    const mixedTargetEvidenceLink = completedTestnetLifecycleEvidenceLink.replace(
      'external-fee live-preflight target artifact://release/completed-live-rehearsal-testnet.md',
      'external-fee live-preflight target artifact://release/other-completed-live-rehearsal-testnet.md',
    );
    const mixedTargetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${mixedTargetEvidenceLink} | production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: mixedTargetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:external-fee-live-preflight PASS output with structured JSON target binding, the same Expected transaction ID, and an activated external-fee settlement profile',
    );
  });

  it('requires the complete canonical evidence set for testnet production claims', () => {
    const incompleteEvidence = linkedProductionEvidenceRows
      .replace(
        `| Operator readiness evidence | linked | artifact://release/${slug('Operator readiness evidence')}.log command-specific operator command output evidence exit code 0 | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Operator-ready claim allowed = yes; Critical incidents open = 0; operator readiness evidence linked |`,
        '| Operator readiness evidence | pending | | blocks testnet production-candidate claims |',
      )
      .replace(
        `| Trustless burn verification evidence | linked | artifact://release/${slug('Trustless burn verification evidence')}.log npm run trustless:validate command output evidence exit code 0 | Trustless burn verification implemented = yes; Release supported = production deployment candidate; Transitional trusted burn path disabled = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Critical/high findings open = 0; trustless burn verification evidence linked |`,
        '| Trustless burn verification evidence | pending | | blocks testnet production-candidate claims |',
      );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: incompleteEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: testnet production-candidate claims require linked evidence: Operator readiness evidence, Trustless burn verification evidence',
    );
  });

  it('requires linked testnet lifecycle release evidence to cite Ergo node network testnet', () => {
    const shallowTestnetLifecycleEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: shallowTestnetLifecycleEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet',
    );
  });

  it('requires linked testnet lifecycle release evidence to cite Sidechain network scope', () => {
    const missingSidechainNetworkEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: missingSidechainNetworkEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Sidechain network patched-devnet, testnet, or explicit non-mainnet sidechain network',
    );
  });

  it('rejects prebroadcast artifacts as linked testnet lifecycle release evidence', () => {
    const prebroadcastTestnetLifecycleEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      '| Testnet lifecycle rehearsal | linked | artifact://prebroadcast/testnet-prebroadcast-evidence.md | production candidate evidence linked; Ergo node network testnet |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: prebroadcastTestnetLifecycleEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must be completed live testnet lifecycle evidence, not prebroadcast-only evidence',
    );
  });

  it('rejects pre_broadcast validation targets as linked testnet lifecycle release evidence', () => {
    const prebroadcastValidationTarget =
      'artifact://release/completed-live-rehearsal-testnet.md; ' +
      'npm run rehearsal:validate command output: artifact://release/live-rehearsal-validation.log PASS exit code 0 ' +
      'validated target artifact://testnet_prebroadcast/completed-live-rehearsal-testnet.md';
    const prebroadcastTestnetLifecycleEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${prebroadcastValidationTarget} | production candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: prebroadcastTestnetLifecycleEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must be completed live testnet lifecycle evidence, not prebroadcast-only evidence',
    );
  });

  it('rejects mixed-network linked testnet lifecycle release evidence', () => {
    const mixedNetworkTestnetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet mirror of main chain |`,
    );
    const compatibilityMixedNetworkTestnetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet mirror of \uFF4D\uFF41\uFF49\uFF4E \uFF43\uFF48\uFF41\uFF49\uFF4E |`,
    );
    const notOnTheTestnetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet not on the testnet |`,
    );
    const withoutTheTestnetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet without the testnet |`,
    );
    const notUsingTestnetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet not using testnet |`,
    );
    const notConnectedTestnetEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | production candidate evidence linked; Ergo node network testnet not connected to testnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: mixedNetworkTestnetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const compatibilityMixedNetwork = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: compatibilityMixedNetworkTestnetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const notOnTheTestnet = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: notOnTheTestnetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const withoutTheTestnet = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: withoutTheTestnetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const notUsingTestnet = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: notUsingTestnetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const notConnectedTestnet = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: notConnectedTestnetEvidence,
      blockers: checkedProductionBlockerRows,
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
    );
    expect(compatibilityMixedNetwork.status).toBe('BLOCKED');
    expect(compatibilityMixedNetwork.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
    );
    expect(notOnTheTestnet.status).toBe('BLOCKED');
    expect(notOnTheTestnet.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
    );
    expect(withoutTheTestnet.status).toBe('BLOCKED');
    expect(withoutTheTestnet.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
    );
    expect(notUsingTestnet.status).toBe('BLOCKED');
    expect(notUsingTestnet.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
    );
    expect(notConnectedTestnet.status).toBe('BLOCKED');
    expect(notConnectedTestnet.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
    );
  });

  it('requires scope-level testnet production candidate claims to have upstream signer conformance evidence', () => {
    const failClosedSignerEvidence = linkedProductionEvidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-conformance-or-fail-closed-release-decision-evidence.log | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; JVM/node conformance evidence missing; fail-closed signer guard remains active |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      scope: 'This release is a testnet production-candidate with all production gates linked to evidence.',
      evidence: failClosedSignerEvidence,
      blockers: checkedProductionBlockerRows,
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope Statement: testnet production-candidate claims require upstream signer conformance evidence',
    );
  });

  it('requires release-name testnet production candidate claims to have upstream signer conformance evidence', () => {
    const failClosedSignerEvidence = linkedProductionEvidenceRows.replace(
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-conformance-or-fail-closed-release-decision-evidence.log | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked |',
      '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; JVM/node conformance evidence missing; fail-closed signer guard remains active |',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      scope: 'This release is a testnet production-candidate evidence package with all production gates linked.',
      evidence: failClosedSignerEvidence,
      blockers: checkedProductionBlockerRows,
    }).replace(
      '| Release name | institutional reference rc |',
      '| Release name | testnet production-candidate release |',
    ));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Release Classification: Release name: testnet production-candidate claims require upstream signer conformance evidence',
    );
  });

  it('requires non-production scope wording', () => {
    const result = validateReleaseNotes(releaseNotes({
      scope: 'This release is ready.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope Statement: non-production release notes must include the required non-production wording',
    );
  });

  it('blocks absolute security wording in the scope statement', () => {
    const result = validateReleaseNotes(releaseNotes({
      scope: '> This release is not a production-ready bridge claim. User funds are safe and the bridge is lossless.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope Statement: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks mainnet production-ready wording in production candidate scope statements', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a mainnet production-ready bridge with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope Statement: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks production deployment candidate wording as a public release name or scope claim', () => {
    const scope = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production deployment candidate bridge with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const releaseName = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }).replace(
      '| Release name | institutional reference rc |',
      '| Release name | testnet production deployment candidate release |',
    ));
    const hyphenatedScope = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-deployment-candidate bridge with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(scope.status).toBe('BLOCKED');
    expect(scope.errors).toContain(
      'Scope Statement: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
    expect(releaseName.status).toBe('BLOCKED');
    expect(releaseName.errors).toContain(
      'Release Classification: Release name: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
    expect(hyphenatedScope.status).toBe('BLOCKED');
    expect(hyphenatedScope.errors).toContain(
      'Scope Statement: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks production deployment candidate wording in allowed claims', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production deployment candidate | artifact://release/testnet-production-deployment-candidate.log testnet production deployment candidate claim | testnet production deployment candidate bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production deployment candidate: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('requires controlled testnet production claims to use controlled public wording', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | exchange deployment evidence package |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Allowed Claims: testnet production-grade: allowed wording must use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks main network and main chain production-ready wording in release classification and scope', () => {
    const scope = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a main network production-ready bridge with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const releaseName = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }).replace(
      '| Release name | institutional reference rc |',
      '| Release name | main chain production-ready release |',
    ));

    expect(scope.status).toBe('BLOCKED');
    expect(scope.errors).toContain(
      'Scope Statement: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
    expect(releaseName.status).toBe('BLOCKED');
    expect(releaseName.errors).toContain(
      'Release Classification: Release name: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks mainnet go-live and general availability wording in release classification, allowed claims, and scope', () => {
    const scope = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> Mainnet go-live bridge with every gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));
    const releaseName = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }).replace(
      '| Release name | institutional reference rc |',
      '| Release name | mainnet general availability bridge |',
    ));
    const allowedClaim = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| mainnet go-live | artifact://release/mainnet-go-live.log | mainnet go-live bridge |',
    }));

    expect(scope.status).toBe('BLOCKED');
    expect(scope.errors).toContain(
      'Scope Statement: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
    expect(releaseName.status).toBe('BLOCKED');
    expect(releaseName.errors).toContain(
      'Release Classification: Release name: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
    expect(allowedClaim.status).toBe('BLOCKED');
    expect(allowedClaim.errors).toContain(
      'Allowed Claims: mainnet go-live: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks mainnet production-candidate wording in production candidate trust assumptions', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      assumptions: assumptionRows.replace(
        '| Trusted-oracle burn interpretation | documented | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
        '| Trusted-oracle burn interpretation | documented for mainnet production-candidate launch | artifact://release/trusted-oracle-burn-interpretation.md | limits release claims |',
      ),
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Trust Assumptions: Trusted-oracle burn interpretation: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks mainnet go-live wording in required evidence publication effects', () => {
    const mainnetRequiredEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | mainnet go-live evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: mainnetRequiredEvidence,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks unqualified production-ready wording in required evidence publication effects', () => {
    const productionReadyRequiredEvidence = linkedProductionEvidenceRows.replace(
      linkedProductionTestnetLifecycleEvidenceRow,
      `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | ready-for-production evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: productionReadyRequiredEvidence,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks testnet production-candidate wording in required evidence publication effects without upstream signer conformance evidence', () => {
    const failClosedSignerEvidence = linkedProductionEvidenceRows
      .replace(
        '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/signer-dependency-conformance-or-fail-closed-release-decision-evidence.log | Release supported = production deployment candidate; Production-ready claim allowed = no; Testnet production-candidate claim allowed = yes; Upstream signer blocker resolved = yes; JVM/node conformance evidence linked |',
        '| Signer dependency conformance or fail-closed release decision evidence | linked | artifact://release/fail-closed-signer.log | Release supported = institutional reference; Production-ready claim allowed = no; Upstream signer blocker resolved = no; JVM/node conformance evidence missing; fail-closed signer guard remains active |',
      )
      .replace(
        linkedProductionTestnetLifecycleEvidenceRow,
        `| Testnet lifecycle rehearsal | linked | ${completedTestnetLifecycleEvidenceLink} | testnet production-candidate evidence linked; Ergo node network testnet; Sidechain network patched-devnet |`,
      );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: failClosedSignerEvidence,
      blockers: checkedProductionBlockerRows,
      scope: '> Release evidence package with every release gate linked.',
      claims: '| local guard evidence | artifact://release/local-guards.log local guard evidence claim | guarded locally, pending live evidence |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Required Evidence: Testnet lifecycle rehearsal: testnet production-candidate claims require upstream signer conformance evidence',
    );
  });

  it('blocks unqualified go-live wording in production candidate publication blockers', () => {
    const goLiveBlockers = checkedProductionBlockerRows.replace(
      '| Gate 1 | Green CI on the final branch | Checked | artifact://release/green-ci-on-the-final-branch.log',
      '| Gate 1 | Green CI on the final branch | Checked | artifact://release/green-ci-on-the-final-branch.log go-live runbook ready',
    );
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: goLiveBlockers,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Publication Blockers: Green CI on the final branch: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks mainnet go-live wording in production candidate operator impact rows', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      operatorImpact: operatorRows.replace(
        '| Deployment state | verify deployed singleton state with runbook | stop on deployment state mismatch |',
        '| Deployment state | verify deployment state with runbook before mainnet go-live | stop on deployment state mismatch |',
      ),
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks mainnet general availability wording in production candidate sign-off notes', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved claims and evidence controls for mainnet general availability |',
      ),
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    );
  });

  it('blocks unqualified go-live wording in production candidate operator impact rows', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release is a testnet production-candidate evidence package with every release gate linked.',
      operatorImpact: operatorRows.replace(
        '| Broadcast enablement | follow broadcast enable/disable runbook | disable broadcast on mismatch |',
        '| Broadcast enablement | follow broadcast enable/disable runbook for go-live | disable broadcast on mismatch |',
      ),
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Broadcast enablement: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks unqualified production-readiness wording in production candidate scope statements', () => {
    const result = validateReleaseNotes(releaseNotes({
      releaseLevel: 'production deployment candidate',
      decision: 'proposed',
      evidence: linkedProductionEvidenceRows,
      blockers: checkedProductionBlockerRows,
      scope: '> This release demonstrates production readiness with every release gate linked.',
      claims: '| testnet production-grade | artifact://release/testnet-production-grade.log testnet production grade claim | production-grade testnet bridge |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope Statement: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    );
  });

  it('blocks production-oriented wording in non-production scope statements', () => {
    const result = validateReleaseNotes(releaseNotes({
      scope: '> This release is not a production-ready bridge claim. It is exchange-grade and ready-for-production.',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Scope Statement: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('requires release decision dates to use ISO calendar format', () => {
    const result = validateReleaseNotes(
      releaseNotes().replace('| Decision date | 2026-05-14 |', '| Decision date | May 14 2026 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Release Classification: Decision date must use YYYY-MM-DD');
  });

  it('requires release Git commits to use commit SHA format', () => {
    const result = validateReleaseNotes(
      releaseNotes().replace('| Git commit | abc1234 |', '| Git commit | main |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Release Classification: Git commit must be a 7-40 character Git commit SHA');
  });

  it('rejects impossible release decision calendar dates', () => {
    const result = validateReleaseNotes(
      releaseNotes().replace('| Decision date | 2026-05-14 |', '| Decision date | 2026-02-31 |'),
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Release Classification: Decision date must use YYYY-MM-DD');
  });

  it('requires operator impact and sign-off rows', () => {
    const result = validateReleaseNotes(releaseNotes({
      operatorImpact: '| Deployment state | follow runbook | |',
      signoffs: '| Maintainer | reviewer-a | approved | | |',
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Operator Impact: Broadcast enablement: missing required row');
    expect(result.errors).toContain('Operator Impact: Deployment state: stop condition is required');
    expect(result.errors).toContain('Sign-Off: Security reviewer: missing required row');
    expect(result.errors).toContain('Sign-Off: Maintainer: decision must be approve or block');
    expect(result.errors).toContain('Sign-Off: Maintainer: date is required');
  });

  it('requires operator impact rows to stay actionable', () => {
    const result = validateReleaseNotes(releaseNotes({
      operatorImpact: operatorRows.replace(
        '| Deployment state | verify deployed singleton state with runbook | stop on deployment state mismatch |',
        '| Deployment state | reviewed | ok |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: required operator action must reference a runbook, command, verification, monitoring, backup, or incident action',
    );
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: stop condition must include actionable stop, block, fail, disable, pause, incident, mismatch, do-not, or refuse wording',
    );
  });

  it('requires operator impact rows to cite the operator area', () => {
    const result = validateReleaseNotes(releaseNotes({
      operatorImpact: operatorRows.replace(
        '| Monitoring and alerting | monitor status and alert channels | stop on monitoring alert mismatch |',
        '| Monitoring and alerting | follow runbook command | stop on mismatch |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Monitoring and alerting: action or stop condition must mention monitoring, alerting, or status',
    );
  });

  it('blocks absolute security wording in operator impact actions and stop conditions', () => {
    const result = validateReleaseNotes(releaseNotes({
      operatorImpact: operatorRows.replace(
        '| Deployment state | verify deployed singleton state with runbook | stop on deployment state mismatch |',
        '| Deployment state | verify deployed singleton state with runbook | stop on deployment state mismatch; user funds are safe |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks production-oriented wording in non-production operator impact actions', () => {
    const result = validateReleaseNotes(releaseNotes({
      operatorImpact: operatorRows.replace(
        '| Deployment state | verify deployed singleton state with runbook | stop on deployment state mismatch |',
        '| Deployment state | verify deployment state with runbook for exchange-grade mainnet bridge | stop on deployment state mismatch |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Operator Impact: Deployment state: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('requires sign-offs to approve before release notes can pass', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Maintainer | maintainer-a | approve | 2026-05-14 | maintainer approved release decision, scope, blockers, and publication claim control |',
        '| Maintainer | maintainer-a | block | 2026-05-14 | release notes blocker remains blocked |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: decision must be approve before release notes can pass',
    );
  });

  it('requires maintainer sign-off identity to match the release decision owner', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Maintainer | maintainer-a | approve | 2026-05-14 | maintainer approved release decision, scope, blockers, and publication claim control |',
        '| Maintainer | reviewer-a | approve | 2026-05-14 | maintainer approved release decision, scope, blockers, and publication claim control |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Maintainer: name must match Release Classification Decision owner',
    );
  });

  it('requires sign-off dates to use ISO calendar format', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | May 14 2026 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Sign-Off: Security reviewer: date must use YYYY-MM-DD');
  });

  it('requires sign-off dates to be on or after the release decision date', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-13 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: date must not be before Release Classification Decision date',
    );
  });

  it('rejects impossible sign-off calendar dates', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | operator reviewer approved operator impact, runbooks, blockers, and readiness controls |',
        '| Operator reviewer | reviewer-a | approve | 2026-99-99 | operator reviewer approved operator impact, runbooks, blockers, and readiness controls |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Sign-Off: Operator reviewer: date must use YYYY-MM-DD');
  });

  it('blocks absolute security wording in sign-off notes', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved claims and evidence controls; user funds are safe |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: absolute security wording is not allowed in release notes',
    );
  });

  it('blocks production-oriented wording in non-production sign-off notes', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved claims and evidence controls for an exchange-grade bridge |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production wording requires production deployment candidate evidence',
    );
  });

  it('blocks private maintainer context approvals in sign-off notes', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved claims and evidence controls; reviewer grants private maintainer context |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: notes must not admit private maintainer context',
    );
  });

  it('blocks compatibility-normalized private maintainer context approvals in sign-off notes', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved claims and evidence controls; reviewer \uFF47\uFF52\uFF41\uFF4E\uFF54\uFF53 private maintainer context |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: notes must not admit private maintainer context',
    );
  });

  it('blocks certification-family private maintainer context approvals in sign-off notes', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows
        .replace(
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
          '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved claims and evidence controls; reviewer certifies private maintainer context |',
        )
        .replace(
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | operator reviewer approved operator impact, runbooks, blockers, and readiness controls |',
          '| Operator reviewer | reviewer-a | approve | 2026-05-14 | operator reviewer approved operator impact, runbooks, blockers, and readiness controls; private context accredited |',
        ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: notes must not admit private maintainer context',
    );
    expect(result.errors).toContain(
      'Sign-Off: Operator reviewer: notes must not admit private maintainer context',
    );
  });

  it('requires sign-off notes to state concrete release-note outcomes', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | security reviewer approved trust assumptions, claims, blockers, and evidence controls |',
        '| Security reviewer | reviewer-a | approve | 2026-05-14 | reviewed |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Security reviewer: notes must state a concrete release-note claim-control outcome',
    );
  });

  it('requires sign-off notes to cite role-specific review scope', () => {
    const result = validateReleaseNotes(releaseNotes({
      signoffs: signoffRows.replace(
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | operator reviewer approved operator impact, runbooks, blockers, and readiness controls |',
        '| Operator reviewer | reviewer-a | approve | 2026-05-14 | release notes claim-control evidence approved |',
      ),
    }));

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'Sign-Off: Operator reviewer: notes must identify operator impact, runbook, readiness, or incident review',
    );
  });
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
