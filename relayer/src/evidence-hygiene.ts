export interface EvidenceHygieneFinding {
  label: string;
  message: string;
}

const localWorkspaceIdentifiers = ['EURO' + 'BC', 'ALTA' + 'LEO', 'ANTI' + 'GRAVITY'];
const secretDlogFile = `secrets.${'dlog'}`;
const credentialUrlParameters = [
  'access[_-]?token',
  'auth[_-]?token',
  'id[_-]?token',
  'refresh[_-]?token',
  'api[_-]?key',
  'test[_-]?api[_-]?key',
  'client[_-]?secret',
  'password',
  'secret',
];
const assignmentNamePrefix = '(?:[a-z0-9]+[_. -])*';
const sensitiveAssignmentNames = [
  `${assignmentNamePrefix}mnemonic`,
  `${assignmentNamePrefix}wallet[_. -]?mnemonic`,
  `${assignmentNamePrefix}private[_. -]?key`,
  `${assignmentNamePrefix}private` + 'Key',
  `${assignmentNamePrefix}signing[_. -]?key`,
  `${assignmentNamePrefix}secret[_. -]?key`,
  `${assignmentNamePrefix}seed[_. -]?phrase`,
  `${assignmentNamePrefix}api[_. -]?key`,
  `${assignmentNamePrefix}test[_-]?api[_-]?key`,
];
const credentialAssignmentNames = [
  `${assignmentNamePrefix}access[_. -]?token`,
  `${assignmentNamePrefix}auth[_. -]?token`,
  `${assignmentNamePrefix}id[_. -]?token`,
  `${assignmentNamePrefix}refresh[_. -]?token`,
  `${assignmentNamePrefix}session[_. -]?token`,
  `${assignmentNamePrefix}bearer[_. -]?token`,
  `${assignmentNamePrefix}token`,
  `${assignmentNamePrefix}access[_. -]?key[_. -]?id`,
  `${assignmentNamePrefix}secret[_. -]?access[_. -]?key`,
  `${assignmentNamePrefix}webhook[_. -]?url`,
  `${assignmentNamePrefix}jwt`,
  `${assignmentNamePrefix}client[_. -]?secret`,
  `${assignmentNamePrefix}secret`,
  `${assignmentNamePrefix}password`,
];
const assignmentKeyTrailer = "[\"'`]?";
const assignmentValueQuote = "[\"'`]?";
const redactedAssignmentValuePattern = [
  assignmentValueQuote,
  '(?:redacted\\b|<redacted>|\\[redacted\\])',
  assignmentValueQuote,
  '(?=$|[\\s,}\\]])',
].join('');
function sensitiveAssignmentPattern(names: string[]): RegExp {
  return new RegExp(
    `\\b(?:${names.join('|')})${assignmentKeyTrailer}\\s*[:=]\\s*(?!${redactedAssignmentValuePattern})\\S+`,
    'i',
  );
}
const credentialUrlPattern = new RegExp(
  [
    '(?:',
    '\\b[a-z][a-z0-9+.-]*:\\/\\/[^\\s/@:]+:(?!redacted\\b|<redacted>|\\[redacted\\])[^\\s/@]+@',
    '|',
    '\\b[a-z][a-z0-9+.-]*:\\/\\/(?!redacted@)[^\\s/@:]+@',
    '|',
    '\\b[a-z][a-z0-9+.-]*:\\/\\/',
    '|',
    '(?:^|[\\s(["\'`])(?:\\.\\.?\\/)?',
    ')',
    '[^\\s)"\'`]*[?#&](?:',
    credentialUrlParameters.join('|'),
    ')=\\S+',
  ].join(''),
  'im',
);
const credentialHeaderPattern = new RegExp(
  [
    '\\b(?:',
    '(?:proxy-)?authorization\\s*:\\s*(?:bearer|basic|token|api[-_]?key)\\s+',
    '(?!redacted\\b|<redacted>|\\[redacted\\])\\S+',
    '|',
    '(?:proxy-)?authorization\\s*:\\s*',
    '(?!bearer\\b|basic\\b|token\\b|api[-_]?key\\b)',
    '(?!redacted\\b|<redacted>|\\[redacted\\])\\S+',
    '|',
    '(?:set-cookie|cookie|x[-_]?api[-_]?key|api[-_]?key|x[-_]?(?:auth|access)[-_]?token)\\s*:\\s*',
    '(?!redacted\\b|<redacted>|\\[redacted\\])\\S+',
    ')',
  ].join(''),
  'i',
);
const keyMaterialBlockPattern = new RegExp(
  [
    '-{5}BEGIN [^-]*(?:',
    'OPENSSH',
    '|',
    'PGP',
    '|',
    'PRIVATE',
    ')[^-]*KEY[^-]*-{5}',
  ].join(''),
  'i',
);
const runtimeStateArtifactPattern = new RegExp(
  [
    '(?:^|[\\/\\s(["\'`])',
    '(?:',
    '[^\\/\\s)"\'`]*\\.(?:db|sqlite|sqlite3)(?:[-_.](?:wal|shm))?\\b',
    '|',
    'deployed[_-]?state\\.json\\b',
    '|',
    '(?:diagnostic[-_]?dump|runtime[-_]?state)[^\\/\\s)"\'`]*\\.(?:zip|tar|gz|json|log|txt|db|sqlite|sqlite3)\\b',
    ')',
  ].join(''),
  'im',
);
const absoluteSecurityClaimPattern =
  /\b(risk[- ]free|zero[- ]risk|no[- ]risk|no[- ]vulnerabilit(?:y|ies)|zero[- ]vulnerabilit(?:y|ies)|no[- ]exploits?|unexploitable|provably[- ]secure|formally[- ]verified|fully[- ]secure|secure[- ]by[- ]design|security[- ]guaranteed|guaranteed[- ]secure|safety[- ]guaranteed|funds[- ]safe|funds[- ]are[- ]safe|user[- ]funds[- ]are[- ]safe|lossless[- ]bridge|bridge[- ]is[- ]lossless|no[- ]fund[- ]loss|no[- ]loss[- ]of[- ]funds|cannot[- ]be[- ]exploited|cannot[- ]lose[- ]funds|fund[- ]loss[- ]is[- ]impossible)\b/i;

