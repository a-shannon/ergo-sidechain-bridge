/**
 * Spike 6: Ergo Extension 0x04 Injection Viability
 * =================================================
 *
 * STATUS: PROVISIONAL PASS / NODE PATCH REQUIRED
 *
 * This spike checks whether Ergo block extensions can carry a custom 0x04
 * sidechain commitment field and whether the stock local miner exposes a way
 * to inject that field.
 *
 * Result:
 * - Extension format/validation accepts arbitrary 2-byte key spaces, including
 *   0x04xx, as long as key length, value length, uniqueness, and interlinks
 *   rules are satisfied.
 * - The stock mining API and CandidateGenerator do not expose a config/API hook
 *   to append arbitrary fields to the mined extension candidate.
 * - Phase 011a therefore needs a small Ergo node/miner patch, or an equivalent
 *   trusted candidate generation path, before a true devnet mined-block test.
 */

import fs from 'node:fs';
import path from 'node:path';
import blakejs from 'blakejs';
import { resolveEvidenceOutputPath } from '../../evidence-output-path.js';

const DIGEST_SIZE = 32;
const LEAF_PREFIX = 0x00;
const INTERNAL_NODE_PREFIX = 0x01;
const EMPTY_HASH = Buffer.alloc(0);
const PUBLIC_BOUNDARY_FLAG = '--public-boundary';
const COMMAND_LABEL = 'npm run trustless:extension-boundary --';

type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

type CliArgs = {
  publicBoundary: boolean;
  out?: string;
};

type TreeNode = {
  hash: Buffer;
  left?: TreeNode;
  right?: TreeNode;
  leafIndex?: number;
};

type Field = {
  key: Buffer;
  value: Buffer;
};

function blake2b256(data: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, DIGEST_SIZE));
}

function prefixedHash(prefix: number, ...inputs: Buffer[]): Buffer {
  return blake2b256(Buffer.concat([Buffer.from([prefix]), ...inputs]));
}

function leafHash(leafData: Buffer): Buffer {
  return prefixedHash(LEAF_PREFIX, leafData);
}

function internalHash(left: Buffer, right: Buffer): Buffer {
  return prefixedHash(INTERNAL_NODE_PREFIX, left, right);
}

function kvToLeaf(key: Buffer, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([key.length]), key, value]);
}

function calcTopNode(nodes: TreeNode[]): TreeNode {
  if (nodes.length === 0) {
    return { hash: Buffer.alloc(DIGEST_SIZE) };
  }

  let current = [...nodes];
  while (true) {
    const next: TreeNode[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : { hash: EMPTY_HASH };
      next.push({ hash: internalHash(left.hash, right.hash), left, right });
    }
    if (next.length === 1) return next[0];
    current = next;
  }
}

function buildMerkleTree(fields: Field[]): TreeNode {
  const leaves = fields.map((f, i) => ({
    hash: leafHash(kvToLeaf(f.key, f.value)),
    leafIndex: i,
  }));
  return calcTopNode(leaves);
}

function buildProofFlat(tree: TreeNode, targetIndex: number): Buffer {
  const levels: { side: number; siblingHash: Buffer }[] = [];

  function collect(node: TreeNode): boolean {
    if (!node.left && !node.right) return node.leafIndex === targetIndex;

    if (node.left && collect(node.left)) {
      const sibling = node.right?.hash ?? EMPTY_HASH;
      levels.push({
        side: sibling.length === 0 ? 0x02 : 0x00,
        siblingHash: sibling.length === 0 ? Buffer.alloc(32) : sibling,
      });
      return true;
    }

    if (node.right && collect(node.right)) {
      const sibling = node.left?.hash ?? EMPTY_HASH;
      levels.push({
        side: sibling.length === 0 ? 0x03 : 0x01,
        siblingHash: sibling.length === 0 ? Buffer.alloc(32) : sibling,
      });
      return true;
    }

    return false;
  }

  if (!collect(tree)) {
    throw new Error(`target index ${targetIndex} not found in tree`);
  }

  return Buffer.concat(levels.map(level => Buffer.concat([
    Buffer.from([level.side]),
    level.siblingHash,
  ])));
}

