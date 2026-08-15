const hex32Pattern = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?=$|[^0-9a-fA-F])/g;

export const bridgeEventRootPlaceholder = '<bridgeEventRootHex>';

export function normalizeBridgeEventRootHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.slice(2)
    : trimmed;
  return /^[0-9a-fA-F]{64}$/.test(normalized) ? normalized.toLowerCase() : undefined;
}

export function extractBridgeEventRootHexes(value: string): string[] {
  hex32Pattern.lastIndex = 0;
  return [...value.matchAll(hex32Pattern)].map(match => match[1].toLowerCase());
}

export function formatBridgeEventRootCsv(values: readonly string[]): string {
  return values.map(value => normalizeBridgeEventRootHex(value) ?? value).join(',');
}

export function formatBridgeEventRootCsvOrPlaceholder(values: readonly string[]): string {
  return values.length > 0 ? formatBridgeEventRootCsv(values) : bridgeEventRootPlaceholder;
}

export function bridgeEventRootsFromClaims(
  claims: readonly { bridgeEventRootHex?: string }[],
): string[] {
  return claims.map(claim => normalizeBridgeEventRootHex(claim.bridgeEventRootHex) ?? bridgeEventRootPlaceholder);
}

export function concreteBridgeEventRootsFromClaims(
  claims: readonly { bridgeEventRootHex?: string }[],
): string[] {
  return claims.flatMap(claim => {
    const normalized = normalizeBridgeEventRootHex(claim.bridgeEventRootHex);
    return normalized === undefined ? [] : [normalized];
  });
}

export function sameOrderedBridgeEventRoots(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined || left.length !== right.length) return false;
  return left.every((value, index) => {
    const normalizedLeft = normalizeBridgeEventRootHex(value);
    const normalizedRight = normalizeBridgeEventRootHex(right[index]);
    return normalizedLeft !== undefined && normalizedRight !== undefined && normalizedLeft === normalizedRight;
  });
}
