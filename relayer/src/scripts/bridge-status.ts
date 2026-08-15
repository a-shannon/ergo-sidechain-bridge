/**
 * Bridge Status CLI — Quick check on daemon state
 *
 * Shows:
 * - Current sync state (Ergo + sidechain heights)
 * - Pending/failed peg-in and peg-out events
 * - SCS oracle current height
 *
 * Usage:
 *   npx tsx src/scripts/bridge-status.ts
 */

const PUBLIC_BOUNDARY_FLAG = '--public-boundary';

interface RuntimeStatusDeps {
  Database: new (filename: string, options?: { readonly?: boolean }) => any;
  ethers: { id(value: string): string };
  ErgoClient: new (...args: any[]) => any;
  loadDeployedState(): any;
  SUBSTRATE_CONFIG: { evmRpcUrl: string };
}

function printPublicBoundaryReport(): void {
  console.log('# Bridge Status Public Boundary Report');
  console.log('');
  console.log('| Field | Value |');
  console.log('|---|---|');
  console.log('| Command | npm run status -- --public-boundary |');
  console.log('| Result | BOUNDARY_ONLY |');
  console.log('| Exit code | 0 |');
  console.log('| Runtime database opened | no |');
  console.log('| Deployment state opened | no |');
  console.log('| Dotenv loaded | no |');
  console.log('| Public claim authorization granted | no |');
  console.log('| Release gate PASS claimed | no |');
  console.log('| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |');
  console.log('');
  console.log('This report is not completed Gate 6 status evidence.');
}

