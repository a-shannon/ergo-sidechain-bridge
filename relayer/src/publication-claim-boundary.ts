export interface PublicationClaimClassification {
  hasProductionReadyClaim: boolean;
  hasMainnetProductionClaim: boolean;
  hasControlledTestnetProductionClaim: boolean;
  hasProductionClaim: boolean;
}

export const PRODUCTION_CLAIM_WORDING =
  'production, production-candidate, production-grade, prod-ready, prod-candidate, prod-grade, bank-grade, mainnet, trustless, deployment-ready, release-ready, market-ready, launch-ready, go-live, general availability, generally available, GA-ready, production launch, exchange-ready, exchange-grade, institutional-grade, institutional-ready, enterprise-grade, enterprise-ready, or ready-for-production';
export const PRODUCTION_CLAIM_EVIDENCE_ERROR =
  `${PRODUCTION_CLAIM_WORDING} wording requires production deployment candidate evidence`;
export const CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR =
  'unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording';
export const MAINNET_PRODUCTION_CLAIM_ERROR =
  'mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated';

export interface ReviewerDecisionSummaryClaimBoundaryOptions {
  prefix: string;
  summary: string;
  releaseSupported?: string;
  releaseSupportFieldLabel?: string;
  productionReadyClaimAllowed?: string;
  testnetProductionCandidateClaimAllowed?: string;
  requireNumericCriticalHighFindingClosure?: boolean;
  requireNumericCriticalHighVulnerabilityClosure?: boolean;
}

export function classifyPublicationClaimText(...values: string[]): PublicationClaimClassification {
  const text = normalizePublicationClaimText(...values);

  return {
    hasProductionReadyClaim: hasProductionReadyClaim(text),
    hasMainnetProductionClaim: hasMainnetProductionClaim(text),
    hasControlledTestnetProductionClaim: hasControlledTestnetProductionClaim(text),
    hasProductionClaim: hasProductionClaim(text),
  };
}

