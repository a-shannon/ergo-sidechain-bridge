import { writeFileSync } from 'fs';

import {
  loadEip0045BridgeValidityCompleteCandidateV1,
  resolveCandidateFixtureOutputPath,
  resolveEip0045BridgeValidityCandidateRoot,
} from '../bridge-validity-complete-candidate-v1.js';
import {
  buildEip0045BridgeValidityProoflessTransactionV1,
} from '../bridge-validity-proofless-transaction-v1.js';

const args = parseArgs(process.argv.slice(2));
const candidateRoot =
  resolveEip0045BridgeValidityCandidateRoot(args.candidateDir);
const outputPath = resolveCandidateFixtureOutputPath(
  candidateRoot,
  args.out,
);
const candidate =
  loadEip0045BridgeValidityCompleteCandidateV1(candidateRoot);
const fixture = await buildEip0045BridgeValidityProoflessTransactionV1(
  candidate.fixtureInput,
);

writeFileSync(
  outputPath,
  `${JSON.stringify(fixture, null, 2)}\n`,
  { encoding: 'ascii', flag: 'wx' },
);
console.log(
  `PASS: wrote ${fixture.schema} (${fixture.transaction.bytesToSignBytes} bytes)`,
);
console.log(
  `Bytes-to-sign digest: ${fixture.transaction.bytesToSignBlake2b256Hex}`,
);
console.log(`Transaction ID: ${fixture.transaction.transactionIdHex}`);
console.log(
  'Boundary: proofless whole-transaction serialization only; no signing, node check, submission, broadcast, activation, Gate 5 closure, or funds authority.',
);

interface CliArgs {
  candidateDir: string;
  out: string;
}

function parseArgs(values: string[]): CliArgs {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!['--candidate-dir', '--out'].includes(flag) || !value) {
      usage();
    }
    if (parsed.has(flag)) {
      throw new Error(`duplicate argument: ${flag}`);
    }
    parsed.set(flag, value);
  }
  if (values.length !== 4 || !parsed.has('--candidate-dir') || !parsed.has('--out')) {
    usage();
  }
  return {
    candidateDir: parsed.get('--candidate-dir')!,
    out: parsed.get('--out')!,
  };
}

function usage(): never {
  throw new Error(
    'Usage: npm run proof:proofless-transaction:fixture -- '
    + '--candidate-dir <absolute completed candidate directory> '
    + '--out <absolute new fixture.json>',
  );
}
