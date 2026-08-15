/**
 * Diagnostic: Test Phase 2 MainChainUnlock spending
 * Checks each contract condition individually.
 */
import 'dotenv/config';
import {
  nget, npost, getHeight,
  encodeLongRegister, encodeIntRegister, encodeCollByteRegister,
  MINER_FEE, MINER_FEE_TREE,
} from '../ergo-helpers.js';
import { getSignerKeys } from '../fleet-signer.js';
import { loadDeployedState } from '../config.js';

async function main() {
  const keys = await getSignerKeys();
  const deployed = loadDeployedState();
  const height = await getHeight();

  console.log('=== Phase 2 Diagnostic ===');
  console.log(`Ergo height: ${height}`);
  console.log(`Wallet: ${keys.address}`);

  // 1. Find the MainChainUnlock box
  const unlockAddr = deployed.mainChainUnlock.address;
  const unlockTree = deployed.mainChainUnlock.ergoTreeHex;
  console.log(`\nUnlock address: ${unlockAddr}`);
  console.log(`Unlock tree: ${unlockTree}`);

  const unlockBoxes = await npost('/blockchain/box/unspent/byAddress', `"${unlockAddr}"`);
  console.log(`Unlock boxes found: ${unlockBoxes?.length ?? 0}`);

  if (!unlockBoxes || unlockBoxes.length === 0) {
    console.error('No unlock boxes found!');
    return;
  }

  const unlockBox = unlockBoxes[0];
  console.log(`Box ID: ${unlockBox.boxId}`);
  console.log(`Box value: ${unlockBox.value} nanoERG`);
  console.log(`Box ergoTree: ${unlockBox.ergoTree}`);
  console.log(`Registers:`);
  for (const [k, v] of Object.entries(unlockBox.additionalRegisters || {})) {
    console.log(`  ${k}: ${v}`);
  }

  // 2. Parse contract values
  // R4: Coll[Byte] burn TX hash
  // R5: Long unlock amount
  // R6: Coll[Byte] recipient ErgoTree bytes
  // R7: Long SC burn height
  // R8: Long Ergo creation height
  // R9: SigmaProp relayer PK

  // Parse R6 to get recipient ErgoTree
  const r6Hex = (unlockBox.additionalRegisters?.R6 || '') as string;
  console.log(`\nR6 (recipient tree) raw: ${r6Hex}`);
  // Parse Coll[Byte]: 0e + VLQ(len) + data
  let recipientTree = '';
  if (r6Hex.startsWith('0e')) {
    let i = 2;
    let len = 0;
    let shift = 0;
    while (i < r6Hex.length) {
      const byte = parseInt(r6Hex.slice(i, i + 2), 16);
      i += 2;
      len |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    recipientTree = r6Hex.slice(i, i + len * 2);
  }
  console.log(`Recipient tree decoded: ${recipientTree}`);
  console.log(`Recipient tree length: ${recipientTree.length / 2} bytes`);

  // 3. Get SideChainState box
  const scsNftId = deployed.sideChainState.nftId;
  const scsBoxes = await nget(`/blockchain/box/unspent/byTokenId/${scsNftId}`);
  const scsBox = scsBoxes[0];
  console.log(`\nSCS Box ID: ${scsBox.boxId}`);
  console.log(`SCS token[0]: ${scsBox.assets?.[0]?.tokenId}`);

  // 4. Check contract conditions
  console.log('\n=== Contract Condition Checks ===');

  // Check 1: isValidStateBox = stateBox.tokens(0)._1 == sideChainStateNftId
  console.log(`\n[1] isValidStateBox:`);
  console.log(`  stateBox.tokens(0)._1 = ${scsBox.assets?.[0]?.tokenId}`);
  console.log(`  expected NFT ID       = ${scsNftId}`);
  console.log(`  MATCH: ${scsBox.assets?.[0]?.tokenId === scsNftId}`);

  // Check 2: sufficientConfirmations = currentSidechainHeight >= burnHeight + 50
  const r4 = scsBox.additionalRegisters?.R4;
  console.log(`\n[2] sufficientConfirmations:`);
  console.log(`  SCS R4 (raw): ${r4}`);
  // Decode R4 Long
  if (r4) {
    const decoded = decodeLong(r4 as string);
    const burnR7 = unlockBox.additionalRegisters?.R7;
    const burnHeight = burnR7 ? decodeLong(burnR7 as string) : 0;
    console.log(`  currentSidechainHeight = ${decoded}`);
    console.log(`  burnHeight (R7) = ${burnHeight}`);
    console.log(`  required = ${burnHeight + 50}`);
    console.log(`  PASS: ${decoded >= burnHeight + 50}`);
  }

  // Check 3: correctRecipient = recipientOutput.propositionBytes == recipientTree
  // propositionBytes = ErgoTree hex
  console.log(`\n[3] correctRecipient:`);
  console.log(`  We will set OUTPUTS(0).ergoTree = ${recipientTree}`);
  console.log(`  Contract checks: OUTPUTS(0).propositionBytes == R6(decoded)`);
  console.log(`  R6 decoded = ${recipientTree}`);
  // IMPORTANT: propositionBytes in ErgoScript is the ergoTree bytes!
  // The contract does: recipientOutput.propositionBytes == recipientTree
  // where recipientTree = SELF.R6[Coll[Byte]].get
  // So R6 must contain the EXACT ErgoTree bytes that OUTPUTS(0) will have.

  // Check: does the wallet's ErgoTree match R6?
  const walletTreeResp = await nget(`/script/addressToTree/${keys.address}`);
  console.log(`  Wallet ergoTree: ${walletTreeResp?.tree}`);
  console.log(`  R6 match wallet: ${recipientTree === walletTreeResp?.tree}`);

  // Check 4: correctAmount = recipientOutput.value >= unlockAmount
  const r5 = unlockBox.additionalRegisters?.R5;
  const unlockAmount = r5 ? decodeLong(r5 as string) : 0;
  console.log(`\n[4] correctAmount:`);
  console.log(`  unlockAmount (R5) = ${unlockAmount}`);
  console.log(`  box.value = ${unlockBox.value}`);
  console.log(`  We will set OUTPUTS(0).value = ${unlockBox.value}`);
  console.log(`  PASS: ${unlockBox.value >= unlockAmount}`);

  // Check 5: relayerPk (proveDlog)
  console.log(`\n[5] relayerPk:`);
  console.log(`  R9: ${unlockBox.additionalRegisters?.R9}`);
  console.log(`  Our pubkey: 08cd${keys.pubKeyHex}`);
  console.log(`  MATCH: ${unlockBox.additionalRegisters?.R9 === '08cd' + keys.pubKeyHex}`);

  // Context extension check
  console.log(`\n[6] Context Extension (Var 0):`);
  const nftIdSerialized = '0e20' + scsNftId;
  console.log(`  Var(0) = ${nftIdSerialized}`);
  console.log(`  This should decode to Coll[Byte] with NFT ID: ${scsNftId}`);
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

main().catch(console.error);
