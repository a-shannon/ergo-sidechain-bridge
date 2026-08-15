import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildAggregateSettlementPrebroadcastEvidenceRecord } from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';
import {
  buildTestnetPrebroadcastDryRunFieldSummary,
  validatePrebroadcastAggregateJsonLinkTarget,
} from './testnet-prebroadcast-from-aggregate-json.js';

function aggregateEvidenceRecord(command = 'check-with-ingest'): Record<string, any> {
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T10:30:00.000Z',
    command,
    label: 'Aggregate same-TX ingest settlement',
    expectedTxId: '11'.repeat(32),
    transactionCheckResponse: '',
    checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
    settlementShape: {
      inputCount: 3,
      outputCount: 4,
      contextExtensionKeyCounts: [0, 4, 2],
      contextExtensionKeyCountsCsv: '0,4,2',
    },
    claims: [{
      burnTxHash: '22'.repeat(32),
      sidechainBlockHeight: 200,
      sidechainHeaderHashHex: '33'.repeat(32),
      bridgeEventRootHex: '44'.repeat(32),
      ergoAnchorHeight: 100,
    }],
  });
}

describe('testnet prebroadcast dry-run field summary from aggregate JSON', () => {
  it('builds dry-run Markdown rows from valid aggregate prebroadcast JSON', () => {
    const summary = buildTestnetPrebroadcastDryRunFieldSummary({
      record: aggregateEvidenceRecord(),
      aggregateJsonLinkTarget: 'aggregate-check.json',
      pegInEventIdOrTxId: `${'55'.repeat(32)} artifact://prebroadcast/peg-in-event.log`,
    });

    expect(summary.fields['Peg-in event ID or TX ID']).toBe(
      `${'55'.repeat(32)} artifact://prebroadcast/peg-in-event.log`,
    );
    expect(summary.fields['Peg-out burn TX ID']).toBe(`${'22'.repeat(32)} [aggregate JSON](aggregate-check.json)`);
    expect(summary.fields['Sidechain block height']).toBe('200');
    expect(summary.fields['Sidechain block hash']).toBe(`${'33'.repeat(32)} [aggregate JSON](aggregate-check.json)`);
    expect(summary.fields['Bridge event root']).toBe(`${'44'.repeat(32)} [aggregate JSON](aggregate-check.json)`);
    expect(summary.fields['Ergo anchor height']).toBe('100 [aggregate JSON](aggregate-check.json)');
    expect(summary.fields['Aggregate claim count']).toBe('1');
    expect(summary.fields['Input count']).toBe('3');
    expect(summary.fields['Output count']).toBe('4');
    expect(summary.fields['ContextExtension key counts per input']).toBe('0,4,2');
    expect(summary.fields['`/transactions/check` result']).toBe('PASS [aggregate JSON](aggregate-check.json)');
    expect(summary.fields['Expected transaction ID']).toBe(`${'11'.repeat(32)} [aggregate JSON](aggregate-check.json)`);
    expect(summary.lines).toContain('- Aggregate claim count: 1');

    const paddedSummary = buildTestnetPrebroadcastDryRunFieldSummary({
      record: aggregateEvidenceRecord(),
      aggregateJsonLinkTarget: '  aggregate-check.json  ',
    });
    expect(paddedSummary.fields['Peg-out burn TX ID']).toBe(
      `${'22'.repeat(32)} [aggregate JSON](aggregate-check.json)`,
    );
  });

  it('keeps explicit placeholders for tracker fields omitted by check evidence', () => {
    const record = buildAggregateSettlementPrebroadcastEvidenceRecord({
      generatedAt: '2026-05-17T10:30:00.000Z',
      command: 'check',
      label: 'Aggregate settlement V1',
      expectedTxId: '11'.repeat(32),
      transactionCheckResponse: '',
      checkerIdentity: TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
      settlementShape: {
        inputCount: 3,
        outputCount: 4,
        contextExtensionKeyCounts: [0, 4, 2],
        contextExtensionKeyCountsCsv: '0,4,2',
      },
      claims: [{
        burnTxHash: '22'.repeat(32),
        sidechainBlockHeight: 200,
      }],
    });

    const summary = buildTestnetPrebroadcastDryRunFieldSummary({
      record,
      aggregateJsonLinkTarget: 'aggregate-check.json',
    });

    expect(summary.fields['Sidechain block hash']).toBe('<32-byte sidechain block hash> plus completed artifact target');
    expect(summary.fields['Bridge event root']).toBe('<32-byte bridge event root> plus completed artifact target');
    expect(summary.fields['Ergo anchor height']).toBe('<ergo anchor height> plus completed artifact target');
  });

  it('rejects invalid aggregate JSON before producing dry-run rows', () => {
    const record = aggregateEvidenceRecord();
    record.broadcast = 'yes';

    expect(() => buildTestnetPrebroadcastDryRunFieldSummary({
      record,
      aggregateJsonLinkTarget: 'aggregate-check.json',
    })).toThrow(/broadcast must be no/);
  });

  it('rejects unsafe aggregate JSON link targets', () => {
    const paddedUriErrors = validatePrebroadcastAggregateJsonLinkTarget(
      '  https://example.invalid/aggregate-check.json?token=secret  ',
    );
    expect(paddedUriErrors).toContain('<blocked evidence JSON target>: refusing to write URI evidence JSON targets');
    expect(paddedUriErrors.join('\n')).not.toContain('token=secret');
    expect(paddedUriErrors.join('\n')).not.toContain('example.invalid');

    for (const target of [
      '../aggregate-check.json',
      'C:/tmp/aggregate-check.json',
      '/tmp/aggregate-check.json',
      'https://example.invalid/aggregate-check.json',
      'artifact://prebroadcast/aggregate-check.json',
      '.env.aggregate-check.json',
      'operator/mnemonic-check.json',
      'runtime/bridge-state.sqlite.json',
    ]) {
      expect(validatePrebroadcastAggregateJsonLinkTarget(target), target).not.toEqual([]);
      expect(() => buildTestnetPrebroadcastDryRunFieldSummary({
        record: aggregateEvidenceRecord(),
        aggregateJsonLinkTarget: target,
      }), target).toThrow();
    }
  });

  it('blocks aggregate JSON inputs that resolve outside the bridge without leaking the target', () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'prebroadcast-from-json-outside-'));
    const outsideEvidenceDir = join(outsideRoot, 'evidence');
    const internalRoot = mkdtempSync('.tmp-prebroadcast-from-json-link-');
    const linkPath = join(internalRoot, 'link-out');
    const target = `${basename(internalRoot)}/link-out/aggregate-check.json`;

    try {
      mkdirSync(outsideEvidenceDir, { recursive: true });
      writeFileSync(
        join(outsideEvidenceDir, 'aggregate-check.json'),
        JSON.stringify(aggregateEvidenceRecord(), null, 2),
        'utf8',
      );
      symlinkSync(outsideEvidenceDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/prebroadcast-from-aggregate-json.ts',
          target,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('<blocked evidence JSON target>: aggregate evidence JSON input BLOCKED');
      expect(result.stderr).not.toContain('link-out');
      expect(result.stderr).not.toContain('aggregate-check.json');
      expect(result.stderr).not.toContain(outsideRoot);
    } finally {
      rmSync(internalRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('reports malformed aggregate JSON input without leaking parser stacks or local paths', () => {
    const tmpDir = mkdtempSync('.tmp-prebroadcast-from-json-');
    const malformedJsonPath = join(tmpDir, 'malformed-aggregate.json');
    const target = malformedJsonPath.replace(/\\/g, '/');

    try {
      writeFileSync(malformedJsonPath, '{', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/prebroadcast-from-aggregate-json.ts',
          target,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`${target}: aggregate evidence JSON input could not be read or parsed.`);
      expect(result.stderr).not.toContain('SyntaxError');
      expect(result.stderr).not.toContain('JSON.parse');
      expect(result.stderr).not.toContain(process.cwd());
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('fails closed when aggregate JSON input is missing', () => {
    const target = '.tmp-prebroadcast-from-json-missing/missing-aggregate.json';

    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/prebroadcast-from-aggregate-json.ts',
        target,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`${target}: aggregate evidence JSON input could not be read in read-only mode.`);
    expect(result.stderr).not.toContain('SyntaxError');
    expect(result.stderr).not.toContain('JSON.parse');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('reports invalid CLI options without leaking parser stacks or local paths', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/prebroadcast-from-aggregate-json.ts',
        'aggregate.json',
        '--bad-option',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unknown option: --bad-option');
    expect(result.stderr).toContain('Usage: npm run prebroadcast:from-json');
    expect(result.stderr).not.toContain('Error:');
    expect(result.stderr).not.toContain('src/scripts/prebroadcast-from-aggregate-json.ts');
    expect(result.stderr).not.toContain(process.cwd());
  });
});
