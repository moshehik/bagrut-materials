// node build.mjs  → writes ../50-styles.html
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, f), 'utf8');

let body = '';
const problems = [];
for (let p = 1; p <= 5; p++) {
  const f = `part${p}.html`;
  if (!existsSync(join(here, f))) { problems.push(`missing ${f}`); continue; }
  let t = read(f).trim();
  const ids = [...t.matchAll(/<section class="style" id="(s\d\d)"/g)].map(m => m[1]);
  if (ids.length !== 10) problems.push(`${f}: found ${ids.length} sections (${ids.join(',')})`);
  // sanity: leaked global selectors inside <style> blocks
  for (const m of t.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    const css = m[1];
    if (/(^|\})\s*(:root|body|html)\s*\{/.test(css)) problems.push(`${f}: global selector (:root/body/html) leaked`);
    if (/@import/.test(css)) problems.push(`${f}: @import found`);
  }
  if (/<script/i.test(t)) problems.push(`${f}: <script> found`);
  body += t + '\n';
}
const out = read('shell-head.html') + body + read('shell-foot.html');
writeFileSync(join(here, '..', '50-styles.html'), out);
const total = (out.match(/<section class="style"/g) || []).length;
console.log(`wrote 50-styles.html — ${total} sections, ${out.split('\n').length} lines, ${(out.length/1024).toFixed(0)} KB`);
if (problems.length) { console.log('PROBLEMS:\n - ' + problems.join('\n - ')); }
