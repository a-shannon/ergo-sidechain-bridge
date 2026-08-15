import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  buildAuthenticatedV2UnsignedSettlementPackage,
  validateAuthenticatedV2UnsignedSettlementPackage,
} from '../authenticated-v2-unsigned-settlement-package.js';
import {
  resolveProvisioningOutputPath,
  resolveProvisioningRepositoryInputPath,
} from '../authenticated-v2-sanitized-io.js';

export interface AuthenticatedV2UnsignedSettlementPackageCliArgs {
  readiness?: string;
  companion?: string;
  out?: string;
  help: boolean;
  errors: string[];
}

interface CliOptions {
  cwd?: string;
  bridgeRoot?: string;
}

const usage = [
  'Usage: npm run trustless:wp06-unsigned-package -- --readiness <stateful-readiness.json> --companion <unsigned-settlement-companion.json> --out <new-unsigned-settlement-package.json>',
  'Validates one WP-06T9 dual-origin readiness report and one strict public burn/proof/DUP-history companion, then deterministically builds the exact authenticated V2 unsigned EIP-12 settlement package.',
  'All JSON paths must remain inside the bridge repository. The output is create-only.',
  'This command reads no environment credentials, bridge configuration, runtime database, deployment state, signer, wallet, or node.',
  'It constructs no setup transaction and performs no /transactions/check, signing, submission, broadcast, or deployment.',
  'The package is an offline construction artifact only. R9 remains the finality authority, Gate 5 remains open, and the bridge is not trustless or production-ready.',
];
const MAX_STRICT_JSON_DEPTH = 256;

export async function runAuthenticatedV2UnsignedSettlementPackageCli(
  argv: string[],
  options: CliOptions = {},
): Promise<void> {
  const args = parseAuthenticatedV2UnsignedSettlementPackageArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  const cwd = resolve(options.cwd ?? process.cwd());
  const pathOptions = { cwd, bridgeRoot: options.bridgeRoot };
  const readinessPath = resolveProvisioningRepositoryInputPath(
    requireArg(args.readiness, '--readiness'),
    pathOptions,
  );
  const companionPath = resolveProvisioningRepositoryInputPath(
    requireArg(args.companion, '--companion'),
    pathOptions,
  );
  const outputPath = resolveProvisioningOutputPath(
    requireArg(args.out, '--out'),
    pathOptions,
  );
  const readinessReport = readJson(readinessPath, '--readiness');
  const companion = readJson(companionPath, '--companion');
  const pkg = await buildAuthenticatedV2UnsignedSettlementPackage({
    readinessReport,
    companion,
  });
  await validateAuthenticatedV2UnsignedSettlementPackage(pkg);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(pkg, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`Authenticated V2 unsigned settlement package written: ${relative(cwd, outputPath)}`);
  console.log(`Unsigned transaction ID: ${pkg.transaction.unsignedTransactionIdHex}`);
  console.log(`Package digest: ${pkg.packageDigestHex}`);
  console.log(`ContextExtension guard: ${pkg.transaction.contextExtensionGuard.status}`);
  console.log(
    'Boundary: offline construction only; no node, check, signing, submission, broadcast, deployment, Gate 5 closure, trustless claim, or production-readiness claim.',
  );
}

export function parseAuthenticatedV2UnsignedSettlementPackageArgs(
  argv: string[],
): AuthenticatedV2UnsignedSettlementPackageCliArgs {
  const parsed: AuthenticatedV2UnsignedSettlementPackageCliArgs = {
    help: false,
    errors: [],
  };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help' || option === '-h') {
      parsed.help = true;
      continue;
    }
    if (!['--readiness', '--companion', '--out'].includes(option)) {
      parsed.errors.push(`unknown option: ${option}`);
      continue;
    }
    if (seen.has(option)) {
      parsed.errors.push(`${option} may be provided only once`);
      index += 1;
      continue;
    }
    seen.add(option);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      parsed.errors.push(`${option} requires a value`);
      continue;
    }
    index += 1;
    if (option === '--readiness') parsed.readiness = value;
    else if (option === '--companion') parsed.companion = value;
    else parsed.out = value;
  }
  if (!parsed.help) {
    if (!parsed.readiness) parsed.errors.push('--readiness is required');
    if (!parsed.companion) parsed.errors.push('--companion is required');
    if (!parsed.out) parsed.errors.push('--out is required');
  }
  return parsed;
}

function readJson(path: string, label: string): unknown {
  try {
    const source = readFileSync(path, 'utf8');
    const parsed = JSON.parse(source) as unknown;
    assertNoDuplicateJsonKeys(source);
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`${label} must contain strict valid JSON without duplicate keys: ${detail}`);
  }
}

function assertNoDuplicateJsonKeys(source: string): void {
  let offset = 0;

  const skipWhitespace = (): void => {
    while (offset < source.length && /[\t\n\r ]/.test(source[offset])) offset += 1;
  };

  const parseString = (): string => {
    const start = offset;
    if (source[offset] !== '"') throw new Error('JSON object key must be a string');
    offset += 1;
    while (offset < source.length) {
      const code = source.charCodeAt(offset);
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset)) as string;
      }
      if (source[offset] === '\\') {
        offset += 2;
        if (source[offset - 1] === 'u') offset += 4;
        continue;
      }
      if (code < 0x20) throw new Error('JSON string contains an unescaped control character');
      offset += 1;
    }
    throw new Error('JSON string is unterminated');
  };

  const parsePrimitive = (): void => {
    const rest = source.slice(offset);
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest)?.[0];
    if (!token) throw new Error('JSON value is invalid');
    offset += token.length;
  };

  const parseValue = (depth: number): void => {
    if (depth > MAX_STRICT_JSON_DEPTH) {
      throw new Error(`JSON nesting must not exceed ${MAX_STRICT_JSON_DEPTH}`);
    }
    skipWhitespace();
    if (source[offset] === '{') {
      offset += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (source[offset] === '}') {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error(`duplicate JSON object key: ${key}`);
        keys.add(key);
        skipWhitespace();
        if (source[offset] !== ':') throw new Error('JSON object key must be followed by a colon');
        offset += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (source[offset] === '}') {
          offset += 1;
          return;
        }
        if (source[offset] !== ',') throw new Error('JSON object members must be comma-separated');
        offset += 1;
      }
      throw new Error('JSON object is unterminated');
    }
    if (source[offset] === '[') {
      offset += 1;
      skipWhitespace();
      if (source[offset] === ']') {
        offset += 1;
        return;
      }
      while (offset < source.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (source[offset] === ']') {
          offset += 1;
          return;
        }
        if (source[offset] !== ',') throw new Error('JSON array items must be comma-separated');
        offset += 1;
      }
      throw new Error('JSON array is unterminated');
    }
    if (source[offset] === '"') {
      parseString();
      return;
    }
    parsePrimitive();
  };

  parseValue(0);
  skipWhitespace();
  if (offset !== source.length) throw new Error('JSON contains trailing content');
}

function requireArg(value: string | undefined, option: string): string {
  if (!value) throw new Error(`${option} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAuthenticatedV2UnsignedSettlementPackageCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
