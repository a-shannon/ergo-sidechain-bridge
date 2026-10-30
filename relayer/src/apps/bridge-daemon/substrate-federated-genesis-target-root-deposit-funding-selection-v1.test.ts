import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';

const ownedTarget = vi.hoisted(() => ({ assert: vi.fn() }));

vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    ownedTarget.assert,
}));

import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
} from '../../authenticated-spv-tracker-read-only-node-client.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from '../../relayer-core/devnet-reward-consolidation.js';
import { MINER_FEE } from '../../ergo-encoding.js';
import * as ownedDiscoveryModule
  from '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  discoverSubstrateFederatedRewardInputsV2,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardSignerBindingV1,
} from '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from '../../unsigned-ergo-transaction.js';

const ROOT_SOURCE = readFileSync(new URL(
  './substrate-federated-genesis-target-root-v1.ts',
  import.meta.url,
), 'utf8');
const DEPOSIT_SOURCE = readFileSync(new URL(
  '../../substrate-federated-pooled-reserve-deposit-v1.ts',
  import.meta.url,
), 'utf8');
const ROOT_MODULE = ts.createSourceFile(
  'substrate-federated-genesis-target-root-v1.ts',
  ROOT_SOURCE,
  ts.ScriptTarget.ES2022,
  true,
);
const DEPOSIT_MODULE = ts.createSourceFile(
  'substrate-federated-pooled-reserve-deposit-v1.ts',
  DEPOSIT_SOURCE,
  ts.ScriptTarget.ES2022,
  true,
);

const OWNED_DISCOVERY_MODULE =
  '../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
const PACKET_MODULE =
  '../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js';
const GENESIS_BUILDER = 'buildSubstrateFederatedNativeGenesisPegInPacketV1';
const CONTINUATION_BUILDER =
  'buildSubstrateFederatedNativeContinuationPegInPacketV1';
