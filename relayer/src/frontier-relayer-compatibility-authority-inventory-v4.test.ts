import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it, vi } from 'vitest';

const processProvenance = vi.hoisted(() => {
  const deploymentIdentities = new WeakSet<object>();
  const deploymentLineages = new WeakSet<object>();
  const runtimeProfiles = new WeakSet<object>();
  return {
    deploymentIdentities,
    deploymentLineages,
    runtimeProfiles,
    assertDeploymentIdentity(value: unknown): void {
      if (!value || typeof value !== 'object' || !deploymentIdentities.has(value)) {
        throw new Error('deployment identity candidate provenance is missing');
      }
    },
    assertDeploymentLineage(value: unknown): void {
      if (!value || typeof value !== 'object' || !deploymentLineages.has(value)) {
        throw new Error('authority-bound deployment-lineage provenance is missing');
      }
    },
    assertRuntimeProfile(value: unknown): void {
      if (!value || typeof value !== 'object' || !runtimeProfiles.has(value)) {
        throw new Error(
          'pooled-reserve mint-reservation runtime-profile candidate was not built in this process',
        );
      }
    },
  };
});

vi.mock('./read-only-deployment-identity-observer.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./read-only-deployment-identity-observer.js')
  >();
  return {
    ...actual,
    assertDeploymentIdentityCandidateProvenance:
      processProvenance.assertDeploymentIdentity,
  };
});

vi.mock('./authority-bound-deployment-lineage.js', () => {
  return {
    assertAuthorityBoundDeploymentLineageProvenance:
      processProvenance.assertDeploymentLineage,
  };
});

vi.mock(
  './pooled-reserve-mint-reservation-runtime-profile-v4.js',
  () => {
    return {
      assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance:
        processProvenance.assertRuntimeProfile,
    };
  },
);

import type {
  AuthorityBoundDeploymentLineageCandidate,
} from './authority-bound-deployment-lineage.js';
import {
  assertFrontierRelayerCompatibilityAuthoritySourceBoundaryV4,
  assertRetiredPegInCommitmentRuntimeSourcesV4,
  assertRetiredOperationalSubmissionRuntimeSourceV4,
  assertExactFrontierRelayerCompatibilityRouteInventoryV4,
  assertLegacyErgoBridgeStateMutatingAbiInventoryV4,
  assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance,
  buildFrontierRelayerCompatibilityAuthorityInventoryV4,
  FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS,
  FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
  type BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input,
} from './frontier-relayer-compatibility-authority-inventory-v4.js';
import type {
  PooledReserveMintReservationRuntimeProfileV4Candidate,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  loadTrackedDeploymentIdentityArtifactProfile,
  type DeploymentIdentityArtifactProfile,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import {
  INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_DIGEST_HEX,
} from './reviewed-deployment-lineage-profiles.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const BRIDGE_ADDRESS = `0x${'11'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'22'.repeat(20)}`;
const BRIDGE_OWNER = `0x${'33'.repeat(20)}`;

let artifactProfile: DeploymentIdentityArtifactProfile;

beforeAll(() => {
  artifactProfile = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);
});

