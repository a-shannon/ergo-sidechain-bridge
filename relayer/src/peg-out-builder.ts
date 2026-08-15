/**
 * Disabled compatibility surface for the legacy two-phase MCU flow.
 *
 * The v1 design cannot bind beneficiary payout to a canonical sidechain burn:
 * stale SCS height and the Ergo timeout remain spendable by third parties after
 * a burn reorg. Transaction assembly was removed so retained historical scripts
 * cannot create or spend another MCU through this API.
 */
import type { DeployedState } from './config.js';
import type { ErgoClient } from './ergo-client.js';
import { assertLegacyMcuDisabled } from './legacy-peg-out-guard.js';
import type { ParsedPegOut } from './sidechain-client.js';
import type { StateTracker } from './state-tracker.js';

export class PegOutBuilder {
  constructor(
    _ergo: ErgoClient,
    _state: StateTracker,
    _deployed: DeployedState,
  ) {}

  async buildPhase1(_pegOut: ParsedPegOut): Promise<string | null> {
    assertLegacyMcuDisabled('legacy Phase 1 MCU creation');
    return null;
  }

  async buildPhase2(
    _phase1TxId: string,
    _burnHeight: number,
    _stateUpdaterBusy = false,
  ): Promise<string | null> {
    assertLegacyMcuDisabled('legacy Phase 2 MCU spend');
    return null;
  }
}
