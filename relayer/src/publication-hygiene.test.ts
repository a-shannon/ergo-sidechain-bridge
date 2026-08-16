import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { TextDecoder } from 'util';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { validateBackupRestoreEvidence } from './backup-restore-evidence.js';
import { validateBenchmarkEvidence } from './benchmark-evidence.js';
import { validateCleanCheckoutEvidence } from './clean-checkout-evidence.js';
import { validateCommitteeGovernanceEvidence } from './committee-governance-evidence.js';
import { validateDependencyReviewEvidence } from './dependency-review-evidence.js';
import { validateExternalIntegrationEvidence } from './external-integration-evidence.js';
import { validateOperatorReadinessEvidence } from './operator-readiness-evidence.js';
import { validateRehearsalEvidence } from './rehearsal-evidence.js';
import {
  REQUIRED_DISALLOWED_CLAIMS,
  REQUIRED_EVIDENCE_CLASSES,
  REQUIRED_OPERATOR_AREAS,
  REQUIRED_SIGNOFF_ROLES,
  REQUIRED_TRUST_ASSUMPTIONS,
  validateReleaseNotes,
} from './release-notes-evidence.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import {
  evaluateReleaseGate,
  REQUIRED_PENDING_EVIDENCE_ROWS,
} from './release-gate.js';
import { validateSecurityReviewEvidence } from './security-review-evidence.js';
import { validateTechnicalAddendumEvidence } from './technical-addendum-evidence.js';
import { validateTestnetPreBroadcastEvidence } from './testnet-prebroadcast-evidence.js';
import { validateTrustlessBurnEvidence } from './trustless-burn-evidence.js';

const srcRoot = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = join(srcRoot, '..', '..');

type EvidenceTemplateValidator = (markdown: string) => {
  status: string;
  errors: string[];
  message: string;
};

const textExtensions = new Set([
  '.abi',
  '.conf',
  '.es',
  '.ini',
  '.js',
  '.json',
  '.md',
  '.patch',
  '.properties',
  '.ps1',
  '.rs',
  '.sbt',
  '.scala',
  '.sh',
  '.sol',
  '.toml',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);
const skippedRelativePaths = new Set([
  'contracts/deployed_state.json',
]);

function isDotEnvPath(value: string): boolean {
  return value.split('/').some(part => part === '.env' || part.startsWith('.env.'));
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function collectTextFiles(path: string): string[] {
  if (!existsSync(path)) return [];

  const rel = toPosix(relative(bridgeRoot, path));
  if (skippedRelativePaths.has(rel)) return [];

  const stat = statSync(path);
  if (stat.isDirectory()) {
    return readdirSync(path).flatMap(entry => collectTextFiles(join(path, entry)));
  }

  return textExtensions.has(extname(path)) ? [path] : [];
}

function collectMarkdownFiles(path: string): string[] {
  return collectTextFiles(path).filter(file => extname(file) === '.md');
}

function collectTrackedPublishableFiles(): string[] {
  return execFileSync('git', ['-C', bridgeRoot, 'ls-files', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  })
    .split('\0')
    .filter(Boolean)
    .map(toPosix)
    .filter(path => !skippedRelativePaths.has(path))
    // Repository tests must never open dot-env files, including templates.
    .filter(path => !isDotEnvPath(path))
    .map(path => join(bridgeRoot, path))
    .filter(path => existsSync(path) && statSync(path).isFile());
}

function readTrackedUtf8Text(path: string): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
  } catch {
    return null;
  }
}

function matchContexts(text: string, pattern: RegExp, radius = 160): string[] {
  return [...text.matchAll(pattern)].map(match => {
    const index = match.index ?? 0;
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + match[0].length + radius);
    return text.slice(start, end);
  });
}

function extractRunbookSections(markdown: string): string[] {
  const headings = [...markdown.matchAll(/^## Runbook \d+: .+$/gm)];

  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? markdown.length;
    return markdown.slice(start, end);
  });
}

function extractNpmRunScripts(markdown: string): string[] {
  return [...markdown.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)\b/g)].map(match => match[1]);
}

function extractTsxTargets(command: string): string[] {
  return [...command.matchAll(/\btsx(?:\s+watch)?\s+([^\s]+\.ts)\b/g)].map(match => match[1]);
}

function extractMarkdownLinks(markdown: string): string[] {
  return [...markdown.matchAll(/!?\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1].trim());
}

function parseMarkdownTableRows(table: string): string[][] {
  return table
    .split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .filter(line => !/^\|\s*-/.test(line))
    .slice(1)
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim()),
    );
}

function resolveInternalMarkdownLink(sourceFile: string, target: string): string | null {
  const withoutTitle = target.replace(/^<|>$/g, '').split(/\s+/)[0];
  const withoutFragment = withoutTitle.split('#')[0].split('?')[0];

  if (
    withoutFragment === '' ||
    withoutFragment.startsWith('http://') ||
    withoutFragment.startsWith('https://') ||
    withoutFragment.startsWith('mailto:') ||
    withoutFragment.startsWith('#')
  ) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(withoutFragment);
    return decoded.startsWith('/')
      ? join(bridgeRoot, decoded.slice(1))
      : join(dirname(sourceFile), decoded);
  } catch {
    return withoutFragment.startsWith('/')
      ? join(bridgeRoot, withoutFragment.slice(1))
      : join(dirname(sourceFile), withoutFragment);
  }
}

function parseEvidenceMatrixRows(markdown: string): string[][] {
  const tableStart = markdown.indexOf('| Area | Current claim | Evidence | Status | Missing before publication |');
  const tableEnd = markdown.indexOf('## Required Verification Commands');
  const table = markdown.slice(tableStart, tableEnd);

  return parseMarkdownTableRows(table);
}

function parseDependencyRiskRows(markdown: string): string[][] {
  const tableStart = markdown.indexOf(
    '| Dependency | Current source | Bridge role | Main risk | Current guard | Status | Missing before publication |',
  );
  const tableEnd = markdown.indexOf('## Publication Rules');
  const table = markdown.slice(tableStart, tableEnd);

  return parseMarkdownTableRows(table);
}

function parsePendingEvidenceRows(markdown: string): string[][] {
  const tableStart = markdown.indexOf(
    '| Gate | Pending evidence or blocker | Status | Publication effect | Required resolution |',
  );
  const tableEnd = markdown.indexOf('## Release Decision');

  if (tableStart < 0 || tableEnd < 0 || tableEnd <= tableStart) return [];

  return parseMarkdownTableRows(markdown.slice(tableStart, tableEnd));
}

function extractReleaseGateSections(markdown: string): string[] {
  const headings = [...markdown.matchAll(/^## Gate \d+: .+$/gm)];
  const releaseDecision = markdown.indexOf('## Release Decision');

  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end =
      headings[index + 1]?.index ?? (releaseDecision >= 0 ? releaseDecision : markdown.length);
    return markdown.slice(start, end);
  });
}

function extractThreatFindingSections(markdown: string): string[] {
  const start = markdown.indexOf('## Current High-Risk Findings');
  const end = markdown.indexOf('## Attack Chain Registry Update');
  const findings = markdown.slice(start, end);
  const headings = [...findings.matchAll(/^### \d+\. .+$/gm)];

  return headings.map((heading, index) => {
    const sectionStart = heading.index ?? 0;
    const sectionEnd = headings[index + 1]?.index ?? findings.length;
    return findings.slice(sectionStart, sectionEnd);
  });
}

function extractBacktickPaths(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`]+\.(?:md|ts|yml|toml|rs))`/g)].map(match => match[1]);
}

