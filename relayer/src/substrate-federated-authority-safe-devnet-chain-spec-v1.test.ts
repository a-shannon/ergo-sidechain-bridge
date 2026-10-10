import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1,
  validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1,
} from './substrate-federated-authority-safe-devnet-chain-spec-v1.js';
import { main as buildChainSpec } from './scripts/build-substrate-federated-authority-safe-devnet-chain-spec.js';
import {
  buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1,
} from './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const BRIDGE_ADDRESS = `0x${'06'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'07'.repeat(20)}`;
const OWNER_ADDRESS = '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const FRONTIER_PATCH_SHA256 =
  'bd8500696af4dd7b67dd99c9446f5ef2f23803e58f6669a5e80d8548124d7634';
const FRONTIER_COMMIT = '75329a2df49e2cc7981485392c31160929d1bd48';
const RUNTIME_CODE_HEX = '0x00';
const RUNTIME_CODE_SHA256 = createHash('sha256')
  .update(Buffer.from('00', 'hex'))
  .digest('hex');

describe('Substrate federated authority-safe devnet chain spec V1', () => {
  it('builds one deterministic typed-quarantine candidate without Sudo or mint authority', () => {
    const first = buildBytes(Buffer.from(JSON.stringify(baseSpec())));
    const second = buildBytes(Buffer.from(JSON.stringify(baseSpec())));

    expect(Buffer.from(first.chainSpecBytes).equals(
      Buffer.from(second.chainSpecBytes),
    )).toBe(true);
    expect(first.report).toEqual(second.report);
    expect(first.report).toMatchObject({
      status: 'isolated_authority_safe_genesis_candidate',
      chain: {
        name: 'Bridge Federated Authority-Safe Target',
        id: 'bridge_federated_authority_safe',
        protocolId: 'bridge-fed-authority-safe',
        chainType: 'Development',
        chainId: '42',
      },
      source: {
        frontierCommit: FRONTIER_COMMIT,
        frontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
        runtimeCodeByteLength: 1,
        runtimeCodeSha256Hex: RUNTIME_CODE_SHA256,
        removedSudoAddress: OWNER_ADDRESS,
      },
      application: {
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        bridgeOwnerAddress: OWNER_ADDRESS,
        tokenOwnerAddress: BRIDGE_ADDRESS,
        bridgeRuntimeByteLength: 4104,
        tokenRuntimeByteLength: 2356,
      },
      checks: {
        trackedFrontierPatchBytesVerified: true,
        runtimeCodePinVerified: true,
        typedLegacyMintQuarantineConfigured: true,
        sudoKeyRemoved: true,
        activeMintProfileGenesisFieldsAbsent: true,
      },
      boundaries: {
        historicalOwnerMintEntrypointEmbedded: true,
        authoritySafeTargetIdentityObserved: false,
        legacyOwnerMintRuntimeRejectionObserved: false,
        independentSourceOriginsEstablished: false,
        federatedLaunchEligible: false,
        federatedMintAuthorityEstablished: false,
        transactionConstructed: false,
        transactionSigned: false,
        transactionSubmitted: false,
        transactionBroadcast: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
      },
    });

    const spec = JSON.parse(Buffer.from(first.chainSpecBytes).toString('utf8'));
    const patch = spec.genesis.runtimeGenesis.patch;
    expect(spec.name).toBe('Bridge Federated Authority-Safe Target');
    expect(spec.id).toBe('bridge_federated_authority_safe');
    expect(spec.protocolId).toBe('bridge-fed-authority-safe');
    expect(patch.sudo).toEqual({ key: null });
    expect(patch.bridgeCommitment).toEqual({
      legacyMintQuarantineAddress: BRIDGE_ADDRESS,
    });
    expect(Object.keys(patch.bridgeCommitment)).toEqual([
      'legacyMintQuarantineAddress',
    ]);
    expect(patch.evm.accounts[BRIDGE_ADDRESS].code).toHaveLength(4104);
    expect(patch.evm.accounts[TOKEN_ADDRESS].code).toHaveLength(2356);
    expect(spec.genesis.runtimeGenesis.code).toBe(RUNTIME_CODE_HEX);
  });

  it('rejects source-pin drift, retained profiles, malformed Sudo, and schema crossing', () => {
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(baseSpec())),
      { expectedFrontierPatchSha256Hex: '0'.repeat(64) },
    )).toThrow(/patch digest differs from the explicit pin/);
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(baseSpec())),
      { expectedRuntimeCodeSha256Hex: '0'.repeat(64) },
    )).toThrow(/runtime code differs from the explicit pin/);
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(baseSpec())),
      { expectedBaseSpecSha256Hex: '0'.repeat(64) },
    )).toThrow(/chain spec differs from the explicit pin/);
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(baseSpec())),
      { expectedFrontierCommit: '0'.repeat(40) },
    )).toThrow(/commit differs from the explicit pin/);
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(baseSpec())),
      { expectedSudoAddress: `0x${'09'.repeat(20)}` },
    )).toThrow(/Sudo identity differs from the explicit pin/);

    const retainedProfile = baseSpec();
    retainedProfile.genesis.runtimeGenesis.patch.bridgeCommitment = {
      currentPegInProfile: '0x01',
    };
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(retainedProfile)),
    )).toThrow(/must not contain a bridgeCommitment genesis profile/);

    const missingSudo = baseSpec();
    delete (missingSudo.genesis.runtimeGenesis.patch as {
      sudo?: unknown;
    }).sudo;
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(missingSudo)),
    )).toThrow(/base Sudo genesis config must be an object/);

    const extendedSudo = baseSpec();
    extendedSudo.genesis.runtimeGenesis.patch.sudo.extra = true;
    expect(() => buildBytes(
      Buffer.from(JSON.stringify(extendedSudo)),
    )).toThrow(/must contain only one key/);

    const generated = buildBytes(Buffer.from(JSON.stringify(baseSpec())));
    expect(() => buildBytes(generated.chainSpecBytes)).toThrow(
      /must not contain a bridgeCommitment genesis profile/,
    );
    expect(() => buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1({
      bridgeRoot: BRIDGE_ROOT,
      baseSpecBytes: generated.chainSpecBytes,
      expectedChainId: 42n,
      bridgeAddress: BRIDGE_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      bridgeOwnerAddress: OWNER_ADDRESS,
    })).toThrow(/address is already occupied/);
  });

  it('rejects coordinated quarantine, Sudo, profile, runtime, application, and authority drift', () => {
    const candidate = buildBytes(Buffer.from(JSON.stringify(baseSpec())));
    const mutations: readonly (readonly [
      string,
      (spec: Record<string, unknown>) => void,
    ])[] = [
      ['missing quarantine', spec => {
        delete runtimePatch(spec).bridgeCommitment;
      }],
      ['retargeted quarantine', spec => {
        runtimePatch(spec).bridgeCommitment = {
          legacyMintQuarantineAddress: `0x${'08'.repeat(20)}`,
        };
      }],
      ['active profile', spec => {
        runtimePatch(spec).bridgeCommitment = {
          legacyMintQuarantineAddress: BRIDGE_ADDRESS,
          currentPegInProfile: '0x01',
        };
      }],
      ['retained Sudo', spec => {
        runtimePatch(spec).sudo = { key: OWNER_ADDRESS };
      }],
      ['runtime mutation', spec => {
        runtimeGenesis(spec).code = '0x01';
      }],
      ['application storage mutation', spec => {
        const accounts = evmAccounts(spec);
        const bridge = accounts[BRIDGE_ADDRESS] as Record<string, unknown>;
        const storage = bridge.storage as Record<string, unknown>;
        storage[`0x${'0'.repeat(63)}3`] = `0x${'0'.repeat(64)}`;
      }],
      ['noncanonical application key', spec => {
        const accounts = evmAccounts(spec);
        accounts[BRIDGE_ADDRESS.toUpperCase().replace('0X', '0x')] =
          accounts[BRIDGE_ADDRESS];
        delete accounts[BRIDGE_ADDRESS];
      }],
    ];
    for (const [label, mutate] of mutations) {
      expect(() => validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1(
        validationInput(coordinatedMutation(candidate, mutate)),
      ), label).toThrow();
    }
    const widenedReport = {
      ...candidate.report,
      boundaries: {
        ...candidate.report.boundaries,
        federatedLaunchEligible: true,
      },
    } as unknown as typeof candidate.report;
    expect(() => validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
      ...validationInput(candidate),
      report: widenedReport,
    })).toThrow(/widens authority/);

    for (const targetPinMutation of [
      { expectedChainId: 43n },
      { expectedBridgeAddress: `0x${'08'.repeat(20)}` },
      { expectedTokenAddress: `0x${'09'.repeat(20)}` },
      { expectedBridgeOwnerAddress: `0x${'0a'.repeat(20)}` },
    ]) {
      expect(() => validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
        ...validationInput(candidate),
        ...targetPinMutation,
      })).toThrow();
    }

    for (const reportMutation of [
      {
        ...candidate.report,
        source: {
          ...candidate.report.source,
          frontierPatchSha256Hex: '0'.repeat(64),
        },
      },
      {
        ...candidate.report,
        baseSpecSha256Hex: '0'.repeat(64),
      },
      {
        ...candidate.report,
        legacyApplicationEmbeddingSha256Hex: '0'.repeat(64),
      },
      {
        ...candidate.report,
        checks: {
          ...candidate.report.checks,
          trackedFrontierPatchBytesVerified: false,
        },
      },
    ]) {
      expect(() => validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
        ...validationInput(candidate),
        report: reportMutation as unknown as typeof candidate.report,
      })).toThrow();
    }

    const coordinatedEmbeddingDrift = coordinatedLegacyEmbeddingMutation(
      candidate,
      spec => {
        evmAccounts(spec)[`0x${'0b'.repeat(20)}`] = {
          balance: '0x1',
          code: [0],
          nonce: '0x1',
          storage: {},
        };
      },
    );
    expect(() => validateSubstrateFederatedAuthoritySafeDevnetChainSpecV1(
      validationInput(coordinatedEmbeddingDrift),
    )).toThrow(/legacy application embedding differs from the pinned base spec/);
  });

  it('preserves exact numeric lexemes through both application and authority-safe transforms', () => {
    const largeBalance = '1000000000000000000000000';
    const probe =
      '"numericProbe":{"negativeZero":-0,"fraction":1.2500,'
      + '"exponent":6.02e+23,"dense":[0,1,-2,3.0,4E-2]},';
    const source = JSON.stringify(baseSpec())
      .replace('"balance":"0x1"', `"balance":${largeBalance}`)
      .replace('"genesis":', `${probe}"genesis":`);
    const generated = Buffer.from(
      buildBytes(Buffer.from(source)).chainSpecBytes,
    ).toString('utf8');

    expect(generated).toContain(`"balance":${largeBalance}`);
    expect(generated).toContain(
      '"numericProbe":{"negativeZero":-0,"fraction":1.2500,'
      + '"exponent":6.02e+23,"dense":[0,1,-2,3.0,4E-2]}',
    );
  });

  it('writes one create-only out-of-repository candidate and refuses overwrite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fed6g1b-chain-spec-'));
    const basePath = join(directory, 'base.json');
    const outputPath = join(directory, 'target.json');
    writeFileSync(basePath, JSON.stringify(baseSpec()));
    const args = [
      '--base-spec', basePath,
      '--output-spec', outputPath,
      '--expected-chain-id', '42',
      '--bridge-address', BRIDGE_ADDRESS,
      '--token-address', TOKEN_ADDRESS,
      '--bridge-owner-address', OWNER_ADDRESS,
      '--expected-base-spec-sha256', createHash('sha256')
        .update(Buffer.from(JSON.stringify(baseSpec())))
        .digest('hex'),
      '--expected-frontier-commit', FRONTIER_COMMIT,
      '--expected-frontier-patch-sha256', FRONTIER_PATCH_SHA256,
      '--expected-runtime-code-sha256', RUNTIME_CODE_SHA256,
      '--expected-sudo-address', OWNER_ADDRESS,
    ];
    const output: string[] = [];
    const originalLog = console.log;
    console.log = value => output.push(String(value));
    try {
      buildChainSpec(args);
      expect(() => buildChainSpec(args)).toThrow();
      expect(() => buildChainSpec([
        ...args.slice(0, 2),
        '--output-spec', join(BRIDGE_ROOT, 'README.md'),
        ...args.slice(4),
      ])).toThrow(/outside the repository/);
    } finally {
      console.log = originalLog;
    }
    const spec = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(spec.id).toBe('bridge_federated_authority_safe');
    expect(spec.genesis.runtimeGenesis.patch.sudo.key).toBeNull();
    expect(JSON.parse(output[0]!)).toMatchObject({
      status: 'isolated_authority_safe_genesis_candidate',
      boundaries: {
        authoritySafeTargetIdentityObserved: false,
        transactionSubmitted: false,
      },
    });
  });

  it('keeps generation outside network, signing, persistence, and broadcast capabilities', () => {
    const implementation = readFileSync(
      resolve(MODULE_DIRECTORY, 'substrate-federated-authority-safe-devnet-chain-spec-v1.ts'),
      'utf8',
    );
    const cli = readFileSync(
      resolve(MODULE_DIRECTORY, 'scripts', 'build-substrate-federated-authority-safe-devnet-chain-spec.ts'),
      'utf8',
    );
    const artifactIo = readFileSync(
      resolve(MODULE_DIRECTORY, 'create-only-out-of-repository-artifact.ts'),
      'utf8',
    );
    const combined = `${implementation}\n${cli}\n${artifactIo}`;
    for (const forbidden of [
      /process\.env/,
      /StateTracker/,
      /SidechainClient/,
      /JsonRpcSigner/,
      /Wallet\b/,
      /sendTransaction/,
      /broadcastTransaction/,
      /eth_sendRawTransaction/,
      /deployed_state/i,
      /\.env/i,
    ]) {
      expect(combined).not.toMatch(forbidden);
    }
    expect(cli).toContain('readBoundedRegularFile(');
    expect(cli).toContain('writeNewFile(');
    expect(artifactIo).toContain("openSync(path, 'wx', 0o600)");
    expect(cli).not.toContain('readFileSync(');
  });
});

