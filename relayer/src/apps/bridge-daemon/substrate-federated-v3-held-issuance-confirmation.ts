import { createBoundedAuthenticatedSpvTrackerReadOnlySource }
  from '../../authenticated-spv-tracker-read-only-node-client.js';
import {
  ERGO_FULL_BLOCK_HEADER_PROOF_MAX_ROWS_V1,
  assertErgoFullBlockHeaderProofV1,
  parseErgoFullBlockObservationV1,
} from '../../ergo-settlement-core/ergo-full-block-observation-v1.js';
import { canonicalJson } from '../../ergo-settlement-core/strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
} from '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { normalizeEip12Box, type Eip12Box } from '../../unsigned-ergo-transaction.js';

export interface SubstrateFederatedV3HeldIssuanceSnapshot {
  readonly fullHeight: number;
  readonly headerIdHex: string;
}

export interface SubstrateFederatedV3IssuanceConfirmation {
  readonly confirmationHeight: number;
  readonly confirmationHeaderIdHex: string;
}

export interface SubstrateFederatedV3HeldIssuanceBoxExpectation {
  readonly sourceBoxIdHex: string;
  readonly singletonOutput: Readonly<Eip12Box>;
}

/** Confirm the original V3 issuance receipts under one live, held full-block tip. */
export async function assertSubstrateFederatedV3HeldIssuanceConfirmations(
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  held: Readonly<SubstrateFederatedV3HeldIssuanceSnapshot>,
  confirmations: readonly Readonly<SubstrateFederatedV3IssuanceConfirmation>[],
  issuanceBoxes: readonly Readonly<SubstrateFederatedV3HeldIssuanceBoxExpectation>[],
  assertCustody: () => void,
): Promise<void> {
  const assertActive = () => {
    assertCustody();
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  };
  const refuse = () => new Error('FED V3 issuance is not canonical under its held snapshot');
  assertActive();
  if (!Number.isSafeInteger(held.fullHeight) || held.fullHeight <= 0
    || typeof held.headerIdHex !== 'string' || !/^[0-9a-f]{64}$/u.test(held.headerIdHex)
    || !Array.isArray(confirmations) || confirmations.length !== 3
    || !Array.isArray(issuanceBoxes) || issuanceBoxes.length !== 3) throw refuse();

  const sourceIds = new Set<string>();
  const outputIds = new Set<string>();
  for (const issuance of issuanceBoxes) {
    if (issuance === null || typeof issuance !== 'object'
      || typeof issuance.sourceBoxIdHex !== 'string'
      || !/^[0-9a-f]{64}$/u.test(issuance.sourceBoxIdHex)
      || issuance.singletonOutput === null || typeof issuance.singletonOutput !== 'object'
      || typeof issuance.singletonOutput.boxId !== 'string'
      || !/^[0-9a-f]{64}$/u.test(issuance.singletonOutput.boxId)
      || sourceIds.has(issuance.sourceBoxIdHex)
      || outputIds.has(issuance.singletonOutput.boxId)) throw refuse();
    sourceIds.add(issuance.sourceBoxIdHex);
    outputIds.add(issuance.singletonOutput.boxId);
  }

  const expected = new Map<number, string>();
  for (const confirmation of confirmations) {
    const { confirmationHeight, confirmationHeaderIdHex } = confirmation;
    if (!Number.isSafeInteger(confirmationHeight) || confirmationHeight <= 0
      || confirmationHeight > held.fullHeight
      || typeof confirmationHeaderIdHex !== 'string'
      || !/^[0-9a-f]{64}$/u.test(confirmationHeaderIdHex)
      || (expected.has(confirmationHeight)
        && expected.get(confirmationHeight) !== confirmationHeaderIdHex)) throw refuse();
    expected.set(confirmationHeight, confirmationHeaderIdHex);
  }

  const clients = [target.primaryNodeOrigin, target.witnessNodeOrigin]
    .map(origin => createBoundedAuthenticatedSpvTrackerReadOnlySource(origin));
  const assertHeldTips = async () => {
    const tips = await settleStarted(clients.map(async client => {
      const read = async (operation: () => Promise<unknown>) => {
        assertActive();
        const value = await operation();
        assertActive();
        return value;
      };
      const [info, header] = await settleStarted([
        read(() => client.getInfo()), read(() => client.getBestHeader()),
      ]);
      assertActive();
      const observation = parseErgoFullBlockObservationV1(info, header);
      if (observation === undefined || observation.fullHeight !== held.fullHeight
        || observation.fullHeaderIdHex !== held.headerIdHex) throw refuse();
      const [ids, ancestry] = await settleStarted([
        read(() => client.getBlockHeaderIdsAtHeight(held.fullHeight)),
        read(() => client.getBlockHeaderChainSlice(held.fullHeight - 1, observation.bestHeader.height)),
      ]);
      assertActive();
      return assertErgoFullBlockHeaderProofV1(observation, ids, ancestry);
    }));
    assertActive();
    if (tips[0]!.parentId !== tips[1]!.parentId) throw refuse();
  };

  const begun: typeof clients = [];
  let failure: unknown;
  let failed = false;
  try {
    for (const client of clients) {
      if (typeof client.beginAuthenticatedTrackerReconstruction !== 'function'
        || typeof client.endAuthenticatedTrackerReconstruction !== 'function') throw refuse();
    }
    for (const client of clients) {
      assertActive();
      client.beginAuthenticatedTrackerReconstruction!();
      begun.push(client);
      assertActive();
    }
    await assertHeldTips();
    assertActive();

    const minimumHeight = Math.min(...expected.keys());
    const visited = new Set<string>();
    let currentId = held.headerIdHex;
    for (let upperHeight = held.fullHeight; upperHeight >= minimumHeight;) {
      assertActive();
      const fromHeight = Math.max(minimumHeight - 1,
        upperHeight - ERGO_FULL_BLOCK_HEADER_PROOF_MAX_ROWS_V1);
      const expectedLength = upperHeight - fromHeight;
      const slices = await settleStarted(clients.map(async client => {
        assertActive();
        const slice = await client.getBlockHeaderChainSlice(fromHeight, upperHeight);
        assertActive();
        if (!Array.isArray(slice) || slice.length !== expectedLength) throw refuse();
        return slice;
      }));
      assertActive();
      for (let height = upperHeight; height > fromHeight; height--) {
        assertActive();
        if (visited.has(currentId)) throw refuse();
        visited.add(currentId);
        const parents = slices.map(slice => {
          const header = asRecord(slice[height - fromHeight - 1]);
          if (header.id !== currentId || header.height !== height
            || typeof header.parentId !== 'string'
            || !/^[0-9a-f]{64}$/u.test(header.parentId)
            || header.parentId === currentId) throw refuse();
          return header.parentId;
        });
        if (parents[0] !== parents[1]) throw refuse();
        const confirmationId = expected.get(height);
        if (confirmationId !== undefined) {
          if (currentId !== confirmationId) throw refuse();
          await settleStarted(clients.map(async client => {
            assertActive();
            const ids = await client.getBlockHeaderIdsAtHeight(height);
            assertActive();
            if (!Array.isArray(ids) || ids.length === 0 || ids[0] !== confirmationId
              || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{64}$/u.test(id))
              || new Set(ids).size !== ids.length) throw refuse();
          }));
          assertActive();
        }
        currentId = parents[0]!;
      }
      upperHeight = fromHeight;
    }
    await settleStarted(clients.flatMap(client => issuanceBoxes.map(async issuance => {
      assertActive();
      const source = await client.getBoxByIdOrNull(issuance.sourceBoxIdHex);
      assertActive();
      if (source !== null) throw refuse();
      const rawOutput = await client.getBoxByIdOrNull(issuance.singletonOutput.boxId);
      assertActive();
      if (rawOutput === null) throw refuse();
      const output = await normalizeEip12Box(rawOutput, 'FED V3 singleton output');
      assertActive();
      if (canonicalJson(output) !== canonicalJson(issuance.singletonOutput)
        || output.creationHeight > held.fullHeight) throw refuse();
    })));
    assertActive();
    await assertHeldTips();
    assertActive();
  } catch (cause) {
    failed = true;
    failure = cause;
  }

  const cleanupFailures: unknown[] = [];
  for (const client of begun) {
    try { client.endAuthenticatedTrackerReconstruction!(); }
    catch (cause) { cleanupFailures.push(cause); }
  }
  if (cleanupFailures.length !== 0) {
    throw new AggregateError(failed ? [failure, ...cleanupFailures] : cleanupFailures,
      'FED V3 issuance confirmation observation scope failed');
  }
  if (failed) throw failure;
}

async function settleStarted<T>(reads: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(reads);
  const values: T[] = [];
  for (const result of settled) {
    if (result.status === 'rejected') throw result.reason;
    values.push(result.value);
  }
  return values;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('FED V3 issuance header must be a record');
  }
  return value as Record<string, unknown>;
}
