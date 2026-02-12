import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSchema } from '../../src/core/prismaSchema/parse.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('parseSchema', () => {
  it('parses a basic schema with User and Post models', async () => {
    const result = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));

    expect(result.models).toHaveLength(2);

    const userModel = result.models.find((m) => m.name === 'User');
    expect(userModel).toBeDefined();
    expect(userModel!.fields.some((f) => f.name === 'id' && f.isId)).toBe(true);
    expect(userModel!.fields.some((f) => f.name === 'email' && f.isUnique)).toBe(true);
    expect(userModel!.fields.some((f) => f.name === 'name' && !f.isRequired)).toBe(true);

    const postModel = result.models.find((m) => m.name === 'Post');
    expect(postModel).toBeDefined();
    expect(postModel!.fields.some((f) => f.name === 'authorId')).toBe(true);

    // Check the relation field has fromFields/toFields
    const authorField = postModel!.fields.find((f) => f.name === 'author');
    expect(authorField).toBeDefined();
    expect(authorField!.kind).toBe('object');
    expect(authorField!.relationFromFields).toEqual(['authorId']);
    expect(authorField!.relationToFields).toEqual(['id']);
  });

  it('returns empty models for a schema with no models', async () => {
    const result = await parseSchema(resolve(FIXTURES_DIR, 'empty.prisma'));
    expect(result.models).toHaveLength(0);
  });

  it('handles composite primary keys', async () => {
    const result = await parseSchema(resolve(FIXTURES_DIR, 'composite.prisma'));
    const model = result.models.find((m) => m.name === 'PostTag');
    expect(model).toBeDefined();
    expect(model!.primaryKey).toEqual({ fields: ['postId', 'tagId'] });
  });

  it('parses @@index declarations from raw schema', async () => {
    const result = await parseSchema(resolve(FIXTURES_DIR, 'fk-with-index.prisma'));
    const post = result.models.find((m) => m.name === 'Post');
    expect(post).toBeDefined();
    expect(post!.indexes).toEqual([{ name: null, fields: ['authorId'] }]);
  });

  it('returns empty indexes for models without @@index', async () => {
    const result = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    for (const model of result.models) {
      expect(model.indexes).toEqual([]);
    }
  });
});
