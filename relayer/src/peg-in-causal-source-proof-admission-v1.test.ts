import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1,
  PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
  assertPegInCausalSourceProofReproofContinuityV1,
  assertPegInCausalSourceProofResultV1Provenance,
  buildPegInCausalSourceProofResultFieldsV1,
  createPegInCausalSourceProofRegistryV1,
  derivePegInCausalSourceProofProfileV1DigestHex,
  derivePegInCausalSourceProofRequestV1DigestHex,
  derivePegInCausalSourceProofResultIdV1Hex,
  encodePegInCausalSourceProofEnvelopeScaleV1Hex,
  evaluatePegInCausalSourceProofAdmissionV1,
  validatePegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofEnvelopeV1,
  type PegInCausalSourceProofResultFieldsV1,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  createPegInCausalSourceProofEnvelopeV1Fixture,
  createPegInCausalSourceProofRequestV1Fixture,
  createRustInteropPegInCausalSourceProofRequestV1Fixture,
  createValidatedPegInCausalSourceProofResultV1Fixture,
  fixtureHash,
  signPegInCausalSourceProofResultFieldsV1Fixture,
} from './peg-in-causal-source-proof-admission-v1.test-helper.js';

const INTEROP_VECTOR = JSON.parse(readFileSync(new URL(
  '../test-vectors/peg-in-causal-source-proof-admission-v1.json',
  import.meta.url,
), 'utf8'));

