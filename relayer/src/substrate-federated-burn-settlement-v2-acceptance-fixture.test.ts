import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  buildSubstrateFederatedBurnSettlementV2AcceptanceFixture,
  serializeSubstrateFederatedWithdrawalFixtureTransaction,
} from './substrate-federated-burn-settlement-v2-acceptance-fixture.js';
import { materializeSubstrateFederatedWithdrawalFixtureBox, SUBSTRATE_FEDERATED_WITHDRAWAL_FIXTURE_RECIPIENT } from './substrate-federated-burn-settlement-v2-fixture.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const spec = resolve(root, 'validity-proof/consumer-jvm/BridgeSubstrateFederatedBurnSettlementV2AcceptanceSpec.scala');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Explicit offline integration lane, not default suite/CI VM coverage:
// BRIDGE_V2_WITHDRAWAL_JVM=1; JAVA_HOME=the locked Microsoft JDK 17.0.19+10;
// BRIDGE_V2_JVM_SCALA_COMPILER=an existing Scala 2.12.20 compiler JAR.
// Compiler SHA-256: c88676d75c69721b717ea6c441ece04fff262abab9d210a2936abc2be3731fa2.
// Use Node 24.14.0 and the runtime JARs from the existing compiler lock.
const RUN_JVM = process.env.BRIDGE_V2_WITHDRAWAL_JVM === '1';

async function checkedRun(...args: Parameters<typeof run>) {
  try { return await run(...args); }
  catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    throw new Error(`JVM test process failed\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`);
  }
}

async function syntheticWireInput() {
  const output = {
    value: '9007199254740993', ergoTree: SUBSTRATE_FEDERATED_WITHDRAWAL_FIXTURE_RECIPIENT,
    assets: [], additionalRegisters: {}, creationHeight: 100,
  };
  const box = await materializeSubstrateFederatedWithdrawalFixtureBox(output);
  const eip12Tx: Parameters<typeof serializeSubstrateFederatedWithdrawalFixtureTransaction>[0]['eip12Tx'] = {
    inputs: [0, 1, 2].map(index => {
      const extension: Record<string, string> = index === 1
        ? { '0': '0400', '1': '0402', '2': '0404', '3': '0406' } : {};
      return { ...box, boxId: String(index + 1).padStart(2, '0').repeat(32), extension };
    }),
    dataInputs: [box], outputs: [output],
  };
  const module = await import('ergo-lib-wasm-nodejs');
  const wasm = module.default ?? module;
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(eip12Tx));
  const id = unsigned.id();
  try { return { eip12Tx, txId: id.to_str() }; }
  finally { id.free(); unsigned.free(); }
}

describe('withdrawal fixture wire preparation (no JVM or compiler provenance)', () => {
  it('deterministically preserves input order, extensions, and exact large integer values', async () => {
    const input = await syntheticWireInput();
    const first = await serializeSubstrateFederatedWithdrawalFixtureTransaction(input);
    expect(await serializeSubstrateFederatedWithdrawalFixtureTransaction(input)).toEqual(first);
    expect(first.eip12UnsignedTransaction.inputs).toEqual(input.eip12Tx.inputs.map(({ boxId, extension }) => ({ boxId, extension })));
    expect(first.eip12UnsignedTransaction.dataInputs).toEqual([{ boxId: input.eip12Tx.dataInputs[0].boxId }]);
    expect(first.eip12UnsignedTransaction.outputs).toEqual(input.eip12Tx.outputs);
    expect(first.eip12UnsignedTransaction.outputs[0].value).toBe('9007199254740993');
    expect(first.prooflessTransactionSha256Hex).toBe(sha256(Buffer.from(first.prooflessTransactionHex, 'hex')));
    expect(first).not.toHaveProperty('compiler');
    expect(first).not.toHaveProperty('boundaries.genuineV2CompilerProvenanceConsumed');
  });

  it('rejects a changed transaction identity and wrong input count', async () => {
    const input = await syntheticWireInput();
    await expect(serializeSubstrateFederatedWithdrawalFixtureTransaction({ ...input, txId: 'ff'.repeat(32) }))
      .rejects.toThrow('V2 unsigned transaction identity drift');
    await expect(serializeSubstrateFederatedWithdrawalFixtureTransaction({
      ...input, eip12Tx: { ...input.eip12Tx, inputs: input.eip12Tx.inputs.slice(0, 2) },
    })).rejects.toThrow('withdrawal fixture requires three inputs');
  });
});

