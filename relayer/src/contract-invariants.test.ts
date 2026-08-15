import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const srcRoot = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = join(srcRoot, '..', '..');
const contractsRoot = join(bridgeRoot, 'contracts');

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function collectErgoScripts(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return collectErgoScripts(fullPath);
    return entry.endsWith('.es') ? [fullPath] : [];
  });
}

function readContract(name: string): string {
  return readFileSync(join(contractsRoot, name), 'utf8');
}

describe('ErgoScript contract invariants', () => {
  it('does not use exact HEIGHT equality in contract guards', () => {
    const offenders = collectErgoScripts(contractsRoot)
      .flatMap(file => {
        const rel = toPosix(relative(bridgeRoot, file));
        const text = readFileSync(file, 'utf8');
        const lines = text.split(/\r?\n/);
        return lines
          .map((line, index) => ({ line, index: index + 1 }))
          .filter(({ line }) => /\bHEIGHT\b\s*==|==\s*\bHEIGHT\b/.test(line))
          .map(({ index, line }) => `${rel}:${index}: ${line.trim()}`);
      });

    expect(offenders).toEqual([]);
  });

  it('keeps SideChainState timestamp checks mempool-safe and monotonic', () => {
    const sideChainState = readContract('SideChainState.es');

    expect(sideChainState).toContain('successor.R8[Int].get <= HEIGHT');
    expect(sideChainState).toContain('HEIGHT > SELF.R8[Int].get');
  });

  it('preserves script, singleton NFT, and ERG value in mutable singleton successors', () => {
    const singletonContracts = [
      { name: 'SideChainState.es', valueInvariant: 'successor.value >= SELF.value' },
      { name: 'SPVTracker.es', valueInvariant: 'successor.value >= SELF.value' },
      { name: 'SPVTrackerAuthenticated.es', valueInvariant: 'successor.value >= SELF.value' },
      { name: 'DoubleUnlockPrevention.es', valueInvariant: 'successor.value >= SELF.value' },
      { name: 'DoubleUnlockPreventionAggregate.es', valueInvariant: 'successor.value >= SELF.value' },
      { name: 'DoubleUnlockPreventionAuthenticated.es', valueInvariant: 'successor.value >= SELF.value' },
      {
        name: 'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
        valueInvariant: 'successor.value == SELF.value',
      },
      { name: 'DoubleUnlockPreventionAggregateBatch.es', valueInvariant: 'successor.value >= SELF.value' },
    ];

    for (const { name, valueInvariant } of singletonContracts) {
      const contract = readContract(name);

      expect(contract, name).toContain('successor.propositionBytes == SELF.propositionBytes');
      expect(contract, name).toContain(valueInvariant);
      expect(contract, name).toContain('successor.tokens(0)._1 == SELF.tokens(0)._1');
    }
  });

  it('preserves authorization metadata registers across mutable singleton successors', () => {
    const signerGatedContracts = [
      { name: 'SideChainState.es', register: 'R9', metadata: 'authMetadata' },
      { name: 'SPVTracker.es', register: 'R6', metadata: 'committeePk' },
      { name: 'SPVTrackerAuthenticated.es', register: 'R9', metadata: 'finalityAttestorPk' },
      { name: 'DoubleUnlockPrevention.es', register: 'R6', metadata: 'authMetadata' },
      { name: 'DoubleUnlockPreventionAggregate.es', register: 'R6', metadata: 'authMetadata' },
      { name: 'DoubleUnlockPreventionAuthenticated.es', register: 'R6', metadata: 'authMetadata' },
      {
        name: 'DoubleUnlockPreventionAuthenticatedExternalFeeV1.es',
        register: 'R6',
        metadata: 'authMetadata',
      },
      { name: 'DoubleUnlockPreventionAggregateBatch.es', register: 'R6', metadata: 'authMetadata' },
    ];

    for (const { name, register, metadata } of signerGatedContracts) {
      const contract = readContract(name);

      expect(contract, name).toContain(`SELF.${register}[SigmaProp].get`);
      expect(contract, name).toContain(`successor.${register}[SigmaProp].get == ${metadata}`);
    }
  });

  it('keeps transitional MainChainUnlock committee-authorized and removes timeout payout', () => {
    const contract = readContract('MainChainUnlock.es');

    expect(contract).toContain('val recipientTree = SELF.R6[Coll[Byte]].get');
    expect(contract).toContain('COMMITTEE_SIGMAPROP_PLACEHOLDERS');
    expect(contract).toContain('val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)');
    expect(contract).toContain('payout.propositionBytes == recipientTree');
    expect(contract).toContain('payout.value == unlockAmount');
    expect(contract).toContain('payout.tokens.size == 0');
    expect(contract).toContain('sigmaProp(authorizedPayout) && committeeOk');
    expect(contract).not.toContain('EMERGENCY_TIMEOUT');
    expect(contract).not.toContain('emergencyEscape');
    expect(contract).not.toContain('escapeTimeElapsed');
  });

  it('keeps single-claim aggregate payouts bound to the claimed recipient and amount', () => {
    const contract = readContract('MainChainAggregateUnlock.es');

    expect(contract).toContain('val recipientTree = getVar[Coll[Byte]](4).get');
    expect(contract).toContain('val amount = byteArrayToLong(amountBytes)');
    expect(contract).toContain(
      'val expectedEventRoot = blake2b256(domain ++ burnTxId ++ recipientTree ++ amountBytes)',
    );
    expect(contract).toContain('payoutOut.propositionBytes == recipientTree');
    expect(contract).toContain('payoutOut.value >= amount');
    expect(contract).toContain('payoutOk &&');
  });

  it('allows MainChainLock mint backing only through an exact committed-vault transition', () => {
    const contract = readContract('MainChainLock.es');

    expect(contract).toContain('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER');
    expect(contract).toContain('vaultOut.propositionBytes == settlementVaultTree');
    expect(contract).toContain('vaultOut.value == SELF.value');
    expect(contract).toContain('vaultOut.tokens.size == 0');
    expect(contract).toContain('vaultR4.get == SELF.id');
    expect(contract).toContain('vaultR5.get == targetEvmAddress');
    expect(contract).toContain('vaultR6.get == SELF.value');
    expect(contract).toContain('vaultR7.get == depositorTree');
    expect(contract).toContain('val committeeSpend = sigmaProp(vaultTransition) && committeeOk');
    expect(contract).not.toContain('val committeeSpend = committeeOk');
  });

  it('keeps trustless compact aggregate payouts exactly bound to the bridge-native burn proof', () => {
    const contract = readContract('MainChainAggregateUnlockTrustless.es');

    expect(contract).toContain('val encodedLeaf = getVar[Coll[Byte]](2).get');
    expect(contract).toContain('val proofBundle = getVar[Coll[Byte]](3).get');
    expect(contract).toContain('val burnId = leafBurnId');
    expect(contract).toContain('val sidechainHeightBytes = if (proofBundleHeaderOk) proofBundle.slice(0, 8) else zero8');
    expect(contract).toContain('val spvDomain = fromBase16("4532535f5350565f5631")');
    expect(contract).toContain('val leafDomain = fromBase16("4532535f54525553544c4553535f4255524e5f4c4541465f5631")');
    expect(contract).toContain('val nodeDomain = fromBase16("4532535f54525553544c4553535f4255524e5f4e4f44455f5631")');
    expect(contract).toContain('val burnIdDomain = fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")');
    expect(contract).toContain('val leafShapeOk = encodedLeaf.size == 205');
    expect(contract).toContain('val sidechainBlockHash = if (leafShapeOk) encodedLeaf.slice(33, 65) else zero32');
    expect(contract).toContain('val leafBurnId = if (leafShapeOk) encodedLeaf.slice(65, 97) else zero32');
    expect(contract).toContain('val recipientHash = if (leafShapeOk) encodedLeaf.slice(133, 165) else zero32');
    expect(contract).toContain('val amountBytes = if (leafShapeOk) encodedLeaf.slice(165, 173) else zero8');
    expect(contract).toContain('val expectedBurnId = blake2b256(burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes)');
    expect(contract).toContain('val expectedTrackerKey = blake2b256(spvDomain ++ sidechainId ++ sidechainHeightBytes ++ sidechainBlockHash)');
    expect(contract).toContain('val leafHash = blake2b256(leafDomain ++ encodedLeaf)');
    expect(contract).toContain('val maxBurnProofNodes = 14');
    expect(contract).toContain('val burnProofNodeCountSmall = burnProofNodeCountBytes.slice(0, 7) == zero7');
    expect(contract).toContain('burnProofNodeCount <= maxBurnProofNodes');
    expect(contract).toContain('val dupLookupProofLenFitsInt = dupLookupProofLenBytes.slice(0, 4) == zero4');
    expect(contract).toContain('val burnProofLevels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)');
    expect(contract).toContain('burnProofLevels.fold(leafHash, { (acc: Coll[Byte], i: Int) =>');
    expect(contract).toContain('blake2b256(nodeDomain ++ siblingHash ++ acc)');
    expect(contract).toContain('blake2b256(nodeDomain ++ acc ++ siblingHash)');
    expect(contract).toContain('side == 0.toByte || side == 1.toByte');
    expect(contract).toContain('burnProofSidesOk');
    expect(contract).toContain('vaultSuccessor.propositionBytes == SELF.propositionBytes');
    expect(contract).toContain('vaultSuccessor.value == remainingVaultValue');
    expect(contract).toContain('vaultSuccessor.R4[Coll[Byte]].get == SELF.R4[Coll[Byte]].get');
    expect(contract).toContain('minerFeeOut.propositionBytes == minerFeeTree');
    expect(contract).toContain('(exactSpend || partialSpend)');
    expect(contract).not.toContain('burnProofNodeCountBytes == zero8 || burnProofNodeCountBytes == one8');
    expect(contract).toContain('expectedTrackerKey == trackerKey');
    expect(contract).toContain('recipientHash == blake2b256(payoutOut.propositionBytes)');
    expect(contract).toContain('assetId == zero32');
    expect(contract).toContain('val eventRootOk = eventRoot == merkleRoot');
    expect(contract).toContain('val proofBundleShapeOk =');
    expect(contract).toContain('val notSpent = dupTree.get(burnId, dupLookupProof).isEmpty');
    expect(contract).toContain('val dupModified = dupTree.insert(Coll((burnId, Coll(1.toByte))), dupInsertProof).get');
    expect(contract).toContain('payoutOut.propositionBytes.size == 36');
    expect(contract).toContain('payoutOut.value == amount');
    expect(contract).not.toContain('payoutOut.value >= amount');
    expect(contract).toContain('leafFieldsOk &&');
    expect(contract).toContain('eventRootOk &&');
  });

  it('keeps every batch aggregate payout bound to its packed claim core', () => {
    const contract = readContract('MainChainAggregateUnlockBatch.es');

    for (let i = 0; i < 10; i++) {
      const payoutIndex = i + 2;
      const core = `c${i}`;

      expect(contract, `${core} event root`).toContain(
        `tv.slice(0,32) == blake2b256(domain ++ ${core}.slice(32,64) ++ ${core}.slice(72,108) ++ ${core}.slice(64,72))`,
      );
      expect(contract, `${core} recipient`).toContain(
        `OUTPUTS(${payoutIndex}).propositionBytes == ${core}.slice(72,108)`,
      );
      expect(contract, `${core} amount`).toContain(
        `OUTPUTS(${payoutIndex}).value >= byteArrayToLong(${core}.slice(64,72))`,
      );
    }
  });
});