function buildBytes(
  baseSpecBytes: Uint8Array,
  overrides: Readonly<{
    expectedBaseSpecSha256Hex?: string;
    expectedFrontierCommit?: string;
    expectedFrontierPatchSha256Hex?: string;
    expectedRuntimeCodeSha256Hex?: string;
    expectedSudoAddress?: string;
  }> = {},
) {
  return buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
    bridgeRoot: BRIDGE_ROOT,
    baseSpecBytes,
    expectedChainId: 42n,
    bridgeAddress: BRIDGE_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
    bridgeOwnerAddress: OWNER_ADDRESS,
    expectedBaseSpecSha256Hex:
      overrides.expectedBaseSpecSha256Hex
      ?? createHash('sha256').update(baseSpecBytes).digest('hex'),
    expectedFrontierCommit:
      overrides.expectedFrontierCommit ?? FRONTIER_COMMIT,
    expectedFrontierPatchSha256Hex:
      overrides.expectedFrontierPatchSha256Hex ?? FRONTIER_PATCH_SHA256,
    expectedRuntimeCodeSha256Hex:
      overrides.expectedRuntimeCodeSha256Hex ?? RUNTIME_CODE_SHA256,
    expectedSudoAddress:
      overrides.expectedSudoAddress ?? OWNER_ADDRESS,
  });
}

