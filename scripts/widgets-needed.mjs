// Lists diagram ids that the exported tabs embed but content/widgets/ does not have yet,
// and widget files no tab uses any more. Run after saving fresh tab exports.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { tabs } = JSON.parse(await readFile(path.join(root, 'content/tabs.json'), 'utf8'));
const used = new Set();
for (const t of tabs) {
  const html = await readFile(path.join(root, 'content/tabs', `${t.id}.html`), 'utf8');
  for (const m of html.matchAll(/data-embed="node\/([^"]+)"/g)) used.add(m[1]);
}
const have = new Set((await readdir(path.join(root, 'content/widgets'))).map((f) => f.replace(/\.jsx$/, '')));
console.log(JSON.stringify({ missing: [...used].filter((i) => !have.has(i)), unused: [...have].filter((i) => !used.has(i)) }, null, 2));
