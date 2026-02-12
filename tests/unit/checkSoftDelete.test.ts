import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSqlSchema } from '../../src/core/sqlSchema/parse.js';
import { checkSoftDelete } from '../../src/core/analysis/normalizeChecks/checkSoftDelete.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('checkSoftDelete', () => {
  it('detects unique missing soft-delete field', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete.sql'));
    const findings = checkSoftDelete(contract);

    const userFindings = findings.filter((f) => f.model === 'User' && f.rule === 'SOFTDELETE_MISSING_IN_UNIQUE');
    expect(userFindings).toHaveLength(1);
    expect(userFindings[0]!.field).toBe('deleted_at');
    expect(userFindings[0]!.message).toContain('email');
  });

  it('does not flag uniques that include the soft-delete field', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete.sql'));
    const findings = checkSoftDelete(contract);

    const accountFindings = findings.filter((f) => f.model === 'Account' && f.rule === 'SOFTDELETE_MISSING_IN_UNIQUE');
    expect(accountFindings).toHaveLength(0);
  });

  it('does not flag models without a soft-delete field', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete.sql'));
    const findings = checkSoftDelete(contract);

    const postFindings = findings.filter((f) => f.model === 'Post');
    expect(postFindings).toHaveLength(0);
  });

  it('flags multiple uniques on the same model', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete.sql'));
    const findings = checkSoftDelete(contract);

    const productFindings = findings.filter((f) => f.model === 'Product' && f.rule === 'SOFTDELETE_MISSING_IN_UNIQUE');
    expect(productFindings).toHaveLength(2);
    expect(productFindings.every((f) => f.rule === 'SOFTDELETE_MISSING_IN_UNIQUE')).toBe(true);
  });

  it('produces no findings on a clean schema', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const findings = checkSoftDelete(contract);
    expect(findings).toHaveLength(0);
  });

  it('flags deleted_at without deleted_by', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete-pairing.sql'));
    const findings = checkSoftDelete(contract);

    const atWithoutBy = findings.filter((f) => f.rule === 'SOFTDELETE_AT_WITHOUT_BY');
    expect(atWithoutBy).toHaveLength(1);
    expect(atWithoutBy[0]!.model).toBe('AuditLog');
    expect(atWithoutBy[0]!.severity).toBe('info');
    expect(atWithoutBy[0]!.message).toContain('deleted_by');
  });

  it('flags deleted_by without deleted_at', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete-pairing.sql'));
    const findings = checkSoftDelete(contract);

    const byWithoutAt = findings.filter((f) => f.rule === 'SOFTDELETE_BY_WITHOUT_AT');
    expect(byWithoutAt).toHaveLength(1);
    expect(byWithoutAt[0]!.model).toBe('Comment');
    expect(byWithoutAt[0]!.severity).toBe('info');
    expect(byWithoutAt[0]!.message).toContain('deleted_at');
  });

  it('does not flag models with both deleted_at and deleted_by', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete-pairing.sql'));
    const findings = checkSoftDelete(contract);

    const articleFindings = findings.filter((f) => f.model === 'Article');
    expect(articleFindings).toHaveLength(0);
  });

  it('does not flag models with neither deleted_at nor deleted_by', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'soft-delete-pairing.sql'));
    const findings = checkSoftDelete(contract);

    const tagFindings = findings.filter((f) => f.model === 'Tag');
    expect(tagFindings).toHaveLength(0);
  });
});
