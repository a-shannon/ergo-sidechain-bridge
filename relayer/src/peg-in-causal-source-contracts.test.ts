import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(__dirname, '../..');

function readBridgeFile(relativePath: string): string {
  return readFileSync(resolve(BRIDGE_ROOT, relativePath), 'utf8');
}

describe('peg-in causal source contracts', () => {
  it('moves one exact V2 intent from the refundable source lock to the causal vault', () => {
    const source = readBridgeFile('contracts/MainChainLockCausalV2.es');

    expect(source).toContain('MainChainLockCausalV2');
    expect(source).toContain('sourceIntent.size == 229');
    expect(source).toContain('sourceIntent.slice(0, 1) == Coll(2.toByte)');
    expect(source).toContain('sourceIntent.slice(1, 33) == sourceNetworkId');
    expect(source).toContain('sourceIntent.slice(169, 201) == zero32');
    expect(source).toContain('sourceAmount == SELF.value');
    expect(source).toContain('vaultOut.propositionBytes == causalVaultTree');
    expect(source).toContain('vaultIntent.get == sourceIntent');
    expect(source).toContain('vaultSourceBoxId.get == SELF.id');
    expect(source).toContain('vaultOut.value == SELF.value');
    expect(source).toContain('HEIGHT < SELF.creationInfo._1 + ESCAPE_TIMEOUT');
    expect(source).toContain('sigmaProp(vaultTransition && commitWindowOpen) && committeeOk');
  });

  it('keeps refund authority on the unspent source lock and returns its exact value', () => {
    const source = readBridgeFile('contracts/MainChainLockCausalV2.es');

    expect(source).toContain('HEIGHT >= SELF.creationInfo._1 + ESCAPE_TIMEOUT');
    expect(source).toContain('escapeOutput.propositionBytes == depositorTree');
    expect(source).toContain('escapeOutput.value == SELF.value');
    expect(source).toContain('escapeOutput.tokens.size == 0');
    expect(source).toContain('escapeSourceBoxId.get == SELF.id');
    expect(source).not.toContain('escapeOutput.value >= SELF.value');
  });

  it('spends the causal vault only through authenticated settlement and preserves provenance', () => {
    const source = readBridgeFile('contracts/MainChainCausalVaultV2.es');

    expect(source).toContain('MainChainCausalVaultV2');
    expect(source).toContain('SPVTrackerAuthenticated');
    expect(source).toContain('sourceIntent.size == 229');
    expect(source).toContain('sourceBoxId.size == 32');
    expect(source).toContain('sourceIntent.slice(33, 65) == sidechainId');
    expect(source).toContain('trackerSidechainId == sidechainId');
    expect(source).toContain('SELF.value <= sourceAmount');
    expect(source).toContain('vaultSuccessor.R4[Coll[Byte]].get == sourceIntent');
    expect(source).toContain('vaultSuccessor.R5[Coll[Byte]].get == sourceBoxId');
    expect(source).toContain('notSpent &&');
    expect(source).toContain('dupUpdated &&');
    expect(source).toContain('eventRootOk &&');
    expect(source).not.toContain('ESCAPE_TIMEOUT');
    expect(source).not.toContain('depositorTree');
  });

  it('uses a distinct replay singleton bound to the causal vault hash', () => {
    const source = readBridgeFile('contracts/DoubleUnlockPreventionCausalV2.es');

    expect(source).toContain('DoubleUnlockPreventionCausalV2');
    expect(source).toContain('CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER');
    expect(source).toContain('blake2b256(INPUTS(1).propositionBytes) == unlockErgoTreeHash');
    expect(source).toContain('SELF.id == INPUTS(0).id');
    expect(source).toContain('notSpent &&');
    expect(source).toContain('treeAdvances &&');
  });

  it('compiles the three candidates from one same-run vault identity in check-only mode', () => {
    const compiler = readBridgeFile('relayer/src/scripts/compile-contracts.ts');

    expect(compiler).toContain("'MainChainLockCausalV2.es'");
    expect(compiler).toContain("'MainChainCausalVaultV2.es'");
    expect(compiler).toContain("'DoubleUnlockPreventionCausalV2.es'");
    expect(compiler).toContain('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER');
    expect(compiler).toContain('CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER');
    expect(compiler).toContain('CHECK_ONLY_CAUSAL_SOURCE_NETWORK_ID');
    expect(compiler).toContain('compiledThisRun.MainChainCausalVaultV2?.ergoTreeHex');
    expect(compiler).toContain('non-deployed candidate and is check-only');
    expect(compiler).not.toContain('CAUSAL_VAULT_ERGOTREE_HASH?.trim()');
    expect(compiler).not.toContain('CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX?.trim()');
  });
});
