import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicAuditAlphaBundle,
  parsePublicAuditAlphaBundleArgs,
} from '../public-audit-alpha-bundle.js';
import {
  comparePublicAuditAlphaCandidateIdentity,
  inspectPublicAuditAlphaPreflight,
} from '../public-audit-alpha.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(scriptDirectory, '..', '..', '..');

function main(): void {
  const args = parsePublicAuditAlphaBundleArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.outputPath);

  const entry = inspectPublicAuditAlphaPreflight({ bridgeRoot });
  if (entry.status !== 'PASS') {
    throw new Error(`public audit alpha preflight is blocked: ${entry.errors.join('; ')}`);
  }
  if (!entry.candidate.headCommit || !entry.candidate.repositoryIndexInventorySha256) {
    throw new Error('public audit alpha candidate identity is unavailable');
  }

  const report = createPublicAuditAlphaBundle({
    bridgeRoot,
    outputPath,
    expectedCandidate: {
      headCommit: entry.candidate.headCommit,
      repositoryIndexInventorySha256: entry.candidate.repositoryIndexInventorySha256,
    },
    beforePublish: () => {
      const final = inspectPublicAuditAlphaPreflight({ bridgeRoot });
      if (final.status !== 'PASS') {
        throw new Error(`final public audit alpha preflight is blocked: ${final.errors.join('; ')}`);
      }
      const identityErrors = comparePublicAuditAlphaCandidateIdentity(entry.candidate, final.candidate);
      if (identityErrors.length > 0) {
        throw new Error(`audit candidate identity changed: ${identityErrors.join('; ')}`);
      }
    },
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'public audit alpha bundle failed');
    process.exitCode = 1;
  }
}
