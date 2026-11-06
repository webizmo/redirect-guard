/** Exact-path redirect auditing. No network requests or runtime dependencies. */
export const MAX_BYTES = 1024 * 1024;
export const MAX_RULES = 5000;
const STATUSES = new Set([301, 302, 303, 307, 308]);
const PATH_SAMPLE = 20;

function parseCsv(text, issues) {
  const rows = [];
  let row = [], field = '', state = 'plain', line = 1, rowLine = 1, invalid = false;
  const fail = () => {
    if (!invalid) issues.push({severity: 'error', code: 'CSV_SYNTAX', line: rowLine, message: 'Malformed CSV quoting.'});
    invalid = true;
  };
  const finish = () => {
    row.push(field);
    if (row.length > 1 || row.some(value => value !== '') || invalid) rows.push({cells: row, line: rowLine, invalid});
    row = []; field = ''; state = 'plain'; invalid = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else state = 'closed';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        field += '\n'; line++;
      } else field += ch;
      continue;
    }
    if (ch === ',' ) { row.push(field); field = ''; state = 'plain'; }
    else if (ch === '\r' || ch === '\n') {
      finish();
      if (rows.length > MAX_RULES + 1) return rows;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++; rowLine = line;
    } else if (ch === '"') {
      if (state === 'plain' && field === '') state = 'quoted';
      else { fail(); field += ch; }
    } else {
      if (state === 'closed') fail();
      field += ch;
    }
  }
  if (state === 'quoted') fail();
  finish();
  return rows;
}

