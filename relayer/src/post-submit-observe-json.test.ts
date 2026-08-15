import { describe, expect, it } from 'vitest';

import { validatePostSubmitObserveJsonReport } from './post-submit-observe-json.js';

const TX_ID = 'a'.repeat(64);
const BURN_TX_ID = 'b'.repeat(64);
const SPV_BOX_ID = 'c'.repeat(64);
const DUP_BOX_ID = 'd'.repeat(64);
const PAYOUT_BOX_ID = 'e'.repeat(64);
const FEE_BOX_ID = 'f'.repeat(64);
const CHANGE_BOX_ID = '1'.repeat(64);
const DUPLICATE_PAYOUT_BOX_ID = '2'.repeat(64);
const CHANGE_TREE = '1001'.repeat(8);
const FINALITY_EVIDENCE_ARTIFACT = 'artifact://live-rehearsal/finality.log';
const LIVE_PREFLIGHT_TARGET = 'evidence/live-rehearsals/live-preflight.json';
const ERGO_NODE_URL = 'http://127.0.0.1:9053';
const LIVE_PREFLIGHT_BINDING_LINE =
  `- Live-preflight JSON binding: ${LIVE_PREFLIGHT_TARGET} status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`;
const CONFIRMATION_POLICY_LINE =
  `- Confirmation policy met: yes ${FINALITY_EVIDENCE_ARTIFACT} finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`;

function validReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'CREATED',
    errors: [],
    markdown: [
      '## Submit And Confirmation Evidence',
      '',
      `- Submitted transaction ID: ${TX_ID}`,
      CONFIRMATION_POLICY_LINE,
      '',
      '## Post-Submit Gate Binding',
      '',
      LIVE_PREFLIGHT_BINDING_LINE,
    ].join('\n'),
    sourceBindings: {
      node: {
        sourceType: 'live-read-only-node',
        readOnly: true,
        noAuthHeader: true,
        ergoNodeUrl: ERGO_NODE_URL,
        observedAt: '2026-05-20T00:00:00Z',
        nodeHeight: 104,
        nodeNetwork: 'Ergo testnet',
        expectedTxId: TX_ID,
        submittedTxId: TX_ID,
        operations: ['read-only /info', 'read-only transaction lookup'],
      },
      state: {
        sourceType: 'read-only-state-tracker',
        readOnly: true,
        runtimePathSerialized: false,
        targetClass: 'operator-provided-state-db',
        burnOrder: [BURN_TX_ID],
        operations: ['read-only peg-out state lookup'],
      },
    },
    observation: {
      txBinding: {
        expectedTxId: TX_ID,
        submittedTxId: TX_ID,
        idsMatch: true,
      },
      burnOrder: [BURN_TX_ID],
      settlementOutputs: {
        outputCount: 4,
        boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, FEE_BOX_ID],
      },
      successors: {
        spvTracker: {
          outputIndex: 0,
          boxId: SPV_BOX_ID,
        },
        aggregateDup: {
          outputIndex: 1,
          boxId: DUP_BOX_ID,
        },
      },
      recipientPayouts: [{
        burnTxId: BURN_TX_ID,
        outputIndex: 2,
        boxId: PAYOUT_BOX_ID,
      }],
      livePreflightBinding: {
        target: LIVE_PREFLIGHT_TARGET,
        status: 'GO',
        expectedTxId: TX_ID,
        approvedBurnTxHashes: [BURN_TX_ID],
        runtimeBroadcastEnabled: false,
        preSubmitBoundaryPreserved: true,
        authorizationEvidenceLinked: true,
      },
      minerFee: {
        outputIndex: 3,
        boxId: FEE_BOX_ID,
        feeNanoErg: '1100000',
      },
      confirmation: {
        height: 100,
        count: 4,
        required: 3,
        policyMet: true,
        finalityEvidenceArtifact: FINALITY_EVIDENCE_ARTIFACT,
      },
      boundaries: {
        readOnlyObservation: true,
        signs: false,
        submits: false,
        confirms: false,
        reconciles: false,
        authorizesBroadcast: false,
        gate3ClosureAllowed: false,
        productionReadyClaimAllowed: false,
        testnetProductionCandidateClaimAllowed: false,
      },
    },
    ...overrides,
  };
}

