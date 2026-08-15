export interface CommitteeConfig {
  pubKeyHexes: string[];
  primaryPubKeyHex: string;
  threshold: string;
}

export interface DeployedCommitteeConfig {
  publicKeys: string[];
  primaryPublicKey: string;
  threshold: string;
}

export const CHECK_ONLY_COMMITTEE_PUBKEY_HEXES = [
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5',
  '0227562580bbfc2cf3f72b3dbb725f30f358ca545209255458536adcf1a4aad871',
  '03b6447502eeff10813c6c7a01e1f2c3a97c54bbeeb3f9206984ccb0e63b0c56f3',
];

export const CHECK_ONLY_COMMITTEE_THRESHOLD = '2';

const COMPRESSED_PUBLIC_KEY_HEX = /^[0-9a-f]{66}$/;

export function createCommitteeConfig(
  pubKeyHexInput: string | readonly string[],
  thresholdInput = '1',
): CommitteeConfig {
  const pubKeyHexes = parseCommitteePubKeyHexes(pubKeyHexInput);
  const threshold = thresholdInput.trim();

  if (!/^[1-9][0-9]*$/.test(threshold)) {
    throw new Error('COMMITTEE_THRESHOLD must be a positive integer');
  }

  const thresholdNumber = Number(threshold);
  if (!Number.isSafeInteger(thresholdNumber)) {
    throw new Error('COMMITTEE_THRESHOLD must be a safe integer');
  }
  if (thresholdNumber > pubKeyHexes.length) {
    throw new Error('COMMITTEE_THRESHOLD cannot exceed committee public key count');
  }

  return {
    pubKeyHexes,
    primaryPubKeyHex: pubKeyHexes[0],
    threshold,
  };
}

export function createCommitteeConfigFromState(
  defaultPubKeyHex: string,
  deployedState?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): CommitteeConfig {
  const envPubKeyHexes = env.COMMITTEE_PUBKEY_HEXES?.trim();
  const envPubKeyHex = env.COMMITTEE_PUBKEY_HEX?.trim();
  const deployedCommittee = readDeployedCommitteeConfig(deployedState);
  const thresholdInput = env.COMMITTEE_THRESHOLD?.trim();

  if (envPubKeyHexes && !thresholdInput && parseCommitteePubKeyHexes(envPubKeyHexes).length > 1) {
    throw new Error('COMMITTEE_THRESHOLD must be set when COMMITTEE_PUBKEY_HEXES has multiple keys');
  }

  return createCommitteeConfig(
    envPubKeyHexes || envPubKeyHex || deployedCommittee?.pubKeyHexes || defaultPubKeyHex,
    thresholdInput || (envPubKeyHexes || envPubKeyHex ? '1' : deployedCommittee?.threshold) || '1',
  );
}

export function committeeConfigToDeployedState(committee: CommitteeConfig): DeployedCommitteeConfig {
  return {
    publicKeys: [...committee.pubKeyHexes],
    primaryPublicKey: committee.primaryPubKeyHex,
    threshold: committee.threshold,
  };
}

export function parseCommitteePubKeyHexes(input: string | readonly string[]): string[] {
  const rawKeys: readonly string[] = typeof input === 'string'
    ? input.split(/[,\s;]+/u)
    : input;
  const pubKeyHexes = rawKeys
    .map((key: string) => key.trim().toLowerCase())
    .filter(Boolean);

  if (pubKeyHexes.length === 0) {
    throw new Error('committee public key list must not be empty');
  }

  for (const pubKeyHex of pubKeyHexes) {
    if (!COMPRESSED_PUBLIC_KEY_HEX.test(pubKeyHex)) {
      throw new Error('committee public keys must be 33-byte compressed public key hex strings');
    }
  }

  if (new Set(pubKeyHexes).size !== pubKeyHexes.length) {
    throw new Error('committee public keys must be distinct');
  }

  return pubKeyHexes;
}

function readDeployedCommitteeConfig(deployedState: unknown): CommitteeConfig | undefined {
  if (deployedState === null || typeof deployedState !== 'object') return undefined;

  const committee = (deployedState as { committee?: unknown }).committee;
  if (committee === null || typeof committee !== 'object') return undefined;

  const publicKeys = (committee as { publicKeys?: unknown }).publicKeys;
  const threshold = (committee as { threshold?: unknown }).threshold;
  if (!Array.isArray(publicKeys) || typeof threshold !== 'string') return undefined;

  return createCommitteeConfig(publicKeys.filter((key): key is string => typeof key === 'string'), threshold);
}

export function injectCommitteePlaceholders(source: string, committee: CommitteeConfig): string {
  if (
    source.includes('COMMITTEE_PK_HEX_PLACEHOLDER') &&
    committee.pubKeyHexes.length !== 1
  ) {
    throw new Error(
      'multi-key committee injection requires COMMITTEE_SIGMAPROP_PLACEHOLDERS in the contract source',
    );
  }

  return source
    .replaceAll('COMMITTEE_SIGMAPROP_PLACEHOLDERS', committeeSigmaPropSource(committee.pubKeyHexes))
    .replaceAll('COMMITTEE_PK_HEX_PLACEHOLDER', committee.primaryPubKeyHex)
    .replaceAll('COMMITTEE_THRESHOLD_PLACEHOLDER', committee.threshold);
}

export function committeeSigmaPropSource(pubKeyHexes: readonly string[]): string {
  return pubKeyHexes
    .map(pubKeyHex => `proveDlog(decodePoint(fromBase16("${pubKeyHex}")))`)
    .join(',\n    ');
}
