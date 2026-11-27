import http from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  dupEmptyDigestHex,
  reserveEmptyDigestHex,
  sigmaAvlTreeHex,
  sigmaCollByteHex,
  sigmaIntHex,
  sigmaLongHex,
  trackerEmptyDigestHex,
} from '../src/core/avl.js';
import {
  decodePegInIntentV2,
  hexToBytes,
  initialTrackerGovernanceR9,
} from '../src/core/codecs.js';
import { compileBridgeV1Family } from '../src/core/contracts.js';
import { deriveKeyPairFromSecretHex, makeSyntheticErgoBox } from '../src/crypto/signer.js';
import { StockErgoNodeClient } from '../src/clients/ergo-node.js';
import { BridgeWebServer, parseErgoP2pkRecipient } from '../src/web/server.js';

const K_C1 = deriveKeyPairFromSecretHex('11'.repeat(32), 16);
const K_C2 = deriveKeyPairFromSecretHex('22'.repeat(32), 16);
const K_USER = deriveKeyPairFromSecretHex('77'.repeat(32), 16);

describe('Bridge V1 Web Console API & P2PK Recipient Parser', () => {
  it('serves hardened HTML/CSP, live telemetry JSON, EIP-12 deposit builder, and strict recipient validation', async () => {
    const family = compileBridgeV1Family({
      networkPrefix: 16,
      sourceNetworkIdHex: 'a1'.repeat(32),
      sidechainIdHex: 'b2'.repeat(32),
      bridgeAddressHex: 'c3'.repeat(20),
      tokenAddressHex: 'd4'.repeat(20),
      trackerNftIdHex: 'e1'.repeat(32),
      dupNftIdHex: 'e2'.repeat(32),
      reserveNftIdHex: 'e3'.repeat(32),
      committeePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex],
      committeeThreshold: 2,
      committeeEpoch: 1n,
      escapeTimeoutBlocks: 100,
      minConfirmations: 10n,
      upgradeTimelockBlocks: 20n,
      maxAdmissionLagBlocks: 5n,
      minDepositNanoErg: 10_000_000n,
    });

    // Mock StockErgoNodeClient returning deterministic live singleton boxes
    const reserveBox = makeSyntheticErgoBox({
      txIdHex: '11'.repeat(32),
      index: 0,
      value: 35_000_000n,
      ergoTreeHex: family.reserve.ergoTreeHex,
      creationHeight: 100,
      assets: [{ tokenId: family.params.reserveNftIdHex, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex)),
        R5: sigmaAvlTreeHex(reserveEmptyDigestHex(), 32),
        R6: sigmaLongHex(15_000_000n),
      },
    });
    const dupBox = makeSyntheticErgoBox({
      txIdHex: '12'.repeat(32),
      index: 0,
      value: 10_000_000n,
      ergoTreeHex: family.dup.ergoTreeHex,
      creationHeight: 105,
      assets: [{ tokenId: family.params.dupNftIdHex, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex)),
        R5: sigmaAvlTreeHex(dupEmptyDigestHex(), 1),
      },
    });
    const trackerBox = makeSyntheticErgoBox({
      txIdHex: '13'.repeat(32),
      index: 0,
      value: 10_000_000n,
      ergoTreeHex: family.tracker.ergoTreeHex,
      creationHeight: 110,
      assets: [{ tokenId: family.params.trackerNftIdHex, amount: 1n }],
      additionalRegisters: {
        R4: sigmaCollByteHex(hexToBytes(family.familyIdHex)),
        R5: sigmaAvlTreeHex(trackerEmptyDigestHex(), 370),
        R6: sigmaCollByteHex(hexToBytes(family.params.sidechainIdHex)),
        R7: sigmaLongHex(6n),
        R8: sigmaIntHex(110),
        R9: sigmaCollByteHex(initialTrackerGovernanceR9(1n)),
      },
    });

    const mockErgo = {
      getInfo: async () => ({ fullHeight: 150, headersHeight: 150 }),
      getIndexedHeight: async () => ({ indexedHeight: 150, fullHeight: 150 }),
      getLiveSingletonBox: async (tokenId: string) => {
        if (tokenId === family.params.reserveNftIdHex) return { ...reserveBox, inclusionHeight: 100, spentTransactionId: null };
        if (tokenId === family.params.dupNftIdHex) return { ...dupBox, inclusionHeight: 105, spentTransactionId: null };
        if (tokenId === family.params.trackerNftIdHex) return { ...trackerBox, inclusionHeight: 110, spentTransactionId: null };
        throw new Error(`Unknown token ${tokenId}`);
      },
    } as unknown as StockErgoNodeClient;

    const web = new BridgeWebServer({ family, ergo: mockErgo, port: 0 });
    const url = await web.start();
    try {
      // 1. HTML + strict CSP (zero 'unsafe-inline' scripts [M-6]) + /app.js
      const htmlRes = await fetch(`${url}/`);
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers.get('x-frame-options')).toBe('DENY');
      expect(htmlRes.headers.get('x-content-type-options')).toBe('nosniff');
      const csp = htmlRes.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("script-src 'self';");
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
      expect(await htmlRes.text()).toContain('<script src="/app.js"></script>');

      const jsRes = await fetch(`${url}/app.js`);
      expect(jsRes.status).toBe(200);
      const jsText = await jsRes.text();
      expect(jsText).toContain('parseErgDecimalToNano');
      expect(jsText).not.toContain('parseFloat');

      // 2. /api/status live telemetry — tri-state solvency returns EVM_UNVERIFIED when EVM RPC offline ([M-5])
      const statusRes = await fetch(`${url}/api/status`);
      expect(statusRes.status).toBe(200);
      const status = (await statusRes.json()) as any;
      expect(status.familyId).toBe(family.familyIdHex);
      expect(status.ergo.reserve.liabilityNano).toBe('15000000');
      expect(status.ergo.reserve.bufferNano).toBe('20000000');
      expect(status.ergo.tracker.mode).toBe('FEDERATED');
      expect(status.ergo.tracker.latestSourceHeight).toBe('6');
      expect(status.solvencyStatus).toBe('EVM_UNVERIFIED');
      expect(status.solvencyOk).toBeNull();

      // 2b. Prometheus /metrics endpoint exposes live Ergo & solvency gauges
      const metricsRes = await fetch(`${url}/metrics`);
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.headers.get('content-type')).toContain('text/plain');
      const metricsText = await metricsRes.text();
      expect(metricsText).toContain('bridge_ergo_full_height');
      expect(metricsText).toContain('bridge_reserve_erg_nano');
      expect(metricsText).toContain('bridge_reserve_liability_nano');
      expect(metricsText).toMatch(/bridge_solvency_status\{[^}]*status="unverified"\} 1\b/);
      expect(metricsText).toMatch(/bridge_solvency_alert\{[^}]*\} 0\b/);

      // 3. [M-6] POST rejects non-JSON Content-Type (415) and cross-origin Origin (403)
      const badCt = await fetch(`${url}/api/parse-ergo-recipient`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ergoRecipient: K_USER.address }),
      });
      expect(badCt.status).toBe(415);

      const badOrigin = await fetch(`${url}/api/parse-ergo-recipient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify({ ergoRecipient: K_USER.address }),
      });
      expect(badOrigin.status).toBe(403);

      // 4. [H-7] Off-curve secp256k1 pubkey MUST be rejected (prevents permanent refund lock!)
      expect(() => parseErgoP2pkRecipient(`02${'00'.repeat(31)}05`, 16)).toThrow(/secp256k1/i);
      const offCurveRes = await fetch(`${url}/api/parse-ergo-recipient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ergoRecipient: `02${'00'.repeat(31)}05` }),
      });
      expect(offCurveRes.status).toBe(400);

      // 5. /api/build-deposit returns exact 229-byte PegInIntentV2 + EIP-12 candidate
      const buildRes = await fetch(`${url}/api/build-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountNanoErg: '30000000',
          evmRecipientHex: '0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0',
          depositorAddress: K_USER.address,
        }),
      });
      expect(buildRes.status).toBe(200);
      const built = (await buildRes.json()) as any;
      const intent = decodePegInIntentV2(hexToBytes(built.encodedIntentHex));
      expect(intent.amountNanoErg).toBe(30_000_000n);
      expect(intent.evmRecipientHex).toBe('0x3cd0a705a2dc65e5b1e1205896baa2be8a07c6e0');
      expect(built.eip12OutputCandidate.ergoTree).toBe(family.depositLock.ergoTreeHex);
      expect(built.eip12OutputCandidate.creationHeight).toBe(150);

      // 6. Rejects sub-minimum deposit & zero EVM address
      const subMin = await fetch(`${url}/api/build-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountNanoErg: '1000000',
          evmRecipientHex: '0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0',
          depositorAddress: K_USER.address,
        }),
      });
      expect(subMin.status).toBe(400);

      const zeroEvm = await fetch(`${url}/api/build-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountNanoErg: '30000000',
          evmRecipientHex: `0x${'00'.repeat(20)}`,
          depositorAddress: K_USER.address,
        }),
      });
      expect(zeroEvm.status).toBe(400);

      // 7. /api/parse-ergo-recipient handles both Base58 P2PK address and 33B pubkey hex
      const p1 = parseErgoP2pkRecipient(K_USER.address, 16);
      const p2 = parseErgoP2pkRecipient(K_USER.pubKeyHex, 16);
      expect(p1).toEqual(p2);
      const parseRes = await fetch(`${url}/api/parse-ergo-recipient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ergoRecipient: K_USER.address, grossAmountNanoErg: '20000000' }),
      });
      expect(parseRes.status).toBe(200);
      const parsedPayload = (await parseRes.json()) as any;
      expect(parsedPayload.pubKeyHex).toBe(`0x${K_USER.pubKeyHex}`);
      expect(parsedPayload.approveCalldata.startsWith('0x095ea7b3')).toBe(true);
      expect(parsedPayload.pegOutCalldata.startsWith('0xe83f7440')).toBe(true);
      expect(parsedPayload.netErgoUnlockNanoErg).toBe('15000000');

      // 8. [H-8] Fail closed with 503 if Ergo node is unreachable during /api/build-deposit!
      const brokenErgo = {
        getInfo: async () => {
          throw new Error('node offline');
        },
      } as unknown as StockErgoNodeClient;
      const webBroken = new BridgeWebServer({ family, ergo: brokenErgo, port: 0 });
      const urlBroken = await webBroken.start();
      try {
        const failRes = await fetch(`${urlBroken}/api/build-deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountNanoErg: '30000000',
            evmRecipientHex: '0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0',
            depositorAddress: K_USER.address,
          }),
        });
        expect(failRes.status).toBe(503);
      } finally {
        await webBroken.stop();
      }

      // 9. [N-1] Docker 0.0.0.0 bind MUST still enforce Host (anti-DNS-rebinding) & Origin (anti-CSRF)!
      const webDocker = new BridgeWebServer({ family, ergo: mockErgo, host: '0.0.0.0', port: 0 });
      const dockerUrl = await webDocker.start();
      const dockerPort = new URL(dockerUrl).port;
      try {
        const crossOriginDocker = await fetch(`http://127.0.0.1:${dockerPort}/api/parse-ergo-recipient`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
          body: JSON.stringify({ ergoRecipient: K_USER.address }),
        });
        expect(crossOriginDocker.status).toBe(403);

        const spoofedHostStatus = await new Promise<number>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: Number(dockerPort),
              path: '/api/health',
              method: 'GET',
              headers: { Host: `evil.example:${dockerPort}` },
            },
            (res) => {
              res.resume();
              resolve(res.statusCode ?? 0);
            },
          );
          req.on('error', reject);
          req.end();
        });
        expect(spoofedHostStatus).toBe(403);
      } finally {
        await webDocker.stop();
      }
    } finally {
      await web.stop();
    }
  });
});
