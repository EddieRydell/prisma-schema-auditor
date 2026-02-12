/** Severity levels for audit findings. */
export type Severity = 'error' | 'warning' | 'info';

/** Normal form levels. */
export type NormalForm = '1NF' | '2NF' | '3NF' | 'BCNF';

/** Unique finding rule codes. */
export type RuleCode =
  | 'NF1_LIST_IN_STRING_SUSPECTED'
  | 'NF1_REPEATING_GROUP_SUSPECTED'
  | 'NF1_JSON_RELATION_SUSPECTED'
  | 'NF2_PARTIAL_DEPENDENCY_SUSPECTED'
  | 'NF2_JOIN_TABLE_DUPLICATED_ATTR_SUSPECTED'
  | 'NF3_VIOLATION'
  | 'BCNF_VIOLATION'
  | 'INVARIANT_UNKNOWN_MODEL'
  | 'INVARIANT_UNKNOWN_FIELD';

/** A single normalization finding. */
export interface Finding {
  readonly rule: RuleCode;
  readonly severity: Severity;
  readonly normalForm: NormalForm;
  readonly model: string;
  readonly field: string | null;
  readonly message: string;
}

/** Referential action on a foreign key. */
export type ReferentialAction =
  | 'Cascade'
  | 'Restrict'
  | 'NoAction'
  | 'SetNull'
  | 'SetDefault';

/** A primary key constraint. */
export interface PrimaryKeyConstraint {
  readonly fields: readonly string[];
  readonly isComposite: boolean;
}

/** A unique constraint. */
export interface UniqueConstraint {
  readonly name: string | null;
  readonly fields: readonly string[];
  readonly isComposite: boolean;
}

/** A foreign key constraint. */
export interface ForeignKeyConstraint {
  readonly fields: readonly string[];
  readonly referencedModel: string;
  readonly referencedFields: readonly string[];
  readonly onDelete: ReferentialAction;
  readonly onUpdate: ReferentialAction;
}

/** Field-level metadata in the contract. */
export interface FieldContract {
  readonly name: string;
  readonly type: string;
  readonly isNullable: boolean;
  readonly hasDefault: boolean;
  readonly isList: boolean;
}

/** Model-level constraint contract. */
export interface ModelContract {
  readonly name: string;
  readonly fields: readonly FieldContract[];
  readonly primaryKey: PrimaryKeyConstraint | null;
  readonly uniqueConstraints: readonly UniqueConstraint[];
  readonly foreignKeys: readonly ForeignKeyConstraint[];
}

/** The full constraint contract for a schema. */
export interface ConstraintContract {
  readonly models: readonly ModelContract[];
}

/** Output format options. */
export type OutputFormat = 'json' | 'text';

/** The complete audit result. */
export interface AuditResult {
  readonly contract: ConstraintContract;
  readonly findings: readonly Finding[];
  readonly metadata: AuditMetadata;
}

/** Metadata about the audit run. */
export interface AuditMetadata {
  readonly schemaPath: string;
  readonly timestamp: string | null;
  readonly modelCount: number;
  readonly findingCount: number;
}
