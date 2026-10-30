import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
} from '../ergo-settlement-core/strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_BINDING_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-bootstrap-request-binding.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_CAMPAIGN_BINDING_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-bootstrap-request-campaign-binding.v1' as const;

const MAX_REQUEST_BYTES = 1024 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const REQUEST_BINDINGS = new WeakMap<object, Readonly<{
  readonly requestSha256Hex: string;
  readonly build: object;
  readonly lifecycle: object;
  readonly inputDigestHex: string;
}>>();
const CONSUMED_REQUEST_BINDINGS = new WeakSet<object>();
const CAMPAIGN_BINDINGS = new WeakMap<object, Readonly<{
  readonly requestSha256Hex: string;
  readonly build: object;
  readonly lifecycle: object;
  readonly inputDigestHex: string;
}>>();
const CONSUMED_CAMPAIGN_BINDINGS = new WeakSet<object>();

export interface SubstrateFederatedIsolatedDevnetBootstrapRequestInputIdentityV1 {
  readonly build: object;
  readonly lifecycle: object;
}

export interface SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_BINDING_V1_SCHEMA;
  readonly version: 1;
  readonly requestSha256Hex: string;
}

export interface SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_CAMPAIGN_BINDING_V1_SCHEMA;
  readonly version: 1;
  readonly requestSha256Hex: string;
}

/**
 * Issue process provenance only after the exact canonical request bytes have
 * been read and matched to the parent-provided digest.
 */
export function bindSubstrateFederatedIsolatedDevnetCanonicalBootstrapRequestBytesV1(
  requestBytes: Uint8Array,
  expectedRequestSha256Hex: string,
  input:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestInputIdentityV1>,
): Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1> {
  if (!/^[0-9a-f]{64}$/u.test(expectedRequestSha256Hex)) {
    throw new Error('bootstrap request binding digest is invalid');
  }
  if (
    requestBytes.byteLength === 0
    || requestBytes.byteLength > MAX_REQUEST_BYTES
  ) {
    throw new Error('bootstrap request binding bytes are outside bounds');
  }
  let source: string;
  try {
    source = UTF8_DECODER.decode(requestBytes);
  } catch {
    throw new Error('bootstrap request binding bytes must be valid UTF-8');
  }
  assertNoDuplicateJsonKeys(source);
  const parsed = JSON.parse(source) as unknown;
  if (source !== `${canonicalJson(parsed)}\n`) {
    throw new Error(
      'bootstrap request binding bytes must use canonical JSON plus one LF',
    );
  }
  const actualRequestSha256Hex = createHash('sha256')
    .update(requestBytes)
    .digest('hex');
  if (actualRequestSha256Hex !== expectedRequestSha256Hex) {
    throw new Error('bootstrap request binding bytes changed after validation');
  }
  const build = requirePlainFrozenGraph(input.build, 'build');
  const lifecycle = requirePlainFrozenGraph(input.lifecycle, 'lifecycle');
  const inputDigestHex = digestRequestInput(build, lifecycle);
  const binding = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_BINDING_V1_SCHEMA,
    version: 1 as const,
    requestSha256Hex: actualRequestSha256Hex,
  });
  REQUEST_BINDINGS.set(binding, Object.freeze({
    requestSha256Hex: actualRequestSha256Hex,
    build,
    lifecycle,
    inputDigestHex,
  }));
  return binding;
}

export function claimSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1>,
  input:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestInputIdentityV1>,
): Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1> {
  const material = requireFreshRequestBinding(binding);
  if (
    input.build !== material.build
    || input.lifecycle !== material.lifecycle
  ) {
    throw new Error(
      'bootstrap request binding does not match the exact parsed root input',
    );
  }
  assertFrozenPlainGraph(material.build, 'build');
  assertFrozenPlainGraph(material.lifecycle, 'lifecycle');
  if (
    digestRequestInput(material.build, material.lifecycle)
      !== material.inputDigestHex
  ) {
    throw new Error('bootstrap request root input changed after validation');
  }
  CONSUMED_REQUEST_BINDINGS.add(binding);
  const campaignBinding = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_CAMPAIGN_BINDING_V1_SCHEMA,
    version: 1 as const,
    requestSha256Hex: material.requestSha256Hex,
  });
  CAMPAIGN_BINDINGS.set(campaignBinding, material);
  return campaignBinding;
}

export function projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1(
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1>,
): string {
  return requireFreshCampaignBinding(binding);
}

export function consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1(
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1>,
): string {
  const requestSha256Hex = requireFreshCampaignBinding(binding);
  CONSUMED_CAMPAIGN_BINDINGS.add(binding);
  return requestSha256Hex;
}

