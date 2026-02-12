import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSqlSchema, parseSqlString } from '../../src/core/sqlSchema/parse.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('parseSqlSchema', () => {
  it('parses a basic schema with User and Post models', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));

    expect(contract.models).toHaveLength(2);

    const user = contract.models.find((m) => m.name === 'User');
    expect(user).toBeDefined();
    expect(user!.primaryKey).toEqual({ fields: ['id'], isComposite: false });
    expect(user!.uniqueConstraints).toEqual([
      { name: null, fields: ['email'], isComposite: false },
    ]);
    expect(user!.foreignKeys).toHaveLength(0);

    const post = contract.models.find((m) => m.name === 'Post');
    expect(post).toBeDefined();
    expect(post!.primaryKey).toEqual({ fields: ['id'], isComposite: false });
    expect(post!.foreignKeys).toHaveLength(1);
    expect(post!.foreignKeys[0]).toMatchObject({
      fields: ['authorId'],
      referencedModel: 'User',
      referencedFields: ['id'],
    });
  });

  it('returns empty models for a schema with no tables', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'empty.sql'));
    expect(contract.models).toHaveLength(0);
  });

  it('handles composite primary keys', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'composite.sql'));
    const postTag = contract.models.find((m) => m.name === 'PostTag');
    expect(postTag).toBeDefined();
    expect(postTag!.primaryKey).toEqual({
      fields: ['postId', 'tagId'],
      isComposite: true,
    });
  });

  it('parses CREATE INDEX declarations', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'fk-with-index.sql'));
    const post = contract.models.find((m) => m.name === 'Post');
    expect(post).toBeDefined();
    expect(post!.indexes).toEqual([{ name: 'idx_post_author', fields: ['authorId'] }]);
  });

  it('returns empty indexes for models without CREATE INDEX', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    for (const model of contract.models) {
      expect(model.indexes).toEqual([]);
    }
  });

  it('excludes object/relation fields — only scalar columns present', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const user = contract.models.find((m) => m.name === 'User')!;
    const fieldNames = user.fields.map((f) => f.name);
    expect(fieldNames).toContain('id');
    expect(fieldNames).toContain('email');
    expect(fieldNames).toContain('name');
    // No relation fields in SQL — only scalar columns exist
    expect(fieldNames).toHaveLength(3);
  });

  it('fields are sorted alphabetically', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    for (const model of contract.models) {
      const names = model.fields.map((f) => f.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    }
  });

  it('captures nullability and defaults', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const post = contract.models.find((m) => m.name === 'Post')!;

    const published = post.fields.find((f) => f.name === 'published')!;
    expect(published.isNullable).toBe(false);
    expect(published.hasDefault).toBe(true);

    const content = post.fields.find((f) => f.name === 'content')!;
    expect(content.isNullable).toBe(true);
    expect(content.hasDefault).toBe(false);
  });

  it('normalizes PostgreSQL types to canonical names', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const post = contract.models.find((m) => m.name === 'Post')!;

    const id = post.fields.find((f) => f.name === 'id')!;
    expect(id.type).toBe('Int');

    const title = post.fields.find((f) => f.name === 'title')!;
    expect(title.type).toBe('String');

    const published = post.fields.find((f) => f.name === 'published')!;
    expect(published.type).toBe('Boolean');
  });

  it('defaults referential action to NoAction', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const post = contract.models.find((m) => m.name === 'Post')!;
    expect(post.foreignKeys[0]!.onDelete).toBe('NoAction');
    expect(post.foreignKeys[0]!.onUpdate).toBe('NoAction');
  });

  it('throws on malformed SQL', () => {
    expect(() => {
      parseSqlSchema(resolve(FIXTURES_DIR, 'malformed.sql'));
    }).toThrow();
  });
});

