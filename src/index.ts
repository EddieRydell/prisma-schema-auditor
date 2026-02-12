export type {
  AuditResult,
  AuditMetadata,
  ConstraintContract,
  ModelContract,
  FieldContract,
  PrimaryKeyConstraint,
  UniqueConstraint,
  IndexConstraint,
  ForeignKeyConstraint,
  Finding,
  RuleCode,
  Severity,
  NormalForm,
  OutputFormat,
  FormatOptions,
  ReferentialAction,
} from './core/report/reportTypes.js';

export type { FunctionalDependency } from './core/analysis/inferFds.js';
export type { CandidateKey } from './core/analysis/computeKeys.js';
export type { InvariantsFile, InvariantFd } from './core/invariants/schema.js';
export type { ParsedInvariants } from './core/invariants/parse.js';

import { parseSqlSchema } from './core/sqlSchema/parse.js';
import { inferFunctionalDependencies } from './core/analysis/inferFds.js';
import { check1nf } from './core/analysis/normalizeChecks/check1nf.js';
import { check2nf } from './core/analysis/normalizeChecks/check2nf.js';
import { check3nf } from './core/analysis/normalizeChecks/check3nf.js';
import { checkSoftDelete } from './core/analysis/normalizeChecks/checkSoftDelete.js';
import { checkFkIndexes } from './core/analysis/normalizeChecks/checkFkIndexes.js';
import { parseInvariantsFile, invariantsToFds, validateInvariantsAgainstContract } from './core/invariants/parse.js';
import { generateInvariantsFile } from './core/invariants/generate.js';
import type { AuditResult, Finding } from './core/report/reportTypes.js';
import type { InvariantsFile } from './core/invariants/schema.js';

/** Options for the audit function. */
export interface AuditOptions {
  readonly schemaPath: string;
  readonly invariantsPath?: string | undefined;
  readonly noTimestamp?: boolean | undefined;
}

/**
 * Run a full audit on a SQL DDL schema file.
 * Returns the constraint contract and normalization findings.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async for backward API compat
export async function audit(
  schemaPathOrOptions: string | AuditOptions,
  noTimestamp = false,
): Promise<AuditResult> {
  const options: AuditOptions =
    typeof schemaPathOrOptions === 'string'
      ? { schemaPath: schemaPathOrOptions, noTimestamp }
      : schemaPathOrOptions;

  const shouldOmitTimestamp = options.noTimestamp === true;

  const contract = parseSqlSchema(options.schemaPath);
  const schemaFds = inferFunctionalDependencies(contract);

  // Merge invariant-declared FDs if provided
  let allFds = schemaFds;
  let invariantFindings: readonly Finding[] = [];
  let suppress: readonly string[] = [];
  if (options.invariantsPath !== undefined) {
    const parsedInvariants = parseInvariantsFile(options.invariantsPath);
    const invariantFds = invariantsToFds(parsedInvariants.invariants);
    allFds = [...schemaFds, ...invariantFds];
    invariantFindings = validateInvariantsAgainstContract(parsedInvariants.invariants, contract);
    suppress = parsedInvariants.suppress;
  }

  const allFindings = [
    ...check1nf(contract),
    ...check2nf(contract, allFds),
    ...check3nf(contract, allFds),
    ...checkSoftDelete(contract),
    ...checkFkIndexes(contract),
    ...invariantFindings,
  ];

  const findings = suppress.length > 0
    ? allFindings.filter((f) => !isSuppressed(f, suppress))
    : allFindings;

  return {
    contract,
    findings,
    metadata: {
      schemaPath: options.schemaPath,
      timestamp: shouldOmitTimestamp ? null : new Date().toISOString(),
      modelCount: contract.models.length,
      findingCount: findings.length,
    },
  };
}

/** Options for generating invariants from a schema. */
export interface GenerateInvariantsOptions {
  readonly schemaPath: string;
}

/**
 * Generate an invariants file from existing schema constraints.
 * Parses the schema, extracts constraints, and produces an InvariantsFile
 * with PK and unique FDs and auto-generated notes.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async for backward API compat
export async function generateInvariants(options: GenerateInvariantsOptions): Promise<InvariantsFile> {
  const contract = parseSqlSchema(options.schemaPath);
  const fds = inferFunctionalDependencies(contract);
  return generateInvariantsFile(contract, fds);
}

/**
 * Check if a finding is suppressed by a suppress entry.
 * Supports RULE:Model and RULE:Model.field patterns.
 */
function isSuppressed(finding: Finding, suppress: readonly string[]): boolean {
  for (const entry of suppress) {
    const colonIdx = entry.indexOf(':');
    const rule = entry.slice(0, colonIdx);
    const target = entry.slice(colonIdx + 1);

    if (rule !== finding.rule) {
      continue;
    }

    const dotIdx = target.indexOf('.');
    if (dotIdx === -1) {
      // RULE:Model — suppress all findings for this model
      if (target === finding.model) {
        return true;
      }
    } else {
      // RULE:Model.field — suppress only the specific field
      const model = target.slice(0, dotIdx);
      const field = target.slice(dotIdx + 1);
      if (model === finding.model && field === finding.field) {
        return true;
      }
    }
  }
  return false;
}
