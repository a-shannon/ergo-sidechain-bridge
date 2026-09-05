import axios, { type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Transport-only fixture, following tracker-transport-attempt-v1.test.ts.
// No real signer, process, authorization, durable journal, or check receipt is
// constructed. The two HTTP consumers and Axios transformations remain real.
const synthetic = vi.hoisted(() => {
  function freeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const binding = freeze({
    processBindingDigestHex: '41'.repeat(32),
    executionTargetIdentityDigestHex: '42'.repeat(32),
  });
  const target = freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true,
    witnessReadOnly: true,
    checkpointBound: true,
    reservationFreshnessCheckBound: true,
    trackerTransport: true,
    sameProcessCanonicalConfirmation: true,
  });
  const signedCandidate = freeze({
    profile: 'synthetic-signed-candidate',
    txId: '0d'.repeat(32),
    nodeOrigin: target.primaryNodeOrigin,
    signedTransactionDigestHex: '51'.repeat(32),
    signedTransactionBytesSha256Hex: '52'.repeat(32),
    signedTransactionBytesLength: 321,
    signerContext: { profile: 'synthetic-signer' },
  });
  const handle = freeze({
    ...signedCandidate,
    profile: 'synthetic-checked-submission-handle',
    checkResponseDigestHex: '53'.repeat(32),
    checkerIdentity: { profile: 'synthetic-checker' },
  });
  const signedTransaction = freeze({
    id: signedCandidate.txId,
    inputs: [{
      boxId: '0c'.repeat(32),
      spendingProof: {
        proofBytes: 'ab'.repeat(64),
        extension: { '0': '0400', '1': '0402', '10': '0e020001' },
      },
    }, {
      boxId: '0e'.repeat(32),
      spendingProof: { proofBytes: '', extension: {} },
    }],
    dataInputs: [{ boxId: '0f'.repeat(32) }],
    outputs: [{
      value: '9007199254740993',
      ergoTree: '10010100d17300',
      assets: [{ tokenId: '11'.repeat(32), amount: '9223372036854775807' }],
      additionalRegisters: { R4: '0e020001', R5: '0502' },
      creationHeight: 123,
    }],
  });
  const authorization = freeze({
    ...binding,
    expectedTransactionIdHex: signedCandidate.txId,
    signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      signedCandidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: signedCandidate.signedTransactionBytesLength,
    checkResponseDigestHex: handle.checkResponseDigestHex,
    authorizationDigestHex: '54'.repeat(32),
  });
  const executionCheck = freeze({
    signedCandidate,
    checkedAcceptance: { submissionHandle: handle },
  });
  const journal = freeze({ profile: 'synthetic-in-memory-journal' });
  const attempt = freeze({
    authorization,
    expectedTransactionIdHex: signedCandidate.txId,
    durableAttemptDigestHex: '55'.repeat(32),
  });
  const preflight = freeze({ profile: 'synthetic-preflight' });
  return {
    binding, target, signedCandidate, handle, signedTransaction,
    authorization, executionCheck, journal, attempt, preflight,
    claimed: false,
    consumed: false,
    preflightConsumed: false,
    events: [] as string[],
  };
});

vi.mock('../../fleet-signer.js', () => ({
  assertLocalWasmSignedCheckCandidateProvenance: (value: unknown) => {
    expect(value).toBe(synthetic.signedCandidate);
  },
  assertLocalWasmCheckedSubmissionHandleV1Provenance: (value: unknown) => {
    expect(value).toBe(synthetic.handle);
    expect(synthetic.consumed).toBe(false);
  },
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding: (
    handle: unknown, binding: unknown,
  ) => {
    expect(handle).toBe(synthetic.handle);
    expect(binding).toEqual(synthetic.binding);
  },
  consumeLocalWasmCheckedSubmissionHandleV1: async (
    handle: unknown,
    candidate: unknown,
    consume: (body: typeof synthetic.signedTransaction) => Promise<unknown>,
  ) => {
    expect(handle).toBe(synthetic.handle);
    expect(candidate).toBe(synthetic.signedCandidate);
    expect(synthetic.claimed).toBe(true);
    expect(synthetic.consumed).toBe(false);
    synthetic.consumed = true;
    synthetic.events.push('consume');
    return await consume(synthetic.signedTransaction);
  },
}));

vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2: (
    value: unknown,
  ) => {
    expect(value).toBe(synthetic.target);
    return synthetic.binding;
  },
}));

vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1: (
    check: unknown, target: unknown,
  ) => {
    expect(check).toBe(synthetic.executionCheck);
    expect(target).toBe(synthetic.target);
    return synthetic.binding;
  },
}));

// This otherwise imports unrelated authorization modules just for one constant.
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', () => ({
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKED_SUBMISSION_TRANSPORT_V1_SCHEMA:
    'e2s.substrate-federated-isolated-devnet-checked-submission-transport.v1',
}));

vi.mock('./substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1: (
    authorization: unknown, target: unknown, check: unknown,
  ) => {
    expect(authorization).toBe(synthetic.authorization);
    expect(target).toBe(synthetic.target);
    expect(check).toBe(synthetic.executionCheck);
  },
  claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1: (
    journal: unknown, attempt: unknown, authorization: unknown,
  ) => {
    expect(journal).toBe(synthetic.journal);
    expect(attempt).toBe(synthetic.attempt);
    expect(authorization).toBe(synthetic.authorization);
    expect(synthetic.claimed).toBe(false);
    synthetic.claimed = true;
    synthetic.events.push('claim');
    return { ...synthetic.attempt, status: 'pending' };
  },
  consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1: (
    preflight: unknown, binding: Record<string, unknown>,
  ) => {
    expect(preflight).toBe(synthetic.preflight);
    for (const key of [
      'target', 'executionCheck', 'authorization', 'journal', 'attempt',
    ] as const) expect(binding[key]).toBe(synthetic[key]);
    expect(synthetic.consumed).toBe(true);
    expect(synthetic.preflightConsumed).toBe(false);
    synthetic.preflightConsumed = true;
    synthetic.events.push('preflight');
  },
  issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1: (
    journal: unknown, attempt: unknown, result: unknown,
  ) => {
    expect(journal).toBe(synthetic.journal);
    expect(attempt).toBe(synthetic.attempt);
    expect(synthetic.preflightConsumed).toBe(true);
    synthetic.events.push('result');
    return result;
  },
}));

import {
  submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1 as submitChecked,
} from './substrate-federated-isolated-devnet-tracker-checked-transport-v1.js';

interface WireRequest {
  url: string | undefined;
  method: string | undefined;
  body: unknown;
  headers: ReturnType<InternalAxiosRequestConfig['headers']['toJSON']>;
  maxRedirects: number | undefined;
  proxy: InternalAxiosRequestConfig['proxy'];
}

const requests: WireRequest[] = [];
const originalAdapter = axios.defaults.adapter;
const originalTransform = axios.defaults.transformRequest;
const interceptorIds: number[] = [];
let ncheck: typeof import('../../ergo-helpers.js')['ncheck'];

