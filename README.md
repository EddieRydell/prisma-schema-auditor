# prisma-schema-auditor

Static analysis for Prisma schemas: deterministic constraint contracts + normalization lint findings (1NF/2NF; 3NF+ via invariants).

## Install

```bash
npm install --save-dev prisma-schema-auditor
```

## Usage

### CLI

```bash
# Analyze default prisma/schema.prisma
npx prisma-schema-auditor

# Specify schema path and output format
npx prisma-schema-auditor --schema ./prisma/schema.prisma --format text

# Write JSON output to file
npx prisma-schema-auditor --out audit.json --pretty

# Fail CI on warnings or errors
npx prisma-schema-auditor --fail-on warning
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--schema <path>` | Path to Prisma schema file | `prisma/schema.prisma` |
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
import { audit } from 'prisma-schema-auditor';

const result = await audit('prisma/schema.prisma');
console.log(result.contract);   // Constraint contract
console.log(result.findings);   // Normalization findings
```

## License

MIT