function verifyProofFlat(leafData: Buffer, proof: Buffer, expectedRoot: Buffer): boolean {
  let acc = leafHash(leafData);
  if (proof.length % 33 !== 0) {
    throw new Error(`invalid proof length ${proof.length}`);
  }

  for (let i = 0; i < proof.length / 33; i++) {
    const side = proof[i * 33];
    const sibling = proof.subarray(i * 33 + 1, i * 33 + 33);

    if (side === 0x00) {
      acc = internalHash(acc, sibling);
    } else if (side === 0x01) {
      acc = internalHash(sibling, acc);
    } else if (side === 0x02 || side === 0x03) {
      acc = internalHash(acc, EMPTY_HASH);
    } else {
      throw new Error(`non-canonical proof side byte ${side}`);
    }
  }

  return acc.equals(expectedRoot);
}

function serializeExtension(headerId: Buffer, fields: Field[]): Buffer {
  if (headerId.length !== 32) throw new Error('header id must be 32 bytes');
  const fieldCount = Buffer.alloc(2);
  fieldCount.writeUInt16BE(fields.length, 0);

  return Buffer.concat([
    headerId,
    fieldCount,
    ...fields.map(f => {
      if (f.key.length !== 2) throw new Error(`invalid key length ${f.key.length}`);
      if (f.value.length > 64) throw new Error(`invalid value length ${f.value.length}`);
      return Buffer.concat([f.key, Buffer.from([f.value.length]), f.value]);
    }),
  ]);
}

function findErgoSourceRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), '..', 'ergo-source'),
    path.resolve(process.cwd(), '..', '..', 'ergo-source'),
    path.resolve(process.cwd(), 'ergo-source'),
  ];

  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`ergo-source not found. Tried: ${candidates.join(', ')}`);
  }
  return found;
}

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listSourceFiles(root: string): string[] {
  const result: string[] = [];
  const allowed = new Set(['.scala', '.conf', '.md']);

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'target' || entry.name === '.git') continue;
        walk(full);
      } else if (allowed.has(path.extname(entry.name))) {
        result.push(full);
      }
    }
  }

  walk(root);
  return result;
}

