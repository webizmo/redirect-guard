import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core.js';

test('300 generated graphs agree with an independent walk-from-every-node oracle', () => {
  let seed = 9201;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 300; trial++) {
    const count = 1 + random(40);
    const next = Array.from({ length: count }, () => random(count + 4));
    const input = 'from,to\n' + next.map((to, i) => `/p${i},/p${to}`).join('\n');
    const report = analyze(input);
    let chains = 0;
    const cycles = new Set();
    for (let i = 0; i < count; i++) {
      let cursor = i;
      const seen = new Map(), path = [];
      while (cursor < count && !seen.has(cursor)) {
        seen.set(cursor, path.length);
        path.push(cursor);
        cursor = next[cursor];
      }
      if (cursor < count) {
        cycles.add(path.slice(seen.get(cursor)).sort((a, b) => a - b).join(','));
        if (seen.get(cursor) > 0) chains++;
      } else if (path.length > 1) chains++;
    }
    assert.equal(report.summary.chains, chains, `chain count in trial ${trial}`);
    assert.equal(report.summary.cycles, cycles.size, `cycle count in trial ${trial}`);
  }
});