export function validateReviewerDecisionSummaryClaimBoundary(
  options: ReviewerDecisionSummaryClaimBoundaryOptions,
): string[] {
  const summary = options.summary;
  if (isBlank(summary)) return [];

  const errors: string[] = [];
  const claim = classifyPublicationClaimText(summary);
  const releaseSupported = options.releaseSupported ?? '';
  const releaseSupportFieldLabel = options.releaseSupportFieldLabel ?? 'Release supported';
  const productionReadyClaimAllowed = options.productionReadyClaimAllowed ?? '';
  const testnetProductionCandidateClaimAllowed = options.testnetProductionCandidateClaimAllowed ?? '';
  const releaseSupportMustMatch = !isBlank(releaseSupported) && releaseSupported !== 'none';
  const deniesReleaseSupport = releaseSupportMustMatch && reviewerSummaryDeniesReleaseSupport(summary);

  if (deniesReleaseSupport) {
    errors.push(`${options.prefix}: release support must not be none when ${releaseSupportFieldLabel} is ${releaseSupported}`);
  }
  if (releaseSupportMustMatch && !deniesReleaseSupport && !reviewerSummarySupportsRelease(summary, releaseSupported)) {
    errors.push(`${options.prefix}: release support must match ${releaseSupportFieldLabel} ${releaseSupported}`);
  }
  if (claim.hasMainnetProductionClaim) {
    errors.push(`${options.prefix}: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasProductionReadyClaim) {
    errors.push(`${options.prefix}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (productionReadyClaimAllowed === 'no' && !blocksProductionReadyClaimInReviewerSummary(summary)) {
    errors.push(`${options.prefix}: production-ready claim handling must be blocked, forbidden, or not allowed`);
  } else if (allowsProductionReadyClaimInReviewerSummary(summary)) {
    errors.push(`${options.prefix}: production-ready claim handling must be blocked, forbidden, or not allowed`);
  }
  if (
    testnetProductionCandidateClaimAllowed === 'yes' &&
    !allowsTestnetProductionCandidateClaimInReviewerSummary(summary)
  ) {
    errors.push(`${options.prefix}: testnet production-candidate claim handling must be allowed when the field is yes`);
  }
  if (
    testnetProductionCandidateClaimAllowed === 'no' &&
    !blocksTestnetProductionCandidateClaimInReviewerSummary(summary)
  ) {
    errors.push(`${options.prefix}: testnet production-candidate claim handling must be blocked, forbidden, or not allowed`);
  }
  if (
    mentionsCriticalHighFindings(summary) &&
    !closesCriticalHighFindingsInReviewerSummary(
      summary,
      options.requireNumericCriticalHighFindingClosure ?? false,
    )
  ) {
    const requiredClosure = options.requireNumericCriticalHighFindingClosure
      ? 'numeric 0'
      : '0, none, or closed';
    errors.push(`${options.prefix}: critical/high findings must be ${requiredClosure}`);
  }
  if (
    mentionsCriticalHighVulnerabilities(summary) &&
    !closesCriticalHighVulnerabilitiesInReviewerSummary(
      summary,
      options.requireNumericCriticalHighVulnerabilityClosure ?? false,
    )
  ) {
    const requiredClosure = options.requireNumericCriticalHighVulnerabilityClosure
      ? 'numeric 0'
      : '0, none, or closed';
    errors.push(`${options.prefix}: critical/high vulnerabilities must be ${requiredClosure}`);
  }

  return [...new Set(errors)];
}

export function hasProductionReadyClaim(...values: string[]): boolean {
  return /\b(production[- ]?ready|production[- ]?readiness|prod[- ]?ready|prod[- ]?readiness|ready[- ]?for[- ]?production|ready[- ]?for[- ]?prod)\b/i.test(normalizePublicationClaimText(...values));
}

export function hasMainnetProductionClaim(...values: string[]): boolean {
  const text = normalizePublicationClaimText(...values);
  return /\b(main[- ]?net|main\s+network|main[- ]?chain)\b/i.test(text) &&
    /\b(production|production[- ]?ready|production[- ]?readiness|production[- ]?candidate|production[- ]?grade|prod[- ]?ready|prod[- ]?readiness|prod[- ]?candidate|prod[- ]?grade|ready|candidate|grade|deployment|release|exchange|institutional|enterprise|trustless|launch|go[- ]?live|general[- ]?availability|generally[- ]available|ga|ga[- ]?ready|production[- ]?launch)\b/i.test(text);
}

export function hasControlledTestnetProductionClaim(...values: string[]): boolean {
  return /\b(test[- ]?net[-\s]+production[- ]candidate|production[- ]candidate[-\s]+test[- ]?net|test[- ]?net[-\s]+production[- ]grade|production[- ]grade[-\s]+test[- ]?net)\b/i.test(
    normalizePublicationClaimText(...values),
  );
}

export function hasCanonicalControlledTestnetProductionClaim(...values: string[]): boolean {
  return /\b(test[- ]?net[-\s]+production[- ]candidate|production[- ]grade[-\s]+test[- ]?net)\b/i.test(
    normalizePublicationClaimText(...values),
  );
}

export function hasProductionClaim(...values: string[]): boolean {
  return /\b(production[- ]?ready|production[- ]?readiness|production[- ]?candidate|production[-\s]+deployment[-\s]+candidate|production[- ]?grade|prod[- ]?ready|prod[- ]?readiness|prod[- ]?candidate|prod[- ]?grade|bank[- ]?grade|ready[- ]?for[- ]?production|ready[- ]?for[- ]?prod|deployment[- ]?ready|release[- ]?ready|market[- ]?ready|launch[- ]?ready|go[- ]?live|general[- ]?availability|generally[- ]available|ga[- ]?ready|production[- ]?launch|exchange[- ]?ready|mainnet|mainnet[- ]?ready|trustless bridge|trustless burn verification is solved|exchange[- ]?grade|institutional[- ]?(?:grade|ready|readiness)|enterprise[- ]?(?:grade|ready|readiness))\b/i.test(
    normalizePublicationClaimText(...values),
  );
}

export function claimEvidenceIdentifiesClaim(claim: string, evidenceLink: string): boolean {
  const evidenceTokens = new Set(significantClaimTokens(evidenceLink));
  return significantClaimTokens(claim).some(token => evidenceTokens.has(token));
}

export function hasNegatedAllowedClaimEvidenceLink(claim: string, evidenceLink: string): boolean {
  if (isNegatedClaimBoundaryText(claim)) return false;

  const claimPattern = claimPhrasePattern(claim);
  if (!claimPattern) return false;

  const localContext = '[^|\\r\\n]{0,120}';
  const negatedClaimEvidencePattern = new RegExp(
    `\\b${NEGATED_CLAIM_MARKER_PATTERN}\\b${localContext}${claimPattern}|${claimPattern}${localContext}\\b${NEGATED_CLAIM_MARKER_PATTERN}\\b`,
    'i',
  );

  return negatedClaimEvidencePattern.test(evidenceLink);
}

function normalizePublicationClaimText(...values: string[]): string {
  const normalized = normalizePublicationClaimSeparators(values.join(' '));
  return normalizePublicationClaimSeparators(stripPublicationClaimControlLanguage(normalized))
    .trim();
}

function normalizePublicationClaimSeparators(value: string): string {
  return value.normalize('NFKC')
    .replace(/\udb40[\udd00-\uddef]/g, '')
    .replace(/\u00ad/g, '-')
    .replace(/[\u200b\u2060\ufeff]/g, ' ')
    .replace(/[\u034f\u061c\u180e\u200c-\u200f\u202a-\u202e\u2061-\u206f\ufe00-\ufe0f]/g, '')
    .replace(/(?<=[a-z0-9])[\u2010-\u2015\u2212\ufe58\ufe63\uff0d](?=[a-z0-9])/gi, '-')
    .replace(/(?<=[a-z])[.:;](?=[a-z])/gi, ' ')
    .replace(/[_\s\u00a0]+|(?<=[a-z0-9])\/(?=[a-z0-9])/gi, ' ');
}

function reviewerSummarySupportsRelease(summary: string, releaseSupported: string): boolean {
  const normalized = normalizeReviewerSummaryText(summary);
  const normalizedRelease = normalizeReviewerSummaryText(releaseSupported);
  return (
    hasUnprefixedReleaseSupportPhrase(normalized, `release support ${normalizedRelease}`) ||
    hasUnprefixedReleaseSupportPhrase(normalized, `release supported ${normalizedRelease}`) ||
    hasUnprefixedReleaseSupportPhrase(normalized, `release supported for ${normalizedRelease}`)
  );
}

function reviewerSummaryDeniesReleaseSupport(summary: string): boolean {
  const normalized = normalizeReviewerSummaryText(summary);
  return (
    hasUnprefixedReleaseSupportPattern(normalized, /\brelease support(?:ed)?(?: for)?\s+(?:none|no|not supported|unsupported|blocked|forbidden|not allowed|disabled|rejected|refused)\b/) ||
    hasUnprefixedReleaseSupportPattern(normalized, /\b(?:release\s+unsupported|unsupported\s+release(?:\s+support)?)\b/) ||
    hasUnprefixedReleaseSupportPattern(normalized, /\bno release support\b/)
  );
}

function hasUnprefixedReleaseSupportPhrase(normalized: string, phrase: string): boolean {
  return hasUnprefixedReleaseSupportPattern(normalized, new RegExp(`\\b${escapeRegExp(phrase)}\\b`));
}

function hasUnprefixedReleaseSupportPattern(normalized: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(normalized)) !== null) {
    if (!hasPrefixedReleaseSupportToken(normalized, match.index)) return true;
    if (match.index === matcher.lastIndex) matcher.lastIndex += 1;
  }
  return false;
}

