// Builds the static learning site from the exported Claude Doc.
// Input:  content/tabs.json, content/tabs/<tab-id>.html, content/widgets/<node-id>.jsx
// Output: dist/ (index.html, one folder per tab, assets/, CNAME, .nojekyll, 404.html)
// Run:    npm install && npm run build
import { readFile, writeFile, mkdir, rm, readdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = (...p) => path.join(root, 'content', ...p);
const DIST = path.join(root, 'dist');
const CACHE = path.join(root, '.cache');

const manifest = JSON.parse(await readFile(C('tabs.json'), 'utf8'));
const { doc, tabs } = manifest;
const builtAt = new Date();

// ---------- widgets: JSX module -> static SVG ----------
// The doc's widgets use a `claude.Visualize` wrapper that hands chart data to a render
// function. For a static page we only need the data, so the shim passes it straight through.
globalThis.claude = {
  Visualize: ({ sources = {}, children }) => {
    const data = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v && v.data]));
    return children({ ...data, datum: () => ({}) });
  },
};

await rm(CACHE, { recursive: true, force: true });
await mkdir(CACHE, { recursive: true });

async function renderWidget(id) {
  const file = C('widgets', `${id}.jsx`);
  if (!existsSync(file)) return null;
  const src = await readFile(file, 'utf8');
  const { code } = await transform(src, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
  const mod = path.join(CACHE, `w-${id}.mjs`);
  await writeFile(mod, code);
  const Comp = (await import(pathToFileURL(mod).href)).default;
  let svg = renderToStaticMarkup(createElement(Comp));
  // Drop editor-only attributes and make ids unique per widget so markers never clash.
  svg = svg.replace(/\s+data-claude-[a-z-]+="[^"]*"/g, '');
  const p = 'w' + id.replace(/[^a-z0-9]/gi, '').slice(0, 8) + '-';
  svg = svg.replace(/\bid="([^"]+)"/g, (_, v) => `id="${p}${v}"`).replace(/url\(#([^)]+)\)/g, (_, v) => `url(#${p}${v})`);
  return svg;
}

// ---------- tab html -> page body ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const fmtDate = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

async function processTab(tab) {
  let html = await readFile(C('tabs', `${tab.id}.html`), 'utf8');

  // People mentions are private; remove them and any separator they leave behind.
  html = html.replace(/\s*·?\s*<span data-atom="mention"[^>]*>.*?<\/span>\s*·?\s*/g, ' ');
  // Date chips -> readable dates.
  html = html.replace(/<time data-atom="date" datetime="([^"]+)">[^<]*<\/time>/g, (_, d) => `<time datetime="${d}">${fmtDate(d)}</time>`);
  // A paragraph holding only a date right under the title becomes the page's "updated" line.
  let updated = null;
  html = html.replace(/(<h1[^>]*>.*?<\/h1>)\s*<p>\s*<time datetime="([^"]+)">([^<]*)<\/time>\s*<\/p>/s, (_, h1, d, t) => {
    updated = d;
    return `${h1}\n<p class="meta">Updated <time datetime="${d}">${t}</time></p>`;
  });

  // Widgets
  let diagrams = 0;
  const figs = [...html.matchAll(/<figure data-embed="node\/([^"]+)">(?:<figcaption>(.*?)<\/figcaption>)?<\/figure>/gs)];
  for (const m of figs) {
    const [whole, id, cap = ''] = m;
    const svg = await renderWidget(id);
    if (svg) diagrams++;
    const body = svg
      ? `<div class="viz-scroll">${svg}</div>`
      : `<div class="viz-missing">Diagram not exported yet</div>`;
    html = html.replace(whole, `<figure class="viz">${body}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`);
  }

  // Tables scroll sideways on small screens.
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  // Task-list items
  html = html.replace(/<li data-checked="(true|false)"><p><input type="checkbox" disabled>/g,
    (_, c) => `<li class="task${c === 'true' ? ' done' : ''}"><p><span class="box" aria-hidden="true"></span>`);
  // External links open in a new tab.
  html = html.replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');
  // Heading anchors + table of contents
  const toc = [];
  html = html.replace(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/gs, (_, lvl, id, inner) => {
    if (lvl === '2') toc.push({ id, text: strip(inner) });
    return `<h${lvl} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lvl}>`;
  });
  // Code blocks get a copy button.
  html = html.replace(/<pre>/g, '<pre><button class="copy" type="button" aria-label="Copy code">Copy</button>');

  const h1 = (html.match(/<h1[^>]*>(.*?)<\/h1>/s) || [])[1];
  const title = h1 ? strip(h1) : tab.name;
  const first = html.match(/<\/h1>[\s\S]*?<p>(?!<time)([\s\S]*?)<\/p>/);
  let blurb = first ? strip(first[1]) : '';
  if (blurb.startsWith('Updated')) {
    const second = html.match(/class="meta">[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>/);
    blurb = second ? strip(second[1]) : '';
  }
  if (blurb.length > 190) blurb = blurb.slice(0, 187).replace(/\s+\S*$/, '') + '…';
  const tables = (html.match(/<table>/g) || []).length;
  return { ...tab, title, html, toc, updated, blurb, diagrams, tables };
}