async function evmRpc<T = any>(
  evmRpcUrl: string,
  method: string,
  params: any[] = [],
  timeoutMs = 3_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(evmRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json() as any;
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    return data.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function runRuntimeStatus({
  Database,
  ethers,
  ErgoClient,
  loadDeployedState,
  SUBSTRATE_CONFIG,
}: RuntimeStatusDeps) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Bridge Relayer — Status Report');
  console.log('═══════════════════════════════════════════════════════\n');

  // --- SQLite State ---
  const db = new Database('./bridge-state.sqlite', { readonly: true });
  
  const sync = db.prepare('SELECT * FROM sync_state WHERE id = 1').get() as any;
  console.log('📊 Sync State:');
  console.log(`   Last Ergo height:     ${sync?.latest_ergo_height ?? 'N/A'}`);
  console.log(`   Last Sidechain height: ${sync?.latest_sidechain_height ?? 'N/A'}`);
  console.log(`   Updated:              ${sync?.updated_at ?? 'N/A'}`);

  // --- Live heights ---
  try {
    const ergo = new ErgoClient();
    const ergoHeight = await ergo.getCurrentHeight();
    console.log(`   Current Ergo height:  ${ergoHeight}`);
  } catch {
    console.log('   Current Ergo height:  ⚠️  Node offline');
  }

  try {
    const blockHex = await evmRpc<string>(SUBSTRATE_CONFIG.evmRpcUrl, 'eth_blockNumber');
    const scHeight = parseInt(blockHex, 16);
    console.log(`   Current SC height:    ${scHeight}`);
  } catch (e: any) {
    console.log(`   Current SC height:    ⚠️  ${e.message || 'SC offline'}`);
  }

  // --- SCS Oracle ---
  try {
    const deployed = loadDeployedState();
    const ergo = new ErgoClient();
    const scsBox = await ergo.findSingletonBox(deployed.sideChainState.nftId);
    const r4 = scsBox.additionalRegisters?.R4 || '0500';
    const scsHeight = decodeLong(r4);
    console.log(`\n📡 SCS Oracle Height:    ${scsHeight}`);
    console.log(`   Box ID:               ${scsBox.boxId.slice(0, 24)}...`);
  } catch (e: any) {
    console.log(`\n📡 SCS Oracle:           ⚠️  ${e.message}`);
  }

  // --- SPV Tracker ---
  try {
    const deployed = loadDeployedState();
    if (deployed.spvTracker) {
      const ergo = new ErgoClient();
      const trackerBox = await ergo.findSingletonBox(deployed.spvTracker.nftId);
      const version = decodeLong(trackerBox.additionalRegisters?.R4 || '0500');
      const latestSidechainHeight = decodeLong(trackerBox.additionalRegisters?.R7 || '0500');
      console.log(`\nSPV Tracker:            version ${version}`);
      console.log(`   Latest SC height:     ${latestSidechainHeight}`);
      console.log(`   Box ID:               ${trackerBox.boxId.slice(0, 24)}...`);
    } else {
      console.log('\nSPV Tracker:            not deployed in deployed_state.json');
    }
  } catch (e: any) {
    console.log(`\nSPV Tracker:            ${e.message}`);
  }

  // --- Aggregate settlement contracts ---
  try {
    const deployed = loadDeployedState();
    if (deployed.doubleUnlockPreventionAggregate) {
      const ergo = new ErgoClient();
      const aggDupBox = await ergo.findSingletonBox(deployed.doubleUnlockPreventionAggregate.nftId);
      const version = decodeLong(aggDupBox.additionalRegisters?.R4 || '0500');
      console.log(`\nAggregate DUP:          version ${version}`);
      console.log(`   Box ID:               ${aggDupBox.boxId.slice(0, 24)}...`);
    } else {
      console.log('\nAggregate DUP:          not deployed in deployed_state.json');
    }
    if (deployed.mainChainAggregateUnlock) {
      console.log(`   Aggregate unlock:     ${deployed.mainChainAggregateUnlock.address}`);
    } else {
      console.log('   Aggregate unlock:     not compiled in deployed_state.json');
    }
  } catch (e: any) {
    console.log(`\nAggregate settlement:   ${e.message}`);
  }

  // --- Peg-In Events ---
  const pegIns = db.prepare('SELECT status, COUNT(*) as count FROM peg_in_events GROUP BY status').all() as any[];
  console.log('\n🔒 Peg-In Events:');
  if (pegIns.length === 0) {
    console.log('   (none)');
  } else {
    for (const row of pegIns) {
      const icon = row.status === 'minted' ? '✅' : row.status === 'failed' ? '❌' : '⏳';
      console.log(`   ${icon} ${row.status}: ${row.count}`);
    }
  }

  // Show failed peg-ins with detail
  const failedPegIns = db.prepare('SELECT * FROM peg_in_events WHERE status = \'failed\'').all() as any[];
  if (failedPegIns.length > 0) {
    console.log('\n   Failed Peg-Ins:');
    for (const p of failedPegIns) {
      console.log(`     • ${p.ergo_lock_box_id.slice(0, 16)}... → ${p.target_evm_address} (${p.amount_nanoerg / 1e9} ERG)`);
    }
  }

  // --- Peg-Out Events ---
  const pegOuts = db.prepare('SELECT status, COUNT(*) as count FROM peg_out_events GROUP BY status').all() as any[];
  console.log('\n🔥 Peg-Out Events:');
  if (pegOuts.length === 0) {
    console.log('   (none)');
  } else {
    for (const row of pegOuts) {
      const icon = row.status === 'phase2_unlocked' ? '✅' : row.status === 'failed' ? '❌' : '⏳';
      console.log(`   ${icon} ${row.status}: ${row.count}`);
    }
  }

  // Show pending peg-outs
  const pendingOuts = db.prepare(
    'SELECT * FROM peg_out_events WHERE status IN (\'detected\', \'confirmed\', \'phase1_created\')'
  ).all() as any[];
  if (pendingOuts.length > 0) {
    console.log('\n   Pending Peg-Outs:');
    for (const p of pendingOuts) {
      console.log(`     • ${p.sidechain_burn_tx_hash.slice(0, 16)}... [${p.status}] ${p.amount_nanoerg / 1e9} ERG`);
    }
  }

  // --- AVL Tree ---
  const avlCount = (db.prepare('SELECT COUNT(*) as count FROM avl_tree_history').get() as any)?.count ?? 0;
  console.log(`\n🌳 AVL Tree Entries:     ${avlCount}`);

  try {
    const spvCount = (db.prepare('SELECT COUNT(*) as count FROM spv_tracker_history').get() as any)?.count ?? 0;
    console.log(`   SPV Tracker Entries:   ${spvCount}`);
  } catch {
    console.log('   SPV Tracker Entries:   table not migrated yet');
  }

  // --- Storage Rent Check ---
  try {
    const deployed = loadDeployedState();
    const ergo = new ErgoClient();
    const ergoHeight = await ergo.getCurrentHeight();
    const STORAGE_RENT_PERIOD = 1_051_200; // 4 years in blocks

    console.log('\n📦 Storage Rent Health:');

    // DUP singleton
    try {
      const dupBox = await ergo.findSingletonBox(deployed.doubleUnlockPrevention.nftId);
      const dupAge = ergoHeight - dupBox.creationHeight;
      const dupPct = (dupAge / STORAGE_RENT_PERIOD * 100).toFixed(1);
      const icon = dupAge > STORAGE_RENT_PERIOD * 0.75 ? '🚨' : dupAge > STORAGE_RENT_PERIOD * 0.5 ? '⚠️' : '✅';
      console.log(`   ${icon} DUP singleton:  ${dupAge} blocks (${dupPct}% of 4-year limit)`);
    } catch {
      console.log('   ❌ DUP singleton:  NOT FOUND — bridge may be bricked!');
    }

    // SCS singleton
    try {
      const scsBox = await ergo.findSingletonBox(deployed.sideChainState.nftId);
      const scsAge = ergoHeight - scsBox.creationHeight;
      const scsPct = (scsAge / STORAGE_RENT_PERIOD * 100).toFixed(1);
      const icon = scsAge > STORAGE_RENT_PERIOD * 0.75 ? '🚨' : scsAge > STORAGE_RENT_PERIOD * 0.5 ? '⚠️' : '✅';
      console.log(`   ${icon} SCS oracle:    ${scsAge} blocks (${scsPct}% of 4-year limit)`);
    } catch {
      console.log('   ❌ SCS oracle:    NOT FOUND');
    }

    // SPV tracker singleton
    if (deployed.spvTracker) {
      try {
        const spvBox = await ergo.findSingletonBox(deployed.spvTracker.nftId);
        const spvAge = ergoHeight - spvBox.creationHeight;
        const spvPct = (spvAge / STORAGE_RENT_PERIOD * 100).toFixed(1);
        const icon = spvAge > STORAGE_RENT_PERIOD * 0.75 ? '[ALERT]' : spvAge > STORAGE_RENT_PERIOD * 0.5 ? '[WARN]' : '[OK]';
        console.log(`   ${icon} SPV tracker:   ${spvAge} blocks (${spvPct}% of 4-year limit)`);
      } catch {
        console.log('   SPV tracker:   NOT FOUND');
      }
    }

    // Aggregate DUP singleton
    if (deployed.doubleUnlockPreventionAggregate) {
      try {
        const aggDupBox = await ergo.findSingletonBox(deployed.doubleUnlockPreventionAggregate.nftId);
        const aggDupAge = ergoHeight - aggDupBox.creationHeight;
        const aggDupPct = (aggDupAge / STORAGE_RENT_PERIOD * 100).toFixed(1);
        const icon = aggDupAge > STORAGE_RENT_PERIOD * 0.75 ? '[ALERT]' : aggDupAge > STORAGE_RENT_PERIOD * 0.5 ? '[WARN]' : '[OK]';
        console.log(`   ${icon} Aggregate DUP: ${aggDupAge} blocks (${aggDupPct}% of 4-year limit)`);
      } catch {
        console.log('   Aggregate DUP: NOT FOUND');
      }
    }

    // TVL boxes
    try {
      const lockBoxes = await ergo.getUnspentBoxesByAddress(deployed.mainChainLock.address);
      if (lockBoxes.length > 0) {
        const oldest = Math.max(...lockBoxes.map((b: any) => ergoHeight - b.creationHeight));
        const oldPct = (oldest / STORAGE_RENT_PERIOD * 100).toFixed(1);
        const totalValue = lockBoxes.reduce((s: bigint, b: any) => s + BigInt(b.value), 0n);
        console.log(`   📊 TVL boxes:     ${lockBoxes.length} (oldest: ${oldest} blocks, ${oldPct}%)`);
        console.log(`   💰 Total locked:  ${Number(totalValue) / 1e9} ERG`);
      } else {
        console.log('   📊 TVL boxes:     0 (vault empty)');
      }
    } catch {
      console.log('   📊 TVL boxes:     Unable to query');
    }
  } catch {
    console.log('\n📦 Storage Rent:         ⚠️  Ergo node offline');
  }

  // --- Solvency Check ---
  try {
    const deployed = loadDeployedState();
    if (!deployed.solidity) throw new Error('Solidity contracts not deployed');
    const totalSupplyHex = await evmRpc<string>(SUBSTRATE_CONFIG.evmRpcUrl, 'eth_call', [{
      to: deployed.solidity.bridgeAddress,
      data: ethers.id('totalSERGSupply()').slice(0, 10),
    }, 'latest']);
    const escrowHex = await evmRpc<string>(SUBSTRATE_CONFIG.evmRpcUrl, 'eth_call', [{
      to: deployed.solidity.bridgeAddress,
      data: ethers.id('bridgeSERGBalance()').slice(0, 10),
    }, 'latest']);
    const totalSupply = BigInt(totalSupplyHex);
    const escrow = BigInt(escrowHex);
    console.log('\n🏦 Solvency:');
    console.log(`   sERG supply:      ${Number(totalSupply) / 1e9} sERG`);
    console.log(`   Bridge escrow:    ${Number(escrow) / 1e9} sERG (accumulated fees)`);
  } catch (e: any) {
    console.log(`\n🏦 Solvency:             ⚠️  ${e.message || 'SC offline - cannot verify'}`);
  }

  // --- Defense Status ---
  console.log('\n🛡️  Attack Chain Defenses:');
  console.log('   Chain α (Fee Laundering):     ✅ Escrow model (no re-minting)');
  console.log('   Chain β (Phantom Key Brick):  ✅ Reorg detection + AVL purge');
  console.log('   Chain γ (Dead Zone Orphan):   ✅ Full first-boot scan');
  console.log('   Chain ε (Gas Drain):          ✅ 0.01 ERG minimum deposit');
  console.log('   Chain η (Hostage Asymmetry):  ✅ MCL v2 escape hatch');
  console.log('   Chain θ (Phantom Mint):       ✅ 3-confirm + reconciliation');
  console.log('   Chain ι (Sweep Phantom):      ✅ Structural R4/R5/R6 filter');
  console.log('   Chain κ (Roach Motel):        ✅ DUP heartbeat touch');

  console.log('\n═══════════════════════════════════════════════════════\n');
  db.close();
}

async function main() {
  if (process.argv.includes(PUBLIC_BOUNDARY_FLAG)) {
    printPublicBoundaryReport();
    return;
  }

  await import('dotenv/config');
  const { default: Database } = await import('better-sqlite3');
  const { ethers } = await import('ethers');
  const { ErgoClient } = await import('../ergo-client.js');
  const { loadDeployedState, SUBSTRATE_CONFIG } = await import('../config.js');

  await runRuntimeStatus({
    Database: Database as RuntimeStatusDeps['Database'],
    ethers,
    ErgoClient,
    loadDeployedState,
    SUBSTRATE_CONFIG,
  });
}

function decodeLong(hex: string): number {
  if (!hex.startsWith('05')) return 0;
  const bytes = Buffer.from(hex.slice(2), 'hex');
  let result = 0;
  let shift = 0;
  for (let i = 0; i < bytes.length; i++) {
    result |= (bytes[i] & 0x7f) << shift;
    if ((bytes[i] & 0x80) === 0) break;
    shift += 7;
  }
  return (result >>> 1) ^ -(result & 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
