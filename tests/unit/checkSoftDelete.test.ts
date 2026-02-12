import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSchema } from '../../src/core/prismaSchema/parse.js';
import { extractContract } from '../../src/core/prismaSchema/contract.js';
import { checkSoftDelete } from '../../src/core/analysis/normalizeChecks/checkSoftDelete.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('checkSoftDelete', () => {
  it('detects unique missing soft-delete field', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'soft-delete.prisma'));
    const contract = extractContract(parsed);
    const findings = checkSoftDelete(contract);

    const userFindings = findings.filter((f) => f.model === 'User');
    expect(userFindings).toHaveLength(1);
    expect(userFindings[0]!.rule).toBe('SOFTDELETE_MISSING_IN_UNIQUE');
    expect(userFindings[0]!.field).toBe('deleted_at');
    expect(userFindings[0]!.message).toContain('email');
  });

  it('does not flag uniques that include the soft-delete field', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'soft-delete.prisma'));
    const contract = extractContract(parsed);
    const findings = checkSoftDelete(contract);

    const accountFindings = findings.filter((f) => f.model === 'Account');
    expect(accountFindings).toHaveLength(0);
  });

  it('does not flag models without a soft-delete field', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'soft-delete.prisma'));
    const contract = extractContract(parsed);
    const findings = checkSoftDelete(contract);

    const postFindings = findings.filter((f) => f.model === 'Post');
    expect(postFindings).toHaveLength(0);
  });

  it('flags multiple uniques on the same model', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'soft-delete.prisma'));
    const contract = extractContract(parsed);
    const findings = checkSoftDelete(contract);

    const productFindings = findings.filter((f) => f.model === 'Product');
    expect(productFindings).toHaveLength(2);
    expect(productFindings.every((f) => f.rule === 'SOFTDELETE_MISSING_IN_UNIQUE')).toBe(true);
  });

  it('produces no findings on a clean schema', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    const contract = extractContract(parsed);
    const findings = checkSoftDelete(contract);
    expect(findings).toHaveLength(0);
  });
});
