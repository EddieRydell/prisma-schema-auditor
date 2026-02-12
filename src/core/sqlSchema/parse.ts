import { readFileSync } from 'node:fs';
import { Parser } from 'node-sql-parser';
import { sortBy } from '../../util/index.js';
import type {
  ConstraintContract,
  FieldContract,
  ForeignKeyConstraint,
  IndexConstraint,
  ModelContract,
  PrimaryKeyConstraint,
  ReferentialAction,
  UniqueConstraint,
} from '../report/reportTypes.js';

/* ---------- AST subset types (node-sql-parser is broadly typed) ---------- */

interface AstColumnExpr {
  readonly type: string;
  readonly value: string;
}

interface AstColumnRef {
  readonly column: { readonly expr: AstColumnExpr };
}

interface AstColumnDef {
  readonly resource: 'column';
  readonly column: AstColumnRef;
  readonly definition: { readonly dataType: string };
  readonly nullable?: { readonly type: string } | null | undefined;
  readonly default_val?: { readonly type: string } | null | undefined;
  readonly primary_key?: string | null | undefined;
  readonly unique?: string | null | undefined;
}

interface AstConstraintDef {
  readonly resource: 'constraint';
  readonly constraint: string | null;
  readonly constraint_type: string;
  readonly definition: readonly AstColumnRef[];
  readonly reference_definition?: {
    readonly table: readonly [{ readonly table: string }];
    readonly definition: readonly AstColumnRef[];
    readonly on_action: readonly { readonly type: string; readonly value: { readonly value: string } }[];
  } | undefined;
}

type AstCreateDef = AstColumnDef | AstConstraintDef;

interface AstCreateTable {
  readonly type: string;
  readonly keyword: string;
  readonly table: readonly [{ readonly table: string }];
  readonly create_definitions: readonly AstCreateDef[];
}

interface AstCreateIndex {
  readonly type: string;
  readonly keyword: string;
  readonly index_type: string | null;
  readonly index: string;
  readonly table: { readonly table: string };
  readonly index_columns: readonly AstColumnRef[];
}

interface AstRawStatement {
  readonly type: string;
  readonly keyword?: string | undefined;
}

/* ---------- Type normalisation ---------- */

const SERIAL_TYPES = new Set(['SERIAL', 'BIGSERIAL', 'SMALLSERIAL']);

const TYPE_MAP: ReadonlyMap<string, string> = new Map([
  // String types
  ['TEXT', 'String'],
  ['VARCHAR', 'String'],
  ['CHAR', 'String'],
  ['CHARACTER VARYING', 'String'],
  ['CHARACTER', 'String'],
  ['UUID', 'String'],
  // JSON types
  ['JSON', 'Json'],
  ['JSONB', 'Json'],
  // DateTime types
  ['TIMESTAMP', 'DateTime'],
  ['TIMESTAMPTZ', 'DateTime'],
  ['TIMESTAMP WITH TIME ZONE', 'DateTime'],
  ['TIMESTAMP WITHOUT TIME ZONE', 'DateTime'],
  ['DATE', 'DateTime'],
  // Numeric types
  ['INT', 'Int'],
  ['INTEGER', 'Int'],
  ['INT4', 'Int'],
  ['SERIAL', 'Int'],
  ['SMALLINT', 'Int'],
  ['SMALLSERIAL', 'Int'],
  ['BIGINT', 'BigInt'],
  ['BIGSERIAL', 'BigInt'],
  ['INT8', 'BigInt'],
  ['FLOAT', 'Float'],
  ['FLOAT4', 'Float'],
  ['FLOAT8', 'Float'],
  ['REAL', 'Float'],
  ['DOUBLE PRECISION', 'Float'],
  ['DECIMAL', 'Decimal'],
  ['NUMERIC', 'Decimal'],
  ['BOOLEAN', 'Boolean'],
  ['BOOL', 'Boolean'],
  ['BYTEA', 'Bytes'],
]);

function normalizeType(pgType: string): string {
  return TYPE_MAP.get(pgType.toUpperCase()) ?? pgType;
}

/* ---------- Referential action mapping ---------- */

const DEFAULT_ON_DELETE: ReferentialAction = 'NoAction';
const DEFAULT_ON_UPDATE: ReferentialAction = 'NoAction';

const ACTION_MAP: ReadonlyMap<string, ReferentialAction> = new Map([
  ['cascade', 'Cascade'],
  ['restrict', 'Restrict'],
  ['no action', 'NoAction'],
  ['set null', 'SetNull'],
  ['set default', 'SetDefault'],
]);

function toReferentialAction(value: string | undefined, fallback: ReferentialAction): ReferentialAction {
  if (value === undefined) return fallback;
  return ACTION_MAP.get(value.toLowerCase()) ?? fallback;
}

/* ---------- Column name extraction helper ---------- */

function colName(ref: AstColumnRef): string {
  return ref.column.expr.value;
}

/* ---------- Public API ---------- */

/**
 * Parse a SQL DDL file and return a ConstraintContract.
 */
export function parseSqlSchema(schemaPath: string): ConstraintContract {
  const sql = readFileSync(schemaPath, 'utf-8');
  return parseSqlString(sql);
}

/**
 * Parse a SQL DDL string and return a ConstraintContract.
 */