function hasPrefixedReleaseSupportToken(normalized: string, matchIndex: number): boolean {
  const precedingToken = normalized.slice(0, matchIndex).trimEnd().split(/\s+/).pop();
  return precedingToken === 'pre' || precedingToken === 'non';
}

function blocksProductionReadyClaimInReviewerSummary(value: string): boolean {
  return hasClaimHandlingValue(value, 'production ready', [
    'no',
    'blocked',
    'forbidden',
    'not allowed',
    'disabled',
    'rejected',
    'refused',
  ]);
}

function allowsProductionReadyClaimInReviewerSummary(value: string): boolean {
  return hasClaimHandlingValue(value, 'production ready', [
    'yes',
    'allowed',
    'approved',
    'enabled',
    'accepted',
    'supported',
    'permitted',
  ]);
}

function blocksTestnetProductionCandidateClaimInReviewerSummary(value: string): boolean {
  return hasClaimHandlingValue(value, 'testnet production candidate', [
    'no',
    'blocked',
    'forbidden',
    'not allowed',
    'disabled',
    'rejected',
    'refused',
  ]);
}

function allowsTestnetProductionCandidateClaimInReviewerSummary(value: string): boolean {
  return hasClaimHandlingValue(value, 'testnet production candidate', [
    'yes',
    'allowed',
    'approved',
    'enabled',
    'accepted',
    'supported',
    'permitted',
  ]);
}

