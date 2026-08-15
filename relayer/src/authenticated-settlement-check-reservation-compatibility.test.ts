import { describe, expect, it } from 'vitest';

import type { PackageBoundAuthenticatedSettlement } from './authenticated-v2-settlement-package-binding.js';
import {
  deriveAuthenticatedSettlementPackageBindingDigest,
  deriveAuthenticatedSettlementPayoutDigest,
} from './authenticated-settlement-check-reservation-compatibility.js';
import type { ParsedPegOut } from './sidechain-client.js';
import type { AuthenticatedSettlementCandidate } from './state-tracker.js';

const CANDIDATE = Object.freeze({
  candidateId: '11'.repeat(32),
  burnId: '12'.repeat(32),
  burnTxHash: '13'.repeat(32),
  sidechainId: '14'.repeat(32),
  sidechainHeight: 15n,
  sidechainBlockHash: '16'.repeat(32),
  sidechainLogIndex: 1,
  vaultBoxId: '17'.repeat(32),
  unsignedTxDigest: '18'.repeat(32),
  trackerBoxId: '19'.repeat(32),
  dupInputBoxId: '1a'.repeat(32),
}) as AuthenticatedSettlementCandidate;

const PEG_OUT = Object.freeze({
  sidechainTxHash: CANDIDATE.burnTxHash,
  ergoRecipientAddress: `0008cd02${'21'.repeat(32)}`,
  amount: 10_000_000n,
  user: `0x${'22'.repeat(20)}`,
  sidechainBlockNumber: Number(CANDIDATE.sidechainHeight),
  sidechainBlockHash: CANDIDATE.sidechainBlockHash,
  sidechainLogIndex: CANDIDATE.sidechainLogIndex,
}) satisfies ParsedPegOut;

const PACKAGE_BINDING = Object.freeze({
  packageDigestHex: '31'.repeat(32),
  readinessReportDigestHex: '32'.repeat(32),
  companionDigestHex: '33'.repeat(32),
  eip12Sha256Hex: '34'.repeat(32),
  expectedTxId: '35'.repeat(32),
  prepared: {},
}) as PackageBoundAuthenticatedSettlement;

const REVALIDATION = Object.freeze({
  expectedTxId: PACKAGE_BINDING.expectedTxId,
  revalidationDigestHex: '36'.repeat(32),
});

