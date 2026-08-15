import { describe, it, expect } from 'vitest';
import { formatSafetyReport, type FileStatus } from './devnet-session-safety.js';

describe('formatSafetyReport', () => {
  const TS = '2026-05-09T16-00-00';
  const BRIDGE = 'C:\\projects\\ergo-sidechain-bridge';

  it('includes backup and restore instructions with Copy-Item', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: false, size: 1234 },
      { label: 'relayer/bridge-state.sqlite', exists: true, dirty: true, size: 5678 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).toContain('backup');
    expect(report).toContain('Restore');
    expect(report).toContain('.bak');
    expect(report).toContain('Copy-Item -LiteralPath');
    expect(report).toContain('WARN');
  });

  it('creates .devnet-backups directory', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: false, size: 100 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).toContain('New-Item -ItemType Directory -Force ".devnet-backups"');
  });

  it('includes bridge root path in instructions', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: false, size: 100 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).toContain(BRIDGE);
  });

  it('does NOT contain destructive git checkout or git restore as default', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: true, size: 100 },
      { label: 'relayer/bridge-state.sqlite', exists: true, dirty: true, size: 200 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).not.toContain('git checkout --');
    expect(report).not.toMatch(/^\s+git restore contracts/m);
    // The "git restore" mention should only appear as a commented-out last-resort note
    expect(report).toContain('# git restore');
  });

  it('handles missing sqlite gracefully', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: false, size: 500 },
      { label: 'relayer/bridge-state.sqlite', exists: false, dirty: false, size: null },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).toContain('does not exist');
    expect(report).toContain('no backup needed');
    expect(report).toContain('OK');
  });

  it('reports clean state when nothing is dirty', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: false, size: 100 },
      { label: 'relayer/bridge-state.sqlite', exists: true, dirty: false, size: 200 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).toContain('OK');
    expect(report).not.toContain('WARN');
  });

  it('warns when files are dirty', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: true, size: 100 },
      { label: 'relayer/bridge-state.sqlite', exists: true, dirty: true, size: 200 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    expect(report).toContain('WARN');
    expect(report).toContain('DIRTY');
  });

  it('generates clean backup filenames', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: false, size: 100 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    // Should produce: deployed_state.2026-05-09T16-00-00.json.bak
    expect(report).toContain('deployed_state.2026-05-09T16-00-00.json.bak');
    expect(report).toContain('.devnet-backups\\deployed_state');
  });

  it('output is ASCII-only', () => {
    const statuses: FileStatus[] = [
      { label: 'contracts/deployed_state.json', exists: true, dirty: true, size: 100 },
    ];
    const report = formatSafetyReport(statuses, BRIDGE, TS);
    // eslint-disable-next-line no-control-regex
    const nonAscii = /[^\x00-\x7F]/;
    expect(nonAscii.test(report)).toBe(false);
  });
});
