import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collect, render} from '../tools/bundle-static.mjs';
import worker from '../src/worker.js';

test('bundled app files match public/ (run npm run build if this fails)', () => {
  assert.equal(readFileSync(new URL('../src/static.gen.js', import.meta.url), 'utf8'), render(collect()));
});

test('without a static assets binding, the worker serves the bundled files', async () => {
  const {STATIC} = await import('../src/static.gen.js');
  assert.ok(STATIC['/app/core.js'] && STATIC['/logo.png'] && STATIC['/app/styles.css']);
});
