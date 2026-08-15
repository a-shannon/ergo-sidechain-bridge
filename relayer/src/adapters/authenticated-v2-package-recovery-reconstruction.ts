import { createHash } from 'crypto';

import type {
  AuthenticatedV2PreparedCandidateReconstructionPort,
  AuthenticatedV2PreparedCandidateRecoveryBinding,
  AuthenticatedV2PreparedCandidateRecoveryBindingPort,
  AuthenticatedV2PreparedCandidateRecoveryDraft,
} from '../relayer-core/authenticated-v2-prepared-candidate-recovery.js';

export interface AuthenticatedV2PackageRecoveryReconstructionAdapterDeps<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
> {
  reconstruct(input: Input): Promise<Draft>;
}

export interface AuthenticatedV2PackageRecoveryReconstructionPorts<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
> {
  reconstruction: AuthenticatedV2PreparedCandidateReconstructionPort<
    Input,
    Draft
  >;
  binding: AuthenticatedV2PreparedCandidateRecoveryBindingPort;
}

export function createAuthenticatedV2PackageRecoveryReconstructionAdapter<
  Input,
  Draft extends AuthenticatedV2PreparedCandidateRecoveryDraft,
>(
  deps: AuthenticatedV2PackageRecoveryReconstructionAdapterDeps<Input, Draft>,
): AuthenticatedV2PackageRecoveryReconstructionPorts<Input, Draft> {
  return Object.freeze({
    reconstruction: Object.freeze({
      reconstruct: (input: Input) => deps.reconstruct(input),
    }),
    binding: Object.freeze({
      digest: (binding: AuthenticatedV2PreparedCandidateRecoveryBinding) =>
        digestAuthenticatedV2PackageRecoveryBinding(binding),
    }),
  });
}

export function digestAuthenticatedV2PackageRecoveryBinding(
  binding: AuthenticatedV2PreparedCandidateRecoveryBinding,
): string {
  return createHash('sha256')
    .update(canonicalJson(binding))
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        'authenticated recovery binding cannot contain non-finite numbers',
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(objectValue[key])}`)
      .join(',')}}`;
  }
  throw new Error(
    `authenticated recovery binding cannot serialize ${typeof value}`,
  );
}
