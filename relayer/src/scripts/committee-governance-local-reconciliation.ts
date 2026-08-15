import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import {
  buildLocalCommitteeGovernanceReconciliationPacket,
  buildLocalCommitteeGovernanceWrongNetworkPacket,
} from '../committee-governance-local-reconciliation.js';

interface CliArgs {
  observedAt?: string;
  reconciliationOut?: string;
  wrongNetworkOut?: string;
}

const usage = [
  'Usage: npm run governance:reconcile:local-packets -- --observed-at <ISO> --reconciliation-out <packet.json> --wrong-network-out <packet.json>',
  '',
  'Builds sanitized public local Gate 6 committee governance reconciliation and wrong-network negative JSON packets.',
  'Boundary: this command does not load environment files, query nodes, read runtime databases, read deployment state, read private deployment records, sign, rotate keys, approve, submit, reconcile, mutate state, broadcast, or authorize claims.',
  'The generated JSON packets are prerequisite input-shape evidence only; validate them with npm run governance:reconcile:validate. They are not Gate 6 closure, not key-rotation completion, not deployment approval, and not governance-ready or production-readiness claims.',
].join('\n');

export function parseCommitteeGovernanceLocalReconciliationArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }

    const next = argv[index + 1];
    const setValue = (key: keyof CliArgs): void => {
      if (!next) throw new Error(`${arg} requires a value`);
      args[key] = next;
      index += 1;
    };

    if (arg === '--observed-at') {
      setValue('observedAt');
    } else if (arg === '--reconciliation-out') {
      setValue('reconciliationOut');
    } else if (arg === '--wrong-network-out') {
      setValue('wrongNetworkOut');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function runCommitteeGovernanceLocalReconciliationCli(argv: string[]): void {
  const args = parseCommitteeGovernanceLocalReconciliationArgs(argv);
  const observedAt = requireArg(args.observedAt, '--observed-at');
  const reconciliationOut = requireArg(args.reconciliationOut, '--reconciliation-out');
  const wrongNetworkOut = requireArg(args.wrongNetworkOut, '--wrong-network-out');
  const reconciliationOutput = resolveOutput(reconciliationOut, '--reconciliation-out');
  const wrongNetworkOutput = resolveOutput(wrongNetworkOut, '--wrong-network-out');

  const reconciliationPacket = buildLocalCommitteeGovernanceReconciliationPacket(observedAt);
  const wrongNetworkPacket = buildLocalCommitteeGovernanceWrongNetworkPacket(observedAt);

  writeJsonPacket(reconciliationOutput, reconciliationPacket);
  writeJsonPacket(wrongNetworkOutput, wrongNetworkPacket);

  console.log('Committee governance reconciliation JSON: written');
  console.log(`reconciliation kind: ${reconciliationPacket.kind}`);
  console.log(`wrong-network kind: ${wrongNetworkPacket.kind}`);
  console.log(`observedAt: ${observedAt}`);
  console.log('Boundary: no environment files, nodes, runtime databases, deployed state, private deployment records, signing, key rotation, submit, reconcile, state mutation, broadcast, or claim authorization were used.');
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function resolveOutput(target: string, optionName: string): string {
  const resolved = resolveEvidenceJsonOutputPath(target, { optionName });
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }
  return resolved.path;
}

function writeJsonPacket(path: string, packet: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(packet, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCommitteeGovernanceLocalReconciliationCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exit(1);
  }
}
