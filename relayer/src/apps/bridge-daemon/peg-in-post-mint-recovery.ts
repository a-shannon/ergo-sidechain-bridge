import {
  createPegInPostMintRecoveryPorts,
  type PegInPostMintRecoveryApplicationInput,
} from '../../adapters/peg-in-post-mint-recovery.js';
import {
  recoverPegInPostMintLifecycle,
  type PegInPostMintRecoveryResult,
} from '../../relayer-core/peg-in-post-mint-recovery.js';

export {
  PegInPostMintIncidentPersistenceError,
} from '../../adapters/peg-in-post-mint-recovery.js';

export interface PegInPostMintRecoveryApplicationDeps {
  readonly assertRecoveryReportProvenance: (value: unknown) => void;
}

export function runPegInPostMintRecovery(
  sourceBoxIdHex: PegInPostMintRecoveryApplicationInput['sourceBoxIdHex'],
  recovery: PegInPostMintRecoveryApplicationInput['recovery'],
  state: PegInPostMintRecoveryApplicationInput['state'],
  deps: PegInPostMintRecoveryApplicationDeps,
): PegInPostMintRecoveryResult {
  deps.assertRecoveryReportProvenance(recovery);
  return recoverPegInPostMintLifecycle(
    createPegInPostMintRecoveryPorts({ sourceBoxIdHex, recovery, state }),
  );
}
