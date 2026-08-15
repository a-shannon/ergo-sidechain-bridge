/**
 * Pure helpers for devnet signer/mining alignment.
 *
 * Verifies that the relayer's Fleet signer address matches the configured
 * mining target (miningPubKeyHex). No secrets are exported or printed.
 *
 * Key distinction:
 * - Fleet signer address: derived from WALLET_MNEMONIC via deriveChild(0)
 * - Node wallet address: BIP-44 m/44'/429'/0'/0/0 (different from Fleet!)
 * - Mining target: configured via miningPubKeyHex in merged config
 *
 * The signer check PASSES when DEVNET_MINING_TARGET is set and matches
 * the Fleet signer address. The node wallet API address list
 * is irrelevant when miningPubKeyHex overrides the mining target.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlignmentResult {
  status: 'PASS' | 'WARN';
  label: string;
  detail: string;
}

export interface ConfigParseResult {
  hasTestMnemonic: boolean;
  minerRewardDelay: number | null;
}

// ---------------------------------------------------------------------------
// Config parsing -- pure string analysis, no I/O
// ---------------------------------------------------------------------------

/**
 * Parse `minerRewardDelay` from a HOCON/Typesafe Config string.
 * Returns null if not found.
 */
export function parseMinerRewardDelay(configContent: string): number | null {
  const match = configContent.match(/minerRewardDelay\s*=\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Detect whether a `testMnemonic` field exists in the config.
 * Does NOT extract or return the mnemonic value.
 */
export function hasTestMnemonicField(configContent: string): boolean {
  return /testMnemonic\s*=\s*"/.test(configContent);
}

/**
 * Parse both fields at once for convenience.
 */
export function parseDevnetConfig(configContent: string): ConfigParseResult {
  return {
    hasTestMnemonic: hasTestMnemonicField(configContent),
    minerRewardDelay: parseMinerRewardDelay(configContent),
  };
}

/**
 * Format config paths for logs without exposing local user/workspace paths.
 */
export function formatConfigPathForReport(configPath: string): string {
  const normalized = configPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const last = parts.at(-1) ?? configPath;
  const parent = parts.at(-2);

  if (parent && last === 'application.conf') {
    return `.../${parent}/${last}`;
  }

  if (parts.length <= 1) return configPath;
  return `.../${last}`;
}

/**
 * Format addresses/pubkeys for logs without exposing full local identifiers.
 */
export function formatIdentifierForReport(identifier: string): string {
  if (identifier.length <= 18) return identifier;
  return `${identifier.slice(0, 8)}...${identifier.slice(-6)}`;
}

/**
 * Extract the testMnemonic value from config content.
 * PRIVATE -- only used internally for address derivation.
 * Never export this function.
 */
function extractTestMnemonic(configContent: string): string | null {
  const match = configContent.match(/testMnemonic\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Address derivation -- async because ErgoHDKey.fromMnemonic is async
// ---------------------------------------------------------------------------

/**
 * Derive a P2PK address from a mnemonic using Fleet derivation (deriveChild(0)).
 * Returns the address string only. The mnemonic is never stored, logged, or returned.
 */
export async function deriveAddressFromMnemonic(
  mnemonic: string,
  networkPrefix: number = 16,
): Promise<string> {
  // Dynamic import to keep the module testable without wallet dep in unit tests
  const { ErgoHDKey } = await import('@fleet-sdk/wallet');
  const masterKey = await ErgoHDKey.fromMnemonic(mnemonic);
  const childKey = masterKey.deriveChild(0);
  return childKey.address.toString(networkPrefix);
}

// ---------------------------------------------------------------------------
// Mining target alignment -- the real check
// ---------------------------------------------------------------------------

/**
 * Classify mining target alignment.
 *
 * PASS: DEVNET_MINING_TARGET is set and matches Fleet signer address.
 * WARN: any mismatch, missing data, or no mining target configured.
 */
export function classifyMiningTargetAlignment(
  fleetSignerAddress: string | null,
  miningTarget: string | null,
): AlignmentResult {
  if (!fleetSignerAddress) {
    return {
      status: 'WARN',
      label: 'Devnet mining target',
      detail: 'WALLET_MNEMONIC not set -- cannot derive Fleet signer address',
    };
  }
  if (!miningTarget) {
    return {
      status: 'WARN',
      label: 'Devnet mining target',
      detail: `DEVNET_MINING_TARGET not set -- mining rewards go to node wallet (BIP-44), not Fleet signer ${formatIdentifierForReport(fleetSignerAddress)}`,
    };
  }
  if (fleetSignerAddress === miningTarget) {
    return {
      status: 'PASS',
      label: 'Devnet mining target',
      detail: `mining target matches Fleet signer: ${formatIdentifierForReport(fleetSignerAddress)}`,
    };
  }
  return {
    status: 'WARN',
    label: 'Devnet mining target',
    detail: `mining target ${formatIdentifierForReport(miningTarget)} differs from Fleet signer ${formatIdentifierForReport(fleetSignerAddress)}`,
  };
}

// ---------------------------------------------------------------------------
// Legacy alignment -- config-only check (for when DEVNET_MINING_TARGET is unavailable)
// ---------------------------------------------------------------------------

/**
 * Classify signer alignment given two optional addresses.
 * NOTE: This only proves both addresses derive from the same mnemonic
 * using the same path. It does NOT prove the node wallet uses this address.
 */
export function classifyAlignment(
  relayerAddress: string | null,
  miningAddress: string | null,
): AlignmentResult {
  if (!relayerAddress && !miningAddress) {
    return {
      status: 'WARN',
      label: 'Devnet signer alignment (config-only)',
      detail: 'WALLET_MNEMONIC not set and config has no testMnemonic -- cannot compare',
    };
  }
  if (!relayerAddress) {
    return {
      status: 'WARN',
      label: 'Devnet signer alignment (config-only)',
      detail: 'WALLET_MNEMONIC not set -- cannot compare to mining address',
    };
  }
  if (!miningAddress) {
    return {
      status: 'WARN',
      label: 'Devnet signer alignment (config-only)',
      detail: 'config has no testMnemonic -- cannot derive mining address',
    };
  }
  if (relayerAddress === miningAddress) {
    return {
      status: 'PASS',
      label: 'Devnet signer alignment (config-only)',
      detail: `Fleet-derived addresses match: ${formatIdentifierForReport(relayerAddress)}. NOTE: actual node wallet address (BIP-44) will differ -- use miningPubKeyHex to route mining rewards.`,
    };
  }
  return {
    status: 'WARN',
    label: 'Devnet signer alignment (config-only)',
    detail: `addresses differ -- relayer: ${formatIdentifierForReport(relayerAddress)}, mining: ${formatIdentifierForReport(miningAddress)}`,
  };
}

/**
 * Classify when config file is missing.
 */
export function classifyConfigMissing(configPath: string): AlignmentResult {
  return {
    status: 'WARN',
    label: 'Devnet signer alignment',
    detail: `config not found: ${formatConfigPathForReport(configPath)}`,
  };
}

// ---------------------------------------------------------------------------
// Full alignment check -- combines config parsing + address derivation
// ---------------------------------------------------------------------------

export interface FullAlignmentResult {
  alignment: AlignmentResult;
  miningTargetAlignment: AlignmentResult | null;
  configExists: boolean;
  configPath: string;
  hasTestMnemonic: boolean;
  minerRewardDelay: number | null;
  miningAddress: string | null;
  relayerAddress: string | null;
  miningTarget: string | null;
}

/**
 * Perform the full alignment check.
 * configContent: the raw file content (or null if file missing).
 * miningTarget: from DEVNET_MINING_TARGET env var -- raw pubkey hex (or null if unset).
 * fleetMiningAddress: from DEVNET_FLEET_ADDRESS env var -- P2PK address form of the mining target (or null).
 * networkPrefix: Ergo address prefix (16 = testnet/devnet).
 */
export async function checkSignerAlignment(
  configContent: string | null,
  configPath: string,
  relayerMnemonic: string | null,
  networkPrefix: number = 16,
  miningTarget: string | null = null,
  fleetMiningAddress: string | null = null,
): Promise<FullAlignmentResult> {
  const configExists = configContent !== null;
  const parsed = configExists
    ? parseDevnetConfig(configContent)
    : { hasTestMnemonic: false, minerRewardDelay: null };
  let miningAddress: string | null = null;
  let relayerAddress: string | null = null;

  // Derive mining address from config testMnemonic (internal only)
  if (configContent !== null && parsed.hasTestMnemonic) {
    const testMnemonic = extractTestMnemonic(configContent);
    if (testMnemonic) {
      try {
        miningAddress = await deriveAddressFromMnemonic(testMnemonic, networkPrefix);
      } catch {
        // If derivation fails, leave null
      }
    }
  }

  // Derive relayer address from WALLET_MNEMONIC
  if (relayerMnemonic) {
    try {
      relayerAddress = await deriveAddressFromMnemonic(relayerMnemonic, networkPrefix);
    } catch {
      // If derivation fails, leave null
    }
  }

  // Mining target alignment (the important check).
  // miningTarget is a raw pubkey hex, but we compare the derived address
  // (fleetMiningAddress) against the relayer address for a clean match.
  const effectiveMiningAddress = fleetMiningAddress ?? miningTarget;
  const miningTargetAlignment = miningTarget
    ? classifyMiningTargetAlignment(relayerAddress, effectiveMiningAddress)
    : null;

  return {
    alignment: configExists
      ? classifyAlignment(relayerAddress, miningAddress)
      : classifyConfigMissing(configPath),
    miningTargetAlignment,
    configExists,
    configPath,
    hasTestMnemonic: parsed.hasTestMnemonic,
    minerRewardDelay: parsed.minerRewardDelay,
    miningAddress,
    relayerAddress,
    miningTarget,
  };
}

// ---------------------------------------------------------------------------
// Report formatting -- ASCII only, never prints mnemonic
// ---------------------------------------------------------------------------

export function formatAlignmentReport(result: FullAlignmentResult): string {
  const lines: string[] = [];
  const SEP = '='.repeat(70);

  lines.push(SEP);
  lines.push('  Devnet Signer / Mining Target Check');
  lines.push(SEP);
  lines.push('');
  lines.push(`  Config: ${formatConfigPathForReport(result.configPath)}`);
  lines.push(`  Config exists: ${result.configExists ? 'yes' : 'no'}`);

  if (result.configExists) {
    lines.push(`  testMnemonic field: ${result.hasTestMnemonic ? 'present' : 'not found'}`);
    lines.push(`  minerRewardDelay: ${result.minerRewardDelay ?? 'not found'}`);
  }

  lines.push('');

  if (result.relayerAddress) {
    lines.push(`  Fleet signer address: ${formatIdentifierForReport(result.relayerAddress)}`);
  }
  if (result.miningTarget) {
    lines.push(`  Mining target (DEVNET_MINING_TARGET): ${formatIdentifierForReport(result.miningTarget)}`);
  }
  if (result.miningAddress) {
    lines.push(`  Config-derived address (Fleet path): ${formatIdentifierForReport(result.miningAddress)}`);
  }

  lines.push('');

  // Show mining target alignment first (the important one)
  if (result.miningTargetAlignment) {
    const mtPrefix = result.miningTargetAlignment.status === 'PASS' ? '  [PASS]' : '  [WARN]';
    lines.push(`${mtPrefix} ${result.miningTargetAlignment.label}: ${result.miningTargetAlignment.detail}`);
  } else {
    lines.push('  [INFO] DEVNET_MINING_TARGET not set -- run devnet-auto-env-from-node1.ps1 first');
  }

  // Show config-only alignment as secondary info
  const prefix = result.alignment.status === 'PASS' ? '  [PASS]' : '  [WARN]';
  lines.push(`${prefix} ${result.alignment.label}: ${result.alignment.detail}`);
  lines.push('');
  lines.push('  Do not use node-wallet signing in this workflow.');
  lines.push('');

  return lines.join('\n');
}
