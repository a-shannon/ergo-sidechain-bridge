export interface BoxLike {
  boxId: string;
  value: number | string | bigint;
  ergoTree: string;
  assets?: Array<{ tokenId: string; amount: number | string | bigint }>;
  additionalRegisters?: Record<string, string>;
  creationHeight: number;
  transactionId?: string;
  index?: number;
}

export interface AggregateSettlementUnsignedTx {
  inputs: Array<{ boxId: string; extension: Record<string, string> }>;
  dataInputs: Array<{ boxId: string }>;
  outputs: any[];
}