function baseSpec() {
  return {
    name: 'Development',
    id: 'dev',
    chainType: 'Development',
    bootNodes: [] as string[],
    telemetryEndpoints: null as null | unknown[],
    protocolId: null as null | string,
    genesis: {
      runtimeGenesis: {
        code: RUNTIME_CODE_HEX,
        patch: {
          sudo: {
            key: OWNER_ADDRESS,
            extra: undefined as true | undefined,
          },
          evmChainId: { chainId: 42 },
          evm: {
            accounts: {
              '0x1000000000000000000000000000000000000001': {
                balance: '0x1', code: [0], nonce: '0x1', storage: {},
              },
            } as Record<string, unknown>,
          },
          bridgeCommitment: undefined as Record<string, unknown> | undefined,
        },
      },
    },
  };
}

function coordinatedMutation(
  candidate: ReturnType<
    typeof buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1
  >,
  mutate: (spec: Record<string, unknown>) => void,
) {
  const spec = JSON.parse(
    Buffer.from(candidate.chainSpecBytes).toString('utf8'),
  ) as Record<string, unknown>;
  mutate(spec);
  const chainSpecBytes = Buffer.from(JSON.stringify(spec));
  return {
    chainSpecBytes,
    report: {
      ...candidate.report,
      chainSpecSha256Hex: createHash('sha256')
        .update(chainSpecBytes)
        .digest('hex'),
      chainSpecBytes: chainSpecBytes.length,
    },
  };
}

