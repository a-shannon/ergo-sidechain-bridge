import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, isAbsolute, resolve } from 'path';

import {
  buildEip0045BridgeValidityApplicationSettlementContextV2,
} from '../bridge-validity-application-settlement-context-v2.js';

const args = parseArgs(process.argv.slice(2));
const tracker = readSourceFile(
  args.trackerContext,
  'application validity tracker context',
);
const contracts = readSourceFile(
  args.contractIdentity,
  'application settlement contract identity',
);
const frontier = readSourceFile(args.frontierVector, 'Frontier vector');
const outputPath = newOutputPath(args.out);

// Build and validate everything before the output path is created.
const fixture =
  await buildEip0045BridgeValidityApplicationSettlementContextV2({
    trackerContextBytes: tracker,
    contractIdentityBytes: contracts,
    frontierVectorBytes: frontier,
  });
writeFileSync(
  outputPath,
  `${JSON.stringify(fixture, null, 2)}\n`,
  { encoding: 'ascii', flag: 'wx' },
);
console.log(
  `PASS: wrote ${fixture.schema} `
  + `(${fixture.prooflessTransactionBytes} proofless transaction bytes)`,
);
console.log(`Transaction ID: ${fixture.prooflessTransactionIdHex}`);
console.log(
  'Boundary: unsigned local serialization fixture only; no profile activation, '
  + 'target-node acceptance, payout-proof acceptance, signing, submission, '
  + 'broadcast, funds authority, or Gate 5 closure.',
);

interface CliArgs {
  readonly trackerContext: string;
  readonly contractIdentity: string;
  readonly frontierVector: string;
  readonly out: string;
}

function parseArgs(values: string[]): CliArgs {
  const allowed = new Set([
    '--tracker-context',
    '--contract-identity',
    '--frontier-vector',
    '--out',
  ]);
  const parsed = new Map<string, string>();
  if (values.length !== 8) usage();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!allowed.has(flag) || !value) usage();
    if (parsed.has(flag)) throw new Error(`duplicate argument: ${flag}`);
    parsed.set(flag, value);
  }
  for (const flag of allowed) {
    if (!parsed.has(flag)) usage();
  }
  return {
    trackerContext: parsed.get('--tracker-context')!,
    contractIdentity: parsed.get('--contract-identity')!,
    frontierVector: parsed.get('--frontier-vector')!,
    out: parsed.get('--out')!,
  };
}

function readSourceFile(pathInput: string, label: string): Buffer {
  if (!isAbsolute(pathInput)) {
    throw new Error(`${label} path must be absolute`);
  }
  const unresolved = resolve(pathInput);
  if (lstatSync(unresolved).isSymbolicLink()) {
    throw new Error(`${label} path must not be a symbolic link`);
  }
  const path = realpathSync(unresolved);
  if (!statSync(path).isFile()) {
    throw new Error(`${label} must be a regular file`);
  }
  return readFileSync(path);
}

function newOutputPath(pathInput: string): string {
  if (!isAbsolute(pathInput)) {
    throw new Error('output path must be absolute');
  }
  const resolved = resolve(pathInput);
  const parent = realpathSync(dirname(resolved));
  if (!statSync(parent).isDirectory()) {
    throw new Error('output parent must be a directory');
  }
  return resolve(parent, basename(resolved));
}

function usage(): never {
  throw new Error(
    'Usage: build-bridge-validity-application-settlement-context-v2 '
    + '--tracker-context <absolute tracker-context.json> '
    + '--contract-identity <absolute contract-identity.json> '
    + '--frontier-vector <absolute frontier-vector.json> '
    + '--out <absolute new fixture.json>',
  );
}
