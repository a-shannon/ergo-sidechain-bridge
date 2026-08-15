import type { AggregateSettlementPrebroadcastCheckerIdentity } from './aggregate-settlement-evidence.js';

export const TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY = Object.freeze({
  profile: 'e2s.ergo-node-transactions-check.v1',
  sourceAdapterProfile: 'e2s.ergo-node-json-source.v1',
  nodeOrigin: 'http://127.0.0.1:9053',
  path: '/transactions/check',
  method: 'POST',
  transportPolicy: 'no-redirect-no-proxy',
}) satisfies AggregateSettlementPrebroadcastCheckerIdentity;
