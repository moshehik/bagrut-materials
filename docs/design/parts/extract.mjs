// node extract.mjs sNN out.html  → standalone HTML for one style
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [id, out] = process.argv.slice(2);
const full = readFileSync(join(here, '..', '50-styles.html'), 'utf8');
const m = full.match(new RegExp(`<section class="style" id="${id}"[\\s\\S]*?</section>`));
if (!m) { console.error('section not found: ' + id); process.exit(1); }
const name = (m[0].match(/data-name="([^"]*)"/) || [])[1] || id;
const head = full.slice(0, full.indexOf('<style>'));
const fonts = head.slice(head.indexOf('<link'));
const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>בגרות+ — ${name}</title>
${fonts}<style>
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Rubik,Heebo,system-ui,sans-serif}
img{max-width:100%}a{color:inherit}h1,h2,h3,h4,p,ul,figure{margin:0}ul{padding:0;list-style:none}button{font:inherit;cursor:pointer}
section.style{display:block;position:relative;min-height:100vh}
</style>
</head>
<body>
${m[0]}
</body>
</html>
`;
writeFileSync(out, html);
console.log('wrote', out, `(${name}, ${(html.length/1024).toFixed(0)} KB)`);
