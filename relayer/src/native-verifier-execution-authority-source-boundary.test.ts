import { describe, expect, it } from 'vitest';

import {
  createNativeVerifierExecutionAuthority,
} from './native-verifier-execution-authority.js';
import {
  createNativeVerifierAttestationExecutionFixture,
} from './native-verifier-attestation-fixture.test-helper.js';

describe('native verifier authority source boundary', () => {
  it('keeps operational execution unavailable while the reviewed source lock has no active external profile', () => {
    const fixture = createNativeVerifierAttestationExecutionFixture();
    try {
      expect(() => createNativeVerifierExecutionAuthority({
        packet: fixture.packet,
        executionPolicy: fixture.policy,
        runtimeDependencyManifests: fixture.manifests,
        launcherPath: fixture.launcherPath,
        verifierExecutablePath: fixture.verifierPath,
        codecExecutablePath: fixture.codecPath,
      })).toThrow(/no active attestor profile/i);
    } finally {
      fixture.dispose();
    }
  });
});
