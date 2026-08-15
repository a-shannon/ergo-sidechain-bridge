/** Deterministic Ergo value-conservation planning without SDK or I/O access. */
export interface ChangePlan {
  changeOutputValue: number;
  minerFeeValue: number;
  absorbedDust: number;
}

export interface BigIntChangePlan {
  changeOutputValue: bigint;
  minerFeeValue: bigint;
  absorbedDust: bigint;
}

export function safeNanoErgNumber(value: number | string | bigint, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      throw new Error(`${label} is outside JavaScript safe integer range: ${value}`);
    }
    return value;
  }

  const n = BigInt(value);
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is outside JavaScript safe integer range: ${value}`);
  }
  return Number(n);
}

/**
 * Ergo transactions must conserve ERG exactly. If change is below minBoxValue,
 * the only valid way to "absorb" it is to add it to the miner fee output.
 */
export function planChangeOrFee(
  changeValue: number,
  minerFee: number,
  minBoxValue: number,
): ChangePlan {
  if (changeValue < 0) {
    throw new Error(`negative change: ${changeValue}`);
  }

  if (changeValue >= minBoxValue) {
    return {
      changeOutputValue: changeValue,
      minerFeeValue: minerFee,
      absorbedDust: 0,
    };
  }

  return {
    changeOutputValue: 0,
    minerFeeValue: minerFee + changeValue,
    absorbedDust: changeValue,
  };
}

export function planChangeOrFeeBigInt(
  changeValue: bigint,
  minerFee: bigint,
  minBoxValue: bigint,
): BigIntChangePlan {
  if (changeValue < 0n) {
    throw new Error(`negative change: ${changeValue}`);
  }

  if (changeValue >= minBoxValue) {
    return {
      changeOutputValue: changeValue,
      minerFeeValue: minerFee,
      absorbedDust: 0n,
    };
  }

  return {
    changeOutputValue: 0n,
    minerFeeValue: minerFee + changeValue,
    absorbedDust: changeValue,
  };
}
