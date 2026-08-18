import { describe, expect, it } from 'vitest';

import {
  classifyBridgeLayer,
  inspectLayerImports,
  type LayerSourceFile,
} from './layer-import-rules.js';

function inspect(files: Record<string, string>) {
  const sourceFiles: LayerSourceFile[] = Object.entries(files).map(([path, source]) => ({
    path,
    source,
  }));
  return inspectLayerImports(sourceFiles);
}

describe('layer import rules', () => {
  it('classifies only physical architecture layers', () => {
    expect(classifyBridgeLayer('ergo-settlement-core/codec.ts')).toBe('ergo-settlement-core');
    expect(classifyBridgeLayer('profiles/substrate-grandpa-v1/statement.ts')).toBe('profiles');
    expect(classifyBridgeLayer('state-tracker.ts')).toBeNull();
  });

  it('accepts the target one-way dependency graph and approved pure core imports', () => {
    expect(inspect({
      'ergo-settlement-core/value.ts': `
        import blakejs from 'blakejs';
        export const value = blakejs;
      `,
      'ergo-settlement-core/index.ts': `export * from './value.js';`,
      'relayer-core/lifecycle.ts': `import '../ergo-settlement-core/index.js';`,
      'profiles/substrate-grandpa-v1/index.ts': `
        import blakejs from 'blakejs';
        import '../../ergo-settlement-core/index.js';
        export const digest = blakejs;
      `,
      'adapters/frontier.ts': `
        import '../relayer-core/lifecycle.js';
        import '../profiles/substrate-grandpa-v1/index.js';
      `,
      'apps/bridge-daemon.ts': `
        import '../relayer-core/lifecycle.js';
        import '../adapters/frontier.js';
      `,
    })).toEqual([]);
  });

  it('resolves NodeNext .mjs and .cjs imports to layered TypeScript sources', () => {
    expect(inspect({
      'ergo-settlement-core/esm-value.mts': `export const esmValue = true;`,
      'ergo-settlement-core/esm-index.mts': `export * from './esm-value.mjs';`,
      'ergo-settlement-core/cjs-value.cts': `export const cjsValue = true;`,
      'ergo-settlement-core/cjs-index.cts': `export * from './cjs-value.cjs';`,
    })).toEqual([]);
  });

  it('rejects core access to adapters, legacy modules, and non-pure packages', () => {
    const violations = inspect({
      'legacy.ts': `export const legacy = true;`,
      'adapters/ergo-rpc.ts': `export const rpc = true;`,
      'ergo-settlement-core/invalid.ts': `
        import axios from 'axios';
        import '../adapters/ergo-rpc.js';
        import '../legacy.js';
        export const invalid = axios;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core external import is not allowlisted: axios',
      'ergo-settlement-core must not depend on adapters',
      'ergo-settlement-core must not import an unclassified legacy module: legacy.ts',
    ]);
  });

  it('rejects adapter and composition-root shortcuts into unclassified legacy modules', () => {
    const violations = inspect({
      'legacy-state.ts': `export const state = true;`,
      'legacy-daemon.ts': `export const daemon = true;`,
      'adapters/sqlite.ts': `import '../legacy-state.js';`,
      'apps/bridge-daemon.ts': `import '../legacy-daemon.js';`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'adapters must not import an unclassified legacy module: legacy-state.ts',
      'apps must not import an unclassified legacy module: legacy-daemon.ts',
    ]);
  });

  it('allows only the exact reviewed Gate 5 app-to-legacy composition seam', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.ts';
    const reviewedTarget =
      'substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.ts';
    expect(inspect({
      [reviewedRoot]: `
        import '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
      `,
      [reviewedTarget]: 'export const lifecycle = true;',
    })).toEqual([]);

    expect(inspect({
      'apps/bridge-daemon/other-root.ts': `
        import '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';
      `,
      [reviewedTarget]: 'export const lifecycle = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${reviewedTarget}`,
    ]);

    expect(inspect({
      [reviewedRoot]: `import '../../unreviewed-legacy-authority.js';`,
      'unreviewed-legacy-authority.ts': 'export const authority = true;',
    }).map(violation => violation.message)).toEqual([
      'apps must not import an unclassified legacy module: unreviewed-legacy-authority.ts',
    ]);
  });

  it('limits the isolated-devnet execution root to its reviewed broadcast bindings', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.ts';
    const authorizerTarget =
      'substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.ts';
    const transportTarget =
      'substrate-federated-isolated-devnet-checked-submission-transport-v1.ts';
    expect(inspect({
      [reviewedRoot]: `
        import {
          assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1,
          createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1,
        } from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
      `,
      [authorizerTarget]: 'export const authorizer = true;',
      [transportTarget]: 'export const transport = true;',
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          authorizeUnreviewedBroadcast,
        } from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
      `,
      [authorizerTarget]: 'export const authorizer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js#authorizeUnreviewedBroadcast',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        export const escapedTransport =
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1;
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export is not allowlisted: escapedTransport',
      'restricted capability binding must not escape its reviewed call: ../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js#createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        export function leakedTransport(target: unknown, authorizer: unknown) {
          return createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
            target,
            authorizer,
          );
        }
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export is not allowlisted: leakedTransport',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
        function leakedTransport(target: unknown, authorizer: unknown) {
          return createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1(
            target,
            authorizer,
          );
        }
        export {
          leakedTransport as runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1,
        };
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      'reviewed app root export must not be aliased: leakedTransport#runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1',
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-execution-root.ts': `
        import {
          createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1,
        } from '../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js';
      `,
      [transportTarget]: 'export const transport = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${transportTarget}`,
    ]);
  });

  it('limits the dual-node recovery composition seam to its reviewed process producer', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-dual-node-recovery-composition-v1.ts';
    const reviewedTarget =
      'substrate-federated-authority-safe-devnet-process-v1.ts';
    expect(inspect({
      [reviewedRoot]: `
        import {
          assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
          assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
          type OwnedAuthoritySafeDevnetRecoveryBestTipV1,
          type OwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
          type OwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          withOwnedAuthoritySafeDevnetProcessesV1,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-authority-safe-devnet-process-v1.js#withOwnedAuthoritySafeDevnetProcessesV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          withOwnedAuthoritySafeDevnetProcessesV1,
        } from '../.././substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../.././substrate-federated-authority-safe-devnet-process-v1.js#withOwnedAuthoritySafeDevnetProcessesV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import * as processModule from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import must use reviewed named bindings: ../../substrate-federated-authority-safe-devnet-process-v1.js',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import {
          assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt as assertProcess,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding must not be aliased: ../../substrate-federated-authority-safe-devnet-process-v1.js#assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        void import('../../substrate-federated-authority-safe-devnet-process-v1.js');
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import must use reviewed named bindings: ../../substrate-federated-authority-safe-devnet-process-v1.js',
    ]);

    expect(inspect({
      [reviewedRoot]: `import '../../unreviewed-recovery-authority.js';`,
      'unreviewed-recovery-authority.ts': 'export const authority = true;',
    }).map(violation => violation.message)).toEqual([
      'apps must not import an unclassified legacy module: unreviewed-recovery-authority.ts',
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-recovery-root.ts': `
        import '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [reviewedTarget]: 'export const processProducer = true;',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${reviewedTarget}`,
    ]);
  });

  it('limits the concrete recovery campaign to its exact process and SQLite bindings', () => {
    const reviewedRoot =
      'apps/bridge-daemon/substrate-federated-dual-node-recovery-campaign-v1.ts';
    const processTarget =
      'substrate-federated-authority-safe-devnet-process-v1.ts';
    const acceptanceTarget =
      'substrate-federated-authority-safe-devnet-acceptance-v1.ts';
    const stateTarget = 'state-tracker.ts';
    expect(inspect({
      [reviewedRoot]: `
        import { StateTracker } from '../../state-tracker.js';
        import {
          assertSubstrateFederatedSourceLockedRecoveryTimelineV1,
          type SubstrateFederatedSourceLockedRecoveryTimelineV1,
        } from '../../substrate-federated-authority-safe-devnet-acceptance-v1.js';
        import {
          assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material,
          captureOwnedAuthoritySafeDevnetRecoveryTimelineV1,
          type OwnedAuthoritySafeDevnetProcessV1Input,
          type OwnedAuthoritySafeDevnetRecoveryTimelineV1ObservationInput,
        } from '../../substrate-federated-authority-safe-devnet-process-v1.js';
      `,
      [acceptanceTarget]: 'export const sourceLockedAcceptance = true;',
      [processTarget]: 'export const processProducer = true;',
      [stateTarget]: 'export class StateTracker {}',
    })).toEqual([]);

    expect(inspect({
      [reviewedRoot]: `
        import { captureSubstrateFederatedSourceLockedRecoveryTimelineV1 }
          from '../../substrate-federated-authority-safe-devnet-acceptance-v1.js';
      `,
      [acceptanceTarget]: 'export const sourceLockedAcceptance = true;',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-authority-safe-devnet-acceptance-v1.js#captureSubstrateFederatedSourceLockedRecoveryTimelineV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import { withOwnedAuthoritySafeDevnetProcessesV1 }
          from '../../substrate-federated-authority-safe-devnet-process-v1.js';
        import { StateTracker } from '../../state-tracker.js';
      `,
      [processTarget]: 'export const processProducer = true;',
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../substrate-federated-authority-safe-devnet-process-v1.js#withOwnedAuthoritySafeDevnetProcessesV1',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import { StateTracker, type PegInEvent } from '../../state-tracker.js';
      `,
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: ../../state-tracker.js#PegInEvent',
    ]);

    expect(inspect({
      [reviewedRoot]: `
        import * as state from '../../state-tracker.js';
      `,
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      'restricted capability import must use reviewed named bindings: ../../state-tracker.js',
    ]);

    expect(inspect({
      'apps/bridge-daemon/other-campaign.ts': `
        import { StateTracker } from '../../state-tracker.js';
      `,
      [stateTarget]: 'export class StateTracker {}',
    }).map(violation => violation.message)).toEqual([
      `apps must not import an unclassified legacy module: ${stateTarget}`,
    ]);
  });

  it('rejects profile access to relayer-core or adapters', () => {
    const violations = inspect({
      'relayer-core/lifecycle.ts': `export const lifecycle = true;`,
      'adapters/frontier.ts': `export const frontier = true;`,
      'profiles/substrate-grandpa-v1/invalid.ts': `
        import '../../relayer-core/lifecycle.js';
        import '../../adapters/frontier.js';
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles must not depend on relayer-core',
      'profiles must not depend on adapters',
    ]);
  });

  it('rejects persistence and ambient RPC capabilities in relayer-core', () => {
    const violations = inspect({
      'relayer-core/invalid.ts': `
        import Database from 'better-sqlite3';
        export const environment = process;
        export const request = fetch;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'relayer-core external import is not allowlisted: better-sqlite3',
      'relayer-core must not access unbound global capability: process',
      'relayer-core must not access unbound global capability: fetch',
    ]);
  });

  it('rejects unreviewed dependencies and ambient capabilities in pure profiles', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts': `
        import axios from 'axios';
        export const environment = process;
        export const request = fetch;
        export const digest = crypto;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles external import is not allowlisted: axios',
      'profiles must not access unbound global capability: process',
      'profiles must not access unbound global capability: fetch',
      'profiles must not access unbound global capability: crypto',
    ]);
  });

  it('allows only the exact profile files to use the reviewed crypto and AVL runtimes', () => {
    expect(inspect({
      'ergo-settlement-core/strict-json.ts':
        `import { createHash } from 'node:crypto'; export const digest = createHash('sha256').update('x').digest('hex');`,
      'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts':
        `import { ECDH } from 'node:crypto'; export const converted = ECDH.convertKey('02', 'secp256k1');`,
      'profiles/substrate-grandpa-v1/duplicate-prevention.ts':
        `import { bridge_generate_proofs, bridge_lookup_membership, empty_digest } from '../../../../wasm-avl/pkg/bridge_avl.js';`,
      'profiles/substrate-grandpa-v1/spv-tracker-authenticated.ts':
        `import { tracker_v2_empty_digest, tracker_v2_get_proof, tracker_v2_insert, tracker_v2_verify_insert } from '../../../../wasm-avl/pkg/bridge_avl.js';`,
    })).toEqual([]);
  });

  it('rejects escaping or broadening the reviewed settlement-core hash capability', () => {
    const violations = inspect({
      'ergo-settlement-core/strict-json.ts': `
        import { createHash, sign } from 'node:crypto';
        export const hashFactory = createHash;
        export function openHash() { return createHash('sha256'); }
        export const weakDigest = createHash('md5').update('x').digest('hex');
        export const signature = sign;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'restricted capability import binding is not allowlisted: node:crypto#sign',
      'restricted capability binding must not escape its reviewed call: node:crypto#createHash',
      'restricted capability binding must not escape its reviewed call: node:crypto#createHash',
      'restricted capability binding must not escape its reviewed call: node:crypto#createHash',
    ]);
  });

  it('rejects broader or disguised capability imports from the reviewed profile files', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts':
        `import { ECDH, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'; export const keygen = new ECDH('secp256k1');`,
      'profiles/substrate-grandpa-v1/duplicate-prevention.ts':
        `import * as bridgeAvl from '../../../../wasm-avl/pkg/bridge_avl.js'; export const avl = bridgeAvl;`,
      'profiles/substrate-grandpa-v1/spv-tracker-authenticated.ts':
        `import { tracker_v2_insert as insert, bridge_generate_proofs } from '../../../../wasm-avl/pkg/bridge_avl.js'; export const trackerInsert = insert;`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'restricted capability import must use reviewed named bindings: ../../../../wasm-avl/pkg/bridge_avl.js',
      'restricted capability binding must not escape its reviewed call: node:crypto#ECDH',
      'restricted capability import binding is not allowlisted: node:crypto#createPrivateKey',
      'restricted capability import binding is not allowlisted: node:crypto#generateKeyPairSync',
      'restricted capability import binding is not allowlisted: node:crypto#sign',
      'restricted capability import binding is not allowlisted: ../../../../wasm-avl/pkg/bridge_avl.js#bridge_generate_proofs',
      'restricted capability import binding must not be aliased: ../../../../wasm-avl/pkg/bridge_avl.js#tracker_v2_insert',
    ]);
  });

  it('rejects transitive re-exports of restricted profile capabilities', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/ergo-settlement-policy.ts': `
        import { ECDH } from 'node:crypto';
        export { ECDH };
      `,
      'profiles/substrate-grandpa-v1/duplicate-prevention.ts': `
        import { bridge_generate_proofs } from '../../../../wasm-avl/pkg/bridge_avl.js';
        export { bridge_generate_proofs };
      `,
      'profiles/substrate-grandpa-v1/consumer.ts': `
        import { ECDH } from './ergo-settlement-policy.js';
        import { bridge_generate_proofs } from './duplicate-prevention.js';
        export const keygen = new ECDH('secp256k1');
        export const rawAvl = bridge_generate_proofs;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'restricted capability binding must not be re-exported: ../../../../wasm-avl/pkg/bridge_avl.js#bridge_generate_proofs',
      'restricted capability binding must not be re-exported: node:crypto#ECDH',
    ]);
  });

  it('rejects profile-runtime allowlist reuse from any other file', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts': `
        import { ECDH } from 'node:crypto';
        import '../../../../wasm-avl/pkg/bridge_avl.js';
        export const curve = ECDH;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles external import is not allowlisted: node:crypto',
      'relative import does not resolve inside the checked source tree: ../../../../wasm-avl/pkg/bridge_avl.js',
    ]);
  });

  it('rejects indirect dynamic-code constructors in pure profiles', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts': `
        export const fromProperty =
          ({}).constructor.constructor('return process')();
        export const fromElement =
          [][ 'filter' ][ 'constructor' ]('return fetch')();
        const { constructor: DynamicFunction } = [].filter;
        export const fromDestructuring = DynamicFunction('return process')();
        const ReflectedFunction = Reflect.get([].filter, 'constructor');
        export const fromReflection = ReflectedFunction('return fetch')();
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'profiles must not access an indirect dynamic-code constructor',
      'profiles must not access an indirect dynamic-code constructor',
      'profiles must not bind an indirect dynamic-code constructor',
      'profiles must not access unbound global capability: Reflect',
    ]);
  });

  it('rejects dynamic bypasses, unresolved imports, and layered module cycles', () => {
    const violations = inspect({
      'ergo-settlement-core/a.ts': `
        import('./b.js');
        require('./missing.js');
        import(dynamicTarget);
      `,
      'ergo-settlement-core/b.ts': `export * from './a.js';`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'relative import does not resolve inside the checked source tree: ./missing.js',
      'layered modules require a static string import target',
      'layered module cycle: ergo-settlement-core/a.ts -> ergo-settlement-core/b.ts -> ergo-settlement-core/a.ts',
    ]);
  });

  it('rejects a bare-specifier bypass of a physical layer dependency', () => {
    const violations = inspect({
      'profiles/substrate-grandpa-v1/invalid.ts':
        `import 'relayer-core/lifecycle.js';`,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'layer imports must be relative and resolve inside the checked source tree: relayer-core/lifecycle.js',
    ]);
  });

  it('rejects import-equals and import-type bypasses', () => {
    const violations = inspect({
      'adapters/ergo-rpc.ts': `export interface ErgoRpc { readonly url: string }`,
      'ergo-settlement-core/invalid.ts': `
        import ErgoRpcModule = require('../adapters/ergo-rpc.js');
        export type ErgoRpc = import('../adapters/ergo-rpc.js').ErgoRpc;
        export const module = ErgoRpcModule;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core must not depend on adapters',
      'ergo-settlement-core must not depend on adapters',
    ]);
  });

  it('rejects direct, aliased, and computed global capabilities in settlement core', () => {
    const violations = inspect({
      'ergo-settlement-core/invalid.ts': `
        export const runtime = process;
        export const request = fetch;
        export const signer = crypto;
        export const computed = globalThis['fetch'];
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core must not access unbound global capability: process',
      'ergo-settlement-core must not access unbound global capability: fetch',
      'ergo-settlement-core must not access unbound global capability: crypto',
      'ergo-settlement-core must not access unbound global capability: globalThis',
    ]);
  });

  it('allows capability-like names when they resolve to local declarations', () => {
    expect(inspect({
      'ergo-settlement-core/local-names.ts': `
        const process = { env: 'pure input' };
        const fetch = (value: string): string => value;
        const crypto = { digest: 'fixed' };
        export const local = [process.env, fetch('value'), crypto.digest];
      `,
    })).toEqual([]);
  });

  it('rejects erased ambient declarations that fall through to runtime globals', () => {
    const violations = inspect({
      'ergo-settlement-core/ambient.ts': `
        declare const process: { readonly env: unknown };
        declare function fetch(value: string): Promise<unknown>;
        declare const crypto: { readonly subtle: unknown };
        export const runtime = process;
        export const request = fetch;
        export const signer = crypto;
      `,
    });

    expect(violations.map(violation => violation.message)).toEqual([
      'ergo-settlement-core must not access unbound global capability: process',
      'ergo-settlement-core must not access unbound global capability: fetch',
      'ergo-settlement-core must not access unbound global capability: crypto',
      'ergo-settlement-core must not access unbound global capability: process',
      'ergo-settlement-core must not access unbound global capability: fetch',
      'ergo-settlement-core must not access unbound global capability: crypto',
    ]);
  });
});
