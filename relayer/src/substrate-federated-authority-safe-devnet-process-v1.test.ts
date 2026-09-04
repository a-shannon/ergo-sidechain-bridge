import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertOwnedAuthoritySafeDevnetProcessV1Receipt,
  withOwnedAuthoritySafeDevnetProcessesV1,
  type OwnedAuthoritySafeDevnetProcessV1Input,
} from './substrate-federated-authority-safe-devnet-process-v1.js';

const CHAIN_SPEC_BYTES = Buffer.from('{"name":"authority-safe"}', 'utf8');
const servers: Server[] = [];

describe.skipIf(process.platform !== 'win32')('owned authority-safe devnet processes V1', () => {
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      if (!server.listening) continue;
      server.close();
      await once(server, 'close');
    }
  });

  it('rejects a non-loopback RPC origin before process launch', async () => {
    await expect(withOwnedAuthoritySafeDevnetProcessesV1({
      ...input(),
      primaryRpcUrl: 'http://192.0.2.1:9955',
    }, async () => 'unreachable')).rejects.toThrow(/loopback HTTP origin/);
  });

  it('rejects duplicate process ports before process launch', async () => {
    await expect(withOwnedAuthoritySafeDevnetProcessesV1({
      ...input(),
      primaryP2pPort: 9955,
    }, async () => 'unreachable')).rejects.toThrow(/pairwise distinct/);
  });

  it('rejects chain-spec bytes that differ from their explicit pin', async () => {
    await expect(withOwnedAuthoritySafeDevnetProcessesV1({
      ...input(),
      expectedChainSpecSha256Hex: '11'.repeat(32),
    }, async () => 'unreachable')).rejects.toThrow(/chain-spec bytes differ/);
  });

  it('rejects a node binary that differs from the in-run identity', async () => {
    await expect(withOwnedAuthoritySafeDevnetProcessesV1({
      ...input(),
      expectedNodeBinarySha256Hex: '22'.repeat(32),
    }, async () => 'unreachable')).rejects.toThrow(/node binary SHA-256/);
  });

  it('rejects a process port already owned by another listener', async () => {
    const allocated = await allocatePorts(6);
    const occupied = allocated[0]!;
    const released = allocated.slice(1);
    const ports = allocated.map(server => portOf(server));
    for (const server of released) {
      server.close();
      await once(server, 'close');
    }

    await expect(withOwnedAuthoritySafeDevnetProcessesV1({
      ...input(),
      primaryRpcUrl: `http://127.0.0.1:${ports[0]!}`,
      witnessRpcUrl: `http://127.0.0.1:${ports[1]!}`,
      primaryP2pPort: ports[2]!,
      witnessP2pPort: ports[3]!,
      primaryPrometheusPort: ports[4]!,
      witnessPrometheusPort: ports[5]!,
    }, async () => 'unreachable')).rejects.toThrow(/port is already owned/);
    expect(occupied.listening).toBe(true);
  }, 45_000);

  // This path composes two independently bounded 30-second Windows probes.
  it('continues past an exact empty listener result before process launch', async () => {
    const allocated = await allocatePorts(6);
    const ports = allocated.map(server => portOf(server));
    for (const server of allocated) {
      server.close();
      await once(server, 'close');
    }

    await expect(withOwnedAuthoritySafeDevnetProcessesV1({
      ...input(),
      primaryRpcUrl: `http://127.0.0.1:${ports[0]!}`,
      witnessRpcUrl: `http://127.0.0.1:${ports[1]!}`,
      primaryP2pPort: ports[2]!,
      witnessP2pPort: ports[3]!,
      primaryPrometheusPort: ports[4]!,
      witnessPrometheusPort: ports[5]!,
    }, async () => 'unreachable')).rejects.toThrow(/primary process exited unexpectedly/);
  }, 75_000);

  it('fails closed while targeting the requested Windows listener ports', () => {
    const source = readFileSync(new URL(
      './substrate-federated-authority-safe-devnet-process-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).toContain(
      'Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction Stop',
    );
    expect(source).toContain('CmdletizationQuery_NotFound,Get-NetTCPConnection*');
    expect(source).toContain('{ $rows=@() } else { throw }');
    expect(source).toContain('timeout: 30_000');
    expect(source).not.toContain('Where-Object { $ports -contains $_.LocalPort }');
    expect(source).not.toContain(
      'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue',
    );
  });

  it('rejects a copied or fabricated process receipt', () => {
    expect(() => assertOwnedAuthoritySafeDevnetProcessV1Receipt({
      schema: 'e2s.substrate-federated-authority-safe-devnet-process.v1',
      version: 1,
    })).toThrow(/provenance/);
  });
});

function input(): OwnedAuthoritySafeDevnetProcessV1Input {
  return {
    nodeBinaryPath: process.execPath,
    expectedNodeBinarySha256Hex: fileSha256(process.execPath),
    chainSpecBytes: CHAIN_SPEC_BYTES,
    expectedChainSpecSha256Hex: sha256(CHAIN_SPEC_BYTES),
    primaryRpcUrl: 'http://127.0.0.1:9955',
    witnessRpcUrl: 'http://127.0.0.1:9956',
    primaryP2pPort: 30355,
    witnessP2pPort: 30356,
    primaryPrometheusPort: 9615,
    witnessPrometheusPort: 9616,
  };
}

async function allocatePorts(count: number): Promise<Server[]> {
  const allocated: Server[] = [];
  for (let index = 0; index < count; index += 1) {
    const server = createServer();
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    allocated.push(server);
  }
  return allocated;
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test listener did not expose a TCP port');
  }
  return address.port;
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
