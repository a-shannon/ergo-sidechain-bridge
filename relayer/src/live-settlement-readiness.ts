import type { PreflightCheck } from './batch-demo-preflight.js';
import { PROTOCOL_PARAMS } from './config.js';

export interface LiveSettlementStartupConfig {
  aggregateSettlementEnabled: boolean;
  aggregateBatchEnabled: boolean;
  aggregateBatchMaxClaims: number;
}

export function classifyLiveSettlementStartupReadiness(
  config: LiveSettlementStartupConfig,
  _threshold?: number,
): PreflightCheck {
  if (!config.aggregateSettlementEnabled) {
    return {
      name: 'Live settlement startup gate',
      status: 'WARN',
      message:
        'Aggregate settlement disabled; no automated daemon peg-out settlement path is active. ' +
        'New legacy MCU creation and daemon spend remain fail-closed, but immutable v1 UTXOs ' +
        'remain externally spendable until inventory and cutover are complete.',
    };
  }

  return {
    name: 'Live settlement startup gate',
    status: 'WARN',
    message:
      'Aggregate settlement compatibility is enabled for historical confirmation and recovery only. ' +
      'New legacy V1 candidate admission, signing, authorization, submission, and broadcast are absent; ' +
      'new burns remain held until a reviewed replacement profile is activated.',
  };
}

export function assertLiveSettlementStartupReadiness(
  config: LiveSettlementStartupConfig = PROTOCOL_PARAMS,
  threshold?: number,
): PreflightCheck {
  const check = classifyLiveSettlementStartupReadiness(config, threshold);
  if (check.status === 'FAIL') {
    throw new Error(`${check.name}: ${check.message}`);
  }
  return check;
}
