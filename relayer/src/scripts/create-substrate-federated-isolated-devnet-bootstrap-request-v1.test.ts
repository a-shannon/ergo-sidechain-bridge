import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1,
} from './create-substrate-federated-isolated-devnet-bootstrap-request-v1.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';

const roots: string[] = [];
const EXPECTED_HEAD = 'a'.repeat(40);

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('canonical isolated bootstrap request producer V1', () => {
  it('publishes exact canonical bytes and self-validates the digest-bound request', () => {
    const fixture = createFixture();
    const result =
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture),
      );
    const source = readFileSync(fixture.outputPath, 'utf8');
    const parsed = JSON.parse(source) as Record<string, unknown>;
    const requestSha256Hex = createHash('sha256')
      .update(Buffer.from(source, 'utf8'))
      .digest('hex');

    expect(source).toBe(`${canonicalJson(parsed)}\n`);
    expect(parsed).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
      version: 1,
      relayer: {
        expectedHeadCommitSha1Hex: EXPECTED_HEAD,
        artifactDestinationDirectory: fixture.artifactDestination,
      },
    });
    expect(result).toEqual({
      status: 'canonical_isolated_bootstrap_request_created',
      requestSha256Hex,
      expectedHeadCommitSha1Hex: EXPECTED_HEAD,
    });

    const bridgeRoot = resolve(process.cwd(), '..');
    const worktreeRoot = resolve(bridgeRoot, '..');
    const loaded = loadCanonicalBootstrapRequestBoundToSha256(
      fixture.outputPath,
      bridgeRoot,
      worktreeRoot,
      requestSha256Hex,
    );
    expect(loaded.lifecycle.relayerArtifacts.expectedHeadCommitSha1Hex)
      .toBe(EXPECTED_HEAD);
    expect(loaded.lifecycle.sourceHistory.acceptance.expectedChainId)
      .toBe(31_337n);
    expect(
      readdirSync(fixture.root)
        .filter(name => name.startsWith('.e2s-bootstrap-request-v1-')),
    ).toEqual([]);
  });

  it('does not publish an output when request self-validation fails', () => {
    const fixture = createFixture();
    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture, { expectedChainId: '031337' }),
      )).toThrow(/chain ID must be a positive decimal integer/i);
    expect(existsSync(fixture.outputPath)).toBe(false);
    expect(
      readdirSync(fixture.root)
        .filter(name => name.startsWith('.e2s-bootstrap-request-v1-')),
    ).toEqual([]);

    const overlapFixture = createFixture();
    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(overlapFixture, {
          artifactDestination: overlapFixture.outputPath,
        }),
      )).toThrow(/output and artifact destination must not overlap/i);
    expect(existsSync(overlapFixture.outputPath)).toBe(false);
  });

  it('fails closed on reordered arguments, invalid ports and occupied output', () => {
    const fixture = createFixture();
    const reordered = requestArguments(fixture);
    [reordered[0], reordered[2]] = [reordered[2]!, reordered[0]!];
    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        reordered,
      )).toThrow(/arguments are invalid/i);

    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture, { primaryP2pPort: '65536' }),
      )).toThrow(/port is invalid/i);

    writeFileSync(fixture.outputPath, 'occupied', 'utf8');
    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture),
      )).toThrow(/must not already exist/i);
    expect(readFileSync(fixture.outputPath, 'utf8')).toBe('occupied');
  });

  it('keeps the command source generic on failure and free of runtime authority', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      "process.stderr.write('canonical isolated bootstrap request creation failed\\n')",
    );
    expect(source).not.toMatch(
      /dotenv|mnemonic|privateKey|node-wallet|signer|submitter|broadcaster|runBoundedProcess/iu,
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['federated:isolated:bootstrap:request:create'])
      .toBe(
        'npm run node:guard && tsx src/scripts/create-substrate-federated-isolated-devnet-bootstrap-request-v1.ts',
      );
  });
});

