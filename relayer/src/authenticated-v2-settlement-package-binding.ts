import { createHash } from 'crypto';

import {
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance,
  type PreparedAuthenticatedSettlementUnsignedTx,
} from './aggregate-settlement-service.js';
import {
  validateAuthenticatedV2UnsignedSettlementPackage,
} from './authenticated-v2-unsigned-settlement-package.js';

const PACKAGE_BOUND_AUTHENTICATED_SETTLEMENTS = new WeakMap<object, string>();

export interface PackageBoundAuthenticatedSettlement {
  packageDigestHex: string;
  readinessReportDigestHex: string;
  companionDigestHex: string;
  eip12Sha256Hex: string;
  expectedTxId: string;
  prepared: PreparedAuthenticatedSettlementUnsignedTx;
}

export function assertJournaledUnsignedSettlementPackageDigest(
  expectedPackageDigestHex: string,
  journaledPackageDigestHex: string | null,
): void {
  const expected = fixedHex(
    expectedPackageDigestHex,
    32,
    'expected unsigned settlement package digest',
  );
  if (journaledPackageDigestHex === null) return;
  const journaled = fixedHex(
    journaledPackageDigestHex,
    32,
    'journaled unsigned settlement package digest',
  );
  if (journaledPackageDigestHex !== journaled) {
    throw new Error('journaled unsigned settlement package digest must use canonical lowercase hex');
  }
  if (journaled !== expected) {
    throw new Error('expected unsigned settlement package digest conflicts with the journaled check');
  }
}

export async function bindAuthenticatedV2UnsignedSettlementPackage(input: {
  packageValue: unknown;
  expectedPackageDigestHex: string;
  expectedTxId: string;
  prepared: PreparedAuthenticatedSettlementUnsignedTx;
}): Promise<PackageBoundAuthenticatedSettlement> {
  const expectedPackageDigestHex = fixedHex(
    input.expectedPackageDigestHex,
    32,
    'expected unsigned settlement package digest',
  );
  const expectedTxId = fixedHex(
    input.expectedTxId,
    32,
    'revalidated unsigned transaction ID',
  );
  const pkg = await validateAuthenticatedV2UnsignedSettlementPackage(input.packageValue);
  if (pkg.packageDigestHex !== expectedPackageDigestHex) {
    throw new Error('unsigned settlement package does not match the explicitly expected digest');
  }
  if (pkg.transaction.unsignedTransactionIdHex !== expectedTxId) {
    throw new Error('unsigned settlement package transaction ID does not match the revalidated candidate');
  }

  assertPreparedAuthenticatedSettlementUnsignedTxProvenance(input.prepared);
  assertPackageMatchesPreparedSettlement(pkg, input.prepared);

  const binding = Object.freeze({
    packageDigestHex: pkg.packageDigestHex,
    readinessReportDigestHex: pkg.source.readinessReportDigestHex,
    companionDigestHex: pkg.source.companionDigestHex,
    eip12Sha256Hex: pkg.transaction.eip12Sha256Hex,
    expectedTxId,
    prepared: input.prepared,
  });
  PACKAGE_BOUND_AUTHENTICATED_SETTLEMENTS.set(
    binding,
    sha256Canonical(normalizeEip12(input.prepared.eip12Tx)),
  );
  return binding;
}

export function assertPackageBoundAuthenticatedSettlementProvenance(
  value: unknown,
): asserts value is PackageBoundAuthenticatedSettlement {
  if (
    typeof value !== 'object'
    || value === null
    || !PACKAGE_BOUND_AUTHENTICATED_SETTLEMENTS.has(value)
  ) {
    throw new Error('package-bound authenticated settlement provenance is missing');
  }
  const binding = value as PackageBoundAuthenticatedSettlement;
  if (
    sha256Canonical(normalizeEip12(binding.prepared.eip12Tx))
    !== PACKAGE_BOUND_AUTHENTICATED_SETTLEMENTS.get(value)
  ) {
    throw new Error('package-bound authenticated settlement transaction changed after binding');
  }
}

