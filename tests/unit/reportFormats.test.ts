import { describe, it, expect } from 'vitest';
import { toJson } from '../../src/core/report/toJson.js';
import { toText } from '../../src/core/report/toText.js';
import type { AuditResult } from '../../src/core/report/reportTypes.js';

function makeEmptyResult(): AuditResult {
  return {
    contract: { models: [] },
    findings: [],
    metadata: {
      schemaPath: 'prisma/schema.prisma',
      timestamp: null,
      modelCount: 0,
      findingCount: 0,
    },
  };
}

function makeResultWithFindings(): AuditResult {
  return {
    contract: {
      models: [
        {
          name: 'User',
          fields: [
            { name: 'id', type: 'Int', isNullable: false, hasDefault: true, isList: false },
            { name: 'email', type: 'String', isNullable: false, hasDefault: false, isList: false },
          ],
          primaryKey: { fields: ['id'], isComposite: false },
          uniqueConstraints: [{ name: null, fields: ['email'], isComposite: false }],
          foreignKeys: [],
        },
      ],
    },
    findings: [
      {
        rule: 'NF1_LIST_IN_STRING_SUSPECTED',
        severity: 'warning',
        normalForm: '1NF',
        model: 'User',
        field: 'tagIds',
        message: 'String field "tagIds" may contain a list of values.',
      },
    ],
    metadata: {
      schemaPath: 'prisma/schema.prisma',
      timestamp: null,
      modelCount: 1,
      findingCount: 1,
    },
  };
}

describe('toJson', () => {
  it('produces valid JSON for empty result', () => {
    const result = makeEmptyResult();
    const json = toJson(result, false);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('contract');
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('metadata');
  });

  it('produces deterministic key ordering', () => {
    const result = makeEmptyResult();
    const json1 = toJson(result, false);
    const json2 = toJson(result, false);
    expect(json1).toBe(json2);
  });

  it('pretty-prints when requested', () => {
    const result = makeEmptyResult();
    const compact = toJson(result, false);
    const pretty = toJson(result, true);
    expect(pretty.length).toBeGreaterThan(compact.length);
    expect(pretty).toContain('\n');
  });

  it('sorts keys alphabetically', () => {
    const result = makeEmptyResult();
    const json = toJson(result, false);
    // "contract" should come before "findings" which should come before "metadata"
    const contractIdx = json.indexOf('"contract"');
    const findingsIdx = json.indexOf('"findings"');
    const metadataIdx = json.indexOf('"metadata"');
    expect(contractIdx).toBeLessThan(findingsIdx);
    expect(findingsIdx).toBeLessThan(metadataIdx);
  });
});

describe('toText', () => {
  it('includes header for empty result', () => {
    const result = makeEmptyResult();
    const text = toText(result);
    expect(text).toContain('=== Prisma Schema Audit ===');
    expect(text).toContain('Models:    0');
    expect(text).toContain('No normalization findings.');
  });

  it('includes findings when present', () => {
    const result = makeResultWithFindings();
    const text = toText(result);
    expect(text).toContain('[WARNING] NF1_LIST_IN_STRING_SUSPECTED');
    expect(text).toContain('User.tagIds');
  });

  it('includes model contract info', () => {
    const result = makeResultWithFindings();
    const text = toText(result);
    expect(text).toContain('Model: User');
    expect(text).toContain('PK: (id)');
    expect(text).toContain('Unique: (email)');
  });

  it('omits timestamp when null', () => {
    const result = makeEmptyResult();
    const text = toText(result);
    expect(text).not.toContain('Timestamp:');
  });
});
