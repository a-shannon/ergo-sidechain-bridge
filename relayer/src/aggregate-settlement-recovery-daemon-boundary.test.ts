import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { getAggregateSettlementRecoverySourceIdentityConfig } from './config.js';

const daemon = readFileSync(join(process.cwd(), 'src', 'relayer-daemon.ts'), 'utf8');
const config = readFileSync(join(process.cwd(), 'src', 'config.ts'), 'utf8');

describe('aggregate settlement recovery daemon boundary', () => {
  it('uses dedicated direct read-only clients for stable primary and witness observations', () => {
    expect(daemon).toMatch(
      /this\.aggregateSettlementRecoveryErgo = new ErgoClient\(\s*ERGO_CONFIG\.nodeUrl,\s*\{ readOnly: true, direct: true \},\s*\)/,
    );
    expect(daemon).toMatch(
      /const witnessErgo = new ErgoClient\(\s*aggregateSettlementWitnessNodeUrl,\s*\{ readOnly: true, direct: true \},\s*\)/,
    );
    expect(daemon).toContain('createAggregateSettlementErgoWitness({');
    expect(daemon).toContain('primaryErgo: this.aggregateSettlementRecoveryErgo');
    expect(daemon).toContain('witnessNodeUrl: aggregateSettlementWitnessNodeUrl');
    expect(config).toContain('ERGO_AGGREGATE_SETTLEMENT_WITNESS_NODE_URL');
    expect(config).toContain('ERGO_AGGREGATE_SETTLEMENT_PRIMARY_IDENTITY_DIGEST');
    expect(config).toContain('ERGO_AGGREGATE_SETTLEMENT_PRIMARY_ADMINISTRATION_DIGEST');
    expect(config).toContain('ERGO_AGGREGATE_SETTLEMENT_WITNESS_IDENTITY_DIGEST');
    expect(config).toContain('ERGO_AGGREGATE_SETTLEMENT_WITNESS_ADMINISTRATION_DIGEST');
    expect(daemon).toContain('getAggregateSettlementRecoverySourceIdentityConfig()');
    expect(daemon).toContain('primaryNodeIdentityDigestHex: sourceIdentity.primaryNodeIdentityDigestHex');
    expect(daemon).toContain('witnessNodeIdentityDigestHex: sourceIdentity.witnessNodeIdentityDigestHex');
  });

  it('uses the same bound primary client for confirmation and recovery', () => {
    expect(daemon).toMatch(
      /const settlementService = new AggregateSettlementService\(\{\s*ergo: this\.aggregateSettlementRecoveryErgo,/,
    );
    expect(daemon).toMatch(
      /recoverAggregateSettlementAttempts\(\{\s*ergo: this\.aggregateSettlementRecoveryErgo,\s*witness: this\.aggregateSettlementRecoveryWitness,/,
    );
  });

  it('fails closed when a configured witness lacks pinned source identities', () => {
    expect(() => getAggregateSettlementRecoverySourceIdentityConfig({
      witnessNodeUrl: 'http://witness.example:9052',
    })).toThrow(/PRIMARY_IDENTITY_DIGEST.*PRIMARY_ADMINISTRATION_DIGEST.*WITNESS_IDENTITY_DIGEST.*WITNESS_ADMINISTRATION_DIGEST/);

    expect(getAggregateSettlementRecoverySourceIdentityConfig({
      witnessNodeUrl: undefined,
    })).toBeNull();

    expect(getAggregateSettlementRecoverySourceIdentityConfig({
      witnessNodeUrl: 'http://witness.example:9052',
      primaryNodeIdentityDigestHex: '11'.repeat(32),
      primaryAdministrationIdentityDigestHex: '22'.repeat(32),
      witnessNodeIdentityDigestHex: '33'.repeat(32),
      witnessAdministrationIdentityDigestHex: '44'.repeat(32),
    })).toEqual({
      primaryNodeIdentityDigestHex: '11'.repeat(32),
      primaryAdministrationIdentityDigestHex: '22'.repeat(32),
      witnessNodeIdentityDigestHex: '33'.repeat(32),
      witnessAdministrationIdentityDigestHex: '44'.repeat(32),
    });
  });
});
