import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

// The app's browser files share one global scope, so two files defining the same top-level name
// would silently replace each other's function (the later file wins).
test('no two app files define the same top-level name', () => {
  const dir = new URL('../public/app/', import.meta.url);
  const seen = new Map(), clashes = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'stock.js')) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/^(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1]) && seen.get(m[1]) !== f) clashes.push(`${m[1]} (${seen.get(m[1])} and ${f})`);
      seen.set(m[1], f);
    }
  }
  assert.deepEqual(clashes, []);
});
