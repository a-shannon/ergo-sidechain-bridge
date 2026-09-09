import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { Transaction } from 'ethers';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import { buildAuthoritySafeLegacyMintProbeV1 } from '../substrate-federated-authority-safe-devnet-observation-v1.js';
import { SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_BRIDGE_ADDRESS_V1 as BRIDGE } from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  assertFrontierLabApplicationOwnerClaimV1,
  assertFrontierLabApplicationOwnerRequestV1,
  bindFrontierLabApplicationOwnerRequestV1 as bindOwnerBytes,
  claimFrontierLabApplicationOwnerRequestV1,
  createFrontierLabApplicationOwnerV1,
  disposeFrontierLabApplicationOwnerV1,
  type FrontierLabApplicationOwnerV1,
} from './frontier-lab-application-owner-v1.js';

const owners: Readonly<FrontierLabApplicationOwnerV1>[] = [];
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function bindFrontierLabApplicationOwnerRequestV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>, source: string, digest: string,
) {
  bindOwnerBytes(owner, Buffer.from(source, 'utf8'), digest);
}

afterEach(() => {
  for (const owner of owners.splice(0)) disposeFrontierLabApplicationOwnerV1(owner);
});

async function freshOwner() {
  const owner = await createFrontierLabApplicationOwnerV1(BRIDGE);
  owners.push(owner);
  return owner;
}

function requestFor(owner: Readonly<FrontierLabApplicationOwnerV1>) {
  return {
    schema: 'e2s.substrate-federated-isolated-devnet-bootstrap-command-request.v1',
    version: 1,
    sourceTarget: {
      expectedChainId: '42',
      bridgeAddress: BRIDGE,
      bridgeOwnerAddress: owner.ownerAddressHex,
      signedLegacyOwnerMintTransactionHex: owner.signedLegacyOwnerMintTransactionHex,
    },
  };
}

