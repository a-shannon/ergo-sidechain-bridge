import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V1_SCHEMA,
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1,
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
  parseSubstrateFederatedTrackerJvmCompilerOutputV1,
  validateSubstrateFederatedTrackerJvmCompilerLockV1,
  type SubstrateFederatedTrackerJvmCompilerLockV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
  type BuildSubstrateFederatedTrackerCompilerRequestV1Input,
  type SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import type {
  SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';

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
    readonly tracker: {
      readonly trackerNftIdHex: string;
    };
  };
}

const template = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV1.es',
  import.meta.url,
), 'utf8');
const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json',
  import.meta.url,
), 'utf8')) as TrackerVector;
const frozenIdentity = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json',
  import.meta.url,
), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;
const lock = validateSubstrateFederatedTrackerJvmCompilerLockV1(
  JSON.parse(readFileSync(new URL(
    '../../sources/substrate-federated-tracker-compiler-lock-v1.json',
    import.meta.url,
  ), 'utf8')),
);
let fixtureRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
let fixtureReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
let targetRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
let targetReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;

describe('substrate federated tracker process-owned JVM compiler V1', () => {
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
      fixtureRequest = request();
      fixtureReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV1(
        fixtureRequest,
      );
      targetRequest = request('9d'.repeat(32));
      targetReceipt = await compileSubstrateFederatedTrackerWithPinnedJvmV1(
        targetRequest,
      );
    } finally {
      process.env.NODE_OPTIONS = testNodeOptions;
    }
  }, 60_000);

  it('replays the fixture before compiling one distinct parameterized tracker', () => {
    expect(fixtureReceipt.schema)
      .toBe(SUBSTRATE_FEDERATED_TRACKER_JVM_COMPILER_RECEIPT_V1_SCHEMA);
    expect(fixtureReceipt.contract).toEqual({
      resolvedSourceSha256Hex: frozenIdentity.resolvedSourceSha256Hex,
      propositionBytes: frozenIdentity.propositionBytes,
      propositionHex: frozenIdentity.propositionHex,
      propositionSha256Hex: frozenIdentity.propositionSha256Hex,
      contractIdHex: frozenIdentity.contractIdHex,
    });
    expect(fixtureReceipt.checks).toEqual({
      sameProcessCompilerRequestVerified: true,
      processOwnedInputCreated: true,
      pinnedToolSourceCompiled: true,
      pinnedRuntimeSnapshotVerified: true,
      exactCompilerOutputBound: true,
      propositionIdentityRecomputed: true,
      jvmSerializationRoundTripVerified: true,
      callerContractIdentityAccepted: false,
      callerAuthorityClaimsAccepted: false,
    });
    expect(fixtureReceipt.boundaries).toEqual({
      profileActivated: false,
      targetGenesisBoxObserved: false,
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
    });
    expect(assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
      fixtureReceipt,
      fixtureRequest,
    )).toBe(fixtureReceipt);

    expect(targetReceipt.compilerRequestDigestHex)
      .toBe(targetRequest.requestDigestHex);
    expect(targetReceipt.contract.resolvedSourceSha256Hex)
      .toBe(targetRequest.template.resolvedSourceSha256Hex);
    expect(targetReceipt.contract.propositionHex)
      .not.toBe(fixtureReceipt.contract.propositionHex);
    expect(targetReceipt.contract.contractIdHex)
      .not.toBe(fixtureReceipt.contract.contractIdHex);
    expect(targetReceipt.boundaries.targetGenesisBoxObserved).toBe(false);
    expect(assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
      targetReceipt,
      targetRequest,
    )).toBe(targetReceipt);
  });

  it('rejects copied requests and caller-created receipt identities', async () => {
    await expect(compileSubstrateFederatedTrackerWithPinnedJvmV1(
      structuredClone(fixtureRequest),
    )).rejects.toThrow(/same-process provenance/);

    const callerReceipt = structuredClone(fixtureReceipt) as any;
    callerReceipt.contract.propositionHex =
      `00${callerReceipt.contract.propositionHex.slice(2)}`;
    callerReceipt.contract.propositionSha256Hex = createHash('sha256')
      .update(Buffer.from(callerReceipt.contract.propositionHex, 'hex'))
      .digest('hex');
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
      callerReceipt,
      fixtureRequest,
    )).toThrow(/lacks process provenance/);

    const parsedObservation = parseSubstrateFederatedTrackerJvmCompilerOutputV1(
      compilerOutput(fixtureReceipt),
      outputExpectation(fixtureRequest),
    );
    expect(parsedObservation.authority).toBe('observation-only');
    expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
      parsedObservation as any,
      fixtureRequest,
    )).toThrow(/lacks process provenance/);
  });

  it('rejects every output field and wire-format relaxation independently', () => {
    const canonical = compilerOutput(fixtureReceipt);
    const metadataFields = canonical.split('\n')[0].split('\t');
    const contractFields = canonical.split('\n')[1].split('\t');
    const mutations: Array<string | Buffer> = [
      ...metadataFields.map((value, index) => mutateOutputField(
        canonical,
        0,
        index,
        mutateCompilerField(value),
      )),
      ...contractFields.map((value, index) => mutateOutputField(
        canonical,
        1,
        index,
        mutateCompilerField(value),
      )),
      Buffer.alloc(0),
      Buffer.alloc(lock.maximumOutputBytes + 1, 0x61),
      Buffer.from([0xc3, 0x28]),
      canonical.slice(0, canonical.indexOf('\n') + 1),
      `${canonical}unexpected\n`,
      canonical.replace(/\n$/, ''),
      canonical.replace('\n', '\r\n'),
      canonical.replace('\n', '\0\n'),
      mutateOutputField(canonical, 1, 3, `0${contractFields[3]}`),
      mutateOutputField(canonical, 1, 3, `+${contractFields[3]}`),
      mutateOutputField(canonical, 1, 3, `${contractFields[3]}e0`),
    ];
    for (const mutation of mutations) {
      expect(() => parseSubstrateFederatedTrackerJvmCompilerOutputV1(
        mutation,
        outputExpectation(fixtureRequest),
      )).toThrow();
    }
  });

  it('rejects parent execution overrides before invoking the JVM', async () => {
    const nodeOptions = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--trace-warnings';
    try {
      await expect(compileSubstrateFederatedTrackerWithPinnedJvmV1(
        fixtureRequest,
      )).rejects.toThrow(/parent environment contains NODE_OPTIONS/);
    } finally {
      process.env.NODE_OPTIONS = nodeOptions;
    }

    const javaHome = process.env.JAVA_HOME;
    const invalidJavaHome = mkdtempSync(resolve(
      tmpdir(),
      'bridge-invalid-java-home-',
    ));
    writeFileSync(resolve(invalidJavaHome, 'marker'), 'not a Java distribution');
    delete process.env.NODE_OPTIONS;
    process.env.JAVA_HOME = invalidJavaHome;
    try {
      await expect(compileSubstrateFederatedTrackerWithPinnedJvmV1(
        fixtureRequest,
      )).rejects.toThrow(/Java home does not match its lock/);
    } finally {
      process.env.JAVA_HOME = javaHome;
      process.env.NODE_OPTIONS = nodeOptions;
      rmSync(invalidJavaHome, { recursive: true, force: true });
    }
  });

  it('keeps every authority boundary immutable and process-owned', () => {
    for (const field of [
      'profileActivated',
      'targetGenesisBoxObserved',
      'targetNetworkIdentityAuthenticated',
      'nodeCheckPerformed',
      'targetNodeAcceptanceEstablished',
      'signingAuthorityEstablished',
      'submissionAuthorityEstablished',
      'broadcastAuthorityEstablished',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'trustlessStatusEstablished',
    ] as const) {
      const promoted = structuredClone(fixtureReceipt) as any;
      promoted.boundaries[field] = true;
      expect(() => assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
        promoted,
        fixtureRequest,
      )).toThrow(/lacks process provenance/);
    }
    expect(Object.isFrozen(fixtureReceipt)).toBe(true);
    expect(Object.isFrozen(fixtureReceipt.contract)).toBe(true);
    expect(Object.isFrozen(fixtureReceipt.boundaries)).toBe(true);
  });

  it('rejects every lock constant, pin shape and unreviewed field independently', () => {
    for (const mutate of [
      (candidate: any) => { candidate.schemaVersion = 2; },
      (candidate: any) => { candidate.kind = 'other'; },
      (candidate: any) => { candidate.platform = 'linux-x64'; },
      (candidate: any) => { candidate.nodeVersion = '24.13.0'; },
      (candidate: any) => { candidate.trustedHostModel = 'shared'; },
      (candidate: any) => { candidate.dependencyRootPath = '../runtime'; },
      (candidate: any) => { candidate.sigmaStateVersion = '6.0.3'; },
      (candidate: any) => { candidate.scalaVersion = '2.13.0'; },
      (candidate: any) => { candidate.javaMajorVersion = 21; },
      (candidate: any) => { candidate.javaDistribution = 'other'; },
      (candidate: any) => { candidate.networkPrefix = 0; },
      (candidate: any) => { candidate.scriptVersion = 2; },
      (candidate: any) => { candidate.treeVersion = 1; },
      (candidate: any) => { candidate.toolPath = 'other.java'; },
      (candidate: any) => { candidate.mainClass = 'Other'; },
      (candidate: any) => { candidate.maximumInputBytes -= 1; },
      (candidate: any) => { candidate.maximumOutputBytes -= 1; },
      (candidate: any) => { candidate.nodeExecutableSha256 = 'zz'; },
      (candidate: any) => { candidate.dependencyClasspathSha256 = 'zz'; },
      (candidate: any) => { candidate.sigmaStateArtifactSha256 = 'zz'; },
      (candidate: any) => { candidate.javaHomeSha256 = 'zz'; },
      (candidate: any) => { candidate.javaExecutableSha256 = 'zz'; },
      (candidate: any) => { candidate.javacExecutableSha256 = 'zz'; },
      (candidate: any) => { candidate.toolSha256 = 'zz'; },
      (candidate: any) => { candidate.compiledToolClassesSha256 = 'zz'; },
      (candidate: any) => { candidate.dependencyClasspath.pop(); },
      (candidate: any) => { candidate.dependencyClasspath[0].name = '001-other.jar'; },
      (candidate: any) => { candidate.dependencyClasspath[0].sha256 = 'zz'; },
      (candidate: any) => { candidate.dependencyClasspath[0].unexpected = false; },
      (candidate: any) => { candidate.javacArguments[3] = '11'; },
      (candidate: any) => { candidate.javacArguments.pop(); },
      (candidate: any) => { candidate.forbiddenParentEnvironmentOverrides.pop(); },
      (candidate: any) => { candidate.forbiddenChildEnvironmentOverrides.pop(); },
      (candidate: any) => { candidate.unexpected = false; },
    ]) {
      const candidate = structuredClone(lock) as any;
      mutate(candidate);
      expect(() => validateSubstrateFederatedTrackerJvmCompilerLockV1(
        candidate,
      )).toThrow();
    }
  });
});

