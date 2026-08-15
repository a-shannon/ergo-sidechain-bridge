const preparedCandidateSets = new WeakSet<object>();

export function registerSubstrateFederatedCandidatePreparationV1<
  CandidateSet extends object,
>(candidateSet: CandidateSet): CandidateSet {
  if (!Object.isFrozen(candidateSet)) {
    throw new Error(
      'substrate federated daemon candidates must be frozen before preparation registration',
    );
  }
  preparedCandidateSets.add(candidateSet);
  return candidateSet;
}

export function assertSubstrateFederatedCandidatePreparationV1(
  value: unknown,
): asserts value is Readonly<object> {
  if (
    value === null
    || typeof value !== 'object'
    || !preparedCandidateSets.has(value)
  ) {
    throw new Error(
      'substrate federated daemon candidates lack same-process preparation provenance',
    );
  }
}
