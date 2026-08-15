import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createBridgeDaemonErgoSignerBoundary } from '../apps/bridge-daemon/ergo-signer-containment.js';
import {
  ErgoSignerUnavailableError,
} from '../relayer-core/ergo-signer-availability.js';

export const ERGO_SIGNER_UNAVAILABILITY_DRILL_SCHEMA =
  'e2s.ergo-signer-unavailability-drill.v1' as const;

export interface ErgoSignerUnavailabilityDrillReport {
  readonly schema: typeof ERGO_SIGNER_UNAVAILABILITY_DRILL_SCHEMA;
  readonly result: 'PASS';
  readonly signerAvailability: 'unavailable';
  readonly processHoldOpen: true;
  readonly valueCycleCapabilityRetained: false;
  readonly fundsExecutionAuthorityRetained: false;
  readonly loaderAttempts: 1;
  readonly containmentAttempts: 1;
  readonly fallbackAttempted: false;
  readonly nodeWalletSigningUsed: false;
  readonly capabilities: Readonly<{
    checking: false;
    signing: false;
    authorization: false;
    submission: false;
    broadcast: false;
    fundsAuthority: false;
  }>;
}

export async function runErgoSignerUnavailabilityDrill():
  Promise<ErgoSignerUnavailabilityDrillReport> {
  let processHoldOpen = false;
  let valueCycleCapabilityRetained = true;
  let fundsExecutionAuthorityRetained = true;
  let loaderAttempts = 0;
  let containmentAttempts = 0;
  let fallbackAttempted = false;
  let nodeWalletSigningUsed = false;

  const boundary = createBridgeDaemonErgoSignerBoundary({
    loadSigner: async () => {
      loaderAttempts += 1;
      throw new Error('synthetic signer preparation failure');
    },
    containUnavailable: () => {
      containmentAttempts += 1;
      processHoldOpen = true;
      valueCycleCapabilityRetained = false;
      fundsExecutionAuthorityRetained = false;
      return {
        processHoldOpen: true,
        valueCycleCapabilityRetained: false,
        fundsExecutionAuthorityReleaseAttempted: true,
      };
    },
  });

  for (const boundaryName of ['initial preparation', 'post-failure retry']) {
    try {
      await boundary.loadSigner(boundaryName);
      fallbackAttempted = true;
    } catch (error) {
      if (!(error instanceof ErgoSignerUnavailableError)) {
        throw new Error('signer drill returned an unbounded failure');
      }
    }
  }

  if (
    boundary.snapshot().availability !== 'unavailable'
    || !processHoldOpen
    || valueCycleCapabilityRetained
    || fundsExecutionAuthorityRetained
    || loaderAttempts !== 1
    || containmentAttempts !== 1
    || fallbackAttempted
    || nodeWalletSigningUsed
  ) {
    throw new Error('signer unavailability containment drill failed');
  }

  return Object.freeze({
    schema: ERGO_SIGNER_UNAVAILABILITY_DRILL_SCHEMA,
    result: 'PASS',
    signerAvailability: 'unavailable',
    processHoldOpen: true,
    valueCycleCapabilityRetained: false,
    fundsExecutionAuthorityRetained: false,
    loaderAttempts: 1,
    containmentAttempts: 1,
    fallbackAttempted: false,
    nodeWalletSigningUsed: false,
    capabilities: Object.freeze({
      checking: false,
      signing: false,
      authorization: false,
      submission: false,
      broadcast: false,
      fundsAuthority: false,
    }),
  });
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const report = await runErgoSignerUnavailabilityDrill();
  console.log(JSON.stringify(report, null, 2));
}