beforeEach(async () => {
  synthetic.claimed = false;
  synthetic.consumed = false;
  synthetic.preflightConsumed = false;
  synthetic.events.length = 0;
  requests.length = 0;
  // Prevent even module-initialization access to real node configuration.
  vi.stubEnv('ERGO_NODE', synthetic.target.primaryNodeOrigin);
  vi.stubEnv('ERGO_API_KEY', 'synthetic-unused-key');
  axios.defaults.adapter = async config => {
    // Axios dispatchRequest has already applied its installed defaults here.
    requests.push({
      url: config.url,
      method: config.method,
      body: config.data,
      headers: config.headers.toJSON(),
      maxRedirects: config.maxRedirects,
      proxy: config.proxy,
    });
    const path = new URL(config.url!).pathname;
    expect(config.url).toBe(`${synthetic.target.primaryNodeOrigin}${path}`);
    expect(['/transactions/check', '/transactions']).toContain(path);
    synthetic.events.push(path);
    return {
      data: synthetic.signedCandidate.txId,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  ({ ncheck } = await import('../../ergo-helpers.js'));
});

afterEach(() => {
  interceptorIds.splice(0).forEach(id => axios.interceptors.request.eject(id));
  axios.defaults.adapter = originalAdapter;
  vi.unstubAllEnvs();
});

async function checkThenSubmit() {
  const before = structuredClone(synthetic.signedTransaction);
  const candidateBefore = structuredClone(synthetic.signedCandidate);
  expect(await ncheck(
    '/transactions/check',
    synthetic.signedTransaction,
    synthetic.target.primaryNodeOrigin,
    { redactResponseBodyOnError: true },
  )).toBe(synthetic.signedCandidate.txId);
  // The opaque capability doubles above deliberately do not claim that this
  // returned transaction ID establishes a real checked-submission acceptance.
  const result = await submitChecked({
    target: synthetic.target,
    executionCheck: synthetic.executionCheck,
    authorization: synthetic.authorization,
    journal: synthetic.journal,
    attempt: synthetic.attempt,
    preflight: synthetic.preflight,
  } as unknown as Parameters<typeof submitChecked>[0]);
  expect(result).toMatchObject({
    status: 'accepted',
    responseCategory: 'accepted',
    httpStatus: 200,
    submittedTransactionIdHex: synthetic.signedCandidate.txId,
  });
  expect(synthetic.events).toEqual([
    '/transactions/check', 'claim', 'consume', 'preflight',
    '/transactions', 'result',
  ]);
  expect(synthetic.signedTransaction).toEqual(before);
  expect(synthetic.signedCandidate).toEqual(candidateBefore);
  expect(axios.defaults.transformRequest).toBe(originalTransform);
  expect(requests).toHaveLength(2);
  requests.forEach(request => {
    expect(typeof request.body).toBe('string');
    expect(request.method).toBe('post');
    expect(request.maxRedirects).toBe(0);
    expect(request.proxy).toBe(false);
    expect(request.headers).not.toHaveProperty('api_key');
    expect(request.headers).not.toHaveProperty('Authorization');
  });
  expect(requests[0].url).toBe(`${synthetic.target.primaryNodeOrigin}/transactions/check`);
  expect(requests[1].url).toBe(`${synthetic.target.primaryNodeOrigin}/transactions`);
}

function assertWireParity() {
  const [check, submit] = requests;
  expect(submit.body).toBe(check.body);
  expect(Buffer.from(submit.body as string, 'utf8'))
    .toEqual(Buffer.from(check.body as string, 'utf8'));
  expect(check.headers['Content-Type']).toBe('application/json');
  expect(submit.headers['Content-Type']).toBe('application/json');
  expect(submit.headers).toEqual(check.headers);
}

describe('tracker check/checked-submit real Axios wire parity (no HTTP)', () => {
  it('serializes the same frozen candidate identically through both real consumers', async () => {
    await checkThenSubmit();
    assertWireParity();
    expect(JSON.parse(requests[0].body as string)).toEqual(synthetic.signedTransaction);
    expect(JSON.parse(requests[1].body as string)).toEqual(synthetic.signedTransaction);
  });

  it('refuses a nested candidate mutation and preserves subsequent wire parity', async () => {
    expect(Object.isFrozen(synthetic.signedTransaction)).toBe(true);
    expect(Object.isFrozen(synthetic.signedTransaction.inputs)).toBe(true);
    const extension = synthetic.signedTransaction.inputs[0].spendingProof.extension;
    expect(Object.isFrozen(extension)).toBe(true);
    expect(() => { extension['1'] = '0404'; }).toThrow(TypeError);
    await checkThenSubmit();
    assertWireParity();
  });

  it('detects one changed extension value before the real submission transform', async () => {
    interceptorIds.push(axios.interceptors.request.use(config => {
      if (config.url?.endsWith('/transactions')) {
        const changed = structuredClone(config.data);
        changed.inputs[0].spendingProof.extension['1'] = '0404';
        config.data = changed;
      }
      return config;
    }));
    await checkThenSubmit();
    expect(() => assertWireParity()).toThrow();
    expect(requests[1].headers).toEqual(requests[0].headers);
    const expected = structuredClone(synthetic.signedTransaction);
    expected.inputs[0].spendingProof.extension['1'] = '0404';
    expect(JSON.parse(requests[0].body as string)).toEqual(synthetic.signedTransaction);
    expect(JSON.parse(requests[1].body as string)).toEqual(expected);
  });

  it('detects content-type drift even when the real transforms emit identical JSON', async () => {
    interceptorIds.push(axios.interceptors.request.use(config => {
      if (config.url?.endsWith('/transactions')) {
        config.headers.setContentType('text/plain');
      }
      return config;
    }));
    await checkThenSubmit();
    expect(requests[1].body).toBe(requests[0].body);
    expect(requests[1].headers['Content-Type']).toBe('text/plain');
    expect(requests[1].headers).toEqual({
      ...requests[0].headers, 'Content-Type': 'text/plain',
    });
    expect(() => assertWireParity()).toThrow();
  });
});
