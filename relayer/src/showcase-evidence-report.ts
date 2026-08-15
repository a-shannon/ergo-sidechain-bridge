import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { resolveEvidenceOutputPath } from './evidence-output-path.js';

export interface ShowcaseOutputArgs {
  out?: string;
}

export function parseShowcaseOutputArgs(
  argv: string[],
  command: string,
  description: string,
): ShowcaseOutputArgs {
  const args: ShowcaseOutputArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log([
        `Usage: ${command} -- [--out <report.md>]`,
        '',
        description,
        '--out writes a completed Markdown evidence report inside the bridge repository.',
      ].join('\n'));
      process.exit(0);
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out requires a report path');
      args.out = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

export function commandLabel(command: string, args: ShowcaseOutputArgs): string {
  return args.out ? `${command} -- --out <report.md>` : command;
}

export function markdownTableEscape(value: string): string {
  return value.replace(/\|/g, '\\|');
}

export function writeShowcaseReport(target: string, report: string): void {
  const resolved = resolveEvidenceOutputPath(target);
  if (resolved.errors.length > 0 || !resolved.path) {
    throw new Error(resolved.errors.join('\n'));
  }

  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, report.endsWith('\n') ? report : `${report}\n`);
}

export function commandResultSection(command: string, args: ShowcaseOutputArgs): string[] {
  return [
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Command | ${commandLabel(command, args)} |`,
    '| Result | PASS |',
    '| Exit code | 0 |',
    '| Node calls | none |',
    '| Signing | none |',
    '| Broadcast | none |',
    '| Runtime database opened | no |',
    '| Deployment state opened | no |',
    '| Secret or environment file read | no |',
    '| Transaction broadcast, submit, deploy, or state mutation performed | no |',
  ];
}
