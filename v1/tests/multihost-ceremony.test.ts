import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  sigmaAvlTreeHex,
  sigmaCollByteHex,
  sigmaIntHex,
  sigmaLongHex,
  trackerEmptyDigestHex,
} from '../src/core/avl.js';
import {
  ZERO_32_HEX,
  hexToBytes,
  initialTrackerGovernanceR9,
} from '../src/core/codecs.js';
import { compileBridgeV1Family, verifyTransactionsJvm } from '../src/core/contracts.js';
import { buildTrackerAdmitTx, buildTrackerProposeUpgradeTx } from '../src/core/tx-builders.js';
import {
  CommitteePolicyConfig,
  CommitteeSignerServer,
  ParsedAdmitCheckpoint,
  computeCeremonyHmacHex,
} from '../src/crypto/ceremony-server.js';
import {
  RemoteCommitteeSignerEndpoint,
  executeRemoteCommitteeCeremony,
} from '../src/crypto/ceremony-client.js';
import { deriveKeyPairFromSecretHex, makeSyntheticErgoBox } from '../src/crypto/signer.js';

const SEC_C1 = '11'.repeat(32);
const SEC_C2 = '22'.repeat(32);
const SEC_C3 = '33'.repeat(32);
const SEC_FEE = '66'.repeat(32);

const K_C1 = deriveKeyPairFromSecretHex(SEC_C1, 16);
const K_C2 = deriveKeyPairFromSecretHex(SEC_C2, 16);
const K_C3 = deriveKeyPairFromSecretHex(SEC_C3, 16);
const K_FEE = deriveKeyPairFromSecretHex(SEC_FEE, 16);

const AUTH_C1 = 'signer-c1-hmac-secret-test-key-0001';
const AUTH_C2 = 'signer-c2-hmac-secret-test-key-0002';
const AUTH_C3 = 'signer-c3-hmac-secret-test-key-0003';

