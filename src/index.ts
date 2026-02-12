export type {
  AuditResult,
  AuditMetadata,
  ConstraintContract,
  ModelContract,
  FieldContract,
  PrimaryKeyConstraint,
  UniqueConstraint,
  ForeignKeyConstraint,
  Finding,
  RuleCode,
  Severity,
  NormalForm,
  OutputFormat,
  ReferentialAction,
} from './core/report/reportTypes.js';

export type {
  AuditModel,
  AuditField,
  AuditPrimaryKey,
  AuditUniqueIndex,
  ParseResult,
} from './core/prismaSchema/types.js';

export type { FunctionalDependency } from './core/analysis/inferFds.js';
export type { CandidateKey } from './core/analysis/computeKeys.js';
export type { InvariantsFile, InvariantFd } from './core/invariants/schema.js';

import { parseSchema } from './core/prismaSchema/parse.js';
import { extractContract } from './core/prismaSchema/contract.js';
import { inferFunctionalDependencies } from './core/analysis/inferFds.js';
import { check1nf } from './core/analysis/normalizeChecks/check1nf.js';
import { check2nf } from './core/analysis/normalizeChecks/check2nf.js';
import { check3nf } from './core/analysis/normalizeChecks/check3nf.js';
import { checkSoftDelete } from './core/analysis/normalizeChecks/checkSoftDelete.js';
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
 * Run a full audit on a Prisma schema file.
 * Returns the constraint contract and normalization findings.
 */
export async function audit(
  schemaPathOrOptions: string | AuditOptions,
  noTimestamp = false,
): Promise<AuditResult> {
  const options: AuditOptions =
    typeof schemaPathOrOptions === 'string'
      ? { schemaPath: schemaPathOrOptions, noTimestamp }
      : schemaPathOrOptions;

  const shouldOmitTimestamp = options.noTimestamp === true;

  const parsed = await parseSchema(options.schemaPath);
  const contract = extractContract(parsed);
  const schemaFds = inferFunctionalDependencies(contract);

  // Merge invariant-declared FDs if provided
  let allFds = schemaFds;
  let invariantFindings: readonly Finding[] = [];
  if (options.invariantsPath !== undefined) {
    const invariants = parseInvariantsFile(options.invariantsPath);
    const invariantFds = invariantsToFds(invariants);
    allFds = [...schemaFds, ...invariantFds];
    invariantFindings = validateInvariantsAgainstContract(invariants, contract);
  }

  const findings = [
    ...check1nf(contract),
    ...check2nf(contract, allFds),
    ...check3nf(contract, allFds),
    ...checkSoftDelete(contract),
    ...invariantFindings,
  ];

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
export async function generateInvariants(options: GenerateInvariantsOptions): Promise<InvariantsFile> {
  const parsed = await parseSchema(options.schemaPath);
  const contract = extractContract(parsed);
  const fds = inferFunctionalDependencies(contract);
  return generateInvariantsFile(contract, fds);
}