const pages = [];
for (const t of tabs) pages.push(await processTab(t));

// ---------- templates ----------
const nav = (current) => `
<nav class="sidebar" id="sidebar" aria-label="Topics">
  <a class="side-home${current ? '' : ' active'}" href="/">All topics</a>
  <ol class="side-list">
    ${pages.map((p) => `<li${current && current.slug === p.slug ? ' class="active"' : ''}>
      <a href="/${p.slug}/"${current && current.slug === p.slug ? ' aria-current="page"' : ''}>${esc(p.name)}</a>
      ${current && current.slug === p.slug && p.toc.length ? `<ol class="toc">${p.toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol>` : ''}
    </li>`).join('')}
  </ol>
</nav>`;

const shell = ({ title, description, body, current }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23c96442'/%3E%3Cpath d='M9 22V10h3v9.5h7V22z' fill='%23fff'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/site.css">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar">
  <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open topics" aria-controls="sidebar" aria-expanded="false">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
  </button>
  <a class="brand" href="/">${esc(doc.siteTitle)}</a>
  <button class="icon-btn theme-btn" id="theme-btn" aria-label="Switch light or dark">
    <svg class="sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    <svg class="moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
  </button>
</header>
<div class="scrim" id="scrim" hidden></div>
<div class="layout">
${nav(current)}
<main id="main" class="main">
${body}
<footer class="footer">Synced from the Claude Models Guide doc. Built ${esc(fmtDate(builtAt.toISOString().slice(0, 10)))}.</footer>
</main>
</div>
<script src="/assets/site.js" defer></script>
</body>
</html>
`;

const pager = (i) => {
  const prev = pages[i - 1], next = pages[i + 1];
  return `<nav class="pager" aria-label="Next and previous">
  ${prev ? `<a class="prev" href="/${prev.slug}/"><span>Previous</span>${esc(prev.name)}</a>` : '<span></span>'}
  ${next ? `<a class="next" href="/${next.slug}/"><span>Next</span>${esc(next.name)}</a>` : '<span></span>'}
</nav>`;
};

// ---------- write ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'assets'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(DIST, 'assets'), { recursive: true });

for (const [i, p] of pages.entries()) {
  const dir = path.join(DIST, p.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), shell({
    title: `${p.title} · ${doc.siteTitle}`,
    description: p.blurb,
    current: p,
    body: `<article class="prose">\n${p.html}\n</article>\n${pager(i)}`,
  }));
}

const latest = pages.map((p) => p.updated).filter(Boolean).sort().at(-1);
const cards = pages.map((p, i) => `<a class="card" href="/${p.slug}/">
  <span class="num">${String(i + 1).padStart(2, '0')}</span>
  <h2>${esc(p.name)}</h2>
  <p>${esc(p.blurb)}</p>
  <span class="stats">${p.toc.length} sections${p.diagrams ? ` · ${p.diagrams} diagram${p.diagrams > 1 ? 's' : ''}` : ''}${p.tables ? ` · ${p.tables} table${p.tables > 1 ? 's' : ''}` : ''}</span>
</a>`).join('\n');

await writeFile(path.join(DIST, 'index.html'), shell({
  title: `${doc.siteTitle} · ${doc.title}`,
  description: 'Notes on Claude models, agents, harnesses, context engineering and the tools around them.',
  current: null,
  body: `<section class="hero">
  <p class="eyebrow">${esc(doc.title)}</p>
  <h1>Learning</h1>
  <p class="lede">Notes on Claude models, agents, harnesses, context engineering and the tools around them. ${pages.length} topics${latest ? `, last updated <time datetime="${latest}">${fmtDate(latest)}</time>` : ''}.</p>
</section>
<section class="cards">
${cards}
</section>`,
}));

await writeFile(path.join(DIST, '404.html'), shell({
  title: `Not found · ${doc.siteTitle}`,
  description: 'Page not found',
  current: null,
  body: `<section class="hero"><h1>Not found</h1><p class="lede">That page isn't here. <a href="/">See all topics</a>.</p></section>`,
}));
await writeFile(path.join(DIST, 'CNAME'), doc.domain + '\n');
await writeFile(path.join(DIST, '.nojekyll'), '');
await rm(CACHE, { recursive: true, force: true });

const missing = pages.flatMap((p) => [...p.html.matchAll(/viz-missing/g)].map(() => p.slug));
console.log(`Built ${pages.length} pages, ${pages.reduce((s, p) => s + p.diagrams, 0)} diagrams${missing.length ? `, MISSING diagrams on: ${missing.join(', ')}` : ''}.`);