function validObservation(): Record<string, unknown> {
  const observation = validReport().observation;
  if (typeof observation !== 'object' || observation === null || Array.isArray(observation)) {
    throw new Error('valid report observation must be an object');
  }
  return observation as Record<string, unknown>;
}

describe('post-submit observe JSON validation', () => {
  it('accepts a structured read-only observe report and returns markdown', () => {
    const result = validatePostSubmitObserveJsonReport(validReport(), {
      livePreflightTarget: LIVE_PREFLIGHT_TARGET,
    });

    expect(result.errors).toEqual([]);
    expect(result.markdown).toContain('Submitted transaction ID');
    expect(result.markdown).toContain('finality evidence');
  });

  it('rejects reports without read-only node and state source provenance', () => {
    const report = validReport();
    delete report.sourceBindings;
    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report sourceBindings.node must prove live-read-only-node read-only provenance',
      'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
    ]));
  });

  it('rejects source provenance that claims unsafe operations or fixture endpoints', () => {
    const report = validReport({
      sourceBindings: {
        node: {
          sourceType: 'live-read-only-node',
          readOnly: true,
          noAuthHeader: true,
          ergoNodeUrl: 'https://fixture-node.invalid',
          observedAt: '2026-05-20T00:00:00Z',
          nodeHeight: 104,
          nodeNetwork: 'Ergo testnet',
          expectedTxId: TX_ID,
          submittedTxId: TX_ID,
          operations: ['read-only /info', 'broadcast submitted transaction'],
        },
        state: {
          sourceType: 'read-only-state-tracker',
          readOnly: true,
          runtimePathSerialized: true,
          targetClass: 'operator-provided-state-db',
          burnOrder: [BURN_TX_ID],
          operations: ['reconcile peg-out row'],
        },
      },
    });
    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report sourceBindings.node must prove live-read-only-node read-only provenance',
      'post-submit: JSON observe report sourceBindings.node.operations must not include signing, submission, broadcast, reconciliation, or mutation operations',
      'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
      'post-submit: JSON observe report sourceBindings.state.operations must not include signing, submission, broadcast, reconciliation, or mutation operations',
    ]));
  });

  it('rejects default runtime database source provenance', () => {
    const report = validReport();
    const sourceBindings = report.sourceBindings as {
      state: Record<string, unknown>;
    };
    sourceBindings.state.targetClass = 'default-state-db';

    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
    );
  });

  it('rejects source provenance whose operations include non-string entries', () => {
    const report = validReport();
    const sourceBindings = report.sourceBindings as {
      node: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    sourceBindings.node.operations = [
      'read-only /info',
      'read-only transaction lookup',
      { label: 'broadcast submitted transaction' },
    ];
    sourceBindings.state.operations = [
      'read-only peg-out state lookup',
      123,
    ];
    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report sourceBindings.node.operations entries must be strings',
      'post-submit: JSON observe report sourceBindings.state.operations entries must be strings',
    ]));
  });

  it('rejects source provenance with forbidden node auth or runtime payloads', () => {
    const report = validReport();
    const sourceBindings = report.sourceBindings as {
      node: Record<string, unknown>;
    };
    sourceBindings.node.authHeader = 'Bearer redacted-secret';
    sourceBindings.node.runtimePath = 'bridge-state.sqlite';
    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report sourceBindings.node must prove live-read-only-node read-only provenance',
    );
  });

  it('rejects source provenance with forbidden state auth or runtime payloads', () => {
    const report = validReport();
    const sourceBindings = report.sourceBindings as {
      state: Record<string, unknown>;
    };
    sourceBindings.state.authHeader = 'Bearer redacted-secret';
    sourceBindings.state.runtimePath = 'bridge-state.json';
    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
    );
  });

  it('rejects punctuation-wrapped sensitive and runtime source targets', () => {
    for (const observationTarget of [
      'sourceTarget=(operator/.env)',
      'sourceTarget=%28operator%2F.env%29',
    ]) {
      const nodeReport = validReport();
      const nodeSourceBindings = nodeReport.sourceBindings as {
        node: Record<string, unknown>;
      };
      nodeSourceBindings.node.observationTarget = observationTarget;

      expect(validatePostSubmitObserveJsonReport(nodeReport).errors).toContain(
        'post-submit: JSON observe report sourceBindings.node must prove live-read-only-node read-only provenance',
      );
    }

    for (const observationTarget of [
      'sourceTarget=(runtime/bridge-state.sqlite)',
      'sourceTarget=%28runtime%2Fbridge-state.sqlite%29',
    ]) {
      const stateReport = validReport();
      const stateSourceBindings = stateReport.sourceBindings as {
        state: Record<string, unknown>;
      };
      stateSourceBindings.state.observationTarget = observationTarget;

      expect(validatePostSubmitObserveJsonReport(stateReport).errors).toContain(
        'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
      );
    }
  });

  it('rejects encoded local-only source provenance labels', () => {
    const encodedFileUrl = [
      'sourceTarget=',
      'file%3A%2F%2F%2F',
      'C%3A%2F',
      'tmp%2F',
      'post-submit-node.json',
    ].join('');
    const encodedAbsolutePath = [
      'sourceTarget=%2F',
      'tmp%2F',
      'post-submit-state.json',
    ].join('');

    const nodeReport = validReport();
    const nodeSourceBindings = nodeReport.sourceBindings as {
      node: Record<string, unknown>;
    };
    nodeSourceBindings.node.observationTarget = encodedFileUrl;

    const stateReport = validReport();
    const stateSourceBindings = stateReport.sourceBindings as {
      state: Record<string, unknown>;
    };
    stateSourceBindings.state.observationTarget = encodedAbsolutePath;

    const nodeResult = validatePostSubmitObserveJsonReport(nodeReport);
    const stateResult = validatePostSubmitObserveJsonReport(stateReport);

    expect(nodeResult.markdown).toBeUndefined();
    expect(nodeResult.errors).toContain(
      'post-submit: JSON observe report sourceBindings.node must prove live-read-only-node read-only provenance',
    );
    expect(stateResult.markdown).toBeUndefined();
    expect(stateResult.errors).toContain(
      'post-submit: JSON observe report sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths',
    );
  });

  it('rejects reports without structured and markdown finality evidence binding', () => {
    const observation = validObservation();
    const confirmation = observation.confirmation as Record<string, unknown>;
    const withoutFinality = { ...confirmation };
    delete withoutFinality.finalityEvidenceArtifact;
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
      ].join('\n'),
      observation: {
        ...observation,
        confirmation: withoutFinality,
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report confirmation.finalityEvidenceArtifact must be a completed artifact:// target',
    );
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown Confirmation policy met must cite finality evidence',
    );
  });

  it('rejects markdown evidence with contradictory failure markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
        '',
        '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown must not include contradictory failure markers',
    );
  });

  it('rejects markdown evidence with compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
        '',
        `- Validation summary: PASS exit code 0; ${marker}`,
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown must not include contradictory failure markers',
    );
  });

  it('rejects markdown evidence with remaining issue markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
        '',
        '- Remaining issues:',
        '  - unresolved observation blocker',
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown must not include remaining issues',
    );
  });

  it('rejects markdown evidence with compatibility-normalized issue markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
        '',
        '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved observation blocker',
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown must not include remaining issues',
    );
  });

  it('rejects markdown evidence with open issue markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
        '',
        '- Open issues: unresolved observation blocker',
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown must not include remaining issues',
    );
  });

  it('rejects report lines with contradictory failure markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
      ],
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report lines must not include contradictory failure markers',
    );
  });

  it('rejects report lines with compatibility-normalized failure markers', () => {
    const marker = 'validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue';
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        `- Validation summary: PASS exit code 0; ${marker}`,
      ],
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report lines must not include contradictory failure markers',
    );
  });

  it('rejects report lines with structured nonzero or non-empty failure fields', () => {
    const countResult = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- JSON summary: errorCount: 1',
      ],
    }));
    const collectionResult = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- JSON summary: {"errors":["missing artifact"]}',
      ],
    }));
    const totalResult = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- JSON summary: errorsTotal=1; failures_total: 2',
      ],
    }));

    expect(countResult.errors).toContain(
      'post-submit: JSON observe report lines must not include contradictory failure markers',
    );
    expect(collectionResult.errors).toContain(
      'post-submit: JSON observe report lines must not include contradictory failure markers',
    );
    expect(totalResult.errors).toContain(
      'post-submit: JSON observe report lines must not include contradictory failure markers',
    );
  });

  it('allows report lines with structured zero or empty failure fields', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- JSON summary: errorCount: 0',
        '- JSON summary: errorsTotal=0; failures_total: 0',
        '- JSON summary: {"errors":[]}',
      ],
    }));

    expect(result.errors).toEqual([]);
  });

  it('rejects report lines with remaining issue markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- Remaining issues:',
        '  - unresolved observation blocker',
      ],
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report lines must not include remaining issues',
    );
  });

  it('rejects report lines with known issue markers', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- Known issues: unresolved observation blocker',
      ],
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report lines must not include remaining issues',
    );
  });

  it('allows report lines with explicit false issue closures', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- Open issues: false',
      ],
    }));

    expect(result.errors).toEqual([]);
  });

  it('rejects report lines with suffix-state unresolved issue fields', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      lines: [
        'testnet rehearsal post-submit observe CREATED',
        '- Post-submit observe JSON report completed structured evidence',
        '- JSON summary: issuesOpen: 1',
      ],
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report lines must not include remaining issues',
    );
  });

  it('rejects reports whose markdown finality target diverges from structured observation', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes artifact://live-rehearsal/other-finality.log finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown Confirmation policy met must cite observation.confirmation.finalityEvidenceArtifact',
    );
  });

  it('rejects reports whose markdown finality target only prefixes the structured target', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes ${FINALITY_EVIDENCE_ARTIFACT}-shadow.log finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown Confirmation policy met must cite observation.confirmation.finalityEvidenceArtifact',
    );
  });

  it('rejects reports whose markdown submitted transaction ID differs from structured observation', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${'9'.repeat(64)}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown Submitted transaction ID must cite observation.txBinding.submittedTxId',
    );
  });

  it('rejects reports whose live-preflight target differs from the validated target', () => {
    const result = validatePostSubmitObserveJsonReport(validReport(), {
      livePreflightTarget: 'evidence/live-rehearsals/other-live-preflight.json',
    });

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.target must match the validated live-preflight JSON target',
    );
  });

  it('rejects reports without a live-preflight provenance binding', () => {
    const observation = validObservation();
    const withoutLivePreflightBinding = { ...observation };
    delete withoutLivePreflightBinding.livePreflightBinding;

    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: withoutLivePreflightBinding,
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report observation.livePreflightBinding is required',
    );
  });

  it('rejects reports without a markdown live-preflight provenance binding', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: '## Submit And Confirmation Evidence\n\n- Submitted transaction ID: ' + TX_ID,
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown must include Live-preflight JSON binding',
    );
  });

  it('rejects reports whose markdown binding differs from the structured live-preflight binding', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        '- Live-preflight JSON binding: evidence/live-rehearsals/other-live-preflight.json status GO Expected transaction ID ' +
          TX_ID +
          ' pre-submit boundary preserved and authorization evidence linked.',
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite observation.livePreflightBinding.target',
    );
  });

  it('rejects reports whose markdown live-preflight target only prefixes the structured target', () => {
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        '- Live-preflight JSON binding: evidence/live-rehearsals/live-preflight.json-shadow.json status GO Expected transaction ID ' +
          TX_ID +
          ` approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite observation.livePreflightBinding.target',
    );
  });

  it('rejects reports with a mismatched live-preflight provenance binding', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        livePreflightBinding: {
          target: 'evidence/live-rehearsals/live-preflight-template.json',
          status: 'BLOCKED',
          expectedTxId: '9'.repeat(64),
          runtimeBroadcastEnabled: true,
          preSubmitBoundaryPreserved: false,
          authorizationEvidenceLinked: false,
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
      'post-submit: JSON observe report livePreflightBinding.status must be GO',
      'post-submit: JSON observe report livePreflightBinding.expectedTxId must match observation.txBinding.expectedTxId',
      'post-submit: JSON observe report livePreflightBinding.runtimeBroadcastEnabled must be false',
      'post-submit: JSON observe report livePreflightBinding.preSubmitBoundaryPreserved must be true',
      'post-submit: JSON observe report livePreflightBinding.authorizationEvidenceLinked must be true',
    ]));
  });

  it('rejects live-preflight bindings that omit the neutral preflight runtime proof', () => {
    const observation = validObservation();
    const binding = observation.livePreflightBinding as Record<string, unknown>;
    const missingRuntimeProof = { ...binding };
    delete missingRuntimeProof.runtimeBroadcastEnabled;
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: ${LIVE_PREFLIGHT_TARGET} status GO Expected transaction ID ${TX_ID} pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: missingRuntimeProof,
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report livePreflightBinding.runtimeBroadcastEnabled must be false',
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite runtimeBroadcastEnabled false',
    ]));
  });

  it('rejects placeholder live-preflight provenance targets in JSON and markdown bindings', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        '- Live-preflight JSON binding: evidence/live-rehearsals/live-preflight-todo.json status GO Expected transaction ID ' +
          TX_ID +
          ' pre-submit boundary preserved and authorization evidence linked.',
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target: 'evidence/live-rehearsals/live-preflight-todo.json',
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report',
    ]));
  });

  it.each([
    'evidence/live-rehearsals/fixture-live-preflight.json',
    'evidence/live-rehearsals/mock-live-preflight.json',
    'evidence/live-rehearsals/dummy-live-preflight.json',
    'evidence/live-rehearsals/fake-live-preflight.json',
    'evidence/live-rehearsals/stub-live-preflight.json',
    'evidence/live-rehearsals/testdata-live-preflight.json',
    'evidence/live-rehearsals/completed-synthetic-live-preflight.json',
  ])('rejects fixture-style live-preflight provenance target %s', target => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: ${target} status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target,
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report',
    ]));
  });

  it('rejects shell-unsafe live-preflight provenance targets before accepting post-submit observation evidence', () => {
    const observation = validObservation();
    const target = 'evidence/live rehearsals/live-preflight report.json';
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        CONFIRMATION_POLICY_LINE,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: ${target} status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target,
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report livePreflightBinding.target must not contain whitespace or shell metacharacters',
      'post-submit: JSON observe report markdown Live-preflight JSON binding target must not contain whitespace or shell metacharacters',
    ]));
    expect(result.errors.join('\n')).not.toContain(target);
  });

  it.each([
    'evidence/live-rehearsals/operator/signing-key-live-preflight.json',
    'evidence/live-rehearsals/operator/api-key-live-preflight.json',
    'evidence/live-rehearsals/operator/seed-phrase-live-preflight.json',
    'evidence/live-rehearsals/runtime/deployed_state.json',
  ])('rejects sensitive live-preflight provenance target %s without leaking it', target => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: ${target} status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target,
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
    );
    expect(result.errors.join('\n')).not.toContain(target);
  });

  it('rejects synthetic and simulated post-submit observe provenance targets', () => {
    const observation = validObservation();
    const confirmation = observation.confirmation as Record<string, unknown>;
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes artifact://live-rehearsal/completed-synthetic-finality.log finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: evidence/live-rehearsals/completed-synthetic-live-preflight.json status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target: 'evidence/live-rehearsals/completed-synthetic-live-preflight.json',
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
        confirmation: {
          ...confirmation,
          finalityEvidenceArtifact: 'artifact://live-rehearsal/completed-synthetic-finality.log',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report confirmation.finalityEvidenceArtifact must be a completed artifact:// target',
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report',
    ]));

    const simulatedResult = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes artifact://live-rehearsal/completed-simulated-finality.log finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: evidence/live-rehearsals/completed-simulated-live-preflight.json status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target: 'evidence/live-rehearsals/completed-simulated-live-preflight.json',
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
        confirmation: {
          ...confirmation,
          finalityEvidenceArtifact: 'artifact://live-rehearsal/completed-simulated-finality.log',
        },
      },
    }));

    expect(simulatedResult.markdown).toBeUndefined();
    expect(simulatedResult.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report confirmation.finalityEvidenceArtifact must be a completed artifact:// target',
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report',
    ]));
  });

  it.each([
    'artifact://live-rehearsal/operator/signing-key-finality.log',
    'artifact://live-rehearsal/operator/api-key-finality.log',
    'artifact://live-rehearsal/operator/seed-phrase-finality.log',
    'artifact://live-rehearsal/runtime/deployed_state.json',
  ])('rejects sensitive finality evidence artifact %s without leaking it', target => {
    const observation = validObservation();
    const confirmation = observation.confirmation as Record<string, unknown>;
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes ${target} finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        LIVE_PREFLIGHT_BINDING_LINE,
      ].join('\n'),
      observation: {
        ...observation,
        confirmation: {
          ...confirmation,
          finalityEvidenceArtifact: target,
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report confirmation.finalityEvidenceArtifact must be a completed artifact:// target',
    );
    expect(result.errors.join('\n')).not.toContain(target);
  });

  it('rejects row-named non-concrete post-submit observe provenance targets', () => {
    const observation = validObservation();
    const confirmation = observation.confirmation as Record<string, unknown>;
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes artifact://live-rehearsal/generic-finality.log finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: evidence/live-rehearsals/generic-live-preflight.json status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target: 'evidence/live-rehearsals/generic-live-preflight.json',
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
        confirmation: {
          ...confirmation,
          finalityEvidenceArtifact: 'artifact://live-rehearsal/generic-finality.log',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'post-submit: JSON observe report confirmation.finalityEvidenceArtifact must be a completed artifact:// target',
      'post-submit: JSON observe report livePreflightBinding.target must be a concrete JSON report',
      'post-submit: JSON observe report markdown Live-preflight JSON binding must cite a concrete non-template JSON report',
    ]));
  });

  it('allows concrete post-submit observe audit targets that mention sample size or template removal', () => {
    const observation = validObservation();
    const confirmation = observation.confirmation as Record<string, unknown>;
    const livePreflightTarget = 'evidence/live-rehearsals/sample-size-analysis-live-preflight.json';
    const finalityTarget = 'artifact://live-rehearsal/template-removal-audit-finality.log';
    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown: [
        '## Submit And Confirmation Evidence',
        '',
        `- Submitted transaction ID: ${TX_ID}`,
        `- Confirmation policy met: yes ${finalityTarget} finality evidence artifact://live-rehearsal/confirmation.log confirmationsRequired=3 confirmationsObserved=4 submitted transaction ID ${TX_ID}`,
        '',
        '## Post-Submit Gate Binding',
        '',
        `- Live-preflight JSON binding: ${livePreflightTarget} status GO Expected transaction ID ${TX_ID} approved burn order ${BURN_TX_ID} runtimeBroadcastEnabled false pre-submit boundary preserved and authorization evidence linked.`,
      ].join('\n'),
      observation: {
        ...observation,
        livePreflightBinding: {
          target: livePreflightTarget,
          status: 'GO',
          expectedTxId: TX_ID,
          approvedBurnTxHashes: [BURN_TX_ID],
          runtimeBroadcastEnabled: false,
          preSubmitBoundaryPreserved: true,
          authorizationEvidenceLinked: true,
        },
        confirmation: {
          ...confirmation,
          finalityEvidenceArtifact: finalityTarget,
        },
      },
    }));

    expect(result.errors).toEqual([]);
    expect(result.markdown).toContain(livePreflightTarget);
    expect(result.markdown).toContain(finalityTarget);
  });

  it('rejects weakened observation boundaries and mismatched tx binding', () => {
    const observation = validObservation();
    const boundaries = observation.boundaries as Record<string, unknown>;
    const report = validReport({
      observation: {
        ...observation,
        txBinding: {
          expectedTxId: TX_ID,
          submittedTxId: 'f'.repeat(64),
          idsMatch: true,
        },
        boundaries: {
          ...boundaries,
          authorizesBroadcast: true,
          gate3ClosureAllowed: true,
        },
      },
    });

    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report observation.txBinding must prove matching expected/submitted IDs',
    );
    expect(result.errors).toContain('post-submit: JSON observe report boundaries.authorizesBroadcast must be false');
    expect(result.errors).toContain('post-submit: JSON observe report boundaries.gate3ClosureAllowed must be false');
  });

  it('rejects payout order that does not match burn order', () => {
    const observation = validObservation();
    const report = validReport({
      observation: {
        ...observation,
        recipientPayouts: [{
          burnTxId: 'f'.repeat(64),
          outputIndex: 2,
          boxId: PAYOUT_BOX_ID,
        }],
      },
    });

    const result = validatePostSubmitObserveJsonReport(report);

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain('post-submit: JSON observe report payout 1 must bind burn order to OUTPUTS(2)');
  });

  it('rejects live-preflight bindings whose approved burns do not match observation burn order', () => {
    const observation = validObservation();
    const binding = observation.livePreflightBinding as Record<string, unknown>;
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        livePreflightBinding: {
          ...binding,
          approvedBurnTxHashes: ['1'.repeat(64)],
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must match observation.burnOrder',
    );
  });

  it('rejects duplicate burns in post-submit observation burn order', () => {
    const observation = validObservation();
    const binding = observation.livePreflightBinding as Record<string, unknown>;
    const markdown = [
      '## Submit And Confirmation Evidence',
      '',
      `- Submitted transaction ID: ${TX_ID}`,
      CONFIRMATION_POLICY_LINE,
      '',
      '## Post-Submit Gate Binding',
      '',
      `- Live-preflight JSON binding: ${LIVE_PREFLIGHT_TARGET} status GO Expected transaction ID ${TX_ID} ` +
        `approved burn order ${BURN_TX_ID},${BURN_TX_ID} runtimeBroadcastEnabled false ` +
        'pre-submit boundary preserved and authorization evidence linked.',
    ].join('\n');

    const result = validatePostSubmitObserveJsonReport(validReport({
      markdown,
      sourceBindings: {
        ...(validReport().sourceBindings as Record<string, unknown>),
        state: {
          ...((validReport().sourceBindings as Record<string, unknown>).state as Record<string, unknown>),
          burnOrder: [BURN_TX_ID, BURN_TX_ID],
        },
      },
      observation: {
        ...observation,
        burnOrder: [BURN_TX_ID, BURN_TX_ID],
        settlementOutputs: {
          outputCount: 5,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, DUPLICATE_PAYOUT_BOX_ID, FEE_BOX_ID],
        },
        recipientPayouts: [
          {
            burnTxId: BURN_TX_ID,
            outputIndex: 2,
            boxId: PAYOUT_BOX_ID,
          },
          {
            burnTxId: BURN_TX_ID,
            outputIndex: 3,
            boxId: DUPLICATE_PAYOUT_BOX_ID,
          },
        ],
        livePreflightBinding: {
          ...binding,
          approvedBurnTxHashes: [BURN_TX_ID, BURN_TX_ID],
        },
        minerFee: {
          outputIndex: 4,
          boxId: FEE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report observation.burnOrder must not contain duplicates',
    );
    expect(result.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must not contain duplicates',
    );
  });

  it('rejects live-preflight bindings whose approved burns differ from the validated live-preflight report', () => {
    const result = validatePostSubmitObserveJsonReport(validReport(), {
      livePreflightTarget: LIVE_PREFLIGHT_TARGET,
      livePreflightApprovedBurnTxHashes: ['1'.repeat(64)],
    });

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report livePreflightBinding.approvedBurnTxHashes must match the validated live-preflight approvalBinding.burnTxHashes',
    );
  });

  it('rejects reports without a complete settlement output vector', () => {
    const observation = validObservation();
    const withoutSettlementOutputs = { ...observation };
    delete withoutSettlementOutputs.settlementOutputs;
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: withoutSettlementOutputs,
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report observation.settlementOutputs must include outputCount and boxIds',
    );
  });

  it('rejects reports when role box IDs do not match the settlement output vector', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        settlementOutputs: {
          outputCount: 4,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, '1'.repeat(64), FEE_BOX_ID],
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain('post-submit: JSON observe report settlementOutputs.boxIds[2] must match payout 1');
  });

  it('rejects reports with duplicate settlement output box IDs', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        settlementOutputs: {
          outputCount: 4,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, PAYOUT_BOX_ID],
        },
        minerFee: {
          outputIndex: 3,
          boxId: PAYOUT_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report settlementOutputs.boxIds must not contain duplicates',
    );
  });

  it('rejects reports where the miner fee does not bind the final output after payouts', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        minerFee: {
          outputIndex: 2,
          boxId: FEE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain('post-submit: JSON observe report miner fee must bind the final output after all payouts');
  });

  it('rejects reports where the miner fee boxId does not match the final output', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        minerFee: {
          outputIndex: 3,
          boxId: CHANGE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report miner fee boxId must match the final settlement output',
    );
  });

  it('rejects reports where the miner fee amount is not a safe integer', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        minerFee: {
          outputIndex: 3,
          boxId: FEE_BOX_ID,
          feeNanoErg: '9007199254740993',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report miner fee feeNanoErg must be a positive safe integer',
    );
  });

  it('accepts reports with an explicitly bound aggregate unlock change output', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        settlementOutputs: {
          outputCount: 5,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, CHANGE_BOX_ID, FEE_BOX_ID],
        },
        aggregateUnlockChange: {
          outputIndex: 3,
          boxId: CHANGE_BOX_ID,
          ergoTreeHex: CHANGE_TREE,
          valueNanoErg: '2000000',
          tokenless: true,
        },
        minerFee: {
          outputIndex: 4,
          boxId: FEE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.errors).toEqual([]);
    expect(result.markdown).toContain('Submitted transaction ID');
  });

  it('rejects aggregate unlock change values that are not safe integers', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        settlementOutputs: {
          outputCount: 5,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, CHANGE_BOX_ID, FEE_BOX_ID],
        },
        aggregateUnlockChange: {
          outputIndex: 3,
          boxId: CHANGE_BOX_ID,
          ergoTreeHex: CHANGE_TREE,
          valueNanoErg: '9007199254740993',
          tokenless: true,
        },
        minerFee: {
          outputIndex: 4,
          boxId: FEE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report aggregate unlock change valueNanoErg must be a positive safe integer',
    );
  });

  it('rejects an undocumented output gap between payouts and miner fee', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        settlementOutputs: {
          outputCount: 5,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, CHANGE_BOX_ID, FEE_BOX_ID],
        },
        minerFee: {
          outputIndex: 4,
          boxId: FEE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain(
      'post-submit: JSON observe report must explicitly bind aggregate unlock change output when present',
    );
  });

  it('rejects malformed aggregate unlock change bindings', () => {
    const observation = validObservation();
    const result = validatePostSubmitObserveJsonReport(validReport({
      observation: {
        ...observation,
        settlementOutputs: {
          outputCount: 5,
          boxIds: [SPV_BOX_ID, DUP_BOX_ID, PAYOUT_BOX_ID, CHANGE_BOX_ID, FEE_BOX_ID],
        },
        aggregateUnlockChange: {
          outputIndex: 2,
          boxId: '2'.repeat(64),
          ergoTreeHex: 'not-hex',
          valueNanoErg: '0',
          tokenless: false,
        },
        minerFee: {
          outputIndex: 4,
          boxId: FEE_BOX_ID,
          feeNanoErg: '1100000',
        },
      },
    }));

    expect(result.markdown).toBeUndefined();
    expect(result.errors).toContain('post-submit: JSON observe report aggregate unlock change must bind OUTPUTS(3)');
    expect(result.errors).toContain('post-submit: JSON observe report aggregate unlock change must bind ErgoTree hex');
    expect(result.errors).toContain('post-submit: JSON observe report aggregate unlock change must bind positive valueNanoErg');
    expect(result.errors).toContain('post-submit: JSON observe report aggregate unlock change must prove tokenless output');
  });
});
