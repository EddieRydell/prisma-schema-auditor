import { readFileSync, writeFileSync } from 'node:fs';
import nodeSqlParser from 'node-sql-parser';
const { Parser } = nodeSqlParser;

const sql = readFileSync('C:/Users/eddie/CRM/supabase/migrations/001_base_schema.sql', 'utf-8');

// Tables dropped in migration 003
const droppedTables = new Set([
  'announcement_dismissals', 'admin_announcements', 'active_dial_lines',
  'blocked_calls_log', 'call_frequency_log', 'call_insight_objections', 'system_settings'
]);

// Split into top-level statements tracking dollar-quoted blocks
const lines = sql.split('\n');
const statements = [];
let current = [];
let dollarQuote = false;

for (const line of lines) {
  const trimmed = line.trim();
  if (current.length === 0 && (trimmed.startsWith('--') || trimmed === '')) continue;

  const matches = trimmed.match(/\$\$/g);
  if (matches && matches.length % 2 === 1) {
    dollarQuote = !dollarQuote;
  }

  current.push(line);

  if (!dollarQuote && trimmed.endsWith(';')) {
    statements.push(current.join('\n'));
    current = [];
  }
}

// Filter to CREATE TABLE, CREATE INDEX, and ALTER TABLE ADD CONSTRAINT
const kept = [];
for (const stmt of statements) {
  const upper = stmt.toUpperCase().trim();
  const isCreateTable = upper.startsWith('CREATE TABLE');
  const isCreateIndex = upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE UNIQUE INDEX');
  const isAlterAdd = upper.includes('ALTER TABLE') && upper.includes('ADD CONSTRAINT');

  if (!isCreateTable && !isCreateIndex && !isAlterAdd) continue;
  if (upper.includes('CONCURRENTLY')) continue;

  // Skip dropped tables — match table name from any statement type
  const tableMatch = stmt.match(/(?:CREATE TABLE|ALTER TABLE(?:\s+ONLY)?)\s+(?:public\.)?(\w+)/i)
    || stmt.match(/\bON\s+(?:public\.)?(\w+)\b/i);
  if (tableMatch && droppedTables.has(tableMatch[1])) continue;

  kept.push(stmt);
}

process.stdout.write('Kept ' + kept.length + ' statements\n');

/**
 * Remove a CONSTRAINT line from a CREATE TABLE body.
 * Tracks nested parens to find the real end.
 */
function removeConstraintLines(body) {
  // Split the body between ( ... ) into definition lines
  const openIdx = body.indexOf('(');
  const closeIdx = body.lastIndexOf(')');
  if (openIdx === -1 || closeIdx === -1) return body;

  const prefix = body.slice(0, openIdx + 1);
  const suffix = body.slice(closeIdx);
  const inner = body.slice(openIdx + 1, closeIdx);

  // Split inner by commas, but respect nested parens
  const defs = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++;
    else if (inner[i] === ')') depth--;
    else if (inner[i] === ',' && depth === 0) {
      defs.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  defs.push(inner.slice(start));

  // Filter out CHECK and EXCLUDE constraints
  const filtered = defs.filter(d => {
    const trimmed = d.trim().toUpperCase();
    if (trimmed.startsWith('CONSTRAINT') && (trimmed.includes('CHECK') || trimmed.includes('EXCLUDE'))) {
      return false;
    }
    return true;
  });

  return prefix + filtered.join(',') + suffix;
}

function cleanStatement(stmt) {
  let s = stmt;

  // Remove schema prefix
  s = s.replace(/\bpublic\./g, '');

  // Normalize multi-word PostgreSQL types BEFORE cast removal
  s = s.replace(/\btimestamp\s+with\s+time\s+zone\b/gi, 'TIMESTAMPTZ');
  s = s.replace(/\btimestamp\s+without\s+time\s+zone\b/gi, 'TIMESTAMP');
  s = s.replace(/\btime\s+with\s+time\s+zone\b/gi, 'TIMETZ');
  s = s.replace(/\btime\s+without\s+time\s+zone\b/gi, 'TIME');
  s = s.replace(/\bcharacter\s+varying\b/gi, 'VARCHAR');
  s = s.replace(/\bdouble\s+precision\b/gi, 'FLOAT');

  // Replace array types: uuid[] -> uuid
  s = s.replace(/(\w+)\[\]/g, '$1');

  // Remove ::type casts (may have parens like ::varchar(20))
  s = s.replace(/::\w+(\(\d+\))?/g, '');

  // Remove DEFAULT with ARRAY[...] expressions
  s = s.replace(/DEFAULT\s+ARRAY\[[^\]]*\]/g, 'DEFAULT NULL');

  // Remove DEFAULT with '{...}' expressions
  s = s.replace(/DEFAULT\s+'\{[^}]*\}'/g, "DEFAULT ''");

  // Replace enum type references with TEXT
  s = s.replace(/\bjob_status\b/gi, 'TEXT');

  // Remove ALTER TABLE ... OWNER TO embedded after statement
  s = s.replace(/ALTER TABLE[^;]*OWNER TO[^;]*;/g, '');

  // Clean USING btree/hash from CREATE INDEX
  s = s.replace(/\bUSING\s+(btree|hash|gist|gin|spgist|brin)\b/gi, '');

  // Remove WHERE clauses from partial indexes
  s = s.replace(/\)\s*WHERE\s*\([\s\S]*$/gim, ')');

  // Remove CHECK and EXCLUDE constraints (paren-aware)
  if (s.toUpperCase().trim().startsWith('CREATE TABLE')) {
    s = removeConstraintLines(s);
  }

  // Clean up trailing commas before closing paren
  s = s.replace(/,(\s*)\)/g, '$1)');

  // Ensure trailing semicolon
  s = s.trim();
  if (!s.endsWith(';')) s += ';';

  return s;
}

// Clean and test each statement individually
const parser = new Parser();
const passed = [];
const failed = [];

for (const stmt of kept) {
  const cleaned = cleanStatement(stmt);
  try {
    parser.astify(cleaned, { database: 'PostgresQL' });
    passed.push(cleaned);
  } catch (e) {
    // Extract table name for reporting
    const nameMatch = cleaned.match(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
    const name = nameMatch ? nameMatch[1] : 'unknown';
    failed.push({ name, error: e.message.slice(0, 120), cleaned: cleaned.slice(0, 300) });
  }
}

process.stdout.write('Parsed OK: ' + passed.length + '\n');
process.stdout.write('Failed:    ' + failed.length + '\n');

if (failed.length > 0) {
  process.stdout.write('\nFailed statements:\n');
  for (const f of failed.slice(0, 20)) {
    process.stdout.write('  ' + f.name + ': ' + f.error + '\n');
  }
}

const outPath = process.argv[2] || 'C:/Users/eddie/CRM/crm_clean.sql';
writeFileSync(outPath, passed.join('\n\n'));
process.stdout.write('\nWrote ' + outPath + ' (' + passed.length + ' statements)\n');
