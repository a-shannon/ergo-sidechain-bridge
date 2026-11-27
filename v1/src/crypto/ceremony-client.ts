import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {
  CeremonyCommitRequest,
  CeremonyCommitResponse,
  CeremonySignRequest,
  CeremonySignResponse,
  computeCeremonyHmacHex,
  computeCeremonyTxDigest,
} from './ceremony-server.js';
import {
  ErgoBoxJson,
  MinimalHeaderJson,
  SignedTxResult,
  UnsignedTxJson,
  committeeGenerateCommitmentsJson,
  finalizeDistributedCommitteeTx,
} from './signer.js';

export interface RemoteSignerTlsClientConfig {
  caPem?: string | Buffer;
  certPem?: string | Buffer;
  keyPem?: string | Buffer;
  caPath?: string;
  certPath?: string;
  keyPath?: string;
  rejectUnauthorized?: boolean;
}

export interface RemoteCommitteeSignerEndpoint {
  id?: string;
  url: string;
  pubKeyHex: string;
  authSecret: string;
  /** Optional TLS/mTLS client configuration for private CA & mutual TLS ([H-3]) */
  tls?: RemoteSignerTlsClientConfig;
}

function resolvePem(pem?: string | Buffer, filePath?: string): string | Buffer | undefined {
  if (pem !== undefined) return pem;
  if (filePath) return fs.readFileSync(filePath);
  return undefined;
}

