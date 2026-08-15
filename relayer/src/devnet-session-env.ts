/**
 * Pure helpers for devnet session environment validation.
 *
 * No I/O, no process.exit(), no signing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvCheckResult {
  status: 'PASS' | 'WARN';
  label: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Node URL alignment
// ---------------------------------------------------------------------------

export function checkNodeUrlAlignment(
  ergoNode?: string,
  ergoNodeUrl?: string,
  patchedUrl?: string,
): EnvCheckResult {
  const values = [ergoNode, ergoNodeUrl, patchedUrl].filter(Boolean);

  if (values.length === 0) {
    return {
      status: 'WARN',
      label: 'Node URLs',
      detail: 'none of ERGO_NODE, ERGO_NODE_URL, PATCHED_ERGO_NODE_URL are set',
    };
  }

  const unique = new Set(values.map(v => v!.replace(/\/+$/, '')));
  if (unique.size === 1) {
    const missing: string[] = [];
    if (!ergoNode) missing.push('ERGO_NODE');
    if (!ergoNodeUrl) missing.push('ERGO_NODE_URL');
    if (!patchedUrl) missing.push('PATCHED_ERGO_NODE_URL');

    if (missing.length > 0) {
      return {
        status: 'WARN',
        label: 'Node URLs',
        detail: `aligned to ${values[0]} but missing: ${missing.join(', ')}`,
      };
    }
    return {
      status: 'PASS',
      label: 'Node URLs',
      detail: `all aligned to ${values[0]}`,
    };
  }

  return {
    status: 'WARN',
    label: 'Node URLs',
    detail: `mismatched: ERGO_NODE=${ergoNode ?? '(unset)'}, ERGO_NODE_URL=${ergoNodeUrl ?? '(unset)'}, PATCHED=${patchedUrl ?? '(unset)'}`,
  };
}

// ---------------------------------------------------------------------------
// Batch config
// ---------------------------------------------------------------------------

export function checkBatchEnabled(value?: string): EnvCheckResult {
  if (!value) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_BATCH_ENABLED',
      detail: 'not set (batch path disabled)',
    };
  }
  if (value.toLowerCase() === 'true') {
    return {
      status: 'PASS',
      label: 'AGGREGATE_BATCH_ENABLED',
      detail: 'true',
    };
  }
  return {
    status: 'WARN',
    label: 'AGGREGATE_BATCH_ENABLED',
    detail: `set to "${value}" (expected "true" for devnet e2e)`,
  };
}

export function checkBatchMaxClaims(value?: string): EnvCheckResult {
  if (!value) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_BATCH_MAX_CLAIMS',
      detail: 'not set (will use default)',
    };
  }
  const n = parseInt(value, 10);
  if (isNaN(n)) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_BATCH_MAX_CLAIMS',
      detail: `invalid value: "${value}"`,
    };
  }
  if (n > 10) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_BATCH_MAX_CLAIMS',
      detail: `${n} exceeds contract maximum of 10`,
    };
  }
  return {
    status: 'PASS',
    label: 'AGGREGATE_BATCH_MAX_CLAIMS',
    detail: `${n}`,
  };
}

// ---------------------------------------------------------------------------
// Anchor confirmations
// ---------------------------------------------------------------------------

export function checkMinConfirmations(value?: string): EnvCheckResult {
  if (!value) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_ANCHOR_MIN_CONFIRMATIONS',
      detail: 'not set (will use default, which may be too high for devnet)',
    };
  }
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_ANCHOR_MIN_CONFIRMATIONS',
      detail: `invalid value: "${value}"`,
    };
  }
  if (n > 10) {
    return {
      status: 'WARN',
      label: 'AGGREGATE_ANCHOR_MIN_CONFIRMATIONS',
      detail: `${n} is high for devnet -- consider lowering for faster testing`,
    };
  }
  return {
    status: 'PASS',
    label: 'AGGREGATE_ANCHOR_MIN_CONFIRMATIONS',
    detail: `${n}`,
  };
}

// ---------------------------------------------------------------------------
// Signer presence (no mnemonic exposure)
// ---------------------------------------------------------------------------

export function checkSecretMaterialInspection(includeSecretMaterial: boolean): EnvCheckResult {
  if (includeSecretMaterial) {
    return {
      status: 'WARN',
      label: 'Secret material inspection',
      detail: 'enabled by explicit --include-secret-material flag for local devnet only',
    };
  }
  return {
    status: 'WARN',
    label: 'Secret material inspection',
    detail: 'disabled by default -- no mnemonic env values or node config files are read',
  };
}

export function checkSignerPresence(hasMnemonic: boolean): EnvCheckResult {
  if (hasMnemonic) {
    return {
      status: 'PASS',
      label: 'WALLET_MNEMONIC',
      detail: 'set (value not shown)',
    };
  }
  return {
    status: 'WARN',
    label: 'WALLET_MNEMONIC',
    detail: 'not set -- relayer cannot sign transactions',
  };
}

// ---------------------------------------------------------------------------
// Signer alignment (address comparison)
// ---------------------------------------------------------------------------

export function checkSignerMatch(
  relayerAddress: string | null,
  miningAddress: string | null,
): EnvCheckResult {
  if (!relayerAddress) {
    return {
      status: 'WARN',
      label: 'Signer/mining alignment',
      detail: 'cannot check -- WALLET_MNEMONIC not set',
    };
  }
  if (!miningAddress) {
    return {
      status: 'WARN',
      label: 'Signer/mining alignment',
      detail: 'cannot check -- no mining address from config',
    };
  }
  if (relayerAddress === miningAddress) {
    return {
      status: 'PASS',
      label: 'Signer/mining alignment',
      detail: `addresses match: ${relayerAddress}`,
    };
  }
  return {
    status: 'WARN',
    label: 'Signer/mining alignment',
    detail: `mismatch -- relayer: ${relayerAddress}, mining: ${miningAddress}`,
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

export function formatEnvCheckReport(results: EnvCheckResult[]): string {
  const lines: string[] = [];
  const SEP = '='.repeat(70);

  lines.push(SEP);
  lines.push('  Devnet Session Environment Check');
  lines.push(SEP);
  lines.push('');

  for (const r of results) {
    const prefix = r.status === 'PASS' ? '  [PASS]' : '  [WARN]';
    lines.push(`${prefix} ${r.label}: ${r.detail}`);
  }

  lines.push('');

  const passCount = results.filter(r => r.status === 'PASS').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;

  if (warnCount === 0) {
    lines.push('  RESULT: ALL CHECKS PASS -- ready for devnet session');
  } else {
    lines.push(`  RESULT: ${passCount} PASS, ${warnCount} WARN -- resolve warnings before execution`);
  }

  lines.push('');
  lines.push('  Do not use node-wallet signing in this workflow.');
  lines.push('');

  return lines.join('\n');
}
