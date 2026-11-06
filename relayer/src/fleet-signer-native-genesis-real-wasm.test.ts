import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Mnemonic } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as wasm from 'ergo-lib-wasm-nodejs';
import { deriveLocalWasmRootSignerPublicIdentity }
  from './local-wasm-root-signer-public-identity.js';
import { deriveDevnetRewardErgoTreeHexForDelay }
  from './relayer-core/devnet-reward-consolidation.js';
import { buildBridgeValidityTrackerCanonicalHeaderContextV1 }
  from './bridge-validity-tracker-header-context-v1.js';
import { materializeUnsignedTransaction, type Eip12Box }
  from './unsigned-ergo-transaction.js';
import { materializeSubstrateFederatedSingletonIssuanceV1 }
  from './substrate-federated-genesis-issuance-materialization-v1.js';
import { prepareLocalWasmRootCheckCandidates, checkSignedTransaction,
  projectLocalWasmSignedCheckInputBoxIdsV1, type LocalWasmCheckCandidate }
  from './fleet-signer.js';
import * as helpers from './ergo-helpers.js';
import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import { toUnsignedTransactionJson } from './ergo-unsigned-transaction.js';

// Real WASM, keys, header parsing, issuance materialization and opaque checker
// handles. Funding/history are synthetic and HTTP is a component double;
// acceptance by a JVM, a node or the native compiler is not established here.
const ORIGIN = 'http://127.0.0.1:9051';
const ROLES = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const runProcess = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let mnemonic = '';
let identity: Awaited<ReturnType<typeof deriveLocalWasmRootSignerPublicIdentity>>;
let nodeCheck: MockInstance<typeof helpers.ncheck>;
let headerRead: MockInstance<typeof helpers.ngetDirect>;

function freshMnemonic(): string {
  const entropy = randomBytes(32);
  try { return Mnemonic.fromEntropy(`0x${entropy.toString('hex')}`).phrase; }
  finally { entropy.fill(0); }
}

beforeEach(async () => {
  mnemonic = freshMnemonic();
  identity = await deriveLocalWasmRootSignerPublicIdentity(mnemonic);
  headerRead = vi.spyOn(helpers, 'ngetDirect').mockRejectedValue(
    new Error('real WASM fixture must not read a node'),
  );
  nodeCheck = vi.spyOn(helpers, 'ncheck').mockRejectedValue(
    new Error('checker component double not configured'),
  );
});
afterEach(() => {
  expect(headerRead).not.toHaveBeenCalled();
  mnemonic = '';
  vi.restoreAllMocks();
  // The disposable worker owns these in-memory keys. String reassignment and
  // worker exit are not a physical-erasure or external-custody attestation.
});

async function fixture(delay: 0 | 1 | 720, inputHeight = 110) {
  const currentHeight = 1001;
  const tree = delay === 0 ? identity.p2pkErgoTreeHex
    : deriveDevnetRewardErgoTreeHexForDelay(identity.publicKeyHex, delay);
  const headers = buildBridgeValidityTrackerCanonicalHeaderContextV1(wasm, {
    currentHeight, anchorContextIndex: 0, anchorExtensionRootHex: '94'.repeat(32),
  }).headers.map(header => header.raw);
  const parsedBase = wasm.ErgoBox.from_json(JSON.stringify({
    value: '300000000', ergoTree: tree, assets: [], additionalRegisters: {},
    creationHeight: inputHeight,
    transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab', index: 0,
  }));
  let base: Eip12Box;
  try { base = parsedBase.to_js_eip12() as Eip12Box; }
  finally { parsedBase.free(); }
  const funding = (await materializeUnsignedTransaction({
    inputs: [{ ...base, extension: {} }], dataInputs: [],
    outputs: [50, 100, 150].map(value => ({
      value: String(value * 1_000_000), ergoTree: tree, creationHeight: inputHeight,
    })),
  }, 'synthetic native genesis signer funding')).outputs;
  const candidates: LocalWasmCheckCandidate[] = [];
  for (const [index, role] of ROLES.entries()) {
    const genesisInput = funding[index]!;
    const issuance = await materializeSubstrateFederatedSingletonIssuanceV1({
      label: `native ${role} real WASM fixture`, genesisInput,
      expectedNftIdHex: genesisInput.boxId, propositionHex: identity.p2pkErgoTreeHex,
      registers: {}, singletonValue: 25_000_000n, fee: 1_100_000n, creationHeight: currentHeight,
    });
    candidates.push({ role, eip12Tx: issuance.eip12Tx, expectedTxId: issuance.txId });
  }
  return { headers, funding, candidates };
}

