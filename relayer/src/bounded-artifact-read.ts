import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs';

export function readBoundedStableArtifact(input: {
  path: string;
  maxBytes: number;
  label: string;
}): Buffer {
  if (
    !Number.isSafeInteger(input.maxBytes)
    || input.maxBytes <= 0
  ) {
    throw new Error('artifact read maximum must be a positive safe integer');
  }
  if (
    typeof input.label !== 'string'
    || input.label.trim() === ''
    || input.label.includes('\0')
  ) {
    throw new Error('artifact read label must be a non-empty string');
  }

  const descriptor = openSync(input.path, 'r');
  try {
    const initial = fstatSync(descriptor);
    if (!initial.isFile()) {
      throw new Error(`${input.label} must be a regular file`);
    }
    if (initial.size === 0) {
      throw new Error(`${input.label} must not be empty`);
    }
    if (initial.size > input.maxBytes) {
      throw new Error(
        `${input.label} exceeds ${input.maxBytes} bytes`,
      );
    }

    const bytes = Buffer.allocUnsafe(initial.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (read === 0) {
        throw new Error(`${input.label} changed while being read`);
      }
      offset += read;
    }

    const trailing = Buffer.allocUnsafe(1);
    if (readSync(descriptor, trailing, 0, 1, initial.size) !== 0) {
      throw new Error(`${input.label} changed while being read`);
    }
    if (fstatSync(descriptor).size !== initial.size) {
      throw new Error(`${input.label} changed while being read`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
