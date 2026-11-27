import fs from 'node:fs';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import * as ergoWasm from 'ergo-lib-wasm-nodejs';
import {
  decodeSigmaAvlTreeDigestHex,
  decodeSigmaCollByteHex,
  sigmaCollByteHex,
} from '../core/avl.js';
import {
  ZERO_20,
  bytesToHex,
  decodeTrackerGovernanceR9,
  encodePegInIntentV2,
  hexToBytes,
} from '../core/codecs.js';
import { CompiledBridgeFamily } from '../core/contracts.js';
import { p2sAddressFromErgoTreeHex } from '../crypto/signer.js';
import { StockErgoNodeClient } from '../clients/ergo-node.js';
import { loadSolidityArtifact } from '../clients/evm-client.js';
import {
  readLiveReserveLiability,
  readLiveTrackerLatestSourceHeight,
} from '../state/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_INDEX_PATH = path.resolve(__dirname, '../../web/index.html');
const WEB_APP_JS_PATH = path.resolve(__dirname, '../../web/app.js');
const MAX_JSON_BODY_BYTES = 64 * 1024;
const EVM_READ_TIMEOUT_MS = 4_000;
const STORAGE_RENT_PERIOD_BLOCKS = 1_051_200;

export interface BridgeWebServerConfig {
  family: CompiledBridgeFamily;
  ergo: StockErgoNodeClient;
  evmRpcUrl?: string;
  configFileLabel?: string;
  host?: string;
  port?: number;
  logger?: (msg: string) => void;
}

/**
 * Parse an Ergo Base58 P2PK address or 33-byte compressed secp256k1 pubkey hex
 * into the canonical 33-byte compressed pubkey hex (without 0x) AND P2PK ErgoTree hex.
 * Enforces strict secp256k1 on-curve membership and P2PK address type ([H-7]).
 */
export function parseErgoP2pkRecipient(
  input: string,
  networkPrefix: 0 | 16,
): { pubKeyHex: string; p2pkErgoTreeHex: string; address: string } {
  const trimmed = input.trim();
  const cleanHex = trimmed.replace(/^0x/i, '').toLowerCase();
  const wasmPrefix =
    networkPrefix === 0 ? ergoWasm.NetworkPrefix.Mainnet : ergoWasm.NetworkPrefix.Testnet;

  let pubKeyHex: string;
  if (/^(02|03)[0-9a-f]{64}$/.test(cleanHex)) {
    pubKeyHex = cleanHex;
  } else {
    const parsedAddr =
      networkPrefix === 0
        ? ergoWasm.Address.from_mainnet_str(trimmed)
        : ergoWasm.Address.from_testnet_str(trimmed);
    const treeHex = parsedAddr.to_ergo_tree().to_base16_bytes().toLowerCase();
    if (!/^0008cd(02|03)[0-9a-f]{64}$/.test(treeHex)) {
      throw new Error(
        'Ergo address must be a standard P2PK address (0008cd + 33-byte compressed pubkey)',
      );
    }
    pubKeyHex = treeHex.slice(6);
  }

  // Strictly validate secp256k1 curve membership ([H-7]): throws for off-curve points!
  let canonicalCompressed: string;
  try {
    canonicalCompressed = ethers.SigningKey.computePublicKey(`0x${pubKeyHex}`, true)
      .replace(/^0x/i, '')
      .toLowerCase();
  } catch {
    throw new Error('Invalid Ergo recipient: public key is not a valid point on secp256k1');
  }
  if (canonicalCompressed !== pubKeyHex) {
    throw new Error('Invalid Ergo recipient: non-canonical secp256k1 compressed point');
  }

  const p2pkErgoTreeHex = `0008cd${pubKeyHex}`;
  const recreated = ergoWasm.Address.recreate_from_ergo_tree(
    ergoWasm.ErgoTree.from_base16_bytes(p2pkErgoTreeHex),
  );
  // Confirm ErgoTree decoded as P2PK (content_bytes length 33, prefix byte 0x01 or 0x11)
  const rawAddrBytes = recreated.to_bytes(wasmPrefix);
  const expectedFirstByte = networkPrefix === 0 ? 0x01 : 0x11;
  if (rawAddrBytes.length === 0 || rawAddrBytes[0] !== expectedFirstByte) {
    throw new Error('Invalid Ergo recipient: failed P2PK address verification');
  }
  return {
    pubKeyHex,
    p2pkErgoTreeHex,
    address: recreated.to_base58(wasmPrefix),
  };
}

