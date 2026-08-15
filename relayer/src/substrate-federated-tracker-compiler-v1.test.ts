import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_COMPILER_FIXTURE_VALIDATION_V1_SCHEMA,
  SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1_SCHEMA,
  buildSubstrateFederatedTrackerCompilerRequestV1,
  resolveSubstrateFederatedTrackerCompilerSourceV1,
  validatePinnedSubstrateFederatedTrackerCompilerFixtureV1,
  type BuildSubstrateFederatedTrackerCompilerRequestV1Input,
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

describe('substrate federated tracker compiler V1', () => {
  it('resolves and validates the exact pinned JVM fixture through one request', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV1(input());
    const source = resolveSubstrateFederatedTrackerCompilerSourceV1(request);
    const validated = validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
      request,
      contractIdentity: frozenIdentity,
    });

    expect(request.schema)
      .toBe(SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1_SCHEMA);
    expect(request.trackerNftIdHex).toBe(vector.input.tracker.trackerNftIdHex);
    expect(request.template).toEqual({
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      templateSourceSha256Hex:
        '8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852',
      resolvedSourceSha256Hex:
        '7b8a1d7efe253360dfb2ae21ecd44199c061176e7e73a6f87960b66e304311d8',
    });
    expect(createHash('sha256').update(source).digest('hex'))
      .toBe(request.template.resolvedSourceSha256Hex);
    expect(source).toContain('atLeast(2, ergoAdmissionKeys)');
    expect(source).not.toMatch(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/);
    expect(validated.schema)
      .toBe(SUBSTRATE_FEDERATED_TRACKER_COMPILER_FIXTURE_VALIDATION_V1_SCHEMA);
    expect(validated.contract).toEqual(frozenIdentity);
    expect(Object.values(validated.boundaries).every(value => value === false))
      .toBe(true);
    expect(validated.checks).toEqual({
      sameProcessCompilerRequestVerified: true,
      exactPinnedFixtureIdentityMatched: true,
      exactTemplateAndResolvedSourceMatched: true,
      exactTrackerGenesisIdentityMatched: true,
      exactApplicationAndFederationProfileMatched: true,
      propositionMetadataSelfConsistent: true,
      jvmCompilationReplayedByThisValidation: false,
      callerAuthorityClaimsAccepted: false,
    });
    expect(Object.isFrozen(validated.contract)).toBe(true);
  });

  it('binds a target genesis box into a distinct source before compilation', () => {
    const fixtureRequest = buildSubstrateFederatedTrackerCompilerRequestV1(
      input(),
    );
    const targetRequest = buildSubstrateFederatedTrackerCompilerRequestV1(
      input('9d'.repeat(32)),
    );
    const targetSource = resolveSubstrateFederatedTrackerCompilerSourceV1(
      targetRequest,
    );

    expect(targetRequest.trackerNftIdHex).toBe('9d'.repeat(32));
    expect(targetRequest.requestDigestHex)
      .not.toBe(fixtureRequest.requestDigestHex);
    expect(targetRequest.template.resolvedSourceSha256Hex)
      .not.toBe(fixtureRequest.template.resolvedSourceSha256Hex);
    expect(targetSource).toContain(`fromBase16("${'9d'.repeat(32)}")`);
    expect(() => validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
      request: targetRequest,
      contractIdentity: frozenIdentity,
    })).toThrow(/request binding drifted/);

    const relabelledFixture = structuredClone(frozenIdentity) as any;
    relabelledFixture.trackerNftIdHex = targetRequest.trackerNftIdHex;
    relabelledFixture.resolvedSourceSha256Hex =
      targetRequest.template.resolvedSourceSha256Hex;
    expect(() => validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
      request: targetRequest,
      contractIdentity: relabelledFixture,
    })).toThrow(/not the pinned fixture/);
  });

  it('binds every application coordinate into the request and source', () => {
    const fixtureRequest = buildSubstrateFederatedTrackerCompilerRequestV1(
      input(),
    );
    const mutations: readonly ((application: any) => void)[] = [
      application => { application.sourceNetworkIdHex = differentHex(application.sourceNetworkIdHex); },
      application => { application.sidechainIdHex = differentHex(application.sidechainIdHex); },
      application => { application.bridgeAddressHex = differentHex(application.bridgeAddressHex); },
      application => { application.tokenAddressHex = differentHex(application.tokenAddressHex); },
      application => { application.bridgeRuntimeCodeSha256Hex = differentHex(application.bridgeRuntimeCodeSha256Hex); },
      application => { application.bridgeRuntimeCodeBytes += 1; },
      application => { application.tokenRuntimeCodeSha256Hex = differentHex(application.tokenRuntimeCodeSha256Hex); },
      application => { application.tokenRuntimeCodeBytes += 1; },
      application => { application.sourceRuntimeCodeSha256Hex = differentHex(application.sourceRuntimeCodeSha256Hex); },
      application => { application.sourceRuntimeCodeBytes += 1; },
      application => { application.runtimeProfileIdHex = differentHex(application.runtimeProfileIdHex); },
      application => { application.settlementProfileIdHex = differentHex(application.settlementProfileIdHex); },
    ];

    for (const mutate of mutations) {
      const changedInput = input();
      mutate(changedInput.application);
      const changedRequest = buildSubstrateFederatedTrackerCompilerRequestV1(
        changedInput,
      );
      expect(changedRequest.requestDigestHex)
        .not.toBe(fixtureRequest.requestDigestHex);
      expect(changedRequest.template.resolvedSourceSha256Hex)
        .not.toBe(fixtureRequest.template.resolvedSourceSha256Hex);
      expect(() => validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
        request: changedRequest,
        contractIdentity: frozenIdentity,
      })).toThrow();
    }
  });

  it('binds every federation profile coordinate into the request and source', () => {
    const fixtureRequest = buildSubstrateFederatedTrackerCompilerRequestV1(
      input(),
    );
    const mutations: readonly ((profile: any) => void)[] = [
      profile => { profile.federationEpoch = '8'; },
      profile => { profile.maxAdmissionValidityBlocks = '65'; },
      profile => { profile.sourceAttestationThreshold = 1; },
      profile => { profile.sourceAttestationPublicKeysHex = profile.sourceAttestationPublicKeysHex.slice(0, 2); },
      profile => { profile.ergoAdmissionThreshold = 1; },
      profile => { profile.ergoAdmissionPublicKeysHex = profile.ergoAdmissionPublicKeysHex.slice(0, 2); },
    ];

    for (const mutate of mutations) {
      const profile = structuredClone(vector.input.profile) as any;
      mutate(profile);
      const changedRequest = buildSubstrateFederatedTrackerCompilerRequestV1(
        input(vector.input.tracker.trackerNftIdHex, profile),
      );
      expect(changedRequest.requestDigestHex)
        .not.toBe(fixtureRequest.requestDigestHex);
      expect(changedRequest.template.resolvedSourceSha256Hex)
        .not.toBe(fixtureRequest.template.resolvedSourceSha256Hex);
      expect(() => validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
        request: changedRequest,
        contractIdentity: frozenIdentity,
      })).toThrow();
    }
  });

  it('rejects profile values outside the positive Ergo Long domain', () => {
    for (const [field, expected] of [
      ['federationEpoch', /federation epoch exceeds positive Ergo Long/],
      [
        'maxAdmissionValidityBlocks',
        /maximum validity blocks exceeds positive Ergo Long/,
      ],
    ] as const) {
      const profile = structuredClone(vector.input.profile) as any;
      profile[field] = '9223372036854775808';
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV1(
        input(vector.input.tracker.trackerNftIdHex, profile),
      )).toThrow(expected);
    }
  });

  it('rejects copied requests, template drift and isolated identity drift', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV1(input());
    expect(() => resolveSubstrateFederatedTrackerCompilerSourceV1(
      structuredClone(request),
    )).toThrow(/same-process provenance/);

    expect(() => buildSubstrateFederatedTrackerCompilerRequestV1({
      ...input(),
      template: {
        relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
        source: template.replace(
          'SPVTrackerSubstrateFederatedV1',
          'SPVTrackerSubstrateFederatedV1Drift',
        ),
      },
    })).toThrow(/template SHA-256 mismatch/);

    for (const mutate of [
      (identity: any) => {
        identity.application.runtimeProfileIdHex = 'ab'.repeat(32);
      },
      (identity: any) => {
        identity.propositionHex = `00${identity.propositionHex.slice(2)}`;
      },
      (identity: any) => {
        identity.unexpected = false;
      },
    ]) {
      const identity = structuredClone(frozenIdentity) as any;
      mutate(identity);
      expect(() => validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
        request,
        contractIdentity: identity,
      })).toThrow();
    }
  });

  it('rejects every caller-supplied authority claim in isolation', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV1(input());
    for (const field of [
      'sourceSignaturesVerifiedOnChain',
      'jvmReductionAccepted',
      'profileActivated',
      'signingPerformed',
      'submissionPerformed',
      'broadcastPerformed',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'trustlessStatusEstablished',
    ] as const) {
      const identity = structuredClone(frozenIdentity) as any;
      identity[field] = true;
      expect(() => validatePinnedSubstrateFederatedTrackerCompilerFixtureV1({
        request,
        contractIdentity: identity,
      })).toThrow(/authority claim/);
    }
  });
});

function input(
  trackerGenesisInputBoxIdHex = vector.input.tracker.trackerNftIdHex,
  profileInput: SubstrateFederatedCheckpointProfileV1Input = vector.input.profile,
): BuildSubstrateFederatedTrackerCompilerRequestV1Input {
  const statement = vector.input.statement;
  return {
    template: {
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es',
      source: template,
    },
    trackerGenesisInputBoxIdHex,
    profile: buildSubstrateFederatedCheckpointProfileV1(profileInput),
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
}

function differentHex(value: string): string {
  return `${value.startsWith('aa') ? 'bb' : 'aa'}${value.slice(2)}`;
}
