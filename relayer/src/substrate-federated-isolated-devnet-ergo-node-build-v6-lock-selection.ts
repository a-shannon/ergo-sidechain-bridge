import { isAbsolute, resolve } from 'node:path';

import {
  inspectSelectedV4OrV5BuildLock,
  type V4OrV5BuildLock,
  type V4OrV5BuildLockSelection,
} from './substrate-federated-isolated-devnet-ergo-node-build-v5-source59-lock.js';
import {
  inspectSelectedV6NodeBuildLock,
  V6_NODE_BUILD_LOCK_RELATIVE_PATH,
  V6_NODE_BUILD_LOCK_SHA256_HEX,
  type V6CurrentNodeBuildLock,
} from './substrate-federated-isolated-devnet-ergo-node-build-v6-lock.js';

export type V6OrLegacyBuildLockSelection = V4OrV5BuildLockSelection | 'v6-current';
export type V6OrLegacyBuildLock = V4OrV5BuildLock | V6CurrentNodeBuildLock;

/** The default keeps the V4 path. A failed explicit V6 selection never falls back. */
export function inspectSelectedV6OrLegacyBuildLock(
  bridgeRoot: string, selection: V6OrLegacyBuildLockSelection = 'v4',
): Readonly<{ lock: Readonly<V6OrLegacyBuildLock>; sha256Hex: string }> {
  if (selection === 'v4' || selection === 'v5-source59') {
    return inspectSelectedV4OrV5BuildLock(bridgeRoot, selection);
  }
  if (selection === 'v6-current') {
    if (typeof bridgeRoot !== 'string' || !isAbsolute(bridgeRoot)) {
      throw new Error('V6 selected node build lock: bridge root must be absolute');
    }
    return inspectSelectedV6NodeBuildLock({
      path: resolve(bridgeRoot, V6_NODE_BUILD_LOCK_RELATIVE_PATH),
      expectedSha256Hex: V6_NODE_BUILD_LOCK_SHA256_HEX,
    });
  }
  throw new Error('V6 selected node build lock: unknown explicit lock selection');
}
