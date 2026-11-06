#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { analyze, reportMarkdown, reportCsv, MAX_BYTES } from '../src/core.js';

const usage = 'Usage: node bin/cli.js <redirects.csv> [--format json|markdown|csv]';
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write(`${usage}\n\nExit codes: 0 = no errors; 1 = audit errors; 2 = invocation/read failure.\n`);
} else {
  try {
    let file, format = 'json', formatSeen = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--format' && !formatSeen) {
        formatSeen = true; format = args[++i];
        if (!['json', 'markdown', 'csv'].includes(format)) throw new Error('Format must be json, markdown, or csv.');
      } else if (!args[i].startsWith('-') && !file) file = args[i];
      else throw new Error(`Unexpected argument: ${args[i]}`);
    }
    if (!file) throw new Error('A CSV file path is required.');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Input must be a regular file.');
    // Avoid loading oversized files. The core produces the same size diagnostic.
    const input = info.size > MAX_BYTES ? 'x'.repeat(MAX_BYTES + 1) : await readFile(file, 'utf8');
    const report = analyze(input);
    process.stdout.write(format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : format === 'markdown' ? reportMarkdown(report) : reportCsv(report));
    process.exitCode = report.summary.errors ? 1 : 0;
  } catch (error) {
    process.stderr.write(`Redirect Guard: ${error.message}\n${usage}\n`);
    process.exitCode = 2;
  }
}
