import { describe, expect, it } from 'vitest';

import {
  classifyPublicationClaimText,
  hasCanonicalControlledTestnetProductionClaim,
  PRODUCTION_CLAIM_WORDING,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';

describe('publication claim boundary', () => {
  it('classifies mainnet production-ready wording as forbidden', () => {
    expect(classifyPublicationClaimText('mainnet production-ready bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasProductionReadyClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies controlled testnet production wording without mainnet scope', () => {
    expect(classifyPublicationClaimText('production-grade testnet bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
  });

  it('distinguishes canonical public controlled wording from internal labels', () => {
    expect(hasCanonicalControlledTestnetProductionClaim('testnet production-candidate bridge')).toBe(true);
    expect(hasCanonicalControlledTestnetProductionClaim('production-grade testnet bridge')).toBe(true);
    expect(hasCanonicalControlledTestnetProductionClaim('testnet production-grade bridge')).toBe(false);
    expect(hasCanonicalControlledTestnetProductionClaim('production-candidate testnet bridge')).toBe(false);
  });

  it('classifies unqualified go-live wording as production claim text', () => {
    expect(classifyPublicationClaimText('operator runbook for go-live')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies generally available wording as production claim text', () => {
    expect(classifyPublicationClaimText('bridge is generally available')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });

    expect(classifyPublicationClaimText('mainnet bridge is generally available')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('lists generally available wording in the shared production-claim boundary', () => {
    expect(PRODUCTION_CLAIM_WORDING).toContain('generally available');
  });

  it('classifies institutional and enterprise readiness noun forms as production claim text', () => {
    for (const wording of [
      'institutional readiness package',
      'institutional-readiness package',
      'enterprise readiness evidence',
      'enterprise-readiness evidence',
    ]) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasMainnetProductionClaim: false,
        hasProductionReadyClaim: false,
        hasControlledTestnetProductionClaim: false,
        hasProductionClaim: true,
      });
    }
  });

  it('classifies forbidden production wording across Markdown line breaks', () => {
    expect(classifyPublicationClaimText('bridge is production\nready')).toMatchObject({
      hasProductionReadyClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('main\nnet production-candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production\ncandidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
  });

  it('classifies underscore-separated production claim variants', () => {
    for (const wording of [
      'production_ready bridge',
      'prod_ready bridge',
      'production_readiness bridge',
    ]) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }

    expect(classifyPublicationClaimText('main_net production_candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production_candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('production_grade testnet bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
  });

  it('classifies slash-separated production claim variants', () => {
    for (const wording of [
      'production/ready bridge',
      'prod/ready bridge',
      'production/readiness bridge',
    ]) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }

    expect(classifyPublicationClaimText('main/net production/candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production/candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('production/grade testnet bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('exchange/ready bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies unicode dash-separated production claim variants', () => {
    for (const wording of [
      'production\\u2011ready bridge',
      'prod\\u2013ready bridge',
      'production\\u2014readiness bridge',
    ]) {
      expect(classifyPublicationClaimText(JSON.parse(`"${wording}"`)), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }

    expect(classifyPublicationClaimText(JSON.parse('"mainnet production\\u2011candidate bridge"'))).toMatchObject({
      hasMainnetProductionClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"testnet production\\u2011candidate bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"production\\u2011grade testnet bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"exchange\\u2011ready bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies dot-separated production claim variants', () => {
    for (const wording of [
      'production.ready bridge',
      'prod.ready bridge',
      'production.readiness bridge',
    ]) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }

    expect(classifyPublicationClaimText('mainnet production.candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production.candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('production.grade testnet bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('exchange.ready bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies punctuation-separated production claim variants', () => {
    for (const wording of [
      'production:ready bridge',
      'prod;ready bridge',
      'production:readiness bridge',
    ]) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }

    expect(classifyPublicationClaimText('main:net production:candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production:candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('production;grade testnet bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('exchange:ready bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies invisible unicode-separated production claim variants', () => {
    for (const wording of [
      'production\\u200bready bridge',
      'production\\ufe0fready bridge',
      'production\\udb40\\udd00ready bridge',
      'prod\\u2060ready bridge',
      'produc\\u200dtion readiness bridge',
    ]) {
      expect(classifyPublicationClaimText(JSON.parse(`"${wording}"`)), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }

    expect(classifyPublicationClaimText(JSON.parse('"main\\u200bnet production\\u200bcandidate bridge"'))).toMatchObject({
      hasMainnetProductionClaim: true,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"testnet production\\u200bcandidate bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"production\\u200bgrade testnet bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: true,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"production\\u200dgrade testnet bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText(JSON.parse('"exchange\\ufeffready bridge"'))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies compatibility-normalized production claim variants', () => {
    expect(classifyPublicationClaimText(JSON.parse(
      '"\\uff50\\uff52\\uff4f\\uff44\\uff55\\uff43\\uff54\\uff49\\uff4f\\uff4e-ready bridge"',
    ))).toMatchObject({
      hasProductionReadyClaim: true,
      hasProductionClaim: true,
    });
  });

  it('classifies production deployment candidate as non-canonical production claim wording', () => {
    expect(classifyPublicationClaimText('production deployment candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production deployment candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production-deployment-candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('testnet production deployment-candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies mainnet production deployment candidate as forbidden mainnet wording', () => {
    expect(classifyPublicationClaimText('mainnet production deployment candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
    expect(classifyPublicationClaimText('mainnet production-deployment-candidate bridge')).toMatchObject({
      hasMainnetProductionClaim: true,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: true,
    });
  });

  it('classifies adversarial mainnet readiness variants as forbidden', () => {
    const forbidden = [
      'main network production candidate bridge',
      'main-chain release-ready bridge',
      'mainnet GA bridge',
      'mainnet enterprise-ready bridge',
      'production-grade main network bridge',
      'mainchain launch-ready bridge',
      'main chain exchange-ready bridge',
      'main network prod-grade bridge',
    ];

    for (const wording of forbidden) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasMainnetProductionClaim: true,
        hasControlledTestnetProductionClaim: false,
        hasProductionClaim: true,
      });
    }
  });

  it('ignores release-gate claim-control denial language', () => {
    expect(classifyPublicationClaimText([
      'Production-ready claim allowed = no',
      'production-ready benchmark claims are always blocked for mainnet',
      'production throughput claims remain blocked for Gate 7 evidence',
      'Testnet production-candidate claim allowed = yes',
      'Release level = production deployment candidate',
      'Release level being evaluated: production-deployment-candidate',
      'production deployment candidate support requires Testnet production-candidate claim allowed = yes',
      'artifact://release-notes/completed-production-deployment-candidate-release-notes.md',
      'completed-production-deployment-candidate-release-notes-evidence',
      'Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
    ].join('; '))).toMatchObject({
      hasMainnetProductionClaim: false,
      hasProductionReadyClaim: false,
      hasControlledTestnetProductionClaim: false,
      hasProductionClaim: false,
    });
  });

  it('does not strip positive production-ready claim-control language', () => {
    for (const wording of [
      'Production-ready claim allowed = yes',
      'Production-ready claim handling: approved',
      'production-ready claim control enabled',
      'Production-ready claim allowed = granted',
      'production-ready claim control grants publication support',
      'Production-ready claim handling: cleared',
      'production-ready claim control authorizes publication support',
    ]) {
      expect(classifyPublicationClaimText(wording), wording).toMatchObject({
        hasProductionReadyClaim: true,
        hasProductionClaim: true,
      });
    }
  });

  it('accepts reviewer summaries that match release and claim-handling fields', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([]);
  });

  it('accepts reviewer summaries that bind production-ready denial to exact fields', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([]);
  });

  it('rejects reviewer summaries that also deny supported release handling', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; release support: none; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must not be none when Release supported is institutional reference',
    ]);
  });

  it('rejects reviewer summaries that use unsupported release wording for supported releases', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release unsupported; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must not be none when Release supported is institutional reference',
    ]);
  });

  it('rejects reviewer summaries that hide unsupported release wording with invisible joiners', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: JSON.parse(
        '"release support: institutional reference; release unsupp\\u200dorted; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed"',
      ),
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must not be none when Release supported is institutional reference',
    ]);
  });

  it('rejects reviewer summaries that hide unsupported release wording with invisible separators', () => {
    for (const unsupported of [
      'un\\u200bsupported',
      'unsupp\\u2060orted',
      'unsupp\\ufefforted',
      'unsupp\\ufe0forted',
      'unsupp\\udb40\\udd00orted',
    ]) {
      expect(validateReviewerDecisionSummaryClaimBoundary({
        prefix: 'Publication Decision: Reviewer decision summary',
        summary: JSON.parse(
          `"release support: institutional reference; release ${unsupported}; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed"`,
        ),
        releaseSupported: 'institutional reference',
        productionReadyClaimAllowed: 'no',
        testnetProductionCandidateClaimAllowed: 'no',
      }), unsupported).toEqual([
        'Publication Decision: Reviewer decision summary: release support must not be none when Release supported is institutional reference',
      ]);
    }
  });

  it('rejects reviewer summaries that hide unsupported release wording with compatibility characters', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: JSON.parse(
        '"release support: institutional reference; release \\uff55\\uff4e\\uff53\\uff55\\uff50\\uff50\\uff4f\\uff52\\uff54\\uff45\\uff44; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed"',
      ),
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must not be none when Release supported is institutional reference',
    ]);
  });

  it('rejects pre-release support wording as a release-support binding', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'pre-release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must match Release supported institutional reference',
    ]);
  });

  it('does not treat pre-release support denial as release-support denial', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'pre-release support: none; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must match Release supported institutional reference',
    ]);
  });

  it('rejects reviewer summaries that use non-structured support-release wording', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'reviewer does not support institutional reference release; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must match Release supported institutional reference',
    ]);
  });

  it('rejects reviewer summaries that contradict release and claim-handling fields', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: production deployment candidate; production-ready claim handling: approved; testnet production-candidate claim handling: allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: release support must match Release supported institutional reference',
      'Publication Decision: Reviewer decision summary: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
      'Publication Decision: Reviewer decision summary: production-ready claim handling must be blocked, forbidden, or not allowed',
      'Publication Decision: Reviewer decision summary: testnet production-candidate claim handling must be blocked, forbidden, or not allowed',
    ]);
  });

  it('rejects reviewer summaries with open critical-or-high risk phrasing variants', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical or high findings open 1',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: critical/high findings must be 0, none, or closed',
    ]);

    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical and high vulnerabilities open 1',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: critical/high vulnerabilities must be 0, none, or closed',
    ]);
  });

  it('requires numeric critical-or-high vulnerability closure when requested', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical and high vulnerabilities open none',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
      requireNumericCriticalHighVulnerabilityClosure: true,
    })).toEqual([
      'Publication Decision: Reviewer decision summary: critical/high vulnerabilities must be numeric 0',
    ]);
  });

  it('requires exact open critical-or-high vulnerability closure when numeric closure is requested', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical and high vulnerabilities 0',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
      requireNumericCriticalHighVulnerabilityClosure: true,
    })).toEqual([
      'Publication Decision: Reviewer decision summary: critical/high vulnerabilities must be numeric 0',
    ]);
  });

  it('requires numeric critical-or-high finding closure when requested', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical and high findings open none',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
      requireNumericCriticalHighFindingClosure: true,
    })).toEqual([
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    ]);
  });

  it('requires exact open critical-or-high finding closure when numeric closure is requested', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed; critical and high findings 0',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
      requireNumericCriticalHighFindingClosure: true,
    })).toEqual([
      'Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0',
    ]);
  });

  it('rejects reviewer summaries with underscore-separated forbidden claim variants', () => {
    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; production_ready bridge; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: unqualified production-ready wording is not allowed; use testnet production-candidate or production-grade testnet wording',
    ]);

    expect(validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary:
        'release support: institutional reference; main_net production_candidate bridge; production-ready claim handling: blocked; testnet production-candidate claim handling: not allowed',
      releaseSupported: 'institutional reference',
      productionReadyClaimAllowed: 'no',
      testnetProductionCandidateClaimAllowed: 'no',
    })).toEqual([
      'Publication Decision: Reviewer decision summary: mainnet production-ready claims are forbidden; only testnet-scoped production-candidate claims can be evaluated',
    ]);
  });
});
