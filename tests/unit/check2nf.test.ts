import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSchema } from '../../src/core/prismaSchema/parse.js';
import { extractContract } from '../../src/core/prismaSchema/contract.js';
import { inferFunctionalDependencies } from '../../src/core/analysis/inferFds.js';
import { check2nf } from '../../src/core/analysis/normalizeChecks/check2nf.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/schemas');

describe('check2nf', () => {
  it('detects join tables with extra attributes', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, '2nf-violations.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const findings = check2nf(contract, fds);

    const joinFindings = findings.filter(
      (f) => f.rule === 'NF2_JOIN_TABLE_DUPLICATED_ATTR_SUSPECTED',
    );
    expect(joinFindings.length).toBeGreaterThanOrEqual(1);

    const enrollmentFinding = joinFindings.find((f) => f.model === 'Enrollment');
    expect(enrollmentFinding).toBeDefined();
    expect(enrollmentFinding!.message).toContain('grade');
    expect(enrollmentFinding!.message).toContain('enrolledAt');
  });

  it('detects partial dependency suspects in composite-key models', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, '2nf-violations.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const findings = check2nf(contract, fds);

    const partialFindings = findings.filter(
      (f) => f.rule === 'NF2_PARTIAL_DEPENDENCY_SUSPECTED',
    );
    // Should find partial dependency suspects for both Enrollment and ProjectAssignment
    expect(partialFindings.length).toBeGreaterThanOrEqual(1);
    const models = new Set(partialFindings.map((f) => f.model));
    expect(models.has('Enrollment')).toBe(true);
    expect(models.has('ProjectAssignment')).toBe(true);

    // Findings are per FK-subset at model level, not per field
    for (const f of partialFindings) {
      expect(f.field).toBeNull();
    }
  });

  it('all findings have correct normalForm', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, '2nf-violations.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const findings = check2nf(contract, fds);

    for (const f of findings) {
      expect(f.normalForm).toBe('2NF');
      expect(f.severity).toBe('warning');
    }
  });

  it('produces no findings for a schema without composite keys', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'basic.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const findings = check2nf(contract, fds);
    expect(findings).toHaveLength(0);
  });

  it('produces no findings for a clean join table (no extra attrs)', async () => {
    const parsed = await parseSchema(resolve(FIXTURES_DIR, 'composite.prisma'));
    const contract = extractContract(parsed);
    const fds = inferFunctionalDependencies(contract);
    const findings = check2nf(contract, fds);

    // PostTag has only postId + tagId (both PK + FK), no extra fields
    const joinFindings = findings.filter(
      (f) => f.rule === 'NF2_JOIN_TABLE_DUPLICATED_ATTR_SUSPECTED',
    );
    expect(joinFindings).toHaveLength(0);
  });
});
