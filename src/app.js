import { analyze, reportMarkdown, reportCsv } from './core.js';

const SAMPLE = `from,to,status
/old,/new,301
/new,/latest,301
/loop-a,/loop-b,301
/loop-b,/loop-a,301
/sale,/offers,302`;
const MAX_BYTES = 1024 * 1024;
const DISPLAY_LIMIT = 100;
const byId = (id) => document.getElementById(id);
const input = byId('redirect-input');
const download = byId('download-report');
const format = byId('report-format');
const issueList = byId('issue-list');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
let report = null;
let analyzedText = null;
let activeFilter = 'all';
let importVersion = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function announce(message) {
  byId('announcement').textContent = message;
}

function feedback(message = '') {
  const target = byId('input-feedback');
  target.textContent = message;
  target.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function syncPending() {
  const pending = analyzedText !== null && input.value !== analyzedText;
  byId('pending-note').hidden = !pending;
  download.disabled = !report || pending;
  format.disabled = download.disabled;
  return pending;
}

function issueIcon(severity) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('class', `issue-icon ${severity}`);
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(svg.namespaceURI, severity === 'error' ? 'circle' : 'path');
  if (severity === 'error') {
    shape.setAttribute('cx', '14'); shape.setAttribute('cy', '14'); shape.setAttribute('r', '13');
  } else shape.setAttribute('d', 'M11.9 2.8a2.4 2.4 0 0 1 4.2 0l11 19.4a2.4 2.4 0 0 1-2.1 3.6H3a2.4 2.4 0 0 1-2.1-3.6Z');
  shape.setAttribute('fill', 'currentColor');
  const mark = document.createElementNS(svg.namespaceURI, 'path');
  mark.setAttribute('d', 'M14 8v8m0 4v.2');
  mark.setAttribute('stroke', 'white'); mark.setAttribute('stroke-width', '2.2'); mark.setAttribute('stroke-linecap', 'round');
  svg.append(shape, mark);
  return svg;
}

function issueTitle(code) {
  const titles = {
    CYCLE: 'Redirect loop', CHAIN: 'Redirect chain', CHAIN_TO_CYCLE: 'Chain into a loop',
    CONFLICT: 'Conflicting rules', DUPLICATE: 'Duplicate rule', SELF_REDIRECT: 'Self redirect',
    CSV_SYNTAX: 'Invalid CSV syntax', CSV_HEADER: 'Invalid CSV header', CSV_COLUMNS: 'Invalid CSV columns',
    INVALID_FROM: 'Invalid source', INVALID_TO: 'Invalid target', INVALID_STATUS: 'Invalid status',
    INPUT_TOO_LARGE: 'Input too large', RULE_LIMIT: 'Too many rules',
  };
  return titles[code] || String(code).toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function renderIssues() {
  issueList.replaceChildren();
  const allIssues = report?.issues || [];
  const visibleIssues = allIssues.filter((issue) => activeFilter === 'all' || issue.severity === activeFilter)
    .sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1));
  const fragment = document.createDocumentFragment();
  for (const issue of visibleIssues.slice(0, DISPLAY_LIMIT)) {
    const row = element('li', 'issue');
    const title = element('p', 'issue-name', issueTitle(issue.code));
    title.append(element('span', 'issue-line', `${issue.severity === 'error' ? 'Error' : 'Warning'}${issue.line ? ` · Line ${issue.line}` : ''}`));
    const details = element('p', 'issue-details');
    if (issue.path?.length) details.append(element('code', 'issue-path', `${issue.path.join(' → ')}${issue.pathTruncated ? ' … (path shortened)' : ''}`));
    details.append(element('span', 'issue-message', issue.message));
    row.append(issueIcon(issue.severity), title, details);
    fragment.append(row);
  }
  if (!visibleIssues.length) {
    const empty = element('li', 'empty-state');
    let title = 'Your analysis will appear here.';
    let detail = 'Paste a redirect map or import a CSV, then select Analyze redirects.';
    if (allIssues.length) {
      title = `No ${activeFilter === 'error' ? 'errors' : 'warnings'} in this report.`;
      detail = 'Choose All issues to see the complete report.';
    } else if (report && report.rules.length) {
      title = 'No issues found.';
      detail = 'This map passed the supported checks. Live destinations have not been verified.';
    } else if (report) {
      title = 'No redirect rules to analyze.';
      detail = 'Add a from and to column with at least one redirect rule.';
    }
    empty.append(element('strong', '', title), document.createTextNode(detail));
    fragment.append(empty);
  }
  issueList.append(fragment);
  const limitNote = byId('result-note');
  limitNote.hidden = visibleIssues.length <= DISPLAY_LIMIT;
  limitNote.textContent = `Showing the first ${DISPLAY_LIMIT} of ${visibleIssues.length.toLocaleString()} matching issues. Download the report for every issue.`;
}

