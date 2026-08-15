# npm Cache Lockfile Evidence

Evidence:
- CI workflow sets `cache: npm`.
- CI workflow sets `cache-dependency-path: ergo-sidechain-bridge/relayer/package-lock.json`.
- Clean checkout install used `npm ci` from the relayer lockfile.
