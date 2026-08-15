import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

const scriptUrl = new URL('./scripts/spikes/spike13-authenticated-spv-tracker-vm.ts', import.meta.url);
const scriptSource = readFileSync(scriptUrl, 'utf8');
const settlementScriptUrl = new URL(
  './scripts/spikes/spike14-authenticated-settlement-full-tx-eval.ts',
  import.meta.url,
);
const settlementScriptSource = readFileSync(settlementScriptUrl, 'utf8');
const legacyProofBoundScriptSource = readFileSync(new URL(
  './scripts/spikes/spike12-trustless-burn-full-tx-eval.ts',
  import.meta.url,
), 'utf8');

describe('authenticated SPV tracker VM harness boundary', () => {
  it('retains real-header replay and adds pinned deterministic offline execution', () => {
    expect(scriptSource).toContain("'/blocks/lastHeaders/10'");
    expect(scriptSource).toContain('orderAndValidateMinedHeaderWindow(rawHeaders)');
    expect(scriptSource).toContain('deriveSimplifiedUpcomingPreHeader(headers[0].raw)');
    expect(scriptSource).toContain('buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0].raw)');
    expect(scriptSource).toContain('buildErgoExtensionMembershipProof');
    expect(scriptSource).toContain('computedRootHex !== header.extensionRoot');
    expect(scriptSource).toContain("process.argv.includes('--synthetic-context')");
    expect(scriptSource).toContain('compilePinnedAuthenticatedV2VmTrees');
    expect(scriptSource).toContain('buildDeterministicSyntheticVmHeaderContext');
    expect(scriptSource).toContain('deterministic synthetic headers are VM inputs, not mined-header evidence');
    expect(scriptSource).toContain('assertContextExtensionSafe');
    expect(scriptSource).toContain('wallet.sign_transaction');
    expect(scriptSource).toContain("process.argv.includes('--jvm-conformance')");
    expect(scriptSource).toContain('verifyAuthenticatedV2JvmVmFixture');
    expect(scriptSource).toContain("inputs: [{ role: 'tracker', ergoTreeHex: trackerTree }]");
    expect(scriptSource).toContain('--jvm-conformance requires a canonical mined-header context');
  });

  it('has no transaction-check, submit, deployment, or runtime-state client', () => {
    expect(scriptSource).not.toMatch(/fetch\([^\n]+\/transactions/);
    expect(scriptSource).not.toContain('/script/p2sAddress');
    expect(scriptSource).not.toContain('submit_transaction');
    expect(scriptSource).not.toContain('deployed_state');
    expect(scriptSource).not.toContain('nodePost');
  });

  it('derives the pinned tree before selecting synthetic or mined header context', () => {
    expect(scriptSource.indexOf('const compiled = await compilePinnedAuthenticatedV2VmTrees'))
      .toBeLessThan(scriptSource.indexOf('if (syntheticContext)'));
  });

  it('prints the deterministic 0x0401 field needed by the isolated patched devnet', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(scriptUrl), '--print-extension-field'],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toMatch(/^0401:[0-9a-f]{128}$/);
  });

  it('defines a positive spend and a bounded fail-closed negative matrix', () => {
    expect(scriptSource).toContain('PASS valid authenticated admission');
    expect(scriptSource).toContain('mismatched embedded checkpoint');
    expect(scriptSource).toContain('finality proof system ID');
    expect(scriptSource).toContain('finality statement digest');
    expect(scriptSource).toContain('finality program ID');
    expect(scriptSource).toContain('finality verifier profile ID');
    expect(scriptSource).toContain('finality proof payload digest');
    expect(scriptSource).toContain('aggregate finality proof digest');
    expect(scriptSource).toContain('wrong header index');
    expect(scriptSource).toContain('forged extension proof');
    expect(scriptSource).toContain('missing mandatory aggregate finality commitment Var');
    expect(scriptSource).toContain('unchanged AVL digest');
  });

  it('states the proof-bound attestor-authorized boundary without trustless acceptance claims', () => {
    expect(scriptSource).toContain('R9 remains the finality authority');
    expect(scriptSource).toContain('No trustless proof acceptance');
    expect(scriptSource).not.toMatch(/proves trustless|trustless proof acceptance[^,]*proved/i);
  });
});

describe('authenticated settlement VM harness boundary', () => {
  it('uses pinned linked trees in both synthetic and mined-header modes', () => {
    expect(settlementScriptSource).not.toContain('/script/p2sAddress');
    expect(settlementScriptSource.indexOf(
      'const compiledTrees = await compilePinnedAuthenticatedV2VmTrees',
    )).toBeLessThan(settlementScriptSource.indexOf('if (syntheticContext)'));
    expect(settlementScriptSource).toContain('compiledTrees.trees');
    expect(settlementScriptSource).toContain('wrongBindingTrees.trees.unlock');
    expect(settlementScriptSource).toContain("'/blocks/lastHeaders/10'");
    expect(settlementScriptSource).toContain('orderAndValidateMinedHeaderWindow(raw)');
    expect(settlementScriptSource).toContain('deriveSimplifiedUpcomingPreHeader(headers[0])');
    expect(settlementScriptSource).toContain('buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0])');
    expect(settlementScriptSource).toContain("process.argv.includes('--jvm-conformance')");
    expect(settlementScriptSource).toContain('verifyAuthenticatedV2JvmVmFixture');
    expect(settlementScriptSource).toContain("{ role: 'duplicatePrevention'");
    expect(settlementScriptSource).toContain("{ role: 'unlock'");
    expect(settlementScriptSource).toContain("dataInputs: [{ role: 'tracker'");
    expect(settlementScriptSource).toContain('--jvm-conformance requires a canonical mined-header context');
  });

  it('keeps JVM conformance offline from node transaction acceptance and broadcast routes', () => {
    expect(settlementScriptSource).not.toMatch(/fetch\([^\n]+\/transactions/);
    expect(settlementScriptSource).not.toContain('submit_transaction');
    expect(settlementScriptSource).not.toContain('nodePost');
    expect(settlementScriptSource).toContain('node stateful acceptance');
  });

  it('isolates recipient-hash rejection with another valid P2PK tree', () => {
    expect(settlementScriptSource).toContain(
      'wrong-recipient fixture must use a distinct 36-byte P2PK proposition',
    );
    expect(settlementScriptSource).toContain(
      'wrongRecipientErgoTree: decoyRecipient.p2pkTree',
    );
    expect(settlementScriptSource).toContain(
      'wrongRecipient.unsignedTx.outputs[1].ergoTree = f.wrongRecipientErgoTree',
    );
    expect(settlementScriptSource).not.toContain(
      'wrongRecipient.unsignedTx.outputs[1].ergoTree = f.dupTree',
    );
  });
});

describe('published proof-bound VM command state context', () => {
  it('uses the node upcoming preheader above ten canonical mined headers', () => {
    expect(legacyProofBoundScriptSource).toContain("'/blocks/lastHeaders/10'");
    expect(legacyProofBoundScriptSource).not.toContain("'/blocks/lastHeaders/11'");
    expect(legacyProofBoundScriptSource).toContain('parseNodeJsonPreservingPowDistance');
    expect(legacyProofBoundScriptSource).toContain('buildWasmSimplifiedUpcomingPreHeaderCarrier(headers[0])');
    expect(legacyProofBoundScriptSource).toContain(
      'wasm.PreHeader.from_block_header(preHeaderCarrier)',
    );
  });
});
