#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { audit } from './index.js';
import { toJson } from './core/report/toJson.js';
import { toText } from './core/report/toText.js';
import type { OutputFormat } from './core/report/reportTypes.js';

/** Exit codes. */
const EXIT_OK = 0;
const EXIT_ISSUES = 1;
const EXIT_CLI_ERROR = 2;
const EXIT_PARSE_ERROR = 3;

function printUsage(): void {
  process.stdout.write(
    `Usage: prisma-schema-auditor [options]

Options:
  --schema <path>       Path to Prisma schema file (default: prisma/schema.prisma)
  --invariants <path>   Path to invariants file (JSON)
  --format <fmt>        Output format: json | text (default: json)
  --out <path>          Write output to file instead of stdout
  --fail-on <severity>  Exit 1 if findings at this severity or above: error | warning | info
  --no-timestamp        Omit timestamp from output
  --pretty              Pretty-print JSON output
  --help                Show this help message
`,
  );
}

export async function main(argv?: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;

  try {
    args = parseArgs({
      args: argv,
      options: {
        schema: { type: 'string' },
        invariants: { type: 'string' },
        format: { type: 'string', default: 'json' },
        out: { type: 'string' },
        'fail-on': { type: 'string' },
        'no-timestamp': { type: 'boolean', default: false },
        pretty: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Invalid arguments';
    process.stderr.write(`Error: ${detail}. Use --help for usage.\n`);
    return EXIT_CLI_ERROR;
  }

  if (args.values['help'] === true) {
    printUsage();
    return EXIT_OK;
  }

  // Resolve schema path
  const schemaPath = resolve(
    typeof args.values['schema'] === 'string'
      ? args.values['schema']
      : 'prisma/schema.prisma',
  );

  if (!existsSync(schemaPath)) {
    process.stderr.write(`Error: Schema file not found: ${schemaPath}\n`);
    return EXIT_CLI_ERROR;
  }

  // Validate format
  const format = (args.values['format'] ?? 'json') as string;
  if (format !== 'json' && format !== 'text') {
    process.stderr.write(
      `Error: Invalid format "${format}". Must be "json" or "text".\n`,
    );
    return EXIT_CLI_ERROR;
  }
  const outputFormat: OutputFormat = format;

  // Validate fail-on
  const failOn = args.values['fail-on'] as string | undefined;
  if (
    failOn !== undefined &&
    failOn !== 'error' &&
    failOn !== 'warning' &&
    failOn !== 'info'
  ) {
    process.stderr.write(
      `Error: Invalid --fail-on value "${failOn}". Must be "error", "warning", or "info".\n`,
    );
    return EXIT_CLI_ERROR;
  }

  const noTimestamp = args.values['no-timestamp'] === true;
  const pretty = args.values['pretty'] === true;

  // Resolve invariants path if provided
  const invariantsArg = args.values['invariants'] as string | undefined;
  let invariantsPath: string | undefined;
  if (invariantsArg !== undefined) {
    invariantsPath = resolve(invariantsArg);
    if (!existsSync(invariantsPath)) {
      process.stderr.write(`Error: Invariants file not found: ${invariantsPath}\n`);
      return EXIT_CLI_ERROR;
    }
  }

  // Run audit
  let result;
  try {
    result = await audit({ schemaPath, invariantsPath, noTimestamp });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : '';
    process.stderr.write(`Error: Failed to parse schema.${detail !== '' ? ` ${detail}` : ''}\n`);
    return EXIT_PARSE_ERROR;
  }

  // Format output
  const output =
    outputFormat === 'json' ? toJson(result, pretty) : toText(result);

  // Write output
  const outPath = args.values['out'] as string | undefined;
  if (outPath !== undefined) {
    writeFileSync(resolve(outPath), output, 'utf-8');
  } else {
    process.stdout.write(output);
    process.stdout.write('\n');
  }

  // Check fail-on threshold
  if (failOn !== undefined && result.findings.length > 0) {
    const severityOrder = { info: 0, warning: 1, error: 2 };
    const threshold = severityOrder[failOn];
    const hasFailure = result.findings.some(
      (f) => severityOrder[f.severity] >= threshold,
    );
    if (hasFailure) {
      return EXIT_ISSUES;
    }
  }

  return EXIT_OK;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.exitCode = EXIT_PARSE_ERROR;
    });
}
