import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import blakejs from 'blakejs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1,
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V1_SCHEMA,
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
  parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1,
  type CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS,
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
  type SubstrateFederatedSettlementFamilyV1CompilerRequest,
} from './substrate-federated-settlement-family-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
  validateSubstrateFederatedTrackerJvmCompilerLockV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
  type BuildSubstrateFederatedTrackerCompilerRequestV1Input,
  type SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

interface TrackerVector {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: {
      readonly sourceNetworkIdHex: string;
      readonly sidechainIdHex: string;
      readonly bridgeAddressHex: string;
      readonly tokenAddressHex: string;
      readonly bridgeRuntimeCodeSha256Hex: string;
      readonly bridgeRuntimeCodeBytes: number;
      readonly tokenRuntimeCodeSha256Hex: string;
      readonly tokenRuntimeCodeBytes: number;
      readonly sourceRuntimeCodeSha256Hex: string;
      readonly sourceRuntimeCodeBytes: number;
      readonly runtimeProfileIdHex: string;
      readonly settlementProfileIdHex: string;
    };
    readonly tracker: { readonly trackerNftIdHex: string };
  };
}

interface FrozenCompilerBatch {
  readonly contracts: readonly Readonly<{
    readonly role: 'duplicatePrevention' | 'sourceLock' | 'pooledReserve';
    readonly resolvedSourceSha256Hex: string;
    readonly propositionBytes: number;
    readonly propositionHex: string;
    readonly propositionSha256Hex: string;
    readonly contractIdHex: string;
  }>[];
}

const trackerTemplate = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV1.es',
  import.meta.url,
), 'utf8');
const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as TrackerVector;
const frozenBatch = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json',
  import.meta.url,
), 'utf8')) as FrozenCompilerBatch;
const lock = validateSubstrateFederatedTrackerJvmCompilerLockV1(
  JSON.parse(readFileSync(new URL(
    '../../sources/substrate-federated-tracker-compiler-lock-v1.json',
    import.meta.url,
  ), 'utf8')),
);

let fixtureTrackerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
let fixtureTrackerReceipt:
  Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
let fixtureReceipt:
  Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
let siblingInput:
  Readonly<CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input>;
let siblingReceipt:
  Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
let targetTrackerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
let targetTrackerReceipt:
  Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
let targetReceipt:
  Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;

