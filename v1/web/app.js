// Exact string-to-BigInt decimal parser (zero IEEE-754 floating-point precision loss [H-6])
function parseErgDecimalToNano(raw) {
  const s = String(raw || '').trim();
  if (!/^\d+(?:\.\d{1,9})?$/.test(s)) {
    throw new Error('Amount must be a non-negative decimal with at most 9 decimal places (e.g. 0.03)');
  }
  const parts = s.split('.');
  const whole = BigInt(parts[0]);
  const frac = BigInt((parts[1] || '').padEnd(9, '0'));
  return whole * 1000000000n + frac;
}

// Sign-safe nanoERG formatter ([M-6])
function fmtErg(nanoStr) {
  if (nanoStr === undefined || nanoStr === null || nanoStr === '') return '—';
  const v = BigInt(nanoStr);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1000000000n;
  const frac = (abs % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '') || '0';
  return (neg ? '-' : '') + whole.toString() + '.' + frac;
}

const shortHex = (h) => (!h ? '—' : h.length > 18 ? h.slice(0, 10) + '…' + h.slice(-8) : h);
const setText = (id, text) => { document.getElementById(id).textContent = text; };

let latestStatus = null;

async function waitForMetaMaskReceipt(txHash, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 120000);
  while (Date.now() < deadline) {
    const receipt = await window.ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (receipt && receipt.blockNumber) {
      if (receipt.status !== '0x1') {
        throw new Error('Approval transaction reverted on Frontier EVM: ' + txHash);
      }
      return receipt;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Timed out waiting for approval transaction receipt: ' + txHash);
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Status fetch failed');
    latestStatus = data;

    setText('pill-network', 'Ergo ' + data.network.toUpperCase());
    setText('pill-height', 'Ergo Height: ' + data.ergo.fullHeight);
    const solvPill = document.getElementById('pill-solvency');
    if (data.solvencyStatus === 'OK') {
      solvPill.textContent = 'SOLVENCY VERIFIED (sERG <= Reserve)';
      solvPill.className = 'pill ok';
    } else if (data.solvencyStatus === 'EVM_UNVERIFIED') {
      solvPill.textContent = 'EVM UNVERIFIED (Ergo-Only Mode)';
      solvPill.className = 'pill warn';
    } else {
      solvPill.textContent = 'SOLVENCY ALERT';
      solvPill.className = 'pill err';
    }

    setText('val-reserve-erg', fmtErg(data.ergo.reserve.ergNano) + ' ERG');
    setText('val-liability', fmtErg(data.ergo.reserve.liabilityNano) + ' ERG');
    setText('val-buffer', fmtErg(data.ergo.reserve.bufferNano) + ' ERG');
    setText('val-reserve-age', data.ergo.reserve.ageBlocks + ' blk (' + data.ergo.reserve.storageRentPct + '%)');
    document.getElementById('bar-reserve-rent').style.width = Math.min(100, data.ergo.reserve.storageRentPct) + '%';
    setText('val-reserve-avl', shortHex(data.ergo.reserve.avlDigest));

    if (data.evm && data.evm.rpcReachable) {
      setText('val-serg-supply', fmtErg(data.evm.sergTotalSupplyNano) + ' sERG');
      setText('val-evm-fees', fmtErg(data.evm.escrowedFeesNano) + ' sERG');
      setText('val-evm-status', data.evm.paused ? 'PAUSED' : 'ACTIVE (blk ' + data.evm.blockNumber + ')');
      setText('val-evm-owner', shortHex(data.evm.owner));
    } else {
      setText('val-serg-supply', 'EVM RPC offline');
      setText('val-evm-fees', '—');
      setText('val-evm-status', 'Ergo-only inspection');
      setText('val-evm-owner', '—');
    }
    setText('val-evm-bridge', shortHex(data.evm && data.evm.bridgeAddress));

    setText('val-tracker-mode', data.ergo.tracker.mode);
    const gov = data.ergo.tracker.governance || {};
    setText('val-tracker-epoch', gov.epoch ? 'Epoch ' + gov.epoch + ' (' + data.params.committeeThreshold + '-of-' + data.params.committeeSize + ')' : 'STARK');
    setText('val-tracker-height', 'Block #' + data.ergo.tracker.latestSourceHeight);
    setText('val-tracker-pending', gov.pendingMode ? 'Mode ' + gov.pendingMode + ' @ h=' + gov.pendingActivatesAtHeight : 'None');
    setText('val-tracker-avl', shortHex(data.ergo.tracker.avlDigest));

    setText('val-dup-erg', fmtErg(data.ergo.dup.ergNano) + ' ERG');
    setText('val-dup-box', shortHex(data.ergo.dup.boxId));
    setText('val-dup-age', data.ergo.dup.ageBlocks + ' blk (' + data.ergo.dup.storageRentPct + '%)');
    document.getElementById('bar-dup-rent').style.width = Math.min(100, data.ergo.dup.storageRentPct) + '%';
    setText('val-dup-avl', shortHex(data.ergo.dup.avlDigest));

    setText('val-family-id', data.familyId);
    setText('lbl-pegin-amount', 'Deposit Amount (ERG, min ' + fmtErg(data.params.minDepositNanoErg) + ')');
    setText(
      'lbl-pegout-amount',
      'Gross Burn Amount (sERG, min ' +
        fmtErg(data.params.minPegOutGrossNanoErg) +
        '; fee = ' +
        fmtErg(data.params.bridgeFeeNanoErg) +
        ')',
    );
    document.getElementById('in-deposit-lock-addr').value = data.depositLockAddress;
  } catch (err) {
    setText('pill-solvency', 'Error: ' + err.message);
    document.getElementById('pill-solvency').className = 'pill err';
  }
}

