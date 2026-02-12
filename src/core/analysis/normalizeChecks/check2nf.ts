import type { ConstraintContract, Finding, ModelContract } from '../../report/reportTypes.js';
import type { FunctionalDependency } from '../inferFds.js';
import { extractCandidateKeys } from '../computeKeys.js';

/**
 * Check for 2NF violations (heuristic-based).
 *
 * Checks:
 * - NF2_PARTIAL_DEPENDENCY_SUSPECTED: Composite key models with fields that
 *   appear to depend on only part of the key (detected via FK relationships)
 * - NF2_JOIN_TABLE_DUPLICATED_ATTR_SUSPECTED: Join tables (composite PK with
 *   only FK fields) that carry extra non-key attributes
 */
export function check2nf(
  contract: ConstraintContract,
  fds: readonly FunctionalDependency[],
): readonly Finding[] {
  const findings: Finding[] = [];

  for (const model of contract.models) {
    const keys = extractCandidateKeys(contract, model.name);
    const compositePk = keys.find((k) => k.source === 'pk' && k.fields.length > 1);

    if (compositePk !== undefined) {
      checkPartialDependency(model, compositePk.fields, fds, findings);
      checkJoinTableDuplicatedAttr(model, compositePk.fields, findings);
    }
  }

  return findings;
}

/**
 * Detect possible partial dependencies in composite-key models.
 *
 * When FK fields form a proper subset of the composite PK, non-key attributes
 * may depend on only that subset rather than the full key — a 2NF violation.
 * One finding is emitted per FK subset (not per field) since without declared
 * invariants we cannot attribute specific fields to the subset.
 */
function checkPartialDependency(
  model: ModelContract,
  pkFields: readonly string[],
  fds: readonly FunctionalDependency[],
  findings: Finding[],
): void {
  const hasNonKeyFields = model.fields.some((f) => !pkFields.includes(f.name));
  if (!hasNonKeyFields) {
    return;
  }

  const fkFds = fds.filter((fd) => fd.model === model.name && fd.source === 'fk');

  for (const fkFd of fkFds) {
    const isProperSubset =
      fkFd.determinant.length < pkFields.length &&
      fkFd.determinant.every((f) => pkFields.includes(f));

    if (isProperSubset) {
      const subset = fkFd.determinant.join(', ');
      findings.push({
        rule: 'NF2_PARTIAL_DEPENDENCY_SUSPECTED',
        severity: 'warning',
        normalForm: '2NF',
        model: model.name,
        field: null,
        message: `Composite-key model "${model.name}" has FK fields (${subset}) that are a proper subset of the primary key. Non-key attributes may depend on this subset rather than the full key, which would violate 2NF.`,
        fix: `Extract fields that depend on (${subset}) into their own model.`,
      });
    }
  }
}

/**
 * Detect join tables with extra attributes. A join table has a composite PK
 * where all PK fields are also FK fields. Extra non-key attributes suggest
 * the table should be an entity with its own identity.
 */
function checkJoinTableDuplicatedAttr(
  model: ModelContract,
  pkFields: readonly string[],
  findings: Finding[],
): void {
  // Check if all PK fields are FK fields
  const fkFieldSets = model.foreignKeys.map((fk) => fk.fields).flat();
  const allPkFieldsAreFk = pkFields.every((f) => fkFieldSets.includes(f));

  if (!allPkFieldsAreFk) {
    return;
  }

  // Find non-key, non-FK fields
  const allFkFields = new Set(fkFieldSets);
  const extraFields = model.fields
    .map((f) => f.name)
    .filter((name) => !pkFields.includes(name) && !allFkFields.has(name));

  if (extraFields.length > 0) {
    findings.push({
      rule: 'NF2_JOIN_TABLE_DUPLICATED_ATTR_SUSPECTED',
      severity: 'warning',
      normalForm: '2NF',
      model: model.name,
      field: null,
      message: `Join table "${model.name}" has extra attributes [${extraFields.join(', ')}] beyond its composite key. Consider whether this should be a first-class entity.`,
      fix: `Add a dedicated @id to '${model.name}' and treat it as a first-class entity.`,
    });
  }
}