describe('substrate federated settlement-family process-owned JVM compiler V1', () => {
  beforeAll(async () => {
    if (
      ORIGINAL_NODE_OPTIONS !== undefined
      || process.env.NODE_OPTIONS !== '--no-deprecation'
    ) {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const testNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    try {
      fixtureTrackerRequest = trackerRequest();
      fixtureTrackerReceipt =
        await compileSubstrateFederatedTrackerWithPinnedJvmV1(
          fixtureTrackerRequest,
        );
      fixtureReceipt =
        await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
          familyCompilerInput(fixtureTrackerRequest, fixtureTrackerReceipt),
        );
      siblingInput = {
        ...familyCompilerInput(fixtureTrackerRequest, fixtureTrackerReceipt),
        duplicatePreventionGenesisInputBoxIdHex: '10'.repeat(32),
      };
      siblingReceipt =
        await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
          siblingInput,
        );
      targetTrackerRequest = trackerRequest('9d'.repeat(32));
      targetTrackerReceipt =
        await compileSubstrateFederatedTrackerWithPinnedJvmV1(
          targetTrackerRequest,
        );
      targetReceipt =
        await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
          familyCompilerInput(targetTrackerRequest, targetTrackerReceipt),
        );
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
  }, 120_000);

  it('replays the frozen family before compiling one distinct dependent family', () => {
    expect(fixtureReceipt.schema).toBe(
      SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_JVM_COMPILER_RECEIPT_V1_SCHEMA,
    );
    expect(Object.fromEntries(Object.entries(fixtureReceipt.contracts).map(
      ([role, contract]) => [role, contract.contractIdHex],
    ))).toEqual(SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_CONTRACT_IDS);
    for (const expected of frozenBatch.contracts) {
      expect(fixtureReceipt.contracts[expected.role]).toEqual({
        resolvedSourceSha256Hex: expected.resolvedSourceSha256Hex,
        propositionBytes: expected.propositionBytes,
        propositionHex: expected.propositionHex,
        propositionSha256Hex: expected.propositionSha256Hex,
        contractIdHex: expected.contractIdHex,
      });
    }
    expect(fixtureReceipt.checks).toEqual({
      sameProcessTrackerRequestVerified: true,
      sameProcessTrackerReceiptVerified: true,
      trackerBindingDerivedInternally: true,
      processOwnedFamilyRequestCreated: true,
      predecessorContractsCompiledFirst: true,
      reserveContractIdsDerivedFromPropositions: true,
      reserveSourceDependencyRecomputed: true,
      exactCompilerOutputBound: true,
      callerTrackerIdentityAccepted: false,
      callerFamilyIdentityAccepted: false,
      callerAuthorityClaimsAccepted: false,
    });
    expect(fixtureReceipt.boundaries).toEqual({
      profileActivated: false,
      targetGenesisBoxesObserved: false,
      targetNetworkIdentityAuthenticated: false,
      jvmCompilationReplayed: true,
      compilerReceiptAuthenticated: true,
      trustedHostRequired: true,
      concurrentSameUserTamperingOutOfScope: true,
      nodeCheckPerformed: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
      fixtureReceipt,
      familyCompilerInput(fixtureTrackerRequest, fixtureTrackerReceipt),
    )).toBe(fixtureReceipt);
    expect(assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
      siblingReceipt,
      siblingInput,
    )).toBe(siblingReceipt);
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
      siblingReceipt,
      familyCompilerInput(fixtureTrackerRequest, fixtureTrackerReceipt),
    )).toThrow(/family binding drifted/);
    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
      fixtureReceipt,
      siblingInput,
    )).toThrow(/family binding drifted/);

    expect(targetReceipt.trackerCompilerRequestDigestHex)
      .toBe(targetTrackerRequest.requestDigestHex);
    expect(targetReceipt.trackerCompilerReceiptDigestHex)
      .toBe(targetTrackerReceipt.receiptDigestHex);
    expect(targetReceipt.profile.familyIdHex)
      .not.toBe(fixtureReceipt.profile.familyIdHex);
    for (const role of [
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ] as const) {
      expect(targetReceipt.contracts[role].contractIdHex)
        .not.toBe(fixtureReceipt.contracts[role].contractIdHex);
    }
  });

  it('rejects copied tracker provenance and caller identity fields', async () => {
    await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
      familyCompilerInput(
        structuredClone(fixtureTrackerRequest),
        fixtureTrackerReceipt,
      ),
    )).rejects.toThrow(/same-process provenance/);
    await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1(
      familyCompilerInput(
        fixtureTrackerRequest,
        structuredClone(fixtureTrackerReceipt),
      ),
    )).rejects.toThrow(/process provenance/);

    const canonical = familyCompilerInput(
      fixtureTrackerRequest,
      fixtureTrackerReceipt,
    );
    await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      ...canonical,
      tracker: { contractIdHex: fixtureTrackerReceipt.contract.contractIdHex },
    } as any)).rejects.toThrow(/contain exactly/);
    await expect(compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      ...canonical,
      familyIdentity: { familyIdHex: fixtureReceipt.profile.familyIdHex },
    } as any)).rejects.toThrow(/contain exactly/);

    expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
      structuredClone(fixtureReceipt),
      familyCompilerInput(fixtureTrackerRequest, fixtureTrackerReceipt),
    )).toThrow(/lacks process provenance/);
  });

  it('binds reserve source to the proposition-derived predecessor IDs', () => {
    const request = familyRequest(fixtureTrackerRequest, fixtureTrackerReceipt);
    const canonical = compilerOutput(fixtureReceipt);
    const changedPredecessor = mutateContractProposition(canonical, 1);
    const observation =
      parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(
        changedPredecessor,
        outputExpectation(fixtureReceipt),
      );
    expect(observation.authority).toBe('observation-only');
    expect(() => bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1(
      observation,
      request,
    )).toThrow(/reserve dependency binding drifted/);

    const changedSource = mutateOutputField(
      canonical,
      2,
      2,
      differentHex(fixtureReceipt.contracts.sourceLock.resolvedSourceSha256Hex),
    );
    const sourceObservation =
      parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(
        changedSource,
        outputExpectation(fixtureReceipt),
      );
    expect(() => bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1(
      sourceObservation,
      request,
    )).toThrow(/predecessor source binding drifted/);
  });

  it('rejects record order, wire relaxations and unparsed observations', () => {
    const canonical = compilerOutput(fixtureReceipt);
    const lines = canonical.slice(0, -1).split('\n');
    const propositionBytes =
      String(fixtureReceipt.contracts.duplicatePrevention.propositionBytes);
    const swapped = [lines[0], lines[2], lines[1], lines[3]].join('\n') + '\n';
    for (const mutation of [
      swapped,
      canonical.slice(0, canonical.indexOf('\n') + 1),
      `${canonical}unexpected\n`,
      canonical.replace(/\n$/, ''),
      canonical.replace('\n', '\r\n'),
      canonical.replace('\n', '\0\n'),
      Buffer.alloc(0),
      Buffer.alloc(lock.maximumOutputBytes + 1, 0x61),
      Buffer.from([0xc3, 0x28]),
      mutateOutputField(canonical, 1, 3, `0${propositionBytes}`),
      mutateOutputField(canonical, 1, 3, `+${propositionBytes}`),
      mutateOutputField(canonical, 1, 3, `${propositionBytes}e0`),
      mutateOutputField(canonical, 0, 11, differentHex(
        fixtureReceipt.familyCompilerRequestDigestHex,
      )),
      mutateOutputField(canonical, 3, 1, 'sourceLock'),
    ]) {
      expect(() => parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(
        mutation,
        outputExpectation(fixtureReceipt),
      )).toThrow();
    }
    const parsed = parseSubstrateFederatedSettlementFamilyJvmCompilerOutputV1(
      canonical,
      outputExpectation(fixtureReceipt),
    );
    expect(() => bindSubstrateFederatedSettlementFamilyJvmCompilerObservationV1(
      { ...parsed, authority: 'observation-only' },
      familyRequest(fixtureTrackerRequest, fixtureTrackerReceipt),
    )).toThrow(/lacks parser provenance/);
  });

  it('keeps every authority boundary immutable and process-owned', () => {
    for (const field of [
      'profileActivated',
      'targetGenesisBoxesObserved',
      'targetNetworkIdentityAuthenticated',
      'nodeCheckPerformed',
      'targetNodeAcceptanceEstablished',
      'signingAuthorityEstablished',
      'submissionAuthorityEstablished',
      'broadcastAuthorityEstablished',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'trustlessStatusEstablished',
      'productionReadinessEstablished',
    ] as const) {
      const promoted = structuredClone(fixtureReceipt) as any;
      promoted.boundaries[field] = true;
      expect(() => assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
        promoted,
        familyCompilerInput(fixtureTrackerRequest, fixtureTrackerReceipt),
      )).toThrow(/lacks process provenance/);
    }
    expect(Object.isFrozen(fixtureReceipt)).toBe(true);
    expect(Object.isFrozen(fixtureReceipt.contracts.pooledReserve)).toBe(true);
    expect(Object.isFrozen(fixtureReceipt.boundaries)).toBe(true);
  });
});

