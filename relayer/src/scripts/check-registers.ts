/**
 * Minimal test: just check the SCS box R4 register value
 * and what the contract "sees".
 */
import 'dotenv/config';
import { nget, npost } from '../ergo-helpers.js';
import { loadDeployedState } from '../config.js';

function decodeSigmaLong(hex: string): bigint {
  let i = hex.startsWith('05') ? 2 : 0;
  let result = 0n;
  let shift = 0n;
  while (i < hex.length) {
    const byte = BigInt(parseInt(hex.slice(i, i + 2), 16));
    i += 2;
    result |= (byte & 0x7fn) << shift;
    if ((byte & 0x80n) === 0n) break;
    shift += 7n;
  }
  return (result >> 1n) ^ -(result & 1n);
}

async function main() {
  const deployed = loadDeployedState();

  // Get SCS box
  const scsBoxes = await nget(`/blockchain/box/unspent/byTokenId/${deployed.sideChainState.nftId}`) as any[];
  const scsBox = scsBoxes[0];

  console.log('=== SCS Box ===');
  console.log('boxId:', scsBox.boxId);
  console.log('R4 raw:', scsBox.additionalRegisters.R4);
  console.log('R4 decoded (scHeight):', decodeSigmaLong(scsBox.additionalRegisters.R4).toString());
  console.log('R5 raw:', scsBox.additionalRegisters.R5);
  console.log('R5 decoded (txCountOrDigest):', scsBox.additionalRegisters.R5?.slice(0, 20) + '...');
  
  // Get ALL unlock boxes
  const unlockBoxes = await npost('/blockchain/box/unspent/byAddress', `"${deployed.mainChainUnlock.address}"`) as any[];
  console.log(`\n=== ${unlockBoxes?.length || 0} Unlock Boxes ===`);
  
  for (const box of unlockBoxes || []) {
    console.log(`\nBox: ${box.boxId}`);
    console.log('  created:', box.creationHeight);
    console.log('  R4 (burnTx):', box.additionalRegisters.R4?.slice(0, 20) + '...');
    console.log('  R5 (amount):', decodeSigmaLong(box.additionalRegisters.R5).toString());
    console.log('  R6 (recipient):', box.additionalRegisters.R6?.slice(0, 30) + '...');
    console.log('  R7 (burnH):', decodeSigmaLong(box.additionalRegisters.R7).toString());
    console.log('  R8 (ergoH):', decodeSigmaLong(box.additionalRegisters.R8).toString());
    console.log('  R9 (pk):', box.additionalRegisters.R9?.slice(0, 20) + '...');
    
    const burnH = decodeSigmaLong(box.additionalRegisters.R7);
    const scH = decodeSigmaLong(scsBox.additionalRegisters.R4);
    console.log(`  Confirmation check: ${scH} >= ${burnH} + 50 = ${burnH + 50n}: ${scH >= burnH + 50n}`);
  }
}

main().catch(console.error);