function mentionsCriticalHighFindings(value: string): boolean {
  return mentionsCriticalHighRisk(value, 'findings');
}

function mentionsCriticalHighVulnerabilities(value: string): boolean {
  return mentionsCriticalHighRisk(value, 'vulnerabilities');
}

function closesCriticalHighFindingsInReviewerSummary(
  value: string,
  numericZeroOnly: boolean,
): boolean {
  return closesCriticalHighRiskInReviewerSummary(value, 'findings', numericZeroOnly);
}

function closesCriticalHighVulnerabilitiesInReviewerSummary(
  value: string,
  numericZeroOnly: boolean,
): boolean {
  return closesCriticalHighRiskInReviewerSummary(value, 'vulnerabilities', numericZeroOnly);
}

function mentionsCriticalHighRisk(value: string, riskClass: 'findings' | 'vulnerabilities'): boolean {
  return new RegExp(`\\b${criticalHighRiskPhrase(riskClass)}\\b`).test(normalizeReviewerSummaryText(value));
}

function closesCriticalHighRiskInReviewerSummary(
  value: string,
  riskClass: 'findings' | 'vulnerabilities',
  numericZeroOnly = false,
): boolean {
  const normalized = normalizeReviewerSummaryText(value);
  const riskPhrase = criticalHighRiskPhrase(riskClass);
  if (numericZeroOnly) {
    return new RegExp(`\\b${riskPhrase}\\s+open\\s+0\\b`).test(normalized);
  }
  return (
    new RegExp(
      `\\b${riskPhrase}(?:\\s+(?:open|remaining|unresolved|outstanding))?\\s+(?:0|zero|none|no|closed|resolved|mitigated)\\b`,
    ).test(normalized) ||
    new RegExp(
      `\\b(?:0|zero|none|no)\\s+(?:open\\s+|unresolved\\s+|outstanding\\s+)?${riskPhrase}\\b`,
    ).test(normalized) ||
    new RegExp(`\\bno\\s+${riskPhrase}\\s+(?:open|remaining|unresolved|outstanding)\\b`).test(normalized)
  );
}

function criticalHighRiskPhrase(riskClass: 'findings' | 'vulnerabilities'): string {
  return `critical\\s+(?:high|and\\s+high|or\\s+high)\\s+${riskClass}`;
}

