import type { AuditField, AuditModel, ParseResult } from './types.js';
import type {
  ConstraintContract,
  FieldContract,
  ForeignKeyConstraint,
  IndexConstraint,
  ModelContract,
  PrimaryKeyConstraint,
  ReferentialAction,
  UniqueConstraint,
} from '../report/reportTypes.js';
import { sortBy } from '../../util/index.js';

const DEFAULT_ON_DELETE: ReferentialAction = 'Cascade';
const DEFAULT_ON_UPDATE: ReferentialAction = 'Cascade';

const VALID_REFERENTIAL_ACTIONS = new Set<string>([
  'Cascade',
  'Restrict',
  'NoAction',
  'SetNull',
  'SetDefault',
]);

function toReferentialAction(value: string | null, fallback: ReferentialAction): ReferentialAction {
  if (value !== null && VALID_REFERENTIAL_ACTIONS.has(value)) {
    return value as ReferentialAction;
  }
  return fallback;
}

/**
 * Extract a deterministic constraint contract from parsed schema models.
 * Produces sorted, stable output for diffing.
 */
export function extractContract(parsed: ParseResult): ConstraintContract {
  const models = sortBy([...parsed.models], (m) => m.name).map(extractModelContract);
  return { models };
}

function extractModelContract(model: AuditModel): ModelContract {
  const scalarFields = model.fields.filter((f) => f.kind !== 'object');
  const fields = sortBy([...scalarFields], (f) => f.name).map(extractFieldContract);
  const primaryKey = extractPrimaryKey(model);
  const uniqueConstraints = extractUniqueConstraints(model);
  const indexes = extractIndexes(model);
  const foreignKeys = extractForeignKeys(model);

  return {
    name: model.name,
    fields,
    primaryKey,
    uniqueConstraints,
    indexes,
    foreignKeys,
  };
}

function extractFieldContract(field: AuditField): FieldContract {
  return {
    name: field.name,
    type: field.type,
    isNullable: !field.isRequired,
    hasDefault: field.hasDefaultValue,
    isList: field.isList,
  };
}

function extractPrimaryKey(model: AuditModel): PrimaryKeyConstraint | null {
  // Composite @@id() takes precedence
  if (model.primaryKey !== null) {
    return {
      fields: [...model.primaryKey.fields],
      isComposite: model.primaryKey.fields.length > 1,
    };
  }

  // Single-field @id
  const idField = model.fields.find((f) => f.isId);
  if (idField !== undefined) {
    return {
      fields: [idField.name],
      isComposite: false,
    };
  }

  return null;
}

function extractUniqueConstraints(model: AuditModel): readonly UniqueConstraint[] {
  const constraints: UniqueConstraint[] = [];

  // Single-field @unique
  for (const field of model.fields) {
    if (field.isUnique && field.kind !== 'object') {
      constraints.push({
        name: null,
        fields: [field.name],
        isComposite: false,
      });
    }
  }

  // Composite @@unique()
  for (const idx of model.uniqueIndexes) {
    constraints.push({
      name: idx.name,
      fields: [...idx.fields],
      isComposite: idx.fields.length > 1,
    });
  }

  return sortBy(constraints, (c) => c.fields.join(','));
}

function extractIndexes(model: AuditModel): readonly IndexConstraint[] {
  const indexes: IndexConstraint[] = model.indexes.map((idx) => ({
    name: idx.name,
    fields: [...idx.fields],
  }));

  return sortBy(indexes, (idx) => idx.fields.join(','));
}

function extractForeignKeys(model: AuditModel): readonly ForeignKeyConstraint[] {
  const fks: ForeignKeyConstraint[] = [];

  for (const field of model.fields) {
    if (
      field.kind === 'object' &&
      field.relationFromFields !== null &&
      field.relationFromFields.length > 0 &&
      field.relationToFields !== null &&
      field.relationToFields.length > 0
    ) {
      fks.push({
        fields: [...field.relationFromFields],
        referencedModel: field.type,
        referencedFields: [...field.relationToFields],
        onDelete: toReferentialAction(field.relationOnDelete, DEFAULT_ON_DELETE),
        onUpdate: toReferentialAction(field.relationOnUpdate, DEFAULT_ON_UPDATE),
      });
    }
  }

  return sortBy(fks, (fk) => fk.fields.join(','));
}
