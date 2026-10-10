import {
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_RESPONSE_CLASSIFICATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-transport-response-classification.v1' as const;

const CLASSIFICATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_RESPONSE_CLASSIFICATION_V1';

export type SubstrateFederatedIsolatedDevnetTrackerTransportResponseCategoryV1 =
  | 'accepted'
  | 'ambiguous_success_response'
  | 'ambiguous_http_response'
  | 'ambiguous_no_response';

export interface SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_RESPONSE_CLASSIFICATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'accepted' | 'ambiguous';
  readonly responseCategory:
    SubstrateFederatedIsolatedDevnetTrackerTransportResponseCategoryV1;
  readonly httpStatus: number | null;
  readonly responseDigestHex: string;
  readonly classificationDigestHex: string;
}

export function createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
  input: Readonly<{
    readonly status: 'accepted' | 'ambiguous';
    readonly responseCategory:
      SubstrateFederatedIsolatedDevnetTrackerTransportResponseCategoryV1;
    readonly httpStatus: number | null;
    readonly responseDigestHex: string;
  }>,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
> {
  if (
    !isSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
      input.status,
      input.responseCategory,
      input.httpStatus,
    )
    || !/^[0-9a-f]{64}$/u.test(input.responseDigestHex)
  ) {
    throw new Error('tracker transport response classification changed');
  }
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_RESPONSE_CLASSIFICATION_V1_SCHEMA,
    version: 1 as const,
    status: input.status,
    responseCategory: input.responseCategory,
    httpStatus: input.httpStatus,
    responseDigestHex: input.responseDigestHex,
  });
  return Object.freeze({
    ...body,
    classificationDigestHex: sha256CanonicalJson(
      body,
      CLASSIFICATION_DIGEST_DOMAIN,
    ),
  });
}

export function assertSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('tracker transport response classification is invalid');
  }
  const classification = value as Record<string, unknown>;
  const keys = Object.keys(classification).sort();
  const expectedKeys = [
    'classificationDigestHex',
    'httpStatus',
    'responseCategory',
    'responseDigestHex',
    'schema',
    'status',
    'version',
  ];
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || classification.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TRANSPORT_RESPONSE_CLASSIFICATION_V1_SCHEMA
    || classification.version !== 1
    || !isSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
      classification.status,
      classification.responseCategory,
      classification.httpStatus,
    )
    || typeof classification.responseDigestHex !== 'string'
    || !/^[0-9a-f]{64}$/u.test(classification.responseDigestHex)
    || typeof classification.classificationDigestHex !== 'string'
    || classification.classificationDigestHex !== sha256CanonicalJson({
      schema: classification.schema,
      version: classification.version,
      status: classification.status,
      responseCategory: classification.responseCategory,
      httpStatus: classification.httpStatus,
      responseDigestHex: classification.responseDigestHex,
    }, CLASSIFICATION_DIGEST_DOMAIN)
  ) {
    throw new Error('tracker transport response classification changed');
  }
}

export function isSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
  status: unknown,
  responseCategory: unknown,
  httpStatus: unknown,
): boolean {
  const finiteStatus = Number.isSafeInteger(httpStatus)
    && Number(httpStatus) >= 100
    && Number(httpStatus) <= 599;
  const successStatus = finiteStatus
    && Number(httpStatus) >= 200
    && Number(httpStatus) <= 299;
  if (status === 'accepted') {
    return responseCategory === 'accepted' && successStatus;
  }
  if (status !== 'ambiguous') return false;
  if (responseCategory === 'ambiguous_no_response') return httpStatus === null;
  if (responseCategory === 'ambiguous_success_response') return successStatus;
  return responseCategory === 'ambiguous_http_response'
    && finiteStatus
    && !successStatus;
}