function hasClaimHandlingValue(value: string, claimLabel: string, outcomes: readonly string[]): boolean {
  const normalized = normalizeReviewerSummaryText(value);
  const escapedClaim = escapeRegExp(normalizeReviewerSummaryText(claimLabel));
  const outcomePattern = outcomes.map(outcome => escapeRegExp(normalizeReviewerSummaryText(outcome))).join('|');
  const claimControlOutcomePattern = [
    'yes',
    'no',
    'allowed',
    'approved',
    'enabled',
    'accepted',
    'supported',
    'permitted',
    'blocked',
    'forbidden',
    'not allowed',
    'disabled',
    'rejected',
    'refused',
  ].map(outcome => escapeRegExp(normalizeReviewerSummaryText(outcome))).join('|');
  const claimControlFieldLookahead = `(?!(?:allowed|handling|control)\\s+(?:${claimControlOutcomePattern})\\b)`;
  const directClaimPattern = new RegExp(
    `\\b${escapedClaim}(?:\\s+[a-z0-9]+){0,4}\\s+claims?\\s+${claimControlFieldLookahead}(?:remain\\s+|are\\s+|is\\s+)?(?:${outcomePattern})\\b`,
  );
  const directSingularClaimPattern = new RegExp(
    `\\b${escapedClaim}\\s+claim\\s+${claimControlFieldLookahead}(?:remain\\s+|are\\s+|is\\s+)?(?:${outcomePattern})\\b`,
  );
  const handlingPattern = new RegExp(
    `\\b${escapedClaim}(?:\\s+[a-z0-9]+){0,4}\\s+claim\\s+(?:allowed|handling|control)\\s+(?:${outcomePattern})\\b`,
  );
  return directClaimPattern.test(normalized) || directSingularClaimPattern.test(normalized) || handlingPattern.test(normalized);
}

