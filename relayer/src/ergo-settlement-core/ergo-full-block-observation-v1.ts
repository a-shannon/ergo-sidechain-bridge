export const ERGO_FULL_BLOCK_HEADER_PROOF_MAX_ROWS_V1 = 1024;
const MAX_ERGO_HEIGHT = 2_147_483_647;

export interface ErgoFullBlockHeaderTupleV1 {
  readonly id: string;
  readonly height: number;
  readonly parentId: string;
}

export interface ErgoFullBlockObservationV1 {
  readonly network: 'devnet';
  readonly fullHeight: number;
  readonly fullHeaderIdHex: string;
  readonly bestHeader: Readonly<ErgoFullBlockHeaderTupleV1>;
}

function ownData(value: unknown, name: string): unknown {
  if (value === null || typeof value !== 'object') {
    throw new Error('Ergo full-block observation requires records');
  }
  const field = Object.getOwnPropertyDescriptor(value, name);
  if (field === undefined) return undefined;
  if (!Object.hasOwn(field, 'value')) {
    throw new Error('Ergo full-block observation requires own data fields');
  }
  return field.value;
}

function height(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)
    || value < 1 || value > MAX_ERGO_HEIGHT) {
    throw new Error('Ergo full-block observation requires positive Scala Int heights');
  }
  return value;
}

function headerId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error('Ergo full-block observation requires lowercase header IDs');
  }
  return value;
}

function tuple(value: unknown): Readonly<ErgoFullBlockHeaderTupleV1> {
  if (Array.isArray(value)) throw new Error('Ergo full-block observation requires records');
  const id = headerId(ownData(value, 'id'));
  const parentId = headerId(ownData(value, 'parentId'));
  if (parentId === id) throw new Error('Ergo full-block observation rejects self parents');
  return Object.freeze({ id, height: height(ownData(value, 'height')), parentId });
}

export function parseErgoFullBlockObservationV1(
  info: unknown,
  bestHeaderValue: unknown,
): Readonly<ErgoFullBlockObservationV1> | undefined {
  if (Array.isArray(info)) throw new Error('Ergo full-block observation requires records');
  const network = ownData(info, 'network') ?? ownData(info, 'networkType');
  if (typeof network !== 'string' || network.trim().toLowerCase() !== 'devnet') {
    throw new Error('Ergo full-block observation requires the devnet network');
  }
  const fullHeight = height(ownData(info, 'fullHeight'));
  const fullHeaderIdHex = headerId(ownData(info, 'bestFullHeaderId'));
  const bestHeader = tuple(bestHeaderValue);
  if (bestHeader.height < fullHeight) return undefined;
  if (bestHeader.height === fullHeight && bestHeader.id !== fullHeaderIdHex) {
    throw new Error('Ergo full-block observation header contradicts its full block');
  }
  if (bestHeader.height - fullHeight + 1 > ERGO_FULL_BLOCK_HEADER_PROOF_MAX_ROWS_V1) {
    throw new Error('Ergo full-block observation exceeds its bounded header range');
  }
  return Object.freeze({ network: 'devnet', fullHeight, fullHeaderIdHex, bestHeader });
}

export function assertErgoFullBlockHeaderProofV1(
  observation: Readonly<ErgoFullBlockObservationV1>,
  headerIdsAtFullHeight: unknown,
  ancestry: unknown,
): Readonly<ErgoFullBlockHeaderTupleV1> {
  const checked = parseErgoFullBlockObservationV1({ network: observation.network,
    fullHeight: observation.fullHeight, bestFullHeaderId: observation.fullHeaderIdHex }, observation.bestHeader);
  if (checked === undefined) throw new Error('Ergo full-block observation is not complete');
  if (!Array.isArray(headerIdsAtFullHeight) || headerIdsAtFullHeight.length === 0) {
    throw new Error('Ergo full-block observation requires canonical-first header IDs');
  }
  const canonicalIds = new Set<string>();
  for (let index = 0; index < headerIdsAtFullHeight.length; index += 1) {
    const id = headerId(ownData(headerIdsAtFullHeight, String(index)));
    if (canonicalIds.has(id) || (index === 0 && id !== checked.fullHeaderIdHex)) {
      throw new Error('Ergo full-block observation requires distinct canonical-first header IDs');
    }
    canonicalIds.add(id);
  }
  const width = checked.bestHeader.height - checked.fullHeight + 1;
  if (!Array.isArray(ancestry) || ancestry.length !== width) {
    throw new Error('Ergo full-block observation header ancestry is incomplete');
  }
  const seen = new Set<string>();
  let first: Readonly<ErgoFullBlockHeaderTupleV1> | undefined;
  let previous: Readonly<ErgoFullBlockHeaderTupleV1> | undefined;
  for (let index = 0; index < ancestry.length; index += 1) {
    const current = tuple(ownData(ancestry, String(index)));
    if (current.height !== checked.fullHeight + index || seen.has(current.id)
      || (previous !== undefined && current.parentId !== previous.id)) {
      throw new Error('Ergo full-block observation header ancestry is discontinuous');
    }
    if (first === undefined) first = current;
    previous = current;
    seen.add(current.id);
  }
  if (first!.id !== checked.fullHeaderIdHex || seen.has(first!.parentId)
    || previous!.id !== checked.bestHeader.id || previous!.height !== checked.bestHeader.height
    || previous!.parentId !== checked.bestHeader.parentId) {
    throw new Error('Ergo full-block observation header ancestry differs from its anchors');
  }
  return first!;
}
