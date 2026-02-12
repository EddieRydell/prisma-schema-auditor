import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSqlSchema } from '../../src/core/sqlSchema/parse.js';
import { inferFunctionalDependencies } from '../../src/core/analysis/inferFds.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('inferFunctionalDependencies', () => {
  it('infers PK → all for each model', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const fds = inferFunctionalDependencies(contract);

    const userPkFd = fds.find((fd) => fd.model === 'User' && fd.source === 'pk');
    expect(userPkFd).toBeDefined();
    expect(userPkFd!.determinant).toEqual(['id']);
    expect(userPkFd!.dependent).toContain('email');
    expect(userPkFd!.dependent).toContain('name');
  });

  it('infers unique → all for unique constraints', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const fds = inferFunctionalDependencies(contract);

    const emailUniqueFd = fds.find(
      (fd) => fd.model === 'User' && fd.source === 'unique' && fd.determinant.includes('email'),
    );
    expect(emailUniqueFd).toBeDefined();
    expect(emailUniqueFd!.dependent).toContain('id');
    expect(emailUniqueFd!.dependent).toContain('name');
  });

  it('infers FK → referenced fields', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'basic.sql'));
    const fds = inferFunctionalDependencies(contract);

    const fkFd = fds.find((fd) => fd.model === 'Post' && fd.source === 'fk');
    expect(fkFd).toBeDefined();
    expect(fkFd!.determinant).toEqual(['authorId']);
    expect(fkFd!.dependent).toEqual(['User.id']);
  });

  it('handles composite keys in FD inference', () => {
    const contract = parseSqlSchema(resolve(FIXTURES_DIR, 'composite.sql'));
    const fds = inferFunctionalDependencies(contract);

    // PostTag has only postId + tagId (both PK fields), so no PK→all FD is generated
    // (no non-PK fields exist). But FK FDs should exist.
    const postTagPkFd = fds.find((fd) => fd.model === 'PostTag' && fd.source === 'pk');
    expect(postTagPkFd).toBeUndefined();

    const postTagFkFds = fds.filter((fd) => fd.model === 'PostTag' && fd.source === 'fk');
    expect(postTagFkFds).toHaveLength(2);

    // Post model should have a composite-determinant PK FD: [id] → [title]
    const postPkFd = fds.find((fd) => fd.model === 'Post' && fd.source === 'pk');
    expect(postPkFd).toBeDefined();
    expect(postPkFd!.determinant).toEqual(['id']);
    expect(postPkFd!.dependent).toContain('title');
  });
});
