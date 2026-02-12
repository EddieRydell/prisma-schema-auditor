import type { ConstraintContract, Finding, ModelContract, FieldContract } from '../../report/reportTypes.js';

/**
 * Patterns that suggest a string field contains a delimited list of values.
 * Matches field names ending in Ids, List, Csv, Array, Tags, Items, Values (case-insensitive).
 */
const LIST_IN_STRING_PATTERN = /(?:ids|list|csv|array|tags|items|values)$/i;

/**
 * Pattern to detect repeating groups: field names ending with a numeric suffix.
 * e.g., phone1, phone2, address1, address2
 */
const REPEATING_GROUP_PATTERN = /^(.+?)(\d+)$/;

/**
 * Check for 1NF violations (heuristic-based).
 *
 * Checks:
 * - NF1_LIST_IN_STRING_SUSPECTED: String fields with names suggesting list values
 * - NF1_REPEATING_GROUP_SUSPECTED: Fields with numeric suffixes (phone1, phone2)
 * - NF1_JSON_RELATION_SUSPECTED: Json fields suggesting embedded relations
 */
export function check1nf(contract: ConstraintContract): readonly Finding[] {
  const findings: Finding[] = [];

  for (const model of contract.models) {
    checkListInString(model, findings);
    checkRepeatingGroups(model, findings);
    checkJsonRelation(model, findings);
  }

  return findings;
}

function checkListInString(model: ModelContract, findings: Finding[]): void {
  for (const field of model.fields) {
    if (field.type === 'String' && LIST_IN_STRING_PATTERN.test(field.name)) {
      findings.push({
        rule: 'NF1_LIST_IN_STRING_SUSPECTED',
        severity: 'warning',
        normalForm: '1NF',
        model: model.name,
        field: field.name,
        message: `String field "${field.name}" may contain a delimited list of values. Consider normalizing into a separate table.`,
        fix: `Create a separate table for the values in '${field.name}' and use a relation.`,
      });
    }
  }
}

function checkRepeatingGroups(model: ModelContract, findings: Finding[]): void {
  // Group fields by their base name (strip trailing digits)
  const groups = new Map<string, FieldContract[]>();

  for (const field of model.fields) {
    const match = REPEATING_GROUP_PATTERN.exec(field.name);
    if (match?.[1] !== undefined) {
      const baseName = match[1];
      const existing = groups.get(baseName);
      if (existing !== undefined) {
        existing.push(field);
      } else {
        groups.set(baseName, [field]);
      }
    }
  }

  // Only flag groups with 2+ numbered fields of the same type
  for (const [baseName, fields] of groups) {
    if (fields.length >= 2) {
      const firstType = fields[0]?.type;
      const allSameType = firstType !== undefined && fields.every((f) => f.type === firstType);
      if (allSameType) {
        const fieldNames = fields.map((f) => f.name).join(', ');
        findings.push({
          rule: 'NF1_REPEATING_GROUP_SUSPECTED',
          severity: 'warning',
          normalForm: '1NF',
          model: model.name,
          field: null,
          message: `Fields [${fieldNames}] appear to be a repeating group for "${baseName}". Consider normalizing into a separate table.`,
          fix: `Create a separate '${baseName}' table with a one-to-many relation from '${model.name}'.`,
        });
      }
    }
  }
}

function checkJsonRelation(model: ModelContract, findings: Finding[]): void {
  for (const field of model.fields) {
    if (field.type === 'Json') {
      findings.push({
        rule: 'NF1_JSON_RELATION_SUSPECTED',
        severity: 'info',
        normalForm: '1NF',
        model: model.name,
        field: field.name,
        message: `Json field "${field.name}" may contain structured data that could be normalized into related tables.`,
        fix: `If '${field.name}' has a consistent structure, extract it into a related model.`,
      });
    }
  }
}
