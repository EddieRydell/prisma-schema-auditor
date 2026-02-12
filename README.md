# schema-auditor

Static analysis for SQL DDL schemas: deterministic constraint contracts + normalization lint findings (1NF/2NF; 3NF+ via invariants).

## Install

```bash
npm install --save-dev schema-auditor
```

## Usage

### CLI

```bash
# Analyze default schema.sql
npx schema-auditor

# Specify schema path and output format
npx schema-auditor --schema ./schema.sql --format text

# Write JSON output to file
npx schema-auditor --out audit.json --pretty

# Fail CI on warnings or errors
npx schema-auditor --fail-on warning
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--schema <path>` | Path to SQL DDL file | `schema.sql` |
| `--invariants <path>` | Path to invariants file (JSON) | - |
| `--format <fmt>` | Output format: `json` or `text` | `json` |
| `--out <path>` | Write output to file | stdout |
| `--fail-on <severity>` | Exit 1 if findings at severity or above | - |
| `--no-timestamp` | Omit timestamp from output | `false` |
| `--pretty` | Pretty-print JSON output | `false` |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | OK |
| 1 | Findings at or above `--fail-on` threshold |
| 2 | CLI usage error |
| 3 | Schema parse error |

### Programmatic API

```typescript
import { audit } from 'schema-auditor';

const result = await audit('schema.sql');
// result.contract   — Constraint contract
// result.findings   — Normalization findings
```

## Rules

### 1NF Checks

| Rule | Severity | What it detects |
|------|----------|----------------|
| `NF1_JSON_RELATION_SUSPECTED` | info | JSON/JSONB columns that likely store structured relational data |
| `NF1_LIST_IN_STRING_SUSPECTED` | info | String columns whose names suggest they contain delimited lists (e.g. `tag_ids`, `user_list`) |
| `NF1_REPEATING_GROUP_SUSPECTED` | info | Numbered column groups like `phone1`, `phone2`, `phone3` |

### 2NF Checks

| Rule | Severity | What it detects |
|------|----------|----------------|
| `NF2_PARTIAL_DEPENDENCY_SUSPECTED` | info | Composite-key tables where a FK subset of the key may determine non-key attributes |
| `NF2_JOIN_TABLE_DUPLICATED_ATTR_SUSPECTED` | info | Join tables with extra attributes beyond the composite key |

### 3NF / BCNF Checks (require invariants file)

| Rule | Severity | What it detects |
|------|----------|----------------|
| `NF3_VIOLATION` | warning | Transitive dependencies: A non-key field depends on another non-key field |
| `BCNF_VIOLATION` | warning | A determinant that is not a candidate key |

### Schema Checks

| Rule | Severity | What it detects |
|------|----------|----------------|
| `FK_MISSING_INDEX` | warning | Foreign key columns with no covering index |
| `SOFTDELETE_MISSING_IN_UNIQUE` | warning | Unique constraints that don't include `deleted_at` when soft-delete is present |
| `SOFTDELETE_AT_WITHOUT_BY` | info | `deleted_at` column without a corresponding `deleted_by` |
| `SOFTDELETE_BY_WITHOUT_AT` | info | `deleted_by` column without a corresponding `deleted_at` |

### Invariant Validation

| Rule | Severity | What it detects |
|------|----------|----------------|
| `INVARIANT_UNKNOWN_MODEL` | warning | Invariants file references a model not in the schema |
| `INVARIANT_UNKNOWN_FIELD` | warning | Invariants file references a field not in the schema |
| `INVARIANT_DETERMINANT_NOT_ENFORCED` | warning | Declared FD determinant has no PK/unique constraint backing it |

## Supported SQL

The parser handles PostgreSQL DDL including:
- `CREATE TABLE` with inline and table-level constraints
- `ALTER TABLE ADD CONSTRAINT` (primary key, unique, foreign key)
- `CREATE INDEX` / `CREATE UNIQUE INDEX`
- Referential actions (`ON DELETE CASCADE`, etc.)
- PostgreSQL type normalization (e.g. `TIMESTAMPTZ` → `DateTime`, `JSONB` → `Json`)

For `pg_dump`-style schemas that use CHECK constraints, array types, or expression indexes, see `scripts/clean-crm-schema.mjs` for a preprocessing example.

## License

MIT
