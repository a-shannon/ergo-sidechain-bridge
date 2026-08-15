# WASM AVL Build Reproducibility Evidence

Evidence:
- `npm.cmd run check` invoked the WASM AVL build from tracked source.
- WASM build completed before TypeScript build and tests.
- Publication remains blocked if the tracked-source WASM build fails.