describe('Multi-Host Distributed 2-of-3 Committee Ceremony Server & Client', () => {
  it(
    'executes 2-of-3 HTTP ceremony with verified checkpoints, verifies in SigmaState 6.0.2 JVM, and blocks fabricated roots, unauthorized governance, blind-signing, auth forgery, and nonce replay',
    async () => {
      const sourceNetworkIdHex = 'a1'.repeat(32);
      const sidechainIdHex = 'b2'.repeat(32);
      const trackerNftIdHex = 'e1'.repeat(32);
      const dupNftIdHex = 'e2'.repeat(32);
      const reserveNftIdHex = 'e3'.repeat(32);
      const expectedBurnRootHex = '40'.repeat(32);

      const family = compileBridgeV1Family({
        networkPrefix: 16,
        sourceNetworkIdHex,
        sidechainIdHex,
        bridgeAddressHex: 'c3'.repeat(20),
        tokenAddressHex: 'd4'.repeat(20),
        trackerNftIdHex,
        dupNftIdHex,
        reserveNftIdHex,
        committeePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
        committeeThreshold: 2,
        committeeEpoch: 1n,
        escapeTimeoutBlocks: 100,
        minConfirmations: 10n,
        upgradeTimelockBlocks: 20n,
        maxAdmissionLagBlocks: 5n,
        minRefreshAgeBlocks: 15,
      });

      // Independent checkpoint verifier rejecting any fabricated burn root ([C-1])
      const verifiedCheckpointCheck = (cp: ParsedAdmitCheckpoint) => {
        if (cp.bridgeEventRootHex !== expectedBurnRootHex) {
          throw new Error('Policy reject: fabricated bridgeEventRoot not found on Frontier');
        }
      };

      const policy: CommitteePolicyConfig = {
        trackerNftIdHex,
        familyIdHex: family.familyIdHex,
        sourceNetworkIdHex,
        sidechainIdHex,
        ergoKeySetDigestHex: family.ergoKeySetDigestHex,
        expectedTrackerErgoTreeHex: family.tracker.ergoTreeHex,
        minUpgradeTimelockBlocks: 20n,
        maxAdmissionLagBlocks: 5n,
        forbiddenExtraNftIdsHex: [dupNftIdHex, reserveNftIdHex],
        checkpointVerifier: verifiedCheckpointCheck,
        ergoHeightProvider: () => 125,
      };

      // Spin up 2 live independent signer servers (C1 and C2) while C3 is offline/unreachable!
      const server1 = new CommitteeSignerServer({
        memberSecretHex: SEC_C1,
        authSecret: AUTH_C1,
        policy,
      });
      const server2 = new CommitteeSignerServer({
        memberSecretHex: SEC_C2,
        authSecret: AUTH_C2,
        policy,
      });

      const [url1, url2] = await Promise.all([server1.start(), server2.start()]);
      try {
        const health = (await (await fetch(`${url1}/health`)).json()) as Record<string, unknown>;
        expect(health.ok).toBe(true);
        expect(health.pubKeyHex).toBe(K_C1.pubKeyHex);

        const trackerBox = makeSyntheticErgoBox({
          txIdHex: '01'.repeat(32),
          index: 0,
          value: 10_000_000n,
          ergoTreeHex: family.tracker.ergoTreeHex,
          creationHeight: 100,
          assets: [{ tokenId: trackerNftIdHex, amount: 1n }],
          additionalRegisters: {
            R4: sigmaCollByteHex(hexToBytes(family.familyIdHex)),
            R5: sigmaAvlTreeHex(trackerEmptyDigestHex(), 370),
            R6: sigmaCollByteHex(hexToBytes(sidechainIdHex)),
            R7: sigmaLongHex(0n),
            R8: sigmaIntHex(100),
            R9: sigmaCollByteHex(initialTrackerGovernanceR9(1n)),
          },
        });
        const feeBox = makeSyntheticErgoBox({
          txIdHex: '02'.repeat(32),
          index: 0,
          value: 10_000_000n,
          ergoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 100,
        });
        const admit = buildTrackerAdmitTx({
          family,
          trackerBox,
          trackerHistory: [],
          checkpoint: {
            sourceNetworkIdHex,
            sidechainIdHex,
            sourceHeight: 42n,
            sourceBlockHashHex: '30'.repeat(32),
            executionBlockHashHex: '31'.repeat(32),
            bridgeEventRootHex: expectedBurnRootHex,
            burnCount: 1,
          },
          currentR9Bytes: initialTrackerGovernanceR9(1n),
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 125,
        });

        // 1. Coordinator executes 2-of-3 remote ceremony with C3 offline (zero committee secrets on coordinator!)
        const remoteSigners: RemoteCommitteeSignerEndpoint[] = [
          { id: 'c3-offline', url: 'http://127.0.0.1:1', pubKeyHex: K_C3.pubKeyHex, authSecret: AUTH_C3 },
          { id: 'c1', url: url1, pubKeyHex: K_C1.pubKeyHex, authSecret: AUTH_C1 },
          { id: 'c2', url: url2, pubKeyHex: K_C2.pubKeyHex, authSecret: AUTH_C2 },
        ];
        const signed = await executeRemoteCommitteeCeremony({
          ...admit,
          allCommitteePubKeysHex: [K_C1.pubKeyHex, K_C2.pubKeyHex, K_C3.pubKeyHex],
          threshold: 2,
          remoteSigners,
          feePayerSecretHex: SEC_FEE,
          height: 125,
          timeoutMs: 5_000,
        });

        // 2. Verify in SigmaState 6.0.2 JVM!
        const [jvmRes] = verifyTransactionsJvm([
          {
            id: 'multihost_http_2of3_admit',
            height: 125,
            txBytesHex: signed.txBytesHex,
            inputBoxesBytesHex: signed.inputBoxesBytesHex,
            dataBoxesBytesHex: signed.dataBoxesBytesHex,
          },
        ]);
        expect(jvmRes.ok).toBe(true);
        expect(jvmRes.allPassed).toBe(true);
        expect(jvmRes.txId).toBe(signed.txId);
        expect(jvmRes.totalCost).toBeLessThanOrEqual(1_000_000);

        const signedPost = async (reqPath: string, payload: unknown) => {
          const rawBody = JSON.stringify(payload);
          const ts = String(Date.now());
          const nonce = crypto.randomBytes(16).toString('hex');
          const sig = computeCeremonyHmacHex(AUTH_C1, ts, nonce, 'POST', reqPath, rawBody);
          return fetch(`${url1}${reqPath}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bridge-timestamp': ts,
              'x-bridge-nonce': nonce,
              'x-bridge-signature': sig,
            },
            body: rawBody,
          });
        };

        // 3. [C-1] Compromised coordinator submits fabricated burn Merkle root -> MUST reject 403!
        const fakeRootAdmit = buildTrackerAdmitTx({
          family,
          trackerBox,
          trackerHistory: [],
          checkpoint: {
            sourceNetworkIdHex,
            sidechainIdHex,
            sourceHeight: 42n,
            sourceBlockHashHex: '30'.repeat(32),
            executionBlockHashHex: '31'.repeat(32),
            bridgeEventRootHex: 'ff'.repeat(32), // fabricated burn root!
            burnCount: 1,
          },
          currentR9Bytes: initialTrackerGovernanceR9(1n),
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 125,
        });
        const fakeRootRes = await signedPost('/v1/ceremony/commit', {
          unsignedTx: fakeRootAdmit.unsignedTx,
          inputBoxes: fakeRootAdmit.inputBoxes,
          dataBoxes: fakeRootAdmit.dataBoxes,
          height: 125,
        });
        expect(fakeRootRes.status).toBe(403);
        expect(await fakeRootRes.text()).toMatch(/fabricated bridgeEventRoot/i);

        // 4. [C-2] Compromised coordinator submits proposeUpgrade to automated signer -> MUST reject 403!
        const attackerPropose = buildTrackerProposeUpgradeTx({
          family,
          trackerBox,
          currentEpoch: 1n,
          upgradeTimelockBlocks: 20n,
          mode: 1,
          targetScriptHashHex: 'de'.repeat(32),
          trustAnchorDigestHex: ZERO_32_HEX,
          feeInBox: feeBox,
          changeErgoTreeHex: K_FEE.p2pkErgoTreeHex,
          creationHeight: 125,
        });
        const proposeRes = await signedPost('/v1/ceremony/commit', {
          unsignedTx: attackerPropose.unsignedTx,
          inputBoxes: attackerPropose.inputBoxes,
          dataBoxes: attackerPropose.dataBoxes,
          height: 125,
        });
        expect(proposeRes.status).toBe(403);
        expect(await proposeRes.text()).toMatch(/proposeUpgrade signing is disabled/i);

        // 5. Unauthenticated request -> 401
        const unauthRes = await fetch(`${url1}/v1/ceremony/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unsignedTx: admit.unsignedTx,
            inputBoxes: admit.inputBoxes,
            dataBoxes: admit.dataBoxes,
            height: 125,
          }),
        });
        expect(unauthRes.status).toBe(401);

        // 6. Blind-signing ERG drain -> 403
        const maliciousAdmit = structuredClone(admit);
        maliciousAdmit.unsignedTx.outputs[0].value = '1000000';
        const blindRes = await signedPost('/v1/ceremony/commit', {
          unsignedTx: maliciousAdmit.unsignedTx,
          inputBoxes: maliciousAdmit.inputBoxes,
          dataBoxes: maliciousAdmit.dataBoxes,
          height: 125,
        });
        expect(blindRes.status).toBe(403);

        // 7. Wire secret check + tx swap (403) + Schnorr nonce reuse replay (409)
        const r1Res = await signedPost('/v1/ceremony/commit', {
          unsignedTx: admit.unsignedTx,
          inputBoxes: admit.inputBoxes,
          dataBoxes: admit.dataBoxes,
          height: 125,
        });
        expect(r1Res.status).toBe(200);
        const r1RawText = await r1Res.text();
        expect(r1RawText).not.toContain('cmtWithSecret');
        expect(r1RawText).not.toContain('"secret"');
        const r1Json = JSON.parse(r1RawText) as { sessionId: string };

        const swapRes = await signedPost('/v1/ceremony/sign', {
          sessionId: r1Json.sessionId,
          unsignedTx: admit.unsignedTx,
          inputBoxes: admit.inputBoxes,
          dataBoxes: admit.dataBoxes,
          publicHintsJsonList: [],
          simulatedPubKeysHex: [K_C3.pubKeyHex],
          height: 126,
        });
        expect(swapRes.status).toBe(403);

        const replayRes = await signedPost('/v1/ceremony/sign', {
          sessionId: r1Json.sessionId,
          unsignedTx: admit.unsignedTx,
          inputBoxes: admit.inputBoxes,
          dataBoxes: admit.dataBoxes,
          publicHintsJsonList: [],
          simulatedPubKeysHex: [K_C3.pubKeyHex],
          height: 125,
        });
        expect(replayRes.status).toBe(409);

        // 8. [M-1] Consumed sessions do NOT occupy activeSessions quota!
        const healthAfter = (await (await fetch(`${url1}/health`)).json()) as { activeSessions: number };
        expect(healthAfter.activeSessions).toBe(0);
      } finally {
        await Promise.all([server1.stop(), server2.stop()]);
      }
    },
    30_000,
  );
});
