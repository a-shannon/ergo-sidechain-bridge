export const AUTHENTICATED_V2_SETUP_CHECK_ENABLED_ENV =
  'AUTHENTICATED_V2_SETUP_CHECK_ENABLED';

export interface AuthenticatedV2SetupCheckPolicyInput {
  checkEnabled: boolean;
  broadcastEnabled: boolean;
  nodeUrl: string;
}

export function assertAuthenticatedV2SetupCheckPolicy(
  input: AuthenticatedV2SetupCheckPolicyInput,
): string {
  if (!input.checkEnabled) {
    throw new Error(
      `${AUTHENTICATED_V2_SETUP_CHECK_ENABLED_ENV}=true is required for local setup signing and JVM checks`,
    );
  }
  if (input.broadcastEnabled) {
    throw new Error('authenticated V2 setup check requires BRIDGE_BROADCAST_ENABLED to remain false');
  }
  let parsed: URL;
  try {
    parsed = new URL(input.nodeUrl);
  } catch {
    throw new Error('authenticated V2 setup check node must be a loopback HTTP(S) root URL');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('authenticated V2 setup check node must be a loopback HTTP(S) root URL');
  }
  return parsed.origin;
}
