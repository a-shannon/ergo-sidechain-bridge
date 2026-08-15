import type { PreflightCheck } from './batch-demo-preflight.js';

export function classifyLegacyOwnerMintDeploymentMetadata(
  solidity: unknown,
): PreflightCheck {
  if (!isRecord(solidity)) {
    return {
      name: 'Solidity addresses',
      status: 'FAIL',
      message:
        'deployment metadata has no Solidity profile; the legacy owner-mint route is retired and a reviewed activated profile is required',
    };
  }
  const sergAddress = nonemptyString(solidity.sergAddress);
  const bridgeAddress = nonemptyString(solidity.bridgeAddress);
  if (sergAddress && bridgeAddress) {
    return {
      name: 'Solidity addresses',
      status: 'FAIL',
      message:
        `historical owner-mint profile present: SERG=${abbreviate(sergAddress)}, Bridge=${abbreviate(bridgeAddress)}; a reviewed activated profile is required`,
    };
  }
  const missing = [
    !sergAddress && 'sergAddress',
    !bridgeAddress && 'bridgeAddress',
  ].filter((value): value is string => Boolean(value));
  return {
    name: 'Solidity addresses',
    status: 'FAIL',
    message: `historical Solidity profile is incomplete; missing: ${missing.join(', ')}`,
  };
}

export function classifyLegacyOwnerMintRuntimeCode(input: Readonly<{
  label: string;
  address: string;
  code: string | null | undefined;
}>): PreflightCheck {
  const hasCode = typeof input.code === 'string'
    && input.code !== '0x'
    && input.code.length > 2;
  return {
    name: input.label,
    status: 'FAIL',
    message: hasCode
      ? `historical owner-mint code observed (${input.code!.length} chars) at ${abbreviate(input.address)}; it cannot satisfy readiness`
      : `no code at ${input.address}; the legacy owner-mint route is retired and a reviewed activated profile is required`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function abbreviate(value: string): string {
  return value.length > 10 ? `${value.slice(0, 10)}...` : value;
}
