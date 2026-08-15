/**
 * Pure helpers for patched-devnet environment variable resolution.
 *
 * These are extracted so they can be unit-tested without touching the filesystem
 * or network. The readiness script uses these to classify env state.
 */

export const DEFAULT_PATCHED_NODE_URL = 'http://127.0.0.1:9051';

export interface EnvBag {
  PATCHED_ERGO_NODE_URL?: string;
  ERGO_NODE_URL?: string;
  ERGO_NODE?: string;
}

/**
 * Resolve the target patched node URL with precedence:
 *   1. PATCHED_ERGO_NODE_URL
 *   2. ERGO_NODE_URL
 *   3. ERGO_NODE
 *   4. default http://127.0.0.1:9051
 */
export function resolvePatchedNodeUrl(env: EnvBag): string {
  return (
    env.PATCHED_ERGO_NODE_URL ||
    env.ERGO_NODE_URL ||
    env.ERGO_NODE ||
    DEFAULT_PATCHED_NODE_URL
  );
}

export type EnvStatus = 'PASS' | 'WARN';

export interface EnvClassification {
  status: EnvStatus;
  message: string;
}

/**
 * Classify whether the two Ergo node env vars are correctly aligned
 * with the resolved patched node target URL.
 *
 * PASS: both ERGO_NODE and ERGO_NODE_URL are set and equal to targetUrl.
 * WARN: any mismatch, partial set, or unset.
 */
export function classifyErgoNodeEnv(env: EnvBag, targetUrl: string): EnvClassification {
  const ergoNode = env.ERGO_NODE;
  const ergoNodeUrl = env.ERGO_NODE_URL;
  const bothSet = !!ergoNode && !!ergoNodeUrl;
  const neitherSet = !ergoNode && !ergoNodeUrl;

  if (neitherSet) {
    return {
      status: 'WARN',
      message: `neither ERGO_NODE nor ERGO_NODE_URL set - deploy scripts use ERGO_NODE, daemon/ErgoClient uses ERGO_NODE_URL; set BOTH to ${targetUrl} for devnet`,
    };
  }

  if (!bothSet) {
    const which = ergoNode ? `ERGO_NODE=${ergoNode}` : `ERGO_NODE_URL=${ergoNodeUrl}`;
    const missing = ergoNode ? 'ERGO_NODE_URL' : 'ERGO_NODE';
    return {
      status: 'WARN',
      message: `only ${which} set - also set ${missing}=${targetUrl} so both code paths target the patched devnet`,
    };
  }

  // Both are set
  if (ergoNode !== ergoNodeUrl) {
    return {
      status: 'WARN',
      message: `ERGO_NODE=${ergoNode} != ERGO_NODE_URL=${ergoNodeUrl} - they must match or deploy scripts and daemon will talk to different nodes`,
    };
  }

  if (ergoNode !== targetUrl) {
    return {
      status: 'WARN',
      message: `both set to ${ergoNode}, but target patched node is ${targetUrl} - update both to match`,
    };
  }

  return {
    status: 'PASS',
    message: `both ERGO_NODE and ERGO_NODE_URL set to ${targetUrl}`,
  };
}
