import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { readLinkedAggregateSettlementEvidenceJsonRecords } from './testnet-prebroadcast-linked-json.js';

function prebroadcastMarkdown(): string {
  return `
## Dry-Run Settlement Shape

- \`/transactions/check\` result: PASS [aggregate JSON](aggregate-check.json)
- Expected transaction ID: ${'4'.repeat(64)} [aggregate JSON](aggregate-check.json)

## Non-Broadcast Attestation
`;
}

describe('linked aggregate settlement evidence JSON reader', () => {
  it('trims the completed Markdown target before resolving linked aggregate JSON', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-prebroadcast-linked-json-'));
    const markdownTarget = `${basename(dir)}/completed.md`;

    try {
      writeFileSync(join(dir, 'completed.md'), prebroadcastMarkdown(), 'utf8');
      writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify({ marker: true }), 'utf8');

      const records = readLinkedAggregateSettlementEvidenceJsonRecords(`  ${markdownTarget}  `, prebroadcastMarkdown());

      expect(records).toEqual([{ target: 'aggregate-check.json', record: { marker: true } }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
