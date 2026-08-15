import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import {
  resolveEvidenceJsonOutputPath,
  validateEvidenceJsonOutputPath,
} from './evidence-json-output-path.js';

export interface OfflineReportJsonWriteResult {
  path?: string;
  errors: string[];
}

export function writeOfflineReportJson(
  target: string,
  report: unknown,
): OfflineReportJsonWriteResult {
  const outputTarget = resolveEvidenceJsonOutputPath(target);
  if (outputTarget.errors.length > 0) return { errors: outputTarget.errors };

  const outputPath = outputTarget.path!;
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    return { path: outputPath, errors: [] };
  } catch (error: any) {
    return { errors: [formatOfflineReportJsonWriteError(error)] };
  }
}

export function formatOfflineReportJsonWriteLine(label: string, target: string): string {
  return `- ${label} written: ${formatOfflineReportJsonWriteTarget(target)}`;
}

function formatOfflineReportJsonWriteError(error: any): string {
  if (error?.code === 'EEXIST') {
    return 'offline report JSON output already exists; refusing to overwrite';
  }
  return 'offline report JSON could not be written';
}

function formatOfflineReportJsonWriteTarget(target: string): string {
  return validateEvidenceJsonOutputPath(target).length > 0
    ? '<blocked output target>'
    : target.trim().replace(/\\/g, '/');
}