describe('publication hygiene', () => {
  it('does not contain local identity or diagnostic-secret markers in publishable text files', () => {
    const privateCompanyMarker = ['EUR', 'OBC'].join('');
    const privateWorkspaceMarker = ['ALT', 'ALEO'].join('');
    const privateRootMarker = ['ANTI', 'GRAVITY'].join('');
    const mnemonicAssignment = ['MN', 'EMONIC'].join('');
    const privateKeyAssignment = ['PRIVATE', 'KEY'].join('_');
    const testApiKeyMarker = ['test', 'api', 'key'].join('_');
    const mnemonicMaterial = String.raw`(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}`;
    const privateKeyMaterial = String.raw`(?:0x)?[0-9a-f]{64}`;
    const forbiddenPatterns = [
      new RegExp(`C:${'\\\\'}Users${'\\\\'}`, 'i'),
      new RegExp(privateCompanyMarker, 'i'),
      new RegExp(privateWorkspaceMarker, 'i'),
      new RegExp(privateRootMarker, 'i'),
      /secrets\.dlog/i,
      new RegExp(testApiKeyMarker, 'i'),
      new RegExp(
        `\\b(?:WALLET_)?${mnemonicAssignment}\\s*=\\s*["']?${mnemonicMaterial}["']?(?:\\s|$)`,
        'i',
      ),
      new RegExp(
        `\\b(?:WALLET_)?${privateKeyAssignment}\\s*=\\s*["']?${privateKeyMaterial}["']?(?:\\s|$)`,
        'i',
      ),
    ];

    const syntheticMnemonic = Array.from({ length: 12 }, () => 'alpha').join(' ');
    expect(forbiddenPatterns.some(pattern => pattern.test(
      `${['WALLET', mnemonicAssignment].join('_')}=${syntheticMnemonic}`,
    ))).toBe(true);
    expect(forbiddenPatterns.some(pattern => pattern.test(
      `${['WALLET', privateKeyAssignment].join('_')}=${'a'.repeat(64)}`,
    ))).toBe(true);

    const offenders = collectTrackedPublishableFiles()
      .flatMap(file => {
        const text = readTrackedUtf8Text(file);
        if (text === null) return [];
        return forbiddenPatterns
          .filter(pattern => pattern.test(text))
          .map(pattern => `${toPosix(relative(bridgeRoot, file))}: ${pattern.source}`);
      });

    expect(offenders).toEqual([]);
  }, 30_000);

  it('keeps local runtime state, diagnostics, and secret-bearing helper files ignored', () => {
    const gitignore = readFileSync(join(bridgeRoot, '.gitignore'), 'utf8');
    const requiredIgnoreRules = [
      '.env',
      '*.sqlite',
      '*.sqlite-shm',
      '*.sqlite-wal',
      '.runtime-backups/',
      '.devnet-backups/',
      'relayer/.devnet-diagnostics/',
      'relayer/src/scripts/debug-*.ts',
      'relayer/scripts/*.local.ps1',
    ];

    for (const rule of requiredIgnoreRules) {
      expect(gitignore).toContain(rule);
    }
  });

  it('keeps evidence templates fail-closed on blocking sign-offs', () => {
    const reviewerDecisionTemplates = [
      'backup-restore-evidence-template.md',
      'clean-checkout-evidence-template.md',
      'committee-governance-evidence-template.md',
      'dependency-review-evidence-template.md',
      'external-integration-review-template.md',
      'independent-security-review-evidence-template.md',
      'operator-readiness-evidence-template.md',
      'performance-benchmark-evidence-template.md',
      'trustless-burn-verification-evidence-template.md',
    ];

    for (const templateName of reviewerDecisionTemplates) {
      const template = readFileSync(join(bridgeRoot, 'docs', templateName), 'utf8');
      expect(template, templateName).toContain('Every reviewer decision must be `approve` before this evidence can pass.');
      expect(template, templateName).toContain('`block` decision must stay documented until resolved.');
    }

    const releaseNotesTemplate = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    expect(releaseNotesTemplate).toContain('Every sign-off decision must be `approve` before release notes can pass.');

    const rehearsalTemplate = readFileSync(join(bridgeRoot, 'docs', 'live-rehearsal-template.md'), 'utf8');
    expect(rehearsalTemplate).toContain('Reviewer classification must be `pass` before rehearsal evidence can pass.');
    expect(rehearsalTemplate).toContain('`fail` and `inconclusive` classifications must stay documented until resolved.');
  });

  it('documents ISO dates for dated evidence classification templates', () => {
    const datedTemplates = [
      'backup-restore-evidence-template.md',
      'clean-checkout-evidence-template.md',
      'committee-governance-evidence-template.md',
      'dependency-review-evidence-template.md',
      'external-integration-review-template.md',
      'independent-security-review-evidence-template.md',
      'operator-readiness-evidence-template.md',
      'performance-benchmark-evidence-template.md',
      'trustless-burn-verification-evidence-template.md',
    ];

    for (const templateName of datedTemplates) {
      const template = readFileSync(join(bridgeRoot, 'docs', templateName), 'utf8');
      expect(template, templateName).toContain('Date must use `YYYY-MM-DD`.');
    }
  });

  it('documents Git commit SHA requirements for evidence templates', () => {
    const gitCommitTemplates = [
      'backup-restore-evidence-template.md',
      'clean-checkout-evidence-template.md',
      'committee-governance-evidence-template.md',
      'dependency-review-evidence-template.md',
      'external-integration-review-template.md',
      'operator-readiness-evidence-template.md',
      'performance-benchmark-evidence-template.md',
      'release-notes-template.md',
      'trustless-burn-verification-evidence-template.md',
      'live-rehearsal-template.md',
    ];

    for (const templateName of gitCommitTemplates) {
      const template = readFileSync(join(bridgeRoot, 'docs', templateName), 'utf8');
      expect(template, templateName).toContain('Git commit must use a 7-40 character Git commit SHA.');
    }

    const securityReview = readFileSync(
      join(bridgeRoot, 'docs', 'independent-security-review-evidence-template.md'),
      'utf8',
    );
    expect(securityReview).toContain('Reviewed commit must use a 7-40 character Git commit SHA.');
  });

  it('documents testnet scope for production deployment candidate evidence classifications', () => {
    const environmentScopedTemplates = [
      'backup-restore-evidence-template.md',
      'committee-governance-evidence-template.md',
      'dependency-review-evidence-template.md',
      'independent-security-review-evidence-template.md',
      'operator-readiness-evidence-template.md',
      'performance-benchmark-evidence-template.md',
      'trustless-burn-verification-evidence-template.md',
    ];

    for (const templateName of environmentScopedTemplates) {
      const template = readFileSync(join(bridgeRoot, 'docs', templateName), 'utf8');
      expect(template, templateName).toContain('`Release level = production deployment candidate` requires `Environment =');
      expect(template, templateName).toContain('testnet');
    }

    const dependencyTemplate = readFileSync(join(bridgeRoot, 'docs', 'dependency-review-evidence-template.md'), 'utf8');
    expect(dependencyTemplate).toContain('clean checkout / local offline / CI / staging / testnet');
  });

  it('keeps the clean-checkout CI gate aligned with the documented local gate', () => {
    const workflow = readFileSync(
      join(bridgeRoot, '.github', 'workflows', 'relayer-checks.yml'),
      'utf8',
    );
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'clean-checkout-evidence-template.md'),
      'utf8',
    );
    const checklistRows = parsePendingEvidenceRows(checklist);
    const gate1ChecklistRow = checklistRows.find(
      row => row[0] === 'Gate 1' && row[1] === 'Green CI on the final branch',
    );
    const matrixRows = parseEvidenceMatrixRows(matrix);
    const cleanCheckoutMatrixRow = matrixRows.find(
      row => row[0] === 'Clean checkout reproducibility',
    );
    const requiredTemplateSections = [
      '## Run Classification',
      '## Required Commands',
      '## CI Workflow Evidence',
      '## Reproducibility Decisions',
      '## Publication Decision',
      '## Reviewer Sign-Off',
    ];
    const requiredTemplateTerms = [
      'not a production-ready claim',
      'Do not paste `.env` contents',
      'npm ci',
      'npm run check',
      'npm run wasm:test',
      'npm run release:gate',
      'git diff --check -- ergo-sidechain-bridge',
      'secret/local path diff scan',
      'git status --short',
      'npm run ci:validate',
      'release:gate -- --clean-checkout-evidence',
      'completed clean-checkout evidence',
      'completed clean checkout evidence',
      'clean checkout validation target',
      'Release gate structural issues',
      'Release gate structural issues = 0',
      'No local runtime state is staged',
      'No local path or secret marker is staged',
      'Linked command rows must use exact expected-result language',
      'Rows marked `linked` in Required Commands, CI Workflow Evidence, and',
      'completed `artifact://...` marker',
      'non-template evidence link',
      'Targetless command-output text',
      'Each linked command row must identify the checked command output',
      'single shared clean-checkout artifact is not enough',
      'bare validator command names are resolution targets',
      'Final branch commit is identified',
      'exact `Branch` and `Git commit` values',
      'Linked workflow rows must also name the checked workflow fact',
      'relayer `package-lock.json` cache key',
      '`npm ci` running before tests',
      'branch name and Git commit SHA',
      'Required release-note and checklist updates must use completed Gate 1 update',
      'completed Gate 1 publication-update evidence',
      'Generic release-note or checklist',
      'updates unless they identify the completed Gate 1 evidence kind',
      'row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'targetless command-output notes are not completed Gate 1 publication-update evidence',
      '`Reviewer decision summary` must mention release support',
      'Release supported = production deployment candidate',
      'clean checkout CI green',
      'production-ready claim handling',
      'Required release-note updates',
      'link completed Gate 1 release-note update',
      'completed Gate 1 release-note update',
      'completed Gate 1 checklist',
      'update evidence',
      'blocked with 0 structural issues',
      'clean/no output',
      'publication/release is blocked',
      '`Required evidence` cell for each reproducibility decision must identify',
      'lockfile/npm ci',
      'WASM AVL tracked-source build',
      'local-path or secret-marker scan',
      'Release gate structural issues = 0',
      'release-gate structural issue output',
      'Reviewer notes must state a concrete clean-checkout outcome',
      'CI reviewer` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'sign-off `Date` must',
      'not be before the Run Classification `Date`',
      'lockfile reproducibility',
      'Release gate structural issues = 0',
      '`reviewed clean checkout evidence` are not enough',
      'The blank template is expected to fail validation.',
      'pending / linked / blocker',
    ];

    expect(workflow).toContain(
      '& $env:BRIDGE_AUDIT_NODE_EXECUTABLE $env:BRIDGE_AUDIT_NPM_CLI ci',
    );
    expect(workflow).toContain(
      '& $env:BRIDGE_AUDIT_NODE_EXECUTABLE $env:BRIDGE_AUDIT_NPM_CLI run audit:alpha',
    );
    expect(workflow).not.toContain('run: npm.cmd ci');
    expect(workflow).toContain('"README.md"');
    expect(workflow).toContain('"docs/**"');
    expect(workflow).toContain('"phases/**"');
    expect(workflow).toContain('"contracts/**"');
    expect(workflow).not.toContain('ergo-sidechain-bridge/README.md');
    expect(workflow).toContain('wasm-pack');
    expect(workflow).toContain('wasm32-unknown-unknown');
    expect(checklist).toContain('clean-checkout-evidence-template.md');
    expect(checklist).toContain('npm run ci:validate');
    expect(checklist).toContain('completed clean checkout evidence');
    expect(checklist).toContain('clean checkout validation target');
    expect(checklist).toContain('--clean-checkout-evidence');
    expect(checklist).toContain('Command-specific clean-checkout output evidence');
    expect(checklist).toContain('relayer/src/clean-checkout-evidence.test.ts');
    expect(checklist).toContain('completed Gate 1 release-note update evidence');
    expect(checklist).toContain('completed Gate 1 checklist update evidence');
    expect(checklist).toContain('workflow fact-specific evidence');
    expect(checklist).toContain('final branch commit identity');
    expect(checklist).toContain('CI reviewer sign-off');
    expect(checklist).toContain('sign-off date is not before run classification Date');
    expect(checklist).toContain('CI reviewer decision summary mentions release support');
    expect(checklist).toContain('clean checkout CI green');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('testnet production-candidate claim handling');
    expect(checklist).toContain('Release gate structural issues = 0');
    expect(gate1ChecklistRow?.[4]).toContain('Testnet production-candidate claim allowed = yes');
    expect(gate1ChecklistRow?.[4]).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(gate1ChecklistRow?.[4]).toContain('production-ready claim handling');
    expect(gate1ChecklistRow?.[4]).toContain('testnet production-candidate claim handling');
    expect(matrix).toContain('docs/clean-checkout-evidence-template.md');
    expect(matrix).toContain('relayer/src/clean-checkout-evidence.test.ts');
    expect(matrix).toContain('relayer/src/release-gate.test.ts');
    expect(matrix).toContain('release-gate `--clean-checkout-evidence` consumption of the actual completed clean-checkout artifact');
    expect(matrix).toContain('completed clean checkout evidence');
    expect(matrix).toContain('clean checkout validation target');
    expect(matrix).toContain('command-specific clean-checkout output evidence');
    expect(matrix).toContain('workflow fact-specific evidence');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('completed Gate 1 release-note update evidence');
    expect(matrix).toContain('completed Gate 1 checklist update evidence');
    expect(matrix).toContain('final branch commit identity');
    expect(matrix).toContain('CI reviewer sign-off');
    expect(matrix).toContain('sign-off date is not before run classification Date');
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('release support');
    expect(matrix).toContain('clean checkout CI green');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('testnet production-candidate claim handling');
    expect(matrix).toContain('Release gate structural issues = 0');
    expect(cleanCheckoutMatrixRow?.[4]).toContain('Testnet production-candidate claim allowed = yes');
    expect(cleanCheckoutMatrixRow?.[4]).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(cleanCheckoutMatrixRow?.[4]).toContain('production-ready claim handling');
    expect(cleanCheckoutMatrixRow?.[4]).toContain('testnet production-candidate claim handling');
    expect(roadmap).toContain('docs/clean-checkout-evidence-template.md');
    expect(roadmap).toContain('executable validator');
    expect(roadmap).toContain('Clean-checkout CI reviewer sign-off now must match');
    expect(roadmap).toContain('sign-off date is not before run classification Date');
    expect(roadmap).toContain('Clean-checkout reviewer decision summaries now must mention release support');
    expect(roadmap).toMatch(/testnet\s+production-candidate claim handling/);
    expect(roadmap).toContain('Clean-checkout production deployment candidate support now requires');
    expect(roadmap).toContain('`release:gate` now consumes completed clean-checkout evidence through');
    expect(releaseNotes).toContain('clean-checkout-evidence-template.md');

    for (const section of requiredTemplateSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTemplateTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps the institutional release checklist linked to required evidence', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const requiredEvidence = [
      'ultimate-bridge-objective.md',
      'ultimate-bridge-roadmap.md',
      'clean-checkout-evidence-template.md',
      'relayer/src/clean-checkout-evidence.test.ts',
      'trustless-burn-verification-plan.md',
      'backup-restore-evidence-template.md',
      'relayer/src/backup-restore-evidence.test.ts',
      'performance-benchmark-evidence-template.md',
      'relayer/src/benchmark-evidence.test.ts',
      'committee-governance-evidence-template.md',
      'relayer/src/committee-governance-evidence.test.ts',
      'external-integration-review-template.md',
      'relayer/src/external-integration-evidence.test.ts',
      'contract-relayer-api-reference.md',
      'release-notes-template.md',
      'independent-security-review-scope.md',
      'independent-security-review-evidence-template.md',
      'relayer/src/security-review-evidence.test.ts',
      'security-evidence-matrix.md',
      'dependency-risk-register.md',
      'aggregate-settlement-threat-model.md',
      'operator-runbooks.md',
      'live-rehearsal-template.md',
      'relayer/src/rehearsal-evidence.test.ts',
      'evm-integration-checklist.md',
      'sharded-settlement-lanes.md',
      'sidechain-on-ergo-in-one-afternoon.md',
      'evm-developer-showcase.md',
      'relayer/src/publication-hygiene.test.ts',
      '.github/workflows/relayer-checks.yml',
    ];

    for (const evidence of requiredEvidence) {
      expect(checklist).toContain(evidence);
    }

    const readme = readFileSync(join(bridgeRoot, 'README.md'), 'utf8');
    const objective = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-objective.md'), 'utf8');
    expect(readme).toContain('docs/release-checklist.md');
    expect(objective).toContain('release-checklist.md');
    expect(objective).toContain('release-notes-template.md');
  });

  it('keeps release notes constrained to release level, evidence, assumptions, and blockers', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const template = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const requiredSections = [
      '## Release Classification',
      '## Scope Statement',
      '## Required Evidence',
      '## Trust Assumptions',
      '## Publication Blockers',
      '## Allowed Claims',
      '## Disallowed Claims Check',
      '## Operator Impact',
      '## Sign-Off',
    ];
    const requiredTerms = [
      'validated PoC / institutional reference / production deployment candidate',
      'Decision date must use `YYYY-MM-DD`',
      'This release is not a production-ready bridge claim.',
      'Production deployment candidate scope text must still be explicitly',
      'mainnet, main-net, main net, main network',
      'unqualified production-readiness',
      'The same completed-evidence rule applies when the `Release name`',
      'statement, or an Allowed Claims row uses controlled testnet production-candidate',
      'Allowed wording cell must itself use `testnet production-candidate` or',
      'evidence links or internal claim labels are not public wording',
      'npm run release-notes:validate',
      'The blank template is expected to fail validation.',
      'canonical table headers',
      'validated `Release level` must match the',
      '`Release Decision` `Proposed release level`',
      'release-note classification `Git commit`',
      'clean-checkout Run Classification `Git commit`',
      '| Role | Name | Decision | Date | Notes |',
      ...REQUIRED_EVIDENCE_CLASSES,
      'Dependency Review Evidence Template',
      'Independent Security Review Evidence Template',
      ...REQUIRED_TRUST_ASSUMPTIONS,
      'Copy every unresolved row from the Pending Evidence Register',
      'requires every required blocker row from the',
      'Unresolved required blocker rows must use the same unresolved status',
      '`Pending evidence` or `Open blocker`',
      'For `validated PoC` releases, clean checkout CI and fresh local devnet',
      'lifecycle blockers must remain in scope until marked `Checked`',
      'For `institutional reference` releases, only the trustless burn',
      'governance/key-rotation, and benchmark/scaling blockers may be scoped out',
      'signer-dependency, institutional-readiness, and',
      'external-integration blockers must remain in scope until marked `Checked`',
      'If a copied blocker is marked `Checked`',
      'completed evidence link, command-output target, or artifact marker',
      'corresponding Required Evidence',
      'blocker status and evidence status cannot diverge',
      'Template links, targetless command-output notes, and',
      'Row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'narrative status notes',
      'Evidence cells must also be completed evidence',
      'Evidence cells must identify the trust assumption they support',
      'trusted-oracle',
      'ContextExtension signer consensus',
      'local SQLite/AVL recovery',
      'Claim evidence links must use completed evidence links',
      'Claim evidence links must identify the allowed claim',
      'Generic review artifacts',
      'Allowed wording must not include absolute security claims',
      'Upstream signer blocker resolved = yes',
      'positive upstream signer release',
      'Negative upstream signer conformance wording',
      'not yet validated',
      'not yet verified',
      'not fully validated',
      'partially validated',
      'Throughput, latency, TPS, tx/s, transaction-per-second, or scaling wording requires linked benchmark evidence',
      'Every publication blocker row, including custom blocker rows',
      'structured resolution target',
      '`Complete proof path` is not enough',
      'For a production deployment candidate, every required evidence row must be',
      'every required blocker row must remain',
      'Backup Restore Evidence Template',
      ...REQUIRED_DISALLOWED_CLAIMS,
      'Operator impact actions must reference a runbook',
      'Stop conditions must include explicit stop',
      'generic `ok` or',
      'Each row must also mention the operator area it covers',
      ...REQUIRED_OPERATOR_AREAS,
      'monitoring/alerting',
      'Sign-off dates must use `YYYY-MM-DD`',
      'calendar date rather than a narrative timestamp',
      'Sign-off dates must not be before the Release Classification',
      'Do not remove the `Notes` column',
      'Maintainer` sign-off name must match the `Decision owner',
      'Each sign-off note must also identify the role-specific review scope',
      ...REQUIRED_SIGNOFF_ROLES,
      'maintainer release decision',
      'security claims/trust',
      'operator impact/runbooks',
      'Performance Benchmark Evidence Template',
      'Committee Governance Evidence Template',
      'External Integration Review Template',
      'Rows marked `linked` must include a completed evidence link',
      'command-output target',
      'Template links, targetless command-output notes, and',
      'row-named non-concrete artifact targets',
      'Rows that remain `pending` or',
      'Any non-empty evidence cell must identify the evidence class it supports',
      'clean checkout CI',
      'ContextExtension signer guard',
      'signer dependency conformance or fail-closed release decision',
      'failed broadcast phantom AVL recovery',
      'reorged burn or stale singleton recovery',
      'A Testnet lifecycle rehearsal row marked `linked` must also cite `Ergo node',
      'network testnet`',
      '`Sidechain network` as `patched-devnet`, `testnet`, or',
      'an explicit non-mainnet sidechain network',
      'no negated or mixed network',
      '`not testnet`',
      '`not on testnet`',
      '`not connected to testnet`',
      '`without the testnet`',
      '`mainnet`, `main network`, `main chain`, or',
      '`mainchain`',
      'generic testnet',
      'artifact name is not enough',
      'committee governance/key',
      'Trustless burn verification evidence',
      'External integration package review',
      'fresh reviewer',
      'Private maintainer context used = no',
      'artifact name is not enough',
    ];

    expect(checklist).toContain('release-notes-template.md');
    expect(checklist).toContain('npm run release-notes:validate');
    expect(checklist).toContain('relayer/src/release-notes-evidence.test.ts');
    expect(checklist).toContain('Mainnet, main-net, main net, main network, or main chain');
    expect(checklist).toContain('Production deployment candidate scope text is explicitly testnet-scoped');
    expect(checklist).toContain('unqualified production-readiness wording');
    expect(checklist).toContain('completed evidence for testnet');
    expect(checklist).toContain('lifecycle citing `Ergo node network testnet`');
    expect(checklist).toContain('no negated or mixed');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    expect(roadmap).toContain('forbids mainnet, main network, or main');
    expect(roadmap).toContain('chain production-ready / production-candidate claims');
    expect(roadmap).toContain('linked testnet lifecycle');
    expect(roadmap).toContain('release-note evidence must cite `Ergo node network testnet`');
    expect(roadmap).toContain('not on the testnet');
    expect(roadmap).toContain('not using testnet');
    expect(roadmap).toContain('not connected to testnet');
    expect(roadmap).toContain('without the testnet');
    expect(roadmap).toContain('mainchain');
    expect(roadmap).toContain('mixed-network');
    expect(roadmap).toContain('testnet artifact name');
    expect(roadmap).toContain('release name, scope');
    expect(roadmap).toContain('statement, and Allowed Claims table');
    expect(roadmap).toContain('bypassing upstream signer conformance');
    expect(roadmap).toContain('evidence');
    expect(template).toContain('release-notes:validate');

    for (const section of requiredSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTerms) {
      expect(template, term).toContain(term);
    }

    for (const evidenceClass of REQUIRED_EVIDENCE_CLASSES) {
      expect(template, evidenceClass).toContain(`| ${evidenceClass} | pending / linked / blocker | | |`);
    }

    for (const assumption of REQUIRED_TRUST_ASSUMPTIONS) {
      expect(template, assumption).toContain(`| ${assumption} | | | |`);
    }

    for (const claim of REQUIRED_DISALLOWED_CLAIMS) {
      expect(template, claim).toContain(`- [ ] ${claim}`);
    }

    for (const area of REQUIRED_OPERATOR_AREAS) {
      expect(template, area).toContain(`| ${area} | | |`);
    }

    for (const role of REQUIRED_SIGNOFF_ROLES) {
      expect(template, role).toContain(`| ${role} | | approve / block | | |`);
    }
  });

  it('keeps the blank release notes template non-publishable', () => {
    const template = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const result = validateReleaseNotes(template);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('Release Classification: Release name is required');
    expect(result.errors).toContain('Release Classification: Git commit is required');
    expect(result.errors).toContain('Required Evidence: Clean checkout CI: status must be pending, linked, or blocker');
    expect(result.errors).toContain('Disallowed Claims Check: "No absolute security claim." must be checked');
    expect(result.errors).toContain('Sign-Off: Maintainer: name is required');
  });

  it('keeps blank institutional evidence templates non-publishable', () => {
    const templates: Array<{ file: string; validate: EvidenceTemplateValidator }> = [
      { file: 'backup-restore-evidence-template.md', validate: validateBackupRestoreEvidence },
      { file: 'clean-checkout-evidence-template.md', validate: validateCleanCheckoutEvidence },
      { file: 'committee-governance-evidence-template.md', validate: validateCommitteeGovernanceEvidence },
      { file: 'dependency-review-evidence-template.md', validate: validateDependencyReviewEvidence },
      { file: 'external-integration-review-template.md', validate: validateExternalIntegrationEvidence },
      { file: 'independent-security-review-evidence-template.md', validate: validateSecurityReviewEvidence },
      { file: 'live-rehearsal-template.md', validate: validateRehearsalEvidence },
      { file: 'operator-readiness-evidence-template.md', validate: validateOperatorReadinessEvidence },
      { file: 'performance-benchmark-evidence-template.md', validate: validateBenchmarkEvidence },
      { file: 'testnet-production-candidate-architecture-manual-template.md', validate: validateTechnicalAddendumEvidence },
      { file: 'testnet-prebroadcast-dry-run-evidence-template.md', validate: validateTestnetPreBroadcastEvidence },
      { file: 'trustless-burn-verification-evidence-template.md', validate: validateTrustlessBurnEvidence },
    ];

    for (const { file, validate } of templates) {
      const template = readFileSync(join(bridgeRoot, 'docs', file), 'utf8');
      const result = validate(template);

      expect(result.status, file).toBe('BLOCKED');
      expect(result.errors.length, file).toBeGreaterThan(0);
      expect(result.message, file).toContain('BLOCKED');
      expect(template, file).toContain('The blank template is expected to fail validation.');
    }
  });

  it('keeps legacy V1 pre-broadcast evidence diagnostic or historical only', () => {
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'testnet-prebroadcast-dry-run-evidence-template.md'),
      'utf8',
    );

    expect(template).toContain('npm run prebroadcast:validate');
    expect(template).toContain('npm run prebroadcast:doctor');
    expect(template).not.toContain('npm run rehearsal:preflight');
    expect(template).not.toContain('npm run rehearsal:testnet-window-prep');
    expect(template).not.toContain('npm run rehearsal:draft');
    expect(template).toContain('not close Gate 3');
    expect(template).toContain('does not authorize transaction broadcast');
    expect(template).toContain('Gate 3 closure claimed: no');
    expect(template).toContain('Current Ergo height: <height> artifact://...');
    expect(template).toContain('Current sidechain height: <height> artifact://...');
    expect(template).toContain('`Sidechain block height` must not exceed');
    expect(template).toContain('`Ergo anchor height` must not exceed');
    expect(template).toContain('Each field must start with the required `false`, `unset`, or `no` value');
    expect(template).toContain('Mempool transaction observed: no artifact://...');
    expect(template).toContain('Runtime state files staged: no artifact://...');
    expect(template).not.toMatch(/settle:aggregate -- (?:check|submit)/);
    expect(template).not.toMatch(/e2e:aggregate -- (?:trigger|check|submit|run)/);
    expect(template).toContain('immutable historical provenance');
    expect(template).toContain('`confirm*` commands');
    expect(template).toContain('commands are physically absent');
    expect(template).toContain('N/A - retired legacy V1 route');
    expect(template).toContain('N/A - no current legacy V1 approval path');
    expect(template).toContain('separately versioned external-fee');
    expect(template).toContain('Production-ready claim allowed by this package: no');
    expect(template).toContain('Testnet production-candidate claim allowed by this package: no');
    expect(template).toContain('Legacy rehearsal helpers may parse immutable archived');
    expect(template).toContain('Follow-up replacement-profile rehearsal required: yes');
  });

  it('keeps legacy V1 rehearsal tooling diagnostic and non-authoritative', () => {
    const rehearsal = readFileSync(join(bridgeRoot, 'docs', 'live-rehearsal-template.md'), 'utf8');
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const runbook = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const postSubmitScript = readFileSync(
      join(bridgeRoot, 'relayer', 'src', 'scripts', 'testnet-rehearsal-post-submit.ts'),
      'utf8',
    );
    const postSubmitObserveScript = readFileSync(
      join(bridgeRoot, 'relayer', 'src', 'scripts', 'testnet-rehearsal-post-submit-observe.ts'),
      'utf8',
    );

    expect(rehearsal).toContain('current legacy V1 relayer cannot produce that lifecycle');
    expect(rehearsal).toContain('Only the future external-fee profile may combine');
    expect(rehearsal).toContain('historical provenance only; `release:gate` cannot consume them');
    expect(rehearsal).toContain('the checkpoint cannot close Gate 3');
    expect(checklist).toContain('Legacy V1 preparation and lifecycle evidence remains parseable historical');
    expect(checklist).toContain('They are not accepted as Gate 3 deciding inputs');
    expect(checklist).toContain('`rehearsal:external-fee-live-preflight` producer and validator');
    expect(checklist).toContain('Fresh checkpoint boundary does not authorize broadcast');
    expect(runbook).toMatch(/No current aggregate payout\s+profile satisfies that boundary/);
    expect(runbook).toContain('cannot authorize current execution');
    expect(runbook).toContain('Required next evidence must come from the separately versioned external-fee');
    expect(rehearsal).not.toContain('--offline-gate-json <offline-gate.json>');
    expect(checklist).not.toContain('--offline-gate-json <offline-gate.json>');
    expect(runbook).not.toContain('--offline-gate-json <offline-gate.json>');
    expect(rehearsal).not.toContain('--prep-bundle-json <prep-bundle.json>');
    expect(checklist).not.toContain('--prep-bundle-json <prep-bundle.json>');
    expect(runbook).not.toContain('--prep-bundle-json <prep-bundle.json>');
    expect(postSubmitScript).toContain(
      'This command only assembles Markdown evidence from already collected live artifacts. It never submits or confirms transactions.',
    );
    expect(postSubmitObserveScript).toContain(
      'This command only performs read-only node and SQLite observation after an already approved live submit. It never signs, submits, confirms, reconciles, or approves transactions.',
    );
  });

  it('keeps testnet pre-broadcast lifecycle guidance compatible with the validator', () => {
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'testnet-prebroadcast-dry-run-evidence-template.md'),
      'utf8',
    );
    const sectionStart = template.indexOf('## Lifecycle Linkage Guidance');
    const sectionEnd = template.indexOf('## Publication Control', sectionStart);
    expect(sectionStart).toBeGreaterThan(-1);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const section = template.slice(sectionStart, sectionEnd);
    const lifecycleItems = [
      'Fresh testnet lifecycle',
      'Settlement submit evidence',
      'Confirmation evidence',
      'Reconciliation evidence',
    ];

    for (const item of lifecycleItems) {
      const line = section.split(/\r?\n/).find(candidate => candidate.includes(item));
      expect(line, item).toBeDefined();
      expect(line, item).toMatch(/\b(blockers?|blocked|unchecked|pending|unavailable|historical)\b/i);
      expect(line, item).not.toMatch(/\b(?:pass(?:ed|es)?|complete(?:d)?|checked|satisfied|linked)\b/i);
    }
  });

  it('removes current legacy V1 rehearsal handoff commands from the pre-broadcast template', () => {
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'testnet-prebroadcast-dry-run-evidence-template.md'),
      'utf8',
    );

    const offlineGateCommand = template
      .split(/\r?\n/)
      .find(line => line.startsWith('npm run rehearsal:offline-gate --'));
    const freshCheckpointCommand = template
      .split(/\r?\n/)
      .find(line => line.startsWith('npm run rehearsal:fresh-testnet-check --'));
    const prepBundleCommand = template
      .split(/\r?\n/)
      .find(line => line.startsWith('npm run rehearsal:prep-bundle --'));

    expect(freshCheckpointCommand).toBeUndefined();
    expect(offlineGateCommand).toBeUndefined();
    expect(prepBundleCommand).toBeUndefined();
    expect(template).toContain('Only that profile can define a future live rehearsal');
  });

  it('keeps every institutional release gate tied to checklist items and evidence', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const sections = extractReleaseGateSections(checklist);
    const expectedGateHeadings = Array.from(
      { length: 9 },
      (_, index) => `## Gate ${index}:`,
    );
    const gateIssues = sections.flatMap(section => {
      const heading = section.split(/\r?\n/, 1)[0];
      const evidenceStart = section.indexOf('Evidence:');
      const evidenceBlock = evidenceStart >= 0 ? section.slice(evidenceStart) : '';
      const issues: string[] = [];

      if (!/^- \[[ xX]\]/m.test(section)) {
        issues.push(`${heading}: missing checklist items`);
      }

      if (evidenceStart < 0) {
        issues.push(`${heading}: missing Evidence block`);
      } else if (
        !/\[[^\]]+\]\([^)]+\)/.test(evidenceBlock) &&
        !/`[^`]+`/.test(evidenceBlock) &&
        !/\bnpm run [A-Za-z0-9:_-]+\b/.test(evidenceBlock)
      ) {
        issues.push(`${heading}: Evidence block has no resolvable evidence marker`);
      }

      return issues;
    });

    expect(sections.map(section => section.split(/\r?\n/, 1)[0])).toEqual(
      expectedGateHeadings.map(prefix => expect.stringContaining(prefix)),
    );
    expect(gateIssues).toEqual([]);
    expect(checklist).toContain('## Release Decision');
  });

  it('keeps pending publication evidence explicit and non-narrative', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const rows = parsePendingEvidenceRows(checklist);
    const allowedStatuses = new Set([
      'Pending evidence',
      'Open blocker',
      'Checked',
    ]);
    const requiredEvidenceItems = REQUIRED_PENDING_EVIDENCE_ROWS.map(row => row.item);
    const malformedRows = rows.filter(row => row.length !== 5);
    const rowsByItem = new Map(rows.map(row => [row[1], row]));
    const rowCounts = rows.reduce((counts, row) => {
      counts.set(row[1], (counts.get(row[1]) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const missingRequiredRows = requiredEvidenceItems.filter(item => !rowsByItem.has(item));
    const duplicateRequiredRows = requiredEvidenceItems.filter(item => (rowCounts.get(item) ?? 0) > 1);
    const misalignedRequiredRows = REQUIRED_PENDING_EVIDENCE_ROWS.flatMap(required => {
      const row = rowsByItem.get(required.item);
      if (!row) return [];

      const issues: string[] = [];
      if (row[0] !== required.gate) {
        issues.push(`${required.item}: expected ${required.gate} but found ${row[0]}`);
      }
      if (row[2] !== required.unresolvedStatus && row[2] !== 'Checked') {
        issues.push(`${required.item}: expected unresolved status ${required.unresolvedStatus} or Checked but found ${row[2]}`);
      }

      const resolution = row[4].toLowerCase();
      const missingTerms = required.requiredResolutionTerms.filter(term =>
        !resolution.includes(term.toLowerCase()),
      );
      if (missingTerms.length > 0) {
        issues.push(`${required.item}: missing resolution terms ${missingTerms.join(', ')}`);
      }

      return issues;
    });
    const unknownStatuses = rows
      .map(row => row[2])
      .filter(status => !allowedStatuses.has(status));
    const weakPublicationEffects = rows
      .filter(row => !/\bPublication blocker\b/.test(row[3]))
      .map(row => row[1]);
    const weakRequiredResolutions = rows
      .filter(row =>
        !/\[[^\]]+\]\([^)]+\)/.test(row[4]) &&
        !/\bnpm run [A-Za-z0-9:_-]+\b/.test(row[4]) &&
        !/(?:^|\s)artifact:\/\//.test(row[4]),
      )
      .map(row => row[1]);
    const emptyCriticalCells = rows.flatMap(row =>
      row
        .map((cell, index) => [cell, index] as const)
        .filter(([cell]) => cell.length === 0)
        .map(([, index]) => `${row[1]}: empty cell ${index}`),
    );
    const independentSecurityReviewRow = rows.find(
      row => row[1] === 'Independent security review report',
    );
    const signerDependencyRow = rows.find(
      row => row[1] === 'Signer dependency conformance or fail-closed release decision',
    );
    const backupRestoreRow = rows.find(
      row => row[1] === 'Backup-restore or reconstructibility drill',
    );
    const trustlessBurnRow = rows.find(
      row => row[1] === 'Trustless burn verification path',
    );
    const operatorReadinessRow = rows.find(
      row => row[1] === 'Operator readiness evidence',
    );
    const localDevnetRow = rows.find(
      row => row[1] === 'Fresh local devnet lifecycle run',
    );
    const testnetRow = rows.find(
      row => row[1] === 'Fresh Ergo testnet lifecycle run',
    );
    const failedBroadcastRow = rows.find(
      row => row[1] === 'Failed broadcast / phantom AVL recovery drill',
    );
    const reorgRecoveryRow = rows.find(
      row => row[1] === 'Reorged burn and stale singleton recovery drill',
    );
    const rowText = rows.map(row => row.join(' | ')).join('\n');
    const unresolvedPublicationBlockers = rows.filter(row =>
      row[2] !== 'Checked' && /\bPublication blocker\b/.test(row[3]),
    ).length;

    expect(checklist).toContain('## Status Vocabulary');
    expect(checklist).toContain('## Pending Evidence Register');
    expect(checklist).not.toMatch(/\bpending\./i);
    expect(rows.length).toBeGreaterThanOrEqual(requiredEvidenceItems.length);
    expect(malformedRows).toEqual([]);
    expect(missingRequiredRows).toEqual([]);
    expect(duplicateRequiredRows).toEqual([]);
    expect(misalignedRequiredRows).toEqual([]);
    expect(unknownStatuses).toEqual([]);
    expect(weakPublicationEffects).toEqual([]);
    expect(weakRequiredResolutions).toEqual([]);
    expect(emptyCriticalCells).toEqual([]);
    expect(checklist).toContain('No pending evidence row remains for the release level being proposed.');
    expect(checklist).toContain('canonical `Field | Value` header');
    expect(checklist).toContain('| Proposed release level | blocked |');
    expect(checklist).toContain('| Final decision | blocked |');
    expect(checklist).toContain('| Public release allowed | no |');
    expect(checklist).toContain('| Production-ready claims allowed | no |');
    expect(checklist).toContain('| Testnet production-candidate claims allowed | no |');
    expect(checklist).toContain(`| Unresolved publication blockers | ${unresolvedPublicationBlockers} |`);
    expect(checklist).toContain('| Release notes artifact | not linked |');
    expect(checklist).toContain('npm run release:gate');
    expect(checklist).toContain('npm run release:gate -- --clean-checkout-evidence');
    expect(checklist).toContain('--clean-checkout-evidence');
    expect(checklist).toContain('--dependency-review-evidence');
    expect(checklist).toContain('--security-review-evidence');
    expect(checklist).toContain('--trustless-burn-evidence');
    expect(checklist).toContain('--benchmark-evidence');
    expect(checklist).toContain('--governance-evidence');
    expect(checklist).toContain('--operator-readiness-evidence');
    expect(checklist).toContain('--integration-evidence');
    expect(checklist).toContain('--technical-addendum-evidence');
    expect(checklist).toContain('--live-rehearsal-evidence');
    expect(checklist).toContain('--live-preflight-json');
    expect(checklist).toContain('--fresh-checkpoint-json');
    expect(checklist).not.toContain('--offline-gate-json');
    expect(checklist).not.toContain('--prep-bundle-json');
    expect(checklist).toContain('--post-submit-observe-json');
    expect(checklist).toContain('--assembly-report-json');
    expect(checklist).toContain('--recovery-observe-json');
    expect(checklist).toContain('--backup-restore-evidence');
    expect(checklist).toContain('validates the actual');
    expect(checklist).toContain('Markdown and JSON artifacts');
    expect(checklist).toContain('must fail while any row in the Pending Evidence Register remains a');
    expect(checklist).toContain('a `Checked` publication-blocker row has no');
    expect(checklist).toContain('completed evidence link, command-output target, or artifact marker');
    expect(checklist).toContain('targetless command-output notes');
    expect(checklist).toContain(
      'evidence hygiene checks to every Publication effect and Required',
    );
    expect(checklist).toContain('resolution cell');
    expect(checklist).toMatch(/cannot be used\s+as checklist\s+evidence/i);
    expect(checklist).toMatch(/Release\s+gate evidence hygiene also rejects/i);
    expect(checklist).toMatch(/Publication effect and Required resolution cells/i);
    expect(checklist).toContain('Completed evidence must pass the evidence hygiene guard');
    expect(checklist).toContain('Production-ready claims remain blocked at the top-level decision');
    expect(checklist).toContain('`Testnet production-candidate claims allowed` field');
    expect(checklist).toContain('completed production deployment candidate release notes evidence');
    expect(checklist).toContain('explicitly identify production deployment candidate release notes');
    expect(checklist).toMatch(/Public release also requires\s+`Release notes status` to be/);
    expect(checklist).toContain('two distinct evidence pieces');
    expect(checklist).toContain('a completed Markdown release-notes document artifact');
    expect(checklist).toContain('standalone evidence outside');
    expect(checklist).toContain('the validator output segment');
    expect(checklist).toMatch(
      /release-notes template Markdown files remain resolution targets\s+and cannot be\s+used as completed release-notes document artifacts/,
    );
    expect(checklist).toContain('affirmative `completed` marker');
    expect(checklist).toContain('not `not-completed` or `uncompleted`');
    expect(checklist).toMatch(/`npm run release-notes:validate`\s+output/);
    expect(checklist).toContain('identifies that completed');
    expect(checklist).toContain('document as the validated target');
    expect(checklist).toContain('distinct validation log');
    expect(checklist).toContain('CI run, or workflow artifact');
    expect(checklist).toContain('generic evidence artifact');
    expect(checklist).toContain('bare `run` artifact');
    expect(checklist).toContain('rather than reusing the completed release-notes');
    expect(checklist).toContain('same normalized completed-document target');
    expect(checklist).toMatch(/the validator\s+output evidence itself/);
    expect(checklist).toContain('not only the same basename');
    expect(checklist).toContain('separate reviewer note');
    expect(checklist).toContain('before the validated-target binding');
    expect(checklist).toContain('output artifacts must be concrete');
    expect(checklist).toContain('later log links in binding notes or `generic-*`');
    expect(checklist).toContain('reused or placeholder release-notes document distinct');
    expect(checklist).toContain('textual `recovery-observe JSON validation PASS`');
    expect(checklist).toContain('textual `backup:validate PASS`');
    expect(checklist).toContain('cannot authorize the claim by themselves');
    expect(checklist).toMatch(/`Release notes artifact` is\s+evidence-hygiene\s+scanned/);
    expect(checklist).toContain('no local');
    expect(checklist).toContain('Windows/POSIX absolute paths');
    expect(checklist).toContain('local file URLs');
    expect(checklist).toContain('key material block markers');
    expect(checklist).toContain('runtime database');
    expect(checklist).toContain('deployment-state');
    expect(checklist).toContain('diagnostic dump');
    expect(checklist).toContain('artifacts');
    expect(checklist).toContain('credential-bearing URLs');
    expect(checklist).toContain('evidence links');
    expect(checklist).toContain('Authorization/Cookie/API-key');
    expect(checklist).toContain('credential headers');
    expect(checklist).toContain('signing-key');
    expect(checklist).toContain('API-key');
    expect(checklist).toContain('password');
    expect(checklist).toContain('client-secret');
    expect(checklist).toContain('generic secret');
    expect(checklist).toContain('JWT');
    expect(checklist).toContain('generic token');
    expect(checklist).toContain('cloud access-key');
    expect(checklist).toContain('webhook-url');
    expect(checklist).toContain('session-token');
    expect(checklist).toContain('access-token');
    expect(checklist).toContain('quoted JSON/YAML credential keys');
    expect(checklist).toContain('validator scripts must refuse repository-escape traversal');
    expect(checklist).toContain('symlink/junction escape');
    expect(checklist).toContain('absolute paths');
    expect(checklist).toContain('local file URLs');
    expect(checklist).toContain('URI targets');
    expect(checklist).toContain('non-Markdown targets');
    expect(checklist).toContain('Template links are resolution targets, not');
    expect(checklist).toContain('targetless command-output notes are narrative status');
    expect(checklist).toContain('validator command names');
    expect(checklist).toContain('textual `release-notes:validate PASS` note alone');
    expect(checklist).toContain('completed external-fee live-preflight JSON target');
    expect(checklist).toContain('external-fee live-preflight JSON report and that validated target must match');
    expect(checklist).toMatch(/textual legacy\s+`rehearsal:live-preflight PASS` note/);
    expect(checklist).toContain('offline-gate, and prep-bundle reports remain optional historical provenance');
    expect(checklist).toContain('completed fresh checkpoint JSON target');
    expect(checklist).toContain('fresh checkpoint JSON report and that validated target must match');
    expect(checklist).toContain('textual `rehearsal:fresh-testnet-check PASS` note');
    expect(checklist).toContain('completed post-submit observe JSON target');
    expect(checklist).toContain('post-submit observe JSON report and that validated target must match');
    expect(checklist).toContain('textual `rehearsal:post-submit:observe PASS` note');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    expect(roadmap).toContain('Release gate decision validation now requires `Release notes status = linked`');
    expect(roadmap).toContain('Release gate decision validation now also requires a completed `Release notes');
    expect(roadmap).toContain('linked release notes to cite');
    expect(roadmap).toContain('release-notes validator output evidence');
    expect(roadmap).toContain('separates the completed release-notes');
    expect(roadmap).toContain('validation log alone');
    expect(roadmap).toContain('validator output to the completed');
    expect(roadmap).toContain('different file cannot satisfy');
    expect(roadmap).toContain('artifact cannot satisfy both');
    expect(roadmap).toContain('reuses the completed');
    expect(roadmap).toContain('inside the `release-notes:validate` output evidence');
    expect(roadmap).toContain('separate reviewer note cannot stand in');
    expect(roadmap).toContain('same normalized completed-document target');
    expect(roadmap).toContain('same basename cannot satisfy');
    expect(roadmap).toContain('appear only inside validator output');
    expect(roadmap).toContain('standalone release-notes document artifact');
    expect(roadmap).toContain('only before the validated-target binding');
    expect(roadmap).toContain('later log link cannot hide');
    expect(roadmap).toContain('command output reused the completed release-notes document');
    expect(roadmap).toContain('validator target bindings that only share');
    expect(roadmap).toContain('validator-target-only completed documents');
    expect(roadmap).toContain('validator output reuse even when');
    expect(roadmap).toContain('auditable validation artifact');
    expect(roadmap).toContain('validation log, transcript, CI run, or workflow artifact');
    expect(roadmap).toContain('generic evidence artifact cannot authorize');
    expect(roadmap).toContain('bare `run` artifact targets');
    expect(roadmap).toContain('generic run capture');
    expect(roadmap).toContain('completed release-notes');
    expect(roadmap).toContain('target to be Markdown');
    expect(roadmap).toContain('ZIP or generic artifact');
    expect(roadmap).toContain('completed release-notes template');
    expect(roadmap).toContain('Markdown templates remain resolution targets');
    expect(roadmap).toContain('artifacts ending');
    expect(roadmap).toContain('in `-template.md`');
    expect(roadmap).toContain('affirmative completed');
    expect(roadmap).toContain('not-completed');
    expect(roadmap).toContain('uncompleted');
    expect(roadmap).toMatch(/Testnet production-candidate claims allowed =\s+yes/);
    expect(roadmap).toMatch(/completed production deployment\s+candidate release notes evidence/);
    expect(roadmap).toMatch(/explicitly identify production\s+deployment candidate release notes/);
    expect(roadmap).toContain('--release-notes <completed-release-notes.md>');
    expect(roadmap).toContain('`release-notes:validate PASS` note');
    expect(roadmap).toContain('`Public release allowed = yes` also requires actual release-note validation input');
    expect(roadmap).toContain('structured release-note');
    expect(roadmap).toContain('validated release-note `Release level` must match');
    expect(roadmap).toContain('release-note classification');
    expect(roadmap).toContain('clean-checkout Run Classification `Git commit`');
    expect(roadmap).toContain('rejects negated production deployment candidate');
    expect(roadmap).toContain('not production deployment');
    expect(roadmap).toContain('Legacy V1 rehearsal JSON inputs are no longer release-gate authorities');
    expect(roadmap).toContain('evidence-hygiene scans `Release notes artifact`');
    expect(checklist).toContain('downgraded from');
    expect(checklist).toContain('publication blocker');
    expect(checklist).toContain('structured resolution target');
    expect(checklist).toContain('Any unresolved publication-blocker row must include a structured resolution');
    expect(checklist).toContain('Production deployment candidates cannot scope out required blocker rows.');
    expect(checklist).toContain('required blocker');
    expect(checklist).toContain('resolved with structured evidence');
    expect(checklist).toContain('row-specific evidence terms');
    expect(checklist).toContain('canonical `Pending evidence` or `Open blocker` status');
    expect(checklist).toMatch(/generic\s+artifact links are not enough/i);
    expect(checklist).toMatch(/release\s+decision table must also/i);
    expect(checklist).toContain('canonical `Field | Value` header');
    expect(checklist).toContain('unresolved publication-blocker count');
    expect(checklist).toContain('Production-ready claims remain blocked');
    expect(checklist).toMatch(/public\s+release cannot be allowed before\s+final approval/i);
    expect(checklist).toContain('Fleet Prover');
    expect(checklist).toContain('imports/instantiations');
    expect(checklist).toContain('settlement signing remains local WASM');
    expect(checklist).toContain('relayer/src/node-wallet-isolation.test.ts');
    expect(checklist).toContain('relayer/src/testnet-rehearsal-preflight.ts');
    expect(checklist).toContain('relayer/src/testnet-rehearsal-preflight.test.ts');
    expect(checklist).toContain('relayer/src/scripts/testnet-rehearsal-preflight.ts');
    expect(checklist).toContain('relayer/src/testnet-window-prep.ts');
    expect(checklist).toContain('relayer/src/testnet-window-prep.test.ts');
    expect(checklist).toContain('relayer/src/scripts/testnet-window-prep.ts');
    expect(checklist).toContain('relayer/src/testnet-fresh-checkpoint.ts');
    expect(checklist).toContain('relayer/src/testnet-fresh-checkpoint.test.ts');
    expect(checklist).toContain('relayer/src/scripts/testnet-fresh-checkpoint.ts');
    expect(checklist).toContain('relayer/src/testnet-rehearsal-live-preflight.ts');
    expect(checklist).toContain('relayer/src/testnet-rehearsal-live-preflight.test.ts');
    expect(checklist).toContain('relayer/src/scripts/testnet-rehearsal-live-preflight.ts');
    expect(checklist).toContain('relayer/src/testnet-rehearsal-draft.ts');
    expect(checklist).toContain('relayer/src/testnet-rehearsal-draft.test.ts');
    expect(checklist).toContain('relayer/src/scripts/testnet-rehearsal-draft.ts');
    expect(independentSecurityReviewRow?.[4]).toContain('area-specific risk-focus notes');
    expect(independentSecurityReviewRow?.[4]).toContain('item-specific evidence-package artifact links');
    expect(independentSecurityReviewRow?.[4]).toContain('Final decision = approve');
    expect(independentSecurityReviewRow?.[4]).toContain('Critical/high findings open = 0');
    expect(independentSecurityReviewRow?.[4]).toContain('Accepted risks reflected in release notes = yes');
    expect(independentSecurityReviewRow?.[4]).toContain('Production-ready claim allowed = no');
    expect(independentSecurityReviewRow?.[4]).toContain('Testnet production-candidate claim allowed = yes');
    expect(independentSecurityReviewRow?.[4]).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(independentSecurityReviewRow?.[4]).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(independentSecurityReviewRow?.[4]).toContain('testnet production-candidate claim handling');
    expect(independentSecurityReviewRow?.[4]).toContain('lead reviewer sign-off matches classification');
    expect(independentSecurityReviewRow?.[4]).toContain(
      'lead reviewer sign-off date is not before review classification Date',
    );
    expect(['Open blocker', 'Checked']).toContain(signerDependencyRow?.[2]);
    expect(signerDependencyRow?.[4]).toContain('Dependency Review Evidence Template');
    expect(signerDependencyRow?.[4]).toContain('npm run dependency:validate');
    expect(signerDependencyRow?.[4]).toContain('Dependency Risk Register');
    expect(signerDependencyRow?.[4]).toContain('ergo-lib-wasm-nodejs');
    expect(signerDependencyRow?.[4]).toContain('sigma-rust ContextExtension serializer');
    expect(signerDependencyRow?.[4]).toContain('upstream signer release');
    expect(signerDependencyRow?.[4]).toContain('upstream signer release validation');
    expect(signerDependencyRow?.[4]).toContain('concrete upstream release identifier');
    expect(signerDependencyRow?.[4]).toContain('JVM/node conformance evidence');
    expect(signerDependencyRow?.[4]).toContain('fail-closed guard/blocker rationale');
    expect(signerDependencyRow?.[4]).toContain('explicit fail-closed guard/blocker release-action evidence');
    expect(signerDependencyRow?.[4]).toContain('completed ContextExtension guard evidence');
    expect(signerDependencyRow?.[4]).toContain('positive JVM golden vectors');
    expect(signerDependencyRow?.[4]).toContain('JVM golden vectors');
    expect(signerDependencyRow?.[4]).toContain('live /transactions/check');
    expect(signerDependencyRow?.[4]).toContain('production-ready claims blocked');
    expect(signerDependencyRow?.[4]).toContain('production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`');
    expect(signerDependencyRow?.[4]).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(signerDependencyRow?.[4]).toContain('vulnerability triage');
    expect(signerDependencyRow?.[4]).toContain('dependency reviewer sign-off matches classification');
    expect(signerDependencyRow?.[4]).toContain('dependency reviewer sign-off date is not before review classification Date');
    expect(signerDependencyRow?.[4]).toContain('completed dependency-review release-note update evidence');
    expect(signerDependencyRow?.[4]).toContain('completed dependency review checklist update evidence');
    expect(signerDependencyRow?.[4]).toContain('distinct completed dependency-review release-note/checklist update evidence targets');
    expect(backupRestoreRow?.[4]).toContain('command-specific evidence');
    expect(backupRestoreRow?.[4]).toContain('local SQLite snapshots');
    expect(backupRestoreRow?.[4]).toContain('npm run backup:snapshot');
    expect(backupRestoreRow?.[4]).toContain('local snapshot comparison');
    expect(backupRestoreRow?.[4]).toContain('npm run backup:compare');
    expect(backupRestoreRow?.[4]).toContain('distinct pre-backup and restored JSON artifacts');
    expect(backupRestoreRow?.[4]).toContain('restored snapshot generated after pre-backup snapshot');
    expect(backupRestoreRow?.[4]).toContain('boundary-specific reconstructibility evidence');
    expect(backupRestoreRow?.[4]).toContain('boundary-specific reconstructibility checks');
    expect(backupRestoreRow?.[4]).toContain('restore target isolation or reviewer approval');
    expect(backupRestoreRow?.[4]).toContain('reviewer approval evidence');
    expect(backupRestoreRow?.[4]).toContain('completed reviewer approval evidence');
    expect(backupRestoreRow?.[4]).toContain('rollback plan evidence');
    expect(backupRestoreRow?.[4]).toContain('stop-condition classifications');
    expect(backupRestoreRow?.[4]).toContain('condition-specific stop-condition evidence');
    expect(backupRestoreRow?.[4]).toContain('reviewer sign-off');
    expect(backupRestoreRow?.[4]).toContain('restore operator sign-off matches drill classification');
    expect(backupRestoreRow?.[4]).toContain('restore operator sign-off date is not before drill classification Date');
    expect(backupRestoreRow?.[4]).toContain('Production-ready claim allowed by this drill: no');
    expect(backupRestoreRow?.[4]).toContain('Testnet production-candidate claim allowed by this drill: no');
    expect(backupRestoreRow?.[4]).toContain('completed Gate 3 backup-restore release-note update evidence');
    expect(backupRestoreRow?.[4]).toContain('completed Gate 3 backup-restore checklist update evidence');
    expect(backupRestoreRow?.[4]).toContain(
      'distinct completed Gate 3 backup-restore release-note/checklist update evidence targets',
    );
    expect(backupRestoreRow?.[4]).toContain('backup-restore git hygiene evidence');
    expect(trustlessBurnRow?.[4]).toContain('concrete 32-byte commitment and burn identifiers');
    expect(trustlessBurnRow?.[4]).toContain('numeric heights and indices');
    expect(trustlessBurnRow?.[4]).toContain('instance-specific positive proof evidence');
    expect(trustlessBurnRow?.[4]).toContain('component-specific trustless properties');
    expect(trustlessBurnRow?.[4]).toContain('unfinalized sidechain block rejection');
    expect(trustlessBurnRow?.[4]).toContain('instance-specific negative proof evidence');
    expect(trustlessBurnRow?.[4]).toContain('concrete 32-byte rejected proof or burn identifiers');
    expect(operatorReadinessRow?.[4]).toContain('Operator Readiness Evidence Template');
    expect(operatorReadinessRow?.[4]).toContain('npm run operator:validate');
    expect(operatorReadinessRow?.[4]).toContain('completed operator readiness evidence');
    expect(operatorReadinessRow?.[4]).toContain('operator readiness validation target');
    expect(operatorReadinessRow?.[4]).toContain('linked runbook coverage');
    expect(operatorReadinessRow?.[4]).toContain('bounded command-purpose text');
    expect(operatorReadinessRow?.[4]).toContain('command-specific operator command evidence');
    expect(operatorReadinessRow?.[4]).toContain('internally positive command output');
    expect(operatorReadinessRow?.[4]).toContain('distinct completed evidence targets across linked runbook, command, drill, and decision rows');
    expect(operatorReadinessRow?.[4]).toContain('completed row evidence that is not an `operator readiness validation target` / `validated target` binding');
    expect(operatorReadinessRow?.[4]).toContain('structured Readiness Classification');
    expect(operatorReadinessRow?.[4]).toContain('decision-specific operational evidence');
    expect(operatorReadinessRow?.[4]).toContain('actionable stop conditions');
    expect(operatorReadinessRow?.[4]).toContain('production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`');
    expect(operatorReadinessRow?.[4]).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(operatorReadinessRow?.[4]).toContain('Operator type = external operator or exchange operations reviewer');
    expect(operatorReadinessRow?.[4]).toContain('non-empty reviewer');
    expect(operatorReadinessRow?.[4]).toContain('ISO Date');
    expect(operatorReadinessRow?.[4]).toContain('Operator-ready claim allowed = yes');
    expect(operatorReadinessRow?.[4]).toContain('Release notes updated = yes');
    expect(operatorReadinessRow?.[4]).toContain('release support with exact `Release supported = production deployment candidate`');
    expect(operatorReadinessRow?.[4]).toContain('operator-ready claim handling');
    expect(operatorReadinessRow?.[4]).toContain('production-ready claim handling');
    expect(operatorReadinessRow?.[4]).toContain('critical incidents');
    expect(operatorReadinessRow?.[4]).toContain('actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement');
    expect(operatorReadinessRow?.[4]).toContain('internally non-contradictory operator reviewer notes');
    expect(operatorReadinessRow?.[4]).toContain('completed operator-readiness release-note update evidence');
    expect(operatorReadinessRow?.[4]).toContain('completed operator-readiness checklist update evidence');
    expect(operatorReadinessRow?.[4]).toContain('distinct completed operator-readiness release-note/checklist update evidence targets');
    expect(operatorReadinessRow?.[4]).toContain('internally non-contradictory operator-readiness publication-update evidence');
    expect(localDevnetRow?.[4]).toContain('reviewer sign-off matches session metadata');
    expect(localDevnetRow?.[4]).toContain('reviewer sign-off date is not before session metadata Date');
    expect(testnetRow?.[4]).toContain('reviewer sign-off matches session metadata');
    expect(testnetRow?.[4]).toContain('reviewer sign-off date is not before session metadata Date');
    expect(failedBroadcastRow?.[4]).toContain('reviewer sign-off matches session metadata');
    expect(failedBroadcastRow?.[4]).toContain('reviewer sign-off date is not before session metadata Date');
    expect(reorgRecoveryRow?.[4]).toContain('reviewer sign-off matches session metadata');
    expect(reorgRecoveryRow?.[4]).toContain('reviewer sign-off date is not before session metadata Date');
    for (const liveRehearsalRow of [localDevnetRow, testnetRow, failedBroadcastRow, reorgRecoveryRow]) {
      expect(liveRehearsalRow?.[4]).toContain('Broadcast mode at start disabled');
      expect(liveRehearsalRow?.[4]).toContain('Broadcast mode at end disabled');
      expect(liveRehearsalRow?.[4]).toContain('Broadcast disabled in all shells');
      expect(liveRehearsalRow?.[4]).toContain('Production-ready claim allowed by this rehearsal: no');
      expect(liveRehearsalRow?.[4]).toContain('Testnet production-candidate claim allowed by this rehearsal: no');
      expect(liveRehearsalRow?.[4]).toContain('distinct completed Gate 3 rehearsal release-note/checklist update evidence targets');
    }
    expect(rowText).toContain('npm run benchmark:validate');
    expect(rowText).toContain('completed benchmark evidence');
    expect(rowText).toContain('benchmark validation target');
    expect(rowText).toContain('npm run integration:validate');
    expect(rowText).toContain('Session Metadata Environment local devnet');
    expect(rowText).toContain('testnet with Session Metadata Environment testnet');
    expect(rowText).toContain('Session Metadata Ergo node network testnet');
    expect(rowText).toContain('clean deployment state evidence');
    expect(rowText).toContain('deployment-state hash');
    expect(rowText).toContain('contract IDs');
    expect(rowText).toContain('singleton inventory');
    expect(rowText).toContain('concrete 32-byte deployment-state hash or digest');
    expect(rowText).toContain('concrete 32-byte contract ID');
    expect(rowText).toContain('concrete 32-byte singleton inventory identifier');
    expect(testnetRow?.[4]).not.toContain('npm run rehearsal:preflight');
    expect(testnetRow?.[4]).not.toContain('distinct rehearsal:preflight transcript/report');
    expect(testnetRow?.[4]).not.toContain('rehearsal:preflight input target');
    expect(testnetRow?.[4]).not.toContain('rehearsal:preflight approvals file target');
    expect(testnetRow?.[4]).not.toContain('npm run rehearsal:offline-gate');
    expect(testnetRow?.[4]).not.toContain('rehearsal:offline-gate PASS output');
    expect(testnetRow?.[4]).not.toContain('npm run rehearsal:prep-bundle');
    expect(testnetRow?.[4]).not.toContain('rehearsal:prep-bundle PASS output');
    expect(testnetRow?.[4]).toContain('rehearsal:external-fee-live-preflight producer');
    expect(testnetRow?.[4]).toContain('distinct rehearsal:external-fee-live-preflight transcript/report');
    expect(testnetRow?.[4]).toContain('rehearsal:external-fee-live-preflight PASS output');
    expect(testnetRow?.[4]).toContain('external-fee live-preflight input target');
    expect(testnetRow?.[4]).toContain('external-fee live-preflight approvals file target');
    expect(testnetRow?.[4]).toContain('Settlement profile ID = authenticated-external-fee-v1');
    expect(testnetRow?.[4]).toContain('Profile activation status = ACTIVATED');
    expect(testnetRow?.[4]).toContain('Legacy V1 transport = quarantined');
    expect(testnetRow?.[4]).toContain('same Expected transaction ID');
    expect(testnetRow?.[4]).toContain(
      'approved burn hashes match post-submit burnOrder and live-preflight approvalBinding.burnTxHashes',
    );
    expect(testnetRow?.[4]).toContain('scoped shell evidence');
    expect(testnetRow?.[4]).toContain('Sidechain network non-mainnet');

    for (const item of requiredEvidenceItems) {
      expect(rowText, item).toContain(item);
    }
  });

  it('keeps the real release checklist blocked until pending evidence is resolved', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const cleanCheckoutEvidenceTarget = '../evidence/ci/completed-clean-checkout-2026-05-31-9e3921cb.md';
    const cleanCheckoutEvidenceMarkdown = readFileSync(
      join(bridgeRoot, 'evidence', 'ci', 'completed-clean-checkout-2026-05-31-9e3921cb.md'),
      'utf8',
    );
    const dependencyReviewEvidenceTarget = '../evidence/dependencies/completed-dependency-review-2026-05-31-2ba7c3fb.md';
    const dependencyReviewEvidenceMarkdown = readFileSync(
      join(bridgeRoot, 'evidence', 'dependencies', 'completed-dependency-review-2026-05-31-2ba7c3fb.md'),
      'utf8',
    );
    const backupRestoreEvidenceTarget = '../evidence/recovery/completed-backup-restore-2026-05-31-99e98fff.md';
    const backupRestoreEvidenceMarkdown = readFileSync(
      join(bridgeRoot, 'evidence', 'recovery', 'completed-backup-restore-2026-05-31-99e98fff.md'),
      'utf8',
    );
    const operatorReadinessEvidenceTarget = '../evidence/operators/completed-operator-readiness-2026-06-04-9e3921cb.md';
    const operatorReadinessEvidenceMarkdown = readFileSync(
      join(bridgeRoot, 'evidence', 'operators', 'completed-operator-readiness-2026-06-04-9e3921cb.md'),
      'utf8',
    );
    const externalIntegrationEvidenceTarget = '../evidence/integration/completed-external-integration-review-2026-06-04-9e3921cb.md';
    const externalIntegrationEvidenceMarkdown = readFileSync(
      join(bridgeRoot, 'evidence', 'integration', 'completed-external-integration-review-2026-06-04-9e3921cb.md'),
      'utf8',
    );
    const result = evaluateReleaseGate(checklist, {
      cleanCheckoutEvidenceValidation: {
        target: cleanCheckoutEvidenceTarget,
        ...validateCleanCheckoutEvidence(cleanCheckoutEvidenceMarkdown),
      },
      dependencyReviewEvidenceValidation: {
        target: dependencyReviewEvidenceTarget,
        ...validateDependencyReviewEvidence(dependencyReviewEvidenceMarkdown),
      },
      backupRestoreEvidenceValidation: {
        target: backupRestoreEvidenceTarget,
        ...validateBackupRestoreEvidence(backupRestoreEvidenceMarkdown),
      },
      operatorReadinessEvidenceValidation: {
        target: operatorReadinessEvidenceTarget,
        ...validateOperatorReadinessEvidence(operatorReadinessEvidenceMarkdown),
      },
      externalIntegrationEvidenceValidation: {
        target: externalIntegrationEvidenceTarget,
        ...validateExternalIntegrationEvidence(externalIntegrationEvidenceMarkdown),
      },
    });
    const expectedUnresolvedBlockers = parsePendingEvidenceRows(checklist).filter(row =>
      row[2] !== 'Checked' && /\bPublication blocker\b/.test(row[3]),
    ).length;

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toHaveLength(expectedUnresolvedBlockers);
    expect(result.rowCount).toBe(REQUIRED_PENDING_EVIDENCE_ROWS.length);
    expect(result.issues).toEqual([]);
    expect(result.message).toContain(
      `${expectedUnresolvedBlockers}/${REQUIRED_PENDING_EVIDENCE_ROWS.length} pending evidence rows still block publication; 0 structural issue(s).`,
    );
  });

  it('runs evidence hygiene checks in every completed-evidence validator', () => {
    const validatorFiles = [
      'backup-restore-evidence.ts',
      'benchmark-evidence.ts',
      'clean-checkout-evidence.ts',
      'committee-governance-evidence.ts',
      'dependency-review-evidence.ts',
      'external-integration-evidence.ts',
      'operator-readiness-evidence.ts',
      'rehearsal-evidence.ts',
      'release-notes-evidence.ts',
      'security-review-evidence.ts',
      'technical-addendum-evidence.ts',
      'trustless-burn-evidence.ts',
    ];

    for (const file of validatorFiles) {
      const source = readFileSync(join(srcRoot, file), 'utf8');
      expect(source, file).toMatch(
        /import\s+\{[^}]*\bvalidateEvidenceHygiene\b[^}]*\}\s+from\s+['"]\.\/evidence-hygiene\.js['"];?/,
      );
      expect(source, file).toContain('validateEvidenceHygiene(markdown');
    }
  });

  it('keeps evidence validator scripts behind the target-path guard', () => {
    const validatorScripts = [
      'validate-backup-restore-evidence.ts',
      'validate-benchmark-evidence.ts',
      'validate-clean-checkout-evidence.ts',
      'validate-committee-governance-evidence.ts',
      'validate-dependency-review-evidence.ts',
      'validate-external-integration-evidence.ts',
      'validate-operator-readiness-evidence.ts',
      'validate-rehearsal-evidence.ts',
      'validate-release-notes.ts',
      'validate-security-review-evidence.ts',
      'validate-technical-addendum-evidence.ts',
      'validate-trustless-burn-evidence.ts',
    ];

    for (const file of validatorScripts) {
      const source = readFileSync(join(srcRoot, 'scripts', file), 'utf8');
      expect(source, file).toContain("import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';");
      expect(source, file).toContain('readEvidenceMarkdownTarget(target)');
      expect(source, file).toContain('const { errors, label, markdown }');
      expect(source, file).toContain('evidence target BLOCKED');
      expect(source, file).not.toContain('`${target}:');
      expect(source, file).not.toContain('readFileSync');
    }
  });

  it('keeps the security evidence matrix tied to existing tests and cautious claims', () => {
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const requiredEvidenceFiles = [
      '.github/workflows/relayer-checks.yml',
      '.gitignore',
      'docs/aggregate-settlement-threat-model.md',
      'docs/dependency-risk-register.md',
      'docs/independent-security-review-scope.md',
      'docs/independent-security-review-evidence-template.md',
      'docs/committee-governance-evidence-template.md',
      'relayer/src/committee-governance-evidence.test.ts',
      'docs/backup-restore-evidence-template.md',
      'docs/live-rehearsal-template.md',
      'docs/operator-runbooks.md',
      'docs/release-checklist.md',
      'docs/trustless-burn-verification-plan.md',
      'docs/ultimate-bridge-roadmap.md',
      'relayer/src/aggregate-anchor.test.ts',
      'relayer/src/aggregate-settlement-service.test.ts',
      'relayer/src/backup-restore-evidence.test.ts',
      'relayer/src/backup-restore-snapshot.test.ts',
      'relayer/src/broadcast-policy.test.ts',
      'relayer/src/broadcast-surface.test.ts',
      'relayer/src/context-extension-guard.test.ts',
      'relayer/src/contract-invariants.test.ts',
      'relayer/src/live-settlement-readiness.test.ts',
      'relayer/src/node-wallet-isolation.test.ts',
      'relayer/src/publication-hygiene.test.ts',
      'relayer/src/security-review-evidence.test.ts',
      'relayer/src/state-tracker.test.ts',
      'relayer/src/testnet-rehearsal-preflight.test.ts',
      'relayer/src/testnet-rehearsal-live-preflight.test.ts',
      'relayer/src/testnet-rehearsal-live-preflight.ts',
      'relayer/src/scripts/testnet-rehearsal-live-preflight.ts',
      'relayer/src/testnet-fresh-checkpoint.ts',
      'relayer/src/testnet-fresh-checkpoint.test.ts',
      'relayer/src/scripts/testnet-fresh-checkpoint.ts',
      'wasm-avl/src/lib.rs',
    ];

    expect(checklist).toContain('security-evidence-matrix.md');
    expect(matrix).toContain('not an independent audit');
    expect(matrix).toContain('not a production-ready statement');
    expect(matrix).toContain('Open blocker');
    expect(matrix).toContain('Pending rehearsal');
    expect(matrix).toContain('npm run wasm:test');
    expect(matrix).toContain('Independent review readiness');
    expect(matrix).toContain('boundary-specific reconstructibility checks');
    expect(matrix).toContain('condition-specific stop-condition evidence');
    expect(matrix).toContain('component-specific trustless properties');
    expect(matrix).not.toContain('distinct rehearsal:preflight transcript/report');
    expect(matrix).not.toContain('rehearsal:preflight input target');
    expect(matrix).not.toContain('rehearsal:preflight approvals file target');
    expect(matrix).toContain('rehearsal:external-fee-live-preflight producer');
    expect(matrix).toContain('distinct rehearsal:external-fee-live-preflight transcript/report');
    expect(matrix).toContain('rehearsal:external-fee-live-preflight PASS output');
    expect(matrix).toContain('external-fee live-preflight input target');
    expect(matrix).toContain('external-fee live-preflight approvals file target');
    expect(matrix).toContain('Settlement profile ID = authenticated-external-fee-v1');
    expect(matrix).toContain('Profile activation status = ACTIVATED');
    expect(matrix).toContain('Legacy V1 transport = quarantined');
    expect(matrix).toContain('same Expected transaction ID');
    expect(matrix).toContain('Sidechain network non-mainnet');
    expect(readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8')).toContain(
      'Fresh Ergo testnet lifecycle release-gate evidence now requires a separately',
    );

    for (const evidence of requiredEvidenceFiles) {
      expect(matrix, evidence).toContain(evidence);
      expect(existsSync(join(bridgeRoot, evidence)), evidence).toBe(true);
    }
  });

  it('keeps the aggregate settlement threat model tied to required risk classes', () => {
    const threatModel = readFileSync(
      join(bridgeRoot, 'docs', 'aggregate-settlement-threat-model.md'),
      'utf8',
    );
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const sections = extractThreatFindingSections(threatModel);
    const requiredFindingHeadings = [
      '### 1. Phantom Burn Remains Transitional',
      '### 2. ContextExtension Consensus Is Guarded, Not Released',
      '### 3. Broadcast Must Remain Explicit',
      '### 4. Anchor Height Drift Can Break Tracker Proofs',
      '### 5. Local SQLite Is Still Critical State',
      '### 6. Singleton NFT Loss Is Catastrophic',
      '### 7. Mempool Height Exactness Can Make Valid Transactions Unmineable',
      '### 8. Batch Settlement Must Not Weaken Duplicate Prevention',
    ];
    const requiredRegistryRows = [
      'Phantom burn',
      'ContextExtension divergence',
      'Anchor drift',
      'Broadcast mistake',
      'Mempool HEIGHT exactness',
    ];
    const malformedSections = sections.flatMap(section => {
      const heading = section.split(/\r?\n/, 1)[0];
      const missingSubsections = [
        'Risk:',
        'Current mitigations:',
        'Open blocker:',
        'Publication status:',
      ]
        .filter(label => !section.includes(label))
        .map(label => `${heading}: ${label}`);
      return missingSubsections;
    });

    expect(checklist).toContain('aggregate-settlement-threat-model.md');
    expect(matrix).toContain('docs/aggregate-settlement-threat-model.md');
    expect(roadmap).toContain('docs/aggregate-settlement-threat-model.md');
    expect(sections.map(section => section.split(/\r?\n/, 1)[0])).toEqual(
      requiredFindingHeadings,
    );
    expect(malformedSections).toEqual([]);

    for (const row of requiredRegistryRows) {
      expect(threatModel, row).toContain(row);
    }
  });

  it('keeps the independent security review scope tied to required review areas', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const scope = readFileSync(
      join(bridgeRoot, 'docs', 'independent-security-review-scope.md'),
      'utf8',
    );
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'independent-security-review-evidence-template.md'),
      'utf8',
    );
    const requiredSections = [
      '## Review Objective',
      '## Required Scope',
      '## Required Evidence Package',
      '## Finding Format',
      '## Required Negative Review Checks',
      '## Exit Criteria',
    ];
    const requiredTemplateSections = [
      '## Review Classification',
      '## Required Scope Coverage',
      '## Required Evidence Package',
      '## Finding Disposition',
      '## Required Negative Review Checks',
      '## Publication Decision',
      '## Reviewer Sign-Off',
    ];
    const requiredTerms = [
      'This is not an audit report.',
      'ErgoScript contracts',
      'Relayer signing',
      'AVL proof generation',
      'Settlement reconciliation',
      'Sidechain finality and burn validity',
      'Operator recovery',
      'Dependency risk',
      'Can a production path sign through the Ergo node wallet?',
      'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
      'Can a failed broadcast or reorg insert a phantom DUP key',
      'Can a trusted burn interpretation be mistaken for trustless burn verification',
      'Critical / High / Medium / Low / Informational',
      'npm run security:validate',
      'Independent Security Review Evidence Template',
      'The final report passes `npm run security:validate`',
    ];
    const requiredTemplateTerms = [
      'This is not a production-ready claim.',
      'Review period must use `YYYY-MM-DD to YYYY-MM-DD`',
      'review period end date must not be after `Date`',
      'Reviewer independence',
      'independent external',
      'Reviewer organization type',
      'external audit firm',
      'independent security researcher',
      'exchange security team',
      'Internal or maintainer-led review cannot close',
      'Clean checkout CI run',
      '`npm run check` output',
      '`npm run wasm:test` output',
      'Fresh local devnet rehearsal',
      'SQLite/AVL backup-restore drill',
      'Each linked artifact must identify the specific evidence item it closes',
      'Generic security-review artifacts are not enough',
      'Reviewer notes must state a concrete outcome',
      'generic `reviewed` notes are not enough',
      'Critical findings',
      'High findings',
      'Open critical/high',
      'Risk focus reviewed',
      'generic scope notes such as `reviewed` are not enough',
      'completed review evidence markers',
      'non-template evidence link',
      'bare validator command names',
      'row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'not completed review evidence',
      'Required release-note updates',
      'accepted-risk checklist updates',
      'accepted-risk release-note updates',
      'Reviewer decision summary',
      'release support, production-ready',
      'Release supported = production deployment candidate',
      'release-note update rows must link',
      'HEIGHT / singleton / payout binding',
      'node-wallet / ContextExtension / broadcast signing',
      'SQLite backup / restore / reconstructibility / runbook',
      '`Count` values must be',
      '`Open critical/high` values must be',
      'narrative notes such as `reviewed` are not counts',
      'Publication Decision `Critical/high findings open` field must be the exact',
      'textual equivalents such as `none`, `no`,',
      '`closed`, `resolved`, or `mitigated`, and numeric shorthand',
      'not close Gate 4 reviewer decision',
      'Critical/high finding closure in this summary',
      'must use exact',
      '`Critical/high findings open = 0`',
      'numeric shorthand without `= 0`',
      'The `Publication blockers` count must be',
      'Publication blockers = 0',
      'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
      'Can trusted burn interpretation be mistaken for trustless verification?',
      'Production-ready claim allowed',
      'Testnet production-candidate claim allowed',
      '`Production-ready claim allowed` must stay `no`',
      '`Testnet production-candidate claim allowed = yes`',
      'final decision and every reviewer sign-off must be',
      'Lead reviewer` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Review Classification `Date`',
      'Reviewer notes must state a concrete security-review outcome',
      'critical/high findings',
      '`reviewed report` are not enough',
      'accepted risks and blockers were copied',
      'The blank template is expected to fail validation.',
      'Unsafe-path answers must',
      'no / cannot / rejected / blocked',
      'yes / recoverable',
      'pending / linked / blocker',
    ];

    expect(checklist).toContain('independent-security-review-scope.md');
    expect(checklist).toContain('independent-security-review-evidence-template.md');
    expect(checklist).toContain('npm run security:validate');
    expect(checklist).toContain('completed independent security review evidence');
    expect(checklist).toContain('security review validation target');
    expect(checklist).toContain('required scope coverage');
    expect(checklist).toContain('required evidence package');
    expect(checklist).toContain('item-specific evidence-package artifact links');
    expect(checklist).toContain('finding disposition');
    expect(checklist).toContain('required negative review checks');
    expect(checklist).toContain('question-specific negative-check evidence');
    expect(checklist).toContain('distinct completed evidence targets across linked scope, evidence-package, finding, and negative-check rows');
    expect(checklist).toContain('area-specific risk-focus');
    expect(checklist).toContain('dependency risk');
    expect(checklist).toContain('external reviewer organization type');
    expect(checklist).toContain('ISO review period');
    expect(checklist).toContain('critical/high findings open');
    expect(checklist).toContain('exact numeric');
    expect(checklist).toContain('`Critical/high findings open = 0`');
    expect(checklist).toContain('reviewer-summary critical/high finding closure with exact');
    expect(checklist).toContain('numeric shorthand without `= 0`');
    expect(checklist).toContain('`none`, `no`, `closed`, `resolved`,');
    expect(checklist).toContain('`mitigated`, or `n/a`, and numeric shorthand');
    expect(checklist).toContain('Publication blockers = 0');
    expect(checklist).toContain('accepted-risk checklist updates');
    expect(checklist).toContain('accepted-risk release-note updates');
    expect(checklist).toContain('completed Gate 4 accepted-risk checklist update evidence');
    expect(checklist).toContain('completed Gate 4 accepted-risk release-note update evidence');
    expect(checklist).toContain('distinct completed Gate 4 accepted-risk checklist/release-note update evidence targets');
    expect(checklist).toContain('reviewer decision summary');
    expect(checklist).toContain('release support');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('critical/high findings');
    expect(checklist).toContain('accepted risks');
    expect(checklist).toContain('lead reviewer binding');
    expect(checklist).toContain('reviewer notes that keep finding and accepted-risk boundaries');
    expect(checklist).toContain('internally non-contradictory security reviewer notes');
    expect(checklist).toContain('internally non-contradictory security publication-update evidence');
    expect(checklist).toContain('lead reviewer sign-off');
    expect(checklist).toContain('lead reviewer sign-off date');
    expect(matrix).toContain('docs/independent-security-review-scope.md');
    expect(matrix).toContain('docs/independent-security-review-evidence-template.md');
    expect(matrix).toContain('relayer/src/security-review-evidence.test.ts');
    expect(matrix).toContain('relayer/src/release-gate.test.ts');
    expect(matrix).toContain('--security-review-evidence');
    expect(matrix).toContain('completed independent security review evidence');
    expect(matrix).toContain('security review validation target');
    expect(matrix).toContain('required scope coverage');
    expect(matrix).toContain('required evidence package');
    expect(matrix).toContain('item-specific evidence-package artifact links');
    expect(matrix).toContain('finding disposition');
    expect(matrix).toContain('required negative review checks');
    expect(matrix).toContain('question-specific negative-check evidence');
    expect(matrix).toContain('distinct completed evidence targets across linked scope, evidence-package, finding, and negative-check rows');
    expect(matrix).toContain('area-specific risk-focus');
    expect(matrix).toContain('dependency risk');
    expect(matrix).toContain('external reviewer organization type');
    expect(matrix).toContain('specific external security reviewer organization or affiliation');
    expect(matrix).toContain('ISO review period');
    expect(matrix).toContain('Critical/high findings open = 0');
    expect(matrix).toContain('Publication blockers = 0');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('Testnet production-candidate claim allowed = yes');
    expect(matrix).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(matrix).toContain('testnet production-candidate claim handling');
    expect(matrix).toContain('accepted-risk checklist updates');
    expect(matrix).toContain('accepted-risk release-note updates');
    expect(matrix).toContain('completed Gate 4 accepted-risk checklist update evidence');
    expect(matrix).toContain('completed Gate 4 accepted-risk release-note update evidence');
    expect(matrix).toContain('distinct completed Gate 4 accepted-risk checklist/release-note update evidence targets');
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('release support');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('critical/high findings');
    expect(matrix).toContain('accepted risks');
    expect(matrix).toContain('lead reviewer binding');
    expect(matrix).toContain('reviewer notes that keep finding and accepted-risk boundaries');
    expect(matrix).toContain('internally non-contradictory security reviewer notes');
    expect(matrix).toContain('internally non-contradictory security publication-update evidence');
    expect(matrix).toContain('lead reviewer sign-off');
    expect(matrix).toContain('lead reviewer sign-off date is not before review classification Date');
    expect(roadmap).toContain('docs/independent-security-review-scope.md');
    expect(roadmap).toContain('docs/independent-security-review-evidence-template.md');
    expect(roadmap).toContain('area-specific risk-focus');
    expect(roadmap).toContain('evidence-package artifacts now must identify the specific');
    expect(roadmap).toContain('accepted-risk checklist updates');
    expect(roadmap).toContain('lead-reviewer sign-off now must match');
    expect(roadmap).toContain('lead-reviewer sign-off dates now must use ISO');

    for (const section of requiredSections) {
      expect(scope).toContain(section);
    }

    for (const section of requiredTemplateSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTerms) {
      expect(scope, term).toContain(term);
    }

    for (const term of requiredTemplateTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps the trustless burn verification blocker concrete and non-claiming', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const plan = readFileSync(
      join(bridgeRoot, 'docs', 'trustless-burn-verification-plan.md'),
      'utf8',
    );
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'trustless-burn-verification-evidence-template.md'),
      'utf8',
    );
    const requiredSections = [
      '## Goal',
      '## Required Components',
      '## Proof Shape',
      '## Acceptance Gates',
      '## Evidence Capture',
      '## Publication Rules',
    ];
    const requiredTemplateSections = [
      '## Evidence Classification',
      '## Required Components',
      '## Commitment Format',
      '## Burn Proof Binding',
      '## Local Proof Vector',
      '## Positive Proof Acceptance',
      '## Negative Tests',
      '## Publication Decision',
      '## Reviewer Sign-Off',
    ];
    const requiredTerms = [
      'This plan defines the production-grade target',
      'it is not implemented yet',
      'not a production-ready claim',
      'transitional PoC path',
      'sidechain block commitment was embedded into an Ergo extension section',
      'SPV relay',
      'Burn commitment tree',
      'Burn inclusion proof',
      'DUP settlement binding',
      'avoid an Ethereum receipt/Keccak dependency',
      'Blake2b-compatible hashing',
      '0x04xx',
      'sidechainId',
      'recipientErgoTreeHash',
      'amountNanoErg',
      'trustless-burn-proof-vector.ts',
      'trustless-burn-proof-v1.json',
      'trustless-burn-proof-v1-multi-leaf.json',
      'npm run trustless:proof-vector:validate',
      '--json-out <report.json>',
      'Proof-vector validation report',
      'Positive proof acceptance evidence binds the same',
      'wrong sidechain ID, recipient, amount, burn ID',
      'Reorg drills',
      'Independent review',
      '"Trustless bridge" and "production-ready bridge" claims remain blocked.',
      'trustless-burn-verification-evidence-template.md',
      'npm run trustless:validate',
    ];
    const requiredTemplateTerms = [
      'not proof that production readiness is complete',
      'Do not paste `.env` contents',
      'trustless burn proof path',
      'transitional trusted burn path',
      'component-specific trustless property',
      'generic notes such as `reviewed` or `tested` are not enough',
      'completed trustless burn evidence markers',
      'non-template evidence link',
      'bare validator command names',
      'not completed trustless burn evidence',
      'row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'Local Proof Vector',
      'fenced `json` block',
      'trustless-burn-proof.ts',
      'trustless-burn-proof-v1-multi-leaf.json',
      'npm run trustless:proof-vector:validate',
      '--json-out <report.json>',
      'Proof-vector validation report',
      'duplicatePreventionKeyHex',
      'bridgeEventRootHex',
      'does not prove sidechain consensus or finality',
      'not completed Gate 5 evidence by itself',
      'Positive Proof Acceptance',
      'Valid burn proof acceptance',
      'accepted burn proof execution',
      'inclusion or membership proof',
      'settlement payout binding',
      'accepted burn ID',
      'settlement transaction binding',
      'recipient binding',
      'amount binding',
      'same instance values',
      '`bridgeEventRoot` from Commitment Format plus `burnId`',
      '`recipientErgoTreeHash`, and `amountNanoErg`',
      'Required release checklist updates',
      'completed Gate 5 checklist update evidence',
      'Required release-note updates',
      'completed Gate 5 release-note update evidence',
      'publication-update evidence',
      'Sidechain commitment format',
      'Ergo extension-section anchoring',
      'Sidechain header/finality verifier',
      'SPV relay contract or tracker',
      'Burn commitment tree',
      'Burn inclusion proof',
      'DUP settlement binding',
      'Wrong sidechain ID',
      'Wrong recipient',
      'Wrong amount',
      'Reused burn ID',
      'Reorged sidechain block',
      'Unfinalized sidechain block',
      'Stale SPV tracker digest',
      'Trusted-oracle fallback presented as trustless',
      'Trustless burn verification implemented',
      'Production-ready claim allowed',
      'Production deployment candidate evidence requires `Testnet production-candidate claim allowed = yes`',
      'Transitional trusted burn path disabled',
      'summary must use exact `Critical/high findings open = 0`',
      'numeric shorthand without',
      'When `Critical/high findings open = 0`, both publication-update fields must',
      'include exact `Critical/high findings open = 0`',
      'numeric `Critical/high findings open = 0` for critical/high finding closure',
      'Release supported = production deployment candidate',
      'Transitional trusted burn path closure in this summary must use exact',
      'trustless burn verification implementation',
      'production-ready claim handling',
      'transitional trusted burn path handling',
      'critical/high findings',
      'requires `commitmentPrefix` to identify the `0x04xx`',
      '`sidechainId`, `sidechainHeaderHash`, and `bridgeEventRoot`',
      'exactly one 32-byte hex value',
      '`ergoAnchorHeight` to be non-negative integers',
      'requires field-specific binding text for recipient, amount',
      '`burnId`, `recipientErgoTreeHash`, `sidechainTxHash`',
      '`amountNanoErg` must include exactly one positive nanoERG',
      '`eventIndex` must include exactly one non-negative integer',
      'exactly one non-negative integer',
      'npm run trustless:validate',
      'The blank template is expected to fail validation.',
      'required components, commitment fields, burn proof binding, positive proof',
      'Rows marked `linked` must use fail-closed expected results',
      'evidence cell must also identify the rejected burn proof fact',
      'Every linked negative-test row must also include at least one concrete 32-byte',
      'rejected proof or burn identifier',
      'category-only rejection notes cannot close',
      'wrong recipient, wrong amount',
      'stale SPV tracker digest',
      'trusted-oracle fallback',
      'rejected',
      'blocked',
      'refused',
      'Reviewer notes must state a concrete trustless-burn outcome',
      'Protocol reviewer` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Evidence Classification `Date`',
      'DUP duplicate prevention',
      'trusted-oracle fallback rejection',
      '`reviewed Gate 5 evidence` are not enough',
      'pending / linked / blocker',
    ];

    expect(checklist).toContain('trustless-burn-verification-plan.md');
    expect(checklist).toContain('trustless-burn-verification-evidence-template.md');
    expect(checklist).toContain('npm run trustless:validate');
    expect(checklist).toContain('completed trustless burn evidence');
    expect(checklist).toContain('trustless burn validation target');
    expect(checklist).toContain('relayer/src/trustless-burn-evidence.test.ts');
    expect(checklist).toContain('relayer/src/trustless-burn-proof-vector.ts');
    expect(checklist).toContain('relayer/test-vectors/trustless-burn-proof-v1.json');
    expect(checklist).toContain('relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json');
    expect(checklist).toContain('npm run trustless:proof-vector:validate');
    expect(checklist).toContain('evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-05-31.json');
    expect(checklist).toContain('evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-04-e155b203.json');
    expect(checklist).toContain('evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-04-e155b203.md');
    expect(checklist).toContain('npm run trustless:candidate');
    expect(checklist).toContain('npm run trustless:candidate:validate');
    expect(checklist).toContain('relayer/src/trustless-settlement-candidate.ts');
    expect(checklist).toContain('relayer/src/aggregate-settlement-candidate-evidence-json.ts');
    expect(checklist).toContain('Proof-vector validation report');
    expect(checklist).toContain('linked completed `Proof-vector validation report` JSON target consumed by');
    expect(checklist).toContain('Proof-vector validation report target is not reused as completed row or publication-update evidence');
    expect(checklist).toContain('non-empty structured inclusion proof nodes');
    expect(checklist).toContain('Local Proof Vector evidence passes');
    expect(checklist).toContain('completed Gate 5 release-note update evidence');
    expect(checklist).toContain('completed Gate 5 checklist update evidence');
    expect(checklist).toContain('positive proof acceptance evidence');
    expect(checklist).toContain('instance-specific positive proof evidence');
    expect(checklist).toContain('positive proof instance values match commitment and burn binding rows');
    expect(checklist).toContain('positive amountNanoErg burn amount');
    expect(checklist).toContain('reviewer decision summary');
    expect(checklist).toContain('release support');
    expect(checklist).toContain('classified `Broadcast mode` to be `disabled` or `dry-run`');
    expect(checklist).toContain('Trustless burn verification implemented = yes');
    expect(checklist).toContain('Production-ready claim allowed = no');
    expect(checklist).toContain('Testnet production-candidate claim allowed = yes');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('Transitional trusted burn path disabled = yes');
    expect(checklist).toContain('Critical/high findings open = 0');
    expect(checklist).toContain('exact numeric');
    expect(checklist).toContain('mandatory transitional-path publication-update binding');
    expect(checklist).toContain('reviewer decision summaries that close this boundary');
    expect(checklist).toContain('`none`, `no`, `closed`, `resolved`,');
    expect(checklist).toContain('numeric shorthand without `= 0`, do not');
    expect(checklist).toContain('Gate 5 publication-update fields include exact');
    expect(checklist).toContain('`Critical/high findings open` field is `0`');
    expect(checklist).toContain('exact numeric `Critical/high findings open = 0` for critical/high finding');
    expect(checklist).toContain('Release notes updated = yes');
    expect(checklist).toContain('protocol reviewer sign-off matches evidence classification');
    expect(checklist).toContain('protocol reviewer sign-off date is not before evidence classification Date');
    expect(matrix).toContain('docs/trustless-burn-verification-plan.md');
    expect(matrix).toContain('docs/trustless-burn-verification-evidence-template.md');
    expect(matrix).toContain('relayer/src/trustless-burn-evidence.test.ts');
    expect(matrix).toContain('relayer/src/release-gate.test.ts');
    expect(matrix).toContain('--trustless-burn-evidence');
    expect(matrix).toContain('completed trustless burn evidence');
    expect(matrix).toContain('trustless burn validation target');
    expect(matrix).toContain('relayer/src/trustless-burn-proof-vector.ts');
    expect(matrix).toContain('relayer/test-vectors/trustless-burn-proof-v1.json');
    expect(matrix).toContain('relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json');
    expect(matrix).toContain('relayer/test-vectors/trustless-burn-evidence-local-proof-vector-report.json');
    expect(matrix).toContain('evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-04-e155b203.json');
    expect(matrix).toContain('evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-04-e155b203.md');
    expect(matrix).toContain('npm run trustless:proof-vector:validate');
    expect(matrix).toContain('npm run trustless:candidate');
    expect(matrix).toContain('npm run trustless:candidate:validate');
    expect(matrix).toContain('relayer/src/trustless-settlement-candidate.ts');
    expect(matrix).toContain('relayer/src/aggregate-settlement-candidate-evidence-json.ts');
    expect(matrix).toContain('Local Proof Vector evidence validated by `trustless-burn-proof.ts`');
    expect(matrix).toContain('linked completed `Proof-vector validation report` JSON target consumed by');
    expect(matrix).toContain('`Proof-vector validation report` JSON target consumed by');
    expect(matrix).toContain('Proof-vector validation report target is not reused as completed row or publication-update evidence');
    expect(matrix).toContain('non-empty structured inclusion proof nodes');
    expect(matrix).toContain('completed Gate 5 release-note update evidence');
    expect(matrix).toContain('completed Gate 5 checklist update evidence');
    expect(matrix).toContain('positive proof acceptance evidence');
    expect(matrix).toContain('instance-specific positive proof evidence');
    expect(matrix).toContain('positive proof instance values match commitment and burn binding rows');
    expect(matrix).toContain('concrete 32-byte commitment and burn identifiers');
    expect(matrix).toContain('numeric heights and indices');
    expect(matrix).toContain('positive amountNanoErg burn amount');
    expect(matrix).toContain('unfinalized sidechain block rejection');
    expect(matrix).toContain('instance-specific negative proof evidence');
    expect(matrix).toContain('concrete 32-byte rejected proof or burn identifiers');
    expect(matrix).toContain('production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`');
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('release support');
    expect(roadmap).toContain('trustless burn evidence to expose classified');
    expect(roadmap).toContain('Broadcast mode = disabled');
    expect(matrix).toContain('Trustless burn verification implemented = yes');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('Testnet production-candidate claim allowed = yes');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('Transitional trusted burn path disabled = yes');
    expect(matrix).toContain('Critical/high findings open = 0');
    expect(matrix).toContain('Release notes updated = yes');
    expect(matrix).toContain('protocol reviewer sign-off matches evidence classification');
    expect(matrix).toContain('protocol reviewer sign-off date is not before evidence classification Date');
    expect(roadmap).toContain('docs/trustless-burn-verification-plan.md');
    expect(roadmap).toContain('docs/trustless-burn-verification-evidence-template.md');
    expect(plan).toContain('npm run trustless:candidate');
    expect(plan).toContain('npm run trustless:candidate:validate');
    expect(plan).toContain('candidate-only evidence');
    expect(plan).toContain('does not replace completed');
    expect(plan).toContain('V2 contract verification');
    expect(roadmap).toContain('positive proof acceptance evidence');
    expect(roadmap).toContain('positive proof acceptance evidence now also must identify');
    expect(roadmap).toContain('positive proof acceptance evidence now must match the instance values');
    expect(roadmap).toContain('Local Proof Vector JSON block');
    expect(roadmap).toContain('Proof-vector validation report');
    expect(roadmap).toContain('fails closed if the');
    expect(roadmap).toContain('report is missing, non-PASS');
    expect(roadmap).toContain('Trustless burn reviewer decision summaries now must mention release support');
    expect(roadmap).toContain('Trustless burn protocol reviewer sign-off now must match');
    expect(roadmap).toContain('Trustless burn protocol reviewer sign-off dates now must use ISO');
    expect(roadmap).toContain('executable');
    expect(releaseNotes).toContain('trustless-burn-verification-evidence-template.md');
    expect(matrix).toContain('Phantom burn trust minimization');
    expect(matrix).toContain('Open blocker');

    for (const section of requiredSections) {
      expect(plan).toContain(section);
    }

    for (const section of requiredTemplateSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTerms) {
      expect(plan, term).toContain(term);
    }

    for (const term of requiredTemplateTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps Gate 7 performance benchmark evidence structured and non-claiming', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'performance-benchmark-evidence-template.md'),
      'utf8',
    );
    const requiredSections = [
      '## Benchmark Classification',
      '## Required Commands',
      '## Metric Table',
      '## Sharded Lane Evidence',
      '## Bottleneck Register',
      '## Claims Boundary',
      '## Publication Decision',
      '## Reviewer Sign-Off',
    ];
    const requiredTerms = [
      'not a production throughput claim',
      'Do not paste `.env` contents',
      'npm run showcase:benchmark',
      'npm run showcase:lanes',
      'npm run showcase:proofs',
      'npm run showcase:finality',
      'npm run check',
      'npm run wasm:test',
      'npm run benchmark:validate',
      'Machine profile',
      'Node version',
      'Rust version',
      'wasm-pack version',
      'Benchmark metrics without this reproducibility',
      'Single-claim settlement baseline',
      'Batch settlement',
      'Sharded lanes planner',
      'Sample count',
      'sample count of at least 3',
      'Build time',
      'Proof size',
      'Transaction size',
      'Cost-relevant counts',
      '`inputs=`',
      '`outputs=`',
      '`vars=`',
      '`batch=`',
      'exactly one positive numeric',
      'duplicate or conflicting count keys are blockers',
      'Throughput',
      'Latency',
      'Linked metric rows must include positive numeric',
      'scenario-specific evidence',
      'single-claim settlement baseline',
      'sharded lanes planner',
      'Linked sharded-lane rows and bottleneck current-evidence rows must',
      'completed benchmark evidence markers',
      'non-template evidence link',
      'bare validator command names',
      'not completed benchmark evidence',
      '`Live batch settlement` must link',
      'offline showcase output',
      'user explicit live broadcast approval evidence',
      'Expected transaction ID',
      'scoped `BRIDGE_BROADCAST_ENABLED=true` evidence',
      'post-enable `npm run demo:readiness` PASS evidence',
      'Broadcast policy',
      'Live settlement signing',
      'broadcast network',
      'concrete 32-byte',
      'transaction ID or reconciliation digest',
      'The validator also requires the Claims',
      'Boundary to preserve the allowed and not-allowed claim lists',
      'deleting a',
      'blocked scaling, trustless',
      'Rows marked `linked` must include a reproducible command',
      'Every `Current evidence` cell must include a command',
      'concrete scaling',
      'limit being tracked',
      'generic entries such as `scoped impact`',
      'broadcast mode is',
      'The `Required evidence` cell must also identify the sharded-lane claim',
      'lane-local DUP inputs',
      'shared SPVTracker',
      'tracker-overlap mitigation',
      'SPVTracker remains a shared input today',
      'Tracker overlap mitigation',
      'ContextExtension var count',
      'Full parallel L1 settlement while SPVTracker remains a shared input',
      'transitional trusted burn path',
      'structured publication decision',
      'Scaling claims allowed = yes',
      'Production-ready claim allowed = no',
      'Testnet production-candidate claim allowed = no',
      'release:gate -- --benchmark-evidence',
      'completed benchmark evidence',
      'benchmark validation target',
      'classified `Broadcast mode`',
      'Broadcast mode = enabled',
      'Production throughput claim allowed = no',
      'Mainnet-grade evidence linked = no',
      'Testnet-scoped production-candidate support requires',
      'Testnet production-candidate claim allowed = yes',
      'Production-ready benchmark claims for mainnet are forbidden',
      'Open benchmark blockers = 0',
      'open benchmark blocker handling: Open benchmark blockers = 0',
      'numeric shorthand without exact `Open benchmark blockers = 0`',
      'Release notes updated = yes',
      'completed Gate 7 benchmark release-note update evidence',
      'completed Gate 7 benchmark checklist update evidence',
      'For production deployment candidate benchmark support, it must use exact `Release supported = production deployment candidate`',
      'measured single/batch/sharded evidence',
      'production-ready claim handling',
      'Reviewer notes must state a concrete benchmark outcome',
      'Benchmark owner` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Benchmark Classification `Date`',
      'numeric measurements and units',
      'zero-valued measurements',
      'mempool/signing readiness',
      '`scoped evidence reviewed` or `benchmark evidence accepted` are not enough',
      'pending / linked / blocker',
      'The blank template is expected to fail validation.',
      'required command rows, metric rows, sharded-lane statements, bottlenecks',
    ];

    expect(checklist).toContain('performance-benchmark-evidence-template.md');
    expect(roadmap).toContain('docs/performance-benchmark-evidence-template.md');
    expect(releaseNotes).toContain('performance-benchmark-evidence-template.md');
    expect(checklist).toContain('Single, batch, and sharded benchmark evidence');
    expect(checklist).toContain('Publication blocker for scaling claims');
    expect(checklist).toContain('benchmark environment metadata');
    expect(checklist).toContain('positive numeric benchmark measurements');
    expect(checklist).toContain('structured benchmark claims boundary arrays with all required allowed and blocked claims');
    expect(checklist).toContain('completed benchmark evidence');
    expect(checklist).toContain('benchmark validation target');
    expect(checklist).toContain('command-specific benchmark command output evidence');
    expect(checklist).toContain('--benchmark-evidence');
    expect(checklist).toContain('positive cost-relevant counts');
    expect(checklist).toContain('exactly one positive cost count per key');
    expect(checklist).toContain('sample counts');
    expect(checklist).toContain('scenario-specific metric evidence');
    expect(checklist).toContain('scenario-specific single/batch/sharded metric evidence');
    expect(checklist).toContain('distinct completed evidence targets across linked command/metric/sharded-lane/bottleneck rows');
    expect(checklist).toContain('live batch evidence');
    expect(checklist).toContain('user explicit live broadcast approval evidence');
    expect(checklist).toContain('Expected transaction ID binding');
    expect(checklist).toContain('scoped BRIDGE_BROADCAST_ENABLED=true evidence');
    expect(checklist).toContain('post-enable demo:readiness PASS evidence');
    expect(checklist).toContain('Broadcast policy PASS evidence');
    expect(checklist).toContain('Live settlement signing PASS evidence');
    expect(checklist).toContain('broadcast network reconfirmation evidence');
    expect(checklist).toContain('concrete 32-byte live batch transaction identifier');
    expect(checklist).toContain('sharded-lane evidence');
    expect(checklist).toContain('concrete bottleneck scaling limits');
    expect(checklist).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(checklist).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(checklist).toContain('linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence');
    expect(checklist).toContain('production-ready benchmark claims are always blocked for mainnet');
    expect(checklist).toContain('production throughput claims remain blocked for Gate 7 evidence');
    expect(checklist).toContain('Scaling claims allowed = yes');
    expect(checklist).toContain('Production-ready claim allowed = no');
    expect(checklist).toContain('Testnet production-candidate claim allowed = yes');
    expect(checklist).toContain('Production throughput claim allowed = no');
    expect(checklist).toContain('Mainnet-grade evidence linked = no');
    expect(checklist).toContain('Open benchmark blockers = 0');
    expect(checklist).toContain('open benchmark blocker handling with exact');
    expect(checklist).toContain('numeric shorthand such as');
    expect(checklist).toContain('Release notes updated = yes');
    expect(checklist).toContain('reviewer decision summary');
    expect(checklist).toContain('release support');
    expect(checklist).toContain('measured single/batch/sharded evidence');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('production throughput claim handling');
    expect(checklist).toContain('benchmark owner sign-off matches benchmark classification');
    expect(checklist).toContain('benchmark owner sign-off date is not before benchmark classification Date');
    expect(checklist).toContain('completed Gate 7 benchmark release-note update evidence');
    expect(checklist).toContain('completed Gate 7 benchmark checklist update evidence');
    expect(checklist).toContain('distinct completed Gate 7 benchmark release-note/checklist update evidence targets');
    expect(checklist).toContain('internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence');
    expect(matrix).toContain('Performance and scaling claims');
    expect(matrix).toContain('release-gate `--benchmark-evidence` consumption of the actual completed benchmark artifact');
    expect(matrix).toContain('completed benchmark evidence');
    expect(matrix).toContain('benchmark validation target');
    expect(matrix).toContain('command-specific benchmark command output evidence');
    expect(matrix).toContain('positive numeric benchmark measurements');
    expect(matrix).toContain('structured benchmark claims boundary arrays with all required allowed and blocked claims');
    expect(matrix).toContain('positive cost-relevant counts');
    expect(matrix).toContain('exactly one positive cost count per key');
    expect(matrix).toContain('sample counts');
    expect(matrix).toContain('scenario-specific single/batch/sharded metric evidence');
    expect(matrix).toContain('distinct completed evidence targets across linked command/metric/sharded-lane/bottleneck rows');
    expect(matrix).toContain('live batch evidence');
    expect(matrix).toContain('user explicit live broadcast approval evidence');
    expect(matrix).toContain('Expected transaction ID binding');
    expect(matrix).toContain('scoped BRIDGE_BROADCAST_ENABLED=true evidence');
    expect(matrix).toContain('post-enable demo:readiness PASS evidence');
    expect(matrix).toContain('Broadcast policy PASS evidence');
    expect(matrix).toContain('Live settlement signing PASS evidence');
    expect(matrix).toContain('broadcast network reconfirmation evidence');
    expect(matrix).toContain('concrete 32-byte live batch transaction identifier');
    expect(matrix).toContain('sharded-lane evidence');
    expect(matrix).toContain('concrete bottleneck scaling limits');
    expect(matrix).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(matrix).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(matrix).toContain('linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence');
    expect(matrix).toContain('production-ready benchmark claims are always blocked for mainnet');
    expect(matrix).toContain('production throughput claims remain blocked for Gate 7 evidence');
    expect(matrix).toContain('Scaling claims allowed = yes');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('Testnet production-candidate claim allowed = yes');
    expect(matrix).toContain('Production throughput claim allowed = no');
    expect(matrix).toContain('Mainnet-grade evidence linked = no');
    expect(matrix).toContain('Open benchmark blockers = 0');
    expect(matrix).toContain('Release notes updated = yes');
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('release support');
    expect(matrix).toContain('measured single/batch/sharded evidence');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('production throughput claim handling');
    expect(matrix).toContain('benchmark owner sign-off matches benchmark classification');
    expect(matrix).toContain('benchmark owner sign-off date is not before benchmark classification Date');
    expect(matrix).toContain('completed Gate 7 benchmark release-note update evidence');
    expect(matrix).toContain('completed Gate 7 benchmark checklist update evidence');
    expect(matrix).toContain('distinct completed Gate 7 benchmark release-note/checklist update evidence targets');
    expect(matrix).toContain('internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence');
    expect(roadmap).toContain('structured publication decision');
    expect(roadmap).toContain('`release:gate` now consumes completed benchmark evidence through');
    expect(roadmap).toContain('release-gate evaluation now re-checks');
    expect(roadmap).toContain('linked command, metric, sharded-lane, and bottleneck row evidence');
    expect(roadmap).toContain('row evidence targets across linked command, metric, sharded-lane, and');
    expect(roadmap).toContain('Broadcast mode = enabled');
    expect(roadmap).toContain('Benchmark reviewer decision summaries now must mention release support');
    expect(roadmap).toContain('Benchmark owner sign-off now must match');
    expect(roadmap).toContain('Benchmark owner sign-off dates now must use ISO calendar');
    expect(roadmap).toContain('contradictory benchmark count fields');

    for (const section of requiredSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps committee governance and key-rotation evidence structured and non-claiming', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'committee-governance-evidence-template.md'),
      'utf8',
    );
    const requiredSections = [
      '## Drill Classification',
      '## Scope',
      '## Required Commands',
      '## Rotation Plan',
      '## Positive Checks',
      '## Negative Checks',
      '## Publication Rules',
      '## Reviewer Sign-Off',
    ];
    const requiredTerms = [
      'not proof that production governance is complete',
      'Do not paste `.env` contents',
      'Phase 010a atLeast multisig',
      'Phase 010b governance',
      'threshold at least 2',
      'member count at least 3',
      'threshold lower than member count',
      'Missing or enabled broadcast mode is blocked',
      'live lifecycle evidence path',
      'governance evidence markers',
      'non-template evidence',
      'bare validator command names',
      'resolution targets, not completed',
      'SideChainState successor authorization',
      'MainChainLock emergency escape path',
      'MCU Phase 2 path',
      'npm run contracts:check',
      'npm run governance:validate',
      'npm run check',
      'npm run wasm:test',
      'npm run demo:readiness',
      'npm run status',
      'spike010a-committee-guard-eval.ts',
      'Each linked command row must identify the checked governance command output',
      'single shared governance artifact is not enough',
      'The blank template is expected to fail validation.',
      'release:gate -- --governance-evidence',
      'completed committee governance evidence',
      'governance validation target',
      'required scope rows, command evidence, rotation plan rows, positive checks',
      'step-specific governance fact',
      'Generic notes such as `reviewed` or `tested` are not enough',
      'public-key identity, threshold policy, member-loss',
      'Key-identity rows must include concrete public key or hash identifiers',
      'at least one old-authority identifier',
      'declared committee member count for the new committee',
      'Stop condition',
      'must be actionable',
      '`reviewed later`',
      'positive-check',
      'New committee executes signer-gated mutation after rotation',
      'Threshold member-loss tolerance still executes signer-gated mutation',
      'new committee signer-gated mutation',
      'committee-threshold number of concrete public key/hash identifiers',
      'signers that executed the successful operation',
      'declared new-committee positive signer identifiers',
      'Identify new committee public keys` row',
      'Simulate member loss or lost-key tolerance',
      'Old single signer attempts signer-gated mutation after rotation',
      'Non-committee signer attempts signer-gated mutation',
      'MCU references stale SCS NFT after SCS redeploy',
      'MCL emergency escape path is accidentally committee-gated',
      'Rows marked `linked` must use fail-closed expected results',
      'evidence cell must identify the rejected governance fact',
      'deployment-state network mismatch',
      'rejected',
      'blocked',
      'refused',
      'Reviewer notes must state a concrete governance-readiness outcome',
      'Governance owner` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Drill Classification `Date`',
      'negative checks, singleton continuity, deployment-state reconciliation',
      '`reviewed governance drill` are not enough',
      'FROST remains deferred to Phase 015',
      'committee governance and key rotation remain open blockers',
      'structured publication-rule fields',
      'Production deployment candidate support requires `Testnet production-candidate claim allowed = yes`',
      'Release notes updated',
      'Open governance blockers',
      'Required release-note updates',
      'completed Gate 6 governance release-note update evidence',
      'Required checklist updates',
      'completed Gate 6 governance checklist update evidence',
      'Release supported = production deployment candidate',
      'governance-ready claim handling',
      'production-ready claim handling',
      'testnet production-candidate claim handling',
      'open governance blocker handling',
      'open governance blocker handling: Open governance blockers = 0',
      'numeric shorthand without exact `Open governance blockers = 0`',
      'Generic release-note or checklist artifacts do not prove Gate 6 governance',
      'pending / linked / blocker',
    ];

    expect(checklist).toContain('committee-governance-evidence-template.md');
    expect(matrix).toContain('docs/committee-governance-evidence-template.md');
    expect(matrix).toContain('relayer/src/committee-governance-evidence.test.ts');
    expect(matrix).toContain('relayer/src/release-gate.test.ts');
    expect(roadmap).toContain('docs/committee-governance-evidence-template.md');
    expect(roadmap).toContain('`release:gate` now consumes completed committee governance evidence through');
    expect(roadmap).toContain('`--governance-evidence`');
    expect(roadmap).toContain('executable validator');
    expect(releaseNotes).toContain('committee-governance-evidence-template.md');
    expect(runbooks).toContain('committee-governance-evidence-template.md');
    expect(runbooks).toContain('npm run governance:validate');
    expect(checklist).toContain('Committee governance and key-rotation drill');
    expect(checklist).toContain('Publication blocker for production-ready claims');
    expect(checklist).toContain('npm run governance:validate');
    expect(checklist).toContain('--governance-evidence');
    expect(checklist).toContain('completed committee governance evidence');
    expect(checklist).toContain('governance validation target');
    expect(checklist).toContain('command-specific governance command evidence');
    expect(checklist).toContain('internally positive command output');
    expect(checklist).toContain('concrete public key/hash identifiers');
    expect(checklist).toContain('disjoint old/new committee identifiers');
    expect(checklist).toContain('committee threshold policy');
    expect(checklist).toContain('distinct completed evidence targets across linked scope, command, rotation, positive, and negative rows');
    expect(checklist).toContain('step-specific rotation evidence');
    expect(checklist).toContain('step-specific rotation facts');
    expect(checklist).toContain('positive new-committee operation evidence');
    expect(checklist).toContain('bounded positive expected results');
    expect(checklist).toContain('fail-closed negative expected results');
    expect(checklist).toContain('threshold-specific positive signer identifiers');
    expect(checklist).toContain('declared new-committee positive signer identifiers');
    expect(checklist).toContain('negative signer identifiers');
    expect(checklist).toContain('broadcast mode disabled or dry-run');
    expect(checklist).toContain('structured Drill Classification');
    expect(checklist).toContain('Release level = production deployment candidate');
    expect(checklist).toContain('Environment = testnet');
    expect(checklist).toContain('governance model identifying committee or multisig governance');
    expect(checklist).toContain('threshold at least 2');
    expect(checklist).toContain('member count at least 3');
    expect(checklist).toContain('threshold lower than member count');
    expect(checklist).toContain('non-empty reviewer');
    expect(checklist).toContain('ISO Date');
    expect(checklist).toContain('missing or enabled broadcast mode is blocked');
    expect(roadmap).toContain('Committee governance evidence now requires explicit');
    expect(checklist).toContain('external review evidence');
    expect(checklist).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(checklist).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(checklist).toContain('Production-ready claim allowed = no');
    expect(checklist).toContain('Testnet production-candidate claim allowed = yes');
    expect(checklist).toContain('Governance-ready claim allowed = yes');
    expect(checklist).toContain('Open governance blockers = 0');
    expect(checklist).toContain('Release notes updated = yes');
    expect(checklist).toContain('completed Gate 6 governance release-note update evidence');
    expect(checklist).toContain('completed Gate 6 governance checklist update evidence');
    expect(checklist).toContain('reviewer decision summary');
    expect(checklist).toContain('release support');
    expect(checklist).toContain('governance-ready claim handling');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('testnet production-candidate claim handling');
    expect(checklist).toContain('open governance blocker handling');
    expect(checklist).toContain('open governance blocker handling with exact');
    expect(checklist).toContain('numeric shorthand such as');
    expect(checklist).toContain('actionable reviewer notes that keep governance boundaries and do not approve open blockers or single-signer fallback');
    expect(checklist).toContain('internally non-contradictory governance reviewer notes');
    expect(checklist).toContain('governance owner sign-off matches drill classification');
    expect(checklist).toContain('governance owner sign-off date is not before drill classification Date');
    expect(checklist).toContain('distinct completed Gate 6 governance release-note/checklist update evidence targets');
    expect(checklist).toContain('internally non-contradictory governance publication-update evidence');
    expect(checklist).toContain('actionable stop conditions');
    expect(matrix).toContain('Committee and key operations');
    expect(matrix).toContain('Open blocker');
    expect(matrix).toContain('release-gate `--governance-evidence` consumption of the actual completed committee-governance artifact');
    expect(matrix).toContain('completed committee governance evidence');
    expect(matrix).toContain('governance validation target');
    expect(matrix).toContain('command-specific governance command evidence');
    expect(matrix).toContain('internally positive command output');
    expect(matrix).toContain('concrete public key/hash identifiers');
    expect(matrix).toContain('disjoint old/new committee identifiers');
    expect(matrix).toContain('committee threshold policy');
    expect(matrix).toContain('distinct completed evidence targets across linked scope, command, rotation, positive, and negative rows');
    expect(matrix).toContain('step-specific rotation evidence');
    expect(matrix).toContain('step-specific rotation facts');
    expect(matrix).toContain('positive new-committee operation evidence');
    expect(matrix).toContain('bounded positive expected results');
    expect(matrix).toContain('fail-closed negative expected results');
    expect(matrix).toContain('threshold-specific positive signer identifiers');
    expect(matrix).toContain('declared new-committee positive signer identifiers');
    expect(matrix).toContain('negative signer identifiers');
    expect(matrix).toContain('broadcast mode disabled or dry-run');
    expect(matrix).toContain('structured Drill Classification');
    expect(matrix).toContain('Release level = production deployment candidate');
    expect(matrix).toContain('Environment = testnet');
    expect(matrix).toContain('governance model identifying committee or multisig governance');
    expect(matrix).toContain('threshold at least 2');
    expect(matrix).toContain('member count at least 3');
    expect(matrix).toContain('threshold lower than member count');
    expect(matrix).toContain('non-empty reviewer');
    expect(matrix).toContain('ISO Date');
    expect(matrix).toContain('enabled broadcast mode blocked for Gate 6');
    expect(matrix).toContain('production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`');
    expect(matrix).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('Testnet production-candidate claim allowed = yes');
    expect(matrix).toContain('Governance-ready claim allowed = yes');
    expect(matrix).toContain('Open governance blockers = 0');
    expect(matrix).toContain('Release notes updated = yes');
    expect(matrix).toContain('completed Gate 6 governance release-note update evidence');
    expect(matrix).toContain('completed Gate 6 governance checklist update evidence');
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('release support');
    expect(matrix).toContain('governance-ready claim handling');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('testnet production-candidate claim handling');
    expect(matrix).toContain('open governance blocker handling');
    expect(matrix).toContain('actionable reviewer notes that keep governance boundaries and do not approve open blockers or single-signer fallback');
    expect(matrix).toContain('internally non-contradictory governance reviewer notes');
    expect(matrix).toContain('governance owner sign-off matches drill classification');
    expect(matrix).toContain('governance owner sign-off date is not before drill classification Date');
    expect(matrix).toContain('distinct completed Gate 6 governance release-note/checklist update evidence targets');
    expect(matrix).toContain('internally non-contradictory governance publication-update evidence');
    expect(matrix).toContain('external review evidence');
    expect(matrix).toContain('actionable stop conditions');
    expect(roadmap).toContain('positive new-committee operation');
    expect(roadmap).toContain('threshold-specific');
    expect(roadmap).toContain('declared new-committee positive signer identifiers');
    expect(roadmap).toContain('command-specific output');
    expect(roadmap).toContain('structured publication-rule rows');
    expect(roadmap).toContain('Committee governance reviewer decision summaries now must mention release');
    expect(roadmap).toContain('Committee governance owner sign-off now must match');
    expect(roadmap).toContain('Committee governance owner sign-off dates now must use ISO');

    for (const section of requiredSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps external integration package review structured and non-claiming', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'external-integration-review-template.md'),
      'utf8',
    );
    const requiredSections = [
      '## Review Classification',
      '## Required Entry Points',
      '## Fresh Checkout Commands',
      '## Integration Decision Record',
      '## Negative Review Checks',
      '## Publication Rules',
      '## Reviewer Sign-Off',
    ];
    const requiredTerms = [
      'without private maintainer context',
      'This is not a production-ready claim',
      'Do not paste `.env` contents',
      '`maintainer` reviewer type is allowed only for internal draft review',
      'release evidence passes only with `independent engineer` or',
      'Reviewer organization',
      'Lead reviewer',
      '| Broadcast mode | disabled / dry-run |',
      'Private maintainer context used',
      'reviewer organization or affiliation',
      'Integration reviewer` sign-off name must match',
      'use of private maintainer context keeps the package review blocked',
      'Broadcast mode` is `disabled` or `dry-run`',
      'enabled broadcast mode is out of scope',
      'npm ci',
      'npm run check',
      'npm run wasm:test',
      'npm run showcase',
      'Completed Gate 8 evidence for these fresh-checkout commands must include',
      'Text that only says command output was captured',
      'command row must be `linked`',
      'explicit `exit code 0` output',
      'zero-exit status',
      'a single shared',
      'single shared fresh-checkout artifact',
      'enough unless the row evidence also names that command',
      'Each linked command row must explicitly identify fresh checkout or clean',
      'checkout context; successful command output',
      'unspecified working copy',
      'Each linked command row must also identify the fresh checkout Git commit',
      'must match the `Git commit` value in Review Classification',
      'npm run integration:validate',
      'release:gate -- --integration-evidence',
      'completed external integration evidence',
      'integration validation target',
      'README',
      'Ultimate Bridge Objective',
      'Institutional Release Checklist',
      'EVM Sidechain Integration Checklist',
      'Contract And Relayer API Reference',
      'Sidechain on Ergo in One Afternoon',
      'Operator Runbooks',
      'Which signer path is allowed?',
      'BRIDGE_BROADCAST_ENABLED=true',
      'Which path is still trusted-oracle?',
      'What blocks scaling claims?',
      'Decision answers must state the actual safety boundary',
      'generic answers such as `documented`, `reviewed`, or `see checklist`',
      'evidence cell must identify the decision category',
      'signer path',
      'sidechain commitment',
      'duplicate-burn rejection',
      'The bridge is production-ready today',
      'Node-wallet signing is acceptable for production',
      'Current burn verification is trustless',
      'FROST is the current committee implementation',
      'SPVTracker remains a shared input',
      'Offline showcase output is live benchmark evidence',
      'Every row must link to the document or artifact that forced the correction.',
      'The correction must state the actual safety boundary.',
      '`corrected by release checklist` is not enough',
      'mainnet-readiness correction must explicitly state',
      'production-ready/readiness claims remain forbidden or out of scope',
      'only testnet production-candidate or production-grade testnet',
      'evidence cell must identify the corrected misread category',
      'readiness blocker',
      'node-wallet signing',
      'trustless-burn boundary',
      'live benchmark evidence',
      'completed integration evidence markers',
      'non-template evidence link',
      'bare validator command',
      'resolution targets, not completed',
      'completed entry-point review evidence beyond the',
      'does not prove a fresh reviewer followed it without private context',
      'must identify entry-point review',
      'no private maintainer context',
      'non-concrete artifact marker is not enough',
      'Row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'Gate 8 remains pending evidence',
      'This table is executable guard input',
      'Public institutional-reference release allowed',
      'Production-ready claim allowed',
      'Release notes updated',
      'Required release-note updates',
      'completed Gate 8 integration release-note update evidence',
      'Required checklist updates',
      'completed Gate 8 checklist update evidence',
      'Reviewer decision summary',
      'Production-ready claim allowed must be `no`',
      'cannot authorize production-ready claims',
      'production deployment candidate',
      'Reviewer notes must state a concrete external-integration outcome',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Review Classification `Date`',
      'private maintainer context',
      'operator-ready',
      '`reviewed without private context` are not enough',
      'pending / linked / blocker',
      'The blank template is expected to fail validation.',
      'required entry points, integration decisions, negative review checks',
    ];

    expect(checklist).toContain('external-integration-review-template.md');
    expect(roadmap).toContain('docs/external-integration-review-template.md');
    expect(roadmap).toContain('docs/contract-relayer-api-reference.md');
    expect(releaseNotes).toContain('external-integration-review-template.md');
    expect(releaseNotes).toContain('contract-relayer-api-reference.md');
    expect(releaseNotes).toContain('fresh checkout');
    expect(releaseNotes).toContain('commit identity matching the Release Classification `Git commit`');
    expect(checklist).toContain('External integration package review');
    expect(checklist).toContain('Publication blocker for public institutional-reference release');
    expect(checklist).toContain('required entry points');
    expect(checklist).toContain('--integration-evidence');
    expect(checklist).toContain('completed external integration evidence');
    expect(checklist).toContain('integration validation target');
    expect(checklist).toContain('completed entry-point review evidence beyond document links');
    expect(checklist).toContain('integration decision record');
    expect(checklist).toContain('bounded required answers');
    expect(checklist).toContain('decision-specific evidence');
    expect(checklist).toContain('negative review checks');
    expect(checklist).toContain('expected correction text');
    expect(checklist).toContain('fresh checkout command output evidence');
    expect(checklist).toContain('per-command fresh checkout exit code 0 output evidence');
    expect(checklist).toContain('per-command fresh or clean checkout context evidence');
    expect(checklist).toContain('per-command fresh checkout commit identity');
    expect(checklist).toContain('Per-command fresh checkout command output evidence');
    expect(checklist).toContain('Private maintainer context used = no');
    expect(checklist).toContain('broadcast mode disabled or dry-run');
    expect(checklist).toContain('missing or enabled broadcast mode cannot close Gate 8');
    expect(checklist).toContain('Public institutional-reference release allowed = yes');
    expect(checklist).toContain('completed Gate 8 integration release-note update evidence');
    expect(checklist).toContain('completed Gate 8 checklist update evidence');
    expect(checklist).toContain('distinct completed Gate 8 integration release-note/checklist update evidence targets');
    expect(checklist).toContain('public institutional-reference release decision');
    expect(checklist).toContain('public institutional-reference release handling');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('Production-ready claim allowed = no');
    expect(checklist).toContain('mainnet release-readiness claims remain forbidden or out of scope');
    expect(checklist).toContain(
      'only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
    );
    expect(checklist).toContain('reviewer decision summary');
    expect(checklist).toContain('integration reviewer sign-off matches review classification');
    expect(checklist).toContain('integration reviewer sign-off date is not before review classification Date');
    expect(matrix).toContain('External integration readiness');
    expect(matrix).toContain('relayer/src/release-gate.test.ts');
    expect(matrix).toContain('release-gate `--integration-evidence` consumption of the actual completed external integration artifact');
    expect(matrix).toContain('completed external integration evidence');
    expect(matrix).toContain('integration validation target');
    expect(matrix).toContain('required entry points');
    expect(matrix).toContain('completed entry-point review evidence beyond document links');
    expect(matrix).toContain('integration decision record');
    expect(matrix).toContain('bounded required answers');
    expect(matrix).toContain('decision-specific evidence');
    expect(matrix).toContain('negative review checks');
    expect(matrix).toContain('expected correction text');
    expect(matrix).toContain('per-command fresh checkout command output evidence');
    expect(matrix).toContain('per-command fresh checkout exit code 0 output evidence');
    expect(matrix).toContain('per-command fresh or clean checkout context evidence');
    expect(matrix).toContain('per-command fresh checkout commit identity');
    expect(matrix).toContain('specific reviewer organization or affiliation');
    expect(matrix).toContain('Private maintainer context used = no');
    expect(matrix).toContain('broadcast mode disabled or dry-run');
    expect(matrix).toContain('enabled broadcast mode blocked for Gate 8');
    expect(matrix).toContain('production deployment candidate classification requires Environment used = testnet');
    expect(matrix).toContain('public institutional-reference release decision');
    expect(matrix).toContain('Public institutional-reference release allowed = yes');
    expect(matrix).toContain('public institutional-reference release handling');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('mainnet release-readiness claims remain forbidden or out of scope');
    expect(matrix).toContain(
      'only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
    );
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('integration reviewer sign-off matches review classification');
    expect(matrix).toContain('integration reviewer sign-off date is not before review classification Date');
    expect(matrix).toContain('completed Gate 8 integration release-note update evidence');
    expect(matrix).toContain('completed Gate 8 checklist update evidence');
    expect(matrix).toContain('distinct completed Gate 8 integration release-note/checklist update evidence targets');
    expect(roadmap).toContain('external integration evidence now requires explicit broadcast mode');
    expect(roadmap).toContain('missing or enabled broadcast mode is blocked');
    expect(roadmap).toContain('Gate 8 integration-reviewer sign-off now must match');
    expect(roadmap).toContain('Gate 8 integration-reviewer sign-off dates now must use ISO');
    expect(roadmap).toContain('Gate 8 fresh-checkout command rows now require per-command fresh checkout');
    expect(roadmap).toMatch(/Gate 8 production deployment candidate classifications now must be\s+testnet-scoped/);
    expect(roadmap).toContain('Environment used` must be `testnet');
    expect(roadmap).toMatch(/mainnet\s+production-ready\/readiness claims remain forbidden or out of scope/);
    expect(roadmap).toMatch(
      /only testnet production-candidate or production-grade testnet claims can be\s+evaluated with complete evidence/,
    );
    expect(roadmap).toContain('`release:gate` now consumes completed external integration review evidence');
    expect(roadmap).toContain('`--integration-evidence`');
    expect(roadmap).toContain('Release-note validation now requires linked Gate 8 Required Evidence rows');
    expect(roadmap).toContain('Release-note allowed-claim validation now requires external integration');
    expect(releaseNotes).toContain('per-command fresh checkout commit identity');
    expect(releaseNotes).toContain('Publication Blocker row to be `Checked`');

    for (const section of requiredSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps the contract and relayer API reference tied to current integration surfaces', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const integration = readFileSync(join(bridgeRoot, 'docs', 'evm-integration-checklist.md'), 'utf8');
    const review = readFileSync(
      join(bridgeRoot, 'docs', 'external-integration-review-template.md'),
      'utf8',
    );
    const reference = readFileSync(
      join(bridgeRoot, 'docs', 'contract-relayer-api-reference.md'),
      'utf8',
    );
    const requiredSections = [
      '## Review Scope',
      '## Contract Surface',
      '## Relayer Surface',
      '## Command Surface',
      '## Integration Invariants',
      '## Known Limits For Reviewers',
      '## External Review Checklist',
    ];
    const requiredContracts = [
      'SideChainState.es',
      'SPVTracker.es',
      'DoubleUnlockPreventionAggregateBatch.es',
      'MainChainAggregateUnlockBatch.es',
      'MainChainAggregateUnlockTrustless.es',
      'MainChainLock.es',
      'MainChainUnlock.es',
    ];
    const requiredRelayerModules = [
      'aggregate-settlement-builder.ts',
      'aggregate-settlement-tx.ts',
      'aggregate-settlement-service.ts',
      'spv-tracker.ts',
      'avl-bridge.ts',
      'fleet-signer.ts',
      'context-extension-guard.ts',
      'live-settlement-readiness.ts',
      'release-gate.ts',
    ];
    const requiredTerms = [
      'This is not a production-ready claim',
      'tokens(0)',
      'R4',
      'R5',
      'R6',
      'R7',
      'R8',
      'R9',
      'Var(0)',
      'Var(1)',
      'Var(2)..Var(21)',
      'Var(22)..Var(41)',
      'Var(2..11)',
      'Var(12..21)',
      'Var(22..31)',
      'BATCH_UNLOCK_MAX_CLAIMS = 10',
      'BATCH_DUP_MAX_KEYS = 20',
      '109-byte',
      'E2S_SPV_V1',
      'E2S_BURN_V1',
      'BRIDGE_BROADCAST_ENABLED=true',
      'signing, node-check, authorization, and transport surfaces are physically absent',
      'Legacy V1 deducts the miner fee from protected backing',
      'separately versioned external-fee profile',
      'Unsigned preparation output cannot satisfy Gate 3 or Gate 5 target-node acceptance',
      'Any retained aggregate prebroadcast evidence and its validators are historical provenance only',
      'Historical `confirm*` commands remain only to reconcile an exact transaction',
      'node-wallet signing exclusion',
      'confirmation-time reconciliation',
      'trustlessBurnDerivation',
      'candidate-only `boundary` fields',
      'reads local SQLite state in read-only mode',
      'writes candidate-only evidence JSON',
      'does not sign, check, approve, submit, reconcile, broadcast, or mutate runtime databases',
      'does not sign, check, approve, submit, reconcile, broadcast, mutate runtime databases, or authorize claims',
      'does not sign, approve, submit, publish, push, broadcast, or open runtime databases',
      'npm run ci:validate',
      '--clean-checkout-evidence',
      'npm run benchmark:validate',
      '--benchmark-evidence',
      'npm run governance:validate',
      '--governance-evidence',
      'npm run operator:validate',
      '--operator-readiness-evidence',
      'npm run integration:validate',
      '--integration-evidence',
      'npm run rehearsal:validate',
      '--live-rehearsal-evidence',
      'Release Decision table',
      'unresolved blocker count',
      'validated `Release level` must match',
      'Release Decision `Proposed release level`',
      'release-note classification `Git commit`',
      'clean-checkout Run Classification `Git commit`',
      'Trustless burn verification is still blocked',
      'SPVTracker is a shared input today',
      'required command rows',
      'structured Benchmark Classification, command, metric',
      'command-specific completed output evidence',
      'distinct completed evidence targets across linked command, metric, sharded-lane, and bottleneck rows',
      'Linked command, metric, sharded-lane, bottleneck',
    ];
    const requiredReleaseGateFlags = [
      '--clean-checkout-evidence',
      '--dependency-review-evidence',
      '--security-review-evidence',
      '--trustless-burn-evidence',
      '--benchmark-evidence',
      '--governance-evidence',
      '--operator-readiness-evidence',
      '--integration-evidence',
      '--technical-addendum-evidence',
      '--release-notes',
      '--local-live-rehearsal-evidence',
      '--live-rehearsal-evidence',
      '--local-settlement-profile-activation-json',
      '--settlement-profile-activation-json',
      '--assembly-report-json',
      '--live-preflight-json',
      '--fresh-checkpoint-json',
      '--post-submit-observe-json',
      '--recovery-observe-json',
      '--backup-restore-evidence',
    ];

    expect(checklist).toContain('contract-relayer-api-reference.md');
    expect(integration).toContain('contract-relayer-api-reference.md');
    expect(review).toContain('contract-relayer-api-reference.md');

    for (const section of requiredSections) {
      expect(reference).toContain(section);
    }

    for (const contract of requiredContracts) {
      expect(reference, contract).toContain(contract);
    }

    for (const module of requiredRelayerModules) {
      expect(reference, module).toContain(module);
    }

    for (const term of requiredTerms) {
      expect(reference, term).toContain(term);
    }

    const releaseGateRow = reference
      .split('\n')
      .find(line => line.startsWith('| `npm run release:gate` |')) ?? '';
    for (const flag of requiredReleaseGateFlags) {
      expect(releaseGateRow, flag).toContain(flag);
    }
  });

  it('keeps live rehearsal evidence capture tied to release gates', () => {
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const rehearsal = readFileSync(
      join(bridgeRoot, 'docs', 'live-rehearsal-template.md'),
      'utf8',
    );

    expect(checklist).toContain('live-rehearsal-template.md');
    expect(matrix).toContain('docs/live-rehearsal-template.md');
    expect(roadmap).toContain('docs/live-rehearsal-template.md');
    expect(runbooks).toContain('BRIDGE_BROADCAST_ENABLED=true');
    expect(checklist).toContain('Completed rehearsal evidence artifacts identify the lifecycle row');

    const requiredSections = [
      '## Session Metadata',
      '## Lifecycle Gate Classification',
      '## Preflight Evidence',
      '## Dry-Run Settlement Evidence',
      '## Broadcast Enablement Evidence',
      '## Submit And Confirmation Evidence',
      '## Reconciliation Evidence',
      '## Rollback And Cleanup',
      '## Publication Evidence',
      '## Reviewer Sign-Off',
    ];
    const requiredSafeguards = [
      'Do not paste `.env` contents',
      'Date fields must use `YYYY-MM-DD`.',
      'Reviewer sign-off date must not be before the session date.',
      'The Reviewer Sign-Off `Reviewer` value must match',
      'broadcast mode starts and ends',
      'npm run check',
      'npm run wasm:test',
      'npm run demo:readiness',
      'npm run status',
      'npm run rehearsal:validate',
      'npm run backup:validate',
      '`/transactions/check` result',
      'BRIDGE_BROADCAST_ENABLED=true',
      '`Reviewer approval recorded` must name the same reviewer recorded in Session',
      'state explicit live broadcast approval',
      'cite the dry-run',
      'a generic approval artifact is not enough',
      '`BRIDGE_BROADCAST_ENABLED=true` scoped-shell row must include',
      'cite `BRIDGE_BROADCAST_ENABLED=true`',
      'a bare `yes` is',
      'Readiness command re-run after enabling broadcast',
      '`npm run demo:readiness` output evidence with `PASS`',
      'Broadcast policy reports PASS',
      'bare `PASS` is not enough',
      '`Node URL and network re-confirmed` must cite a concrete `Node URL`',
      '`http://` or `https://` URL',
      'a generic network artifact is not',
      'Stop immediately',
      'Broadcast disabled in all shells',
      'Narrative notes are supplementary only',
      'Blocking notes for `fail`, `inconclusive`, `publication blocker`, or',
      'Required next evidence for',
      'Generic notes such as `reviewed`, `later`, or `see checklist` are not enough',
      'Allowed status values: pass / fail / inconclusive / not applicable /',
      'Evidence artifacts must be completed durable targets',
      'Targetless command-output text',
      'artifact://...',
      'non-template evidence link',
      'bare validator command names',
      'Template links, bare command names, and targetless command-output notes are not',
      'completed artifact files or non-template evidence records',
      'Narrative text is not',
      'enough to satisfy the validator.',
      'Gate 3 rehearsal evidence must update publication control documents',
      'This section is executable guard input',
      'Release notes updated',
      'completed Gate 3 rehearsal release-note update evidence',
      'Pending Evidence Register updated',
      'completed Gate 3 checklist update evidence',
      'release-note and checklist update fields',
      'must cite distinct completed evidence targets',
      'Production-ready claim allowed by this rehearsal: no',
      'Testnet production-candidate claim allowed by this rehearsal: no',
      'must both be',
      'Publication Evidence free text must not include mainnet go-live',
      'dedicated fields above with value `no`',
      'Each evidence artifact must identify the lifecycle row it closes',
      '`Current Ergo height` and `Current sidechain height` must start with',
      'completed node/RPC height artifact markers or',
      'non-template evidence links',
      '`Sidechain block height` must not exceed `Current sidechain height`',
      '`Ergo anchor height` must not exceed `Current Ergo height`',
      '`Aggregate claim count`, `Input count`, and `Output count` must be greater than',
      '`ContextExtension key counts per input` must be comma-separated',
      '`Peg-in event ID or TX ID`, `Peg-out burn TX ID`, `Sidechain block hash`, and',
      '`Bridge event root` must each include exactly one 32-byte hex value',
      'include exactly one 32-byte hex value',
      '`Expected transaction ID` must include exactly one 32-byte hex transaction ID',
      'live submit command includes the dry-run Expected transaction ID',
      'signer refuses broadcast if the signed transaction ID differs',
      '`Submitted transaction ID` must include exactly one 32-byte hex transaction ID',
      'must match `Expected transaction ID`',
      'Post-submit peg-out burn TX IDs must be unique',
      'batch cannot cite the same burn twice',
      'Peg-out burn TX ID count must match recipient payout box ID count',
      '`Settlement output box IDs` must include at least one 32-byte hex box ID',
      'Settlement output box IDs must include DUP successor box ID',
      'SPV tracker successor box ID, and every recipient payout box ID',
      '`DUP successor box ID`, `SPV tracker successor box ID`, and',
      '`Recipient payout box ID` must each include exactly one 32-byte hex box ID',
      '`Miner fee output` must include a completed artifact marker and exactly one',
      'positive `feeNanoErg=<integer>` amount',
      'Linked reconciliation evidence must cite submitted successor and burn values',
      'submitted DUP successor box ID',
      'submitted SPV tracker successor box ID',
      'recipient payout box ID',
      'reconciliation evidence cites peg-out burn TX ID',
      'peg-in, peg-out burn, anchor, settlement check',
      'confirmation, reconciliation',
      '`Environment: local devnet`',
      '`Environment: testnet`',
      '`production deployment candidate` may be used only when `Environment: testnet`',
      'Local-devnet and staging rehearsals must use `validated PoC` or',
      '`institutional reference` and cannot be cited as production-deployment-candidate',
      '`Ergo node network` to positively identify testnet',
      'Negated or mixed network wording such as `not testnet`, `not a testnet`',
      '`not on testnet`, `not on the testnet`, `not using testnet`,',
      '`not connected to testnet`, `no testnet`, `without testnet`, `without the',
      'testnet`, `mainnet`, `main network`, `main chain`, or `mainchain` cannot close',
      'Fresh testnet lifecycle evidence',
      'clean deployment state evidence',
      'deployment-state hash or digest',
      'contract IDs',
      'singleton inventory',
      'concrete 32-byte deployment-state hash or digest',
      'concrete 32-byte contract ID',
      'concrete 32-byte singleton inventory identifier',
      'failed-broadcast/phantom-AVL',
      'reorged-burn/stale-singleton',
      'no phantom DUP/AVL history',
      'failed-broadcast evidence cites Expected transaction ID',
      'failed-broadcast evidence cites peg-out burn TX ID',
      'reorged-burn evidence cites peg-out burn TX ID',
      'must match the draft/live-preflight Expected',
      'Recovery row fragment evidence must still match the draft Expected transaction',
      'stale-singleton evidence cites singleton inventory identifier',
      'stale-singleton detection plus recovery',
      '`Submission timestamp` must use `YYYY-MM-DDTHH:mm:ssZ`.',
      '`Confirmation height` must',
      '`Confirmation count` must be greater than `0`',
      '`Required confirmation count` must',
      '`Confirmation policy met` must be `yes`',
      'observed `Confirmation count` must be greater than or equal to',
      '`Confirmation policy met` field must include',
      'completed artifact marker or non-template evidence link',
      '`confirmationsRequired=<n>`',
      '`confirmationsObserved=<n>`',
      '| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |',
      'Fresh local devnet lifecycle',
      'Fresh testnet lifecycle',
      'Failed broadcast / phantom AVL evidence',
      'Reorged burn / stale singleton evidence',
      'Backup-restore or reconstructibility evidence',
      'Backup Restore Evidence Template',
      'Classification: pass / fail / inconclusive',
      'A `pass` classification requires `Publication blockers discovered`',
      '`Follow-up tests required`, and `Follow-up runbook changes required`',
      '`none`, `no`, or `0`',
      'Open blockers or unresolved follow-ups must keep the',
      'The blank template is expected to fail validation.',
      'completed session metadata, named operational evidence fields, and reviewer',
      'Critical outcome fields must use exact, non-ambiguous values',
      'Chain-state identifiers in dry-run, submit/confirmation, reconciliation',
      'Raw text such as `txid`',
      '`confirmed` or `settled` for reconciliation status',
      '`yes`/`no` for manual',
      '`Fresh testnet lifecycle` evidence artifacts must cite `Ergo node network',
      'testnet`, positively identify testnet',
      'and must not contain negated or mixed',
      'network wording such as `not testnet`, `not a testnet`, `not on testnet`',
      '`not on the testnet`, `not using testnet`, `not connected to testnet`, `no',
      '`main chain`, or `mainchain`',
      '`Sidechain network` must identify `patched-devnet`, `testnet`, or an',
      'explicit non-mainnet sidechain network',
      'Sidechain network values must not contain `mainnet`, `main network`,',
      '`main chain`, `mainchain`, or negated testnet wording',
      'completed live rehearsal target',
      '`npm run rehearsal:validate` PASS output',
      'npm run release:gate -- --local-live-rehearsal-evidence',
      '--live-rehearsal-evidence',
      '`Fresh local devnet lifecycle` status `pass`',
      'distinct `rehearsal:validate` transcript artifact containing',
      '`validated target` binding',
      'validation output artifact must be distinct from the completed live rehearsal target',
      '`Fresh testnet lifecycle` row with status',
    ];

    for (const section of requiredSections) {
      expect(rehearsal).toContain(section);
    }

    for (const safeguard of requiredSafeguards) {
      expect(rehearsal).toContain(safeguard);
    }
    expect(checklist).toContain('Completed Gate 3 rehearsal release-note update evidence');
    expect(checklist).toContain('Completed Gate 3 checklist update evidence');
    expect(checklist).toContain('completed Gate 3 rehearsal release-note update evidence');
    expect(checklist).toContain('completed Gate 3 checklist update evidence');
    expect(checklist).toContain('distinct completed Gate 3 rehearsal release-note/checklist update evidence targets');
    expect(checklist).toContain('Completed broadcast enablement evidence names the same reviewer');
    expect(checklist).toContain('Completed broadcast scoped-shell evidence includes');
    expect(checklist).toContain('Completed broadcast network reconfirmation evidence cites `Node URL`');
    expect(checklist).toContain('reviewer sign-off matches session metadata');
    expect(checklist).toContain('reviewer sign-off date is not before session metadata Date');
    expect(checklist).toContain('broadcast reviewer approval names Session Metadata Reviewer');
    expect(checklist).toContain('explicit live broadcast approval');
    expect(checklist).toContain('user explicit live broadcast approval');
    expect(checklist).toContain('broadcast reviewer approval cites Expected transaction ID');
    expect(checklist).toContain('BRIDGE_BROADCAST_ENABLED=true');
    expect(checklist).toContain('scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true');
    expect(checklist).toContain('intended shell scope is limited');
    expect(checklist).toContain('readiness command output evidence');
    expect(checklist).toContain('broadcast policy output evidence');
    expect(checklist).toContain('live settlement readiness output evidence');
    expect(checklist).toContain('Live settlement startup gate');
    expect(checklist).toContain('runtime approval context binding');
    expect(checklist).toContain('broadcast network reconfirmation cites Node URL');
    expect(checklist).toContain('broadcast network reconfirmation names Session Metadata Ergo node network');
    expect(checklist).toContain('broadcast network reconfirmation names Session Metadata Sidechain network');
    expect(checklist).toContain(
      'Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network',
    );
    expect(checklist).toContain(
      'Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
    );
    expect(checklist).toContain('structured assembly report JSON target binding');
    expect(checklist).toContain('Fresh testnet lifecycle artifact cites peg-in event ID or TX ID');
    expect(checklist).toContain('Fresh testnet lifecycle artifact cites peg-out burn TX ID');
    expect(checklist).toContain('Fresh testnet lifecycle artifact cites sidechain block hash');
    expect(checklist).toContain('Fresh testnet lifecycle artifact cites bridge event root');
    expect(checklist).toContain('Fresh testnet lifecycle artifact cites Expected transaction ID');
    expect(checklist).toContain('Fresh testnet lifecycle artifact cites submitted transaction ID');
    expect(checklist).toContain('peg-in evidence cites peg-in event ID or TX ID');
    expect(checklist).toContain('peg-out burn evidence cites peg-out burn TX ID');
    expect(checklist).toContain('anchor evidence cites sidechain block hash');
    expect(checklist).toContain('anchor evidence cites bridge event root');
    expect(checklist).toContain('anchor evidence cites Ergo anchor height');
    expect(checklist).toContain('settlement check evidence cites Expected transaction ID');
    expect(checklist).toContain('Legacy V1 transport = quarantined');
    expect(checklist).toContain('positive miner feeNanoErg amount');
    expect(checklist).toContain('settlement submit evidence cites submitted transaction ID');
    expect(checklist).toContain('confirmation evidence cites submitted transaction ID');
    expect(checklist).toContain('required confirmation count');
    expect(checklist).toContain('confirmation policy met');
    expect(checklist).toContain('confirmation policy met cites confirmationsRequired');
    expect(checklist).toContain('confirmation policy met cites confirmationsObserved');
    expect(checklist).toContain('confirmation policy met cites submitted transaction ID');
    expect(checklist).toContain('observed confirmation count greater than or equal to required confirmation count');
    expect(checklist).toContain('confirmation policy met links completed finality evidence');
    expect(checklist).toContain('reconciliation evidence cites submitted successor and burn values');
    expect(checklist).toContain('reconciliation evidence cites peg-out burn TX ID');
    expect(checklist).toContain('completed live rehearsal target');
    expect(checklist).toContain('`npm run rehearsal:validate` PASS output');
    expect(checklist).toContain('`release:gate -- --live-rehearsal-evidence` must read the actual completed');
    expect(checklist).toContain('linked completed live rehearsal target in the Fresh Ergo testnet lifecycle');
    expect(checklist).toContain('`Fresh testnet lifecycle` row with status `pass`');
    expect(checklist).toContain('distinct `rehearsal:validate` transcript artifact containing');
    expect(checklist).toContain('--assembly-report-json <assembly-report.json>');
    expect(checklist).toContain('--live-preflight-json <external-fee-live-preflight.json>');
    expect(checklist).toContain('--post-submit-observe-json <post-submit-observe.json>');
    expect(checklist).not.toContain('--offline-gate-json');
    expect(checklist).not.toContain('--prep-bundle-json');
    expect(checklist).toContain('--fresh-checkpoint-json <fresh-testnet-checkpoint.json>');
    expect(checklist).toContain('--recovery-observe-json <failed-broadcast-observe.json>');
    expect(checklist).toContain('--recovery-observe-json <reorg-stale-singleton-observe.json>');
    expect(checklist).toContain('<completed-live-rehearsal.md>');
    expect(checklist).toContain('`validated target` binding');
    expect(checklist).toContain(
      'validation output artifact must be distinct from the completed live rehearsal target',
    );
    expect(runbooks).toContain('completed live rehearsal target');
    expect(runbooks).toContain('`npm run rehearsal:validate` PASS output');
    expect(runbooks).toContain('distinct `rehearsal:validate` transcript artifact containing');
    expect(runbooks).toContain('--assembly-report-json <assembly-report.json>');
    expect(runbooks).toContain('--live-preflight-json <external-fee-live-preflight.json>');
    expect(runbooks).toContain('--post-submit-observe-json <post-submit-observe.json>');
    expect(runbooks).not.toContain('--offline-gate-json');
    expect(runbooks).not.toContain('--prep-bundle-json');
    expect(runbooks).toContain('--fresh-checkpoint-json <fresh-testnet-checkpoint.json>');
    expect(runbooks).toContain('--recovery-observe-json <failed-broadcast-observe.json>');
    expect(runbooks).toContain('--recovery-observe-json <reorg-stale-singleton-observe.json>');
    expect(runbooks).toContain('<completed-live-rehearsal.md>');
    expect(runbooks).toContain('`validated target` binding');
    expect(runbooks).toContain(
      'validation output artifact must be distinct from the completed live rehearsal target',
    );
    expect(releaseNotes).toContain('completed live rehearsal target');
    expect(releaseNotes).toContain('`npm run rehearsal:validate` PASS output');
    expect(releaseNotes).toContain('distinct `rehearsal:validate` transcript artifact containing');
    expect(releaseNotes).toContain('`validated target` binding');
    expect(releaseNotes).toContain(
      'validation output artifact must be distinct from the completed live rehearsal target',
    );
    expect(matrix).toContain(
      'release-gate `--live-rehearsal-evidence` consumption of the actual completed live rehearsal artifact',
    );
    expect(matrix).toContain('live rehearsal validation target');
    expect(matrix).toContain('validated Fresh testnet lifecycle row status pass');
    expect(roadmap).toContain('`--live-rehearsal-evidence`');
    expect(roadmap).toContain('passing `Fresh testnet lifecycle` row');
    expect(checklist).toContain('failed-broadcast evidence cites Expected transaction ID');
    expect(checklist).toContain('reorged-burn evidence cites peg-out burn TX ID');
    expect(checklist).toContain('Production-ready claim allowed by this rehearsal: no');
    expect(checklist).toContain('Testnet production-candidate claim allowed by this rehearsal: no');
    expect(matrix).toContain('failed-broadcast evidence proving no phantom DUP/AVL history');
    expect(matrix).toContain('failed-broadcast evidence cites Expected transaction ID');
    expect(matrix).toContain('reorged-burn and stale-singleton detection and recovery evidence');
    expect(matrix).toContain('stale-singleton evidence cites singleton inventory identifier');
    expect(matrix).toContain('reviewer sign-off matches session metadata');
    expect(matrix).toContain('reviewer sign-off date is not before session metadata Date');
    expect(matrix).toContain('Broadcast mode at start disabled');
    expect(matrix).toContain('Broadcast mode at end disabled');
    expect(matrix).toContain('Broadcast disabled in all shells');
    expect(matrix).toContain('broadcast reviewer approval names Session Metadata Reviewer');
    expect(matrix).toContain('explicit live broadcast approval');
    expect(matrix).toContain('user explicit live broadcast approval');
    expect(matrix).toContain('broadcast reviewer approval cites Expected transaction ID');
    expect(matrix).toContain('BRIDGE_BROADCAST_ENABLED=true');
    expect(matrix).toContain('scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true');
    expect(matrix).toContain('intended shell scope is limited');
    expect(matrix).toContain('readiness command output evidence');
    expect(matrix).toContain('broadcast policy output evidence');
    expect(matrix).toContain('live settlement readiness output evidence');
    expect(matrix).toContain('broadcast network reconfirmation cites Node URL');
    expect(matrix).toContain('broadcast network reconfirmation names Session Metadata Ergo node network');
    expect(matrix).toContain('broadcast network reconfirmation names Session Metadata Sidechain network');
    expect(matrix).toContain(
      'Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network',
    );
    expect(matrix).toContain(
      'Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
    );
    expect(matrix).toContain('Fresh testnet lifecycle artifact cites peg-in event ID or TX ID');
    expect(matrix).toContain('Fresh testnet lifecycle artifact cites peg-out burn TX ID');
    expect(matrix).toContain('Fresh testnet lifecycle artifact cites sidechain block hash');
    expect(matrix).toContain('Fresh testnet lifecycle artifact cites bridge event root');
    expect(matrix).toContain('Fresh testnet lifecycle artifact cites Expected transaction ID');
    expect(matrix).toContain('Fresh testnet lifecycle artifact cites submitted transaction ID');
    expect(matrix).toContain('peg-in evidence cites peg-in event ID or TX ID');
    expect(matrix).toContain('peg-out burn evidence cites peg-out burn TX ID');
    expect(matrix).toContain('anchor evidence cites sidechain block hash');
    expect(matrix).toContain('anchor evidence cites bridge event root');
    expect(matrix).toContain('anchor evidence cites Ergo anchor height');
    expect(matrix).toContain('settlement check evidence cites Expected transaction ID');
    expect(matrix).toContain('Legacy V1 transport = quarantined');
    expect(matrix).toContain('positive miner feeNanoErg amount');
    expect(matrix).toContain('settlement submit evidence cites submitted transaction ID');
    expect(matrix).toContain('confirmation evidence cites submitted transaction ID');
    expect(matrix).toContain('required confirmation count');
    expect(matrix).toContain('confirmation policy met');
    expect(matrix).toContain('confirmation policy met cites confirmationsRequired');
    expect(matrix).toContain('confirmation policy met cites confirmationsObserved');
    expect(matrix).toContain('confirmation policy met cites submitted transaction ID');
    expect(matrix).toContain('observed confirmation count greater than or equal to required confirmation count');
    expect(matrix).toContain('confirmation policy met links completed finality evidence');
    expect(matrix).toContain('reconciliation evidence cites submitted successor and burn values');
    expect(matrix).toContain('reconciliation evidence cites peg-out burn TX ID');
    expect(matrix).toContain('Production-ready claim allowed by this rehearsal: no');
    expect(matrix).toContain('Testnet production-candidate claim allowed by this rehearsal: no');
    expect(matrix).toContain('distinct completed Gate 3 rehearsal release-note/checklist update evidence targets');
    expect(roadmap).toContain('no phantom DUP/AVL history after failed broadcast');
    expect(roadmap).toContain('reorged-burn/stale-singleton detection');
    expect(roadmap).toContain('failed-broadcast evidence now must cite Expected transaction ID');
    expect(roadmap).toContain('stale-singleton evidence now must cite singleton inventory identifier');
    expect(roadmap).toContain('Live rehearsal reviewer sign-off now must match');
    expect(roadmap).toContain('generic broadcast-approval artifact');
    expect(roadmap).toContain('bare `yes` cannot authorize a');
    expect(roadmap).toContain('generic readiness artifact');
    expect(roadmap).toContain('bare `PASS` or generic');
    expect(roadmap).toContain('generic network artifact');
    expect(roadmap).toContain('disabled start/end and cleanup evidence');
    expect(roadmap).toContain('positive `feeNanoErg`');
    expect(roadmap).toContain('reconciliation evidence now must cite submitted successor and burn values');
    expect(roadmap).toContain('Settlement reconciliation now refuses to mutate DUP history');
    expect(roadmap).toContain('expected `aggregate_submitted` or `batch_submitted` status');
    expect(roadmap).toContain('Historical aggregate settlement approval controls bind exact transaction IDs');
    expect(roadmap).toContain('expose no new V1 signing, node-check, authorization, submission, or transport');
    expect(roadmap).toContain('external-fee profile plus permanent legacy-route retirement');
    expect(roadmap).toContain('Fresh testnet confirmation evidence now must record');
    expect(roadmap).toContain('Confirmation policy met: yes');
    expect(roadmap).toContain('finality evidence linked from the confirmation policy field');
    expect(roadmap).toContain('confirmation policy field');
  });

  it('keeps every operator runbook tied to stop conditions and verification commands', () => {
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const template = readFileSync(join(bridgeRoot, 'docs', 'operator-readiness-evidence-template.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const sections = extractRunbookSections(runbooks);
    const expectedRunbookHeadings = [
      '## Runbook 0: Config-Free Recovery Rehearsal',
      '## Runbook 1: Dry-Run Readiness Gate',
      '## Runbook 2: Deployment And Migration',
      '## Runbook 3: Broadcast Enablement',
      '## Runbook 4: Daemon Startup',
      '## Runbook 5: Settlement Failure Triage',
      '## Runbook 6: Reorg Recovery',
      '## Runbook 7: Pause And Resume',
      '## Runbook 8: Key Rotation',
      '## Runbook 9: Storage-Rent And Liquidity Maintenance',
      '## Runbook 10: Incident Response',
      '## Runbook 11: Monitoring And Alerting',
      '## Runbook 12: SQLite And AVL Backup Restore',
    ];
    const requiredChecklistItems = [
      'Dry-run readiness runbook exists.',
      'Deploy/migration runbook exists.',
      'Broadcast enablement runbook exists.',
      'Daemon startup runbook exists.',
      'Pause/resume runbook exists.',
      'Settlement failure runbook exists.',
      'Reorg recovery runbook exists.',
      'Key rotation runbook exists.',
      'Storage-rent/liquidity maintenance runbook exists.',
      'SQLite/AVL backup and restore runbook exists.',
      'Incident response runbook exists.',
      'Monitoring and alerting runbook exists.',
      'Each runbook has stop conditions and verification commands.',
      'Completed operator readiness evidence passes `npm run operator:validate`.',
      'operator-readiness `Runbook operator` sign-off matches',
      'Completed operator-readiness release-note update evidence is linked in',
      'Completed operator-readiness checklist update evidence is linked in the',
    ];
    const requiredTemplateSections = [
      '## Readiness Classification',
      '## Runbook Coverage',
      '## Required Commands',
      '## Incident And Recovery Drills',
      '## Operational Decisions',
      '## Publication Decision',
      '## Reviewer Sign-Off',
    ];
    const requiredTemplateTerms = [
      'The blank template is expected to fail validation.',
      'npm run operator:validate',
      'release:gate -- --operator-readiness-evidence',
      'completed operator readiness evidence',
      'operator readiness validation target',
      'Dry-run readiness',
      'Deployment and migration',
      'Broadcast enablement',
      'Daemon startup',
      'Settlement failure triage',
      'Reorg recovery',
      'Pause and resume',
      'Key rotation',
      'Storage-rent and liquidity maintenance',
      'Incident response',
      'Monitoring and alerting',
      'SQLite and AVL backup restore',
      'Broadcast disabled by default',
      'Daemon refuses unsafe live settlement',
      'Rows marked `linked` must include completed runbook',
      'names alone are resolution targets',
      'Required release-note and checklist updates must link completed',
      'completed Gate 6 operator evidence',
      'Required release-note updates',
      'completed operator-readiness release-note update evidence',
      'completed operator-readiness checklist update evidence',
      'operator-readiness publication-update evidence',
      'Rows marked `linked` must include a non-template evidence link',
      'Targetless command-output text',
      'Each command row must identify the matching command output',
      'single shared',
      'operator command artifact is not enough',
      'Rows marked `linked` must state both the stop-condition checks',
      'verification-command checks performed by the operator',
      'Missing or enabled broadcast mode is blocked before Gate 6 operator readiness',
      'evidence cell must identify the covered runbook',
      'deployment/migration',
      'settlement failure',
      'storage-rent/liquidity',
      'SQLite/AVL backup',
      'Rows marked `linked` must state an actionable recovery outcome.',
      'generic review notes are not enough',
      'Rows marked `linked` must include an actionable stop condition.',
      'stop, block, fail, disable, pause, incident, do not, or',
      'required evidence cell must identify the decision category',
      'runbook discovery',
      'governance rotation evidence',
      'opt-in evidence',
      'Critical incidents open',
      'Critical incidents open = 0',
      '`Reviewer decision summary` must mention release support',
      'Release supported = production deployment candidate',
      'operator-ready claim handling',
      'production-ready claim handling',
      'critical incidents',
      'Mainnet production-ready claims are forbidden',
      'Production-ready claim',
      'allowed` must remain `no`',
      'Production deployment candidate support requires `Operator-ready claim allowed =',
      'Testnet production-candidate claim allowed = yes',
      'Reviewer notes must state a concrete operator-readiness outcome',
      'Runbook operator` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Readiness Classification `Date`',
      'Generic notes such as `reviewed` or `evidence accepted` are not enough.',
    ];

    for (const item of requiredChecklistItems) {
      expect(checklist, item).toContain(item);
    }

    for (const section of requiredTemplateSections) {
      expect(template, section).toContain(section);
    }

    for (const term of requiredTemplateTerms) {
      expect(template, term).toContain(term);
    }

    expect(matrix).toContain('completed operator-readiness release-note update evidence');
    expect(matrix).toContain('completed operator-readiness checklist update evidence');
    expect(matrix).toContain('release-gate `--operator-readiness-evidence`');
    expect(matrix).toContain('completed operator readiness evidence');
    expect(matrix).toContain('operator readiness validation target');
    expect(matrix).toContain('linked runbook coverage');
    expect(matrix).toContain('bounded command-purpose text');
    expect(matrix).toContain('command-specific operator command evidence');
    expect(matrix).toContain('internally positive command output');
    expect(matrix).toContain('distinct completed evidence targets across linked runbook, command, drill, and decision rows');
    expect(matrix).toContain('completed row evidence that is not an `operator readiness validation target` / `validated target` binding');
    expect(matrix).toContain('structured Readiness Classification');
    expect(matrix).toContain('decision-specific operational evidence');
    expect(matrix).toContain('broadcast mode disabled or dry-run');
    expect(matrix).toContain('Operator type = external operator or exchange operations reviewer');
    expect(matrix).toContain('non-empty reviewer');
    expect(matrix).toContain('ISO Date');
    expect(matrix).toContain('enabled broadcast mode blocked for Gate 6 operator readiness evidence');
    expect(matrix).toContain('production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`');
    expect(matrix).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(matrix).toContain('Testnet production-candidate claim allowed = yes');
    expect(matrix).toContain('Operator-ready claim allowed = yes');
    expect(matrix).toContain('Critical incidents open = 0');
    expect(matrix).toContain('Release notes updated = yes');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('testnet production-candidate claim handling');
    expect(matrix).toContain('actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement');
    expect(matrix).toContain('internally non-contradictory operator reviewer notes');
    expect(matrix).toContain('runbook operator sign-off matches readiness classification');
    expect(matrix).toContain('runbook operator sign-off date is not before readiness classification Date');
    expect(matrix).toContain('distinct completed operator-readiness release-note/checklist update evidence targets');
    expect(matrix).toContain('internally non-contradictory operator-readiness publication-update evidence');
    expect(checklist).toContain('runbook operator sign-off matches readiness classification');
    expect(checklist).toContain('runbook operator sign-off date is not before readiness classification Date');
    expect(checklist).toContain('Operator-ready claim allowed = yes');
    expect(checklist).toContain('Testnet production-candidate claim allowed = yes');
    expect(checklist).toContain('Critical incidents open = 0');
    expect(checklist).toContain('classified `Broadcast mode` as `disabled` or');
    expect(checklist).toContain('release:gate -- --operator-readiness-evidence');
    expect(checklist).toContain('completed operator-readiness evidence');
    expect(checklist).toContain('operator readiness validation target');
    expect(checklist).toContain('broadcast mode disabled or dry-run');
    expect(checklist).toContain('enabled broadcast mode blocked for Gate 6 operator readiness evidence');
    expect(roadmap).toContain('Operator readiness runbook-operator sign-off dates now must use ISO calendar');
    expect(roadmap).toContain('operator readiness evidence to');
    expect(roadmap).toContain('Broadcast mode = disabled');
    expect(roadmap).toContain('Critical incidents open = 0');
    expect(runbooks).toContain('aggregate settlement script does not auto-load `relayer/.env`');
    expect(runbooks).toContain('The approval generator');
    expect(runbooks).toContain('is physically absent');
    expect(runbooks).toContain('only as immutable');
    expect(runbooks).toContain('provenance for an exact transaction');
    expect(runbooks).toContain('They are never daemon startup inputs or current authority');
    expect(runbooks).toContain('npm run settle:aggregate:recover -- scan --json');
    expect(runbooks).toContain('confirmed=no');
    expect(runbooks).toContain('mempool=no');
    expect(runbooks).toContain('npm run settle:aggregate:recover -- abandon <expectedTxId>');
    expect(runbooks).toContain('npm run settle:aggregate:recover -- apply');

    expect(sections.map(section => section.split(/\r?\n/, 1)[0])).toEqual(
      expectedRunbookHeadings,
    );

    for (const section of sections) {
      expect(section).toContain('Stop conditions:');
      expect(section).toMatch(/```(?:bash|powershell)?[\s\S]*npm run [\s\S]*```/);
    }
  });

  it('keeps the incident response runbook tied to required incident classes', () => {
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const incidentRunbook = extractRunbookSections(runbooks).find(section =>
      section.startsWith('## Runbook 10: Incident Response'),
    );
    const requiredIncidentTerms = [
      'Duplicate payout or DUP ambiguity',
      'Signer or broadcast policy anomaly',
      'Node or network mismatch',
      'Ergo or sidechain reorg ambiguity',
      'Anchor or SPV tracker mismatch',
      'Singleton invariant break',
      'Liquidity or storage-rent break',
      'Dependency or serializer regression',
    ];
    const requiredSafeguards = [
      'Stop the daemon.',
      'Disable broadcast in all shells.',
      'Run read-only status/preflight commands only.',
      'Do not:',
      'Retry failed events until classification is complete.',
      'Exit criteria:',
      'A regression test or runbook update is added for the incident class.',
    ];

    expect(incidentRunbook).toBeTruthy();

    for (const term of [...requiredIncidentTerms, ...requiredSafeguards]) {
      expect(incidentRunbook, term).toContain(term);
    }
  });

  it('keeps the monitoring runbook tied to required bridge health signals', () => {
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const monitoringRunbook = extractRunbookSections(runbooks).find(section =>
      section.startsWith('## Runbook 11: Monitoring And Alerting'),
    );
    const requiredSignals = [
      'Daemon liveness',
      'Broadcast policy',
      'Signer and ContextExtension guard',
      'DUP and settlement reconciliation',
      'SPV tracker and anchor health',
      'Singleton integrity',
      'Liquidity and storage rent',
      'Dependency and clean-checkout drift',
    ];
    const requiredCommands = [
      'npm run status',
      'npm run demo:readiness',
    ];
    const requiredEscalation = [
      'Disable broadcast before any retry or manual state change.',
      'Move to Runbook 10',
      'Preserve command output and chain heights',
    ];

    expect(monitoringRunbook).toBeTruthy();

    for (const term of [...requiredSignals, ...requiredCommands, ...requiredEscalation]) {
      expect(monitoringRunbook, term).toContain(term);
    }
    expect(monitoringRunbook).not.toContain('npm run demo:batch:preflight');
  });

  it('keeps demo readiness diagnostic while legacy V1 submission is quarantined', () => {
    const source = readFileSync(join(srcRoot, 'scripts', 'demo-readiness.ts'), 'utf8');
    const nextActionsStart = source.indexOf('Next safe legacy V1 diagnostic actions');
    expect(nextActionsStart).toBeGreaterThan(-1);
    expect(source).toContain('classifyLiveSettlementStartupReadiness');
    expect(source).toContain('assertErgoNodeEndpointAlignment');
    expect(source).toContain('aggregateSettlementApprovalContext');
    expect(source).toContain('deployedStateHash');
    expect(source).toContain('Approval Evidence Context');
    expect(source).toContain('sidechainNetwork');

    const nextActions = source.slice(nextActionsStart);
    for (const term of [
      'do not generate new V1 approvals',
      'BRIDGE_BROADCAST_ENABLED=false',
      'AGGREGATE_SETTLEMENT_ENABLED=false',
      'Legacy V1 signing, node-check, authorization, and transport are physically absent',
      'npm run settle:aggregate -- prepare-batch',
      'These diagnostics cannot sign, reach /transactions/check, authorize settlement, or close Gate 5',
      'external-fee profile and legacy-route retirement',
      'Historical confirmation/recovery only',
    ]) {
      expect(nextActions, term).toContain(term);
    }
    expect(nextActions).not.toContain('npm run settle:aggregate -- submit');
    expect(nextActions).not.toContain('--post-submit <post-submit-fragment.md>');
  });

  it('keeps the SQLite and AVL backup-restore runbook tied to recovery evidence', () => {
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const backupRunbook = extractRunbookSections(runbooks).find(section =>
      section.startsWith('## Runbook 12: SQLite And AVL Backup Restore'),
    );
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const register = readFileSync(join(bridgeRoot, 'docs', 'dependency-risk-register.md'), 'utf8');
    const template = readFileSync(join(bridgeRoot, 'docs', 'backup-restore-evidence-template.md'), 'utf8');
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const requiredTerms = [
      'Stop the daemon.',
      'Disable broadcast in all shells.',
      'relayer/bridge-state.sqlite',
      'relayer/bridge-state.sqlite-wal',
      'relayer/bridge-state.sqlite-shm',
      'DUP AVL',
      'SPV tracker history',
      'persisted anchors',
      'Compare restored DUP and SPV history counts',
      'Rebuilt local DUP and SPV tracker digests are each compared',
      'DUP singleton and SPV tracker singleton comparison rows must be separate',
      '33-byte AVL hex digests',
      'Restore target is isolated',
      'reviewer approval evidence',
      'rollback plan evidence',
      'No `.env`, SQLite backup, WAL file, or diagnostic artifact is staged.',
      'Runbook 10',
      'Stop conditions:',
      'Backup Restore Evidence Template',
      'npm run backup:snapshot',
      'npm run backup:compare',
      'npm run backup:validate',
      'git diff --check',
      'git status --short',
      'no-staged-runtime-artifacts',
    ];
    const requiredTemplateSections = [
      '## Drill Classification',
      '## Required Commands',
      '## State Consistency Checks',
      '## Reconstructibility Boundaries',
      '## Stop Conditions',
      '## Publication Evidence',
      '## Reviewer Sign-Off',
    ];
    const requiredTemplateTerms = [
      'Do not paste `.env` contents',
      'npm run status',
      'npm run demo:readiness',
      'npm run backup:snapshot',
      'npm run wasm:test',
      'git diff --check',
      'git status --short',
      'no-staged-runtime-artifacts',
      'generic git hygiene artifact is not enough',
      'SQLite backup is local operator state, not consensus',
      'WAL and SHM are restored as matched set when present',
      'AVL histories are reconstructed from committed rows',
      'Digest mismatch triggers incident response',
      'Evidence excludes secrets and runtime databases',
      'boundary-specific fact being checked',
      'generic artifact names or notes such as `reviewed` are not enough',
      'Row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'The blank template is expected to fail validation.',
      'Rows marked `linked` must include a completed command-output target',
      'targetless command-output notes',
      'bare validator command names alone',
      'command-specific signal',
      'local-only status counts',
      'local snapshot comparison',
      'The `Compare pre-backup and restored state` command row must link completed',
      'restored snapshot `generatedAt` timestamp must be after the pre-backup',
      '`backup:validate` also checks that the command row itself cites the distinct',
      'generic comparison artifact is not enough',
      'compares the same snapshot target or cloned snapshot timestamp',
      '`backup:snapshot`',
      '`databaseLabel`, `evidenceRows`, and `notes`',
      'measured snapshot value formats',
      'Each required `evidenceRows` entry must be',
      'must match the corresponding measured `stateConsistencyValues`',
      'using narrative values',
      'does not compare rebuilt DUP or SPV tracker digests',
      'on-chain singleton boxes',
      'DUP singleton digest comparison',
      'SPV tracker singleton digest comparison',
      'DUP singleton digest comparison or incident classification',
      'SPV tracker singleton digest comparison or incident classification',
      'DUP and SPV tracker singleton row states',
      'The `backup:snapshot` JSON can provide local pre-backup and post-restore values',
      'The `backup:compare` JSON must show matching local snapshot values',
      'Local SQLite State Consistency Checks rows must link completed',
      'evidence cell must also cite the',
      'measured pre-backup/restored value',
      'DUP AVL rebuild',
      'SPV tracker rebuild',
      '`Restore target` must state an isolated restore database or a reviewed restore',
      'completed reviewer approval evidence and rollback plan evidence',
      'A row marked `linked` must have a',
      'restored value that exactly matches the pre-backup value',
      '`status=count` pairs',
      'count rows use numeric values',
      '33-byte AVL hex digests',
      'Runtime hygiene rows state',
      'Rows marked `linked` in Stop Conditions',
      'non-template evidence link',
      'stop, block, fail, disable, pause, incident, do not',
      'Gate 3 backup-restore evidence must update publication control documents',
      'completed Gate 3 backup-restore release-note update evidence',
      'completed Gate 3 backup-restore checklist update evidence',
      'distinct completed publication evidence targets',
      'Production-ready claim allowed by this drill: no',
      'Testnet production-candidate claim allowed by this drill: no',
      'The `Restore operator` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Drill Classification `Date`',
      'Reviewer notes must state a concrete backup-restore outcome',
      'digest or state',
      'consistency, reconstructibility boundaries',
      '`reviewed restore evidence` are not enough',
      'pending / linked / blocker',
    ];

    expect(backupRunbook).toBeTruthy();
    expect(roadmap).toContain('SQLite/AVL backup and restore runbook');
    expect(roadmap).toContain('restored SQLite backup preserves peg-out');
    expect(roadmap).toContain('docs/backup-restore-evidence-template.md');
    expect(roadmap).toContain('Production-ready claim allowed by this drill: no');
    expect(roadmap).toContain('Testnet production-candidate claim allowed by this drill: no');
    expect(register).toContain('SQLite/AVL backup-restore runbook');
    expect(register).toContain('Live backup/restore rehearsal');
    expect(register).toContain('Backup Restore Evidence Template');
    expect(checklist).toContain('Production-ready claim allowed by this drill: no');
    expect(checklist).toContain('Testnet production-candidate claim allowed by this drill: no');
    expect(checklist).toContain('state evidence cites measured pre-backup/restored values');
    expect(checklist).toContain('DUP singleton digest comparison or incident classification');
    expect(checklist).toContain('SPV tracker singleton digest comparison or incident classification');
    expect(checklist).toContain('restore operator sign-off matches drill classification');
    expect(checklist).toContain('restore operator sign-off date is not before drill classification Date');
    expect(checklist).toContain('no staged runtime artifacts');
    expect(matrix).toContain('Production-ready claim allowed by this drill: no');
    expect(matrix).toContain('Testnet production-candidate claim allowed by this drill: no');
    expect(matrix).toContain('separate DUP singleton digest comparison or incident classification');
    expect(matrix).toContain('separate SPV tracker singleton digest comparison or incident classification');
    expect(matrix).toContain('restore operator sign-off matches drill classification');
    expect(matrix).toContain('restore operator sign-off date is not before drill classification Date');
    expect(matrix).toContain('no staged runtime artifacts');
    expect(matrix).toContain('snapshot evidenceRows match measured values');
    expect(matrix).toContain('state evidence cites measured pre-backup/restored values');
    expect(roadmap).toContain('Backup-restore restore-operator sign-off now must match');
    expect(roadmap).toContain('restore operator sign-off date is not before drill classification Date');
    expect(roadmap).toContain('Backup-restore git hygiene evidence now must cite');
    expect(roadmap).toContain('evidenceRows');
    expect(roadmap).toContain('stateConsistencyValues');
    expect(roadmap).toContain('State Consistency evidence now must cite the measured');
    expect(roadmap).toContain('separate DUP singleton');
    expect(roadmap).toContain('SPV tracker singleton digest comparison');

    for (const term of requiredTerms) {
      expect(backupRunbook, term).toContain(term);
    }

    for (const section of requiredTemplateSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTemplateTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps public readiness and security claims conservative until release gates are green', () => {
    const publicDocs = [
      join(bridgeRoot, 'README.md'),
      ...collectMarkdownFiles(join(bridgeRoot, 'docs')),
      ...collectMarkdownFiles(join(bridgeRoot, 'phases')),
    ];
    const absoluteSecurityPatterns = [
      /\bunhackable\b/i,
      /\bmainnet[- ]ready\b/i,
      /\bmass[- ]ready\b/i,
      /\bzero[- ]risk\b/i,
      /\bguaranteed secure\b/i,
    ];
    const cautiousReadinessContext =
      /\b(not|blocked|until|before|do not|anti-pattern|prototype still|claim|claims|gate|gates|pending|required|requires|requirement|forbidden|absent|controlled|testnet-scoped|never|scoped|wording|validation|validator|check|template|expected|misread|correction|target|objective|north star|goal|build|cannot bypass)\b/i;
    const publicationClaimPattern =
      /\b(production[- ]?ready|production[- ]?readiness|production[- ]?candidate|production[- ]?grade|prod[- ]?ready|prod[- ]?candidate|prod[- ]?grade|bank[- ]?grade|ready[- ]?for[- ]?production|ready[- ]?for[- ]?prod|deployment[- ]?ready|release[- ]?ready|market[- ]?ready|launch[- ]?ready|main[- ]?net.{0,80}(?:production|go[- ]?live|general[- ]?availability|launch|candidate|grade|ready|exchange|enterprise|institutional)|main\s+network.{0,80}(?:production|go[- ]?live|general[- ]?availability|launch|candidate|grade|ready|exchange|enterprise|institutional)|main[- ]chain.{0,80}(?:production|go[- ]?live|general[- ]?availability|launch|candidate|grade|ready|exchange|enterprise|institutional)|go[- ]?live|general[- ]?availability|ga[- ]?ready|production[- ]launch|exchange[- ]?ready|exchange[- ]?grade|institutional[- ]?ready|institutional[- ]?grade|enterprise[- ]?ready|enterprise[- ]?grade|trustless bridge)\b/gi;
    const ambiguousProductionPathPattern =
      /\b(production[- ]daemon[- ]path|production[- ]path|prod[- ]path|production[- ]mode)\b/gi;
    const allowedProductionPathBoundary =
      /\b(node[- ]wallet|sign(?:er|ing)?|unsafe|blocked|depends|review|scope|cannot|removed|excluded?|confuse|guarded|evidence|no\s*\/\s*cannot|not\s+the\s+production\s+path)\b/i;
    const scanTriggerFixtures = [
      'production-candidate bridge',
      'prod-grade bridge',
      'exchange-ready bridge',
      'institutional-ready bridge',
      'deployment-ready bridge',
      'trustless bridge',
      'mainchain launch-ready bridge',
      'main chain exchange-ready bridge',
      'main network prod-grade bridge',
    ];
    const ambiguousPathTriggerFixtures = [
      'production daemon path',
      'production path',
      'prod path',
      'production mode',
    ];
    const readinessOffenders: string[] = [];
    const publicationClaimOffenders: string[] = [];
    const ambiguousProductionPathOffenders: string[] = [];
    const staleProductionDeploymentClaimOffenders: string[] = [];
    const absoluteSecurityOffenders: string[] = [];
    const zeroTargetOffenders: string[] = [];

    for (const wording of scanTriggerFixtures) {
      expect(wording.match(publicationClaimPattern), wording).not.toBeNull();
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasProductionClaim: true,
      });
    }
    for (const wording of ambiguousPathTriggerFixtures) {
      expect(wording.match(ambiguousProductionPathPattern), wording).not.toBeNull();
    }

    for (const file of publicDocs) {
      const rel = toPosix(relative(bridgeRoot, file));
      const text = readFileSync(file, 'utf8');

      for (const pattern of absoluteSecurityPatterns) {
        if (pattern.test(text)) absoluteSecurityOffenders.push(`${rel}: ${pattern.source}`);
      }

      for (const context of matchContexts(
        text,
        /\b(production-ready|production ready|ready for production)\b/gi,
      )) {
        if (!cautiousReadinessContext.test(context)) readinessOffenders.push(`${rel}: ${context}`);
      }

      for (const context of matchContexts(text, publicationClaimPattern)) {
        const isReleaseNotesVocabularyList =
          rel === 'docs/release-notes-template.md' &&
          /\b(prod[- ]?ready|prod[- ]?candidate|prod[- ]?grade|ready[- ]?for[- ]?production|go[- ]?live|general availability|generally available|enterprise[- ]?ready)\b/i.test(context);
        if (isReleaseNotesVocabularyList) continue;

        const claim = classifyPublicationClaimText(context);
        const unqualifiedProductionClaim =
          claim.hasProductionClaim &&
          !claim.hasControlledTestnetProductionClaim &&
          !cautiousReadinessContext.test(context);
        const forbiddenClaim =
          (claim.hasMainnetProductionClaim || claim.hasProductionReadyClaim) &&
          !cautiousReadinessContext.test(context);
        if (forbiddenClaim || unqualifiedProductionClaim) {
          publicationClaimOffenders.push(`${rel}: ${context}`);
        }
      }

      for (const context of matchContexts(text, ambiguousProductionPathPattern)) {
        if (!allowedProductionPathBoundary.test(context)) {
          ambiguousProductionPathOffenders.push(`${rel}: ${context}`);
        }
      }

      for (const context of matchContexts(
        text,
        /\b(?:only\s+testnet-scoped\s+production[-\s]+deployment[-\s]+candidate|production[-\s]+deployment[-\s]+candidate\s+claims?)\b/gi,
      )) {
        staleProductionDeploymentClaimOffenders.push(`${rel}: ${context}`);
      }

      for (const context of matchContexts(text, /\bzero (bug|hack)\b/gi)) {
        const isAllowedObjectiveTarget =
          rel === 'docs/ultimate-bridge-objective.md' &&
          /engineering release target/i.test(context);
        if (!isAllowedObjectiveTarget) zeroTargetOffenders.push(`${rel}: ${context}`);
      }
    }

    expect(absoluteSecurityOffenders).toEqual([]);
    expect(readinessOffenders).toEqual([]);
    expect(publicationClaimOffenders).toEqual([]);
    expect(ambiguousProductionPathOffenders).toEqual([]);
    expect(staleProductionDeploymentClaimOffenders).toEqual([]);
    expect(zeroTargetOffenders).toEqual([]);
  });

  it('keeps testnet production-candidate claim wording gated across planning docs', () => {
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const runbooks = readFileSync(join(bridgeRoot, 'docs', 'operator-runbooks.md'), 'utf8');
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const releaseNotes = readFileSync(join(bridgeRoot, 'docs', 'release-notes-template.md'), 'utf8');
    const register = readFileSync(join(bridgeRoot, 'docs', 'dependency-risk-register.md'), 'utf8');
    const phaseIndex = readFileSync(join(bridgeRoot, 'phases', 'phase-index.md'), 'utf8');
    const architectureManual = readFileSync(
      join(bridgeRoot, 'docs', 'testnet-production-candidate-architecture-manual-template.md'),
      'utf8',
    );

    expect(roadmap).toContain('released upstream signer fix with JVM/node conformance');
    expect(roadmap).toContain('fail-closed guard alone remains institutional-reference only');
    expect(roadmap).toContain('`production deployment candidate` is a release-level classification, not public');
    expect(roadmap).toContain('claim wording; public claims must use the controlled `testnet');
    expect(runbooks).toContain('There is no current aggregate payout profile eligible for broadcast');
    expect(runbooks).toContain('Do not set `BRIDGE_BROADCAST_ENABLED=true` for legacy V1');
    expect(runbooks).toContain('A future procedure may be written only after a separately versioned');
    expect(runbooks).toContain('route is physically absent because V1 funds the miner fee');
    expect(runbooks).toContain('`AGGREGATE_SETTLEMENT_ENABLED=true` enables only historical');
    expect(runbooks).toContain('versioned external-fee profile with legacy-route retirement');
    expect(runbooks).toContain('deployment-state hash');
    expect(checklist).toContain('`production deployment candidate` is an internal release level, not allowed');
    expect(checklist).toContain('public claim wording. Public claims must use `testnet production-candidate`');
    expect(checklist).toContain('Operator-readiness evidence used for a production deployment candidate');
    expect(checklist).toContain('Public claims must use `testnet production-candidate` or');
    expect(checklist).toContain('`production-grade testnet` after the required evidence is complete');
    expect(releaseNotes).toContain('controlled `testnet production-candidate` or `production-grade testnet` public wording');
    expect(releaseNotes).toContain('this exception does not allow production-ready, mainnet, go-live, general availability, generally available, or production launch wording');
    expect(register).toContain(
      'Dependency state blocks testnet production-candidate / production-grade testnet claims.',
    );
    expect(checklist).toContain('npm run addendum:validate');
    expect(phaseIndex).toContain('Draft a gated testnet production-candidate architecture manual');
    expect(phaseIndex).toContain('validator/template/release-gate binding added; do not publish or use the claim until release gates pass');
    expect(roadmap).toContain('`npm run addendum:validate`');
    expect(roadmap).toContain('`npm run release:gate -- --technical-addendum-evidence`');
    expect(roadmap).toContain('Phase 007 gated architecture manual evidence');
    expect(roadmap).toContain('validation-only target binding cannot stand in for the manual');
    expect(checklist).toContain('completed technical-addendum evidence outside the validator output segment');
    expect(architectureManual).toContain('outside the');
    expect(architectureManual).toContain('validator output segment');
    expect(architectureManual).toContain('validation log that only names the completed');
    expect(architectureManual).toContain('row-named non-concrete artifact targets');
    expect(architectureManual).toContain('sample-evidence-*');
    expect(architectureManual).toContain('example-evidence-*');

    expect(roadmap).not.toContain('| Upstream ContextExtension release or fail-closed guard | yes | yes |');
    expect(runbooks).not.toContain('Operator has decided the session may broadcast transactions.');
    expect(checklist).not.toContain('Production-ready operator evidence also states');
    expect(releaseNotes).not.toContain('unless the release level is production deployment candidate and all production gates are linked');
    expect(register).not.toContain('Dependency state blocks production-grade claims.');
    expect(phaseIndex).not.toContain('Publish "Testnet Production-Candidate Bridge Architecture Manual"');
  });

  it('keeps documented npm run commands backed by package scripts', () => {
    const packageJson = JSON.parse(
      readFileSync(join(bridgeRoot, 'relayer', 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const availableScripts = new Set(Object.keys(packageJson.scripts ?? {}));
    const publicDocs = [
      join(bridgeRoot, 'README.md'),
      ...collectMarkdownFiles(join(bridgeRoot, 'docs')),
    ];
    const missingScripts = publicDocs.flatMap(file => {
      const rel = toPosix(relative(bridgeRoot, file));
      const markdown = readFileSync(file, 'utf8');

      return extractNpmRunScripts(markdown)
        .filter(script => !availableScripts.has(script))
        .map(script => `${rel}: npm run ${script}`);
    });

    expect(missingScripts).toEqual([]);
  });

  it('keeps package script TypeScript entrypoints backed by tracked files', () => {
    const packageJson = JSON.parse(
      readFileSync(join(bridgeRoot, 'relayer', 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const missingEntrypoints = Object.entries(packageJson.scripts ?? {}).flatMap(
      ([scriptName, command]) =>
        extractTsxTargets(command)
          .filter(target => !existsSync(join(bridgeRoot, 'relayer', target)))
          .map(target => `${scriptName}: ${target}`),
    );

    expect(missingEntrypoints).toEqual([]);
  });

  it('keeps README and docs internal Markdown links backed by files', () => {
    const publicDocs = [
      join(bridgeRoot, 'README.md'),
      ...collectMarkdownFiles(join(bridgeRoot, 'docs')),
    ];
    const missingLinks = publicDocs.flatMap(file => {
      const rel = toPosix(relative(bridgeRoot, file));
      const markdown = readFileSync(file, 'utf8');

      return extractMarkdownLinks(markdown)
        .map(target => [target, resolveInternalMarkdownLink(file, target)] as const)
        .filter(([, resolved]) => resolved !== null && !existsSync(resolved))
        .map(([target]) => `${rel}: ${target}`);
    });

    expect(missingLinks).toEqual([]);
  });

  it('keeps the dependency risk register tied to critical dependency surfaces', () => {
    const register = readFileSync(join(bridgeRoot, 'docs', 'dependency-risk-register.md'), 'utf8');
    const template = readFileSync(
      join(bridgeRoot, 'docs', 'dependency-review-evidence-template.md'),
      'utf8',
    );
    const checklist = readFileSync(join(bridgeRoot, 'docs', 'release-checklist.md'), 'utf8');
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const roadmap = readFileSync(join(bridgeRoot, 'docs', 'ultimate-bridge-roadmap.md'), 'utf8');
    const packageJson = JSON.parse(
      readFileSync(join(bridgeRoot, 'relayer', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const cargoToml = readFileSync(join(bridgeRoot, 'wasm-avl', 'Cargo.toml'), 'utf8');
    const requiredDependencyNames = [
      'ergo-lib-wasm-nodejs',
      '@fleet-sdk/core',
      '@fleet-sdk/common',
      '@fleet-sdk/wallet',
      'better-sqlite3',
      'blakejs',
      'ethers',
    ];
    const requiredRegisterTerms = [
      'sigma-rust ContextExtension serializer',
      'ergo_avltree_rust',
      'wasm-pack',
      'Node.js / npm lockfile',
      'Open blocker',
      'Pending review',
      'Guarded',
      'npm run check',
      'npm run wasm:test',
      'released upstream dependency',
      'vulnerability triage',
      'dependency-review-evidence-template.md',
      'npm run dependency:validate',
      'not yet validated',
      'not fully validated',
      'partially validated is blocker evidence',
    ];
    const requiredTemplateSections = [
      '## Review Classification',
      '## Required Commands',
      '## Dependency Scope',
      '## Vulnerability Triage',
      '## Upgrade And Pinning Decision',
      '## Publication Decision',
      '## Reviewer Sign-Off',
    ];
    const requiredTemplateTerms = [
      'not an audit report',
      'Do not paste `.env` contents',
      'npm ci',
      'npm run check',
      'npm run wasm:test',
      'npm audit --omit=dev',
      'cargo tree --locked',
      'npm run dependency:validate',
      'ergo-lib-wasm-nodejs',
      'sigma-rust ContextExtension serializer',
      'ergo_avltree_rust',
      'Lockfile integrity',
      'Rows marked `linked` must explicitly state zero, none, no open, closed, or',
      'Any unresolved critical/high finding must stay',
      'The `Reviewed risk` cell must stay dependency-specific',
      'generic wording such as',
      'wallet fallback',
      '`Evidence` cell must identify the reviewed dependency or toolchain',
      'Fleet SDK core',
      'better-sqlite3',
      'Node.js/npm lockfile',
      'The signer dependency row must state either upstream release/conformance',
      'Negated or qualified-incomplete wording such as missing, unavailable',
      'not yet validated',
      'not yet verified',
      'not fully validated',
      'partially',
      'fail-closed guard/blocker rationale',
      'completed ContextExtension guard evidence',
      'generic fail-closed note is not completed signer-risk evidence',
      'production-ready claims remain blocked',
      'completed dependency review evidence markers',
      'non-template evidence link',
      'bare validator command names',
      'row-named non-concrete artifact targets',
      'sample-evidence-*',
      'example-evidence-*',
      'resolution targets',
      'not completed dependency review evidence',
      'Required release-note updates',
      'link completed release-note update',
      'dependency review release-note evidence',
      'Required checklist updates',
      'dependency review checklist update evidence',
      'Generic checklist links do not prove the dependency-risk publication update.',
      '`Reviewer decision summary` must mention release support',
      'upstream signer blocker handling',
      'production-ready claim handling',
      'critical/high vulnerabilities',
      'Critical/high vulnerabilities open',
      'Upstream signer blocker resolved',
      'Release supported = institutional reference',
      'Production-ready claim allowed = no',
      'Critical/high vulnerabilities open = 0',
      'Upstream signer blocker resolved = no',
      'Release notes updated = yes',
      'upstream signer release and JVM/node conformance',
      'Evidence that says JVM/node conformance is missing, unavailable, unverified',
      'not yet validated',
      'not yet verified',
      'not fully validated',
      'production deployment candidate',
      'fail-closed dependency evidence cannot',
      'golden vectors or live `/transactions/check`',
      'fail-closed guard/blocker rationale only supports',
      'must explicitly state that production-ready claims remain blocked',
      'Reviewer notes must state a concrete dependency-risk outcome',
      'Dependency reviewer` sign-off name must match',
      'Reviewer sign-off dates must use `YYYY-MM-DD`',
      'not be before the Review Classification `Date`',
      'no positive critical/high finding counts',
      'ContextExtension serialization',
      'critical/high vulnerability triage',
      '`reviewed dependency evidence` are not enough',
      'pending / linked / blocker',
      'The blank template is expected to fail validation.',
    ];
    const allowedStatuses = new Set([
      'Covered locally',
      'Guarded',
      'Pending review',
      'Open blocker',
    ]);
    const rows = parseDependencyRiskRows(register);
    const malformedRows = rows.filter(row => row.length !== 7);
    const unknownStatuses = rows
      .map(row => row[5])
      .filter(status => !allowedStatuses.has(status));
    const unresolvedSourcePaths = rows.flatMap(row =>
      extractBacktickPaths(row[1])
        .filter(path => !existsSync(join(bridgeRoot, path)))
        .map(path => `${row[0]}: ${path}`),
    );
    const emptyCriticalCells = rows.flatMap(row =>
      row
        .map((cell, index) => [cell, index] as const)
        .filter(([cell]) => cell.length === 0)
        .map(([, index]) => `${row[0]}: empty cell ${index}`),
    );

    expect(checklist).toContain('dependency-risk-register.md');
    expect(checklist).toContain('dependency-review-evidence-template.md');
    expect(checklist).toContain('npm run dependency:validate');
    expect(checklist).toContain('relayer/src/dependency-review-evidence.test.ts');
    expect(checklist).toContain('upstream signer release validation');
    expect(checklist).toContain('JVM/node conformance evidence');
    expect(checklist).toContain(
      'Completed dependency-review and security-review release-note and checklist',
    );
    expect(checklist).toContain(
      'update evidence is linked in the respective evidence packages',
    );
    expect(checklist).toContain('Dependency reviewer decision summary covers release support with exact');
    expect(checklist).toContain('upstream signer blocker handling');
    expect(checklist).toContain('production-ready claim handling');
    expect(checklist).toContain('critical/high vulnerabilities');
    expect(checklist).toContain('Release supported = institutional reference');
    expect(checklist).toContain('Production-ready claim allowed = no');
    expect(checklist).toContain('Critical/high vulnerabilities open = 0');
    expect(checklist).toContain('Upstream signer blocker resolved = no');
    expect(checklist).toContain('Release notes updated = yes');
    expect(checklist).toContain('vulnerability triage');
    expect(checklist).toContain('no positive critical/high finding counts');
    expect(checklist).toContain('explicit fail-closed guard/blocker release-action evidence');
    expect(checklist).toContain('completed ContextExtension guard evidence');
    expect(checklist).toContain('positive JVM golden vectors');
    expect(checklist).toContain('production-ready claims blocked until upstream signer release is validated');
    expect(checklist).toContain('testnet production-candidate claims blocked until upstream signer release is validated');
    expect(checklist).toContain('Testnet production-candidate claim allowed = no');
    expect(checklist).toContain('internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence');
    expect(checklist).toContain('dependency reviewer notes that keep signer and vulnerability boundaries');
    expect(checklist).toContain('internally non-contradictory dependency publication-update evidence');
    expect(matrix).toContain('docs/dependency-risk-register.md');
    expect(matrix).toContain('docs/dependency-review-evidence-template.md');
    expect(matrix).toContain('relayer/src/dependency-review-evidence.test.ts');
    expect(matrix).toContain('concrete upstream release identifier');
    expect(matrix).toContain('explicit fail-closed guard/blocker release-action evidence');
    expect(matrix).toContain('completed ContextExtension guard evidence');
    expect(matrix).toContain('positive JVM golden vectors');
    expect(matrix).toContain('production-ready claims blocked until upstream signer release is validated');
    expect(matrix).toContain('testnet production-candidate claims blocked until upstream signer release is validated');
    expect(matrix).toContain('production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`');
    expect(matrix).toContain('production deployment candidate support requires exact `Environment` value `testnet`');
    expect(matrix).toContain('reviewer decision summary');
    expect(matrix).toContain('release support with exact `Release supported = institutional reference`');
    expect(matrix).toContain('upstream signer blocker handling');
    expect(matrix).toContain('production-ready claim handling');
    expect(matrix).toContain('critical/high vulnerabilities');
    expect(matrix).toContain('Release supported = institutional reference');
    expect(matrix).toContain('Production-ready claim allowed = no');
    expect(matrix).toContain('Testnet production-candidate claim allowed = no');
    expect(matrix).toContain('Critical/high vulnerabilities open = 0');
    expect(matrix).toContain('Upstream signer blocker resolved = no');
    expect(matrix).toContain('Release notes updated = yes');
    expect(matrix).toContain('internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence');
    expect(matrix).toContain('no positive critical/high finding counts');
    expect(matrix).toContain('dependency reviewer notes that keep signer and vulnerability boundaries');
    expect(matrix).toContain('internally non-contradictory dependency reviewer notes');
    expect(matrix).toContain('dependency reviewer sign-off matches classification');
    expect(matrix).toContain('dependency reviewer sign-off date is not before review classification Date');
    expect(matrix).toContain('completed dependency-review release-note update evidence');
    expect(matrix).toContain('completed dependency review checklist update evidence');
    expect(matrix).toContain('distinct completed dependency-review release-note/checklist update evidence targets');
    expect(matrix).toContain('internally non-contradictory dependency publication-update evidence');
    expect(roadmap).toContain('docs/dependency-risk-register.md');
    expect(roadmap).toContain('docs/dependency-review-evidence-template.md');
    expect(roadmap).toContain('executable');
    expect(roadmap).toContain('Dependency reviewer sign-off now must match');
    expect(roadmap).toContain('dependency reviewer sign-off date is not before review classification Date');
    expect(roadmap).toContain('Dependency reviewer decision summaries now must mention release support');
    expect(roadmap).toContain('no positive critical/high finding counts');
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(malformedRows).toEqual([]);
    expect(unknownStatuses).toEqual([]);
    expect(unresolvedSourcePaths).toEqual([]);
    expect(emptyCriticalCells).toEqual([]);

    for (const dependency of requiredDependencyNames) {
      expect(packageJson.dependencies?.[dependency], dependency).toBeTruthy();
      expect(register, dependency).toContain(dependency);
    }

    expect(cargoToml).toContain('ergo_avltree_rust');

    for (const term of requiredRegisterTerms) {
      expect(register).toContain(term);
    }

    for (const section of requiredTemplateSections) {
      expect(template).toContain(section);
    }

    for (const term of requiredTemplateTerms) {
      expect(template, term).toContain(term);
    }
  });

  it('keeps security evidence matrix rows structured and locally resolvable', () => {
    const matrix = readFileSync(join(bridgeRoot, 'docs', 'security-evidence-matrix.md'), 'utf8');
    const threatModel = readFileSync(
      join(bridgeRoot, 'docs', 'aggregate-settlement-threat-model.md'),
      'utf8',
    );
    const allowedStatuses = new Set([
      'Covered locally',
      'Guarded',
      'Pending rehearsal',
      'Open blocker',
    ]);
    const requiredAreas = [
      'ContextExtension signer divergence',
      'Signer surface isolation',
      'Explicit broadcast opt-in',
      'Mempool-safe HEIGHT checks',
      'DUP duplicate prevention',
      'Batch settlement all-or-nothing reconciliation',
      'Anchor height determinism',
      'Mutable singleton continuity',
      'Phantom burn trust minimization',
      'Operational recovery',
    ];
    const rows = parseEvidenceMatrixRows(matrix);
    const areas = rows.map(row => row[0]);
    const malformedRows = rows.filter(row => row.length !== 5);
    const unknownStatuses = rows
      .map(row => row[3])
      .filter(status => !allowedStatuses.has(status));
    const missingEvidence = rows.flatMap(row =>
      extractBacktickPaths(row[2])
        .filter(path => !existsSync(join(bridgeRoot, path)))
        .map(path => `${row[0]}: ${path}`),
    );

    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(malformedRows).toEqual([]);
    expect(unknownStatuses).toEqual([]);
    expect(missingEvidence).toEqual([]);

    for (const area of requiredAreas) {
      expect(areas, area).toContain(area);
    }

    expect(threatModel).toContain('## Current High-Risk Findings');
    expect(threatModel).toContain('## Attack Chain Registry Update');
    expect(matrix).toContain('Fleet Prover imports/instantiations');
    expect(matrix).toContain('settlement signing remains local WASM');
    expect(matrix).toContain('relayer/src/fleet-signer.test.ts');
  });
});
