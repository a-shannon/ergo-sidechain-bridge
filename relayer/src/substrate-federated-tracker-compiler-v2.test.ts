import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointProfileV1Input,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import { sha256CanonicalJson } from './strict-json.js';
import type {
  SubstrateFederatedTrackerApplicationBindingV1,
} from './substrate-federated-tracker-compiler-v1.js';
import {
  SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2_SCHEMA,
  SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH,
  SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX,
  buildSubstrateFederatedTrackerCompilerRequestV2,
  resolveSubstrateFederatedTrackerCompilerSourceV2,
  type BuildSubstrateFederatedTrackerCompilerRequestV2Input,
} from './substrate-federated-tracker-compiler-v2.js';

interface TrackerVector {
  readonly input: {
    readonly profile: SubstrateFederatedCheckpointProfileV1Input;
    readonly statement: SubstrateFederatedTrackerApplicationBindingV1;
    readonly tracker: { readonly trackerNftIdHex: string };
  };
  readonly expected: {
    readonly encodedProfileHex: string;
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
  };
}

const template = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV2.es', import.meta.url,
), 'utf8');
const v1Template = readFileSync(new URL(
  '../../contracts/SPVTrackerSubstrateFederatedV1.es', import.meta.url,
), 'utf8');
const vector = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-admission.json', import.meta.url,
), 'utf8')) as TrackerVector;
const applicationFields = [
  'sourceNetworkIdHex',
  'sidechainIdHex',
  'bridgeAddressHex',
  'tokenAddressHex',
  'bridgeRuntimeCodeSha256Hex',
  'bridgeRuntimeCodeBytes',
  'tokenRuntimeCodeSha256Hex',
  'tokenRuntimeCodeBytes',
  'sourceRuntimeCodeSha256Hex',
  'sourceRuntimeCodeBytes',
  'runtimeProfileIdHex',
  'settlementProfileIdHex',
] as const;
const boundaryFields = [
  'profileActivated',
  'targetGenesisBoxObserved',
  'targetNetworkIdentityAuthenticated',
  'jvmCompilationReplayed',
  'compilerReceiptAuthenticated',
  'nodeCheckPerformed',
  'targetNodeAcceptanceEstablished',
  'signingAuthorityEstablished',
  'submissionAuthorityEstablished',
  'broadcastAuthorityEstablished',
  'fundsAuthorityEstablished',
  'gate5Closed',
  'trustlessStatusEstablished',
] as const;