const PUBLIC_KEY_HEX = `02${'22'.repeat(32)}`;
const FUNDING_TREE = `0008cd02${'22'.repeat(32)}`;
const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const TARGET = Object.freeze({ role: 'synthetic-owned-target' });
const TARGET_BINDING = Object.freeze({
  processBindingDigestHex: '11'.repeat(32),
  executionTargetIdentityDigestHex: '22'.repeat(32),
});
const BASE_INPUT: Eip12Box = {
  boxId: 'f057d5272aae6fe107221adf6338a8c0d738e2f0179379594b4b3aa925827782',
  value: '2000000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 80,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

interface ImportBinding {
  readonly imported: string;
  readonly module: string;
}

interface RootCallerBinding {
  readonly builder: typeof GENESIS_BUILDER | typeof CONTINUATION_BUILDER;
  readonly selector: ImportBinding;
  readonly provenance: ImportBinding;
  readonly factory: ImportBinding;
  readonly sourceAmount: string;
  readonly packetRequirements: (requirements: FundingRequirements) => FundingRequirements;
  readonly guardFunding: (funding: unknown) => void;
  readonly blockStart: number;
  readonly blockEnd: number;
  readonly selectorCallText: string;
  readonly provenanceCallText: string;
  readonly sourceFunding: (funding: unknown) => Readonly<Eip12Box>;
  readonly guardText: string;
}

interface FundingRequirements {
  readonly sourceAmountNanoErg: string;
  readonly sourceLockCreationFeeNanoErg: string;
  readonly reserveTransitionFeeNanoErg: string;
}

interface MockNodeState {
  network: string;
  tipHeight: number;
  tipHeaderIdHex: string;
  genesisHeaderIds: string[];
  headerIdsByHeight: Map<number, string[]>;
  headersById: Map<string, Record<string, unknown>>;
  boxesByAddress: Map<string, readonly Eip12Box[]>;
}

interface FundingEquationResult {
  readonly usable: boolean;
  readonly change: bigint;
  readonly reason: 'underfunded' | 'dust' | null;
}

const rootCallers = extractRootCallerBindings();
const evaluateFunding = extractFundingEquation();

beforeEach(() => {
  ownedTarget.assert.mockReset();
  ownedTarget.assert.mockImplementation(value => {
    if (value !== TARGET) throw new Error('owned target provenance missing');
    return TARGET_BINDING;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('native root deposit funding purpose and cardinality', () => {
  it.each(rootCallers.flatMap(caller => [1, 2, 3].map(count => ({
    caller,
    count,
    name: `${caller.builder} with ${count} mature usable input${count === 1 ? '' : 's'}`,
  }))))('$name reaches the one-input packet consumer', async ({ caller, count }) => {
    const boxes = await canonicalRewardBoxes(Array.from(
      { length: count },
      (_, index) => ({ value: '300000000', creationHeight: 100 + index }),
    ));
    installNodeMocks(nodeStates({ delay1: boxes }));

    const consumed = await executeRootCaller(caller);

    expect(consumed).toStrictEqual(boxes[0]);
  });

  it.each(rootCallers)('$builder chooses a deposit-sufficient input rather than the oldest setup input', async caller => {
    const boxes = await canonicalRewardBoxes([
      { value: '12100000', creationHeight: 90 },
      { value: '12100000', creationHeight: 91 },
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));

    const consumed = await executeRootCaller(caller);

    expect(consumed).toStrictEqual(boxes[2]);
  });

  it('keeps the actual genesis discovery contract at three distinct setup inputs', async () => {
    const boxes = await canonicalRewardBoxes([
      { value: '300000000', creationHeight: 100 },
      { value: '300000000', creationHeight: 101 },
      { value: '300000000', creationHeight: 102 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));

    const report = await discoverSubstrateFederatedRewardInputsV2(signer());

    expect(report.genesisInputs).toEqual({
      tracker: boxes[0],
      duplicatePrevention: boxes[1],
      pooledReserve: boxes[2],
    });
    expect(new Set(Object.values(report.genesisBoxIds))).toHaveLength(3);
  });
});

describe('exact source-lock funding equation', () => {
  it.each([
    { value: '22199999', usable: false, reason: 'underfunded', change: -1n },
    { value: '22200000', usable: true, reason: null, change: 0n },
    { value: '22200001', usable: false, reason: 'dust', change: 1n },
    { value: '23199999', usable: false, reason: 'dust', change: 999_999n },
    { value: '23200000', usable: true, reason: null, change: 1_000_000n },
    { value: '300000000', usable: true, reason: null, change: 277_800_000n },
  ] as const)('classifies $value with distinct creation and reserve-transition fees', testCase => {
    expect(evaluateFunding({
      sourceFunding: { value: testCase.value },
      sourceAmount: 20_000_000n,
      transitionFee: BigInt(MINER_FEE),
      creationFee: BigInt(MINER_FEE),
    })).toEqual({
      usable: testCase.usable,
      reason: testCase.reason,
      change: testCase.change,
    });
  });
});

async function executeRootCaller(
  caller: RootCallerBinding,
): Promise<Readonly<Eip12Box>> {
  const runtime = ownedDiscoveryModule as unknown as Record<string, unknown>;
  const selector = runtime[caller.selector.imported];
  const provenance = runtime[caller.provenance.imported];
  const factory = runtime[caller.factory.imported];
  expect(caller.selector.module).toBe(OWNED_DISCOVERY_MODULE);
  expect(caller.provenance.module).toBe(OWNED_DISCOVERY_MODULE);
  expect(caller.factory.module).toBe(OWNED_DISCOVERY_MODULE);
  expect(typeof selector).toBe('function');
  expect(typeof provenance).toBe('function');
  expect(typeof factory).toBe('function');
  const requirements = (factory as (amount: string) => FundingRequirements)(caller.sourceAmount);
  expect(Object.isFrozen(requirements)).toBe(true);
  expect(requirements).toStrictEqual({ sourceAmountNanoErg: '20000000',
    sourceLockCreationFeeNanoErg: String(MINER_FEE), reserveTransitionFeeNanoErg: String(MINER_FEE) });
  const packetRequirements = caller.packetRequirements(requirements);
  expect(packetRequirements).toStrictEqual(requirements);
  expect(caller.guardText).toContain('funding.target.genesisHeaderIdHex');
  expect(caller.guardText).toContain('funding.target.tipHeight');
  expect(caller.guardText).toContain('heldDepositSnapshot.fullHeight');
  expect(caller.guardText).toContain('funding.target.tipHeaderIdHex');
  expect(caller.guardText).toContain('heldDepositSnapshot.headerIdHex');

  const owned = await (selector as (
    signerValue: Readonly<SubstrateFederatedRewardSignerBindingV1>,
    target: unknown,
    requirements: FundingRequirements,
  ) => Promise<unknown>)(signer(), TARGET, requirements);
  const funding = (provenance as (
    value: unknown,
    target: unknown,
    requirements: FundingRequirements,
  ) => unknown)(owned, TARGET, requirements);
  caller.guardFunding(funding);
  const sourceFundingInput = caller.sourceFunding(funding);
  const packetBuilder = vi.fn((input: Readonly<{
    sourceFundingInput: Readonly<Eip12Box>;
  }>) => {
    const equation = evaluateFunding({
      sourceFunding: input.sourceFundingInput,
      sourceAmount: BigInt(packetRequirements.sourceAmountNanoErg),
      transitionFee: BigInt(packetRequirements.reserveTransitionFeeNanoErg),
      creationFee: BigInt(packetRequirements.sourceLockCreationFeeNanoErg),
    });
    if (!equation.usable) {
      throw new Error(`source funding is ${equation.reason}`);
    }
    return input.sourceFundingInput;
  });

  const consumed = packetBuilder({ sourceFundingInput });
  expect(packetBuilder).toHaveBeenCalledOnce();
  return consumed;
}

function extractRootCallerBindings(sourceFile = ROOT_MODULE): readonly RootCallerBinding[] {
  const imports = new Map<string, ImportBinding>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.importClause?.namedBindings === undefined
      || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const specifier of statement.importClause.namedBindings.elements) {
      imports.set(specifier.name.text, {
        imported: specifier.propertyName?.text ?? specifier.name.text,
        module: statement.moduleSpecifier.text,
      });
    }
  }

  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = imports.get(node.expression.text);
      if (binding?.module === PACKET_MODULE
        && (binding.imported === GENESIS_BUILDER
          || binding.imported === CONTINUATION_BUILDER)) calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  expect(calls).toHaveLength(2);

  return calls.map(call => {
    const builderBinding = imports.get((call.expression as ts.Identifier).text)!;
    expect(call.arguments).toHaveLength(1);
    const packetInput = call.arguments[0]!;
    expect(ts.isObjectLiteralExpression(packetInput)).toBe(true);
    const sourceProperty = (packetInput as ts.ObjectLiteralExpression).properties.find(
      property => ts.isPropertyAssignment(property)
        && property.name.getText(sourceFile) === 'sourceFundingInput',
    );
    expect(sourceProperty !== undefined && ts.isPropertyAssignment(sourceProperty)).toBe(true);

    let block: ts.Block | undefined;
    for (let current: ts.Node | undefined = call.parent; current !== undefined; current = current.parent) {
      if (ts.isBlock(current)) { block = current; break; }
    }
    expect(block).toBeDefined();
    const ownedFunding = directDeclaration(block!, 'ownedFunding');
    const funding = directDeclaration(block!, 'funding');
    const requirement = directDeclaration(block!, 'depositFundingRequirements');
    expect(requirement.initializer !== undefined && ts.isCallExpression(requirement.initializer)
      && ts.isIdentifier(requirement.initializer.expression)).toBe(true);
    const factoryCall = requirement.initializer as ts.CallExpression;
    const factory = imports.get((factoryCall.expression as ts.Identifier).text);
    expect(factory).toBeDefined();
    expect(factoryCall.arguments).toHaveLength(1);
    expect(ts.isStringLiteral(factoryCall.arguments[0]!)).toBe(true);
    const sourceAmount = (factoryCall.arguments[0] as ts.StringLiteral).text;
    expect(sourceAmount).toBe('20000000');
    expect(requirement.getStart(sourceFile)).toBeLessThan(ownedFunding.getStart(sourceFile));
    expect(ownedFunding.initializer !== undefined
      && ts.isAwaitExpression(ownedFunding.initializer)
      && ts.isCallExpression(ownedFunding.initializer.expression)
      && ts.isIdentifier(ownedFunding.initializer.expression.expression)).toBe(true);
    expect(funding.initializer !== undefined
      && ts.isCallExpression(funding.initializer)
      && ts.isIdentifier(funding.initializer.expression)).toBe(true);
    const selectorName = ((ownedFunding.initializer as ts.AwaitExpression)
      .expression as ts.CallExpression).expression as ts.Identifier;
    const provenanceName = (funding.initializer as ts.CallExpression).expression as ts.Identifier;
    const selectorCall = (ownedFunding.initializer as ts.AwaitExpression).expression as ts.CallExpression;
    const provenanceCall = funding.initializer as ts.CallExpression;
    expect(selectorCall.arguments.map(argument => argument.getText(sourceFile)))
      .toEqual(['setup.signer', 'target', 'depositFundingRequirements']);
    expect(provenanceCall.arguments.map(argument => argument.getText(sourceFile)))
      .toEqual(['ownedFunding', 'target', 'depositFundingRequirements']);
    const selector = imports.get(selectorName.text);
    const provenance = imports.get(provenanceName.text);
    expect(selector).toBeDefined();
    expect(provenance).toBeDefined();
    const guard = block!.statements.find(statement => ts.isIfStatement(statement)
      && statement.getText(sourceFile).includes('funding.target')
      && statement.getStart(sourceFile) < call.getStart(sourceFile));
    expect(guard).toBeDefined();
    const sourceExpression = (sourceProperty as ts.PropertyAssignment).initializer
      .getText(sourceFile);
    const compiledSource = new Function(
      'funding',
      `'use strict'; return (${sourceExpression});`,
    ) as (value: unknown) => Readonly<Eip12Box>;
    const property = (object: ts.ObjectLiteralExpression, name: string) => {
      const match = object.properties.find(item => ts.isPropertyAssignment(item)
        && item.name.getText(sourceFile) === name);
      expect(match !== undefined && ts.isPropertyAssignment(match)).toBe(true);
      return (match as ts.PropertyAssignment).initializer;
    };
    const intent = property(packetInput as ts.ObjectLiteralExpression, 'sourceIntent');
    const fees = property(packetInput as ts.ObjectLiteralExpression, 'fees');
    expect(ts.isObjectLiteralExpression(intent)).toBe(true);
    expect(ts.isObjectLiteralExpression(fees)).toBe(true);
    const expressions = {
      sourceAmountNanoErg: property(intent as ts.ObjectLiteralExpression, 'amountNanoErg'),
      sourceLockCreationFeeNanoErg: property(fees as ts.ObjectLiteralExpression, 'sourceLockCreationNanoErg'),
      reserveTransitionFeeNanoErg: property(fees as ts.ObjectLiteralExpression, 'reserveTransitionNanoErg'),
    };
    for (const [field, expression] of Object.entries(expressions)) {
      expect(ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
        && expression.expression.text === 'depositFundingRequirements' && expression.name.text === field).toBe(true);
    }
    const packetRequirements = new Function('depositFundingRequirements', `'use strict'; return ({${
      Object.entries(expressions).map(([field, expression]) => `${field}: ${expression.getText(sourceFile)}`).join(',')
    }});`) as RootCallerBinding['packetRequirements'];
    const runGuard = new Function('funding', 'batch', 'heldDepositSnapshot', 'transactions',
      'genesisHeaderIdHex', 'payout', guard!.getText(sourceFile));
    const guardFunding = (value: unknown) => runGuard(value,
      { request: { target: { genesisHeaderIdHex: GENESIS_HEADER_ID } } },
      { fullHeight: 120, headerIdHex: TIP_HEADER_ID }, [{ confirmationHeight: 110 }],
      GENESIS_HEADER_ID, { confirmationHeight: 110 });

    return Object.freeze({
      builder: builderBinding.imported as RootCallerBinding['builder'],
      selector: selector!,
      provenance: provenance!,
      factory: factory!, sourceAmount, packetRequirements, guardFunding,
      blockStart: block!.getStart(sourceFile), blockEnd: block!.getEnd(),
      selectorCallText: selectorCall.getText(sourceFile),
      provenanceCallText: provenanceCall.getText(sourceFile),
      sourceFunding: compiledSource,
      guardText: guard!.getText(sourceFile),
    });
  }).sort((left, right) => left.builder.localeCompare(right.builder));
}

describe('exact root funding requirement wiring', () => {
  it.each(rootCallers.flatMap(caller => [
    { caller, fault: 'selector requirement' }, { caller, fault: 'provenance requirement' },
    { caller, fault: 'source amount' }, { caller, fault: 'creation fee' },
    { caller, fault: 'transition fee' },
  ]))('kills $caller.builder $fault wiring mutation', ({ caller, fault }) => {
    const [before, after] = fault === 'selector requirement'
      ? [caller.selectorCallText, caller.selectorCallText.replace(', depositFundingRequirements', '')]
      : fault === 'provenance requirement'
        ? [caller.provenanceCallText, caller.provenanceCallText.replace(', depositFundingRequirements', '')]
        : fault === 'source amount'
          ? ['depositFundingRequirements.sourceAmountNanoErg', "'20000000'"]
          : fault === 'creation fee'
            ? ['depositFundingRequirements.sourceLockCreationFeeNanoErg', 'depositFundingRequirements.reserveTransitionFeeNanoErg']
            : ['depositFundingRequirements.reserveTransitionFeeNanoErg', 'depositFundingRequirements.sourceLockCreationFeeNanoErg'];
    expect(before).not.toBe(after);
    const block = ROOT_SOURCE.slice(caller.blockStart, caller.blockEnd);
    expect(block.split(before)).toHaveLength(2);
    const mutated = ROOT_SOURCE.slice(0, caller.blockStart) + block.replace(before, after)
      + ROOT_SOURCE.slice(caller.blockEnd);
    const sourceFile = ts.createSourceFile('root-mutant.ts', mutated, ts.ScriptTarget.ES2022, true);
    expect(() => extractRootCallerBindings(sourceFile)).toThrow();
  });

  it.each(rootCallers.flatMap(caller => ['genesisHeaderIdHex', 'tipHeight', 'tipHeaderIdHex']
    .map(field => ({ caller, field }))))('retains $caller.builder held-anchor $field refusal', ({ caller, field }) => {
    const target: Record<string, unknown> = { genesisHeaderIdHex: GENESIS_HEADER_ID,
      tipHeight: 120, tipHeaderIdHex: TIP_HEADER_ID };
    expect(() => caller.guardFunding({ target })).not.toThrow();
    target[field] = field === 'tipHeight' ? 121 : 'aa'.repeat(32);
    expect(() => caller.guardFunding({ target })).toThrow(/funding does not follow/);
  });
});

function directDeclaration(block: ts.Block, name: string): ts.VariableDeclaration {
  const matches = block.statements.flatMap(statement =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter(declaration =>
        ts.isIdentifier(declaration.name) && declaration.name.text === name)
      : []);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function extractFundingEquation(): (input: Readonly<{
  sourceFunding: Readonly<{ value: string }>;
  sourceAmount: bigint;
  transitionFee: bigint;
  creationFee: bigint;
}>) => FundingEquationResult {
  const minimum = DEPOSIT_MODULE.statements.find(statement =>
    ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name)
      && declaration.name.text === 'MIN_BOX_VALUE')) as ts.VariableStatement | undefined;
  const minimumDeclaration = minimum?.declarationList.declarations.find(declaration =>
    ts.isIdentifier(declaration.name) && declaration.name.text === 'MIN_BOX_VALUE');
  expect(minimumDeclaration?.initializer).toBeDefined();
  const build = DEPOSIT_MODULE.statements.find(statement =>
    ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'buildSourceLockCreation') as ts.FunctionDeclaration | undefined;
  expect(build?.body).toBeDefined();
  const changeDeclaration = build!.body!.statements.flatMap(statement =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.filter(declaration =>
        ts.isIdentifier(declaration.name) && declaration.name.text === 'change')
      : [])[0];
  expect(changeDeclaration?.initializer).toBeDefined();
  const guards = build!.body!.statements.filter(ts.isIfStatement);
  expect(guards.length).toBeGreaterThanOrEqual(2);
  const underfunded = guards[0]!;
  const positive = guards[1]!;
  expect(ts.isBlock(positive.thenStatement)).toBe(true);
  const dust = (positive.thenStatement as ts.Block).statements.find(ts.isIfStatement);
  expect(dust).toBeDefined();
  const body = [
    `'use strict';`,
    `const MIN_BOX_VALUE = ${minimumDeclaration!.initializer!.getText(DEPOSIT_MODULE)};`,
    `const change = ${changeDeclaration!.initializer!.getText(DEPOSIT_MODULE)};`,
    `if (${underfunded.expression.getText(DEPOSIT_MODULE)}) return { usable: false, change, reason: 'underfunded' };`,
    `if (${positive.expression.getText(DEPOSIT_MODULE)} && ${dust!.expression.getText(DEPOSIT_MODULE)}) return { usable: false, change, reason: 'dust' };`,
    `return { usable: true, change, reason: null };`,
  ].join('\n');
  expect(body).not.toMatch(/\brequire\s*\(/u);
  return new Function('input', body) as (input: Readonly<{
    sourceFunding: Readonly<{ value: string }>;
    sourceAmount: bigint;
    transitionFee: bigint;
    creationFee: bigint;
  }>) => FundingEquationResult;
}

function signer(): SubstrateFederatedRewardSignerBindingV1 {
  return {
    publicKeyHex: PUBLIC_KEY_HEX,
    p2pkErgoTreeHex: `0008cd${PUBLIC_KEY_HEX}`,
    rewardInputErgoTrees: {
      delay1: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
      delay720: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
    },
    networkPrefix: 16,
  };
}

async function canonicalRewardBoxes(
  candidates: readonly Readonly<{ value: string; creationHeight: number }>[],
): Promise<readonly Eip12Box[]> {
  const change = BigInt(BASE_INPUT.value)
    - candidates.reduce((sum, candidate) => sum + BigInt(candidate.value), 0n);
  expect(change).toBeGreaterThanOrEqual(0n);
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [...candidates.map(candidate => ({
      value: candidate.value,
      ergoTree: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
      assets: [],
      additionalRegisters: {},
      creationHeight: candidate.creationHeight,
    })), ...(change === 0n ? [] : [{
      value: change.toString(),
      ergoTree: BASE_INPUT.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: BASE_INPUT.creationHeight,
    }])],
  }, 'root deposit funding cardinality fixture');
  return transaction.outputs.slice(0, candidates.length);
}

function nodeStates(input: Readonly<{
  delay1?: readonly Eip12Box[];
  delay720?: readonly Eip12Box[];
  tipHeight?: number;
}>): Map<string, MockNodeState> {
  const create = (): MockNodeState => ({
    network: 'devnet',
    tipHeight: input.tipHeight ?? 120,
    tipHeaderIdHex: TIP_HEADER_ID,
    genesisHeaderIds: [GENESIS_HEADER_ID],
    headerIdsByHeight: new Map([
      [1, [GENESIS_HEADER_ID]],
      [119, ['93'.repeat(32)]],
      [input.tipHeight ?? 120, [TIP_HEADER_ID]],
    ]),
    headersById: new Map(),
    boxesByAddress: new Map([
      ['reward-delay-1', input.delay1 ?? []],
      ['reward-delay-720', input.delay720 ?? []],
    ]),
  });
  return new Map([
    [SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN, create()],
    [SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN, create()],
  ]);
}

// These public doubles isolate caller-purpose/cardinality. The unchanged full
// W/ID and canonical-ancestry proof I/O has its own existing evidence and is
// not replayed as a new claim by this falsifier.
function installNodeMocks(states: Map<string, MockNodeState>): void {
  const readCounts = new Map<string, number>();
  const state = (client: AuthenticatedSpvTrackerReadOnlyNodeClient) => {
    const found = states.get(client.observationSourceId);
    if (!found) throw new Error(`unexpected source ${client.observationSourceId}`);
    return found;
  };
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getInfo')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient) {
      const current = state(this);
      return { network: current.network, fullHeight: current.tipHeight,
        bestFullHeaderId: current.tipHeaderIdHex };
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBestHeader')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient) {
      const current = state(this);
      return current.headersById.get(current.tipHeaderIdHex)
        ?? { id: current.tipHeaderIdHex, height: current.tipHeight, parentId: '90'.repeat(32) };
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBlockHeaderIdsAtHeight')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient, height) {
      const current = state(this);
      return [...(current.headerIdsByHeight.get(height)
        ?? (height === 1 ? current.genesisHeaderIds : []))];
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBlockHeaderChainSlice')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient, fromHeight, toHeight) {
      const current = state(this);
      return Array.from({ length: toHeight - fromHeight }, (_, index) => {
        const height = fromHeight + index + 1;
        const id = current.headerIdsByHeight.get(height)?.[0];
        if (id === undefined) throw new Error(`missing fixture header at ${height}`);
        return current.headersById.get(id)
          ?? { id, height, parentId: '90'.repeat(32) };
      });
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBlockHeaderById')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient, headerId) {
      return state(this).headersById.get(headerId) ?? null;
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getAddressForErgoTree')
    .mockImplementation(async function (ergoTreeHex) {
      if (ergoTreeHex === deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1)) {
        return 'reward-delay-1';
      }
      if (ergoTreeHex === deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720)) {
        return 'reward-delay-720';
      }
      throw new Error('unexpected reward tree');
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getUnspentBoxesByAddressPage')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient, address, page) {
      const boxes = state(this).boxesByAddress.get(address) ?? [];
      const key = `${this.observationSourceId}\0${address}`;
      readCounts.set(key, (readCounts.get(key) ?? 0) + 1);
      return [...boxes].slice(page.offset, page.offset + page.limit);
    });
}
