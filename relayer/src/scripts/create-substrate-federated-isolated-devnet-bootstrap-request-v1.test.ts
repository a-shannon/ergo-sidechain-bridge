import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as ownerCustody from '../adapters/frontier-lab-application-owner-v1.js';
import {
  assertFrontierLabApplicationOwnerRequestV1,
  disposeFrontierLabApplicationOwnerV1,
} from '../adapters/frontier-lab-application-owner-v1.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from '../bridge-repository-layout.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import * as requestFiles from '../create-only-out-of-repository-artifact.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
} from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1,
  createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1,
  createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1,
} from './create-substrate-federated-isolated-devnet-bootstrap-request-v1.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';

const roots: string[] = [];
const EXPECTED_HEAD = 'a'.repeat(40);
const REQUEST_BOUND_OWNER =
  '0x4f9b9f038c4ce5b83af4972f0bf38bcac7316bdd';
const SIGNED_REQUEST_BOUND_OWNER_MINT_TRANSACTION =
  '0xf8c78001830f424094970951a12f975e6762482aca81e57d5a2a4e73f480b864'
  + 'f28ee1870000000000000000000000004f9b9f038c4ce5b83af4972f0bf38bca'
  + 'c7316bdd0000000000000000000000000000000000000000000000000000000000'
  + 'e4e1c0222222222222222222222222222222222222222222222222222222222222'
  + '222282f4f5a0f1baf442ddff4104e001f0c4c9d429c966282585e5656f514099'
  + '04018b59640aa0648b3a6b81b4242668e05567c30d7794c8d0a7ed03535ffde4'
  + 'e218f03ddfb28b';

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('canonical isolated bootstrap request producer V1', () => {
  it('retains the exact session owner across calibration and binds canonical bytes before publication', async () => {
    const fixture = createFixture();
    const createOwner = vi.spyOn(ownerCustody, 'createFrontierLabApplicationOwnerV1');
    const originalBind = ownerCustody.bindFrontierLabApplicationOwnerRequestV1;
    const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
    try {
      const owner = session.owner;
      expect(Object.isFrozen(session)).toBe(true);
      expect(Object.keys(session).sort()).toEqual(['createRequest', 'dispose', 'owner']);
      expect(Object.isFrozen(owner)).toBe(true);
      expect(owner).toBe(await createOwner.mock.results[0]!.value);
      expect(createOwner).toHaveBeenCalledExactlyOnceWith(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
      );
      const publicOwner = JSON.stringify(owner);
      expect(Object.keys(owner).sort()).toEqual([
        'ownerAddressHex', 'signedLegacyOwnerMintTransactionHex',
      ]);
      expect(existsSync(fixture.outputPath)).toBe(false);

      // Model owner-dependent calibration across an async gap, without a node.
      const calibratedIdentity = JSON.parse(publicOwner);
      await new Promise<void>(resolve => setImmediate(resolve));
      const expectedGenesis = `0x${createHash('sha256').update(publicOwner).digest('hex')}`;
      const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1')
        .mockImplementationOnce((boundOwner, bytes, digest) => {
          expect(boundOwner).toBe(owner);
          expect(existsSync(fixture.outputPath)).toBe(false);
          expect(digest).toBe(createHash('sha256').update(bytes).digest('hex'));
          expect(Buffer.from(bytes).toString('utf8')).toBe(
            `${canonicalJson(JSON.parse(Buffer.from(bytes).toString('utf8')))}\n`,
          );
          originalBind(boundOwner, bytes, digest);
          assertFrontierLabApplicationOwnerRequestV1(owner, digest);
        });
      const result = session.createRequest(freshOwnerArguments(fixture, {
        expectedNativeGenesisHashHex: expectedGenesis,
      }));
      const bytes = readFileSync(fixture.outputPath, 'utf8');
      expect(JSON.parse(bytes).sourceTarget).toMatchObject({
        bridgeOwnerAddress: calibratedIdentity.ownerAddressHex,
        signedLegacyOwnerMintTransactionHex: calibratedIdentity.signedLegacyOwnerMintTransactionHex,
        expectedNativeGenesisHashHex: expectedGenesis,
      });
      expect(session.owner).toBe(owner);
      expect(bind).toHaveBeenCalledTimes(1);
      expect(Buffer.from(bind.mock.calls[0]![1]).toString('utf8')).toBe(bytes);
      expect(result).toEqual({
        status: 'canonical_isolated_bootstrap_request_created',
        requestSha256Hex: createHash('sha256').update(bytes).digest('hex'),
        expectedHeadCommitSha1Hex: EXPECTED_HEAD,
      });
      expect(createOwner).toHaveBeenCalledTimes(1);
      expect(`${bytes}${JSON.stringify(session)}`).not.toMatch(
        /mnemonic|privateKey|signingKey|wallet|metadata|requestClaimed|bindingAttempted/iu,
      );
      expect(() => assertFrontierLabApplicationOwnerRequestV1(
        calibratedIdentity, result.requestSha256Hex,
      )).toThrow(/live process custody/);
      const claimed = ownerCustody.claimFrontierLabApplicationOwnerRequestV1(result.requestSha256Hex);
      expect(claimed).toBe(owner);
      ownerCustody.assertFrontierLabApplicationOwnerClaimV1(claimed, result.requestSha256Hex);
    } finally { session.dispose(); }
  });

  it('rejects duplicate session calls before cleanup without invalidating the first request', async () => {
    const fixture = createFixture();
    const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
    const dispose = vi.spyOn(ownerCustody, 'disposeFrontierLabApplicationOwnerV1');
    const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1');
    try {
      const result = session.createRequest(freshOwnerArguments(fixture));
      const firstBytes = readFileSync(fixture.outputPath);
      const secondPath = `${fixture.outputPath}.second`;
      const secondArgs = freshOwnerArguments(fixture);
      secondArgs[secondArgs.indexOf('--output') + 1] = secondPath;
      expect(() => session.createRequest([])).toThrow(/already consumed or disposed/);
      expect(() => session.createRequest(secondArgs)).toThrow(/already consumed or disposed/);
      expect(dispose).not.toHaveBeenCalled();
      expect(bind).toHaveBeenCalledTimes(1);
      expect(existsSync(secondPath)).toBe(false);
      expect(readFileSync(fixture.outputPath)).toEqual(firstBytes);
      assertFrontierLabApplicationOwnerRequestV1(session.owner, result.requestSha256Hex);
      expect(ownerCustody.claimFrontierLabApplicationOwnerRequestV1(result.requestSha256Hex))
        .toBe(session.owner);
      session.dispose();
      session.dispose();
      expect(dispose).toHaveBeenCalledExactlyOnceWith(session.owner);
      expect(() => assertFrontierLabApplicationOwnerRequestV1(session.owner, result.requestSha256Hex))
        .toThrow(/live process custody/);
    } finally { session.dispose(); }
  });

  it('cannot publish after idempotent disposal of an unused session', async () => {
    const fixture = createFixture();
    const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
    const dispose = vi.spyOn(ownerCustody, 'disposeFrontierLabApplicationOwnerV1');
    const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1');
    try {
      session.dispose();
      session.dispose();
      expect(() => session.createRequest(freshOwnerArguments(fixture)))
        .toThrow(/already consumed or disposed/);
      expect(dispose).toHaveBeenCalledExactlyOnceWith(session.owner);
      expect(bind).not.toHaveBeenCalled();
      expect(existsSync(fixture.outputPath)).toBe(false);
      expect(() => assertFrontierLabApplicationOwnerRequestV1(session.owner, 'aa'.repeat(32)))
        .toThrow(/live process custody/);
    } finally { session.dispose(); }
  });

  it.each([
    ['malformed arguments', {}],
    ['wrong chain', { expectedChainId: '31337' }],
    ['wrong bridge', { bridgeAddress: `0x${'ab'.repeat(20)}` }],
    ['wrong token', { tokenAddress: `0x${'ab'.repeat(20)}` }],
    ['invalid request', { primaryP2pPort: '65536' }],
    ['caller-owned identity', {}],
  ] as const)('consumes and disposes a session on %s without publication', async (label, overrides) => {
    const fixture = createFixture();
    const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
    const args = label === 'caller-owned identity'
      ? requestArguments(fixture, { expectedChainId: '42' })
      : freshOwnerArguments(fixture, overrides);
    if (label === 'malformed arguments') args.pop();
    const dispose = vi.spyOn(ownerCustody, 'disposeFrontierLabApplicationOwnerV1');
    try {
      expect(() => session.createRequest(args)).toThrow(
        label === 'wrong chain' ? /LAB chain ID 42/
          : label === 'wrong bridge' || label === 'wrong token' ? /differs from the deterministic deployment/
            : label === 'invalid request' ? /port is invalid/ : /arguments are invalid/,
      );
      expect(existsSync(fixture.outputPath)).toBe(false);
      expect(() => assertFrontierLabApplicationOwnerRequestV1(session.owner, 'aa'.repeat(32)))
        .toThrow(/live process custody/);
      expect(() => session.createRequest(freshOwnerArguments(fixture)))
        .toThrow(/already consumed or disposed/);
      expect(existsSync(fixture.outputPath)).toBe(false);
      session.dispose();
      expect(dispose).toHaveBeenCalledExactlyOnceWith(session.owner);
    } finally { session.dispose(); }
  });

  it('disposes a session and removes claimable custody after binding fails before publication', async () => {
    const fixture = createFixture();
    const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
    const originalBind = ownerCustody.bindFrontierLabApplicationOwnerRequestV1;
    const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1')
      .mockImplementationOnce((owner, bytes, digest) => {
        originalBind(owner, bytes, digest);
        throw new Error('injected session binding failure');
      });
    try {
      expect(() => session.createRequest(freshOwnerArguments(fixture)))
        .toThrow('injected session binding failure');
      expect(bind).toHaveBeenCalledTimes(1);
      const [owner, , digest] = bind.mock.calls[0]!;
      expect(owner).toBe(session.owner);
      expect(existsSync(fixture.outputPath)).toBe(false);
      expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest))
        .toThrow(/live process custody/);
      expect(() => ownerCustody.claimFrontierLabApplicationOwnerRequestV1(digest))
        .toThrow(/no unclaimed live/);
      expect(() => session.createRequest(freshOwnerArguments(fixture)))
        .toThrow(/already consumed or disposed/);
      expect(readdirSync(fixture.root).filter(name => name.startsWith('.e2s-bootstrap-request-v1-')))
        .toEqual([]);
    } finally { session.dispose(); }
  });

  it('preserves occupied output and disposes session custody', async () => {
    const fixture = createFixture();
    const session = await createSubstrateFederatedIsolatedDevnetBootstrapRequestOwnerSessionV1();
    writeFileSync(fixture.outputPath, 'occupied', 'utf8');
    try {
      expect(() => session.createRequest(freshOwnerArguments(fixture)))
        .toThrow(/must not already exist/);
      expect(readFileSync(fixture.outputPath, 'utf8')).toBe('occupied');
      expect(() => assertFrontierLabApplicationOwnerRequestV1(session.owner, 'aa'.repeat(32)))
        .toThrow(/live process custody/);
      expect(() => session.createRequest(freshOwnerArguments(fixture)))
        .toThrow(/already consumed or disposed/);
    } finally { session.dispose(); }
  });

  it.each([
    ['malformed arguments', {}],
    ['wrong chain', { expectedChainId: '31337' }],
    ['wrong application', { bridgeAddress: `0x${'ab'.repeat(20)}` }],
  ] as const)('prevalidates %s before the fresh-owner wrapper creates custody', async (label, overrides) => {
    const fixture = createFixture();
    const createOwner = vi.spyOn(ownerCustody, 'createFrontierLabApplicationOwnerV1');
    const args = freshOwnerArguments(fixture, overrides);
    if (label === 'malformed arguments') args.pop();
    await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(args))
      .rejects.toThrow(label === 'wrong chain' ? /LAB chain ID 42/
        : label === 'wrong application' ? /differs from the deterministic deployment/ : /arguments are invalid/);
    expect(createOwner).not.toHaveBeenCalled();
    expect(existsSync(fixture.outputPath)).toBe(false);
  });

  it('snapshots fresh-owner arguments before awaiting owner creation', async () => {
    const fixture = createFixture();
    const expectedGenesis = `0x${'ac'.repeat(32)}`;
    const args = freshOwnerArguments(fixture, { expectedNativeGenesisHashHex: expectedGenesis });
    const originalCreate = ownerCustody.createFrontierLabApplicationOwnerV1;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const createOwner = vi.spyOn(ownerCustody, 'createFrontierLabApplicationOwnerV1')
      .mockImplementationOnce(async bridge => {
        await gate;
        return originalCreate(bridge);
      });
    const pending = createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(args);
    const changedOutput = `${fixture.outputPath}.mutated`;
    try {
      args[args.indexOf('--expected-chain-id') + 1] = '31337';
      args[args.indexOf('--expected-native-genesis-hash') + 1] = `0x${'bd'.repeat(32)}`;
      args[args.indexOf('--output') + 1] = changedOutput;
    } finally { release(); }
    const result = await pending;
    try {
      expect(createOwner).toHaveBeenCalledExactlyOnceWith(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
      );
      expect(JSON.parse(readFileSync(fixture.outputPath, 'utf8')).sourceTarget).toMatchObject({
        expectedChainId: '42',
        expectedNativeGenesisHashHex: expectedGenesis,
        bridgeOwnerAddress: result.owner.ownerAddressHex,
        signedLegacyOwnerMintTransactionHex: result.owner.signedLegacyOwnerMintTransactionHex,
      });
      expect(existsSync(changedOutput)).toBe(false);
      expect(createOwner).toHaveBeenCalledTimes(1);
      expect(result.owner).toBe(await createOwner.mock.results[0]!.value);
      assertFrontierLabApplicationOwnerRequestV1(result.owner, result.requestCreation.requestSha256Hex);
    } finally { disposeFrontierLabApplicationOwnerV1(result.owner); }
  });

  it('creates a canonical LAB request and retains the matching owner in the same process', async () => {
    const fixture = createFixture();
    const result = await createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      freshOwnerArguments(fixture),
    );
    try {
      const bytes = readFileSync(fixture.outputPath, 'utf8');
      const request = JSON.parse(bytes);
      expect(request.sourceTarget).toMatchObject({
        expectedChainId: '42',
        bridgeOwnerAddress: result.owner.ownerAddressHex,
        signedLegacyOwnerMintTransactionHex: result.owner.signedLegacyOwnerMintTransactionHex,
      });
      expect(request.sourceTarget.bridgeOwnerAddress).not.toBe(request.sourceTarget.expectedSudoAddress);
      expect(result.requestCreation.requestSha256Hex).toBe(createHash('sha256').update(bytes).digest('hex'));
      assertFrontierLabApplicationOwnerRequestV1(result.owner, result.requestCreation.requestSha256Hex);
      expect(() => assertFrontierLabApplicationOwnerRequestV1(
        JSON.parse(JSON.stringify(result.owner)), result.requestCreation.requestSha256Hex,
      )).toThrow(/live process custody/);
      expect(bytes).not.toMatch(/mnemonic|privateKey|signingKey|wallet/iu);
    } finally { disposeFrontierLabApplicationOwnerV1(result.owner); }
  });

  it.each([
    ['wrong chain', { expectedChainId: '31337' }],
    ['wrong application', { bridgeAddress: `0x${'ab'.repeat(20)}` }],
    ['invalid request', { primaryP2pPort: '65536' }],
  ] as const)('does not publish a fresh-owner request with %s', async (_label, overrides) => {
    const fixture = createFixture();
    await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      freshOwnerArguments(fixture, overrides),
    )).rejects.toThrow();
    expect(existsSync(fixture.outputPath)).toBe(false);
  });

  it('rejects caller-owned identity arguments and preserves an occupied output', async () => {
    const fixture = createFixture();
    await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      requestArguments(fixture, { expectedChainId: '42' }),
    )).rejects.toThrow(/arguments are invalid/);
    writeFileSync(fixture.outputPath, 'occupied', 'utf8');
    await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      freshOwnerArguments(fixture),
    )).rejects.toThrow(/must not already exist/);
    expect(readFileSync(fixture.outputPath, 'utf8')).toBe('occupied');
  });

  it('disposes custody on binding failure before publication and allows a fresh retry', async () => {
    const fixture = createFixture();
    const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1')
      .mockImplementationOnce(() => { throw new Error('injected binding failure'); });
    await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      freshOwnerArguments(fixture),
    )).rejects.toThrow('injected binding failure');
    expect(existsSync(fixture.outputPath)).toBe(false);
    const failedOwner = bind.mock.calls[0]![0];
    expect(() => assertFrontierLabApplicationOwnerRequestV1(failedOwner, 'aa'.repeat(32)))
      .toThrow(/live process custody/);
    const retry = await createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      freshOwnerArguments(fixture),
    );
    try {
      expect(retry.owner.ownerAddressHex).not.toBe(failedOwner.ownerAddressHex);
      assertFrontierLabApplicationOwnerRequestV1(retry.owner, retry.requestCreation.requestSha256Hex);
    } finally { disposeFrontierLabApplicationOwnerV1(retry.owner); }
  });

  it('disposes already-bound custody if another file wins create-only publication', async () => {
    const fixture = createFixture();
    const originalBind = ownerCustody.bindFrontierLabApplicationOwnerRequestV1;
    const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1')
      .mockImplementationOnce((owner, bytes, digest) => {
        originalBind(owner, bytes, digest);
        assertFrontierLabApplicationOwnerRequestV1(owner, digest);
        writeFileSync(fixture.outputPath, 'concurrent output', { flag: 'wx' });
      });
    await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(
      freshOwnerArguments(fixture),
    )).rejects.toThrow(/EEXIST/);
    expect(readFileSync(fixture.outputPath, 'utf8')).toBe('concurrent output');
    const [owner, , digest] = bind.mock.calls[0]!;
    expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest))
      .toThrow(/live process custody/);
    expect(readdirSync(fixture.root).some(name => name.startsWith('.e2s-bootstrap-request-v1-')))
      .toBe(false);
  });

  it.each(['read failure', 'malformed UTF-8', 'replaced output'] as const)(
    'returns no custody and preserves the final path after post-publication %s', async fault => {
      const fixture = createFixture();
      const args = freshOwnerArguments(fixture);
      args[args.indexOf('--expected-node-name') + 1] = 'bridge-\ufffd-node';
      const bind = vi.spyOn(ownerCustody, 'bindFrontierLabApplicationOwnerRequestV1');
      const read = requestFiles.readBoundedRegularFile;
      let retainedBytes: Buffer | undefined;
      const spy = vi.spyOn(requestFiles, 'readBoundedRegularFile').mockImplementation((path, label, maximum) => {
        if (label !== 'published canonical bootstrap request') return read(path, label, maximum);
        const published = read(path, label, maximum);
        retainedBytes = Buffer.from(published.bytes);
        if (fault === 'read failure') throw new Error('injected read failure');
        if (fault === 'replaced output') {
          unlinkSync(path);
          retainedBytes = Buffer.from('replacement');
          writeFileSync(path, retainedBytes);
          return read(path, label, maximum);
        }
        const offset = retainedBytes.indexOf(Buffer.from('\ufffd'));
        expect(offset).toBeGreaterThan(0);
        const malformed = Buffer.concat([
          retainedBytes.subarray(0, offset), Buffer.from([0xff]), retainedBytes.subarray(offset + 3),
        ]);
        expect(malformed.toString('utf8')).toBe(retainedBytes.toString('utf8'));
        return { ...published, bytes: malformed };
      });
      await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(args))
        .rejects.toThrow(/publication committed but verification failed.*fresh output path/);
      expect(readFileSync(fixture.outputPath)).toEqual(retainedBytes);
      const failedOwner = bind.mock.calls[0]![0];
      expect(() => assertFrontierLabApplicationOwnerRequestV1(failedOwner, bind.mock.calls[0]![2]))
        .toThrow(/live process custody/);
      spy.mockRestore();
      await expect(createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(args))
        .rejects.toThrow(/must not already exist/);
      expect(readFileSync(fixture.outputPath)).toEqual(retainedBytes);
      const retryArgs = [...args];
      retryArgs[retryArgs.indexOf('--output') + 1] = `${fixture.outputPath}.retry`;
      const retry = await createSubstrateFederatedIsolatedDevnetBootstrapRequestWithFreshOwnerV1(retryArgs);
      try {
        expect(retry.owner.ownerAddressHex).not.toBe(failedOwner.ownerAddressHex);
        assertFrontierLabApplicationOwnerRequestV1(retry.owner, retry.requestCreation.requestSha256Hex);
      } finally { disposeFrontierLabApplicationOwnerV1(retry.owner); }
    },
  );

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

    const inferredBridgeRoot = resolve(process.cwd(), '..');
    const { bridgeRoot, worktreeRoot } =
      resolveBridgeRepositoryRootsFromCheckoutLayout(inferredBridgeRoot);
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

  it('publishes a request-bound owner distinct from the removed base Sudo', () => {
    const fixture = createFixture();
    const result =
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture, {
          bridgeOwnerAddress: REQUEST_BOUND_OWNER,
          signedLegacyOwnerMintTransaction:
            SIGNED_REQUEST_BOUND_OWNER_MINT_TRANSACTION,
        }),
      );
    const parsed = JSON.parse(
      readFileSync(fixture.outputPath, 'utf8'),
    ) as {
      sourceTarget: {
        bridgeOwnerAddress: string;
        expectedSudoAddress: string;
      };
    };

    expect(result.status).toBe('canonical_isolated_bootstrap_request_created');
    expect(parsed.sourceTarget).toEqual(expect.objectContaining({
      bridgeOwnerAddress: REQUEST_BOUND_OWNER,
      expectedSudoAddress:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
    }));
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

  it.each([
    ['missing executable identity', '1.0.0'],
    ['different node version', 'bridge-node 2.0.0'],
    ['whitespace in executable identity', 'bridge node 1.0.0'],
  ])('rejects a binary version with %s before publication', (
    _case,
    expectedFrontierBinaryVersion,
  ) => {
    const fixture = createFixture();
    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture, {
          expectedFrontierBinaryVersion,
        }),
      )).toThrow(/bind one executable identity to the exact source node version/iu);
    expect(existsSync(fixture.outputPath)).toBe(false);
    expect(
      readdirSync(fixture.root)
        .filter(name => name.startsWith('.e2s-bootstrap-request-v1-')),
    ).toEqual([]);
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

  it('rejects a malformed probe or mismatched Sudo before request publication', () => {
    const fixture = createFixture();
    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture, {
          signedLegacyOwnerMintTransaction: '0x01020304',
        }),
      )).toThrow(/rlp payload|transaction/iu);
    expect(existsSync(fixture.outputPath)).toBe(false);

    expect(() =>
      createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
        requestArguments(fixture, {
          expectedSudoAddress: `0x${'4'.repeat(40)}`,
        }),
      )).toThrow(/removed base Sudo differs/iu);
    expect(existsSync(fixture.outputPath)).toBe(false);
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
      /dotenv|mnemonic|privateKey|node-wallet|submitter|broadcaster|runBoundedProcess/iu,
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

