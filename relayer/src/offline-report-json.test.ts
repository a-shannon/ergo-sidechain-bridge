import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from './offline-report-json.js';

describe('offline report JSON writer', () => {
  it('writes structured reports without overwriting existing artifacts', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-report-json-'));
    try {
      const target = `${basename(dir)}/report.json`;
      const first = writeOfflineReportJson(target, {
        schemaVersion: 1,
        status: 'PASS',
        errors: [],
        lines: ['PASS'],
      });
      const second = writeOfflineReportJson(target, {
        schemaVersion: 1,
        status: 'BLOCKED',
      });

      expect(first.errors).toEqual([]);
      expect(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))).toMatchObject({
        schemaVersion: 1,
        status: 'PASS',
        errors: [],
      });
      expect(second.errors).toEqual(['offline report JSON output already exists; refusing to overwrite']);
      expect(second.errors.join('\n')).not.toContain(process.cwd());
      expect(second.errors.join('\n')).not.toContain(target);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks sensitive report paths before writing', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-offline-report-json-'));
    try {
      mkdirSync(join(dir, 'nested'), { recursive: true });
      const target = `${basename(dir)}/nested/.env.report.json`;
      const report = writeOfflineReportJson(target, { status: 'PASS' });

      expect(report.errors).toContain(
        '--json-out <blocked output target> must not target runtime or secret-bearing material',
      );
      expect(existsSync(join(dir, 'nested', '.env.report.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('formats report write lines without echoing unsafe local targets', () => {
    expect(formatOfflineReportJsonWriteLine('proof-vector report', '.tmp-report\\report.json')).toBe(
      '- proof-vector report written: .tmp-report/report.json',
    );
    expect(formatOfflineReportJsonWriteLine('proof-vector report', '../operator/private-key-report.json')).toBe(
      '- proof-vector report written: <blocked output target>',
    );
    expect(formatOfflineReportJsonWriteLine('proof-vector report', 'https://example.invalid/report.json')).toBe(
      '- proof-vector report written: <blocked output target>',
    );
  });
});
