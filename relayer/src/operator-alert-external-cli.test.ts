import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseOperatorAlertAcknowledgementArgs,
} from './scripts/operator-alert-acknowledge.js';
import {
  parseOperatorAlertExternalWorkerArgs,
} from './scripts/operator-alert-external-worker.js';

describe('external operator alert CLIs', () => {
  it('requires exact one-shot worker inputs and bounded values', () => {
    expect(parseOperatorAlertExternalWorkerArgs([
      '--outbox',
      'alerts.sqlite',
      '--endpoint',
      'https://alerts.example.test/bridge',
      '--timeout-ms',
      '5000',
      '--max-response-bytes',
      '1024',
    ])).toMatchObject({
      outbox: 'alerts.sqlite',
      endpoint: 'https://alerts.example.test/bridge',
      timeoutMs: 5000,
      maxResponseBytes: 1024,
      errors: [],
    });
    expect(parseOperatorAlertExternalWorkerArgs([
      '--timeout-ms',
      '0',
      '--max-response-bytes',
      '65537',
    ]).errors).toEqual(expect.arrayContaining([
      '--outbox is required',
      '--endpoint is required',
      '--timeout-ms must be a positive integer',
      '--max-response-bytes exceeds its maximum of 65536',
    ]));
  });

  it('requires the outbox, signed acknowledgement, and reviewed registry', () => {
    expect(parseOperatorAlertAcknowledgementArgs([
      '--outbox',
      'alerts.sqlite',
      '--acknowledgement',
      'ack.json',
      '--key-registry',
      'keys.json',
    ])).toMatchObject({
      outbox: 'alerts.sqlite',
      acknowledgement: 'ack.json',
      keyRegistry: 'keys.json',
      errors: [],
    });
    expect(parseOperatorAlertAcknowledgementArgs([]).errors).toEqual([
      '--outbox is required',
      '--acknowledgement is required',
      '--key-registry is required',
    ]);
  });

  it('keeps secrets and external delivery out of daemon composition', () => {
    const daemon = readFileSync(join(process.cwd(), 'src/relayer-daemon.ts'), 'utf8');
    const worker = readFileSync(
      join(process.cwd(), 'src/scripts/operator-alert-external-worker.ts'),
      'utf8',
    );
    expect(daemon).not.toContain('OPERATOR_ALERT_WEBHOOK_AUTHORIZATION');
    expect(daemon).not.toContain('operator-alert-external-delivery.js');
    expect(worker).not.toContain("'dotenv/config'");
    expect(worker).not.toContain('authorizationHeader)');
    expect(worker).toContain(
      'OPERATOR_ALERT_WEBHOOK_AUTHORIZATION_ENDPOINT_DIGEST',
    );
  });

  it('registers only explicit operator commands', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['operator:alerts:worker']).toBe(
      'tsx src/scripts/operator-alert-external-worker.ts',
    );
    expect(packageJson.scripts['operator:alerts:acknowledge']).toBe(
      'tsx src/scripts/operator-alert-acknowledge.ts',
    );
  });
});
