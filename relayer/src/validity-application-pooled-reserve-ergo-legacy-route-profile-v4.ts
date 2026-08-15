import { createHash } from 'node:crypto';

import { AddressType } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';

import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  type LegacyRouteRetirementRequirementV4,
  type LegacyRouteRetirementDispositionV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-ergo-legacy-route-profile.v4' as const;

const REQUIREMENTS_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4';
const PROFILE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4';
const MAX_TOTAL_INSTANCES = 256;
const profiles = new WeakSet<object>();

type ErgoNetworkId = 'ergo-mainnet' | 'ergo-testnet';

export interface BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input {
  readonly network: {
    readonly networkId: ErgoNetworkId;
    readonly addressNetworkPrefix: 0 | 16;
  };
  readonly reviewedSource: {
    readonly sourceRevisionHex: string;
    readonly basis: readonly {
      readonly reference: string;
      readonly sha256Hex: string;
    }[];
  };
  readonly routes: readonly {
    readonly routeId: string;
    readonly sourceSurface: string;
    readonly requiredDisposition: LegacyRouteRetirementDispositionV4;
    readonly instances: readonly {
      readonly instanceId: string;
      readonly address: string;
      readonly ergoTreeHex: string;
      readonly ergoTreeSha256Hex: string;
      readonly singletonTokenIdHex: string | null;
      readonly genesisBoxIdHex: string | null;
    }[];
  }[];
}