interface Fixture {
  readonly root: string;
  readonly outputPath: string;
  readonly artifactDestination: string;
  readonly toolchain: Readonly<{
    git: string;
    cargo: string;
    rustc: string;
    java: string;
    sbt: string;
    wasmPack: string;
  }>;
  readonly frontierSource: string;
  readonly baseSpec: string;
  readonly ergoSource: string;
}

function createFixture(): Readonly<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'e2s-bootstrap-request-producer-'));
  roots.push(root);
  const toolchain = {
    git: join(root, 'git.exe'),
    cargo: join(root, 'cargo.exe'),
    rustc: join(root, 'rustc.exe'),
    java: join(root, 'java.exe'),
    sbt: join(root, 'sbt-launch.jar'),
    wasmPack: join(root, 'wasm-pack.exe'),
  } as const;
  for (const path of Object.values(toolchain)) writeFileSync(path, '', 'utf8');
  const frontierSource = join(root, 'frontier-source');
  const ergoSource = join(root, 'ergo-source');
  mkdirSync(frontierSource);
  mkdirSync(ergoSource);
  const baseSpec = join(root, 'base-spec.json');
  writeFileSync(baseSpec, '{"name":"base"}\n', 'utf8');
  return Object.freeze({
    root,
    outputPath: join(root, 'bootstrap-request.v1.json'),
    artifactDestination: join(root, 'relayer-artifacts'),
    toolchain,
    frontierSource,
    baseSpec,
    ergoSource,
  });
}

function requestArguments(
  fixture: Readonly<Fixture>,
  overrides: Readonly<{
    expectedChainId?: string;
    primaryP2pPort?: string;
    bridgeAddress?: string;
    tokenAddress?: string;
    expectedBaseSpecSha256Hex?: string;
    artifactDestination?: string;
  }> = {},
): string[] {
  return [
    '--git-executable', fixture.toolchain.git,
    '--cargo-executable', fixture.toolchain.cargo,
    '--rustc-executable', fixture.toolchain.rustc,
    '--java-executable', fixture.toolchain.java,
    '--sbt-launcher-jar', fixture.toolchain.sbt,
    '--wasm-pack-executable', fixture.toolchain.wasmPack,
    '--frontier-source', fixture.frontierSource,
    '--base-spec', fixture.baseSpec,
    '--expected-chain-id', overrides.expectedChainId ?? '31337',
    '--bridge-address', overrides.bridgeAddress ?? `0x${'1'.repeat(40)}`,
    '--token-address', overrides.tokenAddress ?? `0x${'2'.repeat(40)}`,
    '--bridge-owner-address', `0x${'3'.repeat(40)}`,
    '--expected-base-spec-sha256',
    overrides.expectedBaseSpecSha256Hex ?? '4'.repeat(64),
    '--expected-frontier-commit', '5'.repeat(40),
    '--expected-frontier-patch-sha256', '6'.repeat(64),
    '--expected-runtime-code-sha256', '7'.repeat(64),
    '--expected-sudo-address', `5${'8'.repeat(47)}`,
    '--expected-frontier-binary-version', 'bridge-node 1.0.0',
    '--primary-rpc-url', 'http://127.0.0.1:9944',
    '--witness-rpc-url', 'http://127.0.0.1:9945',
    '--primary-p2p-port', overrides.primaryP2pPort ?? '30333',
    '--witness-p2p-port', '30334',
    '--primary-prometheus-port', '9615',
    '--witness-prometheus-port', '9616',
    '--expected-native-genesis-hash', `0x${'9'.repeat(64)}`,
    '--expected-node-name', 'bridge-node',
    '--expected-node-version', '1.0.0',
    '--signed-legacy-owner-mint-transaction', '0x01020304',
    '--ergo-source', fixture.ergoSource,
    '--expected-head', EXPECTED_HEAD,
    '--artifact-destination',
    overrides.artifactDestination ?? fixture.artifactDestination,
    '--output', fixture.outputPath,
  ];
}
