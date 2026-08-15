import { describe, expect, it } from 'vitest';

import {
  validateDuplicateRequiredFields,
  validateRequiredNames,
} from './evidence-required-names.js';

describe('required evidence row names', () => {
  it('passes when every required row appears once', () => {
    const result = validateRequiredNames('Evidence', ['A', 'B'], ['A', 'B']);

    expect(result).toEqual([]);
  });

  it('reports missing required rows', () => {
    const result = validateRequiredNames('Evidence', ['A'], ['A', 'B']);

    expect(result).toEqual(['Evidence: B: missing required row']);
  });

  it('reports duplicate required rows', () => {
    const result = validateRequiredNames('Evidence', ['A', 'A', 'B'], ['A', 'B']);

    expect(result).toEqual(['Evidence: A: duplicate required row']);
  });

  it('reports duplicate required fields', () => {
    const result = validateDuplicateRequiredFields('Classification', ['A', 'A', 'B'], ['A', 'B']);

    expect(result).toEqual(['Classification: A: duplicate required field']);
  });
});