describe('Frontier/relayer compatibility authority inventory V4', () => {
  it('enumerates the exact seventeen compatibility routes', () => {
    assertExactFrontierRelayerCompatibilityRouteInventoryV4(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
    );
    expect(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4
        .map(route => route.routeId),
    ).toEqual([
      'frontier-ergo-bridge-owner-mint-v1',
      'frontier-serg-owner-mint-v1',
      'frontier-ergo-bridge-fee-withdrawal-v1',
      'frontier-ergo-bridge-state-update-v1',
      'frontier-ergo-bridge-emergency-pause-v1',
      'frontier-ergo-bridge-unpause-v1',
      'frontier-ergo-bridge-peg-out-v1',
      'frontier-serg-bridge-burn-v1',
      'frontier-ergo-bridge-renounce-ownership-v1',
      'frontier-ergo-bridge-transfer-ownership-v1',
      'frontier-serg-renounce-ownership-v1',
      'frontier-serg-transfer-ownership-v1',
      'frontier-root-bridge-address-mutation-v1',
      'frontier-v1-bridge-event-producer-v1',
      'relayer-owner-mint-entrypoint-v1',
      'relayer-legacy-settlement-entrypoint-v1',
      'relayer-side-chain-state-updater-v1',
    ]);
    expect(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4
        .filter(route =>
          route.routeClass === 'authority-mutation'
          && (
            route.historicalAuthority === 'owner-key'
            || route.historicalAuthority === 'token-owner-key'
          )
      ),
    ).toHaveLength(4);
    expect(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.find(
        route => route.routeId === 'frontier-ergo-bridge-peg-out-v1',
      ),
    ).toMatchObject({
      routeClass: 'bridge-withdrawal',
      sourceSurface: 'solidity/ErgoBridge.sol::pegOut(uint256,bytes)',
      historicalAuthority: 'permissionless-caller',
      requiredDisposition: 'application-bind-or-remove',
    });
    expect(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.find(
        route => route.routeId === 'relayer-owner-mint-entrypoint-v1',
      ),
    ).toMatchObject({
      sourceSurface:
        'relayer/src/peg-in-transition.ts::legacy owner-mint execution is retired',
      requiredDisposition: 'remove-runtime-capability',
    });
    expect(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.find(
        route => route.routeId === 'relayer-legacy-settlement-entrypoint-v1',
      ),
    ).toMatchObject({
      sourceSurface:
        'relayer/src/aggregate-settlement-service.ts::legacy aggregate submission',
      requiredDisposition: 'remove-runtime-capability',
    });
    expect(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.find(
        route => route.routeId === 'relayer-side-chain-state-updater-v1',
      ),
    ).toMatchObject({
      sourceSurface:
        'relayer/src/sidechain-state-updater.ts::SideChainStateUpdater',
      requiredDisposition: 'remove-runtime-capability',
    });
  });

  it('derives every legacy ErgoBridge state-mutating surface from the tracked ABI', () => {
    const abi = JSON.parse(readFileSync(
      resolve(BRIDGE_ROOT, 'solidity/compiled/ErgoBridge.abi'),
      'utf8',
    ));
    expect(() =>
      assertLegacyErgoBridgeStateMutatingAbiInventoryV4(
        abi,
        FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
      )
    ).not.toThrow();

    const omittedPegOut = FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4
      .filter(route => route.routeId !== 'frontier-ergo-bridge-peg-out-v1');
    expect(() =>
      assertLegacyErgoBridgeStateMutatingAbiInventoryV4(abi, omittedPegOut)
    ).toThrow(/must match every exact legacy route/i);

    const widenedAbi = structuredClone(abi);
    widenedAbi.push({
      inputs: [],
      name: 'unreviewedMutation',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    });
    expect(() =>
      assertLegacyErgoBridgeStateMutatingAbiInventoryV4(
        widenedAbi,
        FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
      )
    ).toThrow(/must match every exact legacy route/i);
  });

  it.each(['fallback', 'receive'] as const)(
    'rejects an unclassified %s ABI surface',
    surfaceType => {
      const abi = JSON.parse(readFileSync(
        resolve(BRIDGE_ROOT, 'solidity/compiled/ErgoBridge.abi'),
        'utf8',
      ));
      abi.push({ stateMutability: 'payable', type: surfaceType });
      expect(() =>
        assertLegacyErgoBridgeStateMutatingAbiInventoryV4(
          abi,
          FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
        )
      ).toThrow(/unclassified fallback or receive surface/i);
    },
  );

  it('fails closed when one Ownable mutation route is missing', () => {
    const incomplete = [
      ...structuredClone(
        FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4,
      ),
    ];
    incomplete.splice(
      incomplete.findIndex(route =>
        route.routeId === 'frontier-serg-transfer-ownership-v1'
      ),
      1,
    );
    expect(() =>
      assertExactFrontierRelayerCompatibilityRouteInventoryV4(incomplete)
    ).toThrow(/enumerate every exact route/i);
  });

  it('separates Root mutation from V1 commitment production', () => {
    const rootMutation =
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.find(route =>
        route.routeId === 'frontier-root-bridge-address-mutation-v1'
      );
    const producer =
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_ROUTES_V4.find(route =>
        route.routeId === 'frontier-v1-bridge-event-producer-v1'
      );
    expect(rootMutation).toMatchObject({
      historicalAuthority: 'root-origin',
      routeClass: 'authority-mutation',
      requiredDisposition: 'freeze-authority',
    });
    expect(producer).toMatchObject({
      historicalAuthority: 'selected-bridge-address',
      routeClass: 'commitment-producer',
      requiredDisposition: 'application-bind-or-remove',
    });
    expect(rootMutation?.routeId).not.toBe(producer?.routeId);
    expect(rootMutation?.sourceSurface).not.toBe(producer?.sourceSurface);
  });

  it('emits one blocked packet for zero activation and the inert profile', () => {
    const fixture = candidateFixture();
    const packet =
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(fixture.input);

    expect(packet.status).toBe(
      FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS,
    );
    expect(packet.observations.runtimeActivation).toBe(
      'zero-height-candidate',
    );
    expect(packet.observations.reviewedDeploymentLineageProfile).toBe(
      'inert-conformance-profile',
    );
    expect(packet.blockers).toContain('v4-activation-height-is-zero');
    expect(packet.blockers).toContain(
      'deployment-lineage-profile-is-inert-conformance-only',
    );
    expect(packet.routes).toHaveLength(17);
    expect(packet.routes.find(route =>
      route.routeId === 'frontier-ergo-bridge-peg-out-v1'
    )).toMatchObject({
      reachability: 'reachable-at-exact-state',
      retirement: 'blocked-external-evidence',
      blockers: ['legacy-pegout-application-binding-is-not-authenticated'],
    });
    expect(packet.checks.everyRouteSourceSurfaceBound).toBe(true);
    const boundSourcePaths = new Set(
      packet.sourceClosure.files.map(file => file.path),
    );
    for (const path of [
      'relayer/src/adapters/peg-in-mint-confirmation.ts',
      'relayer/src/ergo-client.ts',
      'relayer/src/fleet-signer.ts',
      'relayer/src/peg-in-transition.ts',
      'relayer/src/relayer-core/peg-in-mint-transport-lifecycle.ts',
    ]) {
      expect(boundSourcePaths).toContain(path);
    }
    expect(packet.sourceClosure.absentFiles).toContain(
      'relayer/src/sidechain-state-updater.ts',
    );
    expect(packet.sourceClosure.absentFiles).toContain(
      'relayer/src/ergo-operational-transaction-compatibility.ts',
    );
    const boundOrAbsentSourcePaths = new Set([
      ...boundSourcePaths,
      ...packet.sourceClosure.absentFiles,
    ]);
    expect(
      packet.routes.every(route =>
        boundOrAbsentSourcePaths.has(route.sourceSurface.split('::', 1)[0])
      ),
    ).toBe(true);
    expect(packet.packetDigestHex).toMatch(/^0x[0-9a-f]{64}$/);
    assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance(packet);
  });

  it('rejects cloned input and packet provenance', () => {
    const fixture = candidateFixture();
    for (const [field, clone, expected] of [
      [
        'deploymentIdentity',
        structuredClone(fixture.deploymentIdentity),
        /deployment identity candidate provenance is missing/i,
      ],
      [
        'deploymentLineage',
        structuredClone(fixture.deploymentLineage),
        /deployment-lineage provenance is missing/i,
      ],
      [
        'runtimeProfile',
        structuredClone(fixture.runtimeProfile),
        /runtime-profile candidate was not built in this process/i,
      ],
    ] as const) {
      expect(() =>
        buildFrontierRelayerCompatibilityAuthorityInventoryV4({
          ...fixture.input,
          [field]: clone,
        })
      ).toThrow(expected);
    }

    const packet =
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(fixture.input);
    expect(() =>
      assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance(
        structuredClone(packet),
      )
    ).toThrow(/inventory provenance is missing/i);
  });

  it('binds runtime removal and the separate deployment capabilities', () => {
    const fixture = candidateFixture();
    const packet =
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(fixture.input);
    const retiredSettlementPath = resolve(
      BRIDGE_ROOT,
      'relayer/src/legacy-aggregate-settlement-execution.ts',
    );
    const retiredStateUpdaterPath = resolve(
      BRIDGE_ROOT,
      'relayer/src/sidechain-state-updater.ts',
    );
    const retiredPegInTriggerPath = resolve(
      BRIDGE_ROOT,
      'relayer/src/scripts/trigger-peg-in.ts',
    );
    const retiredOperationalCompatibilityPath = resolve(
      BRIDGE_ROOT,
      'relayer/src/ergo-operational-transaction-compatibility.ts',
    );
    expect(packet.sourceClosure.absentFiles).toEqual([
      'relayer/dist/ergo-operational-transaction-compatibility.d.ts',
      'relayer/dist/ergo-operational-transaction-compatibility.d.ts.map',
      'relayer/dist/ergo-operational-transaction-compatibility.js',
      'relayer/dist/ergo-operational-transaction-compatibility.js.map',
      'relayer/dist/ergo-operational-transaction-compatibility.test.d.ts',
      'relayer/dist/ergo-operational-transaction-compatibility.test.d.ts.map',
      'relayer/dist/ergo-operational-transaction-compatibility.test.js',
      'relayer/dist/ergo-operational-transaction-compatibility.test.js.map',
      'relayer/dist/scripts/redeploy-mcl.d.ts',
      'relayer/dist/scripts/redeploy-mcl.d.ts.map',
      'relayer/dist/scripts/redeploy-mcl.js',
      'relayer/dist/scripts/redeploy-mcl.js.map',
      'relayer/dist/scripts/test-dup-e2e.d.ts',
      'relayer/dist/scripts/test-dup-e2e.d.ts.map',
      'relayer/dist/scripts/test-dup-e2e.js',
      'relayer/dist/scripts/test-dup-e2e.js.map',
      'relayer/dist/scripts/trigger-peg-in.d.ts',
      'relayer/dist/scripts/trigger-peg-in.d.ts.map',
      'relayer/dist/scripts/trigger-peg-in.js',
      'relayer/dist/scripts/trigger-peg-in.js.map',
      'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.d.ts',
      'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.d.ts.map',
      'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.js',
      'relayer/dist/scripts/spikes/spike2c-ergoscript-context-eval.js.map',
      'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.d.ts',
      'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.d.ts.map',
      'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.js',
      'relayer/dist/scripts/spikes/spike3c-avl-tracker-eval.js.map',
      'relayer/dist/scripts/spikes/spike4-dup-batched-insert.d.ts',
      'relayer/dist/scripts/spikes/spike4-dup-batched-insert.d.ts.map',
      'relayer/dist/scripts/spikes/spike4-dup-batched-insert.js',
      'relayer/dist/scripts/spikes/spike4-dup-batched-insert.js.map',
      'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.d.ts',
      'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.d.ts.map',
      'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.js',
      'relayer/dist/scripts/spikes/spike8-spv-tracker-contract-eval.js.map',
      'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.d.ts',
      'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.d.ts.map',
      'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.js',
      'relayer/dist/scripts/spikes/spike9-aggregate-settlement-eval.js.map',
      'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.d.ts',
      'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.d.ts.map',
      'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.js',
      'relayer/dist/scripts/spikes/spike10-aggregate-payout-eval.js.map',
      'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.d.ts',
      'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.d.ts.map',
      'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.js',
      'relayer/dist/scripts/spikes/spike11-multi-claim-aggregate.js.map',
      'relayer/src/ergo-operational-transaction-compatibility.ts',
      'relayer/src/legacy-aggregate-settlement-execution.ts',
      'relayer/src/scripts/deploy.ts',
      'relayer/src/scripts/redeploy-dup.ts',
      'relayer/src/scripts/redeploy-mcl.ts',
      'relayer/src/scripts/redeploy-scs.ts',
      'relayer/src/scripts/test-dup-e2e.ts',
      'relayer/src/scripts/trigger-peg-in.ts',
      'relayer/src/scripts/spikes/spike2c-ergoscript-context-eval.ts',
      'relayer/src/scripts/spikes/spike3c-avl-tracker-eval.ts',
      'relayer/src/scripts/spikes/spike4-dup-batched-insert.ts',
      'relayer/src/scripts/spikes/spike8-spv-tracker-contract-eval.ts',
      'relayer/src/scripts/spikes/spike9-aggregate-settlement-eval.ts',
      'relayer/src/scripts/spikes/spike10-aggregate-payout-eval.ts',
      'relayer/src/scripts/spikes/spike11-multi-claim-aggregate.ts',
      'relayer/src/sidechain-state-updater.ts',
    ]);
    expect(existsSync(retiredSettlementPath)).toBe(false);
    expect(existsSync(retiredOperationalCompatibilityPath)).toBe(false);
    expect(existsSync(retiredStateUpdaterPath)).toBe(false);
    expect(existsSync(retiredPegInTriggerPath)).toBe(false);
    for (const artifact of [
      'redeploy-mcl.d.ts',
      'redeploy-mcl.d.ts.map',
      'redeploy-mcl.js',
      'redeploy-mcl.js.map',
    ]) {
      expect(
        existsSync(resolve(BRIDGE_ROOT, 'relayer/dist/scripts', artifact)),
      ).toBe(false);
    }
    expect(
      existsSync(resolve(BRIDGE_ROOT, 'relayer/src/scripts/deploy.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(BRIDGE_ROOT, 'relayer/src/scripts/redeploy-dup.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(BRIDGE_ROOT, 'relayer/src/scripts/redeploy-mcl.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(BRIDGE_ROOT, 'relayer/src/scripts/redeploy-scs.ts')),
    ).toBe(false);
    for (const artifact of [
      'trigger-peg-in.d.ts',
      'trigger-peg-in.d.ts.map',
      'trigger-peg-in.js',
      'trigger-peg-in.js.map',
    ]) {
      expect(
        existsSync(resolve(BRIDGE_ROOT, 'relayer/dist/scripts', artifact)),
      ).toBe(false);
    }

    const fleetSignerSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/fleet-signer.ts'),
      'utf8',
    );
    const ergoClientSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/ergo-client.ts'),
      'utf8',
    );
    expect(fleetSignerSource).toContain(
      'export async function signTransactionForSubmission(',
    );
    expect(fleetSignerSource).not.toContain(
      'export async function signAndSubmit(',
    );
    expect(fleetSignerSource).not.toContain(
      'export async function signAndSubmitDetailed(',
    );
    expect(ergoClientSource).not.toContain('async submitTransaction(');

    const pegInSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/peg-in-transition.ts'),
      'utf8',
    );
    expect(pegInSource).toContain('legacy owner-mint execution is retired');
    expect(pegInSource).not.toContain('sidechain.mintSERG');
    expect(pegInSource).not.toContain('executeMintTransport');

    const daemonSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/relayer-daemon.ts'),
      'utf8',
    );
    expect(existsSync(resolve(
      BRIDGE_ROOT,
      'relayer/src/ergo-operational-transaction-compatibility.ts',
    ))).toBe(false);
    expect(daemonSource).not.toContain('submitPegInCommittedVaultTransition');
    expect(daemonSource).not.toContain('submitScsOracleUpdate({');

    const aggregateServiceSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/aggregate-settlement-service.ts'),
      'utf8',
    );
    expect(aggregateServiceSource).toContain(
      'async confirmSingleClaimSettlement(',
    );
    expect(aggregateServiceSource).not.toContain(
      'admitLegacyAggregateSettlementSubmission',
    );
    expect(aggregateServiceSource).not.toContain(
      'revalidateLegacyAggregateSettlementSubmission',
    );

    for (const relativePath of [
      'relayer/src/scripts/aggregate-settlement.ts',
      'relayer/src/scripts/e2e-aggregate-settlement.ts',
    ]) {
      const legacyCliSource = readFileSync(
        resolve(BRIDGE_ROOT, relativePath),
        'utf8',
      );
      expect(legacyCliSource).not.toContain('signAndCheck(');
      expect(legacyCliSource).not.toContain('/fleet-signer.js');
      expect(legacyCliSource).not.toContain('/transactions/check');
      expect(legacyCliSource).not.toContain("if (command === 'check')");
    }

    for (const routeId of [
      'relayer-owner-mint-entrypoint-v1',
      'relayer-legacy-settlement-entrypoint-v1',
    ]) {
      expect(packet.routes.find(route => route.routeId === routeId))
        .toMatchObject({
          sourcePresence: 'source-absent',
          reachability: 'disabled-at-exact-state',
          retirement: 'candidate-only',
        });
    }
    expect(packet.routes.find(route =>
      route.routeId === 'relayer-side-chain-state-updater-v1'
    )).toMatchObject({
      sourcePresence: 'source-absent',
      reachability: 'disabled-at-exact-state',
      retirement: 'candidate-only',
      blockers: ['relayer-runtime-capability-removal-is-not-authenticated'],
    });
  });

  it.each([
    'submitPegInCommittedVaultTransition({',
    'peg-in commitment signer loading',
    'peg-in commitment fee selection',
    'submitScsOracleUpdate',
    'submitDupHeartbeatTouch',
    'runErgoOperationalTransaction({',
  ] as const)(
    'rejects a returned fixed operational capability marker %s',
    marker => {
      const relayerDaemonSource = readFileSync(
        resolve(BRIDGE_ROOT, 'relayer/src/relayer-daemon.ts'),
        'utf8',
      );
      expect(() => assertRetiredOperationalSubmissionRuntimeSourceV4({
        relayerDaemonSource: `${relayerDaemonSource}\n${marker}`,
      })).toThrow(/retains fixed operational submission capability/i);
    },
  );

  it.each([
    './apps/bridge-daemon/../bridge-daemon/ergo-operational-transaction.js',
    './ergo-operational-transaction-compatibility.js',
  ] as const)(
    'rejects a returned operational module import %s',
    moduleName => {
      const relayerDaemonSource = readFileSync(
        resolve(BRIDGE_ROOT, 'relayer/src/relayer-daemon.ts'),
        'utf8',
      );
      const mutant = [
        relayerDaemonSource,
        `import * as retiredOperation from '${moduleName}';`,
        'void retiredOperation;',
      ].join('\n');
      expect(() => assertRetiredOperationalSubmissionRuntimeSourceV4({
        relayerDaemonSource: mutant,
      })).toThrow(/must not import or require retired operational module/i);
    },
  );

  it.each([
    'coordinator.submitDetected({ event, feeBox, creationHeight });',
    'new PegInTransitionCoordinator({ submitCommitment: transport });',
    "coordinator['submitDetected']({ event, feeBox, creationHeight });",
    "new PegInTransitionCoordinator({ 'submitCommitment': transport });",
    "const method = 'submitDetected'; coordinator[method](input);",
    'const method = `submitCommitment`; void method;',
  ] as const)(
    'rejects a returned committed-vault runtime composition %s',
    source => {
      expect(() => assertRetiredPegInCommitmentRuntimeSourcesV4({
        runtimeSources: [{
          path: 'relayer/src/scripts/returned-commitment-route.ts',
          source,
        }],
      })).toThrow(/retains retired committed-vault capability/i);
    },
  );

  it('accepts observation-only committed-vault runtime sources', () => {
    expect(() => assertRetiredPegInCommitmentRuntimeSourcesV4({
      runtimeSources: [{
        path: 'relayer/src/scripts/observe-commitment.ts',
        source: 'void coordinator.observeCommitment(event, height, true);',
      }],
    })).not.toThrow();
  });

  it('fails closed when the updater source returns', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'e2s-updater-source-'));
    const abiSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/sidechain-contract-abi.ts'),
      'utf8',
    );
    try {
      const updaterPath = resolve(
        fixtureRoot,
        'relayer/src/sidechain-state-updater.ts',
      );
      mkdirSync(dirname(updaterPath), { recursive: true });
      writeFileSync(updaterPath, 'export class SideChainStateUpdater {}\n');
      expect(() =>
        assertFrontierRelayerCompatibilityAuthoritySourceBoundaryV4({
          bridgeRoot: fixtureRoot,
          sidechainContractAbiSource: abiSource,
        })
      ).toThrow(/retired compatibility source must be absent/i);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when updateErgoState returns to the active sidechain ABI', () => {
    const abiSource = readFileSync(
      resolve(BRIDGE_ROOT, 'relayer/src/sidechain-contract-abi.ts'),
      'utf8',
    );
    expect(() =>
      assertFrontierRelayerCompatibilityAuthoritySourceBoundaryV4({
        bridgeRoot: BRIDGE_ROOT,
        sidechainContractAbiSource:
          `${abiSource}\nfunction updateErgoState(bytes32 state)`,
      })
    ).toThrow(/active sidechain ABI retains.*updateErgoState/i);
  });

  it('keeps configuration observations non-authoritative after source removal', () => {
    for (const observation of ['not-observed', 'enabled', 'disabled'] as const) {
      const fixture = candidateFixture({
        sidechainBroadcast: observation,
        legacyAggregateSettlement: observation,
      });
      const packet =
        buildFrontierRelayerCompatibilityAuthorityInventoryV4(fixture.input);
      const ownerMint = packet.routes.find(route =>
        route.routeId === 'relayer-owner-mint-entrypoint-v1'
      );
      const settlement = packet.routes.find(route =>
        route.routeId === 'relayer-legacy-settlement-entrypoint-v1'
      );
      const stateUpdater = packet.routes.find(route =>
        route.routeId === 'relayer-side-chain-state-updater-v1'
      );
      for (const route of [ownerMint, settlement, stateUpdater]) {
        expect(route).toMatchObject({
          configurationRetirementEffect: 'none',
          sourcePresence: 'source-absent',
          reachability: 'disabled-at-exact-state',
          retirement: 'candidate-only',
        });
        expect(route?.blockers).toContain(
          'relayer-runtime-capability-removal-is-not-authenticated',
        );
        expect(route?.blockers).not.toContain(
          'source-capability-remains-present',
        );
      }
      expect(ownerMint?.configurationObservation).toBe(observation);
      expect(settlement?.configurationObservation).toBe(observation);
      expect(stateUpdater?.configurationObservation).toBe('not-applicable');
      expect(packet.configurationObservation.retirementEffect).toBe('none');
      expect(packet.checks.configurationCanRetireCapability).toBe(false);
      expect(Object.values(packet.authority).every(value => value === false))
        .toBe(true);
    }
  });

  it('does not accept claim-bearing statuses or extra retirement fields', () => {
    for (const value of [
      'inactive',
      'PASS',
      'permanently-disabled',
      'retired',
    ]) {
      const fixture = candidateFixture();
      const invalidConfiguration = {
        ...fixture.input,
        configurationObservation: {
          sidechainBroadcast: value,
          legacyAggregateSettlement: 'disabled',
        },
      } as unknown as BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input;
      expect(() =>
        buildFrontierRelayerCompatibilityAuthorityInventoryV4(
          invalidConfiguration,
        )
      ).toThrow(/must be not-observed, enabled, or disabled/i);
    }

    const fixture = candidateFixture();
    const extraClaim = {
      ...fixture.input,
      retirementStatus: 'retired',
    } as unknown as BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input;
    expect(() =>
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(extraClaim)
    ).toThrow(/input fields are not exact/i);

    const extraCapabilityConfiguration = {
      ...fixture.input,
      configurationObservation: {
        ...fixture.input.configurationObservation,
        sideChainStateUpdater: 'disabled',
      },
    } as unknown as BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input;
    expect(() =>
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(
        extraCapabilityConfiguration,
      )
    ).toThrow(/configuration observation fields are not exact/i);
  });

  it('keeps every authority, cutover, Gate 5, and readiness flag false', () => {
    const fixture = candidateFixture();
    const packet =
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(fixture.input);
    expect(Object.keys(packet.authority).length).toBeGreaterThan(10);
    expect(Object.values(packet.authority).every(value => value === false))
      .toBe(true);
    expect(packet.checks.callerRetirementClaimsAccepted).toBe(false);
    expect(JSON.stringify(packet)).not.toMatch(
      /"(?:retired|inactive|PASS|permanently-disabled)"/,
    );
  });

  it('keeps a nonzero, non-inert candidate blocked without claiming activation', () => {
    const fixture = candidateFixture(
      undefined,
      {
        activationHeight: '99',
        reviewedProfileDigestHex: hash('9a'),
      },
    );
    const packet =
      buildFrontierRelayerCompatibilityAuthorityInventoryV4(fixture.input);
    expect(packet.observations.runtimeActivation).toBe(
      'nonzero-unactivated-candidate',
    );
    expect(packet.observations.reviewedDeploymentLineageProfile).toBe(
      'reviewed-non-inert-profile',
    );
    expect(packet.blockers).not.toContain('v4-activation-height-is-zero');
    expect(packet.blockers).not.toContain(
      'deployment-lineage-profile-is-inert-conformance-only',
    );
    expect(packet.status).toBe(
      'blocked_non_authorizing_inventory_candidate',
    );
    expect(packet.authority.profileActivated).toBe(false);
    expect(packet.authority.cutoverComplete).toBe(false);
  });
});

