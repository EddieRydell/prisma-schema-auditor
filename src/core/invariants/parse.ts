import { readFileSync } from 'node:fs';
import { invariantsFileSchema } from './schema.js';
import type { InvariantsFile } from './schema.js';
import type { FunctionalDependency } from '../analysis/inferFds.js';
import type { ConstraintContract, Finding } from '../report/reportTypes.js';

/**
 * Parse and validate an invariants JSON file.
 * Returns the validated invariants or throws on invalid input.
 */
export function parseInvariantsFile(filePath: string): InvariantsFile {
  const content = readFileSync(filePath, 'utf-8');
  const raw: unknown = JSON.parse(content);
  return invariantsFileSchema.parse(raw);
}

/**
 * Convert parsed invariants into FunctionalDependency objects.
 */
export function invariantsToFds(invariants: InvariantsFile): readonly FunctionalDependency[] {
  const fds: FunctionalDependency[] = [];

  for (const [modelName, modelInvariants] of Object.entries(invariants)) {
    if (modelInvariants.functionalDependencies !== undefined) {
      for (const fd of modelInvariants.functionalDependencies) {
        fds.push({
          determinant: fd.determinant,
          dependent: fd.dependent,
          model: modelName,
          source: 'invariant',
        });
      }
    }
  }

  return fds;
}

/**
 * Validate that invariant-declared models and fields actually exist in the
 * constraint contract. Returns findings for any references that don't match,
 * so users get immediate feedback when their invariants file is stale or wrong.
 */
export function validateInvariantsAgainstContract(
  invariants: InvariantsFile,
  contract: ConstraintContract,
): readonly Finding[] {
  const findings: Finding[] = [];
  const modelMap = new Map(contract.models.map((m) => [m.name, m]));

  for (const [modelName, modelInvariants] of Object.entries(invariants)) {
    const model = modelMap.get(modelName);
    if (model === undefined) {
      findings.push({
        rule: 'INVARIANT_UNKNOWN_MODEL',
        severity: 'warning',
        normalForm: '3NF',
        model: modelName,
        field: null,
        message: `Invariants reference model "${modelName}" which does not exist in the schema.`,
        fix: `Update the invariants file to remove or rename model '${modelName}'.`,
      });
      continue;
    }

    const fieldNames = new Set(model.fields.map((f) => f.name));
    if (modelInvariants.functionalDependencies !== undefined) {
      for (const fd of modelInvariants.functionalDependencies) {
        const allReferencedFields = new Set([...fd.determinant, ...fd.dependent]);
        for (const field of allReferencedFields) {
          if (!fieldNames.has(field)) {
            findings.push({
              rule: 'INVARIANT_UNKNOWN_FIELD',
              severity: 'warning',
              normalForm: '3NF',
              model: modelName,
              field,
              message: `Invariants reference field "${field}" which does not exist in model "${modelName}".`,
              fix: `Update the invariants file to remove or rename field '${field}' in model '${modelName}'.`,
            });
          }
        }
      }
    }
  }

  return findings;
}
