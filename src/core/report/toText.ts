import type { AuditResult } from './reportTypes.js';

/**
 * Format an AuditResult as human-readable text.
 */
export function toText(result: AuditResult): string {
  const lines: string[] = [];

  lines.push('=== Prisma Schema Audit ===');
  lines.push('');

  if (result.metadata.timestamp !== null) {
    lines.push(`Timestamp: ${result.metadata.timestamp}`);
  }
  lines.push(`Schema:    ${result.metadata.schemaPath}`);
  lines.push(`Models:    ${String(result.metadata.modelCount)}`);
  lines.push(`Findings:  ${String(result.metadata.findingCount)}`);
  lines.push('');

  // Contract summary
  lines.push('--- Constraint Contract ---');
  for (const model of result.contract.models) {
    lines.push(`  Model: ${model.name}`);
    if (model.primaryKey !== null) {
      lines.push(`    PK: (${model.primaryKey.fields.join(', ')})`);
    }
    for (const uq of model.uniqueConstraints) {
      const label = uq.name !== null ? ` [${uq.name}]` : '';
      lines.push(`    Unique${label}: (${uq.fields.join(', ')})`);
    }
    for (const fk of model.foreignKeys) {
      lines.push(
        `    FK: (${fk.fields.join(', ')}) -> ${fk.referencedModel}(${fk.referencedFields.join(', ')}) onDelete=${fk.onDelete} onUpdate=${fk.onUpdate}`,
      );
    }
  }
  lines.push('');

  // Findings
  if (result.findings.length > 0) {
    lines.push('--- Findings ---');
    for (const f of result.findings) {
      const field = f.field !== null ? `.${f.field}` : '';
      lines.push(`  [${f.severity.toUpperCase()}] ${f.rule} @ ${f.model}${field}`);
      lines.push(`    ${f.message}`);
      if (f.fix !== null) {
        lines.push(`    Fix: ${f.fix}`);
      }
    }
  } else {
    lines.push('No normalization findings.');
  }

  lines.push('');
  return lines.join('\n');
}