function trackerRequest(
  trackerGenesisInputBoxIdHex = vector.input.tracker.trackerNftIdHex,
): Readonly<SubstrateFederatedTrackerCompilerRequestV1> {
  const statement = vector.input.statement;
  const input: BuildSubstrateFederatedTrackerCompilerRequestV1Input = {
    template: {
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      source: trackerTemplate,
    },
    trackerGenesisInputBoxIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(vector.input.profile),
    application: {
      sourceNetworkIdHex: statement.sourceNetworkIdHex,
      sidechainIdHex: statement.sidechainIdHex,
      bridgeAddressHex: statement.bridgeAddressHex,
      tokenAddressHex: statement.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: statement.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: statement.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: statement.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: statement.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: statement.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: statement.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: statement.runtimeProfileIdHex,
      settlementProfileIdHex: statement.settlementProfileIdHex,
    },
  };
  return buildSubstrateFederatedTrackerCompilerRequestV1(input);
}

function familyCompilerInput(
  tracker: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
  receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>,
): CompileSubstrateFederatedSettlementFamilyWithPinnedJvmV1Input {
  return {
    trackerRequest: tracker,
    trackerReceipt: receipt,
    templates: {
      duplicatePrevention: contractTemplate(
        'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
      ),
      sourceLock: contractTemplate('contracts/MainChainLockPooledReserveV6.es'),
      pooledReserve: contractTemplate(
        'contracts/MainChainPooledReserveValidityApplicationV6.es',
      ),
    },
    duplicatePreventionGenesisInputBoxIdHex: '0e'.repeat(32),
    pooledReserveGenesisInputBoxIdHex: '0f'.repeat(32),
  };
}