document.getElementById('tab-pegin').addEventListener('click', () => {
  document.getElementById('tab-pegin').classList.add('active');
  document.getElementById('tab-pegout').classList.remove('active');
  document.getElementById('panel-pegin').classList.remove('hidden');
  document.getElementById('panel-pegout').classList.add('hidden');
});
document.getElementById('tab-pegout').addEventListener('click', () => {
  document.getElementById('tab-pegout').classList.add('active');
  document.getElementById('tab-pegin').classList.remove('active');
  document.getElementById('panel-pegout').classList.remove('hidden');
  document.getElementById('panel-pegin').classList.add('hidden');
});
document.getElementById('btn-refresh').addEventListener('click', loadStatus);

document.getElementById('btn-nautilus-connect').addEventListener('click', async () => {
  try {
    if (!window.ergoConnector || !window.ergoConnector.nautilus) {
      throw new Error('Nautilus Wallet extension not detected in this browser.');
    }
    const connected = await window.ergoConnector.nautilus.connect();
    if (!connected) throw new Error('Nautilus connection declined.');
    const addr = await window.ergo.get_change_address();
    document.getElementById('in-ergo-addr').value = addr;
    setText('out-pegin', 'Connected Nautilus address: ' + addr);
  } catch (err) {
    setText('out-pegin', 'Nautilus error: ' + err.message);
  }
});

document.getElementById('btn-build-pegin').addEventListener('click', async () => {
  try {
    const amountNanoErg = parseErgDecimalToNano(document.getElementById('in-pegin-amount').value).toString();
    const res = await fetch('/api/build-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountNanoErg,
        evmRecipientHex: document.getElementById('in-evm-recipient').value,
        depositorAddress: document.getElementById('in-ergo-addr').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Build failed');
    setText('out-pegin', JSON.stringify(data, null, 2));
  } catch (err) {
    setText('out-pegin', 'Error: ' + err.message);
  }
});

document.getElementById('btn-parse-pegout').addEventListener('click', async () => {
  try {
    const grossNano = parseErgDecimalToNano(document.getElementById('in-pegout-amount').value);
    const minGross = BigInt((latestStatus && latestStatus.params && latestStatus.params.minPegOutGrossNanoErg) || '15000000');
    if (grossNano < minGross) {
      throw new Error('Minimum gross peg-out is ' + fmtErg(minGross.toString()) + ' sERG');
    }
    const res = await fetch('/api/parse-ergo-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ergoRecipient: document.getElementById('in-pegout-ergo').value,
        grossAmountNanoErg: grossNano.toString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid Ergo recipient');
    const cfgLabel = (latestStatus && latestStatus.configFileLabel) || 'config.testnet.live.json';
    setText(
      'out-pegout',
      JSON.stringify(
        {
          ...data,
          cliCommand:
            'BRIDGE_EVM_USER_KEY=0x... BRIDGE_BROADCAST_ENABLED=true npx tsx src/cli.ts pegout --config ' +
            cfgLabel +
            ' --amount ' +
            grossNano.toString() +
            ' --ergo-recipient ' +
            data.address,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    setText('out-pegout', 'Error: ' + err.message);
  }
});

document.getElementById('btn-metamask-pegout').addEventListener('click', async () => {
  try {
    if (!window.ethereum) throw new Error('MetaMask / EIP-1193 wallet not detected.');
    if (!latestStatus || !latestStatus.evm || !latestStatus.evm.rpcReachable || !latestStatus.evm.chainIdHex) {
      throw new Error('Configured Frontier EVM RPC is offline; cannot verify chainId before signing.');
    }
    const walletChainId = String(await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase();
    const expectedChainId = String(latestStatus.evm.chainIdHex).toLowerCase();
    if (walletChainId !== expectedChainId) {
      throw new Error('Wrong EVM network in wallet: connected ' + walletChainId + ', expected ' + expectedChainId);
    }

    const grossNano = parseErgDecimalToNano(document.getElementById('in-pegout-amount').value);
    const minGross = BigInt(latestStatus.params.minPegOutGrossNanoErg || '15000000');
    if (grossNano < minGross) {
      throw new Error('Minimum gross peg-out is ' + fmtErg(minGross.toString()) + ' sERG');
    }

    const res = await fetch('/api/parse-ergo-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ergoRecipient: document.getElementById('in-pegout-ergo').value,
        grossAmountNanoErg: grossNano.toString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid Ergo recipient');
    const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });

    setText('out-pegout', 'Step 1/2: Waiting for MetaMask sERG approve confirmation...');
    const approveHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: data.sergAddress, data: data.approveCalldata }],
    });
    await waitForMetaMaskReceipt(approveHash, 120000);

    setText('out-pegout', 'Step 2/2: Approve confirmed (' + approveHash + '). Prompting ErgoBridge.pegOut...');
    const pegOutHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: data.bridgeAddress, data: data.pegOutCalldata }],
    });
    setText('out-pegout', JSON.stringify({ approveHash, pegOutHash, recipientPubKey: data.pubKeyHex }, null, 2));
  } catch (err) {
    setText('out-pegout', 'MetaMask error: ' + err.message);
  }
});

loadStatus();
