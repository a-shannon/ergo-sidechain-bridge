// Diagnostic: Check DUP box raw accessibility and extension format
import 'dotenv/config';
import { nget, npost, encodeCollByteRegister } from '../ergo-helpers.js';
import { ErgoClient } from '../ergo-client.js';
import { getSignerKeys } from '../fleet-signer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', 'contracts/deployed_state.json'), 'utf-8'));

async function main() {
  const ergo = new ErgoClient();
  const keys = await getSignerKeys();
  
  // 1. Check DUP box
  const dupBox = await ergo.findSingletonBox(deployed.doubleUnlockPrevention.nftId);
  console.log('DUP boxId:', dupBox.boxId);
  console.log('DUP value:', dupBox.value);
  console.log('DUP ergoTree:', dupBox.ergoTree?.slice(0, 40), '...');
  
  // 2. Check raw box bytes
  const rawResp = await nget(`/utxo/byIdBinary/${dupBox.boxId}`);
  console.log('\nRaw bytes available:', !!rawResp?.bytes);
  console.log('Raw bytes length:', rawResp?.bytes?.length / 2, 'bytes');
  
  // 3. Test extension encoding
  const testProof = Buffer.alloc(67, 0xab); // Dummy proof
  const encoded = encodeCollByteRegister(testProof);
  console.log('\nEncoded Coll[Byte] (67 bytes):', encoded.slice(0, 30), '...');
  console.log('First 4 chars (should be 0e43):', encoded.slice(0, 4));
  
  // 4. Test a minimal TX that JUST recreates the DUP box (no AVL change)
  // This will tell us if the signing pipeline works at all
  console.log('\n--- Minimal DUP spend test (no AVL) ---');
  
  // Get a wallet box for value
  const walletBoxes = await ergo.getUnspentBoxesByAddress(keys.address);
  const feeBox = walletBoxes.find((b: any) => b.value >= 2_000_000 && (!b.assets || b.assets.length === 0));
  if (!feeBox) {
    console.error('No fee box available');
    return;
  }
  
  console.log('Fee box:', feeBox.boxId.slice(0, 20), '...', feeBox.value / 1e9, 'ERG');
  
  // Get raw bytes for both inputs
  const dupRaw = rawResp.bytes;
  const feeRawResp = await nget(`/utxo/byIdBinary/${feeBox.boxId}`);
  const feeRaw = feeRawResp?.bytes;
  console.log('DUP raw:', dupRaw ? 'ok' : 'MISSING');
  console.log('Fee raw:', feeRaw ? 'ok' : 'MISSING');
  
  // Build a test extension with dummy data
  const dummyTxId = Buffer.alloc(32, 0x42);
  const dummyProof = Buffer.from('0120', 'hex'); // Minimal proof bytes

  const ext = {
    '0': encodeCollByteRegister(dummyProof),
    '1': encodeCollByteRegister(dummyTxId),
    '2': encodeCollByteRegister(dummyProof),
  };
  
  console.log('\nExtension Var(0):', ext['0'].slice(0, 20), '...');
  console.log('Extension Var(1):', ext['1'].slice(0, 20), '...');
  console.log('Extension Var(2):', ext['2'].slice(0, 20), '...');
  
  // Verify the deployed ergoTree matches what's on-chain
  console.log('\n--- ErgoTree comparison ---');
  console.log('Deployed:', deployed.doubleUnlockPrevention.ergoTreeHex?.slice(0, 40), '...');
  console.log('On-chain:', dupBox.ergoTree?.slice(0, 40), '...');
  console.log('Match:', deployed.doubleUnlockPrevention.ergoTreeHex === dupBox.ergoTree);
  
  // Also check the lock box
  const lockBoxes = await ergo.getUnspentBoxesByAddress(deployed.mainChainLock.address);
  if (lockBoxes.length > 0) {
    const lockBox = lockBoxes[0];
    console.log('\n--- Lock box ---');
    console.log('Lock boxId:', lockBox.boxId);
    console.log('Lock value:', lockBox.value / 1e9, 'ERG');
    console.log('Lock ergoTree:', lockBox.ergoTree?.slice(0, 40), '...');
    console.log('Lock deployed:', deployed.mainChainLock.ergoTreeHex?.slice(0, 40), '...');
    console.log('Match:', lockBox.ergoTree === deployed.mainChainLock.ergoTreeHex);
    
    const lockRawResp = await nget(`/utxo/byIdBinary/${lockBox.boxId}`);
    console.log('Lock raw:', lockRawResp?.bytes ? 'ok' : 'MISSING');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
