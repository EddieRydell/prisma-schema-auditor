import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSqlSchema } from '../../src/core/sqlSchema/parse.js';
import { inferFunctionalDependencies } from '../../src/core/analysis/inferFds.js';
import { check3nf } from '../../src/core/analysis/normalizeChecks/check3nf.js';
import { parseInvariantsFile, invariantsToFds } from '../../src/core/invariants/parse.js';

const SCHEMAS_DIR = resolve(import.meta.dirname, '../fixtures/schemas');
const INVARIANTS_DIR = resolve(import.meta.dirname, '../fixtures/invariants');

describe('check3nf', () => {
  it('detects 3NF violation with invariant-declared transitive dependency', () => {
    const contract = parseSqlSchema(resolve(SCHEMAS_DIR, '3nf-violations.sql'));
    const schemaFds = inferFunctionalDependencies(contract);

    const { invariants } = parseInvariantsFile(resolve(INVARIANTS_DIR, '3nf-invariants.json'));
    const invariantFds = invariantsToFds(invariants);
    const allFds = [...schemaFds, ...invariantFds];

    const findings = check3nf(contract, allFds);

    const nf3Findings = findings.filter((f) => f.rule === 'NF3_VIOLATION');
    expect(nf3Findings.length).toBeGreaterThanOrEqual(1);

    // departmentId → deptName, deptLocation are transitive deps
    const deptNameFinding = nf3Findings.find(
      (f) => f.model === 'Employee' && f.field === 'deptName',
    );
    expect(deptNameFinding).toBeDefined();
    expect(deptNameFinding!.severity).toBe('error');
    expect(deptNameFinding!.normalForm).toBe('3NF');

    const deptLocationFinding = nf3Findings.find(
      (f) => f.model === 'Employee' && f.field === 'deptLocation',
    );
    expect(deptLocationFinding).toBeDefined();
  });

  it('produces no 3NF findings without invariants', () => {
    const contract = parseSqlSchema(resolve(SCHEMAS_DIR, '3nf-violations.sql'));
    const fds = inferFunctionalDependencies(contract);

    // Without invariants, the transitive dependency isn't known
    // FK FDs reference external model fields, which are filtered out
    const findings = check3nf(contract, fds);
    const nf3Findings = findings.filter((f) => f.rule === 'NF3_VIOLATION');
    expect(nf3Findings).toHaveLength(0);
  });

  it('produces no findings for a clean schema with trivial invariants', () => {
    const contract = parseSqlSchema(resolve(SCHEMAS_DIR, 'basic.sql'));
    const schemaFds = inferFunctionalDependencies(contract);

    // email → name is already covered by email being a unique key
    const { invariants } = parseInvariantsFile(resolve(INVARIANTS_DIR, 'basic-invariants.json'));
    const invariantFds = invariantsToFds(invariants);
    const allFds = [...schemaFds, ...invariantFds];

    const findings = check3nf(contract, allFds);
    // email is a candidate key (unique), so email → name is fine for 3NF
    const nf3Findings = findings.filter((f) => f.rule === 'NF3_VIOLATION');
    expect(nf3Findings).toHaveLength(0);
  });

  it('all findings have non-null fix suggestions', () => {
    const contract = parseSqlSchema(resolve(SCHEMAS_DIR, '3nf-violations.sql'));
    const schemaFds = inferFunctionalDependencies(contract);

    const { invariants } = parseInvariantsFile(resolve(INVARIANTS_DIR, '3nf-invariants.json'));
    const invariantFds = invariantsToFds(invariants);
    const allFds = [...schemaFds, ...invariantFds];

    const findings = check3nf(contract, allFds);

    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.fix).not.toBeNull();
      expect(typeof f.fix).toBe('string');
    }
  });

  it('correctly classifies BCNF vs 3NF violations', () => {
    const contract = parseSqlSchema(resolve(SCHEMAS_DIR, '3nf-violations.sql'));
    const schemaFds = inferFunctionalDependencies(contract);

    const { invariants } = parseInvariantsFile(resolve(INVARIANTS_DIR, '3nf-invariants.json'));
    const invariantFds = invariantsToFds(invariants);
    const allFds = [...schemaFds, ...invariantFds];

    const findings = check3nf(contract, allFds);

    // All findings should be properly classified
    for (const f of findings) {
      if (f.rule === 'NF3_VIOLATION') {
        expect(f.normalForm).toBe('3NF');
        expect(f.severity).toBe('error');
      } else if (f.rule === 'BCNF_VIOLATION') {
        expect(f.normalForm).toBe('BCNF');
        expect(f.severity).toBe('info');
      }
    }
  });
});
