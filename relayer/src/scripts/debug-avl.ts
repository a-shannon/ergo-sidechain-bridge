// Deep verify: use the node's /script/executeWithContext to check each condition
import 'dotenv/config';
import { nget, npost, MINER_FEE, MINER_FEE_TREE, encodeCollByteRegister, encodeLongRegister, encodeAvlTreeRegister, EMPTY_AVL_DIGEST } from '../ergo-helpers.js';
import { ErgoClient } from '../ergo-client.js';
import { getSignerKeys } from '../fleet-signer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', 'contracts/deployed_state.json'), 'utf-8'));

let bridgeAvl: any = null;
try { bridgeAvl = await import('../avl-bridge.js'); } catch {}

async function main() {
  const ergo = new ErgoClient();
  const keys = await getSignerKeys();
  const ergoHeight = await ergo.getCurrentHeight();
  
  const dupBox = await ergo.findSingletonBox(deployed.doubleUnlockPrevention.nftId);
  
  console.log('DUP box R5:', dupBox.additionalRegisters.R5);
  console.log('DUP box R4:', dupBox.additionalRegisters.R4);
  console.log('DUP box R6:', dupBox.additionalRegisters.R6);
  
  // Verify the on-chain digest matches the WASM empty digest
  const emptyDigest = bridgeAvl.getEmptyDigest();
  console.log('\nWASM empty digest:', emptyDigest);
  console.log('Expected:', EMPTY_AVL_DIGEST);
  console.log('Match:', emptyDigest === EMPTY_AVL_DIGEST);
  
  // Generate proofs
  const burnTxIdHex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const proof = bridgeAvl.insertLockRecord([], burnTxIdHex);
  
  console.log('\nProofs generated:');
  console.log('  Lookup proof hex:', proof.lookup_proof_hex);
  console.log('  Insert proof hex:', proof.insert_proof_hex);
  console.log('  New digest hex:', proof.new_digest_hex);
  
  // Parse on-chain R5 to get the full AvlTree structure
  const onChainR5 = dupBox.additionalRegisters.R5 as string;
  const onChainDigest = onChainR5.slice(2, 68); // after 64 (type tag), 33 bytes = 66 chars
  const onChainFlags = parseInt(onChainR5.slice(68, 70), 16);
  const onChainKeyLen = parseInt(onChainR5.slice(70, 72), 16);
  const onChainValLenOpt = onChainR5.slice(72);
  
  console.log('\nOn-chain AvlTree:');
  console.log('  Digest (33 bytes):', onChainDigest);
  console.log('  Flags:', onChainFlags, `(0x${onChainFlags.toString(16)})`);
  console.log('  KeyLen:', onChainKeyLen);
  console.log('  ValLenOpt:', onChainValLenOpt);
  
  // Check: the deploy script used flags 0x0B, but we see 0x03 on-chain.
  // The AvlTree flags in Sigma are encoded as:
  //   bit 0 = insertAllowed
  //   bit 1 = updateAllowed
  //   bit 2 = removeAllowed
  console.log('\n  Flags interpretation:');
  console.log('    Insert allowed:', (onChainFlags & 1) !== 0);
  console.log('    Update allowed:', (onChainFlags & 2) !== 0);
  console.log('    Remove allowed:', (onChainFlags & 4) !== 0);
  
  // Build successor R5 with EXACT same structure
  const newDigestBytes = Buffer.from(proof.new_digest_hex, 'hex');
  console.log('\nNew digest bytes:', newDigestBytes.length, 'bytes');
  
  // Build the R5 manually for comparison
  const successorR5 = encodeAvlTreeRegister(newDigestBytes, onChainFlags, 1);
  console.log('\nSuccessor R5:', successorR5);
  
  // Check: the new_digest_hex from WASM should be exactly 33 bytes
  console.log('New digest length:', proof.new_digest_hex.length / 2, 'bytes');
  
  // Now let's try to verify the insert via node's /script/executeWithContext
  // This would tell us exactly which condition fails
  console.log('\n=== Testing individual conditions via node ===');
  
  // Try a simple verify: compile and execute a test script that does the AVL operations
  const testScript = `{
    val tree = SELF.R5[AvlTree].get
    val lookupProof = getVar[Coll[Byte]](0).get
    val newTxId = getVar[Coll[Byte]](1).get
    val insertProof = getVar[Coll[Byte]](2).get
    
    val lookupResult = tree.get(newTxId, lookupProof)
    val notSpent = lookupResult.isEmpty
    
    sigmaProp(notSpent)
  }`;
  
  console.log('\nCompiling test script (lookup only)...');
  const compiled = await npost('/script/p2sAddress', { source: testScript, treeVersion: 0 });
  if (compiled) {
    console.log('Test script compiled:', compiled.address);
  } else {
    console.log('Test script compilation failed');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