function postSignedCeremonyJson<T>(
  endpoint: RemoteCommitteeSignerEndpoint,
  reqPath: string,
  payload: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const targetUrl = new URL(reqPath, endpoint.url.replace(/\/+$/, '') + '/');
  const rawBody = JSON.stringify(payload);
  const timestampMs = String(Date.now());
  const requestNonce = crypto.randomBytes(16).toString('hex');
  const signature = computeCeremonyHmacHex(
    endpoint.authSecret,
    timestampMs,
    requestNonce,
    'POST',
    reqPath,
    rawBody,
  );

  const isHttps = targetUrl.protocol === 'https:';
  const reqHeaders: Record<string, string | number> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(rawBody, 'utf8'),
    Accept: 'application/json',
    'x-bridge-timestamp': timestampMs,
    'x-bridge-nonce': requestNonce,
    'x-bridge-signature': signature,
  };

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Ceremony request aborted'));
      return;
    }

    let settled = false;
    const finish = (err: Error | null, data?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(data as T);
    };

    const req = isHttps
      ? https.request(
          targetUrl,
          {
            method: 'POST',
            headers: reqHeaders,
            ca: resolvePem(endpoint.tls?.caPem, endpoint.tls?.caPath),
            cert: resolvePem(endpoint.tls?.certPem, endpoint.tls?.certPath),
            key: resolvePem(endpoint.tls?.keyPem, endpoint.tls?.keyPath),
            rejectUnauthorized: endpoint.tls?.rejectUnauthorized ?? true,
          },
          onResponse,
        )
      : http.request(
          targetUrl,
          {
            method: 'POST',
            headers: reqHeaders,
          },
          onResponse,
        );

    function onResponse(res: http.IncomingMessage): void {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          finish(
            new Error(
              `Signer ${endpoint.id ?? endpoint.pubKeyHex.slice(0, 10)} (${reqPath}) rejected (${status}): ${text}`,
            ),
          );
          return;
        }
        try {
          finish(null, JSON.parse(text) as T);
        } catch (parseErr) {
          finish(parseErr instanceof Error ? parseErr : new Error(String(parseErr)));
        }
      });
      res.on('error', (err) => finish(err));
    }

    const onAbort = () => {
      req.destroy();
      finish(new Error('Ceremony request aborted'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      req.destroy();
      finish(new Error(`Signer ${endpoint.id ?? endpoint.pubKeyHex.slice(0, 10)} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', (err) => finish(err));
    req.end(rawBody);
  });
}

async function runRound1Quorum(
  candidates: RemoteCommitteeSignerEndpoint[],
  threshold: number,
  commitReq: CeremonyCommitRequest,
  expectedTxDigest: string,
  timeoutMs: number,
): Promise<Array<{ endpoint: RemoteCommitteeSignerEndpoint; resp: CeremonyCommitResponse }>> {
  // Short-circuit as soon as `threshold` signers succeed, aborting any slow/hanging excess requests ([M-2])
  const abortExcess = new AbortController();
  const active: Array<{ endpoint: RemoteCommitteeSignerEndpoint; resp: CeremonyCommitResponse }> = [];
  const errors: string[] = [];

  await new Promise<void>((resolve, reject) => {
    let remaining = candidates.length;
    if (remaining < threshold) {
      reject(new Error(`Insufficient candidate signers (${remaining} < ${threshold})`));
      return;
    }

    for (const endpoint of candidates) {
      void postSignedCeremonyJson<CeremonyCommitResponse>(
        endpoint,
        '/v1/ceremony/commit',
        commitReq,
        timeoutMs,
        abortExcess.signal,
      ).then(
        (resp) => {
          remaining--;
          try {
            const label = endpoint.id ?? endpoint.pubKeyHex.slice(0, 10);
            if (
              !resp ||
              typeof resp !== 'object' ||
              typeof resp.pubKeyHex !== 'string' ||
              typeof resp.txDigest !== 'string' ||
              typeof resp.sessionId !== 'string' ||
              resp.sessionId.length === 0 ||
              typeof resp.publicCommitmentsJson !== 'string' ||
              resp.publicCommitmentsJson.length === 0
            ) {
              errors.push(`Signer ${label} returned malformed Round-1 JSON`);
            } else if (resp.pubKeyHex.toLowerCase() !== endpoint.pubKeyHex) {
              errors.push(`Signer ${label} pubKey mismatch`);
            } else if (resp.txDigest !== expectedTxDigest) {
              errors.push(`Signer ${label} txDigest mismatch`);
            } else if (active.length < threshold) {
              active.push({ endpoint, resp });
              if (active.length === threshold) {
                abortExcess.abort();
                resolve();
                return;
              }
            }
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
          if (remaining === 0 && active.length < threshold) {
            reject(
              new Error(
                `Remote ceremony Round 1 failed quorum (${active.length}/${threshold}): ${errors.join('; ')}`,
              ),
            );
          }
        },
        (err) => {
          remaining--;
          if (active.length < threshold) {
            errors.push(err instanceof Error ? err.message : String(err));
            if (remaining === 0) {
              reject(
                new Error(
                  `Remote ceremony Round 1 failed quorum (${active.length}/${threshold}): ${errors.join('; ')}`,
                ),
              );
            }
          }
        },
      );
    }
  });

  return active;
}

/**
 * Execute a full 3-round distributed `atLeast(t, n)` committee signing ceremony
 * over HTTP/HTTPS (including mTLS/private-CA support [H-3]).
 * Each committee signer host holds ONLY its own private key; the coordinator holds
 * ZERO committee secrets and NEVER receives any secret Schnorr nonce.
 *
 * Crash-fault tolerant in BOTH Round 1 (head-of-line short-circuit) AND Round 2
 * (automatic fresh-session failover excluding any signer that fails during Round 2 [M-2]).
 */
export async function executeRemoteCommitteeCeremony(params: {
  unsignedTx: UnsignedTxJson;
  inputBoxes: ErgoBoxJson[];
  dataBoxes?: ErgoBoxJson[];
  allCommitteePubKeysHex: string[];
  threshold: number;
  remoteSigners: RemoteCommitteeSignerEndpoint[];
  feePayerSecretHex: string;
  height: number;
  lastHeaders?: MinimalHeaderJson[];
  timeoutMs?: number;
}): Promise<SignedTxResult> {
  const timeoutMs = params.timeoutMs ?? 15_000;
  const committeeSet = new Set(params.allCommitteePubKeysHex.map((pk) => pk.toLowerCase()));
  if (params.threshold < 1 || params.threshold > committeeSet.size) {
    throw new Error(`Invalid committee threshold ${params.threshold}`);
  }

  const eligible: RemoteCommitteeSignerEndpoint[] = [];
  const seenPks = new Set<string>();
  for (const ep of params.remoteSigners) {
    const pk = ep.pubKeyHex.toLowerCase();
    if (!committeeSet.has(pk) || seenPks.has(pk)) continue;
    seenPks.add(pk);
    eligible.push({ ...ep, pubKeyHex: pk });
  }
  if (eligible.length < params.threshold) {
    throw new Error(
      `Insufficient configured remote signers: have ${eligible.length}, need ${params.threshold}`,
    );
  }

  const commitReq: CeremonyCommitRequest = {
    unsignedTx: params.unsignedTx,
    inputBoxes: params.inputBoxes,
    dataBoxes: params.dataBoxes,
    height: params.height,
    lastHeaders: params.lastHeaders,
  };
  const expectedTxDigest = computeCeremonyTxDigest(commitReq);
  const excludedPubKeys = new Set<string>();

  // Allow Round-2 failover retries while at least `threshold` non-excluded signers remain ([M-2])
  while (true) {
    const candidates = eligible.filter((ep) => !excludedPubKeys.has(ep.pubKeyHex));
    if (candidates.length < params.threshold) {
      throw new Error(
        `Remote ceremony exhausted all candidate signers (remaining=${candidates.length}, threshold=${params.threshold})`,
      );
    }

    const feeInputIdx = params.inputBoxes.length - 1;
    const feeRound1 =
      feeInputIdx > 0
        ? committeeGenerateCommitmentsJson({
            unsignedTx: params.unsignedTx,
            inputBoxes: params.inputBoxes,
            dataBoxes: params.dataBoxes,
            memberSecretHex: params.feePayerSecretHex,
            inputIndex: feeInputIdx,
            height: params.height,
            lastHeaders: params.lastHeaders,
          })
        : null;

    const activeSigners = await runRound1Quorum(
      candidates,
      params.threshold,
      commitReq,
      expectedTxDigest,
      timeoutMs,
    );

    const activePubKeys = new Set(activeSigners.map((s) => s.endpoint.pubKeyHex));
    const simulatedPubKeysHex = params.allCommitteePubKeysHex
      .map((pk) => pk.toLowerCase())
      .filter((pk) => !activePubKeys.has(pk));

    const allCommitteePublicCommitments = activeSigners.map((s) => s.resp.publicCommitmentsJson);
    const collectedExtractedPublicHints: string[] = [];
    let failedRound2PubKey: string | null = null;
    let lastRound2Err: Error | null = null;

    for (let i = 0; i < activeSigners.length; i++) {
      const current = activeSigners[i];
      const peerPublicHints: string[] = [];
      for (let j = 0; j < activeSigners.length; j++) {
        if (j !== i) peerPublicHints.push(activeSigners[j].resp.publicCommitmentsJson);
      }
      if (feeRound1) peerPublicHints.push(feeRound1.publicCommitmentsJson);
      peerPublicHints.push(...collectedExtractedPublicHints);

      const signReq: CeremonySignRequest = {
        sessionId: current.resp.sessionId,
        unsignedTx: params.unsignedTx,
        inputBoxes: params.inputBoxes,
        dataBoxes: params.dataBoxes,
        publicHintsJsonList: peerPublicHints,
        simulatedPubKeysHex: i === 0 ? simulatedPubKeysHex : [],
        height: params.height,
        lastHeaders: params.lastHeaders,
      };

      try {
        const signResp = await postSignedCeremonyJson<CeremonySignResponse>(
          current.endpoint,
          '/v1/ceremony/sign',
          signReq,
          timeoutMs,
        );
        if (
          !signResp ||
          typeof signResp !== 'object' ||
          typeof signResp.pubKeyHex !== 'string' ||
          typeof signResp.sessionId !== 'string' ||
          typeof signResp.publicExtractedHintsJson !== 'string' ||
          signResp.publicExtractedHintsJson.length === 0 ||
          signResp.pubKeyHex.toLowerCase() !== current.endpoint.pubKeyHex ||
          signResp.sessionId !== current.resp.sessionId
        ) {
          throw new Error('Signer Round-2 response malformed or identity/sessionId mismatch');
        }
        collectedExtractedPublicHints.push(signResp.publicExtractedHintsJson);
      } catch (err) {
        failedRound2PubKey = current.endpoint.pubKeyHex;
        lastRound2Err = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }

    if (failedRound2PubKey) {
      excludedPubKeys.add(failedRound2PubKey);
      if (eligible.length - excludedPubKeys.size >= params.threshold) {
        continue; // Retry fresh ceremony with remaining signers
      }
      throw lastRound2Err ?? new Error('Round 2 failed');
    }

    return finalizeDistributedCommitteeTx({
      unsignedTx: params.unsignedTx,
      inputBoxes: params.inputBoxes,
      dataBoxes: params.dataBoxes,
      publicHintsJsonList: [...allCommitteePublicCommitments, ...collectedExtractedPublicHints],
      feePayerSecretHex: params.feePayerSecretHex,
      feePrivateCommitmentsJson: feeRound1?.privateCommitmentsJson,
      height: params.height,
      lastHeaders: params.lastHeaders,
    });
  }
}