function renderSummary() {
  const summary = report?.summary || { rules: 0, errors: 0, warnings: 0 };
  for (const [id, key, noun] of [['rule-count', 'rules', 'rule'], ['error-count', 'errors', 'error'], ['warning-count', 'warnings', 'warning']]) {
    const excludesInvalidRows = key === 'rules' && report?.issues.some((issue) => /^(CSV_|INVALID_|INPUT_TOO_LARGE|RULE_LIMIT)/.test(issue.code));
    byId(id).textContent = `${summary[key].toLocaleString()} ${excludesInvalidRows ? 'valid ' : ''}${noun}${summary[key] === 1 ? '' : 's'}`;
  }
}

function analyzeInput() {
  feedback();
  activeFilter = 'all';
  for (const button of filterButtons) button.setAttribute('aria-pressed', String(button.dataset.filter === 'all'));
  if (new TextEncoder().encode(input.value).length > MAX_BYTES) {
    feedback('This map is too large. Use a CSV no larger than 1 MiB.');
    report = null;
    analyzedText = null;
    renderSummary(); renderIssues(); syncPending();
    announce('Analysis stopped. CSV must be no larger than 1 MiB.');
    return;
  }
  try {
    report = analyze(input.value);
    analyzedText = input.value;
    renderSummary(); renderIssues(); syncPending();
    const { rules, errors, warnings } = report.summary;
    announce(`Analysis complete: ${rules} rules, ${errors} errors, ${warnings} warnings.`);
  } catch (error) {
    report = null;
    analyzedText = null;
    feedback(error instanceof Error ? error.message : 'Unable to analyze this CSV. Check the file format.');
    renderSummary(); renderIssues(); syncPending();
    announce('Analysis could not be completed. Check the CSV input.');
  }
}

input.addEventListener('input', () => {
  importVersion += 1;
  feedback();
  syncPending();
});
byId('analyze').addEventListener('click', analyzeInput);
byId('load-example').addEventListener('click', () => {
  importVersion += 1;
  input.value = SAMPLE;
  analyzeInput();
});
byId('import-csv').addEventListener('click', () => byId('file-input').click());
byId('file-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const version = ++importVersion;
  if (file.size > MAX_BYTES) {
    feedback('This file is too large. Import a CSV no larger than 1 MiB.');
    announce('Import stopped. File must be no larger than 1 MiB.');
    return;
  }
  try {
    const text = await file.text();
    if (version !== importVersion) return;
    if (text.includes('\0')) throw new Error('This appears to be a binary file. Import a plain-text CSV.');
    input.value = text;
    analyzeInput();
  } catch (error) {
    if (version !== importVersion) return;
    feedback(error instanceof Error ? error.message : 'The file could not be read. Try a plain-text CSV.');
    announce('The file could not be imported.');
  }
});
for (const button of filterButtons) {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    for (const item of filterButtons) item.setAttribute('aria-pressed', String(item === button));
    renderIssues();
  });
}
download.addEventListener('click', () => {
  if (!report || syncPending()) return;
  const type = format.value;
  const contents = type === 'md' ? reportMarkdown(report) : type === 'csv' ? reportCsv(report) : JSON.stringify(report, null, 2);
  const mime = { md: 'text/markdown', csv: 'text/csv', json: 'application/json' }[type];
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `redirect-guard-report.${type}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`${type === 'md' ? 'Markdown' : type.toUpperCase()} report downloaded.`);
});

input.value = SAMPLE;
analyzeInput();
