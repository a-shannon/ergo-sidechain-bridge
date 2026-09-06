import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('tracker V2 command process boundary', () => {
  it.each(['initialization', 'execution', 'success'] as const)(
    'contains %s in the fixed command error boundary', mode => {
      const directory = mkdtempSync(join(tmpdir(), 'e2s-tracker-v2-cli-'));
      try {
        const source = readFileSync(new URL('./run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts', import.meta.url), 'utf8');
        const workerBody = mode === 'success'
          ? 'return Object.freeze({status:"synthetic-command-result"});'
          : 'throw new Error("synthetic-private-diagnostic");';
        const worker = 'data:text/javascript,' + encodeURIComponent(
          'export async function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(){'
          + workerBody + '}'
          + (mode === 'initialization'
            ? 'process.stdout.write("synthetic-loader-entered\\n");throw new Error("synthetic-private-diagnostic");'
            : ''),
        );
        let replacements = 0;
        const compiled = ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          transformers: { before: [context => root => {
            const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
              if (ts.isStringLiteral(node)) {
                if (node.text === './run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js') {
                  replacements += 1;
                  return ts.factory.createStringLiteral(worker);
                }
                if (node.text === '../ergo-settlement-core/strict-json.js') {
                  return ts.factory.createStringLiteral('data:text/javascript,export const canonicalJson = JSON.stringify;');
                }
              }
              return ts.visitEachChild(node, visit, context);
            };
            return ts.visitNode(root, visit) as ts.SourceFile;
          }] },
        });
        expect(replacements).toBe(1);
        const path = join(directory, 'command.mjs');
        writeFileSync(path, compiled.outputText);
        const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP']
          .flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]!]]));
        const result = spawnSync(process.execPath, [path], {
          env, encoding: 'utf8', timeout: 3000, maxBuffer: 4096,
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(mode === 'success' ? 0 : 1);
        expect(result.stdout).toBe(mode === 'success' ? '{"status":"synthetic-command-result"}\n'
          : mode === 'initialization' ? 'synthetic-loader-entered\n' : '');
        expect(result.stderr).toBe(mode === 'success' ? ''
          : 'isolated tracker V2 campaign failed; no successful receipt\n');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
