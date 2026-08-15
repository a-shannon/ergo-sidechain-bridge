import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';

export interface BoundedRegularFile {
  readonly bytes: Uint8Array;
  readonly canonicalPath: string;
}

export function readBoundedRegularFile(
  path: string,
  label: string,
  maximumBytes: number,
): BoundedRegularFile {
  const beforeOpen = lstatSync(path);
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    const opened = fstatSync(descriptor);
    const afterOpen = lstatSync(path);
    const canonicalPath = realpathSync(path);
    const canonicalFile = lstatSync(canonicalPath);
    if (
      !beforeOpen.isFile()
      || beforeOpen.isSymbolicLink()
      || !opened.isFile()
      || !afterOpen.isFile()
      || afterOpen.isSymbolicLink()
      || !canonicalFile.isFile()
      || canonicalFile.isSymbolicLink()
      || !sameFileIdentity(beforeOpen, opened)
      || !sameFileIdentity(opened, afterOpen)
      || !sameFileIdentity(opened, canonicalFile)
    ) {
      throw new Error(`${label} identity changed while opening`);
    }
    if (opened.size === 0 || opened.size > maximumBytes) {
      throw new Error(`${label} size is outside the bounded limit`);
    }
    const bytes = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) throw new Error(`${label} changed while being read`);
      offset += count;
    }
    const trailing = Buffer.allocUnsafe(1);
    if (readSync(descriptor, trailing, 0, 1, opened.size) !== 0) {
      throw new Error(`${label} changed while being read`);
    }
    const afterRead = fstatSync(descriptor);
    const finalPath = lstatSync(path);
    const finalCanonicalPath = realpathSync(path);
    const finalCanonicalFile = lstatSync(finalCanonicalPath);
    if (
      !sameFileIdentity(opened, afterRead)
      || !sameFileIdentity(afterRead, finalPath)
      || !sameFileIdentity(afterRead, finalCanonicalFile)
      || afterRead.size !== opened.size
      || afterRead.mtimeMs !== opened.mtimeMs
      || canonicalPathIdentity(finalCanonicalPath)
        !== canonicalPathIdentity(canonicalPath)
    ) {
      throw new Error(`${label} changed while being read`);
    }
    return Object.freeze({ bytes, canonicalPath });
  } finally {
    closeSync(descriptor);
  }
}

export function writeNewFile(
  path: string,
  bytes: Uint8Array,
  label: string,
): void {
  const parentPath = dirname(path);
  const parent = lstatSync(parentPath);
  const canonicalParent = realpathSync(parentPath);
  if (
    !parent.isDirectory()
    || parent.isSymbolicLink()
    || canonicalPathIdentity(canonicalParent)
      !== canonicalPathIdentity(parentPath)
  ) {
    throw new Error(`${label} parent must be a regular directory`);
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    const opened = fstatSync(descriptor);
    const currentParent = lstatSync(parentPath);
    if (
      !opened.isFile()
      || !sameFileIdentity(parent, currentParent)
      || canonicalPathIdentity(realpathSync(parentPath))
        !== canonicalPathIdentity(canonicalParent)
      || canonicalPathIdentity(realpathSync(path))
        !== canonicalPathIdentity(path)
    ) {
      throw new Error(`${label} identity changed while opening`);
    }
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    const finalParent = lstatSync(parentPath);
    const finalPath = lstatSync(path);
    if (
      written.size !== bytes.byteLength
      || !sameFileIdentity(opened, written)
      || !sameFileIdentity(parent, finalParent)
      || !sameFileIdentity(written, finalPath)
      || canonicalPathIdentity(realpathSync(parentPath))
        !== canonicalPathIdentity(canonicalParent)
      || canonicalPathIdentity(realpathSync(path))
        !== canonicalPathIdentity(path)
    ) {
      throw new Error(`${label} changed while being written`);
    }
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      descriptor = undefined;
    }
    // A raced path may now identify another file, so cleanup cannot unlink it safely.
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function canonicalPathIdentity(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

export function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === ''
    || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function sameFileIdentity(
  left: Readonly<{ dev: number; ino: number }>,
  right: Readonly<{ dev: number; ino: number }>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}
