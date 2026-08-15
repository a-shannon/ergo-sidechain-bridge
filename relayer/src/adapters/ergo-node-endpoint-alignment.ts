export interface ErgoNodeEndpointAlignmentInput {
  ergoNode: string;
  ergoNodeUrl: string;
}

export interface ErgoNodeEndpointAlignment {
  ergoNodeOrigin: string;
  ergoNodeUrlOrigin: string;
}

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase();
}

function canonicalPort(parsed: URL): string {
  if (parsed.port) return parsed.port;
  if (parsed.protocol === 'http:') return '80';
  if (parsed.protocol === 'https:') return '443';
  return '';
}

export function canonicalNodeOrigin(raw: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL, got "${raw}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https, got "${raw}"`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include URL credentials`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTP(S) origin without a path, query, or fragment`);
  }

  const port = canonicalPort(parsed);
  const portSuffix = port ? `:${port}` : '';
  return `${parsed.protocol}//${canonicalHost(parsed.hostname)}${portSuffix}`;
}

export function assertErgoNodeEndpointAlignment(
  label: string,
  input: ErgoNodeEndpointAlignmentInput,
): ErgoNodeEndpointAlignment {
  const ergoNodeOrigin = canonicalNodeOrigin(input.ergoNode, 'ERGO_NODE');
  const ergoNodeUrlOrigin = canonicalNodeOrigin(input.ergoNodeUrl, 'ERGO_NODE_URL');

  if (ergoNodeOrigin !== ergoNodeUrlOrigin) {
    throw new Error(
      `${label}: ERGO_NODE and ERGO_NODE_URL target different Ergo node origins ` +
      `(${ergoNodeOrigin} vs ${ergoNodeUrlOrigin}). Set both to the same node ` +
      `before preparing, signing, checking, or submitting settlement transactions.`,
    );
  }

  return { ergoNodeOrigin, ergoNodeUrlOrigin };
}