const SENSITIVE_EVIDENCE_PATTERNS: { message: string; pattern: RegExp }[] = [
  {
    message: 'must not contain local Windows absolute paths',
    pattern: /(?:\b[A-Z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+[\\/])/i,
  },
  {
    message: 'must not contain local POSIX absolute paths',
    pattern: /(?:^|[\s(["'`])\/(?:Users|home|tmp|var|private|mnt|Volumes)\/[^\s)"'`]+/im,
  },
  {
    message: 'must not contain local file URLs',
    pattern: /\bfile:\/\/\/(?:[A-Z]:|\/)/i,
  },
  {
    message: 'must not contain local workspace identifiers',
    pattern: new RegExp(`\\b(${localWorkspaceIdentifiers.join('|')})\\b`, 'i'),
  },
  {
    message: 'must not contain secret dlog references',
    pattern: new RegExp(`\\b${secretDlogFile.replace('.', '\\.')}\\b`, 'i'),
  },
  {
    message: 'must not contain key material block markers',
    pattern: keyMaterialBlockPattern,
  },
  {
    message: 'must not contain runtime database, deployment-state, or diagnostic dump artifacts',
    pattern: runtimeStateArtifactPattern,
  },
  {
    message: 'must not contain absolute security wording',
    pattern: absoluteSecurityClaimPattern,
  },
  {
    message: 'must not contain credential-bearing URLs or evidence links',
    pattern: credentialUrlPattern,
  },
  {
    message: 'must not contain Authorization, Cookie, or API-key credential headers',
    pattern: credentialHeaderPattern,
  },
  {
    message: 'must not contain mnemonic, signing-key, secret-key, seed, or API-key assignments',
    pattern: sensitiveAssignmentPattern(sensitiveAssignmentNames),
  },
  {
    message:
      'must not contain password, client-secret, secret, JWT, generic token, cloud access-key, or webhook-url assignments',
    pattern: sensitiveAssignmentPattern(credentialAssignmentNames),
  },
];

export function validateEvidenceHygiene(markdown: string, label: string): string[] {
  return scanEvidenceHygiene(markdown, label).map(
    finding => `${finding.label}: evidence hygiene ${finding.message}`,
  );
}

export function scanEvidenceHygiene(markdown: string, label: string): EvidenceHygieneFinding[] {
  return SENSITIVE_EVIDENCE_PATTERNS
    .filter(({ pattern }) => pattern.test(markdown))
    .map(({ message }) => ({ label, message }));
}

export function hasAbsoluteSecurityClaim(...values: string[]): boolean {
  return absoluteSecurityClaimPattern.test(values.join(' '));
}

export function hasUnresolvedIssueMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  const unresolvedSectionPrefix =
    '(?:Open|Known|Outstanding|Pending|Unresolved|Blocking|Remaining|Active|Residual|Unaddressed|Unclosed|Unmitigated|Unremediated|Unfixed|Unpatched)';
  const unresolvedSectionSubject =
    '(?:issues?|blockers?|follow[- ]?ups?|action[- ]?items?|work[- ]?items?|tasks?|todos?|handoffs?|owners?|ownership|assignments?|assignees?|responsibilit(?:y|ies)|accountabilit(?:y|ies)|authori[sz]ations?|permissions?|clearances?|consents?|escalations?|escalated[- ]?items?|escalated[- ]?actions?|questions?|unknowns?|uncertaint(?:y|ies)|concerns?|reservations?|objections?|prerequisites?|dependenc(?:y|ies)|requirements?|acknowledg(?:e)?ments?|confirmations?|observations?|provenance|bindings?|acceptances?|endorsements?|attestations?|sign[- ]?offs?|signatures?|certifications?|audits?|assessments?|penetration[- ]?tests?|validations?|verifications?|exceptions?|waivers?|deviations?|limitations?|caveats?|constraints?|remediations?|mitigations?|corrective[- ]?actions?|findings?|vulnerabilit(?:y|ies)|incidents?|risks?|defects?|gaps?|violations?|regressions?)';
  const unresolvedSectionLabel = `(?:[A-Za-z0-9][A-Za-z0-9/-]*\\s+){0,3}${unresolvedSectionSubject}`;
  const structuredUnresolvedSectionSubject =
    `(?:(?:critical|high|severe)[_. -]?){0,3}${unresolvedSectionSubject}`;
  const unresolvedSectionSeparator = '(?::|=|[-\\u2013\\u2014])';
  const closedScalarUnresolvedSectionValue = '(?:(?:none|no|0|n\\/a)\\b|false\\b(?=[ \\t]*(?:$|[;,.}\\]]|\\r?\\n)))';
  const closedCollectionUnresolvedSectionValue = '(?:\\[\\s*\\]|\\{\\s*\\})';
  const closedUnresolvedSectionValue = `(?:${closedScalarUnresolvedSectionValue}|${closedCollectionUnresolvedSectionValue})`;
  const unresolvedCountState =
    '(?:pending|unresolved|open|outstanding|remaining|active|residual|unaddressed|unclosed|unmitigated|unremediated|unfixed|unpatched|deferred|awaiting|waiting(?:\\s+(?:for|on))?)';
  const unresolvedCountQualifier = `(?:${unresolvedSectionPrefix}|${unresolvedCountState})`;
  const relationalUnresolvedCountValue = '(?:>\\s*0\\b|>=\\s*[1-9]\\d*\\b|above\\s+zero\\b|greater\\s+than\\s+zero\\b|non[- ]?zero\\b)';
  const structuredUnresolvedField = `(?:${unresolvedSectionPrefix}|${unresolvedCountState})[_. -]?${structuredUnresolvedSectionSubject}(?:[_. -]?(?:count|total))?`;
  const structuredSuffixUnresolvedField = `${structuredUnresolvedSectionSubject}(?:[_. -]?(?:count|total))?[_. -]?(?:${unresolvedSectionPrefix}|${unresolvedCountState})`;
  const structuredPresenceUnresolvedField = `(?:has|contains|includes)[_. -]?(?:${structuredUnresolvedField}|${structuredSuffixUnresolvedField})`;
  const structuredUnresolvedValueField = `(?:${structuredUnresolvedField}|${structuredSuffixUnresolvedField}|${structuredPresenceUnresolvedField})`;
  const openBooleanUnresolvedValue = '(?:true|yes)';
  const openCollectionUnresolvedValue = '(?:\\[(?!\\s*\\])|\\{(?!\\s*\\}))';
  const remainingClosureLabel = `remaining\\s+${unresolvedSectionLabel}`;
  const normalizedForUnresolvedScan = normalized.replace(
    new RegExp(`\\b(?:no|zero|without)\\s+${remainingClosureLabel}\\b`, 'ig'),
    '',
  );
  const hasSpecialUnresolvedSubjectMarker = (subject: string): boolean => {
    const shortUnresolvedCountValue = '[1-9]\\d{0,3}';
    const qualifiedSubject = `(?:[A-Za-z0-9][A-Za-z0-9/-]*\\s+){0,3}${subject}`;
    const structuredSpecialField = `(?:${unresolvedSectionPrefix}|${unresolvedCountState})[_. -]?${qualifiedSubject}(?:[_. -]?(?:count|total))?`;
    const structuredSuffixSpecialField = `${qualifiedSubject}(?:[_. -]?(?:count|total))?[_. -]?(?:${unresolvedSectionPrefix}|${unresolvedCountState})`;
    const structuredPresenceSpecialField = `(?:has|contains|includes)[_. -]?(?:${structuredSpecialField}|${structuredSuffixSpecialField})`;
    const structuredSpecialValueField = `(?:${structuredSpecialField}|${structuredSuffixSpecialField}|${structuredPresenceSpecialField})`;
    return (
      new RegExp(
        `\\b(?:${unresolvedSectionPrefix}|${unresolvedCountState})\\s+${qualifiedSubject}\\s*${unresolvedSectionSeparator}(?!\\s*${closedUnresolvedSectionValue})\\s*\\S`,
        'i',
      ).test(normalizedForUnresolvedScan) ||
      new RegExp(`\\bRemaining\\s+${qualifiedSubject}\\s*${unresolvedSectionSeparator}\\s*$`, 'i').test(
        normalizedForUnresolvedScan,
      ) ||
      new RegExp(
        `\\b${shortUnresolvedCountValue}\\s+${unresolvedCountState}\\s+${qualifiedSubject}\\b`,
        'i',
      ).test(normalizedForUnresolvedScan) ||
      new RegExp(
        `(?:^|[^A-Za-z0-9])["'\`]?${structuredSpecialValueField}["'\`]?\\s*[:=]\\s*(?!${closedUnresolvedSectionValue})[1-9]\\d*\\b`,
        'i',
      ).test(normalizedForUnresolvedScan) ||
      new RegExp(
        `(?:^|[^A-Za-z0-9])["'\`]?${structuredSpecialValueField}["'\`]?\\s*[:=]\\s*${openBooleanUnresolvedValue}\\b`,
        'i',
      ).test(normalizedForUnresolvedScan) ||
      new RegExp(
        `(?:^|[^A-Za-z0-9])["'\`]?${structuredSpecialValueField}["'\`]?\\s*[:=]\\s*${openCollectionUnresolvedValue}`,
        'i',
      ).test(normalizedForUnresolvedScan)
    );
  };
  const hasUnresolvedReviewMarker = hasSpecialUnresolvedSubjectMarker('reviews?');
  const hasUnresolvedDecisionMarker = hasSpecialUnresolvedSubjectMarker('decisions?');
  const hasUnresolvedApprovalMarker = hasSpecialUnresolvedSubjectMarker('approvals?');
  return (
    hasUnresolvedReviewMarker ||
    hasUnresolvedDecisionMarker ||
    hasUnresolvedApprovalMarker ||
    new RegExp(
      `\\bRemaining\\s+${unresolvedSectionLabel}\\b(?!\\s*${unresolvedSectionSeparator}\\s*${closedUnresolvedSectionValue})`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(`\\bRemaining\\s+${unresolvedSectionLabel}\\s*${unresolvedSectionSeparator}\\s*$`, 'i').test(
      normalizedForUnresolvedScan,
    ) ||
    new RegExp(
      `\\b${unresolvedSectionPrefix}\\s+${unresolvedSectionLabel}\\s*${unresolvedSectionSeparator}(?!\\s*${closedUnresolvedSectionValue})\\s*\\S`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b${unresolvedSectionLabel}\\s+(?:count|total)\\s*(?:${unresolvedSectionSeparator}\\s*)?(?!${closedUnresolvedSectionValue})\\S+\\s+${unresolvedCountState}\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b${unresolvedCountQualifier}\\s+${unresolvedSectionLabel}\\s+(?:count|total)\\s*(?:${unresolvedSectionSeparator}\\s*)?(?!${closedUnresolvedSectionValue})\\S+\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b${unresolvedCountQualifier}\\s+${unresolvedSectionLabel}\\s+(?:count|total)\\s*(?:${unresolvedSectionSeparator}\\s*)?${relationalUnresolvedCountValue}`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `(?:^|[^A-Za-z0-9])["'\`]?${structuredUnresolvedField}["'\`]?\\s*[:=]\\s*(?!${closedUnresolvedSectionValue})[1-9]\\d*\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `(?:^|[^A-Za-z0-9])["'\`]?${structuredSuffixUnresolvedField}["'\`]?\\s*[:=]\\s*(?!${closedUnresolvedSectionValue})[1-9]\\d*\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `(?:^|[^A-Za-z0-9])["'\`]?${structuredUnresolvedValueField}["'\`]?\\s*[:=]\\s*${openBooleanUnresolvedValue}\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `(?:^|[^A-Za-z0-9])["'\`]?${structuredUnresolvedValueField}["'\`]?\\s*[:=]\\s*${openCollectionUnresolvedValue}`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b[1-9]\\d*\\s+${unresolvedCountState}\\s+${unresolvedSectionLabel}\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b${unresolvedSectionPrefix}\\s+${unresolvedSectionLabel}\\s+(?!${closedUnresolvedSectionValue})[1-9]\\d*\\s+${unresolvedCountState}\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b[1-9]\\d*\\s+${unresolvedSectionLabel}\\s+${unresolvedCountState}\\b`,
      'i',
    ).test(normalizedForUnresolvedScan) ||
    new RegExp(
      `\\b${unresolvedSectionPrefix}\\s+${unresolvedSectionLabel}\\s*[([]\\s*(?!${closedUnresolvedSectionValue})[1-9]\\d*\\s+${unresolvedCountState}\\s*[)\\]]`,
      'i',
    ).test(normalizedForUnresolvedScan)
  );
}

export function normalizeEvidenceMarkerText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\uDB40[\uDD00-\uDDEF]/g, '')
    .replace(/\u00ad/g, '-')
    .replace(/[\u200b\u2060\ufeff]/g, ' ')
    .replace(/[\u034f\u061c\u180e\u200c-\u200f\u202a-\u202e\u2061-\u206f\ufe00-\ufe0f]/g, '')
    .replace(/(?<=[A-Za-z0-9])[\u2010-\u2015\u2212\ufe58\ufe63\uff0d](?=[A-Za-z0-9])/g, '-');
}

export function hasConditionalValidationApprovalMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  const validationSubject =
    '(?:release[ -]?notes?\\s+)?(?:validation|validator|command|run|check)';
  const outcomeField = '(?:status|result|outcome|verdict|classification|type)';
  const conditionalApprovalTerm = '(?:approval|review|follow[ -]?up|sign[ -]?off)';
  const conditionalApprovalTarget = `(?:[A-Za-z0-9/-]+\\s+){0,3}${conditionalApprovalTerm}`;
  const approvalStateVerb = '(?:is|are|was|were|remains?|stays?)';
  const approvalStateModifier = '(?:(?:still|currently|now)\\s+)?';
  const approvalStateAuxiliary = '(?:has|have|had)';
  const notYetApprovalState = '(?:accepted|approved|complete(?:d)?|finali[sz]ed|granted|received)';
  const incompleteApprovalState = '(?:incomplete|unaccepted|unapproved|unfinali[sz]ed|ungranted|unreceived)';
  const rejectedApprovalState = '(?:denied|rejected|refused|declined)';
  const revokedApprovalState = '(?:revoked|withdrawn|rescinded|voided|invalidated)';
  const staleApprovalState = '(?:expired|lapsed|stale|outdated|obsolete|superseded)';
  const failedApprovalState = '(?:failed|unsuccessful|abort(?:ed)?|cancel(?:led|ed))';
  const pendingApprovalState =
    '(?:pending|awaiting|deferred|waiting(?:\\s+(?:for|on))?|outstanding|open|unresolved|remaining)';
  const missingApprovalState = '(?:missing|absent|lacking|lacks)';
  const futureApprovalState =
    '(?:to\\s+follow|tbd|to[ -]?be[ -]?determined|scheduled|planned|forthcoming|upcoming|later|(?:slated|queued)(?:\\s+for(?:\\s+(?:next|future|subsequent|following)\\s+(?:release|milestone))?)?|(?:delayed|postponed|shifted|rescheduled|tabled|shelved|paused|suspended|bumped|slipped|punted|backlogged|parked)(?:\\s+(?:to|until|for)(?:\\s+(?:next|future|subsequent|following)\\s+(?:release|milestone))?)?|(?:on\\s+hold|put\\s+off)(?:\\s+(?:to|until|for)(?:\\s+(?:next|future|subsequent|following)\\s+(?:release|milestone))?)?|held\\s+(?:to|until|for)\\s+(?:next|future|subsequent|following)\\s+(?:release|milestone)|(?:pushed(?:\\s+back)?|moved)(?:\\s+(?:to|until|for)(?:\\s+(?:next|future|subsequent|following)\\s+(?:release|milestone))?)?|(?:carried|rolled|held)\\s+over(?:\\s+(?:to|until|for)(?:\\s+(?:next|future|subsequent|following)\\s+(?:release|milestone))?)?|post[ -]?release|after\\s+release|(?:next|future|subsequent|following)\\s+release|(?:next|future|subsequent|following)\\s+milestone)';
  const conditionalOutcome =
    `(?:${conditionalApprovalTerm}[ -]?required|requires?\\s+${conditionalApprovalTarget}|needs[ -]?${conditionalApprovalTarget}|approved[ -]?with[ -]?conditions?|(?:approved|accepted|pass(?:ed)?)[ -]?subject[ -]?to(?:\\s+${conditionalApprovalTarget})?|subject[ -]?to\\s+${conditionalApprovalTarget}|qualified[ -]?approval|${pendingApprovalState}\\s+${conditionalApprovalTarget}|${conditionalApprovalTerm}\\s+${approvalStateModifier}(?:${pendingApprovalState}|missing|absent|${futureApprovalState})|blocked\\s+(?:until|pending|awaiting|on)\\s+${conditionalApprovalTarget}|gated\\s+(?:on|by)\\s+${conditionalApprovalTarget}|depend(?:s|ent)?\\s+(?:on|upon)\\s+${conditionalApprovalTarget}|(?:contingent|conditioned)\\s+(?:on|upon)\\s+${conditionalApprovalTarget}|${missingApprovalState}\\s+${conditionalApprovalTarget}|${conditionalApprovalTarget}\\s+not[ -]?yet\\s+${notYetApprovalState}|${conditionalApprovalTarget}\\s+${approvalStateAuxiliary}\\s+not\\s+been\\s+${notYetApprovalState}|${conditionalApprovalTarget}\\s+${approvalStateAuxiliary}\\s+(?:been\\s+)?(?:${rejectedApprovalState}|${revokedApprovalState}|${staleApprovalState}|${failedApprovalState})|${conditionalApprovalTarget}\\s+did\\s+not\\s+pass|${conditionalApprovalTarget}\\s+${approvalStateModifier}(?:${pendingApprovalState}|${incompleteApprovalState}|${rejectedApprovalState}|${revokedApprovalState}|${staleApprovalState}|${failedApprovalState}|${futureApprovalState})|${conditionalApprovalTarget}\\s+${approvalStateVerb}\\s+${approvalStateModifier}(?:${pendingApprovalState}|${incompleteApprovalState}|${rejectedApprovalState}|${revokedApprovalState}|${staleApprovalState}|${failedApprovalState}|${futureApprovalState})|conditional|provisional|tentative)`;
  const normalizedForConditionalScan = normalized.replace(
    new RegExp(`\\b(?:no|not|without)\\s+(?:${conditionalOutcome})\\b`, 'ig'),
    '',
  );

  return (
    new RegExp(
      `\\b${validationSubject}[_. -]?${outcomeField}\\s*[:=]\\s*["'\`]?\\s*${conditionalOutcome}\\b`,
      'i',
    ).test(normalizedForConditionalScan) ||
    new RegExp(
      `\\b${validationSubject}\\b(?:\\s+[A-Za-z0-9/-]+){0,8}\\s+${conditionalOutcome}\\b`,
      'i',
    ).test(normalizedForConditionalScan)
  );
}

export function hasStructuredValidationFailureMarker(normalized: string): boolean {
  if (hasConditionalValidationApprovalMarker(normalized)) return true;

  const structuredFieldBoundary = '(?:^|[^A-Za-z0-9])';
  const structuredOutcomeFieldBoundary = '(?:^|[^A-Za-z0-9_.-])';
  const discrepancyName = '(?:mismatch(?:es)?|discrepanc(?:y|ies)|defects?|violations?)';
  const consistencyFailureName =
    '(?:conflict(?:ed|ing|s)?|contradict(?:ed|ory|ion|ions)?|inconsisten(?:t|cy|cies))';
  const warningName = '(?:warnings?|degraded|soft[_. -]?fail(?:ed|ure)?)';
  const runtimeFailureName = '(?:exceptions?|panics?|crash(?:es|ed)?|tracebacks?)';
  const freshnessFailureName = '(?:stale|outdated|expired|obsolete|superseded)';
  const regressionFailureName = '(?:regress(?:ed|ions?)|downgrad(?:ed|es?)|worse|worsened)';
  const safetyFailureName = '(?:unsafe|insecure|compromis(?:ed|e)|exposed)';
  const securityRiskFailureName =
    '(?:vulnerab(?:le|ilit(?:y|ies))|exploit(?:able|ed|s)?|high[_. -]?risk|critical[_. -]?risk)';
  const integrityFailureName =
    '(?:tamper(?:ed|ing)?|corrupt(?:ed|ion)?|forg(?:ed|ery)|fabricat(?:ed|ion)|counterfeit)';
  const authenticityFailureName =
    '(?:unauthentic(?:ated)?|inauthentic|unauthenticated|untrusted|unsigned)';
  const revocationFailureName =
    '(?:revok(?:ed|e|ing)?|withdrawn|withdrawal|rescind(?:ed|ing)?|void(?:ed)?|invalidat(?:ed|ion))';
  const complianceFailureName =
    '(?:non[_. -]?compliant|noncompliance|out[_. -]?of[_. -]?policy|policy[_. -]?violat(?:ed|ion)|compliance[_. -]?violat(?:ed|ion))';
  const driftFailureName =
    '(?:drift(?:ed|ing)?|diverg(?:ed|ence|ent)|desync(?:ed)?|out[_. -]?of[_. -]?sync|misbound|misbind(?:ing)?)';
  const linkageFailureName =
    '(?:unbound|unlinked|unmapped|unanchored|detached|orphan(?:ed)?)';
  const authorizationFailureName =
    '(?:unauthori[sz]ed|forbidden|disallowed|permission[_. -]?den(?:ied|ial)|access[_. -]?den(?:ied|ial))';
  const suspensionFailureName =
    '(?:paus(?:ed|e)|suspend(?:ed|ion)?|halt(?:ed)?|deactivat(?:ed|ion)|offline|stopp(?:ed|age))';
  const connectivityFailureName =
    '(?:unreachable|unavailable|disconnect(?:ed|ion)|unresponsive|inaccessible)';
  const capacityFailureName =
    '(?:exceed(?:ed|s|ing)?|over[_. -]?limit|capacity[_. -]?exceed(?:ed|ance)?|quota[_. -]?exceed(?:ed|ance)?|resource[_. -]?exhaust(?:ed|ion)?|exhausted|rate[_. -]?limit(?:ed)?)';
  const malformedArtifactFailureName =
    '(?:malformed|ill[_. -]?formed|truncat(?:ed|ion)|unreadable|unparseable|unparsable)';
  const fixtureArtifactFailureName =
    '(?:(?:fixture|mock(?:ed)?|dummy|fake|stub(?:bed)?|synthetic|simulat(?:ed|ion)|placeholder|template)(?:[_. -]?(?:evidence|artifact|target|file|output|report|log|transcript|proof|row|document|json))?)';
  const weakEvidenceTargetFailureFieldName =
    '(?:(?:duplicat(?:e|ed)|reus(?:ed|e)|shared|ambiguous|generic)[_. -]?(?:evidence|artifact|target|file|output|report|log|transcript|proof|row|document|json|binding|link))';
  const weakEvidenceTargetFailureOutcomeName = '(?:duplicat(?:e|ed)|reus(?:ed|e)|shared|ambiguous|generic)';
  const sensitiveEvidenceTargetFailureFieldName =
    '(?:(?:private|local[_. -]?only|redact(?:ed|ion)|runtime[_. -]?state|secret[_. -]?bearing|credential[_. -]?bearing|confidential|restricted|non[_. -]?public|internal[_. -]?only|personal[_. -]?data|user[_. -]?profile)[_. -]?(?:evidence|artifact|target|file|output|report|log|transcript|proof|row|document|json|binding|link|path|state))';
  const sensitiveEvidenceTargetFailureOutcomeName =
    '(?:local[_. -]?only|redact(?:ed|ion)|runtime[_. -]?state|private[_. -]?only|secret[_. -]?bearing|credential[_. -]?bearing|confidential|restricted|non[_. -]?public|internal[_. -]?only|personal[_. -]?data|user[_. -]?profile)';
  const unverifiedEvidenceTargetFailureFieldName =
    '(?:(?:unaudited|unreviewed|unapproved|unattested|uncertified|unsigned|untrusted|unauthenticated|unverified|unconfirmed|unproven)[_. -]?(?:evidence|artifact|target|file|output|report|log|transcript|proof|row|document|json|binding|link|attestation|review|signature))';
  const severeRiskStringName = '(?:critical|high|severe)';
  const denialOutcomeName =
    '(?:reject(?:ed|ion)?|den(?:ied|ial)|refus(?:ed|al)|declin(?:ed|e)|unapproved|unaudited|unreviewed|unattested|uncertified)';
  const failureField =
    `(?:errors?|failures?|issues?|structural[_. -]?issues?|${warningName}|${runtimeFailureName}|${freshnessFailureName}|${regressionFailureName}|${discrepancyName}|${consistencyFailureName}|${capacityFailureName}|${malformedArtifactFailureName}|${fixtureArtifactFailureName}|${weakEvidenceTargetFailureFieldName}|${sensitiveEvidenceTargetFailureFieldName}|${unverifiedEvidenceTargetFailureFieldName})`;
  const exitField = '(?:exit[_. -]?(?:code|status)|process[_. -]?exit[_. -]?code)';
  const outcomeQualifier =
    '(?:validation|validator|command|run|check|gate|release|lifecycle|readiness|exec(?:ution)?|review|approval|audit|sign[_. -]?off|attestation|certification|safety|security|risk|integrity|artifact|proof|signature|signer|authenticity|authori[sz]ation|permission|access|policy|compliance|target|binding|provenance|checkpoint|source|network|node|rpc|endpoint|service|dependency|provider|benchmark|capacity|quota|resource|rate|limit|json|schema|markdown|report|transcript|document)';
  const stringOutcomeQualifier =
    '(?:validation|validator|command|run|check|release|lifecycle|readiness|exec(?:ution)?|review|approval|audit|sign[_. -]?off|attestation|certification|safety|security|risk|severity|integrity|artifact|proof|signature|signer|authenticity|authori[sz]ation|permission|access|policy|compliance|target|binding|provenance|checkpoint|source|network|node|rpc|endpoint|service|dependency|provider|benchmark|capacity|quota|resource|rate|limit|json|schema|markdown|report|transcript|document)';
  const stringOutcomeName = '(?:status|result|outcome|verdict|kind|classification|type)';
  const presenceQualifier =
    '(?:evidence|artifact|target|file|output|report|log|transcript|proof|row|document|json)';
  const positivePresenceName = '(?:present|found|available|exists?)';
  const missingPresenceName =
    '(?:missing|absent|unavailable|not[_. -]?(?:found|present|available)|does[_. -]?not[_. -]?exist|non[_. -]?existent)';
  const requiredEvidenceItem = '(?:fields?|rows?|items?|sections?|columns?|values?|properties?|keys?)';
  const requiredPresenceItem = `(?:${requiredEvidenceItem}|(?:${presenceQualifier})s?)`;
  const missingRequiredName =
    `(?:missing[_. -]?${requiredEvidenceItem}|${requiredEvidenceItem}[_. -]?missing|required[_. -]?${requiredEvidenceItem}[_. -]?missing|omitted[_. -]?${requiredEvidenceItem}|${requiredEvidenceItem}[_. -]?omitted|omissions?)`;
  const missingRequiredString =
    `(?:missing[_. -]?(?:required[_. -]?)?${requiredEvidenceItem}|omitted[_. -]?(?:required[_. -]?)?${requiredEvidenceItem})`;
  const structuredFailureFieldName = `(?:${failureField}|${missingRequiredName})`;
  const positiveOutcomeName = '(?:success|succeeded|passed|ok|valid(?:ated)?|verified|complete(?:d)?|execut(?:ed)?|ran|invoked|reach(?:ed|able)?|connect(?:ed)?|responsive|available|accessible)';
  const partialOutcomeName = '(?:partial(?:ly[_. -]?(?:complete(?:d)?|done|run|executed|validated))?)';
  const pendingOutcomeName = '(?:pending|awaiting|deferred|unresolved)';
  const plannedOutcomeName = '(?:planned|scheduled|to[_. -]?do|todo|tbd|not[_. -]?(?:started|begun|initiated))';
  const requiredReviewOutcomeName =
    '(?:(?:review|approval|follow[_. -]?up)[_. -]?required|needs[_. -]?(?:review|approval|follow[_. -]?up))';
  const conditionalOutcomeName =
    '(?:conditional|provisional|tentative|qualified[_. -]?approval|approved[_. -]?with[_. -]?conditions?)';
  const bypassedOutcomeName = '(?:waiv(?:ed|er)|bypass(?:ed)?|ignored?|suppressed)';
  const flakyOutcomeName =
    '(?:flaky|unstable|intermittent|non[_. -]?deterministic|nondeterministic|retry[_. -]?(?:required|needed|only)|rerun[_. -]?(?:required|needed))';
  const expectedFailureOutcomeName =
    '(?:(?:expected|allowed|known)[_. -]?fail(?:ed|ure)?|x[_. -]?fail|quarantin(?:ed|e))';
  const overriddenOutcomeName =
    '(?:(?:manual|operator)[_. -]?overrid(?:e|den)|overrid(?:e|den)|force[_. -]?pass(?:ed)?)';
  const uncertainOutcomeName =
    '(?:inconclusive|indeterminate|undetermined|unknown|unverified|unconfirmed|unproven)';
  const failureOutcomeName =
    `(?:fail(?:ed|ure)?|errors?|blocked|errored|invalid|incomplete|${partialOutcomeName}|${pendingOutcomeName}|${plannedOutcomeName}|${requiredReviewOutcomeName}|${conditionalOutcomeName}|${bypassedOutcomeName}|${flakyOutcomeName}|${expectedFailureOutcomeName}|${overriddenOutcomeName}|${uncertainOutcomeName}|${warningName}|${runtimeFailureName}|${freshnessFailureName}|${regressionFailureName}|${safetyFailureName}|${securityRiskFailureName}|${integrityFailureName}|${authenticityFailureName}|${revocationFailureName}|${complianceFailureName}|${driftFailureName}|${linkageFailureName}|${authorizationFailureName}|${suspensionFailureName}|${connectivityFailureName}|${capacityFailureName}|${malformedArtifactFailureName}|${fixtureArtifactFailureName}|${weakEvidenceTargetFailureOutcomeName}|${sensitiveEvidenceTargetFailureOutcomeName}|${denialOutcomeName}|skip(?:ped)?|timed[_. -]?out|time[_. -]?out|cancel(?:led|ed)|abort(?:ed)?|not[_. -]?(?:run|ran|executed|invoked)|unexecuted|uninvoked|${discrepancyName}|${consistencyFailureName}|mismatched)`;
  const stringFailureOutcomeName =
    `(?:fail(?:ed|ure)?|blocked|errors?|errored|invalid|not[_. -]?valid|incomplete|not[_. -]?complete(?:d)?|${partialOutcomeName}|${pendingOutcomeName}|${plannedOutcomeName}|${requiredReviewOutcomeName}|${conditionalOutcomeName}|${bypassedOutcomeName}|${flakyOutcomeName}|${expectedFailureOutcomeName}|${overriddenOutcomeName}|${uncertainOutcomeName}|${warningName}|${runtimeFailureName}|${freshnessFailureName}|${regressionFailureName}|${safetyFailureName}|${securityRiskFailureName}|${integrityFailureName}|${authenticityFailureName}|${revocationFailureName}|${complianceFailureName}|${driftFailureName}|${linkageFailureName}|${authorizationFailureName}|${suspensionFailureName}|${connectivityFailureName}|${capacityFailureName}|${malformedArtifactFailureName}|${fixtureArtifactFailureName}|${weakEvidenceTargetFailureOutcomeName}|${sensitiveEvidenceTargetFailureOutcomeName}|${denialOutcomeName}|skip(?:ped)?|timed[_. -]?out|time[_. -]?out|cancel(?:led|ed)|abort(?:ed)?|not[_. -]?(?:run|ran|executed|invoked)|unexecuted|uninvoked|${missingPresenceName}|${missingRequiredString}|${discrepancyName}|${consistencyFailureName}|mismatched)`;
  const positiveOutcomeField =
    `(?:(?:${outcomeQualifier}[_. -]?)?${positiveOutcomeName}|${positiveOutcomeName}[_. -]?${outcomeQualifier})`;
  const failureOutcomeField =
    `(?:(?:${outcomeQualifier}[_. -]?)?${failureOutcomeName}|${failureOutcomeName}[_. -]?${outcomeQualifier})`;
  const stringOutcomeField =
    `(?:${stringOutcomeQualifier}[_. -]?${stringOutcomeName}|${stringOutcomeName}[_. -]?${stringOutcomeQualifier})`;
  const severeRiskStringOutcomeField =
    `(?:(?:security|risk|severity)[_. -]?${stringOutcomeName}|${stringOutcomeName}[_. -]?(?:security|risk|severity))`;
  const positivePresenceField =
    `(?:(?:${presenceQualifier}[_. -]?)${positivePresenceName}|${positivePresenceName}[_. -]?${presenceQualifier})`;
  const requiredPositivePresenceField =
    `(?:(?:all[_. -]?)?required[_. -]?${requiredPresenceItem}[_. -]?${positivePresenceName}|${positivePresenceName}[_. -]?(?:all[_. -]?)?required[_. -]?${requiredPresenceItem})`;
  const missingPresenceField =
    `(?:(?:${presenceQualifier}[_. -]?)${missingPresenceName}|${missingPresenceName}[_. -]?${presenceQualifier})`;
  const stringPresenceField =
    `(?:${presenceQualifier}[_. -]?${stringOutcomeName}|${stringOutcomeName}[_. -]?${presenceQualifier})`;
  const nonZeroNumericValue = '["\'`]?\\s*(?!0\\b)[1-9]\\d*\\b';
  const structuredBooleanTerminator = '(?=\\s*(?:$|[;,.|)\\]}]|\\r?\\n))';
  const falseBooleanValue = `["'\`]?\\s*(?:false|no)["'\`]?${structuredBooleanTerminator}`;
  const trueBooleanValue = `["'\`]?\\s*(?:true|yes)["'\`]?${structuredBooleanTerminator}`;
  const zeroPresenceValue = `["'\`]?\\s*0(?![\\d.])["'\`]?${structuredBooleanTerminator}`;
  const failureStringValue = `["'\`]?\\s*${stringFailureOutcomeName}["'\`]?${structuredBooleanTerminator}`;

  return (
    new RegExp(`${structuredFieldBoundary}["'\`]?${structuredFailureFieldName}["'\`]?\\s*[:=]\\s*(?:\\[(?!\\s*\\])|\\{(?!\\s*\\}))`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredFieldBoundary}["'\`]?${structuredFailureFieldName}["'\`]?\\s*[:=]\\s*${nonZeroNumericValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredFieldBoundary}["'\`]?${structuredFailureFieldName}[_. -]?(?:count|total)["'\`]?\\s*[:=]\\s*${nonZeroNumericValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredFieldBoundary}["'\`]?${structuredFailureFieldName}["'\`]?\\s*[:=]\\s*${trueBooleanValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredFieldBoundary}["'\`]?${exitField}["'\`]?\\s*[:=]\\s*${nonZeroNumericValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${positiveOutcomeField}["'\`]?\\s*[:=]\\s*${falseBooleanValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${failureOutcomeField}["'\`]?\\s*[:=]\\s*${trueBooleanValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${stringOutcomeField}["'\`]?\\s*[:=]\\s*${failureStringValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${severeRiskStringOutcomeField}["'\`]?\\s*[:=]\\s*["'\`]?\\s*${severeRiskStringName}["'\`]?${structuredBooleanTerminator}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${positivePresenceField}["'\`]?\\s*[:=]\\s*${falseBooleanValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${positivePresenceField}["'\`]?\\s*[:=]\\s*${zeroPresenceValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${requiredPositivePresenceField}["'\`]?\\s*[:=]\\s*${falseBooleanValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${requiredPositivePresenceField}["'\`]?\\s*[:=]\\s*${zeroPresenceValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${missingPresenceField}["'\`]?\\s*[:=]\\s*${trueBooleanValue}`, 'i')
      .test(normalized) ||
    new RegExp(`${structuredOutcomeFieldBoundary}["'\`]?${stringPresenceField}["'\`]?\\s*[:=]\\s*${failureStringValue}`, 'i')
      .test(normalized)
  );
}