function staticChecks(ergoRoot: string): Check[] {
  const extension = read(
    ergoRoot,
    'ergo-core/src/main/scala/org/ergoplatform/modifiers/history/extension/Extension.scala',
  );
  const candidate = read(
    ergoRoot,
    'ergo-core/src/main/scala/org/ergoplatform/modifiers/history/extension/ExtensionCandidate.scala',
  );
  const serializer = read(
    ergoRoot,
    'ergo-core/src/main/scala/org/ergoplatform/modifiers/history/extension/ExtensionSerializer.scala',
  );
  const validator = read(
    ergoRoot,
    'ergo-core/src/main/scala/org/ergoplatform/nodeView/history/storage/modifierprocessors/ExtensionValidator.scala',
  );
  const miningApi = read(
    ergoRoot,
    'src/main/scala/org/ergoplatform/http/api/MiningApiRoute.scala',
  );
  const candidateGenerator = read(
    ergoRoot,
    'src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala',
  );
  const networkType = read(
    ergoRoot,
    'ergo-core/src/main/scala/org/ergoplatform/modifiers/NetworkObjectTypeId.scala',
  );

  const allText = listSourceFiles(ergoRoot)
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');

  return [
    {
      name: 'No public SidechainsDataPrefix in local Ergo source',
      pass: !allText.includes('SidechainsDataPrefix'),
      detail: 'Search across Scala/conf/md sources found no SidechainsDataPrefix symbol.',
    },
    {
      name: 'Extension format defines 2-byte keys and 64-byte max values',
      pass: extension.includes('val FieldKeySize: Int = 2') &&
        extension.includes('val FieldValueMaxSize: Int = 64') &&
        candidate.includes('Keys must be of 2 bytes length') &&
        candidate.includes('Values must be no more than 64 bytes long'),
      detail: 'Extension key space is first-byte prefix + second-byte index; value max is 64 bytes.',
    },
    {
      name: 'Extension validator has no custom prefix whitelist',
      pass: validator.includes('extension.fields.forall(_._1.lengthCompare(Extension.FieldKeySize) == 0)') &&
        validator.includes('extension.fields.forall(_._2.lengthCompare(Extension.FieldValueMaxSize) <= 0)') &&
        validator.includes('exDuplicateKeys') &&
        !validator.includes('SystemParametersPrefix') &&
        !validator.includes('ValidationRulesPrefix'),
      detail: 'Validation checks interlinks, key length, value length, duplicate keys, and non-empty extension.',
    },
    {
      name: 'Serializer persists arbitrary field keys in block order',
      pass: serializer.includes('w.putBytes(key)') &&
        serializer.includes('w.putUByte(value.length)') &&
        serializer.includes('fieldsView') &&
        serializer.includes('(key, value)'),
      detail: 'Serializer writes key, value length, and value without prefix-specific branching.',
    },
    {
      name: 'Protocol docs say miners can put arbitrary extension data',
      pass: networkType.includes('miners can also put arbitrary data there'),
      detail: 'NetworkObjectTypeId ExtensionTypeId comment explicitly allows arbitrary data.',
    },
    {
      name: 'Stock mining API exposes tx selection, not extension injection',
      pass: miningApi.includes('path("candidate")') &&
        miningApi.includes('GenerateCandidate(Seq.empty') &&
        miningApi.includes('path("candidateWithTxs")') &&
        miningApi.includes('entity(as[Seq[ErgoTransaction]])') &&
        !miningApi.includes('ExtensionCandidate'),
      detail: 'GET /mining/candidate and POST /mining/candidateWithTxs do not accept extension fields.',
    },
    {
      name: 'CandidateGenerator builds extension from built-in sources only',
      pass: candidateGenerator.includes('newParams.toExtensionCandidate ++ interlinksExtension ++ newValidationSettings.toExtensionCandidate') &&
        candidateGenerator.includes('(interlinksExtension,') &&
        candidateGenerator.includes('val extensionRoot: Digest32 = candidate.extension.digest'),
      detail: 'Extension root is derived from candidate.extension.digest before PoW; no custom sidechain hook is present.',
    },
  ];
}

