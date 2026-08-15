import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  classifyBridgeLayer,
  inspectLayerImports,
  type LayerSourceFile,
} from '../architecture/layer-import-rules.js';

function collectRuntimeSources(root: string, current = root): LayerSourceFile[] {
  const files: LayerSourceFile[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRuntimeSources(root, absolute));
      continue;
    }
    if (
      !entry.isFile()
      || !/\.(?:[cm]?ts|tsx)$/.test(entry.name)
      || /\.test\.(?:[cm]?ts|tsx)$/.test(entry.name)
      || /\.d\.(?:[cm]?ts|tsx)$/.test(entry.name)
    ) {
      continue;
    }
    files.push({
      path: path.relative(root, absolute).split(path.sep).join('/'),
      source: readFileSync(absolute, 'utf8'),
    });
  }
  return files;
}

const sourceRoot = path.resolve(process.cwd(), 'src');
const files = collectRuntimeSources(sourceRoot);
const layeredFiles = files.filter(file => classifyBridgeLayer(file.path) !== null);
const violations = inspectLayerImports(files);

if (violations.length > 0) {
  for (const violation of violations) {
    const location = `${violation.file}:${violation.line}`;
    console.error(`${location} ${violation.message}`);
  }
  throw new Error(`layer import check failed with ${violations.length} violation(s)`);
}

console.log(
  `Layer import check passed for ${layeredFiles.length} layered runtime module(s) `
    + `across ${files.length} TypeScript source file(s).`,
);
