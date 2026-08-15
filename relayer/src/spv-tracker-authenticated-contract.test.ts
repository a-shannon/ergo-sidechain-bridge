import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

const contractSource = readFileSync(
  new URL('../../contracts/SPVTrackerAuthenticated.es', import.meta.url),
  'utf8',
);
const compilerSource = readFileSync(
  new URL('./scripts/compile-contracts.ts', import.meta.url),
  'utf8',
);
const settlementContractSource = readFileSync(
  new URL('../../contracts/MainChainAggregateUnlockAuthenticated.es', import.meta.url),
  'utf8',
);

describe('SPVTrackerAuthenticated ErgoScript boundary', () => {
  it('requires one complete four-slot admission object and authenticates the Ergo header', () => {
    expect(contractSource).toContain('getVar[Coll[Byte]](0).get');
    expect(contractSource).toContain('getVar[Coll[Byte]](1).get');
    expect(contractSource).toContain('getVar[Coll[Byte]](2).get');
    expect(contractSource).toContain('getVar[Int](3).get');
    expect(contractSource).toContain('CONTEXT.headers(headerIndex)');
    expect(contractSource).toContain('computedExtensionRoot == anchorHeader.extensionRoot');
    expect(contractSource).toContain('Coll(2.toByte, 4.toByte, 1.toByte)');
    expect(contractSource).not.toContain('.isDefined');
  });

  it('derives an append-only V2 key and binds the complete 264-byte tracker value', () => {
    expect(contractSource).toContain('4532535f5350565f5632');
    expect(contractSource).toContain('trackerValue.size == 264');
    expect(contractSource).toContain('checkpointCommitment');
    expect(contractSource).toContain('trackerValue.slice(64, 96) == anchorHeader.id');
    expect(contractSource).toContain('trackerValue.slice(100, 104) == proofSystemIdBytes');
    expect(contractSource).toContain('trackerValue.slice(104, 136) == suppliedStatementDigest');
    expect(contractSource).toContain('trackerValue.slice(136, 168) == finalityProgramId');
    expect(contractSource).toContain('trackerValue.slice(168, 200) == verifierProfileId');
    expect(contractSource).toContain('trackerValue.slice(200, 232) == payloadDigest');
    expect(contractSource).toContain('trackerValue.slice(232, 264) == proofDigest');
    expect(contractSource).toContain('oldTree.insert');
    expect(contractSource).not.toContain('.update(');
    expect(contractSource).not.toContain('.remove(');
  });

  it('validates the aggregate commitment while retaining the R9 authorization boundary', () => {
    expect(contractSource).toContain('finalityCommitment.size == 496');
    expect(contractSource).toContain('finalityCommitment.slice(108, 464)');
    expect(contractSource).toContain('statement.slice(4, 220)');
    expect(contractSource).toContain('statementCheckpointCommitment == checkpointCommitment');
    expect(contractSource).toContain('finalityProgramId == expectedFinalityProgramId');
    expect(contractSource).toContain('statementDigestOk');
    expect(contractSource).toContain('payloadLength <= 33554432L');
    expect(contractSource).toContain('val finalityAttestorPk = SELF.R9[SigmaProp].get');
    expect(contractSource).toContain('&& finalityAttestorPk');
    expect(contractSource).toContain('does not verify the proof payload or GRANDPA semantics');
    expect(contractSource).toContain('R9 remains a finality authority');
    expect(contractSource).not.toMatch(/trustless proof acceptance/i);
    expect(contractSource).not.toMatch(/liveness-only/i);
  });

  it('is included in the check-only contract compiler inventory', () => {
    expect(compilerSource).toContain("'SPVTrackerAuthenticated.es'");
  });

  it('keeps settlement event-root and anchor-height offsets stable in the 264-byte value', () => {
    expect(settlementContractSource).toContain('trackerValue.size == 264');
    expect(settlementContractSource).toContain('trackerValue.slice(0, 32)');
    expect(settlementContractSource).toContain('trackerValue.slice(96, 100)');
    expect(settlementContractSource).not.toContain('trackerValue.size == 100');
  });
});