describe('fresh LAB application owner custody', () => {
  it('retains pending custody across garbage collection until campaign transfer', () => {
    const output = execFileSync(process.execPath, [
      '--expose-gc', '--import', 'tsx', '--input-type=module', '-e', `
        import { createHash } from 'node:crypto';
        import { canonicalJson } from './src/ergo-settlement-core/strict-json.ts';
        import {
          createFrontierLabApplicationOwnerV1, bindFrontierLabApplicationOwnerRequestV1,
          claimFrontierLabApplicationOwnerRequestV1, disposeFrontierLabApplicationOwnerV1,
          assertFrontierLabApplicationOwnerClaimV1,
        } from './src/adapters/frontier-lab-application-owner-v1.ts';
        async function register() {
          const bridgeAddress = ${JSON.stringify(BRIDGE)};
          const owner = await createFrontierLabApplicationOwnerV1(bridgeAddress);
          const bytes = Buffer.from(canonicalJson({
            schema: 'e2s.substrate-federated-isolated-devnet-bootstrap-command-request.v1',
            version: 1,
            sourceTarget: {
              expectedChainId: '42', bridgeAddress, bridgeOwnerAddress: owner.ownerAddressHex,
              signedLegacyOwnerMintTransactionHex: owner.signedLegacyOwnerMintTransactionHex,
            },
          }) + '\\n');
          const digest = createHash('sha256').update(bytes).digest('hex');
          bindFrontierLabApplicationOwnerRequestV1(owner, bytes, digest);
          return digest;
        }
        const digest = await register();
        for (let i = 0; i < 3; i++) {
          await new Promise(setImmediate);
          global.gc();
        }
        const owner = claimFrontierLabApplicationOwnerRequestV1(digest);
        assertFrontierLabApplicationOwnerClaimV1(owner, digest);
        disposeFrontierLabApplicationOwnerV1(owner);
        let rejected = false;
        try { claimFrontierLabApplicationOwnerRequestV1(digest); }
        catch { rejected = true; }
        if (!rejected) throw new Error('disposed custody was reclaimed');
        process.stdout.write('custody transferred and disposed');
      `,
    ], { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000, stdio: 'pipe' });
    expect(output).toBe('custody transferred and disposed');
  });

  it('claims only the original live owner once, without reconstructing it from JSON', async () => {
    const owner = await freshOwner();
    const source = `${canonicalJson(requestFor(owner))}\n`;
    const digest = hash(source);
    expect(() => claimFrontierLabApplicationOwnerRequestV1(digest)).toThrow(/no unclaimed live/);
    bindFrontierLabApplicationOwnerRequestV1(owner, source, digest);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(owner, digest)).toThrow(/not claimed/);
    expect(() => claimFrontierLabApplicationOwnerRequestV1('ff'.repeat(32))).toThrow(/no unclaimed live/);
    expect(claimFrontierLabApplicationOwnerRequestV1(digest)).toBe(owner);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(owner, digest)).not.toThrow();
    expect(() => assertFrontierLabApplicationOwnerClaimV1(owner, 'ff'.repeat(32))).toThrow(/exact request/);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(JSON.parse(JSON.stringify(owner)), digest))
      .toThrow(/live process custody/);
    expect(() => claimFrontierLabApplicationOwnerRequestV1(digest)).toThrow(/no unclaimed live/);
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, source, digest)).toThrow(/already bound/);
    disposeFrontierLabApplicationOwnerV1(owner);
    expect(() => assertFrontierLabApplicationOwnerClaimV1(owner, digest)).toThrow(/live process custody/);
    expect(() => claimFrontierLabApplicationOwnerRequestV1(digest)).toThrow(/no unclaimed live/);
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, source, digest)).toThrow(/live process custody/);
  });

  it('removes unclaimed custody on disposal without affecting another request', async () => {
    const owner = await freshOwner();
    const other = await freshOwner();
    const source = `${canonicalJson(requestFor(owner))}\n`;
    const otherSource = `${canonicalJson(requestFor(other))}\n`;
    bindFrontierLabApplicationOwnerRequestV1(owner, source, hash(source));
    bindFrontierLabApplicationOwnerRequestV1(other, otherSource, hash(otherSource));
    disposeFrontierLabApplicationOwnerV1(owner);
    expect(() => claimFrontierLabApplicationOwnerRequestV1(hash(source))).toThrow(/no unclaimed live/);
    expect(claimFrontierLabApplicationOwnerRequestV1(hash(otherSource))).toBe(other);
  });

  it.each(['', 'FF'.repeat(32), '0x' + 'ff'.repeat(32)])('rejects invalid claim digest %s', digest => {
    expect(() => claimFrontierLabApplicationOwnerRequestV1(digest)).toThrow(/claim digest is invalid/);
  });

  it('creates distinct owners with only a fixed synthetic unreserved mint probe', async () => {
    const owner = await freshOwner();
    const other = await freshOwner();
    expect(other.ownerAddressHex).not.toBe(owner.ownerAddressHex);
    const probe = buildAuthoritySafeLegacyMintProbeV1({
      signedTransactionHex: owner.signedLegacyOwnerMintTransactionHex,
      expectedChainId: 42n,
      expectedBridgeAddress: BRIDGE,
      expectedBridgeOwnerAddress: owner.ownerAddressHex,
    });
    expect(probe.recipientAddress).toBe(owner.ownerAddressHex);
    expect(probe.amount).toBe('15000000');
    const tx = Transaction.from(owner.signedLegacyOwnerMintTransactionHex);
    expect(tx.nonce).toBe(0);
    expect(tx.gasPrice).toBe(1_000_000_000n);
    expect(tx.gasLimit).toBe(5_000_000n);
    expect(tx.value).toBe(0n);
    const probeIdentity = createHash('sha256')
      .update('E2S_FRONTIER_LAB_UNRESERVED_OWNER_PROBE_V1\0', 'ascii')
      .update(owner.ownerAddressHex, 'ascii').digest('hex');
    expect(tx.data).toBe('0xf28ee187'
      + owner.ownerAddressHex.slice(2).padStart(64, '0')
      + (15_000_000n).toString(16).padStart(64, '0') + probeIdentity);
    expect(Reflect.ownKeys(owner).sort()).toEqual([
      'ownerAddressHex', 'signedLegacyOwnerMintTransactionHex',
    ]);
    expect(Object.isFrozen(owner)).toBe(true);
    expect(JSON.parse(JSON.stringify(owner))).toEqual(owner);
  });

  it('binds one exact request, rejects clones and never rebinds', async () => {
    const owner = await freshOwner();
    const source = `${canonicalJson(requestFor(owner))}\n`;
    const digest = hash(source);
    expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest))
      .toThrow(/not bound/);
    bindFrontierLabApplicationOwnerRequestV1(owner, source, digest);
    expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest)).not.toThrow();
    for (const clone of [{ ...owner }, JSON.parse(JSON.stringify(owner))]) {
      expect(() => assertFrontierLabApplicationOwnerRequestV1(clone, digest))
        .toThrow(/live process custody/);
    }
    expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, 'ff'.repeat(32)))
      .toThrow(/exact request/);
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, source, digest))
      .toThrow(/already bound/);
    expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest)).not.toThrow();
    disposeFrontierLabApplicationOwnerV1(owner);
    expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest))
      .toThrow(/live process custody/);
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, source, digest))
      .toThrow(/live process custody/);
  });

  it.each([
    ['expectedChainId', '43'],
    ['bridgeAddress', `0x${'11'.repeat(20)}`],
    ['bridgeOwnerAddress', `0x${'22'.repeat(20)}`],
    ['signedLegacyOwnerMintTransactionHex', '0x0102'],
  ])('rejects a canonically rehashed %s change and disposes custody', async (field, value) => {
    const owner = await freshOwner();
    const request = requestFor(owner);
    Object.assign(request.sourceTarget, { [field]: value });
    const source = `${canonicalJson(request)}\n`;
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, source, hash(source)))
      .toThrow(/retained owner and probe/);
    const valid = `${canonicalJson(requestFor(owner))}\n`;
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, valid, hash(valid)))
      .toThrow(/live process custody/);
  });

  it.each([
    ['schema', 'other.request'], ['version', 2],
  ])('rejects a different %s even with a matching digest', async (field, value) => {
    const owner = await freshOwner();
    const request = { ...requestFor(owner), [field]: value };
    const source = `${canonicalJson(request)}\n`;
    expect(() => bindFrontierLabApplicationOwnerRequestV1(owner, source, hash(source)))
      .toThrow(/retained owner and probe/);
  });

  it.each(['digest', 'newline', 'duplicate', 'malformed', 'oversized'] as const)(
    'rejects %s without retaining a reusable owner', async fault => {
      const owner = await freshOwner();
      const valid = `${canonicalJson(requestFor(owner))}\n`;
      const source = fault === 'newline' ? valid.trimEnd()
        : fault === 'duplicate' ? valid.replace('"version":1', '"version":1,"version":1')
          : fault === 'malformed' ? '{' : fault === 'oversized' ? ' '.repeat(1024 * 1024 + 1)
            : valid;
      expect(() => bindFrontierLabApplicationOwnerRequestV1(
        owner, source, fault === 'digest' ? 'ff'.repeat(32) : hash(source),
      )).toThrow();
      expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, hash(valid)))
        .toThrow(/live process custody/);
    },
  );

  it.each(['original digest', 'rehash malformed bytes'] as const)(
    'rejects invalid UTF-8 with %s despite replacement decoding matching valid text', async mode => {
      const owner = await freshOwner();
      const valid = Buffer.from(`${canonicalJson({ ...requestFor(owner), label: '\ufffd' })}\n`);
      const offset = valid.indexOf(Buffer.from('\ufffd'));
      expect(offset).toBeGreaterThan(0);
      const malformed = Buffer.concat([valid.subarray(0, offset), Buffer.from([0xff]), valid.subarray(offset + 3)]);
      expect(malformed.toString('utf8')).toBe(valid.toString('utf8'));
      const digest = createHash('sha256').update(mode === 'original digest' ? valid : malformed).digest('hex');
      expect(() => bindOwnerBytes(owner, malformed, digest)).toThrow(
        mode === 'original digest' ? /canonical bytes changed/ : /encoded data.*valid/,
      );
      expect(() => assertFrontierLabApplicationOwnerRequestV1(owner, digest)).toThrow(/live process custody/);
    },
  );

  it('rejects unknown or disposed handles and invalid bridge input', async () => {
    const owner = await freshOwner();
    disposeFrontierLabApplicationOwnerV1(owner);
    expect(() => disposeFrontierLabApplicationOwnerV1(owner)).not.toThrow();
    expect(() => disposeFrontierLabApplicationOwnerV1({ ...owner })).toThrow(/process custody/);
    await expect(createFrontierLabApplicationOwnerV1(`0x${'00'.repeat(20)}`)).rejects.toThrow();
    await expect(createFrontierLabApplicationOwnerV1('invalid')).rejects.toThrow();
  });
});
