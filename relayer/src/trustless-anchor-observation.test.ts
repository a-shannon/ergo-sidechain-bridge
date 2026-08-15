import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import type { ErgoExtensionField } from './ergo-client.js';
import {
  formatTrustlessAnchorObservationReportMarkdown,
  observeTrustlessAnchor,
  parseTrustlessAnchorObservationJson,
} from './trustless-anchor-observation.js';

const bridgeEventRootHex = 'ab'.repeat(32);
const otherRootHex = 'cd'.repeat(32);

function extensionField(
  height: number,
  overrides: Partial<ErgoExtensionField> = {},
): ErgoExtensionField {
  return {
    key: '0401',
    value: bridgeEventRootHex,
    height,
    headerId: '11'.repeat(32),
    ...overrides,
  };
}

describe('trustless anchor observation', () => {
  it('links the first matching 0x0401 anchor and stops before later matches', async () => {
    const calls: number[] = [];

    const report = await observeTrustlessAnchor({
      bridgeEventRootHex: bridgeEventRootHex.toUpperCase(),
      minHeight: 100,
      maxHeight: 103,
      observedAt: '2026-07-01T12:00:00.000Z',
      sourceLabel: 'provided public extension observation JSON',
      network: 'testnet',
      getSidechainExtensionFieldsAtHeight: async (height) => {
        calls.push(height);
        if (height === 100) return [extensionField(height, { value: otherRootHex })];
        if (height === 101) return [extensionField(height, { headerId: '22'.repeat(32) })];
        if (height === 102) return [extensionField(height, { headerId: '33'.repeat(32) })];
        return [];
      },
    });

    expect(report.status).toBe('LINKED');
    expect(report.bridgeEventRootHex).toBe(bridgeEventRootHex);
    expect(report.linkedAnchor).toMatchObject({
      key: '0401',
      bridgeEventRootHex,
      ergoAnchorHeight: 101,
      headerId: '22'.repeat(32),
    });
    expect(report.heightsScanned).toBe(2);
    expect(calls).toEqual([100, 101]);
  });

  it('blocks when readable extension observations do not contain the expected root', async () => {
    const report = await observeTrustlessAnchor({
      bridgeEventRootHex,
      minHeight: 200,
      maxHeight: 201,
      observedAt: '2026-07-01T12:00:00.000Z',
      sourceLabel: 'provided public extension observation JSON',
      getSidechainExtensionFieldsAtHeight: async (height) => [
        extensionField(height, { value: otherRootHex }),
        extensionField(height, { key: '0402', value: bridgeEventRootHex }),
      ],
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.reason).toMatch(/no matching 0x0401 bridgeEventRoot/i);
    expect(report.extensionReadsSucceeded).toBe(2);
    expect(report.extensionReadsFailed).toBe(0);
    expect(report.linkedAnchor).toBeUndefined();
  });

  it('reports unavailable when every extension observation read fails', async () => {
    const report = await observeTrustlessAnchor({
      bridgeEventRootHex,
      minHeight: 300,
      maxHeight: 302,
      observedAt: '2026-07-01T12:00:00.000Z',
      sourceLabel: 'read-only node extension query',
      getSidechainExtensionFieldsAtHeight: async () => {
        throw new Error('node unavailable');
      },
    });

    expect(report.status).toBe('UNAVAILABLE');
    expect(report.reason).toMatch(/extension observations could not be read/i);
    expect(report.heightsScanned).toBe(3);
    expect(report.extensionReadsSucceeded).toBe(0);
    expect(report.extensionReadsFailed).toBe(3);
    expect(report.readFailures).toHaveLength(3);
  });

  it('rejects unsafe scan bounds before reading the provider', async () => {
    let providerCalled = false;

    await expect(observeTrustlessAnchor({
      bridgeEventRootHex,
      minHeight: 500,
      maxHeight: 499,
      observedAt: '2026-07-01T12:00:00.000Z',
      sourceLabel: 'provided public extension observation JSON',
      getSidechainExtensionFieldsAtHeight: async () => {
        providerCalled = true;
        return [];
      },
    })).rejects.toThrow(/minHeight must be less than or equal to maxHeight/);

    expect(providerCalled).toBe(false);
  });

  it('formats a prerequisite report with explicit no-deployment-state and no-broadcast boundaries', async () => {
    const report = await observeTrustlessAnchor({
      bridgeEventRootHex,
      minHeight: 100,
      maxHeight: 100,
      observedAt: '2026-07-01T12:00:00.000Z',
      sourceLabel: 'provided public extension observation JSON',
      getSidechainExtensionFieldsAtHeight: async (height) => [extensionField(height)],
    });

    const markdown = formatTrustlessAnchorObservationReportMarkdown(report);

    expect(markdown).toContain('# Gate 5 Trustless Anchor Observation Report');
    expect(markdown).toContain('| Result | LINKED |');
    expect(markdown).toContain('| Deployment state opened | no |');
    expect(markdown).toContain('| Runtime database opened | no |');
    expect(markdown).toContain('| Secret or environment file read | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
    expect(markdown).toContain('| Gate 5 closure allowed | no |');
    expect(markdown).toContain('| Production-ready claim allowed | no |');
  });

  it('builds an observation provider from sanitized extension observation JSON', async () => {
    const parsed = parseTrustlessAnchorObservationJson({
      network: 'testnet',
      nodeUrl: 'https://ergo-node.invalid',
      heights: [{
        height: 123,
        fields: [{
          key: '0401',
          value: bridgeEventRootHex,
          headerId: '44'.repeat(32),
        }],
      }],
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.provider?.network).toBe('testnet');
    expect(parsed.provider?.nodeUrl).toBe('https://ergo-node.invalid');
    await expect(parsed.provider?.getSidechainExtensionFieldsAtHeight(123)).resolves.toEqual([
      extensionField(123, { headerId: '44'.repeat(32) }),
    ]);
    await expect(parsed.provider?.getSidechainExtensionFieldsAtHeight(124)).resolves.toEqual([]);
  });

  it('writes a structured anchor observation JSON report for Gate 5 binding', () => {
    const outputDir = mkdtempSync(join(process.cwd(), '.tmp-trustless-anchor-observe-'));
    const observationsTarget = `${basename(outputDir)}/observations.json`;
    const reportTarget = `${basename(outputDir)}/anchor-report.json`;

    try {
      writeFileSync(
        join(process.cwd(), observationsTarget),
        `${JSON.stringify({
          network: 'testnet',
          nodeUrl: 'https://ergo-node.invalid',
          heights: [{
            height: 123,
            fields: [{
              key: '0401',
              value: bridgeEventRootHex,
              headerId: '44'.repeat(32),
            }],
          }],
        }, null, 2)}\n`,
      );

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-anchor-observe.ts',
          '--bridge-event-root',
          bridgeEventRootHex,
          '--observations-json',
          observationsTarget,
          '--min-height',
          '123',
          '--max-height',
          '123',
          '--observed-at',
          '2026-07-01T12:00:00.000Z',
          '--json-out',
          reportTarget,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('- trustless anchor observation JSON report written:');

      const report = JSON.parse(readFileSync(join(process.cwd(), reportTarget), 'utf8'));
      expect(report).toMatchObject({
        schemaVersion: 1,
        command: 'trustless:anchor-observe',
        status: 'LINKED',
        bridgeEventRootHex,
        extensionKey: '0401',
        linkedAnchor: {
          key: '0401',
          bridgeEventRootHex,
          ergoAnchorHeight: 123,
          headerId: '44'.repeat(32),
        },
        boundary: {
          readOnly: true,
          publicObservationInputOnly: true,
          deploymentStateOpened: false,
          runtimeDatabaseOpened: false,
          secretOrEnvironmentFileRead: false,
          signingOrWalletMaterialRead: false,
          transactionBroadcastOrMutation: false,
          gate5Closure: false,
          settlementReadiness: false,
          productionClaimSupport: false,
          testnetProductionCandidateClaimSupport: false,
        },
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
