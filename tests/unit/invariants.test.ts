import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  parseInvariantsFile,
  invariantsToFds,
  validateInvariantsAgainstContract,
} from '../../src/core/invariants/parse.js';
import { suppressArraySchema } from '../../src/core/invariants/schema.js';
import type { ConstraintContract } from '../../src/core/report/reportTypes.js';
import type { InvariantsFile } from '../../src/core/invariants/schema.js';

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures/invariants');

describe('parseInvariantsFile', () => {
  it('parses a valid invariants file', () => {
    const { invariants } = parseInvariantsFile(resolve(FIXTURES_DIR, '3nf-invariants.json'));

    expect(invariants).toHaveProperty('Employee');
    expect(invariants.Employee?.functionalDependencies).toHaveLength(1);
    expect(invariants.Employee?.functionalDependencies?.[0]?.determinant).toEqual([
      'departmentId',
    ]);
    expect(invariants.Employee?.functionalDependencies?.[0]?.dependent).toEqual([
      'deptName',
      'deptLocation',
    ]);
  });

  it('parses a valid invariants file with notes', () => {
    const { invariants } = parseInvariantsFile(resolve(FIXTURES_DIR, 'with-notes.json'));

    expect(invariants).toHaveProperty('Employee');
    const fd = invariants.Employee?.functionalDependencies?.[0];
    expect(fd?.note).toBe('Department info is denormalized onto the employee row');
  });

  it('parses without note (backward compat)', () => {
    const { invariants } = parseInvariantsFile(resolve(FIXTURES_DIR, '3nf-invariants.json'));

    const fd = invariants.Employee?.functionalDependencies?.[0];
    expect(fd?.note).toBeUndefined();
  });

  it('throws on malformed JSON', () => {
    expect(() => {
      parseInvariantsFile(resolve(FIXTURES_DIR, 'malformed.json'));
    }).toThrow();
  });

  it('throws on invalid structure (empty determinant)', () => {
    expect(() => {
      parseInvariantsFile(resolve(FIXTURES_DIR, 'invalid-structure.json'));
    }).toThrow();
  });

  it('converts invariants to FDs', () => {
    const { invariants } = parseInvariantsFile(resolve(FIXTURES_DIR, '3nf-invariants.json'));
    const fds = invariantsToFds(invariants);

    expect(fds).toHaveLength(1);
    expect(fds[0]?.model).toBe('Employee');
    expect(fds[0]?.source).toBe('invariant');
    expect(fds[0]?.determinant).toEqual(['departmentId']);
    expect(fds[0]?.dependent).toEqual(['deptName', 'deptLocation']);
  });

  it('handles multiple models and FDs', () => {
    const { invariants } = parseInvariantsFile(resolve(FIXTURES_DIR, 'basic-invariants.json'));
    const fds = invariantsToFds(invariants);

    expect(fds).toHaveLength(1);
    expect(fds[0]?.model).toBe('User');
  });

  it('returns empty suppress array for files without suppress key', () => {
    const { suppress } = parseInvariantsFile(resolve(FIXTURES_DIR, '3nf-invariants.json'));
    expect(suppress).toEqual([]);
  });

  it('parses suppress array from invariants file', () => {
    const { invariants, suppress } = parseInvariantsFile(resolve(FIXTURES_DIR, 'with-suppress.json'));
    expect(suppress).toEqual(['NF3_VIOLATION:Employee']);
    expect(invariants).toHaveProperty('Employee');
  });

  it('throws on invalid suppress entry format', () => {
    expect(() => {
      suppressArraySchema.parse(['invalid-format']);
    }).toThrow();
  });

  it('validates correct suppress entry formats', () => {
    expect(() => {
      suppressArraySchema.parse(['NF3_VIOLATION:Employee', 'FK_MISSING_INDEX:Post.authorId']);
    }).not.toThrow();
  });
});

