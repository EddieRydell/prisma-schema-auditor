import type { ConstraintContract } from '../report/reportTypes.js';
import type { FunctionalDependency } from '../analysis/inferFds.js';
import type { InvariantsFile } from './schema.js';

/**
 * Generate an invariants file from existing schema constraints.
 *
 * Includes only PK and unique FDs (not FK or invariant-sourced),
 * grouped by model with auto-generated notes.
 */
export function generateInvariantsFile(
  _contract: ConstraintContract,
  fds: readonly FunctionalDependency[],
): InvariantsFile {
  const eligibleFds = fds.filter((fd) => fd.source === 'pk' || fd.source === 'unique');

  // Group by model (sorted alphabetically)
  const byModel = new Map<string, FunctionalDependency[]>();
  for (const fd of eligibleFds) {
    const existing = byModel.get(fd.model);
    if (existing !== undefined) {
      existing.push(fd);
    } else {
      byModel.set(fd.model, [fd]);
    }
  }

  const modelNames = [...byModel.keys()].sort();
  const result: Record<string, { functionalDependencies: { determinant: string[]; dependent: string[]; note: string }[] }> = {};

  for (const modelName of modelNames) {
    const modelFds = byModel.get(modelName);
    if (modelFds === undefined) {
      continue;
    }
    const entries = modelFds.map((fd) => ({
      determinant: [...fd.determinant].sort(),
      dependent: [...fd.dependent].sort(),
      note: generateNote(fd),
    }));

    if (entries.length > 0) {
      result[modelName] = { functionalDependencies: entries };
    }
  }

  return result;
}

function generateNote(fd: FunctionalDependency): string {
  if (fd.source === 'pk') {
    if (fd.determinant.length > 1) {
      return `Composite primary key (${fd.determinant.join(', ')})`;
    }
    return 'Primary key determines all fields';
  }

  // source === 'unique'
  if (fd.determinant.length > 1) {
    return `Composite unique constraint on (${fd.determinant.join(', ')})`;
  }
  return `Unique constraint on (${fd.determinant.join(', ')})`;
}