function normalizeReviewerSummaryText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\udb40[\udd00-\uddef]/g, '')
    .replace(/(?<=[a-z0-9])[\u200b\u2060\ufeff](?=[a-z0-9])/g, '')
    .replace(/[\u00ad\u034f\u061c\u180e\u200c-\u200f\u202a-\u202e\u2061-\u206f\ufe00-\ufe0f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GENERIC_CLAIM_EVIDENCE_TERMS = new Set([
  'claim',
  'claims',
  'evidence',
  'linked',
  'local',
  'release',
  'notes',
  'review',
  'reviewed',
]);

const NEGATED_CLAIM_MARKER_PATTERN =
  '(?:not|no|without|missing|absent|unverified|unvalidated|blocked|forbidden|disallowed|unresolved|does\\s+not|do\\s+not|cannot|can\\s+not|must\\s+not)';

function claimPhrasePattern(value: string): string {
  const tokens = significantClaimTokens(value).map(escapeRegExp);
  return tokens.join('[^|\\r\\n]{0,24}');
}

function significantClaimTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(normalizeClaimToken)
    .filter(token => token.length >= 4 && !GENERIC_CLAIM_EVIDENCE_TERMS.has(token));
}

function normalizeClaimToken(token: string): string {
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function isNegatedClaimBoundaryText(value: string): boolean {
  return /^\s*(?:no|not|without|never|must\s+not|do\s+not|does\s+not|cannot|can\s+not)\b/i.test(value);
}

export function stripPublicationClaimControlLanguage(value: string): string {
  return [
    /\bThis release is not a production[- ]ready bridge claim\./gi,
    /\bSession Metadata Ergo node network testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording\b/gi,
    /\bSidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording\b/gi,
    /\bno\s+negated,\s+`?main[- ]?net`?,\s+`?main network`?,\s+`?main chain`?,\s+or\s+`?mainchain`?\s+wording\b/gi,
    /\bmust\s+not\s+contain\s+`?main[- ]?net`?,\s+`?main network`?,\s+`?main chain`?,\s+`?mainchain`?,\s+or\s+negated\s+testnet\s+wording\b/gi,
    /\bnon[- ]mainnet\b/gi,
    /\b(?:not|no|without)\s+(?:an?\s+)?(?:main[- ]?net\s+)?production[- ]ready(?:ness)?(?:\s+bridge)?\s+claims?\b/gi,
    /\bblocks?\s+(?:main[- ]?net\s+)?production[- ]ready(?:ness)?\s+claims?\b/gi,
    /\bpublication\s+blocker\s+for\s+(?:main[- ]?net\s+)?production[- ]ready(?:ness)?\s+claims?\b/gi,
    /\bproduction[- ]ready(?:ness)?\s+claims?\s+(?:remain|are|is)\s+(?:blocked|forbidden|not\s+allowed)\b/gi,
    /\bproduction[- ]ready(?:ness)?(?:\s+[a-z0-9/-]+){0,4}\s+claims?\s+(?:(?:remain|are|is)\s+)?(?:always\s+)?(?:blocked|forbidden|not\s+allowed)(?:\s+(?:for|on)\s+main[- ]?net)?\b/gi,
    /\bproduction[- ]ready(?:ness)?\s+benchmark\s+claims?\s+(?:remain|are|is)\s+(?:blocked|forbidden|not\s+allowed)\s+(?:for|on)\s+main[- ]?net\b/gi,
    /\bproduction[- ]ready(?:ness)?(?:\s+[a-z0-9/-]+){0,4}\s+claim\s+(?:allowed|handling|control)(?:\s+by\s+this\s+[a-z0-9 -]+)?\s*(?:[:=]\s*)?(?:no|blocked|forbidden|not\s+allowed|disabled|rejected|refused|yes\s*\/\s*no)\b/gi,
    /\bproduction[- ]ready(?:ness)?(?:\s+[a-z0-9/-]+){0,4}\s+claim\s+(?:allowed|handling|control)(?:\s+by\s+this\s+[a-z0-9 -]+)?\b(?!\s*(?:[:=]|\bis\b|\bare\b)?\s*(?:yes|accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es)\b)/gi,
    /\bproduction[- ]ready\s+benchmark\s+claims?\s+are\s+always\s+blocked\s+for\s+main[- ]?net\b/gi,
    /\bproduction\s+throughput\s+claims?\s+are\s+blocked\s+until\s+main[- ]?net[- ]grade\s+evidence\b/gi,
    /\btestnet\s+production[- ]candidate\s+claims?\s+(?:remain\s+|are\s+|is\s+)?(?:blocked|forbidden|not\s+allowed|disabled|rejected|refused)(?:\s+until\s+[^|.;\n\r]*)?\b/gi,
    /\bproduction\s+throughput\s+claim\s+allowed\s*=\s*no\b/gi,
    /\bmain[- ]?net[- ]grade\s+evidence\s+linked\s*=\s*no\b/gi,
    /\bmain[- ]?net\s+deployment\s+claim\s+allowed\s*=\s*no\b/gi,
    /\btestnet\s+production[- ]candidate\s+claim(?:s)?\s+allowed\s*=\s*yes-after-release-gate-pass\b/gi,
    /\bproduction[- ]grade[- ]testnet\s+wording\b/gi,
    /\brelease\s+level(?:\s+being\s+evaluated)?\s*(?:=|:)\s*production[-\s]+deployment[-\s]+candidate\b/gi,
    /\brelease\s+support(?:ed)?\s*(?:=|:)\s*production[-\s]+deployment[-\s]+candidate\b/gi,
    /\bproduction\s+candidate\s+evidence\s+linked\b/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+requires\s+[^|.;\n\r]*/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+classification\s+requires\s+[^|.;\n\r]*/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+blockers?\s+cannot\s+be\s+scoped\s+out\b/gi,
    /\bcompleted[-\s]+production[-\s]+deployment[-\s]+candidate[-\s]+release[-\s]+notes(?:[-\s]+evidence)?\b/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate[-\s]+release[-\s]+notes(?:[-\s]+evidence)?\b/gi,
    /\bcompleted\s+production[-\s]+deployment[-\s]+candidate\s+release\s+notes\s+evidence\b/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+release\s+notes\s+evidence\b/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+release\s+notes\b/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+(?:support|evidence)\s+requires\s+[^,.;|]*testnet\s+production[- ]candidate\s+claim\s+allowed\b/gi,
    /\bproduction[-\s]+deployment[-\s]+candidate\s+(?:support|evidence)\b/gi,
    /\btestnet\s+production[- ]candidate\s+claim(?:s)?\s+(?:allowed|handling|control)(?:\s+by\s+this\s+[a-z0-9 -]+)?\s*(?:[:=]\s*)?(?:yes|no|allowed|blocked|forbidden|not\s+allowed)?\b/gi,
  ].reduce((text, pattern) => text.replace(pattern, ''), value);
}
