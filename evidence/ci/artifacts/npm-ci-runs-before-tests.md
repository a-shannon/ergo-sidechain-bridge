# npm ci Ordering Evidence

Evidence:
- CI workflow runs `npm ci` in the `Install relayer dependencies` step.
- CI workflow runs `npm run check` after dependency installation.
- CI workflow runs `npm run wasm:test` after dependency installation.
