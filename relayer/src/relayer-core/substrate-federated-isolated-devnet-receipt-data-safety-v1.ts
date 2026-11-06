const FORBIDDEN_RECEIPT_DATA_KEYS = new Set([
  'apikey',
  'authorizationartifact',
  'authorize',
  'broadcast',
  'broadcastcapability',
  'checkerartifact',
  'dispose',
  'durableartifact',
  'miningcredential',
  'mnemonic',
  'observerartifact',
  'password',
  'privatekey',
  'privatekeyhex',
  'revalidationartifact',
  'seedphrase',
  'secretkey',
  'sign',
  'signedcandidate',
  'signedtransactionbytes',
  'signedtransactionbyteshex',
  'signedtransactionhex',
  'signedtx',
  'signerartifact',
  'signingcapability',
  'submissioncapability',
  'submissionhandle',
  'submit',
]);

export function assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(
  value: unknown,
): void {
  visit(value, new Set<object>(), new Set<object>());
}

function visit(
  value: unknown,
  seen: Set<object>,
  active: Set<object>,
): void {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(
      'isolated devnet receipt must contain capability-free plain data only',
    );
  }
  if (active.has(value)) {
    throw new Error('isolated devnet receipt must not contain cyclic data');
  }
  if (seen.has(value)) return;
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    isArray
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    throw new Error('isolated devnet receipt must not contain custom prototypes');
  }
  seen.add(value);
  active.add(value);
  const keys: PropertyKey[] = [
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertySymbols(value),
  ];
  if (keys.some(key => typeof key === 'symbol')) {
    throw new Error('isolated devnet receipt must not contain symbol-keyed data');
  }
  if (isArray) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, String(index))) {
        throw new Error('isolated devnet receipt must not contain sparse arrays');
      }
    }
  }
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new Error('isolated devnet receipt must not contain symbol-keyed data');
    }
    if (key === 'length' && isArray) continue;
    if (
      isArray
      && (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length)
    ) {
      throw new Error(
        'isolated devnet receipt must not contain non-index array fields',
      );
    }
    if (FORBIDDEN_RECEIPT_DATA_KEYS.has(key.toLowerCase())) {
      throw new Error(
        'isolated devnet receipt contains signed or capability material',
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      descriptor.get !== undefined
      || descriptor.set !== undefined
      || descriptor.enumerable !== true
    ) {
      throw new Error(
        'isolated devnet receipt must contain enumerable data fields only',
      );
    }
    visit(descriptor.value, seen, active);
  }
  active.delete(value);
}
