import { createHash } from 'node:crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4_SCHEMA,
  assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance,
  buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4,
  type BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input,
} from './validity-application-pooled-reserve-ergo-legacy-route-profile-v4.js';

const ERGO_REQUIREMENTS = VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
  .filter(requirement => requirement.layer === 'ergo');

function profileInput(): BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input {
  return {
    network: {
      networkId: 'ergo-testnet',
      addressNetworkPrefix: 16,
    },
    reviewedSource: {
      sourceRevisionHex: 'a1'.repeat(20),
      basis: [{
        reference: 'repository://bridge/reviewed-legacy-ergo-route-basis-v4',
        sha256Hex: 'b2'.repeat(32),
      }],
    },
    routes: ERGO_REQUIREMENTS.map((requirement, index) => {
      const ergoTreeHex = tree(index);
      const singleton = requirement.routeClass === 'tracker'
        || requirement.routeClass === 'duplicate-prevention'
        || requirement.routeClass === 'sidechain-state';
      return {
        routeId: requirement.routeId,
        sourceSurface: requirement.sourceSurface,
        requiredDisposition: requirement.requiredDisposition,
        instances: [{
          instanceId: `reviewed-${String(index).padStart(2, '0')}`,
          address: ErgoAddress.fromErgoTree(ergoTreeHex, Network.Testnet).toString(),
          ergoTreeHex,
          ergoTreeSha256Hex: sha256Bytes(ergoTreeHex),
          singletonTokenIdHex: singleton ? hex(index + 1) : null,
          genesisBoxIdHex: singleton ? hex(index + 65) : null,
        }],
      };
    }),
  };
}

function tree(index: number): string {
  return `10010100d1${(0x40 + index).toString(16)}00`;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, '0').repeat(32);
}