function pathProblem(path) {
  if (!path.startsWith('/') || path.startsWith('//')) return 'must start with one slash';
  if (/[^\x21-\x7e]/.test(path)) return 'must use visible ASCII URL characters (encode non-ASCII characters)';
  if (/[\\*{}<>\[\]`"^|$()]/.test(path) || /\/:/.test(path)) return 'contains a backslash, wildcard, template, or unsafe URL character';
  if (path.includes('//')) return 'contains repeated slashes';
  if (path.split('/').some(part => part === '.' || part === '..')) return 'contains a dot segment';
  if (/%(?![a-f\d]{2})/i.test(path)) return 'contains an invalid percent escape';
  if (/%(?:0[0-9a-f]|1[0-9a-f]|20|7f|2e|2f|5c|25|3f|23)/i.test(path)) return 'contains a normalization-sensitive percent escape';
  return null;
}

function locationProblem(value, source) {
  if (!value) return 'is empty';
  if (/[\s\u0000-\u001f\u007f\\]/u.test(value)) return 'contains whitespace, a control character, or a backslash';
  if (source && /[?#]/.test(value)) return 'must not contain a query or fragment';
  if (value.startsWith('//')) return 'must not be protocol-relative';
  if (value.startsWith('/')) {
    const path = value.split(/[?#]/, 1)[0];
    const problem = pathProblem(path);
    if (problem) return problem;
    if (/[*{}<>`"\[\]]/.test(value.slice(path.length))) return 'contains template or unsafe URL characters';
    if (/%(?![a-f\d]{2})/i.test(value.slice(path.length))) return 'contains an invalid percent escape';
    return null;
  }
  if (source) return 'must be root-relative';
  if (!/^https?:\/\//i.test(value)) return 'must be root-relative or an absolute HTTP(S) URL';
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return 'must have a hostname and no credentials';
    // Validate the original path: URL() silently removes dot segments.
    const match = value.match(/^https?:\/\/[^/?#]+([^?#]*)/i);
    if (!match) return 'is not a valid HTTP(S) URL';
    const problem = pathProblem(match[1] || '/');
    if (problem) return problem;
    if (/[*{}<>`"]/.test(value) || /%(?![a-f\d]{2})/i.test(value)) return 'contains template characters or invalid percent escapes';
    return null;
  } catch { return 'is not a valid HTTP(S) URL'; }
}

function summarize(rules, issues, chains = 0, cycles = 0) {
  return {rules, issues, summary: {
    rules: rules.length,
    errors: issues.filter(issue => issue.severity === 'error').length,
    warnings: issues.filter(issue => issue.severity === 'warning').length,
    chains, cycles,
  }};
}

/** Analyze CSV without fetching URLs. Lines refer to the original CSV. */
export function analyze(text) {
  if (typeof text !== 'string') throw new TypeError('CSV input must be a string.');
  const issues = [], rules = [];
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES) {
    issues.push({severity: 'error', code: 'INPUT_TOO_LARGE', line: 1, message: 'CSV input exceeds the 1 MiB limit.'});
    return summarize(rules, issues);
  }
  const rows = parseCsv(text.replace(/^\uFEFF/, ''), issues);
  const header = rows.shift();
  if (!header || header.invalid || !((header.cells.length === 2 || header.cells.length === 3) && header.cells[0] === 'from' && header.cells[1] === 'to' && (header.cells.length === 2 || header.cells[2] === 'status'))) {
    issues.push({severity: 'error', code: 'CSV_HEADER', line: header?.line || 1, message: 'Expected the header from,to or from,to,status in that order.'});
    return summarize(rules, issues);
  }
  if (rows.length > MAX_RULES) {
    issues.push({severity: 'error', code: 'RULE_LIMIT', line: rows[MAX_RULES].line, message: 'CSV input exceeds the 5,000-rule limit.'});
    return summarize(rules, issues);
  }
  for (const row of rows) {
    if (row.invalid) continue;
    if (row.cells.length !== header.cells.length) {
      issues.push({severity: 'error', code: 'CSV_COLUMNS', line: row.line, message: `Expected ${header.cells.length} columns; found ${row.cells.length}.`});
      continue;
    }
    const [from, to, rawStatus = ''] = row.cells;
    const status = rawStatus === '' ? 301 : Number(rawStatus);
    let invalid = false;
    for (const [value, source, code] of [[from, true, 'INVALID_FROM'], [to, false, 'INVALID_TO']]) {
      const problem = locationProblem(value, source);
      if (problem) {
        issues.push({severity: 'error', code, line: row.line, message: `${source ? 'Source' : 'Target'} ${problem}.`});
        invalid = true;
      }
    }
    if ((rawStatus !== '' && !/^\d{3}$/.test(rawStatus)) || !STATUSES.has(status)) {
      issues.push({severity: 'error', code: 'INVALID_STATUS', line: row.line, message: 'Status must be 301, 302, 303, 307, or 308 (blank defaults to 301).'});
      invalid = true;
    }
    if (!invalid) rules.push({line: row.line, from, to, status});
  }
  const byFrom = new Map(), conflicted = new Set();
  for (const rule of rules) {
    const previous = byFrom.get(rule.from);
    if (previous) {
      const same = previous.to === rule.to && previous.status === rule.status;
      issues.push({severity: same ? 'warning' : 'error', code: same ? 'DUPLICATE' : 'CONFLICT', line: rule.line,
        message: `${same ? 'Duplicate' : 'Conflicting'} source ${rule.from}; first declared on line ${previous.line}.`});
      if (!same) conflicted.add(rule.from);
    } else byFrom.set(rule.from, rule);
  }
  for (const from of conflicted) byFrom.delete(from);
  const next = from => {
    const to = byFrom.get(from)?.to;
    return to && !/[?#]/.test(to) && byFrom.has(to) ? to : undefined;
  };
  const outcomes = new Map();
  let cycles = 0, chains = 0;
  // Every node is resolved once; finding cycle membership and distance is O(n).
  for (const start of byFrom.keys()) {
    if (outcomes.has(start)) continue;
    const stack = [], indices = new Map();
    let cursor = start;
    while (cursor !== undefined && !outcomes.has(cursor) && !indices.has(cursor)) {
      indices.set(cursor, stack.length); stack.push(cursor); cursor = next(cursor);
    }
    if (cursor !== undefined && indices.has(cursor)) {
      const cycleStart = indices.get(cursor), cycle = stack.slice(cycleStart);
      cycles++;
      for (const from of cycle) outcomes.set(from, {cycle: cycles, distance: 0});
      const sample = cycle.slice(0, PATH_SAMPLE);
      if (cycle.length < PATH_SAMPLE) sample.push(cycle[0]);
      issues.push({severity: 'error', code: cycle.length === 1 ? 'SELF_REDIRECT' : 'CYCLE', line: byFrom.get(cursor).line,
        message: cycle.length === 1 ? `Source ${cursor} redirects to itself.` : `Redirect cycle contains ${cycle.length} rules.`,
        path: sample, pathTruncated: cycle.length >= PATH_SAMPLE});
      stack.length = cycleStart;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const from = stack[i], downstream = outcomes.get(next(from));
      outcomes.set(from, downstream?.cycle ? {cycle: downstream.cycle, distance: downstream.distance + 1} : {hops: (downstream?.hops || 0) + 1});
    }
  }
  for (const [from, outcome] of outcomes) {
    if ((!outcome.cycle && outcome.hops > 1) || (outcome.cycle && outcome.distance > 0)) {
      chains++;
      const path = [], seen = new Set();
      let cursor = from;
      while (cursor !== undefined && path.length < PATH_SAMPLE) {
        path.push(cursor);
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const following = next(cursor);
        if (following === undefined) { path.push(byFrom.get(cursor).to); cursor = undefined; break; }
        cursor = following;
      }
      issues.push({severity: outcome.cycle ? 'error' : 'warning', code: outcome.cycle ? 'CHAIN_TO_CYCLE' : 'CHAIN',
        line: byFrom.get(from).line, message: outcome.cycle ? `Source ${from} enters a redirect cycle after ${outcome.distance} hop(s).` : `Source ${from} requires ${outcome.hops} redirect hops.`,
        path, pathTruncated: cursor !== undefined && !seen.has(cursor)});
    }
  }
  issues.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
  return summarize(rules, issues, chains, cycles);
}

function md(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/[\r\n]+/g, ' ');
}

export function reportMarkdown(report) {
  const {summary} = report;
  const lines = ['# Redirect Guard report', '', `${summary.rules} valid rules · ${summary.errors} errors · ${summary.warnings} warnings · ${summary.chains} chain starts · ${summary.cycles} cycles`, ''];
  if (!report.issues.length) lines.push('No issues found within the exact-path checks.');
  else {
    lines.push('| Severity | Code | Line | Finding |', '| --- | --- | ---: | --- |');
    for (const issue of report.issues) lines.push(`| ${md(issue.severity)} | ${md(issue.code)} | ${issue.line} | ${md(issue.message)}${issue.path ? ` ${md(issue.path.join(' → '))}${issue.pathTruncated ? ' …' : ''}` : ''} |`);
  }
  lines.push('', 'Static CSV analysis only. Absolute URLs and targets with queries or fragments end graph traversal. No HTTP responses are checked.', '');
  return lines.join('\n');
}

function csv(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function reportCsv(report) {
  return ['severity,code,line,message,path', ...report.issues.map(issue => [issue.severity, issue.code, issue.line, issue.message,
    issue.path ? `${issue.path.join(' -> ')}${issue.pathTruncated ? ' ...' : ''}` : ''].map(csv).join(','))].join('\r\n') + '\r\n';
}
