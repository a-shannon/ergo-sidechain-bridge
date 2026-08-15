import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import {
  deriveAuthenticatedV2InitialBinding,
  type AuthenticatedV2InitialBindingCompiler,
  type AuthenticatedV2InitialBindingCompilerIdentity,
} from './authenticated-v2-initial-binding.js';
import type {
  AuthenticatedV2ContractTemplates,
} from './authenticated-v2-canonical-contracts.js';
import type { ResolvedAuthenticatedV2ContractSources } from './authenticated-v2-contract-sources.js';

const TRACKER_ID = '11'.repeat(32);
const DUP_ID = '22'.repeat(32);

const SOURCES = {
  tracker: '{ sigmaProp(true) }',
  unlock: '{ val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER"); val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER"); sigmaProp(tracker != dup) }',
  duplicatePrevention: '{ val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER"); val unlock = fromBase16("AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER"); sigmaProp(tracker != unlock) }',
} as const;

const COMPILER_IDENTITY: AuthenticatedV2InitialBindingCompilerIdentity = {
  execution: 'pinned-resolver-free-jvm',
  compilerLockDigestHex: '0b'.repeat(32),
  sourceBaselineDigestHex: '0c'.repeat(32),
  platform: 'win32-x64',
  nodeVersion: '24.14.0',
  nodeExecutableSha256: '01'.repeat(32),
  gitVersion: '2.54.0.windows.1',
  gitExecutableSha256: '02'.repeat(32),
  relayerPackageLockSha256: '03'.repeat(32),
  ergoNodeBaseCommit: '04'.repeat(20),
  consensusSourceLockSha256: '05'.repeat(32),
  ergoPatchSha256: '06'.repeat(32),
  sigmaStateVersion: '6.0.2',
  sigmaStateArtifactSha256: '07'.repeat(32),
  runtimeBundleSha256: '08'.repeat(32),
  runtimeClasspathSha256: '09'.repeat(32),
  javaHomeSha256: '0a'.repeat(32),
  networkPrefix: 16,
  scriptVersion: 3,
  treeVersion: 0,
};

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function templates(): AuthenticatedV2ContractTemplates {
  return {
    tracker: template(SOURCES.tracker),
    unlock: template(SOURCES.unlock),
    duplicatePrevention: template(SOURCES.duplicatePrevention),
  };
}

function template(sourceTemplate: string) {
  return {
    sourceTemplate,
    sourceTemplateSha256Hex: sha256(sourceTemplate),
  };
}

function compiler(options: {
  driftTreeAtPass?: number;
  driftTreeRole?: 'tracker' | 'unlock' | 'duplicatePrevention';
  driftSourceAtPass?: number;
  driftIdentityAtPass?: number;
  badTreeHashAtPass?: number;
  badRoleAtPass?: number;
} = {}): { compile: AuthenticatedV2InitialBindingCompiler; calls: ResolvedAuthenticatedV2ContractSources[] } {
  const calls: ResolvedAuthenticatedV2ContractSources[] = [];
  const compile: AuthenticatedV2InitialBindingCompiler = async resolved => {
    calls.push(resolved);
    const pass = calls.length;
    const contracts = Object.fromEntries(
      (['tracker', 'unlock', 'duplicatePrevention'] as const).map((role, index) => {
        const sourceHash = resolved[role].resolvedSourceSha256Hex;
        const stableTree = `${10 + index}${sha256(resolved[role].source).slice(0, 64)}`;
        const driftRole = options.driftTreeRole ?? 'tracker';
        const ergoTreeHex = options.driftTreeAtPass === pass && role === driftRole
          ? `${stableTree}00`
          : stableTree;
        return [role, {
          role: options.badRoleAtPass === pass && role === 'unlock' ? 'tracker' : role,
          resolvedSourceSha256Hex:
            options.driftSourceAtPass === pass && role === 'unlock' ? 'ff'.repeat(32) : sourceHash,
          ergoTreeHex,
          ergoTreeSha256Hex:
            options.badTreeHashAtPass === pass && role === 'duplicatePrevention'
              ? 'ee'.repeat(32)
              : sha256(Buffer.from(ergoTreeHex, 'hex')),
        }];
      }),
    ) as Awaited<ReturnType<AuthenticatedV2InitialBindingCompiler>>['observation']['contracts'];
    return {
      identity: options.driftIdentityAtPass === pass
        ? { ...COMPILER_IDENTITY, runtimeBundleSha256: 'ee'.repeat(32) }
        : COMPILER_IDENTITY,
      observation: { contracts },
    };
  };
  return { compile, calls };
}

function request(overrides: Partial<{
  environment: string;
  trackerFundingBoxId: string;
  dupVaultFundingBoxId: string;
  fundingObservation: {
    reportDigestHex: string;
    snapshotDigestHex: string;
    observedAt: string;
    nodeNetwork: string;
    tipHeight: number;
    tipIdHex: string;
  };
}> = {}) {
  return {
    environment: 'patched-devnet',
    trackerFundingBoxId: TRACKER_ID,
    dupVaultFundingBoxId: DUP_ID,
    ...overrides,
  };
}