describe('substrate federated tracker compiler V2', () => {
  it('binds a deterministic distinct V2 request with legacy checkpoint semantics', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    const repeated = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    expect(repeated).toEqual(request);
    expect(repeated).not.toBe(request);
    expect(resolveSubstrateFederatedTrackerCompilerSourceV2(repeated))
      .toBe(resolveSubstrateFederatedTrackerCompilerSourceV2(request));
    expect(request.schema).toBe('e2s.substrate-federated-tracker-compiler-request.v2');
    expect(request.schema).toBe(SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2_SCHEMA);
    expect(request.version).toBe(2);
    expect(request.anchorSelector).toBe('absolute-ergo-header-height');
    expect(request.compiler).toEqual({ scriptVersion: 3, treeVersion: 0 });
    expect(request.profile.version).toBe(1);
    expect(request.profile.encodedProfileHex).toBe(vector.expected.encodedProfileHex);
    expect(request.profile.profileIdHex).toBe(vector.expected.federationProfileIdHex);
    expect(request.application).toEqual(input().application);
    const { requestDigestHex, ...binding } = request;
    expect(requestDigestHex).toBe(sha256CanonicalJson(
      binding, 'E2S_SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2',
    ));
    expect(requestDigestHex).not.toBe(sha256CanonicalJson(
      binding, 'E2S_SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V1',
    ));
    expect(requestDigestHex).not.toBe(sha256CanonicalJson(
      { ...binding, anchorSelector: 'header-index' },
      'E2S_SUBSTRATE_FEDERATED_TRACKER_COMPILER_REQUEST_V2',
    ));
  });

  it('resolves exactly the pinned V2 source with each placeholder once', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    const source = resolveSubstrateFederatedTrackerCompilerSourceV2(request);
    // Independent literal substitutions for the tracked synthetic vector.
    const replacements: Record<string, string> = {
      FEDERATED_TRACKER_NFT_ID_PLACEHOLDER: '0d'.repeat(32),
      FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER: '01'.repeat(32),
      FEDERATED_SIDECHAIN_ID_PLACEHOLDER: '02'.repeat(32),
      FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER: '06'.repeat(20),
      FEDERATED_TOKEN_ADDRESS_PLACEHOLDER: '07'.repeat(20),
      FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER: '08'.repeat(32),
      FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER: '00003039',
      FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER: '09'.repeat(32),
      FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER: '00001a85',
      FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER: '0a'.repeat(32),
      FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER: '0000d431',
      FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER: '0b'.repeat(32),
      FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER: '0c'.repeat(32),
      FEDERATED_PROFILE_ID_PLACEHOLDER: vector.expected.federationProfileIdHex,
      FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER:
        vector.expected.sourceAttestationKeySetDigestHex,
      FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER: '0002',
      FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER:
        vector.expected.ergoAdmissionKeySetDigestHex,
      FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER: '0002',
      FEDERATED_EPOCH_PLACEHOLDER: '0000000000000007',
      FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER: '64L',
      FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS: vector.input.profile.ergoAdmissionPublicKeysHex
        .map(key => `proveDlog(decodePoint(fromBase16("${key}")))`).join(',\n    '),
      FEDERATED_ERGO_THRESHOLD_PLACEHOLDER: '2',
    };
    const placeholders = template.match(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g)!;
    expect(placeholders).toHaveLength(22);
    expect(new Set(placeholders).size).toBe(22);
    expect([...placeholders].sort()).toEqual(Object.keys(replacements).sort());
    const expectedSource = template.replace(
      /[A-Z][A-Z0-9_]+_PLACEHOLDERS?/g, placeholder => replacements[placeholder]!,
    );
    expect(source).toBe(expectedSource);
    expect(template).not.toContain('\r');
    expect(sha256(template))
      .toBe('110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec');
    expect(request.template).toEqual({
      relativePath: 'contracts/SPVTrackerSubstrateFederatedV2.es',
      templateSourceSha256Hex: SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_SHA256_HEX,
      resolvedSourceSha256Hex: sha256(expectedSource),
    });
    expect(source).toContain('val requestedAnchorHeight = getVar[Int](2).get');
    expect(source).toContain('anchorHeader.height == requestedAnchorHeight');
    expect(source).toContain('atLeast(2, ergoAdmissionKeys)');
    expect(source).not.toMatch(/[A-Z][A-Z0-9_]+_PLACEHOLDERS?/);
  });

  it('rejects V1 templates, relabelled V1 source and every template drift', () => {
    expect(() => buildSubstrateFederatedTrackerCompilerRequestV2({
      ...input(),
      template: { relativePath: 'contracts/SPVTrackerSubstrateFederatedV1.es', source: v1Template },
    })).toThrow(/path is not canonical/);
    for (const source of [
      v1Template,
      template + '\n',
      template.replace('SPVTrackerSubstrateFederatedV2', 'SPVTrackerSubstrateFederatedV3'),
      template.replace('FEDERATED_EPOCH_PLACEHOLDER', ''),
      template + 'FEDERATED_EPOCH_PLACEHOLDER',
      template + 'UNKNOWN_PLACEHOLDER',
    ]) {
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2({
        ...input(), template: { relativePath: SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH, source },
      })).toThrow(/template SHA-256 mismatch/);
    }
    expect(() => buildSubstrateFederatedTrackerCompilerRequestV2({
      ...input(), template: { relativePath: SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH, source: template.replace(/\n/g, '\r\n') },
    })).toThrow(/LF-only/);
    expect(() => buildSubstrateFederatedTrackerCompilerRequestV2({
      ...input(), template: { relativePath: SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH, source: '' },
    })).toThrow(/nonempty/);
  });

  it('rejects cloned, serialized, frozen-copy and forged requests', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    for (const copy of [
      structuredClone(request),
      JSON.parse(JSON.stringify(request)),
      Object.freeze({ ...request }),
      { ...request, version: 1 },
      { ...request, anchorSelector: 'header-index' },
    ]) {
      expect(() => resolveSubstrateFederatedTrackerCompilerSourceV2(copy))
        .toThrow(/same-process provenance/);
    }
    expect(resolveSubstrateFederatedTrackerCompilerSourceV2(request)).toBeTypeOf('string');
  });

  it.each(applicationFields)('binds application field %s into both digests', field => {
    const original = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    const changed = mutableInput();
    const previous = changed.application[field];
    changed.application[field] = typeof previous === 'number'
      ? previous + 1 : differentHex(previous);
    const request = buildSubstrateFederatedTrackerCompilerRequestV2(changed);
    expect(request.application[field]).toBe(changed.application[field]);
    expect(request.requestDigestHex).not.toBe(original.requestDigestHex);
    expect(request.template.resolvedSourceSha256Hex)
      .not.toBe(original.template.resolvedSourceSha256Hex);
  });

  it.each(applicationFields)('rejects malformed application field %s', field => {
    const original = input().application[field];
    const invalid = typeof original === 'number'
      ? [0, -1, 1.5, 0x1_0000_0000, NaN, Infinity, '1', null]
      : ['00'.repeat(original.length / 2), 'AB'.repeat(original.length / 2),
        original.slice(2), original + '00', 'gg'.repeat(original.length / 2), null];
    for (const value of invalid) {
      const changed = mutableInput();
      changed.application[field] = value;
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(changed)).toThrow();
    }
  });

  it('binds genesis identity and rejects noncanonical or zero IDs', () => {
    const original = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    const changed = buildSubstrateFederatedTrackerCompilerRequestV2({
      ...input(), trackerGenesisInputBoxIdHex: '9d'.repeat(32),
    });
    expect(changed.trackerNftIdHex).toBe('9d'.repeat(32));
    expect(changed.requestDigestHex).not.toBe(original.requestDigestHex);
    expect(changed.template.resolvedSourceSha256Hex)
      .not.toBe(original.template.resolvedSourceSha256Hex);
    expect(resolveSubstrateFederatedTrackerCompilerSourceV2(changed))
      .toContain(`fromBase16("${'9d'.repeat(32)}")`);
    for (const value of ['', '00'.repeat(32), 'AB'.repeat(32), 'ab'.repeat(31),
      'ab'.repeat(33), `0x${'ab'.repeat(32)}`, null, 1]) {
      const bad = mutableInput();
      bad.trackerGenesisInputBoxIdHex = value;
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(bad))
        .toThrow(/genesis input box ID/);
    }
  });

  it('binds each valid profile coordinate without changing V1 semantics', () => {
    const original = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    const changes = [
      { federationEpoch: '8' },
      { maxAdmissionValidityBlocks: '65' },
      { sourceAttestationThreshold: 1 },
      { sourceAttestationPublicKeysHex: vector.input.profile.sourceAttestationPublicKeysHex.slice(0, 2) },
      { ergoAdmissionThreshold: 1 },
      { ergoAdmissionPublicKeysHex: vector.input.profile.ergoAdmissionPublicKeysHex.slice(0, 2) },
    ];
    for (const change of changes) {
      const changed = buildSubstrateFederatedTrackerCompilerRequestV2({
        ...input(), profile: buildSubstrateFederatedCheckpointProfileV1({ ...vector.input.profile, ...change }),
      });
      expect(changed.profile.version).toBe(1);
      expect(changed.requestDigestHex).not.toBe(original.requestDigestHex);
      expect(changed.template.resolvedSourceSha256Hex)
        .not.toBe(original.template.resolvedSourceSha256Hex);
    }
  });

  it('rejects isolated profile metadata drift and corrupt encoded profiles', () => {
    for (const field of Object.keys(input().profile)) {
      const changed = mutableInput();
      const previous = changed.profile[field];
      changed.profile[field] = Array.isArray(previous) ? previous.slice(0, 1)
        : typeof previous === 'number' ? previous + 1 : previous + '00';
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(changed)).toThrow();
    }
    for (const encodedProfileHex of [
      '', '00', vector.expected.encodedProfileHex.slice(0, -2),
      vector.expected.encodedProfileHex + '00',
      '02010100' + vector.expected.encodedProfileHex.slice(8),
      vector.expected.encodedProfileHex.toUpperCase(),
    ]) {
      const changed = mutableInput();
      changed.profile.encodedProfileHex = encodedProfileHex;
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(changed)).toThrow();
    }
    for (const field of ['federationEpoch', 'maxAdmissionValidityBlocks'] as const) {
      const profile = buildSubstrateFederatedCheckpointProfileV1({
        ...vector.input.profile, [field]: '9223372036854775808',
      });
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2({ ...input(), profile }))
        .toThrow(/exceeds positive Ergo Long/);
      const maximum = buildSubstrateFederatedCheckpointProfileV1({
        ...vector.input.profile, [field]: '9223372036854775807',
      });
      expect(buildSubstrateFederatedTrackerCompilerRequestV2({ ...input(), profile: maximum })
        .profile[field]).toBe('9223372036854775807');
    }
  });

  it('rejects missing, extra and malformed input objects', () => {
    for (const target of ['input', 'template', 'application', 'profile']) {
      const original = mutableInput();
      const object = target === 'input' ? original : original[target];
      for (const field of Object.keys(object)) {
        const changed = mutableInput();
        delete (target === 'input' ? changed : changed[target])[field];
        expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(changed)).toThrow();
      }
      for (const extra of ['unexpected', Symbol('unexpected')]) {
        const changed = mutableInput();
        Object.defineProperty(target === 'input' ? changed : changed[target], extra, {
          value: false, enumerable: false,
        });
        expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(changed))
          .toThrow(/fields are not exact/);
      }
      for (const value of [null, undefined, [], 'invalid', 1]) {
        const changed = mutableInput();
        if (target !== 'input') changed[target] = value;
        expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(
          target === 'input' ? value as any : changed,
        )).toThrow();
      }
    }
  });

  it('isolates mutable caller copies and recursively freezes request data', () => {
    const caller = mutableInput();
    const before = structuredClone(caller);
    const request = buildSubstrateFederatedTrackerCompilerRequestV2(caller);
    const source = resolveSubstrateFederatedTrackerCompilerSourceV2(request);
    expect(caller).toEqual(before);
    expect(Object.isFrozen(caller.profile)).toBe(false);
    expect(Object.isFrozen(caller.application)).toBe(false);
    caller.template.source = 'changed';
    caller.trackerGenesisInputBoxIdHex = 'aa'.repeat(32);
    caller.application.sourceNetworkIdHex = 'bb'.repeat(32);
    caller.profile.ergoAdmissionPublicKeysHex[0] = '00';
    caller.profile.sourceAttestationPublicKeysHex[0] = '00';
    caller.profile.federationEpoch = '8';
    expect(request).toEqual(buildSubstrateFederatedTrackerCompilerRequestV2(before));
    expect(resolveSubstrateFederatedTrackerCompilerSourceV2(request)).toBe(source);
    for (const object of [request, request.template, request.compiler,
      request.application, request.profile, request.profile.ergoAdmissionPublicKeysHex,
      request.profile.sourceAttestationPublicKeysHex, request.boundaries]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
  });

  it('makes no compiler runtime or authority claims and accepts none from callers', () => {
    const request = buildSubstrateFederatedTrackerCompilerRequestV2(input());
    expect(Object.keys(request).sort()).toEqual([
      'schema', 'version', 'anchorSelector', 'requestDigestHex', 'compiler',
      'template', 'trackerNftIdHex', 'profile', 'application', 'boundaries',
    ].sort());
    expect(request).not.toHaveProperty('sigmaStateCommit');
    expect(request.compiler).toEqual({ scriptVersion: 3, treeVersion: 0 });
    expect(request.boundaries).toEqual(Object.fromEntries(
      boundaryFields.map(field => [field, false]),
    ));
    for (const field of [...boundaryFields, 'sigmaStateCommit', 'compiler', 'boundaries']) {
      const changed = mutableInput();
      changed[field] = true;
      expect(() => buildSubstrateFederatedTrackerCompilerRequestV2(changed))
        .toThrow(/fields are not exact/);
    }
  });
});

function input(): BuildSubstrateFederatedTrackerCompilerRequestV2Input {
  const statement = vector.input.statement;
  return {
    template: { relativePath: SUBSTRATE_FEDERATED_TRACKER_V2_TEMPLATE_PATH, source: template },
    trackerGenesisInputBoxIdHex: vector.input.tracker.trackerNftIdHex,
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
}

function mutableInput(): any {
  return structuredClone(input());
}

function differentHex(value: string): string {
  return `${value.startsWith('aa') ? 'bb' : 'aa'}${value.slice(2)}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
