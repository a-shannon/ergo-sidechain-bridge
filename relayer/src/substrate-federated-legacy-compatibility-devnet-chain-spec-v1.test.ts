import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1,
} from './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';
import { main as buildChainSpec } from './scripts/build-substrate-federated-legacy-compatibility-devnet-chain-spec.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const BRIDGE_ADDRESS = `0x${'06'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'07'.repeat(20)}`;
const OWNER_ADDRESS = '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const ZERO_SLOT = `0x${'0'.repeat(64)}`;
const SLOT_THREE = `0x${'0'.repeat(63)}3`;
const SLOT_FOUR = `0x${'0'.repeat(63)}4`;
const SLOT_FIVE = `0x${'0'.repeat(63)}5`;

describe('Substrate federated legacy compatibility devnet chain spec V1', () => {
  it('embeds the tracked bridge application and exact ownership bindings at genesis', () => {
    const first = build(baseSpec());
    const second = build(baseSpec());

    expect(Buffer.from(first.chainSpecBytes).equals(
      Buffer.from(second.chainSpecBytes),
    )).toBe(true);
    expect(first.report).toEqual(second.report);
    expect(first.report).toMatchObject({
      status: 'isolated_legacy_owner_mint_compatibility_spec',
      chain: {
        name: 'Bridge Legacy Compatibility Target',
        id: 'bridge_legacy_compatibility',
        protocolId: 'bridge-legacy-compat',
        chainType: 'Development',
        chainId: '42',
      },
      application: {
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        bridgeOwnerAddress: OWNER_ADDRESS,
        tokenOwnerAddress: BRIDGE_ADDRESS,
        bridgeRuntimeByteLength: 4104,
        tokenRuntimeByteLength: 2356,
      },
      boundaries: {
        legacyOwnerMintAuthorityPresent: true,
        federatedLaunchEligible: false,
        federatedMintAuthorityEstablished: false,
        transactionConstructed: false,
        transactionSigned: false,
        transactionSubmitted: false,
        transactionBroadcast: false,
        gate5Closed: false,
      },
    });

    const spec = JSON.parse(Buffer.from(first.chainSpecBytes).toString('utf8'));
    const accounts = spec.genesis.runtimeGenesis.patch.evm.accounts;
    expect(accounts[BRIDGE_ADDRESS].code).toHaveLength(4104);
    expect(accounts[TOKEN_ADDRESS].code).toHaveLength(2356);
    expect(accounts[BRIDGE_ADDRESS].storage).toEqual({
      [ZERO_SLOT]: `0x${'0'.repeat(24)}${OWNER_ADDRESS.slice(2)}`,
      [SLOT_THREE]: `0x${'0'.repeat(24)}${TOKEN_ADDRESS.slice(2)}`,
    });
    expect(accounts[TOKEN_ADDRESS].storage).toEqual({
      [SLOT_THREE]: `0x${Buffer.from('Sidechain ERG').toString('hex').padEnd(62, '0')}1a`,
      [SLOT_FOUR]: `0x${Buffer.from('sERG').toString('hex').padEnd(62, '0')}08`,
      [SLOT_FIVE]: `0x${'0'.repeat(24)}${BRIDGE_ADDRESS.slice(2)}`,
    });
  });

  it('rejects occupied identities, scope drift, and unsafe chain IDs', () => {
    const occupied = baseSpec();
    occupied.genesis.runtimeGenesis.patch.evm.accounts[BRIDGE_ADDRESS] = {};
    expect(() => build(occupied)).toThrow(/bridge address is already occupied/);

    const live = baseSpec();
    live.chainType = 'Live';
    expect(() => build(live)).toThrow(/Development chain type/);

    const bootstrapped = baseSpec();
    bootstrapped.bootNodes = ['/ip4/127.0.0.1/tcp/30333'];
    expect(() => build(bootstrapped)).toThrow(/no bootnodes/);

    expect(() => build(baseSpec(), { expectedChainId: 1n })).toThrow(
      /refuses chain ID 1/,
    );
    expect(() => build(baseSpec(), { expectedChainId: 43n })).toThrow(
      /differs from the explicit target/,
    );
    expect(() => build(baseSpec(), { tokenAddress: BRIDGE_ADDRESS })).toThrow(
      /must be distinct/,
    );

    const duplicateKey = JSON.stringify(baseSpec()).replace(
      '"id":"dev"',
      '"id":"dev","id":"shadow"',
    );
    expect(() => buildBytes(Buffer.from(duplicateKey))).toThrow(/duplicate/i);
  });

  it('preserves base-spec integers beyond the JavaScript safe range', () => {
    const largeBalance = '1000000000000000000000000';
    const source = JSON.stringify(baseSpec()).replace(
      '"balance":"0x1"',
      `"balance":${largeBalance}`,
    );
    const result = buildBytes(Buffer.from(source));
    const generated = Buffer.from(result.chainSpecBytes).toString('utf8');

    expect(generated).toContain(`"balance":${largeBalance}`);
    expect(generated).not.toContain('"balance":1e+24');
  });

  it('preserves adversarial numeric lexemes and rejects malformed UTF-8', () => {
    const probe =
      '"numericProbe":{"negativeZero":-0,"fraction":1.2500,'
      + '"exponent":6.02e+23,"dense":[0,1,-2,3.0,4E-2],'
      + '"marker":"\\u005f_FED6G_RAW_JSON_NUMBER_not-a-marker__42"},';
    const source = JSON.stringify(baseSpec()).replace('"genesis":', `${probe}"genesis":`);
    const generated = Buffer.from(
      buildBytes(Buffer.from(source)).chainSpecBytes,
    ).toString('utf8');

    expect(generated).toContain(
      '"numericProbe":{"negativeZero":-0,"fraction":1.2500,'
      + '"exponent":6.02e+23,"dense":[0,1,-2,3.0,4E-2],'
      + '"marker":"__FED6G_RAW_JSON_NUMBER_not-a-marker__42"}',
    );
    expect(() => buildBytes(Uint8Array.from([
      0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d,
    ]))).toThrow(/canonical UTF-8/);
  });

  it('writes one explicit out-of-repository spec and refuses overwrite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fed6g-chain-spec-'));
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
    expect(spec.id).toBe('bridge_legacy_compatibility');
    expect(JSON.parse(output[0]!)).toMatchObject({
      status: 'isolated_legacy_owner_mint_compatibility_spec',
      boundaries: { transactionSubmitted: false },
    });
  });

  it('keeps generation separate from signing, submission, and runtime state', () => {
    const implementation = readFileSync(
      resolve(MODULE_DIRECTORY, 'substrate-federated-legacy-compatibility-devnet-chain-spec-v1.ts'),
      'utf8',
    );
    const cli = readFileSync(
      resolve(MODULE_DIRECTORY, 'scripts', 'build-substrate-federated-legacy-compatibility-devnet-chain-spec.ts'),
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
    expect(artifactIo).toContain('fstatSync(descriptor)');
    expect(artifactIo).toContain('readSync(');
    expect(cli).toContain('readBoundedRegularFile(');
    expect(cli).toContain('baseSpecPath,');
    expect(artifactIo).toContain('sameFileIdentity(beforeOpen, opened)');
    expect(artifactIo).toContain('sameFileIdentity(opened, canonicalFile)');
    expect(artifactIo).toContain('sameFileIdentity(afterRead, finalCanonicalFile)');
    expect(artifactIo).toContain('sameFileIdentity(parent, finalParent)');
    expect(artifactIo).toContain('sameFileIdentity(written, finalPath)');
    expect(cli).not.toContain('readFileSync(');
  });
});

function build(
  spec: ReturnType<typeof baseSpec>,
  overrides: Readonly<{
    expectedChainId?: bigint;
    tokenAddress?: string;
  }> = {},
) {
  return buildBytes(Buffer.from(JSON.stringify(spec)), overrides);
}

function buildBytes(
  baseSpecBytes: Uint8Array,
  overrides: Readonly<{
    expectedChainId?: bigint;
    tokenAddress?: string;
  }> = {},
) {
  return buildSubstrateFederatedLegacyCompatibilityDevnetChainSpecV1({
    bridgeRoot: BRIDGE_ROOT,
    baseSpecBytes,
    expectedChainId: overrides.expectedChainId ?? 42n,
    bridgeAddress: BRIDGE_ADDRESS,
    tokenAddress: overrides.tokenAddress ?? TOKEN_ADDRESS,
    bridgeOwnerAddress: OWNER_ADDRESS,
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
        code: '0x00',
        patch: {
          evmChainId: { chainId: 42 },
          evm: {
            accounts: {
              '0x1000000000000000000000000000000000000001': {
                balance: '0x1', code: [0], nonce: '0x1', storage: {},
              },
            } as Record<string, unknown>,
          },
        },
      },
    },
  };
}