function request(
  trackerGenesisInputBoxIdHex = vector.input.tracker.trackerNftIdHex,
): Readonly<SubstrateFederatedTrackerCompilerRequestV1> {
  const statement = vector.input.statement;
  const input: BuildSubstrateFederatedTrackerCompilerRequestV1Input = {
    template: {
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      source: template,
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

function outputExpectation(
  compilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>,
) {
  return {
    requestDigestHex: compilerRequest.requestDigestHex,
    resolvedSourceSha256Hex:
      compilerRequest.template.resolvedSourceSha256Hex,
    lock,
  };
}

function compilerOutput(
  receipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>,
): string {
  const metadata = [
    'BRIDGE_FED_TRACKER_META',
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
    receipt.compilerRequestDigestHex,
  ].join('\t');
  const contract = [
    'BRIDGE_FED_TRACKER_CONTRACT',
    'tracker',
    receipt.contract.resolvedSourceSha256Hex,
    String(receipt.contract.propositionBytes),
    receipt.contract.propositionHex,
    receipt.contract.propositionSha256Hex,
    receipt.contract.contractIdHex,
  ].join('\t');
  return `${metadata}\n${contract}\n`;
}

function differentHex(value: string): string {
  return `${value.startsWith('aa') ? 'bb' : 'aa'}${value.slice(2)}`;
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

function mutateCompilerField(value: string): string {
  if (/^[0-9a-f]{64}$/.test(value)) return differentHex(value);
  if (/^[0-9a-f]+$/.test(value) && value.length % 2 === 0) {
    return `00${value.slice(2)}`;
  }
  if (/^[0-9]+$/.test(value)) return String(Number(value) + 1);
  return `${value}-mutated`;
}