function assertPackageMatchesPreparedSettlement(
  pkg: Awaited<ReturnType<typeof validateAuthenticatedV2UnsignedSettlementPackage>>,
  prepared: PreparedAuthenticatedSettlementUnsignedTx,
): void {
  const preparedEip12 = normalizeEip12(prepared.eip12Tx);
  const packageEip12 = normalizeEip12(pkg.transaction.eip12);
  if (canonicalJson(preparedEip12) !== canonicalJson(packageEip12)) {
    throw new Error(
      `unsigned settlement package EIP-12 transaction differs from the freshly prepared candidate at ${firstDifferencePath(packageEip12, preparedEip12)}`,
    );
  }
  const guard = {
    status: prepared.contextExtensionGuard.status,
    reason: prepared.contextExtensionGuard.reason,
    effectiveThreshold: prepared.contextExtensionGuard.effectiveThreshold,
    offenderCount: prepared.contextExtensionGuard.offenders.length,
    signingPermitted: false as const,
    broadcastPermitted: false as const,
  };
  if (canonicalJson(guard) !== canonicalJson(pkg.transaction.contextExtensionGuard)) {
    throw new Error('unsigned settlement package ContextExtension guard differs from the freshly prepared candidate');
  }

  const claims = prepared.plan.claims;
  if (claims.length !== 1) {
    throw new Error('package-bound authenticated settlement requires exactly one prepared claim');
  }
  const claim = claims[0];
  const target = pkg.targetBurn;
  const trackerIdentity = claim.claim.trackerIdentity;
  const settlementIdentity = claim.settlementIdentity;
  const pegOut = claim.claim.pegOut;
  const exactBindings = [
    ['burn ID', fixedHex(claim.duplicatePreventionKeyHex, 32, 'prepared burn ID'), target.burnIdHex],
    ['settlement duplicate-prevention key', fixedHex(settlementIdentity.duplicatePreventionKeyHex, 32, 'prepared settlement duplicate-prevention key'), target.burnIdHex],
    ['sidechain ID', fixedHex(trackerIdentity.sidechainIdHex, 32, 'prepared sidechain ID'), target.sidechainIdHex],
    ['execution block hash', fixedHex(trackerIdentity.sidechainHeaderHashHex, 32, 'prepared execution block hash'), target.executionBlockHashHex],
    ['sidechain transaction hash', fixedHex(pegOut.sidechainTxHash, 32, 'prepared sidechain transaction hash'), target.sidechainTxHashHex],
    ['bridge event root', fixedHex(settlementIdentity.bridgeEventRootHex, 32, 'prepared bridge event root'), target.bridgeEventRootHex],
    ['recipient ErgoTree', variableHex(prepared.recipientErgoTreeHex, 'prepared recipient ErgoTree'), target.recipientErgoTreeHex],
    ['recipient ErgoTree hash', fixedHex(settlementIdentity.recipientErgoTreeHashHex, 32, 'prepared recipient ErgoTree hash'), target.recipientErgoTreeHashHex],
    ['asset ID', fixedHex(settlementIdentity.assetIdHex, 32, 'prepared asset ID'), target.assetIdHex],
    ['tracker key', fixedHex(claim.trackerKeyHex, 32, 'prepared tracker key'), pkg.trackerHistory[target.trackerEntryIndex].key],
    ['tracker value', variableHex(claim.trackerValueHex, 'prepared tracker value'), pkg.trackerHistory[target.trackerEntryIndex].value],
    ['DUP input digest', variableHex(prepared.plan.dupInputDigestHex, 'prepared DUP input digest'), pkg.duplicatePrevention.currentDigestHex],
    ['tracker box ID', fixedHex(prepared.trackerBox.boxId, 32, 'prepared tracker box ID'), pkg.canonicalInputBytes.trackerDataInput.boxIdHex],
    ['DUP box ID', fixedHex(prepared.authenticatedDupBox.boxId, 32, 'prepared DUP box ID'), pkg.canonicalInputBytes.duplicatePreventionInput.boxIdHex],
    ['vault box ID', fixedHex(prepared.unlockBox.boxId, 32, 'prepared vault box ID'), pkg.canonicalInputBytes.vaultInput.boxIdHex],
  ] as const;
  for (const [label, actual, expected] of exactBindings) {
    if (actual !== expected) {
      throw new Error(`unsigned settlement package ${label} differs from the freshly prepared candidate`);
    }
  }
  if (BigInt(trackerIdentity.sidechainHeight) !== BigInt(target.sidechainHeight)) {
    throw new Error('unsigned settlement package sidechain height differs from the freshly prepared candidate');
  }
  if (pegOut.sidechainBlockNumber !== Number(target.sidechainHeight)) {
    throw new Error('unsigned settlement package peg-out height differs from the freshly prepared candidate');
  }
  if (pegOut.sidechainLogIndex !== target.eventIndex) {
    throw new Error('unsigned settlement package event index differs from the freshly prepared candidate');
  }
  if (BigInt(pegOut.amount) !== BigInt(target.amountNanoErg)) {
    throw new Error('unsigned settlement package payout amount differs from the freshly prepared candidate');
  }
  if (BigInt(settlementIdentity.amountNanoErg ?? -1) !== BigInt(target.amountNanoErg)) {
    throw new Error('unsigned settlement package settlement amount differs from the freshly prepared candidate');
  }
  if (
    canonicalJson(settlementIdentity.trustlessBurnProof ?? [])
    !== canonicalJson(target.inclusion.proof)
  ) {
    throw new Error('unsigned settlement package burn proof differs from the freshly prepared candidate');
  }

  assertContractIdentity(
    prepared.trackerBox,
    pkg.contracts.tracker.ergoTreeHex,
    pkg.contracts.tracker.nftId,
    'tracker',
  );
  assertContractIdentity(
    prepared.authenticatedDupBox,
    pkg.contracts.duplicatePrevention.ergoTreeHex,
    pkg.contracts.duplicatePrevention.nftId,
    'DUP',
  );
  if (
    variableHex(prepared.unlockBox.ergoTree, 'prepared vault ErgoTree')
    !== pkg.contracts.vault.ergoTreeHex
  ) {
    throw new Error('unsigned settlement package vault contract differs from the freshly prepared candidate');
  }
}

