import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, reportMarkdown, reportCsv, MAX_BYTES, MAX_RULES } from '../src/core.js';

const audit = rows => analyze(`from,to,status\n${rows}`);
const codes = report => report.issues.map(issue => issue.code);

test('accepts both exact headers, BOM, CRLF and all supported statuses', () => {
  assert.equal(analyze('\uFEFFfrom,to\r\n/a,/b\r\n').rules[0].status, 301);
  const result = audit([301, 302, 303, 307, 308].map(status => `/a${status},/b,${status}`).join('\n'));
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.rules, 5);
  assert.equal(audit('/a,/b,').rules[0].status, 301);
});

test('quoted commas are parsed; malformed quoting and physical line numbers survive', () => {
  const result = audit('"/a,b",/dest,301\n"/line\nbreak",/dest,301\n/ok,/done,302');
  assert.equal(result.rules[0].from, '/a,b');
  assert.equal(result.rules[1].line, 5);
  assert.equal(result.issues[0].line, 3);
  assert.equal(result.issues[0].code, 'INVALID_FROM');
  for (const value of ['"/a"oops,/b,301', '/a"oops,/b,301', '"/a,/b,301']) assert.ok(codes(audit(value)).includes('CSV_SYNTAX'));
  assert.ok(codes(audit('"/a""quote",/b,301')).includes('INVALID_FROM'));
});

test('CSV headers and columns fail closed, including quoted combined headers', () => {
  for (const header of ['', 'source,target', 'from,to,status,extra', '"from,to"', '"from,to",status']) assert.ok(codes(analyze(header)).includes('CSV_HEADER'));
  assert.ok(codes(audit('/a,/b')).includes('CSV_COLUMNS'));
  assert.ok(codes(audit(',,')).includes('INVALID_FROM'));
  assert.equal(audit('\n\n').summary.rules, 0);
});

test('rejects unsafe, ambiguous, wildcard and non-root-relative source paths', () => {
  for (const path of ['https://example.com/a', '//example.com/a', '/a//b', '/a/../b', '/./a', '/%2e/a', '/a%2fb', '/%5cfoo', '/a%20b', '/%252e', '/a%3fb', '/a%23b', '/a%7f', '/x%0a', '/bad%xy', '/bad%', '/a b', '/café', '/a\\b', '/a*', '/:id', '/:a/{id}', '/a(.*)', '/a$', '/<script>', '/a?x=1', '/a#part']) {
    assert.ok(codes(audit(`${path},/dest,301`)).includes('INVALID_FROM'), path);
  }
  assert.equal(audit('/caf%C3%A9,/dest,301').summary.errors, 0);
});

test('targets accept absolute HTTP(S), queries and fragments but reject dangerous schemes or normalization', () => {
  for (const target of ['https://example.com/a?x=1#part', 'http://example.com', 'https://[::1]/a', '/a?x=1', '/a#part']) assert.equal(audit(`/source,${target},301`).summary.errors, 0, target);
  for (const target of ['javascript:alert(1)', 'ftp://example.com', '//example.com', 'https://example.com/a/../b', 'https://user:pass@example.com', 'https://example.com/has space', '/x?query={template}', '/x?query=*', 'https://example.com/?x={id}', 'https://*.example.com/new', '/a?x=%xx']) assert.ok(codes(audit(`/source,${target},301`)).includes('INVALID_TO'), target);
});

test('status validation rejects nonredirects and coercible numeric text', () => {
  for (const status of ['200', '304', '300', '0301', '301 ', '3e2', '+301']) assert.ok(codes(audit(`/a,/b,${status}`)).includes('INVALID_STATUS'));
});

test('distinguishes duplicates and conflicts without arbitrarily following conflicted edges', () => {
  const result = audit('/a,/b,301\n/a,/b,301\n/a,/c,301\n/d,/a,301');
  assert.deepEqual(codes(result), ['DUPLICATE', 'CONFLICT']);
  assert.equal(result.summary.rules, 4);
  assert.equal(result.summary.chains, 0);
  assert.equal(audit('/a,/b,301\n/a,/b,302').issues[0].code, 'CONFLICT');
});

