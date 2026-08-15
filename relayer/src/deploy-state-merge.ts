/**
 * Merge Ergo-side deployment fields into an existing deployed_state.json,
 * preserving non-Ergo sections (e.g. `solidity`, sidechain metadata).
 *
 * RATIONALE: deploy.ts only deploys the retained non-aggregate Ergo-side contracts.
 * Historical aggregate fields are preserved but cannot be created or refreshed by it.
 * The sidechain (Frontier EVM) is deployed separately and stores its addresses
 * in `solidity`. If deploy.ts overwrites the entire file, the solidity section
 * is lost, forcing a sidechain redeploy — which changes the burn context and
 * invalidates the anchor root, creating an infinite redeploy loop.
 */

import { readFileSync, existsSync } from 'fs';

/** Fields that deploy.ts is allowed to overwrite */
const ERGO_DEPLOY_FIELDS = [
  'network',
  'deployedAt',
  'sideChainState',
  'doubleUnlockPrevention',
  'doubleUnlockPreventionAggregate',
  'spvTracker',
  'mainChainLock',
  'mainChainUnlock',
  'mainChainAggregateUnlock',
  'relayer',
  'committee',
] as const;

/**
 * Merge new Ergo deployment fields into an existing state object.
 * Any fields not in ERGO_DEPLOY_FIELDS are preserved from `existing`.
 */
export function mergeDeployedState(
  existing: Record<string, any>,
  ergoFields: Record<string, any>,
): Record<string, any> {
  // Start with existing state (preserves solidity and historical aggregate fields).
  const merged = { ...existing };

  // Overwrite only Ergo-side fields
  for (const key of ERGO_DEPLOY_FIELDS) {
    if (key in ergoFields) {
      merged[key] = ergoFields[key];
    }
  }

  return merged;
}

/**
 * Load existing deployed_state.json if it exists, or return empty object.
 */
export function loadExistingStateFile(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}