describe('validateInvariantsAgainstContract', () => {
  const userContract: ConstraintContract = {
    models: [{
      name: 'User',
      fields: [
        { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
        { name: 'email', type: 'String', isNullable: false, hasDefault: false, isList: false },
        { name: 'name', type: 'String', isNullable: true, hasDefault: false, isList: false },
      ],
      primaryKey: { fields: ['id'], isComposite: false },
      uniqueConstraints: [{ name: null, fields: ['email'], isComposite: false }],
      indexes: [],
      foreignKeys: [],
    }],
  };

  it('reports unknown model in invariants', () => {
    const invariants: InvariantsFile = {
      NonExistentModel: {
        functionalDependencies: [
          { determinant: ['a'], dependent: ['b'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, { models: [] });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('INVARIANT_UNKNOWN_MODEL');
    expect(findings[0]!.model).toBe('NonExistentModel');
  });

  it('reports unknown fields in invariants', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['nonExistent'], dependent: ['alsoFake'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.rule === 'INVARIANT_UNKNOWN_FIELD')).toBe(true);
    const fields = findings.map((f) => f.field);
    expect(fields).toContain('nonExistent');
    expect(fields).toContain('alsoFake');
  });

  it('does not report for valid invariants', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['email'], dependent: ['name'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    expect(findings).toHaveLength(0);
  });

  it('includes fix string on unknown model finding', () => {
    const invariants: InvariantsFile = {
      NonExistentModel: {
        functionalDependencies: [
          { determinant: ['a'], dependent: ['b'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, { models: [] });
    expect(findings[0]!.fix).toBe("Update the invariants file to remove or rename model 'NonExistentModel'.");
  });

  it('includes fix string on unknown field finding', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['nonExistent'], dependent: ['email'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    const fieldFinding = findings.find((f) => f.field === 'nonExistent');
    expect(fieldFinding!.fix).toBe("Update the invariants file to remove or rename field 'nonExistent' in model 'User'.");
  });

  it('deduplicates fields appearing in both determinant and dependent', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['ghost'], dependent: ['ghost'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    // 'ghost' appears in both determinant and dependent but should only produce one finding
    expect(findings).toHaveLength(1);
    expect(findings[0]!.field).toBe('ghost');
  });

  it('does not flag determinant matching unique constraint', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['email'], dependent: ['name'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    const enforced = findings.filter((f) => f.rule === 'INVARIANT_DETERMINANT_NOT_ENFORCED');
    expect(enforced).toHaveLength(0);
  });

  it('does not flag determinant matching PK', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['id'], dependent: ['name'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    const enforced = findings.filter((f) => f.rule === 'INVARIANT_DETERMINANT_NOT_ENFORCED');
    expect(enforced).toHaveLength(0);
  });

  it('flags determinant NOT matching any constraint', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['name'], dependent: ['email'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    const enforced = findings.filter((f) => f.rule === 'INVARIANT_DETERMINANT_NOT_ENFORCED');
    expect(enforced).toHaveLength(1);
    expect(enforced[0]!.model).toBe('User');
    expect(enforced[0]!.severity).toBe('warning');
    expect(enforced[0]!.normalForm).toBe('SCHEMA');
    expect(enforced[0]!.fix).toContain('@@unique');
  });

  it('does not flag determinant that is superset of unique (subset enforces it)', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['email', 'name'], dependent: ['id'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    const enforced = findings.filter((f) => f.rule === 'INVARIANT_DETERMINANT_NOT_ENFORCED');
    expect(enforced).toHaveLength(0);
  });

  it('skips enforcement check when determinant has unknown fields', () => {
    const invariants: InvariantsFile = {
      User: {
        functionalDependencies: [
          { determinant: ['nonExistent'], dependent: ['email'] },
        ],
      },
    };
    const findings = validateInvariantsAgainstContract(invariants, userContract);
    const enforced = findings.filter((f) => f.rule === 'INVARIANT_DETERMINANT_NOT_ENFORCED');
    expect(enforced).toHaveLength(0);
    // But should still have INVARIANT_UNKNOWN_FIELD
    expect(findings.some((f) => f.rule === 'INVARIANT_UNKNOWN_FIELD')).toBe(true);
  });
});
