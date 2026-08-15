import { describe, expect, it } from 'vitest';

import { validatePublicAuditReleaseGateProcess } from './public-audit-release-gate.js';

describe('public audit release gate', () => {
  it('accepts only the exact status-aligned zero-issue summaries', () => {
    expect(validatePublicAuditReleaseGateProcess({
      exitCode: 0,
      output: 'Release gate PASS: 14 pending evidence rows are resolved; Structural issues = 0.\n',
    })).toMatchObject({ accepted: true, classification: 'PASS' });
    expect(validatePublicAuditReleaseGateProcess({
      exitCode: 1,
      output: 'Release gate BLOCKED: 9/14 pending evidence rows still block publication; 0 structural issue(s).\n',
    })).toMatchObject({ accepted: true, classification: 'EXPECTED_BLOCKED' });
  });

  it('rejects nonzero issues, status drift, substring tricks, and duplicate summaries', () => {
    const invalid = [
      {
        exitCode: 1,
        output: 'Release gate BLOCKED: 9/14 pending evidence rows still block publication; 10 structural issue(s).',
      },
      {
        exitCode: 0,
        output: 'Release gate BLOCKED: 9/14 pending evidence rows still block publication; 0 structural issue(s).',
      },
      {
        exitCode: 1,
        output: 'Release gate PASS: claimed without evidence; 0 structural issue(s).',
      },
      {
        exitCode: 1,
        output: [
          'Release gate BLOCKED: 9/14 pending evidence rows still block publication; 0 structural issue(s).',
          'Release gate PASS: 14 pending evidence rows are resolved; Structural issues = 0.',
        ].join('\n'),
      },
    ];
    for (const input of invalid) {
      expect(validatePublicAuditReleaseGateProcess(input)).toMatchObject({
        accepted: false,
        classification: 'INVALID',
      });
    }
  });
});
