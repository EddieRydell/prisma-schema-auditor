import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolve, join } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { main } from '../../src/cli.js';

const SCHEMAS_DIR = resolve(import.meta.dirname, '../fixtures/schemas');
const INVARIANTS_DIR = resolve(import.meta.dirname, '../fixtures/invariants');

const BASIC_SCHEMA = resolve(SCHEMAS_DIR, 'basic.prisma');
const NF1_SCHEMA = resolve(SCHEMAS_DIR, '1nf-violations.prisma');
const NF3_SCHEMA = resolve(SCHEMAS_DIR, '3nf-violations.prisma');
const MALFORMED_SCHEMA = resolve(SCHEMAS_DIR, 'malformed.prisma');
const NF3_INVARIANTS = resolve(INVARIANTS_DIR, '3nf-invariants.json');

describe('CLI', () => {
  let stdoutOutput: string;
  let stderrOutput: string;
  const tmpFiles: string[] = [];

  beforeEach(() => {
    stdoutOutput = '';
    stderrOutput = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const f of tmpFiles) {
      if (existsSync(f)) unlinkSync(f);
    }
    tmpFiles.length = 0;
  });

  describe('--help', () => {
    it('prints usage and returns 0', async () => {
      const code = await main(['--help']);
      expect(code).toBe(0);
      expect(stdoutOutput).toContain('Usage: prisma-schema-auditor');
      expect(stdoutOutput).toContain('--schema');
      expect(stdoutOutput).toContain('--format');
      expect(stdoutOutput).toContain('--fail-on');
    });
  });

  describe('argument validation', () => {
    it('rejects unknown flags with exit code 2', async () => {
      const code = await main(['--unknown-flag']);
      expect(code).toBe(2);
      expect(stderrOutput).toContain('Use --help for usage');
    });

    it('rejects invalid --format value with exit code 2', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--format', 'xml']);
      expect(code).toBe(2);
      expect(stderrOutput).toContain('Invalid format');
    });

    it('rejects invalid --fail-on value with exit code 2', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--fail-on', 'critical']);
      expect(code).toBe(2);
      expect(stderrOutput).toContain('Invalid --fail-on');
    });
  });

  describe('file validation', () => {
    it('rejects nonexistent --schema path with exit code 2', async () => {
      const code = await main(['--schema', '/nonexistent/schema.prisma']);
      expect(code).toBe(2);
      expect(stderrOutput).toContain('Schema file not found');
    });

    it('rejects nonexistent --invariants path with exit code 2', async () => {
      const code = await main([
        '--schema', BASIC_SCHEMA,
        '--invariants', '/nonexistent/invariants.json',
      ]);
      expect(code).toBe(2);
      expect(stderrOutput).toContain('Invariants file not found');
    });
  });

  describe('schema processing', () => {
    it('outputs valid JSON by default for a clean schema', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp']);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed).toHaveProperty('contract');
      expect(parsed).toHaveProperty('findings');
      expect(parsed).toHaveProperty('metadata');
      expect(parsed.metadata.modelCount).toBe(2);
      expect(parsed.findings).toHaveLength(0);
    });

    it('outputs text with --format text', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--format', 'text', '--no-timestamp']);
      expect(code).toBe(0);
      expect(stdoutOutput).toContain('=== Prisma Schema Audit ===');
      expect(stdoutOutput).toContain('Models:    2');
      expect(stdoutOutput).toContain('No normalization findings.');
    });

    it('returns 0 for a clean schema without --fail-on', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp']);
      expect(code).toBe(0);
    });

    it('returns 0 for a schema with findings when --fail-on is not set', async () => {
      const code = await main(['--schema', NF1_SCHEMA, '--no-timestamp']);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed.findings.length).toBeGreaterThan(0);
    });
  });

  describe('--no-timestamp', () => {
    it('omits timestamp from output', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp']);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed.metadata.timestamp).toBeNull();
    });

    it('includes timestamp when flag is not set', async () => {
      const code = await main(['--schema', BASIC_SCHEMA]);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('--pretty', () => {
    it('pretty-prints JSON output', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp', '--pretty']);
      expect(code).toBe(0);

      const output = stdoutOutput.trim();
      expect(output).toContain('\n');
      expect(output).toContain('  '); // indentation
      // Still valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('contract');
    });

    it('produces compact JSON without --pretty', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp']);
      expect(code).toBe(0);

      // Output should be a single line of JSON (plus trailing newline)
      const lines = stdoutOutput.trim().split('\n');
      expect(lines).toHaveLength(1);
    });
  });

  describe('--out', () => {
    it('writes output to file instead of stdout', async () => {
      const tmpFile = join(tmpdir(), 'cli-test-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2) + '.json');
      tmpFiles.push(tmpFile);

      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp', '--out', tmpFile]);
      expect(code).toBe(0);

      // Nothing written to stdout
      expect(stdoutOutput).toBe('');

      // File contains valid JSON
      const content = readFileSync(tmpFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('contract');
      expect(parsed.metadata.modelCount).toBe(2);
    });
  });

  describe('--fail-on', () => {
    it('returns 0 when --fail-on error and schema has only warnings', async () => {
      const code = await main(['--schema', NF1_SCHEMA, '--no-timestamp', '--fail-on', 'error']);
      expect(code).toBe(0);
    });

    it('returns 1 when --fail-on warning and schema has warnings', async () => {
      const code = await main(['--schema', NF1_SCHEMA, '--no-timestamp', '--fail-on', 'warning']);
      expect(code).toBe(1);
    });

    it('returns 1 when --fail-on info and schema has info findings', async () => {
      const code = await main(['--schema', NF1_SCHEMA, '--no-timestamp', '--fail-on', 'info']);
      expect(code).toBe(1);
    });

    it('returns 1 when --fail-on error and schema has error findings', async () => {
      const code = await main([
        '--schema', NF3_SCHEMA,
        '--invariants', NF3_INVARIANTS,
        '--no-timestamp',
        '--fail-on', 'error',
      ]);
      expect(code).toBe(1);
    });

    it('returns 0 when --fail-on error and schema has no findings', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--no-timestamp', '--fail-on', 'error']);
      expect(code).toBe(0);
    });
  });

  describe('--invariants', () => {
    it('processes invariants and reports 3NF violations', async () => {
      const code = await main([
        '--schema', NF3_SCHEMA,
        '--invariants', NF3_INVARIANTS,
        '--no-timestamp',
      ]);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      const nf3Findings = parsed.findings.filter((f: { rule: string }) => f.rule === 'NF3_VIOLATION');
      expect(nf3Findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('--generate-invariants', () => {
    it('generates JSON to stdout', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--generate-invariants']);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed).toHaveProperty('User');
      expect(parsed).toHaveProperty('Post');
      expect(parsed.User.functionalDependencies.length).toBeGreaterThan(0);
    });

    it('respects --pretty', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--generate-invariants', '--pretty']);
      expect(code).toBe(0);

      const output = stdoutOutput.trim();
      expect(output).toContain('\n');
      expect(output).toContain('  ');
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('User');
    });

    it('respects --out', async () => {
      const tmpFile = join(tmpdir(), 'gen-inv-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2) + '.json');
      tmpFiles.push(tmpFile);

      const code = await main(['--schema', BASIC_SCHEMA, '--generate-invariants', '--out', tmpFile]);
      expect(code).toBe(0);
      expect(stdoutOutput).toBe('');

      const content = readFileSync(tmpFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('User');
    });

    it('conflicts with --invariants (exit 2)', async () => {
      const code = await main([
        '--schema', BASIC_SCHEMA,
        '--generate-invariants',
        '--invariants', NF3_INVARIANTS,
      ]);
      expect(code).toBe(2);
      expect(stderrOutput).toContain('cannot be used together');
    });

    it('exit 3 for unparseable schema', async () => {
      const code = await main(['--schema', MALFORMED_SCHEMA, '--generate-invariants']);
      expect(code).toBe(3);
      expect(stderrOutput).toContain('Failed to parse schema');
    });

    it('output includes note fields', async () => {
      const code = await main(['--schema', BASIC_SCHEMA, '--generate-invariants']);
      expect(code).toBe(0);

      const parsed = JSON.parse(stdoutOutput.trim());
      const userFds = parsed.User.functionalDependencies;
      for (const fd of userFds) {
        expect(fd).toHaveProperty('note');
        expect(typeof fd.note).toBe('string');
      }
    });
  });

  describe('error handling', () => {
    it('returns exit code 3 for unparseable schema', async () => {
      const code = await main(['--schema', MALFORMED_SCHEMA, '--no-timestamp']);
      expect(code).toBe(3);
      expect(stderrOutput).toContain('Failed to parse schema');
    });
  });
});