describe('parseSqlString — referential actions', () => {
  it('parses explicit ON DELETE CASCADE and ON UPDATE RESTRICT', () => {
    const contract = parseSqlString(`
      CREATE TABLE "Parent" (id SERIAL PRIMARY KEY);
      CREATE TABLE "Child" (
        id SERIAL PRIMARY KEY,
        "parentId" INT NOT NULL,
        CONSTRAINT fk_parent FOREIGN KEY ("parentId")
          REFERENCES "Parent"(id) ON DELETE CASCADE ON UPDATE RESTRICT
      );
    `);
    const child = contract.models.find((m) => m.name === 'Child')!;
    expect(child.foreignKeys[0]!.onDelete).toBe('Cascade');
    expect(child.foreignKeys[0]!.onUpdate).toBe('Restrict');
  });

  it('parses ON DELETE SET NULL and ON UPDATE SET DEFAULT', () => {
    const contract = parseSqlString(`
      CREATE TABLE "Parent" (id SERIAL PRIMARY KEY);
      CREATE TABLE "Child" (
        id SERIAL PRIMARY KEY,
        "parentId" INT,
        CONSTRAINT fk_parent FOREIGN KEY ("parentId")
          REFERENCES "Parent"(id) ON DELETE SET NULL ON UPDATE SET DEFAULT
      );
    `);
    const child = contract.models.find((m) => m.name === 'Child')!;
    expect(child.foreignKeys[0]!.onDelete).toBe('SetNull');
    expect(child.foreignKeys[0]!.onUpdate).toBe('SetDefault');
  });

  it('parses ON DELETE NO ACTION explicitly', () => {
    const contract = parseSqlString(`
      CREATE TABLE "Parent" (id SERIAL PRIMARY KEY);
      CREATE TABLE "Child" (
        id SERIAL PRIMARY KEY,
        "parentId" INT NOT NULL,
        CONSTRAINT fk_parent FOREIGN KEY ("parentId")
          REFERENCES "Parent"(id) ON DELETE NO ACTION ON UPDATE NO ACTION
      );
    `);
    const child = contract.models.find((m) => m.name === 'Child')!;
    expect(child.foreignKeys[0]!.onDelete).toBe('NoAction');
    expect(child.foreignKeys[0]!.onUpdate).toBe('NoAction');
  });

  it('defaults to NoAction when ON clauses are omitted', () => {
    const contract = parseSqlString(`
      CREATE TABLE "Parent" (id SERIAL PRIMARY KEY);
      CREATE TABLE "Child" (
        id SERIAL PRIMARY KEY,
        "parentId" INT NOT NULL,
        CONSTRAINT fk_parent FOREIGN KEY ("parentId") REFERENCES "Parent"(id)
      );
    `);
    const child = contract.models.find((m) => m.name === 'Child')!;
    expect(child.foreignKeys[0]!.onDelete).toBe('NoAction');
    expect(child.foreignKeys[0]!.onUpdate).toBe('NoAction');
  });
});

describe('parseSqlString — CREATE UNIQUE INDEX', () => {
  it('treats CREATE UNIQUE INDEX as UniqueConstraint, not IndexConstraint', () => {
    const contract = parseSqlString(`
      CREATE TABLE "User" (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_user_email ON "User" (email);
    `);
    const user = contract.models.find((m) => m.name === 'User')!;
    expect(user.uniqueConstraints).toEqual([
      { name: 'idx_user_email', fields: ['email'], isComposite: false },
    ]);
    expect(user.indexes).toEqual([]);
  });

  it('handles composite CREATE UNIQUE INDEX', () => {
    const contract = parseSqlString(`
      CREATE TABLE "Event" (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        year INT NOT NULL
      );
      CREATE UNIQUE INDEX idx_event_slug_year ON "Event" (slug, year);
    `);
    const event = contract.models.find((m) => m.name === 'Event')!;
    expect(event.uniqueConstraints).toEqual([
      { name: 'idx_event_slug_year', fields: ['slug', 'year'], isComposite: true },
    ]);
  });

  it('keeps regular CREATE INDEX as IndexConstraint', () => {
    const contract = parseSqlString(`
      CREATE TABLE "Post" (
        id SERIAL PRIMARY KEY,
        "authorId" INT NOT NULL
      );
      CREATE INDEX idx_post_author ON "Post" ("authorId");
    `);
    const post = contract.models.find((m) => m.name === 'Post')!;
    expect(post.indexes).toEqual([
      { name: 'idx_post_author', fields: ['authorId'] },
    ]);
    expect(post.uniqueConstraints).toEqual([]);
  });
});