describe('authenticated settlement check-reservation compatibility bindings', () => {
  it('derives one stable native-ERG payout digest from the exact source and payout fields', () => {
    const digest = deriveAuthenticatedSettlementPayoutDigest({
      candidate: CANDIDATE,
      pegOut: PEG_OUT,
    });

    expect(digest).toBe(
      '53e801d4c0114f9983be62394d824ebe193758341db1f17f61db55dc05adbc29',
    );
    expect(deriveAuthenticatedSettlementPayoutDigest({
      candidate: {
        ...CANDIDATE,
        candidateId: CANDIDATE.candidateId.toUpperCase(),
      },
      pegOut: {
        ...PEG_OUT,
        sidechainTxHash: `0x${PEG_OUT.sidechainTxHash.toUpperCase()}`,
      },
    })).toBe(digest);
  });

  it.each([
    ['candidate ID', { candidate: { candidateId: '41'.repeat(32) } }],
    ['burn ID', { candidate: { burnId: '42'.repeat(32) } }],
    ['sidechain ID', { candidate: { sidechainId: '43'.repeat(32) } }],
    ['vault box ID', { candidate: { vaultBoxId: '44'.repeat(32) } }],
    ['amount', { pegOut: { amount: PEG_OUT.amount + 1n } }],
    [
      'recipient',
      { pegOut: { ergoRecipientAddress: `0008cd02${'45'.repeat(32)}` } },
    ],
  ] as const)(
    'changes the payout digest when the exact %s changes',
    (_label, mutation) => {
      const baseline = deriveAuthenticatedSettlementPayoutDigest({
        candidate: CANDIDATE,
        pegOut: PEG_OUT,
      });
      const candidate = {
        ...CANDIDATE,
        ...('candidate' in mutation ? mutation.candidate : {}),
      };
      const pegOut = {
        ...PEG_OUT,
        ...('pegOut' in mutation ? mutation.pegOut : {}),
      };

      expect(deriveAuthenticatedSettlementPayoutDigest({
        candidate,
        pegOut,
      })).not.toBe(baseline);
    },
  );

  it.each([
    ['burn transaction', { burnTxHash: '51'.repeat(32) }],
    ['sidechain height', { sidechainHeight: CANDIDATE.sidechainHeight + 1n }],
    ['execution block', { sidechainBlockHash: '52'.repeat(32) }],
    ['event index', { sidechainLogIndex: CANDIDATE.sidechainLogIndex + 1 }],
  ] as const)(
    'rejects a %s mismatch between the candidate and peg-out',
    (_label, candidateMutation) => {
      expect(() => deriveAuthenticatedSettlementPayoutDigest({
        candidate: { ...CANDIDATE, ...candidateMutation },
        pegOut: PEG_OUT,
      })).toThrow(/does not match.*source identity/i);
    },
  );

  it('rejects amount values outside the positive Ergo Long range', () => {
    for (const amount of [0n, 9_223_372_036_854_775_808n]) {
      expect(() => deriveAuthenticatedSettlementPayoutDigest({
        candidate: CANDIDATE,
        pegOut: { ...PEG_OUT, amount },
      })).toThrow(/positive Ergo Long/i);
    }
  });

  it('rejects a sidechain height that cannot be represented exactly as a number', () => {
    expect(() => deriveAuthenticatedSettlementPayoutDigest({
      candidate: CANDIDATE,
      pegOut: {
        ...PEG_OUT,
        sidechainBlockNumber: Number.MAX_SAFE_INTEGER + 1,
      },
    })).toThrow(/nonnegative safe integer/i);
  });

  it('binds every exact package and revalidation digest field', () => {
    const input = {
      candidateId: CANDIDATE.candidateId,
      unsignedTxDigestHex: CANDIDATE.unsignedTxDigest,
      revalidation: REVALIDATION,
      packageBinding: PACKAGE_BINDING,
    };
    const baseline =
      deriveAuthenticatedSettlementPackageBindingDigest(input);
    expect(baseline).toBe(
      '29d2585abea354388532b08e85e50486262f02ca910bb5680e184ae21ee37d12',
    );

    const mutations = [
      { candidateId: '61'.repeat(32) },
      { unsignedTxDigestHex: '62'.repeat(32) },
      {
        revalidation: {
          ...REVALIDATION,
          expectedTxId: '63'.repeat(32),
        },
      },
      {
        revalidation: {
          ...REVALIDATION,
          revalidationDigestHex: '64'.repeat(32),
        },
      },
      {
        packageBinding: {
          ...PACKAGE_BINDING,
          packageDigestHex: '65'.repeat(32),
        } as PackageBoundAuthenticatedSettlement,
      },
      {
        packageBinding: {
          ...PACKAGE_BINDING,
          readinessReportDigestHex: '66'.repeat(32),
        } as PackageBoundAuthenticatedSettlement,
      },
      {
        packageBinding: {
          ...PACKAGE_BINDING,
          companionDigestHex: '67'.repeat(32),
        } as PackageBoundAuthenticatedSettlement,
      },
      {
        packageBinding: {
          ...PACKAGE_BINDING,
          eip12Sha256Hex: '68'.repeat(32),
        } as PackageBoundAuthenticatedSettlement,
      },
    ];
    for (const mutation of mutations) {
      expect(deriveAuthenticatedSettlementPackageBindingDigest({
        ...input,
        ...mutation,
      })).not.toBe(baseline);
    }
  });
});
