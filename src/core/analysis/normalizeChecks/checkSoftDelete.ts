import type { ConstraintContract, Finding } from '../../report/reportTypes.js';

/**
 * Check for soft-delete consistency issues.
 *
 * For each model with a soft-delete field (deleted_at or deletedAt, DateTime type),
 * every unique constraint should include the soft-delete field. Otherwise, uniqueness
 * is not scoped to active records, and "deleted" rows can conflict with new ones.
 */
export function checkSoftDelete(contract: ConstraintContract): readonly Finding[] {
  const findings: Finding[] = [];

  for (const model of contract.models) {
    const softDeleteField = model.fields.find(
      (f) => (f.name === 'deleted_at' || f.name === 'deletedAt') && f.type === 'DateTime',
    );

    if (softDeleteField === undefined) {
      continue;
    }

    for (const uq of model.uniqueConstraints) {
      if (!uq.fields.includes(softDeleteField.name)) {
        const existingFields = uq.fields.join(', ');
        findings.push({
          rule: 'SOFTDELETE_MISSING_IN_UNIQUE',
          severity: 'warning',
          normalForm: 'SCHEMA',
          model: model.name,
          field: softDeleteField.name,
          message: `Unique constraint (${existingFields}) on "${model.name}" does not include soft-delete field "${softDeleteField.name}". Deleted rows may conflict with active records.`,
          fix: `Add '${softDeleteField.name}' to this unique constraint: @@unique([${existingFields}, ${softDeleteField.name}])`,
        });
      }
    }
  }

  return findings;
}
