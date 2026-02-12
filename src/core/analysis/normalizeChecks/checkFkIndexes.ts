import type { ConstraintContract, Finding } from '../../report/reportTypes.js';

/**
 * Check that foreign key fields are covered by a PK, unique constraint, or regular index prefix.
 *
 * A FK is "covered" if its fields are a leftmost prefix of any PK, unique constraint, or @@index.
 */
export function checkFkIndexes(contract: ConstraintContract): readonly Finding[] {
  const findings: Finding[] = [];

  for (const model of contract.models) {
    for (const fk of model.foreignKeys) {
      const fkFields = fk.fields;

      const isCovered = isFkCoveredByIndex(fkFields, model.primaryKey?.fields ?? null, model.uniqueConstraints, model.indexes);
      if (!isCovered) {
        findings.push({
          rule: 'FK_MISSING_INDEX',
          severity: 'info',
          normalForm: 'SCHEMA',
          model: model.name,
          field: fkFields.length === 1 ? (fkFields[0] ?? null) : null,
          message: `Foreign key (${fkFields.join(', ')}) on "${model.name}" referencing "${fk.referencedModel}" is not covered by any index, PK, or unique constraint prefix. Queries joining on this FK may be slow.`,
          fix: `Add @@index([${fkFields.join(', ')}]) to '${model.name}' for faster joins and cascade operations.`,
        });
      }
    }
  }

  return findings;
}

function isFkCoveredByIndex(
  fkFields: readonly string[],
  pkFields: readonly string[] | null,
  uniqueConstraints: readonly { readonly fields: readonly string[] }[],
  indexes: readonly { readonly fields: readonly string[] }[],
): boolean {
  const allFieldArrays: readonly (readonly string[])[] = [
    ...(pkFields !== null ? [pkFields] : []),
    ...uniqueConstraints.map((uq) => uq.fields),
    ...indexes.map((idx) => idx.fields),
  ];

  return allFieldArrays.some((constraintFields) =>
    isLeftmostPrefix(fkFields, constraintFields),
  );
}

/**
 * Check if fkFields is a leftmost prefix of constraintFields.
 * e.g. [a] is a prefix of [a, b], [a, b] is a prefix of [a, b, c], [a] is a prefix of [a].
 */
function isLeftmostPrefix(fkFields: readonly string[], constraintFields: readonly string[]): boolean {
  if (fkFields.length > constraintFields.length) {
    return false;
  }
  return fkFields.every((field, i) => constraintFields[i] === field);
}