function contractTemplate(relativePath: string) {
  return {
    relativePath,
    source: readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8'),
  };
}

function familyRequest(
  tracker: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
  receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>,
): Readonly<SubstrateFederatedSettlementFamilyV1CompilerRequest> {
  const input = familyCompilerInput(tracker, receipt);
  return buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
    templates: input.templates,
    duplicatePreventionGenesisInputBoxIdHex:
      input.duplicatePreventionGenesisInputBoxIdHex,
    pooledReserveGenesisInputBoxIdHex:
      input.pooledReserveGenesisInputBoxIdHex,
    tracker: {
      contractIdHex: receipt.contract.contractIdHex,
      templateSourceSha256Hex: tracker.template.templateSourceSha256Hex,
      trackerNftIdHex: tracker.trackerNftIdHex,
      sourceNetworkIdHex: tracker.application.sourceNetworkIdHex,
      sidechainIdHex: tracker.application.sidechainIdHex,
      bridgeAddressHex: tracker.application.bridgeAddressHex,
      tokenAddressHex: tracker.application.tokenAddressHex,
      runtimeProfileIdHex: tracker.application.runtimeProfileIdHex,
      settlementProfileIdHex: tracker.application.settlementProfileIdHex,
      federationProfileIdHex: tracker.profile.profileIdHex,
      sourceAttestationKeySetDigestHex:
        tracker.profile.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold: tracker.profile.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex:
        tracker.profile.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: tracker.profile.ergoAdmissionThreshold,
      federationEpoch: tracker.profile.federationEpoch,
    },
  });
}

function outputExpectation(
  receipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>,
) {
  return {
    requestDigestHex: receipt.familyCompilerRequestDigestHex,
    lock,
  };
}

function compilerOutput(
  receipt: Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>,
): string {
  const metadata = [
    'BRIDGE_FED_FAMILY_META',
    '1',
    '16',
    '3',
    '0',
    '17',
    '2.12.20',
    receipt.compiler.sigmaStateArtifactSha256,
    receipt.compiler.dependencyClasspathSha256,
    receipt.compiler.javaHomeSha256,
    receipt.compiler.compiledToolClassesSha256,
    receipt.familyCompilerRequestDigestHex,
  ].join('\t');
  const contracts = ([
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ] as const).map(role => {
    const contract = receipt.contracts[role];
    return [
      'BRIDGE_FED_FAMILY_CONTRACT',
      role,
      contract.resolvedSourceSha256Hex,
      String(contract.propositionBytes),
      contract.propositionHex,
      contract.propositionSha256Hex,
      contract.contractIdHex,
    ].join('\t');
  });
  return `${[metadata, ...contracts].join('\n')}\n`;
}

function mutateContractProposition(output: string, lineIndex: number): string {
  const lines = output.slice(0, -1).split('\n');
  const fields = lines[lineIndex].split('\t');
  fields[4] = `${fields[4].startsWith('00') ? '01' : '00'}${fields[4].slice(2)}`;
  const proposition = Buffer.from(fields[4], 'hex');
  fields[5] = createHash('sha256').update(proposition).digest('hex');
  fields[6] = Buffer.from(
    blakejs.blake2b(proposition, undefined, 32),
  ).toString('hex');
  lines[lineIndex] = fields.join('\t');
  return `${lines.join('\n')}\n`;
}

function mutateOutputField(
  output: string,
  lineIndex: number,
  fieldIndex: number,
  value: string,
): string {
  const lines = output.slice(0, -1).split('\n');
  const fields = lines[lineIndex].split('\t');
  fields[fieldIndex] = value;
  lines[lineIndex] = fields.join('\t');
  return `${lines.join('\n')}\n`;
}

function differentHex(value: string): string {
  return `${value.startsWith('aa') ? 'bb' : 'aa'}${value.slice(2)}`;
}
