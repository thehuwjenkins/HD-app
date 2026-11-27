import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The owner page uses stock.js through window, so every exported function must be listed there too.
test('every stock.js function export is shared with the browser', () => {
  const src = readFileSync(new URL('../public/app/stock.js', import.meta.url), 'utf8');
  const shared = /Object\.assign\(window, \{([^}]*)\}\)/.exec(src)[1].split(',').map((s) => s.trim());
  const exported = [...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);
  const missing = exported.filter((n) => !shared.includes(n));
  assert.deepEqual(missing, [], 'add these to the Object.assign(window, …) list at the end of stock.js');
});
