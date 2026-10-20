#!/usr/bin/env node
// Convert an Obsidian note into a GitHub Pages (Jekyll) page.
//
// Usage: node scripts/obsidian2pages.mjs <note.md> <slug>
//   <note.md> — path to the Obsidian note (its embeds are resolved relative to the vault root,
//               which is the note's directory unless --vault <dir> is given)
//   <slug>    — output folder in the site: <slug>/index.md and <slug>/img/*
//
// What it converts:
//   ![[path/img.png|650]]      -> ![](img/img.png){: width="650"}  (image copied to <slug>/img/)
//   > [!type] Title ...         -> blockquote with an emoji and bold title
//   > [!type]- Title ...        -> <details><summary>Title</summary> ... </details>
//   [[#Heading]]                -> [Heading](#slug), the heading gets {#slug}
//   # H1                        -> front matter title (the H1 line is dropped)
// Front matter of an existing <slug>/index.md (description, date, ...) is kept; title is refreshed.
// The page body is wrapped in {% raw %} so Liquid never touches it.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const vaultIdx = args.indexOf('--vault');
let vault = null;
if (vaultIdx >= 0) { vault = args[vaultIdx + 1]; args.splice(vaultIdx, 2); }
const [notePath, slug] = args;
if (!notePath || !slug) { console.error('Usage: node scripts/obsidian2pages.mjs <note.md> <slug> [--vault <dir>]'); process.exit(2); }
vault = resolve(vault || dirname(notePath));
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(siteRoot, slug);
const imgDir = join(outDir, 'img');

const fail = (msg) => { console.error('FAIL: ' + msg); process.exit(1); };
let src = readFileSync(notePath, 'utf8').replace(/\r\n/g, '\n');
if (src.startsWith('---\n')) src = src.slice(src.indexOf('\n---\n', 4) + 5); // drop note front matter

// Title from H1.
const h1 = src.match(/^# (.+)$/m);
if (!h1) fail('note has no "# Title" line');
const title = h1[1].trim();
src = src.replace(h1[0] + '\n', '');

// Heading ids for [[#...]] links: transliterated slugs.
const tr = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const toSlug = (s) => s.toLowerCase().split('').map((c) => (c in tr ? tr[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const linked = new Set();
src = src.replace(/\[\[#([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, h, alias) => { linked.add(h.trim()); return `[${(alias || h).trim()}](#${toSlug(h)})`; });
for (const h of linked) {
  const re = new RegExp('^(#{1,6}) ' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*$', 'm');
  if (!re.test(src)) fail('heading not found for link [[#' + h + ']]');
  src = src.replace(re, (m) => `${m.trimEnd()} {#${toSlug(h)}}`);
}

// Image embeds.
const copied = [];
src = src.replace(/!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg))(?:\|(\d+))?\]\]/gi, (_, p, w) => {
  const from = join(vault, p);
  if (!existsSync(from)) fail('image not found: ' + from);
  mkdirSync(imgDir, { recursive: true });
  copyFileSync(from, join(imgDir, basename(p)));
  copied.push(basename(p));
  return `![](img/${basename(p)})` + (w ? `{: width="${w}"}` : '');
});
if (/!\[\[/.test(src)) fail('unsupported embed left: ' + src.match(/!\[\[[^\]]*\]\]/)[0]);
if (/\[\[/.test(src)) fail('wikilink left: ' + src.match(/\[\[[^\]]*\]\]/)[0]);

// Callouts.
const icons = { info: 'ℹ️', note: 'ℹ️', tip: '💡', warning: '⚠️', caution: '❗', danger: '❗', example: '📄', question: '❓' };
const lines = src.split('\n');
const out = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^> \[!(\w+)\]([-+]?)\s*(.*)$/);
  if (!m) { out.push(lines[i]); continue; }
  const [, type, fold, head] = m;
  const body = [];
  while (i + 1 < lines.length && /^>( |$)/.test(lines[i + 1])) body.push(lines[++i].replace(/^> ?/, ''));
  const label = `${icons[type.toLowerCase()] || ''} ${head}`.trim();
  if (fold === '-' || fold === '+') {
    out.push(`<details markdown="1"${fold === '+' ? ' open' : ''}>`, `<summary>${label}</summary>`, '', ...body, '', '</details>');
  } else {
    out.push(`> **${label}**`, ...(body.length ? ['>', ...body.map((l) => (l ? '> ' + l : '>'))] : []));
  }
}
src = out.join('\n').replace(/^\n+/, '');

// Front matter: keep existing fields, refresh title.
const pagePath = join(outDir, 'index.md');
const fm = { layout: 'page', title: JSON.stringify(title), guide: 'true', date: new Date().toISOString().slice(0, 10) };
if (existsSync(pagePath)) {
  const old = readFileSync(pagePath, 'utf8').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  if (old) for (const l of old[1].split('\n')) { const kv = l.match(/^(\w+):\s*(.*)$/); if (kv && kv[1] !== 'title') fm[kv[1]] = kv[2]; }
}
const front = '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n';
mkdirSync(outDir, { recursive: true });
writeFileSync(pagePath, front + '{% raw %}\n' + src.replace(/\n+$/, '') + '\n{% endraw %}\n');
console.log(`ok: ${pagePath} (${copied.length} images, ${linked.size} heading links)`);