describe('parseSqlString — type normalization', () => {
  it('normalizes string types', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        id SERIAL PRIMARY KEY,
        a TEXT NOT NULL,
        b VARCHAR(255) NOT NULL,
        c CHAR(10) NOT NULL,
        d UUID NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;
    expect(t.fields.find((f) => f.name === 'a')!.type).toBe('String');
    expect(t.fields.find((f) => f.name === 'b')!.type).toBe('String');
    expect(t.fields.find((f) => f.name === 'c')!.type).toBe('String');
    expect(t.fields.find((f) => f.name === 'd')!.type).toBe('String');
  });

  it('normalizes JSON types', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        id SERIAL PRIMARY KEY,
        a JSON NOT NULL,
        b JSONB NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;
    expect(t.fields.find((f) => f.name === 'a')!.type).toBe('Json');
    expect(t.fields.find((f) => f.name === 'b')!.type).toBe('Json');
  });

  it('normalizes DateTime types', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        id SERIAL PRIMARY KEY,
        a TIMESTAMP NOT NULL,
        b TIMESTAMPTZ NOT NULL,
        c DATE NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;
    expect(t.fields.find((f) => f.name === 'a')!.type).toBe('DateTime');
    expect(t.fields.find((f) => f.name === 'b')!.type).toBe('DateTime');
    expect(t.fields.find((f) => f.name === 'c')!.type).toBe('DateTime');
  });

  it('normalizes numeric types', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        id SERIAL PRIMARY KEY,
        a INT NOT NULL,
        b BIGINT NOT NULL,
        c FLOAT NOT NULL,
        d REAL NOT NULL,
        e DECIMAL(10,2) NOT NULL,
        f NUMERIC(5) NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;
    expect(t.fields.find((f) => f.name === 'a')!.type).toBe('Int');
    expect(t.fields.find((f) => f.name === 'b')!.type).toBe('BigInt');
    expect(t.fields.find((f) => f.name === 'c')!.type).toBe('Float');
    expect(t.fields.find((f) => f.name === 'd')!.type).toBe('Float');
    expect(t.fields.find((f) => f.name === 'e')!.type).toBe('Decimal');
    expect(t.fields.find((f) => f.name === 'f')!.type).toBe('Decimal');
  });

  it('normalizes BOOLEAN and BYTEA', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        id SERIAL PRIMARY KEY,
        a BOOLEAN NOT NULL,
        b BYTEA NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;
    expect(t.fields.find((f) => f.name === 'a')!.type).toBe('Boolean');
    expect(t.fields.find((f) => f.name === 'b')!.type).toBe('Bytes');
  });

  it('treats SERIAL variants as Int/BigInt with hasDefault', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        a SERIAL PRIMARY KEY,
        b BIGSERIAL NOT NULL,
        c SMALLSERIAL NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;

    const fieldA = t.fields.find((f) => f.name === 'a')!;
    expect(fieldA.type).toBe('Int');
    expect(fieldA.hasDefault).toBe(true);
    expect(fieldA.isNullable).toBe(false);

    const fieldB = t.fields.find((f) => f.name === 'b')!;
    expect(fieldB.type).toBe('BigInt');
    expect(fieldB.hasDefault).toBe(true);

    const fieldC = t.fields.find((f) => f.name === 'c')!;
    expect(fieldC.type).toBe('Int');
    expect(fieldC.hasDefault).toBe(true);
  });

  it('preserves unknown types as-is', () => {
    const contract = parseSqlString(`
      CREATE TABLE "T" (
        id SERIAL PRIMARY KEY,
        a INET NOT NULL
      );
    `);
    const t = contract.models.find((m) => m.name === 'T')!;
    expect(t.fields.find((f) => f.name === 'a')!.type).toBe('INET');
  });
});
