import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PEG_IN_MINT_NO_TRANSPORT_DRILL_SCHEMA =
  'e2s.peg-in-mint-runtime-retirement-drill.v3' as const;

type DrillCase =
  | 'daemon-composition'
  | 'transition-hold'
  | 'client-methods'
  | 'adapter-capability'
  | 'core-executor'
  | 'historical-confirmation'
  | 'claim-boundaries'
  | 'retired-files';

export interface PegInMintNoTransportDrillReport {
  readonly schema: typeof PEG_IN_MINT_NO_TRANSPORT_DRILL_SCHEMA;
  readonly result: 'PASS';
  readonly cases: readonly DrillCase[];
  readonly transportCalls: 0;
  readonly activeDaemonOwnerMintInitiationPresent: false;
  readonly historicalConfirmationRetained: true;
  readonly standaloneFixtureMintScriptPresent: false;
  readonly sidechainClientObservationOnly: true;
  readonly onChainOwnerEntrypointPresent: true;
  readonly v4ActivationProven: false;
  readonly fundsAuthority: false;
  readonly realSignerUsed: false;
  readonly networkUsed: false;
  readonly deploymentStateRead: false;
}

const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const srcRoot = resolve(scriptDirectory, '..');
const relayerRoot = resolve(srcRoot, '..');
const bridgeRoot = resolve(relayerRoot, '..');

function source(path: string): string {
  return readFileSync(resolve(bridgeRoot, path), 'utf8');
}

function requireText(path: string, text: string): void {
  if (!source(path).includes(text)) {
    throw new Error(`${path} lacks required retirement boundary: ${text}`);
  }
}

function rejectText(path: string, patterns: readonly RegExp[]): void {
  const contents = source(path);
  for (const pattern of patterns) {
    if (pattern.test(contents)) {
      throw new Error(
        `${path} retains retired owner-mint capability matching ${pattern.source}`,
      );
    }
  }
}

export async function runPegInMintNoTransportDrill():
Promise<PegInMintNoTransportDrillReport> {
  rejectText('relayer/src/relayer-daemon.ts', [
    /runPegInMintTransport/u,
    /executeMintTransport/u,
    /submitPegInMint/u,
    /this\.sidechain\.provider/u,
  ]);
  requireText(
    'relayer/src/peg-in-transition.ts',
    'legacy owner-mint execution is retired',
  );
  rejectText('relayer/src/peg-in-transition.ts', [
    /executeMintTransport/u,
    /executePegInMintTransport/u,
    /startFundsReleaseTransport/u,
  ]);
  rejectText('relayer/src/sidechain-client.ts', [
    /ethers\.Wallet/u,
    /relayerPrivateKey/u,
    /assertSidechainBroadcastAllowed/u,
    /updateErgoState\s*\(/u,
    /submitPegInMint/u,
    /signPegInMintEnvelope/u,
    /buildPegInMintEnvelope/u,
    /observePegInMintTarget/u,
    /mintSERG\s*\(/u,
    /public readonly provider/u,
    /this\.provider/u,
  ]);
  rejectText('relayer/src/sidechain-contract-abi.ts', [
    /mintSERG/u,
    /updateErgoState/u,
  ]);
  requireText(
    'relayer/src/sidechain-client.ts',
    'historical observation only',
  );
  rejectText('relayer/src/adapters/peg-in-mint-confirmation.ts', [
    /ethers\.Wallet/u,
    /signTransaction/u,
    /broadcastTransaction/u,
    /mintSERG/u,
  ]);
  requireText(
    'relayer/src/adapters/peg-in-mint-confirmation.ts',
    'observeFrontierPegInMintTransportConfirmation',
  );
  rejectText('relayer/src/relayer-core/peg-in-mint-transport-lifecycle.ts', [
    /executePegInMintTransport/u,
    /PegInMintTransportPorts/u,
    /PegInMintPreTransportAdmission/u,
  ]);
  for (const path of [
    'relayer/src/adapters/peg-in-mint-transport.ts',
    'relayer/src/apps/bridge-daemon/peg-in-mint-transport.ts',
  ]) {
    if (existsSync(resolve(bridgeRoot, path))) {
      throw new Error(`${path} must remain retired`);
    }
  }
  requireText('solidity/ErgoBridge.sol', 'function mintSERG');
  rejectText('relayer/src/scripts/spikes/spike5-frontier-pegout-extraction.ts', [
    /dotenv\/config/u,
    /ethers\.Wallet/u,
    /ContractFactory/u,
    /relayerPrivateKey/u,
    /assertSidechainBroadcastAllowed/u,
    /mintSERG/u,
    /transferOwnership/u,
    /\.deploy\s*\(/u,
    /\.approve\s*\(/u,
    /\.pegOut\s*\(/u,
  ]);

  const cases: readonly DrillCase[] = Object.freeze([
    'daemon-composition',
    'transition-hold',
    'client-methods',
    'adapter-capability',
    'core-executor',
    'historical-confirmation',
    'claim-boundaries',
    'retired-files',
  ]);
  return Object.freeze({
    schema: PEG_IN_MINT_NO_TRANSPORT_DRILL_SCHEMA,
    result: 'PASS',
    cases,
    transportCalls: 0,
    activeDaemonOwnerMintInitiationPresent: false,
    historicalConfirmationRetained: true,
    standaloneFixtureMintScriptPresent: false,
    sidechainClientObservationOnly: true,
    onChainOwnerEntrypointPresent: true,
    v4ActivationProven: false,
    fundsAuthority: false,
    realSignerUsed: false,
    networkUsed: false,
    deploymentStateRead: false,
  });
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  console.log(JSON.stringify(
    await runPegInMintNoTransportDrill(),
    null,
    2,
  ));
}
