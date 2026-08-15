import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import {
  decodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import {
  BoundedHttpSubstrateRpcTransport,
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';
import {
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';
import {
  assertSubstrateFederatedMintReservationProducerV1Provenance,
  collectSubstrateFederatedMintReservationProducerV1,
  createSubstrateFederatedMintReservationSourcePairV1,
  recollectSubstrateFederatedMintReservationProducerV1,
} from './substrate-federated-mint-reservation-producer-v1.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  readonly statement:
    ValidityApplicationPooledReserveMintReservationStatementV4;
  readonly expected: {
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};

const HEAD_HASH = `0x${'44'.repeat(32)}`;
const OTHER_HEAD_HASH = `0x${'45'.repeat(32)}`;
const STATE_ROOT = `0x${'55'.repeat(32)}`;
const PRIMARY_ORIGIN = 'https://source.example.test';
const WITNESS_ORIGIN = 'https://witness.example.test';
const SOURCE_PROOF_SYSTEM_ID = `0x${'77'.repeat(32)}`;
const SOURCE_PROOF_PROFILE_ID = `0x${'88'.repeat(32)}`;
const FAMILY_ID = '99'.repeat(32);
const RUNTIME_CODE_HEX = '0x01020304';
const RUNTIME_CODE_SHA256 = createHash('sha256')
  .update(Buffer.from(RUNTIME_CODE_HEX.slice(2), 'hex'))
  .digest('hex');
const RUNTIME_PROFILE_SCALE_HEX = buildRuntimeProfileScaleHex();
const RUNTIME_PROFILE_ID =
  derivePooledReserveMintReservationRuntimeProfileV4IdHex(
    RUNTIME_PROFILE_SCALE_HEX,
  );
const STORAGE_KEYS =
  derivePooledReserveMintReservationRuntimeStorageKeysV4(
    vector.expected.reservationKeyHex,
  );
const ORDERED_STORAGE_KEYS = [
  STORAGE_KEYS.runtimeCodeStorageKeyHex,
  STORAGE_KEYS.currentProfileStorageKeyHex,
  STORAGE_KEYS.enforcementStorageKeyHex,
  STORAGE_KEYS.pendingKeysStorageKeyHex,
  STORAGE_KEYS.pendingReservationStorageKeyHex,
  STORAGE_KEYS.consumedReservationStorageKeyHex,
  STORAGE_KEYS.invalidatedReservationStorageKeyHex,
] as const;

describe('Substrate federated mint-reservation producer V1', () => {
  it('joins one exact pending reservation and hold under matching finalized state', async () => {
    const primary = new RecordingTransport(PRIMARY_ORIGIN);
    const witness = new RecordingTransport(WITNESS_ORIGIN);
    const result = await collectSubstrateFederatedMintReservationProducerV1(
      producerInput(primary, witness),
    );

    expect(result).toMatchObject({
      status: 'pending_hold',
      mintObservation: {
        statementIdHex: vector.expected.statementIdHex.slice(2),
        reservationKeyHex: vector.expected.reservationKeyHex.slice(2),
        familyIdHex: FAMILY_ID,
        lifecycleStatus: 'pending',
        classification: 'pending_hold',
        localObservationAuthoritative: false,
        mintAuthorized: false,
      },
      finalizedSourceState: {
        targetNativeBlockHashHex: HEAD_HASH.slice(2),
        targetNativeHeight: '100',
        targetStateRootHex: STATE_ROOT.slice(2),
        runtimeCodeSha256Hex: RUNTIME_CODE_SHA256,
        runtimeCodeBytes: 4,
        runtimeProfileScaleHex: RUNTIME_PROFILE_SCALE_HEX,
        runtimeProfileIdHex: RUNTIME_PROFILE_ID.slice(2),
        sourceProofSystemIdHex: SOURCE_PROOF_SYSTEM_ID.slice(2),
        sourceProofProfileIdHex: SOURCE_PROOF_PROFILE_ID.slice(2),
        reservationKeyHex: vector.expected.reservationKeyHex.slice(2),
        pendingIndexEntryCount: 1,
        sourceProofResultIdHex: '92'.repeat(32),
        reservedAtNativeHeight: '90',
        expiresAtNativeHeight: '105',
      },
      boundary: {
        readOnlyRpc: true,
        exactFinalizedBlockReportedByBothSources: true,
        exactRuntimeAndProfileObserved: true,
        exactPendingReservationDecoded: true,
        matchingDistinctSourceObservations: true,
        stateProofCaptured: true,
        stateProofVerified: false,
        sourceFinalityCryptographicallyVerified: false,
        localPersistenceConsulted: false,
        mintAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
      },
    });
    expect(result.finalizedSourceState.storageKeysHex)
      .toEqual(ORDERED_STORAGE_KEYS);
    expect(result.finalizedSourceState.sourceIdsHex).toHaveLength(2);
    expect(new Set(result.finalizedSourceState.sourceIdsHex).size).toBe(2);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() =>
      assertSubstrateFederatedMintReservationProducerV1Provenance(result)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedMintReservationProducerV1Provenance(
        structuredClone(result),
      )
    ).toThrow(/provenance is missing/i);

    for (const transport of [primary, witness]) {
      expect(transport.calls.filter(call =>
        call.method === 'chain_getFinalizedHead'
      )).toHaveLength(2);
      expect(transport.calls.filter(call =>
        call.method === 'state_getStorage'
      ).map(call => call.params)).toEqual(
        ORDERED_STORAGE_KEYS.map(key => [key, HEAD_HASH]),
      );
      expect(transport.calls).toContainEqual({
        method: 'state_getReadProof',
        params: [ORDERED_STORAGE_KEYS, HEAD_HASH],
      });
    }
  });

  it('recollects only through the original producer result and source pair', async () => {
    const initial = await collectSubstrateFederatedMintReservationProducerV1(
      producerInput(
        new RecordingTransport(PRIMARY_ORIGIN),
        new RecordingTransport(WITNESS_ORIGIN),
      ),
    );
    const recollected =
      await recollectSubstrateFederatedMintReservationProducerV1(initial);

    expect(recollected.mintObservation.observationDigestHex).toBe(
      initial.mintObservation.observationDigestHex,
    );
    expect(recollected.finalizedSourceState.stateObservationDigestHex).toBe(
      initial.finalizedSourceState.stateObservationDigestHex,
    );
    expect(() => recollectSubstrateFederatedMintReservationProducerV1(
      structuredClone(initial),
    )).toThrow(/recollection provenance is missing|provenance is missing/i);
  });

  it('requires opaque provenance and distinct credential-free source origins', async () => {
    const primary = new RecordingTransport(PRIMARY_ORIGIN);
    const witness = new RecordingTransport(WITNESS_ORIGIN);
    const sameOriginPrimary = new ReadOnlySubstrateFinalityRpc(
      new RecordingTransport(PRIMARY_ORIGIN),
    );
    const sameOriginWitness = new ReadOnlySubstrateFinalityRpc(
      new RecordingTransport(`${PRIMARY_ORIGIN}/`),
    );
    expect(() => createSubstrateFederatedMintReservationSourcePairV1({
      primaryRpc: sameOriginPrimary,
      witnessRpc: sameOriginWitness,
    })).toThrow(/distinct RPC origins/i);
    expect(() => new ReadOnlySubstrateFinalityRpc(
      new RecordingTransport('https://source.example.test/path'),
    )).toThrow(/credential-free HTTP\(S\) origin/i);
    const sharedTransport = new RecordingTransport(PRIMARY_ORIGIN);
    const sharedPrimary = new ReadOnlySubstrateFinalityRpc(sharedTransport);
    const sharedWitness = new ReadOnlySubstrateFinalityRpc(sharedTransport);
    expect(() => createSubstrateFederatedMintReservationSourcePairV1({
      primaryRpc: sharedPrimary,
      witnessRpc: sharedWitness,
    })).toThrow(/distinct RPC transports/i);
    const sameEndpointPrimary = new ReadOnlySubstrateFinalityRpc(
      new BoundedHttpSubstrateRpcTransport('https://shared.example.test/rpc'),
    );
    const sameEndpointWitness = new ReadOnlySubstrateFinalityRpc(
      new BoundedHttpSubstrateRpcTransport('https://shared.example.test/other'),
    );
    expect(() => createSubstrateFederatedMintReservationSourcePairV1({
      primaryRpc: sameEndpointPrimary,
      witnessRpc: sameEndpointWitness,
    })).toThrow(/distinct RPC origins/i);

    const input = producerInput(primary, witness);
    await expect(collectSubstrateFederatedMintReservationProducerV1({
      ...input,
      sources: structuredClone(input.sources),
    })).rejects.toThrow(/source-pair provenance is missing/i);
  });

  it('rejects missing and terminal-conflicting pending state', async () => {
    const missingPending = storageValues();
    missingPending.set(STORAGE_KEYS.pendingReservationStorageKeyHex, null);
    await expect(collectWithWitness({ storage: missingPending }))
      .rejects.toThrow(/pending lifecycle record is absent/i);

    const terminalConflict = storageValues();
    terminalConflict.set(
      STORAGE_KEYS.consumedReservationStorageKeyHex,
      '0x04',
    );
    await expect(collectWithWitness({ storage: terminalConflict }))
      .rejects.toThrow(/conflicts with a terminal record/i);

    const invalidatedConflict = storageValues();
    invalidatedConflict.set(
      STORAGE_KEYS.invalidatedReservationStorageKeyHex,
      '0x04',
    );
    await expect(collectWithWitness({ storage: invalidatedConflict }))
      .rejects.toThrow(/conflicts with a terminal record/i);
  });

  it.each([
    { name: 'issued before activation', overrides: { issuedAt: 0n } },
    { name: 'issued after reservation', overrides: { issuedAt: 91n } },
    { name: 'reserved after target', overrides: { reservedAt: 101n } },
    { name: 'expired at target', overrides: { expiresAt: 100n } },
    { name: 'expired at reservation', overrides: { expiresAt: 90n } },
    { name: 'beyond the profile horizon', overrides: { expiresAt: 111n } },
  ])('rejects a pending lifecycle $name', async ({ overrides }) => {
    const storage = storageValues();
    storage.set(
      STORAGE_KEYS.pendingReservationStorageKeyHex,
      pendingLifecycleRecordHex(overrides),
    );
    await expect(collectWithWitness({ storage }))
      .rejects.toThrow(/horizon is stale or invalid/i);
  });

  it('rejects runtime, profile, statement, and pending-index substitution', async () => {
    const wrongRuntime = storageValues();
    wrongRuntime.set(STORAGE_KEYS.runtimeCodeStorageKeyHex, '0x01020305');
    await expect(collectWithWitness({ storage: wrongRuntime }))
      .rejects.toThrow(/runtime code identity mismatch/i);

    const wrongProfile = storageValues();
    const wrongProfileBytes = Buffer.from(
      RUNTIME_PROFILE_SCALE_HEX.slice(2),
      'hex',
    );
    wrongProfileBytes[1] ^= 0x01;
    wrongProfile.set(
      STORAGE_KEYS.currentProfileStorageKeyHex,
      `0x${wrongProfileBytes.toString('hex')}`,
    );
    await expect(collectWithWitness({ storage: wrongProfile }))
      .rejects.toThrow(/runtime profile bytes mismatch/i);

    const wrongStatement = storageValues();
    const lifecycle = Buffer.from(
      pendingLifecycleRecordHex().slice(2),
      'hex',
    );
    lifecycle[40] ^= 0x01;
    wrongStatement.set(
      STORAGE_KEYS.pendingReservationStorageKeyHex,
      `0x${lifecycle.toString('hex')}`,
    );
    await expect(collectWithWitness({ storage: wrongStatement }))
      .rejects.toThrow(/contains a different statement/i);

    const wrongIndex = storageValues();
    wrongIndex.set(
      STORAGE_KEYS.pendingKeysStorageKeyHex,
      `0x04${'aa'.repeat(32)}`,
    );
    await expect(collectWithWitness({ storage: wrongIndex }))
      .rejects.toThrow(/does not contain the exact reservation once/i);
  });

  it('rejects proof, header, and source-view disagreement', async () => {
    await expect(collectWithWitness({ proof: ['0x0102', '0x0305'] }))
      .rejects.toThrow(/sources disagree on finalized reservation state/i);
    await expect(collectWithWitness({
      stateRoot: `0x${'56'.repeat(32)}`,
    })).rejects.toThrow(/sources disagree on finalized reservation state/i);
    await expect(collectWithWitness({
      proofAt: OTHER_HEAD_HASH,
    })).rejects.toThrow(/not bound to the requested native block/i);
  });

  it('rejects a finalized head that moves during one source acquisition', async () => {
    const primary = new RecordingTransport(PRIMARY_ORIGIN, {
      finalizedHeads: [HEAD_HASH, OTHER_HEAD_HASH],
    });
    const witness = new RecordingTransport(WITNESS_ORIGIN);
    await expect(collectSubstrateFederatedMintReservationProducerV1(
      producerInput(primary, witness),
    )).rejects.toThrow(/finalized head changed during collection/i);
  });
});

function producerInput(
  primary: RecordingTransport,
  witness: RecordingTransport,
) {
  return {
    sources: createSubstrateFederatedMintReservationSourcePairV1({
      primaryRpc: new ReadOnlySubstrateFinalityRpc(primary),
      witnessRpc: new ReadOnlySubstrateFinalityRpc(witness),
    }),
    mintReservationStatement: vector.statement,
    familyIdHex: FAMILY_ID,
    expectedRuntimeCodeSha256Hex: RUNTIME_CODE_SHA256,
    expectedRuntimeCodeBytes: 4,
    expectedRuntimeProfileScaleHex: RUNTIME_PROFILE_SCALE_HEX,
    expectedSourceProofSystemIdHex: SOURCE_PROOF_SYSTEM_ID,
    expectedSourceProofProfileIdHex: SOURCE_PROOF_PROFILE_ID,
  } as const;
}

function collectWithWitness(overrides: TransportOptions) {
  const primary = new RecordingTransport(PRIMARY_ORIGIN);
  const witness = new RecordingTransport(WITNESS_ORIGIN, overrides);
  return collectSubstrateFederatedMintReservationProducerV1(
    producerInput(primary, witness),
  );
}

function buildRuntimeProfileScaleHex(): string {
  const sourceIntent = decodePegInSourceIntentV2Hex(
    vector.statement.sourceIntentHex,
  );
  return encodePooledReserveMintReservationRuntimeProfileV4ScaleHex({
    formatVersion: 4,
    lineageProfileIdHex: vector.statement.lineageProfileIdHex,
    sourceNetworkIdHex: sourceIntent.sourceNetworkIdHex,
    sidechainIdHex: sourceIntent.sidechainIdHex,
    bridgeAddressHex: sourceIntent.bridgeAddressHex,
    tokenAddressHex: sourceIntent.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: `0x${'b1'.repeat(32)}`,
    bridgeRuntimeCodeBytes: 4_096,
    tokenRuntimeCodeSha256Hex: `0x${'b2'.repeat(32)}`,
    tokenRuntimeCodeBytes: 2_048,
    settlementProfileIdHex: sourceIntent.settlementProfileIdHex,
    ergoDepositFinalityPolicyIdHex:
      vector.statement.ergoDepositFinalityPolicyIdHex,
    sourceProofSystemIdHex: SOURCE_PROOF_SYSTEM_ID,
    sourceProofProfileIdHex: SOURCE_PROOF_PROFILE_ID,
    activationHeight: '1',
    maxPendingBlocks: 20,
  });
}

function storageValues(): Map<string, string | null> {
  return new Map([
    [STORAGE_KEYS.runtimeCodeStorageKeyHex, RUNTIME_CODE_HEX],
    [STORAGE_KEYS.currentProfileStorageKeyHex, RUNTIME_PROFILE_SCALE_HEX],
    [STORAGE_KEYS.enforcementStorageKeyHex, '0x01'],
    [
      STORAGE_KEYS.pendingKeysStorageKeyHex,
      `0x04${vector.expected.reservationKeyHex.slice(2)}`,
    ],
    [
      STORAGE_KEYS.pendingReservationStorageKeyHex,
      pendingLifecycleRecordHex(),
    ],
    [STORAGE_KEYS.consumedReservationStorageKeyHex, null],
    [STORAGE_KEYS.invalidatedReservationStorageKeyHex, null],
  ]);
}

function pendingLifecycleRecordHex(
  overrides: {
    readonly issuedAt?: bigint;
    readonly reservedAt?: bigint;
    readonly expiresAt?: bigint;
  } = {},
): string {
  const issued = uint64Le(overrides.issuedAt ?? 89n);
  const reserved = uint64Le(overrides.reservedAt ?? 90n);
  const expires = uint64Le(overrides.expiresAt ?? 105n);
  const statementBytes = Buffer.from(
    vector.expected.statementHex.slice(2),
    'hex',
  );
  return `0x${Buffer.concat([
    Buffer.from([4]),
    Buffer.from(RUNTIME_PROFILE_ID.slice(2), 'hex'),
    Buffer.from([0x6d, 0x09]),
    statementBytes,
    Buffer.from(vector.expected.statementIdHex.slice(2), 'hex'),
    Buffer.from(vector.expected.reservationKeyHex.slice(2), 'hex'),
    Buffer.from(blake2b256Hex(statementBytes), 'hex'),
    Buffer.alloc(32, 0x77),
    Buffer.alloc(32, 0x88),
    issued,
    Buffer.alloc(32, 0x91),
    Buffer.alloc(32, 0x92),
    Buffer.alloc(32, 0x93),
    reserved,
    expires,
  ]).toString('hex')}`;
}

interface TransportOptions {
  readonly storage?: ReadonlyMap<string, string | null>;
  readonly proof?: readonly string[];
  readonly proofAt?: string;
  readonly stateRoot?: string;
  readonly finalizedHeads?: readonly string[];
}

class RecordingTransport implements SubstrateRpcTransport {
  readonly calls: Array<{
    readonly method: string;
    readonly params: readonly unknown[];
  }> = [];
  private finalizedHeadIndex = 0;

  constructor(
    readonly canonicalOrigin: string,
    private readonly options: TransportOptions = {},
  ) {}

  request<T = unknown>(
    method: string,
    params: readonly unknown[],
  ): Promise<T> {
    this.calls.push({ method, params });
    if (method === 'chain_getFinalizedHead') {
      const heads = this.options.finalizedHeads ?? [HEAD_HASH];
      const head = heads[Math.min(this.finalizedHeadIndex, heads.length - 1)];
      this.finalizedHeadIndex += 1;
      return Promise.resolve(head as T);
    }
    if (method === 'chain_getHeader') {
      return Promise.resolve({
        parentHash: `0x${'43'.repeat(32)}`,
        number: '0x64',
        stateRoot: this.options.stateRoot ?? STATE_ROOT,
        extrinsicsRoot: `0x${'66'.repeat(32)}`,
        digest: { logs: [] },
      } as T);
    }
    if (method === 'state_getStorage') {
      const values = this.options.storage ?? storageValues();
      return Promise.resolve(values.get(String(params[0])) as T);
    }
    if (method === 'state_getReadProof') {
      return Promise.resolve({
        at: this.options.proofAt ?? params[1],
        proof: this.options.proof ?? ['0x0102', '0x0304'],
      } as T);
    }
    return Promise.reject(new Error(`unexpected RPC method: ${method}`));
  }
}

function uint64Le(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