describe('authenticated V2 initial binding derivation', () => {
  it('derives a deterministic three-pass fixed point without execution authority', async () => {
    const fake = compiler();
    const first = await deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: fake.compile,
    });
    const second = await deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler().compile,
    });

    expect(first).toEqual(second);
    expect(fake.calls).toHaveLength(3);
    expect(first.status).toBe('DERIVED');
    expect(first.identities).toEqual({
      trackerNftId: TRACKER_ID,
      duplicatePreventionNftId: DUP_ID,
    });
    expect(first.dependencyBinding).toMatchObject({
      compilerPasses: 3,
      trackerTreeStable: true,
      unlockTreeStable: true,
      fixedPointVerified: true,
    });
    expect(first.fundingObservation).toEqual({
      status: 'unobserved',
      revalidationRequiredBeforeSetup: true,
    });
    expect(first.provisioningContracts.unlock.ergoTreeHex)
      .toBe(fake.calls[2].unlock.ergoTreeHex);
    expect(first.resolvedContracts.duplicatePrevention.resolvedSourceSha256Hex)
      .toBe(fake.calls[2].duplicatePrevention.resolvedSourceSha256Hex);
    expect(Object.values(first.authorization).every(value => value === false)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/transaction|boxId|ergoClient|signer/i);
    expect(JSON.stringify(first)).not.toMatch(/"sourceTemplate":|PLACEHOLDER|sigmaProp/);
  });

  it('does not let a direct core caller fabricate an observed funding binding', async () => {
    const fundingObservation = {
      reportDigestHex: '31'.repeat(32),
      snapshotDigestHex: '32'.repeat(32),
      observedAt: '2026-07-12T12:00:00.000Z',
      nodeNetwork: 'testnet',
      tipHeight: 123,
      tipIdHex: '33'.repeat(32),
    };
    const observed = await deriveAuthenticatedV2InitialBinding(request({ fundingObservation }), {
      templates: templates(),
      compile: compiler().compile,
    });
    expect(observed.fundingObservation).toEqual({
      status: 'unobserved',
      revalidationRequiredBeforeSetup: true,
    });
    expect(observed.authorization.execute).toBe(false);
    expect(observed.authorization.deploy).toBe(false);
  });

  it('binds both identities into unlock and DUP while leaving the tracker independent', async () => {
    const baseline = await deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler().compile,
    });
    const changed = await deriveAuthenticatedV2InitialBinding(request({
      trackerFundingBoxId: `12${TRACKER_ID.slice(2)}`,
    }), {
      templates: templates(),
      compile: compiler().compile,
    });

    expect(changed.reportDigestHex).not.toBe(baseline.reportDigestHex);
    expect(changed.provisioningContracts.tracker).toEqual(baseline.provisioningContracts.tracker);
    expect(changed.provisioningContracts.unlock).not.toEqual(baseline.provisioningContracts.unlock);
    expect(changed.provisioningContracts.duplicatePrevention)
      .not.toEqual(baseline.provisioningContracts.duplicatePrevention);

    const swapped = await deriveAuthenticatedV2InitialBinding(request({
      trackerFundingBoxId: DUP_ID,
      dupVaultFundingBoxId: TRACKER_ID,
    }), {
      templates: templates(),
      compile: compiler().compile,
    });
    expect(swapped.provisioningContracts.tracker).toEqual(baseline.provisioningContracts.tracker);
    expect(swapped.provisioningContracts.unlock).not.toEqual(baseline.provisioningContracts.unlock);
    expect(swapped.provisioningContracts.duplicatePrevention)
      .not.toEqual(baseline.provisioningContracts.duplicatePrevention);
  });

  it('rejects ambiguous identities and noncanonical environments', async () => {
    const run = (overrides: Parameters<typeof request>[0]) => deriveAuthenticatedV2InitialBinding(
      request(overrides),
      { templates: templates(), compile: compiler().compile },
    );
    await expect(run({ environment: 'mainnet' })).rejects.toThrow(/non-mainnet/i);
    await expect(run({ trackerFundingBoxId: 'AA'.repeat(32) })).rejects.toThrow(/lowercase/i);
    await expect(run({ dupVaultFundingBoxId: TRACKER_ID })).rejects.toThrow(/distinct/i);
    await expect(run({ trackerFundingBoxId: '11' })).rejects.toThrow(/32-byte/i);
  });

  it('rejects compiler source, identity, and fixed-point drift', async () => {
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ driftSourceAtPass: 2 }).compile,
    })).rejects.toThrow(/compiled source hash/i);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ driftIdentityAtPass: 3 }).compile,
    })).rejects.toThrow(/compiler identity changed/i);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ driftTreeAtPass: 2, driftTreeRole: 'tracker' }).compile,
    })).rejects.toThrow(/tracker tree changed/i);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ driftTreeAtPass: 2, driftTreeRole: 'unlock' }).compile,
    })).rejects.toThrow(/unlock tree changed/i);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ driftTreeAtPass: 3 }).compile,
    })).rejects.toThrow(/fixed point/i);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ badTreeHashAtPass: 1 }).compile,
    })).rejects.toThrow(/ErgoTree hash does not match/i);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: templates(),
      compile: compiler({ badRoleAtPass: 1 }).compile,
    })).rejects.toThrow(/missing or misordered/i);
  });

  it('rejects template hash drift before invoking the compiler', async () => {
    const fake = compiler();
    const drifted = templates();
    drifted.unlock.sourceTemplateSha256Hex = 'ff'.repeat(32);
    await expect(deriveAuthenticatedV2InitialBinding(request(), {
      templates: drifted,
      compile: fake.compile,
    })).rejects.toThrow(/template.*SHA-256/i);
    expect(fake.calls).toHaveLength(0);
  });
});
