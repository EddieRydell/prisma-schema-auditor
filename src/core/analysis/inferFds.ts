import type { ConstraintContract, ModelContract } from '../report/reportTypes.js';

/** A functional dependency: determinant → dependent fields. */
export interface FunctionalDependency {
  readonly determinant: readonly string[];
  readonly dependent: readonly string[];
  readonly model: string;
  readonly source: 'pk' | 'unique' | 'fk' | 'invariant';
}

/**
 * Infer functional dependencies from the constraint contract.
 *
 * Rules:
 * - PK → all non-PK fields (full functional dependency)
 * - Unique → all non-key fields (candidate key dependency)
 * - FK fields → referenced PK fields (referential dependency)
 */
export function inferFunctionalDependencies(
  contract: ConstraintContract,
): readonly FunctionalDependency[] {
  const fds: FunctionalDependency[] = [];

  for (const model of contract.models) {
    const allFieldNames = model.fields.map((f) => f.name);

    // PK → all other fields
    if (model.primaryKey !== null) {
      const pkFields = model.primaryKey.fields;
      const dependent = allFieldNames.filter((f) => !pkFields.includes(f));
      if (dependent.length > 0) {
        fds.push({
          determinant: pkFields,
          dependent,
          model: model.name,
          source: 'pk',
        });
      }
    }

    // Unique → all other fields
    addUniqueFds(model, allFieldNames, fds);

    // FK → referenced fields (namespaced to prevent collision with local fields)
    for (const fk of model.foreignKeys) {
      fds.push({
        determinant: fk.fields,
        dependent: fk.referencedFields.map((f) => `${fk.referencedModel}.${f}`),
        model: model.name,
        source: 'fk',
      });
    }
  }

  return fds;
}

function addUniqueFds(
  model: ModelContract,
  allFieldNames: string[],
  fds: FunctionalDependency[],
): void {
  for (const uq of model.uniqueConstraints) {
    const dependent = allFieldNames.filter((f) => !uq.fields.includes(f));
    if (dependent.length > 0) {
      fds.push({
        determinant: uq.fields,
        dependent,
        model: model.name,
        source: 'unique',
      });
    }
  }
}

/**
 * Compute the attribute closure of a set of attributes under given FDs.
 * Uses Armstrong's axioms (reflexivity, augmentation, transitivity).
 *
 * Given attributes X and a set of FDs, returns X+ (all attributes
 * functionally determined by X).
 */
export function attributeClosure(
  attributes: readonly string[],
  fds: readonly FunctionalDependency[],
  modelName: string,
): ReadonlySet<string> {
  const closure = new Set(attributes);
  const modelFds = fds.filter((fd) => fd.model === modelName);

  let changed = true;
  while (changed) {
    changed = false;
    for (const fd of modelFds) {
      if (fd.determinant.every((attr) => closure.has(attr))) {
        for (const dep of fd.dependent) {
          if (!closure.has(dep)) {
            closure.add(dep);
            changed = true;
          }
        }
      }
    }
  }

  return closure;
}

/**
 * Check if a set of attributes is a superkey for a model.
 * A superkey determines all attributes in the model.
 */
export function isSuperkey(
  attributes: readonly string[],
  allFields: readonly string[],
  fds: readonly FunctionalDependency[],
  modelName: string,
): boolean {
  const closure = attributeClosure(attributes, fds, modelName);
  return allFields.every((f) => closure.has(f));
}