describe('native genesis issuance batch with the real WASM root signer', () => {
  it.each([0, 1, 720] as const)('signs all three issuances from mature delay %i inputs before checking', async delay => {
    const input = await fixture(delay);
    const batch = await prepareLocalWasmRootCheckCandidates({
      mnemonic, networkPrefix: 16, nodeOrigin: ORIGIN, ...input,
    });
    expect(nodeCheck).not.toHaveBeenCalled();
    expect(batch.pubKeyHex).toBe(identity.publicKeyHex);
    expect(batch.ergoTreeHex).toBe(identity.p2pkErgoTreeHex);
    expect(batch.stateContextTipHeight).toBe(1000);
    expect(batch.stateContextTipIdHex).toBe(input.headers[0]!.id);
    expect(batch.candidates.map(candidate => candidate.role)).toEqual(ROLES);
    for (const [index, candidate] of batch.candidates.entries()) {
      expect(candidate.expectedTxId).toBe(input.candidates[index]!.expectedTxId);
      expect(projectLocalWasmSignedCheckInputBoxIdsV1(candidate.signedCandidate))
        .toEqual([input.funding[index]!.boxId]);
      expect(candidate.signedCandidate).not.toHaveProperty('signedTx');
      nodeCheck.mockImplementationOnce(async (path, signed, origin) => {
        expect(path).toBe('/transactions/check'); expect(origin).toBe(ORIGIN);
        expect(signed.id).toBe(candidate.expectedTxId);
        expect(signed.inputs[0].spendingProof.proofBytes).toMatch(/^[0-9a-f]+$/);
        const transaction = wasm.Transaction.from_json(JSON.stringify(signed));
        try {
          const bytes = transaction.sigma_serialize_bytes();
          expect(bytes.length).toBe(candidate.signedCandidate.signedTransactionBytesLength);
          expect(createHash('sha256').update(bytes).digest('hex'))
            .toBe(candidate.signedCandidate.signedTransactionBytesSha256Hex);
        } finally { transaction.free(); }
        return signed.id; // Transport shape only; this is not a JVM verdict.
      });
      const checked = await checkSignedTransaction(candidate.signedCandidate,
        `synthetic ${candidate.role} checker join`, ORIGIN);
      expect(checked?.txId).toBe(candidate.expectedTxId);
      expect(checked?.signedTransactionDigestHex).toBe(candidate.signedCandidate.signedTransactionDigestHex);
    }
    expect(nodeCheck).toHaveBeenCalledTimes(3);
  });

  it('rejects a different fresh signer before returning a batch or checking', async () => {
    const input = await fixture(0);
    await expect(prepareLocalWasmRootCheckCandidates({
      mnemonic: freshMnemonic(), networkPrefix: 16, nodeOrigin: ORIGIN, ...input,
    })).rejects.toThrow(/tracker: local WASM root signing failed at sign-transaction/);
    expect(nodeCheck).not.toHaveBeenCalled();
  });

  it('rejects a changed second expected ID before returning a batch or checking', async () => {
    const input = await fixture(0);
    input.candidates[1] = { ...input.candidates[1]!, expectedTxId: '98'.repeat(32) };
    await expect(prepareLocalWasmRootCheckCandidates({
      mnemonic, networkPrefix: 16, nodeOrigin: ORIGIN, ...input,
    })).rejects.toThrow(/transaction ID/);
    expect(nodeCheck).not.toHaveBeenCalled();
  });

  it.each([1, 720] as const)('rejects an immature delay %i source without checking', async delay => {
    const input = await fixture(delay, 1001);
    await expect(prepareLocalWasmRootCheckCandidates({
      mnemonic, networkPrefix: 16, nodeOrigin: ORIGIN, ...input,
    })).rejects.toThrow(/tracker: local WASM root signing failed at (sign|reduce)-transaction/);
    expect(nodeCheck).not.toHaveBeenCalled();
  });

  // Selected offline differential lane. Default tests do not claim JVM coverage.
  // Its caller selects existing pinned JDK/Scala and a fresh local output root.
  if (process.env.BRIDGE_NATIVE_GENESIS_WASM_JVM === '1') {
    it('verifies nine actual WASM proofs and eight isolated mutants with pinned SigmaState JVM', async () => {
      const cases: Array<{
        id: string; role: string; inputTreeKind: string;
        signedTransactionHex: string; inputBoxSigmaHex: string;
        unsignedTransactionIdHex: string; currentErgoHeight: number;
        expected: 'ACCEPT' | 'PROOF_FALSE' | 'CONTRACT_FALSE';
      }> = [];
      const serialize = (signed: unknown) => {
        const transaction = wasm.Transaction.from_json(JSON.stringify(signed));
        const id = transaction.id();
        try { return { signedTransactionHex: Buffer.from(transaction.sigma_serialize_bytes()).toString('hex'),
          unsignedTransactionIdHex: id.to_str() }; }
        finally { id.free(); transaction.free(); }
      };
      for (const delay of [0, 1, 720] as const) {
        const inputTreeKind = delay === 0 ? 'p2pk' : `reward${delay}`;
        const input = await fixture(delay);
        const batch = await prepareLocalWasmRootCheckCandidates({
          mnemonic, networkPrefix: 16, nodeOrigin: ORIGIN, ...input,
        });
        for (const [index, candidate] of batch.candidates.entries()) {
          const box = wasm.ErgoBox.from_json(JSON.stringify(input.funding[index]));
          let inputBoxSigmaHex: string;
          try { inputBoxSigmaHex = Buffer.from(box.sigma_serialize_bytes()).toString('hex'); }
          finally { box.free(); }
          nodeCheck.mockImplementationOnce(async (_path, signed) => {
            const positive = {
              id: `${inputTreeKind}-${candidate.role}`, role: candidate.role,
              inputTreeKind, inputBoxSigmaHex, ...serialize(signed),
              currentErgoHeight: 1001, expected: 'ACCEPT' as const,
            };
            expect(positive.unsignedTransactionIdHex).toBe(candidate.expectedTxId);
            cases.push(positive);
            if (index === 0) {
              const absent = structuredClone(signed);
              absent.inputs[0].spendingProof.proofBytes = '';
              cases.push({ ...positive, ...serialize(absent),
                id: `${inputTreeKind}-tracker-absent-proof`, expected: 'PROOF_FALSE' });
              const staleBody = structuredClone(input.candidates[index]!.eip12Tx);
              staleBody.outputs[0].creationHeight -= 1;
              // Retain the original proof while independently materializing the
              // changed body and its actual ID, avoiding an incidental ID fault.
              let unsigned: wasm.UnsignedTransaction | undefined =
                wasm.UnsignedTransaction.from_json(JSON.stringify(toUnsignedTransactionJson(staleBody)));
              let stale: wasm.Transaction | undefined;
              try {
                const consumed = unsigned;
                unsigned = undefined; // from_unsigned_tx takes ownership even on failure.
                stale = wasm.Transaction.from_unsigned_tx(consumed,
                  [Buffer.from(signed.inputs[0].spendingProof.proofBytes, 'hex')]);
                cases.push({ ...positive, ...serialize(JSON.parse(stale.to_json())),
                  id: `${inputTreeKind}-tracker-stale-message`, expected: 'PROOF_FALSE' });
              } finally { stale?.free(); unsigned?.free(); }
              if (delay !== 0) cases.push({ ...positive,
                id: `${inputTreeKind}-tracker-immature`, currentErgoHeight: 110,
                expected: 'CONTRACT_FALSE' });
            }
            return signed.id; // HTTP double; independent JVM verification follows.
          });
          expect(await checkSignedTransaction(candidate.signedCandidate,
            `synthetic ${candidate.role} JVM wire capture`, ORIGIN)).not.toBeNull();
        }
      }
      expect(cases).toHaveLength(17);
      expect(nodeCheck).toHaveBeenCalledTimes(9);
      const javaHome = process.env.JAVA_HOME;
      const compilerInput = process.env.BRIDGE_V2_JVM_SCALA_COMPILER;
      const outputRoot = process.env.BRIDGE_NATIVE_GENESIS_PROBE_ROOT;
      if (!javaHome || !compilerInput || !outputRoot) {
        throw new Error('offline JVM probe requires pinned JDK, Scala compiler and fresh output root');
      }
      const lockBytes = readFileSync(resolve(root, 'sources/substrate-federated-tracker-compiler-lock-v1.json'));
      const lock = JSON.parse(lockBytes.toString('utf8'));
      const dependencies: string[] = lock.dependencyClasspath.map((entry: { name: string; sha256: string }) => {
        const path = resolve(root, lock.dependencyRootPath, entry.name);
        expect(sha256(readFileSync(path)), entry.name).toBe(entry.sha256);
        return path;
      });
      expect(lock.sigmaStateVersion).toBe('6.0.2');
      expect(lock.sigmaStateArtifactSha256).toBe('0dbd3b31ef94affec83f8f0f6c5a9891c45da1e975ff6016a0574fc5aa1418e6');
      expect(lock.scriptVersion).toBe(3);
      const compiler = realpathSync(compilerInput);
      expect(sha256(readFileSync(compiler))).toBe('c88676d75c69721b717ea6c441ece04fff262abab9d210a2936abc2be3731fa2');
      const java = resolve(javaHome, 'bin/java.exe');
      expect(sha256(readFileSync(java))).toBe(lock.javaExecutableSha256);
      const output = mkdtempSync(resolve(outputRoot, 'native-genesis-wasm-jvm-'));
      const classes = resolve(output, 'classes'); mkdirSync(classes);
      const fixtureBytes = Buffer.from(`${canonicalJson({
        schema: 'e2s.native-genesis-wasm-signature-probe.v1', cases,
      })}\n`, 'ascii');
      const fixturePath = resolve(output, 'fixture.json');
      const fixtureHash = sha256(fixtureBytes);
      writeFileSync(fixturePath, fixtureBytes, { flag: 'wx' });
      const spec = resolve(root, 'validity-proof/consumer-jvm/BridgeNativeGenesisWasmSignatureSpec.scala');
      const sourceBytes = readFileSync(spec);
      const copiedSpec = resolve(output, 'BridgeNativeGenesisWasmSignatureSpec.scala');
      writeFileSync(copiedSpec, sourceBytes, { flag: 'wx' });
      const env = { SystemRoot: process.env.SystemRoot, TEMP: output, TMP: output,
        JAVA_HOME: javaHome, PATH: resolve(javaHome, 'bin') };
      await runProcess(java, ['-Xmx1g', '-cp', [compiler, ...dependencies].join(delimiter),
        'scala.tools.nsc.Main', '-encoding', 'UTF-8', '-classpath', dependencies.join(delimiter),
        '-d', classes, copiedSpec], { env, timeout: 60_000, maxBuffer: 1024 * 1024 });
      const result = await runProcess(java, ['-Xmx1g', '-cp', [classes, ...dependencies].join(delimiter),
        'sigma.bridge.BridgeNativeGenesisWasmSignatureSpec', fixturePath, fixtureHash],
      { env, timeout: 60_000, maxBuffer: 1024 * 1024 });
      const stdout = result.stdout.toString();
      expect(stdout.split(/\r?\n/).filter(line => line.startsWith('JVM_NATIVE_GENESIS_WASM_CASE '))).toHaveLength(17);
      expect(stdout).toContain('JVM_NATIVE_GENESIS_WASM_PROBE_PASS 17');
      expect(sha256(readFileSync(spec))).toBe(sha256(sourceBytes));
      expect(sha256(readFileSync(fixturePath))).toBe(fixtureHash);
      expect(readFileSync(resolve(root, 'sources/substrate-federated-tracker-compiler-lock-v1.json'))).toEqual(lockBytes);
      console.info(`JVM_NATIVE_GENESIS_WASM_PROBE_PASS 17 fixture=${fixtureHash} spec=${sha256(sourceBytes)}`);
    }, 180_000);
  }
});
