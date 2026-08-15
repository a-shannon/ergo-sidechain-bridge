import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  createNativePegInRuntimeIdentityV2ExecutionAuthority,
} from './native-peg-in-runtime-identity-v2-execution-authority.js';
import {
  createNativePegInRuntimeIdentityV2ExecutionPolicyFixture,
  type NativePegInRuntimeIdentityV2ExecutionPolicyFixture,
} from './native-peg-in-runtime-identity-v2-execution-policy-fixture.test-helper.js';

let fixture: NativePegInRuntimeIdentityV2ExecutionPolicyFixture;

beforeEach(() => {
  fixture = createNativePegInRuntimeIdentityV2ExecutionPolicyFixture();
});

afterEach(() => {
  fixture.dispose();
});

describe('runtime identity V2 source-owned authority boundary', () => {
  it('keeps real dual-registry composition unavailable while canonical profiles are empty', () => {
    expect(() =>
      createNativePegInRuntimeIdentityV2ExecutionAuthority({
        runtimeBuildPacket: fixture.runtimeBuildPacket,
        nativeVerifierPacket: fixture.nativePacket,
        executionPolicy: fixture.policy,
        runtimeDependencyManifest: fixture.runtimeDependencyManifest,
        launcherPath: fixture.launcherPath,
        runtimeCodePath: fixture.runtimeCodePath,
        verifierExecutablePath: fixture.nativeVerifierExecutablePath,
      }),
    ).toThrow(/no active profile/i);
  });
});
