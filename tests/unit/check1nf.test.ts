import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSqlSchema } from '../../src/core/sqlSchema/parse.js';
import { check1nf } from '../../src/core/analysis/normalizeChecks/check1nf.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('check1nf', () => {
  it('detects list-in-string fields', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, '1nf-violations.sql'));
    const findings = check1nf(contract);

    const listFindings = findings.filter((f) => f.rule === 'NF1_LIST_IN_STRING_SUSPECTED');
    expect(listFindings.length).toBeGreaterThanOrEqual(3);

    const fieldNames = listFindings.map((f) => f.field);
    expect(fieldNames).toContain('tagIds');
    expect(fieldNames).toContain('roleList');
    expect(fieldNames).toContain('categoryIds');
  });

  it('detects repeating group fields', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, '1nf-violations.sql'));
    const findings = check1nf(contract);

    const repeatFindings = findings.filter((f) => f.rule === 'NF1_REPEATING_GROUP_SUSPECTED');
    expect(repeatFindings.length).toBeGreaterThanOrEqual(2);

    // User.phone1, phone2, phone3
    const userPhoneFinding = repeatFindings.find(
      (f) => f.model === 'User' && f.message.includes('phone'),
    );
    expect(userPhoneFinding).toBeDefined();

    // Product.address1, address2
    const productAddressFinding = repeatFindings.find(
      (f) => f.model === 'Product' && f.message.includes('address'),
    );
    expect(productAddressFinding).toBeDefined();
  });

  it('detects Json fields as potential embedded relations', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, '1nf-violations.sql'));
    const findings = check1nf(contract);

    const jsonFindings = findings.filter((f) => f.rule === 'NF1_JSON_RELATION_SUSPECTED');
    expect(jsonFindings.length).toBeGreaterThanOrEqual(2);

    const fieldNames = jsonFindings.map((f) => f.field);
    expect(fieldNames).toContain('metadata');
    expect(fieldNames).toContain('attributes');
  });

  it('all findings have severity and normalForm set correctly', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, '1nf-violations.sql'));
    const findings = check1nf(contract);

    for (const f of findings) {
      expect(f.normalForm).toBe('1NF');
      expect(['warning', 'info']).toContain(f.severity);
    }
  });

  it('all findings have non-null fix suggestions', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, '1nf-violations.sql'));
    const findings = check1nf(contract);

    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.fix).not.toBeNull();
      expect(typeof f.fix).toBe('string');
    }
  });

  it('produces no findings for a clean schema', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const findings = check1nf(contract);
    expect(findings).toHaveLength(0);
  });
});