function freshOwnerArguments(
  fixture: Readonly<Fixture>,
  overrides: Parameters<typeof requestArguments>[1] = {},
): string[] {
  const args = requestArguments(fixture, { expectedChainId: '42', ...overrides });
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== '--bridge-owner-address' && args[index] !== '--signed-legacy-owner-mint-transaction') {
      result.push(args[index]!, args[index + 1]!);
    }
  }
  return result;
}

function requestArguments(
  fixture: Readonly<Fixture>,
  overrides: Readonly<{
    expectedChainId?: string;
    primaryP2pPort?: string;
    bridgeAddress?: string;
    bridgeOwnerAddress?: string;
    tokenAddress?: string;
    expectedBaseSpecSha256Hex?: string;
    artifactDestination?: string;
    expectedSudoAddress?: string;
    expectedFrontierBinaryVersion?: string;
    signedLegacyOwnerMintTransaction?: string;
    expectedNativeGenesisHashHex?: string;
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
    '--bridge-address', overrides.bridgeAddress
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1,
    '--token-address', overrides.tokenAddress
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_TOKEN_ADDRESS_V1,
    '--bridge-owner-address',
    overrides.bridgeOwnerAddress
      ?? REQUEST_BOUND_OWNER,
    '--expected-base-spec-sha256',
    overrides.expectedBaseSpecSha256Hex ?? '4'.repeat(64),
    '--expected-frontier-commit', '5'.repeat(40),
    '--expected-frontier-patch-sha256', '6'.repeat(64),
    '--expected-runtime-code-sha256', '7'.repeat(64),
    '--expected-sudo-address', overrides.expectedSudoAddress
      ?? SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
    '--expected-frontier-binary-version',
    overrides.expectedFrontierBinaryVersion ?? 'bridge-node 1.0.0',
    '--primary-rpc-url', 'http://127.0.0.1:9944',
    '--witness-rpc-url', 'http://127.0.0.1:9945',
    '--primary-p2p-port', overrides.primaryP2pPort ?? '30333',
    '--witness-p2p-port', '30334',
    '--primary-prometheus-port', '9615',
    '--witness-prometheus-port', '9616',
    '--expected-native-genesis-hash', overrides.expectedNativeGenesisHashHex ?? `0x${'9'.repeat(64)}`,
    '--expected-node-name', 'bridge-node',
    '--expected-node-version', '1.0.0',
    '--signed-legacy-owner-mint-transaction',
    overrides.signedLegacyOwnerMintTransaction
      ?? SIGNED_REQUEST_BOUND_OWNER_MINT_TRANSACTION,
    '--ergo-source', fixture.ergoSource,
    '--expected-head', EXPECTED_HEAD,
    '--artifact-destination',
    overrides.artifactDestination ?? fixture.artifactDestination,
    '--output', fixture.outputPath,
  ];
}
