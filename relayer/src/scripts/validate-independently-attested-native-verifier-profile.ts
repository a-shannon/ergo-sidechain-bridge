import { readFileSync } from 'fs';
import { isAbsolute } from 'path';
import { fileURLToPath } from 'url';

import {
  loadReviewedNativeVerifierAttestorLock,
  verifyReviewedIndependentlyAttestedNativeVerifierProfile,
  type NativeVerifierAttestationPacket,
} from '../independently-attested-native-verifier-profile.js';

interface NativeVerifierAttestationCliArgs {
  describeReviewedLock: boolean;
  profilePath?: string;
  verifierPath?: string;
  codecPath?: string;
  help: boolean;
  errors: string[];
}

const usage = [
  'Usage:',
  '  npm run checkpoint:finalized:native:attestation:verify -- --describe-reviewed-lock',
  '  npm run checkpoint:finalized:native:attestation:verify -- --profile <absolute-json> --verifier <absolute-binary> --codec <absolute-binary>',
  'The attestor trust roots are loaded only from sources/native-verifier-attestor-lock.json.',
  'Runtime input cannot add or replace builder/reviewer keys.',
  'This command is offline validation only. It does not build, contact a node, sign, check, submit, deploy, broadcast, authorize admission, close Gate 5, or establish trustless/production readiness.',
];

export async function runNativeVerifierAttestationCli(argv: string[]): Promise<void> {
  const args = parseNativeVerifierAttestationArgs(argv);
  if (args.help) {
    console.log(usage.join('\n'));
    return;
  }
  if (args.errors.length > 0) throw new Error(args.errors.join('\n'));

  if (args.describeReviewedLock) {
    const lock = loadReviewedNativeVerifierAttestorLock();
    const activeProfiles = lock.profiles.filter(profile => profile.status === 'active').length;
    console.log('Reviewed native verifier attestor lock: PASS');
    console.log(`Active attestor profiles: ${activeProfiles}`);
    console.log(activeProfiles === 0
      ? 'Profile validation unavailable: no external attestor keys have been approved.'
      : 'Profile validation available relative to the reviewed source trust roots.');
    console.log('Boundary: lock validation is not admission evidence; provisioning integration, tracker-attestor separation, Ergo acceptance, Gate 5, and production readiness remain false.');
    return;
  }

  const profilePath = absolutePath(args.profilePath, '--profile');
  const verifierPath = absolutePath(args.verifierPath, '--verifier');
  const codecPath = absolutePath(args.codecPath, '--codec');
  let packet: NativeVerifierAttestationPacket;
  try {
    packet = JSON.parse(readFileSync(profilePath, 'utf8')) as NativeVerifierAttestationPacket;
  } catch {
    throw new Error('--profile could not be read as JSON');
  }
  const verified = verifyReviewedIndependentlyAttestedNativeVerifierProfile({
    packet,
    verifierExecutablePath: verifierPath,
    codecExecutablePath: codecPath,
  });
  console.log('Reviewed native verifier binary attestation: PASS');
  console.log(`Profile: ${verified.profileId}`);
  console.log(`Attestation: ${verified.attestationId}`);
  console.log(`Statement digest: ${verified.attestation.statementDigestHex}`);
  console.log('Boundary: exact signed binary profile only; admission, provisioning integration, tracker-attestor separation, Ergo acceptance, committee bypass prevention, Gate 5, and production readiness remain false.');
}

export function parseNativeVerifierAttestationArgs(
  argv: string[],
): NativeVerifierAttestationCliArgs {
  const result: NativeVerifierAttestationCliArgs = {
    describeReviewedLock: false,
    help: false,
    errors: [],
  };
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (argument === '--describe-reviewed-lock') {
      if (result.describeReviewedLock) {
        result.errors.push('--describe-reviewed-lock may be provided only once');
      }
      result.describeReviewedLock = true;
      continue;
    }
    if (argument !== '--profile' && argument !== '--verifier' && argument !== '--codec') {
      result.errors.push(`unknown option: ${argument}`);
      continue;
    }
    if (values.has(argument)) {
      result.errors.push(`${argument} may be provided only once`);
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      result.errors.push(`${argument} requires a value`);
      continue;
    }
    values.set(argument, value);
    index += 1;
  }
  result.profilePath = values.get('--profile');
  result.verifierPath = values.get('--verifier');
  result.codecPath = values.get('--codec');
  if (result.help) return result;
  if (result.describeReviewedLock) {
    if (values.size > 0) {
      result.errors.push('--describe-reviewed-lock cannot be combined with verification options');
    }
    return result;
  }
  if (!result.profilePath) result.errors.push('--profile is required');
  if (!result.verifierPath) result.errors.push('--verifier is required');
  if (!result.codecPath) result.errors.push('--codec is required');
  return result;
}

function absolutePath(value: string | undefined, label: string): string {
  if (!value || value.includes('\0') || !isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runNativeVerifierAttestationCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage.join('\n'));
    process.exitCode = 1;
  });
}