export class BridgeWebServer {
  private readonly cfg: BridgeWebServerConfig;
  private readonly server: http.Server;
  private readonly depositLockAddress: string;
  private readonly reserveAddress: string;
  private readonly dupAddress: string;
  private readonly trackerAddress: string;
  private readonly log: (msg: string) => void;
  private boundUrl = '';
  private boundHost = '127.0.0.1';
  private boundPort = 0;

  constructor(cfg: BridgeWebServerConfig) {
    this.cfg = cfg;
    const prefix = cfg.family.params.networkPrefix;
    this.depositLockAddress = p2sAddressFromErgoTreeHex(cfg.family.depositLock.ergoTreeHex, prefix);
    this.reserveAddress = p2sAddressFromErgoTreeHex(cfg.family.reserve.ergoTreeHex, prefix);
    this.dupAddress = p2sAddressFromErgoTreeHex(cfg.family.dup.ergoTreeHex, prefix);
    this.trackerAddress = p2sAddressFromErgoTreeHex(cfg.family.tracker.ergoTreeHex, prefix);
    this.log = cfg.logger ?? (() => {});
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server.headersTimeout = 10_000;
    this.server.requestTimeout = 15_000;
  }

  get url(): string {
    return this.boundUrl;
  }

  async start(): Promise<string> {
    const host = this.cfg.host ?? '127.0.0.1';
    const port = this.cfg.port ?? 3000;
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Unexpected web server bind address');
    }
    this.boundHost = host;
    this.boundPort = addr.port;
    this.boundUrl = `http://${host}:${addr.port}`;
    this.log(`Bridge Web Console listening on ${this.boundUrl}`);
    return this.boundUrl;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private getAllowedHosts(): Set<string> {
    const allowedHosts = new Set([
      `127.0.0.1:${this.boundPort}`,
      `localhost:${this.boundPort}`,
      `[::1]:${this.boundPort}`,
    ]);
    if (this.boundHost && this.boundHost !== '0.0.0.0' && this.boundHost !== '::') {
      const formattedHost =
        this.boundHost.includes(':') && !this.boundHost.startsWith('[')
          ? `[${this.boundHost}]`
          : this.boundHost.toLowerCase();
      allowedHosts.add(`${formattedHost}:${this.boundPort}`);
    }
    const extraHosts = (process.env.BRIDGE_UI_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const h of extraHosts) {
      allowedHosts.add(h);
    }
    return allowedHosts;
  }

  private isAllowedHostHeader(hostHeader: string | undefined): boolean {
    if (!hostHeader) return true;
    // Keep anti-DNS-rebinding active even when bound to 0.0.0.0 in Docker ([N-1]);
    // remote reverse-proxy deployments can explicitly opt in via BRIDGE_UI_ALLOWED_HOSTS.
    return this.getAllowedHosts().has(hostHeader.toLowerCase());
  }

