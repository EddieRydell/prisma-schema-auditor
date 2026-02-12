import { readFileSync } from 'node:fs';
import pkg from '@prisma/internals';
const { getDMMF } = pkg;
import type { AuditField, AuditIndex, AuditModel, AuditUniqueIndex, ParseResult } from './types.js';

/**
 * Parse @@index() declarations from raw Prisma schema text.
 * DMMF does not expose regular (non-unique) indexes, so we parse them from the source.
 * Returns a map from model name to its @@index field arrays.
 */
function parseRawIndexes(schemaContent: string): ReadonlyMap<string, readonly AuditIndex[]> {
  const result = new Map<string, AuditIndex[]>();

  // Match model blocks: "model Name { ... }"
  const modelBlockRe = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let modelMatch: RegExpExecArray | null;
  while ((modelMatch = modelBlockRe.exec(schemaContent)) !== null) {
    const modelName = modelMatch[1] ?? '';
    const body = modelMatch[2] ?? '';

    const indexes: AuditIndex[] = [];

    // Match @@index([field1, field2, ...]) — captures the bracket contents
    const indexRe = /@@index\(\s*\[([^\]]*)\]/g;
    let idxMatch: RegExpExecArray | null;
    while ((idxMatch = indexRe.exec(body)) !== null) {
      const fieldsRaw = idxMatch[1] ?? '';
      const fields = fieldsRaw
        .split(',')
        .map((f) => f.trim())
        // Strip sort/ops like field(sort: Desc) → field
        .map((f) => f.replace(/\(.*\)/, '').trim())
        .filter((f) => f.length > 0);

      if (fields.length > 0) {
        indexes.push({ name: null, fields });
      }
    }

    if (indexes.length > 0) {
      result.set(modelName, indexes);
    }
  }

  return result;
}

/**
 * Parse a Prisma schema file and return an internal representation.
 * Uses getDMMF from @prisma/internals to parse the schema into DMMF,
 * then transforms DMMF models/fields into our AuditModel[] structure.
 * Regular @@index() declarations are parsed from raw schema text since DMMF omits them.
 */
export async function parseSchema(schemaPath: string): Promise<ParseResult> {
  const schemaContent = readFileSync(schemaPath, 'utf-8');
  const dmmf = await getDMMF({ datamodel: schemaContent });
  const rawIndexes = parseRawIndexes(schemaContent);

  const models: AuditModel[] = dmmf.datamodel.models.map((model) => {
    const fields: AuditField[] = model.fields.map((field) => ({
      name: field.name,
      type: field.type,
      kind: field.kind,
      isList: field.isList,
      isRequired: field.isRequired,
      isId: field.isId,
      isUnique: field.isUnique,
      hasDefaultValue: field.hasDefaultValue,
      relationName: field.relationName ?? null,
      relationFromFields:
        field.relationFromFields !== undefined && field.relationFromFields.length > 0
          ? field.relationFromFields
          : null,
      relationToFields:
        field.relationToFields !== undefined && field.relationToFields.length > 0
          ? [...field.relationToFields]
          : null,
      relationOnDelete: field.relationOnDelete ?? null,
      relationOnUpdate: field.relationOnUpdate ?? null,
      documentation: field.documentation ?? null,
    }));

    const uniqueIndexes: AuditUniqueIndex[] = model.uniqueIndexes.map((idx) => ({
      name: idx.name,
      fields: idx.fields,
    }));

    return {
      name: model.name,
      fields,
      primaryKey: model.primaryKey !== null ? { fields: model.primaryKey.fields } : null,
      uniqueIndexes,
      indexes: rawIndexes.get(model.name) ?? [],
      documentation: model.documentation ?? null,
    };
  });

  return { models };
}
