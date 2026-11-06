import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { decodePooledReserveMintReservationRuntimeProfileV4ScaleHex } from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import { decodeSubstrateFederatedSettlementFamilyV1Profile } from './substrate-federated-settlement-family-v1.js';
import { prepareSubstrateFederatedGenesisV1 } from './substrate-federated-runtime-genesis-v1.js';
import { loadTrackedDeploymentIdentityArtifactProfile } from './read-only-deployment-identity-observer.js';
import { stringifyJsonPreservingNumbers, parseStrictJsonPreservingNumbers } from './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  decodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  buildFederatedPooledReserveSourceProofProfileV1,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  buildSubstrateFederatedGenesisV3, prepareSubstrateFederatedGenesisV3,
  type PrepareSubstrateFederatedGenesisV3Input,
} from './substrate-federated-runtime-genesis-v3.js';
import { buildSubstrateFederatedTrackerCompilerRequestV2 } from './substrate-federated-tracker-compiler-v2.js';
import { compileSubstrateFederatedTrackerWithPinnedJvmV2 } from './substrate-federated-tracker-jvm-compiler-v2.js';
import { compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3 } from './substrate-federated-settlement-family-jvm-compiler-v3.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

const bridgeRoot = fileURLToPath(new URL('../../', import.meta.url));
const admissionVector = JSON.parse(readFileSync(new URL('../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url), 'utf8'));
const operator = '31'.repeat(20);
const bridge = '33'.repeat(20);
const token = '44'.repeat(20);

function preparationInput(): PrepareSubstrateFederatedGenesisV3Input {
  // A syntax-only module pins identity in unit tests, not node compatibility.
  const runtimeWasm = Buffer.from('0061736d01000000', 'hex');
  return {
    bridgeRoot, launchDomainHex: '61'.repeat(32), evmChainId: '198407',
    operatorAddressHex: operator, bridgeAddressHex: bridge, tokenAddressHex: token,
    runtimeWasm, expectedRuntimeWasmSha256Hex: sha256(runtimeWasm),
    checkpointProfile: {
      ...admissionVector.input.profile, federationEpoch: '7',
      sourceAttestationThreshold: 2,
      sourceAttestationPublicKeysHex: ['41'.repeat(32), '42'.repeat(32)],
    },
    mintProofProfile: {
      federationEpoch: '7', threshold: 2,
      signerPublicKeysHex: ['0x' + '41'.repeat(32), '0x' + '42'.repeat(32)],
      maxValidityBlocks: '64',
      verifierProfileIdHex: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
    },
    endowments: [{ addressHex: operator, balance: '1000000000000000000000000' }],
  };
}

describe('FED runtime genesis preparation', () => {
  it('binds tracked Solidity bytes and immutable, separately encoded federation profiles', () => {
    const input = preparationInput();
    const prepared = prepareSubstrateFederatedGenesisV3(input);
    const artifact = loadTrackedDeploymentIdentityArtifactProfile(bridgeRoot);
    expect(prepared.application.bridgeRuntimeCodeSha256Hex).toBe(artifact.bridge.runtimeBytecodeSha256Hex);
    expect(prepared.application.tokenRuntimeCodeBytes).toBe(artifact.token.runtimeByteLength);
    expect(prepared.application.sourceRuntimeCodeSha256Hex).toBe(input.expectedRuntimeWasmSha256Hex);
    expect(buildFederatedPooledReserveSourceProofProfileV1(
      decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(prepared.mintProofProfileScaleHex),
    )).toEqual(prepared.mintProofProfile);
    expect(prepared.mintProofProfile.proofProfileIdHex).toBe('0x3e7d46eec3650d7c19f1712323bb08b0f8df19e79fb617efab20244c765585c5');
    expect(() => { (prepared.application as any).sidechainIdHex = '99'.repeat(32); }).toThrow();
    expect(() => { (prepared.mintProofProfile.signerPublicKeysHex as string[]).push('0x' + '99'.repeat(32)); }).toThrow();
  });

  it.each(['genesisHashHex', 'generatedSpecSha256Hex', 'familyIdHex'])('rejects circular input %s', field => {
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), [field]: '99'.repeat(32) } as any))
      .toThrow('exact plain fields');
  });

  it.each([
    ['launchDomainHex', '00'.repeat(32)], ['launchDomainHex', 'AA'.repeat(32)],
    ['evmChainId', '1'], ['evmChainId', '0198407'], ['evmChainId', '18446744073709551616'],
    ['operatorAddressHex', bridge], ['tokenAddressHex', bridge],
    ['expectedRuntimeWasmSha256Hex', '99'.repeat(32)],
    ['runtimeWasm', Buffer.alloc(8)], ['runtimeWasm', new Uint8Array(0)],
  ])('rejects invalid %s (%s)', (field, value) => {
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), [field]: value } as any)).toThrow();
  });

  it.each(['epoch', 'threshold', 'members', 'verifier', 'reference'])('rejects federation mismatch: %s', fault => {
    const input = structuredClone(preparationInput());
    if (fault === 'epoch') (input.checkpointProfile as any).federationEpoch = '8';
    if (fault === 'threshold') (input.checkpointProfile as any).sourceAttestationThreshold = 1;
    if (fault === 'members') (input.checkpointProfile as any).sourceAttestationPublicKeysHex = ['41'.repeat(32), '43'.repeat(32)];
    if (fault === 'verifier') (input.mintProofProfile as any).verifierProfileIdHex = '0x' + '99'.repeat(32);
    if (fault === 'reference') (input.mintProofProfile as any).signerPublicKeysHex = [
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX[0], '0x' + '42'.repeat(32),
    ];
    expect(() => prepareSubstrateFederatedGenesisV3(input)).toThrow();
  });

  it.each([
    [], [{ addressHex: operator, balance: '0' }],
    [{ addressHex: '51'.repeat(20), balance: '1000000000000000000' }],
    [{ addressHex: operator, balance: '1' }, { addressHex: operator, balance: '2' }],
    [{ addressHex: operator, balance: '1' }, { addressHex: bridge, balance: '2' }],
    [{ addressHex: operator, balance: '1' }, { addressHex: token, balance: '2' }],
    [{ addressHex: operator, balance: '340282366920938463463374607431768211456' }],
    [{ addressHex: operator, balance: '340282366920938463463374607431768211455' }, { addressHex: '51'.repeat(20), balance: '1' }],
  ])('rejects invalid native funding %#', (...items) => {
    // Vitest spreads array table rows; reassemble this row without changing values.
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), endowments: items as any })).toThrow();
  });

  it('rejects a caller-owned map that would return unvalidated endowments', () => {
    const endowments: any = [{ addressHex: operator, balance: '1' }];
    let calls = 0;
    endowments.map = (callback: (item: unknown) => unknown) => {
      calls++;
      callback(endowments[0]);
      return [{ addressHex: operator, balance: '1' }, { addressHex: bridge, balance: '1' }];
    };
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), endowments }))
      .toThrow('exact data entries');
    expect(calls).toBe(0);
  });

  it('rejects sparse endowments and index or item getters without invoking them', () => {
    const sparse: any[] = new Array(2);
    sparse[0] = { addressHex: operator, balance: '1' };
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), endowments: sparse }))
      .toThrow('exact data entries');
    const camouflaged: any = new Array(2);
    camouflaged[0] = { addressHex: operator, balance: '1' };
    camouflaged.extra = true;
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), endowments: camouflaged }))
      .toThrow('contiguous data entries');
    let indexReads = 0;
    const indexGetter: any = [{ addressHex: operator, balance: '1' }];
    Object.defineProperty(indexGetter, '0', {
      enumerable: true, get: () => { indexReads++; return { addressHex: operator, balance: '1' }; },
    });
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), endowments: indexGetter }))
      .toThrow('contiguous data entries');
    expect(indexReads).toBe(0);
    let balanceReads = 0;
    const item: any = { addressHex: operator };
    Object.defineProperty(item, 'balance', {
      enumerable: true, get: () => { balanceReads++; return '1'; },
    });
    expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), endowments: [item] }))
      .toThrow('exact plain fields');
    expect(balanceReads).toBe(0);
  });

  it('rejects accessors and hidden fields without invoking caller code', () => {
    const input = preparationInput();
    Object.defineProperty(input, 'hidden', { value: true });
    expect(() => prepareSubstrateFederatedGenesisV3(input)).toThrow('exact plain fields');
    let reads = 0;
    const accessor = preparationInput();
    Object.defineProperty(accessor, 'evmChainId', { enumerable: true, get: () => { reads++; return '198407'; } });
    expect(() => prepareSubstrateFederatedGenesisV3(accessor)).toThrow('exact plain fields');
    expect(reads).toBe(0);
  });

  it.each([1, 2, 3, 4, 5, 1024, 1025])('rejects application precompile address %i', value => {
    const addressHex = value.toString(16).padStart(40, '0');
    for (const field of ['bridgeAddressHex', 'tokenAddressHex']) {
      expect(() => prepareSubstrateFederatedGenesisV3({ ...preparationInput(), [field]: addressHex }))
        .toThrow('runtime precompile address');
    }
  });

  it.each(['domain', 'chain', 'operator', 'wasm', 'federation'])('binds each pre-genesis identity input: %s', field => {
    const baseline = prepareSubstrateFederatedGenesisV3(preparationInput());
    const changed = structuredClone(preparationInput());
    if (field === 'domain') (changed as any).launchDomainHex = '62'.repeat(32);
    if (field === 'chain') (changed as any).evmChainId = '198408';
    if (field === 'operator') {
      (changed as any).operatorAddressHex = '51'.repeat(20);
      (changed as any).endowments = [{ addressHex: '51'.repeat(20), balance: '1000000000000000000000000' }];
    }
    if (field === 'wasm') {
      (changed as any).runtimeWasm = Buffer.from('0061736d01000000000100', 'hex');
      (changed as any).expectedRuntimeWasmSha256Hex = sha256(changed.runtimeWasm);
    }
    if (field === 'federation') {
      (changed.checkpointProfile as any).federationEpoch = '8';
      (changed.mintProofProfile as any).federationEpoch = '8';
    }
    const next = prepareSubstrateFederatedGenesisV3(changed);
    if (field === 'domain' || field === 'chain') {
      expect(next.application.sourceNetworkIdHex).not.toBe(baseline.application.sourceNetworkIdHex);
      expect(next.application.sidechainIdHex).not.toBe(baseline.application.sidechainIdHex);
      expect(next.application.settlementProfileIdHex).not.toBe(baseline.application.settlementProfileIdHex);
    } else {
      expect(next.application.runtimeProfileIdHex).not.toBe(baseline.application.runtimeProfileIdHex);
    }
  });
});

