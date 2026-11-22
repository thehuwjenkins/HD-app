import {readFile} from 'node:fs/promises';
export async function load(url, context, next) {
  if (url.endsWith('.html') || url.endsWith('.txt')) {
    const text = await readFile(new URL(url), 'utf8');
    return {format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(text) + ';'};
  }
  return next(url, context);
}