  private sendJson(res: ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(JSON.stringify(payload));
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const ct = (req.headers['content-type'] ?? '').toLowerCase();
    if (!ct.includes('application/json')) {
      throw Object.assign(new Error('Content-Type must be application/json'), { httpStatus: 415 });
    }
    const origin = req.headers.origin;
    if (origin) {
      let parsedOrigin: URL;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        throw Object.assign(new Error('Malformed Origin header rejected'), { httpStatus: 403 });
      }
      const originHost = parsedOrigin.host.toLowerCase();
      const reqHost = (req.headers.host ?? '').toLowerCase();
      const protocolOk = parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:';
      if (!protocolOk || !this.getAllowedHosts().has(originHost) || (reqHost && originHost !== reqHost)) {
        throw Object.assign(new Error('Cross-origin POST rejected'), { httpStatus: 403 });
      }
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_JSON_BODY_BYTES) {
        req.destroy();
        throw Object.assign(new Error('Request body too large'), { httpStatus: 413 });
      }
      chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw Object.assign(new Error('Expected JSON object body'), { httpStatus: 400 });
    }
    return parsed as Record<string, unknown>;
  }

  private async readEvmTelemetry(): Promise<Record<string, unknown>> {
    const bridgeAddress = `0x${this.cfg.family.params.bridgeAddressHex}`;
    const sergAddress = `0x${this.cfg.family.params.tokenAddressHex}`;
    if (!this.cfg.evmRpcUrl) {
      return { rpcReachable: false, bridgeAddress, sergAddress };
    }
    // Probe eth_chainId first so ethers v6 never spawns background network-detection retries ([M-4]).
    let chainIdHex: string;
    try {
      const probeRes = await fetch(this.cfg.evmRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(Math.min(2_500, EVM_READ_TIMEOUT_MS)),
      });
      if (!probeRes.ok) {
        return {
          rpcReachable: false,
          bridgeAddress,
          sergAddress,
          error: `EVM RPC HTTP ${probeRes.status}`,
        };
      }
      const probeJson = (await probeRes.json()) as { result?: unknown };
      if (typeof probeJson.result !== 'string' || !/^0x[0-9a-f]+$/i.test(probeJson.result)) {
        return {
          rpcReachable: false,
          bridgeAddress,
          sergAddress,
          error: 'Invalid eth_chainId response',
        };
      }
      chainIdHex = probeJson.result;
    } catch (err) {
      return {
        rpcReachable: false,
        bridgeAddress,
        sergAddress,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const staticNet = new ethers.Network('frontier', BigInt(chainIdHex));
    const provider = new ethers.JsonRpcProvider(this.cfg.evmRpcUrl, staticNet, {
      staticNetwork: staticNet,
    });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const serg = new ethers.Contract(sergAddress, loadSolidityArtifact('SERG').abi, provider);
      const bridge = new ethers.Contract(
        bridgeAddress,
        loadSolidityArtifact('ErgoBridge').abi,
        provider,
      );
      const [blockNumber, totalSupply, escrowedFees, accumulatedFees, paused, owner] =
        await Promise.race([
          Promise.all([
            provider.getBlockNumber(),
            serg.totalSupply() as Promise<bigint>,
            bridge.bridgeSERGBalance() as Promise<bigint>,
            bridge.accumulatedFees() as Promise<bigint>,
            bridge.paused() as Promise<boolean>,
            bridge.owner() as Promise<string>,
          ]),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('EVM RPC timeout')),
              EVM_READ_TIMEOUT_MS,
            );
          }),
        ]);
      return {
        rpcReachable: true,
        chainIdHex,
        blockNumber,
        bridgeAddress,
        sergAddress,
        sergTotalSupplyNano: totalSupply.toString(),
        escrowedFeesNano: escrowedFees.toString(),
        accumulatedFeesNano: accumulatedFees.toString(),
        paused,
        owner,
      };
    } catch (err) {
      return {
        rpcReachable: false,
        bridgeAddress,
        sergAddress,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      provider.destroy();
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.isAllowedHostHeader(req.headers.host)) {
      this.sendJson(res, 403, { error: 'Forbidden Host header' });
      return;
    }

    const reqPath = (req.url ?? '/').split('?')[0];
    const family = this.cfg.family;

    try {
      if (req.method === 'GET' && (reqPath === '/' || reqPath === '/index.html')) {
        const html = fs.readFileSync(WEB_INDEX_PATH, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          // Strict CSP with zero 'unsafe-inline' scripts ([M-6])
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && reqPath === '/app.js') {
        const js = fs.readFileSync(WEB_APP_JS_PATH, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(js);
        return;
      }

      if (req.method === 'GET' && reqPath === '/api/health') {
        this.sendJson(res, 200, {
          ok: true,
          network: family.params.networkPrefix === 0 ? 'mainnet' : 'testnet',
          familyId: family.familyIdHex,
        });
        return;
      }

      if (req.method === 'GET' && reqPath === '/api/status') {
        const [info, indexed, reserveBox, dupBox, trackerBox, evm] = await Promise.all([
          this.cfg.ergo.getInfo(),
          this.cfg.ergo.getIndexedHeight(),
          this.cfg.ergo.getLiveSingletonBox(family.params.reserveNftIdHex),
          this.cfg.ergo.getLiveSingletonBox(family.params.dupNftIdHex),
          this.cfg.ergo.getLiveSingletonBox(family.params.trackerNftIdHex),
          this.readEvmTelemetry(),
        ]);

        const liability = readLiveReserveLiability(reserveBox);
        const reserveErg = BigInt(reserveBox.value);
        const r9Raw = decodeSigmaCollByteHex(trackerBox.additionalRegisters.R9);
        const trackerGov = r9Raw.length === 81 ? decodeTrackerGovernanceR9(r9Raw) : null;

        const reserveAge = Math.max(0, info.fullHeight - reserveBox.creationHeight);
        const dupAge = Math.max(0, info.fullHeight - dupBox.creationHeight);
        const trackerAge = Math.max(0, info.fullHeight - trackerBox.creationHeight);

        // Explicit tri-state solvency ([M-5]): never report green when EVM RPC is unreachable!
        let solvencyStatus: 'OK' | 'ALERT' | 'EVM_UNVERIFIED';
        let solvencyOk: boolean | null;
        if (reserveErg < liability) {
          solvencyStatus = 'ALERT';
          solvencyOk = false;
        } else if (evm.rpcReachable === true && typeof evm.sergTotalSupplyNano === 'string') {
          const ok = BigInt(evm.sergTotalSupplyNano) <= liability;
          solvencyStatus = ok ? 'OK' : 'ALERT';
          solvencyOk = ok;
        } else {
          solvencyStatus = 'EVM_UNVERIFIED';
          solvencyOk = null;
        }

        this.sendJson(res, 200, {
          network: family.params.networkPrefix === 0 ? 'mainnet' : 'testnet',
          configFileLabel:
            this.cfg.configFileLabel ??
            (family.params.networkPrefix === 0 ? 'config.mainnet.json' : 'config.testnet.live.json'),
          familyId: family.familyIdHex,
          depositLockAddress: this.depositLockAddress,
          params: {
            minDepositNanoErg: family.params.minDepositNanoErg.toString(),
            bridgeFeeNanoErg: '5000000',
            minPegOutGrossNanoErg: '15000000',
            escapeTimeoutBlocks: family.params.escapeTimeoutBlocks,
            minConfirmations: family.params.minConfirmations.toString(),
            upgradeTimelockBlocks: family.params.upgradeTimelockBlocks.toString(),
            maxAdmissionLagBlocks: family.params.maxAdmissionLagBlocks.toString(),
            committeeThreshold: family.params.committeeThreshold,
            committeeSize: family.params.committeePubKeysHex.length,
          },
          ergo: {
            fullHeight: info.fullHeight,
            indexedHeight: indexed.indexedHeight,
            reserve: {
              address: this.reserveAddress,
              boxId: reserveBox.boxId,
              ergNano: reserveErg.toString(),
              liabilityNano: liability.toString(),
              bufferNano: (reserveErg - liability).toString(),
              ageBlocks: reserveAge,
              storageRentPct: Number(((reserveAge / STORAGE_RENT_PERIOD_BLOCKS) * 100).toFixed(2)),
              avlDigest: decodeSigmaAvlTreeDigestHex(reserveBox.additionalRegisters.R5),
            },
            dup: {
              address: this.dupAddress,
              boxId: dupBox.boxId,
              ergNano: BigInt(dupBox.value).toString(),
              ageBlocks: dupAge,
              storageRentPct: Number(((dupAge / STORAGE_RENT_PERIOD_BLOCKS) * 100).toFixed(2)),
              avlDigest: decodeSigmaAvlTreeDigestHex(dupBox.additionalRegisters.R5),
            },
            tracker: {
              address: this.trackerAddress,
              boxId: trackerBox.boxId,
              ergNano: BigInt(trackerBox.value).toString(),
              ageBlocks: trackerAge,
              storageRentPct: Number(((trackerAge / STORAGE_RENT_PERIOD_BLOCKS) * 100).toFixed(2)),
              latestSourceHeight: readLiveTrackerLatestSourceHeight(trackerBox).toString(),
              mode: trackerGov ? 'FEDERATED' : 'EIP0045_STARK',
              governance: trackerGov
                ? {
                    epoch: trackerGov.epoch.toString(),
                    pendingMode: trackerGov.pendingMode,
                    pendingTargetScriptHash: trackerGov.pendingTargetScriptHashHex,
                    pendingActivatesAtHeight: trackerGov.pendingActivatesAtHeight.toString(),
                  }
                : { approvedGrandpaTrustAnchor: Buffer.from(r9Raw).toString('hex') },
              avlDigest: decodeSigmaAvlTreeDigestHex(trackerBox.additionalRegisters.R5),
            },
          },
          evm,
          solvencyStatus,
          solvencyOk,
        });
        return;
      }

      if (req.method === 'POST' && reqPath === '/api/build-deposit') {
        const body = await this.readJsonBody(req);
        const amountStr = String(body.amountNanoErg ?? '').trim();
        const evmRecipientRaw = String(body.evmRecipientHex ?? '').trim();
        const depositorAddrRaw = String(body.depositorAddress ?? '').trim();

        if (!/^\d+$/.test(amountStr)) {
          this.sendJson(res, 400, { error: 'amountNanoErg must be a positive integer string' });
          return;
        }
        const amountNanoErg = BigInt(amountStr);
        if (amountNanoErg < family.params.minDepositNanoErg) {
          this.sendJson(res, 400, {
            error: `amountNanoErg (${amountNanoErg}) is below minimum deposit (${family.params.minDepositNanoErg})`,
          });
          return;
        }
        const evmClean = evmRecipientRaw.replace(/^0x/i, '').toLowerCase();
        if (!/^[0-9a-f]{40}$/.test(evmClean)) {
          this.sendJson(res, 400, {
            error: 'evmRecipientHex must be a valid 20-byte 0x EVM address',
          });
          return;
        }
        if (hexToBytes(evmClean, 20).every((b, idx) => b === ZERO_20[idx])) {
          this.sendJson(res, 400, { error: 'evmRecipientHex cannot be the zero address' });
          return;
        }

        const depositor = parseErgoP2pkRecipient(depositorAddrRaw, family.params.networkPrefix);

        // Fail closed with 503 if live Ergo node height cannot be retrieved ([H-8])!
        let creationHeight: number;
        try {
          const info = await this.cfg.ergo.getInfo();
          if (!Number.isInteger(info.fullHeight) || info.fullHeight <= 0) {
            throw new Error('Ergo node returned invalid fullHeight');
          }
          creationHeight = info.fullHeight;
        } catch (err) {
          this.sendJson(res, 503, {
            error: `Cannot build safe BridgeDepositLock without live Ergo height: ${err instanceof Error ? err.message : String(err)}`,
          });
          return;
        }

        const encodedIntent = encodePegInIntentV2({
          sourceNetworkIdHex: family.params.sourceNetworkIdHex,
          sidechainIdHex: family.params.sidechainIdHex,
          bridgeAddressHex: family.params.bridgeAddressHex,
          tokenAddressHex: family.params.tokenAddressHex,
          familyIdHex: family.familyIdHex,
          reserveNftIdHex: family.params.reserveNftIdHex,
          amountNanoErg,
          evmRecipientHex: `0x${evmClean}`,
        });

        const outputCandidate = {
          value: amountNanoErg.toString(),
          ergoTree: family.depositLock.ergoTreeHex,
          creationHeight,
          assets: [],
          additionalRegisters: {
            R4: sigmaCollByteHex(encodedIntent),
            R5: sigmaCollByteHex(hexToBytes(depositor.p2pkErgoTreeHex)),
          },
        };

        this.sendJson(res, 200, {
          depositLockAddress: this.depositLockAddress,
          depositorAddress: depositor.address,
          evmRecipient: `0x${evmClean}`,
          amountNanoErg: amountNanoErg.toString(),
          encodedIntentHex: bytesToHex(encodedIntent),
          eip12OutputCandidate: outputCandidate,
        });
        return;
      }

      if (req.method === 'POST' && reqPath === '/api/parse-ergo-recipient') {
        const body = await this.readJsonBody(req);
        const recipient = String(body.ergoRecipient ?? '').trim();
        const parsed = parseErgoP2pkRecipient(recipient, family.params.networkPrefix);
        const bridgeAddress = `0x${family.params.bridgeAddressHex}`;
        const sergAddress = `0x${family.params.tokenAddressHex}`;
        const out: Record<string, unknown> = {
          address: parsed.address,
          pubKeyHex: `0x${parsed.pubKeyHex}`,
          p2pkErgoTreeHex: `0x${parsed.p2pkErgoTreeHex}`,
          bridgeAddress,
          sergAddress,
        };
        if (body.grossAmountNanoErg !== undefined) {
          const grossStr = String(body.grossAmountNanoErg).trim();
          if (!/^\d+$/.test(grossStr) || BigInt(grossStr) < 15_000_000n) {
            this.sendJson(res, 400, {
              error: 'grossAmountNanoErg must be an integer string >= 15000000 (0.015 sERG)',
            });
            return;
          }
          const gross = BigInt(grossStr);
          const sergIface = new ethers.Interface(loadSolidityArtifact('SERG').abi);
          const bridgeIface = new ethers.Interface(loadSolidityArtifact('ErgoBridge').abi);
          out.grossAmountNanoErg = gross.toString();
          out.netErgoUnlockNanoErg = (gross - 5_000_000n).toString();
          out.approveCalldata = sergIface.encodeFunctionData('approve', [bridgeAddress, gross]);
          out.pegOutCalldata = bridgeIface.encodeFunctionData('pegOut', [
            gross,
            `0x${parsed.pubKeyHex}`,
          ]);
        }
        this.sendJson(res, 200, out);
        return;
      }

      this.sendJson(res, 404, { error: `Not found: ${reqPath}` });
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'httpStatus' in err
          ? Number((err as { httpStatus: number }).httpStatus)
          : 400;
      this.sendJson(res, status, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
