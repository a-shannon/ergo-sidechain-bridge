import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import { derivePegInRuntimeRecordKeyV1Hex } from './peg-in-runtime-state.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
  assertValidityApplicationPooledReserveMintReservationV4Request,
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintIdentityV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  type ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  readonly schema: string;
  readonly statement:
    ValidityApplicationPooledReserveMintReservationStatementV4;
  readonly expected: {
    readonly statementBytes: number;
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};

type MutableStatement = {
  -readonly [Key in keyof
    ValidityApplicationPooledReserveMintReservationStatementV4]:
      ValidityApplicationPooledReserveMintReservationStatementV4[Key];
};

describe('validity-application pooled-reserve mint reservation V4', () => {
  it('reproduces the canonical 603-byte statement and domain-separated ID', () => {
    const encoded =
      encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        vector.statement,
      );

    expect(vector.schema).toBe(
      'e2s.validity-application-pooled-reserve-mint-reservation-vector.v4',
    );
    expect(
      VALIDITY_APPLICATION_POOLED_RESERVE_MINT_RESERVATION_V4_BYTES,
    ).toBe(vector.expected.statementBytes);
    expect(encoded).toBe(vector.expected.statementHex);
    expect(
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        vector.statement,
      ),
    ).toBe(vector.expected.statementIdHex);
    expect(
      decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        encoded,
      ),
    ).toEqual(vector.statement);
  });

  it('keeps the V4 reservation key distinct from the legacy V1 replay key', () => {
    const sourceIntent = decodePegInSourceIntentV2Hex(
      vector.statement.sourceIntentHex,
    );
    const legacyKey = derivePegInRuntimeRecordKeyV1Hex({
      sidechainIdHex: sourceIntent.sidechainIdHex,
      ergoBoxIdHex: vector.statement.sourceLockBoxIdHex,
    });
    const v4Key = deriveValidityApplicationPooledReserveMintIdentityV4Hex({
      lineageProfileIdHex: vector.statement.lineageProfileIdHex,
      sourceLockBoxIdHex: vector.statement.sourceLockBoxIdHex,
      depositCommitmentHex: vector.statement.depositCommitmentHex,
    });

    expect(v4Key).toBe(vector.expected.reservationKeyHex);
    expect(v4Key).not.toBe(legacyKey);
  });

  it('binds every independently variable committed-reserve and finality field', () => {
    const baseline =
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        vector.statement,
      );
    const mutations: Array<
      (statement: MutableStatement) => void
    > = [
      value => {
        value.reserveTransitionTransactionIdHex = repeatHex('d1', 32);
      },
      value => {
        value.successorReserveBoxIdHex = repeatHex('e1', 32);
      },
      value => {
        value.successorReserveDigestHex = repeatHex('f1', 33);
      },
      value => {
        value.successorReserveLiabilityNanoErg = '2000001';
      },
      value => {
        value.ergoDepositFinalityPolicyIdHex = repeatHex('67', 32);
      },
      value => {
        value.inclusionHeaderIdHex = repeatHex('14', 32);
      },
      value => {
        value.targetHeaderIdHex = repeatHex('15', 32);
      },
      value => {
        value.inclusionHeight = 500001;
        value.targetHeight = 500011;
      },
      value => {
        value.requiredSuccessorDepth = 11;
        value.targetHeight = 500011;
      },
      value => {
        value.sourceLockBoxIdHex = repeatHex('a1', 32);
        value.mintIdentityHex =
          deriveValidityApplicationPooledReserveMintIdentityV4Hex({
            lineageProfileIdHex: value.lineageProfileIdHex,
            sourceLockBoxIdHex: value.sourceLockBoxIdHex,
            depositCommitmentHex: value.depositCommitmentHex,
          });
      },
      value => {
        value.depositCommitmentHex = repeatHex('19', 32);
        value.mintIdentityHex =
          deriveValidityApplicationPooledReserveMintIdentityV4Hex({
            lineageProfileIdHex: value.lineageProfileIdHex,
            sourceLockBoxIdHex: value.sourceLockBoxIdHex,
            depositCommitmentHex: value.depositCommitmentHex,
          });
      },
      value => {
        rewriteSourceIntent(value, {
          recipientAddressHex: repeatHex('9a', 20),
        });
      },
      value => {
        rewriteSourceIntent(value, {
          sourceNetworkIdHex: repeatHex('21', 32),
        });
      },
      value => {
        rewriteSourceIntent(value, {
          sidechainIdHex: repeatHex('23', 32),
        });
      },
      value => {
        rewriteSourceIntent(value, {
          bridgeAddressHex: repeatHex('34', 20),
        });
      },
      value => {
        rewriteSourceIntent(value, {
          tokenAddressHex: repeatHex('45', 20),
        });
      },
      value => {
        rewriteSourceIntent(value, {
          settlementProfileIdHex: repeatHex('56', 32),
        });
      },
      value => {
        rewriteSourceIntent(value, {
          amountNanoErg: '1999999',
        });
      },
      value => {
        const intent = decodePegInSourceIntentV2Hex(value.sourceIntentHex);
        const lineageProfileIdHex = repeatHex('c7', 32);
        const changed = {
          ...intent,
          admissionProfileIdHex: lineageProfileIdHex,
        };
        value.lineageProfileIdHex = lineageProfileIdHex;
        value.sourceIntentHex = encodePegInSourceIntentV2Hex(changed);
        value.sourceIntentIdHex = derivePegInSourceIntentIdV2Hex(changed);
        value.mintIdentityHex =
          deriveValidityApplicationPooledReserveMintIdentityV4Hex({
            lineageProfileIdHex,
            sourceLockBoxIdHex: value.sourceLockBoxIdHex,
            depositCommitmentHex: value.depositCommitmentHex,
          });
      },
    ];

    for (const mutate of mutations) {
      const changed = clone(vector.statement) as MutableStatement;
      mutate(changed);
      expect(
        deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
          changed,
        ),
      ).not.toBe(baseline);
    }
  });

  it('rejects inconsistent identities, unsupported assets, unsafe values, and stale finality', () => {
    const invalid: Array<{
      readonly mutate: (
        statement: MutableStatement,
      ) => void;
      readonly message: string;
    }> = [
      {
        mutate: value => { value.formatVersion = 3 as 4; },
        message: 'version is unsupported',
      },
      {
        mutate: value => {
          value.sourceIntentIdHex = repeatHex('f1', 32);
        },
        message: 'source intent ID is inconsistent',
      },
      {
        mutate: value => {
          value.mintIdentityHex = repeatHex('11', 32);
        },
        message: 'inconsistent V4 mint identity',
      },
      {
        mutate: value => {
          value.successorReserveLiabilityNanoErg = '1999999';
        },
        message: 'liability cannot be lower',
      },
      {
        mutate: value => {
          value.successorReserveLiabilityNanoErg =
            (1n << 63n).toString();
        },
        message: 'positive signed Long',
      },
      {
        mutate: value => {
          value.requiredSuccessorDepth = 0;
          value.targetHeight = value.inclusionHeight;
        },
        message: 'positive unsigned 32-bit',
      },
      {
        mutate: value => { value.targetHeight = 500011; },
        message: 'does not match the required successor depth',
      },
      {
        mutate: value => {
          value.successorReserveBoxIdHex = repeatHex('00', 32);
        },
        message: 'must not be zero',
      },
      {
        mutate: value => {
          value.successorReserveBoxIdHex = value.sourceLockBoxIdHex;
        },
        message: 'box IDs must be distinct',
      },
      {
        mutate: value => {
          value.targetHeaderIdHex = value.inclusionHeaderIdHex;
        },
        message: 'header IDs must be distinct',
      },
      {
        mutate: value => {
          const intent = decodePegInSourceIntentV2Hex(value.sourceIntentHex);
          const changed = {
            ...intent,
            sourceAssetIdHex: repeatHex('01', 32),
          };
          value.sourceIntentHex = encodePegInSourceIntentV2Hex(changed);
          value.sourceIntentIdHex = derivePegInSourceIntentIdV2Hex(changed);
        },
        message: 'supports only the native ERG lane',
      },
    ];

    for (const { mutate, message } of invalid) {
      const changed = clone(vector.statement) as MutableStatement;
      mutate(changed);
      expect(() =>
        encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
          changed,
        ),
      ).toThrow(message);
    }
  });

  it('rejects unknown fields, accessors, prototypes, and malformed wire values', () => {
    expect(() =>
      encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
        ...vector.statement,
        proof: 'caller-supplied',
      } as never),
    ).toThrow('must contain exactly');

    const getter =
      clone(vector.statement) as unknown as Record<string, unknown>;
    Object.defineProperty(getter, 'targetHeight', {
      enumerable: true,
      get: () => 500010,
    });
    expect(() =>
      encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        getter as unknown as
          ValidityApplicationPooledReserveMintReservationStatementV4,
      ),
    ).toThrow('data properties');

    expect(() =>
      encodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        Object.assign(
          Object.create({ inherited: true }),
          clone(vector.statement),
        ),
      ),
    ).toThrow('plain object');
    expect(() =>
      decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        vector.expected.statementHex.toUpperCase(),
      ),
    ).toThrow('lowercase');
    expect(() =>
      decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
        `${vector.expected.statementHex}00`,
      ),
    ).toThrow('603-byte');
    expect(() =>
      assertValidityApplicationPooledReserveMintReservationV4Request({
        schema:
          'e2s.validity-application-pooled-reserve-mint-reservation.v4',
      }),
    ).toThrow('was not built in this process');
  });
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function repeatHex(byte: string, bytes: number): string {
  return `0x${byte.repeat(bytes)}`;
}

function rewriteSourceIntent(
  statement: MutableStatement,
  fields: Partial<PegInSourceIntentV2>,
): void {
  const changed = {
    ...decodePegInSourceIntentV2Hex(statement.sourceIntentHex),
    ...fields,
  };
  statement.sourceIntentHex = encodePegInSourceIntentV2Hex(changed);
  statement.sourceIntentIdHex = derivePegInSourceIntentIdV2Hex(changed);
}