function assertContractIdentity(
  box: { ergoTree: string; assets?: Array<{ tokenId: string; amount: number | string | bigint }> },
  expectedErgoTreeHex: string,
  expectedNftIdHex: string,
  label: string,
): void {
  if (variableHex(box.ergoTree, `prepared ${label} ErgoTree`) !== expectedErgoTreeHex) {
    throw new Error(`unsigned settlement package ${label} contract differs from the freshly prepared candidate`);
  }
  if (
    box.assets?.length !== 1
    || fixedHex(box.assets[0].tokenId, 32, `prepared ${label} NFT ID`) !== expectedNftIdHex
    || BigInt(box.assets[0].amount) !== 1n
  ) {
    throw new Error(`unsigned settlement package ${label} singleton differs from the freshly prepared candidate`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, toJsonSafe(entry)]));
  }
  return value;
}

function normalizeEip12(value: unknown): unknown {
  const tx = toJsonSafe(value) as Record<string, unknown>;
  return {
    ...tx,
    inputs: normalizeBoxes(tx.inputs, 'inputs'),
    dataInputs: normalizeBoxes(tx.dataInputs, 'dataInputs'),
    outputs: normalizeBoxes(tx.outputs, 'outputs'),
  };
}

function normalizeBoxes(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`prepared EIP-12 ${label} must be an array`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`prepared EIP-12 ${label}[${index}] must be an object`);
    }
    const box = entry as Record<string, unknown>;
    return {
      ...box,
      ...(box.value === undefined ? {} : {
        value: canonicalInteger(box.value, `prepared EIP-12 ${label}[${index}].value`),
      }),
      ...(box.assets === undefined ? {} : {
        assets: normalizeAssets(box.assets, `prepared EIP-12 ${label}[${index}].assets`),
      }),
    };
  });
}

function normalizeAssets(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const asset = entry as Record<string, unknown>;
    return {
      ...asset,
      amount: canonicalInteger(asset.amount, `${label}[${index}].amount`),
    };
  });
}

function canonicalInteger(value: unknown, label: string): string {
  if (
    (typeof value !== 'number' || !Number.isSafeInteger(value))
    && typeof value !== 'string'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`${label} must be an integer`);
  }
  let normalized: bigint;
  try {
    normalized = BigInt(value as string | number | bigint);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
  if (normalized < 0n) throw new Error(`${label} must be non-negative`);
  return normalized.toString();
}

function firstDifferencePath(expected: unknown, actual: unknown, path = '$'): string {
  if (Object.is(expected, actual)) return path;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length`;
    for (let index = 0; index < expected.length; index += 1) {
      if (canonicalJson(expected[index]) !== canonicalJson(actual[index])) {
        return firstDifferencePath(expected[index], actual[index], `${path}[${index}]`);
      }
    }
    return path;
  }
  if (
    expected && typeof expected === 'object'
    && actual && typeof actual === 'object'
    && !Array.isArray(expected) && !Array.isArray(actual)
  ) {
    const expectedObject = expected as Record<string, unknown>;
    const actualObject = actual as Record<string, unknown>;
    const keys = [...new Set([
      ...Object.keys(expectedObject),
      ...Object.keys(actualObject),
    ])].sort();
    for (const key of keys) {
      if (!(key in expectedObject) || !(key in actualObject)) return `${path}.${key}`;
      if (canonicalJson(expectedObject[key]) !== canonicalJson(actualObject[key])) {
        return firstDifferencePath(expectedObject[key], actualObject[key], `${path}.${key}`);
      }
    }
  }
  return path;
}