function requireFreshRequestBinding(
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1>,
): Readonly<{
  readonly requestSha256Hex: string;
  readonly build: object;
  readonly lifecycle: object;
  readonly inputDigestHex: string;
}> {
  if (
    binding === null
    || typeof binding !== 'object'
    || !Object.isFrozen(binding)
    || CONSUMED_REQUEST_BINDINGS.has(binding)
  ) {
    throw new Error(
      'bootstrap request binding lacks fresh process provenance',
    );
  }
  const material = REQUEST_BINDINGS.get(binding);
  if (
    material === undefined
    || binding.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_BINDING_V1_SCHEMA
    || binding.version !== 1
    || binding.requestSha256Hex !== material.requestSha256Hex
  ) {
    throw new Error('bootstrap request binding changed');
  }
  return material;
}

function requireFreshCampaignBinding(
  binding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1>,
): string {
  if (
    binding === null
    || typeof binding !== 'object'
    || !Object.isFrozen(binding)
    || CONSUMED_CAMPAIGN_BINDINGS.has(binding)
  ) {
    throw new Error(
      'bootstrap request campaign binding lacks fresh process provenance',
    );
  }
  const material = CAMPAIGN_BINDINGS.get(binding);
  if (
    material === undefined
    || binding.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_REQUEST_CAMPAIGN_BINDING_V1_SCHEMA
    || binding.version !== 1
    || binding.requestSha256Hex !== material.requestSha256Hex
  ) {
    throw new Error('bootstrap request campaign binding changed');
  }
  assertFrozenPlainGraph(material.build, 'build');
  assertFrozenPlainGraph(material.lifecycle, 'lifecycle');
  if (
    digestRequestInput(material.build, material.lifecycle)
      !== material.inputDigestHex
  ) {
    throw new Error('bootstrap request root input changed after validation');
  }
  return material.requestSha256Hex;
}

function requirePlainFrozenGraph(value: object, label: string): object {
  freezePlainGraph(value, label, new WeakSet<object>());
  return value;
}

function freezePlainGraph(
  value: unknown,
  label: string,
  visited: WeakSet<object>,
): void {
  if (value === null || typeof value !== 'object') {
    if (
      typeof value === 'function'
      || typeof value === 'symbol'
      || typeof value === 'undefined'
    ) {
      throw new Error(`bootstrap request ${label} contains non-data values`);
    }
    return;
  }
  if (value instanceof Uint8Array) return;
  if (visited.has(value)) {
    throw new Error(`bootstrap request ${label} contains a cycle`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    throw new Error(`bootstrap request ${label} must contain plain data`);
  }
  visited.add(value);
  for (const child of Object.values(value)) {
    freezePlainGraph(child, label, visited);
  }
  Object.freeze(value);
}

function assertFrozenPlainGraph(value: object, label: string): void {
  const pending: object[] = [value];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current instanceof Uint8Array) continue;
    const prototype = Object.getPrototypeOf(current);
    if (
      !Object.isFrozen(current)
      || (prototype !== Object.prototype && prototype !== Array.prototype)
    ) {
      throw new Error(`bootstrap request ${label} changed after validation`);
    }
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') pending.push(child);
      if (
        typeof child === 'function'
        || typeof child === 'symbol'
        || typeof child === 'undefined'
      ) {
        throw new Error(`bootstrap request ${label} contains non-data values`);
      }
    }
  }
}

function digestRequestInput(build: object, lifecycle: object): string {
  return createHash('sha256')
    .update(canonicalJson(encodeGraph({ build, lifecycle }, new WeakSet())))
    .digest('hex');
}

function encodeGraph(value: unknown, visited: WeakSet<object>): unknown {
  if (value === null) return ['null'];
  if (typeof value === 'string') return ['string', value];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'bigint') return ['bigint', value.toString(10)];
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return ['integer', value];
  }
  if (value instanceof Uint8Array) {
    return [
      'bytes',
      value.byteLength,
      createHash('sha256').update(value).digest('hex'),
    ];
  }
  if (
    typeof value !== 'object'
    || value === undefined
    || visited.has(value)
  ) {
    throw new Error('bootstrap request root input is not canonical plain data');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    throw new Error('bootstrap request root input is not canonical plain data');
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error('bootstrap request root input contains symbol fields');
  }
  visited.add(value);
  if (Array.isArray(value)) {
    return ['array', value.map(child => encodeGraph(child, visited))];
  }
  const record = value as Record<string, unknown>;
  return [
    'object',
    Object.keys(record).sort().map(key => [
      key,
      encodeGraph(record[key], visited),
    ]),
  ];
}