export interface ValidityApplicationPooledReserveErgoLegacyRouteProfileV4 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4_SCHEMA;
  readonly version: 4;
  readonly requirementsDigestHex: string;
  readonly profileDigestHex: string;
  readonly network: {
    readonly networkId: ErgoNetworkId;
    readonly addressNetworkPrefix: 0 | 16;
    readonly p2sAddressHeader: 3 | 19;
  };
  readonly reviewedSource: {
    readonly sourceRevisionHex: string;
    readonly basis: readonly {
      readonly reference: string;
      readonly sha256Hex: string;
    }[];
  };
  readonly routes: readonly {
    readonly routeId: string;
    readonly sourceSurface: string;
    readonly routeClass: LegacyRouteRetirementRequirementV4['routeClass'];
    readonly requiredDisposition: LegacyRouteRetirementDispositionV4;
    readonly instances: readonly {
      readonly instanceId: string;
      readonly address: string;
      readonly ergoTreeHex: string;
      readonly ergoTreeSha256Hex: string;
      readonly singletonTokenIdHex: string | null;
      readonly genesisBoxIdHex: string | null;
    }[];
  }[];
  readonly boundaries: {
    readonly reviewedProfileOnly: true;
    readonly profileApproved: false;
    readonly instanceInventoryExhaustive: false;
    readonly retirementEstablished: false;
    readonly retirementAuthorized: false;
    readonly activationEstablished: false;
    readonly activationAuthorized: false;
    readonly mintAuthorized: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export function buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
  input: BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input,
): Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4> {
  const record = assertExactDataObject(input, [
    'network',
    'reviewedSource',
    'routes',
  ], 'pooled-reserve V4 Ergo legacy-route profile input');
  const network = normalizeNetwork(record.network);
  const reviewedSource = normalizeReviewedSource(record.reviewedSource);
  const routes = normalizeRoutes(record.routes, network);
  const requirementsDigestHex = sha256CanonicalJson(
    ergoRequirements(),
    REQUIREMENTS_DIGEST_DOMAIN,
  );
  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4_SCHEMA,
    version: 4 as const,
    requirementsDigestHex,
    network,
    reviewedSource,
    routes,
    boundaries: {
      reviewedProfileOnly: true as const,
      profileApproved: false as const,
      instanceInventoryExhaustive: false as const,
      retirementEstablished: false as const,
      retirementAuthorized: false as const,
      activationEstablished: false as const,
      activationAuthorized: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const profile = deepFreeze({
    ...binding,
    profileDigestHex: sha256CanonicalJson(binding, PROFILE_DIGEST_DOMAIN),
  });
  profiles.add(profile);
  return profile;
}

export function assertValidityApplicationPooledReserveErgoLegacyRouteProfileV4Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
> {
  if (value === null || typeof value !== 'object' || !profiles.has(value)) {
    throw new Error(
      'pooled-reserve V4 Ergo legacy-route profile was not built in this process',
    );
  }
}

export function validateValidityApplicationPooledReserveErgoLegacyRouteProfileV4(
  value: unknown,
): Readonly<ValidityApplicationPooledReserveErgoLegacyRouteProfileV4> {
  const record = assertExactDataObject(value, [
    'schema',
    'version',
    'requirementsDigestHex',
    'profileDigestHex',
    'network',
    'reviewedSource',
    'routes',
    'boundaries',
  ], 'serialized pooled-reserve V4 Ergo legacy-route profile');
  if (
    record.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_ERGO_LEGACY_ROUTE_PROFILE_V4_SCHEMA
    || record.version !== 4
  ) {
    throw new Error('serialized pooled-reserve V4 Ergo legacy-route profile identity is invalid');
  }
  const network = assertExactDataObject(record.network, [
    'networkId',
    'addressNetworkPrefix',
    'p2sAddressHeader',
  ], 'serialized pooled-reserve V4 Ergo legacy-route profile network');
  const reviewedSource = assertExactDataObject(record.reviewedSource, [
    'sourceRevisionHex',
    'basis',
  ], 'serialized pooled-reserve V4 Ergo legacy-route reviewed source');
  if (!Array.isArray(reviewedSource.basis)) {
    throw new Error('serialized pooled-reserve V4 Ergo legacy-route review basis must be an array');
  }
  const basis = reviewedSource.basis.map((entry, index) => {
    const item = assertExactDataObject(entry, [
      'reference',
      'sha256Hex',
    ], `serialized pooled-reserve V4 Ergo legacy-route review basis ${index}`);
    return {
      reference: item.reference,
      sha256Hex: item.sha256Hex,
    };
  });
  if (!Array.isArray(record.routes)) {
    throw new Error('serialized pooled-reserve V4 Ergo legacy-route routes must be an array');
  }
  const routes = record.routes.map((entry, routeIndex) => {
    const route = assertExactDataObject(entry, [
      'routeId',
      'sourceSurface',
      'routeClass',
      'requiredDisposition',
      'instances',
    ], `serialized pooled-reserve V4 Ergo legacy route ${routeIndex}`);
    if (!Array.isArray(route.instances)) {
      throw new Error(`serialized pooled-reserve V4 Ergo legacy route ${routeIndex} instances must be an array`);
    }
    const instances = route.instances.map((entryValue, instanceIndex) => {
      const instance = assertExactDataObject(entryValue, [
        'instanceId',
        'address',
        'ergoTreeHex',
        'ergoTreeSha256Hex',
        'singletonTokenIdHex',
        'genesisBoxIdHex',
      ], `serialized pooled-reserve V4 Ergo legacy route ${routeIndex} instance ${instanceIndex}`);
      return {
        instanceId: instance.instanceId,
        address: instance.address,
        ergoTreeHex: instance.ergoTreeHex,
        ergoTreeSha256Hex: instance.ergoTreeSha256Hex,
        singletonTokenIdHex: instance.singletonTokenIdHex,
        genesisBoxIdHex: instance.genesisBoxIdHex,
      };
    });
    return {
      routeId: route.routeId,
      sourceSurface: route.sourceSurface,
      requiredDisposition: route.requiredDisposition,
      instances,
    };
  });
  assertExactDataObject(record.boundaries, [
    'reviewedProfileOnly',
    'profileApproved',
    'instanceInventoryExhaustive',
    'retirementEstablished',
    'retirementAuthorized',
    'activationEstablished',
    'activationAuthorized',
    'mintAuthorized',
    'payoutAuthorized',
    'signingAuthorized',
    'submissionAuthorized',
    'broadcastAuthorized',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ], 'serialized pooled-reserve V4 Ergo legacy-route profile boundaries');

  const rebuilt = buildValidityApplicationPooledReserveErgoLegacyRouteProfileV4({
    network: {
      networkId: network.networkId,
      addressNetworkPrefix: network.addressNetworkPrefix,
    },
    reviewedSource: {
      sourceRevisionHex: reviewedSource.sourceRevisionHex,
      basis,
    },
    routes,
  } as BuildValidityApplicationPooledReserveErgoLegacyRouteProfileV4Input);
  if (canonicalJson(record) !== canonicalJson(rebuilt)) {
    throw new Error('serialized pooled-reserve V4 Ergo legacy-route profile differs from its canonical reconstruction');
  }
  return value as Readonly<
    ValidityApplicationPooledReserveErgoLegacyRouteProfileV4
  >;
}

function ergoRequirements() {
  return VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
    .filter(requirement => requirement.layer === 'ergo')
    .sort((left, right) => left.routeId.localeCompare(right.routeId));
}

function normalizeNetwork(
  value: unknown,
): ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['network'] {
  const record = assertExactDataObject(value, [
    'networkId',
    'addressNetworkPrefix',
  ], 'pooled-reserve V4 Ergo legacy-route profile network');
  const networkId = oneOf(
    record.networkId,
    ['ergo-mainnet', 'ergo-testnet'] as const,
    'pooled-reserve V4 Ergo legacy-route profile network ID',
  );
  const addressNetworkPrefix = oneOf(
    record.addressNetworkPrefix,
    [0, 16] as const,
    'pooled-reserve V4 Ergo legacy-route profile address network prefix',
  );
  const expectedPrefix = networkId === 'ergo-mainnet' ? 0 : 16;
  if (addressNetworkPrefix !== expectedPrefix) {
    throw new Error(
      'pooled-reserve V4 Ergo legacy-route profile network ID and address prefix disagree',
    );
  }
  return {
    networkId,
    addressNetworkPrefix,
    p2sAddressHeader: addressNetworkPrefix === 0 ? 3 : 19,
  };
}

function normalizeReviewedSource(
  value: unknown,
): ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['reviewedSource'] {
  const record = assertExactDataObject(value, [
    'sourceRevisionHex',
    'basis',
  ], 'pooled-reserve V4 Ergo legacy-route reviewed source');
  if (!Array.isArray(record.basis) || record.basis.length === 0) {
    throw new Error(
      'pooled-reserve V4 Ergo legacy-route reviewed source basis must be non-empty',
    );
  }
  const basis = record.basis.map((entry, index) => {
    const item = assertExactDataObject(
      entry,
      ['reference', 'sha256Hex'],
      `pooled-reserve V4 Ergo legacy-route reviewed source basis ${index}`,
    );
    return {
      reference: nonemptyAscii(
        item.reference,
        `pooled-reserve V4 Ergo legacy-route reviewed source basis ${index} reference`,
      ),
      sha256Hex: nonzeroFixedHex(
        item.sha256Hex,
        32,
        `pooled-reserve V4 Ergo legacy-route reviewed source basis ${index} digest`,
      ),
    };
  });
  assertSortedUnique(
    basis.map(entry => entry.reference),
    'pooled-reserve V4 Ergo legacy-route reviewed source basis references',
  );
  return {
    sourceRevisionHex: nonzeroFixedHex(
      record.sourceRevisionHex,
      20,
      'pooled-reserve V4 Ergo legacy-route source revision',
    ),
    basis: deepFreeze(basis),
  };
}

function normalizeRoutes(
  value: unknown,
  network: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['network'],
): ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'] {
  if (!Array.isArray(value)) {
    throw new Error('pooled-reserve V4 Ergo legacy-route profile routes must be an array');
  }
  const requirements = ergoRequirements();
  const requirementById = new Map(
    requirements.map(requirement => [requirement.routeId, requirement]),
  );
  const routeIds = new Set<string>();
  const instanceIds = new Set<string>();
  const instanceAddresses = new Map<string, string>();
  const instanceTrees = new Map<string, string>();
  const singletonTokenIds = new Set<string>();
  const genesisBoxIds = new Set<string>();
  let totalInstances = 0;
  const routes = value.map((entry, index) => {
    const record = assertExactDataObject(entry, [
      'routeId',
      'sourceSurface',
      'requiredDisposition',
      'instances',
    ], `pooled-reserve V4 Ergo legacy-route profile route ${index}`);
    const routeId = nonemptyAscii(
      record.routeId,
      `pooled-reserve V4 Ergo legacy-route profile route ${index} ID`,
    );
    const requirement = requirementById.get(routeId);
    if (requirement === undefined) {
      throw new Error(`unknown pooled-reserve V4 Ergo legacy route ${routeId}`);
    }
    if (routeIds.has(routeId)) {
      throw new Error(`duplicate pooled-reserve V4 Ergo legacy route ${routeId}`);
    }
    routeIds.add(routeId);
    const sourceSurface = nonemptyAscii(
      record.sourceSurface,
      `pooled-reserve V4 Ergo legacy-route ${routeId} source surface`,
    );
    if (sourceSurface !== requirement.sourceSurface) {
      throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} source surface differs from the static registry`);
    }
    if (record.requiredDisposition !== requirement.requiredDisposition) {
      throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} disposition differs from the static registry`);
    }
    if (!Array.isArray(record.instances) || record.instances.length === 0) {
      throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} must have at least one concrete instance`);
    }
    totalInstances += record.instances.length;
    if (totalInstances > MAX_TOTAL_INSTANCES) {
      throw new Error(
        `pooled-reserve V4 Ergo legacy-route profile exceeds ${MAX_TOTAL_INSTANCES} total instances`,
      );
    }
    const instances = record.instances.map((instance, instanceIndex) => {
      const normalized = normalizeInstance(instance, routeId, instanceIndex, network);
      if (instanceIds.has(normalized.instanceId)) {
        throw new Error(`duplicate pooled-reserve V4 Ergo legacy instance ID ${normalized.instanceId}`);
      }
      instanceIds.add(normalized.instanceId);
      assertCrossRouteUnique(
        instanceAddresses,
        normalized.address,
        routeId,
        'address',
      );
      assertCrossRouteUnique(
        instanceTrees,
        normalized.ergoTreeHex,
        routeId,
        'ErgoTree',
      );
      if (normalized.singletonTokenIdHex !== null) {
        if (singletonTokenIds.has(normalized.singletonTokenIdHex)) {
          throw new Error(`duplicate pooled-reserve V4 Ergo legacy singleton token ID ${normalized.singletonTokenIdHex}`);
        }
        singletonTokenIds.add(normalized.singletonTokenIdHex);
      }
      if (normalized.genesisBoxIdHex !== null) {
        if (genesisBoxIds.has(normalized.genesisBoxIdHex)) {
          throw new Error(`duplicate pooled-reserve V4 Ergo legacy genesis box ID ${normalized.genesisBoxIdHex}`);
        }
        genesisBoxIds.add(normalized.genesisBoxIdHex);
      }
      return normalized;
    });
    assertRepeatedScriptInstancesAreDistinguishable(instances, routeId);
    return {
      routeId,
      sourceSurface: requirement.sourceSurface,
      routeClass: requirement.routeClass,
      requiredDisposition: requirement.requiredDisposition,
      instances: deepFreeze(instances.sort((left, right) =>
        left.instanceId.localeCompare(right.instanceId)
      )),
    };
  });
  const missing = requirements
    .map(requirement => requirement.routeId)
    .filter(routeId => !routeIds.has(routeId));
  if (missing.length > 0) {
    throw new Error(`pooled-reserve V4 Ergo legacy-route profile omits ${missing.join(', ')}`);
  }
  return deepFreeze(routes.sort((left, right) =>
    left.routeId.localeCompare(right.routeId)
  ));
}

function normalizeInstance(
  value: unknown,
  routeId: string,
  index: number,
  network: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['network'],
): ValidityApplicationPooledReserveErgoLegacyRouteProfileV4['routes'][number]['instances'][number] {
  const record = assertExactDataObject(value, [
    'instanceId',
    'address',
    'ergoTreeHex',
    'ergoTreeSha256Hex',
    'singletonTokenIdHex',
    'genesisBoxIdHex',
  ], `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index}`);
  const instanceId = stableInstanceId(
    record.instanceId,
    `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} ID`,
  );
  const address = nonemptyAscii(
    record.address,
    `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} address`,
  );
  const ergoTreeHex = nonzeroVariableHex(
    record.ergoTreeHex,
    `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} ErgoTree`,
  );
  const ergoTreeSha256Hex = nonzeroFixedHex(
    record.ergoTreeSha256Hex,
    32,
    `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} ErgoTree SHA-256`,
  );
  if (sha256Bytes(ergoTreeHex) !== ergoTreeSha256Hex) {
    throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} ErgoTree hash does not match its bytes`);
  }
  let decoded: ErgoAddress;
  try {
    decoded = ErgoAddress.fromBase58(address);
  } catch {
    throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} address is invalid`);
  }
  if (Number(decoded.network) !== network.addressNetworkPrefix) {
    throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} address network differs from the profile`);
  }
  if (Number(decoded.type) !== AddressType.P2S) {
    throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} address must be P2S`);
  }
  if (decoded.ergoTree.toLowerCase() !== ergoTreeHex) {
    throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} address does not encode its ErgoTree`);
  }
  const singletonTokenIdHex = nullableNonzeroFixedHex(
    record.singletonTokenIdHex,
    32,
    `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} singleton token ID`,
  );
  const genesisBoxIdHex = nullableNonzeroFixedHex(
    record.genesisBoxIdHex,
    32,
    `pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} genesis box ID`,
  );
  if ((singletonTokenIdHex === null) !== (genesisBoxIdHex === null)) {
    throw new Error(`pooled-reserve V4 Ergo legacy route ${routeId} instance ${index} singleton token and genesis box identities must be supplied together`);
  }
  return {
    instanceId,
    address,
    ergoTreeHex,
    ergoTreeSha256Hex,
    singletonTokenIdHex,
    genesisBoxIdHex,
  };
}

