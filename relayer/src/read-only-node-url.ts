const credentialQueryParameters = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'auth_token',
  'authorization',
  'client_secret',
  'id_token',
  'key',
  'password',
  'refresh_token',
  'secret',
  'token',
]);

export function validateReadOnlyNodeUrl(nodeUrl: string | undefined, label: string): string[] {
  if (!nodeUrl) return [];

  let parsed: URL;
  try {
    parsed = new URL(nodeUrl);
  } catch {
    return [`${label} must be a valid http(s) URL`];
  }

  if (!new Set(['http:', 'https:']).has(parsed.protocol)) {
    return [`${label} must be a valid http(s) URL`];
  }
  if (parsed.username || parsed.password || hasCredentialQueryParameter(parsed.searchParams)) {
    return [`${label} must not include credentials or credential query parameters`];
  }
  if (hasInternalTestEndpointMarker(parsed)) {
    return [`${label} must cite a concrete read-only endpoint, not an internal fixture/mock/dummy/fake/stub/testdata/synthetic/simulated URL`];
  }

  return [];
}

function hasCredentialQueryParameter(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    const normalized = key.trim().toLowerCase().replace(/[-.]/g, '_');
    if (credentialQueryParameters.has(normalized)) return true;
  }
  return false;
}

function hasInternalTestEndpointMarker(url: URL): boolean {
  const searchable = `${url.hostname}/${url.pathname}/${url.search}`.toLowerCase();
  return /(?:^|[-_.\/?&=])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.\/?&=]|$)/i.test(searchable);
}
