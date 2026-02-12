import type { ConstraintContract, Finding } from '../../report/reportTypes.js';
import type { FunctionalDependency } from '../inferFds.js';
import { isSuperkey } from '../inferFds.js';
import { extractCandidateKeys } from '../computeKeys.js';

/**
 * Check for 3NF and BCNF violations using declared functional dependencies
 * (invariant-declared FDs only).
 *
 * 3NF violation: X → A where X is not a superkey AND A is not part of
 *   any candidate key (transitive dependency).
 *
 * BCNF violation: X → A where X is not a superkey (regardless of whether
 *   A is in a candidate key).
 *
 * Only invariant-sourced FDs are checked, since:
 * - PK/unique FDs are trivially satisfied by key constraints
 * - FK FDs are cross-model references, not intra-model dependencies
 */
export function check3nf(
  contract: ConstraintContract,
  fds: readonly FunctionalDependency[],
): readonly Finding[] {
  const findings: Finding[] = [];

  // Only check invariant-declared FDs (user-specified intra-model dependencies)
  const checkableFds = fds.filter((fd) => fd.source === 'invariant');

  // For superkey checks, only use intra-model FDs (exclude FK which are cross-model)
  const intraModelFds = fds.filter((fd) => fd.source !== 'fk');

  for (const fd of checkableFds) {
    const model = contract.models.find((m) => m.name === fd.model);
    if (model === undefined) {
      continue;
    }

    const allFields = model.fields.map((f) => f.name);

    // Skip if determinant is already a superkey (using only intra-model FDs)
    if (isSuperkey(fd.determinant, allFields, intraModelFds, fd.model)) {
      continue;
    }

    // Determinant is not a superkey - check each dependent attribute
    const candidateKeys = extractCandidateKeys(contract, fd.model);
    const candidateKeyFields = new Set(candidateKeys.flatMap((k) => [...k.fields]));

    for (const dep of fd.dependent) {
      // Skip self-determination (trivial FDs)
      if (fd.determinant.includes(dep)) {
        continue;
      }

      // Skip if the field doesn't exist in this model's contract
      if (!allFields.includes(dep)) {
        continue;
      }

      const det = fd.determinant.join(', ');
      if (candidateKeyFields.has(dep)) {
        // Dependent is in a candidate key - BCNF violation only (3NF is satisfied)
        findings.push({
          rule: 'BCNF_VIOLATION',
          severity: 'info',
          normalForm: 'BCNF',
          model: fd.model,
          field: dep,
          message: `FD {${det}} → {${dep}}: determinant is not a superkey. BCNF violation (${dep} is part of a candidate key, so 3NF is satisfied).`,
          fix: `Restructure so that (${det}) is a candidate key, or accept this BCNF violation if intended.`,
        });
      } else {
        // Dependent is not in any candidate key - 3NF violation (and BCNF)
        findings.push({
          rule: 'NF3_VIOLATION',
          severity: 'error',
          normalForm: '3NF',
          model: fd.model,
          field: dep,
          message: `FD {${det}} → {${dep}}: transitive dependency detected. "${dep}" depends on non-key attributes {${det}} rather than a candidate key.`,
          fix: `Move '${dep}' to the model keyed by (${det}), or add @@unique([${det}]) to enforce the dependency.`,
        });
      }
    }
  }

  return findings;
}