function assertCrossRouteUnique(
  assignments: Map<string, string>,
  value: string,
  routeId: string,
  label: string,
): void {
  const prior = assignments.get(value);
  if (prior !== undefined && prior !== routeId) {
    throw new Error(`pooled-reserve V4 Ergo legacy ${label} ${value} is assigned to both ${prior} and ${routeId}`);
  }
  if (prior === undefined) assignments.set(value, routeId);
}

function assertRepeatedScriptInstancesAreDistinguishable(
  instances: ValidityApplicationPooledReserveErgoLegacyRouteProfileV4[
    'routes'
  ][number]['instances'],
  routeId: string,
): void {
  const byAddress = new Map<string, typeof instances>();
  for (const instance of instances) {
    const group = byAddress.get(instance.address) ?? [];
    byAddress.set(instance.address, [...group, instance]);
  }
  for (const group of byAddress.values()) {
    if (
      group.length > 1
      && group.some(instance =>
        instance.singletonTokenIdHex === null
        || instance.genesisBoxIdHex === null
      )
    ) {
      throw new Error(
        `pooled-reserve V4 Ergo legacy route ${routeId} repeats one script without exact singleton lineage identities`,
      );
    }
  }
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
  return value as Record<string, unknown>;
}

function oneOf<T extends string | number>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (!values.includes(value as T)) {
    throw new Error(`${label} is invalid`);
  }
  return value as T;
}

function nonemptyAscii(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || !Buffer.from(value, 'utf8').equals(Buffer.from(value, 'ascii'))
  ) {
    throw new Error(`${label} must be non-empty ASCII`);
  }
  return value;
}

function stableInstanceId(value: unknown, label: string): string {
  const normalized = nonemptyAscii(value, label);
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(normalized)) {
    throw new Error(`${label} must be a stable lowercase ASCII identifier`);
  }
  return normalized;
}

function nonzeroFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
    || /^0+$/.test(normalized)
  ) {
    throw new Error(`${label} must be nonzero ${bytes} bytes of hex`);
  }
  return normalized;
}

function nullableNonzeroFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string | null {
  return value === null ? null : nonzeroFixedHex(value, bytes, label);
}

function nonzeroVariableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be nonzero even-length hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
    || /^0+$/.test(normalized)
  ) {
    throw new Error(`${label} must be nonzero even-length hex`);
  }
  return normalized;
}

function sha256Bytes(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function assertSortedUnique(values: readonly string[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]!.localeCompare(values[index]!) >= 0) {
      throw new Error(`${label} must be lexically sorted and unique`);
    }
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
