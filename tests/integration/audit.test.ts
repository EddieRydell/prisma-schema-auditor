import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { audit } from '../../src/index.js';
import { toJson } from '../../src/core/report/toJson.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('audit (integration)', () => {
  it('produces deterministic JSON output for basic schema', async () => {
    const result = await audit(resolve(FIXTURES_DIR, 'basic.prisma'), true);
    const json1 = toJson(result, false);
    const result2 = await audit(resolve(FIXTURES_DIR, 'basic.prisma'), true);
    const json2 = toJson(result2, false);
    expect(json1).toBe(json2);
  });

  it('full audit result matches snapshot for basic schema', async () => {
    const result = await audit(resolve(FIXTURES_DIR, 'basic.prisma'), true);

    expect(result.metadata.modelCount).toBe(2);
    expect(result.metadata.timestamp).toBeNull();
    expect(result.contract.models).toHaveLength(2);

    // Verify contract structure
    const post = result.contract.models.find((m) => m.name === 'Post')!;
    expect(post.primaryKey).toEqual({ fields: ['id'], isComposite: false });
    expect(post.foreignKeys).toHaveLength(1);
    expect(post.foreignKeys[0]!.referencedModel).toBe('User');

    const user = result.contract.models.find((m) => m.name === 'User')!;
    expect(user.primaryKey).toEqual({ fields: ['id'], isComposite: false });
    expect(user.uniqueConstraints).toHaveLength(1);
    expect(user.uniqueConstraints[0]!.fields).toEqual(['email']);

    // Post.authorId FK is not covered by PK/unique → FK_MISSING_INDEX
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.rule).toBe('FK_MISSING_INDEX');
  });

  it('handles empty schema', async () => {
    const result = await audit(resolve(FIXTURES_DIR, 'empty.prisma'), true);
    expect(result.metadata.modelCount).toBe(0);
    expect(result.contract.models).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
  });

  it('detects soft-delete unique consistency issues', async () => {
    const result = await audit(resolve(FIXTURES_DIR, 'soft-delete.prisma'), true);
    const sdFindings = result.findings.filter(
      (f) => f.rule === 'SOFTDELETE_MISSING_IN_UNIQUE',
    );
    // User has 1, Product has 2 = 3 total
    expect(sdFindings).toHaveLength(3);
    expect(sdFindings.every((f) => f.normalForm === 'SCHEMA')).toBe(true);
  });

  it('does not flag FK_MISSING_INDEX when @@index covers FK', async () => {
    const result = await audit(resolve(FIXTURES_DIR, 'fk-with-index.prisma'), true);

    const post = result.contract.models.find((m) => m.name === 'Post')!;
    expect(post.indexes).toEqual([{ name: null, fields: ['authorId'] }]);

    const fkFindings = result.findings.filter((f) => f.rule === 'FK_MISSING_INDEX');
    expect(fkFindings).toHaveLength(0);
  });

  it('handles composite key schema', async () => {
    const result = await audit(resolve(FIXTURES_DIR, 'composite.prisma'), true);
    expect(result.metadata.modelCount).toBe(3);

    const postTag = result.contract.models.find((m) => m.name === 'PostTag')!;
    expect(postTag.primaryKey!.isComposite).toBe(true);
    expect(postTag.foreignKeys).toHaveLength(2);
  });
});
