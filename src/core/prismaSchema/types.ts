/** Internal representation of a Prisma model field after DMMF parsing. */
export interface AuditField {
  readonly name: string;
  readonly type: string;
  readonly kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  readonly isList: boolean;
  readonly isRequired: boolean;
  readonly isId: boolean;
  readonly isUnique: boolean;
  readonly hasDefaultValue: boolean;
  readonly relationName: string | null;
  readonly relationFromFields: readonly string[] | null;
  readonly relationToFields: readonly string[] | null;
  readonly relationOnDelete: string | null;
  readonly relationOnUpdate: string | null;
  readonly documentation: string | null;
}

/** Internal representation of a Prisma model after DMMF parsing. */
export interface AuditModel {
  readonly name: string;
  readonly fields: readonly AuditField[];
  readonly primaryKey: AuditPrimaryKey | null;
  readonly uniqueIndexes: readonly AuditUniqueIndex[];
  readonly indexes: readonly AuditIndex[];
  readonly documentation: string | null;
}

/** Parsed primary key (composite). */
export interface AuditPrimaryKey {
  readonly fields: readonly string[];
}

/** Parsed unique index. */
export interface AuditUniqueIndex {
  readonly name: string | null;
  readonly fields: readonly string[];
}

/** Parsed regular (non-unique) @@index. */
export interface AuditIndex {
  readonly name: string | null;
  readonly fields: readonly string[];
}

/** Result of parsing a Prisma schema. */
export interface ParseResult {
  readonly models: readonly AuditModel[];
}
