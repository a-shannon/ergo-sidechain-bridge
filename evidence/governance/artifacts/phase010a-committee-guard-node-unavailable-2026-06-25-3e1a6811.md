# Phase 010a Committee Guard Node-Unavailable Output - 2026-06-25 - 3e1a6811

Command:

```powershell
node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts
```

Result: BLOCKED / exit code 1.

Mode expected by script:

- Non-broadcast.
- Ephemeral local committee key material only.
- No node wallet usage.
- Node endpoint used only for ErgoScript compilation and header context.

Observed output summary:

```text
FATAL: [TypeError: fetch failed] {
  [cause]: Error: connect ECONNREFUSED 127.0.0.1:9052
      at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1645:16) {
    errno: -4078,
    code: 'ECONNREFUSED',
    syscall: 'connect',
    address: '127.0.0.1',
    port: 9052
  }
}
```

Boundary:

- This is not PASS output.
- This is not completed Gate 6 command evidence.
- This did not compile the contracts.
- This did not evaluate positive committee signing.
- This did not evaluate wrong-signer rejection.
- This did not rotate keys, sign with production material, submit, broadcast,
  publish, or modify bridge state.