describe('opt-in genuine V2 withdrawal -> full three-input JVM conjunction', () => {
  it.runIf(RUN_JVM)('verifies the positive and isolated contract/context/fee-proof negatives offline', async () => {
    if (!process.env.JAVA_HOME) throw new Error('JAVA_HOME must identify the pinned Microsoft JDK 17.0.19+10');
    const compilerInput = process.env.BRIDGE_V2_JVM_SCALA_COMPILER;
    if (!compilerInput) throw new Error('BRIDGE_V2_JVM_SCALA_COMPILER must identify the existing Scala 2.12.20 compiler JAR');
    if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
      throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
    }
    const options = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    let fixture: Awaited<ReturnType<typeof buildSubstrateFederatedBurnSettlementV2AcceptanceFixture>>;
    try { fixture = await buildSubstrateFederatedBurnSettlementV2AcceptanceFixture(); }
    finally { process.env.NODE_OPTIONS = options; }
    expect(fixture.compiler.trackerReceiptSchema).toBe('e2s.substrate-federated-tracker-jvm-compiler-receipt.v2');
    expect(fixture.compiler.familyReceiptSchema).toBe('e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2');
    expect(fixture.eip12UnsignedTransaction.inputs.map(input => Object.keys(input.extension))).toEqual([
      [], ['0', '1', '2', '3'], [],
    ]);
    expect(fixture.boundaries.canonicalStateEstablished).toBe(false);
    expect(fixture.boundaries.fundsAuthorityEstablished).toBe(false);

    const lock = JSON.parse(readFileSync(resolve(root, 'sources/substrate-federated-tracker-compiler-lock-v1.json'), 'utf8'));
    const dependencies = lock.dependencyClasspath.map((entry: { name: string; sha256: string }) => {
      const path = resolve(root, lock.dependencyRootPath, entry.name);
      expect(sha256(readFileSync(path)), entry.name).toBe(entry.sha256);
      return path;
    });
    expect(lock.sigmaStateArtifactSha256).toBe(fixture.compiler.sigmaStateArtifactSha256Hex);
    const compiler = realpathSync(compilerInput);
    expect(sha256(readFileSync(compiler))).toBe('c88676d75c69721b717ea6c441ece04fff262abab9d210a2936abc2be3731fa2');
    const java = resolve(process.env.JAVA_HOME!, 'bin/java.exe');
    expect(sha256(readFileSync(java))).toBe(lock.javaExecutableSha256);
    const output = mkdtempSync(resolve(tmpdir(), 'bridge-v2-withdrawal-vm-'));
    const classes = resolve(output, 'classes');
    mkdirSync(classes);
    const fixtureBytes = Buffer.from(`${JSON.stringify(fixture)}\n`, 'ascii');
    const fixtureHash = sha256(fixtureBytes);
    expect(fixtureHash).toBe('82a741a35b9c9467468eb8ebe5443a5f12dcbe5e467e70cdc4b5157b543c3e9d');
    expect(fixture.unsignedTransactionIdHex).toBe('c8f41aa74b9178edeb81ca1ffca63b0c719051a7fa0a10775ee334d06da3b79a');
    const fixturePath = resolve(output, 'fixture.json');
    writeFileSync(fixturePath, fixtureBytes, { flag: 'wx' });
    const sourceBytes = readFileSync(spec);
    const copiedSpec = resolve(output, 'BridgeSubstrateFederatedBurnSettlementV2AcceptanceSpec.scala');
    writeFileSync(copiedSpec, sourceBytes, { flag: 'wx' });
    // No resolver, SBT, node source, source-tree classes, or ambient JVM options.
    const env = {
      SystemRoot: process.env.SystemRoot, TEMP: output, TMP: output,
      JAVA_HOME: process.env.JAVA_HOME, PATH: resolve(process.env.JAVA_HOME!, 'bin'),
    };
    await checkedRun(java, ['-Xmx1g', '-cp', [compiler, ...dependencies].join(delimiter),
      'scala.tools.nsc.Main', '-encoding', 'UTF-8', '-classpath', dependencies.join(delimiter),
      '-d', classes, copiedSpec], { env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const result = await checkedRun(java, ['-Xmx1g', '-cp', [classes, ...dependencies].join(delimiter),
      'sigma.bridge.BridgeSubstrateFederatedBurnSettlementV2AcceptanceSpec', fixturePath, fixtureHash],
    { env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const stdout = result.stdout.toString();
    const cases = stdout.split(/\r?\n/).filter(line => line.startsWith('VM_CASE '));
    expect(cases).toHaveLength(8);
    expect(stdout).toContain('VM_MATRIX_PASS 8');
    expect(sha256(readFileSync(spec))).toBe(sha256(sourceBytes));
    expect(sha256(readFileSync(fixturePath))).toBe(fixtureHash);
    console.info(JSON.stringify({ fixtureSha256: fixtureHash, specSha256: sha256(sourceBytes),
      transactionId: fixture.unsignedTransactionIdHex, contracts: Object.fromEntries(
        Object.entries(fixture.contracts).map(([role, value]) => [role, value.contractIdHex])) }));
    console.info(cases.join('\n'));
  }, 180_000);
});
