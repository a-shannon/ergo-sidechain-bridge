/**
 * Spike 010a: Committee atLeast() Contract Evaluation
 * ===================================================
 *
 * Non-destructive transaction-level evaluation for Phase 010a contracts.
 *
 * This script:
 * - compiles SCS, DUP, Aggregate DUP, MCL, and transitional MCU contracts
 * - builds synthetic Ergo boxes in memory
 * - signs/evaluates spends with ergo-lib-wasm-nodejs
 * - verifies 2-of-3 quorum, member-loss tolerance, insufficient quorum
 *   rejection, synthetic old-signer rejection, and non-committee rejection
 *
 * It does NOT use WALLET_MNEMONIC, does NOT use the node wallet, and does NOT
 * broadcast transactions. The node is used only for ErgoScript compilation and
 * header context.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  buildBoundaryOnlyCommitteeGuardReport,
  buildBlockedCommitteeGuardReport,
  buildPassedCommitteeGuardReport,
  buildPolicyRejectedCommitteeGuardReport,
  formatCommitteeGuardReportMarkdown,
  type CommitteeGuardEvaluationReport,
} from '../../committee-governance-guard-report.js';
import {
  EMPTY_AVL_DIGEST,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
} from '../../ergo-helpers.js';
import {
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from '../../committee-config.js';
import { bridge_generate_proofs } from '../../../../wasm-avl/pkg/bridge_avl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = resolve(__dirname, '../../../../contracts');
const MIN_BOX_VALUE = 1_000_000;
const COMMAND_LABEL = 'node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts';
const PUBLIC_BOUNDARY_FLAG = '--public-boundary';
const COMMITTEE_THRESHOLD = '2';
const COMMITTEE_SIZE = 3;

interface CliArgs {
  out?: string;
  publicBoundary: boolean;
  useEnvApiKey: boolean;
  committeeThreshold: string;
  committeeSize: number;
}

interface KeyPair {
  secretKey: any;
  privateKeyHex: string;
  pubKeyHex: string;
  p2pkTree: string;
}

interface CommitteePolicy {
  threshold: string;
  size: number;
}

class CommitteePolicyError extends Error {
  readonly isCommitteePolicyError = true;
}

let wasmMod: any = null;
async function getWasm(): Promise<any> {
  if (!wasmMod) {
    // @ts-ignore CJS/ESM interop
    wasmMod = await import('ergo-lib-wasm-nodejs');
    if (wasmMod.default) wasmMod = wasmMod.default;
  }
  return wasmMod;
}

async function nodeGet(path: string): Promise<any> {
  const resp = await fetch(`${ergoNodeEndpoint()}${path}`, { headers: { api_key: ergoApiKey() } });
  if (!resp.ok) throw new Error(`GET ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function nodePost(path: string, body: any): Promise<any> {
  const resp = await fetch(`${ergoNodeEndpoint()}${path}`, {
    method: 'POST',
    headers: { api_key: ergoApiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`POST ${path}: ${resp.status} ${JSON.stringify(data)}`);
  return data;
}

function ergoNodeEndpoint(): string {
  return process.env.ERGO_NODE || 'http://127.0.0.1:9052';
}

function ergoApiKey(): string {
  if (!currentCliArgs?.useEnvApiKey) return 'hello';
  return process.env.ERGO_API_KEY || 'hello';
}

let currentCliArgs: CliArgs | undefined;

function injectCommittee(source: string, pubKeyHexes: readonly string[], threshold: string): string {
  return injectCommitteePlaceholders(source, createCommitteeConfig(pubKeyHexes, threshold));
}

async function compileContract(
  fileName: string,
  pubKeyHexes: readonly string[],
  threshold: string,
  replacements: Readonly<Record<string, string>> = {},
): Promise<string> {
  let source = injectCommittee(
    readFileSync(resolve(CONTRACTS_DIR, fileName), 'utf-8'),
    pubKeyHexes,
    threshold,
  );
  for (const [placeholder, value] of Object.entries(replacements)) {
    source = source.replaceAll(placeholder, value);
  }
  const compiled = await nodePost('/script/p2sAddress', { source, treeVersion: 0 });
  const tree = await nodeGet(`/script/addressToTree/${compiled.address}`);
  return tree.tree;
}

async function buildStateContext(wasm: any): Promise<any> {
  const headers = (await nodeGet('/blocks/lastHeaders/10'))
    .sort((a: any, b: any) => Number(a.height) - Number(b.height));
  const firstHeader = wasm.BlockHeader.from_json(JSON.stringify(headers[0]));
  const latestHeader = wasm.BlockHeader.from_json(JSON.stringify(headers[headers.length - 1]));
  const blockHeaders = new wasm.BlockHeaders(firstHeader);
  for (let i = 1; i < headers.length; i++) {
    blockHeaders.add(wasm.BlockHeader.from_json(JSON.stringify(headers[i])));
  }
  return new wasm.ErgoStateContext(
    wasm.PreHeader.from_block_header(latestHeader),
    blockHeaders,
    wasm.Parameters.default_parameters(),
  );
}

async function makeKeyPair(): Promise<KeyPair> {
  const wasm = await getWasm();
  const secretKey = wasm.SecretKey.random_dlog();
  const address = secretKey.get_address();
  return {
    secretKey,
    privateKeyHex: Buffer.from(secretKey.to_bytes()).toString('hex'),
    pubKeyHex: Buffer.from(address.content_bytes()).toString('hex'),
    p2pkTree: address.to_ergo_tree().to_base16_bytes(),
  };
}

async function makeCommittee(size: number): Promise<KeyPair[]> {
  const keys: KeyPair[] = [];
  for (let index = 0; index < size; index++) {
    keys.push(await makeKeyPair());
  }
  return keys;
}

async function normalizeBox(box: any): Promise<any> {
  const wasm = await getWasm();
  const parsed = wasm.ErgoBoxes.from_boxes_json([box]).get(0);
  return parsed.to_js_eip12();
}

function token(tokenId: string): any[] {
  return [{ tokenId, amount: '1' }];
}

async function signSyntheticTx(
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHexes: string | readonly string[],
  dataInputBoxes: any[] = [],
): Promise<any> {
  const wasm = await getWasm();
  const secretKeys = new wasm.SecretKeys();
  for (const privateKeyHex of Array.isArray(privateKeyHexes) ? privateKeyHexes : [privateKeyHexes]) {
    secretKeys.add(wasm.SecretKey.dlog_from_bytes(Buffer.from(privateKeyHex, 'hex')));
  }
  const wallet = wasm.Wallet.from_secrets(secretKeys);
  const stateCtx = await buildStateContext(wasm);
  const inputs = wasm.ErgoBoxes.from_boxes_json(inputBoxes);
  const dataInputs = dataInputBoxes.length > 0
    ? wasm.ErgoBoxes.from_boxes_json(dataInputBoxes)
    : wasm.ErgoBoxes.empty();
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(unsignedTx));
  return JSON.parse(wallet.sign_transaction(stateCtx, unsigned, inputs, dataInputs).to_json());
}

async function expectSign(
  label: string,
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHexes: string | readonly string[],
  dataInputBoxes: any[] = [],
): Promise<void> {
  const signed = await signSyntheticTx(unsignedTx, inputBoxes, privateKeyHexes, dataInputBoxes);
  console.log(`  OK ${label}: ${String(signed.id).slice(0, 24)}...`);
}

async function expectReject(
  label: string,
  unsignedTx: any,
  inputBoxes: any[],
  privateKeyHexes: string | readonly string[],
  dataInputBoxes: any[] = [],
): Promise<void> {
  try {
    await signSyntheticTx(unsignedTx, inputBoxes, privateKeyHexes, dataInputBoxes);
    throw new Error('expected rejection but transaction signed');
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (
      msg.includes('Prover error') ||
      msg.includes('Script reduced to false') ||
      msg.includes('Tree proof is incorrect') ||
      msg.includes('Failed to sign')
    ) {
      console.log(`  OK ${label}: rejected`);
      return;
    }
    throw err;
  }
}

function txInput(box: any, extension: Record<string, string> = {}): any {
  return { boxId: box.boxId, extension };
}

function output(value: number, ergoTree: string, additionalRegisters: Record<string, string> = {}, assets: any[] = []): any {
  return { value: String(value), ergoTree, assets, additionalRegisters, creationHeight: 1 };
}

async function evalSCS(
  tree: string,
  committee: readonly KeyPair[],
  oldSingleSigner: KeyPair,
  nonCommitteeSigner: KeyPair,
): Promise<void> {
  const nftId = '11'.repeat(32);
  const emptyDigest = Buffer.from(EMPTY_AVL_DIGEST, 'hex');
  const registers = {
    R4: encodeLongRegister(0),
    R5: encodeCollByteRegister(Buffer.alloc(32)),
    R6: encodeCollByteRegister(Buffer.alloc(32)),
    R7: encodeAvlTreeRegister(emptyDigest, 0x03),
    R8: encodeIntRegister(0),
    R9: encodeSigmaPropRegister(committee[0].pubKeyHex),
  };
  const nextRegisters = {
    ...registers,
    R4: encodeLongRegister(1),
    R8: encodeIntRegister(1),
  };
  const input = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: tree,
    assets: token(nftId),
    additionalRegisters: registers,
    transactionId: '01'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const unsigned = {
    inputs: [txInput(input)],
    dataInputs: [],
    outputs: [
      output(MIN_BOX_VALUE, tree, nextRegisters, token(nftId)),
    ],
  };
  await expectSign(
    'SCS 2-of-3 committee quorum',
    unsigned,
    [input],
    [committee[0].privateKeyHex, committee[1].privateKeyHex],
  );
  await expectSign(
    'SCS member-loss quorum',
    unsigned,
    [input],
    [committee[0].privateKeyHex, committee[2].privateKeyHex],
  );
  await expectReject(
    'SCS single committee signer below threshold',
    unsigned,
    [input],
    committee[0].privateKeyHex,
  );
  await expectReject('SCS old single signer after rotation', unsigned, [input], oldSingleSigner.privateKeyHex);
  await expectReject('SCS non-committee signer', unsigned, [input], nonCommitteeSigner.privateKeyHex);
}

async function evalMCL(
  tree: string,
  vaultTree: string,
  committee: readonly KeyPair[],
  oldSingleSigner: KeyPair,
  nonCommitteeSigner: KeyPair,
): Promise<void> {
  const depositorTree = '0008cd' + '02' + '22'.repeat(32);
  const input = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: tree,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.alloc(20, 0x12)),
      R5: encodeLongRegister(1_000_000),
      R6: encodeCollByteRegister(Buffer.alloc(33, 0x03)),
      R7: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
    },
    transactionId: '02'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const vaultRegisters = {
    R4: encodeCollByteRegister(Buffer.from(input.boxId, 'hex')),
    R5: encodeCollByteRegister(Buffer.alloc(20, 0x12)),
    R6: encodeLongRegister(MIN_BOX_VALUE),
    R7: encodeCollByteRegister(Buffer.from(depositorTree, 'hex')),
  };
  const unsigned = {
    inputs: [txInput(input)],
    dataInputs: [],
    outputs: [
      output(MIN_BOX_VALUE, vaultTree, vaultRegisters),
    ],
  };
  await expectSign(
    'MCL 2-of-3 committee quorum',
    unsigned,
    [input],
    [committee[0].privateKeyHex, committee[1].privateKeyHex],
  );
  await expectSign(
    'MCL member-loss quorum',
    unsigned,
    [input],
    [committee[0].privateKeyHex, committee[2].privateKeyHex],
  );
  await expectReject(
    'MCL quorum with wrong vault destination',
    {
      ...unsigned,
      outputs: [output(MIN_BOX_VALUE, committee[1].p2pkTree, vaultRegisters)],
    },
    [input],
    [committee[0].privateKeyHex, committee[1].privateKeyHex],
  );
  await expectReject(
    'MCL quorum with wrong mint amount binding',
    {
      ...unsigned,
      outputs: [output(MIN_BOX_VALUE, vaultTree, {
        ...vaultRegisters,
        R6: encodeLongRegister(MIN_BOX_VALUE - 1),
      })],
    },
    [input],
    [committee[0].privateKeyHex, committee[1].privateKeyHex],
  );
  await expectReject(
    'MCL single committee signer below threshold',
    unsigned,
    [input],
    committee[0].privateKeyHex,
  );
  await expectReject('MCL old single signer after rotation', unsigned, [input], oldSingleSigner.privateKeyHex);
  await expectReject('MCL non-committee signer', unsigned, [input], nonCommitteeSigner.privateKeyHex);
}

async function evalMCU(
  tree: string,
  sideChainStateNftId: string,
  committee: readonly KeyPair[],
  oldSingleSigner: KeyPair,
  nonCommitteeSigner: KeyPair,
): Promise<void> {
  const unlockAmount = MIN_BOX_VALUE;
  const recipientTree = committee[2].p2pkTree;
  const registers = {
    R4: encodeCollByteRegister(Buffer.from('66'.repeat(32), 'hex')),
    R5: encodeLongRegister(unlockAmount),
    R6: encodeCollByteRegister(Buffer.from(recipientTree, 'hex')),
    R7: encodeLongRegister(100),
    R8: encodeLongRegister(1),
    R9: encodeSigmaPropRegister(committee[0].pubKeyHex),
  };
  const mcuInput = await normalizeBox({
    value: String(unlockAmount + MIN_BOX_VALUE),
    ergoTree: tree,
    assets: [],
    additionalRegisters: registers,
    transactionId: '09'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const stateRegisters = {
    R4: encodeLongRegister(150),
  };
  const stateInput = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: committee[0].p2pkTree,
    assets: token(sideChainStateNftId),
    additionalRegisters: stateRegisters,
    transactionId: '0a'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const staleStateInput = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: committee[0].p2pkTree,
    assets: token(sideChainStateNftId),
    additionalRegisters: { R4: encodeLongRegister(149) },
    transactionId: '0b'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const buildUnsigned = (recipient = recipientTree, dataInputs = [stateInput]) => ({
    inputs: [txInput(mcuInput)],
    dataInputs: dataInputs.map(box => txInput(box)),
    outputs: [
      output(unlockAmount, recipient),
      output(MIN_BOX_VALUE, committee[0].p2pkTree),
    ],
  });
  const quorum = [committee[0].privateKeyHex, committee[1].privateKeyHex];

  await expectSign(
    'MCU 2-of-3 committee quorum after SCS delay',
    buildUnsigned(),
    [mcuInput],
    quorum,
    [stateInput],
  );
  await expectSign(
    'MCU member-loss quorum after SCS delay',
    buildUnsigned(),
    [mcuInput],
    [committee[0].privateKeyHex, committee[2].privateKeyHex],
    [stateInput],
  );
  await expectReject(
    'MCU single committee signer below threshold',
    buildUnsigned(),
    [mcuInput],
    committee[0].privateKeyHex,
    [stateInput],
  );
  await expectReject(
    'MCU old single signer after rotation',
    buildUnsigned(),
    [mcuInput],
    oldSingleSigner.privateKeyHex,
    [stateInput],
  );
  await expectReject(
    'MCU non-committee signer',
    buildUnsigned(),
    [mcuInput],
    nonCommitteeSigner.privateKeyHex,
    [stateInput],
  );
  await expectReject(
    'MCU quorum with stale SCS height',
    buildUnsigned(recipientTree, [staleStateInput]),
    [mcuInput],
    quorum,
    [staleStateInput],
  );
  await expectReject(
    'MCU quorum with wrong recipient',
    buildUnsigned(committee[1].p2pkTree),
    [mcuInput],
    quorum,
    [stateInput],
  );
  await expectReject(
    'MCU timeout beneficiary payout without SCS proof',
    buildUnsigned(recipientTree, []),
    [mcuInput],
    quorum,
  );
}

async function evalDUP(
  tree: string,
  committee: readonly KeyPair[],
  oldSingleSigner: KeyPair,
  nonCommitteeSigner: KeyPair,
): Promise<void> {
  const nftId = '33'.repeat(32);
  const burnTxId = 'ab'.repeat(32);
  const proof = JSON.parse(bridge_generate_proofs('[]', burnTxId));
  const inputDigest = Buffer.from(EMPTY_AVL_DIGEST, 'hex');
  const outputDigest = Buffer.from(proof.new_digest_hex, 'hex');
  const registers = {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(inputDigest, 0x03, 1),
    R6: encodeSigmaPropRegister(committee[0].pubKeyHex),
  };
  const nextRegisters = {
    R4: encodeLongRegister(1),
    R5: encodeAvlTreeRegister(outputDigest, 0x03, 1),
    R6: registers.R6,
  };
  const input = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: tree,
    assets: token(nftId),
    additionalRegisters: registers,
    transactionId: '03'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const unsigned = {
    inputs: [txInput(input, {
      '0': encodeCollByteRegister(Buffer.from(proof.lookup_proof_hex, 'hex')),
      '1': encodeCollByteRegister(Buffer.from(burnTxId, 'hex')),
      '2': encodeCollByteRegister(Buffer.from(proof.insert_proof_hex, 'hex')),
    })],
    dataInputs: [],
    outputs: [
      output(MIN_BOX_VALUE, tree, nextRegisters, token(nftId)),
    ],
  };
  await expectSign(
    'DUP 2-of-3 committee quorum',
    unsigned,
    [input],
    [committee[0].privateKeyHex, committee[1].privateKeyHex],
  );
  await expectSign(
    'DUP member-loss quorum',
    unsigned,
    [input],
    [committee[0].privateKeyHex, committee[2].privateKeyHex],
  );
  await expectReject(
    'DUP single committee signer below threshold',
    unsigned,
    [input],
    committee[0].privateKeyHex,
  );
  await expectReject('DUP old single signer after rotation', unsigned, [input], oldSingleSigner.privateKeyHex);
  await expectReject('DUP non-committee signer', unsigned, [input], nonCommitteeSigner.privateKeyHex);
}

async function evalAggregateDUP(
  tree: string,
  committee: readonly KeyPair[],
  oldSingleSigner: KeyPair,
  nonCommitteeSigner: KeyPair,
): Promise<void> {
  const nftId = '44'.repeat(32);
  const burnTxId = 'cd'.repeat(32);
  const proof = JSON.parse(bridge_generate_proofs('[]', burnTxId));
  const inputDigest = Buffer.from(EMPTY_AVL_DIGEST, 'hex');
  const outputDigest = Buffer.from(proof.new_digest_hex, 'hex');
  const registers = {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(inputDigest, 0x03, 1),
    R6: encodeSigmaPropRegister(committee[0].pubKeyHex),
  };
  const nextRegisters = {
    R4: encodeLongRegister(1),
    R5: encodeAvlTreeRegister(outputDigest, 0x03, 1),
    R6: registers.R6,
  };
  const input = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: tree,
    assets: token(nftId),
    additionalRegisters: registers,
    transactionId: '04'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const committeeFeeInput = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: committee[0].p2pkTree,
    assets: [],
    additionalRegisters: {},
    transactionId: '05'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const memberLossFeeInput = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: committee[2].p2pkTree,
    assets: [],
    additionalRegisters: {},
    transactionId: '07'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const oldSingleSignerFeeInput = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: oldSingleSigner.p2pkTree,
    assets: [],
    additionalRegisters: {},
    transactionId: '06'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const nonCommitteeFeeInput = await normalizeBox({
    value: String(MIN_BOX_VALUE),
    ergoTree: nonCommitteeSigner.p2pkTree,
    assets: [],
    additionalRegisters: {},
    transactionId: '08'.repeat(32),
    index: 0,
    creationHeight: 1,
  });
  const extension = {
    '0': encodeCollByteRegister(Buffer.from(proof.lookup_proof_hex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(burnTxId, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(proof.insert_proof_hex, 'hex')),
  };
  const buildUnsigned = (feeInput: any) => ({
    inputs: [txInput(input, extension), txInput(feeInput)],
    dataInputs: [],
    outputs: [
      output(MIN_BOX_VALUE, committee[0].p2pkTree),
      output(MIN_BOX_VALUE, tree, nextRegisters, token(nftId)),
    ],
  });

  await expectSign(
    'Aggregate DUP 2-of-3 committee quorum',
    buildUnsigned(committeeFeeInput),
    [input, committeeFeeInput],
    [committee[0].privateKeyHex, committee[1].privateKeyHex],
  );
  await expectSign(
    'Aggregate DUP member-loss quorum',
    buildUnsigned(memberLossFeeInput),
    [input, memberLossFeeInput],
    [committee[1].privateKeyHex, committee[2].privateKeyHex],
  );
  await expectReject(
    'Aggregate DUP single committee signer below threshold',
    buildUnsigned(committeeFeeInput),
    [input, committeeFeeInput],
    committee[0].privateKeyHex,
  );
  await expectReject(
    'Aggregate DUP old single signer after rotation',
    buildUnsigned(oldSingleSignerFeeInput),
    [input, oldSingleSignerFeeInput],
    oldSingleSigner.privateKeyHex,
  );
  await expectReject(
    'Aggregate DUP non-committee signer',
    buildUnsigned(nonCommitteeFeeInput),
    [input, nonCommitteeFeeInput],
    nonCommitteeSigner.privateKeyHex,
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    publicBoundary: false,
    useEnvApiKey: false,
    committeeThreshold: COMMITTEE_THRESHOLD,
    committeeSize: COMMITTEE_SIZE,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts [--public-boundary] [--committee-size <n>] [--committee-threshold <n>] [--use-env-api-key] [--out <report.md>]',
        '',
        'Runs a non-broadcast Phase 010a committee guard evaluation.',
        '--public-boundary prints a no-node prerequisite boundary report only.',
        '--committee-threshold below 2 is rejected before node access as below-policy evidence.',
        '--committee-size below 3 is rejected before node access as below-policy evidence.',
        '--use-env-api-key opts in to reading ERGO_API_KEY for node requests; otherwise the node default key "hello" is used.',
        'The optional report records PASS or BLOCKED output without serializing private key material.',
      ].join('\n'));
      process.exit(0);
    }
    if (arg === PUBLIC_BOUNDARY_FLAG) {
      args.publicBoundary = true;
      continue;
    }
    if (arg === '--use-env-api-key') {
      args.useEnvApiKey = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a report path');
      args.out = value;
      index++;
      continue;
    }
    if (arg === '--committee-threshold') {
      const value = argv[index + 1];
      if (!value) throw new Error('--committee-threshold requires a value');
      args.committeeThreshold = value;
      index++;
      continue;
    }
    if (arg === '--committee-size') {
      const value = argv[index + 1];
      if (!value) throw new Error('--committee-size requires a value');
      args.committeeSize = parsePositiveIntegerOption('--committee-size', value);
      index++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parsePositiveIntegerOption(option: string, value: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${option} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${option} must be a safe integer`);
  }
  return parsed;
}

function validateCommitteePolicy(args: CliArgs): CommitteePolicy {
  const thresholdNumber = parsePositiveIntegerOption('--committee-threshold', args.committeeThreshold);
  const threshold = String(thresholdNumber);
  const size = args.committeeSize;

  if (thresholdNumber < 2) {
    throw new CommitteePolicyError(
      `Committee threshold below policy rejected: committee threshold ${thresholdNumber} is below minimum 2`,
    );
  }
  if (size < 3) {
    throw new CommitteePolicyError(
      `Committee threshold below policy rejected: committee member count ${size} is below minimum 3`,
    );
  }
  if (thresholdNumber >= size) {
    throw new CommitteePolicyError(
      `Committee threshold below policy rejected: committee threshold ${thresholdNumber} must be lower than member count ${size} for member-loss tolerance`,
    );
  }

  return { threshold, size };
}

function writeReport(out: string | undefined, report: CommitteeGuardEvaluationReport): void {
  if (!out) return;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, formatCommitteeGuardReportMarkdown(report));
}

function commandLabel(args: CliArgs): string {
  const parts = [COMMAND_LABEL];
  if (args.publicBoundary) parts.push(PUBLIC_BOUNDARY_FLAG);
  if (args.useEnvApiKey) parts.push('--use-env-api-key');
  if (args.committeeSize !== COMMITTEE_SIZE) parts.push('--committee-size', String(args.committeeSize));
  if (args.committeeThreshold !== COMMITTEE_THRESHOLD) {
    parts.push('--committee-threshold', args.committeeThreshold);
  }
  if (args.out) parts.push('--out <report.md>');
  return parts.join(' ');
}

async function runEvaluation(args: CliArgs): Promise<CommitteeGuardEvaluationReport> {
  currentCliArgs = args;
  const committeePolicy = validateCommitteePolicy(args);
  const info = await nodeGet('/info');
  console.log(`Spike 010a committee guard evaluation on ${info.network} height=${info.fullHeight}`);

  const committee = await makeCommittee(committeePolicy.size);
  const committeePubKeyHexes = committee.map(key => key.pubKeyHex);
  const oldSingleSigner = await makeKeyPair();
  const nonCommitteeSigner = await makeKeyPair();
  console.log(`Ephemeral committee: ${committeePolicy.threshold}-of-${committee.length}`);

  const scsTree = await compileContract('SideChainState.es', committeePubKeyHexes, committeePolicy.threshold);
  const dupTree = await compileContract('DoubleUnlockPrevention.es', committeePubKeyHexes, committeePolicy.threshold);
  const aggregateDupTree = await compileContract(
    'DoubleUnlockPreventionAggregate.es',
    committeePubKeyHexes,
    committeePolicy.threshold,
  );
  const settlementVaultTree = committee[0].p2pkTree;
  const mclTree = await compileContract(
    'MainChainLock.es',
    committeePubKeyHexes,
    committeePolicy.threshold,
    { SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER: settlementVaultTree },
  );
  const sideChainStateNftId = '55'.repeat(32);
  const mcuTree = await compileContract(
    'MainChainUnlock.es',
    committeePubKeyHexes,
    committeePolicy.threshold,
    { SCS_NFT_ID_PLACEHOLDER: sideChainStateNftId },
  );

  await evalSCS(scsTree, committee, oldSingleSigner, nonCommitteeSigner);
  await evalDUP(dupTree, committee, oldSingleSigner, nonCommitteeSigner);
  await evalAggregateDUP(aggregateDupTree, committee, oldSingleSigner, nonCommitteeSigner);
  await evalMCL(mclTree, settlementVaultTree, committee, oldSingleSigner, nonCommitteeSigner);
  await evalMCU(mcuTree, sideChainStateNftId, committee, oldSingleSigner, nonCommitteeSigner);

  console.log('PASS: SCS, DUP, Aggregate DUP, MCL, and transitional MCU guards accept 2-of-3 quorum, tolerate one missing member, reject insufficient quorum, reject the old single signer after rotation, and reject non-committee signers. MCU also rejects stale-SCS, wrong-recipient, and timeout-only beneficiary spends.');
  return buildPassedCommitteeGuardReport({
    command: commandLabel(args),
    nodeEndpoint: ergoNodeEndpoint(),
    network: String(info.network),
    height: String(info.fullHeight),
    ergoApiKeyRead: args.useEnvApiKey,
    publicIdentifiers: {
      ...Object.fromEntries(
        committeePubKeyHexes.map((pubKeyHex, index) => [`New committee member ${index + 1}`, pubKeyHex]),
      ),
      'Old single signer': oldSingleSigner.pubKeyHex,
      'Non-committee signer': nonCommitteeSigner.pubKeyHex,
    },
    checks: [
      'SCS 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected',
      'DUP 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected',
      'Aggregate DUP 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected',
      'MCL 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected',
      'MCU 2-of-3 committee quorum accepted only after the SCS delay; stale-SCS, wrong-recipient, timeout-only, insufficient-quorum, old-signer, and non-committee spends rejected',
    ],
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.publicBoundary) {
    const report = buildBoundaryOnlyCommitteeGuardReport({
      command: commandLabel(args),
    });
    const markdown = formatCommitteeGuardReportMarkdown(report);
    console.log(markdown);
    writeReport(args.out, report);
    return;
  }
  const report = await runEvaluation(args);
  writeReport(args.out, report);
}

main().catch((err) => {
  let args: CliArgs = {
    publicBoundary: false,
    useEnvApiKey: false,
    committeeThreshold: COMMITTEE_THRESHOLD,
    committeeSize: COMMITTEE_SIZE,
  };
  try {
    args = parseArgs(process.argv.slice(2));
  } catch {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const report = isCommitteePolicyError(err)
    ? buildPolicyRejectedCommitteeGuardReport({
      command: commandLabel(args),
      reason: err.message,
    })
    : buildBlockedCommitteeGuardReport({
      command: commandLabel(args),
      nodeEndpoint: ergoNodeEndpoint(),
      error: err,
      ergoApiKeyRead: args.useEnvApiKey,
    });
  try {
    writeReport(args.out, report);
    if (args.out) console.error('Wrote Phase 010a guard blocker report to --out target.');
  } catch {
    // Preserve the original blocker while still returning a sanitized summary.
  }
  console.error(`${report.result}: ${report.reason}`);
  if (report.observedError) console.error(`Observed error: ${report.observedError}`);
  process.exit(1);
});

function isCommitteePolicyError(error: unknown): error is CommitteePolicyError {
  return error instanceof CommitteePolicyError ||
    (
      typeof error === 'object' &&
      error !== null &&
      (error as { isCommitteePolicyError?: unknown }).isCommitteePolicyError === true
    );
}