describe('FED runtime genesis from the actual JVM family', () => {
  let prepared: ReturnType<typeof prepareSubstrateFederatedGenesisV3>;
  let compilerInput: Parameters<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3>[0];
  let receipt: Awaited<ReturnType<typeof compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3>>;
  let candidate: ReturnType<typeof buildSubstrateFederatedGenesisV3>;

  beforeAll(async () => {
    prepared = prepareSubstrateFederatedGenesisV3(preparationInput());
    const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV2({
      template: template('contracts/SPVTrackerSubstrateFederatedV2.es'),
      trackerGenesisInputBoxIdHex: '0d'.repeat(32),
      profile: prepared.checkpointProfile, application: prepared.application,
    });
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const saved = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      const trackerReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV2(trackerRequest);
      compilerInput = {
        trackerRequest, trackerReceipt,
        templates: {
          duplicatePrevention: template('contracts/DoubleUnlockPreventionSubstrateFederatedV1.es'),
          sourceLock: template('contracts/MainChainLockPooledReserveV6.es'),
          pooledReserve: template('contracts/MainChainPooledReserveValidityApplicationV7.es'),
        },
        duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
        pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
      };
      receipt = await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV3(compilerInput);
    } finally {
      process.env.NODE_OPTIONS = saved;
    }
    candidate = buildSubstrateFederatedGenesisV3({ preparation: prepared, familyCompilerInput: compilerInput, familyReceipt: receipt });
  }, 120_000);

  it('produces the unchanged 349-byte V4 encoding with height-zero family and proof bindings', () => {
    expect(prepared.schema).toBe('e2s.substrate-federated-genesis-preparation.v3');
    expect(candidate.schema).toBe('e2s.substrate-federated-typed-genesis-candidate.v3');
    const family = decodeSubstrateFederatedSettlementFamilyV1Profile(receipt.profile);
    expect(Buffer.from(receipt.profile.encodedProfileHex, 'hex')).toHaveLength(596);
    expect(family.pooledReserveTemplateSha256Hex).toBe(
      sha256(Buffer.from(template('contracts/MainChainPooledReserveValidityApplicationV7.es').source)),
    );
    expect(Buffer.from(candidate.runtimeProfileScaleHex.slice(2), 'hex')).toHaveLength(349);
    expect(decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(candidate.runtimeProfileScaleHex))
      .toEqual(candidate.runtimeProfile);
    expect(candidate.runtimeProfile).toMatchObject({
      formatVersion: 4, lineageProfileIdHex: '0x' + receipt.profile.familyIdHex,
      sourceNetworkIdHex: '0x' + prepared.application.sourceNetworkIdHex,
      sidechainIdHex: '0x' + prepared.application.sidechainIdHex,
      bridgeAddressHex: '0x' + bridge, tokenAddressHex: '0x' + token,
      bridgeRuntimeCodeSha256Hex: '0x' + prepared.application.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: prepared.application.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: '0x' + prepared.application.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: prepared.application.tokenRuntimeCodeBytes,
      settlementProfileIdHex: '0x' + prepared.application.settlementProfileIdHex,
      sourceProofSystemIdHex: prepared.mintProofProfile.proofSystemIdHex,
      sourceProofProfileIdHex: prepared.mintProofProfile.proofProfileIdHex,
      activationHeight: '0', maxPendingBlocks: 64,
    });
  });

  it('preserves exact native integers, zero application balances/supply and no Sudo', () => {
    const parsed = JSON.parse(candidate.genesisJson);
    const exactParsed = parseStrictJsonPreservingNumbers(candidate.genesisJson, 'candidate') as any;
    expect(stringifyJsonPreservingNumbers(exactParsed))
      .toBe(candidate.genesisJson);
    expect(exactParsed.balances.balances).toHaveLength(1);
    expect(exactParsed.balances.balances[0][0]).toBe('0x' + operator);
    expect(stringifyJsonPreservingNumbers(exactParsed.balances.balances[0][1]))
      .toBe('1000000000000000000000000');
    expect(parsed.sudo).toEqual({ key: null });
    expect(parsed.manualSeal).toEqual({ enable: true });
    expect(parsed.aura).toEqual({ authorities: [
      '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
    ] });
    expect(parsed.grandpa).toEqual({ authorities: [[
      '5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu', 1,
    ]] });
    expect(parsed.transactionPayment).toEqual({ multiplier: '1000000000000000000' });
    expect(parsed.baseFee).toEqual({ baseFeePerGas: '0x3b9aca00', elasticity: 125000 });
    expect(parsed.ethereum).toEqual({});
    expect(parsed.bridgeCommitment).toEqual({
      legacyMintQuarantineAddress: '0x' + bridge,
      pooledReserveMintGenesisV4: ['0x' + operator, [...Buffer.from(candidate.runtimeProfileScaleHex.slice(2), 'hex')]],
    });
    const artifact = loadTrackedDeploymentIdentityArtifactProfile(bridgeRoot);
    expect(Buffer.from(parsed.evm.accounts['0x' + bridge].code).toString('hex')).toBe(artifact.bridge.runtimeBytecodeHex.replace(/^0x/, ''));
    expect(Buffer.from(parsed.evm.accounts['0x' + token].code).toString('hex')).toBe(artifact.token.runtimeBytecodeHex.replace(/^0x/, ''));
    expect(Object.keys(parsed.evm.accounts)).toEqual(['0x' + bridge, '0x' + token]);
    expect(parsed.evm.accounts['0x' + bridge].balance).toBe('0x0');
    expect(parsed.evm.accounts['0x' + token].balance).toBe('0x0');
    expect(parsed.evm.accounts['0x' + bridge].storage[slot(0)]).toBe('0x' + operator.padStart(64, '0'));
    expect(parsed.evm.accounts['0x' + bridge].storage[slot(3)]).toBe('0x' + token.padStart(64, '0'));
    expect(parsed.evm.accounts['0x' + token].storage[slot(5)]).toBe('0x' + bridge.padStart(64, '0'));
    expect(parsed.evm.accounts['0x' + token].storage[slot(2)]).toBeUndefined();
    expect(candidate.genesisJsonSha256Hex).toBe(sha256(Buffer.from(candidate.genesisJson)));
    expect(candidate.status).toBe('typed-genesis-candidate');
    expect(candidate).not.toHaveProperty('fundsAuthorityEstablished');
  });

  it('rejects copied preparation and compiler receipts', () => {
    const input = { preparation: prepared, familyCompilerInput: compilerInput, familyReceipt: receipt };
    expect(() => buildSubstrateFederatedGenesisV3({ ...input, preparation: structuredClone(prepared) })).toThrow('process provenance');
    expect(() => buildSubstrateFederatedGenesisV3({ ...input, familyReceipt: structuredClone(receipt) })).toThrow();
  });

  it('rejects a forged V2-labelled compiler receipt without V3 process provenance', () => {
    const oldShape = { ...structuredClone(receipt),
      schema: 'e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2',
      version: 2 };
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepared, familyCompilerInput: compilerInput, familyReceipt: oldShape as any,
    })).toThrow('lacks process provenance');
  });

  it('rejects a V1 preparation even when its fields match a V3 preparation', () => {
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepareSubstrateFederatedGenesisV1(preparationInput()) as any,
      familyCompilerInput: compilerInput, familyReceipt: receipt,
    })).toThrow('process provenance');
  });

  it('rejects a top-level getter or extra field without invoking caller code', () => {
    let reads = 0;
    const accessor = { preparation: prepared, familyCompilerInput: compilerInput, familyReceipt: receipt };
    Object.defineProperty(accessor, 'familyReceipt', {
      enumerable: true, get: () => { reads++; return receipt; },
    });
    expect(() => buildSubstrateFederatedGenesisV3(accessor)).toThrow('exact plain fields');
    expect(reads).toBe(0);
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepared, familyCompilerInput: compilerInput, familyReceipt: receipt, extra: true,
    } as any)).toThrow('exact plain fields');
  });

  it('rejects accessor-backed compiler inputs before evaluating them', () => {
    let reads = 0;
    const accessor = { ...compilerInput };
    Object.defineProperty(accessor, 'trackerRequest', {
      enumerable: true, get: () => { reads++; return compilerInput.trackerRequest; },
    });
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepared, familyCompilerInput: accessor, familyReceipt: receipt,
    })).toThrow('FED genesis family input requires exact plain fields');
    expect(reads).toBe(0);
  });

  it('rejects a family joined to a different application or federation', () => {
    const changed = { ...preparationInput(), launchDomainHex: '62'.repeat(32) };
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepareSubstrateFederatedGenesisV3(changed), familyCompilerInput: compilerInput, familyReceipt: receipt,
    })).toThrow('differs from prepared application or federation');
    const changedFederation = structuredClone(preparationInput());
    (changedFederation.checkpointProfile as any).federationEpoch = '8';
    (changedFederation.mintProofProfile as any).federationEpoch = '8';
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepareSubstrateFederatedGenesisV3(changedFederation),
      familyCompilerInput: compilerInput, familyReceipt: receipt,
    })).toThrow('differs from prepared application or federation');
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepared, familyCompilerInput: { ...compilerInput, pooledReserveGenesisInputBoxIdHex: '99'.repeat(32) }, familyReceipt: receipt,
    })).toThrow();
  });

  it('rejects a changed V7 template and singleton identity against the process receipt', () => {
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepared, familyCompilerInput: {
        ...compilerInput,
        templates: { ...compilerInput.templates,
          pooledReserve: { ...compilerInput.templates.pooledReserve,
            source: compilerInput.templates.pooledReserve.source + '\n// changed\n' },
        },
      }, familyReceipt: receipt,
    })).toThrow(/V3 template SHA-256 drifted/);
    expect(() => buildSubstrateFederatedGenesisV3({
      preparation: prepared, familyCompilerInput: {
        ...compilerInput, duplicatePreventionGenesisInputBoxIdHex: '12'.repeat(32),
      }, familyReceipt: receipt,
    })).toThrow();
  });

  it('binds exact native issuance to the prepared endowment while retaining the same family', () => {
    const input = { ...preparationInput(),
      endowments: [{ addressHex: operator, balance: '1000000000000000000000001' }] };
    const changed = prepareSubstrateFederatedGenesisV3(input);
    const actual = buildSubstrateFederatedGenesisV3({
      preparation: changed, familyCompilerInput: compilerInput, familyReceipt: receipt,
    });
    expect(actual.genesisJson).toContain('1000000000000000000000001');
    expect(actual.genesisJsonSha256Hex).not.toBe(candidate.genesisJsonSha256Hex);
    expect(actual.familyIdHex).toBe(candidate.familyIdHex);
  });

  it('snapshots mutable WASM and funding inputs before later compilation', () => {
    const input = preparationInput();
    const second = prepareSubstrateFederatedGenesisV3(input);
    input.runtimeWasm.fill(0);
    (input.endowments[0] as any).balance = '1';
    const actual = buildSubstrateFederatedGenesisV3({ preparation: second, familyCompilerInput: compilerInput, familyReceipt: receipt });
    expect(actual).toEqual(candidate);
  });
});

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function slot(value: number): string { return '0x' + value.toString(16).padStart(64, '0'); }
function template(relativePath: string) {
  return { relativePath, source: readFileSync(new URL('../../' + relativePath, import.meta.url), 'utf8') };
}