test('finds chains, distinct cycles, self-loops, and upstream entries to cycles', () => {
  const result = audit('/a,/b,301\n/b,/c,302\n/c,/done,308\n/x,/y,301\n/y,/x,301\n/up,/x,301\n/self,/self,301');
  assert.equal(result.summary.cycles, 2);
  assert.equal(result.summary.chains, 3);
  assert.deepEqual(result.issues.find(issue => issue.line === 2).path, ['/a', '/b', '/c', '/done']);
  assert.match(result.issues.find(issue => issue.line === 2).message, /3 redirect hops/);
  assert.ok(codes(result).includes('CHAIN_TO_CYCLE'));
  assert.ok(codes(result).includes('SELF_REDIRECT'));
  assert.equal(codes(result).filter(code => code === 'CYCLE').length, 1);
});

test('absolute targets, query and fragment targets stop graph traversal', () => {
  const result = audit('/a,/b?x=1,301\n/b,/c,301\n/d,/b#x,301\n/e,https://example.com/b,301');
  assert.equal(result.summary.chains, 0);
  assert.equal(result.summary.errors, 0);
});

test('bounds graph diagnostic paths and handles maximum long chain without recursion', () => {
  const result = audit(Array.from({length: MAX_RULES}, (_, i) => `/p${i},/p${i + 1},301`).join('\n'));
  assert.equal(result.summary.rules, MAX_RULES);
  assert.equal(result.summary.chains, MAX_RULES - 1);
  assert.equal(result.summary.errors, 0);
  const first = result.issues[0];
  assert.match(first.message, /5000 redirect hops/);
  assert.equal(first.pathTruncated, true);
  assert.ok(result.issues.every(issue => issue.path.length <= 21));
});

test('bounds large cycle sample and detects exact chain sample boundary', () => {
  const cycle = audit(Array.from({length: 25}, (_, i) => `/p${i},/p${(i + 1) % 25},301`).join('\n'));
  assert.equal(cycle.summary.cycles, 1);
  assert.equal(cycle.issues[0].path.length, 20);
  assert.equal(cycle.issues[0].pathTruncated, true);
  const chain = audit(Array.from({length: 21}, (_, i) => `/p${i},/p${i + 1},301`).join('\n'));
  assert.equal(chain.issues[0].pathTruncated, true);
});

test('enforces byte and row limits before graph work', () => {
  assert.equal(analyze('x'.repeat(MAX_BYTES + 1)).issues[0].code, 'INPUT_TOO_LARGE');
  assert.equal(analyze('é'.repeat(MAX_BYTES / 2 + 1)).issues[0].code, 'INPUT_TOO_LARGE');
  const oversized = audit(Array.from({length: MAX_RULES + 1}, (_, i) => `/a${i},/end,301`).join('\n'));
  assert.ok(codes(oversized).includes('RULE_LIMIT'));
  assert.equal(oversized.rules.length, 0);
  assert.throws(() => analyze(null), TypeError);
});

test('reports export diagnostics safely and deterministically', () => {
  const result = audit('/a,/b,301\n/b,/done,301');
  assert.match(reportMarkdown(result), /Redirect Guard report/);
  assert.match(reportCsv(result), /^severity,code,line,message,path\r\n/);
  assert.match(reportMarkdown(analyze('from,to\n/a,/done')), /No issues found/);
  const untrusted = {summary: result.summary, issues: [{severity: 'warning', code: 'EXAMPLE', line: 2, message: '<script>[click](https://evil.test) | "quote"', path: ['=SUM(1,2)', '/b']}]};
  const markdown = reportMarkdown(untrusted);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('[click](https://evil.test)'));
  assert.ok(markdown.includes('\\|'));
  assert.match(reportCsv(untrusted), /"'=SUM\(1,2\) -> \/b"/);
  assert.match(reportCsv(untrusted), /""quote""/);
});