function runMerkleSimulation(): Check[] {
  const sidechainField: Field = {
    key: Buffer.from('0401', 'hex'),
    value: blake2b256(Buffer.from('phase-011a-spike-6-sidechain-commitment', 'utf8')),
  };

  const fields: Field[] = [
    { key: Buffer.from('0100', 'hex'), value: Buffer.alloc(32, 0x11) },
    sidechainField,
    { key: Buffer.from('0201', 'hex'), value: Buffer.from([0x01]) },
  ];

  const uniqueKeys = new Set(fields.map(f => f.key.toString('hex'))).size === fields.length;
  const validShape = fields.every(f => f.key.length === 2 && f.value.length <= 64) && uniqueKeys;
  const root = buildMerkleTree(fields).hash;
  const proof = buildProofFlat(buildMerkleTree(fields), 1);
  const leaf = kvToLeaf(sidechainField.key, sidechainField.value);
  const proofOk = verifyProofFlat(leaf, proof, root);
  const serialized = serializeExtension(Buffer.alloc(32), fields);

  return [
    {
      name: 'Synthetic 0x0401 field satisfies consensus shape constraints',
      pass: validShape,
      detail: `key=${sidechainField.key.toString('hex')} valueBytes=${sidechainField.value.length}`,
    },
    {
      name: '0x0401 participates in Scorex-compatible extension Merkle root',
      pass: proofOk,
      detail: `root=${root.toString('hex')} proofBytes=${proof.length}`,
    },
    {
      name: 'Serialized extension section remains below block extension limit',
      pass: serialized.length < 32768,
      detail: `serializedBytes=${serialized.length} fields=${fields.length}`,
    },
  ];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { publicBoundary: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: npm run trustless:extension-boundary -- [--public-boundary] [--out <report.md>]',
        '',
        'Runs a bounded 0x04xx extension-key prerequisite report.',
        '--public-boundary runs only the synthetic 0x0401 Merkle shape simulation and does not inspect local Ergo source.',
      ].join('\n'));
      process.exit(0);
    }
    if (arg === PUBLIC_BOUNDARY_FLAG) {
      args.publicBoundary = true;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a report path');
      args.out = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function commandLabel(args: CliArgs): string {
  const parts = [COMMAND_LABEL];
  if (args.publicBoundary) parts.push(PUBLIC_BOUNDARY_FLAG);
  if (args.out) parts.push('--out <report.md>');
  return parts.join(' ');
}

function formatBoundaryReport(args: CliArgs, checks: Check[]): string {
  const allPass = checks.every(check => check.pass);
  return [
    '# Gate 5 0x04 Extension Public Boundary Report',
    '',
    'This report records the offline 0x0401 extension-shape simulation only.',
    'This is prerequisite evidence only. It does not prove mined-block anchoring,',
    'resolve the node patch requirement, close Gate 5, authorize settlement,',
    'authorize broadcast, or support production-ready, mainnet, or testnet',
    'production-candidate claims.',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${commandLabel(args)} |`,
    `| Result | ${allPass ? 'BOUNDARY_ONLY' : 'BLOCKED'} |`,
    '| Exit code | 0 |',
    '| Local Ergo source checkout read | no |',
    '',
    '## Simulation Checks',
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...checks.map(check =>
      `| ${check.name} | ${check.pass ? 'PASS' : 'FAIL'} | ${check.detail} |`,
    ),
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    '| 0x0401 synthetic extension shape checked | yes |',
    '| Local Ergo source checkout read | no |',
    '| Runtime database opened | no |',
    '| Deployment state opened | no |',
    '| Secret or environment file read | no |',
    '| Node or miner API request performed | no |',
    '| Transaction broadcast, submit, deploy, or state mutation performed | no |',
    '| Node patch requirement resolved | no |',
    '| SPV relay or tracker evidence completed | no |',
    '| On-chain proof acceptance evidence completed | no |',
    '| Gate 5 closure allowed | no |',
    '| Production-ready claim allowed | no |',
    '| Mainnet deployment claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
    '',
  ].join('\n');
}

function writeBoundaryReport(out: string | undefined, markdown: string): void {
  if (!out) return;
  const resolved = resolveEvidenceOutputPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(resolved.path), { recursive: true });
  fs.writeFileSync(resolved.path, markdown, { encoding: 'utf8', flag: 'wx' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.publicBoundary) {
    const checks = runMerkleSimulation();
    const markdown = formatBoundaryReport(args, checks);
    console.log(markdown);
    writeBoundaryReport(args.out, markdown);
    if (!checks.every(check => check.pass)) process.exit(1);
    return;
  }

  const ergoRoot = findErgoSourceRoot();
  const checks = [...staticChecks(ergoRoot), ...runMerkleSimulation()];

  console.log('Spike 6: Ergo Extension 0x04 Injection Viability');
  console.log('==================================================');
  console.log(`ergo-source: ${ergoRoot}`);
  console.log('');

  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'} | ${check.name}`);
    console.log(`       ${check.detail}`);
  }

  const allPass = checks.every(check => check.pass);
  console.log('');
  console.log('Conclusion:');
  if (allPass) {
    console.log('PROVISIONAL PASS / NODE PATCH REQUIRED');
    console.log('- Extension format and validation are compatible with a 0x04xx sidechain key space.');
    console.log('- Stock Ergo node mining does not expose a field-injection hook.');
    console.log('- Next implementation step: patch CandidateGenerator or equivalent miner candidate path to append 0x04 fields before extensionRoot is derived.');
  } else {
    console.log('FAIL');
    console.log('- One or more source/format assumptions did not hold.');
  }

  if (!allPass) process.exit(1);
}

main();
