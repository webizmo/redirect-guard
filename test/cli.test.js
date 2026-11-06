import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
function run(csv, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'redirect-guard-test-'));
  try {
    const path = join(dir, 'rules.csv');
    writeFileSync(path, csv);
    return spawnSync(process.execPath, [cli, path, ...args], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('CLI JSON is parseable, valid rules succeed', () => {
  const result = run('from,to,status\n/old,/new,301', ['--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).summary.errors, 0);
});
test('CLI loops fail CI with code 1 and useful JSON', () => {
  const result = run('from,to,status\n/a,/b,301\n/b,/a,301', ['--format', 'json']);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(JSON.parse(result.stdout).summary.errors > 0);
});
test('CLI warnings alone do not fail CI', () => {
  const result = run('from,to\n/a,/b\n/b,/c', ['--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).summary.warnings > 0);
});
test('CLI produces markdown and CSV diagnostics', () => {
  for (const format of ['markdown', 'csv']) {
    const result = run('from,to\n/a,/a', ['--format', format]);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stdout.length > 20);
  }
});
test('CLI invalid format, missing file and missing arguments fail with code 2', () => {
  assert.equal(run('from,to\n/a,/b', ['--format', 'xml']).status, 2);
  for (const args of [[], ['does-not-exist-redirect-guard.csv']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
  }
});