function candidateFixture(
  configuration: Readonly<{
    sidechainBroadcast: 'not-observed' | 'enabled' | 'disabled';
    legacyAggregateSettlement: 'not-observed' | 'enabled' | 'disabled';
  }> = {
    sidechainBroadcast: 'not-observed',
    legacyAggregateSettlement: 'not-observed',
  },
  overrides: Readonly<{
    activationHeight?: string;
    reviewedProfileDigestHex?: string;
  }> = {},
): Readonly<{
  deploymentIdentity: DeploymentIdentityCandidate;
  deploymentLineage: AuthorityBoundDeploymentLineageCandidate;
  runtimeProfile: PooledReserveMintReservationRuntimeProfileV4Candidate;
  input: BuildFrontierRelayerCompatibilityAuthorityInventoryV4Input;
}> {
  const deploymentIdentity = {
    schema: 'e2s.deployment-identity-candidate.v1',
    status: 'non_authorizing_candidate',
    view: {
      schema: 'e2s.stable-deployment-identity-view.v1',
      declaredNetworkScope: 'local-devnet',
      chainId: '1337',
      tipHeight: '91',
      tipHashHex: hash('91'),
      bridgeAddress: BRIDGE_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      bridgeRuntimeByteLength: artifactProfile.bridge.runtimeByteLength,
      bridgeRuntimeBytecodeSha256Hex:
        artifactProfile.bridge.runtimeBytecodeSha256Hex,
      tokenRuntimeByteLength: artifactProfile.token.runtimeByteLength,
      tokenRuntimeBytecodeSha256Hex:
        artifactProfile.token.runtimeBytecodeSha256Hex,
      bridgeTokenAddress: TOKEN_ADDRESS,
      bridgeOwnerAddress: BRIDGE_OWNER,
      tokenOwnerAddress: BRIDGE_ADDRESS,
      artifactProfileDigestHex: artifactProfile.profileDigestHex,
      buildManifestSha256Hex: artifactProfile.buildManifestSha256Hex,
      viewDigestHex: hash('92'),
    },
    sourceAgreement: {
      sourceCount: 2,
      sourceIdsHex: [hash('01'), hash('02')],
      consensusDigestHex: hash('03'),
    },
    authority: {
      historicalOwnershipProved: false,
      historicalMintAbsenceProved: false,
      sidechainFinalityProved: false,
      mintAuthorized: false,
      settlementAuthorized: false,
      reconciliationHoldReleaseAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      productionReady: false,
    },
    limitations: ['fixture remains non-authorizing'],
    candidateDigestHex: hash('04'),
  } as unknown as DeploymentIdentityCandidate;
  processProvenance.deploymentIdentities.add(deploymentIdentity);

  const deploymentLineage = {
    schema: 'e2s.authority-bound-deployment-lineage.v1',
    status: 'non_authorizing_candidate',
    deploymentIdentityCandidateDigestHex:
      deploymentIdentity.candidateDigestHex,
    artifactProfileDigestHex: artifactProfile.profileDigestHex,
    reviewedProfileDigestHex:
      overrides.reviewedProfileDigestHex
        ?? INERT_DEPLOYMENT_LINEAGE_CONFORMANCE_PROFILE_DIGEST_HEX,
    nativeFinalityStatementDigestHex: hash('05'),
    nativeVerifierExecutionAuthorityDigestHex: hash('06'),
    sourceAgreement: {
      sourceCount: 2,
      sourceIdsHex: [hash('01'), hash('02')],
      viewAgreementDigestHex: hash('07'),
    },
    interval: {
      startHeight: '9',
      startBlockHashHex: hash('09'),
      terminalHeight: '15',
      terminalExecutionBlockHashHex: hash('15'),
      blockCount: 7,
    },
    deployments: {
      token: {
        address: TOKEN_ADDRESS,
        height: '10',
        blockHashHex: hash('10'),
        transactionHashHex: hash('20'),
        creationBytecodeSha256Hex: hash('30'),
        runtimeBytecodeSha256Hex:
          artifactProfile.token.runtimeBytecodeSha256Hex,
      },
      bridge: {
        address: BRIDGE_ADDRESS,
        height: '11',
        blockHashHex: hash('11'),
        transactionHashHex: hash('21'),
        creationBytecodeSha256Hex: hash('31'),
        runtimeBytecodeSha256Hex:
          artifactProfile.bridge.runtimeBytecodeSha256Hex,
      },
    },
    blocks: [],
    totals: {
      transactions: 2,
      receiptLogs: 2,
      relevantLogs: 2,
      tokenMints: 0,
      tokenBurns: 0,
      tokenMintedAmount: '0',
      tokenBurnedAmount: '0',
      bridgePegIns: 0,
      terminalTotalSupply: '0',
    },
    checks: {
      sameProcessDeploymentIdentityProvenance: true,
      trackedArtifactClosureBound: true,
      reviewedProfileBound: true,
      nativeGrandpaFinalityBoundToTerminalExecutionHash: true,
      exactDeploymentCoordinatesVerified: true,
      contiguousEvmParentHashesVerified: true,
      continuousRuntimeIdentityVerified: true,
      ownerEventAndStateContinuityVerified: true,
      supplyTransferContinuityVerified: true,
      bridgeMintPairingAndReplayStateVerified: true,
      sourceRefreshedAuthorityExecutionProvenanceVerified: true,
      twoSourceBoundedObservationAgreementVerified: true,
    },
    authority: {
      historicalReceiptStateProofCompletenessProved: false,
      ergoAnchorAcceptanceProved: false,
      mintAuthorized: false,
      reconciliationHoldReleaseAuthorized: false,
      settlementAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      productionReady: false,
    },
    limitations: ['fixture remains non-authorizing'],
    candidateDigestHex: hash('08'),
  } as unknown as AuthorityBoundDeploymentLineageCandidate;
  processProvenance.deploymentLineages.add(deploymentLineage);

  const runtimeProfile = {
    schema: 'e2s.pooled-reserve-mint-reservation-runtime-profile.v4',
    version: 4,
    status: 'non_authorizing_candidate',
    profile: {
      formatVersion: 4,
      lineageProfileIdHex: hash('40'),
      sourceNetworkIdHex: hash('41'),
      sidechainIdHex: hash('42'),
      bridgeAddressHex: BRIDGE_ADDRESS,
      tokenAddressHex: TOKEN_ADDRESS,
      bridgeRuntimeCodeSha256Hex:
        `0x${artifactProfile.bridge.runtimeBytecodeSha256Hex}`,
      bridgeRuntimeCodeBytes: artifactProfile.bridge.runtimeByteLength,
      tokenRuntimeCodeSha256Hex:
        `0x${artifactProfile.token.runtimeBytecodeSha256Hex}`,
      tokenRuntimeCodeBytes: artifactProfile.token.runtimeByteLength,
      settlementProfileIdHex: hash('43'),
      ergoDepositFinalityPolicyIdHex: hash('44'),
      sourceProofSystemIdHex: hash('45'),
      sourceProofProfileIdHex: hash('46'),
      activationHeight: overrides.activationHeight ?? '0',
      maxPendingBlocks: 64,
    },
    profileScaleHex: '0x00',
    profileIdHex: hash('47'),
    compiledBinding: {
      lineageProfileIdHex: hash('40'),
      encodedLineageProfileHex: '0x00',
      lineageActivationHeight: overrides.activationHeight ?? '0',
      applicationBindingHex: '0x00',
      applicationBindingDigestHex: hash('48'),
      contractIds: {
        tracker: hash('49'),
        duplicatePrevention: hash('50'),
        sourceLock: hash('51'),
        pooledReserve: hash('52'),
      },
    },
    checks: {
      sameProcessCompiledInstanceVerified: true,
      exactLineageProfileDecoded: true,
      exactApplicationBindingDecoded: true,
      exactCompiledContractIdentitiesRetained: true,
      activationHeightInheritedFromLineage: true,
      callerSuppliedProfileAccepted: false,
    },
    authority: {
      profileActivated: false,
      sourceProofVerified: false,
      targetNodeAcceptanceEstablished: false,
      mintAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
    candidateDigestHex: hash('53'),
  } as unknown as PooledReserveMintReservationRuntimeProfileV4Candidate;
  processProvenance.runtimeProfiles.add(runtimeProfile);

  return {
    deploymentIdentity,
    deploymentLineage,
    runtimeProfile,
    input: {
      bridgeRoot: BRIDGE_ROOT,
      deploymentIdentity,
      deploymentLineage,
      runtimeProfile,
      configurationObservation: configuration,
    },
  };
}

function hash(byte: string): string {
  return byte.repeat(64 / byte.length).slice(0, 64);
}