function sha256Bytes(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

describe('pooled-reserve V4 Ergo legacy-route profile', () => {
  it('binds every Ergo route to sorted concrete P2S instances without granting authority', () => {
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput(),
    );

    expect(profile.schema)
      .toBe(VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4_SCHEMA);
    expect(profile.routes.map(route => route.routeId))
      .toEqual([...profile.routes.map(route => route.routeId)].sort());
    expect(profile.routes).toHaveLength(ERGO_REQUIREMENTS.length);
    expect(profile.requirementsDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(profile.profileDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(profile.boundaries).toEqual({
      reviewedProfileOnly: true,
      profileApproved: false,
      instanceInventoryExhaustive: false,
      retirementEstablished: false,
      retirementAuthorized: false,
      activationEstablished: false,
      activationAuthorized: false,
      mintAuthorized: false,
      payoutAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(() =>
      assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance(profile),
    ).not.toThrow();
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it('rejects an omitted, unknown, or duplicate Ergo route', () => {
    const omitted = profileInput() as any;
    omitted.routes.pop();
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(omitted))
      .toThrow(/omits/);

    const unknown = profileInput() as any;
    unknown.routes[0].routeId = 'ergo-unknown-route';
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(unknown))
      .toThrow(/unknown/);

    const duplicate = profileInput() as any;
    duplicate.routes[1].routeId = duplicate.routes[0].routeId;
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(duplicate))
      .toThrow(/duplicate/);
  });

  it('rejects a route with a mismatched source surface or disposition', () => {
    const source = profileInput() as any;
    source.routes[0].sourceSurface = 'contracts/Other.es';
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(source))
      .toThrow(/source surface/);

    const disposition = profileInput() as any;
    disposition.routes[0].requiredDisposition = 'disable-authority';
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(disposition))
      .toThrow(/disposition/);
  });

  it('rejects a bad address, tree, hash, or network binding', () => {
    const address = profileInput() as any;
    const addressInstance = address.routes[0].instances[0];
    addressInstance.address = ErgoAddress.fromErgoTree(
      addressInstance.ergoTreeHex,
      Network.Mainnet,
    ).toString();
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(address))
      .toThrow(/address network/);

    const treeBinding = profileInput() as any;
    const treeInstance = treeBinding.routes[0].instances[0];
    treeInstance.ergoTreeHex = tree(39);
    treeInstance.ergoTreeSha256Hex = sha256Bytes(treeInstance.ergoTreeHex);
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(treeBinding))
      .toThrow(/does not encode/);

    const hash = profileInput() as any;
    hash.routes[0].instances[0].ergoTreeSha256Hex = 'cc'.repeat(32);
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(hash))
      .toThrow(/hash does not match/);

    const network = profileInput() as any;
    network.network.networkId = 'ergo-mainnet';
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(network))
      .toThrow(/network ID and address prefix disagree/);
  });

  it('rejects duplicate concrete instance assignment across routes', () => {
    const input = profileInput() as any;
    input.routes[1].instances[0] = {
      ...input.routes[0].instances[0],
      instanceId: 'separately-named-duplicate-instance',
    };
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(input))
      .toThrow(/assigned to both/);
  });

  it('allows repeated generations of one script only with distinct singleton lineages', () => {
    const input = profileInput() as any;
    const tracker = input.routes.find((route: any) =>
      route.instances[0].singletonTokenIdHex !== null
    );
    tracker.instances.push({
      ...tracker.instances[0],
      instanceId: 'reviewed-prior-generation',
      singletonTokenIdHex: 'e1'.repeat(32),
      genesisBoxIdHex: 'e2'.repeat(32),
    });
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      input,
    );
    expect(profile.routes.find(route => route.routeId === tracker.routeId)
      ?.instances).toHaveLength(2);

    const ambiguous = profileInput() as any;
    ambiguous.routes[0].instances.push({
      ...ambiguous.routes[0].instances[0],
      instanceId: 'ambiguous-script-generation',
      singletonTokenIdHex: null,
      genesisBoxIdHex: null,
    });
    expect(() =>
      buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(ambiguous)
    ).toThrow(/repeats one script without exact singleton lineage/i);
  });

  it('bounds the total number of concrete instances', () => {
    const input = profileInput() as any;
    const tracker = input.routes.find((route: any) =>
      route.instances[0].singletonTokenIdHex !== null
    );
    tracker.instances = Array.from({ length: 257 }, (_, index) => ({
      ...tracker.instances[0],
      instanceId: `bounded-${String(index).padStart(3, '0')}`,
      singletonTokenIdHex: createHash('sha256')
        .update(`singleton-${index}`)
        .digest('hex'),
      genesisBoxIdHex: createHash('sha256')
        .update(`genesis-${index}`)
        .digest('hex'),
    }));
    expect(() =>
      buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(input)
    ).toThrow(/exceeds 256 total instances/i);
  });

  it('rejects malformed optional singleton and genesis identities', () => {
    const unpaired = profileInput() as any;
    const instance = unpaired.routes.find((route: any) =>
      route.instances[0].singletonTokenIdHex !== null
    ).instances[0];
    instance.genesisBoxIdHex = null;
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(unpaired))
      .toThrow(/supplied together/);

    const malformed = profileInput() as any;
    const malformedInstance = malformed.routes.find((route: any) =>
      route.instances[0].singletonTokenIdHex !== null
    ).instances[0];
    malformedInstance.singletonTokenIdHex = 'not-hex';
    expect(() => buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(malformed))
      .toThrow(/singleton token ID/);
  });

  it('rejects deserialized or forged process provenance and cannot expose authority flags', () => {
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput(),
    );
    const deserialized = structuredClone(profile);
    expect(() =>
      assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance(deserialized),
    ).toThrow(/not built in this process/);
    expect(() =>
      assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance({
        ...profile,
        boundaries: {
          ...profile.boundaries,
          mintAuthorized: true,
          payoutAuthorized: true,
          fundsAuthorityEstablished: true,
        },
      }),
    ).toThrow(/not built in this process/);
  });

  it('reconstructs and validates the complete serialized profile identity', () => {
    const profile = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
      profileInput(),
    );
    expect(
      validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
        structuredClone(profile),
      ).profileDigestHex,
    ).toBe(profile.profileDigestHex);

    const routeRewrite = structuredClone(profile) as any;
    routeRewrite.routes[0].instances[0].instanceId = 'rewritten-instance';
    expect(() =>
      validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
        routeRewrite,
      )
    ).toThrow(/canonical reconstruction/i);

    const authorityRewrite = structuredClone(profile) as any;
    authorityRewrite.boundaries.fundsAuthorityEstablished = true;
    expect(() =>
      validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
        authorityRewrite,
      )
    ).toThrow(/canonical reconstruction/i);
  });
});
