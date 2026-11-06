import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import { readBoundedEvidenceJsonTargetText } from '../evidence-json-target-path.js';
import { createFederatedReferenceReleaseEvidenceV1, parseFederatedReferenceJsonV1 } from '../federated-reference-release-evidence-v1.js';

export function prepareFederatedReferenceReleaseEvidenceFromArgumentsV1(args: readonly string[]): string {
  const allowed = ['--candidate-commit', '--candidate-tree', '--parent-result-json'];
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (!allowed.includes(flag) || values.has(flag) || !value || value.startsWith('--')) throw new Error('FED preparation arguments differ');
    values.set(flag, value);
  }
  const bridgeCommit = values.get('--candidate-commit'); const bridgeTree = values.get('--candidate-tree');
  if (!bridgeCommit || !bridgeTree) throw new Error('FED preparation requires exact candidate commit and tree');
  let parent: unknown = null;
  const target = values.get('--parent-result-json');
  if (target !== undefined) {
    const read = readBoundedEvidenceJsonTargetText(target, '--parent-result-json');
    if (read.text === undefined || read.errors.length) throw new Error('FED public parent evidence read refused');
    parent = parseFederatedReferenceJsonV1(read.text);
  }
  return `${canonicalJson(createFederatedReferenceReleaseEvidenceV1({ bridgeCommit, bridgeTree }, parent))}\n`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(prepareFederatedReferenceReleaseEvidenceFromArgumentsV1(process.argv.slice(2))); }
  catch { process.stderr.write('FED reference evidence preparation failed\n'); process.exitCode = 1; }
}
