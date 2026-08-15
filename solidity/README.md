# Solidity Contracts - Substrate/Frontier EVM

| Source | Purpose |
|---|---|
| `SERG.sol` | Ownable ERC-20 representation of ERG for the current compatibility profile |
| `ErgoBridge.sol` | Peg-in mint/replay surface, atomic peg-out burn, and Ergo-state relay |

## Reproducible Build

The package-local build closure pins:

- `solc` `0.8.35` (`0.8.35+commit.47b9dedd.Emscripten.clang`);
- `@openzeppelin/contracts` `5.6.1`;
- the complete npm dependency graph in `package-lock.json`;
- optimizer runs, `osaka` EVM target, metadata policy, and non-IR compilation;
- LF-normalized compiler inputs and every imported source digest.

From the bridge root:

```bash
npm --prefix solidity ci --ignore-scripts --include=dev
npm --prefix solidity run check
```

`check` recompiles in memory and fails on any dependency, compiler, source,
setting, ABI, creation bytecode, runtime bytecode, metadata, storage-layout, or
manifest drift. It does not rewrite tracked artifacts. To intentionally
regenerate the complete artifact set after a reviewed source/build change:

```bash
npm --prefix solidity run build
npm --prefix solidity run check
```

`compiled/build-manifest.json` binds the complete local source-to-artifact
closure. The two creation `.bin` files remain byte-identical to the fixtures
used by the pinned Frontier whole-block rollback test.

This closure does not identify any deployed address or runtime code, prove
bridge-to-token ownership or mint history, establish sidechain finality, close
Gate 5, or support a production-readiness claim.