function coordinatedLegacyEmbeddingMutation(
  candidate: ReturnType<
    typeof buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1
  >,
  mutate: (spec: Record<string, unknown>) => void,
) {
  const coordinated = coordinatedMutation(candidate, mutate);
  const legacySpec = JSON.parse(
    Buffer.from(coordinated.chainSpecBytes).toString('utf8'),
  ) as Record<string, unknown>;
  const patch = runtimePatch(legacySpec);
  delete patch.bridgeCommitment;
  patch.sudo = { key: OWNER_ADDRESS };
  legacySpec.name = 'Bridge Legacy Compatibility Target';
  legacySpec.id = 'bridge_legacy_compatibility';
  legacySpec.protocolId = 'bridge-legacy-compat';
  const legacyBytes = Buffer.from(JSON.stringify(legacySpec));
  return {
    chainSpecBytes: coordinated.chainSpecBytes,
    report: {
      ...coordinated.report,
      legacyApplicationEmbeddingSha256Hex: createHash('sha256')
        .update(legacyBytes)
        .digest('hex'),
    },
  };
}

function validationInput(
  candidate: ReturnType<
    typeof buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1
  >,
) {
  return {
    bridgeRoot: BRIDGE_ROOT,
    baseSpecBytes: Buffer.from(JSON.stringify(baseSpec())),
    chainSpecBytes: candidate.chainSpecBytes,
    report: candidate.report,
    expectedChainId: 42n,
    expectedBridgeAddress: BRIDGE_ADDRESS,
    expectedTokenAddress: TOKEN_ADDRESS,
    expectedBridgeOwnerAddress: OWNER_ADDRESS,
    expectedBaseSpecSha256Hex: createHash('sha256')
      .update(Buffer.from(JSON.stringify(baseSpec())))
      .digest('hex'),
    expectedFrontierCommit: FRONTIER_COMMIT,
    expectedFrontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
    expectedRuntimeCodeSha256Hex: RUNTIME_CODE_SHA256,
    expectedSudoAddress: OWNER_ADDRESS,
  };
}

function runtimeGenesis(spec: Record<string, unknown>): Record<string, unknown> {
  return ((spec.genesis as Record<string, unknown>)
    .runtimeGenesis as Record<string, unknown>);
}

function runtimePatch(spec: Record<string, unknown>): Record<string, unknown> {
  return runtimeGenesis(spec).patch as Record<string, unknown>;
}

function evmAccounts(spec: Record<string, unknown>): Record<string, unknown> {
  const evm = runtimePatch(spec).evm as Record<string, unknown>;
  return evm.accounts as Record<string, unknown>;
}
