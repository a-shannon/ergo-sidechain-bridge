/**
 * Deprecated entry point.
 *
 * The maintained relayer runtime is `src/relayer-daemon.ts`.
 * Keep this file as a fail-fast guard so older commands do not start the
 * obsolete v0.5 loop without Phase 006+ hardening.
 */

console.error('src/index.ts is deprecated. Use `npm run daemon` or `tsx src/relayer-daemon.ts`.');
process.exit(1);
