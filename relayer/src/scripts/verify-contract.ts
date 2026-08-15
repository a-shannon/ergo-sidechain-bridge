import 'dotenv/config';
import { npost } from '../ergo-helpers.js';
import { loadDeployedState } from '../config.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const deployed = loadDeployedState();
  
  // Read contract source
  const contractPath = resolve(__dirname, '../../../contracts/MainChainUnlock.es');
  const source = readFileSync(contractPath, 'utf-8');
  
  // Compile with node
  const result = await npost('/script/p2sAddress', { source, treeVersion: 0 }) as any;
  console.log('Compiled address:', result.address);
  console.log('Deployed address:', deployed.mainChainUnlock.address);
  console.log('Address match:', result.address === deployed.mainChainUnlock.address);
  
  // Get the ErgoTree from address
  const { nget } = await import('../ergo-helpers.js');
  const rawTree = await nget(`/utils/addressToRaw/${result.address}`) as any;
  const ergoTreeHex = typeof rawTree === 'string' ? rawTree : rawTree?.raw ?? rawTree?.hex;
  
  console.log('\nCompiled ergoTree:', ergoTreeHex);
  console.log('Deployed ergoTree:', deployed.mainChainUnlock.ergoTreeHex);
  console.log('Tree match:', ergoTreeHex === deployed.mainChainUnlock.ergoTreeHex);
  
  // Check what the OUTPUTS(0) index actually is
  // In ErgoScript: val recipientOutput = OUTPUTS(0)
  // This should be the first output
  console.log('\n--- Checking contract semantics ---');
  console.log('Contract says: val stateBox = CONTEXT.dataInputs(0)');
  console.log('Extension: getVar[Coll[Byte]](0) = NFT ID');
  console.log('Check: stateBox.tokens(0)._1 == sideChainStateNftId');
  console.log('');
  console.log('Question: Are the constant indices (0, 0, 0, 50) being');
  console.log('resolved correctly in the segregated constants?');
  
  // Decode constants from the ergoTree
  const tree = deployed.mainChainUnlock.ergoTreeHex;
  console.log('\n--- ErgoTree constant decode ---');
  const header = parseInt(tree.slice(0, 2), 16);
  console.log(`Header: 0x${tree.slice(0, 2)} = ${header}`);
  console.log(`  Version: ${header & 0x07}`);
  console.log(`  Constant segregation: ${(header & 0x10) ? 'YES' : 'no'}`);
  
  const numConstants = parseInt(tree.slice(2, 4), 16);
  console.log(`  Number of constants: ${numConstants}`);
  
  // Parse each constant
  let offset = 4; // After header + count
  for (let i = 0; i < numConstants; i++) {
    const typeCode = parseInt(tree.slice(offset, offset + 2), 16);
    offset += 2;
    
    if (typeCode === 0x04) { // Int
      // VLQ decode
      let val = 0, shift = 0;
      while (true) {
        const byte = parseInt(tree.slice(offset, offset + 2), 16);
        offset += 2;
        val |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      const zigzag = (val >>> 1) ^ -(val & 1);
      console.log(`  c[${i}]: Int = ${zigzag} (raw VLQ: ${val})`);
    } else if (typeCode === 0x05) { // Long
      let val = 0n, shift = 0n;
      while (true) {
        const byte = BigInt(parseInt(tree.slice(offset, offset + 2), 16));
        offset += 2;
        val |= (byte & 0x7fn) << shift;
        if ((byte & 0x80n) === 0n) break;
        shift += 7n;
      }
      const zigzag = Number((val >> 1n) ^ -(val & 1n));
      console.log(`  c[${i}]: Long = ${zigzag} (raw VLQ: ${val})`);
    } else {
      console.log(`  c[${i}]: type 0x${typeCode.toString(16)} (unknown)`);
      break;
    }
  }
  
  console.log(`\n  Body starts at offset: ${offset / 2} bytes`);
  console.log(`  Body hex: ${tree.slice(offset)}`);
}

main().catch(console.error);
