import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  mintTransition: vi.fn(),
  contractStateLineage: vi.fn(),
}));

vi.mock(
  './native-finalized-peg-in-frontier-mint-transition-v1.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./native-finalized-peg-in-frontier-mint-transition-v1.js')
    >(),
    assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance:
      provenance.mintTransition,
  }),
);
vi.mock('./frontier-contract-state-deployment-lineage-join.js', async importOriginal => ({
  ...await importOriginal<
    typeof import('./frontier-contract-state-deployment-lineage-join.js')
  >(),
  assertFrontierContractStateDeploymentLineageJoinCandidateProvenance:
    provenance.contractStateLineage,
}));

import {
  FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_SCHEMA,
  assertFrontierMintTransitionDeploymentLineageJoinCandidateProvenance,
  buildFrontierMintTransitionDeploymentLineageJoinCandidate,
} from './frontier-mint-transition-deployment-lineage-join.js';

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const address = (byte: string): string => `0x${byte.repeat(40)}`;
const TRUST = hash('1');
const PARENT = hash('2');
const EVENT_NATIVE = hash('3');
const EVENT_STATE = hash('4');
const EXECUTION = hash('5');
const TRANSACTION = hash('6');
const BOX = hash('7');
const BRIDGE = address('8');
const TOKEN = address('9');
const OWNER = address('a');
const RECIPIENT = address('b');

describe('Frontier mint-transition deployment-lineage join', () => {
  it('binds the T20C transition to the existing T19/T20A/T20B candidate without authority', () => {
    const candidate = buildFrontierMintTransitionDeploymentLineageJoinCandidate(baseInput());

    expect(candidate.schema).toBe(FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_SCHEMA);
    expect(candidate.target).toMatchObject({
      parentNativeBlockHashHex: PARENT,
      parentNativeHeight: '11',
      eventNativeBlockHashHex: EVENT_NATIVE,
      eventNativeHeight: '12',
      executionBlockHashHex: EXECUTION,
    });
    expect(candidate.transition).toMatchObject({
      parentProcessedPegIn: false,
      postProcessedPegIn: true,
      tokenTotalSupplyDelta: '100',
      recipientBalanceDelta: '100',
    });
    expect(Object.values(candidate.checks).every(value => value === true)).toBe(true);
    expect(Object.values(candidate.authority).every(value => value === false)).toBe(true);
    expect(candidate.candidateDigestHex).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(() => assertFrontierMintTransitionDeploymentLineageJoinCandidateProvenance(candidate))
      .not.toThrow();
    expect(() => assertFrontierMintTransitionDeploymentLineageJoinCandidateProvenance({
      ...candidate,
    })).toThrow(/join provenance is missing/i);
  });

  it.each([
    ['nested request', (input: any) => {
      input.mintTransitionCandidate.contractStateVerification.requestDigestHex = hash('f');
    }, /exact reviewed contract-state request/i],
    ['trust root', (input: any) => {
      input.mintTransitionCandidate.trustAnchorDigestHex = hash('f');
    }, /reviewed deployment trust root/i],
    ['event native hash', (input: any) => {
      input.mintTransitionCandidate.parentLink.eventNativeBlockHashHex = hash('f');
    }, /event-block identity/i],
    ['execution hash', (input: any) => {
      input.contractStateLineageJoinCandidate.target.executionBlockHashHex = hash('f');
    }, /event-block identity/i],
    ['contract code', (input: any) => {
      input.contractStateLineageJoinCandidate.contracts.bridgeRuntimeCodeSha256Hex = hash('f');
    }, /contract state differs/i],
    ['post supply', (input: any) => {
      input.mintTransitionCandidate.transition.postTokenTotalSupply = '99';
    }, /contract state differs/i],
    ['PegIn amount', (input: any) => {
      input.contractStateLineageJoinCandidate.pegIn.amountNanoErg = '99';
    }, /PegIn and mint pair/i],
    ['mint token', (input: any) => {
      input.mintTransitionCandidate.transition.mintTokenAddressHex = address('f');
    }, /PegIn and mint pair/i],
    ['replay transition', (input: any) => {
      input.mintTransitionCandidate.transition.parentProcessedPegIn = true;
    }, /replay or amount deltas/i],
    ['supply delta', (input: any) => {
      input.mintTransitionCandidate.transition.tokenTotalSupplyDelta = '99';
    }, /replay or amount deltas/i],
  ] as const)('rejects isolated %s drift', (_label, mutate, message) => {
    const input = structuredClone(baseInput());
    mutate(input);
    expect(() => buildFrontierMintTransitionDeploymentLineageJoinCandidate(
      input as unknown as Parameters<
        typeof buildFrontierMintTransitionDeploymentLineageJoinCandidate
      >[0],
    )).toThrow(message);
  });

  it('fails before binding when same-process provenance rejects', () => {
    provenance.mintTransition.mockImplementationOnce(() => {
      throw new Error('candidate provenance is missing');
    });
    expect(() => buildFrontierMintTransitionDeploymentLineageJoinCandidate(baseInput()))
      .toThrow(/candidate provenance is missing/i);
  });
});

