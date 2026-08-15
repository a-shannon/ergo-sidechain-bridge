import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildAuthenticatedExternalFeeSettlementJvmFixtureV1,
} from '../authenticated-external-fee-settlement-jvm-fixture-v1.js';

const { compilerReceiptPath, outputPath } = parseArgs(process.argv.slice(2));
const compilerReceipt = readExactFile(
  compilerReceiptPath,
  'compiler receipt',
);
const fixture =
  await buildAuthenticatedExternalFeeSettlementJvmFixtureV1(compilerReceipt);
const json = `${JSON.stringify(fixture, null, 2)}\n`;
const bytes = Buffer.from(json, 'ascii');
if (
  bytes.length === 0
  || bytes.includes(13)
  || bytes.some(byte => byte > 0x7f)
) {
  throw new Error('acceptance fixture must be non-empty LF-only ASCII JSON');
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, bytes, { flag: 'wx' });
console.log(
  `compiler_receipt_sha256=${fixture.compilerReceiptSha256Hex}`,
);
console.log(
  `fixture_sha256=${createHash('sha256').update(bytes).digest('hex')}`,
);
console.log(
  `partial_transaction_id=${fixture.cases[0].prooflessTransactionIdHex}`,
);
console.log(
  `terminal_transaction_id=${fixture.cases[1].prooflessTransactionIdHex}`,
);

function parseArgs(args: readonly string[]): {
  compilerReceiptPath: string;
  outputPath: string;
} {
  if (
    args.length !== 4
    || args[0] !== '--compiler-receipt'
    || args[1].length === 0
    || args[2] !== '--output'
    || args[3].length === 0
  ) {
    throw new Error(
      'usage: --compiler-receipt <json-path> --output <new-json-path>',
    );
  }
  return {
    compilerReceiptPath: resolve(args[1]),
    outputPath: resolve(args[3]),
  };
}

function readExactFile(path: string, label: string): string {
  if (lstatSync(path).isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  const sourcePath = realpathSync(path);
  if (!lstatSync(sourcePath).isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
  const bytes = readFileSync(sourcePath);
  if (
    bytes.length === 0
    || bytes.length > 64 * 1024
    || bytes.includes(13)
    || bytes.some(byte => byte > 0x7f)
  ) {
    throw new Error(`${label} must be bounded non-empty LF-only ASCII`);
  }
  return bytes.toString('ascii');
}