export function parseSqlString(sql: string): ConstraintContract {
  const parser = new Parser();
  const rawAst: unknown = parser.astify(sql, { database: 'PostgresQL' });

  const rawStatements = (Array.isArray(rawAst) ? rawAst : [rawAst]) as AstRawStatement[];

  // Accumulate per-table state
  const tableMap = new Map<string, {
    fields: FieldContract[];
    primaryKey: PrimaryKeyConstraint | null;
    uniqueConstraints: UniqueConstraint[];
    indexes: IndexConstraint[];
    foreignKeys: ForeignKeyConstraint[];
  }>();

  function ensureTable(name: string): NonNullable<ReturnType<typeof tableMap.get>> {
    let entry = tableMap.get(name);
    if (entry === undefined) {
      entry = { fields: [], primaryKey: null, uniqueConstraints: [], indexes: [], foreignKeys: [] };
      tableMap.set(name, entry);
    }
    return entry;
  }

  for (const stmt of rawStatements) {
    if (stmt.type !== 'create') continue;

    if (stmt.keyword === 'table') {
      processCreateTable(stmt as unknown as AstCreateTable, ensureTable);
    } else if (stmt.keyword === 'index') {
      processCreateIndex(stmt as unknown as AstCreateIndex, ensureTable);
    }
  }

  // Build sorted ModelContracts
  const models: ModelContract[] = sortBy(
    [...tableMap.entries()].map(([name, t]) => ({
      name,
      fields: sortBy(t.fields, (f) => f.name),
      primaryKey: t.primaryKey,
      uniqueConstraints: sortBy(t.uniqueConstraints, (c) => c.fields.join(',')),
      indexes: sortBy(t.indexes, (i) => i.fields.join(',')),
      foreignKeys: sortBy(t.foreignKeys, (fk) => fk.fields.join(',')),
    })),
    (m) => m.name,
  );

  return { models };
}

/* ---------- Statement processors ---------- */

type EnsureTable = (name: string) => {
  fields: FieldContract[];
  primaryKey: PrimaryKeyConstraint | null;
  uniqueConstraints: UniqueConstraint[];
  indexes: IndexConstraint[];
  foreignKeys: ForeignKeyConstraint[];
};

function processCreateTable(stmt: AstCreateTable, ensureTable: EnsureTable): void {
  const tableName = stmt.table[0].table;
  const table = ensureTable(tableName);

  const inlinePkFields: string[] = [];

  for (const def of stmt.create_definitions) {
    if (def.resource === 'column') {
      const name = colName(def.column);
      const rawType = def.definition.dataType;
      const isSerial = SERIAL_TYPES.has(rawType.toUpperCase());

      table.fields.push({
        name,
        type: normalizeType(rawType),
        isNullable: def.nullable?.type !== 'not null' && (def.primary_key === undefined || def.primary_key === null) && !isSerial,
        hasDefault: (def.default_val !== undefined && def.default_val !== null) || isSerial,
        isList: false,
      });

      if (def.primary_key !== undefined && def.primary_key !== null) {
        inlinePkFields.push(name);
      }
      if (def.unique !== undefined && def.unique !== null) {
        table.uniqueConstraints.push({
          name: null,
          fields: [name],
          isComposite: false,
        });
      }
    } else {
      const ctype = def.constraint_type.toLowerCase();

      if (ctype === 'primary key') {
        const fields = def.definition.map(colName);
        table.primaryKey = { fields, isComposite: fields.length > 1 };
      } else if (ctype === 'unique') {
        const fields = def.definition.map(colName);
        table.uniqueConstraints.push({
          name: def.constraint ?? null,
          fields,
          isComposite: fields.length > 1,
        });
      } else if (ctype === 'foreign key' && def.reference_definition !== undefined) {
        const ref = def.reference_definition;
        let onDelete: ReferentialAction = DEFAULT_ON_DELETE;
        let onUpdate: ReferentialAction = DEFAULT_ON_UPDATE;

        for (const action of ref.on_action) {
          if (action.type === 'on delete') {
            onDelete = toReferentialAction(action.value.value, DEFAULT_ON_DELETE);
          } else if (action.type === 'on update') {
            onUpdate = toReferentialAction(action.value.value, DEFAULT_ON_UPDATE);
          }
        }

        table.foreignKeys.push({
          fields: def.definition.map(colName),
          referencedModel: ref.table[0].table,
          referencedFields: ref.definition.map(colName),
          onDelete,
          onUpdate,
        });
      }
    }
  }

  // Inline PK (column-level PRIMARY KEY)
  if (table.primaryKey === null && inlinePkFields.length > 0) {
    table.primaryKey = {
      fields: inlinePkFields,
      isComposite: inlinePkFields.length > 1,
    };
  }
}

function processCreateIndex(stmt: AstCreateIndex, ensureTable: EnsureTable): void {
  const tableName = stmt.table.table;
  const table = ensureTable(tableName);
  const fields = stmt.index_columns.map(colName);

  if (stmt.index_type === 'unique') {
    table.uniqueConstraints.push({
      name: stmt.index,
      fields,
      isComposite: fields.length > 1,
    });
  } else {
    table.indexes.push({
      name: stmt.index,
      fields,
    });
  }
}
