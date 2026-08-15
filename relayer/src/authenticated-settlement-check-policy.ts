export const AUTHENTICATED_SETTLEMENT_CHECK_ENABLED_ENV =
  'AUTHENTICATED_SETTLEMENT_CHECK_ENABLED';

export interface AuthenticatedSettlementCheckPolicyInput {
  checkEnabled: boolean;
  broadcastEnabled: boolean;
  deployedErgoNetwork: string;
  observedErgoNetwork: string;
  sidechainNetwork: string;
  ergoNodeUrl: string;
  signerErgoNodeUrl: string;
  sidechainRpcUrl: string;
}

export function assertAuthenticatedSettlementCheckPolicy(
  input: AuthenticatedSettlementCheckPolicyInput,
): void {
  assertAuthenticatedSettlementCheckStaticPolicy(input);
  assertAuthenticatedSettlementCheckObservedErgoNetwork(
    input.deployedErgoNetwork,
    input.observedErgoNetwork,
  );
}

export function assertAuthenticatedSettlementCheckStaticPolicy(
  input: Omit<AuthenticatedSettlementCheckPolicyInput, 'observedErgoNetwork'>,
): void {
  if (!input.checkEnabled) {
    throw new Error(
      `${AUTHENTICATED_SETTLEMENT_CHECK_ENABLED_ENV}=true is required for local signing and JVM check`,
    );
  }
  if (input.broadcastEnabled) {
    throw new Error('authenticated settlement check requires BRIDGE_BROADCAST_ENABLED to remain false');
  }
  const allowedErgoNetwork = /^(?:testnet|devnet|local|development)$/i;
  const allowedSidechainNetwork = /^(?:testnet|patched-devnet|devnet|local|development)$/i;
  if (!allowedErgoNetwork.test(input.deployedErgoNetwork)) {
    throw new Error('authenticated settlement check requires an explicit non-mainnet Ergo deployment');
  }
  if (!allowedSidechainNetwork.test(input.sidechainNetwork)) {
    throw new Error('authenticated settlement check requires an explicit non-mainnet sidechain');
  }
  assertLoopbackHttpUrl(input.ergoNodeUrl, 'Ergo node', true);
  assertLoopbackHttpUrl(input.signerErgoNodeUrl, 'signer Ergo node', true);
  assertLoopbackHttpUrl(input.sidechainRpcUrl, 'sidechain RPC');
}

export function assertAuthenticatedSettlementCheckObservedErgoNetwork(
  deployedErgoNetwork: string,
  observedErgoNetwork: string,
): void {
  const allowedErgoNetwork = /^(?:testnet|devnet|local|development)$/i;
  if (!allowedErgoNetwork.test(observedErgoNetwork)) {
    throw new Error('authenticated settlement check requires a live non-mainnet Ergo node');
  }
  if (deployedErgoNetwork.toLowerCase() !== observedErgoNetwork.toLowerCase()) {
    throw new Error('authenticated settlement check Ergo deployment and live node networks do not match');
  }
}

function assertLoopbackHttpUrl(value: string, label: string, baseOnly = false): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`authenticated settlement check ${label} must be a loopback HTTP(S) URL`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
    || parsed.username
    || parsed.password
    || (baseOnly && (
      parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
    ))
  ) {
    throw new Error(`authenticated settlement check ${label} must be a loopback HTTP(S) URL`);
  }
}
