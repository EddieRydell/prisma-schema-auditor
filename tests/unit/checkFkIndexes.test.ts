import { describe, it, expect } from 'vitest';
import { checkFkIndexes } from '../../src/core/analysis/normalizeChecks/checkFkIndexes.js';
import type { ConstraintContract } from '../../src/core/report/reportTypes.js';

describe('checkFkIndexes', () => {
  it('flags FK not covered by PK, unique constraint, or index', () => {
    const contract: ConstraintContract = {
      models: [{
        name: 'Post',
        fields: [
          { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
          { name: 'authorId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
          { name: 'title', type: 'String', isNullable: false, hasDefault: false, isList: false },
        ],
        primaryKey: { fields: ['id'], isComposite: false },
        uniqueConstraints: [],
        indexes: [],
        foreignKeys: [{
          fields: ['authorId'],
          referencedModel: 'User',
          referencedFields: ['id'],
          onDelete: 'Cascade',
          onUpdate: 'Cascade',
        }],
      }],
    };

    const findings = checkFkIndexes(contract);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe('FK_MISSING_INDEX');
    expect(findings[0]!.model).toBe('Post');
    expect(findings[0]!.field).toBe('authorId');
    expect(findings[0]!.severity).toBe('info');
    expect(findings[0]!.normalForm).toBe('SCHEMA');
    expect(findings[0]!.fix).toContain('@@index');
  });

  it('does not flag FK that is PK prefix', () => {
    const contract: ConstraintContract = {
      models: [{
        name: 'PostTag',
        fields: [
          { name: 'postId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
          { name: 'tagId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
        ],
        primaryKey: { fields: ['postId', 'tagId'], isComposite: true },
        uniqueConstraints: [],
        indexes: [],
        foreignKeys: [{
          fields: ['postId'],
          referencedModel: 'Post',
          referencedFields: ['id'],
          onDelete: 'Cascade',
          onUpdate: 'Cascade',
        }],
      }],
    };

    const findings = checkFkIndexes(contract);
    expect(findings).toHaveLength(0);
  });

  it('does not flag FK covered by unique constraint prefix', () => {
    const contract: ConstraintContract = {
      models: [{
        name: 'Membership',
        fields: [
          { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
          { name: 'userId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
          { name: 'orgId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
        ],
        primaryKey: { fields: ['id'], isComposite: false },
        uniqueConstraints: [{ name: null, fields: ['userId', 'orgId'], isComposite: true }],
        indexes: [],
        foreignKeys: [{
          fields: ['userId'],
          referencedModel: 'User',
          referencedFields: ['id'],
          onDelete: 'Cascade',
          onUpdate: 'Cascade',
        }],
      }],
    };

    const findings = checkFkIndexes(contract);
    expect(findings).toHaveLength(0);
  });

  it('does not flag FK covered by regular @@index', () => {
    const contract: ConstraintContract = {
      models: [{
        name: 'Post',
        fields: [
          { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
          { name: 'authorId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
          { name: 'title', type: 'String', isNullable: false, hasDefault: false, isList: false },
        ],
        primaryKey: { fields: ['id'], isComposite: false },
        uniqueConstraints: [],
        indexes: [{ name: null, fields: ['authorId'] }],
        foreignKeys: [{
          fields: ['authorId'],
          referencedModel: 'User',
          referencedFields: ['id'],
          onDelete: 'Cascade',
          onUpdate: 'Cascade',
        }],
      }],
    };

    const findings = checkFkIndexes(contract);
    expect(findings).toHaveLength(0);
  });

  it('does not flag FK covered by composite @@index prefix', () => {
    const contract: ConstraintContract = {
      models: [{
        name: 'Post',
        fields: [
          { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
          { name: 'authorId', type: 'Int', isNullable: false, hasDefault: false, isList: false },
          { name: 'createdAt', type: 'DateTime', isNullable: false, hasDefault: true, isList: false },
        ],
        primaryKey: { fields: ['id'], isComposite: false },
        uniqueConstraints: [],
        indexes: [{ name: null, fields: ['authorId', 'createdAt'] }],
        foreignKeys: [{
          fields: ['authorId'],
          referencedModel: 'User',
          referencedFields: ['id'],
          onDelete: 'Cascade',
          onUpdate: 'Cascade',
        }],
      }],
    };

    const findings = checkFkIndexes(contract);
    expect(findings).toHaveLength(0);
  });

  it('produces no findings when model has no FKs', () => {
    const contract: ConstraintContract = {
      models: [{
        name: 'User',
        fields: [
          { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
          { name: 'email', type: 'String', isNullable: false, hasDefault: false, isList: false },
        ],
        primaryKey: { fields: ['id'], isComposite: false },
        uniqueConstraints: [{ name: null, fields: ['email'], isComposite: false }],
        indexes: [],
        foreignKeys: [],
      }],
    };

    const findings = checkFkIndexes(contract);
    expect(findings).toHaveLength(0);
  });
});
