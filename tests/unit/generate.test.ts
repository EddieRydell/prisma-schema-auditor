import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSchema } from '../../src/core/prismaSchema/parse.js';
import { extractContract } from '../../src/core/prismaSchema/contract.js';
import { inferFunctionalDependencies } from '../../src/core/analysis/inferFds.js';
import { generateInvariantsFile } from '../../src/core/invariants/generate.js';
import { invariantsFileSchema } from '../../src/core/invariants/schema.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('generateInvariantsFile', () => {
  it('generates invariants with PK and unique FDs from basic schema', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const result = generateInvariantsFile(contract, fds);

    // basic.prisma has User (PK id, unique email) and Post (PK id)
    expect(result).toHaveProperty('User');
    expect(result).toHaveProperty('Post');

    // User should have PK FD and unique FD
    const userFds = result.User!.functionalDependencies!;
    expect(userFds.length).toBe(2);

    // PK FD
    const pkFd = userFds.find((fd) => fd.note === 'Primary key determines all fields');
    expect(pkFd).toBeDefined();
    expect(pkFd!.determinant).toEqual(['id']);

    // Unique FD
    const uniqueFd = userFds.find((fd) => fd.note?.includes('Unique constraint') === true);
    expect(uniqueFd).toBeDefined();
    expect(uniqueFd!.determinant).toEqual(['email']);
  });

  it('excludes FK FDs (no dotted dependents)', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const result = generateInvariantsFile(contract, fds);

    // No FD should have dotted dependents (FK pattern)
    for (const [_model, modelInvariants] of Object.entries(result)) {
      for (const fd of modelInvariants.functionalDependencies ?? []) {
        for (const dep of fd.dependent) {
          expect(dep).not.toContain('.');
        }
      }
    }
  });

  it('produces deterministic sorted output', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);

    const result1 = generateInvariantsFile(contract, fds);
    const result2 = generateInvariantsFile(contract, fds);

    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));

    // Model keys should be alphabetically sorted
    const modelNames = Object.keys(result1);
    expect(modelNames).toEqual([...modelNames].sort());
  });

  it('handles composite keys (PostTag with no non-PK fields is skipped)', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'composite.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const result = generateInvariantsFile(contract, fds);

    // PostTag has composite PK [postId, tagId] but no non-PK fields,
    // so no PK FD is generated (dependent would be empty)
    if (result.PostTag !== undefined) {
      // If present, it should only have unique FDs, not PK ones
      const pkFds = result.PostTag.functionalDependencies?.filter(
        (fd) => fd.note?.includes('primary key') === true || fd.note?.includes('Primary key') === true,
      );
      expect(pkFds ?? []).toHaveLength(0);
    }
  });

  it('generated output validates against invariants Zod schema', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const result = generateInvariantsFile(contract, fds);

    // Should not throw
    const validated = invariantsFileSchema.parse(result);
    expect(validated).toEqual(result);
  });
});
