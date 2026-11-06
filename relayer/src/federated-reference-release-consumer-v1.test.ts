import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateReleaseGate } from './release-gate.js';
import { createFederatedReferenceReleaseEvidenceV1 } from './federated-reference-release-evidence-v1.js';
const candidate = { bridgeCommit: 'a'.repeat(40), bridgeTree: 'b'.repeat(40) };
const target = '../evidence/fed-reference-preparation.json';
const source = readFileSync('../docs/release-checklist.md', 'utf8');
function checklist() {
  return source.replace('| FED evidence target | none |', `| FED evidence target | ${target} |`)
    .replace('| FED candidate commit | unestablished |', `| FED candidate commit | ${candidate.bridgeCommit} |`)
    .replace('| FED candidate tree | unestablished |', `| FED candidate tree | ${candidate.bridgeTree} |`);
}
function input() { return { target, status: 'PASS' as const, errors: [], report: createFederatedReferenceReleaseEvidenceV1(candidate) }; }
describe('FED report to existing release consumer', () => {
  it('does not change the legacy result when the optional FED input is absent', () => {
    const baseline = evaluateReleaseGate(source);
    expect(evaluateReleaseGate(source, { federatedReferenceEvidenceValidation: undefined })).toEqual(baseline);
  });
  it('revalidates the report and exact checklist binding but keeps release blocked', () => {
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: input() });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues.filter(x => x.startsWith('FED reference'))).toHaveLength(7);
    expect(result.issues).not.toContain('FED reference checklist target must match the validated report target exactly');
    expect(result.issues.some(x => x.includes('canonical-one-use-launcher-graph'))).toBe(true);
  });
  it.each(['FED evidence target','FED candidate commit','FED candidate tree','FED profile','FED evidence purpose'])('rejects a single checklist drift: %s', field => {
    const markdown = checklist().replace(new RegExp(`\\| ${field} \\| [^\\n]+`), `| ${field} | wrong |`);
    const result = evaluateReleaseGate(markdown, { federatedReferenceEvidenceValidation: input() });
    expect(result.issues.some(x => x.startsWith('FED reference checklist'))).toBe(true);
  });
  it('rejects a PASS wrapper around missing report content', () => {
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: { ...input(), report: undefined } });
    expect(result.issues.some(x => x.includes('report content failed'))).toBe(true);
  });
  it('rejects duplicate checklist fields and duplicate sections', () => {
    const duplicate = checklist().replace('| FED profile | substrate-federated-v1 |', '| FED profile | substrate-federated-v1 |\n| FED profile | substrate-federated-v1 |');
    for (const markdown of [duplicate, `${checklist()}\n## FED Reference Preparation\n`]) {
      const result = evaluateReleaseGate(markdown, { federatedReferenceEvidenceValidation: input() });
      expect(result.issues.some(x => x.includes('report content failed'))).toBe(true);
    }
  });
  it('rejects a blocked wrapper around otherwise valid content', () => {
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: { ...input(), status: 'BLOCKED' } });
    expect(result.issues).toContain('FED reference evidence JSON validation must pass');
  });
  it.each(['target', 'status', 'errors', 'report'])('refuses a wrapper %s getter without effects or an escaped exception', field => {
    let effects = 0;
    const hostile = input();
    Object.defineProperty(hostile, field, { enumerable: true, get() { effects += 1; throw new Error('getter executed'); } });
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: hostile });
    expect(effects).toBe(0);
    expect(result.status).toBe('BLOCKED');
    expect(result.issues.some(issue => issue.includes('validation wrapper'))).toBe(true);
  });
  it('refuses a wrapper Proxy before invoking any trap', () => {
    let effects = 0;
    const trap = () => { effects += 1; throw new Error('proxy executed'); };
    const hostile = new Proxy(input(), { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: hostile });
    expect(effects).toBe(0);
    expect(result.status).toBe('BLOCKED');
    expect(result.issues.some(issue => issue.includes('validation wrapper'))).toBe(true);
  });
  it('refuses an accessor on the new optional input without reading it', () => {
    let effects = 0;
    const options = {};
    Object.defineProperty(options, 'federatedReferenceEvidenceValidation', { get() { effects += 1; throw new Error('option executed'); } });
    expect(evaluateReleaseGate(checklist(), options).status).toBe('BLOCKED');
    expect(effects).toBe(0);
  });
  it.each(['proxy', 'getter', 'hole', 'symbol', 'extra', 'prototype', 'too-long'])('refuses hostile wrapper errors: %s', kind => {
    let effects = 0;
    const errors: string[] = [];
    if (kind === 'proxy') {
      const trap = () => { effects += 1; throw new Error('errors proxy executed'); };
      const hostile = new Proxy(errors, { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap });
      const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: { ...input(), errors: hostile } });
      expect(result.issues.some(issue => issue.includes('validation wrapper'))).toBe(true);
      expect(effects).toBe(0);
      return;
    }
    if (kind === 'getter') Object.defineProperty(errors, '0', { enumerable: true, get() { effects += 1; throw new Error('errors getter executed'); } });
    if (kind === 'hole') errors.length = 1;
    if (kind === 'symbol') Object.defineProperty(errors, Symbol('extra'), { value: 'extra' });
    if (kind === 'extra') Object.defineProperty(errors, 'extra', { value: 'extra' });
    if (kind === 'prototype') Object.setPrototypeOf(errors, null);
    if (kind === 'too-long') errors.push('x'.repeat(4097));
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: { ...input(), errors } });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues.some(issue => issue.includes('validation wrapper'))).toBe(true);
    expect(effects).toBe(0);
  });
  it.each(['extra', 'symbol', 'hidden', 'prototype', 'missing'])('refuses a noncanonical wrapper shape: %s', kind => {
    const hostile = input();
    if (kind === 'extra') Object.defineProperty(hostile, 'extra', { enumerable: true, value: true });
    if (kind === 'symbol') Object.defineProperty(hostile, Symbol('extra'), { value: true });
    if (kind === 'hidden') Object.defineProperty(hostile, 'target', { enumerable: false, value: target });
    if (kind === 'prototype') Object.setPrototypeOf(hostile, { inherited: true });
    if (kind === 'missing') Reflect.deleteProperty(hostile, 'status');
    const result = evaluateReleaseGate(checklist(), { federatedReferenceEvidenceValidation: hostile });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues.some(issue => issue.includes('validation wrapper'))).toBe(true);
  });
});