function baseInput() {
  const contractStateRequestDigestHex = hash('c');
  return {
    mintTransitionCandidate: {
      requestDigestHex: hash('d'),
      trustAnchorDigestHex: TRUST,
      parentLink: {
        parentNativeBlockHashHex: PARENT,
        parentNativeHeight: '11',
        parentStateRootHex: hash('e'),
        eventNativeBlockHashHex: EVENT_NATIVE,
        eventNativeHeight: '12',
      },
      transition: {
        parentProcessedPegIn: false,
        postProcessedPegIn: true,
        parentTokenTotalSupply: '0',
        postTokenTotalSupply: '100',
        tokenTotalSupplyDelta: '100',
        parentRecipientBalance: '0',
        postRecipientBalance: '100',
        recipientBalanceDelta: '100',
        recipientBalanceStorageKeyHex: '0x01',
        mintTokenAddressHex: TOKEN,
        mintTransactionHashHex: TRANSACTION,
        mintTransactionIndex: 0,
        mintTransactionLogIndex: 0,
        mintGlobalEventIndex: 0,
        mintRecipientAddressHex: RECIPIENT,
        mintAmount: '100',
      },
      contractStateVerification: {
        requestDigestHex: contractStateRequestDigestHex,
        trustAnchorDigestHex: TRUST,
        contractState: {
          bridgeAddressHex: BRIDGE,
          tokenAddressHex: TOKEN,
          bridgeRuntimeCodeSha256Hex: hash('a'),
          bridgeRuntimeCodeBytes: '4104',
          tokenRuntimeCodeSha256Hex: hash('b'),
          tokenRuntimeCodeBytes: '2356',
          bridgeOwnerAddressHex: OWNER,
          tokenOwnerAddressHex: BRIDGE,
          bridgeTokenAddressHex: TOKEN,
          bridgePaused: false,
          tokenTotalSupply: '100',
        },
        eventVerification: {
          executionIdentity: {
            target: {
              nativeBlockHashHex: EVENT_NATIVE,
              nativeHeight: '12',
              stateRootHex: EVENT_STATE,
            },
            execution: {
              executionHeight: '12',
              executionBlockHashHex: EXECUTION,
            },
          },
          event: {
            transactionHashHex: TRANSACTION,
            transactionIndex: 0,
            globalEventIndex: 1,
            recipientHex: RECIPIENT,
            amountNanoErg: '100',
            ergoBoxIdHex: BOX,
          },
        },
      },
    },
    contractStateLineageJoinCandidate: {
      candidateDigestHex: hash('f'),
      contractStateRequestDigestHex,
      trustAnchorDigestHex: TRUST,
      nativeFinalityStatementDigestHex: hash('0'),
      target: {
        nativeBlockHashHex: EVENT_NATIVE,
        nativeHeight: '12',
        nativeStateRootHex: EVENT_STATE,
        executionHeight: '12',
        executionBlockHashHex: EXECUTION,
      },
      contracts: {
        bridgeAddressHex: BRIDGE,
        tokenAddressHex: TOKEN,
        bridgeRuntimeCodeSha256Hex: hash('a'),
        bridgeRuntimeCodeBytes: '4104',
        tokenRuntimeCodeSha256Hex: hash('b'),
        tokenRuntimeCodeBytes: '2356',
        bridgeOwnerAddressHex: OWNER,
        tokenOwnerAddressHex: BRIDGE,
        bridgeTokenAddressHex: TOKEN,
        bridgePaused: false,
        tokenTotalSupply: '100',
      },
      pegIn: {
        transactionHashHex: TRANSACTION,
        transactionIndex: 0,
        globalEventIndex: 1,
        recipientHex: RECIPIENT,
        amountNanoErg: '100',
        ergoBoxIdHex: BOX,
        processedPegIn: true,
      },
    },
  } as unknown as Parameters<
    typeof buildFrontierMintTransitionDeploymentLineageJoinCandidate
  >[0];
}