describe('peg-in causal source-proof admission V1', () => {
  it('pins one exact source-owned federated compatibility profile', () => {
    const registry = createPegInCausalSourceProofRegistryV1();
    const profile = registry.profiles[0]!;

    expect(registry.boundary).toEqual({
      sourceOwnedStaticRegistry: true,
      runtimeRegistrationAllowed: false,
      activeProofProfileCount: 1,
      compatibilityProfileExplicitlyFederated: true,
      validityOrStarkProfileReinterpretationAllowed: false,
    });
    expect(profile).toMatchObject({
      proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
      threshold: PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1,
      signerPublicKeysHex: PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX,
      maxValidityBlocks: PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1.toString(),
      finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
      requiredConfirmations: 10,
      verifierProfileIdHex: PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
      validityOrStarkFamilyAllowed: false,
    });
    expect(derivePegInCausalSourceProofProfileV1DigestHex(profile))
      .toBe(PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX);
    expect(() => derivePegInCausalSourceProofProfileV1DigestHex({ ...profile }))
      .toThrow(/source-owned and static/i);
  });

  it('validates the exact 2-of-3 envelope and emits Rust-compatible SCALE bytes', () => {
    const { request, envelope, result } = createValidatedPegInCausalSourceProofResultV1Fixture(
      'positive',
    );
    const scale = Buffer.from(result.envelopeScaleHex.slice(2), 'hex');

    expect(result.requestDigestHex).toBe(derivePegInCausalSourceProofRequestV1DigestHex(request));
    expect(result.sourceProofResultIdHex).toBe(
      derivePegInCausalSourceProofResultIdV1Hex(envelope.result),
    );
    expect(result.envelopeScaleHex).toBe(encodePegInCausalSourceProofEnvelopeScaleV1Hex(envelope));
    expect(scale).toHaveLength(498);
    expect(scale[0]).toBe(1);
    expect(scale.readBigUInt64LE(289)).toBe(1000n);
    expect(scale.readBigUInt64LE(297)).toBe(1064n);
    expect(scale[305]).toBe(8);
    expect(result.boundary).toMatchObject({
      processProvenanceVerified: true,
      exactRustProfileAndCodecVerified: true,
      exactThresholdSignatureSetVerified: true,
      federatedSourceProofAttestationVerified: true,
      sourceProofExecutionAuthenticated: false,
      sourceCanonicalityVerified: false,
      trustlessFinalityVerified: false,
      runtimePendingAdmissionWritten: false,
      lifecycleAdmissionAdvanced: false,
      mintAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    });
  });

  it('reproduces the exact Rust-compatible source-proof admission vector', () => {
    const request = createRustInteropPegInCausalSourceProofRequestV1Fixture();
    const envelope = createPegInCausalSourceProofEnvelopeV1Fixture({
      request,
      issuedAtNativeHeight: INTEROP_VECTOR.result.issuedAtNativeHeight,
      expiresAtNativeHeight: INTEROP_VECTOR.result.expiresAtNativeHeight,
    });
    const result = validatePegInCausalSourceProofEnvelopeV1({
      request,
      envelope,
      currentNativeHeight: INTEROP_VECTOR.validation.currentNativeHeight,
    });

    expect(request).toEqual(INTEROP_VECTOR.request);
    expect(envelope.result).toEqual(INTEROP_VECTOR.result);
    expect(envelope.signatures).toEqual(INTEROP_VECTOR.signatures);
    expect(result.requestDigestHex).toBe(INTEROP_VECTOR.expected.requestDigestHex);
    expect(result.sourceProofResultIdHex).toBe(INTEROP_VECTOR.expected.resultIdHex);
    expect(result.sourceProofAttestationDigestHex)
      .toBe(INTEROP_VECTOR.expected.attestationDigestHex);
    expect(result.signatureSetDigestHex).toBe(INTEROP_VECTOR.expected.signatureSetDigestHex);
    expect(result.sourceProofDigestHex).toBe(INTEROP_VECTOR.expected.sourceProofDigestHex);
    expect(result.envelopeScaleHex).toBe(INTEROP_VECTOR.expected.envelopeScaleHex);
    expect(Buffer.from(result.envelopeScaleHex.slice(2), 'hex')).toHaveLength(
      INTEROP_VECTOR.expected.envelopeScaleBytes,
    );
    expect(`0x${createHash('sha256')
      .update(Buffer.from(result.envelopeScaleHex.slice(2), 'hex'))
      .digest('hex')}`).toBe(INTEROP_VECTOR.expected.envelopeScaleSha256Hex);
  });

  it.each([
    ['candidate identity', (request: any) => { request.candidateIdHex = fixtureHash('other-candidate'); }],
    ['consumption transaction', (request: any) => { request.sourceConsumption.consumingTransactionIdHex = fixtureHash('other-tx'); }],
    ['vault successor', (request: any) => { request.sourceConsumption.vaultBoxIdHex = fixtureHash('other-vault'); }],
    ['checkpoint block', (request: any) => { request.sourceConsumption.acceptanceCheckpointBlockIdHex = fixtureHash('other-checkpoint'); }],
    ['finality policy', (request: any) => { request.sourceConsumption.finalityPolicyIdHex = fixtureHash('other-finality'); }],
    ['proof system', (request: any) => { request.admissionProfile.proofSystemIdHex = fixtureHash('other-system'); }],
    ['proof profile', (request: any) => { request.admissionProfile.proofProfileIdHex = fixtureHash('other-profile'); }],
    ['confirmation policy', (request: any) => { request.statement.requiredConfirmations = 9; }],
  ] as const)('rejects substituted %s evidence before verification', (_label, mutate) => {
    const request = structuredClone(createPegInCausalSourceProofRequestV1Fixture(`sub-${_label}`));
    mutate(request);
    expect(() => buildPegInCausalSourceProofResultFieldsV1({
      request,
      issuedAtNativeHeight: '1000',
      expiresAtNativeHeight: '1064',
    })).toThrow();
  });

  it.each([
    'requestDigestHex',
    'sourceBoxCanonicalBlake2b256Hex',
    'commitmentTransactionCanonicalBlake2b256Hex',
    'vaultSuccessorCanonicalBlake2b256Hex',
    'inclusionProofBlake2b256Hex',
    'checkpointAncestryBlake2b256Hex',
    'finalityProofBlake2b256Hex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
  ] as const)('rejects a substituted signed-result %s', field => {
    const request = createPegInCausalSourceProofRequestV1Fixture(`result-${field}`);
    const original = createPegInCausalSourceProofEnvelopeV1Fixture({ request });
    const result = { ...original.result, [field]: fixtureHash(`changed-${field}`) };
    const envelope = signedEnvelope(result);
    expect(() => validate(request, envelope)).toThrow(/differs from the exact request/i);
  });

  it.each([
    ['future issue', '1002', '1064', '1001'],
    ['expired at equality', '1000', '1001', '1001'],
    ['inverted window', '1002', '1001', '1001'],
    ['overlong window', '1000', '1065', '1001'],
  ] as const)('rejects the %s validity window', (_label, issued, expires, current) => {
    const request = createPegInCausalSourceProofRequestV1Fixture(`window-${_label}`);
    const envelope = createPegInCausalSourceProofEnvelopeV1Fixture({
      request,
      issuedAtNativeHeight: issued,
      expiresAtNativeHeight: expires,
    });
    expect(() => validate(request, envelope, current)).toThrow(/validity window/i);
  });

  it('rejects undersized, oversized, duplicate, reordered, unknown, and invalid signatures', () => {
    const request = createPegInCausalSourceProofRequestV1Fixture('signature-negative');
    const result = buildPegInCausalSourceProofResultFieldsV1({
      request,
      issuedAtNativeHeight: '1000',
      expiresAtNativeHeight: '1064',
    });
    const exact = signPegInCausalSourceProofResultFieldsV1Fixture(result);
    const cases: PegInCausalSourceProofEnvelopeV1[] = [
      { result, signatures: exact.slice(0, 1) },
      { result, signatures: signPegInCausalSourceProofResultFieldsV1Fixture(result, [0, 1, 2]) },
      { result, signatures: signPegInCausalSourceProofResultFieldsV1Fixture(result, [0, 0]) },
      { result, signatures: signPegInCausalSourceProofResultFieldsV1Fixture(result, [1, 0]) },
      {
        result,
        signatures: [
          exact[0]!,
          { signerPublicKeyHex: fixtureHash('unknown-signer'), signatureHex: `0x${'00'.repeat(64)}` },
        ],
      },
      {
        result,
        signatures: [exact[0]!, { ...exact[1]!, signatureHex: `0x${'00'.repeat(64)}` }],
      },
    ];
    for (const envelope of cases) expect(() => validate(request, envelope)).toThrow();
  });

  it('requires an exact signed envelope for fresh evidence and holds deny-only observations', () => {
    const request = createPegInCausalSourceProofRequestV1Fixture('outcomes');
    expect(() => evaluatePegInCausalSourceProofAdmissionV1({
      request,
      sourceObservation: 'fresh',
    })).toThrow(/requires an exact signed envelope/i);
    const envelope = createPegInCausalSourceProofEnvelopeV1Fixture({ request });
    expect(evaluatePegInCausalSourceProofAdmissionV1({
      request,
      envelope,
      currentNativeHeight: '1001',
      sourceObservation: 'fresh',
    }).status).toBe('reproof_candidate');
    for (const sourceObservation of ['stale', 'reorg', 'conflicting'] as const) {
      expect(evaluatePegInCausalSourceProofAdmissionV1({ request, sourceObservation }))
        .toMatchObject({ status: 'reproof_held' });
    }
  });

  it('brands only exact in-process validations and detects reproof evidence drift', () => {
    const original = createValidatedPegInCausalSourceProofResultV1Fixture('continuity');
    expect(() => assertPegInCausalSourceProofResultV1Provenance(original.result)).not.toThrow();
    expect(() => assertPegInCausalSourceProofResultV1Provenance({ ...original.result }))
      .toThrow(/process provenance is missing/i);

    const changedRequest = {
      ...original.request,
      sourceBoxCanonicalHex: '0x020304',
    };
    const changedEnvelope = createPegInCausalSourceProofEnvelopeV1Fixture({
      request: changedRequest,
    });
    const changed = validate(changedRequest, changedEnvelope);
    expect(() => assertPegInCausalSourceProofReproofContinuityV1({
      previous: original.result,
      next: changed,
    })).toThrow(/continuity differs/i);
  });

  it('rejects additive fields in requests, results, and signatures', () => {
    const request = createPegInCausalSourceProofRequestV1Fixture('field-set');
    expect(() => buildPegInCausalSourceProofResultFieldsV1({
      request: { ...request, unexpected: true } as any,
      issuedAtNativeHeight: '1000',
      expiresAtNativeHeight: '1064',
    })).toThrow(/unexpected field set/i);
    for (const nested of ['admissionProfile', 'sourceIntent', 'statement'] as const) {
      expect(() => buildPegInCausalSourceProofResultFieldsV1({
        request: {
          ...request,
          [nested]: { ...request[nested], unexpected: true },
        } as any,
        issuedAtNativeHeight: '1000',
        expiresAtNativeHeight: '1064',
      })).toThrow(/unexpected field set/i);
    }

    const envelope = createPegInCausalSourceProofEnvelopeV1Fixture({ request });
    expect(() => validate(request, {
      ...envelope,
      result: { ...envelope.result, unexpected: true } as any,
    })).toThrow(/unexpected field set/i);
    expect(() => validate(request, {
      ...envelope,
      signatures: [{ ...envelope.signatures[0]!, unexpected: true } as any, envelope.signatures[1]!],
    })).toThrow(/unexpected field set/i);
  });
});

function signedEnvelope(
  result: PegInCausalSourceProofResultFieldsV1,
): PegInCausalSourceProofEnvelopeV1 {
  return { result, signatures: signPegInCausalSourceProofResultFieldsV1Fixture(result) };
}

function validate(
  request: ReturnType<typeof createPegInCausalSourceProofRequestV1Fixture>,
  envelope: PegInCausalSourceProofEnvelopeV1,
  currentNativeHeight = '1001',
) {
  return validatePegInCausalSourceProofEnvelopeV1({
    request,
    envelope,
    currentNativeHeight,
  });
}
