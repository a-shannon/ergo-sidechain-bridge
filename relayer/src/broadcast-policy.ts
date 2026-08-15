import type { PreflightCheck } from './batch-demo-preflight.js';
import { PROTOCOL_PARAMS } from './config.js';

export interface BroadcastPolicyConfig {
  broadcastEnabled: boolean;
}

export function classifyBroadcastReadiness(
  config: BroadcastPolicyConfig = PROTOCOL_PARAMS,
): PreflightCheck {
  if (config.broadcastEnabled) {
    return {
      name: 'Broadcast policy',
      status: 'PASS',
      message: 'Ergo transaction broadcast is explicitly enabled by BRIDGE_BROADCAST_ENABLED=true.',
    };
  }

  return {
    name: 'Broadcast policy',
    status: 'FAIL',
    message:
      'Ergo transaction broadcast is disabled by default. Set BRIDGE_BROADCAST_ENABLED=true only after ' +
      'operator preflights, signing readiness, and target-node checks are complete.',
  };
}

export function assertBroadcastAllowed(
  label: string,
  config: BroadcastPolicyConfig = PROTOCOL_PARAMS,
): PreflightCheck {
  const check = classifyBroadcastReadiness(config);
  if (check.status === 'FAIL') {
    throw new Error(`${check.name}: refusing to broadcast ${label}. ${check.message}`);
  }
  return check;
}

export function assertSidechainBroadcastAllowed(
  label: string,
  config: BroadcastPolicyConfig = PROTOCOL_PARAMS,
): PreflightCheck {
  const check = classifyBroadcastReadiness(config);
  if (check.status === 'FAIL') {
    throw new Error(`${check.name}: refusing to broadcast sidechain ${label}. ${check.message}`);
  }
  return check;
}

export function assertObservationOnlyDaemonBroadcastDisabled(
  config: BroadcastPolicyConfig = PROTOCOL_PARAMS,
): PreflightCheck {
  if (config.broadcastEnabled) {
    throw new Error(
      'Broadcast policy: observation-only daemon startup refused while ' +
      'BRIDGE_BROADCAST_ENABLED=true. Leave it false or unset; this process ' +
      'has no active broadcast route.',
    );
  }
  return {
    name: 'Broadcast policy',
    status: 'PASS',
    message:
      'Observation-only daemon requires BRIDGE_BROADCAST_ENABLED=false or unset; ' +
      'no daemon broadcast route is active.',
  };
}
